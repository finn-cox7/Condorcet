"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MAX_ISSUES, policyAreaSlug } from "@/lib/policy-areas";
import { PRIMARY_ACTION } from "@/lib/ui";

type IssuePickerProps = {
  raceSlug: string;
  popular: string[];
  allIssues: string[];
};

export function IssuePicker({ raceSlug, popular, allIssues }: IssuePickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const matches = (area: string) => !needle || area.toLowerCase().includes(needle);

  const visiblePopular = popular.filter(matches);
  const visibleAll = allIssues.filter(matches);
  const nothingMatches = visiblePopular.length === 0 && visibleAll.length === 0;

  const atLimit = selected.length >= MAX_ISSUES;

  function toggle(area: string) {
    setSelected((current) => {
      if (current.includes(area)) return current.filter((a) => a !== area);
      if (current.length >= MAX_ISSUES) return current; // the cap is enforced here too
      return [...current, area];
    });
  }

  function showRecords() {
    if (selected.length === 0) return;
    const issues = selected.map(policyAreaSlug).join(",");
    router.push(`/race/${raceSlug}?issues=${issues}`);
  }

  function Chip({ area }: { area: string }) {
    const isSelected = selected.includes(area);
    return (
      <button
        type="button"
        onClick={() => toggle(area)}
        aria-pressed={isSelected}
        // Only unselected chips lock at the cap — you can always deselect.
        disabled={!isSelected && atLimit}
        className={`h-11 rounded-full border-2 border-black px-[18px] font-sans text-[15px] disabled:cursor-not-allowed disabled:opacity-40 ${
          isSelected ? "bg-accent font-semibold" : "bg-white font-normal"
        }`}
      >
        {area}
      </button>
    );
  }

  return (
    <>
      <main className="flex grow flex-col gap-7 pt-10">
        <h1 className="font-sans text-4xl font-extrabold tracking-[-1.5px] md:text-[52px]">
          What matters to you?
        </h1>

        <div className="flex w-full max-w-[560px] items-center gap-[14px] border-b-[3px] border-black pb-2">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" />
          </svg>
          <label htmlFor="issue-search" className="sr-only">
            Search issues
          </label>
          <input
            id="issue-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search issues, e.g. health, energy"
            autoComplete="off"
            className="min-w-0 grow bg-transparent font-serif text-xl outline-none"
          />
        </div>

        {nothingMatches ? (
          <p className="max-w-[640px] border-2 border-black p-4 font-sans text-[17px]">
            No issue matches “{trimmed}”. Issues are the {allIssues.length +
              popular.length}{" "}
            broad policy areas Congress files every bill under, so try a wider
            word like “health” or “energy”.
          </p>
        ) : (
          <>
            {visiblePopular.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-sans text-lg font-semibold">Popular</h2>
                <div className="flex flex-wrap gap-[10px]">
                  {visiblePopular.map((area) => (
                    <Chip key={area} area={area} />
                  ))}
                </div>
              </section>
            )}

            {visibleAll.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-sans text-lg font-semibold">All issues</h2>
                <div className="flex flex-wrap gap-[10px]">
                  {visibleAll.map((area) => (
                    <Chip key={area} area={area} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="sticky bottom-0 mt-7 flex flex-wrap items-center justify-between gap-4 border-t-[3px] border-black bg-white pt-5 pb-3">
        <span className="font-sans text-[17px]" aria-live="polite">
          <strong>
            {selected.length} of {MAX_ISSUES}
          </strong>{" "}
          {selected.length === 1 ? "issue" : "issues"} picked
        </span>
        <button
          type="button"
          onClick={showRecords}
          disabled={selected.length === 0}
          className={`${PRIMARY_ACTION} h-14 px-8 text-lg`}
        >
          Show voting records
        </button>
      </footer>
    </>
  );
}
