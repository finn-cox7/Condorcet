/**
 * Shared class strings for the one accent rule: yellow marks what the user
 * acted on — a selected issue, a hovered link, a primary action — and nothing
 * else. It is never decoration and never sits behind headline type.
 *
 * Each caller adds its own height, padding and text size.
 */
export const PRIMARY_ACTION =
  "flex items-center border-2 border-black bg-accent font-sans font-semibold text-black " +
  "hover:bg-black hover:text-white " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent disabled:hover:text-black";

/**
 * The one place headline type is highlighted: the candidate names on the
 * comparison page. Everywhere else headlines are solid black.
 */
export const HEADLINE_HIGHLIGHT =
  "bg-[linear-gradient(transparent_55%,#ffd60a_55%)] px-1";
