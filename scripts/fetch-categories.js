#!/usr/bin/env node
// For books without a `category`, look up the book on Goodreads (primary)
// and Open Library (fallback). Map English genres / subjects to a Spanish
// category aligned with the SHELF_RULES in js/lib-helpers.js.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripDiacritics(String(s || "")).toLowerCase();
const cleanForQuery = (s) =>
    norm(s).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

function authorMatches(libAuthor, grAuthor) {
    if (/varios autores|anonimo|anónimo/i.test(libAuthor)) return true;
    if (!grAuthor) return false;
    const libWords = norm(libAuthor).split(/[^\w]+/).filter((w) => w.length >= 4);
    const grWords = norm(grAuthor).split(/[^\w]+/).filter((w) => w.length >= 3);
    return libWords.some((lw) =>
        grWords.some((gw) => {
            if (lw === gw) return true;
            const p = Math.min(5, lw.length, gw.length);
            return lw.length >= 5 && gw.length >= 5 && lw.slice(0, p) === gw.slice(0, p);
        })
    );
}

const TITLE_STOPWORDS = new Set([
    "the", "a", "an", "of", "and", "or", "to", "for", "on", "in", "at", "by",
    "with", "is", "el", "la", "los", "las", "de", "del", "y", "o", "u", "un",
    "una", "unos", "unas", "que", "como", "es", "para", "con",
]);
const cleanTitle = (s) =>
    norm(s).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
function titleScore(libTitle, grTitle) {
    const a = cleanTitle(libTitle);
    const b = cleanTitle(grTitle);
    if (!a) return 0;
    if (a === b) return 1;
    // Strong signal: result title starts with the full query title (just
    // means Goodreads added a series suffix or author tag).
    if (b.startsWith(a + " ") || b === a) return 1;
    // Query appears as a contiguous substring — score by length ratio.
    if ((" " + b + " ").includes(" " + a + " ")) return a.length / b.length;
    // Fallback: Jaccard on significant words.
    const w1 = new Set(a.split(" ").filter((w) => w && !TITLE_STOPWORDS.has(w)));
    const w2 = new Set(b.split(" ").filter((w) => w && !TITLE_STOPWORDS.has(w)));
    if (!w1.size) return 0;
    let inter = 0;
    for (const w of w1) if (w2.has(w)) inter++;
    const union = w1.size + w2.size - inter;
    return union ? inter / union : 0;
}

