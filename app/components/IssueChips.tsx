"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { policyAreaSlug } from "@/lib/policy-areas";

/**
 * The picked issues, shown above the records. Clicking one removes it and
 * reloads with the narrower set; the dashed chip goes back to the picker.
 */
export function IssueChips({
  raceSlug,
  issues,
}: {
  raceSlug: string;
  issues: string[];
}) {
  const router = useRouter();

  function remove(area: string) {
    const remaining = issues.filter((issue) => issue !== area);
    if (remaining.length === 0) {
      router.push(`/race/${raceSlug}`);
      return;
    }
    router.push(`/race/${raceSlug}?issues=${remaining.map(policyAreaSlug).join(",")}`);
  }

  return (
    <div className="flex flex-wrap gap-[10px]">
      {issues.map((area) => (
        <button
          key={area}
          type="button"
          onClick={() => remove(area)}
          aria-label={`Remove ${area}`}
          title={`Remove ${area}`}
          className="h-11 rounded-full border-2 border-black bg-accent px-[18px] font-sans text-[15px] font-semibold"
        >
          {area}
        </button>
      ))}
      <Link
        href={`/race/${raceSlug}`}
        className="flex h-11 items-center rounded-full border-2 border-dashed border-black px-[18px] font-sans text-[15px]"
      >
        Add an issue
      </Link>
    </div>
  );
}
