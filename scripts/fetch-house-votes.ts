/**
 * scripts/fetch-house-votes.ts
 *
 * Pulls House roll-call votes from the Congress.gov API's house-vote
 * endpoint (beta). Unlike Senate votes, this is a normal, versioned API —
 * no WAF, no crosswalk, safe to run anywhere.
 *
 * Coverage note (per Congress.gov's own docs): beta House vote data
 * currently covers the 118th and 119th Congresses, and only votes tied to
 * a piece of legislation. Non-legislation votes (e.g. "Election of the
 * Speaker") aren't in the API yet.
 *
 * Usage:
 *   npx tsx scripts/fetch-house-votes.ts 119 1
 */

import { prisma } from "../lib/prisma";
import { Chamber, VotePosition } from "../app/generated/prisma/client";
import { fetchAndStoreBill, type BillTypeCode } from "./fetch-bill";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HousePosition = {
  bioguideId: string;  // e.g. "A000055" — matches Congress.gov members directly
  lastName: string;
  firstName: string;
  party: string;        // "D" | "R" | "I"
  state: string;         // "AL"
  position: VotePosition | null; // null if voteCast is something unrecognized
};

export type HouseVote = {
  congress: number;
  session: number;
  rollNumber: number;
  date: string;
  question: string;              // "On Passage", "Call by States", ...
  result: string;                 // "Passed", "Failed", ...
  billType: string | null;       // "HR", "HRES", ...
  billNumber: string | null;
  yeas: number;
  nays: number;
  positions: HousePosition[];
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// House's legislationType arrives as "HR", "HRES", "SJRES", etc. —
// lowercased, that's exactly fetch-bill.ts's billType convention. Normalized
// here, at the source, so every HouseVote leaving this file already agrees
// with the rest of the codebase on what a bill type looks like. Kept as an
// explicit allow-list so an unrecognized type becomes null, not garbage.
const KNOWN_BILL_TYPES = new Set([
  "hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres",
]);

function normalizeBillType(raw: string): string | null {
  const t = raw.toLowerCase();
  return KNOWN_BILL_TYPES.has(t) ? t : null;
}

// voteCast arrives as "Yea"/"Nay"/"Present"/"Not Voting" — normalized here,
// at the source, to the schema's VotePosition enum, for the same reason as
// normalizeBillType above: one canonical shape from the moment data leaves
// this file, not two (a display string here, an enum at persistence time).
const POSITION_MAP: Record<string, VotePosition> = {
  yea: VotePosition.YEA,
  nay: VotePosition.NAY,
  present: VotePosition.PRESENT,
  "not voting": VotePosition.NOT_VOTING,
};

function normalizePosition(raw: string): VotePosition | null {
  return POSITION_MAP[raw.toLowerCase().trim()] ?? null;
}

const MAX_ATTEMPTS = 4;

/**
 * Congress.gov is intermittently slow — a real run lost roll calls to 15s
 * timeouts. Timeouts, dropped connections, 429s, and 5xx errors usually
 * clear up on their own, so those retry with backoff (2s, 4s, 8s). Other
 * 4xx errors (404, 400) won't change on retry, so they fail immediately.
 */
async function fetchFromCongressApi(path: string, attempt = 1): Promise<any> {
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("api_key", process.env.CONGRESS_API_KEY ?? "");
  url.searchParams.set("format", "json");

  let retryable = true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) return await res.json(); // inside the try: the body read can time out too
    retryable = res.status === 429 || res.status >= 500;
    throw new Error(
      `Congress.gov API request failed: ${res.status} ${res.statusText} (${path})`
    );
  } catch (err) {
    if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
    await sleep(1000 * 2 ** attempt);
    return fetchFromCongressApi(path, attempt + 1);
  }
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Returns every roll number recorded in a session. This is your index. */
export async function listRollNumbers(
  congress: number,
  session: number
): Promise<number[]> {
  const rollNumbers: number[] = [];

  // Pagination: each page hands back a `next` URL; follow it until there
  // isn't one, instead of guessing offsets yourself.
  let path: string | null = `/house-vote/${congress}/${session}?limit=250`;
  while (path) {
    const data = await fetchFromCongressApi(path);
    const votes = data?.houseRollCallVotes ?? [];
    rollNumbers.push(...votes.map((v: any) => Number(v.rollCallNumber)));

    const next: string | undefined = data?.pagination?.next;
    path = next ? next.replace(CONGRESS_API_BASE, "") : null;
  }

  return rollNumbers.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

export async function fetchVote(
  congress: number,
  session: number,
  roll: number
): Promise<HouseVote> {
  const voteData = await fetchFromCongressApi(
    `/house-vote/${congress}/${session}/${roll}`
  );
  const rc = voteData?.houseRollCallVote;
  if (!rc) throw new Error(`Unexpected shape for roll ${roll}`);

  const membersData = await fetchFromCongressApi(
    `/house-vote/${congress}/${session}/${roll}/members`
  );
  const positions: HousePosition[] = (
    membersData?.houseRollCallVoteMemberVotes?.results ?? []
  ).map((m: any) => ({
    bioguideId: String(m.bioguideID ?? ""),
    lastName: String(m.lastName ?? ""),
    firstName: String(m.firstName ?? ""),
    party: String(m.voteParty ?? ""),
    state: String(m.voteState ?? ""),
    position: normalizePosition(String(m.voteCast ?? "")),
  }));

  return {
    congress,
    session,
    rollNumber: roll,
    date: String(rc.startDate ?? ""),
    question: String(rc.voteQuestion ?? ""),
    result: String(rc.result ?? ""),
    billType: rc.legislationType ? normalizeBillType(String(rc.legislationType)) : null,
    billNumber: rc.legislationNumber ? String(rc.legislationNumber) : null,
    yeas: positions.filter((p) => p.position === VotePosition.YEA).length,
    nays: positions.filter((p) => p.position === VotePosition.NAY).length,
    positions,
  };
}

/** Sequential. The Congress.gov API allows 5000 req/hour per key, so this
 *  delay is just politeness, not survival. */
export async function fetchSession(
  congress: number,
  session: number,
  delayMs = 100
): Promise<HouseVote[]> {
  const rolls = await listRollNumbers(congress, session);
  console.log(`${rolls.length} roll-call votes in ${congress}-${session}`);

  const out: HouseVote[] = [];
  for (const roll of rolls) {
    try {
      out.push(await fetchVote(congress, session, roll));
    } catch (err) {
      // One bad vote should not kill a full-session backfill.
      console.error(`  skipped roll ${roll}:`, (err as Error).message);
    }
    if (out.length % 25 === 0) console.log(`  ${out.length}/${rolls.length}`);
    await sleep(delayMs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

// A House vote has ~430 positions. One upsert at a time is ~430 network
// round trips (~13s per vote against Neon); running them 10 at a time — the
// size of pg's default connection pool — cuts that roughly tenfold. Each
// position is a different member, so upserts in a batch never collide.
const UPSERT_BATCH_SIZE = 10;

/**
 * Mirrors fetch-senate-votes.ts's persistVote: a bill this project hasn't
 * seen before gets fetched here rather than skipped, so a full-session run
 * builds up the Bill table from real votes cast. Votes not tied to a piece
 * of legislation (e.g. amendment votes) are still skipped.
 */
async function persistVote(
  vote: HouseVote,
  memberIdByBioguide: Map<string, string>
): Promise<{ stored: number; skipped: number }> {
  if (!vote.billType || !vote.billNumber) {
    return { stored: 0, skipped: vote.positions.length };
  }

  const billNumber = Number(vote.billNumber);
  let bill = await prisma.bill.findUnique({
    where: {
      congress_billType_billNumber: {
        congress: vote.congress,
        billType: vote.billType,
        billNumber,
      },
    },
  });
  if (!bill) {
    try {
      bill = await fetchAndStoreBill(vote.congress, vote.billType as BillTypeCode, billNumber);
    } catch (err) {
      console.error(
        `  couldn't fetch bill ${vote.billType} ${billNumber} (${vote.congress}th Congress): ${(err as Error).message}`
      );
      return { stored: 0, skipped: vote.positions.length };
    }
  }

  const billId = bill.id;
  const date = new Date(vote.date);

  const toStore = vote.positions.flatMap((p) => {
    const memberId = memberIdByBioguide.get(p.bioguideId);
    return p.position && memberId ? [{ memberId, position: p.position }] : [];
  });

  for (let i = 0; i < toStore.length; i += UPSERT_BATCH_SIZE) {
    await Promise.all(
      toStore.slice(i, i + UPSERT_BATCH_SIZE).map(({ memberId, position }) =>
        prisma.vote.upsert({
          where: { memberId_billId: { memberId, billId } },
          create: {
            memberId,
            billId,
            chamber: Chamber.HOUSE,
            position,
            rollCall: vote.rollNumber,
            date,
          },
          update: { position, rollCall: vote.rollNumber, date },
        })
      )
    );
  }
  return { stored: toStore.length, skipped: vote.positions.length - toStore.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const congress = Number(process.argv[2] ?? 119);
  const session = Number(process.argv[3] ?? 1);
  // Optional 3rd argument: resume an interrupted session from this roll
  // number, e.g. `fetch-house-votes.ts 118 1 397`. Re-running earlier rolls
  // would be harmless (upserts), but when Congress.gov is slow, skipping
  // them saves hours.
  const fromRoll = Number(process.argv[4] ?? 1);

  // Every member, not just current House members: a 118th-Congress House
  // vote was also cast by people who are senators now (e.g. Jim Banks) or
  // have left Congress (e.g. Mary Peltola). Built once, not per-vote.
  const members = await prisma.member.findMany({
    select: { id: true, bioguideId: true },
  });
  const memberIdByBioguide = new Map(members.map((m) => [m.bioguideId, m.id]));

  const rolls = (await listRollNumbers(congress, session)).filter((r) => r >= fromRoll);
  console.log(
    `${rolls.length} roll-call votes in ${congress}-${session}` +
      (fromRoll > 1 ? ` (resuming from roll ${fromRoll})` : "")
  );

  let stored = 0;
  let skipped = 0;
  for (const roll of rolls) {
    try {
      const vote = await fetchVote(congress, session, roll);
      const result = await persistVote(vote, memberIdByBioguide);
      stored += result.stored;
      skipped += result.skipped;
    } catch (err) {
      console.error(`  skipped roll ${roll}:`, (err as Error).message);
    }
    await sleep(100);
  }

  console.log(`Done. Stored ${stored} positions, skipped ${skipped}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
