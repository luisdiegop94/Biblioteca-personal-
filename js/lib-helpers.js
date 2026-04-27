// Shared helpers for all three concepts.
(function () {
  "use strict";

  const STATUS_LABELS = {
    "read": "Leído",
    "reading": "Leyendo",
    "to-read": "Por leer",
  };

  const normalize = (str) =>
    (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Stable hash for color/seed selection.
  const hash = (key) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  // Map an OpenLibrary coverId or external coverUrl to a usable image URL.
  const coverUrlFor = (book, size) => {
    const s = size || "M";
    if (book.coverUrl) return book.coverUrl;
    if (book.coverId) {
      return `https://covers.openlibrary.org/b/id/${book.coverId}-${s}.jpg`;
    }
    return null;
  };

  // Group categories into broader buckets so the shelf labels feel curated, not random.
  // Returns the "shelf" name for a book.
  // More specific patterns must come first; the first matching rule wins.
  const SHELF_RULES = [
    { name: "Manga y cómics", match: /manga|c[oó]mic/i },
    { name: "Ciencia ficción y fantasía", match: /ciencia ficci|fantas|dist[oó]p|m[ií]stica/i },
    { name: "Mitología y épica", match: /mitolog|[eé]pica|folclor|leyenda/i },
    { name: "Misterio y aventura", match: /misterio|aventura|policiac|thriller|terror/i },
    { name: "Memorias y biografías", match: /memoria|biograf|autobiograf/i },
    { name: "Novela y literatura", match: /novela|literatura|cuento|cl[aá]sic|antolog|j[uú]venil|poes[ií]a|cr[oó]nica|romance/i },
    { name: "Filosofía y pensamiento", match: /filosof|estoicismo|ensayo/i },
    { name: "Psicología", match: /psicolog|conductu/i },
    { name: "Espiritualidad", match: /espiritu|oriental|zen|religion/i },
    { name: "Historia", match: /historia|hist[oó]ric/i },
    { name: "Política y sociedad", match: /pol[ií]t|sociedad|sociolog|antrop|periodism/i },
    { name: "Economía y negocios", match: /econom|negocio|finan|marketing|negociaci|estrategia|organizacion|emprend|mercadeo/i },
    { name: "Tecnología", match: /tecnolog|electr[oó]nica|programaci|inform[aá]tica/i },
    { name: "Ciencia y naturaleza", match: /ciencia|biolog|neuro|f[ií]sica|qu[ií]mica|matem|naturaleza|divulgaci|et[oó]log|ling[uü]/i },
    { name: "Arte y diseño", match: /arte|dise[ñn]o|urbanism|m[uú]sica|cine|fotograf/i },
    { name: "Autoayuda", match: /autoayuda/i },
    { name: "Gastronomía", match: /gastronom|cocina|cookbook/i },
    { name: "Desarrollo y sostenibilidad", match: /desarrollo|sostenib|agricult|rural|alimentaci|medio ambiente/i },
  ];
  const shelfFor = (book) => {
    const cat = book.category || "";
    for (const r of SHELF_RULES) {
      if (r.match.test(cat)) return r.name;
    }
    if (!cat) return "Sin categorizar";
    return cat;
  };

  // Editorial spine palette — muted, library-aged, no neon.
  const SPINE_PALETTE = [
    { bg: "#3a2e25", ink: "#e8dcc4", accent: "#b08850" }, // dark walnut + gold
    { bg: "#7a2a25", ink: "#f3e6d2", accent: "#d4a06a" }, // oxblood
    { bg: "#1f3a4a", ink: "#e3dccb", accent: "#b89c6a" }, // navy
    { bg: "#3d4a2a", ink: "#ece4cf", accent: "#c2a55a" }, // forest
    { bg: "#5a3a1f", ink: "#efdebc", accent: "#d6a55a" }, // tobacco
    { bg: "#2a2a2e", ink: "#e8dcc4", accent: "#c79a4a" }, // charcoal
    { bg: "#4a2a3a", ink: "#ecd9c8", accent: "#c08a6a" }, // plum
    { bg: "#7a4520", ink: "#f4e3c4", accent: "#e6b870" }, // amber
    { bg: "#1c3a2e", ink: "#e2dcc6", accent: "#b89a55" }, // bottle green
    { bg: "#5a1f24", ink: "#eddacf", accent: "#d49778" }, // burgundy
    { bg: "#2e3a5a", ink: "#ddd4c0", accent: "#a89868" }, // ink blue
    { bg: "#6a4a2a", ink: "#f0dec0", accent: "#dab070" }, // caramel
    { bg: "#3a1f2a", ink: "#e6d2c9", accent: "#b88670" }, // wine
    { bg: "#4a3a2a", ink: "#ead8b8", accent: "#c79e5a" }, // sepia
  ];
  const spineColors = (book) => {
    const seed = hash((book.title || "") + (book.author || ""));
    return SPINE_PALETTE[seed % SPINE_PALETTE.length];
  };

  // Vary spine widths to break up monotony — tied stably to the title length & seed.
  const spineWidth = (book) => {
    const seed = hash(book.title || "");
    const t = book.title || "";
    // Longer titles → wider spine, but cap.
    const base = 28 + Math.min(24, Math.floor(t.length / 6) * 2);
    const jitter = (seed % 9) - 4;
    return Math.max(24, Math.min(58, base + jitter));
  };

  // Vary spine heights so the row feels like a real shelf.
  const spineHeight = (book) => {
    const seed = hash((book.author || "") + "h");
    const variants = [220, 234, 240, 248, 256, 262, 270, 282];
    return variants[seed % variants.length];
  };

  const matches = (book, query) => {
    if (!query) return true;
    const q = normalize(query);
    return normalize(book.title).includes(q) || normalize(book.author).includes(q);
  };

  // Parse author last name for sort/group.
  const authorLast = (a) => {
    const parts = (a || "").split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return "";
    // Naive: take last word as surname.
    return parts[parts.length - 1];
  };

  // Decide a "currently reading" book — fall back to a hand-picked one if none.
  const currentlyReading = (all) => {
    return all.filter((b) => b.status === "reading");
  };

  // Compute stats for sidebar.
  const computeStats = (all) => {
    const owned = all.filter((b) => b.owned !== false);
    const readBooks = all.filter((b) => b.status === "read");
    const reading = all.filter((b) => b.status === "reading");
    const toRead = all.filter((b) => b.status === "to-read");
    const ratings = all.filter((b) => b.rating).map((b) => b.rating);
    const avgRating = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    // Top shelves
    const shelfCounts = {};
    owned.forEach((b) => {
      const s = shelfFor(b);
      shelfCounts[s] = (shelfCounts[s] || 0) + 1;
    });
    const topShelves = Object.entries(shelfCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total: all.length,
      owned: owned.length,
      read: readBooks.length,
      reading: reading.length,
      toRead: toRead.length,
      avgRating,
      topShelves,
    };
  };

  // Group books for current organizeMode.
  const groupBooks = (books, mode) => {
    const groups = new Map();
    if (mode === "shelf") {
      books.forEach((b) => {
        const k = shelfFor(b);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(b);
      });
      // Sort groups by size desc.
      return Array.from(groups.entries())
        .sort((a, b) => b[1].length - a[1].length);
    }
    if (mode === "status") {
      const order = ["reading", "to-read", "read", "none"];
      const labels = {
        "reading": "Leyendo ahora",
        "to-read": "Por leer",
        "read": "Leídos",
        "none": "Sin marcar",
      };
      books.forEach((b) => {
        const k = b.status || "none";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(b);
      });
      return order
        .filter((k) => groups.has(k))
        .map((k) => [labels[k], groups.get(k)]);
    }
    if (mode === "rating") {
      const order = [5, 4, 3, 2, 1, 0];
      const labels = {
        5: "★★★★★ Cinco estrellas",
        4: "★★★★ Cuatro estrellas",
        3: "★★★ Tres estrellas",
        2: "★★ Dos estrellas",
        1: "★ Una estrella",
        0: "Sin calificar",
      };
      books.forEach((b) => {
        const r = b.rating || 0;
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(b);
      });
      return order
        .filter((k) => groups.has(k))
        .map((k) => [labels[k], groups.get(k)]);
    }
    if (mode === "author") {
      books.forEach((b) => {
        const k = authorLast(b.author).charAt(0).toUpperCase() || "?";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(b);
      });
      return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }
    // Fallback: one big group.
    return [["Todos", books]];
  };

  window.LibLib = {
    STATUS_LABELS,
    normalize,
    hash,
    coverUrlFor,
    shelfFor,
    spineColors,
    spineWidth,
    spineHeight,
    matches,
    authorLast,
    currentlyReading,
    computeStats,
    groupBooks,
  };
})();
