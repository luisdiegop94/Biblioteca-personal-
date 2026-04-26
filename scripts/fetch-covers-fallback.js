#!/usr/bin/env node
// Fallback: for books still missing coverId, query Google Books for an
// image URL and store it as `coverUrl` (full URL, not Open Library ID).

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
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const cleanAuthor = (author) => {
    const first = author.split(/\s+y\s+|\s*&\s*|\s*,\s*/i)[0];
    return stripDiacritics(first).replace(/[^\w\s]/g, " ").trim();
};

async function searchGoogleBooks(book) {
    const title = cleanTitle(book.title);
    const author = cleanAuthor(book.author);
    const q = `intitle:${title}${author && author !== "Varios autores" ? `+inauthor:${author}` : ""}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items = (data.items || []).filter(
        (i) => i.volumeInfo && i.volumeInfo.imageLinks && i.volumeInfo.imageLinks.thumbnail
    );
    if (items.length === 0) {
        // Fallback: just title
        const url2 = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}&maxResults=5`;
        const res2 = await fetch(url2);
        if (!res2.ok) return null;
        const data2 = await res2.json();
        const items2 = (data2.items || []).filter(
            (i) => i.volumeInfo && i.volumeInfo.imageLinks && i.volumeInfo.imageLinks.thumbnail
        );
        if (items2.length === 0) return null;
        return items2[0].volumeInfo.imageLinks.thumbnail.replace(/^http:/, "https:");
    }
    return items[0].volumeInfo.imageLinks.thumbnail.replace(/^http:/, "https:");
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
    const targets = books.filter((b) => !b.coverId && !b.coverUrl);
    console.log(`Searching Google Books for ${targets.length} missing covers...`);
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
        const b = targets[i];
        try {
            const url = await searchGoogleBooks(b);
            if (url) {
                b.coverUrl = url;
                found++;
                console.log(`✓ [${i + 1}/${targets.length}] ${b.title}`);
            } else {
                console.log(`✗ [${i + 1}/${targets.length}] ${b.title}`);
            }
        } catch (err) {
            console.log(`! [${i + 1}/${targets.length}] ${b.title} — ${err.message}`);
        }
        await sleep(200);
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\nDone. ${found}/${targets.length} additional covers found.`);
})();
