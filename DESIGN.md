# Implemented design: Squeek Evolution

## Overview

Squeek Evolution is a cozy virtual pet game for players who want a small, friendly daily routine with a verifiable connection to Squeekchain. Its visual idea is a warm pixel room within a quiet, sage-colored game shell. The room and care actions lead; chain details are disclosed in Evolution and Activity. There is no marketing hero above the playable product.

The system lives in `src/style.css`. Pixel illustration geometry and its independent art palette live in `src/Art.tsx`; the main UI is in `src/App.tsx`. Shared components and patterns retain one visual hierarchy across all six sections.

## Colors

| Token | Implemented value | Role |
| --- | --- | --- |
| `--bg` | `#f4f4ec` | Page background |
| `--surface` | `#fffef9` | Room controls, panels, dialogs |
| `--sidebar` | `#eceee2` | Desktop navigation background |
| `--text` | `#2f3e2f` | Primary copy and headings |
| `--muted` | `#626e5d` | Supporting copy and labels |
| `--line` | `#dde1d3` | Structural separators |
| `--accent` | `#526b45` | Primary actions and links |
| `--accent-hover` | `#435a37` | Primary hover state |
| `--accent-soft` | `#dfe7d3` | Selected navigation and quiet interactions |
| `--error` | `#9a4237` | Error copy and invalid fields |
| `--focus` | `#345b8b` | Two-pixel keyboard focus ring |

Status tags combine literal text with a dot: green for LIVE/CONFIRMED, ochre for PENDING, neutral for UNAVAILABLE and muted red for REJECTED. They never communicate solely by color. Their uppercase status words follow the explicit task requirement. Health, happiness, rest and cleanliness use distinct soft meter colors; meter labels remain dark. Feed uses warm `#f1d7a5` to tie its seed cost to the room's wood and seed palette.

The room has its own cream, tan and sage illustration colors. Night dims only the illustration; there is no application-wide dark theme. Do not reuse art colors as low-contrast interface text.

The final probe measured passing contrast for its resolved solid text/background pairs. Explicit calculations in `artifacts/contrast-pairs.json` include primary text on the page at 10.26:1, secondary text on panels at 5.32:1 and primary action text at 5.86:1. Those calculations do not claim exhaustive image/alpha-state coverage.

## Typography

`DM Sans`, with `sans-serif` fallback, is self-hosted at `public/dm-sans.woff2`. The Google Fonts resource serves the same Latin font file for the requested 400, 600 and 700 weights. CSS uses those three weights and `font-display: swap`. The font's OFL notice is included. No remote font request is needed at runtime.

There are six size tokens: `--text-xs` 12px, `--text-sm` 14px, `--text-base` 16px, `--text-lg` 20px, `--text-xl` 28px, and `--text-display` 36px. Page headings use 28px/700, section headings 16–20px/700, interface copy 14px/400, and supporting labels 12px. The 36px step is used for game effects rather than a second display hierarchy. Inputs use 16px, including on mobile.

Body line-height is 1.5; headings use 1.2. Headings balance, descriptions use pretty wrapping, and prose is capped at 70ch. H1 tracking is -0.03em, H2 -0.02em; ordinary content has natural tracking. Meter values use tabular figures. Accepted hamster names remain complete: `.room-name h2` and `.pet-identity h2` wrap with `overflow-wrap: anywhere`, their flex columns can shrink, and headings grow vertically. Mission text, world messages and Evolution also accommodate the same name; dynamic return buttons have a 100% maximum width and can wrap. Avatars, mood icons and room utilities retain their dimensions. Wallet and contract addresses can wrap where complete values are needed; short display addresses link to their full explorer record.

## Layout

The desktop shell uses a 224px fixed sidebar, a 78px minimum top bar and main content with 36px side padding and a 1480px maximum width. The hamster view has a flexible room and a 270px needs panel, separated by 24px. The room keeps its illustration aspect ratio. Five care controls sit immediately below it. Daily goals and world activity follow in a two-column row. Group spacing is generally 20–28px, with 5–12px inside controls and 16px or more between groups.

Actual CSS breakpoints are 1650, 1220, 1050, 860, 700, 560 and 360px. They progressively narrow the desktop sidebar, reduce content padding and collapse content grids. At 860px the sidebar becomes an icon rail; at 700px the room and needs panel stack. At 560px the rail becomes a six-item, two-row navigation below the mobile header, main padding becomes 16px, the wallet control stays in the first screen and the care actions retain their five-column row. Mobile secondary action hints are removed while the verbs remain. At 360px margins and compact controls tighten further.

Evolution stages use three desktop columns and become readable horizontal rows on narrow screens. Activity metrics use four, then two columns. Achievements use four, three, then two. Leaderboard rows hide the redundant stage column on narrow screens and preserve player, energy, score and numeric rank; top-three trophy decoration disappears on phones. Values and addresses are not clipped to conceal overflow.

Reflow was exercised at 320, 390, 768 and 1440px across all six sections. The 390px first screen contains the pet, the five primary care controls and the wallet control. Native browser zoom, physical mobile devices and RTL mirroring were not tested. The product currently supplies English copy only.

## Elevation & Depth

