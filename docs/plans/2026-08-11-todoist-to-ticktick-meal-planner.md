# Todoist to TickTick Meal Planner Migration Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace Todoist as the meals-check source with TickTick while preserving the Meal Planner project/list, sections, dates, labels/tags, completion semantics, special cases, and dashboard output 1:1.

**Architecture:** TickTick becomes the sole read source for planned meals through the official Open API v1. The meals-check pipeline will resolve the destination project and columns by exact name, translate TickTick task fields into the existing internal meal-task shape, and leave Tesco matching, coverage generation, and dashboard Blob publication unchanged. A read-only parity phase will compare Todoist and TickTick before the source switch; no Todoist IDs will be used in TickTick requests.

**Tech Stack:** Python 3 standard library, TickTick Open API v1, existing `tesco_meal_check.py` pipeline, YAML configuration, unittest/pytest-compatible tests, Vercel dashboard sync endpoint.

---

## Current verified mapping and migration constraints

### Source structure recorded in the repository

Source reference: `/home/hermes/workspace/Hermes-Skills/productivity/todoist/references/danny-meal-planner.md`

- Project/list: `Meal Planner`
- Sections:
  - `Planned`
  - `Ashlee's lunch`
- Meal task semantics:
  - task content is the dish name
  - due date is the meal date
  - `adult` and `children` labels identify household audience
  - no label means household/default
  - completed tasks may be reintroduced for historical coverage
  - special cases include `McDonalds`, `Barbara & Tony`, and `Terina, Leo and Ashlee out`

### Destination currently visible through TickTick Open API

Read-only discovery on 2026-08-11 verified:

- Project: `🍽️Meal Planner`, ID `6a7a5164c7d6d13abbf366cf`, kanban view
- Column `Planned`, ID `6a7a51705ffd913abbf366e0`
- Column `Ashlee’s Lunch`, ID `6a7a5182f5c2d13abbf366f7`
- TickTick currently has four tasks in `Planned`.

The destination names are semantically equivalent but not textually 1:1. Before cutover, rename the TickTick project and second column to the exact source names unless Danny explicitly chooses to preserve the emoji/capitalisation. The implementation must then resolve by exact name and verify one-to-one mapping.

### Non-negotiable safety rules

- Read-only discovery and parity checks may run without confirmation.
- Creating, renaming, completing, or deleting TickTick tasks/projects/columns requires explicit approval immediately before the write operation.
- Never copy Todoist project, section, task, or label IDs into TickTick requests.
- Do not delete Todoist data during the migration; retain it as rollback evidence until parity and production acceptance are complete.
- Do not publish a dashboard sync from an unverified or empty source.

---

## Phase 0: Establish the migration contract

### Task 1: Add a source-switch configuration block

**Objective:** Make the active meal source explicit and reversible.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_config.yaml`
- Test: `/home/hermes/.hermes/scripts/test_tesco_meal_check.py` or the existing configuration test location

Add a `meal_source` value with `todoist`, `ticktick`, and `parity` modes. Add TickTick settings for token path, project name, and required column names. Keep the existing Todoist settings during the migration window.

Expected configuration contract:

```yaml
meal_source: parity

ticktick:
  token_file: "/home/hermes/.hermes/profiles/chef/ticktick_token.json"
  project_name: "Meal Planner"
  planned_column: "Planned"
  lunch_column: "Ashlee's lunch"
```

Run the configuration tests and verify an invalid source fails closed rather than silently falling back to Todoist.

### Task 2: Record the exact source/destination name mapping

**Objective:** Prevent accidental ID-based or fuzzy project selection.

**Files:**
- Create: `/home/hermes/workspace/meals-dashboard/docs/migrations/todoist-ticktick-meal-planner-mapping.json`
- Test: `/home/hermes/workspace/meals-dashboard/scripts/test_ticktick_meal_mapping.py`

Record canonical names, current IDs, and migration status. Treat IDs as observed metadata only; runtime resolution must use names. Include the current discrepancy (`🍽️Meal Planner` versus `Meal Planner`, and curly/capitalised `Ashlee’s Lunch` versus `Ashlee's lunch`) as a pre-cutover action.

Verify the mapping file contains exactly two required sections and rejects duplicate or missing destination names.

---

## Phase 1: Implement TickTick read support

### Task 3: Add a read-only TickTick Meal Planner client

**Objective:** Fetch projects and project data through the existing official helper without adding unofficial API calls.

**Files:**
- Modify or reuse: `/home/hermes/workspace/Hermes-Skills/productivity/ticktick/scripts/ticktick_api.py`
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Test: `/home/hermes/workspace/Hermes-Skills/productivity/ticktick/tests/test_ticktick_api.py`

