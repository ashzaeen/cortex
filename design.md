# Cortex Design System - "Brass"

Version 0.1 - drafted Nov 14, 2026 for HackUTA 2026
Status: direction locked (Brass v1). Decisions D1 to D4 were resolved with the team lead on Nov 14, 2026 (see section 23). Remaining items marked [DECISION] are open and have a recommended default so work is never blocked.

This file is the source of truth for how Cortex looks, feels and moves. Read it fully before touching any UI. If code and this file disagree, this file wins unless an issue says otherwise. If this file is silent, pick the quieter, simpler option and add a note to the "Open decisions" table at the bottom.

Reference prototype (interactive, same content as the demo): https://claude.ai/artifact/2wo2hExJ15ub8oD3WW47Qr
- Board "C2 - Glass v2 Brass" is the chosen look (referred to here as Brass v1). Match it first.
- Board "C5 - Brass v3" is Brass v1 plus upgrades. Only two of them are adopted: the tally ring and mono frame timecodes. The three glass tiers, specular edge and grain are parked (section 6.8).
- Boards A, B, D, E and Brass v2 (C4) are rejected directions. Do not borrow from them except where this file says so.

---

## Table of contents

1. Product context in one page
2. North star and principles
3. Visual identity at a glance
4. Color
5. Typography
6. Materials: glass, matte, elevation
7. Ambient background
8. Layout, spacing, radii, responsive rules
9. iPhone-first and iOS web specifics
10. Navigation and screen map
11. Component specs
12. Motion system
13. 3D and depth
14. Signature moments
15. Content and voice
16. Iconography and imagery
17. Accessibility
18. Performance budget
19. Implementation guide (tokens, snippets, stack)
20. Native iOS companion handoff
21. Definition of done for UI work
22. Do and don't
23. Open decisions

---

## 1. Product context in one page

Cortex is a second brain for Ray-Ban Meta (Gen 1) glasses. The glasses capture moments (what you hear and see). Cortex turns them into a searchable memory, answers questions with proof, and proposes small actions you approve.

What the UI has to carry:

- Capture status: whether the glasses are capturing, always visible, always one tap to pause. This is the trust anchor of the product.
- Modes: Focus, Student, Life, Assist. The mode changes what Cortex listens for and what it proposes.
- Ask your memory: a question, then an answer shown as a verbatim quote with its proof (timestamp, source, ID).
- Suggestions (the action loop): Cortex proposes one action (draft a follow-up, set a reminder, make flashcards). The person approves, Cortex does it, and a receipt records what happened. Everything is undoable.
- Timeline of moments: each moment has a time, a title, a tag (Network, Waiting on, Snapshot, Focus) and a proof.
- Skills: Network (people and promises), Waiting-on tracker, Pre-meeting brief first. More later.
- Call layer (Chert FaceTime): the person can have Cortex call them on FaceTime, show it things on camera, and have it show things back. The in-call video UI is Apple's FaceTime. Our UI covers pre-call setup, live captions and the post-call receipt.

Surfaces: a fully responsive web app (iPhone first), then a native iOS companion app later that must feel like the same product. The desktop dashboard is the same app at a wider width, not a separate product.

Hero demo (about 3 minutes, from the Core Priority Plan): the screens in that flow get pixel-level polish first. Everything else can be rougher but must never look broken.

---

## 2. North star and principles

North star: **a calm, premium window into your day.** It should feel like looking through a pane of glass at your own memories, not like operating software.

The three founding principles (from the team):

1. **iPhone first, fully responsive.** Design at 390 x 844 first. Desktop is the phone layout given more room. A native iOS companion will follow, so choices must translate to it.
2. **Effortless and premium, always.** Few things on screen, each obvious. Premium comes from restraint, precision and material, never from decoration.
3. **Interactive, animated, alive.** Smooth, physical motion wherever it clarifies or delights. 3D only where it elevates the feel and never at the cost of speed or clarity.

Derived principles (use these to settle arguments):

4. **Quote, don't narrate.** Cortex shows what was actually said or seen, in the person's own words, with proof. It does not write chatty prose at you. The answer is a large serif quote, the evidence is mono.
5. **Glass only where it floats.** Glass is for things that float above the world: status, the suggestion you act on, sheets, the dock. Reading surfaces stay calmer. This also protects contrast.
6. **One real-world accent.** Brass is the only accent. It marks what is live, what needs you, and what is proven. If everything is brass, nothing is.
7. **The tally light is privacy.** The ring in the status pill echoes the glasses' capture LED. Capturing means the ring is lit and breathing. Paused means hollow and still. It is never decorative.
8. **Camera language.** Focus pulls, viewfinder corners, timecodes, contact sheets. We borrow from cameras because the product is a camera on your face.
9. **Every action is reversible and receipted.** Approve, then see proof, then be able to undo. Trust is the product.
10. **Direct manipulation.** Things respond under the thumb: drag, press, swipe, scrub. Animations follow gestures (they are driven by them), not just play after them.
11. **Calm by default, rich on demand.** One idea per screen at rest. Depth, detail and delight appear when the person leans in.
12. **Fast is a feature.** A slow premium app is not premium. Respect the performance budget in section 18.

What we are NOT: a chatbot UI with bubbles, a neon "AI" dashboard, a glowing orb, a purple-blue gradient, a productivity app full of boxes.

---

## 3. Visual identity at a glance

Mood words: dark green glass, warm brass light, camera, hardware, quiet luxury, precise.

Think: a Leica viewfinder seen through a visionOS window at dusk.

Four voices, always the same jobs:

| Voice | Font | Job |
|---|---|---|
| Interface | Manrope | Buttons, nav, body text, short UI copy |
| Memory | Fraunces (italic for quotes) | Verbatim quotes, hero questions, big titles |
| Data | JetBrains Mono | Timecodes, IDs, labels, receipts, tags |
| Light | Brass accent | Live state, proof, the one primary action |

Signature motifs (use sparingly, they are the brand):

- The tally ring (status pill)
- Viewfinder corner brackets (selected frames, photo previews)
- Mono timecodes in HH:MM:SS format (example 14:16:04)
- Serif quote marks around verbatim speech
- Soft brass-and-green ambient light behind frosted glass

---

## 4. Color

Dark theme only for now. [DECISION D5: light theme later. Default: not in v1. The whole look depends on light glowing behind dark glass.]

### 4.1 Core palette

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#08130F` | App background, deepest green-black |
| `--bg-deep` | `#050B09` | Silhouettes, deepest shadows, behind sheets |
| `--ink` | `#0B1712` | Text on brass fills |
| `--text` | `#EEE7D4` | Primary text (warm cream, never pure white) |
| `--text-2` | `#DCD5C0` | Secondary body text |
| `--text-3` | `#9FB3A8` | Labels, captions, mono metadata (sage gray) |
| `--text-4` | `#7F9389` | Disabled and decorative only. Never for required info. |
| `--brass` | `#D2A860` | The accent. Live ring, active mode, proof labels, primary button |
| `--brass-hi` | `#E4C382` | Hover or pressed highlight on brass fills |
| `--brass-lo` | `#A9843F` | Pressed shadow side of brass fills |
| `--brass-wash` | `rgba(210,168,96,0.14)` | Soft brass tint behind selected or live items |

### 4.2 Ambient light colors (background only, never for UI elements)

| Token | Hex | Role |
|---|---|---|
| `--amb-green` | `#1F5A48` | Main green glow, top left |
| `--amb-deep` | `#12372E` | Deep green glow, bottom |
| `--amb-brass` | `#8A6A32` | Warm brass glow, right |
| `--amb-glint` | `#D2A860` | Small bright brass highlight near center |

### 4.3 Surface and line colors

| Token | Value | Role |
|---|---|---|
| `--panel` | `rgba(14,32,26,0.58)` | Regular glass tint (Brass v1 panel) |
| `--edge` | `rgba(238,231,212,0.18)` | 1px panel border |
| `--fill-soft` | `rgba(238,231,212,0.10)` | Nested card, selected row, ghost button |
| `--fill-press` | `rgba(238,231,212,0.16)` | Pressed state of soft fills |
| `--divider` | `rgba(238,231,212,0.12)` | Hairlines inside panels |
| `--veil` | `linear-gradient(180deg, rgba(8,19,15,0.35), rgba(8,19,15,0.70))` | Darkening layer over the ambient background so text always has contrast |

### 4.4 Semantic colors (tiny use only)

Status color appears only on small glyphs, dots and short labels. Body text stays neutral. Never rely on color alone: pair with an icon or word.

