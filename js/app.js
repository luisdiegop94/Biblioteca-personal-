(function () {
    "use strict";

    const palette = [
        "#8b3a2f", "#2c5f7f", "#4a6741", "#7d3c4a", "#5d4a7c",
        "#a05a2c", "#3a6b6b", "#7c5e3a", "#5e3a5e", "#2f4858",
        "#8b5a2b", "#4a3a7c", "#6b3a3a", "#3a7c5e", "#7c6b3a"
    ];

    const searchInput = document.getElementById("search-input");
    const filterBy = document.getElementById("filter-by");
    const sortBy = document.getElementById("sort-by");
    const grid = document.getElementById("book-grid");
    const emptyState = document.getElementById("empty-state");
    const resultsCount = document.getElementById("results-count");
    const totalCount = document.getElementById("total-count");

    const colorFor = (key) => {
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = (hash * 31 + key.charCodeAt(i)) | 0;
        }
        return palette[Math.abs(hash) % palette.length];
    };

    const normalize = (str) =>
        str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const escapeHtml = (str) =>
        str.replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));

    const highlight = (text, query) => {
        const safe = escapeHtml(text);
        if (!query) return safe;
        const normText = normalize(text);
        const normQuery = normalize(query);
        const idx = normText.indexOf(normQuery);
        if (idx === -1) return safe;
        const start = idx;
        const end = idx + normQuery.length;
        return (
            escapeHtml(text.slice(0, start)) +
            "<mark>" + escapeHtml(text.slice(start, end)) + "</mark>" +
            escapeHtml(text.slice(end))
        );
    };

    const matches = (book, query, mode) => {
        if (!query) return true;
        const q = normalize(query);
        const inTitle = normalize(book.title).includes(q);
        const inAuthor = normalize(book.author).includes(q);
        if (mode === "title") return inTitle;
        if (mode === "author") return inAuthor;
        return inTitle || inAuthor;
    };

    const sortBooks = (list, mode) => {
        const sorted = [...list];
        const compare = (a, b) =>
            normalize(a).localeCompare(normalize(b), "es");
        sorted.sort((a, b) => {
            switch (mode) {
                case "title-desc": return compare(b.title, a.title);
                case "author-asc": return compare(a.author, b.author) || compare(a.title, b.title);
                case "author-desc": return compare(b.author, a.author) || compare(a.title, b.title);
                case "title-asc":
                default: return compare(a.title, b.title);
            }
        });
        return sorted;
    };

    const render = () => {
        const query = searchInput.value.trim();
        const mode = filterBy.value;
        const sortMode = sortBy.value;

        const filtered = books.filter((b) => matches(b, query, mode));
        const sorted = sortBooks(filtered, sortMode);

        grid.innerHTML = "";
        if (sorted.length === 0) {
            emptyState.hidden = false;
            resultsCount.textContent = `0 libros encontrados`;
            return;
        }
        emptyState.hidden = true;
        resultsCount.textContent =
            sorted.length === books.length
                ? `Mostrando todos los libros (${books.length})`
                : `${sorted.length} ${sorted.length === 1 ? "libro encontrado" : "libros encontrados"}`;

        const fragment = document.createDocumentFragment();
        for (const book of sorted) {
            const showTitleHighlight = mode !== "author";
            const showAuthorHighlight = mode !== "title";
            const card = document.createElement("article");
            card.className = "book-card";
            const coverSrc = book.coverId
                ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
                : book.coverUrl || null;
            const coverInner = coverSrc
                ? `<img class="book-cover-img" src="${escapeHtml(coverSrc)}" alt="Portada de ${escapeHtml(book.title)}" loading="lazy" onerror="this.parentElement.classList.add('cover-fallback');this.remove();">
                   <span class="book-cover-fallback-title">${escapeHtml(book.title)}</span>`
                : `<span class="book-cover-fallback-title">${escapeHtml(book.title)}</span>`;
            card.innerHTML = `
                <div class="book-cover ${coverSrc ? '' : 'cover-fallback'}" style="background-color: ${colorFor(book.title)};">
                    ${coverInner}
                </div>
                <div class="book-info">
                    <h2 class="book-title">${showTitleHighlight ? highlight(book.title, query) : escapeHtml(book.title)}</h2>
                    <p class="book-author">${showAuthorHighlight ? highlight(book.author, query) : escapeHtml(book.author)}</p>
                    ${book.category ? `<p class="book-meta">${escapeHtml(book.category)}</p>` : ""}
                </div>
            `;
            fragment.appendChild(card);
        }
        grid.appendChild(fragment);
    };

    let debounceTimer;
    const debouncedRender = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 120);
    };

    searchInput.addEventListener("input", debouncedRender);
    filterBy.addEventListener("change", render);
    sortBy.addEventListener("change", render);

    totalCount.textContent = books.length;
    render();
})();
