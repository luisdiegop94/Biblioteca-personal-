#!/usr/bin/env node
// Pull "read" and "currently-reading" books from the user's public
// Goodreads RSS feeds, match them against books.js by title+author, and
// add `status` ("read" / "reading") and `rating` (0-5) fields.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");
const USER_ID = 106892623;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripDiacritics(String(s || "")).toLowerCase();

function decodeCdata(text) {
    return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractField(itemXml, name) {
    const re = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`);
    const m = itemXml.match(re);
    return m ? decodeCdata(m[1].trim()) : "";
}

function parseItems(xml) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml))) {
        const block = m[1];
        const imageUrl =
            extractField(block, "book_large_image_url") ||
            extractField(block, "book_medium_image_url") ||
            extractField(block, "book_image_url") ||
            "";
        const cleanImage = imageUrl.includes("nophoto")
            ? ""
            : imageUrl.replace(/\._[A-Z0-9_]+_\.(jpg|png)$/i, ".$1");
        items.push({
            title: extractField(block, "title"),
            author: extractField(block, "author_name"),
            rating: parseInt(extractField(block, "user_rating") || "0", 10) || 0,
            readAt: extractField(block, "user_read_at"),
            shelves: extractField(block, "user_shelves"),
            imageUrl: cleanImage
        });
    }
    return items;
}

async function fetchAllPages(shelf) {
    const all = [];
    for (let page = 1; page <= 30; page++) {
        const url = `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=${shelf}&page=${page}`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) break;
        const xml = await res.text();
        const items = parseItems(xml);
        if (items.length === 0) break;
        all.push(...items);
        process.stdout.write(`  ${shelf} p${page}: ${items.length} items\n`);
        if (items.length < 100) break;
        await sleep(300);
    }
    return all;
}

// Title aliases for translations — try matching against these when the
// physical book's Spanish title doesn't appear on the Goodreads shelf.
const titleAliases = {
    "Decidido": ["Determined"],
    "Monje y robot": ["Psalm for the Wild-Built", "Prayer for the Crown-Shy", "Monk and Robot"],
    "La transformación de la mente moderna": ["The Coddling of the American Mind"],
    "Contra el estado": ["Against the Grain"],
    "El estrecho sendero entre deseos": ["The Slow Regard of Silent Things"],
    "El amanecer de todo: Una nueva historia de la humanidad": ["The Dawn of Everything"],
    "Trabajos de mierda": ["Bullshit Jobs"],
    "Diferentes": ["Different", "Mama's Last Hug"],
    "Yo contengo multitudes": ["I Contain Multitudes"],
    "Pensar rápido, pensar despacio": ["Thinking, Fast and Slow"],
    "Una breve historia de casi todo": ["A Short History of Nearly Everything"],
    "El gen": ["The Gene"],
    "Una tierra prometida": ["A Promised Land"],
    "El futuro por decidir": ["The Future We Choose"],
    "El infinito en un junco": ["Papyrus"],
    "Anna Karenina": ["Anna Karenina"],
    "En agosto nos vemos": ["Until August"],
    "Cometas en el cielo": ["The Kite Runner"],
    "El nombre de la rosa": ["The Name of the Rose", "Il nome della rosa"],
    "El conde de Montecristo": ["The Count of Monte Cristo"],
    "El principito": ["The Little Prince", "Le Petit Prince"],
    "Don Quijote de la Mancha (I)": ["Don Quixote", "Don Quixote de la Mancha"],
    "Don Quijote de la Mancha (II)": ["Don Quixote", "Don Quixote de la Mancha"],
    "Veronika decide morir": ["Veronika Decides to Die"],
    "El cisne negro": ["The Black Swan"],
    "Antifrágil": ["Antifragile"],
    "¿Existe la suerte?": ["Fooled by Randomness"],
    "El lecho de Procusto": ["The Bed of Procrustes"],
    "Deshaciendo errores": ["The Undoing Project"],
    "Piénsalo otra vez": ["Think Again"],
    "Todo está jodido": ["Everything Is F*cked"],
    "Las ventajas de ser un marginado": ["The Perks of Being a Wallflower"],
    "El teorema Katherine": ["An Abundance of Katherines"],
    "La broma infinita": ["Infinite Jest"],
    "Dictadores": ["How to Be a Dictator", "Dictators"],
    "El arte de no ser gobernados": ["The Art of Not Being Governed"],
    "Memorias de un primate": ["A Primate's Memoir"],
    "Final de partida": ["End Times"],
    "Modos de existir": ["Ways of Being"],
    "Seres sintientes": ["Sentient"],
    "Las leyes del Serengeti": ["The Serengeti Rules"],
    "La guerra no tiene rostro de mujer": ["The Unwomanly Face of War"],
    "La crisis de la narración": ["The Crisis of Narration"],
    "La sociedad de la transparencia": ["The Transparency Society"],
    "La desaparición de los rituales": ["The Disappearance of Rituals"],
    "Miradas sobre la desigualdad": ["Visions of Inequality"],
    "Hacia las estrellas": ["The Calculating Stars"],
    "Matadero Cinco": ["Slaughterhouse-Five"],
    "Ilustración pirata": ["Pirate Enlightenment"],
    "El camino a la realidad": ["The Road to Reality"],
    "Cartas a Lucilio": ["Letters from a Stoic", "Moral Letters"],
    "En deuda: Una historia alternativa de la economía": ["Debt: The First 5,000 Years"],
    "El monje que vendió su Ferrari": ["The Monk Who Sold His Ferrari"],
    "Cómo ganar amigos e influir sobre las personas": ["How to Win Friends and Influence People"],
    "Mi Dios": ["My God"],
    "El corazón de las tinieblas": ["Heart of Darkness"],
    "Stillness Is the Key": ["La quietud es la clave"],
    "Una tierra prometida": ["A Promised Land"],
    "En busca del tiempo perdido (Tomo 1)": ["In Search of Lost Time", "Swann's Way", "Du côté de chez Swann"],
    "En busca del tiempo perdido (Tomo 2)": ["In Search of Lost Time", "Within a Budding Grove"],
    "En busca del tiempo perdido (Tomo 3)": ["In Search of Lost Time", "The Guermantes Way"],
    "Ilíada": ["The Iliad", "Iliad"],
    "Dioses y héroes: Leyendas de la antigüedad clásica": ["Gods and Heroes", "Greek Myths"],
    "Las mil y una noches (Tomo I)": ["The Arabian Nights", "One Thousand and One Nights"],
    "Las mil y una noches (Tomo II)": ["The Arabian Nights", "One Thousand and One Nights"],
    "Cuentos de amor, de locura y de muerte": ["Stories of Love, Madness and Death"],
    "Meditaciones": ["Meditations"],
    "Dominio": ["Dominion"],
    "Historia de la economía": ["A History of Economics"],
    "La disciplina marcará tu destino": ["Discipline Is Destiny"],
    "Mirar": ["About Looking"],
    "Zen en el arte del tiro con arco": ["Zen in the Art of Archery"],
    "La revancha de los poderosos": ["The Revenge of Power"],
    "Cien años de soledad": ["One Hundred Years of Solitude"],
    "Frankenstein": ["Frankenstein; or, The Modern Prometheus"],
    "Orgullo y prejuicio": ["Pride and Prejudice"],
    "Las aventuras de Sherlock Holmes": ["The Adventures of Sherlock Holmes"],
    "Charlatanes": ["Charlatans"],
    "Hijos de la Bruma I: El Imperio Final": ["Mistborn", "The Final Empire", "Mistborn: The Final Empire"],
    "Hijos de la Bruma II: El Pozo de la Ascensión": ["The Well of Ascension", "Mistborn"],
    "Hijos de la Bruma III: El Héroe de las Eras": ["The Hero of Ages", "Mistborn"],
    "Mito y significado": ["Myth and Meaning"]
};

const cleanTitle = (t) =>
    norm(t)
        .replace(/\([^)]*\)/g, " ")
        .replace(/[:,]/g, " ")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const titleWords = (t) =>
    cleanTitle(t).split(/\s+/).filter((w) => w.length >= 4);

function authorMatch(libAuthor, grAuthor) {
    if (!grAuthor || !libAuthor) return false;
    const libWords = norm(libAuthor).split(/[^\w]+/).filter((w) => w.length >= 4);
    const grWords = norm(grAuthor).split(/[^\w]+/).filter((w) => w.length >= 3);
    return libWords.some((lw) =>
        grWords.some((gw) => {
            if (lw === gw) return true;
            const p = Math.min(5, Math.min(lw.length, gw.length));
            return lw.length >= 5 && gw.length >= 5 && lw.slice(0, p) === gw.slice(0, p);
        })
    );
}

function findBest(book, grItems) {
    // Try the original title plus any aliases (different language editions).
    const candidates = [book.title, ...(titleAliases[book.title] || [])];
    let overallBest = null;
    let overallScore = 0;
    for (const candTitle of candidates) {
        const r = findBestForTitle(candTitle, book, grItems);
        if (r && r.score > overallScore) {
            overallScore = r.score;
            overallBest = r.item;
        }
    }
    return overallBest;
}

const romanMap = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
function volumeOf(rawTitle) {
    const t = rawTitle.toLowerCase();
    const m = t.match(/\b(?:tomo|vol(?:ume)?\.?|parte|book)\s+([ivx]+|\d+)\b/) ||
        t.match(/\(\s*([ivx]+|\d+)\s*\)/) ||
        t.match(/,\s*#(\d+)\)/);
    if (!m) return null;
    const raw = m[1];
    return romanMap[raw] || parseInt(raw, 10) || null;
}

function findBestForTitle(title, book, grItems) {
    const libWords = titleWords(title);
    if (libWords.length === 0) return null;
    const libVol = volumeOf(book.title);
    let best = null;
    let bestScore = 0;
    const wordMatch = (a, b) => {
        if (a === b) return 1;
        if (a.length < 5 || b.length < 5) return 0;
        const p = 5;
        return a.slice(0, p) === b.slice(0, p) ? 0.85 : 0;
    };
    for (const it of grItems) {
        const grWords = titleWords(it.title);
        if (grWords.length === 0) continue;
        let overlap = 0;
        for (const lw of libWords) {
            let bestLw = 0;
            for (const gw of grWords) {
                bestLw = Math.max(bestLw, wordMatch(lw, gw));
            }
            overlap += bestLw;
        }
        const expectsAuthor = !/varios autores|anonimo|anónimo/i.test(book.author);
        // When we can't verify by author, require nearly all library words to overlap
        const required = expectsAuthor ? Math.min(2, libWords.length) : Math.max(3, libWords.length - 1);
        if (overlap < required) continue;
        if (expectsAuthor && !authorMatch(book.author, it.author)) continue;
        // Volume disambiguation
        const grVol = volumeOf(it.title);
        if (libVol && grVol && libVol !== grVol) continue;
        const score = overlap +
            (overlap >= libWords.length ? 5 : 0) +
            (libVol && libVol === grVol ? 3 : 0);
        if (score > bestScore) {
            bestScore = score;
            best = it;
        }
    }
    return best ? { item: best, score: bestScore } : null;
}

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
            `category: ${JSON.stringify(b.category || "")}`
        ];
        if (b.coverId) parts.push(`coverId: ${b.coverId}`);
        if (b.coverUrl) parts.push(`coverUrl: ${JSON.stringify(b.coverUrl)}`);
        if (b.status) parts.push(`status: ${JSON.stringify(b.status)}`);
        if (typeof b.rating === "number" && b.rating > 0) parts.push(`rating: ${b.rating}`);
        if (b.description) parts.push(`description: ${JSON.stringify(b.description)}`);
        if (b.owned === false) parts.push(`owned: false`);
        return `    { ${parts.join(", ")} }`;
    });
    return `const books = [\n${lines.join(",\n")}\n];\n`;
}

function cleanGrTitle(t) {
    // Strip Goodreads' parenthetical series suffixes for display
    return t
        .replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, "")
        .replace(/:\s*$/, "")
        .trim();
}

(async () => {
    console.log("Fetching read shelf...");
    const read = await fetchAllPages("read");
    console.log(`Read total: ${read.length}\n`);

    console.log("Fetching currently-reading shelf...");
    const reading = await fetchAllPages("currently-reading");
    console.log(`Currently reading: ${reading.length}\n`);

    console.log("Fetching to-read shelf...");
    const toRead = await fetchAllPages("to-read");
    console.log(`To-read: ${toRead.length}\n`);

    // Refuse to overwrite books.js if Goodreads returned nothing — likely a
    // transient network or rate-limit failure, and proceeding would silently
    // wipe the read-but-not-owned section and clear every status/rating.
    if (read.length === 0 && reading.length === 0 && toRead.length === 0) {
        console.error("All Goodreads shelves returned 0 items — aborting without writing.");
        process.exit(1);
    }
    if (read.length < 50) {
        console.error(
            `Goodreads "read" shelf returned only ${read.length} items, ` +
            `well below the expected hundreds. Aborting without writing to ` +
            `avoid losing data. Re-run later.`
        );
        process.exit(1);
    }

    const allBooks = loadBooks();
    // Index categories on the previously-synced "read but not owned" entries
    // so we can carry them across the daily resync (otherwise every run
    // overwrites the categorisation done by scripts/fetch-categories.js).
    const prevReadOnlyCats = new Map();
    for (const b of allBooks) {
        if (b.owned === false && b.category) {
            const key = norm(b.title) + "|" + norm(b.author);
            prevReadOnlyCats.set(key, b.category);
        }
    }
    // Drop any previously-added "read but not owned" entries before re-syncing.
    const books = allBooks.filter((b) => b.owned !== false);
    let matchedRead = 0;
    let matchedReading = 0;
    let matchedToRead = 0;
    let unmatched = [];
    const matchedReadRefs = new Set();

    for (const b of books) {
        delete b.status;
        delete b.rating;

        const r = findBest(b, reading);
        if (r) {
            b.status = "reading";
            matchedReading++;
            console.log(`  📖 reading: "${b.title}" ↔ "${r.title}"`);
            continue;
        }
        const m = findBest(b, read);
        if (m) {
            b.status = "read";
            if (m.rating > 0) b.rating = m.rating;
            matchedRead++;
            matchedReadRefs.add(m);
            console.log(`  ✓ read (${m.rating || "—"}): "${b.title}" ↔ "${m.title}"`);
            continue;
        }
        const t = findBest(b, toRead);
        if (t) {
            b.status = "to-read";
            matchedToRead++;
            console.log(`  · to-read: "${b.title}" ↔ "${t.title}"`);
            continue;
        }
        unmatched.push(b.title);
    }

    // Books on Goodreads "read" shelf that don't match any physical book.
    const readNotOwned = read
        .filter((it) => !matchedReadRefs.has(it))
        .map((it) => {
            const title = cleanGrTitle(it.title);
            const author = it.author || "";
            const key = norm(title) + "|" + norm(author);
            return {
                title,
                author,
                category: prevReadOnlyCats.get(key) || "",
                coverUrl: it.imageUrl || "",
                status: "read",
                rating: it.rating > 0 ? it.rating : undefined,
                owned: false
            };
        });

    const finalBooks = [...books, ...readNotOwned];
    fs.writeFileSync(BOOKS_FILE, serialize(finalBooks), "utf8");
    console.log(`\n=== Summary ===`);
    console.log(`Owned: ${books.length} (read ${matchedRead} / reading ${matchedReading} / to-read ${matchedToRead})`);
    console.log(`Read but not owned: ${readNotOwned.length}`);
    console.log(`Total entries: ${finalBooks.length}`);
    console.log(`Unmatched owned: ${unmatched.length}`);
})();
