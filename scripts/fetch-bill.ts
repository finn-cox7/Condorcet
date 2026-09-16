import { prisma } from "../lib/prisma";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

export type BillTypeCode =
  | "hr"
  | "s"
  | "hjres"
  | "sjres"
  | "hconres"
  | "sconres"
  | "hres"
  | "sres";

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Congress.gov is intermittently slow. Timeouts, dropped connections, 429s,
 * and 5xx errors usually clear up on their own, so those retry with backoff
 * (2s, 4s, 8s). Other 4xx errors (404, 400) won't change on retry, so they
 * fail immediately.
 */
async function fetchFromCongressApi(path: string, attempt = 1) {
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("api_key", process.env.CONGRESS_API_KEY ?? "");
  url.searchParams.set("format", "json");

  let retryable = true;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (response.ok) return await response.json(); // inside the try: the body read can time out too
    retryable = response.status === 429 || response.status >= 500;
    throw new Error(
      `Congress.gov API request failed: ${response.status} ${response.statusText} (${path})`,
    );
  } catch (err) {
    if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
    await sleep(1000 * 2 ** attempt);
    return fetchFromCongressApi(path, attempt + 1);
  }
}

export async function fetchAndStoreBill(
  congress: number,
  billType: BillTypeCode,
  billNumber: number,
) {
  const billData = await fetchFromCongressApi(
    `/bill/${congress}/${billType}/${billNumber}`,
  );
  const bill = billData.bill;

  const summaryData = await fetchFromCongressApi(
    `/bill/${congress}/${billType}/${billNumber}/summaries`,
  );
  // Congress.gov returns one summary per bill version (Introduced, Passed
  // Senate, Public Law, ...), oldest first. The newest describes the text
  // that was actually voted on — summaries[0] can describe an entirely
  // different bill when Congress reused the number as a shell (S. 1383 was
  // introduced as a veterans bill and passed as the SAVE America Act).
  const summaries: { text: string; actionDate: string; updateDate: string }[] =
    summaryData.summaries ?? [];
  const newest = [...summaries].sort(
    (a, b) =>
      b.actionDate.localeCompare(a.actionDate) ||
      b.updateDate.localeCompare(a.updateDate),
  )[0];
  const summary: string | null = newest?.text ?? null;

  const stored = await prisma.bill.upsert({
    where: {
      congress_billType_billNumber: { congress, billType, billNumber },
    },
    create: {
      congress,
      billType,
      billNumber,
      title: bill.title,
      policyArea: bill.policyArea?.name ?? null,
      summary,
    },
    update: {
      title: bill.title,
      policyArea: bill.policyArea?.name ?? null,
      summary,
    },
  });

  console.log(
    `Stored ${billType.toUpperCase()} ${billNumber} (${congress}th Congress): ${stored.title}`,
  );
  return stored;
}

async function main() {
  const [, , congressArg, billTypeArg, billNumberArg] = process.argv;

  if (!congressArg || !billTypeArg || !billNumberArg) {
    console.error(
      "Usage: node scripts/fetch-bill.ts <congress> <billType> <billNumber>",
    );
    console.error("Example: node scripts/fetch-bill.ts 118 hr 3076");
    process.exit(1);
  }

  await fetchAndStoreBill(
    Number(congressArg),
    billTypeArg as BillTypeCode,
    Number(billNumberArg),
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
