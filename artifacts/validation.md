# Worker validation and consolidated design review

## Revision validation — 7 November 2026

**All five reopened findings were reproduced and fixed.** This revision preserves the accepted game, artwork, contract pins, wallet connectors and service architecture. It changes name wrapping, XP-achievement reconciliation, ranking-read error states, sign-in save selection and saved-proof retry behavior. The rebuilt static export remains in `dist/`.

| Check on this revision | Actual result |
| --- | --- |
| Production build and TypeScript check | Passed; no compiler errors. Existing upstream bundler annotations / `use client` warnings remain nonfatal. |
| Targeted production-client regressions | **13/13 passed**; `revision-tests.json`. |
| Game/service tests | **25/25 passed**; `unit-service-tests.json`. |
| Production HTTP smoke checks | **5/5 passed**; `server-smoke.json`. |
| Existing browser suite | **20 Chromium checks passed**; the WebKit launch check is blocked by missing system libraries. `browser-tests.json` retains that failed launch rather than reporting it as passed. |
| Final taste@1 probe | **16/16 passed**, offline at 320, 390 and 1440; `design-probe.json`. |
| Official API / live receipt read | All four official API reads succeeded; real Sepolia round 494, 64 work units, 7 completed blocks, 53 confirmations at the recorded read. `live-integration.json`. |

The pre-fix production export reproduced all reported failures. `revision-baseline.json` records the original measurements and intentionally failing regression assertions: the 24-letter name produced scroll widths **547 / 553 / 1714** at **320 / 390 / 1440**; the real mission sequence reached **107 XP** without `first-steps`; play and qualifying-save loading also missed that badge; a healthy service followed by a 503 ranking read showed a false empty result; signed reconnect changed **XP 5 / pet 1** to **XP 0 / pet 0**; successful verification of the real 604-work receipt and manual source refresh both left energy unavailable. Baseline failures are evidence of reproduction, not passing checks.

| Finding / final source | Correction and recheck |
| --- | --- |
| High, layout — `src/style.css:451`, `src/style.css:690` | Name headings wrap complete values in shrinkable columns; avatar and utilities cannot shrink. Follow-through testing reproduced the same name escaping mission/world text and return/help controls, which now wrap too. Final `documentElement.scrollWidth` is **320 / 390 / 1440** at those widths, across **all six sections** with 24 W characters. Avatar widths remain **40 / 40 / 48px**. Headings grow vertically. |
| Medium, achievements — `src/game.ts:62` | One idempotent XP check covers care, mission collection, completed play and loaded care snapshots. Actual care/mission UI sequence unlocks at 107 XP; play unlocks at exactly 100, stays locked below 100, and never duplicates the badge. Loading an older 107-XP save repairs it. |
| Medium, ranking state — `src/App.tsx:209`, `src/App.tsx:1678` | Ranking read errors are independent of service health. After an injected 503, the UI shows the returned error, Shared rankings unavailable and Retry rankings. It shows neither an empty-player claim nor a cached personal rank. Retrying a successful empty response restores the genuine empty state. |
| Medium, local persistence — `src/App.tsx:550`, `src/game.ts:411` | A validated existing wallet-local save wins on sign-in; a new device restores cloud care. The returned server profile/revision remains current for explicit saves. Signed disconnect/reconnect and reload/re-sign preserve XP 5/pet 1. A second device can save a newer cloud snapshot without replacing that local care on the next sign-in. Saving the chosen local snapshot with the current revision and explicitly loading cloud care both pass. |
| Medium, verification recovery — `src/App.tsx:343`, `src/App.tsx:375` | Retry saved proofs, Refresh sources and successful manual verification when reconciliation is incomplete all rerun the full saved-proof check. Each route recovers the real single receipt to **60 energy / Baby** without reload. With two real saved receipts, one still-failing proof keeps the total **Unavailable**; after restoring it, verifying the already-checked receipt retries the full set and restores **99 energy**, without duplicate rewards. |

