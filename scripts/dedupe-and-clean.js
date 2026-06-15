#!/usr/bin/env node
// Detecta entradas duplicadas en js/books.js por (title, author) normalizados,
// limpia espacios sobrantes en autores, decodifica entidades HTML y arregla
// títulos con paréntesis abandonados ("Edition)").

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

const stripD = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripD(String(s || "")).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

function decodeEntities(s) {
    return String(s || "")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
}

function cleanWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
}

function fixOrphanParen(s) {
    // Casos como "X Edition)" sin "(": tira el paréntesis colgado.
    const opens = (s.match(/\(/g) || []).length;
    const closes = (s.match(/\)/g) || []).length;
    if (closes > opens) {
        return s.replace(/\s*\)\s*$/, "").trim();
    }
    return s;
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

function richness(b) {
    // Cuál entrada conservar cuando hay duplicados: la más completa.
    let r = 0;
    if (b.coverId || b.coverUrl) r += 3;
    if (b.category) r += 2;
    if (b.description) r += 2;
    if (b.status) r += 1;
    if (b.rating) r += 1;
    if (b.descriptionAi) r += 0.5;
    return r;
}

function mergeInto(target, source) {
    // Conserva campos no vacíos del source si target no los tiene.
    if (!target.coverId && source.coverId) target.coverId = source.coverId;
    if (!target.coverUrl && source.coverUrl) target.coverUrl = source.coverUrl;
    if (!target.category && source.category) target.category = source.category;
    if (!target.description && source.description) {
        target.description = source.description;
        if (source.descriptionAi) target.descriptionAi = true;
    }
    if (!target.status && source.status) target.status = source.status;
    if (!target.rating && source.rating) target.rating = source.rating;
}

(function () {
    const books = loadBooks();
    let cleanedTitle = 0, cleanedAuthor = 0;

    for (const b of books) {
        const t0 = b.title;
        const a0 = b.author;
        b.title = fixOrphanParen(cleanWhitespace(decodeEntities(b.title)));
        b.author = cleanWhitespace(decodeEntities(b.author));
        if (b.title !== t0) cleanedTitle++;
        if (b.author !== a0) cleanedAuthor++;
    }

    // Dedupe por (title|author) normalizados.
    const byKey = new Map();
    for (const b of books) {
        const key = norm(b.title) + "|" + norm(b.author);
        if (!byKey.has(key)) {
            byKey.set(key, b);
        } else {
            const winner = byKey.get(key);
            const r1 = richness(winner), r2 = richness(b);
            if (r2 > r1) {
                mergeInto(b, winner);
                byKey.set(key, b);
            } else {
                mergeInto(winner, b);
            }
        }
    }
    const deduped = Array.from(byKey.values());
    const removed = books.length - deduped.length;

    fs.writeFileSync(BOOKS_FILE, serialize(deduped), "utf8");
    console.log(`Títulos limpiados: ${cleanedTitle}`);
    console.log(`Autores limpiados: ${cleanedAuthor}`);
    console.log(`Duplicados eliminados: ${removed}`);
    console.log(`Total después: ${deduped.length}`);
})();
