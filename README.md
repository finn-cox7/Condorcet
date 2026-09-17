# Condorcet

A voter tool that shows how the candidates in a race actually voted on the issues you care about.

Live at **<https://condorcet.fyi>**

Condorcet does not recommend a candidate and does not score anyone. It puts the candidates' real
roll-call votes side by side, with a plain-language summary of each bill, and lets you decide.

## How it works

1. **Search for a race** on the landing page — e.g. "Indiana Senate 2026".
2. **Pick up to 5 issues** from a searchable list. The list is the ~32 fixed
   [CRS policy areas](https://www.congress.gov/help/field-values/policy-area) that Congress.gov tags
   every bill with, popular ones shown first.
3. **Read the bills.** For each issue, Condorcet shows up to 5 bills the race's candidates voted on,
   most recent first, each with a ~30-word plain-language summary.
4. **Compare columns.** Each candidate gets a column showing how they voted — yea, nay, present, or
   not voting.

### What it deliberately does not do

- It does not judge whether a vote *agrees* with your position on an issue. It reports the vote.
- It does not infer who is on the ballot. Races are hand-curated (see [Ingestion](#ingestion)).
- It never calls an external API while serving a request. Every page reads only from Postgres.

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind v4 |
| Database | Postgres (Neon in production) |
| ORM | Prisma 7, via the `@prisma/adapter-pg` driver adapter |
| Hosting | Vercel, building from `main` |

Confirm before adding any other dependency.

## Getting started

**Prerequisites:** Node 20+, a Postgres database, and API keys from
[Congress.gov](https://api.congress.gov/sign-up/) and the [FEC](https://api.open.fec.gov/developers/)
if you plan to run ingestion.

```bash
npm install          # postinstall runs `prisma generate` — the client is gitignored
```

Create the two env files (both are gitignored; never commit them):

```bash
# .env — read by Prisma and by the web app
DATABASE_URL=postgresql://...

# .env.local — read by the ingestion scripts only
CONGRESS_API_KEY=...
FEC_API_KEY=...
```

Apply the migrations, then start the dev server:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npm run dev          # http://localhost:3000
```

The config flag is required: this repo's Prisma config is named `prisma7.config.ts`, not the default
`prisma.config.ts`, so the CLI won't find it on its own.

A fresh database is empty — the app will build and serve, but with no races. See
[Ingestion](#ingestion) to populate it.

### Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config, `eslint-config-next`)

There is no test suite configured yet.

## Repo layout

```
app/                  Next.js App Router — reads only from the database
  page.tsx              /            landing page + race search
  race/[slug]/          /race/[slug] issue picker and comparison, switched by ?issues=
  how-it-works/         /how-it-works
  terms/, privacy/      /terms, /privacy
  components/           RaceSearch, IssuePicker, IssueChips, RaceRecords, ...
  generated/prisma/     generated client (gitignored)
lib/                  shared helpers — prisma client, policy areas, formatting, design tokens
scripts/              offline ingestion — runs on your machine, never in the deployed app
prisma/               schema + migrations
docs/design/          DESIGN.md and the static HTML visual reference
```

The `@/*` path alias resolves to the repo root (see `tsconfig.json`).

## Data model

Six Prisma models, in `prisma/schema.prisma`:

- **`Member`** — someone who served in the 118th or 119th Congress, keyed by bioguide id.
- **`Bill`** — keyed by `(congress, billType, billNumber)`. `summary` holds the raw CRS text;
  `plainSummary` holds the hand-written ~30-word rewrite that the UI actually shows.
- **`Vote`** — one `Member`'s position on one `Bill`. Unique per member per bill, so only their
  *last* roll call on a bill is kept (final passage, not cloture). This is intentional.
- **`Race`** — a contest, e.g. `michigan-senate-2026`. `slug` is the URL form.
- **`Candidate`** — someone on the ballot, keyed by FEC candidate id.
- **`RaceCandidate`** — joins the two, tagged with that candidate's ballot party for *that* race.

The important join is `Candidate.memberId` → `Member`. A candidate's voting record is their linked
member's votes, which is how a Senate candidate's prior House service shows up in a Senate race.

Every candidate column resolves to exactly one of four states — a column is never silently empty:

| Situation | What renders |
| --- | --- |
| Linked `Member` with 119th-Congress votes | their record |
| Linked `Member`, no 119th-Congress votes | "no votes in the current Congress." above their 118th record |
| No linked `Member`, `formerMemberOfCongress` is true | "no votes in the current Congress." + campaign site link |
| No linked `Member`, not a former member | "no federal voting record" + campaign site link |

An issue with no matching bills shows: *"No bills on this issue received a recorded vote in the
118th or 119th Congress."* A bill with no `plainSummary` shows *"summary not yet available"* — it
never falls back to the raw CRS text.

## Ingestion

Everything in `scripts/` runs **offline, on your own machine**, and writes to Postgres. All of it is
idempotent, so re-running is safe. The scripts don't load `.env` files themselves — pass them with
Node's `--env-file` flag, and wrap long runs in `caffeinate -i` so the Mac doesn't sleep mid-run:

```bash
node --env-file=.env --env-file=.env.local --import tsx scripts/<script>.ts <args>
```

### Full refresh, in order

1. `fetch-members.ts 119`, then `fetch-members.ts 118 --past` (adds members who have since left;
   never overwrites current rows)
2. `fetch-senate-votes.ts <congress> <session>` and `fetch-house-votes.ts <congress> <session>` for
   118-1, 118-2, 119-1, 119-2 — each session takes roughly 10–30 minutes
3. `apply-plain-summaries.ts` — loads `scripts/data/plain-summaries.json` and lists any bill still
   missing a plain summary

### Races and candidates

Members, bills, and votes are bulk-fetched per congress. Races are not, on purpose: the FEC API is
campaign-finance *filer* data, not election results. It has no "won the primary" field, and its
`party` field is unreliable even for incumbents (it lists three-term senator Jim Risch as `"UNK"`).
A human has to say who's actually on the ballot.

```bash
scripts/fetch-candidate.ts <fecId> [websiteUrl]            # one candidate
scripts/create-race.ts <state> <year> <S|H> <district|-> <fecId:party> ...
```

`fetch-candidate.ts` links a `Candidate` to an existing `Member` by last name + state, best-effort,
and warns when a match rests on last name alone — check those by hand. `websiteUrl` is required when
there's no federal record to show.

### Maintenance scripts

| Script | What it does |
| --- | --- |
| `audit-races.ts` | Read-only. Checks every candidate column resolves to one of the four states. "PROBLEMS: none" means nothing renders empty or mislabeled. Run after any ingestion pass. |
| `export-pending-summaries.ts <outFile> [limit]` | Lists bills with CRS text but no plain summary yet. |
| `merge-plain-summaries.ts <batch.json>` | Folds hand-written summaries into `scripts/data/plain-summaries.json`. Touches no database, so it needs no `--env-file`. |
| `retry-house-rolls.ts <congress> <session> <roll,...>` | Re-fetches individual roll calls a session run logged as `skipped roll N`. |
| `seed-senate-races.ts` | One-time batch runner over `scripts/Senate_races.md`. Fuzzy-matches names against each state's full FEC roster; reports low-confidence matches rather than guessing. |

## Data sources

- **[Congress.gov API](https://api.congress.gov)** — members, bills, CRS policy areas, summaries, and
  **House** roll-call votes (the `house-vote` endpoint, still beta). Intermittently slow; requests
  retry with backoff on timeouts, 429s, and 5xx. A bill has one CRS summary per version — we store
  the *newest*, because Congress reuses bill numbers as shells and the oldest summary can describe an
  entirely different bill than the one voted on.
- **[senate.gov XML feed](https://www.senate.gov/legislative/LIS/roll_call_votes/)** — **Senate**
  roll-call votes. The Congress.gov API has no `senate-vote` endpoint, so this is the closest
  official machine-readable source. Positions are keyed by LIS id (e.g. `S354`), cross-walked to
  bioguide ids via [`unitedstates/congress-legislators`](https://github.com/unitedstates/congress-legislators)
  so Senate and House votes join to the same `Member` rows.
- **[FEC API](https://api.open.fec.gov)** — candidate registration data. See the caveats above.

> **senate.gov sits behind an Akamai WAF that 403s cloud IPs** (Vercel, AWS, Lambda). Run
> `scripts/fetch-senate-votes.ts` locally only — never from a deployed environment, and never import
> it into `app/`.

## Scope

**v1 is Senate races, general election only.** A race isn't limited to one Democrat and one
Republican — it can include a serious independent or third-party candidate.

House *votes* are loaded (118th and 119th Congresses) because several Senate candidates are current
or former House members and their record is their House votes. House *races* are deferred, not
dropped.

Deferred to v2: House races, state legislature records via Open States, coloring votes by alignment
with the user's stated position, primaries, and executive (governor/mayor) records.

## Deployment

Vercel, building from `main`, against a Neon Postgres database on the **pooled** host (`-pooler`),
which is what serverless connections need.

- `"postinstall": "prisma generate"` is load-bearing. `app/generated/prisma` is gitignored, so
  without it a fresh clone has no client and `next build` fails on the missing import.
- `DATABASE_URL` must be set for **every** environment including Preview, and is needed at **build**
  time, not just runtime: `/` and `/how-it-works` are prerendered static and query Postgres during
  `next build`. It's the only variable the web app reads — `CONGRESS_API_KEY` and `FEC_API_KEY`
  belong to `scripts/` alone and don't go in Vercel.
- `/race/[slug]` is server-rendered on demand, one Postgres read per request. The legal pages read
  nothing.
- **Static means data changes need a redeploy.** A race added with `create-race.ts`, or a summary
  applied with `apply-plain-summaries.ts`, won't appear until the next build. That's a deliberate
  trade while races are hand-curated.

## Known caveats

- `Bill.title` is Congress.gov's display title, which can still show the *original* name of a shell
  bill — S. 1383 is titled as a veterans bill but passed as the SAVE America Act. `plainSummary`
  describes the version that was actually voted on.
- 118th Congress S. 2073 ("Kids Online Safety and Privacy Act") has no `plainSummary` on purpose:
  its only CRS summary describes a different bill.
- `npm run lint` reports 13 `@typescript-eslint/no-explicit-any` errors, all in `scripts/`. Next 16
  doesn't run ESLint during `next build`, so they don't block a deploy — but they do hide new errors
  in `app/`.

## Project docs

- `CLAUDE.md` — working agreements and the detailed spec.
- `AGENTS.md` — regenerated automatically by `next dev`; don't hand-edit it.
- `docs/design/DESIGN.md` — the visual system (type, the one yellow accent, vote-chip styles) and its
  static HTML reference.
