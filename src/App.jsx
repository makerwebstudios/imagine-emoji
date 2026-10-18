import { useState, useEffect, useRef, useCallback } from "react";
import puzzles from "./data/puzzles.js";
import { fetchMovieBatch, isTmdbAvailable } from "./services/tmdb.js";
import { generateReels } from "./engine/reelGenerator.js";
import { splitEmojis } from "./lib/emoji.js";
import { isCorrect } from "./lib/answers.js";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem("ie_leaderboard") || "[]");
  } catch {
    return [];
  }
}

function saveToLeaderboard(name, score) {
  const board = getLeaderboard();
  board.push({ name, score, date: Date.now() });
  board.sort((a, b) => b.score - a.score);
  const top10 = board.slice(0, 10);
  localStorage.setItem("ie_leaderboard", JSON.stringify(top10));
  return top10;
}

// Tag hardcoded puzzles as "classic"
const classicReels = puzzles.map((p) => ({ ...p, source: "classic" }));

export default function App() {
  const [queue, setQueue] = useState(() => shuffle(classicReels));
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [spinning, setSpinning] = useState(true);
  const [leaderboard, setLeaderboard] = useState(getLeaderboard);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [puzzlesSolved, setPuzzlesSolved] = useState(0);
  const [tmdbLoaded, setTmdbLoaded] = useState(false);
  const inputRef = useRef(null);
  const nameRef = useRef(null);
  const allReelsRef = useRef(classicReels);

  const current = queue[index];

  // Fetch TMDB Reels in background on mount
  useEffect(() => {
    let cancelled = false;

    async function loadTmdbReels() {
      if (!isTmdbAvailable()) return;
      try {
        const sources = ["popular", "trending", "now_playing"];
        const batches = await Promise.all(
          sources.map((src) => fetchMovieBatch(src, 1))
        );
        const allMovies = batches.flat();

        // Deduplicate by movie ID
        const seen = new Set();
        const unique = allMovies.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });

        const tmdbReels = generateReels(unique);

        if (!cancelled && tmdbReels.length > 0) {
          // Merge with classics, deduplicate by answer
          const classicAnswers = new Set(classicReels.map((r) => r.answer));
          const freshReels = tmdbReels.filter(
            (r) => !classicAnswers.has(r.answer)
          );
          const merged = [...classicReels, ...freshReels];
          allReelsRef.current = merged;
          setTmdbLoaded(true);
        }
      } catch (err) {
        console.warn("TMDB fetch failed, using classic Reels only:", err.message);
      }
    }

    loadTmdbReels();
    return () => { cancelled = true; };
  }, []);

  const triggerSpin = useCallback(() => {
    setSpinning(true);
    const timer = setTimeout(() => setSpinning(false), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const cleanup = triggerSpin();
    return cleanup;
  }, [index, triggerSpin]);

  useEffect(() => {
    if (!spinning && !showNamePrompt && inputRef.current) {
      inputRef.current.focus();
    }
  }, [spinning, showNamePrompt]);

  useEffect(() => {
    if (showNamePrompt && nameRef.current) {
      nameRef.current.focus();
    }
  }, [showNamePrompt]);

  function nextPuzzle() {
    setGuess("");
    setFeedback(null);
    if (index + 1 >= queue.length) {
      // Reshuffle from the full pool (classic + TMDB)
      setQueue(shuffle(allReelsRef.current));
      setIndex(0);
    } else {
      setIndex(index + 1);
    }
  }

  function getMultiplier() {
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!guess.trim() || feedback) return;

    if (isCorrect(guess, current)) {
      const mult = getMultiplier();
      const points = Math.round(100 * mult);
      setScore((s) => s + points);
      setStreak((s) => s + 1);
      setPuzzlesSolved((n) => n + 1);
      setFeedback("correct");
      setTimeout(nextPuzzle, 1200);
    } else {
      setScore((s) => Math.max(0, s - 10));
      setStreak(0);
      setFeedback("wrong");
      setTimeout(() => {
        setFeedback(null);
        if (inputRef.current) inputRef.current.focus();
      }, 800);
    }
  }

  function handleReveal() {
    if (feedback) return;
    setStreak(0);
    setScore((s) => Math.max(0, s - 25));
    setFeedback("revealed");
    setTimeout(nextPuzzle, 2500);
  }

  function handleEndGame() {
    if (score > 0) {
      setShowNamePrompt(true);
    } else {
      resetGame();
    }
  }

  function handleSaveName(e) {
    e.preventDefault();
    const name = playerName.trim() || "Anonymous";
    const updated = saveToLeaderboard(name, score);
    setLeaderboard(updated);
    setShowNamePrompt(false);
    setPlayerName("");
    resetGame();
  }

  function resetGame() {
    setScore(0);
    setStreak(0);
    setPuzzlesSolved(0);
    setQueue(shuffle(allReelsRef.current));
    setIndex(0);
    setGuess("");
    setFeedback(null);
  }

  const emojiChars = current ? splitEmojis(current.emojis) : [];

  const displayAnswer = current
    ? (current.title || current.answer.replace(/\b\w/g, (c) => c.toUpperCase()))
    : "";

  return (
    <div className="game-shell">
      {/* Header */}
      <header className="game-header">
        <div className="logo-area">
          <span className="logo">IMAGINE EMOJI</span>
          {current?.source === "tmdb" && (
            <span className="source-badge fresh">Fresh</span>
          )}
          {current?.source === "classic" && (
            <span className="source-badge classic">Classic</span>
          )}
        </div>
        <div className="score-area">
          {streak >= 3 && (
            <span className="streak-badge">x{getMultiplier()}</span>
          )}
          <span className="score-display">{score.toLocaleString()}</span>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="game-main">
        {showNamePrompt ? (
          <div className="name-prompt">
            <h2 className="prompt-title">Nice run!</h2>
            <p className="prompt-sub">
              {puzzlesSolved} solved &middot; {score.toLocaleString()} points
            </p>
            <form onSubmit={handleSaveName} className="name-form">
              <input
                ref={nameRef}
                type="text"
                className="name-input"
                placeholder="Enter your name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
              />
              <button type="submit" className="btn btn-accent">
                Save Score
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Emoji Display */}
            <div className={`emoji-stage ${spinning ? "spinning" : ""} ${feedback || ""}`}>
              {emojiChars.map((emoji, i) => (
                <span
                  key={`${index}-${i}`}
                  className="emoji-char"
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  {emoji}
                </span>
              ))}
            </div>

            {/* Feedback Text */}
            <div className="feedback-area">
              {feedback === "correct" && (
                <span className="feedback-text correct">
                  Correct! +{Math.round(100 * getMultiplier())}
                </span>
              )}
              {feedback === "wrong" && (
                <span className="feedback-text wrong">Not quite... -10</span>
              )}
              {feedback === "revealed" && (
                <span className="feedback-text revealed">{displayAnswer}</span>
              )}
              {!feedback && streak >= 3 && (
                <span className="feedback-text streak">
                  Streak x{getMultiplier()}!
                </span>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="guess-form">
              <input
                ref={inputRef}
                type="text"
                className={`guess-input ${feedback === "wrong" ? "shake" : ""}`}
                placeholder="Type your guess..."
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={feedback === "correct" || feedback === "revealed"}
                autoComplete="off"
                spellCheck={false}
              />
            </form>

            {/* Buttons */}
            <div className="action-buttons">
              <button
                className="btn btn-reveal"
                onClick={handleReveal}
                disabled={!!feedback}
              >
                Reveal Reel
              </button>
              <button
                className="btn btn-accent"
                onClick={handleSubmit}
                disabled={!guess.trim() || !!feedback}
              >
                Submit
              </button>
              {score > 0 && (
                <button className="btn btn-end" onClick={handleEndGame}>
                  End Game
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {/* Leaderboard */}
      <section className="leaderboard">
        <h3 className="lb-title">
          Top 10
          {tmdbLoaded && <span className="tmdb-tag">TMDB Connected</span>}
        </h3>
        {leaderboard.length === 0 ? (
          <p className="lb-empty">No scores yet. Be the first!</p>
        ) : (
          <ol className="lb-list">
            {leaderboard.map((entry, i) => (
              <li key={i} className="lb-row">
                <span className="lb-rank">{i + 1}.</span>
                <span className="lb-name">{entry.name}</span>
                <span className="lb-dots" />
                <span className="lb-score">
                  {entry.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Footer Blurb */}
      <footer className="game-footer">
        Guess the movie from emojis alone.
      </footer>
    </div>
  );
}
