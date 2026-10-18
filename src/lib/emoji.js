/**
 * Split an emoji string into what a person sees as separate emojis.
 *
 * The old pattern (/\p{Emoji_Presentation}(‍\p{Emoji_Presentation})*\/gu) dropped every
 * emoji that needs the invisible style character U+FE0F (❄️ 🏖️ 🕷️ 🏎️ 🗺️) and cut ZWJ sequences
 * short (🏴‍☠️ → 🏴, 👨‍✈️ → 👨). 11 of the 25 classic Reels rendered wrong — Spider-Man showed only 🦸.
 * Intl.Segmenter splits by grapheme cluster, which is exactly "one emoji on screen".
 */
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter("en", { granularity: "grapheme" })
  : null;

export function splitEmojis(text = "") {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment).filter((g) => g.trim());
  return Array.from(text).filter((g) => g.trim()); // very old browsers: code points
}
