#!/usr/bin/env python3
"""
Backfill tesco_product_metadata_cache.json with full Apollo cache metadata AND
write product blobs to Vercel Blob (spec 021 / FR-014 / FR-015).

Upgrades existing cache entries that have only basic search-page metadata
(title/image/productUrl) to full ProductInfo fields from the product page
Apollo cache. Old /groceries/ URL shapes are re-searched by name.

Usage:
    python3 scripts/backfill_tesco_product_metadata.py [--dry-run] [--force] [--limit N]

Exit codes:
    0  success (or dry-run with no error)
    1  fatal error (cache unreadable, etc.)
    2  partial failure (some items could not be upgraded — see summary)
"""
import sys
import json
import argparse
import re
import os
import hashlib
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

DASHBOARD_PATH = Path(__file__).resolve().parent.parent
MEALS_SCRIPTS_PATH = Path(os.environ.get('MEALS_CHECK_SCRIPTS', '/home/hermes/.hermes/scripts')).resolve()
PRODUCT_METADATA_CACHE = Path(os.environ.get(
    'MEALS_PRODUCT_METADATA_CACHE',
    str(MEALS_SCRIPTS_PATH / 'data' / 'tesco_product_metadata_cache.json')
)).expanduser().resolve()
TIMEOUT_SECONDS = 10
RATE_LIMIT_SECONDS = 0.5
USER_AGENT = 'Mozilla/5.0 meals-dashboard product enrichment'
ACCEPT_LANGUAGE = 'en-GB,en;q=0.9'

# Import sync_dashboard_data from the same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib
sync_dashboard_data = importlib.import_module('sync-dashboard-data')


def _read_cache(path: Path) -> Dict[str, Dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"FATAL: cannot read cache {path}: {e}")
        sys.exit(1)


def _write_cache(cache: Dict[str, Dict[str, Any]], path: Path) -> None:
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(cache, f, indent=2, sort_keys=True)
    os.replace(tmp, path)


