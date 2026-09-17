/** Display helpers shared by the race pages. */

const BILL_PREFIXES: Record<string, string> = {
  hr: "H.R.",
  s: "S.",
  hjres: "H.J.Res.",
  sjres: "S.J.Res.",
  hconres: "H.Con.Res.",
  sconres: "S.Con.Res.",
  hres: "H.Res.",
  sres: "S.Res.",
};

const BILL_URL_SEGMENTS: Record<string, string> = {
  hr: "house-bill",
  s: "senate-bill",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
  hres: "house-resolution",
  sres: "senate-resolution",
};

/** "hr", 82 -> "H.R. 82" */
export function billLabel(billType: string, billNumber: number): string {
  const prefix = BILL_PREFIXES[billType.toLowerCase()] ?? `${billType.toUpperCase()}.`;
  return `${prefix} ${billNumber}`;
}

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Public congress.gov page for a bill, or null for an unrecognized type. */
export function billUrl(
  congress: number,
  billType: string,
  billNumber: number
): string | null {
  const segment = BILL_URL_SEGMENTS[billType.toLowerCase()];
  if (!segment) return null;
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${segment}/${billNumber}`;
}

/**
 * Names that a plain title-case gets wrong. FEC stores legal names in caps
 * ("RAYMOND MCKAY"), so the casing has to be reconstructed. Add to this map
 * rather than widening the rule — "Macdonald" and "MacDonald" are both real.
 */
const NAME_OVERRIDES: Record<string, string> = {
  MCKAY: "McKay",
};

function titleCaseWord(word: string): string {
  const override = NAME_OVERRIDES[word.toUpperCase()];
  if (override) return override;
  return word
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, boundary: string, letter: string) => boundary + letter.toUpperCase());
}

/**
 * A candidate's name for display. Pass the linked Member's name when there is
 * one — Congress.gov already stores it cased correctly, so it is used as-is.
 */
export function candidateDisplayName(
  fecFirst: string,
  fecLast: string,
  member: { firstName: string; lastName: string } | null
): string {
  if (member) return `${member.firstName} ${member.lastName}`;
  return `${titleCaseWord(fecFirst)} ${titleCaseWord(fecLast)}`;
}

/** Hostname of a campaign site, for link text: "mckayforussenate.com". */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
