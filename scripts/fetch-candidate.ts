/**
 * scripts/fetch-candidate.ts
 *
 * Pulls one candidate from the FEC API and upserts them into the Candidate
 * table. FEC's data is campaign-finance registration only — no party can be
 * trusted as "the ballot party" (see Risch, James: FEC lists him as "UNK"
 * despite being a three-term incumbent) and no field links to a bioguide
 * id. So this script does its own best-effort name/state match against
 * Member, and leaves the real party call to create-race.ts, where a human
 * sets it per race.
 *
 * Usage:
 *   npx tsx scripts/fetch-candidate.ts <fecCandidateId> [websiteUrl]
 *
 * websiteUrl is required only when the candidate doesn't match an existing
 * Member — that's the "no federal voting record" case, and FEC has no
 * website field to fall back on.
 */

import { prisma } from "../lib/prisma";

const FEC_API_BASE = "https://api.open.fec.gov/v1";

const PARTY_MAP: Record<string, string> = {
  DEM: "D",
  REP: "R",
  IND: "I",
};

function normalizeParty(raw: string): string {
  return PARTY_MAP[raw] ?? raw;
}

/**
 * FEC names are all-caps with accents dropped ("LUJAN"); Congress.gov keeps
 * them ("Luján"). NFD splits "á" into "a" + a combining accent mark, and the
 * regex strips the marks, so both sides compare as "lujan".
 */
function normalizeName(raw: string): string {
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries on 429 with exponential backoff — FEC's rate limit is easy to
 *  hit in a batch run (see seed-senate-races.ts) and returns no useful
 *  Retry-After header, so this just backs off and tries again. */
async function fetchFromFec(path: string, attempt = 1): Promise<any> {
  const url = new URL(`${FEC_API_BASE}${path}`);
  url.searchParams.set("api_key", process.env.FEC_API_KEY ?? "");

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * 2 ** attempt);
    return fetchFromFec(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`FEC API request failed: ${res.status} ${res.statusText} (${path})`);
  }
  return res.json();
}

export type FetchCandidateResult = {
  id: string;
  firstName: string;
  lastName: string;
  linkedBioguideId: string | null;
  needsWebsite: boolean;
};

/**
 * requireWebsite defaults to true (the CLI's original hard-stop behavior).
 * The batch seed script passes false so a challenger with no known website
 * yet still gets stored — as needsWebsite: true, for manual follow-up —
 * instead of aborting the whole race over one missing URL.
 */
export async function fetchAndStoreCandidate(
  fecCandidateId: string,
  websiteUrl?: string,
  {
    requireWebsite = true,
    memberBioguideId,
  }: { requireWebsite?: boolean; memberBioguideId?: string } = {}
): Promise<FetchCandidateResult> {
  const data = await fetchFromFec(`/candidate/${fecCandidateId}/`);
  const c = data?.results?.[0];
  if (!c) throw new Error(`No FEC candidate found for ${fecCandidateId}`);

  const firstName = String(c.candidate_first_name ?? "");
  const lastName = String(c.candidate_last_name ?? "");
  const state = String(c.state ?? "");

  let member: { id: string; bioguideId: string } | null | undefined;

  if (memberBioguideId) {
    // Explicit override for when FEC's legal name doesn't match the public
    // one on file — e.g. Ashley Hinson's Senate filing uses a married name
    // ("Arenholz") that her House Member record doesn't have.
    member = await prisma.member.findUnique({ where: { bioguideId: memberBioguideId } });
    if (!member) throw new Error(`memberBioguideId override "${memberBioguideId}" doesn't match any Member`);
  } else {
    // Best-effort match: FEC has no bioguide crosswalk, so this is the only
    // signal available. Deliberately not filtered by chamber — a House
    // member running for Senate is the same person with the same record.
    const sameState = await prisma.member.findMany({ where: { state } });
    const candidates = sameState.filter(
      (m) => normalizeName(m.lastName) === normalizeName(lastName)
    );
    const exact = candidates.find(
      (m) => normalizeName(m.firstName) === normalizeName(firstName)
    );
    member = exact ?? (candidates.length === 1 ? candidates[0] : undefined);

    if (member && !exact) {
      // FEC uses legal names ("GARLAND ANDY BARR", "MICHAEL COLLINS"), so a
      // first-name mismatch is common — but it's also how a wrong link
      // would look. Always worth a human glance.
      const m = candidates[0];
      console.warn(
        `  linked ${firstName} ${lastName} to Member ${m.firstName} ${m.lastName} (${m.bioguideId}) on last name + state only — verify it's the same person.`
      );
    }
    if (candidates.length > 1 && !member) {
      console.warn(
        `  ${candidates.length} same-last-name Members in ${state}, none matched first name "${firstName}" — leaving unlinked. Check manually if this is wrong.`
      );
    }
  }

  const needsWebsite = !member && !websiteUrl;
  if (needsWebsite && requireWebsite) {
    throw new Error(
      `No Member match for ${firstName} ${lastName} (${state}) — this candidate has no federal voting record, ` +
        `so a websiteUrl is required. Usage: npx tsx scripts/fetch-candidate.ts ${fecCandidateId} <websiteUrl>`
    );
  }

  const stored = await prisma.candidate.upsert({
    where: { fecCandidateId },
    create: {
      fecCandidateId,
      firstName,
      lastName,
      party: normalizeParty(String(c.party ?? "")),
      state,
      memberId: member?.id ?? null,
      websiteUrl: member ? null : websiteUrl,
    },
    update: {
      firstName,
      lastName,
      party: normalizeParty(String(c.party ?? "")),
      state,
      memberId: member?.id ?? null,
      websiteUrl: member ? null : websiteUrl,
    },
  });

  return {
    id: stored.id,
    firstName,
    lastName,
    linkedBioguideId: member?.bioguideId ?? null,
    needsWebsite,
  };
}

async function main() {
  const fecCandidateId = process.argv[2];
  const websiteUrl = process.argv[3];

  if (!fecCandidateId) {
    console.error("Usage: npx tsx scripts/fetch-candidate.ts <fecCandidateId> [websiteUrl]");
    process.exit(1);
  }

  const result = await fetchAndStoreCandidate(fecCandidateId, websiteUrl);
  console.log(
    `Stored ${result.firstName} ${result.lastName} (${fecCandidateId})` +
      (result.linkedBioguideId
        ? ` — linked to Member ${result.linkedBioguideId}`
        : ` — no voting record, website: ${websiteUrl}`)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
