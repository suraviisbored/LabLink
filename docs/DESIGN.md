# LabLink — Design System

## 1. Brand identity

**LabLink**, tagline **“Every lab, within reach.”** Calm, trustworthy, academic, direct. The mark is
three linked nodes in beige with a dark grey connection, paired with a letterspaced “LAB LINK”
wordmark. It sits on `surface` or white; a one-colour dark grey variant exists for beige
backgrounds; the mark alone is the favicon (`src/app/icon.svg`). `alt="LabLink"` on the SVG.

Voice: short plain sentences. Errors say what happened and what to do next — “That slot was just
taken. Here are 3 nearby times.” The campus name is always visible in the shell so scope is obvious.

> The supplied logo files are not in the repository yet; `src/components/logo.tsx` contains the
> placeholder mark drawn to the same description and can be swapped for the supplied SVG without
> layout changes.

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| bg | `#DDD0C8` | Page background |
| ink | `#323232` | Text, primary buttons |
| surface | `#F3EEEA` | Cards, inputs, dialogs |
| border/line | `#BFB1A7` | Decorative dividers |
| ink-muted | `#4A4A4A` | Secondary text, input outlines |
| success | `#245C34` | Confirmed, approved |
| warning | `#6F4800` | Pending, fallback notice |
| danger | `#9B2C2C` | Rejected, errors |
| info | `#2C5A8A` | AI recommendation, links |

Contrast on `bg`: ink ≈ 8.5:1, ink-muted ≈ 5.9:1, success ≈ 5.2:1, warning ≈ 5.4:1, danger ≈ 5.0:1,
info ≈ 4.8:1 — all at or above 4.5:1 for body text. Input outlines use ink-muted (≥ 3:1). Status is
never colour alone: every status badge pairs colour with an icon **and** a text label. Dark mode (bg
`#323232`, text `#DDD0C8`) is roadmap.

## 3. Typography

Inter with a system fallback stack, JetBrains Mono for asset tags and IDs. Scale: 12, 14, 16, 18,
20, 24, 30, 36 px. Weights 400/500/600. Body ≥ 16 px, line height 1.5 (headings 1.25). No build-time
font fetch is required, which keeps the build hermetic.

## 4. Spacing, radius, elevation

4 px base scale (4, 8, 12, 16, 24, 32, 48, 64). Radius 6 / 10 / 16. Flat style with 1 px borders; one
soft shadow reserved for dialogs. Max content width 1200 px; gutters 16 px (24 px from `md`).

## 5. Icons

Lucide, outline, 20 px (24 px nav), 1.75 px stroke, `currentColor`. Decorative icons are
`aria-hidden`; icon-only buttons carry `aria-label`. Used: microscope/beaker (equipment),
calendar-clock (booking), clipboard-check (approval), sparkles (AI), triangle-alert (conflict),
wrench (maintenance), bell (notifications), mail (email log), arrow-left-right (comparison).

## 6. Responsive breakpoints

base 320 (single column, disclosure “Menu”) · sm 640 (2-column cards) · md 768 (icon rail) · lg 1024
(full sidebar, 3 columns) · xl 1280 (wider tables). Touch targets ≥ 44×44 px. Wide tables scroll
inside their own container. Works at 200% zoom.

## 7. Components

- **Core:** Button (primary/secondary/ghost/destructive, disabled/loading), Input/Select/Textarea
  with visible labels and `aria-describedby` hints, Equipment card, Status badge (icon + text +
  colour), Slot picker with a **grid and a list view**, data tables with `<caption>` and scoped
  headers, toasts with `role="status"`, stepper for the request lifecycle, empty/skeleton states.
- **AI:** recommendation card with rank, fairness bar, explanation, trade-offs and an
  “AI-generated” label; fallback banner (“AI unavailable, showing rule-based result”);
  counterfactual panel (top factors with weights and scores, plus the smallest flipping change).
- **Notifications:** bell with unread count in the accessible name, list items with a non-colour
  unread marker, email log table.
- **Specified:** swap offer card, plan draft card, certification badge — described, not built.

Interaction: focus ring 2 px ink with 2 px offset; motion 150 ms, disabled under
`prefers-reduced-motion`.

## 8. Email design

Plain HTML in the same palette (beige background, dark grey text), a plain-text alternative, one
clear action link, escaped user content, and no AI text. Implemented in `src/lib/email/templates.ts`.

## 9. Accessibility checklist (as implemented)

- [x] Skip link to `#main`, semantic landmarks (`header`, `nav`, `main`, `footer`).
- [x] Every form control has a visible `<label>`; hints/errors wired with `aria-describedby`.
- [x] Focus-visible ring on all interactive elements; radio cards use `focus-within`.
- [x] Availability has a grid **and** an equivalent list view, switchable with `aria-pressed`.
- [x] Status uses icon + text + colour; unread state has an “Unread:” screen-reader prefix.
- [x] Live regions (`aria-live="polite"`) for booking, decision, recommendation and preference
      results.
- [x] Errors in plain language with a next step.
- [x] 44 px minimum targets; 320 px layout; tables scroll inside their container.
- [ ] Manual keyboard and screen-reader pass — not performed in this environment.
- [ ] axe-core automated audit — the dependency is documented but not run here.
