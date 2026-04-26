#!/usr/bin/env node
// Final pass: apply manually verified cover IDs and remove confirmed
// wrong cover assignments. Each entry is checked against Open Library
// before being added to this map.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

// Confirmed correct cover IDs (verified against openlibrary.org)
const setIds = {
    "El arte de no ser gobernados": 6289268, // The Art of Not Being Governed by James C. Scott
    "La guerra no tiene rostro de mujer": 13135723, // У войны не женское лицо by Светлана Алексиевич
    "One Piece, vols. 1-2-3 (East Blue)": 1020563, // ONE PIECE 1
    "One Piece, vols. 4-5-6 (East Blue)": 9485994, // ONE PIECE 4
    "One Piece, vols. 7-8-9 (East Blue)": 1020569, // ONE PIECE 7
    "One Piece, vols. 10-11-12 (East Blue)": 1020698, // ONE PIECE 10
    "One Piece, vols. 13-14-15 (Baroque Works)": 3122735, // ONE PIECE 13
    "One Piece, vols. 16-17-18 (Baroque Works)": 1020703 // ONE PIECE 16
};

// Confirmed wrong (no good match found in OL — fall back to placeholder)
const removeFor = new Set([
    "Si mi biblioteca ardiera esta noche", // was Vargas Llosa's "La verdad de las mentiras"
    "80 Tools for Participatory Development", // was a random Chinese book
    "How AI Will Change Your Life" // was Frankenstein
]);

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

const books = loadBooks();
let set = 0;
let removed = 0;
for (const b of books) {
    if (setIds[b.title]) {
        b.coverId = setIds[b.title];
        set++;
    }
    if (removeFor.has(b.title)) {
        delete b.coverId;
        removed++;
    }
}
fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
const total = books.filter((b) => b.coverId || b.coverUrl).length;
console.log(`Set ${set} cover IDs, removed ${removed} wrong ones.`);
console.log(`Total: ${total}/${books.length} have covers.`);
