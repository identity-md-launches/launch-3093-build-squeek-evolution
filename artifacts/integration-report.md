# Squeekchain and wallet integration report

This is a worker's implementation and test record, not an independent certification. Checks were run on 7 November 2026 UTC. The dated JSON evidence distinguishes successful reads from failures.

## Verified sources

All four required endpoints returned real responses during the worker's checks: [status](https://api.squeekchain.com/v1/status), [seven-day measurements](https://api.squeekchain.com/v1/measurement/stats?range=7d), [settlements](https://api.squeekchain.com/v1/settlements) and [core](https://api.squeekchain.com/v1/core). Their versions, timestamps, network and identities are recorded in `live-integration.json`. Missing or malformed responses are rejected; null chart observations stay unknown.

The reviewed deployment comes from the [official developer/deployment page](https://docs.squeekchain.com/developers/) and [published SqueekCore ABI](https://docs.squeekchain.com/assets/abi/SqueekCore.json). The implementation uses the [official Core read semantics](https://docs.squeekchain.com/developers/core/).

| Pin | Value |
| --- | --- |
| Release | `core-sepolia-20261103` |
| Network | Ethereum Sepolia, `11155111` |
| Core proxy | `0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4` |
| Implementation | `0x6869d6102696243fd17013ab955d99cd0c522ad3` |
| Runtime hash | `0x65b5780a4fccafedeca1260806364d2bb512b4501c097253f792ae2839565a9c` |
| Layout digest | `0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20` |
| ProxyAdmin | `0x21b3cb8f00d0d47b246a57d04152d6e11d24abb3` |
| Admin owner | `0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d` |
| Stream | `0xa78faebd5aad38b4f90c7f61b9c5c10e8d9b9afe74ebfc2e82ca98b7e57ed562` |
| Read RPC | `https://ethereum-sepolia-rpc.publicnode.com` |

The raw successful snapshot in `verified-settlement.json` verified [round 485's settlement](https://sepolia.etherscan.io/tx/0x9f5eb6fb2633ab681922499bdde6b15b1930424922a0027a0d54639c587e2a4a): 392 work, 44 completed Squeek blocks and 12 confirmations at the check. A later successful snapshot in `live-integration.json` verified [round 489](https://sepolia.etherscan.io/tx/0xefd9301cef0daa4b28057a3fdae77417227d5c97e0751e264c20a5eb536b075a): 570 work, 65 Squeek blocks and 37 confirmations. JSON timestamps identify the observations; later checks may have more confirmations or newer receipts.

## What is verified before awarding energy

`src/verification.ts` validates the transaction hash, RPC and transaction chain IDs, receipt success, direct destination, canonical block, confirmation depth and pinned Core identity. It checks the implementation/admin storage slots, runtime code hash, layout digest, ProxyAdmin ownership and stream. It filters decoded events by their actual event name, then reconciles active rounds with the Core ledger at that exact Ethereum block. `blockInfo()` cross-checks completed block records. The nonce and certified frontier must be consistent.

Work is summed with bigint across unique active rounds. Block counts use cumulative block-unit endpoints. Normal XP, optimistic block projections, unconfirmed settlements and missing API data cannot create Evolution Energy. The game and service have the same verifier. Only settled work after joining is eligible. The shared service also records a confirmed registration frontier and rejects historical claims.

A failed read awards nothing. The UI has pending, rejected and unavailable states and a 45-second verification deadline. Later phases stop after the deadline. Local confirmed proof references are retained and rechecked after reload; unknown rechecks display unavailable. Local repeat submissions are recognized from proofs already verified during the session. The shared service independently verifies claims and deduplicates each `(wallet, Core, round)` inside a database transaction.

## Gameplay observations using actual chain data

The final live-browser check **passed**. Real rounds 489, 485 and 487 supplied 1,315 work units, which produced **131 confirmed energy**, unlocked **Young / Cream**, granted the **20-seed reward**, activated the world celebration and rejected a repeated proof without another reward. `live-browser-integration.json` records the real transaction hashes and successful assertions; `screenshots/verified-131-energy.png` shows the resulting game state.

The check used an isolated guest save dated before those historical receipts so it could exercise eligibility without waiting for future ten-minute rounds. No activity, receipts, global players or scores were fabricated. The sandbox's browser network required the optional test-only Node transport bridge, which forwards requests to their real official API/RPC hosts. It is excluded from `dist/`. The standalone Node verifier succeeded independently.

Earlier bulk-history reads intermittently timed out. One such attempt had already earned 106 energy and unlocked Young; a later failed read displayed UNAVAILABLE while preserving that energy. `rpc-timeout-observation.json` records this failure handling. The final successful run does not claim that free public RPC availability is guaranteed.

Ordinary care, the seed game, mission collection, saves, appearance locking and both evolution reward thresholds are covered by the interaction and unit/service checks. Evolution rewards are idempotent, and a direct Baby-to-Legendary threshold jump gives both the 20- and 50-seed rewards. The animated world celebration and activity-based XP bonus are implemented from verified receipts and fresh official movement respectively. Bulk RPC outages remain a known external limitation; they never cause simulated progress.

## Wallet checks

The app implements EIP-6963 named discovery, generic compatible EVM wallets, Coinbase Wallet/Smart Wallet and mobile wallet-browser links. The provided connector guide's no-relay setup is used. Sepolia switching, sign-in and disconnect were exercised in Chromium with an explicitly named test EIP-1193 provider. Each test signature was produced cryptographically by a fresh in-memory account; no production key, test account or wallet is hard-coded into the game.

The service issues single-use SIWE challenges with five-minute expiry. The client validates domain, URI, account, network, nonce and expiry before signing, and rejects account/network changes during sign-in. The server verifies ownership, stores session-token hashes and revokes sessions on disconnect. Tests cover incorrect signatures, nonce replay, expiry and unauthenticated submissions.

A real MetaMask extension approval, Coinbase passkey ceremony, physical phone handoff and deployed smart-account ownership signature were **not performed**. The Rabby handoff format was cross-checked against its [official mobile link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and uses `_cmd=open-dapp` with the `dapp` query parameter. Their SDK/connectors are implemented; those end-to-end vendor paths are not claimed as independently tested. The app asks for no seed phrase, private key, token approval or game transaction.

## Shared profiles and global rankings

The minimum service is implemented in `server/` with Node's HTTP server and SQLite. It serves the export, provides signed accounts, stores care snapshots with optimistic concurrency, and derives scores from its verified round ledger. There are no seeded players or client-controlled rank/energy fields. Personal rank is refreshed with the global table and remains available beyond the top 100 rows. Global avatars follow verified evolution level.

Isolated tests use two generated signers, distinct sessions and browser contexts. They verify consistent shared rankings, a second device restoring a wallet's cloud save, database restart persistence, conflict rejection, duplicate-round rejection, ignored forged score fields and reorg removal. Production HTTP smoke checks exercise the real entry point with an empty persistent database, including authentication, CORS and static serving. Test databases stay in disposable scratch storage and are not delivered as production data.

## Delivery limits

The project includes the complete static export and runnable shared service. **No public shared backend was deployed during this run.** The publication system assigns the frontend URL after submission, so no public website URL was available to report here. A static-only deployment honestly marks shared accounts/rankings unavailable until the host supplies a service origin. The README documents the complete local service and public-host configuration.

WebKit could not launch because required OS libraries were missing, and the provided browser MCP could not start its configured Chrome. Actual rendered checks were performed with Playwright Chromium. Browser-native zoom, screen readers, physical wallets and physical mobile devices remain untested. NFT metadata and proof export are prepared; no NFT has been minted. Care saves are client-owned game state; only the service's verified ledger affects authoritative global scores.