| Token | Hex | Use |
|---|---|---|
| `--ok` | `#8FC9A6` | Done, verified, synced |
| `--danger` | `#E58A76` | Failed, destructive, error |
| attention | use `--brass` | Needs you, live, waiting |

There is no blue and no purple anywhere in the product. Links are brass or cream with an underline.

### 4.5 Contrast (computed, WCAG 2.x)

Measured against the regular glass panel composited over the worst-case ambient areas.

| Pair | Over base bg | Over green glow | Over brass glow (worst) |
|---|---|---|---|
| `--text` | 14.4 : 1 | 10.4 : 1 | 8.7 : 1 |
| `--text-2` | 12.1 : 1 | 8.8 : 1 | 7.3 : 1 |
| `--text-3` | 8.0 : 1 | 5.8 : 1 | 4.8 : 1 |
| `--brass` text | 8.1 : 1 | 5.8 : 1 | 4.8 : 1 |

Other pairs: `--ink` on `--brass` is 8.3 : 1. `--ok` and `--danger` text are at least 5.0 : 1 on glass.

Rules:
- All required text meets 4.5 : 1 at minimum. Large text (24px and up) meets 3 : 1.
- `--text-3` is the lowest allowed color for required information. It sits at 4.8 : 1 in the worst case, so do not go lighter-on-dim than that, and do not put it on a brass glow without the veil.
- Always keep the `--veil` layer. It is what makes these numbers true.
- Re-run contrast checks any time the ambient colors or panel tints change.

### 4.6 Mode tint (proposed, [DECISION D4b])

Modes should be felt, not labeled with new colors. Instead of new accents, shift the weight of the ambient light:

| Mode | Ambient shift |
|---|---|
| Focus | Baseline: green dominant, brass glint small |
| Student | Slightly cooler: more deep green, brass glint smaller |
| Life | Warmer: brass glow larger, green smaller |
| Assist | Brighter and calmer: ambient lifted 10 percent, veil slightly lighter |

Transition over 700ms with ease-in-out. The accent never changes.

---

## 5. Typography

### 5.1 Families

- **Manrope** (400, 500, 600, 700) for interface and body.
- **Fraunces** (400 regular, 400 italic, 500) for the voice of the memory: hero questions, verbatim quotes, big titles. Use the optical-size axis if available.
- **JetBrains Mono** (400, 500) for data.

Google Fonts link (include `display=swap` and preload the two most used files):

```
https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Fraunces:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap
```

Fallback stacks:

```
--font-ui:    'Manrope', ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', sans-serif;
--font-voice: 'Fraunces', 'New York', ui-serif, Georgia, serif;
--font-data:  'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

Self-host the fonts for production (subset to Latin) to avoid layout shift and third-party dependency on demo day. Add `size-adjust` to fallbacks so swapping does not move layout.

### 5.2 Mobile type scale (design at 390px wide)

| Style | Font | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display quote | Fraunces italic | 30 / 38 | 400 | -0.01em | The answer quote (hero) |
| Question | Fraunces | 26 / 32 | 500 | -0.01em | "What did Priya promise me?" |
| Title | Fraunces | 24 / 30 | 500 | -0.01em | Suggestion title, sheet titles |
| Headline | Manrope | 17 / 24 | 600 | 0 | Row titles, card headers |
| Body | Manrope | 16 / 24 | 400 | 0 | Default text (never below 16 in inputs) |
| Callout | Manrope | 15 / 22 | 400 | 0 | Secondary body, suggestion description |
| Footnote | Manrope | 13 / 18 | 400 | 0 | Notes, helper text |
| Button | Manrope | 15 / 20 | 600 to 700 | 0 | Buttons and pills |
| Label | JetBrains Mono | 11 / 14 | 500 | 0.08em, UPPERCASE | Section labels (ASK YOUR MEMORY) |
| Data | JetBrains Mono | 12 / 16 | 400 | 0.03em | Timecodes, IDs, receipts |
| Proof quote | Fraunces italic | 20 / 28 | 400 | 0 | Quote inside a proof card |

### 5.3 Wider screens

Scale the voice, not the UI. At 768px and up: Display quote 40 / 48, Question 30 / 38, Title 28 / 34. Body and below stay the same. Use `clamp()` for smooth scaling between 390 and 1280, not hard jumps.

### 5.4 Rules

- Title Case for buttons, headings, titles, links, chips, tags, toasts and status messages (decision D19). Full-sentence descriptions and helper text stay as sentences. Verbatim quotes keep their original wording. Mono labels are uppercase.
- Cream (`--text`), never pure white. Never pure black text on glass.
- Max line length about 62 characters for prose. Quotes can run shorter and larger.
- Tabular numerals in mono and wherever numbers align (`font-variant-numeric: tabular-nums`).
- Quotes use curly quote marks and a true apostrophe: “ ... ” and ’. Never straight quotes in verbatim text.
- Use `text-wrap: balance` on titles and quotes, `text-wrap: pretty` on body.
- Honor the user's text size. Use rem units for type, `-webkit-text-size-adjust: 100%`, and test at the largest accessibility size.
- Inputs are at least 16px to stop iOS Safari from zooming on focus.
- Weights are limited to the ones listed. Do not introduce 800 or 900.
- Headlines are light and confident (500), not heavy. Heavy type reads as "app", light reads as "premium".

---

## 6. Materials: glass, matte, elevation

### 6.1 The rule

Glass is for things that float above the world and need your attention or action. Matte is for things you read. Mixing these up is the fastest way to lose both clarity and premium feel.

| Element | Material |
|---|---|
| Status pill | Glass |
| Mode dock | Glass |
| Answer and proof panel | Glass |
| Timeline panel | Glass |
| Suggestion card (the thing you approve) | Glass |
| Bottom sheets and modals | Glass over a dim backdrop |
| Long reading content (receipts list, settings lists) | Matte |
| Toasts | Glass |

Decision D3 (resolved): **pure Brass v1. One glass material everywhere.** Hierarchy comes from size, position, spacing, type and the brass accent, not from several glass recipes. Do not add tiers.

### 6.2 The glass material (Brass v1)

| Property | Value |
|---|---|
| Tint | `rgba(14,32,26,0.58)` (`--glass-tint`) |
| Backdrop | `blur(28px) saturate(130%)` |
| Border | 1px `--edge` |
| Shadow | none on in-flow panels (matches v1). Sheets, modals and toasts overlap content, so they may use `0 16px 40px rgba(0,0,0,0.30)` |
| Corner radius | 28px for panels, pill for status pill and dock, 32px top corners for sheets |

The v1 prototype varied the blur between 24 and 30px by element. That difference is not perceptible, so use 28px everywhere.

For the native app this maps to `.regularMaterial` over the same ambient background, tinted green.

### 6.3 Matte

`background: rgba(14,19,16,0.90)` with `1px solid rgba(255,255,255,0.07)` and a soft shadow. Use for dense or long content where glass would hurt legibility.

### 6.4 Nested surfaces

Inside a glass panel, nested cards (like the proof card) use `--fill-soft` background and `--edge` border, no blur. Never put a blurred layer inside a blurred layer. It is expensive and muddy.

### 6.5 Concentric radii

Inner radius equals outer radius minus the padding between them, never below 8px. A 28px panel with 20px padding holds a card with 8px radius. This one detail separates polished glass from amateur glass.

### 6.6 Elevation and z-index

| Layer | z-index | Contents |
|---|---|---|
| Ambient | 0 | Background scene and veil |
| Content | 1 | Panels, scrolling content |
| Sticky header | 10 | Status pill |
| Dock | 20 | Mode dock |
| Sheet | 30 | Bottom sheets |
| Modal | 40 | Confirm dialogs |
| Toast | 50 | Toasts and undo bars |

Show at most 3 blurred layers on screen at once (usually pill, one or two panels, dock). On the phone Home screen, panels below the fold should not blur until they scroll near the viewport.

### 6.7 Fallbacks

- `@supports not (backdrop-filter: blur(1px))`: use `rgba(14,32,26,0.92)` solid.
- `@media (prefers-reduced-transparency: reduce)`: same solid fallback, no grain.
- Low power or weak GPU (see section 18): drop to solid panels automatically.
- Always write both `backdrop-filter` and `-webkit-backdrop-filter` (Safari).

### 6.8 Parked upgrades (not adopted)

Explored in the prototype board "C5 - Brass v3" and deliberately left out to keep the v1 look. They can be revisited later without changing anything else:

- Three glass tiers (thin 18px blur, regular 28px, thick 40px) for dock, panels and suggestion.
- A 1px specular edge (inner gradient border, bright top-left) via a masked `::before`.
- 6 percent film grain overlay.
- Inner top highlight `inset 0 1px 0 rgba(255,255,255,0.18)`.
- Brass "metal" gradient on the primary button (from Brass v2, rejected).

---

## 7. Ambient background

The background is the light behind the glass. It is what makes glass look like glass. Without it the panels are just dark rectangles.

### 7.1 Brass v1 recipe

A dark `--bg` base, then four soft light shapes, then the veil:

| Shape | Color | Size | Position | Shape |
|---|---|---|---|---|
| Green main | `--amb-green` | 430 x 520 | top 40, left 60 | rounded rect, 28 radius |
| Brass | `--amb-brass` | 520 x 360 | top 120, right 40 | rounded rect, 40 radius |
| Deep green | `--amb-deep` | 640 x 300 | bottom 20, left 300 | rounded rect, 60 radius |
| Glint | `--amb-glint` | 190 x 190 | top 330, left 470 | circle |

The prototype blurs this group by 46px at 95 percent opacity. That is the look to match.

### 7.2 Mobile implementation (important)

A live `filter: blur(46px)` on large shapes is expensive on iPhone. For the web app on mobile:

- Build the ambient from 3 to 4 absolutely positioned elements using `radial-gradient` (no live blur filter) and scale shapes to the viewport (percentages, not fixed px).
- Put it in one fixed layer: `position: fixed; inset: 0; z-index: 0; contain: strict; pointer-events: none`.
- Drift slowly with `transform: translate3d` only: 40 to 60 second loops, at most 40px of travel, `ease-in-out`, alternate direction. Respect reduced motion (static).
- Optional: pre-render the ambient to a single compressed image (WebP or AVIF, about 1200px wide) per mode and crossfade between them. Cheapest and most stable option.

### 7.3 Background is always abstract brass (decided, D4)

Decision D4 (resolved): the background behind the glass is **always the abstract green and brass light** from 7.1. Real photos are not used as backgrounds. (Parked idea: a blurred photo of the selected moment. If it ever returns it must be heavily blurred, veiled, and fall back to this abstract ambient.)

Captured frames still appear, sharp and framed, where they belong: moment thumbnails, the proof card preview, the contact sheet. They are content, not background.

To keep moments feeling alive without photos, each moment owns a **light seed**: a small stable set of values derived from its timestamp (glint position, brass glow bias from 0 to 1, deep-green bias from 0 to 1). The same moment always lights the room the same way.

- Selecting a moment eases the ambient to that moment's seed using the focus pull (blur 52px to 16px, brightness 0.65 to 0.85, over 1400ms ease-snap). Travel of any light shape is at most 80px and colors never leave the four ambient tokens.
- Scrubbing the timeline interpolates between seeds, so the room's light moves like film as you drag.
- Mode changes shift the overall weights (4.6) on top of the seed.
- Reduced motion: crossfade only (200ms), no travel.

---

## 8. Layout, spacing, radii, responsive rules

### 8.1 Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 56, 72`

