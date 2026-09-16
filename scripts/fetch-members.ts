/**
 * scripts/fetch-members.ts
 *
 * Pulls House and Senate members from the Congress.gov API and upserts them
 * into the Member table. Run this before fetching votes — Vote.memberId is a
 * required foreign key, so members must exist first.
 *
 * Usage:
 *   npx tsx scripts/fetch-members.ts 119          # current members; refreshes existing rows
 *   npx tsx scripts/fetch-members.ts 118 --past   # everyone who served in the 118th; adds missing rows only
 *
 * --past exists for backfilling an older Congress's votes. It includes
 * members who have since left (e.g. Sherrod Brown) and never overwrites an
 * existing row — otherwise loading the 118th would turn a current senator
 * who was in the House back then (e.g. Jim Banks) back into a House member.
 */

import { prisma } from "../lib/prisma";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

type Chamber = "HOUSE" | "SENATE";

type MemberRecord = {
  bioguideId: string;
  firstName: string;
  lastName: string;
  party: string;
  chamber: Chamber;
  state: string;
  district: number | null;
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchFromCongressApi(path: string): Promise<any> {
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("api_key", process.env.CONGRESS_API_KEY ?? "");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(
      `Congress.gov API request failed: ${res.status} ${res.statusText} (${path})`
    );
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * Returns every bioguideId in the given congress — only those still serving
 * when currentOnly is true, everyone who served in it otherwise.
 */
async function listMemberIds(
  congress: number,
  currentOnly: boolean
): Promise<string[]> {
  const ids: string[] = [];

  let path: string | null =
    `/member/congress/${congress}?${currentOnly ? "currentMember=true&" : ""}limit=250`;
  while (path) {
    const data = await fetchFromCongressApi(path);
    const members = data?.members ?? [];
    ids.push(...members.map((m: any) => String(m.bioguideId)));

    const next: string | undefined = data?.pagination?.next;
    path = next ? next.replace(CONGRESS_API_BASE, "") : null;
  }

  return ids;
}

const CHAMBER_MAP: Record<string, Chamber> = {
  "House of Representatives": "HOUSE",
  Senate: "SENATE",
};

/**
 * The detail endpoint returns a member's full term history across every
 * congress they've served in (e.g. a senator who was previously a House
 * member). We only want their standing as of the congress we're loading.
 */
async function fetchMemberDetail(
  bioguideId: string,
  congress: number
): Promise<MemberRecord | null> {
  const data = await fetchFromCongressApi(`/member/${bioguideId}`);
  const m = data?.member;
  if (!m) throw new Error(`Unexpected shape for ${bioguideId}`);

  const term = (m.terms ?? []).find((t: any) => t.congress === congress);
  if (!term) return null; // not actually serving in this congress; skip

  const chamber = CHAMBER_MAP[term.chamber];
  if (!chamber) return null; // e.g. a non-voting territorial delegate

  const latestParty = m.partyHistory?.[m.partyHistory.length - 1];

  return {
    bioguideId: m.bioguideId,
    firstName: String(m.firstName ?? ""),
    lastName: String(m.lastName ?? ""),
    party: String(latestParty?.partyAbbreviation ?? ""),
    chamber,
    state: String(term.stateCode ?? ""),
    district: typeof term.district === "number" ? term.district : null,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** createOnly: insert if missing, leave an existing row exactly as it is. */
async function upsertMember(record: MemberRecord, createOnly: boolean) {
  await prisma.member.upsert({
    where: { bioguideId: record.bioguideId },
    create: record,
    update: createOnly
      ? {}
      : {
          firstName: record.firstName,
          lastName: record.lastName,
          party: record.party,
          chamber: record.chamber,
          state: record.state,
          district: record.district,
        },
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const congress = Number(process.argv[2] ?? 119);
  const past = process.argv.includes("--past");

  const ids = await listMemberIds(congress, !past);
  console.log(
    `${ids.length} ${past ? "past and current" : "current"} members in the ${congress}th Congress`
  );

  let stored = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      const record = await fetchMemberDetail(id, congress);
      if (!record) {
        skipped++;
      } else {
        await upsertMember(record, past);
        stored++;
      }
    } catch (err) {
      console.error(`  skipped ${id}:`, (err as Error).message);
      skipped++;
    }
    if ((stored + skipped) % 50 === 0) {
      console.log(`  ${stored + skipped}/${ids.length} (stored ${stored}, skipped ${skipped})`);
    }
    await sleep(50);
  }

  console.log(`Done. Stored ${stored}, skipped ${skipped}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
