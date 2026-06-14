#!/usr/bin/env node
// For physical books (owned !== false) that still have no cover, search
// Goodreads' public search page, verify the result's author matches,
// and store the Goodreads image URL as `coverUrl`.

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

function parseSearchResults(html) {
    // Each result starts with <div id="BOOK_ID" class="u-anchorTarget">
    const blocks = html.split(/<div id="\d+" class="u-anchorTarget">/);
    const results = [];
    for (const block of blocks.slice(1)) {
        const coverMatch = block.match(/class="bookCover"[^>]*src="([^"]+)"/);
        const titleMatch = block.match(/<span itemprop='name' role='heading'[^>]*>([^<]+)<\/span>/);
        const authorMatch = block.match(/<a class="authorName"[^>]*>\s*<span itemprop="name">([^<]+)<\/span>/);
        if (!coverMatch || !titleMatch) continue;
        if (coverMatch[1].includes("nophoto")) continue; // Goodreads placeholder
        // Remove size suffix to get full-resolution image
        const cover = coverMatch[1].replace(/\._[A-Z0-9_]+_\.jpg$/i, ".jpg");
        results.push({
            cover,
            title: titleMatch[1].trim(),
            author: authorMatch ? authorMatch[1].trim() : ""
        });
    }
    return results;
}

async function searchGoodreads(query) {
    const url = `https://www.goodreads.com/search?q=${encodeURIComponent(query)}&search_type=books`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    return parseSearchResults(await res.text());
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

(async () => {
    const books = loadBooks();
    const targets = books.filter((b) => b.owned !== false && !b.coverId && !b.coverUrl);
    console.log(`Searching Goodreads for ${targets.length} books missing covers...\n`);

    let found = 0;
    let stillMissing = [];

    for (const book of targets) {
        const titleQ = cleanForQuery(book.title);
        const authorQ = cleanForQuery(book.author).split(/\s+/).slice(0, 3).join(" ");
        const tryQueries = [
            `${titleQ} ${authorQ}`,
            titleQ
        ];
        let match = null;
        for (const q of tryQueries) {
            const results = await searchGoodreads(q);
            await sleep(400);
            const verified = results.find((r) => authorMatches(book.author, r.author));
            if (verified) {
                match = verified;
                break;
            }
            // Fallback: if author is "Varios autores", first result is acceptable
            // when the title is very specific (≥4 words)
            if (
                /varios autores|anonimo|anónimo/i.test(book.author) &&
                results.length > 0 &&
                titleQ.split(/\s+/).length >= 4
            ) {
                match = results[0];
                break;
            }
        }
        if (match) {
            book.coverUrl = match.cover;
            found++;
            console.log(`✓ "${book.title}"`);
            console.log(`     → "${match.title}" by ${match.author}`);
        } else {
            stillMissing.push(book.title);
            console.log(`✗ "${book.title}"`);
        }
    }

    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\n=== Summary ===`);
    console.log(`Found ${found}/${targets.length} covers via Goodreads.`);
    if (stillMissing.length) {
        console.log(`Still missing:`);
        stillMissing.forEach((t) => console.log(`  - ${t}`));
    }
})();
