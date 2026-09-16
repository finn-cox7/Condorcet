/**
 * scripts/retry-house-rolls.ts
 *
 * Re-fetches specific House roll-call votes that a full-session run skipped
 * (fetch-house-votes.ts logs those as "skipped roll N: ..."). Storing one
 * roll call takes seconds; re-running a whole session takes tens of minutes.
 *
 * Idempotent, like the session runs: re-storing a roll call just upserts the
 * same rows again.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/retry-house-rolls.ts <congress> <session> <roll,roll,...>
 *
 * Example (three rolls skipped during a 118th-Congress session 2 run):
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/retry-house-rolls.ts 118 2 246,247,249
 */

import { prisma } from "../lib/prisma";
import { Chamber } from "../app/generated/prisma/client";
import { fetchVote } from "./fetch-house-votes";
import { fetchAndStoreBill, type BillTypeCode } from "./fetch-bill";

// Matches fetch-house-votes.ts: pg's default pool is 10 connections, and a
// House vote has ~430 positions to store.
const UPSERT_BATCH_SIZE = 10;

async function main() {
  const [congressArg, sessionArg, rollsArg] = process.argv.slice(2);
  if (!congressArg || !sessionArg || !rollsArg) {
    console.error(
      "Usage: node --env-file=.env --env-file=.env.local --import tsx scripts/retry-house-rolls.ts <congress> <session> <roll,roll,...>"
    );
    process.exit(1);
  }

  const congress = Number(congressArg);
  const session = Number(sessionArg);
  const rolls = rollsArg.split(",").map(Number).filter(Number.isFinite);

  const members = await prisma.member.findMany({ select: { id: true, bioguideId: true } });
  const memberIdByBioguide = new Map(members.map((m) => [m.bioguideId, m.id]));

  for (const roll of rolls) {
    try {
      const vote = await fetchVote(congress, session, roll);
      if (!vote.billType || !vote.billNumber) {
        console.log(`roll ${roll}: not tied to a bill (e.g. an amendment vote) — nothing to store`);
        continue;
      }

      const billNumber = Number(vote.billNumber);
      const bill =
        (await prisma.bill.findUnique({
          where: {
            congress_billType_billNumber: { congress: vote.congress, billType: vote.billType, billNumber },
          },
        })) ??
        (await fetchAndStoreBill(vote.congress, vote.billType as BillTypeCode, billNumber));

      const date = new Date(vote.date);
      const toStore = vote.positions.flatMap((p) => {
        const memberId = memberIdByBioguide.get(p.bioguideId);
        return p.position && memberId ? [{ memberId, position: p.position }] : [];
      });

      for (let i = 0; i < toStore.length; i += UPSERT_BATCH_SIZE) {
        await Promise.all(
          toStore.slice(i, i + UPSERT_BATCH_SIZE).map(({ memberId, position }) =>
            prisma.vote.upsert({
              where: { memberId_billId: { memberId, billId: bill.id } },
              create: {
                memberId,
                billId: bill.id,
                chamber: Chamber.HOUSE,
                position,
                rollCall: roll,
                date,
              },
              update: { position, rollCall: roll, date },
            })
          )
        );
      }

      console.log(`roll ${roll}: ${vote.billType} ${billNumber} — stored ${toStore.length} positions`);
    } catch (err) {
      console.error(`roll ${roll}: FAILED again — ${(err as Error).message}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
