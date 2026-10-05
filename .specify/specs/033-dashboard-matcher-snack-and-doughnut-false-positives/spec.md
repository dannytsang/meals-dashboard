---
name: dashboard-matcher-snack-and-doughnut-false-positives
description: "Stop Tesco crisp, chocolate, doughnut and similar snack/confectionery products from being matched as meal components for everyday (non-roast) meals such as mash, wedges, onion rings and jacket potato."
---

# Feature Specification: Dashboard Matcher Snack and Confectionery False Positives

Feature ID: `033-dashboard-matcher-snack-and-doughnut-false-positives`

Feature Name: Dashboard Matcher Snack and Confectionery False Positives

Target Skill: `data-science/meals-check`

Created: 2026-06-29

Status: Final

Change history: CHANGELOG.md

## Background

Spec 011 (Dashboard Meal Card Matcher Accuracy) closed several false-positive classes for roast-dinner protein and roast-potato contexts. The current `tesco_matcher.py` pipeline still produces wrong matched items for **everyday (non-roast) meals** when the Tesco order contains savoury snacks (crisps), confectionery (doughnuts), or snack-flavour descriptors that incidentally contain meal-component words (e.g. `Sour Cream & Onion` for `onion`).

Danny observed on 2026-06-29 that the live `dashboard_cache.json` (delivery 2026-07-01) shows four meals with crisp/crisps/doughnut false positives:

| Meal | Cache status | Wrongly matched items |
|---|---|---|
| Cheesy mash potato (Ashlee) | `covered` (100) | `Popchips Sour Cream & Onion Multipack Crisps` |
| Sea bass, onion rings, wedges | `covered` (100) | `Popchips Sour Cream & Onion Multipack Crisps`, `Pringles Sour Cream & Onion Sharing Crisps`, `Tesco White Iced Ring Doughnuts 4 Pack` |
| Jacket potato / garlic bread | `covered` (100) | `Popchips Sour Cream & Onion Multipack Crisps` |
| Chicken and waffle fries, veg | `partial` (50) | (none — but tangentially affected) |

The root cause is two interacting gaps in `tesco_matcher.py`:

1. **`is_drink_snack()` uses exact-word marker matching against a mostly-singular marker set** (`tesco_matcher.py:267-271`). Markers such as `crisp`, `pringle`, `wafer`, `biscuit`, `cake`, `popcorn` are stored in singular form while real product names are almost always plural (`crisps`, `pringles`, `biscuits`). The exact-word check (`marker in words`) returns False for plural product words, so crisp/crisps-style snacks flow past the snack guard into raw-ingredient Tier 2 matching.
2. **The Tier 2 protein-bonus path (lines 694–710) treats `potato` as a protein family** and awards `PROTEIN_MATCH_BONUS` (0.75) to any item whose `protein_type` equals the meal's protein type. For `potato`-type meals (mash, wedges, jacket potato, etc.) with no animal-protein conflict, **any item whose `protein_type` is `potato` (which today includes items the matcher decides have *no* explicit protein)** slips past line 662's animal-protein guard and reaches the protein-bonus line, where the bonus is granted because `item_protein == meal_type` (both `potato`).

A third secondary gap contributes to the doughnut case: **`doughnut` is not in `_DRINK_SNACK_MARKER_WORDS`** at all. Iced Ring Doughnuts reach Tier 2 even when they have no crisp marker, and there `substring_hit = item_satisfies_meal_component(item_name, "rings", meal_comps)` matches because `item_satisfies_meal_component` allows the snack word `rings` (a meal word) to be substring-matched onto the dessert.

These are all *pipeline* matching-accuracy problems, not dashboard UI problems. The dashboard renders whatever the pipeline produces.

This spec is **distinct from spec 011**. Spec 011's FR-002 (no chips/skins/noodles via substring or fuzzy) was scoped to the roast-dinner false-positive class and its implementation in `is_roast_potato_false_positive` (line 292-312) covers `potato skins`, `potato chips`, and Calbee — it does **not** cover the everyday-meal case (mash, wedges, jacket potato, onion rings) where the snack slips past the *snack guard* rather than the *roast-potato guard*. The constitution rule "Future behaviour changes should use new numbered specs rather than expanding an existing baseline" (constitution.md line 44) confirms the new-spec approach.

