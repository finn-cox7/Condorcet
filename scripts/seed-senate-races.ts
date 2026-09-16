/**
 * scripts/seed-senate-races.ts
 *
 * Reads scripts/Senate_races.md (a hand-written, typo-prone list of 2026
 * Senate candidates) and drives fetch-candidate.ts + create-race.ts for
 * every race in it. This is a one-time batch runner, not a new data
 * source of its own — it exists because doing ~30 races through the CLI
 * one candidate at a time would mean 70+ separate commands.
 *
 * Matching strategy: FEC's own name search is an exact/substring match
 * (confirmed: searching "Pelota" against Mary Peltola's real FEC record
 * returns zero results). So instead of searching per-candidate, this
 * fetches each state's *entire* 2026 Senate roster once (typically under
 * 25 people) and fuzzy-matches locally by edit distance. Anything below
 * the confidence bar is reported, not guessed at.
 *
 * Usage:
 *   npx tsx scripts/seed-senate-races.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { fetchAndStoreCandidate } from "./fetch-candidate";
import { createRace, STATE_NAMES } from "./create-race";

const FEC_API_BASE = "https://api.open.fec.gov/v1";
const ELECTION_YEAR = 2026;

// No states are excluded any more — Delaware's primary has happened and
// its candidates are listed in Senate_races.md.
const EXCLUDED_STATES = new Set<string>([]);

// Manual Member links for candidates whose FEC legal name doesn't match
// their Member record — e.g. Ashley Hinson's Senate FEC filing uses her
// married name ("Arenholz"), so the automatic last-name match in
// fetch-candidate.ts can't find her House record ("Hinson"). Keyed by
// "State Candidate Name" exactly as written in the md file.
const MEMBER_OVERRIDES: Record<string, string> = {
  "Iowa Ashley Hinson": "H001091",
};

const NAME_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([abbr, name]) => [name, abbr])
);

// ---------------------------------------------------------------------------
// Parse the markdown file's nested bullet list (2-space indent per level:
// "Senate" > state > party > candidate name > optional "Website: [url](url)").
// Lines end in a markdown hard-break ("  "), trimmed away along with
// everything else insignificant to the structure.
// ---------------------------------------------------------------------------

type RaceCandidateInput = { party: string; name: string; website?: string };
type RaceInput = { state: string; candidates: RaceCandidateInput[] };

function parseSenateRacesMd(content: string): RaceInput[] {
  const states: RaceInput[] = [];
  let currentState: RaceInput | null = null;
  let currentParty: string | null = null;
  let currentCandidate: RaceCandidateInput | null = null;

  for (const rawLine of content.split("\n")) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const level = Math.round(indent / 2);
    const text = rawLine.trim().replace(/^-\s*/, "").trim();

    if (level === 1) {
      currentState = { state: text, candidates: [] };
      states.push(currentState);
      currentParty = null;
      currentCandidate = null;
    } else if (level === 2) {
      const lower = text.toLowerCase();
      currentParty = lower.startsWith("rep") ? "R" : lower.startsWith("dem") ? "D" : lower.startsWith("ind") ? "I" : text;
      currentCandidate = null;
    } else if (level === 3 && currentState && currentParty && text) {
      currentCandidate = { party: currentParty, name: text };
      currentState.candidates.push(currentCandidate);
    } else if (level === 4 && currentCandidate) {
      const urlMatch = text.match(/Website:\s*\[.*?\]\((.*?)\)/i);
      if (urlMatch) currentCandidate.website = urlMatch[1];
    }
  }
  return states;
}

// ---------------------------------------------------------------------------
// Fuzzy name matching against a state's full FEC roster
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Same backoff strategy as fetch-candidate.ts's fetchFromFec — this script
 *  hits the roster endpoint once per state plus a detail call per
 *  candidate, which is enough volume in a tight loop to trip FEC's rate
 *  limit (confirmed: a first run 429'd partway through, at Virginia). */
async function fetchFromFec(path: string, attempt = 1): Promise<any> {
  const url = new URL(`${FEC_API_BASE}${path}`);
  url.searchParams.set("api_key", process.env.FEC_API_KEY ?? "");
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * 2 ** attempt);
    return fetchFromFec(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`FEC API request failed: ${res.status} ${res.statusText} (${path})`);
  return res.json();
}

async function fetchStateRoster(stateAbbr: string): Promise<{ id: string; name: string }[]> {
  const data = await fetchFromFec(
    `/candidates/?office=S&state=${stateAbbr}&election_year=${ELECTION_YEAR}&per_page=100`
  );
  return (data?.results ?? []).map((r: any) => ({ id: r.candidate_id, name: r.name }));
}

// Comparing whole concatenated names badly over-penalizes FEC's legal-name
// clutter — "RISCH, JAMES E MR." reordered is "james e mr risch", which
// scores *worse* against "jim risch" than some unrelated candidate, purely
// because of the inserted middle name and suffix. Splitting last/first and
// scoring them separately (last name weighted higher — it's more
// distinctive and less prone to nickname variation) fixes that.
const CONFIDENT_DISTANCE = 7;

