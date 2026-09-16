/**
 * scripts/audit-races.ts
 *
 * Read-only check that every race is displayable: for each candidate it
 * prints which of the four states they fall into (see Scope for v1 in
 * CLAUDE.md) and how many of their votes are actually showable — a vote
 * only displays if its bill has both a policyArea and a plainSummary.
 *
 * Run this after any ingestion or summary pass. "PROBLEMS: none" means no
 * candidate column would render empty or mislabeled.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/audit-races.ts
 */

import { prisma } from "../lib/prisma";

type VoteCounts = { congress: number; votes: number; shown: number };

async function main() {
  const races = await prisma.race.findMany({
    orderBy: { state: "asc" },
    include: { candidates: { include: { candidate: { include: { member: true } } } } },
  });

  const problems: string[] = [];
  let withRecord = 0;
  let noVotesCurrent = 0;
  let noRecord = 0;

  for (const race of races) {
    console.log(`== ${race.name}`);
    if (race.candidates.length < 2) {
      problems.push(`${race.name}: only ${race.candidates.length} candidate(s)`);
    }

    for (const rc of race.candidates) {
      const c = rc.candidate;
      let state: string;
      let detail: string;

      if (c.member) {
        const rows = await prisma.$queryRaw<VoteCounts[]>`
          SELECT b.congress,
                 count(*)::int AS votes,
                 count(*) FILTER (
                   WHERE b."plainSummary" IS NOT NULL AND b."policyArea" IS NOT NULL
                 )::int AS shown
          FROM "Vote" v
          JOIN "Bill" b ON b.id = v."billId"
          WHERE v."memberId" = ${c.member.id}
          GROUP BY 1 ORDER BY 1`;
        const current = rows.find((r) => r.congress === 119);
        const previous = rows.find((r) => r.congress === 118);
        detail =
          `${c.member.chamber} ${c.member.bioguideId} | ` +
          `119: ${current?.shown ?? 0}/${current?.votes ?? 0} | ` +
          `118: ${previous?.shown ?? 0}/${previous?.votes ?? 0}`;

        if ((current?.shown ?? 0) > 0) {
          state = "RECORD";
          withRecord++;
        } else if ((previous?.shown ?? 0) > 0) {
          state = "NO-VOTES-CURRENT";
          noVotesCurrent++;
        } else {
          state = "LINKED-BUT-EMPTY";
          problems.push(
            `${race.name}: ${c.firstName} ${c.lastName} is linked to a Member but has no displayable votes`
          );
        }
      } else if (c.formerMemberOfCongress) {
        state = "NO-VOTES-CURRENT";
        noVotesCurrent++;
        detail = `former member, website=${c.websiteUrl ? "yes" : "NONE"}`;
        if (!c.websiteUrl) {
          problems.push(`${race.name}: ${c.firstName} ${c.lastName} is a former member with no website`);
        }
      } else {
        state = "NO-RECORD";
        noRecord++;
        detail = `website=${c.websiteUrl ? "yes" : "NONE"}`;
        if (!c.websiteUrl) {
          problems.push(`${race.name}: ${c.firstName} ${c.lastName} has no Member and no website`);
        }
      }

      console.log(
        `   ${rc.party.padEnd(4)} ${`${c.firstName} ${c.lastName}`.padEnd(24)} ${state.padEnd(17)} ${detail}`
      );
    }
  }

  console.log(
    `\nSTATES: record=${withRecord} noVotesCurrent=${noVotesCurrent} noRecord=${noRecord} ` +
      `(total ${withRecord + noVotesCurrent + noRecord})`
  );
  console.log(
    `PROBLEMS (${problems.length}):` + (problems.length ? `\n  - ${problems.join("\n  - ")}` : " none")
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
