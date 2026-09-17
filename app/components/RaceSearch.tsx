"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PRIMARY_ACTION } from "@/lib/ui";

export type RaceOption = {
  slug: string;
  stateName: string;
  stateCode: string;
};

/**
 * The search box and the browse list, which are one component because typing
 * in the box filters the list. Data comes from the server (app/page.tsx);
 * this only holds the query.
 */
export function RaceSearch({ races }: { races: RaceOption[] }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return races;
    return races.filter(
      (race) =>
        race.stateName.toLowerCase().includes(needle) ||
        race.stateCode.toLowerCase() === needle
    );
  }, [needle, races]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter or "Search" goes straight to the top match. With no match there is
    // nowhere to go, so the empty-state message below stays on screen.
    if (matches.length > 0) router.push(`/race/${matches[0].slug}`);
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        role="search"
        className="flex h-[68px] w-full max-w-[760px] items-center gap-[14px] border-[3px] border-black pl-5 pr-2"
      >
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
        <label htmlFor="race-search" className="sr-only">
          Search by state
        </label>
        <input
          id="race-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by state"
          autoComplete="off"
          className="min-w-0 grow bg-transparent font-serif text-2xl outline-none"
        />
        <button
          type="submit"
          className={`${PRIMARY_ACTION} h-[50px] shrink-0 px-6 text-[17px]`}
        >
          Search
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans text-lg font-semibold">
          {trimmed
            ? `${matches.length} ${matches.length === 1 ? "race" : "races"} matching “${trimmed}”`
            : `Or browse all ${races.length} races`}
        </h2>

        {matches.length === 0 ? (
          <p className="max-w-[640px] border-2 border-black p-4 font-sans text-[17px]">
            No 2026 Senate race matches that state. Only the {races.length}{" "}
            states holding a Senate election in 2026 are listed.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-3 lg:grid-cols-5">
            {matches.map((race) => (
              <Link
                key={race.slug}
                href={`/race/${race.slug}`}
                className="flex min-h-[44px] items-center border-b border-black font-sans text-[17px]"
              >
                {race.stateName}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