// Goodreads English genre → Spanish category. Order matters: a book may
// have Fiction + Fantasy + Classics; we want Fantasy to win over Fiction.
const GOODREADS_GENRE_MAP = [
    [/^manga$|^manhwa$|^manhua$/i, "Manga"],
    [/^graphic novels?$|^comics?$/i, "Cómic"],
    [/^science fiction(?: fantasy)?$|^sci-?fi$|^space opera$|^cyberpunk$|^dystopi/i, "Ciencia ficción"],
    [/^fantasy$|^urban fantasy$|^high fantasy$|^magical realism$/i, "Fantasía"],
    [/^mythology$|^folklore$|^fairy tales?$/i, "Mitología"],
    [/^horror$|^gothic$|^paranormal$|^supernatural$/i, "Terror"],
    [/^mystery$|^thriller$|^crime$|^detective$|^noir$|^suspense$/i, "Misterio"],
    [/^romance$/i, "Romance"],
    [/^poetry$/i, "Poesía"],
    [/^short stor/i, "Cuentos"],
    [/^young adult$|^middle grade$|^children/i, "Novela juvenil"],
    [/^classics?$/i, "Novela clásica"],
    [/^historical fiction$/i, "Novela histórica"],
    [/^literary fiction$|^literature$/i, "Novela"],
    [/^autobiograph/i, "Autobiografía"],
    [/^memoir$/i, "Memorias"],
    [/^biograph/i, "Biografía"],
    [/^philosoph/i, "Filosofía"],
    [/^psycholog/i, "Psicología"],
    [/^self help$|^personal development$|^productivity$/i, "Autoayuda"],
    [/^business$|^management$|^leadership$|^entrepreneurship$|^marketing$|^finance$/i, "Negocios"],
    [/^economic/i, "Economía"],
    [/^politic/i, "Política"],
    [/^sociolog/i, "Sociología"],
    [/^anthropolog/i, "Antropología"],
    [/^journalism$/i, "Crónica"],
    [/^history$|^historical$|^world history$|^military history$/i, "Historia"],
    [/^biolog|^evolution$|^ecology$|^nature$|^natural history$|^animals?$/i, "Biología"],
    [/^neuroscien|^brain$/i, "Neurociencia"],
    [/^physics$|^astronomy$|^cosmolog/i, "Física"],
    [/^math/i, "Matemáticas"],
    [/^science$|^popular science$/i, "Divulgación científica"],
    [/^linguistic|^language$|^writing$/i, "Lingüística"],
    [/^art$|^design$|^architecture$/i, "Arte"],
    [/^music/i, "Música"],
    [/^film$|^cinema$|^movies$/i, "Cine"],
    [/^technolog|^computer|^programming$|^artificial intelligence$/i, "Tecnología"],
    [/^religion$|^christian|^buddhism$|^islam$|^hinduism$|^theology$/i, "Espiritualidad"],
    [/^spiritualit|^new age$|^zen$/i, "Espiritualidad"],
    [/^cookbook|^food$|^cooking$/i, "Gastronomía"],
    [/^travel$/i, "Viajes"],
    [/^adventure$/i, "Aventura"],
    [/^essay/i, "Ensayo"],
    [/^environment|^climate change$|^sustainab|^agriculture$/i, "Desarrollo y sostenibilidad"],
    [/^non.?fiction$/i, null],   // keep looking — too generic
    [/^fiction$/i, null],         // keep looking
    [/^audiobook$/i, null],
    [/^ebooks?$/i, null],
];

function categoryFromGoodreadsGenres(genres) {
    if (!genres || !genres.length) return null;
    // Walk genres in order; pick the first that maps to something specific.
    for (const g of genres) {
        for (const [rx, cat] of GOODREADS_GENRE_MAP) {
            if (rx.test(g)) {
                if (cat) return cat;
                break; // matched a "skip" rule, try next genre
            }
        }
    }
    // Nothing specific matched: fall back to mapping any rule (drops the
    // null skips), prioritising the first genre.
    for (const g of genres) {
        for (const [rx, cat] of GOODREADS_GENRE_MAP) {
            if (cat && rx.test(g)) return cat;
        }
    }
    // No mapping at all — use the first genre verbatim (in English) so at
    // least it gets a shelf, though it likely won't match SHELF_RULES.
    return genres[0];
}

