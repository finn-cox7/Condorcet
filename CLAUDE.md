# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

@AGENTS.md

## How to work with me

- I'm a CS sophomore learning backend, Git, and Next.js through this project. Explain every change before making it. Do not just produce code.
- Never run git commands. I run them myself.
- Prefer small, single-purpose changes. One concept per change.
- When you introduce something new (a Next.js feature, a library, a pattern), explain it from first principles in two or three sentences.
- If you think an approach is wrong, say so before building it.

## What this project is

**Condorcet** — a voter tool that shows how the candidates in a race actually voted on the issues a user cares about. It does not recommend a candidate. It shows records side by side and lets the user decide.

User flow:

1. Landing page: a search bar, front and center. User searches for a race (e.g. "Indiana Senate 2026").
2. User picks up to 5 issues from a searchable list. The list is the Congress.gov CRS policy areas (~32 fixed categories), with popular ones shown first.
3. For each issue, the app shows bills the race's candidates voted on, with a ~30-word plain-language summary of each bill and how each candidate voted.
4. Candidates' records are displayed in side-by-side columns — usually two (Democrat/Republican), sometimes more when a race has a serious independent or third-party candidate.

## Scope for v1 (do not expand without asking)

- **Senate races only for v1.** House *races* are deferred — not dropped. House *votes* are loaded, though (118th and 119th Congresses): several Senate candidates are current or former House members, and their record is their House votes. Those votes show up in Senate races through the candidate's linked `Member`.
- General election only. Races are hand-curated, not bulk-inferred: FEC's own `party` field can't be trusted (it lists three-term incumbent Jim Risch as `"UNK"`) and FEC has no election-results data, so there's no reliable way to auto-detect who won a primary. Populate a race with `scripts/fetch-candidate.ts <fecId> [websiteUrl]` per candidate, then `scripts/create-race.ts` to assemble them — see Architecture.
- Not limited to one Democrat and one Republican — a race can include a serious independent or third-party candidate (e.g. Idaho Senate 2026 has one). `Race` holds a list of candidates via `RaceCandidate`, each tagged with their actual ballot party for that race.
- Loaded vote data covers the 118th and 119th Congresses. Every candidate column shows exactly one of these states — never render an empty column silently:
  - **Linked `Member` with votes in the 119th Congress** → show their record.
  - **Linked `Member` with no 119th-Congress votes** (e.g. Sherrod Brown, Mary Peltola) → show "no votes in the current Congress." above their 118th-Congress record.
  - **No linked `Member`, but `Candidate.formerMemberOfCongress` is true** (e.g. Mike Rogers, John Sununu — their service predates the loaded data) → show "no votes in the current Congress." with a link to `Candidate.websiteUrl`.
  - **No linked `Member` and not a former member** → show "no federal voting record" with a link to `Candidate.websiteUrl`.