**Hard constraints** (from prior Danny preferences, codified here for the coder handoff):

- Do not regress any matcher test that currently passes in `test_tesco_matcher.py`.
- Do not change the Tier 1 ready-made / Tier 2 raw-ingredient split; only the guard predicates and the protein-bonus eligibility check need adjustment.
- Crisps, doughnuts and similar snacks MUST still be excluded when they appear on a *legitimate* snack meal (e.g. `Pizza (Leo)` after-school snack context). The fix is about format-detection, not blanket-deny of snack products.
- Cookie/cake/biscuit/waffle-iced products that genuinely could substitute for a dessert meal component (e.g. a `Cookies and cream` dessert meal) MUST still match.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Everyday meal cards no longer match snack/confectionery products (Priority: P1)

As Danny, I want everyday meal cards (mash, wedges, jacket potato, onion-rings, garlic bread, etc.) to show only **real grocery matches** — never crisps, chocolate, doughnuts or other snack/confectionery items — so that the dashboard reflects what my family can actually cook and eat from the Tesco delivery.

**Why this priority**: A `covered (100%)` card built from potato wedges + a packet of crisps is worse than no information. It tells Danny "we have everything" when in fact the mash meal has no potato-component match for Ashlee's portion and the onion-rings meal has no fish (Sea bass). Trust in the dashboard erodes every time a card lies.

**Independent Test**: Run the matcher in isolation against four fixture meals with the same snack/confectionery products as the live cache, then verify the four meals above match the new acceptance scenarios. The live-cache regeneration (`tesco_meal_check.py --days 30 --output both`) is the production-deploy verification step, but the matcher can be tested without it.

**Acceptance Scenarios**:

1. Given the meal `Cheesy mash potato (Ashlee)` and items `[Tesco Spicy Potato Wedges 750G, † Popchips Sour Cream & Onion Multipack Crisps 5x17g, Tesco Mango 450G]`, When the matcher evaluates each item, Then `Tesco Spicy Potato Wedges 750G` matches (potato side covers the mash component) and `† Popchips Sour Cream & Onion Multipack Crisps 5x17g` does NOT match (savoury crisp, not a mash ingredient).
2. Given the meal `Sea bass, onion rings, wedges` and items `[Tesco Spicy Potato Wedges 750G, Tesco Beer Battered Onion Rings 300G, † Popchips Sour Cream & Onion Multipack Crisps 5x17g, † Pringles Sour Cream & Onion Sharing Crisps 185g, Tesco White Iced Ring Doughnuts 4 Pack, Tesco Sea Bass Fillets 200G]`, When the matcher evaluates each item, Then the wedges, onion rings and sea bass match; Popchips, Pringles and Iced Ring Doughnuts do NOT match.
3. Given the meal `Jacket potato / garlic bread`, When the matcher evaluates `† Popchips Sour Cream & Onion Multipack Crisps 5x17g`, Then it does NOT match — even though the meal has a `potato`-type component, crisps do not satisfy jacket potato.
4. Given the corrected matcher, When `tesco_meal_check.py --days 30 --output both` runs against the live 2026-07-01 delivery, Then `Cheesy mash potato (Ashlee)` is `partial` (potato wedges cover mash) with non-empty `missing_items`, and `Sea bass, onion rings, wedges` is `partial` with sea bass + onion rings + wedges matched but doughnuts/crisps excluded.
5. Given the snack guard is now format-aware, When the matcher evaluates plural snack words (`crisps`, `pringles`, `biscuits`, `cakes`, `wafers`, `chocolates`), Then all are excluded from raw-ingredient matching.
6. Given the snack guard is now format-aware, When the matcher evaluates missing-marker confectionery products (`doughnut`/`doughnuts`, `icing`/`iced`, `cookie`/`cookies`), Then these are excluded from raw-ingredient matching even when their names incidentally contain meal-component words (`rings`, `cream`, `sour`).
7. Given a legimate dessert-component meal such as `Cookies and cream`, When the matcher evaluates a `Tesco Chocolate Chip Cookies 200G` item, Then it MAY still match — the snack guard excludes crisps from `mash`/`wedges`, but cookies can still match `cookies and cream`. (Negative test — confirms the guard is format-aware, not blanket-deny.)
8. Given the live 2026-07-01 cache, When the Vercel dashboard renders the four meals above, Then the meal cards show only genuine grocery matches and `coverage_score` reflects only genuine matches (not 100% for crisp-tainted meals).