`node scripts/run.mjs revision` runs the new regressions after building. The worker used `PLAYWRIGHT_BROWSERS_PATH=test/scratch/browsers`, `NODE_USE_ENV_PROXY=1` and `SQUEEK_TEST_NETWORK_BRIDGE=1`. The bridge passes real public upstream API/RPC responses unchanged. Only RPC outages / a leaderboard 503 are injected; the historical guest date is explicitly test setup. Service tests use isolated SQLite and real signatures from generated in-memory accounts with an injected registration frontier. No fabricated chain work, test profiles, scores or keys enter the export. The existing API-outage test was repaired to reload after installing its failure route: hash navigation alone does not refetch sources while the test clock is paused.

### Six-domain review of the revision

| Domain | Coverage / result |
| --- | --- |
| Accessibility | Checked native button names, disabled checking states, status announcements, keyboard Escape/focus return through the existing browser suite and desktop long-name help flow. Complete names remain readable. Native zoom, assistive technology and physical devices remain unperformed. |
| Layout | Measured all six sections with the longest supported name at 320/390/1440; existing ordinary-content checks also cover 768. Inspected actual long-name phone and desktop screenshots. No page-wide overflow or heading/control overlap was observed after fixes. |
| Writing | Checked error/loading/empty/retry distinctions. Failed ranking reads state what is unavailable; sign-in says local care was kept and identifies Settings for cloud loading. |
| Typography | Checked complete name wrapping and preserved font sizes; no clipping, ellipsis or shrink-to-fit. The existing six-size DM Sans scale is unchanged. |
| Colors | No palette changes. The final probe passed its measured solid foreground/background contrast checks. No new exhaustive alpha/image contrast claim is made. |
| UI | Inspected the failed-ranking render and retry transition; exercised saved-proof pending/unavailable/confirmed states, partial failure and recovery. New controls reuse existing compact buttons and icons. Existing reduced-motion checks passed. |

The final 390 screenshot shows the actual pet and all five care actions in the first viewport. `screenshots/revision-long-name-390.jpg` records this with the longest accepted name. Full long-name screenshots at 320, 390 and 1440 and the ranking failure screenshot were inspected from disposable `test/scratch/revision/`; those full-size scratch captures are not submitted. The pinned probe's 390 first-screen and desktop captures were also inspected.

The supplied browser MCP could not launch its configured Chrome (`/opt/google/chrome/chrome` missing). Actual rendering and interactions used installed Playwright Chromium 141 instead. WebKit's downloaded runtime could not launch because OS libraries are absent. Real MetaMask/passkey ceremonies, physical wallet handoffs, screen readers and native zoom remain unperformed. Public URL assignment and a public shared backend remain the previously disclosed deployment limits. **Complete for the five-finding revision scope**, with the broader delivery limits below retained. All finding verdicts are in root `.imd-responses.json`, explicitly included with a 16 KiB path budget inside the existing source/docs allocation.


This record describes checks actually performed by the worker. The verifier's path/byte checks do not independently certify these behaviors. The delivered source and export are a useful implementation; **the requested fully public shared deployment is incomplete** because no public backend is hosted in this run. The frontend's publication URL is assigned after upload, not fabricated here.

| Area | Result |
| --- | --- |
| Repository requirements | Implemented, with the explicit deployment/vendor-test limits below |
| Game/service tests | 25 automated checks; actual results in `unit-service-tests.json` |
| Production HTTP entry | 5 smoke checks; `server-smoke.json` |
| Chromium interactions | 20 passed; 1 WebKit check blocked by missing OS libraries |
| Product and primary action on first screen at 390 | Yes: room, pet, five care controls and wallet |
| Live gameplay integration | Passed: 131 real confirmed energy, Young, reward, duplicate protection and world event |
| Final taste@1 probe | 16/16 passed; `design-probe.json` |
| Share card | Local 1200×630 PNG, title, description, favicon and OG metadata present |
| Fabricated chain/users/scores | None in the production game or service storage |

## Scope and assumptions

All six hash-routed sections were implemented and exercised. The production export was served under `/preview/` for subpath validation. Desktop and phone rendering were inspected from actual Chromium screenshots. The visual direction is an original warm pixel room in a flat sage interface; a dense API dashboard does not replace the pet game. Daily boundaries use UTC. Game seeds, XP and care stats are internal game mechanics; Evolution Energy has an independent, verified source.

