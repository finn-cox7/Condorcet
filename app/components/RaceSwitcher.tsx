"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RaceOption = { name: string; slug: string };

/**
 * The header "Race" field. A native <datalist> gives autocomplete over all 35
 * races without a custom dropdown; picking one navigates.
 */
export function RaceSwitcher({
  races,
  currentName,
}: {
  races: RaceOption[];
  currentName: string;
}) {
  const [value, setValue] = useState(currentName);
  const router = useRouter();

  function go(next: string) {
    const match = races.find(
      (race) => race.name.toLowerCase() === next.trim().toLowerCase()
    );
    if (match) router.push(`/race/${match.slug}`);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
      className="flex w-full max-w-[360px] items-center gap-2 border-b-2 border-black py-[6px]"
    >
      <label htmlFor="race-switcher" className="font-sans text-sm">
        Race
      </label>
      <input
        id="race-switcher"
        list="race-options"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          go(event.target.value);
        }}
        onFocus={(event) => event.target.select()}
        className="min-w-0 grow bg-transparent font-serif text-base outline-none"
      />
      <datalist id="race-options">
        {races.map((race) => (
          <option key={race.slug} value={race.name} />
        ))}
      </datalist>
    </form>
  );
}
