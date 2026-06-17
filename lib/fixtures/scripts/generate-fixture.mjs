#!/usr/bin/env node
/**
 * generate-fixture.mjs
 *
 * Build-time generator for the demo-mode fixture. Reads the committed
 * seed file at lib/fixtures/seed/dashboard-fixture-seed.yaml and emits
 * lib/fixtures/dashboard-fixture.json conforming to SplitLayoutPayload.
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
 * Build hook: `package.json` "prebuild" script
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SEED_PATH = join(REPO_ROOT, "lib", "fixtures", "seed", "dashboard-fixture-seed.yaml");
const OUT_PATH = join(REPO_ROOT, "lib", "fixtures", "dashboard-fixture.json");

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic, no system entropy.
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

const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

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
  // When a sequence item contains a nested mapping, we push a fresh
  // map onto the stack as the "current item" and switch back to map mode.
  const stack = [[-1, root, "map"]];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Skip blank lines and full-line comments.
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;

    // Strip trailing comments (only outside of quoted strings).
    const stripped = raw.replace(/\s+#.*$/, "");

    const indent = stripped.length - stripped.trimStart().length;
    const content = stripped.trim();

    // Pop stack until we find a frame with smaller indent. The top of
    // the stack is the *current* container; pop frames whose indent
    // is >= this line's indent.
    while (stack.length > 1 && stack[stack.length - 1][0] >= indent) {
      stack.pop();
    }
    const [frameIndent, parent, mode] = stack[stack.length - 1];

    if (content.startsWith("- ")) {
      // Sequence item. The current frame must be seq mode.
      const rest = content.slice(2).trim();
      if (mode !== "seq") {
        // The current frame is a map but this line starts a "- ". That
        // means the previous key: value line set up an empty mapping
        // where we actually need an array. Convert it.
        // (This happens for "meal_template:" followed by "- day_index: 0".)
        // Find the most recent key in the parent map and convert it to [].
        // The parent's parent is the previous stack frame; we need to
        // find the key that maps to parent. Easier: walk the stack
        // backwards to find a key whose value === parent and replace it.
        for (let j = stack.length - 2; j >= 0; j--) {
          const [pjIndent, pjContainer, pjMode] = stack[j];
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
        // Item is a nested mapping; the next line(s) build it.
        const item = {};
        arr.push(item);
        stack.push([indent, item, "map"]);
      } else if (rest.includes(":")) {
        // Inline mapping: "- key: value". Build an object and push
        // it onto the stack so subsequent lines at deeper indent
        // continue building it (just like the multi-line "- " case).
        const colonIdx = rest.indexOf(":");
        const k = rest.slice(0, colonIdx).trim();
        const v = rest.slice(colonIdx + 1).trim();
        const item = { [k]: parseScalar(v) };
        arr.push(item);
        stack.push([indent, item, "map"]);
      } else {
        // Scalar item.
        arr.push(parseScalar(rest));
      }
    } else {
      // key: value mapping. The current frame must be map mode.
      const colonIdx = content.indexOf(":");
      if (colonIdx === -1) continue;
      const key = content.slice(0, colonIdx).trim();
      const valueText = content.slice(colonIdx + 1).trim();

      if (valueText === "" || valueText === "|") {
        // Nested mapping follows.
        parent[key] = {};
        stack.push([indent, parent[key], "map"]);
      } else if (valueText.startsWith("[") && valueText.endsWith("]")) {
        // Inline sequence.
        parent[key] = parseInlineSequence(valueText);
      } else if (valueText.startsWith("{") && valueText.endsWith("}")) {
        // Inline flow mapping: {key: value, key: "value"}.
        parent[key] = parseInlineMapping(valueText);
      } else {
        parent[key] = parseScalar(valueText);
      }
    }
  }
  return root;
}

function parseScalar(text) {
  // Booleans and numbers.
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+$/.test(text)) return parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return parseFloat(text);
  // Strip surrounding quotes.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
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
  // Strip outer braces.
  const inner = text.slice(1, -1).trim();
  if (inner === "") return {};
  // Split on commas, but respect quoted strings (commas inside quotes
  // are not separators).
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
// Build the fixture.
// ---------------------------------------------------------------------------
function buildFixture(seed) {
  const { name_pool, location_pool, meal_template, products, delivery_template, coverage_window, sentinels } = seed;

  // Resolve coverage window dates.
  // We use a fixed reference date so the generated fixture is byte-identical
  // regardless of when the build runs. The "build time" is NOT a randomisation
  // input.
  const refDate = "2026-06-18"; // reference "today" for the fixture
  const coverageDates = [];
  for (let i = 0; i < coverage_window.duration_days; i++) {
    coverageDates.push(addDays(refDate, i));
  }
  const gapDay = coverageDates[3]; // day_index 3 is the gap day

  // Build the order (1 delivery, 1 day before the first meal).
  const deliveryDate = addDays(refDate, -1);
  const booker = `${pick(name_pool.first_names)} ${pick(name_pool.last_names)}`;
  const deliveredTo = pick(location_pool);
  const deliverySlot = pick(delivery_template.delivery_slots);
  const orderNumber = `${delivery_template.order_number_prefix}${Math.floor(rand() * 9000) + 1000}`;

  // Build items for the order. The order contains all items from all meals.
  const orderItems = [];
  let itemCounter = 0;
  for (const meal of meal_template) {
    for (const itemKey of meal.items) {
      const product = products[itemKey];
      if (!product) continue;
      orderItems.push({
        tpnc: `TF-${String(itemCounter).padStart(4, "0")}`,
        name: product.name,
        category: product.category,
        quantity: 1,
        unitPrice: Number((rand() * 5 + 1).toFixed(2)),
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        source: "tesco-fixture",
        lastFetched: sentinels.data_generated_at,
      });
      itemCounter++;
    }
  }

  // Build the order blob.
  const orderBlob = {
    orderNumber,
    deliveryDate,
    deliverySlot,
    deliveryLocation: deliveredTo,
    bookerName: booker,
    orderStatus: "active",
    status: "active",
    total: sentinels.order_total,
    items: orderItems,
    orderBlobPath: `orders/${deliveryDate}/${orderNumber}.json`,
  };

  // Build coverage blobs (one per day in the window).
  const coverage = [];
  for (let i = 0; i < coverageDates.length; i++) {
    const date = coverageDates[i];
    const isGapDay = date === gapDay;
    const mealsForDay = meal_template.filter((m) => coverageDates[m.day_index] === date);

    if (isGapDay || mealsForDay.length === 0) {
      // Gap day: no meals, 0% coverage.
      coverage.push({
        date,
        sourceOrderBlobPath: orderBlob.orderBlobPath,
        meals: [],
        coverageBlobPath: `coverage/${date}.json`,
      });
    } else {
      // Build coverage entries for each meal. Randomise coverage status.
      const mealEntries = mealsForDay.map((meal) => {
        const roll = rand();
        const status = roll < 0.5 ? "covered" : roll < 0.8 ? "partial" : "missing";
        return {
          mealType: meal.meal_type,
          status,
          covered: status === "covered" ? meal.items.length : status === "partial" ? Math.floor(meal.items.length / 2) : 0,
          total: meal.items.length,
          items: meal.items.map((itemKey) => {
            const product = products[itemKey];
            return { key: itemKey, name: product.name, category: product.category };
          }),
          sourceOrderBlobPath: orderBlob.orderBlobPath,
        };
      });
      coverage.push({
        date,
        sourceOrderBlobPath: orderBlob.orderBlobPath,
        meals: mealEntries,
        coverageBlobPath: `coverage/${date}.json`,
      });
    }
  }

  // Build summary.
  const totalMeals = coverage.reduce((acc, c) => acc + c.meals.length, 0);
  const coveredMeals = coverage.reduce((acc, c) => acc + c.meals.filter((m) => m.status === "covered").length, 0);
  const summary = {
    coverage_percentage: totalMeals > 0 ? Math.round((coveredMeals / totalMeals) * 100) : 0,
    covered: coveredMeals,
    missing: totalMeals - coveredMeals,
    total: totalMeals,
  };

  // Build products list (for the product-detail surface).
  const productsList = Object.entries(products).map(([key, product], idx) => ({
    productBlobPath: `products/TF-${String(idx).padStart(4, "0")}.json`,
    tpnc: `TF-${String(idx).padStart(4, "0")}`,
    name: product.name,
    category: product.category,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    source: "tesco-fixture",
    lastFetched: sentinels.data_generated_at,
  }));

  // Build the manifest.
  const manifest = {};
  for (const c of coverage) {
    manifest[c.coverageBlobPath] = `cov-${c.date}`;
  }
  manifest[orderBlob.orderBlobPath] = `ord-${orderBlob.orderNumber}`;
  for (const p of productsList) {
    manifest[p.productBlobPath] = `prod-${p.tpnc}`;
  }
  const summaryHash = `sum-${orderBlob.orderNumber}`;
  manifest[`meta/summary-${summaryHash}.json`] = summaryHash;

  // Build the SplitLayoutPayload.
  const fixture = {
    orders: [orderBlob],
    coverage,
    summary,
    deliveryWindows: [{ date: deliveryDate, slot: deliverySlot, location: deliveredTo }],
    coverageWindow: coverageDates,
    dataGeneratedAt: sentinels.data_generated_at,
    uiUpdatedAt: sentinels.data_generated_at,
    products: productsList,
  };

  return { fixture, manifest, summaryHash };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function main() {
  const seedText = readFileSync(SEED_PATH, "utf8");
  const seed = parseSeed(seedText);
  const { fixture } = buildFixture(seed);

  // Write with stable key ordering so the output is byte-identical
  // across runs. JSON.stringify with a replacer that sorts keys.
  const stableStringify = (obj) => {
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
  };

  writeFileSync(OUT_PATH, stableStringify(fixture), "utf8");
  console.log(`Wrote ${OUT_PATH} (${(JSON.stringify(fixture).length / 1024).toFixed(1)} KB)`);
}

main();