- An issue with no bills for the race's candidates shows: "No bills on this issue received a recorded vote in the 118th or 119th Congress."
- A bill with no `plainSummary` (CRS hasn't published a summary yet) shows "summary not yet available". Never fall back to the raw `summary` text.
- Vote display shows how the candidate voted on the bill (yea / nay / not voting). It does not classify whether a vote aligns with the user's stance. That is v2.
- Max 5 issues per query, max 5 bills per issue, most recent first.
- Bill summaries are precomputed once and stored in the database. Never call an LLM or Congress.gov at request time. `Bill.summary` holds the raw CRS text (newest version); `Bill.plainSummary` holds the ~30-word plain-language rewrite, written by hand into `scripts/data/plain-summaries.json` and loaded with `scripts/apply-plain-summaries.ts`. Summaries state only what the CRS text says — no outside facts.

Deferred to v2: House races, state legislature records via Open States, alignment-with-user coloring, primaries, executive (governor/mayor) records.

## Architecture

Two separate pieces. Keep them separate.

**Ingestion (`scripts/`)** — runs offline on my machine. Pulls members, bills, and CRS summaries from the Congress.gov API, House roll-call votes from the Congress.gov API, Senate roll-call votes from senate.gov's XML feed, and candidate/race data from the FEC API, and writes everything to Postgres. Covers the 118th and 119th Congresses. Plain-language summaries are written by hand and applied from `scripts/data/plain-summaries.json`. Idempotent: safe to re-run.

Members, bills, and votes are bulk-fetched per congress/session. Candidates and races are not — `fetch-candidate.ts` and `create-race.ts` take one candidate/race at a time, on purpose, because there's no automated way to know who's actually on the ballot (see Scope for v1).

**Web app (`app/`)** — Next.js App Router. Reads only from the database. Never calls external APIs during a request.

Planned stack: Next.js (TypeScript, Tailwind v4), Postgres, Prisma as the ORM, deployed on Vercel. Confirm before adding any other dependency.

## Data sources

- Congress.gov API (api.congress.gov) — members, bills, CRS policy areas, legislative subjects, bill summaries, and **House** roll-call votes (`house-vote` endpoint, beta; covers the 118th and 119th Congresses). Key lives in `.env.local` as `CONGRESS_API_KEY`. Never commit it.
  - Intermittently slow — requests retry with backoff on timeouts, 429s, and 5xx errors.
  - A bill has one CRS summary per version, oldest first. `fetch-bill.ts` stores the newest: Congress reuses bill numbers as shells, so the oldest summary can describe an entirely different bill than the one voted on.
- senate.gov XML feed (`www.senate.gov/legislative/LIS/roll_call_votes/`) — **Senate** roll-call votes. Congress.gov's API does not cover Senate votes yet (confirmed: only a `house-vote` endpoint exists in the official API docs, no `senate-vote` equivalent). senate.gov's XML files are the closest thing to an official machine-readable source.
  - Positions are keyed by LIS id (e.g. `S354`), not bioguide id — cross-walk to bioguide id using `unitedstates/congress-legislators` (`legislators-current.yaml` and `legislators-historical.yaml` on GitHub, so senators who have since left still match) before storing, so Senate and House votes join to the same `Member` rows.
  - senate.gov sits behind an Akamai WAF that 403s requests from cloud IPs (Vercel, AWS, Lambda). **Run `scripts/fetch-senate-votes.ts` locally only** — never from a deployed environment, never imported into `app/`.
- FEC API (api.open.fec.gov) — candidate registration data (name, state, office, fundraising). Key lives in `.env.local` as `FEC_API_KEY`. Never commit it.
  - This is campaign-finance filer data, **not** election results — it has no field for "won the primary" and its `party` field is unreliable even for well-known incumbents. It cannot tell you who the nominees in a race are; a human has to (see Scope for v1).
  - No bioguide crosswalk either — `fetch-candidate.ts` links a `Candidate` to an existing `Member` by matching last name + state (any chamber, case- and accent-insensitive), best-effort. It warns when a link rests on last name alone (FEC uses legal names, e.g. "GARLAND ANDY BARR") — check those by hand.
- Open States API — v2 only.

## Commands

- `npm run dev` — start the dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint (flat config, `eslint-config-next`)

There is no test suite configured yet.

**Ingestion scripts don't load `.env` files themselves.** Run them with Node's `--env-file` flag, and wrap long runs in `caffeinate -i` so the Mac doesn't sleep mid-run:

```
node --env-file=.env --env-file=.env.local --import tsx scripts/<script>.ts <args>
```

Full refresh order (each step is idempotent):

1. `fetch-members.ts 119`, then `fetch-members.ts 118 --past` (adds members who have since left; never overwrites current rows)
2. `fetch-senate-votes.ts <congress> <session>` and `fetch-house-votes.ts <congress> <session>` for 118-1, 118-2, 119-1, 119-2 (a session takes ~10–30 minutes)
3. `apply-plain-summaries.ts` — it lists any bill that still needs a plain summary

Maintenance scripts, same `node --env-file=.env --import tsx scripts/<name>.ts` form:

- `audit-races.ts` — read-only check that every candidate column resolves to one of the four display states above. "PROBLEMS: none" means nothing would render empty or mislabeled. Run it after any ingestion or summary pass.
- `export-pending-summaries.ts <outFile> [limit]` — lists bills that have CRS text but no plain summary yet.
- `merge-plain-summaries.ts <batch.json>` — folds hand-written summaries into `scripts/data/plain-summaries.json`. Touches no database, so it needs no `--env-file`.
- `retry-house-rolls.ts <congress> <session> <roll,roll,...>` — re-fetches individual roll calls that a session run logged as `skipped roll N`, instead of re-running the whole session.

## Repo layout

Freshly scaffolded Next.js App Router project — no custom application code beyond the `create-next-app` default template yet:

- `app/layout.tsx` — root layout, loads Geist fonts and global styles
- `app/page.tsx` — home page (default template content)
- `app/globals.css` — Tailwind entry point and global styles
- `@/*` path alias resolves to the repo root (see `tsconfig.json`)

`AGENTS.md` (imported above) is regenerated automatically by `next dev` — don't hand-edit it, and commit it as-is when it appears in a diff.

## Known data caveats

- `Vote` is unique per member per bill, so only a member's last roll call on a bill is kept (e.g. final passage, not cloture). This is intentional.
- `Bill.title` is Congress.gov's display title, which can still show the original name of a shell bill (e.g. S. 1383 is titled as a veterans bill but passed as the SAVE America Act). `plainSummary` describes the voted-on version.
- 118th Congress S. 2073 ("Kids Online Safety and Privacy Act") has no `plainSummary` on purpose: its only CRS summary describes a different bill.

## What's next

Ingestion and the web app are both done.

- **Ingestion:** 118th and 119th Congresses, both chambers — 35 races, 73 candidates, 1,024 bills, 952 plain-language summaries, and every candidate column resolving to one of the four display states above (no empty columns).
- **Web app:** six routes — `/`, `/race/[slug]` (issue picker and comparison share the route, switched by `?issues=`), `/how-it-works`, `/terms`, `/privacy`.

Next is deployment to Vercel. Milestone: Oct 1, 2026.

### Required before the first deploy

1. **Add `"postinstall": "prisma generate"` to `package.json`.** `app/generated/prisma` is gitignored, so a fresh clone has no Prisma client and `next build` fails on the missing import. This is the one step that breaks the build outright.
2. **Set `DATABASE_URL` in Vercel's project settings, for every environment including Preview.** It is the only variable the web app reads. `CONGRESS_API_KEY` and `FEC_API_KEY` are used by `scripts/` alone and should not be added to Vercel.
3. **`DATABASE_URL` must be present at build time, not only at runtime.** `/` and `/how-it-works` are prerendered static and query Postgres during `next build`, so a build without it fails before a single request is served.
4. **Fill in `CONTACT` in `lib/legal.ts`.** It currently renders the literal `[add a contact email]` on `/terms` and `/privacy`.

### How the routes behave in production

- `/`, `/how-it-works`, `/terms`, `/privacy` — prerendered static. The first two read Postgres at build time; the legal pages read nothing.
- `/race/[slug]` — server-rendered on demand, one Postgres read per request. The connection string is Neon's pooled host (`-pooler`), which is what serverless needs.
- **Static means data changes need a redeploy.** A race added with `create-race.ts`, or a summary applied with `apply-plain-summaries.ts`, will not appear on the site until the next build. That is the right trade while races are hand-curated, but it is a deliberate one.

### Keep out of the deployed app

- **Never run `scripts/fetch-senate-votes.ts` from Vercel.** senate.gov sits behind an Akamai WAF that 403s cloud IPs. All ingestion stays local.
- The app must never call Congress.gov, the FEC, or senate.gov during a request. It reads only from Postgres.

### Known, not blocking

- `npm run lint` reports 13 `@typescript-eslint/no-explicit-any` errors, all in `scripts/`. Next 16 does not run ESLint during `next build`, so they do not block a deploy — but they do hide new errors in `app/`.
- No `engines` field in `package.json` and no `vercel.json`. Vercel's defaults are fine for both.

## Milestones

- No vertical slice. Building a simplified version of the whole app from the start: search across multiple races (not one hardcoded race), the full issue-picking flow, side-by-side records — kept simple in styling and data volume, not in feature scope.
- Oct 1, 2026: deployed on Vercel with a public URL.
