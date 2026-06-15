#!/usr/bin/env node
// Pull book descriptions from Open Library and save under `description`.
// Strategy:
//   1. Title+author search → first verified doc (author overlap ≥ 0.4)
//   2. Fetch /works/OLxxx.json → description (string or {value})
//   3. Strip OL footnote markers like "([source][1])"
// Saves every 25 entries so a crash doesn't lose progress.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripD = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripD(String(s || "")).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

function authorOverlap(a, b) {
    if (!a || !b) return 0;
    const wa = norm(a).split(" ").filter((w) => w.length >= 4);
    const wb = norm(b).split(" ").filter((w) => w.length >= 4);
    if (!wa.length || !wb.length) return 0;
    let m = 0;
    for (const x of wa) for (const y of wb) if (x === y) { m++; break; }
    return m / Math.max(wa.length, wb.length);
}

async function findWorkKey(book) {
    const queries = [
        { title: book.title, author: book.author },
        { title: book.title.split(":")[0].trim(), author: book.author },
        { title: book.title },
    ];
    for (const q of queries) {
        const p = new URLSearchParams({ ...q, limit: "8",
            fields: "key,title,author_name,language,first_publish_year" });
        const r = await fetch(`https://openlibrary.org/search.json?${p}`, {
            headers: { "User-Agent": "biblioteca-personal/1.0" }
        });
        if (!r.ok) continue;
        const d = await r.json();
        const docs = d.docs || [];
        if (!docs.length) { await sleep(150); continue; }
        const verified = docs.find(x => {
            const au = (x.author_name || []).join(" ");
            return authorOverlap(book.author, au) >= 0.4;
        }) || (book.author === "Varios autores" ? docs[0] : null);
        if (verified?.key) return verified.key;
        await sleep(150);
    }
    return null;
}

async function fetchDescription(workKey) {
    const r = await fetch(`https://openlibrary.org${workKey}.json`, {
        headers: { "User-Agent": "biblioteca-personal/1.0" }
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.description) return null;
    const raw = typeof d.description === "string" ? d.description : d.description.value;
    if (!raw) return null;
    return cleanDescription(raw);
}

function cleanDescription(s) {
    return s
        .replace(/\(\[source\]\[\d+\]\)/g, "")
        .replace(/\[(\d+)\]:[^\n]+/g, "")
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\s+|\s+$/g, "")
        .replace(/^----+\n*/m, "")
        .slice(0, 1200);
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

(async () => {
    const books = loadBooks();
    const targets = books.filter((b) => !b.description);
    console.log(`Buscando descripciones para ${targets.length} libros...\n`);

    let added = 0, missed = 0;
    let i = 0;
    for (const b of targets) {
        i++;
        try {
            const key = await findWorkKey(b);
            await sleep(220);
            if (!key) {
                missed++;
                if (i % 10 === 0 || i === targets.length) process.stdout.write(`[${i}/${targets.length}] ${added}/${i} OK\n`);
                continue;
            }
            const desc = await fetchDescription(key);
            await sleep(220);
            if (desc) {
                b.description = desc;
                added++;
            } else {
                missed++;
            }
            if (i % 10 === 0 || i === targets.length) process.stdout.write(`[${i}/${targets.length}] ${added}/${i} OK\n`);
        } catch (e) {
            missed++;
        }
        if (i % 25 === 0) {
            fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
        }
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`\n=== Resumen ===`);
    console.log(`Añadidas: ${added}/${targets.length}`);
    console.log(`Sin descripción: ${missed}`);
})();
