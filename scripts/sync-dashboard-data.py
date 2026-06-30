#!/usr/bin/env python3
"""
Dashboard Data Sync Pipeline
=============================
Syncs meal plan and Tesco order data to the meals-dashboard.

Can be run:
1. Manually:     python3 scripts/sync-dashboard-data.py
2. After check:  (called by meals_check_runner.py or meals.py)
3. Scheduled:    cron job, GitHub Actions, etc.

Usage:
    python3 scripts/sync-dashboard-data.py [--dry-run] [--verbose] [--skip-fetch] [--message "..."]
"""

import sys
import json
import argparse
import subprocess
import re
import os
import time
import ast
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone
from typing import Callable, Dict, Any, List, Optional, Tuple, MutableMapping
from functools import lru_cache

# Base paths - use absolute paths for clarity. Defaults match Danny's Hermes chef profile
# environment, but can be overridden for local/dev runs.
DASHBOARD_PATH = Path(os.environ.get('MEALS_DASHBOARD_REPO', '/home/hermes/workspace/meals-dashboard')).expanduser().resolve()
MEALS_SCRIPTS_PATH = Path(os.environ.get('MEALS_CHECK_SCRIPTS', '/home/hermes/.hermes/scripts')).expanduser().resolve()
REAL_DATA_PATH = DASHBOARD_PATH / 'lib' / 'real-data.ts'
SYNC_META_PATH = DASHBOARD_PATH / 'lib' / 'sync-meta.ts'
RECEIPT_CACHE = MEALS_SCRIPTS_PATH / 'data' / 'receipt_coverage_cache.json'
MEAL_PLAN_CACHE = MEALS_SCRIPTS_PATH / 'data' / 'meal-plan-cache.json'
DASHBOARD_CACHE = Path(os.environ.get('MEALS_DASHBOARD_CACHE', str(MEALS_SCRIPTS_PATH / 'data' / 'dashboard_cache.json'))).expanduser().resolve()
PRODUCT_METADATA_CACHE = Path(os.environ.get('MEALS_PRODUCT_METADATA_CACHE', str(MEALS_SCRIPTS_PATH / 'data' / 'tesco_product_metadata_cache.json'))).expanduser().resolve()
PRODUCT_ENRICHMENT_TIMEOUT_SECONDS = float(os.environ.get('MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS', '5'))
PRODUCT_ENRICHMENT_DELAY_SECONDS = float(os.environ.get('MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS', '0.2'))

# --- Spec 035 / FR-003: Dashboard Order History Retention ---------------------
# Maximum number of historical orders retained across syncs. Default 6 (one week
# of typical Tesco delivery cadence + the live one). Soft cap; user can lower via
# CLI ``--max-history N`` (constrained 0..50). The active receipt is in addition
# to the cap when published.
MAX_HISTORICAL_ORDERS = 6
MAX_HISTORICAL_ORDERS_UPPER = 50
HISTORICAL_ORDERS_SIDECAR = MEALS_SCRIPTS_PATH / 'data' / 'orders' / 'previously_synced.json'


def assemble_orders(active: Dict, historical: List[Dict], cap: int) -> List[Dict]:
    """Merge the active receipt with historical sidecar entries.

    Pure helper (NFR-005): no I/O, no clock reads, no logging. Idempotent in the
    absence of new receipts (FR-006).

    - ``cap == 0`` is a special case (parity with ``--no-history``): returns the
      active receipt only, regardless of date ordering.
    - Otherwise: de-duplicate by ``orderId``; most-recent-wins on collision (FR-004).
    - Sort by ``deliveryDate`` ascending (FR-002; spec 034 matcher depends on it).
    - Truncate to ``cap + 1`` (the +1 covers the active receipt even if it has
      the smallest deliveryDate) (FR-005).
    """
    if cap is None or cap < 0:
        return []
    # Special case: cap=0 means "history retention disabled" — only the active
    # receipt is returned (FR-008 parity with --no-history).
    if cap == 0:
        if isinstance(active, dict):
            active_id = active.get("orderId") or active.get("order_number") or active.get("orderNumber")
            if active_id:
                return [active]
        return []
    by_id: Dict[str, Dict] = {}
    for entry in historical or []:
        if not isinstance(entry, dict):
            continue
        oid = entry.get("orderId") or entry.get("order_number") or entry.get("orderNumber")
        if oid:
            by_id[oid] = entry
    if isinstance(active, dict):
        active_id = active.get("orderId") or active.get("order_number") or active.get("orderNumber")
        if active_id:
            by_id[active_id] = active
    merged = sorted(by_id.values(), key=lambda o: o.get("deliveryDate", "") if isinstance(o, dict) else "")
    return merged[: cap + 1]


def load_historical_orders(cap: int, sidecar_path: Optional[Path] = None) -> List[Dict]:
    """Read the historical-orders sidecar with a safe fallback (FR-001, AS-008).

    Returns ``[]`` if the file is missing, corrupt, or unreadable. Never raises.
    Logs a single INFO line per failed read so the matcher cron can detect
    corrupt-sidecar recovery during incidents.
    """
    path = Path(sidecar_path) if sidecar_path is not None else HISTORICAL_ORDERS_SIDECAR
    try:
        raw = path.read_text(encoding="utf-8")
        entries = json.loads(raw)
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError) as exc:
        print(f"  ℹ history retention: sidecar unreadable ({exc.__class__.__name__}); treating as empty")
        return []
    if not isinstance(entries, list):
        print(f"  ℹ history retention: sidecar shape invalid (expected list, got {type(entries).__name__}); treating as empty")
        return []
    out: List[Dict] = []
    for entry in entries[: max(0, cap)]:
        if not isinstance(entry, dict):
            continue
        if not (entry.get("orderId") or entry.get("order_number") or entry.get("orderNumber")):
            continue
        out.append(entry)
    return out


def persist_historical_orders(orders: List[Dict], sidecar_path: Optional[Path] = None) -> None:
    """Atomically persist the merged historical-orders list to the sidecar (NFR-005).

    Writes to a ``.tmp`` sibling then renames over the destination, so a crash
    mid-write does not leave a half-baked file in place (FR-007 resilience).
    """
    path = Path(sidecar_path) if sidecar_path is not None else HISTORICAL_ORDERS_SIDECAR
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(list(orders or []), indent=2, sort_keys=True), encoding="utf-8")
    os.replace(tmp, path)


def load_dashboard_env(env: Optional[MutableMapping[str, str]] = None, env_path: Optional[Path] = None) -> MutableMapping[str, str]:
    """Load dashboard sync env vars from the Hermes env file if missing.

    The canonical meals pipeline already passes these values to this script, but
    direct/manual runs should work the same way. Existing process values win;
    values from ``~/.hermes/.env`` only fill gaps.
    """
    target_env = env if env is not None else os.environ
    path = env_path if env_path is not None else Path.home() / ".hermes" / ".env"
    if not path.exists():
        return target_env

    wanted = {"MEALS_DASHBOARD_DATA_SECRET", "BLOB_READ_WRITE_TOKEN", "DASHBOARD_DATA_API_URL"}
    try:
        with open(path) as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key not in wanted or target_env.get(key):
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\"', "'"}:
                    value = value[1:-1]
                target_env[key] = value
    except Exception as e:
        print(f"  ⚠ Error loading dashboard env from {path}: {e}")
    return target_env


def _product_cache_key(item_name: str) -> str:
    return re.sub(r'\s+', ' ', item_name).strip().lower()


@lru_cache(maxsize=1)
def _load_curated_static_database() -> str:
    product_db_path = DASHBOARD_PATH / 'lib' / 'product-database.ts'
    try:
        return product_db_path.read_text()
    except Exception:
        return ''


def find_curated_static_product_info(item_name: str) -> Optional[Dict[str, Any]]:
    """Find curated-static product info by exact-substring match.

    Mirrors lib/product-database.ts::findProductInfo so the sync pipeline
    can decide whether a local catalogue hit already satisfies the description
    tier before spending Firecrawl credits.
    """
    database = _load_curated_static_database()
    if not database:
        return None

    normalized_item = _product_cache_key(item_name)
    key_matches = [
        match.group(1)
        for match in re.finditer(r"^\s*['\"]([^'\"]+)['\"]:\s*\{\s*$", database, re.M)
    ]
    if not key_matches:
        return None

    key_matches.sort(key=len, reverse=True)
    for key in key_matches:
        if normalized_item == key or key in normalized_item:
            block = re.search(
                rf"^\s*['\"]{re.escape(key)}['\"]:\s*\{{(?P<body>.*?)^\s*\}}\s*,?\s*$",
                database,
                re.M | re.S,
            )
            if not block:
                return None
            body = block.group('body')
            def _line_value(field: str) -> Optional[str]:
                m = re.search(rf"^\s*{re.escape(field)}:\s*(.+?),\s*$", body, re.M)
                if not m:
                    return None
                raw = m.group(1).strip()
                try:
                    return ast.literal_eval(raw)
                except Exception:
                    return None

            description = _line_value('description')
            if not isinstance(description, str) or not description.strip():
                return None
            return {
                'name': _line_value('name') or key,
                'description': description,
                'storage': _line_value('storage') or '',
                'preparation': _line_value('preparation') or '',
                'image': _line_value('image') or '',
                'nutrition': _line_value('nutrition') or '',
            }
    return None


def _read_product_metadata_cache(cache_path: Path = PRODUCT_METADATA_CACHE) -> Dict[str, Dict[str, Any]]:
    if not cache_path.exists():
        return {}
    try:
        with open(cache_path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"  ⚠ Error reading product metadata cache: {e}")
        return {}


def _write_product_metadata_cache(cache: Dict[str, Dict[str, Any]], cache_path: Path = PRODUCT_METADATA_CACHE) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(cache, f, indent=2, sort_keys=True)
    os.replace(tmp, cache_path)


def _extract_og_image(text: str) -> Optional[str]:
    """Extract og:image URL from Tesco product page HTML."""
    # Pattern 1: <meta property="og:image" content="URL">
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', text, re.IGNORECASE)
    if m:
        return m.group(1)
    # Pattern 2: <meta content="URL" property="og:image">
    m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', text, re.IGNORECASE)
    if m:
        return m.group(1)
    # Pattern 3: "og:image":"URL" in inline script
    m = re.search(r'"og:image"\s*:\s*"([^"]+)"', text)
    if m:
        return m.group(1)
    return None


def _fetch_tesco_apollo_cache(tpnc: str, timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS) -> Optional[Dict[str, Any]]:
    """Fetch and extract the Apollo cache ProductType entry for a Tesco product.

    Returns the parsed Apollo cache dict or None on any failure.
    Uses the string-aware brace-counter walker from the spike notes.

    Also extracts og:image from the page HTML and attaches it as _og_image
    on the returned dict (since Apollo cross-refs prevent standalone JSON parsing).
    """
    # Use /groceries/ URL (mobile-friendly, same content)
    url = f'https://www.tesco.com/groceries/en-GB/products/{tpnc}'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 meals-dashboard product enrichment',
        'Accept-Language': 'en-GB,en;q=0.9',
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"  ⚠ Apollo cache fetch failed for {tpnc}: {e}")
        return None

    # Extract og:image from HTML (more reliable than Apollo JSON which has cross-refs)
    og_image = _extract_og_image(text)

    key = f'"ProductType:{tpnc}":'
    i = text.find(key)
    if i == -1:
        # Even without Apollo, return just og_image
        if og_image:
            return {'_og_image': og_image, 'tpnc': tpnc}
        print(f"  ⚠ Apollo cache: no ProductType:{tpnc} entity in {url}")
        return None

    val_start = text.find('{', i + len(key))
    if val_start == -1:
        if og_image:
            return {'_og_image': og_image, 'tpnc': tpnc}
        print(f"  ⚠ Apollo cache: no '{{' after ProductType:{tpnc} key in {url}")
        return None

    depth = 0
    in_str = False
    esc = False
    for k in range(val_start, len(text)):
        ch = text[k]
        if esc:
            esc = False
            continue
        if in_str:
            if ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                val_end = k
                break
    else:
        if og_image:
            return {'_og_image': og_image, 'tpnc': tpnc}
        print(f"  ⚠ Apollo cache: unclosed object for ProductType:{tpnc} in {url}")
        return None

    try:
        product = json.loads(text[val_start:val_end + 1])
    except json.JSONDecodeError as e:
        # Apollo JSON has __ref cross-references — JSON is invalid standalone.
        # Try to extract key fields via regex instead.
        print(f"  ⚠ Apollo JSON parse error for {tpnc}: {e} — falling back to HTML regex")
        product = {'tpnc': tpnc}

    # Attach og:image regardless
    if og_image:
        product['_og_image'] = og_image

    return product