Tokens: `--s-1` = 4px up to `--s-10` = 72px. Use the scale only. No odd values.

### 8.2 Radii

| Token | px | Use |
|---|---|---|
| `--r-sm` | 8 | Small chips, thumbnails, inner cards in dense areas |
| `--r-md` | 14 | Inputs, rows |
| `--r-lg` | 20 | Nested cards (proof card) |
| `--r-xl` | 28 | Panels |
| `--r-sheet` | 32 | Top corners of bottom sheets |
| `--r-pill` | 999 | Status pill, dock, buttons, chips |

Follow the concentric rule from 6.5.

### 8.3 Touch targets

Minimum 44 x 44px, recommended 48px for primary actions. Space between adjacent targets at least 8px. Primary buttons are 48px high pills.

### 8.4 Breakpoints and behavior

Design mobile first. Write base CSS for phones, then enhance with `min-width` queries. Use container queries for components where possible.

| Width | Name | Layout |
|---|---|---|
| 320 to 389 | Small phone (SE, mini) | Same as phone, tighter gutters (16), smaller display type, never horizontal scroll |
| 390 to 767 | Phone (primary) | Single column, 16 gutters, bottom dock, sheets from bottom |
| 768 to 1023 | Tablet | Two columns (answer left, suggestion and timeline right), dock stays at bottom center, sheets become centered panels |
| 1024 and up | Desktop | The Brass v1 dashboard: floating top pill, two-column grid, dock at bottom center, max width 1280 |

Desktop is the Brass v1 board you can see in the prototype. Phone is that same content stacked in this order: status pill, timeline, suggestion, answer and proof, dock (decision D20). On laptops the timeline is the full-height left column; the suggestion and the answer share the right column, and the whole app fits one screen.

### 8.5 Page structure on phone

- Gutters: 16px (20px at 430px and up).
- Vertical gap between panels: 16px.
- Panel padding: 20px (24px on tablet and up, 32px to 36px on desktop).
- Bottom padding of the scroll area: dock height + safe area + 24px so nothing hides behind the dock.
- Content width never exceeds 1280px on desktop and is centered.

---

## 9. iPhone-first and iOS web specifics

This is a web app that must behave like a native app on an iPhone. Get these right early.

### 9.1 Meta and PWA

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#08130F">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
```

- Manifest: `display: standalone`, `background_color` and `theme_color` both `#08130F`, icons 192 and 512 plus a maskable version.
- Provide splash screens or a fast in-app splash that matches `--bg` so there is no white flash.

### 9.2 Safe areas

- Pad with `env(safe-area-inset-top|right|bottom|left)`. The status pill sits below the Dynamic Island area. The dock sits above the home indicator: `bottom: max(12px, env(safe-area-inset-bottom))`.
- Reference iPhone sizes to test: 375 x 667 (SE), 390 x 844 (15 and 16), 393 x 852 (Pro), 430 x 932 (Plus and Max), plus landscape basics.

### 9.3 Viewport and scrolling quirks

- Use `dvh` and `svh`, never `100vh`, for full-height layout.
- Set `html, body { background: var(--bg) }` so rubber-band overscroll never reveals white.
- `overscroll-behavior: none` on the app shell, `contain` on inner scrollers and sheets.
- `-webkit-tap-highlight-color: transparent`. Provide our own pressed states.
- `touch-action: manipulation` on controls to remove double-tap zoom delay.
- Use `-webkit-overflow-scrolling: touch` only if needed on old iOS. Prefer native scrolling everywhere.
- `position: fixed` elements move when the keyboard opens. Use `visualViewport` to keep sheets and the ask input above the keyboard.
- Backdrop blur on iOS Safari needs `-webkit-backdrop-filter`. Test on a real device. The simulator and desktop lie about performance.
- Do not use hover as the only way to reveal anything. Phones have no hover.

### 9.4 Gestures

- Never hijack the iOS back-swipe from the left edge or the home indicator swipe.
- Sheets: drag handle at the top, detents (peek, half, full), velocity-based snapping, rubber banding past the ends.
- Horizontal swipe on content to change mode [DECISION D8, default: yes with the dock indicator following the finger, plus tap on the dock as the explicit path].
- Long-press a moment to peek at its proof without navigating.
- Pull down on the status pill for quick controls (pause, mode, call). [Nice to have]

### 9.5 Haptics and sound

iOS Safari does not support the Vibration API, so the web app has no haptics. Design the moments anyway (see section 20) so the native app can add Taptic feedback without redesign. Sound is off by default. [DECISION D9, default: no sound in v1.]

---

## 10. Navigation and screen map

Decision D1 (resolved): **one primary home screen, modes in the dock, everything else as sheets.** Brass v1 uses the bottom dock for modes and anchors in the top bar for sections. On a phone the structure is:

- The dock (bottom, thumb zone) switches modes: Focus, Student, Life, Assist. This is the signature control and is always visible on Home.
- The Home screen is a single vertical flow: status pill, answer and proof, suggestion, timeline. No tab bar competing with the dock.
- Ask is the large question surface at the top of the answer panel. Tapping it opens the Ask sheet (voice first, text second).
- Timeline expands into a full sheet. Moments open as a detail sheet.
- People (Network) and Waiting-on open as sheets from chips on Home and from a person or promise mentioned in an answer.
- Settings and privacy open from the status pill (tap the pill).
- Call opens as a sheet from a call button in the status pill row or a suggestion.

Considered and rejected: a 4-tab bar (Now, Ask, Timeline, People) with modes as a segmented control. Simpler, but it loses the dock signature and splits attention.

### 10.1 Screen list (iPhone)

