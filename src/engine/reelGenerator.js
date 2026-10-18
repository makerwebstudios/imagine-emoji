/**
 * Reel Generator Engine
 *
 * Converts TMDB movie data into emoji puzzles ("Reels").
 * Strategy: layer genre emojis + keyword emojis + overview-scanned emojis,
 * then pick the best 3-5 to form the Reel.
 */

// ─── Genre -> Emoji Map ───
const GENRE_EMOJIS = {
  Action: ["💥", "🔫", "🤜", "⚔️", "🏃"],
  Adventure: ["🗺️", "🧭", "🏔️", "🌍", "⛵"],
  Animation: ["🎨", "✏️", "🖍️"],
  Comedy: ["😂", "🤣", "🎭"],
  Crime: ["🔪", "🕵️", "💰", "🚔", "🔫"],
  Documentary: ["📹", "🎤", "📰"],
  Drama: ["🎭", "💔", "😢"],
  Family: ["👨‍👩‍👧‍👦", "🏠", "❤️"],
  Fantasy: ["🧙‍♂️", "🐉", "✨", "🏰", "🧚"],
  History: ["📜", "⚔️", "👑", "🏛️"],
  Horror: ["👻", "🔪", "💀", "🧟", "😱"],
  Music: ["🎵", "🎸", "🎤", "🎹", "🎶"],
  Mystery: ["🔍", "❓", "🕵️", "🔎"],
  Romance: ["❤️", "💋", "💕", "🌹", "💑"],
  "Science Fiction": ["🛸", "🤖", "🚀", "👽", "🔬"],
  "TV Movie": ["📺"],
  Thriller: ["😰", "🔪", "💀", "⏰", "🕳️"],
  War: ["⚔️", "💣", "🪖", "🎖️", "🏳️"],
  Western: ["🤠", "🐎", "🌵", "🔫", "🏜️"],
};