# Spec 027 Rev 2: sync-time Firecrawl search tier. Mirrors the shape of
# _fetch_tesco_apollo_cache above (urllib, stdlib, never raises, warns
# on non-2xx) but targets Firecrawl's /v1/search endpoint instead of
# Tesco's product page. Used by enrich_order_items_with_product_metadata
# when the Apollo tier returns an empty description for an item.
MEALS_FIRECRAWL_FALLBACK_ENV = 'MEALS_FIRECRAWL_FALLBACK'
FIRECRAWL_API_KEY_ENV = 'FIRECRAWL_API_KEY'
FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v1/search'
FIRECRAWL_USER_AGENT = 'meals-check-sync/1.0 (danny@houseofthomas)'

_missing_firecrawl_key_warned = False


def _firecrawl_search_enabled() -> bool:
    """Spec 027 Rev 2 / FR-005: disabled by default. Only active when
    MEALS_FIRECRAWL_FALLBACK=1 is set in the sync process environment.
    """
    return os.environ.get(MEALS_FIRECRAWL_FALLBACK_ENV, '') == '1'


def _firecrawl_api_key() -> Optional[str]:
    """Spec 027 Rev 2 / FR-007: read FIRECRAWL_API_KEY from process env.
    Missing key → log a one-time warning and behave as if disabled.
    """
    global _missing_firecrawl_key_warned
    raw = os.environ.get(FIRECRAWL_API_KEY_ENV, '')
    if not raw or raw.strip() == '':
        if not _missing_firecrawl_key_warned:
            print(
                f"  ⚠ FIRECRAWL_API_KEY is not set; Firecrawl description "
                f"fallback is disabled. Set {MEALS_FIRECRAWL_FALLBACK_ENV}=1 "
                f"with a valid {FIRECRAWL_API_KEY_ENV} to enable."
            )
            _missing_firecrawl_key_warned = True
        return None
    return raw.strip()


def _clean_item_name_for_firecrawl(name: str) -> str:
    """Mirror the substitution-stripping the Apollo fetcher applies
    (`fetch_tesco_product_metadata` strips 'Subs: On'). Kept local so
    the orchestrator can pass the cleaned name without depending on the
    Apollo fetcher's internal naming.
    """
    return re.sub(r'\bSubstitutions:\s*On\b', '', name, flags=re.IGNORECASE).strip()


# Possible return values from `_fetch_firecrawl_search_snippet`:
#   {'outcome': 'ok',         'snippet': str, 'lastFetched': iso}
#   {'outcome': 'not_found',  'snippet': None, 'lastFetched': iso}
#   {'outcome': 'disabled',   ...}  (MEALS_FIRECRAWL_FALLBACK off)
#   {'outcome': 'no_key',     ...}  (FIRECRAWL_API_KEY missing)
#   {'outcome': 'http_error', 'status': int, 'lastFetched': iso}
#   {'outcome': 'error',      'lastFetched': iso}
#   {'outcome': 'malformed',  ...}
# The orchestrator consults `outcome` to decide whether to write
# `firecrawl.snippet` (ok), `firecrawl.status='not_found'` (not_found),
# or nothing at all (every other outcome — preserve absence so the
# next sync retries).
FirecrawlSearchOutcome = str  # 'ok' | 'not_found' | 'disabled' | 'no_key' | 'http_error' | 'error' | 'malformed'