// --- Open Library fallback (subject keyword matching) -----------------
const OL_SUBJECT_RULES = [
    [/manga|graphic novels?/i, "Manga"],
    [/science fiction|dystopi|cyberpunk/i, "Ciencia ficción"],
    [/fantasy|magic|wizards/i, "Fantasía"],
    [/mythology|folklore|legends/i, "Mitología"],
    [/horror|gothic/i, "Terror"],
    [/mystery|detective|crime|thriller|noir/i, "Misterio"],
    [/romance/i, "Romance"],
    [/poetry|poems/i, "Poesía"],
    [/short stor|tales|cuentos/i, "Cuentos"],
    [/young adult|juvenil|children/i, "Novela juvenil"],
    [/classic literat|world literat/i, "Novela clásica"],
    [/historical fict/i, "Novela histórica"],
    [/autobiograph/i, "Autobiografía"],
    [/memoir/i, "Memorias"],
    [/biograph/i, "Biografía"],
    [/philosoph|stoic|existential|metaphysic/i, "Filosofía"],
    [/psycholog|cognitive|behavioral/i, "Psicología"],
    [/self.?help|personal growth|productivity|habits/i, "Autoayuda"],
    [/economi/i, "Economía"],
    [/business|finance|management|leadership|marketing/i, "Negocios"],
    [/politic|government|democracy/i, "Política"],
    [/sociolog/i, "Sociología"],
    [/anthropolog/i, "Antropología"],
    [/journalism|reportage/i, "Crónica"],
    [/history|historical|war|revolution|empire|civilization|ancient|medieval/i, "Historia"],
    [/neuroscien|brain|consciousness/i, "Neurociencia"],
    [/biology|evolution|ecology|natural history|zoology|botany/i, "Biología"],
    [/physics|cosmolog|astronom|relativit|quantum/i, "Física"],
    [/mathematic|geometr|algebra|calculus/i, "Matemáticas"],
    [/popular science|science(?:,|$)/i, "Divulgación científica"],
    [/linguistic|languages?(?:,|$)|grammar/i, "Lingüística"],
    [/art history|painting|sculpture|architecture|design|drawing/i, "Arte"],
    [/music/i, "Música"],
    [/film|cinema/i, "Cine"],
    [/technolog|computers|programming|software|engineering/i, "Tecnología"],
    [/religion|christian|buddhism|islam|hinduism|theology|zen/i, "Espiritualidad"],
    [/spiritualit/i, "Espiritualidad"],
    [/cooking|cookery|food|gastronom/i, "Gastronomía"],
    [/travel|voyages/i, "Viajes"],
    [/adventur/i, "Aventura"],
    [/essay/i, "Ensayo"],
    [/agriculture|rural|sustainab/i, "Desarrollo rural"],
    [/literature|fiction|novel/i, "Novela"],
];

function categoryFromOLSubjects(subjects) {
    if (!subjects || !subjects.length) return null;
    const blob = subjects.map(norm).join(" | ");
    for (const [rx, cat] of OL_SUBJECT_RULES) {
        if (rx.test(blob)) return cat;
    }
    return null;
}

// --- Goodreads fetchers -------------------------------------------------

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchText(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
    if (!r.ok) return null;
    return r.text();
}

async function searchGoodreads(query) {
    const url = `https://www.goodreads.com/search?q=${encodeURIComponent(query)}&search_type=books`;
    const html = await fetchText(url);
    if (!html) return [];
    const results = [];
    const blocks = html.split(/<div id="\d+" class="u-anchorTarget">/);
    for (const block of blocks.slice(1)) {
        const link = block.match(/<a class="bookTitle"[^>]*href="(\/book\/show\/[^"?]+)/);
        const title = block.match(/<span itemprop='name' role='heading'[^>]*>([^<]+)<\/span>/);
        const auth = block.match(/<a class="authorName"[^>]*>\s*<span itemprop="name">([^<]+)<\/span>/);
        if (!link || !title) continue;
        results.push({
            url: "https://www.goodreads.com" + link[1],
            title: title[1].trim(),
            author: auth ? auth[1].trim() : "",
        });
    }
    return results;
}

async function fetchGoodreadsGenres(bookUrl) {
    const html = await fetchText(bookUrl);
    if (!html) return [];
    // Extract genres from the embedded JSON.
    const re = /"genre":\{"__typename":"Genre","name":"([^"]+)"/g;
    const seen = new Set();
    const out = [];
    for (const m of html.matchAll(re)) {
        const name = m[1];
        if (!seen.has(name)) { seen.add(name); out.push(name); }
    }
    return out;
}

// --- Open Library fallback ---------------------------------------------

