/**
 * Imagine Emoji API — Cloudflare Worker + D1.
 *
 *   GET  /api/reels?limit=200   random approved Reels (emoji clue + title + accepted alternatives)
 *   GET  /api/scores            shared Top 10
 *   POST /api/scores            {name, score, solved}
 *   POST /api/admin/seed        (Bearer ADMIN_TOKEN) ?per=10 — up to N new Reels, resuming where the last run stopped
 *   cron (daily)                same as seed, a small batch, so the catalog keeps growing
 *
 * Secrets (never in code or the browser): TMDB_TOKEN, ANTHROPIC_API_KEY, ADMIN_TOKEN.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { checkClue, checkScore } from "./validate.ts";

interface Env {
  DB: D1Database;
  TMDB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGINS: string; // comma-separated
}

const MODEL = "claude-opus-5-5";

// ─── HTTP helpers ───
function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
    : {};
}
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });

// ─── TMDB ───
interface Movie { id: number; title: string; year: string; overview: string; genres: string[]; keywords: string[]; popularity: number }

async function tmdb(env: Env, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.TMDB_TOKEN}` } });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return res.json<any>();
}

async function candidates(env: Env, page: number, names: Record<number, string>): Promise<Omit<Movie, "keywords">[]> {
  const [list] = await Promise.all([
    // The most-VOTED films of all time = the ones players actually know (2026-10-18: "popular" meant
    // this month's releases — "Hope (2026)", "Matchbox the Movie" — unguessable for most players).
    tmdb(env, "/discover/movie", { language: "en-US", sort_by: "vote_count.desc", "vote_count.gte": "3000",
      include_adult: "false", page: String(page) }),
  ]);
  return list.results
    .filter((m: any) => !m.adult && m.title && m.overview)
    .map((m: any) => ({
      id: m.id, title: m.title, year: (m.release_date ?? "").slice(0, 4), overview: m.overview,
      genres: (m.genre_ids ?? []).map((id: number) => names[id]).filter(Boolean), popularity: m.popularity ?? 0,
    }));
}

// ─── Claude: one movie -> one Reel ───
const ReelSchema = z.object({
  emojis: z.string().describe("3 to 5 emojis, nothing else"),
  also: z.array(z.string()).describe("Other titles players commonly use for this exact movie; may be empty"),
  guessable: z.boolean().describe("false if no fair emoji clue exists for this movie"),
});

const SYSTEM = `You write clues for Imagine Emoji, a game where players guess a movie from emojis alone.
Given one movie, choose 3 to 5 emojis that point at THIS movie: its iconic characters, objects, places
or plot — not its genre in general. A fan should get it; a stranger should not get it from the genre
alone. Use only emojis: no letters, numbers, flags spelling words, or repeated emojis. Never use the
title's words as emoji puns unless that is the most famous way to show it. If the movie is too obscure
or generic for a fair clue, set guessable to false.`;

async function makeReel(env: Env, client: Anthropic, m: Movie, countCall: () => void) {
  const ask = `Title: ${m.title} (${m.year})\nGenres: ${m.genres.join(", ")}\nKeywords: ${m.keywords.slice(0, 15).join(", ")}\nPlot: ${m.overview}`;
  let feedback = "";
  // One retry when the clue breaks a rule (2026-10-18: Inception used 🔝, Django Unchained gave 6).
  for (let attempt = 1; attempt <= 2; attempt++) {
    countCall();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(ReelSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: ask + feedback }],
    });
    if (res.stop_reason === "refusal") return { status: "rejected", note: "refused" } as const;
    const out = res.parsed_output;
    if (!out) return { status: "rejected", note: `unparsed (${res.stop_reason})` } as const;
    if (!out.guessable) return { status: "rejected", note: "model: not guessable" } as const;
    const check = checkClue(out.emojis, m.title);
    if (check.ok) return { status: "ok", emojis: check.clean, also: out.also.slice(0, 5) } as const;
    if (attempt === 2) return { status: "rejected", note: check.why } as const;
    feedback = `\n\nYour previous clue "${out.emojis}" was rejected: ${check.why}. Give a new clue that follows every rule.`;
  }
  return { status: "rejected", note: "unreachable" } as const;
}

// Cloudflare caps outside calls per invocation (~50 on the free plan). Each movie costs up to 3
// (keywords + Claude, + one Claude retry); each page 1. Stop well before the cap, and remember the
// page so the next run starts where this one ended instead of re-reading from page 1 (2026-10-18:
// later rounds hit the cap; the daily cron would have failed every day).
const CALL_BUDGET = 44;

async function seed(env: Env, maxNew: number, retryRejected = false) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const report = { created: 0, rejected: 0, skipped: 0, errors: [] as string[], fromPage: 0, nextPage: 0 };
  let calls = 0;
  const startRow = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'next_page'`).first<{ value: string }>();
  let page = retryRejected ? 1 : Number(startRow?.value ?? 1);
  report.fromPage = page;
  const genres = await tmdb(env, "/genre/movie/list", { language: "en-US" }); calls++;
  const names: Record<number, string> = Object.fromEntries(genres.genres.map((g: any) => [g.id, g.name]));
  let made = 0;
  outer: while (made < maxNew && calls + 4 <= CALL_BUDGET && page <= 500) {
    const list = await candidates(env, page, names); calls++;
    if (!list.length) break;
    const ids = list.map((m) => m.id);
    // retryRejected: a movie rejected for breaking a clue rule (not "not guessable") gets another go.
    const seen = new Set(
      (await env.DB.prepare(`SELECT tmdb_id FROM reels WHERE tmdb_id IN (${ids.map(() => "?").join(",")})` +
        (retryRejected ? ` AND NOT (status = 'rejected' AND note NOT LIKE 'model:%' AND note != 'refused')` : ""))
        .bind(...ids).all<{ tmdb_id: number }>()).results.map((r) => r.tmdb_id),
    );
    for (const base of list) {
      if (seen.has(base.id)) { report.skipped++; continue; }
      if (made >= maxNew || calls + 3 > CALL_BUDGET) break outer;   // page unfinished: resume it next run
      made++;
      try {
        const kw = await tmdb(env, `/movie/${base.id}/keywords`); calls++;
        const m: Movie = { ...base, keywords: (kw.keywords ?? []).map((k: any) => k.name) };
        const r = await makeReel(env, client, m, () => calls++);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO reels (tmdb_id, title, year, emojis, also, genres, popularity, status, note) VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(m.id, m.title, m.year, r.status === "ok" ? r.emojis : null, JSON.stringify(r.status === "ok" ? r.also : []),
          JSON.stringify(m.genres), m.popularity, r.status, r.status === "ok" ? null : r.note).run();
        r.status === "ok" ? report.created++ : report.rejected++;
      } catch (e) {
        report.errors.push(`${base.title}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)); // not stored: retried next run
      }
    }
    page++;   // whole page handled
  }
  report.nextPage = page;
  if (!retryRejected) {
    await env.DB.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('next_page', ?)`).bind(String(page)).run();
  }
  return report;
}

async function ipHash(req: Request) {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ie-v1:${ip}`));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    try {
      if (url.pathname === "/api/reels" && req.method === "GET") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, title, year, emojis, also, genres FROM reels WHERE status = 'ok' ORDER BY random() LIMIT ?`,
        ).bind(limit).all<any>();
        const reels = results.map((r) => ({
          tmdbId: r.tmdb_id, title: r.title, year: r.year, emojis: r.emojis,
          answer: String(r.title).toLowerCase(), also: JSON.parse(r.also), genres: JSON.parse(r.genres), source: "tmdb",
        }));
        return json({ reels }, 200, { ...h, "Cache-Control": "public, max-age=300" });
      }

      if (url.pathname === "/api/scores" && req.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT name, score, solved, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT 10`,
        ).all();
        return json({ scores: results }, 200, h);
      }

      if (url.pathname === "/api/scores" && req.method === "POST") {
        const check = checkScore(await req.json().catch(() => null));
        if (!check.ok) return json({ error: check.why }, 422, h);
        const ip = await ipHash(req);
        const recent = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > datetime('now', '-1 minute')`,
        ).bind(ip).first<{ n: number }>();
        if ((recent?.n ?? 0) >= 3) return json({ error: "slow down" }, 429, h);
        await env.DB.prepare(`INSERT INTO scores (name, score, solved, ip_hash) VALUES (?,?,?,?)`)
          .bind(check.name, check.score, check.solved, ip).run();
        return json({ ok: true }, 201, h);
      }

      if (url.pathname === "/api/admin/seed" && req.method === "POST") {
        if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
        const per = Math.min(Number(url.searchParams.get("per")) || 10, 14);
        return json(await seed(env, per, url.searchParams.get("retry") === "1"));
      }

      if (url.pathname === "/api/health") {
        const n = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM reels GROUP BY status`).all();
        return json({ ok: true, reels: n.results, secrets: { tmdb: !!env.TMDB_TOKEN, anthropic: !!env.ANTHROPIC_API_KEY, admin: !!env.ADMIN_TOKEN } }, 200, h);
      }
      return json({ error: "not found" }, 404, h);
    } catch (e) {
      console.error(e);
      return json({ error: "server error" }, 500, h);
    }
  },

  // Daily: a few new popular movies, so the catalog keeps growing without anyone pressing a button.
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(seed(env, 14).then((r) => console.log("cron seed", JSON.stringify(r))));
  },
};