def _search_tpnc(item_name: str) -> Optional[str]:
    """Search Tesco and return the first tpnc found in the search HTML."""
    cleaned = re.sub(r'\bSubstitutions:\s*On\b', '', item_name, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None
    url = 'https://www.tesco.com/groceries/en-GB/search?query=' + urllib.parse.quote(cleaned)
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept-Language': ACCEPT_LANGUAGE,
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            html = resp.read(500_000).decode('utf-8', errors='ignore')
    except Exception:
        return None

    # New URL pattern: /shop/en-GB/products/<numeric-tpnc>
    match = re.search(r'href="(?P<path>/shop/en-GB/products/\d+)"', html)
    if not match:
        return None
    tpnc_match = re.search(r'/shop/en-GB/products/(\d+)', match.group('path'))
    return tpnc_match.group(1) if tpnc_match else None


def _resolve_tpnc(entry: Dict[str, Any], item_name: str) -> Optional[str]:
    """Resolve a tpnc for a cache entry.

    Priority:
    1. tpnc already in the entry.
    2. Parse from existing productUrl if it is the new /shop/ form.
    3. Search by item_name.
    """
    # Already have tpnc
    if entry.get('tpnc'):
        return entry['tpnc']

    # Parse from existing productUrl
    product_url = entry.get('productUrl', '')
    if '/shop/en-GB/products/' in product_url:
        m = re.search(r'/shop/en-GB/products/(\d+)', product_url)
        if m:
            return m.group(1)

    # Search by name
    return _search_tpnc(item_name)


def backfill_entry(
    entry: Dict[str, Any],
    item_name: str,
    force: bool = False,
) -> Dict[str, Any]:
    """Backfill a single cache entry.

    Returns the upgraded entry (or the original with 'unmatched' set if failed).
    """
    tpnc = _resolve_tpnc(entry, item_name)
    if not tpnc:
        entry['unmatched'] = 'could not resolve tpnc'
        return entry

    # Fetch product page
    product = sync_dashboard_data._fetch_tesco_apollo_cache(tpnc, timeout=TIMEOUT_SECONDS)
    if product is None:
        entry['unmatched'] = f'product page fetch failed for tpnc {tpnc}'
        return entry

    # Upgrade with full Apollo fields
    upgraded = sync_dashboard_data.apollo_cache_to_product_info(product, original_name=item_name)
    # Preserve original title if the Apollo title is different (the item may have been renamed)
    if entry.get('title') and not upgraded.get('title'):
        upgraded['title'] = entry['title']
    # If Apollo title differs from cache entry name, keep the original name context
    if entry.get('title') and upgraded.get('title') != entry.get('title'):
        # Don't overwrite — Tesco may have renamed the product; use what the receipt had
        pass
    return upgraded


def _build_backfill_payload(
    products: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Build a product-only payload for the product backfill."""
    if not products:
        return None
    return {"products": list(products.values())}


def _write_products_to_api(
    payload: Dict[str, Any],
    api_url: str,
    secret: str,
) -> Optional[str]:
    """Write one product-only payload; return only its manifest path."""
    if not payload:
        return None
    ok, result = sync_dashboard_data._post_with_bounded_retry(payload, api_url, secret)
    return result.get('productsManifestPath') if ok else None


def _publish_products_to_targets(payload, destinations):
    """Publish product-only data independently to each configured target."""
    results = {}
    if os.environ.get('MEALS_PUBLICATION_PROTOCOL') == '1':
        from publication_recovery import CheckpointError
        try:
            result = sync_dashboard_data.recovery_publisher().publish(payload, destinations, products_only=True)
        except CheckpointError:
            return {name: {'ok': False, 'error': 'publication checkpoint unavailable'} for name, _, _ in destinations}
        return {name: {'ok': phases['products']['ok'], **phases['products']['response']}
                for name, phases in result['targets'].items()}
    for name, api_url, secret in destinations:
        if not api_url or not secret:
            results[name] = {'ok': False, 'error': 'destination URL/auth not configured'}
            continue
        products_url = sync_dashboard_data.dashboard_products_api_url(api_url)
        ok, response = sync_dashboard_data._post_with_bounded_retry(payload, products_url, secret)
        results[name] = {
            'ok': ok,
            'productsManifestPath': response.get('productsManifestPath') if ok else None,
            'error': response.get('error') if not ok else None,
        }
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description='Backfill tesco_product_metadata_cache.json with full Apollo metadata and write product blobs to Vercel Blob.')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without writing changes')
    parser.add_argument('--force', action='store_true', help='Re-fetch even fresh cache entries')
    parser.add_argument('--limit', type=int, default=0, help='Process at most N entries (0 = all)')
    args = parser.parse_args()

    # Load env for API credentials
    sync_dashboard_data.load_dashboard_env()
    api_url = os.environ.get('DASHBOARD_DATA_API_URL', '') or 'https://meals-dashboard.vercel.app/api/dashboard-sync'
    secret = os.environ.get('MEALS_DASHBOARD_DATA_SECRET', '')
    secondary_url = os.environ.get('MEAL_PLANNER_DASHBOARD_DATA_API_URL', '')
    secondary_secret = os.environ.get('MEAL_PLANNER_DASHBOARD_DATA_SECRET', '')
    if (secondary_url or secondary_secret) and os.environ.get('MEALS_PUBLICATION_PROTOCOL') != '1':
        print('Secondary publication requires MEALS_PUBLICATION_PROTOCOL=1')
        return 1

    cache = _read_cache(PRODUCT_METADATA_CACHE)
    total = len(cache)
    upgraded = 0
    already_complete = 0
    unmatched = 0
    skipped = 0

    # Products manifest: tpnc → productBlobPath (spec 021 / FR-015).
    products_manifest: Dict[str, str] = {}
    # Collect product blobs to write.
    product_blobs: Dict[str, Dict[str, Any]] = {}

    items = list(cache.items())
    if args.limit > 0:
        items = items[:args.limit]

    for key, entry in items:
        item_name = key  # cache key is the lowercased item name
        is_tpnc_key = key.isdigit()  # tpnc keys are numeric strings

        # Determine the display name for searching
        display_name = entry.get('title', '') or key

        # Check if already fully enriched (has tpnc + lastFetched)
        has_tpnc = bool(entry.get('tpnc'))
        has_last_fetched = bool(entry.get('lastFetched'))
        is_apollo_enriched = has_tpnc and has_last_fetched and entry.get('source') == 'tesco.com'

        if is_apollo_enriched and not args.force:
            already_complete += 1
            skipped += 1
            # Collect product blob for manifest even if already complete (FR-014).
            tpnc = entry.get('tpnc')
            if tpnc:
                blob_path = f'products/{tpnc}.json'
                products_manifest[tpnc] = blob_path
                product_blobs[tpnc] = {'productBlobPath': blob_path, **entry}
            print("  SKIP: already enriched")
            continue

        # Check freshness
        if not args.force and sync_dashboard_data._is_cache_fresh(entry):
            already_complete += 1
            skipped += 1
            tpnc = entry.get('tpnc')
            if tpnc:
                blob_path = f'products/{tpnc}.json'
                products_manifest[tpnc] = blob_path
                product_blobs[tpnc] = {'productBlobPath': blob_path, **entry}
            print("  SKIP: fresh (force to re-fetch)")
            continue

        if args.dry_run:
            print("  WOULD BACKFILL: product metadata")
            upgraded += 1
            continue

        # Perform backfill without logging household product labels in dual mode.
        try:
            with sync_dashboard_data.private_processing_output():
                result = backfill_entry(entry, display_name, force=args.force)
        except Exception as e:
            print("  ERROR: product enrichment unavailable")
            entry['unmatched'] = f'backfill error: {type(e).__name__}'
            unmatched += 1
            continue

        if result.get('unmatched'):
            print("  UNMATCHED: product metadata unavailable")
            cache[key] = result  # write the unmatched reason
            unmatched += 1
        else:
            tpnc = result.get('tpnc')
            print(f"  UPGRADED: image={bool(result.get('imageUrl'))} storage={bool(result.get('storage'))} prep={bool(result.get('preparation'))}")
            # Write under both key and tpnc
            cache[key] = result
            if tpnc and tpnc != key:
                cache[tpnc] = result
            upgraded += 1

            # Collect product blob for Vercel Blob write (FR-014/FR-015).
            if tpnc:
                blob_path = f'products/{tpnc}.json'
                products_manifest[tpnc] = blob_path
                product_blobs[tpnc] = {
                    'productBlobPath': blob_path,
                    **{k: v for k, v in result.items() if k != 'lastFetched'},
                    'lastFetched': result.get('lastFetched', datetime.now(timezone.utc).isoformat()),
                }

        time.sleep(RATE_LIMIT_SECONDS)

    # Write back local cache if not dry-run
    if not args.dry_run:
        _write_cache(cache, PRODUCT_METADATA_CACHE)

    destinations = [('primary', api_url, secret)]
    if secondary_url or secondary_secret:
        destinations.append(('secondary', secondary_url, secondary_secret))
    publication_results = {}
    if not args.dry_run and product_blobs:
        payload = _build_backfill_payload(product_blobs)
        if payload is None:
            print("  ⚠ Skipping product publication: no product payload available")
        else:
            publication_results = _publish_products_to_targets(payload, destinations)
            for target_name, result in publication_results.items():
                status = result.get('productsManifestPath') or result.get('error') or 'failed'
                print(f"  {target_name} products: {status}")

    summary = f"\nSummary: upgraded={upgraded} already_complete={already_complete} unmatched={unmatched} skipped={skipped} total={total}"
    print(summary)
    if not args.dry_run:
        print(f"Cache written to {PRODUCT_METADATA_CACHE}")

    # Backfill remains best-effort for unmatched items, but publication failures
    # are non-zero so a configured destination is never reported as successful.
    return 1 if publication_results and not all(r['ok'] for r in publication_results.values()) else 0


if __name__ == '__main__':
    sys.exit(main())
