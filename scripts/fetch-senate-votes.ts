/**
 * scripts/fetch-senate-votes.ts
 *
 * Pulls Senate roll-call votes from senate.gov XML.
 *
 * RUN THIS LOCALLY ONLY. senate.gov sits behind an Akamai WAF that 403s
 * requests from cloud IPs (Vercel, AWS, Lambda). This is an offline
 * ingestion script, not a request-time fetch. Never import it into app/.
 *
 * Usage:
 *   npx tsx scripts/fetch-senate-votes.ts 119 1
 */

import { XMLParser } from "fast-xml-parser";
import { prisma } from "../lib/prisma";
import { Chamber, VotePosition } from "../app/generated/prisma/client";
import { fetchAndStoreBill, type BillTypeCode } from "./fetch-bill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SenatePosition = {
  lisId: string;       // e.g. "S354" — NOT a bioguide id, must be crosswalked
  lastName: string;
  firstName: string;
  party: string;       // "D" | "R" | "I"
  state: string;       // "WI"
  position: VotePosition | null; // null if vote_cast is something unrecognized
};

export type SenateVote = {
  congress: number;
  session: number;
  rollNumber: number;
  date: string;
  question: string;      // "On the Motion", "On Passage of the Bill", ...
  result: string;        // "Agreed to", "Rejected", ...
  title: string;
  billType: string | null;   // "S", "HR", "PN", ...
  billNumber: string | null;
  yeas: number;
  nays: number;
  positions: SenatePosition[];
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep values as strings; we cast deliberately
  trimValues: true,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Senate's document_type is punctuated ("S.", "H.J.Res.") and also covers
// things that aren't bills at all — amendments ("S.Amdt."), nominations
// ("PN"), treaties. Normalized here, at the source, to the same lowercase
// convention fetch-bill.ts uses ("s", "hjres", ...), so every SenateVote
// leaving this file agrees with the rest of the codebase. Anything not
// bill-shaped maps to null and gets skipped downstream.
const SENATE_BILL_TYPE_MAP: Record<string, string> = {
  "S.": "s",
  "H.R.": "hr",
  "S.Res.": "sres",
  "H.Res.": "hres",
  "S.J.Res.": "sjres",
  "H.J.Res.": "hjres",
  "S.Con.Res.": "sconres",
  "H.Con.Res.": "hconres",
};

function normalizeBillType(raw: string): string | null {
  return SENATE_BILL_TYPE_MAP[raw] ?? null;
}

// vote_cast arrives as "Yea"/"Nay"/"Present"/"Not Voting" — normalized here,
// at the source, to the schema's VotePosition enum, for the same reason as
// normalizeBillType above.
const POSITION_MAP: Record<string, VotePosition> = {
  yea: VotePosition.YEA,
  nay: VotePosition.NAY,
  present: VotePosition.PRESENT,
  "not voting": VotePosition.NOT_VOTING,
};

function normalizePosition(raw: string): VotePosition | null {
  return POSITION_MAP[raw.toLowerCase().trim()] ?? null;
}

async function getXml(url: string): Promise<any> {
  // Without a timeout, a request the WAF silently drops (no response,
  // no error) hangs this await forever — confirmed: a real run sat idle
  // for 48 minutes on exactly this before being killed by hand.
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml,*/*",
      Referer: "https://www.senate.gov/legislative/votes_new.htm",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 403) {
    throw new Error(
      `403 from ${url}\n` +
        `The Akamai WAF blocked this request. Either you are running from a ` +
        `cloud host (don't — run locally) or the headers above need updating.`
    );
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);

  return parser.parse(await res.text());
}

/**
 * fast-xml-parser collapses a single-element list into a bare object.
 * Everything that can be a list goes through here first.
 */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

const pad5 = (n: number) => String(n).padStart(5, "0");

function menuUrl(congress: number, session: number): string {
  return `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

function voteUrl(congress: number, session: number, roll: number): string {
  // Directory has NO separators (vote1191); filename HAS them (vote_119_1_).
  return (
    `https://www.senate.gov/legislative/LIS/roll_call_votes/` +
    `vote${congress}${session}/vote_${congress}_${session}_${pad5(roll)}.xml`
  );
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Returns every roll number recorded in a session. This is your index. */
export async function listRollNumbers(
  congress: number,
  session: number
): Promise<number[]> {
  const doc = await getXml(menuUrl(congress, session));
  const votes = asArray(doc?.vote_summary?.votes?.vote);

  if (votes.length === 0) {
    throw new Error(
      `No votes parsed from the menu file. Dump the tree and check the ` +
        `tag names before assuming the session is empty:\n` +
        JSON.stringify(doc).slice(0, 400)
    );
  }

  return votes
    .map((v: any) => Number(v.vote_number))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => a - b);
}

export async function fetchVote(
  congress: number,
  session: number,
  roll: number
): Promise<SenateVote> {
  const doc = await getXml(voteUrl(congress, session, roll));
  const rc = doc?.roll_call_vote;
  if (!rc) throw new Error(`Unexpected shape for roll ${roll}`);

  const positions: SenatePosition[] = asArray(rc?.members?.member).map(
    (m: any) => ({
      lisId: String(m.lis_member_id ?? ""),
      lastName: String(m.last_name ?? ""),
      firstName: String(m.first_name ?? ""),
      party: String(m.party ?? ""),
      state: String(m.state ?? ""),
      position: normalizePosition(String(m.vote_cast ?? "")),
    })
  );

  return {
    congress,
    session,
    rollNumber: roll,
    date: String(rc.vote_date ?? ""),
    question: String(rc.question ?? rc.vote_question_text ?? ""),
    result: String(rc.vote_result ?? ""),
    title: String(rc.vote_title ?? ""),
    billType: rc.document?.document_type
      ? normalizeBillType(String(rc.document.document_type))
      : null,
    billNumber: rc.document?.document_number
      ? String(rc.document.document_number)
      : null,
    yeas: Number(rc.count?.yeas ?? 0),
    nays: Number(rc.count?.nays ?? 0),
    positions,
  };
}

/** Sequential, rate-limited. ~600 votes ≈ 3 minutes. Run once per session. */
export async function fetchSession(
  congress: number,
  session: number,
  delayMs = 250
): Promise<SenateVote[]> {
  const rolls = await listRollNumbers(congress, session);
  console.log(`${rolls.length} roll-call votes in ${congress}-${session}`);

  const out: SenateVote[] = [];
  for (const roll of rolls) {
    try {
      out.push(await fetchVote(congress, session, roll));
    } catch (err) {
      // One bad vote should not kill a 600-vote backfill.
      console.error(`  skipped roll ${roll}:`, (err as Error).message);
    }
    if (out.length % 25 === 0) console.log(`  ${out.length}/${rolls.length}`);
    await sleep(delayMs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LIS -> Bioguide crosswalk
// ---------------------------------------------------------------------------

// legislators-current.yaml only lists people serving today. Backfilling an
// older Congress needs everyone who has since left (e.g. Sherrod Brown), so
// both files feed the same map.
const LEGISLATORS_URLS = [
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml",
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-historical.yaml",
];

/**
 * Senate XML uses LIS ids ("S354"). Congress.gov uses bioguide ids ("B001230").
 * There is no algorithmic conversion — you need this lookup table.
 * Requires: npm install yaml
 */
export async function buildLisToBioguide(): Promise<Map<string, string>> {
  const { parse } = await import("yaml");
  const map = new Map<string, string>();

  for (const url of LEGISLATORS_URLS) {
    // The historical file is ~9MB — a generous timeout, but never unbounded.
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Failed to fetch legislators: ${res.status} (${url})`);

    const legislators = parse(await res.text()) as any[];
    for (const l of legislators) {
      const lis = l?.id?.lis;
      const bioguide = l?.id?.bioguide;
      if (lis && bioguide) map.set(String(lis), String(bioguide));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Mirrors fetch-house-votes.ts's persistVote, with two extra steps: Senate
 * positions are keyed by LIS id, so each one goes through the crosswalk to
 * a bioguide id before it can be matched to a Member row; and a bill this
 * project hasn't seen before gets fetched here rather than skipped, so a
 * full-session run builds up the Bill table from real votes cast instead
 * of requiring every bill to be pre-fetched by hand.
 */
async function persistVote(
  vote: SenateVote,
  crosswalk: Map<string, string>,
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
      await sleep(150);
    } catch (err) {
      console.error(
        `  couldn't fetch bill ${vote.billType} ${billNumber} (${vote.congress}th Congress): ${(err as Error).message}`
      );
      return { stored: 0, skipped: vote.positions.length };
    }
  }

  const date = new Date(vote.date);

  let stored = 0;
  let skipped = 0;
  for (const p of vote.positions) {
    const bioguideId = crosswalk.get(p.lisId);
    const memberId = bioguideId ? memberIdByBioguide.get(bioguideId) : undefined;
    if (!p.position || !memberId) {
      skipped++;
      continue;
    }

    await prisma.vote.upsert({
      where: { memberId_billId: { memberId, billId: bill.id } },
      create: {
        memberId,
        billId: bill.id,
        chamber: Chamber.SENATE,
        position: p.position,
        rollCall: vote.rollNumber,
        date,
      },
      update: { position: p.position, rollCall: vote.rollNumber, date },
    });
    stored++;
  }
  return { stored, skipped };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const congress = Number(process.argv[2] ?? 119);
  const session = Number(process.argv[3] ?? 1);

  const crosswalk = await buildLisToBioguide();
  const members = await prisma.member.findMany({
    select: { id: true, bioguideId: true },
  });
  const memberIdByBioguide = new Map(members.map((m) => [m.bioguideId, m.id]));

  const rolls = await listRollNumbers(congress, session);
  console.log(`${rolls.length} roll-call votes in ${congress}-${session}`);

  let stored = 0;
  let skipped = 0;
  for (const roll of rolls) {
    try {
      const vote = await fetchVote(congress, session, roll);
      const result = await persistVote(vote, crosswalk, memberIdByBioguide);
      stored += result.stored;
      skipped += result.skipped;
    } catch (err) {
      console.error(`  skipped roll ${roll}:`, (err as Error).message);
    }
    await sleep(250);
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
