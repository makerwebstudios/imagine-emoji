// node scripts/check.mjs — every classic Reel renders all its emojis; answers accept/reject sensibly.
import puzzles from "../src/data/puzzles.js";
import { splitEmojis } from "../src/lib/emoji.js";
import { isCorrect } from "../src/lib/answers.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

for (const p of puzzles) ok(splitEmojis(p.emojis).join("") === p.emojis, `renders every emoji: ${p.answer}`);
ok(splitEmojis("🕷️🦸‍♂️🏙️").length === 3, "Spider-Man shows 3 emojis");
ok(splitEmojis("🏴‍☠️💀🗺️").length === 3, "pirate flag stays one emoji");

const P = (a) => puzzles.find((p) => p.answer === a);
const yes = [
  ["the lord of the rings", "lord of the rings"], ["LOTR", "lord of the rings"], ["spiderman", "spider-man"],
  ["spider man", "spider-man"], ["et", "e.t."], ["E.T.", "e.t."], ["fast & furious", "fast and furious"],
  ["the fast and the furious", "fast and furious"], ["the incredible hulk", "the hulk"], ["hulk", "the hulk"],
  ["Titanic", "titanic"], ["titanc", "titanic"], ["harry poter", "harry potter"], ["lion king", "the lion king"],
  ["Ratatouile", "ratatouille"], ["pirates of the carribean", "pirates of the caribbean"],
];
for (const [g, a] of yes) ok(isCorrect(g, P(a)), `accepts "${g}" for ${a}`);
const no = [["jaw", "jaws"], ["star trek", "star wars"], ["contacts lens", "contact"], ["", "titanic"], ["home", "home alone"], ["rocky 2", "rocky"]];
for (const [g, a] of no) ok(!isCorrect(g, P(a)), `rejects "${g}" for ${a}`);

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1); }
console.log(`all checks pass — ${puzzles.length} Reels render fully; ${yes.length} right answers accepted, ${no.length} wrong ones rejected`);
