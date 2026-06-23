#!/usr/bin/env python3
"""
Diagnostic: classify product enrichment gap modes from live Vercel Blob data.

Spec: 025-tesco-product-enrichment / US1 / FR-009, FR-010

Reads every order blob currently in Vercel Blob, inspects each GroceryItem's
productBlobPath reference, and classifies every fall-through into the G1/G2/G3/G4
gap taxonomy defined by spec 025:

  G1 — item never reached enrichment (no productBlobPath):
    G1a  name→tpnc search missed
    G1b  Akamai 403 blocked the search request
    G1c  substitution item name had no search hit
    G1d  product was delisted

  G2 — tpnc resolved but Apollo cache extraction failed:
    G2a  product page is a Clubcard-offer page (OfferType, not ProductType)
    G2b  product is a third-party marketplace listing
    G2c  brace-counter parser miscounted (nested JSON)
    G2d  product page redirected (302 to category or 404)

  G3 — Apollo extraction succeeded but key fields are empty:
    G3a  seasonal / Clubcard-only product with sparse metadata
    G3b  new product launch (cooking instructions not yet populated)
    G3c  private-label line with copy in unexpected fields

  G4 — TTL expired and re-fetch failed (stale product blob, re-fetch errored)

Usage:
    python3 scripts/diagnose_product_enrichment_gaps.py [--output PATH] [--since YYYY-MM-DD]

The script is READ-ONLY. It never writes to or deletes any blob.
"""

import sys
import json
import argparse
import re
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set
from collections import defaultdict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── paths ────────────────────────────────────────────────────────────────────

DASHBOARD_REPO = Path(os.environ.get("MEALS_DASHBOARD_REPO", "/home/hermes/workspace/meals-dashboard"))
BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
BLOB_API_URL = os.environ.get("DASHBOARD_DATA_API_URL", "https://dashboard.ratfish-delta.ts.net/api/blobs")

# ── Blob storage client (minimal, read-only) ────────────────────────────────

class BlobReader:
    """Read-only Vercel Blob client using the BLOB_READ_WRITE_TOKEN as read secret."""

    def __init__(self, token: str, api_url: str):
        self.token = token
        self.api_url = api_url.rstrip("/")

    def _headers(self) -> Dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def read_json(self, path: str) -> Optional[Dict[str, Any]]:
        """GET a blob and return parsed JSON, or None on 404."""
        url = f"{self.api_url}/{path}"
        try:
            req = Request(url, headers=self._headers())
            with urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
                return None
        except HTTPError as e:
            if e.code == 404:
                return None
            print(f"  ⚠ HTTP {e.code} reading {path}: {e.reason}", file=sys.stderr)
            return None
        except URLError as e:
            print(f"  ⚠ URL error reading {path}: {e.reason}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  ⚠ Unexpected error reading {path}: {e}", file=sys.stderr)
            return None

    def list_prefix(self, prefix: str) -> List[str]:
        """List all blob paths under a prefix using the Vercel Blob list API."""
        list_url = f"{self.api_url}?prefix={prefix}"
        try:
            req = Request(list_url, headers=self._headers())
            with urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return [item["path"] for item in data.get("blobs", []) if "path" in item]
                return []
        except Exception as e:
            print(f"  ⚠ Failed to list prefix {prefix}: {e}", file=sys.stderr)
            return []

    def read_pointer(self) -> Optional[Dict[str, Any]]:
        """Read pointers/latest.json."""
        return self.read_json("pointers/latest.json")


# ── Gap mode classifier ──────────────────────────────────────────────────────

