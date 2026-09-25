# Optional dual publication and bounded recovery

Source implementation only: app002 in Meal Planner and Hermes integration015 are the governing contracts. This branch must not activate or deploy itself. `vercel.json` disables Git deployments for `coder/dual-publish-20260925` only; production branches retain their settings.

## Opt-in and rollback

Deploy the reviewed server route/storage changes to both destinations before setting `MEALS_PUBLICATION_PROTOCOL=1` in the existing producer's protected environment. Servers independently require that same flag. Every phase first performs an authenticated dry run with its exact identity and requires `publicationProtocol: 1` before any actual write. Old servers cannot silently receive replayable writes. Secondary URLs/auth are `MEAL_PLANNER_DASHBOARD_DATA_API_URL` and `MEAL_PLANNER_DASHBOARD_DATA_SECRET`; primary uses its existing settings. Disable secondary by removing both secondary settings, not by changing schedules. The protocol can remain on for the primary. No Blob token is required by the producer.

`MEALS_PUBLICATION_STATE_DIR` selects a private directory, default `~/.local/state/meals-publication`. Recovery is bounded to 24 hours / 8 entries / 8 MiB. The existing publisher invocation supersedes older failed generations with new computed work. For recovery without collecting/building, use `python scripts/sync-dashboard-data.py --replay-publication`. This is a manual/existing-invocation command, not an additional scheduler. A restart of an identical run resumes its pending products without reposting its successful main. Endpoints/auth are resolved at replay time; only endpoint hashes are persisted. Successful work is removed; pending work is write-ahead checkpointed for crash safety.

Server receipts enforce immutable run/target/phase and generation ordering. Product-only backfill uses the same controls and never submits empty main data. Full-sync product phases retain their target's exact main manifest. Dry runs never alter checkpoints or data. Legacy single-target calls retain their response shape and do not retry ambiguous writes without the protocol.

## Correction cycle 1: ordinary faults and partial configuration

App002 AS-007/AS-008 refine FR-002/FR-003/NFR-002 (integration015 FR-003/FR-004/FR-005). Both Blob adapters replace the committed pointer with one overwrite PUT, never a delete followed by PUT. The existing store lock, payload hash and generation fences are unchanged. An ordinary pointer failure retains main; pointer success followed by receipt failure can replay the identical products phase without replaying main. This is separate from the killed-server lock limitation below.

Full and product-only commands with URL-only or auth-only secondary settings retain a sanitized failed-secondary result and still attempt a healthy primary. They return a partial-failure exit, not all-target success; full-sync explicitly preserves normal meal report flow. No secondary transport call is made without both settings. Complete dual configuration still requires the protocol, and full sync still fails closed if the authoritative override snapshot is unavailable. Remove both settings for disabled-secondary rollback.

Permanent regressions: `app/api/publication-pointer-recovery.test.ts` in both apps (pointer/receipt before/after commit, exact readback, identity/stale/concurrency rejection); `scripts/test_publication_config_isolation.py` (actual command matrix with protocol enabled/disabled, disabled/complete/URL-only/auth-only secondary, plus authority rejection). Independent tester review and caller-held activation remain required.

## Safety ceilings and operator actions

- Vercel Blob serialization uses server-enforced create-if-absent and ETag-conditional release. Private mutable state is fetched with `useCache: false`. Local serialization uses the existing inter-process lock.
- A server killed while holding its lock fails closed. There is deliberately no expired-lock theft; automatic lease takeover could allow a paused old writer to overwrite a newer generation. Recover only after proving every old writer has terminated, then removing only its abandoned lock. Never delete the generation/receipt journal to force an old replay.
- Configure the local first-write backup gate described in Meal Planner `recovery-protocol.md`; quiesce administrative writers. Backup, secure config and live exact readback belong to the caller after independent source acceptance.
- Corrupt/oversized client state fails closed with a sanitized outcome; it does not send untracked writes. Expired pending payloads are removed on the next invocation. Abandoned temporary payloads are cleaned under the lock.
- Clock/generation conflict and stale work fail closed rather than overriding later successful data. Do not edit queued identities or reuse a generation for modified data.
- The feature worktree is NOT the active `/home/hermes/workspace/meals-dashboard` runtime. Promotion must copy/cherry-pick only accepted scoped changes without publishing unrelated local main history.

## Reproduce synthetic verification

`PYTHONDONTWRITEBYTECODE=1 python -m pytest -q -p no:cacheprovider scripts/test_publication_recovery.py scripts/test_publication_entrypoints.py scripts/test_sync_dashboard_data_split.py scripts/test_override_merge.py scripts/test_backfill_tesco_product_metadata.py scripts/test_sync_dashboard_data_env.py scripts/test_sync_dashboard_history.py`

`npm test && npm run build && npm run scan:static-private-data`

The Meal Planner companion `app/api/publication-recovery.integration.test.ts` runs an actual local HTTP transport, Python subprocess and isolated local stores, including response loss after commit, restart and exact hashes/identity readback. Set `PUBLICATION_PRODUCER_SCRIPTS` if this checkout is not the sibling `meals-dashboard-dual-publish`. No real payloads or secrets are needed. Vercel SDK transport behavior is tested against a synthetic store, not the production service.
