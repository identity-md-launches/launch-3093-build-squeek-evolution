# Squeek Evolution

A playable pixel-art hamster game: care for Mochi, catch seeds, complete daily missions and evolve through real, verified Squeekchain work.

**Delivery status:** the static export is in `dist/`, alongside complete source and a lockfile. A runnable Node/SQLite service supplies shared accounts, cloud saves and global rankings. **No public backend was deployed during this assignment.** The static export honestly shows shared rankings as unavailable until a service is connected. The publication system assigns the public website URL after submission; no public URL was available to report in this run.

## Run it

Node **24 or newer** is required for the backend's built-in SQLite module.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Vite prints the local preview address. `npm run dev` starts the source development server. `dist/` is already built and can be served directly by a static host, including at a gateway subpath. Assets use relative URLs; sections use hash navigation.

For the complete shared game on one origin:

```sh
npm start
```

Open **http://localhost:8787**. The service serves `dist/`, advertises itself to the frontend and persists its database at `runtime/squeek.sqlite`. This local address is a development address, not a claimed public deployment. No account, API key or paid provider is required.

## Play

- **Feed:** spend one seed to restore fullness and some health. **Pet:** improve happiness. **Clean:** restore cleanliness and health. **Sleep / wake:** toggle rest recovery. The room's hamster, bowl, bed and wheel are interactive.
- **Play:** move the basket with the arrow keys, onscreen buttons or pointer to catch eight falling seeds. Collect the result to receive seeds and care XP. Leaving early gives no reward and does not complete a play mission.
- Needs change over time, including while the page is closed; offline decay is capped at eight hours. There is no permanent death. UTC daily missions reset at midnight, give seeds and XP, and can be collected once per day. A new day also gives five seeds.
- Care XP advances the care level. **Evolution Energy is separate.** Ten verified work units give one energy, with remainders accumulated across distinct active rounds. Baby starts at zero; Young requires 100 energy and unlocks Cream plus 20 seeds; Legendary requires 1,000 energy and unlocks Cosmic plus 50 seeds. Crossing both thresholds at once collects both rewards.
- A fresh official `SPINNING` measurement boosts seed-catching rewards from 3 to 5 XP per seed. A successfully verified settlement activates a room celebration and the same play bonus for that session. The blockchain mission requires verified work that day.
- The game saves locally. Connecting and signing links a separate save to that address. Guest and wallet saves remain separate. Shared care saves are explicit through **Settings → Save to cloud / Load cloud save**; loading replaces the local care snapshot. Server revisions reject conflicting device saves. Verified energy lives separately in the shared ledger and is never overwritten by a care save.

## Official data and verification

The game reads all four specified official endpoints, refreshes every 30 seconds while visible and offers manual refresh:

