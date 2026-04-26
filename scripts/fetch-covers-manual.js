#!/usr/bin/env node
// Manual mapping for the few remaining books — uses English titles or
// alternative search terms to find their Open Library cover IDs.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const overrides = {
    "La transformación de la mente moderna": "The Coddling of the American Mind Haidt",
    "El estrecho sendero entre deseos": "Slow Regard Silent Things Rothfuss",
    "Todo está jodido": "Everything Is Fucked Manson",
    "El arte de no ser gobernados": "Art of Not Being Governed Scott",
    "Seres sintientes": "Sentient Higgins",
    "Dioses y héroes: Leyendas de la antigüedad clásica": "Gods Heroes Greece Schwab",
    "Si mi biblioteca ardiera esta noche": "Aldous Huxley ensayos",
    "Vita Breve: Juana de Arco": "Joan Arc Mary Gordon"
};

async function search(query) {
    const url =
        "https://openlibrary.org/search.json?" +
        new URLSearchParams({
            q: query,
            limit: "5",
            fields: "title,author_name,cover_i,edition_count"
        });
    const res = await fetch(url, {
        headers: { "User-Agent": "BibliotecaPersonal/1.0 (+local)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const docs = (data.docs || []).filter((d) => d.cover_i);
    if (docs.length === 0) return null;
    docs.sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
    return docs[0].cover_i;
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
    let found = 0;
    let still = [];
    for (const b of books) {
        if (b.coverId || b.coverUrl) continue;
        const query = overrides[b.title] || b.title;
        try {
            const id = await search(query);
            if (id) {
                b.coverId = id;
                found++;
                console.log(`✓ ${b.title} → ${id}`);
            } else {
                still.push(b.title);
                console.log(`✗ ${b.title}`);
            }
        } catch (err) {
            still.push(b.title);
            console.log(`! ${b.title} — ${err.message}`);
        }
        await sleep(200);
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\nFound ${found} more covers.`);
    if (still.length) {
        console.log(`\nStill missing (${still.length}):`);
        still.forEach((t) => console.log(`  - ${t}`));
    }
})();
