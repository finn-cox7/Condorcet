/**
 * scripts/apply-plain-summaries.ts
 *
 * Writes the hand-written ~30-word summaries in scripts/data/plain-summaries.json
 * into Bill.plainSummary. The summaries are content, not code: they live in a
 * checked-in file so every one can be reviewed in a diff, and re-running this
 * reproduces the exact same text without calling an LLM.
 *
 * Keys are "<congress>-<billType>-<billNumber>", e.g. "119-s-1383".
 * Idempotent: safe to re-run.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/apply-plain-summaries.ts
 */

import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const SUMMARIES_PATH = new URL("./data/plain-summaries.json", import.meta.url);
const MAX_WORDS = 40;

async function main() {
  const summaries: Record<string, string> = JSON.parse(
    readFileSync(SUMMARIES_PATH, "utf8"),
  );

  let updated = 0;
  for (const [key, plainSummary] of Object.entries(summaries)) {
    const [congress, billType, billNumber] = key.split("-");

    const words = plainSummary.trim().split(/\s+/).length;
    if (words > MAX_WORDS) {
      console.warn(`  ${key}: ${words} words (over ${MAX_WORDS})`);
    }

    const result = await prisma.bill.updateMany({
      where: {
        congress: Number(congress),
        billType,
        billNumber: Number(billNumber),
      },
      data: { plainSummary },
    });
    if (result.count === 0) {
      console.warn(`  ${key}: no matching Bill row — skipped`);
    } else {
      updated++;
    }
  }

  // Bills that have a CRS summary but no plain-language one yet — typically
  // new bills pulled in by a later vote backfill. Bills with no CRS summary
  // stay null on purpose; the UI shows "summary not yet available".
  const missing = await prisma.bill.findMany({
    where: { summary: { not: null }, plainSummary: null },
    select: { congress: true, billType: true, billNumber: true },
  });
  for (const b of missing) {
    console.warn(`  needs a summary: ${b.congress}-${b.billType}-${b.billNumber}`);
  }

  console.log(
    `Updated ${updated} bills. ${missing.length} bills still need a plain summary.`,
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
