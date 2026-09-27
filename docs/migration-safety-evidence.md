# Offline migration safety source checkpoint — 2026-09-27

## R1 correction — run473, independent retest pending

Run472 independently returned FAIL_ACCEPTANCE_CRITERIA: immutable publication broke the debug read contracts. That verdict remains historical; the original run471 green suites did not cover these sibling consumers. First same-card correction only, not a new retry graph.

Spec-first checkpoints planner0756d64629b4531490dbd5db29b648b17bbf8d0b and sourcef468038e4ee7d4a68859de2304599e9d6d9d1b3f were pushed and remote-exact before correction. Freshness/items routes now select physical manifest references; a client-safe parser returns logical coverage dates; product lookup preserves the legacy-only fallback boundary. A request-local pinned reader prevents diagnostic pointer A from being mixed with data from newly published pointer B. No mutable aliases or writer changes.

The unchanged reviewer probe fails3/3 before and passes3/3 after in EACH app. Added13 cases per app cover sparse/missing references, legacy stable graphs, immutable main-only/missing-product-manifest refusal, debug denial and two actual writer-produced advancing-pointer cases (those two reproduced RED before the pinning fix). Final planner747/source980 tests, zero failures/skips; producer200/governance4; both builds/types/static privacy pass. Fresh actual local pipeline backup/restore and separate-process readback pass:17 exact files,2 retained graphs,2 orders,1 product,1 override,0 network calls. Scoped secret-pattern/whitespace and all build traces pass, installed wrapper/publisher/recovery hashes unchanged. Broader privacy and live gates remain as below.

Full correction report: planner docs/verification/2026-09-27-migration-safety-r1.md; exact successor SHAs and source-control readback are in the SAME-card handoff. No activation, live source access or inventory release; selected legacy-only fallback unchanged. Run473 needs independent tester acceptance.

## Historical run471 handoff

Task t_d007ecc9, run471. Source-only; independent SAME-card tester review pending. No deployment, installed publisher/wrapper replacement, live source read, publication or inventory release.

Spec checkpoints: this repository 0099496b7285b8d33e8e707ef0eaac3c3b75f7b0 and selected-policy addendum 0a03c9f002b484421e6a73545050a0fb74869d5a; planner 37af96d212772c5658f8445c05efd35354da4165 then 4d8b489c195fbd8cf96cfc32f84626dcf6dd1196. Both were pushed before respective implementation. Candidate Vercel branch deployment is explicitly disabled in vercel.json. Installed source was not edited.

- F01: immutable SHA256 order/coverage/product references; exact manifest readers, source export and verification compatibility; stale product association rejection; immutable invalidation. Main-only immutable graphs cannot read legacy mutable product aliases. Legacy stable-path readers remain supported.
- F02: failed/missing/malformed primary authority returns sanitized failure, including POST read-before-write refusal. Positive empty is distinct. Danny selected legacy-primary client fallback, dual-only fail-closed (policy SHA256 ac7fe297ada36fbd8d0fb63df69d48c34b354ea6c64d763c9d36f476c7a17f1e). Invalid partial secondary configuration preserves primary isolation and explicit partial failure, no parity claim.
- F03: preserve completed phase acknowledgments even if later checkpoint fails; record checkpoint durability separately; retained identity replay and real-process restart tests cover main/products and product-only adapter.
- F04: private copy of clean wrapper handoff, one validated primary snapshot including empty/cleared overrides, clean-base version gate for complete dual. Settings-repo source-only wrapper commit 8198244f56c48ab59a3b5f7051468509c0e8fb94 is required; it is NOT installed. Existing legacy caches are not automatically repaired or migrated.

Executed: Vitest 964/964 (MEALS_SOURCE_HISTORY_ROOT and MEAL_PLANNER_REVIEW_ROOT set for 33 historical cross-repo cases); Python scripts suite 200/200 with synthetic HOME/cache and socket/DNS denial; TypeScript, production build and static-private-data scan exit0. Mode matrix12 and real authority route9 are subsets, not extra totals. Accepted baseline probes failed F01=2, F02=4, F03=1 before fixes; actual wrapper red and mutable alias red preserved. Initial dependency-bin failure, superseded fixture failures and one misconfigured history-root run with33 skipped are retained, not counted as acceptance.

Full S1–S9/finding matrix, isolated local route→read→backup→restore→new-process rehearsal, exact installed hashes, commands and safety ceiling: planner docs/verification/2026-09-27-migration-safety.md and same-card run471 evidence attachment. Rehearsal is synthetic only. Strict source-archive completeness, historical production failures/retry budgets, original NOT_READY/T015 and t_ab800602 SCHEDULED remain unchanged. Per-process locks are not a global CAS/authority transaction. Broader F05 logging/config risks are not claimed resolved; clean builds contain no private evidence or credential paths in inspected traces.