The shared service is a single Node process and persistent SQLite database. It needs an operator-supplied public HTTPS origin when hosted remotely. Local defaults are complete and runnable; the static default deliberately has no invented backend URL. No publishing command, funded transaction, contract deployment or real-user wallet approval was performed.

## Requirement coverage

| Brief requirement | Implementation / evidence | Limit |
| --- | --- | --- |
| “a playable product” | Five care interactions, interactive room and seed-catching game; Chromium and game tests | None observed in tested care flows |
| “idle, eating, sleeping, running and reaction animations” | Distinct pixel sprite/room states and CSS keyframes; motion probe | Native WebKit rendering unperformed |
| “Health, Happiness, XP and Evolution Energy” | Needs meters and separate care/evolution state | Local care values are editable; excluded from rank |
| “daily missions, rewards and achievements” | Six UTC missions, once-only collection, eight achievements | Blockchain mission needs an eligible real receipt |
| “Save player progress locally” | Separate guest/wallet saves, validation, idle recovery, export | Browser quota failure is shown; no cross-device local storage claim |
| “Baby, Young and Legendary” | Thresholds, appearances, animation, all crossed-stage rewards | Bulk public RPC reads can time out |
| Four official APIs | Live reader, history, settlement list and pinned metadata | APIs remain external services |
| “Only officially settled and verified work” | Shared receipt/ledger verifier, registration frontier, round uniqueness | 12-block confirmation policy; reorg reconciliation on service reads |
| “LIVE, PENDING, CONFIRMED and UNAVAILABLE” | Explicit tags and unknown readings; REJECTED also distinguishes ineligible input | Historical chart coverage is partial and disclosed |
| “Support MetaMask and compatible EVM wallets” | EIP-6963 and generic EVM connector, Coinbase SDK, phone links | Real extension, passkey and physical-app handoffs not performed |
| “Verify wallet ownership through message signing” | SIWE-style service login, cryptographic tests and browser provider | Smart-account vendor ceremony unperformed |
| “Detect and switch to Ethereum Sepolia” | Wrong-chain UI and connector switching | Test provider exercised, not a real extension prompt |
| “Verify transaction hashes, receipts, network, contract addresses and events” | Actual successful round 485 and 488 reads; malformed, pending, wrong-network, reverted and deadline tests | Direct-to-Core settlements are accepted; indirect wrapper transactions are outside this MVP policy |
| “functional global leaderboard” | Persistent SQLite ranking service, two independent browser users/sessions | Public shared service not deployed |
| “Include player rank and personal statistics” | Refreshed personal rank, energy, score, stage, wallet and global appearance | Public top 100; authenticated rank outside that range supported |
| “Validate submitted scores” | Server computes scores; arbitrary score/energy input ignored; duplicate rounds rejected | One wallet is not a proof of one human |
| “minimum backend/database” | Signed profiles, bearer sessions, claims and cloud revisions; restart and production HTTP tests | One database per service; persistent disk required |
| “Prepare NFT achievement integration” | Metadata/proof export with explicit `not-minted` status | No NFT mint or invented contract |
| “6 functional sections” and responsive layout | Navigation, forms, collection, downloads, cloud flow and all-section reflow | Physical phones and native zoom unperformed |
| Static export, source and lockfile | `dist/index.html`, all referenced assets, `base: './'`, manifests and scripts | Publication happens after submission |
| Build, typecheck, design docs and README | Actual commands below, `DESIGN.md`, usage and service instructions | Worker report, not external certification |
| “Public working website URL” | Export ready for the assignment's publisher | No URL assigned in this run; no public backend hosted |

## Six design domains

