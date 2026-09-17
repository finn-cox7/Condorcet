import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/app/components/LegalPage";
import { CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The terms for using Condorcet.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "terms-1",
    heading: "1. Using Condorcet",
    short:
      "Condorcet is free to use and has no accounts. Using it means you accept these terms.",
    body: "Anyone can use Condorcet. There is no sign-up, no account and no payment. If you do not agree with these terms, please do not use the site.",
  },
  {
    id: "terms-2",
    heading: "2. What the site is",
    short:
      "A nonpartisan reference of public voting records. It does not endorse anyone or tell you how to vote.",
    body: "Condorcet shows how the candidates in a race voted on bills in Congress, side by side, and nothing more. It does not score candidates, rank them, recommend one, or judge whether a vote matches your views. It is not affiliated with any candidate, campaign or party.",
  },
  {
    id: "terms-3",
    heading: "3. Accuracy of information",
    short:
      "The data comes from public government sources and can contain errors, gaps or delays. Every bill links to its official page — check there.",
    body: "Votes, bills and member records come from Congress.gov and Senate.gov; candidate registrations come from the Federal Election Commission. Coverage is limited to the 118th and 119th Congresses. Where a member voted more than once on the same bill, only their last recorded vote is shown, so a procedural vote may not appear. Bill titles are Congress.gov's own display titles and can still carry the original name of a bill that was later rewritten. We make no guarantee that the site is complete, current or free of errors, and the linked official page always governs.",
  },
  {
    id: "terms-4",
    heading: "4. Bill summaries",
    short:
      "Summaries are shortened from the official Congressional Research Service summary. They describe the bill, not our opinion of it.",
    body: "Each summary is a roughly thirty-word rewrite of the CRS summary for the version of the bill that was voted on, and states only what that summary states. Where CRS has not published a summary, the bill says so rather than showing anything in its place. Summaries are a convenience; the full bill text governs.",
  },
  {
    id: "terms-5",
    heading: "5. Links to other sites",
    short: "Campaign and government sites are not ours, and we are not responsible for them.",
    body: "Condorcet links to congress.gov for every bill, and to a candidate's own campaign site where there is no federal voting record to show. Those sites are operated by other people. We do not control, endorse or take responsibility for their content, and their own terms and privacy policies apply once you follow a link.",
  },
  {
    id: "terms-6",
    heading: "6. Acceptable use",
    short: "Do not attack the site or hammer it with automated traffic.",
    body: "Please do not attempt to disrupt, overload or gain unauthorised access to the site, and do not scrape it at a rate that degrades it for other people. The underlying data is public: Congress.gov, Senate.gov and the FEC all publish it directly, and collecting it from them is both kinder and more reliable than collecting it from here.",
  },
  {
    id: "terms-7",
    heading: "7. Liability",
    short: "The site is provided as is, and decisions you make from it are your own.",
    body: "Condorcet is provided “as is”, without warranties of any kind, express or implied. To the fullest extent the law allows, we are not liable for any loss or damage arising from use of the site or from reliance on anything shown here. Nothing on this site is legal advice or voting advice.",
  },
  {
    id: "terms-8",
    heading: "8. Changes and contact",
    short: "These terms can change. The date at the top of this page says when they last did.",
    body: `We may update these terms from time to time. The “last updated” date at the top of this page shows when the wording last changed, and continuing to use the site after a change means accepting the revised terms. Questions about any of this: ${CONTACT}.`,
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms and conditions" sections={SECTIONS} current="terms" />;
}
