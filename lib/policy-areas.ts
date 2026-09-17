/**
 * CRS policy areas — the fixed list of ~32 categories Congress.gov tags every
 * bill with. 31 of them have bills with a recorded vote in the loaded data.
 */

/** Max issues a user can compare at once (see CLAUDE.md, scope for v1). */
export const MAX_ISSUES = 5;

/** Max bills shown per issue, per candidate column, most recent first. */
export const MAX_BILLS_PER_ISSUE = 5;

/**
 * Shown above the full list on the issue picker under the heading "Popular".
 * Hand-picked, not derived from usage — there is no analytics data behind the
 * label. Order is deliberate.
 */
export const POPULAR = [
  "Health",
  "Taxation",
  "Immigration",
  "Economics and Public Finance",
  "Crime and Law Enforcement",
  "Energy",
];

/**
 * URL form of a policy area, e.g. "Crime and Law Enforcement" ->
 * "crime-and-law-enforcement". All 31 voted-on areas produce distinct slugs.
 */
export function policyAreaSlug(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