| Screen | Type | Priority | Notes |
|---|---|---|---|
| Home | Root | P0 | Status, answer and proof, suggestion, timeline, dock |
| Ask | Sheet | P0 | Voice and text input, recent questions, live answer |
| Moment detail | Sheet | P0 | Frame, quote, proof, linked actions |
| Suggestion approve and receipt | Inline plus sheet | P0 | The action loop, see 11.7 |
| Timeline (full) | Sheet | P1 | Contact sheet view, scrubber, filters by tag |
| Person (Network) | Sheet | P1 | Name, company, last seen, promises, notes |
| Pre-meeting brief | Sheet | P1 | Person, last time, open promises, one suggested opener |
| Waiting-on | Sheet | P1 | List of promises with due chips |
| Call Cortex | Sheet | P1 | Pre-call setup, persona and framing, captions, receipt |
| Settings and privacy | Sheet | P1 | Pause, what is captured, delete, connections |
| Pairing and onboarding | Flow | P2 | Connect glasses, permissions, first capture |
| Receipts history | Sheet | P2 | All actions and proofs |

### 10.2 Home wireframe (390 x 844)

```
+--------------------------------------+
| safe area top                        |
|  (o) Cortex  REC / FOCUS   [Pause]   |  status pill, glass, sticky
|                                      |
|  +--------------------------------+  |
|  | ASK YOUR MEMORY            (mic)|  |  answer panel, glass
|  | What did Priya promise me?     |  |  Fraunces 26
|  |                                |  |
|  | "I'll send you the deck        |  |  Fraunces italic 30, the hero
|  |  Friday."                      |  |
|  | m2 - 14:16:04 - glasses mic    |  |  mono, brass
|  | [ proof card (nested soft) ]   |  |
|  +--------------------------------+  |
|  +--------------------------------+  |
|  | SUGGESTED IN FOCUS             |  |  suggestion, glass
|  | Draft a follow-up to Priya     |  |  Fraunces 24
|  | body copy                      |  |
|  | ( Approve and send )           |  |  brass pill, 48px
|  +--------------------------------+  |
|  +--------------------------------+  |
|  | TIMELINE                       |  |  timeline, glass
|  | [frame] 14:14  Met Priya       |  |
|  | [frame] 14:16  Deck Friday  *  |  |
|  | Waiting on: Priya, the deck    |  |
|  +--------------------------------+  |
|                                      |
|  ( Focus  Student  Life  Assist )    |  dock, glass, fixed
| safe area bottom                     |
+--------------------------------------+
```

Behavior: the status pill collapses to ring plus mode label after 40px of scroll. The ambient background drifts at 0.2x scroll speed. The dock stays fixed.

---

## 11. Component specs

Each component lists purpose, anatomy, states and mobile and desktop notes. Build them as reusable components with tokens, not one-offs.

### 11.1 Status pill

Purpose: the privacy and capture anchor. Always visible.

Anatomy: tally ring (18px), wordmark "Cortex" (Manrope 700, 18px, -0.01em), mono status text (`REC / FOCUS`), and a pause button (pill, soft fill) on the right.

States:
- Capturing: ring is brass with a 6px brass dot that breathes (opacity 1 to 0.35, 2.4s ease-in-out loop). Text `REC / <MODE>`.
- Paused: ring is `--text-3`, dot static, text `PAUSED`, ambient dims 15 percent, button reads "Resume capture".
- Disconnected (glasses offline): ring hollow, text `GLASSES OFFLINE`, button reads "Reconnect".
- Error: ring `--danger`, text states the problem.

Rules: tapping the pill (not the button) opens Settings and privacy. Pause is one tap, no confirm, instantly reversible. Sticky at top with safe-area padding. Height 56px on phone.

### 11.2 Mode dock

Purpose: switch mode. The signature control.

Anatomy: floating pill (glass), four segments (Focus, Student, Life, Assist), a moving active indicator.

States: the active segment is a brass fill with `--ink` text, weight 600. Inactive segments are transparent with `--text`. Pressed: scale 0.97 and `--fill-press`.

Behavior: the brass indicator slides between segments with a spring (stiffness 380, damping 30) and slightly stretches in the direction of travel. Content crossfades with an 8px rise (see 12). Ambient shifts per 4.6. Minimum segment width 76px, height 48px. On narrow screens (below 360px) reduce padding but keep labels. Do not use icons only: labels stay.

### 11.3 Ask surface

Purpose: ask your memory. Voice first (the glasses are audio first), text second.

Anatomy: mono label `ASK YOUR MEMORY`, the question in Fraunces 26, a mic button (48px, soft fill), recent questions as chips.

States: idle (placeholder example question, a real example such as "What did Priya promise me?"), listening (the ring in the mic pulses, live transcript types in), thinking (see 12.5, brass shimmer sweep across the question, no spinner), answered, empty (no matches, offers to search by time or person), error.

Rules: the input is at least 16px. After the question is submitted the keyboard dismisses and the answer arrives with the focus-pull and quote animation.

### 11.4 Answer and proof card

Purpose: show the answer as a quote with its evidence.

Anatomy:
1. The verbatim quote, Fraunces italic 30/38, curly quotes. If there is no verbatim quote (for example a snapshot), show the most literal evidence (the text read from the board) in the same style.
2. Source line in mono brass: `m2 - 14:16:04 - glasses mic`.
3. Proof card (nested, `--fill-soft`, `--r-lg`): label `PROOF m2 - 14:16:04` in brass mono, the evidence line, a short note in `--text-3`, and a viewfinder-framed thumbnail when a frame exists.

Rules: one primary quote per answer. If the answer has several parts, show them as a short stack of quotes, each with its own source line. Never paraphrase inside quote marks. If Cortex is inferring rather than quoting, say so with an `INFERRED` mono tag and no quote marks.

States: loading (skeleton, see 12.5), single, multiple, none found, low confidence (adds `LOW CONFIDENCE` tag and asks for a clarifying detail).

### 11.5 Moment (timeline row and contact-sheet frame)

Purpose: one captured moment.

Row anatomy (phone): thumbnail (56 x 40, `--r-sm`), title (Manrope 600 15px), mono line `14:16:04 - m2`, tag on the right (brass 12px: Network, Waiting on, Snapshot, Focus). Selected row: `--fill-soft` background and the thumbnail gets viewfinder corner brackets in brass.

Contact-sheet frame (grid view in the full timeline): 16:10 frame with viewfinder brackets when selected, mono timecode under it in brass, title in 13px.

States: default, selected, pressed (scale 0.98), loading (skeleton frame), failed to load frame (placeholder with ring icon).

Interaction: tap selects and triggers the focus pull. Long press peeks the proof. Swipe a row left for secondary actions (Add to waiting-on, Delete). Delete always asks to undo, never confirms with a dialog.

### 11.6 Timeline panel and scrubber

Phone: a short list of today's moments in the Home panel, "See all" opens the full timeline sheet. Full timeline: a contact-sheet grid with a horizontal time scrubber along the bottom (dragging scrubs through frames like film, the ambient light eases between moment seeds, mono timecode updates live). Filters are tag chips above the grid. Footer line: `Waiting on: Priya, the deck` with a mono `DUE FRI` chip.

### 11.7 Suggestion card and action loop (the trust centerpiece)

Purpose: Cortex proposes one action, the person approves, a receipt proves it, undo is always available.

Anatomy: mono label `SUGGESTED IN FOCUS`, title in Fraunces 24, one-paragraph description in callout, the primary button (brass pill, 48px, label is the verb phrase such as "Approve and send"), optional "Edit" as a ghost button.

States and transitions:

1. Suggested: as above.
2. Approving: the button morphs into a brass progress ring (about 600ms, indeterminate if unknown), label fades out.
3. Done: the ring completes into a check. The card shows the done message in brass (for example "Sent to Priya at Acme"), a mono receipt line (`RECEIPT r_0142 - 14:21:08 - from m2`), and an Undo button (soft pill).
4. Undoable window: Undo stays until the receipt's `undo.until` from the server (decision D17), with a thin countdown line, then settles into the receipt history. Undo reverses the action when possible and says so plainly.
5. Failed: danger glyph, plain message ("Couldn't send. Nothing was changed."), a Retry button.

Rules: one primary action per card, never two brass buttons on screen at once. The suggestion never auto-runs. The receipt must always state what happened, when, where it went and which moment caused it.

### 11.8 People (Network) card

Anatomy: initials in a ring (avatar), name (Manrope 600 17), company (callout, `--text-2`), mono `LAST SEEN 14:14 TODAY`, then a short list of open promises each with a due chip, then a notes line. Actions: "Brief me" (opens pre-meeting brief), "Draft follow-up".

