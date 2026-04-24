# Meals Dashboard

A read-only Next.js dashboard for visualizing meal plan coverage and grocery matching.
Deployed at: https://meals-dashboard.vercel.app

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Meals Skill (skills/meals)                    │
│                                                                  │
│  /meals check ──► meal_coverage ──► data/dashboard_cache.json  │
│                      module                                      │
│                         │                                        │
│                         ▼                                        │
│              (sync script copies to dashboard)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Dashboard Repo (meals-dashboard)                    │
│                                                                  │
│  scripts/sync-dashboard-data.py                                 │
│         │                                                        │
│         ▼                                                        │
│  lib/real-data.ts ◄── Generated from dashboard_cache.json       │
│         │                                                        │
│         ▼                                                        │
│  Next.js Dashboard ──► Vercel Deploy                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **`/meals check` or `/meals plan`** runs on the meals skill
2. **`meal_coverage`** module performs coverage analysis
3. **`build_dashboard_data()`** generates `data/dashboard_cache.json`
4. **`sync-dashboard-data.py`** copies cache to `lib/real-data.ts`
5. **Vercel** deploys the updated dashboard

## Operational Invariants

These are easy to break and expensive to rediscover.

### 1. Dashboard headline and meal rows must agree

If the meal rows show a day as fully matched, the headline count must not silently undercount it.

**Important nuance:** a day can still render as `delivery` in the UI while also counting as a covered day in the headline if that day has covered meals.

### 2. `meals_check_summary` overrides must stay aligned with canonical state

The sync pipeline may override headline fields so the dashboard mirrors `/meals check`, but those overrides must still use canonical-state-compatible semantics.

Do **not** derive the headline from raw display symbols alone if canonical day state already knows whether the day is covered.

### 3. Delivery-day display semantics are not counting semantics

`delivery` is a display label.
It is **not** permission to exclude the day from `meals_covered` when meals on that day are covered.

### 4. Tesco email selection mistakes will surface here first

If the dashboard suddenly shows implausible totals or coverage, check the meals skill first for:

- inbox vs trash/bin search differences
- receipt vs confirmation email precedence
- subtotal vs final-total parsing mistakes

See also: `skills/meals/docs/MEALS_CHECK_DASHBOARD_LESSONS_2026-04-24.md`

## Shared Module: `meal_coverage`

The `meal_coverage` module (`skills/meals/scripts/meal_coverage/`) is the **single source of truth** for coverage analysis.

**Used by:**
- `/meals check` command
- `/meals plan` workflow
- Dashboard sync pipeline

**Key files:**
| File | Purpose |
|------|---------|
| `types.py` | Dataclasses: `CoverageStatus`, `MealState`, `DayState`, `MealsCheckState` |
| `matcher.py` | `match_groceries_to_meals()` — matches grocery items to meals |
| `state.py` | `build_coverage_state()` — builds canonical state |
| `dashboard.py` | `build_dashboard_data()` — generates dashboard JSON |

**Key principle:** The sync script (`sync-dashboard-data.py`) does **not** re-run matching. It formats the already-computed `meal_coverage` output. This ensures the dashboard shows identical coverage to `/meals check`.

## Dashboard Sync Pipeline

The sync script is located at `scripts/sync-dashboard-data.py`.

**Usage:**
```bash
# Full sync (fetch + analyze + build)
python3 scripts/sync-dashboard-data.py

# Use cached data only (skip fetch)
python3 scripts/sync-dashboard-data.py --skip-fetch

# Skip build step
python3 scripts/sync-dashboard-data.py --no-build

# Dry run
python3 scripts/sync-dashboard-data.py --dry-run
```

**GitHub Actions:** On merge to `main`, GitHub Actions automatically syncs and deploys.

## TypeScript Data Types

**`lib/meals-data.ts`** — Core interfaces:
```typescript
interface Meal {
  id: string;
  content: string;
  date: string;
  labels: string[];
  section: string;
  meal_type?: 'lunch' | 'dinner';
}

interface MatchedItem {
  ingredient: string;  // Original ingredient (e.g., "chicken")
  name: string;        // Resolved product name (e.g., "Tesco Large Chicken Fillet Pack")
  quantity: number | null;
  price: number | null;
}

interface MealCoverage {
  meal: Meal;
  status: 'covered' | 'partial' | 'missing' | 'unknown';
  coverageScore: number;
  matchedItems: MatchedItem[];
  missingItems: string[];
  notes?: string;
}

interface CoverageSummary {
  totalMeals: number;
  covered: number;
  partial: number;
  missing: number;
  unknown: number;
  coveragePercentage: number;  // Key: must match meal_coverage dashboard output
}
```

**`lib/real-data.ts`** — Generated from `meal_coverage` output:
```typescript
export const realLatestOrder: CachedOrder = { ... };
export const realMealPlan: Meal[] = [ ... ];
export const realCoverage: MealCoverage[] = [ ... ];
```

## Key Dependency: `coveragePercentage`

The dashboard expects `coverage_summary.coveragePercentage` (camelCase) from `meal_coverage.dashboard._build_coverage_summary()`. This must not be renamed without coordinating across both skill and dashboard.

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Lint
npm run lint
```

## Deployment

- **Repository:** https://github.com/dannytsang/meals-dashboard
- **Branch:** `main`
- **Auto-deploy:** On push to `main`, GitHub Actions runs sync + build + deploy
- **URL:** https://meals-dashboard.vercel.app

## File Structure

```
meals-dashboard/
├── app/
│   ├── page.tsx          # Main dashboard page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles + CSS variables for theming
├── components/
│   ├── coverage-card.tsx # Coverage overview with progress ring
│   ├── meal-list.tsx     # Meal plan list
│   ├── meal-calendar.tsx # Calendar view of meals
│   ├── delivery-card.tsx # Delivery info
│   ├── chart.tsx         # Coverage chart
│   └── ...
├── lib/
│   ├── config.ts         # Dashboard config
│   ├── meals-data.ts     # Data types
│   ├── real-data.ts      # Generated from meal_coverage output (DO NOT EDIT)
│   └── sync-meta.ts      # Last sync timestamp
├── scripts/
│   └── sync-dashboard-data.py  # Sync pipeline
└── README.md
```

## Iteration History

### Iteration 1 (Initial)
- Next.js + TypeScript + Tailwind CSS
- Mock data layer
- Coverage card, meal list, delivery card, chart components

### Iteration 2 (Real Data) — 2026-04-15
- Connected to `meal_coverage` module via sync pipeline
- `real-data.ts` generated from `dashboard_cache.json`
- Removed independent re-matching (sync uses `meal_coverage` output directly)

### Iteration 3+ (Planned)
- Filter meals by status (covered/partial/missing)
- Expand meal details to see ingredient breakdown
- Calendar view of meal plan