// ─── Keyword -> Emoji Map (broad coverage) ───
const KEYWORD_EMOJIS = {
  // Animals
  dinosaur: "🦖", shark: "🦈", lion: "🦁", dog: "🐕", cat: "🐱",
  rat: "🐀", mouse: "🐭", fish: "🐠", bird: "🐦", spider: "🕷️",
  snake: "🐍", bear: "🐻", wolf: "🐺", horse: "🐎", monkey: "🐒",
  ape: "🦍", gorilla: "🦍", whale: "🐋", dolphin: "🐬", bat: "🦇",
  elephant: "🐘", tiger: "🐅", dragon: "🐉", penguin: "🐧", rabbit: "🐰",
  deer: "🦌", bee: "🐝", ant: "🐜", butterfly: "🦋", octopus: "🐙",
  pig: "🐷", cow: "🐮", chicken: "🐔",

  // Places & Settings
  space: "🚀", ocean: "🌊", island: "🏝️", desert: "🏜️", jungle: "🌴",
  mountain: "🏔️", city: "🏙️", castle: "🏰", prison: "🔒", school: "🏫",
  hospital: "🏥", church: "⛪", farm: "🌾", forest: "🌲", beach: "🏖️",
  volcano: "🌋", cave: "🕳️", ship: "🚢", submarine: "🤿", airplane: "✈️",
  train: "🚂", car: "🚗", laboratory: "🔬", mars: "🔴", moon: "🌕",
  paris: "🇫🇷", japan: "🇯🇵", new_york: "🗽", london: "🇬🇧",
  egypt: "🏺", rome: "🏛️", china: "🇨🇳", india: "🇮🇳",
  korea: "🇰🇷", africa: "🌍", arctic: "🧊", hawaii: "🌺",
  las_vegas: "🎰", texas: "🤠", mexico: "🇲🇽",

  // People & Roles
  king: "👑", queen: "👸", princess: "👸", prince: "🤴",
  knight: "⚔️", warrior: "⚔️", soldier: "🪖", spy: "🕵️",
  detective: "🔍", police: "👮", thief: "🦹", pirate: "🏴‍☠️",
  wizard: "🧙‍♂️", witch: "🧙‍♀️", ghost: "👻", zombie: "🧟",
  vampire: "🧛", alien: "👽", robot: "🤖", superhero: "🦸",
  chef: "👨‍🍳", doctor: "👨‍⚕️", scientist: "👨‍🔬", astronaut: "👨‍🚀",
  teacher: "👨‍🏫", cowboy: "🤠", ninja: "🥷", samurai: "⚔️",
  clown: "🤡", baby: "👶", child: "👦", teenager: "🧑",
  boxer: "🥊", dancer: "💃", singer: "🎤", musician: "🎵",
  pilot: "👨‍✈️", farmer: "👩‍🌾", hunter: "🏹",

  // Objects & Concepts
  ring: "💍", sword: "⚔️", gun: "🔫", bomb: "💣", treasure: "💎",
  money: "💰", gold: "🥇", diamond: "💎", crown: "👑", mask: "🎭",
  book: "📖", letter: "✉️", map: "🗺️", key: "🔑", mirror: "🪞",
  clock: "⏰", phone: "📱", computer: "💻", camera: "📷",
  drug: "💊", poison: "☠️", magic: "✨", fire: "🔥", ice: "🧊",
  water: "💧", lightning: "⚡", storm: "⛈️", snow: "❄️", rain: "🌧️",
  sun: "☀️", star: "⭐", rainbow: "🌈", flower: "🌸",
  food: "🍕", wine: "🍷", beer: "🍺", cake: "🎂",
  christmas: "🎄", halloween: "🎃", wedding: "💒", funeral: "⚰️",
  birthday: "🎂", race: "🏁", fight: "🤜", war: "⚔️",
  love: "❤️", death: "💀", dream: "💭", nightmare: "😱",
  music: "🎵", dance: "💃", art: "🎨", sport: "⚽",
  car_chase: "🚗💨", explosion: "💥", kidnapping: "😱",
  time_travel: "⏰🔙", teleportation: "✨", invisibility: "👻",
  resurrection: "🔄", prophecy: "🔮", curse: "🧿",

  // Themes
  revenge: "😤", survival: "🏃", escape: "🏃💨", heist: "💰🔓",
  murder: "🔪", mystery: "❓", conspiracy: "🕵️", corruption: "💰",
  betrayal: "🗡️", sacrifice: "💔", redemption: "🙏", justice: "⚖️",
  friendship: "🤝", family: "👨‍👩‍👧‍👦", coming_of_age: "🧑➡️🧔",
  apocalypse: "🌍💥", pandemic: "🦠", invasion: "👽🛸",
  haunted_house: "🏚️👻", exorcism: "✝️😈", demon: "👿",

  // Entertainment / Meta
  boxing: "🥊", martial_arts: "🥋", racing: "🏎️", baseball: "⚾",
  basketball: "🏀", football: "🏈", soccer: "⚽", tennis: "🎾",
  surfing: "🏄", skiing: "⛷️", climbing: "🧗",
};

