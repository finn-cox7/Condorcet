/**
 * scripts/merge-plain-summaries.ts
 *
 * Merges a batch of hand-written summaries into
 * scripts/data/plain-summaries.json. The batch file is JSON shaped like the
 * main file: { "<congress>-<billType>-<billNumber>": "~30-word summary" }.
 *
 * Run apply-plain-summaries.ts afterwards to write them to the database.
 * Touches no database, so it needs no --env-file.
 *
 * Usage:
 *   node --import tsx scripts/merge-plain-summaries.ts <batch.json>
 */

import { readFileSync, writeFileSync } from "node:fs";

const SUMMARIES_PATH = new URL("./data/plain-summaries.json", import.meta.url);
const KEY_PATTERN = /^\d+-[a-z]+-\d+$/;

function main() {
  const batchPath = process.argv[2];
  if (!batchPath) {
    console.error("Usage: node --import tsx scripts/merge-plain-summaries.ts <batch.json>");
    process.exit(1);
  }

  const summaries: Record<string, string> = JSON.parse(
    readFileSync(SUMMARIES_PATH, "utf8")
  );
  const batch: Record<string, string> = JSON.parse(readFileSync(batchPath, "utf8"));

  let added = 0;
  for (const [key, summary] of Object.entries(batch)) {
    if (!KEY_PATTERN.test(key)) {
      console.warn(`  bad key, skipped: ${key} (expected e.g. "119-hr-1")`);
      continue;
    }
    if (summaries[key] && summaries[key] !== summary) {
      console.warn(`  overwriting existing summary for ${key}`);
    }
    if (!summaries[key]) added++;
    summaries[key] = summary;
  }

  writeFileSync(SUMMARIES_PATH, `${JSON.stringify(summaries, null, 2)}\n`);
  console.log(`Merged: ${added} new, ${Object.keys(summaries).length} total.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
