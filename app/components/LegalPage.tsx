import Link from "next/link";

import { SiteFooter } from "@/app/components/SiteFooter";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

export type LegalSection = {
  /** Anchor id, e.g. "terms-1". */
  id: string;
  heading: string;
  /** The plain-language line, shown after a bold "In short:". */
  short: string;
  body: string;
};

/**
 * Shared shell for /terms and /privacy: header, title, contents sidebar,
 * numbered sections, footer.
 */
export function LegalPage({
  title,
  sections,
  current,
}: {
  title: string;
  sections: LegalSection[];
  current: "terms" | "privacy";
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col gap-12 px-4 py-12 md:px-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-sans text-[26px] font-extrabold tracking-[-0.5px]">
          Condorcet
        </Link>
        <nav className="flex gap-6 font-sans text-[15px] font-semibold">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/">Find your race</Link>
        </nav>
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="font-sans text-5xl font-extrabold tracking-[-2px] md:text-[64px]">
          {title}
        </h1>
        <p className="font-sans text-base">Last updated {LEGAL_LAST_UPDATED}</p>
      </div>

      <main className="grid flex-grow grid-cols-1 items-start gap-10 md:grid-cols-[260px_minmax(0,720px)] md:gap-20">
        <nav aria-label="On this page" className="border-l-2 border-black">
          <div className="pb-2 pl-3 font-sans text-[13px] font-semibold">On this page</div>
          <ol className="m-0 list-none p-0">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex min-h-11 items-center pl-3 font-sans text-[15px]"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="flex flex-col gap-7">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="flex scroll-mt-6 flex-col gap-[10px] border-t-2 border-black pt-7"
            >
              <h2 className="font-sans text-2xl font-extrabold">{section.heading}</h2>
              <p className="text-lg leading-[1.65]">
                <strong className="font-sans text-base">In short:</strong> {section.short}
              </p>
              <p className="text-lg leading-[1.65] text-[#333]">{section.body}</p>
            </section>
          ))}
        </article>
      </main>

      <SiteFooter current={current} />
    </div>
  );
}