Use `GET /project` to resolve the project by exact name, then `GET /project/{projectId}/data` to obtain columns and tasks. Return a typed internal result containing project name/ID, column name/ID, and task records. Keep bearer tokens out of logs.

Run the TickTick helper tests and a live read-only `projects`/`tasks` check.

### Task 4: Resolve columns by exact name and enforce 1:1 structure

**Objective:** Ensure the active plan and lunch list cannot silently flatten into one list.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Test: `/home/hermes/.hermes/scripts/test_tesco_meal_check.py`

Implement name-first resolution for:

- `Meal Planner`
- `Planned`
- `Ashlee's lunch`

Normalize only Unicode apostrophe comparison for diagnostics; do not use normalization to select an ambiguous destination. Fail with an actionable error when a required column is missing, duplicated, or has an unexpected name. Preserve the resolved column name and ID on every internal task record.

Run unit tests for exact match, curly-apostrophe mismatch, duplicate names, missing column, and unrelated project with a similar name.

### Task 5: Translate TickTick tasks into the existing meal-task shape

**Objective:** Keep downstream matching and dashboard code unchanged.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Test: `/home/hermes/.hermes/scripts/test_tesco_meal_check.py`

Translate:

| TickTick | Existing meals-check field |
|---|---|
| `title` | `content` |
| `content` | `description` |
| `dueDate` / `startDate` | `due.date` in local Europe/London calendar form |
| `tags` | `labels` |
| `projectId` | source project metadata, not Todoist `project_id` |
| `columnId` + `columnName` | source section metadata / `section_id` equivalent |
| `status` | completed/active state |
| task `id` | stable external task ID |

Explicitly test all-day dates, Europe/London daylight-saving transitions, missing due dates, tags `adults`, `children`, and no tags, completed tasks, and empty descriptions.

### Task 6: Preserve completed-task history semantics

**Objective:** Keep dashboard coverage and historical meal behaviour consistent with the current Todoist pipeline.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Test: `/home/hermes/.hermes/scripts/test_tesco_meal_check.py`

Determine the exact TickTick completed-status representation from live API responses and implement the equivalent of the current completed-task retrieval. If the official API cannot retrieve the required historical completed tasks, stop the cutover and document the limitation rather than silently dropping historical meals.

Verify that completed meals are included/excluded under the same dates and section rules as the Todoist implementation.

---

## Phase 2: Make the destination structure exactly match

### Task 7: Prepare the TickTick project and columns for an approved rename

**Objective:** Make the visible destination names match Todoist 1:1 before migration.

**Files:**
- Modify: `/home/hermes/workspace/Hermes-Skills/productivity/ticktick/scripts/ticktick_api.py`
- Test: `/home/hermes/workspace/Hermes-Skills/productivity/ticktick/tests/test_ticktick_api.py`
- Documentation: `/home/hermes/workspace/meals-dashboard/docs/migrations/todoist-ticktick-meal-planner-mapping.json`

First present the exact intended writes for approval:

- Rename `🍽️Meal Planner` to `Meal Planner`.
- Rename `Ashlee’s Lunch` to `Ashlee's lunch`.
- Leave `Planned` unchanged.

Use only documented TickTick write endpoints supported by the official API. If the official API cannot rename projects/columns, stop and request a destination-model decision; do not silently accept a non-1:1 structure.

### Task 8: Verify exact 1:1 structure after rename

**Objective:** Prove the destination names and column membership are correct before task migration.

**Files:**
- Create: `/home/hermes/workspace/meals-dashboard/scripts/verify_meal_planner_structure.py`
- Test: `/home/hermes/workspace/meals-dashboard/scripts/test_verify_meal_planner_structure.py`

The verifier must report:

- exactly one project named `Meal Planner`
- exactly one `Planned` column
- exactly one `Ashlee's lunch` column
- every destination task belongs to that project and one of those columns
- no unexpected Meal Planner columns

Return non-zero on any mismatch and produce no writes.

---

## Phase 3: Parity and cutover

### Task 9: Build a read-only Todoist/TickTick parity report

**Objective:** Compare both sources before changing the active pipeline.

**Files:**
- Create: `/home/hermes/workspace/meals-dashboard/scripts/compare_todoist_ticktick_meals.py`
- Test: `/home/hermes/workspace/meals-dashboard/scripts/test_compare_todoist_ticktick_meals.py`

Compare canonical records keyed by `(section_name, normalized_title, due_date, audience_tags)` and report:

- source-only tasks
- destination-only tasks
- title/date/tag/section mismatches
- completed-state mismatches
- duplicate canonical keys
- missing due dates

The report must not create, complete, move, or delete tasks. Require zero unexplained mismatches before cutover.

