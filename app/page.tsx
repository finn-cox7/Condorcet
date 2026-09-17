import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { STATE_NAMES } from "@/lib/states";
import { RaceSearch, type RaceOption } from "./components/RaceSearch";
import { SiteFooter } from "./components/SiteFooter";

// Server Component: this function runs on the server only, so it can query
// Postgres directly. Nothing here is sent to the browser except its HTML.
export default async function Home() {
  const races = await prisma.race.findMany({
    where: { chamber: "SENATE", electionYear: 2026 },
    select: { slug: true, state: true },
    orderBy: { name: "asc" }, // name starts with the state, so this is A-Z by state
  });

  const options: RaceOption[] = races.map((race) => ({
    slug: race.slug,
    stateName: STATE_NAMES[race.state] ?? race.state,
    stateCode: race.state,
  }));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-4 py-12 md:px-20">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="font-sans text-[26px] font-extrabold tracking-[-0.5px]"
        >
          Condorcet
        </Link>
        <Link href="/how-it-works" className="font-sans text-[15px] font-semibold">
          How it works
        </Link>
      </header>

      <main className="flex grow flex-col gap-7 pt-9">
        <h1 className="font-sans text-4xl font-extrabold tracking-[-1.5px] md:text-[56px]">
          Find your 2026 Senate race.
        </h1>

        <RaceSearch races={options} />
      </main>

      <SiteFooter className="mt-12" />
    </div>
  );
}
