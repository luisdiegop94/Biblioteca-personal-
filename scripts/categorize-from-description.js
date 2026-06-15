#!/usr/bin/env node
// Para los libros sin categoría, infiere una basándose en palabras clave
// del título y la descripción. La mayoría de los pendientes son no-ficción
// anglosajona, así que las palabras clave están en inglés (y algunas en
// español por si acaso).
//
// Estrategia: cada regla otorga puntos a una categoría. Se asigna la
// categoría con mayor puntaje, siempre que pase el umbral mínimo. Si
// nadie pasa el umbral, queda sin categorizar.
//
// Las categorías elegidas deben coincidir con las que SHELF_RULES en
// js/lib-helpers.js reconoce, para que el libro caiga en un estante.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOKS_FILE = path.join(__dirname, "..", "js", "books.js");

// [regex, categoría, peso]
const RULES = [
    // === Especificidades primero ===
    [/\b(manga|manhwa|manhua)\b/i, "Manga", 5],
    [/\b(graphic novel|comic books?|comics? series)\b/i, "Cómic", 5],

    // Ficción de género
    [/\bscience fiction|sci.?fi|space opera|dystopi|cyberpunk|post.apocalyp/i, "Ciencia ficción", 4],
    [/\b(fantasy|wizards?|dragons?|sorcer(?:ess|er|y)|swords?\s*(?:and|&)\s*sorcery|epic fantasy|high fantasy|low fantasy)\b/i, "Fantasía", 4],
    [/\bmagic(?:al)?(?:\s+realism)?\b/i, "Fantasía", 2],
    [/\b(mythology|myths?\b|legend(?:ary|s)?|folklore|epic poem|gods? and heroes|trojan war|greek (?:gods|myth)|norse myth)\b/i, "Mitología", 4],
    [/\bmystery|detective|crime novel|murder mystery|whodunit|noir thriller|police procedural/i, "Misterio", 4],
    [/\bthriller(?:\b|s)/i, "Misterio", 2],
    [/\bhorror\b|gothic|paranormal|supernatural fiction/i, "Terror", 4],
    [/\bromance novel|love story|romantic comedy\b/i, "Romance", 4],
    [/\byoung adult\b|coming.of.age|teenage protagonist|teen novel|middle grade/i, "Novela juvenil", 4],
    [/\bchildren's (?:book|story|literature|classic)|picture book|fairy tale\b/i, "Novela juvenil", 3],
    [/\bshort stor(?:y|ies)|tales of\b|collection of stories|story collection|anthology of (?:fiction|stories)/i, "Cuentos", 3],
    [/\bpoetry|poems?(?:\s+collection|\s+anthology|\b)|verse novel/i, "Poesía", 4],
    [/\bcomedy of manners|tragicomedy|farce/i, "Novela", 2],

    // No-ficción narrativa
    [/\bmemoir|autobiograph(?:y|ical)|coming.of.age memoir|personal narrative|her\/his story|life writing/i, "Memorias", 4],
    [/\bbiograph(?:y|ical)\b|biography of|life and times of|life of/i, "Biografía", 3],
    [/\b(investigative journalism|investigative reporting|reportage)/i, "Crónica", 3],

    // Historia y política
    [/\b(history of|historical|ancient (?:rome|greece|egypt|civilization)|world history|military history|medieval|renaissance|enlightenment|cold war|world war|colonial)/i, "Historia", 3],
    [/\b(politic(?:s|al)|democrac(?:y|ies)|government|election|populism|authoritarian|fascis(?:m|t)|geopolitic|foreign policy|public policy|civil rights)/i, "Política", 3],
    [/\b(sociolog|social class|social science|inequality|race relations|class structure|gender studies)/i, "Sociología", 3],
    [/\b(anthropolog|ethnograph|indigenous people|hunter.gatherer|tribal society|cultural anthropology)/i, "Antropología", 3],

    // Economía y negocios
    [/\b(econom(?:y|ics?|ic theory)|capitalism|capital markets?|recession|monetary policy|inflation|microeconom|macroeconom)/i, "Economía", 3],
    [/\b(finance|financial|banking|wall street|investing|investment|portfolio|trading|hedge fund|stock market)/i, "Economía", 2],
    [/\b(business|entrepreneur(?:ship)?|startup|corporation|leadership|management|productivity|negotiation|marketing|sales|consulting|CEO|coach)/i, "Negocios", 3],

    // Psicología
    [/\b(psycholog|cognitive|behavioral|behavioural|cognition|emotion|emotional|therapy|trauma|self.esteem|mental health|attention deficit)/i, "Psicología", 3],
    [/\b(neurosc|brain|consciousness|neurolog|the (?:human )?brain)/i, "Neurociencia", 3],

    // Espiritualidad y autoayuda
    [/\b(religion|religious|christian|buddhism|buddhist|islam|hinduism|theolog(?:y|ical)|spiritualit|the soul|meditation|mindfulness|yoga\b|zen\b|prayer)/i, "Espiritualidad", 3],
    [/\b(self.?help|personal (?:growth|development)|habits?\b|self.improvement|life coaching|motivational|happiness|positive psychology)/i, "Autoayuda", 3],
    [/\b(stoic(?:ism)?|epictetus|seneca|marcus aurelius)/i, "Filosofía / Estoicismo", 4],
    [/\b(philosoph|existential|epistemolog|metaphysic|ethic(?:s|al)|moral philosophy|aesthetics|phenomenology|nietzsche|kant|hegel|wittgenstein|aristotle|plato)/i, "Filosofía", 3],

    // Ciencia
    [/\b(biolog|evolution|ecolog(?:y|ical)|natural history|botany|botanical|zoolog|wildlife|animal behavior|microbiom|genetic|dna\b|microbiolog|epidemiolog)/i, "Biología", 3],
    [/\b(physics|cosmolog|astronom(?:y|ical)|astrophysic|relativity|quantum|particle physics|black holes?|big bang|space exploration)/i, "Física", 3],
    [/\b(chemistry|chemical|biochem|organic chemistry)/i, "Química", 3],
    [/\b(math(?:ematic|s)|geometr|algebra|calculus|statistic|probabilit|number theory|computational)/i, "Matemáticas", 3],
    [/\b(popular science|science writing|the science of|science book|science journalism|natural sciences?)/i, "Divulgación científica", 2],
    [/\b(linguist|languages? and|language acquisition|grammar|etymolog|writing system)/i, "Lingüística", 3],

    // Tecnología
    [/\b(technology|tech industry|silicon valley|software|programming|engineer(?:ing)?|artificial intelligence|machine learning|deep learning|generative ai|chatgpt|llms?|computers? science|cybersecur|hacking)/i, "Tecnología", 3],

    // Arte
    [/\b(art history|painting|sculpture|design(?:er)?|architecture|aesthet|drawing|illustration|photography|graphic design|visual culture)/i, "Arte", 3],
    [/\b(music(?:ian|al)?|jazz\b|classical music|composer|orchestra|rock and roll|hip.hop|blues\b|country music)/i, "Música", 3],
    [/\b(film(?:making)?|cinema|movie|director|screenplay|hollywood|filmmakers)/i, "Cine", 3],

    // Gastronomía y vida cotidiana
    [/\b(cookbook|cooking|food (?:culture|history|writing|systems)|recipes?\b|gastronom|culinary|chef)/i, "Gastronomía", 3],
    [/\b(travel writing|travelogue|expedition|journey through|grand tour)/i, "Viajes", 3],
    [/\badventure (?:novel|story)|exploration narrative/i, "Aventura", 2],

    // Desarrollo y sostenibilidad
    [/\b(environment(?:al)?|climate change|sustainab|agricultur|food security|biodiversity|conservation|ecosystem|circular economy)/i, "Desarrollo y sostenibilidad", 3],
    [/\b(rural development|land use|peasant|smallholder|agrarian)/i, "Desarrollo rural", 3],

    // Literatura general (más débiles, solo si no hay nada mejor)
    [/\b(classic novel|classic literature|world literature|nineteenth.century novel|victorian novel)/i, "Novela clásica", 2],
    [/\b(novel|fiction|protagonist|narrator|characters|literary)/i, "Novela", 1],
    [/\b(essays?|reflections on|ruminations|meditations on|cultural criticism|polemic)/i, "Ensayo", 1],
    [/\b(non.?fiction)/i, null, 0],   // demasiado genérico
];

function categorize(book) {
    const blob = (book.title + " " + (book.description || ""))
        .toLowerCase()
        // hyphens and slashes mess with word boundaries
        .replace(/[-/]/g, " ");
    const scores = {};
    for (const [rx, cat, weight] of RULES) {
        if (!cat) continue;
        const matches = blob.match(rx);
        if (matches) scores[cat] = (scores[cat] || 0) + matches.length * weight;
    }
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return null;
    if (sorted[0][1] < 2) return null;   // umbral mínimo
    return sorted[0][0];
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

(function () {
    const books = loadBooks();
    const targets = books.filter((b) => !b.category);
    let assigned = 0;
    const counts = {};
    const missed = [];
    for (const b of targets) {
        const cat = categorize(b);
        if (cat) {
            b.category = cat;
            assigned++;
            counts[cat] = (counts[cat] || 0) + 1;
        } else {
            missed.push(b.title);
        }
    }
    fs.writeFileSync(BOOKS_FILE, serialize(books), "utf8");
    console.log(`Asignadas: ${assigned}/${targets.length}`);
    console.log(`Sin categoría: ${missed.length}`);
    console.log("\nDistribución de las nuevas:");
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
        console.log(`  ${String(n).padStart(4)}  ${cat}`);
    });
    if (missed.length) {
        console.log(`\nSin categoría (${missed.length}):`);
        missed.slice(0, 60).forEach(t => console.log("  - " + t));
        if (missed.length > 60) console.log(`  … y ${missed.length - 60} más`);
    }
})();