function findBestMatch(
  name: string,
  roster: { id: string; name: string }[]
): { match: { id: string; name: string }; distance: number } | null {
  const tokens = name.trim().split(/\s+/);
  const qFirst = normalize(tokens[0] ?? "");
  // A 3+-word query is ambiguous: "Rachel Fetty Anderson" has a two-word
  // last name, but "Shelley Moore Capito" has a middle name before a
  // one-word last name. Try both readings — last name is everything after
  // the first token, or just the final token — and keep whichever scores
  // better for each roster candidate.
  const qLastReadings = [normalize(tokens.slice(1).join(" "))];
  if (tokens.length > 2) qLastReadings.push(normalize(tokens[tokens.length - 1]));

  let best: { id: string; name: string } | null = null;
  let bestDistance = Infinity;

  for (const candidate of roster) {
    // FEC names are "LAST, FIRST MIDDLE SUFFIX" — only the first token
    // after the comma is the given name we'd expect a casual reference to.
    const [last, firstFull] = candidate.name.split(",").map((s) => s.trim());
    const first = (firstFull ?? "").split(/\s+/)[0] ?? "";
    const firstDistance = levenshtein(qFirst, normalize(first));
    for (const qLast of qLastReadings) {
      const d = 2 * levenshtein(qLast, normalize(last ?? "")) + firstDistance;
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
  }

  return best ? { match: best, distance: bestDistance } : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const mdPath = join(import.meta.dirname, "Senate_races.md");
  const races = parseSenateRacesMd(readFileSync(mdPath, "utf8"));

  const racesCreated: string[] = [];
  const needsWebsite: string[] = [];
  const unresolved: string[] = [];
  const skipped: string[] = [];
  const spotCheck: string[] = [];

  for (const race of races) {
    if (EXCLUDED_STATES.has(race.state)) {
      skipped.push(`${race.state} (excluded)`);
      continue;
    }

    const abbr = NAME_TO_ABBR[race.state];
    if (!abbr) {
      unresolved.push(`${race.state}: unrecognized state name`);
      continue;
    }

    const roster = await fetchStateRoster(abbr);
    await sleep(300);
    const specs: { fecCandidateId: string; party: string }[] = [];

    for (const { party, name, website } of race.candidates) {
      const best = findBestMatch(name, roster);
      const memberBioguideId = MEMBER_OVERRIDES[`${race.state} ${name}`];

      // A MEMBER_OVERRIDES entry means a human already confirmed this
      // FEC record is the right person despite a bad name-similarity
      // score (e.g. a married name FEC has on file) — so it bypasses the
      // confidence gate. Without an override, a low-confidence match still
      // needs a real FEC id to fall back to fuzzy-matching against at all.
      if (!best || (best.distance > CONFIDENT_DISTANCE && !memberBioguideId)) {
        unresolved.push(
          `${race.state} (${party}) "${name}" — no confident FEC match` +
            (best ? ` (closest: "${best.match.name}", distance ${best.distance})` : "")
        );
        continue;
      }

      try {
        const result = await fetchAndStoreCandidate(best.match.id, website, {
          requireWebsite: false,
          memberBioguideId,
        });
        specs.push({ fecCandidateId: best.match.id, party });
        if (memberBioguideId) {
          spotCheck.push(
            `"${name}" (${race.state}, ${party}) — used manual Member override ${memberBioguideId} (FEC record: "${best.match.name}", distance ${best.distance})`
          );
        }
        if (result.needsWebsite) {
          needsWebsite.push(`${result.firstName} ${result.lastName} (${race.state}, ${party})`);
        }
        if (best.distance > 0 && !memberBioguideId) {
          spotCheck.push(
            `"${name}" (${race.state}, ${party}) matched to "${best.match.name}" — distance ${best.distance}, please confirm this is the same person`
          );
        }
      } catch (err) {
        unresolved.push(`${race.state} (${party}) "${name}" — ${(err as Error).message}`);
      }
      await sleep(300);
    }

    if (specs.length < 2) {
      unresolved.push(`${race.state}: only ${specs.length} candidate(s) resolved, race not created`);
      continue;
    }

    const result = await createRace(abbr, ELECTION_YEAR, "S", "-", specs, { skipMissingCandidates: true });
    racesCreated.push(result.name);
    await sleep(150);
  }

  console.log("\n=== Races created ===");
  racesCreated.forEach((r) => console.log(`  ${r}`));

  console.log("\n=== Skipped ===");
  skipped.forEach((s) => console.log(`  ${s}`));

  console.log("\n=== Spot-check these (fuzzy match, not exact) ===");
  spotCheck.forEach((s) => console.log(`  ${s}`));

  console.log("\n=== Needs a real website URL (no federal voting record) ===");
  needsWebsite.forEach((c) => console.log(`  ${c}`));

  console.log("\n=== Unresolved — needs manual review ===");
  unresolved.forEach((u) => console.log(`  ${u}`));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
