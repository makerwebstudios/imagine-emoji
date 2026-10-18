import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Every VITE_ variable is baked into the PUBLIC bundle on GitHub Pages. The TMDB token is a
  // personal key (see .env) — a production build must not carry it. Fresh Reels need a small
  // server-side proxy first; until then the live game runs on the classic Reels, as it always has.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (mode === "production" && env.VITE_TMDB_TOKEN && process.env.ALLOW_PUBLIC_TMDB !== "1") {
    throw new Error("Refusing to build: VITE_TMDB_TOKEN would be published in the public bundle. " +
      "Unset it, or set ALLOW_PUBLIC_TMDB=1 if you really mean to ship it.");
  }
  return { plugins: [react()], base: "/imagine-emoji/" };
});