def _fetch_firecrawl_search_snippet(
    item_name: str,
    timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Spec 027 Rev 2 / FR-010: fetch the first ~200-char Google snippet
    from Firecrawl's /v1/search endpoint for `<cleanName> site:tesco.com`.

    Returns a dict with `outcome` and the relevant payload fields.
    Never raises. Does NOT call /v1/scrape (FR-002). Uses only stdlib
    (FR-011).

    Outcomes:
      - 'ok'         — snippet populated; orchestrator writes
                       `firecrawl.snippet` + `firecrawl.lastFetched`.
      - 'not_found'  — 200 with empty data; orchestrator writes
                       `firecrawl.status='not_found'` so the next sync
                       skips the API call (Open Question 5).
      - 'disabled'   — MEALS_FIRECRAWL_FALLBACK not set; orchestrator
                       writes nothing.
      - 'no_key'     — FIRECRAWL_API_KEY missing; orchestrator writes
                       nothing (warning already logged at module level).
      - 'http_error' — non-2xx response; orchestrator writes nothing
                       (FR-009: log + continue).
      - 'error'      — network error / timeout; orchestrator writes
                       nothing.
      - 'malformed'  — JSON parse error; orchestrator writes nothing.
    """
    now = datetime.now(timezone.utc).isoformat()
    if not _firecrawl_search_enabled():
        return {'outcome': 'disabled'}
    api_key = _firecrawl_api_key()
    if not api_key:
        return {'outcome': 'no_key'}

    cleaned = _clean_item_name_for_firecrawl(item_name)
    if not cleaned:
        return {'outcome': 'error'}

    query = f'{cleaned} site:tesco.com'
    body = json.dumps({'query': query, 'limit': 1}).encode('utf-8')
    request = urllib.request.Request(
        FIRECRAWL_SEARCH_URL,
        data=body,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': FIRECRAWL_USER_AGENT,
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode('utf-8', errors='ignore')
    except urllib.error.HTTPError as e:
        print(
            f"  ⚠ Firecrawl HTTP {e.code} for '{cleaned}'; falling through to placeholder."
        )
        return {'outcome': 'http_error', 'status': e.code, 'lastFetched': now}
    except Exception as e:
        print(f"  ⚠ Firecrawl fetch error for '{cleaned}': {e}")
        return {'outcome': 'error', 'lastFetched': now}

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  ⚠ Firecrawl: malformed JSON response for '{cleaned}'.")
        return {'outcome': 'malformed', 'lastFetched': now}

    if not isinstance(payload, dict) or not payload.get('success'):
        return {'outcome': 'not_found', 'lastFetched': now}
    data = payload.get('data')
    if not isinstance(data, list) or len(data) == 0:
        return {'outcome': 'not_found', 'lastFetched': now}
    first = data[0]
    if not isinstance(first, dict):
        return {'outcome': 'not_found', 'lastFetched': now}
    snippet = first.get('description')
    if not isinstance(snippet, str):
        return {'outcome': 'not_found', 'lastFetched': now}
    snippet = snippet.strip()
    if not snippet:
        return {'outcome': 'not_found', 'lastFetched': now}

    return {
        'outcome': 'ok',
        'snippet': snippet,
        'lastFetched': now,
    }


def _apollo_description_populated(metadata: Dict[str, Any]) -> bool:
    """Spec 027 Rev 2 / FR-001: Apollo partial success check. Returns
    True when the metadata dict has a non-empty `description` field
    (Apollo populated it). The Firecrawl tier is skipped when this
    returns True.
    """
    desc = metadata.get('description')
    return isinstance(desc, str) and desc.strip() != ''


def _join_field(value: Any) -> str:
    """Join a list or return a string value, stripping surrounding whitespace."""
    if value is None:
        return ''
    if isinstance(value, list):
        return ' '.join(str(v).strip() for v in value if v).strip()
    return str(value).strip()


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', text or '')).strip()


def _decode_json_urls(value: Any) -> Any:
    """Recursively decode \u002F and \u0026 escapes in JSON strings."""
    if isinstance(value, str):
        return value.replace('\u002F', '/').replace('\u0026', '&')
    if isinstance(value, list):
        return [_decode_json_urls(v) for v in value]
    if isinstance(value, dict):
        return {k: _decode_json_urls(v) for k, v in value.items()}
    return value


def _flatten_cooking_instructions(instructions: Any) -> str:
    """Flatten oven/microwave/grill x chilled/frozen cooking instructions to a string."""
    if not instructions or not isinstance(instructions, dict):
        return ''
    lines = []
    for method_key in ('oven', 'microwave', 'grill'):
        method_data = instructions.get(method_key)
        if not method_data or not isinstance(method_data, dict):
            continue
        method_label = method_key.capitalize()
        for state_key in ('chilled', 'frozen'):
            state_data = method_data.get(state_key)
            if not state_data or not isinstance(state_data, dict):
                continue
            instr = state_data.get('instructions', '')
            temp = state_data.get('temperature', '')
            if instr:
                label = f"{method_label} ({state_key})"
                if temp:
                    label += f" {temp}"
                lines.append(f"{label}: {instr}")
    return ' | '.join(lines) if lines else ''


def _render_nutrition_table(nutrition: Any) -> str:
    """Render a nutrition list as a markdown table."""
    if not nutrition or not isinstance(nutrition, list):
        return ''
    rows = []
    for item in nutrition:
        if not isinstance(item, dict):
            continue
        name = item.get('name', '')
        vals = [item.get(f'value{i}', '') for i in range(1, 5)]
        vals = [str(v) for v in vals if v]
        if name or vals:
            rows.append(f"| {name} | {' | '.join(vals)} |")
    if not rows:
        return ''
    header = "| Nutrient | Value |"
    sep = "| --- | --- |"
    return "\n".join([header, sep] + rows)


def apollo_cache_to_product_info(product: Dict[str, Any], original_name: str = '') -> Dict[str, Any]:
    """Map a Tesco Apollo ProductType cache dict to the dashboard ProductInfo shape.

    FR-007 through FR-010: all fields from the Apollo cache are mapped.
    Missing fields are returned as empty string / None - no fabrication.
    """
    details = product.get('details') or {}

    desc_parts = [_join_field(product.get('description', '')), _join_field(details.get('productMarketing', ''))]
    description = ' '.join(p for p in desc_parts if p)

    storage_parts = [_join_field(details.get('storage', ''))]
    if details.get('freezingInstructions'):
        storage_parts.append(_join_field(details.get('freezingInstructions', '')))
    storage = ' '.join(p for p in storage_parts if p)

    prep_parts = [_join_field(details.get('preparationAndUsage', ''))]
    cooking = _flatten_cooking_instructions(details.get('cookingInstructions', {}))
    if cooking:
        prep_parts.append(cooking)
    preparation = ' '.join(p for p in prep_parts if p)

    raw_ingredients = details.get('ingredients')
    if isinstance(raw_ingredients, list):
        ingredients = _strip_html(', '.join(str(v) for v in raw_ingredients if v))
    else:
        ingredients = _strip_html(str(raw_ingredients) if raw_ingredients else '')

    allergen_parts = []
    for allergen in (details.get('allergens') or []):
        if isinstance(allergen, dict):
            vals = allergen.get('values') or []
            for v in vals:
                if v:
                    allergen_parts.append(str(v))
    allergens = '; '.join(allergen_parts)

    nutrition_md = _render_nutrition_table(details.get('nutrition'))

    image_url = ''
    # _og_image from og:image meta tag — most reliable source
    if product.get('_og_image'):
        image_url = _decode_json_urls(product.get('_og_image', ''))
    # Fall back to Apollo media images
    if not image_url:
        media = product.get('media') or {}
        images = media.get('images')
        if isinstance(images, list) and len(images) > 0:
            raw_url = images[0].get('url', '') or ''
            image_url = _decode_json_urls(raw_url)
    # Last resort: defaultImageUrl
    if not image_url:
        raw_default = product.get('defaultImageUrl', '') or ''
        image_url = _decode_json_urls(raw_default)

    def _d(s):
        return _decode_json_urls(s) if isinstance(s, str) else s

    product_url = f"https://www.tesco.com/shop/en-GB/products/{product.get('tpnc', '')}"

    return {
        'tpnc': _d(product.get('tpnc', '')) or None,
        'gtin': _d(product.get('gtin', '')) or None,
        'tpnb': _d(product.get('tpnb', '')) or None,
        'title': _d(_join_field(product.get('title', ''))) or original_name,
        'description': _d(description),
        'storage': _d(storage),
        'preparation': _d(preparation),
        'ingredients': _d(ingredients),
        'allergens': _d(allergens),
        'nutrition': _d(nutrition_md),
        'brand': _d(_join_field(product.get('brandName', ''))),
        'category': _d(' / '.join(filter(None, [
            _join_field(product.get('departmentName', '')),
            _join_field(product.get('aisleName', '')),
            _join_field(product.get('shelfName', '')),
        ]))),
        'imageUrl': image_url,
        'productUrl': product_url,
        'source': 'tesco.com',
        'lastFetched': datetime.now(timezone.utc).isoformat(),
    }


def _extract_tesco_product_metadata(item_name: str, html: str, search_url: str) -> Optional[Dict[str, Any]]:
    """Extract tpnc and basic metadata from a Tesco search page HTML.

    Returns basic metadata including tpnc (for product-page re-fetch) or None.
    Uses the /shop/ URL pattern (new, working) not the old /groceries/ path.
    """
    product_match = re.search(r'href="(?P<path>/shop/en-GB/products/[^"]+)"', html)
    tpnc_match = re.search(r'/shop/en-GB/products/(?P<tpnc>\d+)', product_match.group('path') if product_match else '')
    title_match = re.search(r'<title>(?P<title>.*?)</title>', html, flags=re.IGNORECASE | re.DOTALL)
    image_match = re.search(r'(https://digitalcontent\.api\.tesco\.com/[^"\s<]+)', html)

    if not tpnc_match:
        return None

    tpnc = tpnc_match.group('tpnc')
    product_url = f'https://www.tesco.com/shop/en-GB/products/{tpnc}'
    cleaned_item = re.sub(r'Substitutions:\s*On', '', item_name, flags=re.IGNORECASE).strip()

    metadata: Dict[str, Any] = {
        'tpnc': tpnc,
        'title': cleaned_item,
        'productUrl': product_url,
        'source': 'tesco',
    }
    if image_match:
        metadata['imageUrl'] = image_match.group(1)
    if title_match:
        title = re.sub(r'\s+', ' ', re.sub(r'<.*?>', '', title_match.group('title'))).strip()
        if title and 'tesco' not in title.lower():
            metadata['description'] = title
    return metadata


def _fetch_via_hermes_agent(item_name: str, timeout: int = 45) -> Optional[Dict[str, Any]]:
    """Last-resort fallback: invoke hermes chat with web toolset to search Tesco.

    Runs ``hermes chat -t web -Q --max-turns 1`` with a Tesco-focused query.
    Parses the text output for the first product URL and extracts tpnc, title,
    description, and image from the response.

    This is slow (~15-25s per item) so only called after direct HTTP search
    AND Apollo cache both return nothing. The result is not cached (it's a
    last-resort rescue attempt — cache writes happen in the caller).

    Returns None on any failure: timeout, parse error, or no result found.
    """
    # Escape quotes and build a focused search query
    escaped = item_name.replace('"', '\\"')
    query = (
        f'Search for "{escaped}" on the Tesco groceries website '
        'and return the product URL (https://www.tesco.com/groceries/en-GB/products/NUMBER), '
        'the product title, and a short description. '
        'Focus on exact match or closest own-brand Tesco product.'
    )

    try:
        proc = subprocess.run(
            [
                'hermes', 'chat',
                '-q', query,
                '-t', 'web',
                '--max-turns', '1',
                '-Q',
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        print(f"  ⚠ hermes subprocess failed for {item_name}: {e}")
        return None

    if proc.returncode != 0:
        print(f"  ⚠ hermes exit {proc.returncode} for {item_name}")
        return None

    output = proc.stdout

    # Extract first product URL → tpnc
    url_match = re.search(r'https://www\.tesco\.com/groceries/en-GB/products/(\d+)', output)
    if not url_match:
        # Try /shop/ variant
        url_match = re.search(r'https://www\.tesco\.com/shop/en-GB/products/(\d+)', output)

    tpnc = url_match.group(1) if url_match else None
    product_url = f'https://www.tesco.com/groceries/en-GB/products/{tpnc}' if tpnc else None

    # Extract title — skip system/progress lines (⚠, >>>, Iteration, Session, etc.)
    TITLE_SKIP_PREFIXES = (
        '⚠', '>>>', 'Iteration', 'Session', 'Duration', 'No results',
        'Which', 'A few', 'Fresh', 'Frozen', 'Prepared', 'Dried',
        'Snack', 'Full search', 'Category', 'Closely', 'Found it',
        'Exact match', 'Here you go', 'Darling, found',
    )
    TITLE_SKIP_PATTERNS = (
        re.compile(r'^found it[,.\s]*', re.IGNORECASE),
        re.compile(r'^exact match found[,.\s]*', re.IGNORECASE),
        re.compile(r'^found an?[,.\s]+', re.IGNORECASE),
        re.compile(r'^here you go, sweetheart[,.\s]*', re.IGNORECASE),
        re.compile(r"^darling[,.\s]+", re.IGNORECASE),
        re.compile(r"^no[,.\s]+", re.IGNORECASE),
        re.compile(r"^found the lot.*", re.IGNORECASE),
    )
    title_match = re.search(r'\*{2}Title:\*{2}\s*(.+?)(?:\n|$)', output)
    if not title_match:
        title_match = re.search(r'product title[:\s]+(.+?)(?:\n|$)', output, re.IGNORECASE)
    if not title_match:
        title = item_name
        for line in output.split('\n'):
            stripped = line.strip().strip('*')
            lower = stripped.lower()
            # Skip system/progress lines and lines that are mostly artefacts
            if (len(stripped) > 4
                    and not stripped.startswith(('⚠', '>>>', 'https://', 'http://'))
                    and not lower.startswith(TITLE_SKIP_PREFIXES)
                    and not any(p.match(stripped) for p in TITLE_SKIP_PATTERNS)
                    and not any(stripped.lower().startswith(p) for p in TITLE_SKIP_PREFIXES)):
                title = stripped
                break
    else:
        title = title_match.group(1).strip()

    # Clean up title: remove trailing artefacts
    title = re.sub(r'\s+[—–-]\s+.*$', '', title)           # "Title — extra info"
    title = re.sub(r'\s+[⋯...]+\s+.*$', '', title)         # "Title ... more"
    title = re.sub(r'\s+on the first (pass|try|swing)[,.\s]*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s+sweetheart[,.\s]*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r"[,.\s]+darling[,.\s]*$", '', title, flags=re.IGNORECASE)
    title = re.sub(r"^found it[,.\s]+", '', title, flags=re.IGNORECASE)
    title = re.sub(r"^exact match found[,.\s]*", '', title, flags=re.IGNORECASE)
    title = re.sub(r"^found an?[,.\s]+", '', title, flags=re.IGNORECASE)
    title = re.sub(r"^here you go[,.\s]*", '', title, flags=re.IGNORECASE)
    title = re.sub(r"^darling[,.\s]+", '', title, flags=re.IGNORECASE)
    title = title.strip().strip('"').strip("'").rstrip(',.:').strip()
    if not title or len(title) < 3:
        title = item_name

    # Extract description (looks like: "Description: ...", or content in parentheses after URL)
    desc_match = re.search(r'Description[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)', output, re.IGNORECASE | re.DOTALL)
    description = desc_match.group(1).strip() if desc_match else ''

    if not description:
        # Try to extract content between URL and the next blank line / list item
        if url_match:
            after_url = output[url_match.end():]
            # Skip until we find a blank line or a list
            lines = after_url.split('\n')
            desc_lines = []
            for line in lines:
                stripped = line.strip()
                if not stripped or stripped.startswith('http') or stripped.startswith('*') or stripped.startswith('Which'):
                    break
                if len(stripped) > 10:
                    desc_lines.append(stripped)
            description = ' '.join(desc_lines)[:500]

    # Extract image URL from response (sometimes appears in output)
    img_match = re.search(r'(https://digitalcontent\.api\.tesco\.com/[^\s<>"{}|\\^`\[\]]+)', output)
    image_url = img_match.group(1) if img_match else None

    # Nothing useful found — detect model failure responses
    FAILURE_INDICATORS = (
        "can't give you", "cannot give you", "don't have enough",
        "not confident", "sorry sweetheart", "no results",
        "couldn't find", "can't find", "unable to find",
        "do not have enough", "uncertain",
    )
    if tpnc is None:
        # Only accept a None-tpnc result if description is genuinely useful
        if not description or len(description) < 20:
            return None
        if any(indicator in (description or '').lower() for indicator in FAILURE_INDICATORS):
            return None

    return {
        'tpnc': tpnc,
        'title': title if title else item_name,
        'description': description,
        'productUrl': product_url,
        'imageUrl': image_url,
        'source': 'tesco-hermes-web',
        'lastFetched': datetime.now(timezone.utc).isoformat(),
    }


def fetch_tesco_product_metadata(item_name: str, timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS) -> Optional[Dict[str, Any]]:
    """Best-effort Tesco website metadata fetch with Apollo cache enrichment.

    Strategy:
    1. Search for item name to resolve tpnc via direct HTTP (fast path).
    2. Fetch the product page at /groceries/en-GB/products/<tpnc> and extract Apollo cache.
    3. Fall back to Hermes web subprocess (slow, ~15-25s) for description/image/tpnc
       when both steps 1 and 2 return nothing.

    Failures, 403s, rate limits, and no confident match return None so the
    dashboard generation can keep truthful fallback data. No fabrication.
    """
    cleaned = re.sub(r'\bSubstitutions:\s*On\b', '', item_name, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None

    # Step 1: search to resolve tpnc via direct HTTP (fast path)
    search_url = 'https://www.tesco.com/groceries/en-GB/search?query=' + urllib.parse.quote(cleaned)
    request = urllib.request.Request(search_url, headers={
        'User-Agent': 'Mozilla/5.0 meals-dashboard product enrichment',
        'Accept-Language': 'en-GB,en;q=0.9',
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            html = response.read(500_000).decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"  ⚠ Tesco search failed for {cleaned}: {e}")
        html = ''

    basic = _extract_tesco_product_metadata(cleaned, html, search_url) if html else None

    tpnc = basic.get('tpnc') if basic else None

    # Step 2: fetch product page and extract Apollo cache
    if tpnc:
        product = _fetch_tesco_apollo_cache(tpnc, timeout=timeout)
        if product is not None:
            return apollo_cache_to_product_info(product, original_name=cleaned)

    # Step 3: Hermes web subprocess fallback — slow but reliable for description/image/tpnc.
    # Called only when HTTP search + Apollo cache both failed. Skipped if
    # MEALS_PRODUCT_ENRICHMENT_USE_HERMES_FALLBACK=0 (for CI/unit tests).
    if os.environ.get('MEALS_PRODUCT_ENRICHMENT_USE_HERMES_FALLBACK', '1') != '0':
        hermes_result = _fetch_via_hermes_agent(cleaned)
        if hermes_result:
            # If Step 1 already found something partial, merge Hermes result on top
            if basic:
                return {**basic, **hermes_result}
            return hermes_result

    # Final fallback: basic search-page metadata (title/image/productUrl only)
    return basic


PRODUCT_ENRICHMENT_MAX_AGE_DAYS = float(os.environ.get('MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS', '21'))


def _is_cache_fresh(entry: Dict[str, Any]) -> Optional[bool]:
    """Check if a cache entry is within the freshness window.

    Returns True  = fresh, skip network fetch.
    Returns False = stale (outside freshness window), re-fetch.
    Returns None  = no lastFetched field (legacy entry).  Legacy entries are
                    treated as direct cache hits (used as-is, never re-fetched
                    in the background) — they are upgraded only when a fresh
                    entry arrives via normal re-fetch.
    """
    last_fetched = entry.get('lastFetched')
    if not last_fetched:
        return None
    try:
        fetched = datetime.fromisoformat(last_fetched.replace('Z', '+00:00'))
        age_days = (datetime.now(timezone.utc) - fetched.replace(tzinfo=timezone.utc)).total_seconds() / 86400
        return age_days <= PRODUCT_ENRICHMENT_MAX_AGE_DAYS
    except (ValueError, TypeError):
        return False


def enrich_order_items_with_product_metadata(
    items: list,
    cache_path: Path = PRODUCT_METADATA_CACHE,
    fetcher: Callable[[str], Optional[Dict[str, Any]]] = fetch_tesco_product_metadata,
    delay_seconds: float = PRODUCT_ENRICHMENT_DELAY_SECONDS,
    api_url: Optional[str] = None,
    api_secret: Optional[str] = None,
) -> list:
    """Return order items with optional generated Tesco product metadata.

    Strategy:
    1. Check existing metadata on the item (preserved as-is).
    2. Try tpnc-keyed cache lookup — if fresh, use it directly.
    3. Try name-keyed cache lookup — if fresh, use it directly.
    4. Legacy entries (no tpnc, no lastFetched) are direct cache hits — used
       as-is, never re-fetched in the background.
    5. On any miss: fetcher call (search + product page + Apollo extract).
    6. New entries are stored under both tpnc and name keys.

    FR-003/FR-004/FR-012 (spec 021): enriched items carry productBlobPath
    (not embedded productMetadata). Product blobs are written to Vercel Blob
    via the API as a side-effect of enrichment. The local cache is updated
    for backward compatibility but is no longer the source of truth.

    Atomic write (FR-003): writes to *.tmp then os.replace().
    Freshness window (FR-011): entries older than PRODUCT_ENRICHMENT_MAX_AGE_DAYS
    (default 21 days) are re-fetched.
    """
    if os.environ.get('MEALS_PRODUCT_ENRICHMENT', '1') == '0':
        return items

    cache = _read_product_metadata_cache(cache_path)
    changed_cache = False
    enriched_items = []
    # Collect product blobs to write to Vercel Blob (spec 021 / FR-003).
    # {tpnc: {productBlobPath: "products/{tpnc}.json", ...ProductBlob fields}}
    product_blobs: Dict[str, Dict[str, Any]] = {}

    for item in items:
        enriched = dict(item)
        existing_metadata = enriched.get('productMetadata') or enriched.get('product_metadata')
        if isinstance(existing_metadata, dict) and existing_metadata:
            # Already has metadata — if it has a tpnc, set productBlobPath.
            tpnc = existing_metadata.get('tpnc')
            if tpnc:
                enriched['productBlobPath'] = f'products/{tpnc}.json'
            enriched_items.append(enriched)
            continue

        item_name = str(enriched.get('name', '')).strip()
        name_key = _product_cache_key(item_name)
        metadata = None

        # Try tpnc-keyed lookup first (FR-002: tpnc is a cache key)
        item_tpnc = (existing_metadata or {}).get('tpnc') if isinstance(existing_metadata, dict) else None
        if item_tpnc:
            cached = cache.get(item_tpnc)
            freshness = _is_cache_fresh(cached) if cached is not None else None
            if freshness is True:
                metadata = cached  # fresh — use it directly
            elif freshness is False:
                metadata = None  # stale — re-fetch
            # freshness=None (legacy): fall through to name-keyed lookup

        # Try name-keyed lookup, checking freshness
        if metadata is None:
            cached = cache.get(name_key)
            freshness = _is_cache_fresh(cached) if cached is not None else None
            if freshness is True:
                metadata = cached  # fresh — use it directly
            elif freshness is False:
                metadata = None  # stale — re-fetch
            else:
                # freshness=None (legacy, no lastFetched): use as direct hit.
                # No background refresh — legacy entries are upgraded only via
                # explicit backfill script or when a subsequent fresh entry arrives.
                metadata = cached  # direct hit, no re-fetch

        if metadata is None:
            try:
                metadata = fetcher(item_name)
            except Exception as e:
                print(f"  ⚠ Tesco product enrichment fallback for {item_name}: {e}")
                metadata = None
            if metadata:
                # Spec 027 Rev 2 / FR-014: if Apollo returned an empty
                # `description`, consult the curated-static catalogue first,
                # then Firecrawl's search tier for a Google snippet. Honour
                # the 21-day TTL on the existing `firecrawl.lastFetched`
                # (FR-006) — skip the API when a fresh snippet is already
                # cached. Apply the same per-item delay as Apollo (FR-013).
                if not _apollo_description_populated(metadata):
                    curated_static = find_curated_static_product_info(item_name)
                    if not curated_static:
                        existing_fc = metadata.get('firecrawl') or {}
                        fc_fetched_at = existing_fc.get('lastFetched')
                        fc_is_fresh = False
                        if isinstance(fc_fetched_at, str) and fc_fetched_at:
                            try:
                                fc_dt = datetime.fromisoformat(
                                    fc_fetched_at.replace('Z', '+00:00')
                                )
                                fc_age_days = (
                                    datetime.now(timezone.utc)
                                    - fc_dt.replace(tzinfo=timezone.utc)
                                ).total_seconds() / 86400
                                fc_is_fresh = fc_age_days <= PRODUCT_ENRICHMENT_MAX_AGE_DAYS
                            except (ValueError, TypeError):
                                fc_is_fresh = False
                        if not fc_is_fresh:
                            fc_result = _fetch_firecrawl_search_snippet(item_name)
                            outcome = fc_result.get('outcome')
                            if outcome == 'ok':
                                metadata['firecrawl'] = {
                                    'snippet': fc_result['snippet'],
                                    'lastFetched': fc_result['lastFetched'],
                                    'status': 'ok',
                                }
                            elif outcome == 'not_found':
                                # Open Question 5: persist the not_found
                                # status so the next sync skips the API.
                                metadata['firecrawl'] = {
                                    'snippet': None,
                                    'lastFetched': fc_result['lastFetched'],
                                    'status': 'not_found',
                                }
                            # All other outcomes (disabled, no_key, http_error,
                            # error, malformed): write nothing — the next sync
                            # retries the API.
                            if delay_seconds > 0:
                                time.sleep(delay_seconds)
                # Store under both tpnc key (if known) and name key
                cache[name_key] = metadata
                if metadata.get('tpnc'):
                    cache[metadata['tpnc']] = metadata
                changed_cache = True
            if delay_seconds > 0:
                time.sleep(delay_seconds)

        if metadata:
            tpnc = metadata.get('tpnc')
            if tpnc:
                # FR-003: set productBlobPath and tpnc on the item so the
                # dashboard read path and API payload can access both.
                enriched['productBlobPath'] = f'products/{tpnc}.json'
                enriched['tpnc'] = tpnc
                # Collect the product blob for Vercel Blob write (deduped by tpnc).
                if tpnc not in product_blobs:
                    product_blobs[tpnc] = {
                        'productBlobPath': f'products/{tpnc}.json',
                        **{k: v for k, v in metadata.items() if k != 'lastFetched'},
                        'lastFetched': metadata.get('lastFetched', datetime.now(timezone.utc).isoformat()),
                    }
        enriched_items.append(enriched)

    if changed_cache:
        _write_product_metadata_cache(cache, cache_path)

    # Note: product blobs are NOT written here — that happens once in
    # build_dashboard_payload() via the main API payload. This function only
    # sets productBlobPath on items and returns the enriched list + product blobs
    # for build_dashboard_payload() to collect and forward.
    return enriched_items


def run_command(cmd: list, timeout: int = 60, cwd: Path = None) -> Tuple[bool, str]:
    """Run a command and return success, output."""
    try:
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=timeout, 
            shell=False,
            cwd=cwd
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


ASHLEE_LUNCH_SECTION_ID = "6gJfvHHqHrCMPcp9"

def fetch_meal_plan(days: int = 7) -> Tuple[bool, str]:
    """Fetch meal plan from Todoist."""
    print(f"  Fetching meal plan (next {days} days)...")
    
    from datetime import date, timedelta
    start = date.today()
    end = start + timedelta(days=days)
    
    cmd = [
        "python3",
        str(MEALS_SKILL_PATH / "scripts" / "grocery" / "fetch-meal-plan.py"),
        "--start-date", str(start),
        "--end-date", str(end)
    ]
    
    success, output = run_command(cmd, timeout=90)
    if success:
        print(f"  ✓ Meal plan fetched")
        return True, output
    else:
        print(f"  ⚠ Meal plan fetch returned: {output[:200]}")
        return True, output


def fetch_tesco_receipt(days: int = 14) -> Tuple[bool, str]:
    """Fetch latest Tesco order from Gmail."""
    print(f"  Fetching Tesco receipt (last {days} days)...")
    
    cmd = [
        "python3",
        str(MEALS_SKILL_PATH / "scripts" / "fetch_order.py"),
        "--account", "danny@tsang.uk",
        "--days", str(days),
        "--json"
    ]
    
    success, output = run_command(cmd, timeout=120)
    if success:
        print(f"  ✓ Tesco receipt fetched")
        return True, output
    else:
        print(f"  ✗ Failed: {output[:200]}")
        return False, output


def read_cache_json(path: Path) -> Optional[Dict]:
    """Read a JSON cache file."""
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        print(f"  ⚠ Error reading {path}: {e}")
        return None


def get_latest_order(receipt_data: Dict) -> Optional[Dict]:
    """Get the most recent order from receipt data.
    
    The cache has two keys:
    - orders: all orders, but many have empty items
    - selected: orders with items, sorted by date (most recent last)
    """
    if not receipt_data:
        return None
    
    # Use 'selected' if available (has items), otherwise fall back to 'orders'
    for key in ['selected', 'orders']:
        if key in receipt_data and receipt_data[key]:
            # Find the last order with items
            for order in reversed(receipt_data[key]):
                if order.get('items'):
                    return order
    
    return None


# Keywords that indicate a primary ingredient match at start of item name
_PRIMARY_INGREDIENT_KEYWORDS = {
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon',
    'cod', 'tuna', 'prawn', 'shrimp', 'rice', 'pasta', 'potato', 'chips',
    'onion', 'garlic', 'carrot', 'broccoli', 'pepper', 'mushroom', 'tomato',
    'cheese', 'milk', 'cream', 'butter', 'egg', 'bread', 'flour',
    'sugar', 'salt', 'oil', 'vinegar', 'noodles', 'flatbread',
    # Common secondary ingredients
    'tomato', 'lemon', 'lime', 'ginger', 'chilli', 'curry', 'soy',
    'honey', 'mustard', 'mayo', 'mayonnaise', 'ketchup', 'bbq',
    'bacon', 'ham', 'sausage', 'steak', 'mince', 'chorizo',
    'sweetcorn', 'peas', 'beans', 'lentil', 'chickpea',
    'coconut', 'almond', 'walnut', 'cashew', 'pine nut',
    'basil', 'oregano', 'thyme', 'rosemary', 'mint', 'coriander', 'parsley',
    'cumin', 'paprika', 'cinnamon', 'nutmeg', 'turmeric', 'curry powder',
}

# Keywords that indicate the item is a prepared/compound dish (weak match for ingredients)
_COMPOUND_DISH_KEYWORDS = {
    'soup', 'sauce', 'curry', 'stew', 'casserole', 'ready meal', 'readymeal',
    'sandwich', 'sarnie', 'wrap', 'pitta', 'pizza', 'pasta', 'noodles',
    'salad', 'smoothie', 'juice', 'drink', 'shake', 'ice cream', 'icecream',
    'cake', 'biscuit', 'cookie', 'chocolate', 'sweet', 'snack',
    'meal deal', 'lunch special', 'dinner special',
}

# Brand prefixes to skip when checking word positions
_BRAND_PREFIXES = {'tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'co-op', 'aldi', 'lidl', 'iceland'}



def _is_weak_match(ingredient_name: str, item_name: str) -> bool:
    """Check if a match is weak (ingredient is a minor word in a compound dish).
    
    Returns True if the match should be rejected because the ingredient
    appears to be a minor component of a prepared dish rather than the
    main ingredient.
    """
    ing_lower = ingredient_name.lower()
    item_lower = item_name.lower()
    
    # Check if item is a compound dish - if so, ingredient appearing in it is weak
    for keyword in _COMPOUND_DISH_KEYWORDS:
        if keyword in item_lower:
            return True
    
    return False


def find_receipt_item_match(ingredient_name: str, receipt_items: list) -> Optional[Dict]:
    """Find the best matching receipt item for an ingredient name.
    
    Uses strict substring matching with these rules:
    1. For primary ingredient keywords, prefer matches where ingredient appears early in item name
    2. Reject compound dishes (soup, sauce, ready meals) as ingredient matches
    3. Prefer exact matches and matches where ingredient is a main descriptor
    """
    ingredient_lower = ingredient_name.lower()
    
    # Split into words for analysis
    ing_words = ingredient_lower.split(" ")
    primary_word = ing_words[0] if ing_words else ingredient_lower
    
    def _get_meaningful_words(item_name: str) -> list:
        """Get words after brand prefix."""
        words = item_name.lower().split()
        # Skip brand prefix if present
        if words and words[0] in _BRAND_PREFIXES:
            words = words[1:]
        return words
    
    def _word_position(item_name: str, word: str) -> int:
        """Get position of word in item name (0-indexed, after brand prefix)."""
        words = _get_meaningful_words(item_name)
        for i, w in enumerate(words):
            if w.startswith(word):
                return i
        return 999  # Not found
    
    best_match = None
    best_match_score = 0
    
    for item in receipt_items:
        item_lower = item.get("name", "").lower()
        item_words = _get_meaningful_words(item.get("name", ""))
        
        # Reject weak matches (ingredient inside compound dish)
        if _is_weak_match(ingredient_lower, item_lower):
            continue
        
        score = 0
        
        # Rule 1: For primary ingredients, check position in item name
        if primary_word in _PRIMARY_INGREDIENT_KEYWORDS:
            pos = _word_position(item.get("name", ""), primary_word)
            if pos <= 2:  # Among first 3 meaningful words = strong match
                score = 100 - pos * 10  # Earlier = better
            elif pos <= 4:
                score = 70
        
        # Rule 2: Exact full match
        if ingredient_lower == item_lower:
            score = 95
        
        # Rule 3: Item contained by ingredient (item is more specific)
        elif item_lower in ingredient_lower and len(item_lower) > 3:
            score = 60
        
        # Rule 4: Ingredient word at start of meaningful words (not brand)
        elif any(w.startswith(primary_word) for w in item_words if len(primary_word) > 2):
            score = 50
        
        # Rule 5: Any word from ingredient starts with ingredient (fallback)
        elif any(w.startswith(ing_word) for ing_word in ing_words for w in item_words if len(ing_word) > 2):
            score = 40
        
        if score > best_match_score:
            best_match_score = score
            best_match = item
    
    return best_match


def read_dashboard_cache() -> Optional[Dict]:
    """Read pre-generated dashboard data from meals check cache.
    
    This is the preferred source when available, as it contains
    the full analysis from the meals check (with manual overrides,
    restaurant detection, etc.) in one place.
    """
    return read_cache_json(DASHBOARD_CACHE)


def resolve_matched_items_for_dashboard(matched_items, raw_items):
    """Resolve cached matched items into dashboard MatchedItem records.

    New cache entries carry receipt details directly as dicts. Older cache entries are
    strings and are resolved against the visible receipt items when possible.
    """
    resolved_matched_items = []
    for matched_item in matched_items or []:
        if isinstance(matched_item, dict):
            item_name = matched_item.get("name") or matched_item.get("product_name") or matched_item.get("ingredient") or ""
            resolved_item = {
                "ingredient": item_name,
                "name": item_name,
                "quantity": matched_item.get("quantity", matched_item.get("qty")),
                "price": matched_item.get("price"),
            }
            # Spec 019 / FR-07 — preserve the override metadata that
            # apply_manual_overrides_to_meals() attaches to dict
            # entries. Without this, the override's `source` and
            # `manualOverride` fields get dropped at this resolution
            # step, and the dashboard can't distinguish a
            # manual_override entry from a normal order match.
            if matched_item.get("source"):
                resolved_item["source"] = matched_item["source"]
            if matched_item.get("manualOverride"):
                resolved_item["manualOverride"] = matched_item["manualOverride"]
            if matched_item.get("use_by_warning") is not None:
                resolved_item["use_by_warning"] = matched_item["use_by_warning"]
            if matched_item.get("use_by_date"):
                resolved_item["use_by_date"] = matched_item["use_by_date"]
            if matched_item.get("shelf_life_days") is not None:
                resolved_item["shelf_life_days"] = matched_item["shelf_life_days"]
            product_metadata = matched_item.get("productMetadata") or matched_item.get("product_metadata")
            if isinstance(product_metadata, dict):
                resolved_item["productMetadata"] = product_metadata
            substituted_with = matched_item.get("substitutedWith") or matched_item.get("substituted_with") or matched_item.get("substitution")
            if substituted_with:
                resolved_item["substitutedWith"] = substituted_with
            resolved_matched_items.append(resolved_item)
            continue

        item_name = str(matched_item)
        matched_receipt_item = None
        for ri in raw_items:
            if ri.get('name') == item_name:
                matched_receipt_item = ri
                break

        if matched_receipt_item:
            resolved_matched_items.append({
                "ingredient": item_name,
                "name": matched_receipt_item.get("name", item_name),
                "quantity": matched_receipt_item.get("quantity", 1),
                "price": matched_receipt_item.get("price", 0),
            })
        else:
            # Older string-only cache entries had no receipt details available.
            resolved_matched_items.append({
                "ingredient": item_name,
                "name": item_name,
                "quantity": None,
                "price": None,
            })
    return resolved_matched_items


def fetch_manual_overrides(api_url: str, secret: str) -> List[Dict[str, Any]]:
    """Fetch durable manual override entries from the dashboard's /api/overrides.

    Spec 019 / FR-07 / T061 — the "I have this" button writes overrides to
    the Vercel blob via /api/overrides POST. This function reads them back
    so the Python sync can merge them into the coverage blobs.

    Returns an empty list on any failure (network error, auth failure, blob
    missing). The sync continues with no overrides applied, which is the
    correct graceful-degradation behaviour for a non-critical data source.
    """
    if not api_url or not secret:
        return []
    try:
        req = urllib.request.Request(
            api_url,
            headers={'x-dashboard-secret': secret},
            method='GET',
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode('utf-8')
        data = json.loads(body)
        overrides = data.get('overrides', [])
        return overrides if isinstance(overrides, list) else []
    except Exception as e:
        print(f"  ⚠ Failed to fetch manual overrides from {api_url}: {e}")
        return []


def apply_manual_overrides_to_meals(meals: List[Dict[str, Any]], overrides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge manual override entries into the meals list as matched items.

    Each override entry has the shape:
      { meal_date, meal_name, item_name, quantity, status, reason, ... }

    For each override, we find the meal in `meals` matching the
    (meal_date, meal_name) pair and add a synthetic matched item to its
    `matched_items` list with `source: 'manual_override'`. We don't
    remove anything from `missing_items` — that would require fuzzy
    matching and the dashboard UI surfaces overrides as a positive
    signal, not a removal.

    The dashboard's `MatchedItem` type expects
    `{ingredient, name, quantity, price}`. We populate those fields
    from the override entry plus any receipt match we can find.
    """
    if not overrides:
        return meals

    def _norm(s):
        return str(s or '').strip()

    # Index meals by (date, name) for fast lookup
    meal_index = {}
    for idx, m in enumerate(meals):
        key = (_norm(m.get('date')), _norm(m.get('content')))
        if key not in meal_index:
            meal_index[key] = idx

    # Build a quick lookup of receipt items by (name, ingredient) for price/qty
    # Note: we don't have raw_items here. The caller (build_dashboard_payload)
    # is responsible for resolving override item price/qty from raw_items
    # before passing the meal list to us. We accept the meal as already
    # having matched_items and just append a new override entry.
    for ov in overrides:
        ov_date = _norm(ov.get('meal_date'))
        ov_meal = _norm(ov.get('meal_name'))
        ov_item = _norm(ov.get('item_name'))
        if not ov_date or not ov_meal or not ov_item:
            continue
        key = (ov_date, ov_meal)
        if key not in meal_index:
            # Override is for a meal that's not in the current visible window
            # (out of range, completed, etc.). Skip; the next sync that
            # includes this meal will pick it up.
            continue
        meal = meals[meal_index[key]]
        existing = meal.get('matched_items', []) or []
        # De-dupe: if the same (item_name) already appears from a real
        # order match, don't add a duplicate manual_override entry.
        already_present = any(
            isinstance(it, dict)
            and (it.get('name') or it.get('ingredient') or it.get('item_name')) == ov_item
            for it in existing
        )
        if already_present:
            # Update the existing entry to mark it as a manual override
            # (so the dashboard surfaces the "We have it" badge).
            for it in existing:
                if isinstance(it, dict) and (it.get('name') or it.get('ingredient')) == ov_item:
                    it['source'] = 'manual_override'
                    it['manualOverride'] = {
                        'reason': ov.get('reason'),
                        'status': ov.get('status', 'covered'),
                        'updated_at': ov.get('updated_at'),
                    }
            meal['matched_items'] = existing
            continue
        # Append a fresh override entry
        existing.append({
            'name': ov_item,
            'ingredient': ov_item,
            'item_name': ov_item,
            'quantity': ov.get('quantity', 1),
            'price': None,
            'source': 'manual_override',
            'manualOverride': {
                'reason': ov.get('reason'),
                'status': ov.get('status', 'covered'),
                'updated_at': ov.get('updated_at'),
            },
        })
        meal['matched_items'] = existing
        # Bump the meal's coverage status if the override says "covered"
        # and the meal is currently missing. We do this conservatively:
        # only flip to "partial" (not "covered") because the override
        # doesn't assert full coverage, just that the item is on hand.
        if ov.get('status') == 'covered' and meal.get('status') == 'missing':
            meal['status'] = 'partial'
            meal['coverage_score'] = max(int(meal.get('coverage_score', 0) or 0), 50)
    return meals


def update_real_data_ts_from_cache(cache_data: Dict) -> bool:
    """Update lib/real-data.ts from dashboard cache data.
    
    This uses the pre-generated dashboard data which includes
    full coverage analysis with manual overrides and restaurant detection.
    """
    print("  Updating lib/real-data.ts from dashboard cache...")
    
    # Read current file as lines
    with open(REAL_DATA_PATH) as f:
        lines = f.readlines()
    
    # Extract meals and receipt from cache
    meals = cache_data.get("meals", [])
    receipt = cache_data.get("receipt", {})
    meals_check_summary = cache_data.get("meals_check_summary", {})
    
    # Find export line numbers
    receipt_start = None
    receipt_end = None
    meal_plan_start = None
    meal_plan_end = None
    coverage_start = None
    coverage_end = None
    
    for i, line in enumerate(lines):
        if 'export const realLatestOrder: CachedOrder' in line:
            receipt_start = i
        elif 'export const realMealPlan: Meal[]' in line:
            meal_plan_start = i
        elif 'export const realCoverage: MealCoverage[]' in line:
            coverage_start = i
    
    # Find end markers separately (only look for them after start lines)
    for i, line in enumerate(lines):
        stripped = line.strip()
        if receipt_start is not None and receipt_end is None and i > receipt_start and stripped == '};':
            receipt_end = i
        elif meal_plan_start is not None and meal_plan_end is None and i > meal_plan_start and stripped == '];':
            meal_plan_end = i
        elif coverage_start is not None and coverage_end is None and i > coverage_start and (stripped == '];' or stripped == '};'):
            coverage_end = i
            break
    
    # Update receipt data
    if receipt and receipt_start is not None and receipt_end is not None:
        # Filter items to only include fields that CachedOrder expects
        raw_items = receipt.get("items", [])
        raw_items = enrich_order_items_with_product_metadata(raw_items)
        receipt["items"] = raw_items
        top_level_substitutions = receipt.get("substitutions", []) or []
        substitutions_by_original = {}
        for sub in top_level_substitutions:
            original = sub.get("original") or sub.get("name")
            substitute = sub.get("substitutedWith") or sub.get("substituted_with") or sub.get("substitution")
            if isinstance(substitute, dict):
                substitute = substitute.get("name") or substitute.get("product") or substitute.get("title")
            if original and substitute:
                substitutions_by_original[str(original).lower()] = str(substitute)

        items = []
        for i in raw_items:
            item = {"name": i.get("name", ""), "quantity": i.get("quantity", 1), "price": i.get("price", 0)}
            # Spec 021 / FR-003 (revised): strip productBlobPath — real-data.ts
            # order items carry only tpnc (if available). The dashboard read
            # path resolves products/{tpnc}.json at runtime.
            tpnc = i.get("tpnc")
            if tpnc:
                item["tpnc"] = tpnc
            substituted_with = i.get("substitutedWith") or i.get("substituted_with") or i.get("substitution")
            if isinstance(substituted_with, dict):
                substituted_with = substituted_with.get("name") or substituted_with.get("product") or substituted_with.get("title")
            substituted_with = substituted_with or substitutions_by_original.get(str(item["name"]).lower())
            if substituted_with:
                item["substitutedWith"] = str(substituted_with)
            items.append(item)
        items_json = json.dumps(items, indent=4)
        order_total = receipt.get("total", 0)
        order_block = [
            f'export const realLatestOrder: CachedOrder = {{',
            f'  "email_id": "",',
            f'  "email_date": "",',
            f'  "delivery_date": "{receipt.get("delivery_date", "")}",',
            f'  "delivery_sort": "",',
            f'  "order_number": "{receipt.get("order_number", "")}",',
            f'  "order_total": {json.dumps(order_total)},',
            f'  "items": {items_json}',
            '};',
            '',
        ]
        lines = lines[:receipt_start] + [l + '\n' for l in order_block] + lines[receipt_end+1:]
        print(f"  ✓ Updated receipt data ({len(items)} items, total £{order_total:.2f})")

    # Update meals-check-aligned headline metrics
    if meals_check_summary:
        summary_json = json.dumps(meals_check_summary, indent=2)
        summary_block = [
            f'export const realMealsCheckSummary = {summary_json};',
            '',
        ]

        summary_start = None
        summary_end = None
        receipt_transform_idx = None
        for i, line in enumerate(lines):
            if 'export const realReceipt = transformCachedOrder(realLatestOrder);' in line:
                receipt_transform_idx = i
            elif 'export const realMealsCheckSummary =' in line:
                summary_start = i
            elif summary_start is not None and summary_end is None and line.strip() == '};':
                summary_end = i
                break

        if summary_start is not None and summary_end is not None:
            lines = lines[:summary_start] + [l + '\n' for l in summary_block] + lines[summary_end+1:]
        elif receipt_transform_idx is not None:
            insert_at = receipt_transform_idx + 1
            while insert_at < len(lines) and lines[insert_at].strip() == '':
                insert_at += 1
            lines = lines[:insert_at] + [l + '\n' for l in summary_block] + lines[insert_at:]
        print("  ✓ Updated meals check summary data")

        delivery_metadata = cache_data.get("delivery_metadata", [])
        delivery_block = [
            f'export const realDeliveryMetadata: GeneratedDeliveryMetadata[] = {json.dumps(delivery_metadata, indent=2)};',
            'export const realDeliveryWindows: DeliveryWindow[] = deliveryWindowsFromMetadata(realDeliveryMetadata);',
            '',
        ]
        delivery_start = None
        delivery_end = None
        for i, line in enumerate(lines):
            if 'export const realDeliveryMetadata:' in line:
                delivery_start = i
            elif delivery_start is not None and delivery_end is None and line.strip().startswith('export const realDeliveryWindows:'):
                delivery_end = i
                break
        if delivery_start is not None and delivery_end is not None:
            lines = lines[:delivery_start] + [l + '\n' for l in delivery_block] + lines[delivery_end+1:]
        elif summary_start is not None:
            insert_at = summary_end + 1 if summary_end is not None else summary_start + 1
            lines = lines[:insert_at] + [l + '\n' for l in ['', *delivery_block]] + lines[insert_at:]
        print(f"  ✓ Updated delivery metadata ({len(delivery_metadata)} events)")
    
    # Update meal plan and coverage
    if meals:
        # Get receipt items for matching
        raw_items = receipt.get("items", []) if receipt else []
        
        # Format meals for real-data.ts - convert cache format to Meal array
        meals_block = []
        coverage_block = []
        
        for m in meals:
            meal_entry = {
                "id": m.get("id", ""),
                "content": m.get("content", ""),
                "date": m.get("date", ""),
                "labels": m.get("labels", []),
                "section": m.get("section", "Planned"),
            }
            if m.get("meal_type"):
                meal_entry["meal_type"] = m["meal_type"]
            if m.get("is_completed"):
                meal_entry["is_completed"] = True
                if m.get("completed_at"):
                    meal_entry["completed_at"] = m["completed_at"]
            meals_block.append(meal_entry)
            
            # Use matched item names directly from cache (already resolved by meal_coverage)
            # No need to re-run find_receipt_item_match() - meal_coverage already did the resolution
            matched_ingredient_names = m.get("matched_items", [])
            resolved_matched_items = resolve_matched_items_for_dashboard(matched_ingredient_names, raw_items)
            
            # Build coverage entry with resolved items
            coverage_entry = {
                "meal": meal_entry,
                "status": m.get("status", "unknown"),
                "coverageScore": m.get("coverage_score", 0),
                "matchedItems": resolved_matched_items,
                "missingItems": m.get("missing_items", []),
                "missingExplanations": m.get("missing_explanations", []),
            }
            if m.get("notes"):
                coverage_entry["notes"] = m["notes"]
            coverage_block.append(coverage_entry)
        
        # Recalculate line indices after receipt update
        meal_plan_start = None
        meal_plan_end = None
        coverage_start = None
        coverage_end = None
        for i, line in enumerate(lines):
            if 'export const realMealPlan: Meal[]' in line:
                meal_plan_start = i
            elif meal_plan_start is not None and meal_plan_end is None and line.strip() == '];':
                meal_plan_end = i
            elif 'export const realCoverage: MealCoverage[]' in line:
                coverage_start = i
            elif coverage_start is not None and coverage_end is None and line.strip() == '];':
                coverage_end = i
        
        meals_json = json.dumps(meals_block, indent=2)
        meals_lines = [f'export const realMealPlan: Meal[] = {meals_json};', '']
        
        if meal_plan_start is not None and meal_plan_end is not None:
            lines = lines[:meal_plan_start] + [l + '\n' for l in meals_lines] + lines[meal_plan_end+1:]
            print(f"  ✓ Updated meal plan data ({len(meals)} meals)")
        
        # Recalculate indices again
        coverage_start = None
        coverage_end = None
        for i, line in enumerate(lines):
            if 'export const realCoverage: MealCoverage[]' in line:
                coverage_start = i
                # Check if this line contains `= [];` - single-line empty array format
                if '= [];' in line:
                    coverage_end = i
                    break
            elif coverage_start is not None and coverage_end is None:
                stripped = line.strip()
                if stripped == '];' or stripped == '};':
                    # End of array literal
                    coverage_end = i
                    break
        
        coverage_json = json.dumps(coverage_block, indent=2)
        coverage_lines = [f'export const realCoverage: MealCoverage[] = {coverage_json};', '']
        
        if coverage_start is not None and coverage_end is not None:
            lines = lines[:coverage_start] + [l + '\n' for l in coverage_lines] + lines[coverage_end+1:]
            print(f"  ✓ Updated coverage data ({len(coverage_block)} entries)")
    
    # Write back
    with open(REAL_DATA_PATH, 'w') as f:
        f.writelines(lines)
    
    print("  ✓ Saved changes to real-data.ts")
    return True


def update_real_data_ts(receipt_data: Dict, meal_plan_data: Dict) -> bool:
    """Update lib/real-data.ts with fresh data.
    
    DEPRECATED: This is the legacy path. Prefer update_real_data_ts_from_cache()
    which uses pre-generated dashboard data from meals check.
    """
    print("  Updating lib/real-data.ts...")
    
    # Read current file
    with open(REAL_DATA_PATH) as f:
        content = f.read()
    
    # Get the latest order with items
    order = get_latest_order(receipt_data)
    
    if order:
        items_json = json.dumps(order.get("items", []), indent=4)
        
        new_block = f'''export const realLatestOrder: CachedOrder = {{
  "email_id": "{order.get("email_id", "")}",
  "email_date": "{order.get("email_date", "")}",
  "delivery_date": "{order.get("delivery_date", "")}",
  "delivery_sort": "{order.get("delivery_sort", "")}",
  "order_number": "{order.get("order_number", "")}",
  "items": {items_json}
}};'''
        
        # Replace the old block using regex
        pattern = r'export const realLatestOrder: CachedOrder = \{[^}]*"items": \[.*?\]\s*\};'
        new_content = re.sub(pattern, new_block, content, flags=re.DOTALL)
        
        if new_content == content:
            # Try simpler pattern
            new_content = re.sub(
                r'export const realLatestOrder: CachedOrder = \{.*?\};',
                new_block,
                content,
                flags=re.DOTALL
            )
        
        if new_content != content:
            content = new_content
            print(f"  ✓ Updated receipt data ({len(order.get('items', []))} items)")
        else:
            print("  ⚠ Could not find realLatestOrder pattern")
    else:
        print("  ⚠ No order with items found in cache")
    
    # Update meal plan if available
    if meal_plan_data and "meals" in meal_plan_data:
        meals_json = json.dumps(meal_plan_data["meals"], indent=2)
        
        new_content = re.sub(
            r'export const realMealPlan: Meal\[\] = \[.*?\];',
            f'export const realMealPlan: Meal[] = {meals_json};',
            content,
            flags=re.DOTALL
        )
        
        if new_content != content:
            content = new_content
            print("  ✓ Updated meal plan data")
    
    # Write back
    with open(REAL_DATA_PATH, 'w') as f:
        f.write(content)
    
    print("  ✓ Saved changes to real-data.ts")
    return True


def build_dashboard() -> Tuple[bool, str]:
    """Build the Next.js dashboard."""
    print("  Building dashboard...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=DASHBOARD_PATH,
        capture_output=True,
        text=True,
        timeout=180
    )
    if result.returncode != 0:
        print("  ✗ Build failed")
        return False, result.stderr[-500:]
    print("  ✓ Build complete")
    return True, ""


def trigger_vercel_deploy() -> Tuple[bool, str]:
    """Trigger a production deployment via Vercel CLI."""
    print("  Running: npx vercel --prod --yes")
    try:
        result = subprocess.run(
            ["npx", "vercel", "--prod", "--yes"],
            cwd=DASHBOARD_PATH,
            capture_output=True,
            text=True,
            timeout=180,
            shell=False
        )
        if result.returncode == 0:
            output = result.stdout + result.stderr
            for line in output.split("\n"):
                if "Production:" in line or "meals-dashboard" in line:
                    print(f"  {line.strip()}")
            return True, ""
        else:
            return False, result.stderr[-300:] or result.stdout[-300:]
    except subprocess.TimeoutExpired:
        return False, "Deploy timed out after 180s"
    except Exception as e:
        return False, str(e)


def post_dashboard_data_to_api(payload: Dict[str, Any], api_url: str, secret: str, dry_run: bool = False) -> Tuple[bool, Dict[str, Any]]:
    """POST dashboard data to the dashboard's private API endpoint.

    When dry_run=True the request is sent to the split-layout endpoint with `?dryRun=1`.
    The server computes hashes and reports what would change, but performs no Blob writes.
    """
    if not api_url:
        return False, {"error": "DASHBOARD_DATA_API_URL not configured"}
    if not secret:
        return False, {"error": "DASHBOARD_DATA_SECRET not configured"}
    effective_url = api_url
    if dry_run:
        separator = '&' if '?' in api_url else '?'
        effective_url = f"{api_url}{separator}dryRun=1"

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        effective_url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'x-dashboard-secret': secret,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
            if resp.status in (200, 201):
                if dry_run:
                    print("  ✓ Dashboard split-layout dry-run accepted")
                else:
                    print("  ✓ Dashboard split-layout stored to Blob")
                return True, parsed
            return False, {"error": f"API returned {resp.status}", "body": body[:500]}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8') if e.fp else ''
        parsed = {}
        try:
            parsed = json.loads(body) if body else {}
        except Exception:
            parsed = {"body": body[:500]}
        if e.code == 401:
            return False, {"error": "Unauthorized (check DASHBOARD_DATA_SECRET)", **parsed}
        return False, {"error": f"HTTP {e.code}", **parsed}
    except Exception as e:
        return False, {"error": f"POST failed: {e}"}


def dashboard_products_api_url(api_url: str) -> str:
    if not api_url:
        return ''
    return api_url.rsplit('/', 1)[0] + '/dashboard-products-sync'


def publish_split_dashboard_payload(
    payload: Dict[str, Any],
    api_url: str,
    secret: str,
    dry_run: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """POST the main dashboard payload first, then the products payload."""
    main_payload = {k: v for k, v in payload.items() if k != 'products'}
    main_ok, main_response = post_dashboard_data_to_api(main_payload, api_url, secret, dry_run=dry_run)
    products = list(payload.get('products') or [])
    products_ok = True
    products_response: Dict[str, Any] = {}

    if main_ok and products:
        products_url = dashboard_products_api_url(api_url)
        products_payload = {
            'products': products,
            'mainManifestPath': main_response.get('manifestPath'),
        }
        products_ok, products_response = post_dashboard_data_to_api(
            products_payload,
            products_url,
            secret,
            dry_run=dry_run,
        )
        if not products_ok:
            print("  ⚠ Product publish failed after main dashboard publish")

    return {
        'main': {'ok': main_ok, 'response': main_response},
        'products': {'ok': products_ok, 'response': products_response},
    }


def compute_delivery_windows(delivery_metadata: list) -> list:
    """Compute DeliveryWindow entries from raw delivery metadata (shape matches TS DeliveryWindow)."""
    windows = []
    for event in (delivery_metadata or []):
        actual = event.get("actual_delivery_date")
        if not actual:
            continue
        usable = event.get("delivery_usable_date", actual)
        windows.append({
            "date": actual,
            "slot": event.get("slot", ""),
            "orderTotal": event.get("order_total", 0),
            "status": event.get("status", "scheduled"),
            "usableDate": usable,
            "summary": event.get("summary", f"Delivery {actual}"),
        })
    return windows


def build_dashboard_payload(
    cache_data: Dict,
    overrides: Optional[List[Dict[str, Any]]] = None,
    api_url: Optional[str] = None,
    api_secret: Optional[str] = None,
    max_history: int = MAX_HISTORICAL_ORDERS,
    no_history: bool = False,
    sidecar_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Build the split-layout dashboard payload for POSTing to /api/dashboard-sync.

    Output shape matches the new server-side route:
      {
        orders: [{...orderBlob, orderBlobPath}],
        coverage: [{...coverageBlob, coverageBlobPath}],
        summary: {...},
        deliveryWindows: [...],
        coverageWindow: ["YYYY-MM-DD", ...],
        products: [{...productBlob, productBlobPath}, ...]
      }

    Notes:
    - 016/017 in this turn only require the current latest receipt to be projected into
      one order blob. Historical-order backfill arrives naturally as future syncs post
      new order blobs; no migration script is bundled into this step.
    - Coverage is grouped by meal-date into one `coverage/{date}.json` blob per date.
    - The read path flattens these per-date coverage blobs back into the existing
      `DashboardData.coverage: MealCoverage[]` shape for the client.
    - Spec 021 / FR-003 — order items carry productBlobPath (not embedded productMetadata)
      so the dashboard read path loads product blobs on demand from Vercel Blob.

    `overrides` is the list of manual override entries (from /api/overrides)
    that should be merged into the meals as matched items. If None, no
    overrides are applied (the cache file path is used instead — kept for
    backwards compatibility with tests).

    `api_url` and `api_secret` are passed to `enrich_order_items_with_product_metadata`
    which uses them to write product blobs to Vercel Blob (spec 021 / FR-003).
    """
    meals = cache_data.get("meals", [])

    # Spec 019 / FR-07 / T061 — merge manual overrides into the meals
    # list before projecting into coverage blobs. The apply function
    # mutates the meals in-place and returns the same list.
    if overrides:
        meals = apply_manual_overrides_to_meals(meals, overrides)

    receipt = dict(cache_data.get("receipt", {}) or {})
    meals_check_summary = dict(cache_data.get("meals_check_summary", {}) or {})
    delivery_metadata = cache_data.get("delivery_metadata", []) or []

    # Spec 021 / FR-003: apply environment fallbacks so enrichment writes product
    # blobs to Vercel Blob even when called with no explicit api_url/api_secret.
    if not api_url:
        api_url = os.environ.get('DASHBOARD_DATA_API_URL', '') or 'https://meals-dashboard.vercel.app/api/dashboard-sync'
    if not api_secret:
        api_secret = os.environ.get('MEALS_DASHBOARD_DATA_SECRET', '')

    # Enrich receipt items with product metadata before sending.
    # FR-003/FR-012: enrichment sets productBlobPath (not productMetadata) on each item.
    # Product blobs are written to Vercel Blob via the API as a side-effect.
    raw_items = receipt.get("items", []) or []
    if raw_items:
        raw_items = enrich_order_items_with_product_metadata(
            raw_items,
            api_url=api_url,
            api_secret=api_secret,
        )
        receipt["items"] = raw_items

    # FR-003: collect product blobs from enriched items (deduped by tpnc).
    # Strip productMetadata from order items — only productBlobPath reference remains.
    products: Dict[str, Dict[str, Any]] = {}
    for item in raw_items:
        blob_path = item.get('productBlobPath')
        if blob_path:
            tpnc = blob_path.replace('products/', '').replace('.json', '')
            # Collect product blob content (everything except productBlobPath itself).
            product_entry = {k: v for k, v in item.items() if k != 'productBlobPath'}
            if tpnc not in products:
                products[tpnc] = {'productBlobPath': blob_path, **product_entry}
        # Always strip productMetadata from order items (FR-003/FR-004).
        # Spec 021 / FR-003 (revised): also strip productBlobPath — order items
        # carry only tpnc. The dashboard read path resolves products/{tpnc}.json.
        item.pop('productMetadata', None)
        item.pop('product_metadata', None)
        item.pop('productBlobPath', None)

    delivery_date = receipt.get("delivery_date") or meals_check_summary.get("delivery_date") or ""
    order_number = receipt.get("order_number") or "unknown-order"
    order_blob_path = f"orders/{delivery_date}/{order_number}.json" if delivery_date else f"orders/unknown/{order_number}.json"

    orders = []
    if receipt:
        # Spec 018 — order status tracking. The Python pipeline projects the
        # `status` field onto the receipt (see `write_dashboard_cache`); honour
        # that here so the OrderBlob gets the right value. Fall back to a
        # status derived from `email_type` for backwards compatibility with
        # older dashboard caches.
        receipt_email_type = receipt.get("email_type") or ""
        if receipt.get("status") in {"active", "cancelled", "superseded", "refunded"}:
            order_status = receipt["status"]
        elif receipt_email_type == "cancelled":
            order_status = "cancelled"
        elif receipt_email_type == "refund":
            order_status = "refunded"
        else:
            order_status = "active"

        orders.append({
            "orderNumber": order_number,
            "deliveryDate": delivery_date,
            "deliverySlot": receipt.get("delivery_slot", ""),
            "orderTotal": receipt.get("total", meals_check_summary.get("order_total", 0)),
            "items": raw_items,
            "substitutions": receipt.get("substitutions", []) or [],
            "unavailable": receipt.get("unavailable", []) or [],
            "shortLifeItems": receipt.get("short_life_items", []) or [],
            "status": order_status,
            "orderBlobPath": order_blob_path,
            # Spec 035 / FR-002 — orderId key used by the dashboard loader for
            # de-duplication and by ``assemble_orders`` for most-recent-wins.
            "orderId": order_number,
        })

        # Spec 035 / FR-002 / FR-008 — merge historical orders from the sidecar.
        # When ``no_history`` is set (debug / rollback), leave the orders list
        # as the single active receipt (legacy behaviour, FR-008).
        if not no_history and max_history >= 0:
            historical = load_historical_orders(cap=max_history, sidecar_path=sidecar_path)
            active_receipt = {
                "orderNumber": order_number,
                "orderId": order_number,
                "deliveryDate": delivery_date,
                "deliverySlot": receipt.get("delivery_slot", ""),
                "orderTotal": receipt.get("total", meals_check_summary.get("order_total", 0)),
                "items": raw_items,
                "substitutions": receipt.get("substitutions", []) or [],
                "unavailable": receipt.get("unavailable", []) or [],
                "shortLifeItems": receipt.get("short_life_items", []) or [],
                "status": order_status,
                "orderBlobPath": order_blob_path,
            }
            merged = assemble_orders(active_receipt, historical, cap=max_history)
            # Preserve the order already enriched by build_dashboard_payload
            # (products stripped, item enrichment applied) when active collides
            # with a historical entry; the pure helper would otherwise hand back
            # the un-enriched raw one. Most-recent-wins is still honored.
            merged_ids = {o.get("orderId") for o in merged}
            orders = merged
            # Re-apply enrichment strip for any historical entries (they
            # come from disk un-stripped is fine; the dashboard read path
            # treats them as opaque blobs). Cap at len(orders) already.

        if no_history:
            print("  ℹ history retention disabled (--no-history)")
        else:
            history_count = max(0, len(orders) - 1) if orders else 0
            active_id = orders[0]["orderId"] if orders else "<none>"
            print(f"  ℹ orders: published {len(orders)} (active: {active_id}, history: {history_count}, cap: {max_history})")

    grouped_by_date = {}
    for m in meals:
        meal_date = m.get("date", "")
        if not meal_date:
            continue
        grouped_by_date.setdefault(meal_date, []).append(m)

    coverage = []
    for meal_date in sorted(grouped_by_date.keys()):
        grouped_meals = []
        for m in grouped_by_date[meal_date]:
            meal_entry = {
                "id": m.get("id", ""),
                "content": m.get("content", ""),
                "date": meal_date,
                "labels": m.get("labels", []),
                "section": m.get("section", "Planned"),
            }
            if m.get("meal_type"):
                meal_entry["meal_type"] = m["meal_type"]
            if m.get("is_completed"):
                meal_entry["is_completed"] = True
                if m.get("completed_at"):
                    meal_entry["completed_at"] = m["completed_at"]

            matched_input = m.get("matched_items", [])
            resolved_matched = resolve_matched_items_for_dashboard(matched_input, raw_items or [])
            # Spec 019 / FR-04 — every matched item carries source + shelf-life defaults
            # so the dashboard read path can distinguish order / grocy / manual_override
            # sources and surface freshness warnings without re-deriving them.
            for item in resolved_matched:
                item.setdefault("source", "order")
                item.setdefault("use_by_warning", False)
            coverage_entry = {
                "meal": meal_entry,
                "status": m.get("status", "unknown"),
                "coverageScore": m.get("coverage_score", 0),
                "matchedItems": resolved_matched,
                "missingItems": m.get("missing_items", []),
                "missingExplanations": m.get("missing_explanations", []),
                # Spec 019 / FR-02 — coverage blob carries stale/staleReason; the
                # invalidation trigger (T020) sets stale=true transiently then
                # overwrites with fresh false once recalculation completes.
                "stale": False,
                "staleReason": None,
            }
            if m.get("notes"):
                coverage_entry["notes"] = m["notes"]
            grouped_meals.append(coverage_entry)

        coverage.append({
            "date": meal_date,
            "sourceOrderBlobPath": order_blob_path if orders else None,
            "meals": grouped_meals,
            "coverageBlobPath": f"coverage/{meal_date}.json",
        })

    delivery_windows = compute_delivery_windows(delivery_metadata)
    coverage_window = sorted(grouped_by_date.keys())

    # Timestamps for the dashboard footer:
    #   dataGeneratedAt — when the meals-check pipeline generated this data (from cache)
    #   uiUpdatedAt     — when the dashboard UI was last deployed (git HEAD commit time)
    data_generated_at = cache_data.get("generated_at", "")
    ui_updated_at = ""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ct"],
            capture_output=True, text=True,
            cwd=str(Path(__file__).parent.parent),
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            ts = int(result.stdout.strip())
            ui_updated_at = datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    except Exception:
        pass

    return {
        "orders": orders,
        "coverage": coverage,
        "summary": meals_check_summary,
        "deliveryWindows": delivery_windows,
        "coverageWindow": coverage_window,
        "dataGeneratedAt": data_generated_at,
        "uiUpdatedAt": ui_updated_at,
        # FR-003: product blobs written alongside the main sync payload.
        # Each product blob is written to Vercel Blob; only the reference (productBlobPath)
        # remains on each order item.
        "products": list(products.values()) if products else [],
    }


def build_arg_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser for ``sync-dashboard-data.py``.

    Extracted as a standalone function so tests (and other scripts) can introspect
    the CLI surface without spawning a subprocess (spec 035 / FR-003, FR-008).
    """
    parser = argparse.ArgumentParser(description="Sync dashboard data from Todoist and Tesco to Vercel Blob")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be posted without making changes")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetching, just use cached data")
    parser.add_argument("--message", "-m", help="Custom commit message (ignored)")
    parser.add_argument("--no-build", action="store_true", help="Skip build step")
    parser.add_argument("--force-deploy", action="store_true", help="Trigger Vercel deploy even on dry-run")
    # Spec 035 / FR-003 — cap on historical orders retained across syncs.
    # 0..MAX_HISTORICAL_ORDERS_UPPER inclusive (validated below).
    parser.add_argument("--max-history", type=int, default=MAX_HISTORICAL_ORDERS,
                        help=f"Cap on historical orders retained across syncs "
                             f"(default {MAX_HISTORICAL_ORDERS}, max {MAX_HISTORICAL_ORDERS_UPPER}).")
    # Spec 035 / FR-008 — disable history retention for this sync (debug / rollback).
    parser.add_argument("--no-history", action="store_true",
                        help="Skip history retention; publish only the active receipt.")
    return parser


def main():
    parser = build_arg_parser()
    args = parser.parse_args()

    # Spec 035 / FR-003 — cap validation.
    if args.max_history < 0 or args.max_history > MAX_HISTORICAL_ORDERS_UPPER:
        parser.error(f"--max-history must be 0..{MAX_HISTORICAL_ORDERS_UPPER} (got {args.max_history})")

    # Direct/manual syncs should behave like the canonical meals pipeline:
    # load ~/.hermes/.env before looking up the dashboard sync secret.
    load_dashboard_env()

    print("=" * 50)
    print("DASHBOARD DATA SYNC (Blob)")
    print("=" * 50)
    print()

    # Read dashboard cache from meals check
    dashboard_cache = read_dashboard_cache()

    if not dashboard_cache:
        print("[1] No dashboard cache found.")
        print("  Run meals-check first to generate the cache.")
        return 1

    print("[1] Found dashboard cache")
    print(f"  Cache generated: {dashboard_cache.get('generated_at', 'unknown')}")
    print(f"  Meals: {len(dashboard_cache.get('meals', []))}")
    print(f"  Receipt items: {len(dashboard_cache.get('receipt', {}).get('items', []))}")
    print()

    # Build payload
    print("[2] Building dashboard split-layout payload...")
    # Spec 019 / FR-07 / T061 — fetch durable manual overrides from the
    # dashboard's /api/overrides route (Vercel blob). The Python sync
    # merges them into the meals as matched items so the dashboard
    # shows the "✓ We have it" badge for items the user has asserted
    # coverage for via the "I have this" button.
    # Default to the production split-layout API for both overrides and sync.
    api_url = os.environ.get("DASHBOARD_DATA_API_URL", "") or "https://meals-dashboard.vercel.app/api/dashboard-sync"
    secret = os.environ.get("MEALS_DASHBOARD_DATA_SECRET", "")

    overrides_api_url = api_url.rsplit('/', 1)[0] + '/overrides' if api_url else ''
    overrides = fetch_manual_overrides(overrides_api_url, secret) if (overrides_api_url and secret) else []
    if overrides:
        print(f"  Manual overrides from blob: {len(overrides)}")

    # Spec 021 / FR-003: pass api_url and secret so product blobs are written to Vercel Blob.
    # Spec 035 / FR-003, FR-008: pass --max-history and --no-history through to the
    # builder so the assembled orders list includes the historical sidecar (or not).
    payload = build_dashboard_payload(
        dashboard_cache, overrides,
        api_url=api_url, api_secret=secret,
        max_history=args.max_history,
        no_history=args.no_history,
        sidecar_path=None,  # use the module-level default
    )
    print(f"  Order blobs: {len(payload['orders'])}")
    print(f"  Coverage blobs: {len(payload['coverage'])}")
    print(f"  Delivery windows: {len(payload['deliveryWindows'])}")
    print(f"  Coverage window dates: {len(payload['coverageWindow'])}")
    if payload.get('products'):
        print(f"  Product blobs: {len(payload['products'])}")
    print()

    # POST to dashboard API
    print("[3] Posting data to dashboard Blob API...")
    if not api_url:
        api_url = "https://meals-dashboard.vercel.app/api/dashboard-sync"
    publish_result = publish_split_dashboard_payload(payload, api_url, secret, dry_run=args.dry_run)
    if not publish_result['main']['ok']:
        response = publish_result['main']['response']
        print(f"  ✗ Failed to post data: {response.get('error', 'unknown error')}")
        detail = response.get('detail') or response.get('body')
        if detail:
            print(f"    {str(detail)[:300]}")
        return 1
    response = publish_result['main']['response']
    print(f"  Manifest path: {response.get('manifestPath', 'n/a')}")
    if 'written' in response or 'skipped' in response:
        print(f"  Written: {len(response.get('written', []))} | Skipped: {len(response.get('skipped', []))} | Total ops: {response.get('totalOps', 'n/a')}")
    product_response = publish_result['products']['response']
    if publish_result['products']['ok'] and product_response.get('productsManifestPath'):
        print(f"  Products manifest path: {product_response.get('productsManifestPath')}")
    elif not publish_result['products']['ok']:
        print(f"  ⚠ Product publish failed: {product_response.get('error', 'unknown error')}")
    print()

    # Spec 035 / FR-001 — persist merged historical orders to sidecar after publish.
    # Skip on --no-history (FR-008) and on --dry-run (no-op parity with spec 030).
    # The publish-succeeded-then-sidecar-fails case MUST NOT roll back the publish;
    # we log a warning instead so the cron still has a successful-sync marker.
    if not args.no_history and not args.dry_run and payload.get("orders"):
        try:
            merged_for_sidecar = [
                {
                    "orderId": o.get("orderId") or o.get("orderNumber"),
                    "deliveryDate": o.get("deliveryDate", ""),
                    "deliverySlot": o.get("deliverySlot", ""),
                    "status": o.get("status", "active"),
                    "items": o.get("items", []),
                    "orderBlobPath": o.get("orderBlobPath", ""),
                    "orderTotal": o.get("orderTotal", 0),
                    "substitutions": o.get("substitutions", []),
                    "unavailable": o.get("unavailable", []),
                    "shortLifeItems": o.get("shortLifeItems", []),
                }
                for o in payload["orders"]
                if (o.get("orderId") or o.get("orderNumber"))
            ]
            persist_historical_orders(merged_for_sidecar)
            print(f"  ✓ Persisted {len(merged_for_sidecar)} historical orders to sidecar")
        except Exception as exc:
            print(f"  ⚠ Sidecar persist failed: {exc.__class__.__name__}: {exc}; publish still succeeded")

    # Spec 028 / 2026-06-19 cleanup: the legacy `dashboard-data.json`
    # single-blob POST is removed. The dashboard page reads exclusively
    # via the spec 028 head()-based split-layout reader, so a parallel
    # legacy write was redundant (and hit the Vercel Blob Advanced
    # Operations quota on every sync).

    if args.dry_run:
        print("[dry-run] Split-layout API exercised successfully.")
        print("  No Blob writes, commits, pushes, or deployments were performed.")
        return 0

    # Build dashboard (unless skipped)
    if not args.no_build:
        print("[4] Building dashboard...")
        build_ok, build_error = build_dashboard()
        if not build_ok:
            print(f"  ✗ Build failed: {build_error}")
            return 1
        print()
    else:
        print("[4] Skipping build (--no-build)")
        print()

    # Trigger Vercel deploy
    print("[5] Triggering Vercel production deployment...")
    deploy_ok, deploy_error = trigger_vercel_deploy()
    if not deploy_ok:
        print(f"  ⚠ Deploy warning: {deploy_error}")
    else:
        print("  ✓ Deployment triggered")
    print()

    print("=" * 50)
    print("SYNC COMPLETE")
    print("=" * 50)
    return 0


if __name__ == "__main__":
    sys.exit(main())
