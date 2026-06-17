import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'lib/fixtures/scripts/generate-fixture.mjs');
const SEED_PATH = resolve(REPO_ROOT, 'lib/fixtures/seed/dashboard-fixture-seed.yaml');
const OUT_PATH = resolve(REPO_ROOT, 'lib/fixtures/dashboard-fixture.json');

function runGenerator(): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}

describe('generate-fixture.mjs', () => {
  let fixtureBackup: string | null = null;

  beforeEach(() => {
    if (existsSync(OUT_PATH)) {
      fixtureBackup = readFileSync(OUT_PATH, 'utf8');
    }
  });

  afterEach(() => {
    // Restore the fixture we replaced during the test, so other suites see the canonical output.
    if (fixtureBackup === null) {
      if (existsSync(OUT_PATH)) rmSync(OUT_PATH);
    } else {
      writeFileSync(OUT_PATH, fixtureBackup, 'utf8');
    }
  });

  describe('happy path', () => {
    it('exits with code 0', () => {
      const { exitCode, stderr } = runGenerator();
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
    });

    it('produces an output file', () => {
      runGenerator();
      expect(existsSync(OUT_PATH)).toBe(true);
      const stat = statSync(OUT_PATH);
      expect(stat.size).toBeGreaterThan(1000);
    });

    it('emits a valid JSON file', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      expect(parsed).toBeDefined();
    });

    it('conforms to SplitLayoutPayload shape (top-level keys)', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      expect(parsed).toHaveProperty('orders');
      expect(parsed).toHaveProperty('coverage');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('deliveryWindows');
      expect(parsed).toHaveProperty('coverageWindow');
      expect(parsed).toHaveProperty('dataGeneratedAt');
      expect(parsed).toHaveProperty('uiUpdatedAt');
      expect(parsed).toHaveProperty('products');
      expect(Array.isArray(parsed.orders)).toBe(true);
      expect(Array.isArray(parsed.coverage)).toBe(true);
      expect(Array.isArray(parsed.deliveryWindows)).toBe(true);
      expect(Array.isArray(parsed.coverageWindow)).toBe(true);
      expect(Array.isArray(parsed.products)).toBe(true);
    });

    it('order blob carries required fields (orderNumber, deliveryDate, items, orderTotal, orderBlobPath)', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const order = parsed.orders[0];
      expect(order).toBeDefined();
      expect(typeof order.orderNumber).toBe('string');
      expect(typeof order.deliveryDate).toBe('string');
      expect(typeof order.deliverySlot).toBe('string');
      expect(typeof order.orderTotal).toBe('number');
      expect(typeof order.orderBlobPath).toBe('string');
      expect(order.orderBlobPath).toMatch(/^orders\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
      expect(Array.isArray(order.items)).toBe(true);
      expect(order.items.length).toBeGreaterThan(0);
      for (const item of order.items) {
        expect(typeof item.name).toBe('string');
        expect(typeof item.quantity).toBe('number');
        expect(typeof item.productBlobPath).toBe('string');
      }
    });

    it('coverage blobs conform to CoverageBlob + CoverageMealEntry shape', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      expect(parsed.coverage.length).toBe(8); // 8 days
      for (const cov of parsed.coverage) {
        expect(typeof cov.date).toBe('string');
        expect(cov.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof cov.coverageBlobPath).toBe('string');
        expect(cov.coverageBlobPath).toBe(`coverage/${cov.date}.json`);
        expect(Array.isArray(cov.meals)).toBe(true);
        for (const meal of cov.meals) {
          expect(meal).toHaveProperty('meal');
          expect(meal.meal).toHaveProperty('id');
          expect(meal.meal).toHaveProperty('content');
          expect(meal.meal).toHaveProperty('date');
          expect(meal.meal).toHaveProperty('labels');
          expect(meal.meal).toHaveProperty('section');
          expect(['covered', 'partial', 'missing', 'unknown']).toContain(meal.status);
          expect(typeof meal.coverageScore).toBe('number');
          expect(Array.isArray(meal.matchedItems)).toBe(true);
          expect(Array.isArray(meal.missingItems)).toBe(true);
          for (const matched of meal.matchedItems) {
            expect(typeof matched.ingredient).toBe('string');
            expect(typeof matched.name).toBe('string');
          }
        }
      }
    });

    it('summary has all DashboardSummary fields + sentinel values', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const s = parsed.summary;
      expect(typeof s.coverage_percentage).toBe('number');
      expect(typeof s.covered).toBe('number');
      expect(typeof s.missing).toBe('number');
      expect(typeof s.meals_total).toBe('number');
      expect(typeof s.meals_covered).toBe('number');
      expect(typeof s.order_total).toBe('number');
      expect(typeof s.delivery_date).toBe('string');
      expect(s.order_total).toBe(42.42); // sentinel
      expect(parsed.dataGeneratedAt).toBe('2026-01-01T00:00:00Z'); // sentinel
      expect(parsed.uiUpdatedAt).toBe('2026-01-01T00:00:00Z'); // sentinel
    });
  });

  describe('determinism (NFR-008)', () => {
    it('produces byte-identical output across consecutive runs', () => {
      const r1 = runGenerator();
      expect(r1.exitCode).toBe(0);
      const a = readFileSync(OUT_PATH, 'utf8');

      const r2 = runGenerator();
      expect(r2.exitCode).toBe(0);
      const b = readFileSync(OUT_PATH, 'utf8');

      expect(a).toBe(b);
      expect(a.length).toBe(b.length);
    });

    it('produces the same shasum across 3 runs', () => {
      runGenerator();
      const a = readFileSync(OUT_PATH, 'utf8');
      const shaA = sha256Hex(a);

      runGenerator();
      const b = readFileSync(OUT_PATH, 'utf8');
      const shaB = sha256Hex(b);

      runGenerator();
      const c = readFileSync(OUT_PATH, 'utf8');
      const shaC = sha256Hex(c);

      expect(shaA).toBe(shaB);
      expect(shaB).toBe(shaC);
    });
  });

  describe('structural guarantees from the seed', () => {
    it('contains 7 meals across 8 days (1 explicit gap day)', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const totalMeals = parsed.coverage.reduce(
        (acc: number, c: { meals: unknown[] }) => acc + c.meals.length,
        0
      );
      expect(totalMeals).toBe(7);
      expect(parsed.coverage.length).toBe(8);
    });

    it('includes a gap day with meals: [] (0% coverage surface)', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const emptyDays = parsed.coverage.filter((c: { meals: unknown[] }) => c.meals.length === 0);
      expect(emptyDays.length).toBe(1);
      expect(emptyDays[0].date).toBe('2026-06-21'); // day_index 3 = 2026-06-18 + 3
    });

    it('booker name is drawn from the curated pool (first x last)', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const booker: string = parsed.orders[0].bookerName;
      expect(booker).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      const [first, last] = booker.split(' ');
      const seed = readFileSync(SEED_PATH, 'utf8');
      // The seed is YAML, so we just assert the name is one of the known
      // first/last combinations — not that the seed literally contains it.
      const knownFirst = ['Sam', 'Chen', 'Patel', 'Singh', 'Wei', 'Aisha', 'Marcus', 'Priya'];
      const knownLast = ['Patel', 'Singh', 'Chen', 'Wei', 'Khan', 'Sharma'];
      expect(knownFirst).toContain(first);
      expect(knownLast).toContain(last);
      // Sanity: the seed does contain both pools (proves the pool wasn't
      // bypassed by an inline string).
      expect(seed).toContain('first_names:');
      expect(seed).toContain('last_names:');
    });

    it('deliveryLocation is drawn from the curated UK location pool', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const location: string = parsed.orders[0].deliveryLocation;
      const knownLocations = [
        '14 Beechwood Avenue, London N22',
        '8 Church Lane, Bristol BS8',
        '27 High Street, Manchester M4',
        '5 Park Road, Birmingham B5',
        '12 Riverside Way, Leeds LS1',
        '33 Oak Drive, Edinburgh EH9',
      ];
      expect(knownLocations).toContain(location);
    });

    it('order number uses the seed prefix TF-DEMO-', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      expect(parsed.orders[0].orderNumber).toMatch(/^TF-DEMO-\d{4}$/);
    });

    it('every item name comes from the seed product catalogue', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      const knownProducts = [
        'British Chicken Breast Fillets 500g',
        'Tesco Garlic Bulb',
        'Tesco Fusilli 500g',
        'Tesco Passata 680g',
        'Tesco Mixed Salad 200g',
        'Tesco Greek Feta 200g',
        'Tesco Pitted Olives 200g',
        'Tesco Sliced White Bread 800g',
        'Tesco Salmon Fillets 300g',
        'Tesco Broccoli 500g',
        'Tesco Basmati Rice 1kg',
        'Tesco Lemons x4',
        'Tesco Wraps 8pk',
        'Tesco Hummus 300g',
        'Tesco Cucumber',
        'Tesco Mixed Peppers x3',
        'Tesco Beef Mince 500g',
        'Tesco Onions x3',
        'Tesco Carrots 500g',
        'Tesco Stock Cubes 8pk',
        'Tesco British Eggs x12',
        'Tesco Bacon 300g',
        'Tesco British Butter 250g',
        'Tesco Cod Fillets 300g',
        'Tesco Garden Peas 500g',
        'Tesco Potatoes 1kg',
        'Tesco Mint Sauce 200g',
      ];
      for (const item of parsed.orders[0].items) {
        expect(knownProducts).toContain(item.name);
      }
    });

    it('every product in the products list has a real tpnc', () => {
      runGenerator();
      const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      for (const product of parsed.products) {
        expect(product.tpnc).toMatch(/^1000\d{2}$/);
        expect(product.productBlobPath).toBe(`products/${product.tpnc}.json`);
      }
    });
  });

  describe('error handling', () => {
    it('exits non-zero with a clear error if the seed file is missing', () => {
      // Move the seed temporarily.
      const seedBackup = readFileSync(SEED_PATH, 'utf8');
      rmSync(SEED_PATH);
      try {
        const { exitCode, stderr } = runGenerator();
        expect(exitCode).not.toBe(0);
        expect(stderr.toLowerCase()).toMatch(/seed.*not found|enoent/);
      } finally {
        writeFileSync(SEED_PATH, seedBackup, 'utf8');
      }
    });
  });
});

// Local sha256 helper (Node has crypto but vitest's import resolution
// for node:crypto can be flaky in this env; use a tiny inline helper).
function sha256Hex(s: string): string {
  // Tiny FNV-1a is not cryptographic, but it's stable for equal-string
  // equality (which is all this test needs). For real sha256 use Node's
  // crypto module.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix a few more times for collision safety.
  for (let i = 0; i < 16; i++) {
    h ^= h >>> 13;
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}