#!/usr/bin/env node
// Strict cover lookup with fuzzy author verification.
//   - Verifies the result's author shares a 5-char prefix with the expected
//     author (so "Tolstói" matches "Tolstoy", "Dikötter" matches "Dikotter").
//   - For Spanish translations, also tries the original-language title.
//   - Prefers Spanish-language editions when the title looks Spanish.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const norm = (s) => stripDiacritics(String(s || "")).toLowerCase();

const cleanTitle = (title) =>
    norm(title)
        .replace(/\([^)]*\)/g, " ")
        .replace(/[:,]/g, " ")
        .replace(/\s+(tomo|vol|vols|volume|volumes)\.?\s+[ivxlcdm\d\-–\s]+/gi, " ")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const splitAuthors = (author) =>
    author
        .split(/\s+y\s+|\s*&\s*|\s*,\s*|\s+con\s+|\s+and\s+/i)
        .map((a) => a.trim())
        .filter((a) => a && !/varios autores|anonimo|anónimo/i.test(a));

const titleAliases = {
    "Decidido": "Determined Sapolsky",
    "Monje y robot": "Psalm Wild Built Becky Chambers",
    "Wild Rituals": "Caitlin O Connell elephants",
    "The Matter with Things, Vol. I: The Ways to Truth": "Matter with Things McGilchrist",
    "The Matter with Things, Vol. II: What Then Is True?": "Matter with Things McGilchrist",
    "Charlatanes": "Revenge Power Moises Naim Toro",
    "Miradas sobre la desigualdad": "Branko Milanovic Visions Inequality",
    "How AI Will Change Your Life": "Patrick Dixon AI",
    "El arte de no ser gobernados": "Art Not Being Governed Scott",
    "Integrating Food into Urban Planning": "Integrating Food Urban Planning Cabannes",
    "80 Tools for Participatory Development": "Geilfus 80 Herramientas Desarrollo Participativo",
    "Dioses y héroes: Leyendas de la antigüedad clásica": "Schwab Gods Heroes Greece",
    "La guerra no tiene rostro de mujer": "Svetlana Alexievich war unwomanly",
    "One Piece, vols. 1-2-3 (East Blue)": "One Piece Omnibus East Blue Eiichiro Oda",
    "One Piece, vols. 4-5-6 (East Blue)": "One Piece Omnibus East Blue Eiichiro Oda",
    "One Piece, vols. 7-8-9 (East Blue)": "One Piece Omnibus East Blue Eiichiro Oda",
    "One Piece, vols. 10-11-12 (East Blue)": "One Piece Omnibus East Blue Eiichiro Oda",
    "One Piece, vols. 13-14-15 (Baroque Works)": "One Piece Omnibus Baroque Works Eiichiro Oda",
    "One Piece, vols. 16-17-18 (Baroque Works)": "One Piece Omnibus Baroque Works Eiichiro Oda",
    "Contra el estado": "Against the Grain James Scott",
    "El estrecho sendero entre deseos": "Slow Regard of Silent Things Rothfuss",
    "El amanecer de todo: Una nueva historia de la humanidad": "Dawn of Everything Graeber Wengrow",
    "Trabajos de mierda": "Bullshit Jobs Graeber",
    "Diferentes": "Different Frans de Waal",
    "Yo contengo multitudes": "I Contain Multitudes Yong",
    "Pensar rápido, pensar despacio": "Thinking Fast Slow Kahneman",
    "Una breve historia de casi todo": "Short History of Nearly Everything Bryson",
    "El gen": "The Gene Mukherjee",
    "Una tierra prometida": "Promised Land Obama",
    "El futuro por decidir": "Future We Choose Figueres",
    "El infinito en un junco": "Papyrus Vallejo",
    "Anna Karenina": "Anna Karenina Tolstoy",
    "Cien años de soledad": "Cien años de soledad García Márquez",
    "En agosto nos vemos": "Until August García Márquez",
    "Cometas en el cielo": "Kite Runner Hosseini",
    "El nombre de la rosa": "Name of the Rose Eco",
    "El conde de Montecristo": "Count of Monte Cristo Dumas",
    "Frankenstein": "Frankenstein Mary Shelley",
    "Orgullo y prejuicio": "Pride and Prejudice Austen",
    "Las aventuras de Sherlock Holmes": "Adventures of Sherlock Holmes Doyle",
    "El corazón de las tinieblas": "Heart of Darkness Conrad",
    "El principito": "Little Prince Saint-Exupery",
    "Don Quijote de la Mancha (I)": "Don Quijote Cervantes parte primera",
    "Don Quijote de la Mancha (II)": "Don Quijote Cervantes segunda parte",
    "Veronika decide morir": "Veronika Decides to Die Coelho",
    "1984": "1984 George Orwell",
    "El cisne negro": "Black Swan Taleb",
    "Antifrágil": "Antifragile Taleb",
    "¿Existe la suerte?": "Fooled by Randomness Taleb",
    "El lecho de Procusto": "Bed of Procrustes Taleb",
    "Superfreakonomics": "Superfreakonomics Levitt Dubner",
    "Deshaciendo errores": "Undoing Project Michael Lewis",
    "Piénsalo otra vez": "Think Again Adam Grant",
    "La transformación de la mente moderna": "Coddling of the American Mind Haidt",
    "Todo está jodido": "Everything Is Fucked Manson",
    "Las ventajas de ser un marginado": "Perks of Being a Wallflower Chbosky",
    "El teorema Katherine": "Abundance of Katherines John Green",
    "La broma infinita": "Infinite Jest Foster Wallace",
    "Cuentos de amor, de locura y de muerte": "Cuentos amor locura muerte Quiroga",
    "Charlatanes": "Charlatanes Naím Toro",
    "Dictadores": "Dictators Frank Dikotter",
    "El arte de no ser gobernados": "Art of Not Being Governed James Scott",
    "Memorias de un primate": "Primate Memoir Sapolsky",
    "Don't Sleep, There Are Snakes": "Don't Sleep There Are Snakes Everett",
    "Circe": "Circe Madeline Miller",
    "The Ultimate Hitchhiker's Guide to the Galaxy": "Hitchhiker's Guide Galaxy Douglas Adams",
    "Final de partida": "End Times Peter Turchin",
    "Modos de existir": "Ways of Being James Bridle",
    "Seres sintientes": "Sentient Jackie Higgins",
    "Las leyes del Serengeti": "Serengeti Rules Sean Carroll",
    "How AI Will Change Your Life": "AI Will Change Your Life Patrick Dixon",
    "La guerra no tiene rostro de mujer": "Unwomanly Face of War Alexievich",
    "La crisis de la narración": "Crisis of Narration Han",
    "La sociedad de la transparencia": "Transparency Society Han",
    "La desaparición de los rituales": "Disappearance Rituals Han",
    "Miradas sobre la desigualdad": "Visions of Inequality Milanovic",
    "Wild Rituals": "Wild Rituals Caitlin O Connell",
    "Hacia las estrellas": "Calculating Stars Mary Robinette Kowal",
    "Matadero Cinco": "Slaughterhouse Five Vonnegut",
    "Materiales del mundo": "Material World Ed Conway",
    "El amanecer de todo": "Dawn of Everything Graeber",
    "Ilustración pirata": "Pirate Enlightenment Graeber",
    "Cartas a Lucilio": "Letters from a Stoic Seneca",
    "En deuda: Una historia alternativa de la economía": "Debt First 5000 Years Graeber",
    "Anarquía relacional": "Anarquía relacional Pérez Cortés",
    "Vita Breve: Juana de Arco": "Joan Arc Mary Gordon",
    "Si mi biblioteca ardiera esta noche": "Si mi biblioteca ardiera esta noche Huxley",
    "Sandy: Leyendas a la tica": "Sandy leyendas tica Roger Bolaños",
    "Los anarquistas": "Anarchists Roderick Kedward"
};