async function searchOpenLibrary(book) {
    const params = new URLSearchParams({
        title: book.title,
        author: book.author,
        limit: "3",
        fields: "title,author_name,subject",
    });
    const url = `https://openlibrary.org/search.json?${params}`;
    const r = await fetch(url, { headers: { "User-Agent": "biblioteca-personal/1.0" } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.docs || !data.docs.length) return null;
    const wantAuth = norm(book.author).split(/\s+/).filter((w) => w.length >= 4);
    const picked = data.docs.find((d) => {
        const got = norm((d.author_name || []).join(" "));
        return wantAuth.some((w) => got.includes(w));
    }) || data.docs[0];
    return picked.subject || [];
}

// --- IO -----------------------------------------------------------------

function loadBooks() {
    const src = fs.readFileSync(BOOKS_FILE, "utf8");
    const ctx = { module: { exports: {} } };
    vm.createContext(ctx);
    vm.runInContext(src + "\nmodule.exports = books;", ctx);
    return ctx.module.exports;
}

function serialize(books) {
    const lines = books.map((b) => {
        const parts = [
            `title: ${JSON.stringify(b.title)}`,
            `author: ${JSON.stringify(b.author)}`,
            `category: ${JSON.stringify(b.category || "")}`,
        ];
        if (b.coverId) parts.push(`coverId: ${b.coverId}`);
        if (b.coverUrl) parts.push(`coverUrl: ${JSON.stringify(b.coverUrl)}`);
        if (b.status) parts.push(`status: ${JSON.stringify(b.status)}`);
        if (typeof b.rating === "number" && b.rating > 0) parts.push(`rating: ${b.rating}`);
        if (b.description) parts.push(`description: ${JSON.stringify(b.description)}`);
        if (b.descriptionAi) parts.push(`descriptionAi: true`);
        if (b.owned === false) parts.push(`owned: false`);
        return `    { ${parts.join(", ")} }`;
    });
    return `const books = [\n${lines.join(",\n")}\n];\n`;
}

// --- Main ---------------------------------------------------------------

(async () => {
    const books = loadBooks();
    const targets = books.filter((b) => !b.category);
    console.log(`Buscando categorías para ${targets.length} libros...\n`);

    let assignedGR = 0;
    let assignedOL = 0;
    let failed = [];
    let i = 0;

    for (const book of targets) {
        i++;
        let cat = null;
        let source = "";
        try {
            const titleQ = cleanForQuery(book.title);
            const authorQ = cleanForQuery(book.author).split(/\s+/).slice(0, 3).join(" ");
            // Run two searches: title+author, then title-only. Combine
            // results so we have a richer pool of candidates to score.
            const r1 = await searchGoodreads(`${titleQ} ${authorQ}`);
            await sleep(500);
            let pool = r1;
            if (!r1.length || !r1.some((r) => authorMatches(book.author, r.author))) {
                const r2 = await searchGoodreads(titleQ);
                await sleep(500);
                pool = pool.concat(r2);
            }
            const scored = pool
                .filter((r) => authorMatches(book.author, r.author))
                .map((r) => ({ r, s: titleScore(book.title, r.title) }))
                .sort((a, b) => b.s - a.s);
            const target = (scored[0] && scored[0].s >= 0.65 && scored[0].r) ||
                (/varios autores|anonimo|anónimo/i.test(book.author) && pool[0]) ||
                null;
            if (target) {
                const genres = await fetchGoodreadsGenres(target.url);
                await sleep(500);
                cat = categoryFromGoodreadsGenres(genres);
                if (cat) source = "GR";
            }
        } catch (e) {
            // fall through to Open Library
        }

        if (!cat) {
            try {
                const subjects = await searchOpenLibrary(book);
                await sleep(350);
                cat = categoryFromOLSubjects(subjects);
                if (cat) source = "OL";
            } catch (e) {
                // give up
            }
        }

        if (cat) {
            book.category = cat;
            if (source === "GR") assignedGR++; else assignedOL++;
            console.log(`[${i}/${targets.length}] ✓ (${source}) "${book.title.slice(0, 55)}" → ${cat}`);
        } else {
            failed.push(book.title);
            console.log(`[${i}/${targets.length}] ✗ "${book.title.slice(0, 55)}"`);
        }

        // Persist progress every 25 books so a crash doesn't lose work.
        if (i % 25 === 0) {
            fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
        }
    }

    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\n=== Resumen ===`);
    console.log(`Asignadas: ${assignedGR + assignedOL}/${targets.length}`);
    console.log(`  · Goodreads: ${assignedGR}`);
    console.log(`  · Open Library: ${assignedOL}`);
    console.log(`Sin asignar: ${failed.length}`);
    if (failed.length && failed.length <= 60) {
        console.log(`\nLibros sin categoría:`);
        failed.forEach((t) => console.log(`  - ${t}`));
    }
})();
