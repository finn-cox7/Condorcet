import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueChips } from "@/app/components/IssueChips";
import { IssuePicker } from "@/app/components/IssuePicker";
import { IssueSection, type BillRecord, type CandidateColumn } from "@/app/components/RaceRecords";
import { RaceSwitcher } from "@/app/components/RaceSwitcher";
import { candidateDisplayName } from "@/lib/format";
import {
  MAX_BILLS_PER_ISSUE,
  MAX_ISSUES,
  POPULAR,
  policyAreaSlug,
} from "@/lib/policy-areas";
import { prisma } from "@/lib/prisma";
import { HEADLINE_HIGHLIGHT } from "@/lib/ui";

export default async function RacePage({ params, searchParams }: PageProps<"/race/[slug]">) {
  const { slug } = await params;
  const { issues: issuesParam } = await searchParams;

  const race = await prisma.race.findUnique({
    where: { slug },
    select: {
      name: true,
      candidates: {
        select: {
          party: true,
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              websiteUrl: true,
              formerMemberOfCongress: true,
              member: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!race) notFound();

  // Only policy areas with a bill that actually got a recorded vote.
  const areaRows = await prisma.bill.groupBy({
    by: ["policyArea"],
    where: { policyArea: { not: null }, votes: { some: {} } },
  });
  const areas = areaRows
    .map((row) => row.policyArea as string)
    .sort((a, b) => a.localeCompare(b));

  // ?issues= carries slugs; map them back to the stored policy-area names and
  // drop anything unrecognized rather than erroring on a hand-edited URL.
  const requested = (Array.isArray(issuesParam) ? issuesParam.join(",") : issuesParam ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selected = requested
    .map((wanted) => areas.find((area) => policyAreaSlug(area) === wanted))
    .filter((area): area is string => Boolean(area))
    .filter((area, index, all) => all.indexOf(area) === index)
    .slice(0, MAX_ISSUES);

  const header = (
    <Link href="/" className="font-sans text-[26px] font-extrabold tracking-[-0.5px]">
      Condorcet
    </Link>
  );

  if (selected.length === 0) {
    const popular = POPULAR.filter((area) => areas.includes(area));
    const allIssues = areas.filter((area) => !popular.includes(area));

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-4 py-12 md:px-20">
        <header className="flex flex-wrap items-center justify-between gap-3">
          {header}
          <div className="flex items-center gap-3 font-sans text-[15px]">
            <span className="font-semibold">{race.name}</span>
            <Link href="/">Change race</Link>
          </div>
        </header>
        <IssuePicker raceSlug={slug} popular={popular} allIssues={allIssues} />
      </div>
    );
  }

  // --- Comparison view ---------------------------------------------------

  const candidates = race.candidates
    .map((entry) => ({
      party: entry.party,
      ...entry.candidate,
      displayName: candidateDisplayName(
        entry.candidate.firstName,
        entry.candidate.lastName,
        entry.candidate.member
      ),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const memberIds = candidates
    .map((candidate) => candidate.member?.id)
    .filter((id): id is string => Boolean(id));

  // A linked member with no 119th-Congress vote at all gets the "no votes in
  // the current Congress" note above their 118th record.
  const currentVoters = new Set(
    memberIds.length
      ? (
          await prisma.vote.groupBy({
            by: ["memberId"],
            where: { memberId: { in: memberIds }, bill: { congress: 119 } },
          })
        ).map((row) => row.memberId)
      : []
  );

  const votes = memberIds.length
    ? await prisma.vote.findMany({
        where: { memberId: { in: memberIds }, bill: { policyArea: { in: selected } } },
        select: {
          memberId: true,
          position: true,
          bill: {
            select: {
              id: true,
              congress: true,
              billType: true,
              billNumber: true,
              title: true,
              plainSummary: true,
              policyArea: true,
            },
          },
        },
        orderBy: { date: "desc" },
      })
    : [];

  // issue -> memberId -> that member's most recent bills on it. Votes arrive
  // newest first, so pushing in order keeps them sorted; Vote is unique per
  // member per bill, so there is nothing to de-duplicate.
  const byIssue = new Map<string, Map<string, BillRecord[]>>();
  for (const vote of votes) {
    const issue = vote.bill.policyArea as string;
    let byMember = byIssue.get(issue);
    if (!byMember) {
      byMember = new Map();
      byIssue.set(issue, byMember);
    }
    const bills = byMember.get(vote.memberId) ?? [];
    if (bills.length < MAX_BILLS_PER_ISSUE) {
      bills.push({ ...vote.bill, position: vote.position });
    }
    byMember.set(vote.memberId, bills);
  }

  const allRaces = await prisma.race.findMany({
    select: { name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col gap-9 px-4 py-12 md:px-20">
      <header className="flex flex-wrap items-center justify-between gap-6">
        {header}
        <RaceSwitcher races={allRaces} currentName={race.name} />
      </header>

      <h1 className="font-sans text-4xl font-extrabold leading-[1.05] tracking-[-1.5px] md:text-[56px]">
        {candidates.map((candidate, index) => (
          <span key={candidate.id}>
            {index > 0 && (index === candidates.length - 1 ? " and " : ", ")}
            <span className={HEADLINE_HIGHLIGHT}>{candidate.displayName}</span>
          </span>
        ))}
        , on the record.
      </h1>

      <IssueChips raceSlug={slug} issues={selected} />

      {selected.map((issue) => {
        const byMember = byIssue.get(issue);
        const columns: CandidateColumn[] = candidates.map((candidate) => ({
          key: candidate.id,
          name: candidate.displayName,
          party: candidate.party,
          websiteUrl: candidate.websiteUrl,
          hasMember: Boolean(candidate.member),
          hasCurrentVotes: Boolean(candidate.member && currentVoters.has(candidate.member.id)),
          formerMemberOfCongress: candidate.formerMemberOfCongress,
          bills: (candidate.member && byMember?.get(candidate.member.id)) || [],
        }));

        return <IssueSection key={issue} issue={issue} columns={columns} />;
      })}
    </div>
  );
}