### 11.9 Pre-meeting brief

A sheet that reads like a briefing card: who they are, the last time you met (with a quote), open promises both ways, one suggested opener. Three short sections, labeled in mono. Aim for under 8 seconds of reading.

### 11.10 Waiting-on tracker

List of promises others made to you: person, what, due date chip (mono uppercase, brass if due within 48 hours, `--text-3` otherwise, `--danger` when overdue with the word OVERDUE). Swipe to mark received. Each row links to its source moment.

### 11.11 Call Cortex (Chert FaceTime layer)

Context: calls run through FaceTime via Chert. The call video UI is Apple's FaceTime, not ours. Our UI owns three moments.

1. Pre-call sheet: a "Call me" primary button (outbound call), the verified number shown as masked text, a persona selector (how Cortex introduces itself), and framing controls for what Cortex shows back on video: chips such as Notes, Scene, Brief (the options come from the call layer features in the PRD). Show the hard limits honestly: a 5:00 cap shown as a ring, one call at a time.
2. Live companion: while the call runs, the app shows live captions (mono timestamps, quotes in Fraunces italic), a ring countdown from 5:00, and what Cortex is currently showing on video.
3. Post-call receipt: the call becomes a moment in the timeline with quotes, any action proposed, and a receipt.

Ring animation on connect: three concentric brass rings expand and fade (ripple, 1.6s, ease-out), once per connection, never looping.

### 11.12 Buttons

| Type | Style | Use |
|---|---|---|
| Primary | `--brass` fill, `--ink` text, Manrope 700, 48px, pill | One per view, the main action |
| Secondary | `--fill-soft` fill, `--edge` border, `--text`, 44px, pill | Undo, Pause, Edit |
| Ghost | transparent, `--text`, 44px | Tertiary |
| Icon | 44px circle, `--fill-soft` | Mic, close |
| Destructive | `--fill-soft` with `--danger` text | Delete and forget |

States: pressed (scale 0.98, brightness 1.06 for primary, `--fill-press` for soft), focus-visible (2px `--brass` outline, 3px offset), disabled (avoid it: keep enabled and explain on tap. If unavoidable, 45 percent opacity and `aria-disabled`).

The Brass v1 primary is a flat brass fill. Brass "metal" gradient and highlights (from Brass v2) are NOT adopted.

### 11.13 Chips and tags

Filter chips: 36px high, pill, `--fill-soft`, selected uses `--brass-wash` with brass text and a brass border. Tags (read-only): mono 11px uppercase text in brass or `--text-3`, no background.

### 11.14 Bottom sheet

Glass over a dim backdrop, top radius `--r-sheet`, a 36 x 5px drag handle at 10px from top, backdrop dim `rgba(5,11,9,0.55)`. Detents: peek (about 30 percent), half (about 60 percent), full (about 92 percent, leaves a sliver of the app visible). Content scrolls only when the sheet is at full. Closing: drag down past 30 percent or velocity above 600px/s, tap the dim, or Escape on desktop. Keyboard-aware via `visualViewport`.

### 11.15 Toast and undo bar

Glass, pill or 20px radius, appears above the dock, auto-dismisses after 4s (10s when it carries Undo). One at a time. Never stacks. Announced politely to screen readers.

### 11.16 Empty, loading and error states

- Empty: an invitation, never an apology. Example for a new day: "Nothing captured yet." with a mono line `Wear your glasses and say hi.` and the ring idle. No illustrations of sad robots.
- Loading: skeleton blocks with the brass shimmer sweep (see 12.5), no spinners except the approve progress ring. Never block the whole screen.
- Error: say what happened and what is safe, then offer one action. No raw error strings, no blame. "Couldn't reach your glasses. Your memories are safe. Reconnect."
- Offline: a thin banner in the status pill state, previously loaded memory stays readable.

### 11.17 Settings and privacy

A matte list (readability first). Sections: Capture (pause, schedule, quiet places), What Cortex keeps (retention, delete everything for a day, export), Connections (glasses, calendar, email, FaceTime line), Appearance (reduce motion, reduce transparency, text size follow system). Every destructive action has an undo window or a clear confirmation with consequences stated.

---

## 12. Motion system

Motion is a core part of the premium feel. It must be physical (springs, momentum, gestures), purposeful (explains cause and effect) and quiet (never decorative loops except the tally breath and ambient drift).

### 12.1 Principles

1. **Gesture-driven.** Sheets, dock indicator, scrubber and swipes track the finger and release with velocity. Do not play canned animations over a drag.
2. **Spring first.** Use springs for anything that moves in response to touch. Use cubic-bezier easing for fades and state changes.
3. **Choreograph, do not collide.** Stagger entrances (30 to 40ms between items, max 6 items). Exit faster than enter.
4. **Transform and opacity only.** Animate `transform` and `opacity`. Avoid animating `width`, `height`, `top`, `left`, `box-shadow` or `filter: blur` on large areas.
5. **Interruptible.** Every animation can be interrupted and reversed without jumping.
6. **Focus pull is our signature.** Scene changes go from soft blur to settled, like a lens finding focus, instead of a generic fade.
7. **Reduce motion respects the person.** See 12.7.

### 12.2 Tokens

```css
--dur-instant: 100ms;   /* press feedback */
--dur-fast:    160ms;   /* hover, small state changes */
--dur-base:    280ms;   /* most transitions */
--dur-slow:    480ms;   /* panels, sheets settle */
--dur-scene:   1400ms;  /* focus pull */

--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* entrances */
--ease-in:     cubic-bezier(0.7, 0, 0.84, 0);     /* exits */
--ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);    /* state changes, ambient */
--ease-snap:   cubic-bezier(0.2, 0.8, 0.2, 1);    /* focus pull, tight settle */
```

Spring presets (for a JS spring library):

| Name | Stiffness | Damping | Mass | Use |
|---|---|---|---|---|
| snappy | 380 | 30 | 1 | Dock indicator, button morphs |
| gentle | 220 | 26 | 1 | Panels entering, sheet settle |
| bouncy | 300 | 18 | 1 | Success check, receipt stamp (use rarely) |

### 12.3 Choreography catalog

| Moment | What happens | Timing |
|---|---|---|
| App open (ignition) | Screen starts dark. The tally ring draws in and ignites brass (300ms). Ambient fades up while focus-pulling from blur 52px to 16px (1400ms, ease-snap). Status pill slides down 12px and fades in. Panels rise 16px and fade in with 40ms stagger starting at 350ms. Dock rises last. | About 1.4s total, interactive from 600ms |
| Mode switch | Dock indicator springs to the new segment. Panel contents crossfade with an 8px rise (200ms out, 280ms in). Ambient light shifts per 4.6 over 700ms. Suggestion card swaps content with a quick vertical slide. | About 300ms felt, 700ms ambient |
| Select moment | Ambient does the focus pull and eases to that moment's light seed (7.3): blur 52px to 16px, brightness 0.65 to 0.85, scale 1.1 to 1.03 over 1400ms ease-snap. The proof card and quote crossfade in 280ms. Viewfinder brackets draw in on the thumbnail (160ms). | 1400ms scene, 280ms content |
| Ask submit | Question stays. A brass shimmer sweeps once across the answer area (600ms). The quote arrives line by line (40ms per line, rise 8px) with the source line last. | About 900ms |
| Approve | Button morphs to a progress ring (200ms spring), completes to a check (bouncy, 300ms), card swaps to the done state, receipt line types in (mono, 24ms per character, capped at 400ms), undo bar slides up. | About 1s |
| Undo | Receipt line strikes through, the card eases back to its suggested state (280ms ease-inout). | 280ms |
| Pause capture | Ring collapses from filled to hollow (240ms), dot stops, ambient dims 15 percent (480ms). Resume reverses it. | 480ms |
| Sheet open | Dim fades 200ms. Sheet rises with the gentle spring and follows the finger on drag. Content inside fades in at 120ms delay. | About 400ms |
| List entrance | Items rise 12px and fade, 30ms stagger, max 6 items animate, the rest appear instantly. | 280ms each |
| Call connect | Three brass rings ripple out of the call button (1.6s ease-out, once). Status pill shows `ON CALL`. Captions begin typing at the first word. | 1.6s |
| Delete moment | Row collapses (height via grid-template-rows trick or FLIP) over 240ms, undo toast rises. | 240ms |

### 12.4 Micro-interactions