### Edge Cases

- `Popchips` is a brand-name product that contains the word `chips` (singular form, in the marker set as `chips` is present in `_PREPARED_POTATO_SIDE_WORDS` but NOT in `_DRINK_SNACK_MARKER_WORDS`). The fix must catch the *crisps* format, not require `chips` to be in `_DRINK_SNACK_MARKER_WORDS`.
- Some multi-pack products use `Multipack` as a noun; `multipack` itself is not a snack marker. The fix must not false-positive on `multipack`.
- Tesco order-item names frequently carry `Substitutions: On` as a metadata suffix. The matcher already strips numeric weight suffixes via `_WEIGHT_SUFFIX` but leaves the `Substitutions: On` text in the normalised string. The fix must not regress on these.
- The protein-bonus eligibility check must still reward correct matches like `Tesco Maris Piper Potatoes 2Kg` for a `Roast potatoes` meal (animal-protein guard is `pork`/`chicken`/etc.; `potato` is the meal's non-animal protein type, so the bonus should still fire for actual potato groceries).
- `Popchips`, `Pringles`, `Walkers`, `McCoy`, `Doritos`, `Tyrrells`, `Marmite`, `Butterkist`, `Jaffa`, `Hula` are all known snack-brand fragments; the marker set already lists some (`popcorn`, `crisp`, `pringle`, `walkers`, `mccoy`, `butterkist`, `marmite`, `jaffa`, `hula`) but mostly singular. Pluralising the matching is one path; an alternative is to add plural variants. The fix should choose the cleaner of the two.

## Functional Requirements

- **FR-001**: `is_drink_snack()` in `tesco_matcher.py` MUST treat the snack/confectionery marker set as case-insensitive **stem matches**, so plural product words (`crisps`, `pringles`, `biscuits`, `cakes`, `wafers`, `chocolates`, `doughnuts`) are detected when the marker list contains the singular stem (`crisp`, `pringle`, `biscuit`, `cake`, `wafer`, `chocolate`, `doughnut`). The fix MUST be applied to every marker in `_DRINK_SNACK_MARKER_WORDS` consistently, not cherry-picked.
- **FR-002**: `_DRINK_SNACK_MARKER_WORDS` in `tesco_matcher.py` MUST be extended to include the missing confectionery markers `doughnut`, `doughnuts`, `icing`, `iced`, `cookie`, `cookies`, `jelly`, `jellies`, `gummy`, `gummies`, `candy`, `candies`, `lolly`, `lollies`, so products like `Tesco White Iced Ring Doughnuts` and `Haribo Starmix` are excluded by the snack guard before reaching raw-ingredient Tier 2 matching.
- **FR-003**: The Tier 2 protein-bonus path in `fuzzy_match_items_to_meals()` (the `if meal_type and item_protein == meal_type:` block, lines 694-710) MUST NOT award `PROTEIN_MATCH_BONUS` to items whose `protein_type` is the default fallback (`vegetarian`/None) when the meal type is `potato`, `rice`, `pasta`, `curry`, `pizza`, or `sandwich` (i.e. a non-animal "protein" type). The protein bonus is only meaningful for animal-protein matches; non-animal protein-bonus matches are an artefact of the marker overlap in `MEAL_TYPE_KEYWORDS`.
- **FR-004**: Substring matching in Tier 2 (`substring_hit` at lines 678-686, via `item_satisfies_meal_component`) MUST NOT consider an item a substring match when the item was already classified as a snack/confectionery product (i.e. `is_drink_snack()` returns True). The snack-format check MUST happen *before* the substring bonus is computed, not just before the Tier 2 entry.
- **FR-005**: A regression test in `test_tesco_matcher.py` MUST assert that the four exemplar meals (`Cheesy mash potato (Ashlee)`, `Sea bass, onion rings, wedges`, `Jacket potato / garlic bread`, and the existing roast-dinner regressions from spec 011) all produce correct matched/unmatched items under one combined fixture, and that running the full `python3 -m unittest test_tesco_matcher` suite passes with no regressions.
- **FR-006**: The dashboard cache regenerated by `tesco_meal_check.py --days 30 --output both` MUST reflect the corrected matches: the four exemplar meals above show only genuine grocery matches, and the dashboard `expected` / `matched_items` / `missing_items` fields are consistent with the matcher output for the 2026-07-01 delivery.

## Non-Functional Requirements

- **NFR-001**: The matcher must continue to run inside the existing 91-second budget for `tesco_meal_check.py --days 30 --output both`. No new API calls; the fix is in-memory predicate evaluation only.
- **NFR-002**: Code changes must be limited to `tesco_matcher.py` (guard predicates and protein-bonus eligibility), `test_tesco_matcher.py` (regression coverage), and the regenerated `dashboard_cache.json`. No dashboard UI code, no cron changes, no new dependencies.

## Key Entities

- **`is_drink_snack(item_name)`** (existing): boolean predicate classifying an item as drink/snack/confectionery. Backed by `_DRINK_SNACK_MARKER_WORDS`. Modified: stem matching (FR-001) and marker-set extension (FR-002).
- **`_DRINK_SNACK_MARKER_WORDS`** (existing): set of marker tokens. Modified: extended with confectionery markers per FR-002.
- **`protein_type(components)`** (existing): classifies a component-word list into a protein family. Untouched by this spec.
- **`fuzzy_match_items_to_meals()`** (existing): Tier 2 raw-ingredient matching loop. Modified: protein-bonus eligibility gate (FR-003) and snack-format gate before substring bonus (FR-004).
- **`dashboard_cache.json`** (existing): generated by `tesco_meal_check.py`, consumed by Vercel dashboard. Modified at regeneration time only.

## Contract Impact

- **Module surface**: `tesco_matcher.py` predicate changes + `_DRINK_SNACK_MARKER_WORDS` extension; `test_tesco_matcher.py` regression coverage; `dashboard_cache.json` regenerated.
- **Untouched files**: All dashboard UI files in `/home/hermes/workspace/meals-dashboard/`; cron wrappers; `tesco_email_parser.py`; `tesco_meal_check.py` (cache generation is unaffected, only its output changes); `tesco_report.py`.
- **New env vars**: None.
- **No new secrets at runtime**: confirmed.
- **No new Vercel Blob namespaces**: confirmed.

## Open Questions

1. Should the snack-guard stem-match helper also cover `_READY_MADE_MARKER_WORDS` (the marker list for `is_ready_made()`)? That list also contains singular tokens (`sandwich`, `wrap`, `quiche`, `pizza`, `pie`, `pasty`, `fillet`, `nugget`, `finger`, `croquette`, `patty`, `popcorn`, `crisp`, `wafer`, `cake`, `bun`). If plural real-world product names (`sandwiches`, `pies`, `pasties`, `fillets`, `nuggets`, `fingers`, `croquettes`, `patties`, `cakes`, `buns`) currently slip past `is_ready_made()`, those products reach Tier 2 raw-ingredient matching too. Decision: **YES, apply the same stem-match fix to `_READY_MADE_MARKER_WORDS` for consistency** — but keep scope tight and document any unexpected false-positives in the spec's CHANGELOG.
2. Should the protein-bonus gate (FR-003) be a hard rule (`MUST NOT`) or a soft rule (`SHOULD NOT, MAY override with explicit animal-protein evidence`)? The hard rule is simpler and matches the user-stated "everyday meals shouldn't match snacks" intent. Decision: **hard rule (MUST NOT)**.
3. Should the fix also prevent the `Popchips` brand fragment from being treated as a potato-product match (because `chips` is in `_PREPARED_POTATO_SIDE_WORDS`)? Currently the brand fragment `Popchips` does not contain the meal component `potato`, so this is only a concern if a future meal names `chips` directly. Decision: **out of scope for this spec; revisit if a real `chips`-named meal appears.**

## Verification Plan

- **Unit tests**: Add regression coverage to `test_tesco_matcher.py` for the four exemplar meals (Cheesy mash, Sea bass + onion rings + wedges, Jacket potato / garlic bread, and the existing roast-dinner regressions). Assert exact matched-item lists and `status` values.
- **Integration smoke test**: Run `python3 tesco_meal_check.py --days 30 --output both` against the live 2026-06-29 inputs and inspect `dashboard_cache.json` for the four meals. Expected: `Cheesy mash potato (Ashlee)` shows `partial` with only wedges matched and crisps excluded.
- **Regression test**: `python3 -m unittest test_tesco_matcher -v` from `/home/hermes/.hermes/scripts` — confirm new + existing tests pass.
- **Spec validator**: `python software-development/spec-driven-skills/scripts/validate_spec_skill.py data-science/meals-check` — must end with `No issues found.`

## Reference Material

- **Spec 011** (`011-dashboard-meal-card-matcher-accuracy/spec.md`) — closest sibling. Scoped to roast-dinner false positives (pasta-as-protein, burger-as-roast-beef, potato-skins-as-roast-potatoes). FR-002 mentions chips/crisps in the context of roast potatoes only; this spec extends the same intent to everyday meals.
- **`/home/hermes/.hermes/scripts/tesco_matcher.py`** lines 260-271 (snack predicate), 136-150 (`_DRINK_SNACK_MARKER_WORDS`), 292-312 (roast-potato false-positive guard, unchanged), 678-718 (Tier 2 substring + protein-bonus path), 766-770 (coverage-status decision).
- **`/home/hermes/.hermes/scripts/test_tesco_matcher.py`** — existing regression coverage. The new tests should slot in next to `test_roast_pork_meal_card_excludes_false_positive_sides_and_ready_meals` (line 62).
- **`/home/hermes/.hermes/scripts/data/dashboard_cache.json`** generated 2026-06-29 — live cache showing the four exemplar meals in their pre-fix state.

## Promotion Criteria for Final

This spec remains at `Status: Draft, readiness: spec_only` until the implementation is **deployed to the production meals-dashboard Vercel environment** with regenerated `dashboard_cache.json`. Preview-only deployment is necessary but not sufficient.

The status flips to `Final` and `readiness` to `already_satisfied` only when **all** of the following are verified against the production deployment:

- [ ] `python3 -m unittest test_tesco_matcher -v` passes with the new regression coverage (all green).
- [ ] `python3 tesco_meal_check.py --days 30 --output both` regenerates `dashboard_cache.json` and the four exemplar meals (`Cheesy mash potato (Ashlee)`, `Sea bass, onion rings, wedges`, `Jacket potato / garlic bread`, plus a `Pizza (Leo)` negative-control) show correct matched/unmatched items.
- [ ] Vercel dashboard `https://meals-dashboard.vercel.app` reflects the regenerated cache and the four meal cards show only genuine grocery matches.
- [ ] The dashboard `coverage_score` for `Cheesy mash potato (Ashlee)` and `Jacket potato / garlic bread` is no longer 100% (it should be `partial` until a real mash/jacket-potato grocery appears in the order).
- [ ] Existing spec 011 acceptance scenarios still pass (no regression in roast-dinner or salmon/frozen-veg cases).

This rule aligns with the spec-driven-skills convention that `Final` status reflects verified runtime evidence in the live consumer deployment, not a closed task checklist. Danny confirmed on 2026-06-17: "the code should end up in production so its not finalised until its in production".