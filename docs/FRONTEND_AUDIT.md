# Frontend audit: dashboard (iPhone and laptop)

2026-11-15 · @ashzaeen · commit `124c788` · area `area:dashboard`

**Status: all 39 findings addressed in the follow-up commit (see Resolution at the end).** Still to confirm on a physical iPhone: the keyboard lift, spoken answers, long-press and scroll lock.

Every surface of `apps/dashboard` checked against [design.md](../design.md) (Brass): Home, all ten sheets, the toast, the promise chip, the demo driver and the landing page.

**Method**
- Read every component.
- Ran `/demo` on WebKit at three iPhone sizes, landscape and a 320px phone.
- Ran real Chrome at 1280×620, 1440×800 and 1920×960, the laptop window sizes left after browser chrome.
- Scripted interaction probes: open every sheet, type while a live update arrives, stack sheets, toggle settings.
- Measured layout: overflow, where each dialog sits, focus, document height.

WebKit on Windows is not a real iPhone. Anything marked **(device)** still needs a check on a physical iPhone.

**Severity**
- **P0:** visibly broken, or breaks a demo beat.
- **P1:** clearly wrong on a main viewport.
- **P2:** polish or spec gap.
- **P3:** nice to have.

## P0: fix before rehearsal

| # | Issue | Where | Evidence |
| --- | --- | --- | --- |
| 1 | **Glass sheets are positioned wrong.** The unlayered `.glass { position: relative }` beats Tailwind's layered `absolute` and `fixed`. Glass sheets (Ask, Moment, Timeline, Call, Capture, Pairing) sit relative to the top of the screen instead of anchoring to the bottom. A full sheet covers the status pill and ends in mid-air with square bottom corners, with an 8% strip of the page showing below it. A half sheet starts at 32% instead of 40% and runs 24% past the bottom edge. Matte sheets (People, Waiting On, Settings, Receipts) are fine. | `app/globals.css:114`, `components/brass/Sheet.tsx:91` | `l1440-timeline`, `i15-timeline`, `i15-ask`: computed `position: relative` on the demo driver |
| 2 | **The demo driver is not pinned.** The same `.glass` rule makes the `fixed` aside sit in the page flow below the fold. On laptops the "fits one screen" app scrolls by 146px. On phones the driver sits at the page end and paints over open sheets (z-40 above the sheets' z-30). | `components/brass/DemoPanel.tsx:11` | `scrollHeight` 946 vs a 800px window; `i15-waiting` |
| 3 | **A moment opened from another sheet opens behind it.** `MomentSheet` renders before `TimelineSheet` and `WaitingOnSheet`, and they share z-30. "Open Moment" in the Timeline sheet and tapping a promise in Waiting On look like they do nothing: the moment is open but hidden. | `components/HomeApp.tsx:205-211` | `probe-stacked`: DOM lists Moment and Timeline, only Timeline visible |
| 4 | **Live updates restart every open sheet.** Sheets receive `onClose={() => setSheet(null)}`, a new function on every Home render. The Sheet effect depends on `onClose`, so each SSE refresh re-runs it. That resets the detent (a sheet dragged to full snaps back), moves focus to the Close button (on iPhone this dismisses the keyboard mid-typing), and resets the element focus returns to on close. During the demo, events arrive constantly. | `components/brass/Sheet.tsx:31-59`, `components/HomeApp.tsx:204-222` | Probe: typing in Ask, then one update → focus moved from `#ask-input` to Close |
| 5 | **Half sheets hide their bottom content.** The panel is always 92% tall and translated down for peek or half, so the scroller extends below the screen and its last items can't be reached without dragging the sheet up. The Ask button is off-screen on iPhone 15, iPhone SE and 1280×620. Waiting On's "You Owe" list is off-screen at every size. | `components/brass/Sheet.tsx:61-62, 117` | `lastHidden=true` for Ask and Waiting On; `i15-ask` |
| 6 | **The answer quote vanishes on short laptops.** At 1280×620 the Ask panel has no room, and the container rule that hides a half line hides the whole quote. Only the question and proof row remain, so beat 3 (ask with proof) loses its hero. | `app/globals.css:227-234`, `components/HomeApp.tsx:188` | `l1280-home` |
| 7 | **Sheets don't move above the keyboard (device).** Only the height is read from `visualViewport`. The sheet stays anchored to the layout viewport, so the iOS keyboard covers the Ask textarea's lower half, the Ask button and Capture's "What Was Said" field. design.md 9.3 and 11.14 require keyboard awareness. | `components/brass/Sheet.tsx:35` | From code, confirm on device |
| 8 | **The timeline film strip is off-center and overlapping.** The `-translate-x-1/2` class (the CSS `translate` property) stacks with the inline `translateX(-50%)`, shifting every frame 95px left, so the current frame hugs the left edge on phones. Frame spacing (150px) is smaller than frame width (190px), so neighbouring frames and captions overlap into garbled text. | `components/brass/TimelineSheet.tsx:13, 66-68` | `l1440-timeline`, `i15-timeline` |

## P1: wrong on a main viewport

| # | Issue | Where |
| --- | --- | --- |
| 9 | **Laptop sheets are phone sheets.** At 768px and up, design.md 8.4 says sheets become centered panels. Today they're 720px bottom sheets at 92% height with a drag handle, which look unfinished on a 1440 screen (`l1440-ask`). | `Sheet.tsx:91` |
| 10 | **The home screen shows a question with an unrelated answer.** Before anyone asks, the panel shows the default question "What did Ash promise me?" next to the newest moment's quote ("Midnight snack…") and its PROOF row. It reads as a wrong answer, on both phone and laptop. | `HomeApp.tsx:39`, `AskPanel.tsx:54` |
| 11 | **The question is truncated on iPhone.** "What did Ash pro…" (one line in Fraunces 26). The demo question should always be readable, so let it wrap to 2 lines on phones. | `AskPanel.tsx:65` |
| 12 | **Opening a sheet focuses Close, not the input.** `querySelector("input, textarea, button")` returns the first match in document order, which is the header's Close button. On every sheet focus lands on Close. | `Sheet.tsx:50` |
| 13 | **No loading state, so empty states flash.** Data starts empty, so "Nothing Captured Yet" (twice) and "Nothing to Suggest" show until the first fetch lands. design.md 11.16 and 12.5 want shimmer skeletons. There's no `loading.tsx`, `error.tsx` or `not-found.tsx` either. | `useCortex.ts:20`, `TimelinePanel.tsx:136`, `AskPanel.tsx:101`, `SuggestionCard.tsx:139` |
| 14 | **320px phones overflow.** The dock spans −13 to 333 on a 320px screen, "Save Draft" runs off the card, status text collapses to "R…", and timecodes wrap. design.md 8.4 promises 320–389 support. At 375 the dock just fits (15px margins, below the 16px gutter). | `ModeDock.tsx:33`, `SuggestionCard.tsx:124`, `StatusPill.tsx:49` |
| 15 | **The promise chip and the toast share one spot.** Both sit at `dock + 16px`. A "Moment Deleted" undo toast while a promise is pending draws one pill on top of the other. | `HomeApp.tsx:235`, `Toast.tsx:27` |
| 16 | **Settings toggles snap instead of sliding.** `Row` and `Toggle` (and Waiting On's `Section`) are components defined inside render, so they remount every render. The knob never animates (probe: the element is replaced on click), and keyboard focus is lost when data refreshes. | `sheets.tsx:159, 197, 203` |
| 17 | **Scrubbing the timeline replays the focus pull on every frame.** Each index change calls `onSelect`, which changes Ambient's `pullKey`, which remounts the scene (`key={pull}`) and restarts a 1400ms full-screen blur animation. During a scrub that's dozens of restarts, a likely jank source on iPhone (device). It also re-triggers issue 4 on every step. | `TimelineSheet.tsx:33`, `Ambient.tsx:59`, `HomeApp.tsx:144` |
| 18 | **Releasing a drag opens a moment.** The film strip has no drag threshold, so a drag that ends over the center frame opens it. | `TimelineSheet.tsx:35-37, 65` |
| 19 | **Spoken answers and briefs probably won't play on iPhone (device).** `speechSynthesis.speak` is called after an `await`, outside the tap gesture, so iOS Safari usually blocks it. That affects beats 3 and 4 when run from the dashboard. | `HomeApp.tsx:88`, `sheets.tsx:108` |
| 20 | **Undo in Receipts doesn't expire visually.** `live` is computed once per render, so Undo stays visible after the window closes, and tapping it gets a 409. It also has no live countdown, which DASH-6 asks for. | `sheets.tsx:255` |
| 21 | **A failed Brief Me does nothing.** There's no `catch`, so the button just stops saying "Briefing" with no message. | `sheets.tsx:106-109` |

## P2: polish and spec gaps

| # | Issue | Where |
| --- | --- | --- |
| 22 | **Reduced motion is only partly respected.** There's no `<MotionConfig reducedMotion="user">`, so motion-driven rises (Ask answer, suggestion swap, toast, landing reel) still move under reduced motion (design.md 12.7). | `HomeApp.tsx:30`, `Landing.tsx` |
| 23 | **Most controls have no hover state on laptop.** Only the primary button changes; secondary, ghost, chips, rows and the pill's nav links don't. design.md 12.4 asks for a 1px lift and a brighter edge. | `primitives.tsx:8-11`, `globals.css:203` |
| 24 | **Timeline row focus rings are invisible.** The row wrapper's `overflow-hidden` clips the 3px-offset outline. | `TimelinePanel.tsx:29` |
| 25 | **The Waiting On footer shows the furthest deadline.** It sorts by due date descending, so it shows the least urgent promise instead of the soonest. | `TimelinePanel.tsx:126` |
| 26 | **The "Waiting On" filter chip wraps onto two lines, and "Call" is cut off** with no fade to hint at horizontal scroll. Chip needs `whitespace-nowrap`. | `primitives.tsx:37`, `TimelineSheet.tsx:42` |
| 27 | **Long-press triggers the iOS callout or selection (device).** There's no `-webkit-touch-callout: none` or `user-select: none` on rows that use long-press. | `TimelinePanel.tsx:78` |
| 28 | **Locking page scroll doesn't work on iOS.** `overflow: hidden` on `<html>` doesn't stop the page behind a sheet from rubber-banding on iOS. | `Sheet.tsx:51` |
| 29 | **Raw error text can reach toasts, and toasts don't wrap.** `e.message` goes straight into toasts (design.md 11.16: no raw error strings), and the pill has no max width, so a long message runs off a phone screen. | `HomeApp.tsx:70, 90`, `Toast.tsx:38` |
| 30 | **The promise chip has no max width or truncation**, and no exit animation (it disappears instantly on confirm). | `HomeApp.tsx:236-238` |
| 31 | **The suggestion card is a fixed 272px on phones**, leaving a large empty band between the "TO" line and the buttons, with the summary cut to one line. Fit the height to content on phones and keep it fixed only at `lg`. | `SuggestionCard.tsx:86` |
| 32 | **The approve flow skips the specified morph.** design.md 12.3 says the button morphs into a progress ring, then into a check that springs, and the receipt line types in. Today the button is swapped for a spinner, and the receipt just fades in. | `SuggestionCard.tsx:125-128` |
| 33 | **The undo countdown line animates `width`.** Use `scaleX` (design.md 12.1 rule 4). | `SuggestionCard.tsx:112` |
| 34 | **Toggles and radios aren't announced properly.** The toggles are plain buttons without `role="switch"` and `aria-checked`. Off the Record looks the same as Paused (same ring); CAP-6 wants a distinct state. | `sheets.tsx:203, 213` |
| 35 | **The Call sheet is a dead end.** There's no action and no number. Fine for Tier 0, but it should say what to do next, such as "Call from the FaceTime app" plus the verified line or a copy button. | `sheets.tsx:271-310` |
| 36 | **Landscape iPhone uses the stacked phone layout.** The 734×343 view shows about two rows and the dock covers about a quarter of the screen. Hide or shrink the dock in short landscape. | `land-home` |
| 37 | **The landing page says "DRAG TO TURN" when the 3D view isn't loaded.** The label shows on the flat fallback too. three.js also loads on the landing page for every capable visitor. | `Landing.tsx:139` |
| 38 | **The Demo Driver toggle is visible in Settings for everyone.** It does nothing on the real backend. Hide it unless the mock is in use. | `sheets.tsx:241` |
| 39 | **Two smaller sheet issues.** Stacked sheets each lock scroll and trap focus, so closing the top one clears the scroll lock while the lower one is still open. `ReceiptsSheet` also puts a `<p>` directly in an `<ol>`. | `Sheet.tsx:51`, `sheets.tsx:253` |

## Animation check (loading and opening)

| Surface | Today | Gap |
| --- | --- | --- |
| App open | Panels rise with a stagger, the ambient focus pull plays, the dock rises last | No ring ignition. The timeline is an empty box for about 400ms before rows arrive, and empty-state text can flash (issue 13) |
| Sheets | Dim fades, the sheet rises on the gentle spring, content fades in at 120ms | Spec met on phones. On laptop it should be a centered panel that scales and fades in (issue 9). Position bug (issue 1) |
| Moment rows | Rise with a 30ms stagger, max 6 | Good |
| Ask, thinking and answered | Shimmer skeleton, then the quote rises | No line-by-line quote, and the source line doesn't arrive last (12.3). Only one shimmer sweep across the question |
| Approve | Spinner, then a fade to the receipt | The ring-to-check morph and the receipt type-in are missing (issue 32) |
| Toast | Spring in, fast out | Good |
| Promise chip | Rises in | No exit animation (issue 30) |
| Settings toggles | None, because they remount (issue 16) | |
| Brief in People | Appears instantly | Add the list-entrance rise |
| Mode switch | Indicator springs, the suggestion swaps, ambient shifts | Good |
| Delete moment | The row vanishes and a toast appears | design.md 12.3 says the row collapses over 240ms |

## What already works well

- The 1440 and 1920 laptop layouts look right (`l1440-home`).
- Phone gutters are correct at 375–430, with no horizontal scroll.
- Glass blur renders in Chrome.
- The tally ring states are clear.
- The mode dock spring and the toast work.
- Swipe-to-delete with undo works, and the mode-swipe guard leaves the iOS back-swipe edge alone.
- `dvh` is used throughout and safe areas are respected.
- There are no console errors on any route.

## Suggested fix order

1. Fix issue 1 by scoping `position: relative` (for example `:where(.glass)`, or moving it into `@layer components`). That also fixes issue 2.
2. Fix issue 4 with a stable `onClose`, either `useCallback` in Home or reading `onClose` through a ref in Sheet. That also fixes most of issue 17.
3. Fix issue 3 by giving the Moment sheet a higher z-index or rendering it last.
4. Then issues 5 and 7 (size the sheet to its detent and lift it with `visualViewport`), issue 6, issue 8 and issue 10.

None of these change contracts, and all are dashboard-only. Screenshots are on @ashzaeen's machine, outside the repo. Rerun the harness to regenerate them.

## Resolution

Fixed, then re-verified in a browser: 62 layout and interaction checks across 3 iPhones and 4 laptop sizes, plus 13 more for 320px, landscape, reduced motion and delete with undo. All pass.

| # | Fix |
| --- | --- |
| 1, 2 | `.glass`, `.matte` and `.nested` moved into `@layer components`, so Tailwind's `fixed` and `absolute` win. Sheets anchor to the bottom, and the demo driver is pinned. |
| 3, 39 | Sheets keep a stack. The newest opens on top (z-index by depth), only it answers Escape and Tab, and the scroll lock lasts until the last one closes. |
| 4 | `onClose` is read through a ref, so live updates no longer re-run the open effect. Focus, typed text and detent survive. |
| 5 | The panel is padded by its detent offset, so the scroller ends at the screen bottom. A squeezed viewport (landscape phone or keyboard open) uses the full detent. |
| 6 | Compact layout at 720px height or less, and the phone-only `min-h` no longer applies on laptops. The quote stays visible at 1280×620 and 1366×650. |
| 7 | The sheet follows `visualViewport` (top and height). **Needs a real iPhone.** |
| 8, 18 | Film strip centered (the doubled translate is gone), frame spacing 200px, caption only on the current frame, 6px drag slop before a press becomes a drag. |
| 9 | From 768px a sheet is a centered panel that scales and fades in, with no handle. |
| 10, 11 | The idle Ask panel shows a muted example question, and the proof row says LATEST until something is asked. The question wraps to two lines on phones. |
| 12 | Opening a sheet focuses the field marked `data-autofocus`, otherwise the sheet itself. |
| 13 | Skeleton rows for the timeline, answer and suggestion until the first load. New `loading.tsx`, `error.tsx` and `not-found.tsx`. |
| 14, 36 | Flexible dock segments, short status text under 360px, slim dock in landscape. |
| 15 | The chip, toast and demo driver stack with CSS offsets and never share a spot. |
| 16 | Row, Toggle and Section are module-level components. The knob animates, toggles are `role="switch"`, and Off the Record has its own ring. |
| 17 | Timeline selection waits 450ms after a scrub settles, so the focus pull no longer restarts each frame. |
| 19 | `primeSpeech()` unlocks speech on the first tap. **Needs a real iPhone.** |
| 20 | Receipts show a live undo countdown and drop Undo when the window closes. |
| 21, 29 | `friendly()` turns errors into plain language. Brief failures toast, and toasts wrap and clamp. |
| 22 | `MotionConfig reducedMotion="user"` at the app root. |
| 23, 24 | Hover states on buttons, chips, rows and links. The focus ring moved to the base layer, and rows use an inset ring. |
| 25, 26, 27 | The footer shows the soonest deadline. Chips don't wrap and fade at the scroll edge. Rows block the iOS callout. |
| 28 | Dim layer is `touch-none` and scrollers `overscroll-contain`. **Needs a real iPhone.** |
| 30, 31, 32, 33 | Promise chip animates in and out. The suggestion card fits its content on phones. Approve morphs button to ring to springing check with a typed receipt line. Undo bar uses `scaleX`. |
| 34, 35, 37, 38 | Switch roles. The Call sheet has steps and an optional `NEXT_PUBLIC_FACETIME_LINE`. The 3D hint shows only when 3D runs. The Demo Driver toggle shows only when the mock or demo is active. |
| Motion | Delete collapses the row in 240ms. The proof row arrives after the quote. The brief and call captions rise in. The status ring ignites on open. |

**Not done**
- The quote doesn't arrive line by line, only quote then proof.
- three.js still loads on the landing page for capable devices.
- Per-device behavior marked above is unverified until tested on an iPhone.
