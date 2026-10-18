import { useState, useEffect, useRef, useCallback } from "react";
import puzzles from "./data/puzzles.js";
import { fetchReels, fetchScores, postScore } from "./services/api.js";
import { splitEmojis } from "./lib/emoji.js";
import { isCorrect, normalize } from "./lib/answers.js";

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
  const [catalogSize, setCatalogSize] = useState(classicReels.length);
  const [boardIsGlobal, setBoardIsGlobal] = useState(false);
  // How to play: opens by itself on a first visit, then from the "?" button.
  const [showHelp, setShowHelp] = useState(() => {
    try { return !localStorage.getItem("ie_seen_help"); } catch { return false; }
  });
  function closeHelp() {
    setShowHelp(false);
    try { localStorage.setItem("ie_seen_help", "1"); } catch { /* private mode */ }
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e) => { if (e.key === "Escape") closeHelp(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);
  const inputRef = useRef(null);
  const nameRef = useRef(null);
  const allReelsRef = useRef(classicReels);

  const current = queue[index];
  const indexRef = useRef(index);
  indexRef.current = index;

  // Fresh Reels from the server (Claude-written clues for well-known movies), mixed into the rest of
  // this round. Classics play instantly; the game never waits on the network.
  useEffect(() => {
    let cancelled = false;
    fetchReels()
      .then((reels) => {
        if (cancelled || !reels?.length) return;
        const have = new Set(classicReels.map((r) => normalize(r.answer)));
        const fresh = reels.filter((r) => !have.has(normalize(r.answer)));
        allReelsRef.current = [...classicReels, ...fresh];
        setCatalogSize(allReelsRef.current.length);
        setQueue((q) => {
          const i = indexRef.current;
          return [...q.slice(0, i + 1), ...shuffle([...q.slice(i + 1), ...fresh])];
        });
      })
      .catch((err) => console.warn("Fresh Reels unavailable, playing the classics:", err.message));
    fetchScores()
      .then((scores) => { if (!cancelled) { setLeaderboard(scores); setBoardIsGlobal(true); } })
      .catch(() => { /* keep this device's board */ });
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
    if (!spinning && !showNamePrompt && !showHelp && inputRef.current) {
      inputRef.current.focus();
    }
  }, [spinning, showNamePrompt, showHelp]);

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
    const local = saveToLeaderboard(name, score);
    postScore(name, score, puzzlesSolved)
      .then(fetchScores)
      .then((scores) => { setLeaderboard(scores); setBoardIsGlobal(true); })
      .catch(() => { setLeaderboard(local); setBoardIsGlobal(false); });
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
          <button type="button" className="help-btn" aria-label="How to play" onClick={() => setShowHelp(true)}>?</button>
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
          Top 10{boardIsGlobal ? " · everyone" : " · this device"}
          <span className="tmdb-tag">{catalogSize.toLocaleString()} movies</span>
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

      {showHelp && (
        <div className="help-overlay" onClick={closeHelp}>
          <div className="help-card" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="help-close" aria-label="Close" onClick={closeHelp}>×</button>
            <h2 id="help-title" className="help-title">How to play</h2>
            <p className="help-lead">Each Reel is a movie told in emojis. Type the title and press Enter.</p>
            <ul className="help-list">
              <li><span className="help-pts good">+100</span> Correct guess</li>
              <li><span className="help-pts streak">×1.5</span> 3 in a row</li>
              <li><span className="help-pts streak">×2</span> 5 in a row</li>
              <li><span className="help-pts bad">−10</span> Wrong guess (streak resets)</li>
              <li><span className="help-pts bad">−25</span> Reveal Reel (streak resets)</li>
            </ul>
            <p className="help-note">Small typos and "the" don't matter. <b>End Game</b> puts your score on the Top 10.</p>
            <p className="help-note"><span className="source-badge classic">Classic</span> hand-made · <span className="source-badge fresh">Fresh</span> from the movie database</p>
            <button type="button" className="btn btn-accent help-go" onClick={closeHelp}>Let's play</button>
          </div>
        </div>
      )}

      {/* Footer Blurb */}
      <footer className="game-footer">
        Guess the movie from emojis alone.
        <span className="tmdb-credit">
          Movie data from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </span>
      </footer>
    </div>
  );
}