- Press: scale 0.98 with 100ms ease-out, release with a small spring back. Primary adds brightness 1.06.
- Hover (desktop only): lift 1px and edge brightens 10 percent, 160ms.
- Focus ring: appears instantly, no animation.
- Tally breath: opacity 1 to 0.35, 2.4s ease-in-out infinite, only while capturing.
- Numbers and times that change (timecode, countdown) cross-fade or roll per digit, never jump.

### 12.5 Loading and thinking

No generic spinners. Use skeletons with a brass shimmer: a 40-degree highlight band of `rgba(210,168,96,0.10)` sweeping left to right over 1.6s, ease-inout, looping. For thinking after an Ask, one shimmer sweep across the question line and a mono status line (`SEARCHING 14 MOMENTS`) that updates truthfully. Never show fake progress.

### 12.6 View transitions

Use the View Transitions API where supported for shared element moves (a timeline thumbnail expanding into the moment detail frame, the suggestion card growing into its receipt). Always provide an instant fallback. Keep transitions under 400ms.

### 12.7 Reduced motion

When `prefers-reduced-motion: reduce`:

- Replace the focus pull with a 200ms crossfade.
- Disable ambient drift, parallax, tilt, shimmer and 3D.
- Keep the tally state change but remove the breathing (static lit ring).
- Replace springs with 160ms fades.
- Gestures still work (dragging a sheet is direct manipulation, not decoration).

### 12.8 Tooling [DECISION D6, D15]

Recommended default: **Motion (motion.dev, formerly Framer Motion) for React** for springs, gestures, layout animations and shared-element transitions, plus plain CSS for ambient, shimmer and the tally. GSAP is an acceptable alternative for timeline-style sequences. Do not mix three libraries.

---

## 13. 3D and depth

3D is welcome only where it elevates the feel. The test: does it make the product feel more spatial, more camera-like or easier to understand? If it is only decoration, cut it. 3D must never delay content, block input, or exceed the performance budget.

### 13.1 Approved ideas, in priority order

| # | Idea | Description | Tech | Effort | Priority |
|---|---|---|---|---|---|
| 1 | Layered depth and parallax | Panels sit at different z depths. Subtle parallax between ambient, panels and dock on scroll. On tilt (phone) or pointer (desktop), specular edges and shadows shift slightly (max 4 degrees, max 6px). | CSS 3D transforms, `perspective: 1200px`, DeviceOrientation (iOS asks permission) with scroll fallback | Low | P1 |
| 2 | Contact-sheet carousel | The full timeline as a 3D film strip: frames sit on a gentle arc, the centered frame faces you, neighbors rotate away (rotateY up to 28 degrees) and dim. Scrubbing is a drag. | CSS 3D transforms or three.js if needed | Medium | P1 |
| 3 | 3D glasses on pairing | A generic wayfarer-style glasses model (our own, not a trademarked Ray-Ban or Meta model) rotates with drag during pairing and onboarding, with the tally LED glowing on the temple. | `model-viewer` or react-three-fiber, lazy loaded, compressed glTF under 400KB | Medium | P1 |
| 4 | Memory graph | The Network skill as a 3D force graph: people as small glass nodes connected by brass lines, drag to orbit. A demo wow moment. | three.js or `react-force-graph-3d`, lazy loaded | High | P2 |
| 5 | Receipt stamp | A subtle embossed brass seal stamps onto the receipt at approval, with a small 3D tilt. | CSS 3D and a pre-rendered seal | Low | P2 |

### 13.2 Rules

- Lazy load anything over 30KB. 3D chunks load after first interaction or when scrolled near.
- Gate by capability: skip 3D when `prefers-reduced-motion`, low power mode, low memory (`navigator.deviceMemory` below 4 where available), or the first frame takes over 100ms.
- Always have a good static fallback (a still image or the flat layout). The flat version is the baseline experience, 3D is the enhancement.
- 60 fps on iPhone 12 or newer. If you cannot hold it, cut the effect.
- Keep it consistent with the materials: glass and brass, dark green world, no cartoon shading, no random floating shapes, no glowing orbs.
- Trademark safety: do not use Meta or Ray-Ban logos or exact product models in 3D assets or marketing.

Decision D2 (resolved): **medium.** Ship #1 (layered depth), #2 (3D contact-sheet carousel) and #3 (3D glasses on pairing). #4 (memory graph) is a stretch goal only after the hero demo path is flawless. #5 is optional. See the Core Priority Plan: polish the hero demo path first, and cut 3D before cutting reliability.

---

## 14. Signature moments

The handful of moments people will remember and describe. Protect them. Build them to a higher bar than everything else.

1. **Ignition.** App open: the ring lights, focus pulls, glass rises. Two seconds that sets the tone.
2. **Focus pull on select.** Tap a moment and the whole room refocuses and re-lights to that moment's light seed.
3. **The quote.** Ask a question and your own words appear in large serif with a timecode. It feels like evidence, not AI chat.
4. **Approve and receipt.** The button becomes a ring, then a check, then a receipt with proof and undo. Optional brass seal stamp.
5. **Mode light.** Switching modes slides the brass indicator and gently re-lights the room.
6. **Scrub the day.** Dragging along the timeline scrubs through frames like film.
7. **The call.** Ripple rings, captions typing in, a countdown ring, then a receipt after.

For HackUTA: rehearse these on a real iPhone, on the real network, with real data until each one is flawless. A demo that does these seven things perfectly beats a demo with thirty features.

---

## 15. Content and voice

Voice: calm, precise, warm, brief. A smart friend who has perfect notes. Never gushing, never robotic.

Rules:

- Title Case for UI labels and buttons (decision D19): "Approve and Send", "Pause Capture", "See All". Full sentences stay sentences; verbatim quotes are never changed; all caps only in mono labels.
- Lead with the answer. One idea per sentence. Short.
- Use the person's own words in quotes. Do not rewrite what they said.
- Buttons are verb-first, 1 to 3 words: "Approve and send", "Set reminder", "Undo", "Pause capture".
- Use contractions. Active voice.
- No exclamation marks in system copy.
- Banned words: seamless, unlock, leverage, magic, supercharge, "AI-powered" in UI, "successfully", "please", "simply", "just".
- Never say "I" in system UI. Cortex speaks through facts and quotes, not first person.
- Use hyphens, never em dashes or en dashes, in all copy and in documents.
- Times: human text uses 12-hour with AM and PM (2:16 PM). Data and timecodes use 24-hour HH:MM:SS in mono (14:16:04). IDs are lowercase `m2`, receipts `r_0142`.

Examples:

| Situation | Write | Do not write |
|---|---|---|
| Action done | Sent to Priya at Acme | Your email was successfully sent! |
| Empty day | Nothing captured yet. | Oops, it's empty here! |
| Glasses offline | Couldn't reach your glasses. Your memories are safe. | Error: connection failed |
| Not found | No match for that. Try a person or a day. | I couldn't find anything. |
| Privacy | Capture is paused. Nothing is being recorded. | You are in private mode |
| Low confidence | Not sure. This might be what you mean. | I think maybe... |

Privacy copy must be literal and calm. Say what is captured, where it lives and how to delete it. Never use fear or hype.

---

## 16. Iconography and imagery

### 16.1 Icons

- Line icons, 1.5px stroke at 24px, rounded caps and joins. Recommended set: Lucide or Phosphor (Light). Use SF Symbols in the native app with matching weights.
- Icons inherit text color. Brass only on active or live states.
- Custom icons: the tally ring (status), viewfinder brackets (selection), a mic with a ring (ask). Keep them geometric and simple.
- Always pair icons with a text label unless the meaning is universal (close, mic).

### 16.2 Photography and thumbnails

- Real captured frames only in the product. No stock photos.
- Frames are displayed in 16:10 or 16:9 with `--r-sm` radius and a 1px `rgba(255,255,255,0.10)` inner border.
- Until real frames exist, use abstract placeholders in the same green and brass palette (see prototype), clearly neutral.
- Captured photos are never used as the app background (section 7.3). Show them sharp only inside frames. Handle faces and screens carefully.

### 16.3 Illustration

Avoid illustration. The product's imagery is the person's own memory plus light and material.

### 16.4 Logo and app icon [DECISION D11]

Wordmark: "Cortex" in Manrope 700, tracking -0.01em, cream. App icon (proposal): deep green `--bg` background with a soft brass-green glow and a single brass ring (the tally) with a small brass dot, nothing else. Needs final art.

---

## 17. Accessibility

Premium means everyone can use it.