// ─── Overview word scanning (catches things keywords miss) ───
const OVERVIEW_PATTERNS = [
  [/\bdinosaur/i, "🦖"], [/\bt-rex|tyrannosaurus/i, "🦖"],
  [/\bshark/i, "🦈"], [/\bzombie/i, "🧟"], [/\bvampire/i, "🧛"],
  [/\bghost/i, "👻"], [/\balien/i, "👽"], [/\brobot/i, "🤖"],
  [/\bspaceship|starship/i, "🛸"], [/\brocket/i, "🚀"],
  [/\bpirate/i, "🏴‍☠️"], [/\btreasure/i, "💎"],
  [/\bking\b/i, "👑"], [/\bqueen\b/i, "👸"], [/\bprincess/i, "👸"],
  [/\bwizard|sorcerer/i, "🧙‍♂️"], [/\bwitch/i, "🧙‍♀️"],
  [/\bsword/i, "⚔️"], [/\bgun\b/i, "🔫"], [/\bbomb/i, "💣"],
  [/\blocean|sea\b/i, "🌊"], [/\bisland/i, "🏝️"],
  [/\bspace\b/i, "🚀"], [/\bmoon\b/i, "🌕"], [/\bmars\b/i, "🔴"],
  [/\bjungle|rainforest/i, "🌴"], [/\bdesert/i, "🏜️"],
  [/\bsnow|winter|frozen/i, "❄️"], [/\bfire|flame|burn/i, "🔥"],
  [/\btime travel/i, "⏰🔙"], [/\bmagic|magical/i, "✨"],
  [/\blove story|romance|romantic/i, "❤️"],
  [/\bmurder|kill/i, "🔪"], [/\bwar\b/i, "⚔️"],
  [/\bschool|college|university/i, "🏫"],
  [/\bhospital/i, "🏥"], [/\bprison|jail/i, "🔒"],
  [/\bchristmas/i, "🎄"], [/\bhalloween/i, "🎃"],
  [/\bwedding/i, "💒"], [/\bfuneral/i, "⚰️"],
  [/\bboxing|boxer/i, "🥊"], [/\brace|racing/i, "🏎️"],
  [/\bmusic|band|concert/i, "🎵"], [/\bdance|dancing/i, "💃"],
  [/\bcook|chef|kitchen/i, "👨‍🍳"], [/\bfarm/i, "🌾"],
  [/\bsurviv/i, "🏃"], [/\bescape/i, "🏃💨"],
  [/\bkpop|k-pop/i, "🇰🇷🎵"], [/\bdemon|devil/i, "👿"],
  [/\bhunt|hunter/i, "🏹"],
];

/**
 * Generate a Reel from enriched TMDB movie data.
 * Returns { emojis: string, answer: string } or null if too generic.
 */
export function generateReel(movie) {
  const candidates = new Map(); // emoji -> weight

  function add(emoji, weight = 1) {
    if (!emoji) return;
    // Handle multi-char emoji strings (like "🏃💨")
    const existing = candidates.get(emoji) || 0;
    candidates.set(emoji, existing + weight);
  }

  // 1. Genre emojis (weight 1 each, pick first from each genre)
  for (const genre of movie.genres) {
    const pool = GENRE_EMOJIS[genre];
    if (pool) add(pool[0], 1);
  }

  // 2. Keyword emojis (weight 3 -- these are the most specific)
  for (const kw of movie.keywords) {
    const normalized = kw.toLowerCase().replace(/[\s-]/g, "_");
    // Direct match
    if (KEYWORD_EMOJIS[normalized]) {
      add(KEYWORD_EMOJIS[normalized], 3);
      continue;
    }
    // Partial match (keyword contains a mapped term)
    for (const [term, emoji] of Object.entries(KEYWORD_EMOJIS)) {
      if (normalized.includes(term) || term.includes(normalized)) {
        add(emoji, 2);
        break;
      }
    }
  }

  // 3. Overview scanning (weight 2)
  for (const [pattern, emoji] of OVERVIEW_PATTERNS) {
    if (pattern.test(movie.overview)) {
      add(emoji, 2);
    }
  }

  // 4. Title scanning (weight 2 -- sometimes title itself has clues)
  for (const [pattern, emoji] of OVERVIEW_PATTERNS) {
    if (pattern.test(movie.title)) {
      add(emoji, 2);
    }
  }

  // Sort by weight descending, pick top 3-5
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji);

  if (sorted.length < 2) return null; // Not enough signal, skip this movie

  const count = Math.min(sorted.length, Math.random() > 0.5 ? 4 : 3);
  const picked = sorted.slice(0, count);

  return {
    emojis: picked.join(""),
    answer: movie.title.toLowerCase(),
    title: movie.title,
    source: "tmdb",
    tmdbId: movie.id,
    genres: movie.genres,
  };
}

/**
 * Generate Reels from a batch of enriched movies.
 * Filters out movies that produce too few emojis.
 */
export function generateReels(movies) {
  return movies
    .map(generateReel)
    .filter(Boolean);
}