The interface is deliberately flat. Panels use tonal separation and spacing rather than combined borders and shadows. Structural borders divide navigation, meter groups and list rows. Only the native modal dialog uses a shadow (`0 20px 100px #25331e33`) with a translucent, lightly blurred backdrop. Its modal behavior makes the background inert and restores focus on close.

The room isolates its stacking context: illustration below named hotspots, hamster and temporary reactions above, and noninteractive effects use `pointer-events: none`.

## Shapes

`--radius` is 16px for panels. Buttons use 9px, navigation 7–10px, fields 9px and the room 8px. Icons have small tonal backplates only when they identify a mission or achievement. The pixel hamster and stepped room geometry use crisp edges; illustration clipping is confined to the room's frame. Dialogs have 20px corners, becoming a bottom sheet with rounded top corners on phones.

## Components

| Component / pattern | Source | Behavior and states |
| --- | --- | --- |
| `Hamster`, `Room`, `SeedIcon` | `src/Art.tsx` | Original SVG pixel art. Classic, Cream and Cosmic appearances. Idle, eating, sleeping, running, reaction and cleaning states. Room bed, wheel, bowl and hamster have real button interactions and names. |
| `Meter`, `StatusTag` | `src/App.tsx` | Labeled native progress bars and explicit data-provenance tags. Unknown source readings render as unavailable. Malformed official responses are rejected before rendering, and chart observations with null work remain missing. |
| `.button`, `.text-button`, `.icon-button` | `src/style.css` | Primary, neutral, compact and quiet patterns. Explicit hover, pressed, focus-visible and disabled states. Primary actions are filled sage; feed is warm seed color. |
| `Dialog` | `src/wallet.tsx` | Native `<dialog>` with labeled title, close control, backdrop dismissal, Escape, native focus containment and focus return. |
| `WalletControl` | `src/wallet.tsx` | Connect, pending connector, rejection, connected address, wrong network, ownership verification and disconnect. Wallet rows carry their actual marks. Mobile rows are at least 52px. |
| `MiniGame` | `src/MiniGame.tsx` | Seed-catching field with keyboard, pointer and button inputs. Live score, collection after completion and explicit leave action. Necessary gameplay motion is separate from decorative motion. |
| Mission rows | `src/App.tsx`, `src/game.ts` | Daily progress, required action, seed reward and collectible/collected states. Rewards are idempotent. |
| Verification form | `src/App.tsx`, `src/verification.ts` | Labeled hash input, pending read, rejection, confirmed proof and unavailable/retry state. A failed read cannot add energy. Saved-proof failure exposes **Retry saved proofs**; source refresh and manual verification can retry the complete reconciliation. Checking and partially unavailable sets keep energy unknown. |
| Shared ranking rows | `src/App.tsx`, `server/service.ts` | Real shared players only, semantic table/row/header/cell relationships, numeric ranks, appearance, score and current authenticated personal rank. An unconfigured service has an explanatory unavailable state. A failed ranking read has its own unavailable state with the returned error and **Retry rankings**; the empty-player message is reserved for successful empty reads. Cached personal ranks are hidden during failure or loading. |

Every interactive control uses a native button, link or labeled input. `:focus-visible` has a 2px blue ring and 3px offset; forced-colors CSS uses system Highlight. Form errors stay beside the field. The rename dialog retains errors inside the modal. A stable polite live region announces ordinary game feedback. Keyboard names and focus return were exercised in Chromium; this is not a screen-reader certification.

Animation is opt-in under `prefers-reduced-motion: no-preference`. Pixel animation uses stepped keyframes; high-frequency button feedback uses explicit properties and a 120ms `--ease` transition. Pressed controls scale to 0.96. The visible pause control stops decorative CSS animation, including the logo sprites. No `transition: all` is used. The final probe observed zero endless animations under reduced motion.

## Do's and Don'ts

- Start a new section with the existing shell, page heading and `.surface` or list patterns. Preserve the room as the leading product on the hamster view.
- Reuse semantic colors and the six type sizes. Keep interface copy readable; pixel styling belongs primarily in the artwork.
- Keep one clear filled action per task group and use explicit verbs. Keep status words and source provenance visible.
- Preserve unknown values as unknown. Never seed a leaderboard, label local scores as global, or turn API counters into verified energy.
- Keep complete addresses and error recovery available. Use actual provider marks in the wallet picker.
- Add keyboard paths and a reduced-motion state with any new interaction. Use native modal behavior rather than recreating a focus trap.
- Do not add competing glow, gradient-text or nested-card systems. Extend the existing grids and responsive rules before introducing another layout primitive.

Design guidance was applied from the provided Better Interface reference by Jakub Krehel (MIT); the documentation method is adapted from Paul Bakaus's Impeccable (Apache-2.0). Notices are retained in `artifacts/better-interface-licenses.txt`. Review scope, observed fixes and unperformed checks are recorded in `artifacts/validation.md`.

Final-source cross-check: tokens, component names, breakpoints, local assets and the unknown-observation state were checked against the delivered source after the final corrections. The separate validation report records remaining browser and deployment limits.

Wallet source cross-check: phone browsers without an injected provider get the app handoff links. Inside a wallet browser, both named EIP-6963 and generic injected providers remain connectable.

Final integrity review: local care achievement IDs are validated separately; blockchain achievement states are derived from verified records. Ranking rows expose table, row, header and cell semantics. These final source details were rechecked with the delivered implementation.
