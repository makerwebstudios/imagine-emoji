/** Pure checks shared by the Worker and its tests — no Cloudflare or network imports. */

const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** 3-5 emojis, nothing else: no letters, digits, punctuation or spaces. */
export function checkClue(emojis: string, title: string): { ok: true; clean: string } | { ok: false; why: string } {
  const clean = emojis.replace(/\s+/g, "");
  const parts = [...seg.segment(clean)].map((s) => s.segment);
  if (parts.length < 3 || parts.length > 5) return { ok: false, why: `${parts.length} emojis (need 3-5)` };
  for (const p of parts) {
    if (!PICTO.test(p)) return { ok: false, why: `not an emoji: "${p}"` };
    if (/[\p{L}\p{N}]/u.test(p.replace(/️|‍|[\u{E0020}-\u{E007F}]/gu, "")) && !/\p{Regional_Indicator}/u.test(p))
      return { ok: false, why: `letters or digits inside: "${p}"` };
  }
  // Emojis that ARE words: 🆕 🆒 🆗 🆓 🆙 🆘 🅰️ 🅱️ 🅾️ 🅿️ 🈁… and 🔙 🔚 🔛 🔜 🔝 (arrows labelled in English), ™ ® ©.
  const WORDY = /[\u{1F170}-\u{1F1E5}\u{1F200}-\u{1F251}\u{1F519}-\u{1F51D}\u2122\u00AE\u00A9]/u; // not 1F1E6-1F1FF: flag letters
  const wordy = parts.find((p) => WORDY.test(p));
  if (wordy) return { ok: false, why: `emoji that spells a word: "${wordy}"` };
  if (new Set(parts).size < parts.length - 1) return { ok: false, why: "repeats emojis" };
  void title;
  return { ok: true, clean };
}

/** Leaderboard entry from the browser: trust nothing. */
export function checkScore(body: unknown): { ok: true; name: string; score: number; solved: number } | { ok: false; why: string } {
  if (!body || typeof body !== "object") return { ok: false, why: "bad body" };
  const b = body as Record<string, unknown>;
  const name = String(b.name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20) || "Anonymous";
  const score = Number(b.score), solved = Number(b.solved);
  if (!Number.isInteger(score) || score < 1 || score > 100_000) return { ok: false, why: "score out of range" };
  if (!Number.isInteger(solved) || solved < 1 || solved > 1_000) return { ok: false, why: "solved out of range" };
  // Best case is 200 points per Reel (x2 streak); anything above that was not played.
  if (score > solved * 200) return { ok: false, why: "score higher than possible for that many Reels" };
  return { ok: true, name, score, solved };
}
