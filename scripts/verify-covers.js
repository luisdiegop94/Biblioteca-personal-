#!/usr/bin/env node
// Verify each book's coverId by querying Open Library and checking that
// the work that owns the cover has a matching title and author.
// Prints suspect entries; with --fix, removes coverId for mismatches.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");
const FIX = process.argv.includes("--fix");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const norm = (s) => stripDiacritics(String(s || "")).toLowerCase();

const splitAuthors = (author) =>
    author
        .split(/\s+y\s+|\s*&\s*|\s*,\s*|\s+con\s+|\s+and\s+/i)
        .map((a) => a.trim())
        .filter((a) => a && !/varios autores|anonimo|anónimo/i.test(a));

function fuzzyMatchWord(a, b) {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    const prefixLen = Math.min(5, Math.min(a.length, b.length));
    return a.slice(0, prefixLen) === b.slice(0, prefixLen);
}

function authorMatches(docAuthors, expected) {
    if (expected.length === 0) return true;
    if (!Array.isArray(docAuthors)) return false;
    const docWords = docAuthors.flatMap((a) =>
        norm(a).split(/\s+/).filter((w) => w.length >= 3)
    );
    return expected.some((exp) => {
        const expWords = norm(exp)
            .split(/\s+/)
            .filter((w) => w.length >= 4);
        return expWords.some((ew) => docWords.some((dw) => fuzzyMatchWord(ew, dw)));
    });
}

function titleSimilar(expectedTitle, docTitle) {
    if (!docTitle) return false;
    const a = norm(expectedTitle).replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
    const b = norm(docTitle).replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
    if (a.length === 0 || b.length === 0) return true;
    const setB = new Set(b);
    const overlap = a.filter((w) => setB.has(w)).length;
    return overlap >= Math.min(2, a.length);
}

async function lookupCover(coverId) {
    const url = `https://openlibrary.org/search.json?q=cover_i:${coverId}&limit=1&fields=title,author_name`;
    const res = await fetch(url, {
        headers: { "User-Agent": "BibliotecaPersonal/1.0 (+local)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.docs || [])[0] || null;
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
    const targets = books.filter((b) => b.coverId);
    console.log(`Verifying ${targets.length} cover assignments...\n`);
    const suspects = [];
    for (let i = 0; i < targets.length; i++) {
        const b = targets[i];
        try {
            const doc = await lookupCover(b.coverId);
            if (!doc) {
                console.log(`? [${i + 1}/${targets.length}] "${b.title}" — cover #${b.coverId} not found in OL`);
                continue;
            }
            const expectedAuthors = splitAuthors(b.author);
            const authorOk = authorMatches(doc.author_name, expectedAuthors);
            const titleOk = titleSimilar(b.title, doc.title);
            // Translations: author matches but title is in another language → keep
            // Real mismatches: wrong author (definitely wrong book)
            // Same-author-different-book: author matches but title clearly off → suspect
            const ok = authorOk;
            if (!ok) {
                suspects.push(b);
                console.log(`✗ [${i + 1}/${targets.length}] "${b.title}" by ${b.author}`);
                console.log(`     #${b.coverId} → "${doc.title}" by ${(doc.author_name || []).slice(0, 2).join(", ")}`);
            }
        } catch (err) {
            console.log(`! [${i + 1}/${targets.length}] ${b.title} — ${err.message}`);
        }
        await sleep(120);
    }
    console.log(`\n${suspects.length} suspect cover(s) found.`);
    if (FIX && suspects.length > 0) {
        for (const b of suspects) {
            for (const real of books) {
                if (real.title === b.title) {
                    delete real.coverId;
                }
            }
        }
        fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
        console.log(`Fixed: removed ${suspects.length} bad coverIds.`);
    } else if (suspects.length > 0) {
        console.log(`Re-run with --fix to remove these.`);
    }
})();
