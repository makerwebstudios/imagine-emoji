/**
 * Imagine Emoji API (Cloudflare Worker, api/ in this repo). Holds the TMDB and Claude keys server-side;
 * the browser only ever sees finished Reels and the shared Top 10.
 */
const BASE = import.meta.env.VITE_API_URL || "https://imagine-emoji-api.maker-web-studios.workers.dev";

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.json();
}

export async function fetchReels(limit = 300) {
  return (await get(`/api/reels?limit=${limit}`)).reels;
}

export async function fetchScores() {
  return (await get("/api/scores")).scores;
}

export async function postScore(name, score, solved) {
  const res = await fetch(`${BASE}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, score, solved }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}
