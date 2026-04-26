#!/usr/bin/env node
// Fetches Open Library cover IDs for every book in js/books.js
// and rewrites the file so each book has a `coverId` field.
// Re-runnable: keeps existing coverId values.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const cleanTitle = (title) =>
    stripDiacritics(title)
        .replace(/\([^)]*\)/g, " ")
        .replace(/,?\s*(vols?|tomos?|volumes?)\.?\s*[\dIVX\-–\s]+/gi, " ")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const cleanAuthor = (author) => {
    const first = author.split(/\s+y\s+|\s*&\s*|\s*,\s*/i)[0];
    return stripDiacritics(first).replace(/[^\w\s]/g, " ").trim();
};

async function searchCover(book) {
    const title = cleanTitle(book.title);
    const author = cleanAuthor(book.author);
    const url =
        "https://openlibrary.org/search.json?" +
        new URLSearchParams({
            title,
            author,
            limit: "5",
            fields: "title,author_name,cover_i,edition_count"
        });
    const res = await fetch(url, {
        headers: { "User-Agent": "BibliotecaPersonal/1.0 (+local)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const docs = (data.docs || []).filter((d) => d.cover_i);
    if (docs.length === 0) {
        // Fallback: search without author
        const url2 =
            "https://openlibrary.org/search.json?" +
            new URLSearchParams({
                q: title,
                limit: "5",
                fields: "title,author_name,cover_i,edition_count"
            });
        const res2 = await fetch(url2, {
            headers: { "User-Agent": "BibliotecaPersonal/1.0 (+local)" }
        });
        if (!res2.ok) return null;
        const data2 = await res2.json();
        const docs2 = (data2.docs || []).filter((d) => d.cover_i);
        if (docs2.length === 0) return null;
        docs2.sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
        return docs2[0].cover_i;
    }
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
        return `    { ${parts.join(", ")} }`;
    });
    return `const books = [\n${lines.join(",\n")}\n];\n`;
}

(async () => {
    const books = loadBooks();
    let found = 0;
    let missing = [];
    for (let i = 0; i < books.length; i++) {
        const b = books[i];
        if (b.coverId) {
            found++;
            continue;
        }
        try {
            const id = await searchCover(b);
            if (id) {
                b.coverId = id;
                found++;
                console.log(`✓ [${i + 1}/${books.length}] ${b.title} → ${id}`);
            } else {
                missing.push(b.title);
                console.log(`✗ [${i + 1}/${books.length}] ${b.title}`);
            }
        } catch (err) {
            missing.push(b.title);
            console.log(`! [${i + 1}/${books.length}] ${b.title} — ${err.message}`);
        }
        await sleep(150);
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\nDone. ${found}/${books.length} covers found.`);
    if (missing.length) {
        console.log(`\nMissing covers (${missing.length}):`);
        missing.forEach((t) => console.log(`  - ${t}`));
    }
})();
