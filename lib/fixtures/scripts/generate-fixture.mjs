#!/usr/bin/env node
/**
 * generate-fixture.mjs
 *
 * Build-time generator for the demo-mode fixture. Reads the committed
 * seed file at lib/fixtures/seed/dashboard-fixture-seed.yaml and emits
 * lib/fixtures/dashboard-fixture.json conforming to SplitLayoutPayload
 * (lib/dashboard-sync.ts).
 *
 * Deterministic: uses a seeded mulberry32 RNG (constant seed 42). Two
 * consecutive runs produce byte-identical output. This is verified by
 * a unit test.
 *
 * No new npm dependencies: parses the YAML with a hand-rolled minimal
 * parser suited to the seed file's structure. If the seed file grows
 * beyond the minimal parser's capabilities, replace with a proper
 * YAML library at that time.
 *
 * Run: `node lib/fixtures/scripts/generate-fixture.mjs`
 * Build hook: `package.json` "prebuild" script.
 *
 * Spec: 024-dashboard-static-fixture-mode-for-preview
 * Phase 4/11.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SEED_PATH = join(REPO_ROOT, "lib", "fixtures", "seed", "dashboard-fixture-seed.yaml");
const OUT_PATH = join(REPO_ROOT, "lib", "fixtures", "dashboard-fixture.json");

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic, no system entropy. NFR-009.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash (sha256 hex, lowercase). Used for the manifest
// hashes. We want byte-identical output across runs so we use the same
// hash strategy as the production blob-storage client (lib/blob-storage.ts).
function sha256Hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Hand-rolled minimal YAML parser for the seed file.
//
// The seed uses a constrained subset of YAML:
//   - top-level keys with `#` comments allowed
//   - nested mappings (2-space indent)
//   - sequence items prefixed with `- ` (2-space indent for nested)
//   - inline sequences: `[a, b, c]`
//   - string values: bare, single-quoted, or double-quoted
//   - one document; no `---`/`...` markers
//
// This parser is NOT a general YAML parser. If the seed grows beyond
// this subset, replace with a real library.
// ---------------------------------------------------------------------------
function parseSeed(text) {
  const lines = text.split("\n");
  const root = {};
  // Stack of [indent, container, mode]. mode tells us how to interpret
  // the next line at this indent:
  //   "map"  — the container is an object; next line is key: value
  //   "seq"  — the container is an array; next line is "- item"
  const stack = [[-1, root, "map"]];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;

    const stripped = raw.replace(/\s+#.*$/, "");

    const indent = stripped.length - stripped.trimStart().length;
    const content = stripped.trim();

    while (stack.length > 1 && stack[stack.length - 1][0] >= indent) {
      stack.pop();
    }
    const [frameIndent, parent, mode] = stack[stack.length - 1];

    if (content.startsWith("- ")) {
      const rest = content.slice(2).trim();
      if (mode !== "seq") {
        // Convert the parent's empty mapping at this key into an array.
        for (let j = stack.length - 2; j >= 0; j--) {
          const [, pjContainer, pjMode] = stack[j];
          if (pjMode === "map") {
            for (const [k, v] of Object.entries(pjContainer)) {
              if (v === parent) {
                pjContainer[k] = [];
                stack[stack.length - 1] = [frameIndent, pjContainer[k], "seq"];
                break;
              }
            }
            break;
          }
        }
      }
      const currentFrame = stack[stack.length - 1];
      const arr = currentFrame[1];

      if (rest === "" || rest.startsWith("#")) {
        const item = {};
        arr.push(item);
        stack.push([indent, item, "map"]);
      } else if (rest.includes(":")) {
        const colonIdx = rest.indexOf(":");
        const k = rest.slice(0, colonIdx).trim();
        const v = rest.slice(colonIdx + 1).trim();
        const item = { [k]: parseScalar(v) };
        arr.push(item);
        stack.push([indent, item, "map"]);
      } else {
        arr.push(parseScalar(rest));
      }
    } else {
      const colonIdx = content.indexOf(":");
      if (colonIdx === -1) continue;
      const key = content.slice(0, colonIdx).trim();
      const valueText = content.slice(colonIdx + 1).trim();

      if (valueText === "" || valueText === "|") {
        parent[key] = {};
        stack.push([indent, parent[key], "map"]);
      } else if (valueText.startsWith("[") && valueText.endsWith("]")) {
        parent[key] = parseInlineSequence(valueText);
      } else if (valueText.startsWith("{") && valueText.endsWith("}")) {
        parent[key] = parseInlineMapping(valueText);
      } else {
        parent[key] = parseScalar(valueText);
      }
    }
  }
  return root;
}

function parseScalar(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+$/.test(text)) return parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return parseFloat(text);
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineSequence(text) {
  const inner = text.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => parseScalar(s.trim()));
}

function parseInlineMapping(text) {
  const inner = text.slice(1, -1).trim();
  if (inner === "") return {};
  const parts = [];
  let current = "";
  let inQuote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      current += ch;
      if (ch === inQuote && inner[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
    } else if (ch === ",") {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const result = {};
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const k = part.slice(0, colonIdx).trim();
    const v = part.slice(colonIdx + 1).trim();
    result[k] = parseScalar(v);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Date helpers.
// ---------------------------------------------------------------------------
function isoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// ---------------------------------------------------------------------------
// Build the SplitLayoutPayload.
// ---------------------------------------------------------------------------
function buildFixture(seed) {
  const {
    name_pool,
    location_pool,
    meal_template,
    products,
    delivery_template,
    coverage_window,
    sentinels,
  } = seed;

  const rand = mulberry32(sentinels.rng_seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // Coverage window dates — fixed reference date, NOT "today" (NFR-008).
  const refDate = coverage_window.reference_date;
  const coverageDates = [];
  for (let i = 0; i < coverage_window.duration_days; i++) {
    coverageDates.push(addDays(refDate, i));
  }
  const gapDay = coverageDates[3]; // day_index 3 is the gap day

  // Order blob (1 delivery, day before the first meal).
  const deliveryDate = addDays(refDate, -1);
  const booker = `${pick(name_pool.first_names)} ${pick(name_pool.last_names)}`;
  const deliveredTo = pick(location_pool);
  const deliverySlot = pick(delivery_template.delivery_slots);
  const orderNumber = `${delivery_template.order_number_prefix}${Math.floor(rand() * 9000) + 1000}`;
  const orderBlobPath = `orders/${deliveryDate}/${orderNumber}.json`;

  // Build grocery items for the order. One item per meal ingredient, with
  // productBlobPath stamped for the dashboard read path to inject
  // productMetadata at request time.
  const orderItems = [];
  let itemCounter = 0;
  for (const meal of meal_template) {
    for (const itemKey of meal.items) {
      const product = products[itemKey];
      if (!product) continue;
      const unitPrice = Number((rand() * 4 + 1).toFixed(2));
      orderItems.push({
        name: product.name,
        category: product.category,
        quantity: 1,
        price: unitPrice,
        productBlobPath: `products/${product.tpnc}.json`,
      });
      itemCounter++;
    }
  }

  const orderBlob = {
    orderNumber,
    deliveryDate,
    deliverySlot,
    deliveryLocation: deliveredTo,
    bookerName: booker,
    orderStatus: "active",
    status: "active",
    orderTotal: sentinels.order_total,
    items: orderItems,
    substitutions: [],
    unavailable: [],
    shortLifeItems: [],
    orderBlobPath,
  };

  // Build coverage blobs (one per day in the window).
  const coverage = [];
  // Track which meals we assigned items to so we can build matchedItems.
  const mealsByDate = {};
  for (const m of meal_template) {
    const date = coverageDates[m.day_index];
    if (!mealsByDate[date]) mealsByDate[date] = [];
    mealsByDate[date].push(m);
  }

  for (const date of coverageDates) {
    const isGapDay = date === gapDay;
    const mealsForDay = mealsByDate[date] ?? [];

    if (isGapDay || mealsForDay.length === 0) {
      // Gap day: no meals, 0% coverage.
      coverage.push({
        date,
        sourceOrderBlobPath: orderBlobPath,
        meals: [],
        coverageBlobPath: `coverage/${date}.json`,
      });
    } else {
      const mealEntries = mealsForDay.map((m) => {
        const roll = rand();
        // 50% covered, 30% partial, 20% missing — exercises all 3 surfaces.
        const status = roll < 0.5 ? "covered" : roll < 0.8 ? "partial" : "missing";
        const total = m.items.length;
        const matchedCount =
          status === "covered"
            ? total
            : status === "partial"
              ? Math.max(1, Math.floor(total / 2))
              : 0;
        const matched = m.items.slice(0, matchedCount).map((itemKey) => {
          const product = products[itemKey];
          return {
            ingredient: product.name,
            name: product.name,
            quantity: 1,
            price: Number((rand() * 4 + 1).toFixed(2)),
            source: "order",
          };
        });
        const missing = m.items.slice(matchedCount).map((itemKey) => {
          const product = products[itemKey];
          return product.name;
        });
        const coverageScore =
          status === "covered"
            ? 100
            : status === "partial"
              ? Math.round((matchedCount / total) * 100)
              : 0;
        return {
          meal: {
            id: `tf-${m.day_index}-${m.meal_type}`,
            content: m.title,
            date,
            labels: ["adult"],
            section: "Planned",
            meal_type: m.meal_type,
          },
          status,
          coverageScore,
          matchedItems: matched,
          missingItems: missing,
          stale: false,
          staleReason: null,
        };
      });
      coverage.push({
        date,
        sourceOrderBlobPath: orderBlobPath,
        meals: mealEntries,
        coverageBlobPath: `coverage/${date}.json`,
      });
    }
  }

  // Build summary. Coverage percentage = % of meals with status "covered".
  const totalMeals = coverage.reduce((acc, c) => acc + c.meals.length, 0);
  const coveredMeals = coverage.reduce(
    (acc, c) => acc + c.meals.filter((m) => m.status === "covered").length,
    0
  );
  const partialMeals = coverage.reduce(
    (acc, c) => acc + c.meals.filter((m) => m.status === "partial").length,
    0
  );
  const missingMeals = coverage.reduce(
    (acc, c) => acc + c.meals.filter((m) => m.status === "missing").length,
    0
  );
  const coveragePct =
    totalMeals > 0 ? Math.round((coveredMeals / totalMeals) * 100) : 0;
  const summary = {
    coverage_percentage: coveragePct,
    covered: coveredMeals,
    missing: missingMeals,
    partial: partialMeals,
    meals_total: totalMeals,
    meals_covered: coveredMeals,
    order_total: sentinels.order_total,
    delivery_date: deliveryDate,
    dataGeneratedAt: sentinels.data_generated_at,
    uiUpdatedAt: sentinels.ui_updated_at ?? sentinels.data_generated_at,
  };

  // Build products list. Each product becomes a ProductBlob + a path entry.
  const productsList = Object.entries(products).map(([key, product]) => ({
    productBlobPath: `products/${product.tpnc}.json`,
    tpnc: product.tpnc,
    gtin: null,
    tpnb: null,
    title: product.name,
    description: `Synthetic fixture product: ${product.name}`,
    storage: "",
    preparation: "",
    ingredients: "",
    allergens: "",
    nutrition: "",
    brand: "Tesco",
    category: product.category,
    imageUrl: "",
    productUrl: "",
    source: "tesco-fixture",
    lastFetched: sentinels.data_generated_at,
  }));

  // Build the SplitLayoutPayload with stable ordering.
  const fixture = {
    orders: [orderBlob],
    coverage,
    summary,
    deliveryWindows: [
      {
        date: deliveryDate,
        slot: deliverySlot,
        orderTotal: sentinels.order_total,
        status: "scheduled",
      },
    ],
    coverageWindow: coverageDates,
    dataGeneratedAt: sentinels.data_generated_at,
    uiUpdatedAt: sentinels.ui_updated_at ?? sentinels.data_generated_at,
    products: productsList,
  };

  return fixture;
}

// ---------------------------------------------------------------------------
// Stable stringify (sort keys recursively) so consecutive runs produce
// byte-identical output (NFR-008).
// ---------------------------------------------------------------------------
function stableStringify(obj) {
  const seen = new WeakSet();
  const sortKeys = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) return value.map(sortKeys);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  };
  return JSON.stringify(sortKeys(obj), null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(SEED_PATH)) {
    console.error(`Seed file not found at ${SEED_PATH}`);
    process.exit(1);
  }
  const seedText = readFileSync(SEED_PATH, "utf8");
  const seed = parseSeed(seedText);
  const fixture = buildFixture(seed);
  const json = stableStringify(fixture);
  writeFileSync(OUT_PATH, json, "utf8");
  // Console.log is fine in Node CLI; ignore the lint hint.
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${OUT_PATH} (${(json.length / 1024).toFixed(1)} KB, sha256=${sha256Hex(json).slice(0, 12)}…)`
  );
}

main();