- Contrast: see 4.5. Keep the veil.
- Targets: at least 44px. Spacing at least 8px.
- Text size: supports the system text size up to 200 percent without losing content (use rem and flexible layouts). Test at the largest iOS accessibility size.
- Motion: see 12.7. No flashing above 3 flashes per second ever.
- Transparency: `prefers-reduced-transparency` gives solid panels.
- Color is never the only signal. Status uses icon plus word plus color.
- Focus: visible 2px brass outline with 3px offset on every interactive element. Logical order. Trap focus in modals and sheets and return it on close.
- Screen readers (VoiceOver): every control has an accessible name. Mode dock is a `role="radiogroup"` or tablist with the selected state announced. Status changes (capturing, paused, action done) announce through `aria-live="polite"`. Quotes are `blockquote` with the source in a `cite`. Timecodes include a readable label (aria-label "2:16 PM").
- Decorative layers (ambient, grain, brackets) are `aria-hidden`.
- Voice first does not mean voice only: everything possible by voice is possible by touch and keyboard, and the reverse.
- Captions: any audio Cortex plays is also shown as text.
- Keyboard (desktop): full navigation, Escape closes sheets, `1` to `4` switch modes, `/` focuses Ask, `P` toggles pause.
- Language: set `lang="en"`. Do not hard-code strings in a way that blocks localization later.

---

## 18. Performance budget

Premium motion on glass is expensive. These budgets are requirements.

| Metric | Budget |
|---|---|
| Target device | iPhone 12 or newer, Safari, mid 4G |
| First contentful paint | under 1.2s |
| Interactive (can ask and approve) | under 2.0s |
| Frame rate | 60 fps (120 on ProMotion where possible) during scroll, sheet drags and mode switch |
| Initial JS (gzipped) | under 200KB, excluding lazy chunks |
| Fonts | Under 120KB total, self-hosted subsets, `font-display: swap` with metric-matched fallbacks |
| Blurred layers on screen | max 3 |
| Animated properties | transform and opacity only |
| Ambient | static image or gradients, no live large blur |
| 3D | lazy, capability gated, off by default on low power |
| Layout shift (CLS) | under 0.05 |

Techniques: `contain: layout paint` on panels, `content-visibility: auto` on offscreen timeline items, `will-change` only during an animation and removed after, image `decoding="async"` with fixed aspect ratios, avoid large box-shadow animation, virtualize long lists.

Test on a real iPhone with Low Power Mode on and off. Add an automatic degrade: if the dropped-frame rate stays above 20 percent for 2 seconds, switch to solid panels and disable grain, drift and 3D.

Demo-day rule: preload fonts, ambient images and the first screens. Use fixtures so the demo never waits on a network call. No loading states should appear during the 3-minute hero flow.

---

## 19. Implementation guide

### 19.1 Recommended stack [DECISION D6, flexible]

The backend is separate and flexible. For the front end, recommended default:

- React with Vite (or Next.js if the team already uses it), TypeScript.
- Tailwind CSS with design tokens as CSS variables (Tailwind reads the variables), or plain CSS modules. Tokens live in one file.
- Motion (motion.dev) for animation and gestures.
- Radix primitives or Ark UI for accessible behavior (dialog, tabs, radio group) with our own styling. Build the bottom sheet with a gesture library or a proven drawer component, then restyle it fully.
- Lucide icons.
- Storybook (optional but recommended) or a simple `/styleguide` route that renders every component and state. This is how agents check their work.
- Mock data in `fixtures/` shared with the backend contract.

### 19.2 Token file (CSS variables)

```css
:root {
  color-scheme: dark;

  /* color */
  --bg: #08130F;
  --bg-deep: #050B09;
  --ink: #0B1712;
  --text: #EEE7D4;
  --text-2: #DCD5C0;
  --text-3: #9FB3A8;
  --text-4: #7F9389;
  --brass: #D2A860;
  --brass-hi: #E4C382;
  --brass-lo: #A9843F;
  --brass-wash: rgba(210, 168, 96, 0.14);
  --ok: #8FC9A6;
  --danger: #E58A76;

  /* ambient */
  --amb-green: #1F5A48;
  --amb-deep: #12372E;
  --amb-brass: #8A6A32;
  --amb-glint: #D2A860;
  --veil: linear-gradient(180deg, rgba(8,19,15,0.35), rgba(8,19,15,0.70));

  /* lines and fills */
  --edge: rgba(238, 231, 212, 0.18);
  --divider: rgba(238, 231, 212, 0.12);
  --fill-soft: rgba(238, 231, 212, 0.10);
  --fill-press: rgba(238, 231, 212, 0.16);

  /* glass (one material) */
  --glass-tint: rgba(14, 32, 26, 0.58);
  --glass-blur: blur(28px) saturate(130%);
  --glass-solid: rgba(14, 32, 26, 0.92);
  --matte: rgba(14, 19, 16, 0.90);

  /* type */
  --font-ui: 'Manrope', ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', sans-serif;
  --font-voice: 'Fraunces', 'New York', ui-serif, Georgia, serif;
  --font-data: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* space and radii */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px;
  --s-6: 24px; --s-7: 32px; --s-8: 40px; --s-9: 56px; --s-10: 72px;
  --r-sm: 8px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-sheet: 32px; --r-pill: 999px;

  /* motion */
  --dur-instant: 100ms; --dur-fast: 160ms; --dur-base: 280ms;
  --dur-slow: 480ms; --dur-scene: 1400ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* safe areas */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

Also export the same tokens as `tokens.json` (single source) so the native iOS app can consume them (see section 20).

### 19.3 Glass snippet

```css
.glass {
  position: relative;
  border-radius: var(--r-xl);
  background: var(--glass-tint);
  border: 1px solid var(--edge);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
}
.glass--pill  { border-radius: var(--r-pill); }
.glass--sheet { border-radius: var(--r-sheet) var(--r-sheet) 0 0; box-shadow: 0 16px 40px rgba(0,0,0,0.30); }
.matte { background: var(--matte); border: 1px solid rgba(255,255,255,0.07); border-radius: var(--r-xl); }

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--glass-solid); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--glass-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
```

Parked upgrades (specular edge, grain, tiers) are described in 6.8 and live in the prototype board "C5 - Brass v3".

### 19.4 Tally ring snippet

```css
.tally-ring { width: 18px; height: 18px; border-radius: 50%; box-sizing: border-box;
  border: 2px solid var(--brass); display: inline-flex; align-items: center; justify-content: center; }
.tally-ring::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--brass);
  animation: tally 2.4s var(--ease-inout) infinite; }
