# Meals Dashboard

A read-only dashboard for visualizing meal plan coverage and grocery matching.

## Current State (Iteration 1)

### What's Built
- **Project Setup**: Next.js 15 + TypeScript + Tailwind CSS
- **Mock Data Layer**: TypeScript interfaces and mock data matching the meals skill structure
- **Dashboard Components**:
  - `CoverageCard`: Visual coverage overview with progress bars
  - `MealList`: Detailed meal plan with coverage status
  - `DeliveryCard`: Latest and upcoming delivery information
  - `Chart`: Coverage by day visualization

### Data Structures
The dashboard uses these core types (from `lib/meals-data.ts`):
- `Meal`: Todoist task representing a planned meal
- `TescoReceipt`: Parsed grocery receipt with items, substitutions, short-life items
- `MealCoverage`: Coverage analysis linking meals to grocery items
- `CoverageSummary`: Aggregated statistics

### Current Mock Data
- 6 planned meals across 5 days
- 1 delivered Tesco order (£57.43, 12 items)
- Coverage: 4 fully covered, 1 partial, 1 missing ingredients

## Next Iterations

### Iteration 2: Real Data Integration
Connect to meals skill scripts:
```bash
# Fetch meal plan from Todoist
python3 skills/meals/scripts/grocery/fetch-meal-plan.py --start-date 2026-04-12 --end-date 2026-04-19

# Parse latest Tesco receipt
python3 skills/meals/scripts/grocery/parse-tesco-receipt.py

# Match groceries to meals
python3 skills/meals/scripts/grocery/match-grocery-meals.py
```

Options:
1. **API Route**: Create Next.js API routes that shell out to Python scripts
2. **Build-time**: Fetch data at build time for static export
3. **Client-side**: Browser fetches from a separate data service

### Iteration 3: Interactivity
- Toggle between previous/next shop coverage
- Filter meals by status (covered/partial/missing)
- Expand meal details to see ingredient breakdown
- Manual coverage override for freezer/pantry items

### Iteration 4: Enhanced Visualizations
- Calendar view of meal plan
- Ingredient timeline (when items expire)
- Shopping list generator for missing items
- Historical coverage trends

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Output is in `dist/` for static hosting
```

## Deployment

The dashboard exports as static HTML and can be deployed to:
- Vercel
- GitHub Pages
- Netlify
- Any static host

## File Structure

```
meals-dashboard/
├── app/
│   ├── page.tsx          # Main dashboard page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── coverage-card.tsx # Coverage overview
│   ├── meal-list.tsx     # Meal plan list
│   ├── delivery-card.tsx # Delivery info
│   └── chart.tsx         # Coverage chart
├── lib/
│   ├── config.ts         # Dashboard config
│   └── meals-data.ts     # Data types and mock data
├── dist/                 # Build output
└── README.md
```