| Domain | Coverage and evidence | Unperformed / limitations |
| --- | --- | --- |
| Accessibility | Native buttons/links/inputs, labeled progress bars, modal focus containment/return, Escape, basket keyboard input, error announcements, reduced motion, 24px/spacing target probe | Screen-reader session, exhaustive focus-perimeter contrast and native high-contrast OS test not performed |
| Layout | All six sections at 320, 390, 768 and 1440; no page overflow; screenshot inspection; main action above phone fold | Native 200% zoom and RTL mirror not performed; English-only UI |
| Writing | Actions match handlers; verified vs optimistic data, local vs shared saves, collection states, recoverable errors and plain sign-in explanation | Third-party wallet dialogs are outside this review |
| Typography | One local family, three weights, six source size tokens; 4–5 rendered sizes on homepage; full addresses available and names wrap | No font-axis inspection beyond the upstream weight resources and actual render |
| Colors | Semantic UI palette, measured solid text pairs, redundant status text, final contrast probe pass | Exhaustive alpha/image combinations and physical display testing not performed |
| UI | Flat panels, explicit hover/pressed/focus/disabled states, bottom-sheet wallets, pause control, essential game feedback and export metadata | Animation replay at 10% speed and physical touch testing not performed |

The guide was read and applied during construction, including all six domains and the design-documentation section. `DESIGN.md` describes final source tokens and reuse points. Broader optional subchecks are not silently marked passed.

## Findings, fixes and rechecks

| Severity / domain | Final source location and reproduced issue | Correction and evidence |
| --- | --- | --- |
| High / integrity | `src/verification.ts:190`: event-name type arguments did not filter decoded log events, rejecting genuine receipts | Filter the returned discriminant explicitly; real Sepolia receipts subsequently reconciled successfully |
| High / functionality | `server/service.ts:349`: claim insert initially had nine placeholders for eight columns | Corrected SQL; verified work, deduplication, score and persistence tests pass |
| High / writing & integrity | `src/App.tsx:240`: a saved-proof recheck failure could have looked like zero energy | Track checking/unavailable separately and use indeterminate/unknown display; real timeout preserved earned energy |
| High / recovery | `src/verification.ts:98`: slow RPC phases could leave checking pending too long | 45-second deadline and later-phase guard; virtual-time test confirms no subsequent receipt request after expiry |
| High / state safety | `src/game.ts:330` and `src/activity.ts:81`: incomplete saves/API shapes could reach rendering | Validate saves and consumed API fields; reject chain achievement IDs in care saves and derive their display only from verified records; null observations stay missing; corruption and malformed-response tests pass |
| Medium / gameplay | `src/game.ts:164` / `finishPlay`: starting then abandoning a game could count toward missions | Count completed games at collection only; actual seed-game collection test and game tests pass |
| Medium / progression | `src/game.ts:306` `applyEvolution`: a large proof could cross both thresholds but grant only the final reward | Award each unclaimed stage once; direct Legendary jump and duplicate-reward tests pass |
| Medium / accessibility & writing | `src/App.tsx:1831` rename form and `src/Art.tsx:86` room names: invalid input feedback was outside the modal and names were partly fixed to Mochi | Inline described error, busy state, dynamic labels and persisted rename; Chromium validation passes |
| Medium / shared state | `src/App.tsx:419` and `server/service.ts:163`: cached personal rank could lag the refreshed table | Return authenticated personal rank alongside rankings; independent-session rank assertions pass |
| Medium / persistence | `src/App.tsx:341` proof storage: rolling history could eventually discard old local proof references | Retain hashes, stop rechecks on failure and keep cloud care snapshots separate from the canonical ledger |
| Medium / wallet safety | `src/App.tsx:479`: late sign-in/verification responses could target a changed account/profile | Bind and recheck current account/network/profile context; same-account message validation and disconnect flows exercised |
| Medium / performance | `vite.config.ts:12` dependency resolver selected CommonJS barrels in the disposable toolchain | Resolve available ESM entries; complete export reduced from about 3.2MB to about 1.5MB without removing required assets |
| Medium / operation | `scripts/run.mjs:20`: stopping the wrapper could leave the actual server child running | Forward termination signals; production smoke test now exits cleanly after service shutdown |
| Medium / submission | `.gitignore:1`: review evidence was excluded by an inherited ignore pattern | Explicitly include root artifacts with a 512KiB budget, while generated dependencies/caches remain ignored at every depth |

These are consolidated root causes, not a claim that source review establishes every rendered behavior. Resolved findings refer to current files/functions; evidence comes from the actual command records and screenshots. There are no unresolved reproduced primary-care bugs in tested Chromium flows. Deployment and unavailable vendor/browser paths remain explicit limitations.