- [Status](https://api.squeekchain.com/v1/status)
- [Seven-day measurement statistics](https://api.squeekchain.com/v1/measurement/stats?range=7d)
- [Settlements](https://api.squeekchain.com/v1/settlements)
- [Core](https://api.squeekchain.com/v1/core)

The current reviewed deployment is **core-sepolia-20261103**, Ethereum Sepolia **11155111**, SqueekCore proxy **`0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4`**. Pins and the minimal read/event ABI are in `src/chain.ts`, taken from the [official deployment record](https://docs.squeekchain.com/developers/), [Core reference](https://docs.squeekchain.com/developers/core/) and [published ABI](https://docs.squeekchain.com/assets/abi/SqueekCore.json). The read RPC is [PublicNode Sepolia](https://ethereum-sepolia-rpc.publicnode.com), with `https://rpc.sepolia.org` as fallback. No private machine RPC appears in the export.

`src/verification.ts` checks the RPC network, successful direct-to-Core transaction and transaction chain ID, canonical block hash, at least **12 confirmations**, EIP-1967 implementation/admin slots, pinned implementation runtime hash, storage layout, ProxyAdmin owner and stream ID. It decodes the actual event discriminants, reconciles `BatchSettled` and `RoundRecorded` against `roundPage()` and `state()` at the receipt's Ethereum block, and reads `blockInfo()` for completed blocks. Block counts come from block units, never work divided by current difficulty. Verification has a 45-second deadline.

API reports alone do **not** award energy. Unsettled measurements remain **LIVE / PENDING**. Receipt-verified work is **CONFIRMED**; missing, failed or stale sources are **UNAVAILABLE**, with unknown readings kept distinct from zero. Invalid or ineligible proofs are **REJECTED**. Only active work settled after pet/profile creation is eligible. Local saved hashes are rechecked before their energy is displayed as confirmed; failed rechecks show unavailable instead of resetting the visible amount to zero. Successful local proofs are retained without a rolling-history truncation. Repeat local proofs are recognized within the verified session; shared claims are independently verified and deduplicated by wallet, Core and round in SQLite.

See [integration report](artifacts/integration-report.md), [live API/RPC evidence](artifacts/live-integration.json) and [validation](artifacts/validation.md). API or RPC outages can delay evolution; ordinary care and play remain available.

## Wallets and shared rankings

The single wallet control supports named **EIP-6963** extensions, MetaMask and compatible EVM wallets, mobile links into MetaMask, Coinbase Wallet, Rabby and Phantom, plus Coinbase Smart Wallet through the official SDK. It detects Sepolia, switches networks with the connector's add-chain fallback, displays the connected address and disconnects. There is no WalletConnect relay or project ID: the provided connector guide specifies the account-free paths above. Rabby's mobile link and third-party app handoffs depend on those wallets.

Ownership uses a signed message, never a transaction, approval, seed phrase or private key. Shared login uses a five-minute, single-use SIWE challenge bound to the service domain, address and Sepolia. The client validates the message before asking the wallet to sign; the server verifies the signature. Session tokens last 24 hours, stay in frontend memory and are stored hashed in SQLite. A reload reconnects the wallet but requires signing in again for the shared session. Disconnect revokes that session. Local-only login uses a fresh, domain-bound message verified through viem.

The shared service computes every score; it accepts transaction hashes rather than client scores or energy. A new shared profile records the confirmed registration frontier. Older settlements cannot be farmed. A unique `(address, core, round)` key prevents duplicate rewards; canonical hashes are reconciled on reads at most every 30 seconds, removing reorged claims. A failed canonical check makes shared rankings unavailable rather than silently inventing a result.

```
score = confirmed energy × 100
      + blockchain achievements × 25
      + evolution stage × 500
```

Stages are 0/1/2. Ties use the wallet address for deterministic ordering. Care XP and local achievements do not affect rank. Global avatars follow the verified evolution stage. Public rankings include up to 100 players; the authenticated personal rank is returned even when outside those 100. Wallet-linked profiles, receipts, revisions and scores survive a process restart. Different wallets can each earn from the same world activity; ownership verification is not a proof of one human per wallet.

Achievement export provides wallet linkage, attributes and proof records for future NFT integration. It explicitly says **not minted**. No token, NFT mint or additional contract is invented.

## Connect a public service

`server/settings.json` contains working local defaults and no secrets. For a publicly hosted instance, set its `publicOrigin` to its actual HTTPS origin, add the actual frontend and service origins to `allowedOrigins`, and keep `databasePath` on persistent writable storage. Put HTTPS in front of the Node process. The service uses one SQLite database; multiple independent instances with different databases are different leaderboards.

A static frontend can connect via **Settings → Game service**, or its host can set `serviceUrl` in `public/runtime-config.json` and rebuild. The default empty value makes no claim that a shared backend exists. `sameOriginService` is enabled automatically only when this project's Node service serves the frontend. The signing message names the selected service's domain.

Main routes are `GET /api/health`, `GET /api/leaderboard`, `POST /api/auth/challenge`, `POST /api/auth/verify`, `POST /api/auth/logout`, `GET/PATCH /api/profile`, `PUT /api/profile/game`, `POST /api/claims`, and `GET /api/achievements/metadata`. Private routes use `Authorization: Bearer …`. Requests are size-limited and rate-limited; CORS uses explicit origins. There is no transaction-sending route.

## Checks and reproduction

```sh
npm test
npm run test:server
npm run test:browser
npm run verify:live
```

The browser checks require Playwright's Chromium binary. On a normal development machine install it with `npx playwright install chromium`; WebKit and its OS libraries are needed for the WebKit check. The suite reports that check as failed if the runtime cannot launch; it does not turn missing browser support into a pass. `node scripts/run.mjs live-browser` exercises real receipt conversion, evolution, duplicate prevention and world events through the production export. `node scripts/run.mjs share` regenerates the PNG share image from `src/assets/share.svg` when Playwright is available.

This worker installed tools only inside disposable `test/scratch/` and used the available browser cache. The worker selected an available Playwright browser cache with `PLAYWRIGHT_BROWSERS_PATH`; live Node requests used `NODE_USE_ENV_PROXY=1`. The optional `SQUEEK_TEST_NETWORK_BRIDGE=1` validation adapter forwards browser requests to the same real official API/RPC through Node because sandboxed Chromium cannot directly reach those public hosts. It uses no fixtures and is not part of the export. Ordinary builds and production do not require that adapter.

Latest worker results: the production build and typecheck passed; all 25 game/service tests, 5 production-server checks, 20 Chromium interaction checks and 16 design-probe checks passed. The live-chain browser test converted 1,315 real work units to 131 energy, reached Young and verified its reward and duplicate protection. The WebKit check was blocked by missing system libraries.

Actual results, commands, browser coverage and limitations are recorded in [artifacts/validation.md](artifacts/validation.md). Tests use isolated databases and generated, in-memory test signing keys. No example users, test scores, fixture settlements, dependencies or caches ship inside `dist/`.

## Project map

`src/` contains the React game, pixel artwork, state rules, API reader, wallet UI and shared receipt verifier. `server/` contains the SQLite service and HTTP host. `scripts/` contains reproducible build and verification tools. `public/` contains required local runtime assets. `dist/` is the complete static export. [DESIGN.md](DESIGN.md) records the implemented design system. [Third-party notices](artifacts/third-party-notices.md) identify bundled artwork, font and design-guide attribution.

Known delivery limits: public URL assignment occurs after submission; no public shared service was deployed here; physical wallet app handoffs, a real MetaMask approval and a Coinbase passkey ceremony were not performed; WebKit could not launch on this machine because system libraries are missing. Local care state is editable by the browser owner and has no influence on authoritative global scoring. The pinned testnet deployment may change, in which case verification intentionally pauses until reviewed.
