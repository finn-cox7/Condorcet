# DESIGN.md: Highlighter direction

Visual reference: `docs/design/condorcet-design.html`. Open it in a browser; the black bar bottom-right switches screens.
Use it for look and layout only. Do not copy its inline-styled markup into `app/`. Rebuild each screen with Tailwind in App Router components.

## Screens
- `/` Landing: search by state name + link list of all 2026 Senate races (each a real <a href> to its race page)
- `/race/[slug]` Issue picker (slug is `Race.slug`, e.g. `michigan-senate-2026`): search, "Popular" chips, "All issues" chips, sticky footer "N of 5 issues picked" + "Show voting records"
- `/race/[slug]?issues=a,b` Results: highlighted candidate names, issue chips, one section per issue, two columns
- `/how-it-works`: three numbered steps, data sources + chip legend, "What we don't do" box, CTA back to /
  Every claim on this page must be true of the shipped code.

## Tokens (put these in app/globals.css with Tailwind v4 `@theme`)
- Background: #FFFFFF
- Text: #000000
- Accent: #FFD60A

## Color rules
- Yellow is never text and never a thin line on white (contrast about 1.07:1). It is only ever a fill behind black text.
- Yellow marks what the user acted on: selected issue chips, link hover, primary action buttons.
- One fixed exception, and no others: the highlight behind the candidate names on the comparison page. Every other headline is solid black.
- Yellow never encodes data. Votes are black and white only:
  - Yea: solid black chip, white text, "Voted yea"
  - Nay: 2px black outline chip, "Voted nay"
  - Present: 2px dashed black outline, "Voted present"
  - Not voting: 2px dashed gray (#555) outline, "Not voting"
- No red or blue anywhere. Party is shown as text, e.g. "(R)".

## Type (next/font/google, not a <link> tag)
- Archivo 400/600/800: logo, headings, buttons, chips, labels
- Source Serif 4 400/600: body text and bill summaries

## Components
- Candidate-name highlight (comparison page only): `background: linear-gradient(transparent 55%, #FFD60A 55%)`. `HEADLINE_HIGHLIGHT` in `lib/ui.ts`.
- Primary action (Search, Show voting records, Find your race): yellow fill, 2px black border, black Archivo 600 text; inverts to black fill with white text on hover. Shared as `PRIMARY_ACTION` in `lib/ui.ts`.
- Race search: label + input on a 2px black bottom border, in the header.
- Issue chips: real <button>, 44px tall, 2px black border, fully rounded. Selected = yellow fill + weight 600. "Add an issue" = dashed border.
- Issue section: h2 with a 3px black bottom border, then a 2-column grid (gap 48px), one column per candidate.
- Bill row: bill title as a link + vote chip on one line, 30-word summary below.
- No federal voting record: 2px black box, bold title, one sentence, link to the campaign site. Never an empty column.

- `/terms` and `/privacy`: build from `docs/design/condorcet-legal.html`. Legal text is placeholder; body comes from a template generator, edited to match what the code actually does.
## Accessibility
- Every input has a <label> (use `sr-only` if it should be hidden).
- Touch targets at least 44px. Visible keyboard focus on everything clickable.
- Layout collapses to one column below 768px (`md:` breakpoint).
