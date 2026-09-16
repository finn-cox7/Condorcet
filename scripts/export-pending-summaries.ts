/**
 * scripts/export-pending-summaries.ts
 *
 * Lists bills that have raw CRS text (Bill.summary) but no plain-language
 * rewrite yet (Bill.plainSummary), writing them to a plain-text file so the
 * ~30-word summaries can be written offline. Feed the result back in with
 * merge-plain-summaries.ts, then apply-plain-summaries.ts.
 *
 * Bills already written into scripts/data/plain-summaries.json are skipped,
 * as is anything in SKIP below.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/export-pending-summaries.ts <outFile> [limit]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const SUMMARIES_PATH = new URL("./data/plain-summaries.json", import.meta.url);

// Deliberately left without a plain summary: CRS's only summary for this
// bill describes a different bill, because the number was reused as a shell.
const SKIP = new Set(["118-s-2073"]);

const DEFAULT_LIMIT = 60;
const MAX_SUMMARY_CHARS = 750;

/** CRS text arrives as HTML-ish markup; this flattens it to one readable line. */
function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const [outFile, limitArg] = process.argv.slice(2);
  if (!outFile) {
    console.error(
      "Usage: node --env-file=.env --import tsx scripts/export-pending-summaries.ts <outFile> [limit]"
    );
    process.exit(1);
  }

  const alreadyWritten: Record<string, string> = JSON.parse(
    readFileSync(SUMMARIES_PATH, "utf8")
  );

  const bills = await prisma.bill.findMany({
    where: { summary: { not: null }, plainSummary: null },
    orderBy: [{ congress: "desc" }, { billType: "asc" }, { billNumber: "asc" }],
    select: {
      congress: true,
      billType: true,
      billNumber: true,
      title: true,
      policyArea: true,
      summary: true,
    },
  });

  const pending = bills.filter((b) => {
    const key = `${b.congress}-${b.billType}-${b.billNumber}`;
    return !(key in alreadyWritten) && !SKIP.has(key);
  });

  const batch = pending.slice(0, Number(limitArg ?? DEFAULT_LIMIT));
  const text = batch
    .map((b) => {
      const summary = clean(b.summary ?? "");
      const trimmed =
        summary.length > MAX_SUMMARY_CHARS
          ? `${summary.slice(0, MAX_SUMMARY_CHARS)} […]`
          : summary;
      return `### ${b.congress}-${b.billType}-${b.billNumber} | ${b.policyArea ?? "no policy area"} | ${b.title.slice(0, 220)}\n${trimmed}\n`;
    })
    .join("\n");

  writeFileSync(outFile, text);
  console.log(
    `Exported ${batch.length} bills to ${outFile}; ${pending.length - batch.length} still pending after this batch.`
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