### Task 10: Add parity-mode pipeline execution

**Objective:** Run both readers against the same date window and prove identical downstream meal coverage.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Test: `/home/hermes/.hermes/scripts/test_tesco_meal_check.py`

In `parity` mode, fetch both sources read-only, compare canonical meals, and run the existing matcher against the selected source only when parity passes. Do not sync the dashboard when parity fails. Include source and parity status in the run report, without exposing tokens.

Verify equivalent coverage counts, meal dates, special-case exclusions, and audience handling.

### Task 11: Switch the cron pipeline to TickTick

**Objective:** Make TickTick the sole production meal source after parity acceptance.

**Files:**
- Modify: `/home/hermes/.hermes/scripts/tesco_config.yaml`
- Modify: `/home/hermes/.hermes/scripts/tesco_meal_check.py`
- Modify: scheduled meal-check wrapper/configuration if it embeds source assumptions
- Test: scheduled wrapper tests and the full meals-check test suite

Change `meal_source` from `parity` to `ticktick`. Keep Todoist configuration read-only for rollback evidence, but remove Todoist from the production execution path. Preserve the existing calendar gate, Gmail receipt parsing, Tesco matching, Grocy fallback, and dashboard sync boundary.

Run one manual dry run first. Then run the scheduled wrapper in its normal safe mode and verify the report identifies TickTick as the source.

### Task 12: Sync and verify the production dashboard

**Objective:** Prove the TickTick-backed meal coverage reaches the live dashboard correctly.

**Files:**
- No dashboard UI change expected.
- Verify: `/home/hermes/.hermes/scripts/data/dashboard_cache.json`
- Verify: production `/api/internal/blob-diagnostic`

Run the normal meal-check sync only after the source and parity gates pass. Verify:

- meal coverage dates match TickTick planned tasks
- delivery/order data remains unchanged except for meal matching results
- current-day and upcoming columns are present
- dashboard manifest and coverage blobs contain the expected dates
- no Todoist IDs appear in generated payloads or logs

---

## Phase 4: Rollback, cleanup, and documentation

### Task 13: Document rollback to Todoist

**Objective:** Make rollback a single configuration change with a known verification procedure.

**Files:**
- Modify: `/home/hermes/workspace/meals-dashboard/docs/migrations/todoist-ticktick-meal-planner.md`
- Modify: `/home/hermes/workspace/Hermes-Skills/data-science/meals-check/SKILL.md`
- Modify: `/home/hermes/.hermes/scripts/tesco_config.yaml`

Document rollback to `meal_source: todoist`, the required Todoist token, the parity command, and the dashboard verification command. Do not remove Todoist credentials or references until Danny explicitly confirms the migration is stable.

### Task 14: Add migration acceptance evidence

**Objective:** Produce an auditable completion record.

**Files:**
- Create: `/home/hermes/workspace/meals-dashboard/docs/migrations/todoist-ticktick-acceptance.md`

Record:

- exact project and column names/IDs observed after cutover
- parity report result
- test commands and pass counts
- one successful dry run
- one successful production sync
- production diagnostic evidence
- rollback status
- confirmation that no destructive Todoist operation occurred

---

## Verification command set

Run these in order during implementation:

```bash
# TickTick read-only authentication and structure
python3 /home/hermes/workspace/Hermes-Skills/productivity/ticktick/scripts/ticktick_api.py auth-check
python3 /home/hermes/workspace/Hermes-Skills/productivity/ticktick/scripts/ticktick_api.py projects
python3 /home/hermes/workspace/Hermes-Skills/productivity/ticktick/scripts/ticktick_api.py tasks --project-id <resolved-meal-planner-id>

# Meal-check tests
python3 -m unittest discover -s /home/hermes/.hermes/scripts -p 'test_*.py'

# Dashboard tests
cd /home/hermes/workspace/meals-dashboard
npm test
npm run build

# Production verification after approved cutover
python3 /home/hermes/workspace/meals-dashboard/scripts/verify_meal_planner_structure.py
```

Expected acceptance result: all required names match exactly, the parity report has zero unexplained mismatches, the TickTick-backed dry run produces the same meal coverage as Todoist, and the production dashboard diagnostic shows the expected coverage dates and no load error.

## Explicit blockers identified during planning

- Todoist access is currently unavailable in this profile because `/home/hermes/.hermes/profiles/chef/todoist_token.json` is missing. The implementation must restore read-only Todoist access before parity can be measured.
- TickTick access is available and exposes a project plus two columns, but the project/column names are not currently textually 1:1 with Todoist. Rename approval and official API support must be confirmed before cutover.
- TickTick’s completed-task/history semantics must be verified against the official API before replacing the current Todoist completed-task path.