.tally-ring[data-state="paused"] { border-color: var(--text-3); }
.tally-ring[data-state="paused"]::after { background: var(--text-3); animation: none; }
@keyframes tally { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
@media (prefers-reduced-motion: reduce) { .tally-ring::after { animation: none } }
```

### 19.5 Focus pull snippet

```css
.scene { position: absolute; inset: -60px; filter: blur(16px) brightness(0.85); transform: scale(1.03);
  transition: opacity 700ms ease; }
.scene[data-active="true"] { animation: focus-pull var(--dur-scene) var(--ease-snap) both; }
@keyframes focus-pull {
  from { filter: blur(52px) brightness(0.65); transform: scale(1.10); }
  to   { filter: blur(16px) brightness(0.85); transform: scale(1.03); }
}
/* To retrigger on every selection, alternate between two identical keyframe names (focus-pull-a, focus-pull-b) or set the Web Animations API. */
```

Note: animating `filter: blur` is costly. On a full screen layer, use it only for this one moment, on a pre-rasterized layer (`will-change: filter, transform` during the animation only). If frames drop, fall back to a brightness and scale crossfade.

### 19.6 Viewfinder brackets snippet

```css
.vf { position: absolute; inset: 4px; pointer-events: none;
  --c: var(--brass); --l: 9px; --w: 1.5px;
  background:
    linear-gradient(var(--c), var(--c)) top left / var(--l) var(--w),
    linear-gradient(var(--c), var(--c)) top left / var(--w) var(--l),
    linear-gradient(var(--c), var(--c)) top right / var(--l) var(--w),
    linear-gradient(var(--c), var(--c)) top right / var(--w) var(--l),
    linear-gradient(var(--c), var(--c)) bottom left / var(--l) var(--w),
    linear-gradient(var(--c), var(--c)) bottom left / var(--w) var(--l),
    linear-gradient(var(--c), var(--c)) bottom right / var(--l) var(--w),
    linear-gradient(var(--c), var(--c)) bottom right / var(--w) var(--l);
  background-repeat: no-repeat; }
```

### 19.7 Folder and naming conventions

```
apps/dashboard/src/
  styles/tokens.css        tokens above, single source
  styles/glass.css         glass, matte, ambient
  components/              one folder per component, with states and stories
    StatusPill/ ModeDock/ AskSurface/ AnswerCard/ ProofCard/
    Moment/ Timeline/ SuggestionCard/ Sheet/ Toast/ PersonCard/ CallSheet/
  motion/                  springs, easings, choreography helpers
  routes/ or screens/      Home, Ask, MomentDetail, Timeline, Person, Brief, WaitingOn, Call, Settings
  styleguide/              renders every component in every state
```

Naming: components PascalCase, CSS custom properties kebab-case, data attributes for state (`data-state`, `data-active`), no magic numbers outside tokens.

---

## 20. Native iOS companion handoff

The web app and the native app should feel like one product. Design decisions that carry over:

| Web | Native iOS |
|---|---|
| Glass, regular, thick | `.ultraThinMaterial`, `.regularMaterial`, `.thickMaterial` over the same ambient background, tinted with our greens |
| Manrope, Fraunces, JetBrains Mono | Bundle the same fonts with Dynamic Type scaling (`UIFontMetrics`) |
| Lucide icons | SF Symbols with Light weight |
| Dock with brass indicator | Custom segmented dock, same spring |
| Bottom sheets with detents | `presentationDetents` with custom backgrounds |
| Focus pull | Metal or Core Image blur animation, or a pre-baked crossfade |
| No haptics | Taptic: `.soft` on press, `.medium` on mode switch, `.success` on approve, `.light` ticks while scrubbing |
| Tilt parallax | CoreMotion for specular edge and parallax |
| Live captions | Native speech and Live Activities / Dynamic Island for capture status [DECISION later] |

Keep `tokens.json` as the single source of truth for both. Export colors, radii, durations and spring values. The native app is not a redesign. If a native convention fights this file, discuss before diverging.

---

## 21. Definition of done for UI work

Every UI task (and every agent PR touching UI) must satisfy this checklist before it is called done:

- [ ] Matches this file: tokens used, no raw hex or px outside the token file.
- [ ] Looks right at 320, 375, 390, 430, 768, 1024 and 1280 widths, portrait and landscape on phone.
- [ ] Tested on a real iPhone in Safari and as a home-screen PWA (safe areas, keyboard, scroll, blur performance).
- [ ] All states exist: default, pressed, focus, disabled or explained, loading, empty, error, offline where relevant.
- [ ] Motion follows section 12: spring or tokens, transform and opacity only, interruptible, reduced-motion path tested.
- [ ] Contrast checked (4.5 : 1 text, 3 : 1 large) with the veil on.
- [ ] Keyboard and VoiceOver pass: names, order, focus, live announcements.
- [ ] Performance: 60 fps on scroll and sheet drag, max 3 blur layers, budget respected.
- [ ] Copy follows section 15: sentence case, hyphens only, verb-first buttons, quotes verbatim.
- [ ] No new colors, fonts, radii or shadows invented. If one is truly needed, add it to the tokens and note why.
- [ ] Rendered in the `/styleguide` route with every state.
- [ ] Screenshots (phone and desktop) attached to the PR.

---

## 22. Do and don't

Do:
- Keep one idea per screen at rest.
- Use brass rarely so it means something.
- Show the person's own words with proof.
- Make every action undoable with a receipt.
- Let gestures drive motion.
- Test on a real iPhone early and often.
- Use mono for facts, serif for memory, sans for interface.
- Leave generous space. Premium is mostly air.

Don't:
- Use blue, purple, neon, glowing orbs, or gradients on controls.
- Use emoji in the UI.
- Show chat bubbles or an "AI is typing" gimmick.
- Put glass on long reading content or blur inside blur.
- Use pure white or pure black text.
- Invent new radii, shadows or colors per screen.
- Animate width, height or large blurs.
- Use spinners (skeletons and the approve ring only).
- Ask for confirmation dialogs when undo will do.
- Hide capture status or make pause hard to find.
- Add 3D that is not lazy loaded, gated and clearly better than the flat version.
- Copy Apple's visionOS look literally. We are inspired by its depth and materials, with our own palette, type and camera language.

---

## 23. Open decisions

Status key: DECIDED = resolved with the team lead (Nov 14, 2026). DEFAULT = proceed with the recommended default unless someone objects.

| ID | Decision | Options | Recommended default | Status |
|---|---|---|---|---|
| D1 | Navigation model on phone | A. Single Home with mode dock and sheets. B. Four-tab bar | **A (decided)** | DECIDED |
| D2 | 3D ambition | None, light, medium, heavy | **Medium (decided):** parallax, 3D contact sheet, 3D glasses on pairing. Memory graph is stretch only | DECIDED |
| D3 | Glass system | Pure Brass v1 vs three tiers plus edge and grain | **Pure Brass v1 (decided).** Tiers, edge and grain are parked (6.8) | DECIDED |
| D4 | Ambient background | A. Abstract brass ambient. B. Blurred photo of the moment | **Abstract brass always (decided).** Moments use light seeds (7.3). Photo backgrounds parked | DECIDED |
| D4b | Mode tint of the ambient | Shift ambient weights per mode, or keep it constant | Shift per section 4.6 | DEFAULT |
| D5 | Light theme | Dark only vs add light later | Dark only for now | DEFAULT |
| D6 | Front-end stack | React plus Vite plus Tailwind tokens, or Next.js | **Next.js (decided)**, already in use (ADR 0005), with Tailwind reading the tokens | DECIDED |
| D7 | Ask input | Voice first with text secondary, or text first | Voice first, text always available | DEFAULT |
| D8 | Horizontal swipe to change mode | Yes (with dock tap as the explicit path) or no | Yes | DEFAULT |
| D9 | Sound and haptics on web | None in v1 (no iOS web haptics). Native adds Taptic | None in v1 | DEFAULT |
| D10 | Desktop scope | Full dashboard as in Brass v1 or phone layout only centered | Brass v1 dashboard at 1024 and up | DEFAULT |
| D11 | Name, logo, app icon | Wordmark plus ring icon as proposed in 16.4 | Proposed | DEFAULT |
| D12 | Photo handling and privacy | Blur level for thumbnails, retention, face handling | Frames only in framed thumbnails, never as background, delete-on-demand | DEFAULT |
| D13 | Onboarding and pairing flow depth | Minimal (3 steps) vs full guided with 3D glasses | Minimal for the hackathon, designed for the full version | DEFAULT |
| D14 | Brand imagery of the glasses | Generic wayfarer silhouette vs real Ray-Ban Meta imagery | Generic silhouette, no logos | DEFAULT |
| D15 | Animation library | Motion (Framer Motion) vs GSAP vs CSS only | Motion plus CSS | DEFAULT |
| D16 | Localization | English only for now | English only, no hard-coded strings | DEFAULT |
| D17 | Undo window length | 10 seconds in the UI, or the server's window | **Follow the server (decided):** the countdown uses the receipt's `undo.until` | DECIDED |
| D19 | Letter case in the UI | Sentence case, or Title Case | **Title Case (decided)** for buttons, headings, titles, links, chips, tags, toasts and status. Sentences, helper text and verbatim quotes are unchanged | DECIDED |
| D20 | Home layout | Answer left, suggestion and timeline right; or timeline left | **Timeline left (decided)**, full height; suggestion then answer on the right. On laptops the app fits one screen with panels scrolling inside, and the dock is fixed on every size | DECIDED |
| D21 | Tile heights and scrolling | Tiles grow or scroll, or fixed heights that never scroll | **Fixed heights, never a scrollbar in a tile (decided).** Suggestion 272px (220px on laptops up to 780px tall), Ask 400px on phones and the rest of its column on laptops, Timeline shows only the rows that fit with See All for the rest. Text is clamped (titles two lines, question one line, quote at most three lines scaled to its space, proof one row). Sheets may scroll | DECIDED |
| D22 | Landing page and sign-in | Separate site, or a page in the app | **`/` is the landing page (decided)**, in Brass: 3D glasses (lazy, gated), a live reel of the Ash flow, modes cycling the room's light, privacy. The app moves to `/app`; `/demo` stays. Google sign-in via Auth.js with our own Brass button (monochrome G, no brand colors) | DECIDED |
| D18 | Suggestions in Student, Life and Assist | Empty state, preview, or working in the mock | **Working in the mock now (decided)**, replaced by real backend actions soon (flashcards, reminder, read aloud) | DECIDED |

How to change a decision: edit this table and the section it affects in the same PR, and mention it in the PR description so every agent sees it.

---

End of file. When in doubt, choose the calmer option, add more air, and make it feel like light moving through glass.
