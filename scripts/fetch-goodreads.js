#!/usr/bin/env node
// Sincroniza los estantes públicos de Goodreads ("read", "currently-reading"
// y "to-read") con js/books.js: empareja los libros físicos por título y
// autor, y les pone `status` ("read" / "reading" / "to-read") y `rating`
// (0-5). Los libros de Goodreads que no están en la biblioteca física se
// agregan con `owned: false`.
//
// Goodreads retiró los feeds RSS de los estantes cerca del 28-oct-2026
// (/review/list_rss/ da 404 para todos) y la página /review/list ahora pide
// iniciar sesión. Lo único público que queda es el widget de estantes
// (/review/custom_widget/), que tiene dos límites:
//   1. Devuelve 100 libros como máximo por consulta. Se consulta el mismo
//      estante con varios órdenes y se unen los resultados; así se cubre
//      casi todo el estante, aunque no siempre el 100 %.
//   2. Guarda en caché la respuesta según `widget_id` e ignora los demás
//      parámetros, así que cada consulta usa un widget_id nuevo.
// Como el widget no siempre trae el estante completo, el sync es
// incremental: lo que ya está en books.js y no aparece en el widget se
// conserva tal cual, en vez de borrarse. El widget tampoco trae sinopsis,
// así que los libros nuevos entran sin `description`.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");
const USER_ID = 106892623;
const WIDGET_MAX = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripDiacritics(String(s || "")).toLowerCase();

// Órdenes con los que se consulta cada estante grande. Cada uno trae otros
// 100 libros; la unión de todos cubre casi todo el estante. "date_read" y
// "date_updated" van primero en "read" para que siempre entren los libros
// recién terminados o recién calificados.
const SORTS_BIG_SHELF = [
    ["date_added", "d"], ["date_added", "a"],
    ["date_read", "d"], ["date_updated", "d"],
    ["title", "a"], ["title", "d"],
    ["author", "a"], ["author", "d"],
    ["rating", "d"],
    ["avg_rating", "a"], ["avg_rating", "d"],
    ["num_pages", "a"], ["num_pages", "d"]
];

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

// El widget es un script `var widget_code = '<html>'`. Saca el literal y
// deshace los escapes de JavaScript.
function widgetHtml(script) {
    const m = script.match(/var widget_code = '((?:[^'\\]|\\[\s\S])*)'/);
    if (!m) return null;
    return m[1].replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e) => {
        if (e[0] === "u" || e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
        if (e === "n") return "\n";
        if (e === "t") return "\t";
        if (e === "r") return "";
        return e;
    });
}

