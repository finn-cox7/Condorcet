import type { Metadata } from "next";
import Link from "next/link";

import { VoteChip } from "@/app/components/RaceRecords";
import { SiteFooter } from "@/app/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { MAX_BILLS_PER_ISSUE, MAX_ISSUES } from "@/lib/policy-areas";
import { PRIMARY_ACTION } from "@/lib/ui";

export const metadata: Metadata = {
  title: "How Condorcet works",
  description:
    "Where the voting records come from, what the vote marks mean, and what Condorcet deliberately does not do.",
};

function Step({
  number,
  heading,
  children,
}: {
  number: number;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-6 border-t-[3px] border-black py-7 md:grid-cols-[96px_minmax(0,1fr)]">
      <span className="font-sans text-5xl font-extrabold leading-none md:text-[64px]">
        {number}
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="font-sans text-2xl font-extrabold md:text-[26px]">{heading}</h3>
        <p className="max-w-[640px] text-[19px] leading-[1.6]">{children}</p>
      </div>
    </li>
  );
}

function LegendRow({ chip, meaning }: { chip: React.ReactNode; meaning: string }) {
  return (
    <div className="flex items-start gap-4">
      {chip}
      <span className="text-[17px]">{meaning}</span>
    </div>
  );
}

export default async function HowItWorksPage() {
  // Queried, not hardcoded: DESIGN.md requires every claim on this page to be
  // true of the shipped code, and these two numbers move with the data.
  const [raceCount, areaRows] = await Promise.all([
    prisma.race.count({ where: { chamber: "SENATE", electionYear: 2026 } }),
    prisma.bill.groupBy({
      by: ["policyArea"],
      where: { policyArea: { not: null }, votes: { some: {} } },
    }),
  ]);
  const areaCount = areaRows.length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col gap-14 px-4 pb-16 pt-12 md:px-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-sans text-[26px] font-extrabold tracking-[-0.5px]">
          Condorcet
        </Link>
        <Link href="/" className="font-sans text-[15px] font-semibold">
          Find your race
        </Link>
      </header>

      <section className="flex flex-col gap-5">
        <h1 className="font-sans text-5xl font-extrabold tracking-[-2px] md:text-[64px]">
          How Condorcet works
        </h1>
        <p className="max-w-[640px] text-[22px] leading-[1.6]">
          Three steps from your ballot to the voting record.
        </p>
      </section>

      <ol className="flex list-none flex-col p-0">
        <Step number={1} heading="Find your race">
          Search by state, or pick from the list of all {raceCount} Senate races on
          the 2026 ballot. Each race shows the candidates running in the general
          election.
        </Step>
        <Step number={2} heading={`Pick up to ${MAX_ISSUES} issues`}>
          Choose from the {areaCount} policy areas Congress&rsquo;s own researchers
          use to label every bill, so an issue means the same thing for every
          candidate in the race.
        </Step>
        <Step number={3} heading="Compare the votes">
          For each issue, see up to {MAX_BILLS_PER_ISSUE} recent bills for each
          candidate, side by side: what the bill does in about thirty words, and
          how that candidate voted.
        </Step>
      </ol>

      <section className="grid grid-cols-1 gap-14 md:grid-cols-2">
        <div className="flex flex-col gap-[14px]">
          <h2 className="font-sans text-3xl font-extrabold tracking-[-0.5px]">
            Where the data comes from
          </h2>
          <p className="max-w-[640px] text-[19px] leading-[1.6]">
            Bills, members and House roll calls come from{" "}
            <a href="https://www.congress.gov" target="_blank" rel="noreferrer">
              Congress.gov
            </a>
            ; Senate roll calls come from{" "}
            <a href="https://www.senate.gov" target="_blank" rel="noreferrer">
              Senate.gov
            </a>
            ; candidate filings come from the{" "}
            <a href="https://www.fec.gov" target="_blank" rel="noreferrer">
              Federal Election Commission
            </a>
            . Every bill links to its own page on congress.gov.
          </p>
          <p className="max-w-[640px] text-[19px] leading-[1.6]">
            Each summary is shortened by hand from the official Congressional
            Research Service summary of the version that was voted on, and says
            only what that summary says. Where CRS has not published one yet, the
            bill says so rather than showing words of ours.
          </p>
        </div>

        <div className="flex flex-col gap-[14px]">
          <h2 className="font-sans text-3xl font-extrabold tracking-[-0.5px]">
            What the vote marks mean
          </h2>
          <LegendRow chip={<VoteChip position="YEA" />} meaning="Voted for the bill." />
          <LegendRow chip={<VoteChip position="NAY" />} meaning="Voted against the bill." />
          <LegendRow
            chip={<VoteChip position="PRESENT" />}
            meaning="Was there, but declined to vote either way."
          />
          <LegendRow
            chip={<VoteChip position="NOT_VOTING" />}
            meaning="Was absent or did not vote."
          />
          <p className="max-w-[640px] text-[19px] leading-[1.6]">
            A vote on a bill is not a stance on the issue. Read the summary to see
            what the bill actually does.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-[14px] border-[3px] border-black p-9">
        <h2 className="font-sans text-3xl font-extrabold tracking-[-0.5px]">
          What we don&rsquo;t do
        </h2>
        <p className="max-w-[900px] text-[19px] leading-[1.6]">
          We don&rsquo;t score candidates, recommend anyone, or guess where they
          stand. If a candidate has never served in Congress, we say so and link to
          their campaign site instead of leaving a blank column.
        </p>
      </section>

      <div className="flex items-center gap-6">
        <Link
          href="/"
          className={`${PRIMARY_ACTION} h-14 px-[30px] text-lg`}
        >
          Find your race
        </Link>
      </div>

      <SiteFooter />
    </div>
  );
}