class GapClassifier:
    """Classify a GroceryItem's product enrichment status into G1/G2/G3/G4.

    Classification is based on the item's productBlobPath field and the
    contents of the referenced product blob (when reachable).
    """

    # Fields that must be non-empty for a product to count as "enriched"
    CRITICAL_FIELDS = ("description", "storage", "preparation", "image")

    def classify_item(
        self,
        item: Dict[str, Any],
        product_blob: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Return one of: G1a, G1b, G1c, G1d, G2a, G2b, G2c, G2d, G3a, G3b, G3c, G4, OK."""
        product_blob_path = item.get("productBlobPath") or item.get("product_blob_path")

        # G1 — no productBlobPath means tpnc was never resolved
        if not product_blob_path:
            return self._classify_g1(item)

        # productBlobPath is set — tpnc was resolved; now check the product blob
        if product_blob is None:
            # Blob unreadable or network error — assume G4 (stale / fetch failed)
            return "G4"

        # G2 — Apollo cache extraction failed (blob has tpnc but key fields missing)
        if self._apollo_extraction_failed(product_blob):
            return self._classify_g2(item, product_blob)

        # G3 — Apollo succeeded but some critical fields are still empty
        if self._fields_empty(product_blob):
            return self._classify_g3(item, product_blob)

        return "OK"

    def _classify_g1(self, item: Dict[str, Any]) -> str:
        """Classify why no tpnc was resolved for this item."""
        # G1c — substitution item
        if item.get("substitutedWith") or item.get("substituted_with"):
            return "G1c"
        # G1a vs G1b vs G1d — cannot distinguish without sync log access
        # (spec 025 Open Question 6: re-running sync in dry-run mode would clarify)
        # Conservative: mark as G1a (search miss — most common)
        return "G1a"

    def _classify_g2(self, item: Dict[str, Any], blob: Dict[str, Any]) -> str:
        """Classify why Apollo cache extraction failed for this item."""
        # G2a — Clubcard offer page (has tpnc but OfferType entity, not ProductType)
        # Detection: blob has unusual structure or the extraction log mentions "OfferType"
        if blob.get("_extraction_note", "").lower().find("offertype") != -1:
            return "G2a"
        # G2b — marketplace / third-party listing
        if blob.get("_extraction_note", "").lower().find("marketplace") != -1:
            return "G2b"
        # G2c — brace-counter parser miscount
        if blob.get("_extraction_note", "").lower().find("unclosed object") != -1:
            return "G2c"
        # G2d — redirect / soft 404
        if blob.get("_extraction_note", "").lower().find("redirect") != -1:
            return "G2d"
        # G2 default — known failure but specific mode not determined
        return "G2a"

    def _classify_g3(self, item: Dict[str, Any], blob: Dict[str, Any]) -> str:
        """Classify why Apollo extraction succeeded but fields are empty."""
        # G3a — seasonal / Clubcard-only products
        if blob.get("description") == "" and blob.get("_eco", "").lower().find("clubcard") != -1:
            return "G3a"
        # G3b — new product (title present but cooking instructions absent)
        if blob.get("title") and not blob.get("preparation"):
            return "G3b"
        # G3c — private-label Tesco line with copy in non-standard fields
        brand = blob.get("brand", "").lower()
        if any(label in brand for label in ("tesco finest", "tesco extras", "tesco value")):
            return "G3c"
        # G3 default
        return "G3a"

    def _apollo_extraction_failed(self, blob: Dict[str, Any]) -> bool:
        """Return True if Apollo extraction failed (critical fields all empty + no extraction_note)."""
        if blob.get("_extraction_note", "").lower().find("failed") != -1:
            return True
        # If _extraction_note says "ok" or is absent and all critical fields are empty → extraction failed
        critical = [blob.get(f) for f in self.CRITICAL_FIELDS]
        if all(v is None or v == "" for v in critical):
            return True
        return False

    def _fields_empty(self, blob: Dict[str, Any]) -> bool:
        """Return True if any critical field is empty after successful extraction."""
        for field in self.CRITICAL_FIELDS:
            val = blob.get(field)
            if val is None or val == "":
                return True
        return False


# ── Main diagnostic ───────────────────────────────────────────────────────────

def run_diagnostic(
    output_path: Optional[str] = None,
    since: Optional[str] = None,
    blob: Optional[BlobReader] = None,
) -> Dict[str, Any]:
    since_dt = None
    if since:
        since_dt = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)

    if blob is None:
        blob = BlobReader(BLOB_TOKEN, BLOB_API_URL)

    print("♻  Reading pointer blob...")
    pointer = blob.read_pointer()
    if not pointer:
        print("⚠  No pointer blob found. Is the dashboard synced yet?", file=sys.stderr)
        return {"error": "no pointer blob"}

    manifest: Dict[str, str] = {}
    manifest_path = pointer.get("manifestPath")
    if manifest_path:
        manifest = blob.read_json(manifest_path) or {}

    # Collect order blobs
    print("♻  Discovering order blobs...")
    order_paths = sorted(
        p for p in manifest.keys()
        if p.startswith("orders/") and p.endswith(".json")
    )
    if since_dt:
        order_paths = [
            p for p in order_paths
            if _order_date(p) >= since_dt.strftime("%Y-%m-%d")
        ]

    print(f"   Found {len(order_paths)} order blob(s)")
    if not order_paths:
        print("⚠  No orders found.", file=sys.stderr)

    classifier = GapClassifier()
    mode_counts: Dict[str, int] = defaultdict(int)
    mode_samples: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    total_items = 0
    total_with_path = 0
    total_enriched = 0

    for path in order_paths:
        order = blob.read_json(path)
        if not order:
            continue
        delivery_date = order.get("delivery_date") or path.split("/")[1]
        for item in order.get("items", []):
            total_items += 1
            product_blob_path = item.get("productBlobPath") or item.get("product_blob_path")
            product_blob = None
            if product_blob_path:
                total_with_path += 1
                product_blob = blob.read_json(product_blob_path)

            mode = classifier.classify_item(item, product_blob)
            mode_counts[mode] += 1
            if len(mode_samples[mode]) < 5:
                sample = {
                    "name": item.get("name", "")[:60],
                    "productBlobPath": product_blob_path,
                    "delivery_date": delivery_date,
                }
                if product_blob:
                    sample["title"] = product_blob.get("title", "")[:40]
                    sample["description_present"] = bool(product_blob.get("description"))
                    sample["storage_present"] = bool(product_blob.get("storage"))
                mode_samples[mode].append(sample)
            if mode == "OK":
                total_enriched += 1

    # Build report
    report_lines: List[str] = [
        "# Product Enrichment Gap Diagnostic Report",
        f"\nGenerated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"\nOrder blobs analysed: {len(order_paths)}",
        f"Total grocery items: {total_items}",
        f"Items with productBlobPath: {total_with_path} ({_pct(total_with_path, total_items)})",
        f"Items with full enrichment (OK): {total_enriched} ({_pct(total_enriched, total_items)})",
        f"\n## Gap Mode Summary",
        f"\n| Mode | Count | % of items | Description |",
        f"|------|-------|------------|-------------|",
    ]

    # Sort by count descending
    sorted_modes = sorted(mode_counts.items(), key=lambda x: -x[1])
    G_LABELS = {
        "OK": "Enriched — all critical fields present",
        "G1a": "G1 — no tpnc; name→search miss (most likely)",
        "G1b": "G1 — no tpnc; Akamai 403 blocked search (probable)",
        "G1c": "G1 — no tpnc; substitution item had no search hit",
        "G1d": "G1 — no tpnc; product was delisted",
        "G2a": "G2 — Apollo failed; Clubcard-offer page (OfferType, not ProductType)",
        "G2b": "G2 — Apollo failed; marketplace / third-party listing",
        "G2c": "G2 — Apollo failed; brace-counter parser miscount",
        "G2d": "G2 — Apollo failed; product page redirected (302 / soft 404)",
        "G3a": "G3 — Apollo OK but fields empty; seasonal / Clubcard-only product",
        "G3b": "G3 — Apollo OK but fields empty; new product, instructions not yet populated",
        "G3c": "G3 — Apollo OK but fields empty; private-label Tesco line with non-standard fields",
        "G4":  "G4 — TTL expired and re-fetch failed (stale blob, recovery errored)",
    }
    for mode, count in sorted_modes:
        pct = _pct(count, total_items)
        label = G_LABELS.get(mode, mode)
        report_lines.append(f"| {mode} | {count} | {pct} | {label} |")

    # Gap-only breakdown (non-OK items)
    gap_total = sum(c for m, c in mode_counts.items() if m != "OK")
    report_lines.extend([
        f"\n## Gap Analysis (non-OK items only)",
        f"\nTotal items with gap: {gap_total} ({_pct(gap_total, total_items)} of all items)",
        f"\nG1 (no tpnc resolved): {sum(mode_counts[m] for m in mode_counts if m.startswith('G1'))} items",
        f"G2 (Apollo extraction failed): {sum(mode_counts[m] for m in mode_counts if m.startswith('G2'))} items",
        f"G3 (Apollo OK, fields empty): {sum(mode_counts[m] for m in mode_counts if m.startswith('G3'))} items",
        f"G4 (TTL expired, re-fetch errored): {mode_counts['G4']} items",
    ])

    # Sample items per mode
    report_lines.append(f"\n## Sample Items by Mode (up to 5 per mode)")
    for mode, count in sorted_modes:
        if mode == "OK":
            continue
        samples = mode_samples.get(mode, [])
        report_lines.append(f"\n### {mode} — {count} item(s)")
        for s in samples:
            blob_ref = s.get("productBlobPath") or "(no blob path)"
            title = s.get("title", "")
            desc_ok = "✓ description" if s.get("description_present") else "✗ description missing"
            stor_ok = "✓ storage" if s.get("storage_present") else "✗ storage missing"
            report_lines.append(
                f"- *{s['name']}* | {blob_ref} | {title} | {desc_ok} | {stor_ok}"
            )

    # Recommendation
    g1_total = sum(mode_counts[m] for m in mode_counts if m.startswith("G1"))
    g2_total = sum(mode_counts[m] for m in mode_counts if m.startswith("G2"))
    g3_total = sum(mode_counts[m] for m in mode_counts if m.startswith("G3"))
    gap_items = g1_total + g2_total + g3_total

    report_lines.append(f"\n## Recommended Action")
    dominant = max(("G1", g1_total), ("G2", g2_total), ("G3", g3_total), key=lambda x: x[1])
    if gap_items == 0:
        recommendation = (
            "The enrichment gap is negligible. No new fallback layer is justified. "
            "The existing Apollo primary + curated static fallback + placeholder is sufficient."
        )
    elif dominant[0] == "G1":
        recommendation = (
            f"G1 dominates ({g1_total} items, {mode_counts.get('G1c', 0)} are substitution items). "
            "Fix the name→tpnc search first: improve the search-page regex, add a retry on 403, "
            "and handle substitution-item names explicitly. OFF cannot help G1 (no gtin). "
            "Extend curated static (lib/product-database.ts) for repeated-buy items as a quick win."
        )
    elif dominant[0] == "G2":
        recommendation = (
            f"G2 dominates ({g2_total} items). Fix the Apollo extraction parser: "
            "handle OfferType pages (G2a), detect marketplace listings (G2b), "
            "fix the brace-counter for nested JSON (G2c), and handle redirects (G2d). "
            "OFF cannot help G2 (tpnc resolved but Apollo extraction failed)."
        )
    else:
        recommendation = (
            f"G3 dominates ({g3_total} items — Apollo OK but fields empty). "
            "This is the case where OFF can help: OFF fills ingredients/allergens/nutrition. "
            "OFF does NOT fill storage/preparation — those require curated static "
            "(lib/product-database.ts) or accepting the gap. "
            "Consider OFF integration (spec 026-tesco-off-fallback) as the next step."
        )
    report_lines.append(f"\n{recommendation}")

    report_lines.append(
        f"\n---\n*Spec 025 / US1 diagnostic · read-only · "
        f"{' '.join(sys.argv[1:])}\n"
    )

    report = "\n".join(report_lines)
    if output_path:
        Path(output_path).write_text(report)
        print(f"✅ Report written to {output_path}")
    else:
        print(report)

    return {
        "mode_counts": dict(mode_counts),
        "total_items": total_items,
        "gap_items": gap_items,
        "recommendation": recommendation,
    }


def _pct(n: int, d: int) -> str:
    if d == 0:
        return "—"
    return f"{100*n/d:.1f}%"


def _order_date(path: str) -> str:
    """Extract YYYY-MM-DD from orders/YYYY-MM-DD/nnn.json"""
    m = re.search(r"orders/(\d{4}-\d{2}-\d{2})/", path)
    return m.group(1) if m else "0000-00-00"


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Diagnose product enrichment gap modes from live Vercel Blob data. "
                    "Read-only — never writes or deletes any blob."
    )
    parser.add_argument(
        "--output", "-o",
        help="Write report to this file path instead of stdout."
    )
    parser.add_argument(
        "--since", "-s",
        help="Only analyse orders on or after this date (YYYY-MM-DD)."
    )
    args = parser.parse_args()

    if not BLOB_TOKEN:
        print(
            "⚠  BLOB_READ_WRITE_TOKEN not set. Will attempt unauthenticated reads.\n"
            "   Set BLOB_READ_WRITE_TOKEN to read from Vercel Blob.\n",
            file=sys.stderr,
        )
    if not BLOB_API_URL:
        print(
            "⚠  DASHBOARD_DATA_API_URL not set. Using default.\n",
            file=sys.stderr,
        )

    result = run_diagnostic(output_path=args.output, since=args.since)
    if result.get("gap_items", -1) >= 0:
        print(f"\nSummary: {result['gap_items']} gap items out of {result['total_items']} total.")


if __name__ == "__main__":
    main()