const lastNameOf = (author) => {
    const words = norm(author).split(/\s+/).filter((w) => w.length >= 3);
    if (words.length === 0) return "";
    const skip = new Set(["van", "von", "der", "den", "del", "los", "las", "the", "san"]);
    const meaningful = words.filter((w) => !skip.has(w));
    return meaningful[meaningful.length - 1] || words[words.length - 1];
};

const looksSpanish = (title) => {
    const t = title.toLowerCase();
    if (/[ñáéíóúü¿¡]/.test(title)) return true;
    if (/\b(el|la|los|las|de|del|y|en|un|una|que|por|con|para|sobre|sin|al|hacia)\b/.test(t)) return true;
    return false;
};

async function fetchSearch(params) {
    const url =
        "https://openlibrary.org/search.json?" +
        new URLSearchParams({
            ...params,
            limit: "10",
            fields: "title,author_name,cover_i,edition_count,language,first_publish_year"
        });
    const res = await fetch(url, {
        headers: { "User-Agent": "BibliotecaPersonal/1.0 (+local)" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || []).filter((d) => d.cover_i && Array.isArray(d.author_name));
}

function fuzzyMatchWord(a, b) {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    // shared 5-char prefix (handles Tolstoi/Tolstoy, Dikotter, etc.)
    const prefixLen = Math.min(5, Math.min(a.length, b.length));
    if (a.slice(0, prefixLen) === b.slice(0, prefixLen)) return true;
    return false;
}

function authorMatches(docAuthors, expected) {
    if (expected.length === 0) return true; // anonymous
    const docWords = docAuthors.flatMap((a) =>
        norm(a).split(/\s+/).filter((w) => w.length >= 3)
    );
    const skipParticle = new Set([
        "van", "von", "der", "den", "del", "los", "las", "the", "san", "and", "with", "for"
    ]);
    return expected.some((exp) => {
        const expWords = norm(exp)
            .split(/\s+/)
            .filter((w) => w.length >= 4 && !skipParticle.has(w));
        if (expWords.length === 0) return false;
        const ln = lastNameOf(exp);
        // Require lastName-ish to match somewhere in doc authors
        if (ln && docWords.some((dw) => fuzzyMatchWord(ln, dw))) return true;
        // Or any meaningful word matches
        return expWords.some((ew) => docWords.some((dw) => fuzzyMatchWord(ew, dw)));
    });
}

function score(doc, preferSpanish) {
    let s = doc.edition_count || 0;
    if (preferSpanish && Array.isArray(doc.language) && doc.language.includes("spa")) {
        s += 100000;
    }
    return s;
}

async function findCover(book) {
    const expectedAuthors = splitAuthors(book.author);
    const titleClean = cleanTitle(book.title);
    const preferSpa = looksSpanish(book.title);
    const alias = titleAliases[book.title];

    const queries = [];
    if (expectedAuthors.length > 0) {
        queries.push({ title: titleClean, author: expectedAuthors[0] });
        queries.push({ q: `${titleClean} ${expectedAuthors[0]}` });
    }
    if (alias) {
        queries.push({ q: alias });
    }
    queries.push({ title: titleClean });
    queries.push({ q: titleClean });

    for (const params of queries) {
        const docs = await fetchSearch(params);
        const matches = docs.filter((d) => authorMatches(d.author_name, expectedAuthors));
        if (matches.length > 0) {
            matches.sort((a, b) => score(b, preferSpa) - score(a, preferSpa));
            const winner = matches[0];
            return {
                coverId: winner.cover_i,
                via: params,
                docTitle: winner.title,
                docAuthors: winner.author_name,
                lang: winner.language
            };
        }
        await sleep(80);
    }
    return null;
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
        return `    { ${parts.join(", ")} }`;
    });
    return `const books = [\n${lines.join(",\n")}\n];\n`;
}

(async () => {
    const books = loadBooks();
    const reset = process.argv.includes("--reset");
    let found = 0;
    let missing = [];
    for (let i = 0; i < books.length; i++) {
        const b = books[i];
        if (reset) {
            delete b.coverId;
            delete b.coverUrl;
        }
        if (b.coverId || b.coverUrl) {
            found++;
            continue;
        }
        try {
            const res = await findCover(b);
            if (res) {
                b.coverId = res.coverId;
                found++;
                console.log(
                    `✓ [${i + 1}/${books.length}] "${b.title}" — ${b.author}\n   → #${res.coverId} "${res.docTitle}" by ${res.docAuthors.slice(0, 2).join(", ")}${res.lang ? ` [${res.lang.slice(0, 3).join(",")}]` : ""}`
                );
            } else {
                missing.push(b.title);
                console.log(`✗ [${i + 1}/${books.length}] ${b.title} — ${b.author}`);
            }
        } catch (err) {
            missing.push(b.title);
            console.log(`! [${i + 1}/${books.length}] ${b.title} — ${err.message}`);
        }
        await sleep(150);
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\nDone. ${found}/${books.length} covers. ${missing.length} missing.`);
    if (missing.length) missing.forEach((t) => console.log(`  - ${t}`));
})();
