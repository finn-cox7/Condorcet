/**
 * scripts/create-race.ts
 *
 * Assembles a Race from Candidate rows that already exist in the database
 * (run fetch-candidate.ts for each candidate first). This is the
 * "hardcoded per race" step — nothing here infers who's running or what
 * party they're actually on; you supply both explicitly, because FEC's
 * own party field can't be trusted (see fetch-candidate.ts's header).
 *
 * Usage:
 *   npx tsx scripts/create-race.ts <state> <electionYear> <S|H> <district|-> <fecId:party> [<fecId:party> ...]
 *
 * Example (Idaho Senate 2026, three-way race):
 *   npx tsx scripts/create-race.ts ID 2026 S - S8ID00092:R S6ID00138:D S6ID00146:I
 */

import { prisma } from "../lib/prisma";
import { Chamber } from "../app/generated/prisma/client";

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

export type RaceCandidateSpec = { fecCandidateId: string; party: string };

export type CreateRaceResult = {
  name: string;
  stored: { firstName: string; lastName: string; party: string }[];
  missing: string[]; // fecCandidateIds with no Candidate row yet
};

/**
 * skipMissingCandidates defaults to false (the CLI's original hard-stop
 * behavior: a bad fecId aborts the whole race). The batch seed script
 * passes true so one unresolved candidate doesn't take an otherwise-good
 * race down with it — it's reported back instead.
 */
export async function createRace(
  state: string,
  electionYear: number,
  chamberArg: string,
  districtArg: string,
  candidates: RaceCandidateSpec[],
  { skipMissingCandidates = false }: { skipMissingCandidates?: boolean } = {}
): Promise<CreateRaceResult> {
  const chamber: Chamber = chamberArg.toUpperCase() === "S" ? Chamber.SENATE : Chamber.HOUSE;
  const district = districtArg === "-" ? null : Number(districtArg);
  const stateName = STATE_NAMES[state.toUpperCase()];
  if (!stateName) throw new Error(`Unrecognized state code: ${state}`);

  const name =
    chamber === Chamber.SENATE
      ? `${stateName} Senate ${electionYear}`
      : `${stateName} District ${district} ${electionYear}`;

  // Prisma's compound-unique shorthand can't be used here: district is
  // nullable, and Postgres doesn't treat NULL as equal to NULL for
  // uniqueness lookups, so Prisma's generated type excludes null from it.
  // Senate races always have a null district, so we upsert manually.
  const existing = await prisma.race.findFirst({
    where: { state: state.toUpperCase(), district, electionYear, chamber },
  });
  const race = existing
    ? await prisma.race.update({ where: { id: existing.id }, data: { name } })
    : await prisma.race.create({
        data: { name, electionYear, chamber, state: state.toUpperCase(), district },
      });

  const stored: CreateRaceResult["stored"] = [];
  const missing: string[] = [];

  for (const { fecCandidateId, party } of candidates) {
    const candidate = await prisma.candidate.findUnique({ where: { fecCandidateId } });
    if (!candidate) {
      if (skipMissingCandidates) {
        missing.push(fecCandidateId);
        continue;
      }
      throw new Error(
        `No Candidate for FEC id ${fecCandidateId} — run fetch-candidate.ts ${fecCandidateId} first.`
      );
    }

    await prisma.raceCandidate.upsert({
      where: { raceId_candidateId: { raceId: race.id, candidateId: candidate.id } },
      create: { raceId: race.id, candidateId: candidate.id, party },
      update: { party },
    });
    stored.push({ firstName: candidate.firstName, lastName: candidate.lastName, party });
  }

  return { name, stored, missing };
}

async function main() {
  const [, , state, electionYearArg, chamberArg, districtArg, ...candidateArgs] = process.argv;

  if (!state || !electionYearArg || !chamberArg || !districtArg || candidateArgs.length < 2) {
    console.error(
      "Usage: npx tsx scripts/create-race.ts <state> <electionYear> <S|H> <district|-> <fecId:party> <fecId:party> [...]"
    );
    process.exit(1);
  }

  const candidates: RaceCandidateSpec[] = candidateArgs.map((arg) => {
    const [fecCandidateId, party] = arg.split(":");
    if (!fecCandidateId || !party) {
      throw new Error(`Malformed candidate arg "${arg}" — expected <fecId>:<party>`);
    }
    return { fecCandidateId, party };
  });

  const result = await createRace(state, Number(electionYearArg), chamberArg, districtArg, candidates);
  for (const c of result.stored) console.log(`  + ${c.firstName} ${c.lastName} (${c.party})`);
  console.log(`Stored race: ${result.name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