The mobile wallet picker was also corrected to recognize a generic injected provider inside a phone wallet browser (`src/wallet.tsx`, mobile detection). A dedicated mobile-provider interaction test prevents a deep-link loop.

An additional accessibility correction gives the ranking grid explicit table, row, column-header and cell relationships (`src/App.tsx`, leaderboard table). The browser suite checks those semantic roles. A screen-reader session remains unperformed.

## Executed commands and actual results

- `node scripts/run.mjs build` (the `npm run build` implementation): production export generated successfully after source changes. Build output was checked for complete relative assets; the SDK's upstream annotation warnings do not stop the build.
- `node scripts/run.mjs typecheck`: TypeScript app, server and test/tool scripts checked with no errors. This uses the same TypeScript compiler and project options as a normal installed checkout; the worker's dependencies were in disposable scratch storage.
- `node scripts/run.mjs test`: actual results in `unit-service-tests.json`; tests cover care, UTC reset, missions, both evolution rewards, corruption, API shapes, verification failures/deadline, real cryptographic signatures, replay, expiry, ranking, persistence and reorgs.
- `node scripts/run.mjs smoke` / `npm run test:server`: five checks pass against the real production server entry and a fresh SQLite database. The service exits after the check.
- `node scripts/run.mjs browser`: actual results in `browser-tests.json`. Chromium care actions, the complete seed game, mission collection, rename, invalid proof input, navigation/download, all-section reflow, unavailable APIs, reduced motion, wallet picker, Sepolia switch, signing, two-user rankings, a second-device save and disconnect pass. WebKit fails to launch because required OS libraries are absent; this is recorded as blocked, not passed.
- `node scripts/run.mjs live`: real official responses and a reconciled confirmed Sepolia receipt; inspect dated `live-integration.json` rather than assuming an old result is current.
- `node scripts/run.mjs live-browser`: real browser-to-API/RPC integration through the optional test transport bridge. The final full run passed: 1,315 work units became 131 confirmed energy, unlocked Young/Cream, granted 20 seeds, blocked duplicate rewards and activated the world celebration. Earlier timeout behavior retained already earned energy and is separately recorded.
- `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste`: ran against the production export using available Playwright Chromium. All 16 checks passed. Final check results are copied to `design-probe.json`. The pinned probe itself is an assignment input, removed by the publisher.

The worker selected an installed browser cache through `PLAYWRIGHT_BROWSERS_PATH` and the probe's Playwright module through `IMD_PLAYWRIGHT`. Live Node network reads used `NODE_USE_ENV_PROXY=1`. The test-only network bridge uses actual upstream responses and is not bundled. No machine credentials, RPC proxy addresses or private configuration are delivered.

Screenshots: `screenshots/hamster-390.png` and `screenshots/hamster-1440.png` are actual final production-export renders. `screenshots/verified-131-energy.png` records the successful live-receipt test using an explicitly backdated test guest save and real chain work; it is not a seeded production player. The mobile screenshot confirms that the room and Feed/Pet/Play/Clean/Sleep controls are visible within the first viewport. Probe screenshots are not a screen-reader or physical-device test.

## Completion and remaining limits

**Repository implementation delivered; publicly shared deployment incomplete.** Source, lockfile, static export, locally runnable service, design documentation and actual check evidence are present. A public shared backend and publication URL were not created in this session. The static frontend marks the missing service unavailable and provides a real connection setting.

Bulk free-RPC verification can time out; it never creates replacement activity or zeroes already verified rewards. Real vendor wallet approvals, mobile handoffs, smart-account signatures, WebKit rendering, screen readers and native zoom are unperformed. NFT minting is intentionally not implemented because the request asks for preparation without invented tokens. The backend is a minimum single-service SQLite implementation, not a claim of production-scale infrastructure.

Submission integrity: the explicit budgets are 4 MiB for `dist/`, 512 KiB for review artifacts and 3.5 MiB for source/configuration. `submission-budget.json` records exact final bytes. `export-check.json` records the local asset-reference check and SHA-256 hashes for every export asset. No dependency/cache directory, database, archive or submodule is included.
