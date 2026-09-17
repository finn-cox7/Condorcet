import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/app/components/LegalPage";
import { CONTACT, DATABASE_PROVIDER, HOSTING_PROVIDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Condorcet collects, which is nothing about you.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "privacy-1",
    heading: "1. What we collect",
    short: "Nothing about you. There are no accounts, no sign-up and no tracking.",
    body: "Condorcet has no accounts, so it never asks for or stores your name, email address, password or any other personal detail. It does not build a profile of you, and it does not sell or share data about you, because it holds none.",
  },
  {
    id: "privacy-2",
    heading: "2. Your searches and picks",
    short:
      "Your race and issues live in the page's own address. Nothing about them is written to our database.",
    body: "Searching for a race and picking issues both happen in your browser. The issues you pick are placed in the page address — for example /race/ohio-senate-2026?issues=health,energy — so that the page can be bookmarked and shared. Our database is read-only in normal use: the site reads voting records from it and never writes anything about your visit to it.",
  },
  {
    id: "privacy-3",
    heading: "3. Analytics and hosting",
    short:
      "There is no analytics product on this site at all. The host keeps ordinary server logs, which include the address of the page you requested.",
    body: `Condorcet runs no analytics, no tag manager and no tracking pixels — there is no such code on the site. Like any website, the server that delivers it keeps standard request logs, which typically record an IP address, a timestamp and the address requested. Because the issues you pick form part of that address, they appear in those logs. Those logs are held by ${HOSTING_PROVIDER} under its own policy, are not combined with anything else, and are not used to identify you.`,
  },
  {
    id: "privacy-4",
    heading: "4. Cookies",
    short: "None. This site sets no cookies.",
    body: "Condorcet sets no cookies and uses no local or session storage in your browser. There is no cookie banner because there is nothing to consent to. If this ever changes, this section and the date at the top of the page will change with it.",
  },
  {
    id: "privacy-5",
    heading: "5. Third parties",
    short:
      "Fonts are served from this site, not from Google. Nothing loads from a third party unless you click a link.",
    body: `The page's fonts are bundled and served from this site, so your browser makes no request to Google Fonts, a CDN or any other third party while a page loads. The only companies involved in running the site are ${HOSTING_PROVIDER}, which hosts it, and ${DATABASE_PROVIDER}, which hosts the database of public voting records. Links to congress.gov and to campaign sites send a request only when you choose to follow them, and those sites then see your visit under their own policies.`,
  },
  {
    id: "privacy-6",
    heading: "6. How long we keep it",
    short: "We keep nothing about you, so there is nothing to delete.",
    body: `Because the site stores no information about visitors, there is no personal data for us to retain, export or erase. The standard request logs described above are held by ${HOSTING_PROVIDER} for a limited period under its own retention policy.`,
  },
  {
    id: "privacy-7",
    heading: "7. Your choices",
    short: "There is no account to close and no data to request — but you can still ask.",
    body: "There is no profile to access, correct or delete, because none is created. If you would rather the issues you picked did not travel with a link, share the plain race address instead of the one with issues in it. If you have a question about anything here, please get in touch.",
  },
  {
    id: "privacy-8",
    heading: "8. Changes and contact",
    short: "This policy can change. The date at the top of this page says when it last did.",
    body: `We may update this policy from time to time. The “last updated” date at the top of this page shows when the wording last changed. Questions about any of this: ${CONTACT}.`,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" sections={SECTIONS} current="privacy" />;
}