function parseWidget(html) {
    const items = [];
    const blocks = html.split(/<div class="gr_custom_each_container_[^"]*">/).slice(1);
    for (const block of blocks) {
        const cover = block.match(/<a title="([^"]*)"[^>]*href="[^"]*\/review\/show\/(\d+)[^"]*"[^>]*><img[^>]*src="([^"]*)"/);
        if (!cover) continue;
        const authorM = block.match(/gr_custom_author_[^"]*">\s*by\s*<a[^>]*>([^<]*)<\/a>/);
        const ratingM = block.match(/<span class="\s*staticStars[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        const imageUrl = decodeEntities(cover[3]);
        items.push({
            reviewId: cover[2],
            title: decodeEntities(cover[1]).replace(/\s+/g, " ").trim(),
            author: authorM ? decodeEntities(authorM[1]).replace(/\s+/g, " ").trim() : "",
            rating: ratingM ? (ratingM[1].match(/star_active/g) || []).length : 0,
            imageUrl: imageUrl.includes("nophoto")
                ? ""
                : imageUrl.replace(/\._[A-Z0-9_]+_\.(jpg|png)$/i, ".$1")
        });
    }
    return items;
}

let widgetCounter = 0;
async function fetchWidget(shelf, sort, order) {
    const params = new URLSearchParams({
        shelf,
        sort,
        order,
        num_books: String(WIDGET_MAX),
        show_author: "1",
        show_cover: "1",
        show_title: "1",
        show_rating: "1",
        // widget_id nuevo en cada consulta para saltarse la caché de Goodreads.
        widget_id: `sync${Date.now()}${widgetCounter++}`
    });
    const url = `https://www.goodreads.com/review/custom_widget/${USER_ID}?${params}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = widgetHtml(await res.text());
            if (!html) throw new Error("la respuesta no trae widget_code");
            if (/widget is not correct/i.test(html)) throw new Error("Goodreads dice que el widget no es válido");
            // El encabezado enlaza al estante con que se armó el widget. Si
            // no coincide, la respuesta vino de caché y no sirve.
            const header = html.match(/review\/list\/[^"?]*\?shelf=([^&"]+)/);
            const got = header ? decodeURIComponent(header[1]) : null;
            if (got !== shelf) throw new Error(`el widget vino del estante "${got}" y no de "${shelf}"`);
            return parseWidget(html);
        } catch (err) {
            if (attempt === 3) throw new Error(`${shelf} ${sort} ${order}: ${err.message}`);
            await sleep(2000 * attempt);
        }
    }
}

// Une las consultas de un estante (sin repetir reseñas). `complete` es true
// cuando alguna consulta trajo menos de 100: entonces el estante entero cupo.
async function fetchShelf(shelf, sorts) {
    const byReview = new Map();
    let complete = false;
    for (const [sort, order] of sorts) {
        const items = await fetchWidget(shelf, sort, order);
        const before = byReview.size;
        for (const it of items) if (!byReview.has(it.reviewId)) byReview.set(it.reviewId, it);
        process.stdout.write(`  ${shelf} ${sort} ${order}: ${items.length} (+${byReview.size - before})\n`);
        await sleep(700);
        if (items.length < WIDGET_MAX) {
            complete = true;
            break;
        }
    }
    const items = [...byReview.values()];
    items.complete = complete;
    return items;
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
    "Las mil y una noches (Tomo I)": ["The Arabian Nights", "One Thousand and One Nights", "Las mil y una noches: Edición Completa"],
    "Las mil y una noches (Tomo II)": ["The Arabian Nights", "One Thousand and One Nights", "Las mil y una noches: Edición Completa"],
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

// Desempate: cuando dos ediciones del mismo libro empatan (por ejemplo, dos
// "Fooled by Randomness" en "read"), se prefiere la que tiene la calificación
// que el libro ya traía, para que el resultado no dependa del orden en que
// el widget devuelve los libros.
function isPrevious(book, item) {
    return !!item && typeof book.rating === "number" && item.rating === book.rating;
}

function findBest(book, grItems) {
    // Try the original title plus any aliases (different language editions).
    const candidates = [book.title, ...(titleAliases[book.title] || [])];
    let overallBest = null;
    let overallScore = 0;
    for (const candTitle of candidates) {
        const r = findBestForTitle(candTitle, book, grItems);
        if (r && (r.score > overallScore ||
            (r.score === overallScore && isPrevious(book, r.item) && !isPrevious(book, overallBest)))) {
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
        if (score > bestScore ||
            (score === bestScore && isPrevious(book, it) && !isPrevious(book, best))) {
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
        if (b.descriptionAi) parts.push(`descriptionAi: true`);
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
    console.log("Leyendo el estante currently-reading...");
    const reading = await fetchShelf("currently-reading", [["date_added", "d"]]);
    console.log(`Leyendo ahora: ${reading.length}${reading.complete ? " (estante completo)" : ""}\n`);

    console.log("Leyendo el estante read...");
    const read = await fetchShelf("read", SORTS_BIG_SHELF);
    console.log(`Leídos: ${read.length}${read.complete ? " (estante completo)" : ""}\n`);

    console.log("Leyendo el estante to-read...");
    const toRead = await fetchShelf("to-read", SORTS_BIG_SHELF);
    console.log(`Por leer: ${toRead.length}${toRead.complete ? " (estante completo)" : ""}\n`);

    // Si Goodreads devolvió muy poco, no se toca books.js: lo más probable
    // es una falla pasajera, y seguir dejaría estados viejos o incompletos.
    if (read.length < 50) {
        console.error(
            `El estante "read" devolvió solo ${read.length} libros, muy por debajo ` +
            `de los cientos esperados. Se aborta sin escribir. Reintentar más tarde.`
        );
        process.exit(1);
    }

    const allBooks = loadBooks();
    const books = allBooks.filter((b) => b.owned !== false);
    const prevNotOwned = allBooks.filter((b) => b.owned === false);

    let matchedRead = 0;
    let matchedReading = 0;
    let matchedToRead = 0;
    let kept = 0;
    const unmatched = [];
    const claimed = new Set();

    // 1. Libros físicos. Si el widget no trae su libro (el estante no siempre
    //    sale completo), se conserva el estado que ya tenía.
    for (const b of books) {
        const r = findBest(b, reading);
        if (r) {
            b.status = "reading";
            delete b.rating;
            claimed.add(r);
            matchedReading++;
            console.log(`  📖 reading: "${b.title}" ↔ "${r.title}"`);
            continue;
        }
        const m = findBest(b, read);
        if (m) {
            b.status = "read";
            if (m.rating > 0) b.rating = m.rating;
            else delete b.rating;
            claimed.add(m);
            matchedRead++;
            console.log(`  ✓ read (${m.rating || "—"}): "${b.title}" ↔ "${m.title}"`);
            continue;
        }
        const t = findBest(b, toRead);
        if (t) {
            b.status = "to-read";
            delete b.rating;
            claimed.add(t);
            matchedToRead++;
            console.log(`  · to-read: "${b.title}" ↔ "${t.title}"`);
            continue;
        }
        if (b.status === "reading" && reading.complete) {
            // "Leyendo" sí sale completo: si ya no está ahí, dejó de leerse.
            console.log(`  ✗ ya no está en currently-reading: "${b.title}"`);
            delete b.status;
            delete b.rating;
        } else if (b.status) {
            kept++;
        }
        unmatched.push(b.title);
    }

    // 2. Libros de Goodreads que no están en la biblioteca física. Se parte
    //    de las entradas que ya existen para conservar su categoría, sinopsis
    //    y portada, y se actualizan su estado y calificación.
    // La clave ignora entidades HTML (el RSS dejaba "&apos;" sin decodificar),
    // espacios repetidos y un paréntesis final (serie), que el widget y el
    // RSS no escribían igual.
    const keyPart = (s) => norm(decodeEntities(String(s || "")))
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    const keyOf = (title, author) => keyPart(title) + "|" + keyPart(author);
    const prevByKey = new Map();
    // Si hay dos entradas con la misma clave (dos ediciones del mismo libro),
    // se queda la primera y la otra se descarta como duplicado.
    for (const b of prevNotOwned) {
        const k = keyOf(b.title, b.author);
        if (!prevByKey.has(k)) prevByKey.set(k, b);
    }

    const seenKeys = new Set();
    const updatedByKey = new Map();
    const groups = { read: [], reading: [], "to-read": [] }; // solo las nuevas
    let added = 0;
    let updated = 0;
    const take = (it, status) => {
        if (claimed.has(it)) return;
        const title = cleanGrTitle(it.title);
        const author = it.author || "";
        const key = keyOf(title, author);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        const prev = prevByKey.get(key);
        const entry = prev
            ? { ...prev, title: decodeEntities(prev.title), author: decodeEntities(prev.author || "") }
            : { title, author, category: "", owned: false };
        if (!prev) added++;
        else updated++;
        entry.status = status;
        if (status === "read" && it.rating > 0) entry.rating = it.rating;
        else delete entry.rating;
        if (!entry.coverUrl && it.imageUrl) entry.coverUrl = it.imageUrl;
        if (!prev) {
            console.log(`  + nuevo (${status}): "${title}" — ${author}`);
            groups[status].push(entry);
        } else {
            if (prev.status !== status) console.log(`  ~ ${prev.status} → ${status}: "${title}"`);
            updatedByKey.set(key, entry);
        }
    };
    // El orden de prioridad es el mismo que para los libros físicos.
    reading.forEach((it) => take(it, "reading"));
    read.forEach((it) => take(it, "read"));
    toRead.forEach((it) => take(it, "to-read"));

    // Las entradas existentes mantienen su lugar en books.js para que el diff
    // diario muestre solo lo que cambió. Las que el widget no trajo se
    // conservan como estaban, salvo las que figuraban como "leyendo" y ya no
    // están en ese estante.
    let keptNotOwned = 0;
    let dropped = 0;
    const notOwned = [];
    const placed = new Set();
    for (const b of prevNotOwned) {
        const key = keyOf(b.title, b.author);
        if (placed.has(key)) continue;
        placed.add(key);
        if (updatedByKey.has(key)) {
            notOwned.push(updatedByKey.get(key));
            continue;
        }
        if (b.status === "reading" && reading.complete) {
            console.log(`  ✗ se quita (ya no está en currently-reading): "${b.title}"`);
            dropped++;
            continue;
        }
        keptNotOwned++;
        notOwned.push(b);
    }
    // Las nuevas van al inicio de su bloque, como hacía el RSS (lo más
    // reciente primero): las leídas al principio y las demás antes del
    // primer "por leer".
    notOwned.unshift(...groups.read);
    let firstToRead = notOwned.findIndex((b) => b.status === "to-read");
    if (firstToRead < 0) firstToRead = notOwned.length;
    notOwned.splice(firstToRead, 0, ...groups.reading, ...groups["to-read"]);

    const finalBooks = [...books, ...notOwned];
    fs.writeFileSync(BOOKS_FILE, serialize(finalBooks), "utf8");
    const countStatus = (s) => notOwned.filter((b) => b.status === s).length;
    console.log(`\n=== Resumen ===`);
    console.log(`Propios: ${books.length} (read ${matchedRead} / reading ${matchedReading} / to-read ${matchedToRead}; ${kept} conservan el estado anterior)`);
    console.log(`No propios: ${countStatus("read")} leídos, ${countStatus("reading")} leyendo, ${countStatus("to-read")} por leer`);
    console.log(`  nuevos ${added}, actualizados ${updated}, conservados sin cambios ${keptNotOwned}, quitados ${dropped}`);
    console.log(`Total de entradas: ${finalBooks.length}`);
    console.log(`Propios sin pareja en Goodreads: ${unmatched.length}`);
})().catch((err) => {
    console.error(`Falló la sincronización: ${err.message}`);
    process.exit(1);
});
