import type { VotePosition } from "@/app/generated/prisma/enums";

import { billLabel, billUrl, siteHost } from "@/lib/format";

export type BillRecord = {
  id: string;
  congress: number;
  billType: string;
  billNumber: number;
  title: string;
  plainSummary: string | null;
  position: VotePosition;
};

/**
 * Exactly one of the four states every column must resolve to (CLAUDE.md).
 * "voting" covers both a current record and a 118th-only one; hasCurrentVotes
 * distinguishes them.
 */
export type CandidateColumn = {
  key: string;
  name: string;
  party: string;
  websiteUrl: string | null;
  hasMember: boolean;
  hasCurrentVotes: boolean;
  formerMemberOfCongress: boolean;
  /** Bills for the issue being rendered, most recent first. */
  bills: BillRecord[];
};

const NO_BILLS =
  "No bills on this issue received a recorded vote in the 118th or 119th Congress.";

/** Exported so /how-it-works can show the real chips, not a copy of them. */
export function VoteChip({ position }: { position: VotePosition }) {
  const base = "shrink-0 whitespace-nowrap font-sans text-[13px] font-semibold";
  switch (position) {
    case "YEA":
      return <span className={`${base} bg-black px-[10px] py-1 text-white`}>Voted yea</span>;
    case "NAY":
      return <span className={`${base} border-2 border-black px-2 py-[2px]`}>Voted nay</span>;
    case "PRESENT":
      // Not in DESIGN.md: dashed black, to sit between nay and not-voting.
      return (
        <span className={`${base} border-2 border-dashed border-black px-2 py-[2px]`}>
          Voted present
        </span>
      );
    default:
      return (
        <span className={`${base} border-2 border-dashed border-[#555] px-2 py-[2px]`}>
          Not voting
        </span>
      );
  }
}

function BillRow({ bill }: { bill: BillRecord }) {
  const href = billUrl(bill.congress, bill.billType, bill.billNumber);
  const label = `${billLabel(bill.billType, bill.billNumber)} — ${bill.title}`;

  return (
    <article className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[17px] font-semibold"
          >
            {label}
          </a>
        ) : (
          <span className="text-[17px] font-semibold">{label}</span>
        )}
        <VoteChip position={bill.position} />
      </div>
      {/* Never fall back to the raw CRS text — see CLAUDE.md. */}
      <p className="text-base leading-[1.55]">
        {bill.plainSummary ?? "Summary not yet available."}
      </p>
    </article>
  );
}

function NoticeBox({
  title,
  body,
  websiteUrl,
}: {
  title: string;
  body: string;
  websiteUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 border-2 border-black p-6">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-base leading-[1.55]">{body}</p>
      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="font-sans text-[15px] font-semibold"
        >
          Read their platform on {siteHost(websiteUrl)}
        </a>
      )}
    </div>
  );
}

function Column({ column }: { column: CandidateColumn }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="font-sans text-lg font-semibold">
        {column.name} ({column.party})
      </div>

      {!column.hasMember ? (
        column.formerMemberOfCongress ? (
          <NoticeBox
            title="No votes in the current Congress"
            body={`${column.name} served in Congress before the 118th, which is as far back as this data goes.`}
            websiteUrl={column.websiteUrl}
          />
        ) : (
          <NoticeBox
            title="No federal voting record"
            body={`${column.name} hasn't served in Congress, so there are no roll-call votes to show.`}
            websiteUrl={column.websiteUrl}
          />
        )
      ) : (
        <>
          {!column.hasCurrentVotes && (
            <p className="font-sans text-[15px] font-semibold">
              No votes in the current Congress.
            </p>
          )}
          {column.bills.length === 0 ? (
            <p className="text-base leading-[1.55]">{NO_BILLS}</p>
          ) : (
            column.bills.map((bill) => <BillRow key={bill.id} bill={bill} />)
          )}
        </>
      )}
    </div>
  );
}

export function IssueSection({
  issue,
  columns,
}: {
  issue: string;
  columns: CandidateColumn[];
}) {
  const anyBills = columns.some((column) => column.bills.length > 0);
  const anyMember = columns.some((column) => column.hasMember);

  return (
    <section className="flex flex-col gap-[18px]">
      <h2 className="border-b-[3px] border-black pb-2 font-sans text-[28px] font-extrabold">
        {issue}
      </h2>
      {!anyBills && anyMember ? (
        <p className="text-base leading-[1.55]">{NO_BILLS}</p>
      ) : (
        <div
          className={`grid grid-cols-1 gap-12 ${
            columns.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          {columns.map((column) => (
            <Column key={column.key} column={column} />
          ))}
        </div>
      )}
    </section>
  );
}
