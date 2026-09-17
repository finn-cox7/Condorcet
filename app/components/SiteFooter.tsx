import Link from "next/link";

import { BUILT_BY } from "@/lib/legal";

/**
 * Site footer with the route to the legal pages. Used on the landing page,
 * /how-it-works, and the legal pages themselves — deliberately not on the
 * issue picker (which has its own sticky footer) or the comparison view.
 *
 * `current` marks the page you are already on for screen readers.
 */
export function SiteFooter({
  current,
  className = "",
}: {
  current?: "terms" | "privacy";
  className?: string;
}) {
  return (
    <footer
      className={`flex flex-wrap items-center justify-between gap-4 border-t-2 border-black pt-6 font-sans text-[15px] ${className}`}
    >
      <span>
        Condorcet. Built by {BUILT_BY}. Not affiliated with any candidate or party.
      </span>
      <nav className="flex gap-6">
        <Link href="/how-it-works">How it works</Link>
        <Link href="/terms" aria-current={current === "terms" ? "page" : undefined}>
          Terms
        </Link>
        <Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>
          Privacy
        </Link>
      </nav>
    </footer>
  );
}
