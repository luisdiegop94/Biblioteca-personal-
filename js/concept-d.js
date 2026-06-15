/* global React, LibLib */
// Concept D: hybrid — A's editorial masthead + C's sidebar layout + B's vitrina shelves.
const {
  useState: useStateD,
  useMemo: useMemoD
} = React;
const LD = window.LibLib;
const DOW_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function todayParts() {
  const d = new Date();
  return {
    dow: DOW_ES[d.getDay()],
    num: d.getDate(),
    monYear: `de ${MONTH_ES[d.getMonth()]}, ${d.getFullYear()}`
  };
}
function shadeD(hex, pct) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  let r = n >> 16 & 0xff,
    g = n >> 8 & 0xff,
    b = n & 0xff;
  const f = pct / 100;
  r = Math.max(0, Math.min(255, Math.round(r + r * f)));
  g = Math.max(0, Math.min(255, Math.round(g + g * f)));
  b = Math.max(0, Math.min(255, Math.round(b + b * f)));
  return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
}
function CoverD({
  book,
  size
}) {
  const url = LD.coverUrlFor(book, size === "L" ? "L" : "M");
  const colors = LD.spineColors(book);
  const [err, setErr] = useStateD(false);
  if (!url || err) {
    return /*#__PURE__*/React.createElement("div", {
      className: "d-cover-fb",
      style: {
        background: `linear-gradient(160deg, ${colors.bg}, ${shadeD(colors.bg, -25)})`,
        color: colors.ink
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "d-cover-fb-band",
      style: {
        background: colors.accent
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "d-cover-fb-title"
    }, book.title), /*#__PURE__*/React.createElement("div", {
      className: "d-cover-fb-author",
      style: {
        color: colors.accent
      }
    }, book.author));
  }
  return /*#__PURE__*/React.createElement("img", {
    className: "d-cover-img",
    src: url,
    alt: book.title,
    loading: "lazy",
    onError: () => setErr(true)
  });
}
function SpineD({
  book,
  onSelect
}) {
  const colors = LD.spineColors(book);
  const w = LD.spineWidth(book);
  const h = LD.spineHeight(book);
  return /*#__PURE__*/React.createElement("button", {
    className: "d-spine",
    style: {
      width: w,
      height: h,
      background: `linear-gradient(90deg, ${colors.bg}, ${shadeD(colors.bg, 8)} 50%, ${colors.bg})`,
      color: colors.ink
    },
    onClick: () => onSelect(book),
    "aria-label": book.title
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-spine-band",
    style: {
      background: colors.accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "d-spine-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-spine-title"
  }, book.title), /*#__PURE__*/React.createElement("div", {
    className: "d-spine-author",
    style: {
      color: colors.accent
    }
  }, book.author)));
}
function CardD({
  book,
  onSelect,
  isSelected
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "d-card " + (isSelected ? "is-selected" : ""),
    onClick: () => onSelect(book)
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-card-cover"
  }, /*#__PURE__*/React.createElement(CoverD, {
    book: book,
    size: "M"
  }), book.status === "reading" && /*#__PURE__*/React.createElement("div", {
    className: "d-card-bookmark"
  })), /*#__PURE__*/React.createElement("div", {
    className: "d-card-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-card-title"
  }, book.title), /*#__PURE__*/React.createElement("div", {
    className: "d-card-author"
  }, book.author), book.rating && /*#__PURE__*/React.createElement("div", {
    className: "d-card-rating"
  }, "★".repeat(book.rating), /*#__PURE__*/React.createElement("span", {
    className: "d-card-empty"
  }, "★".repeat(5 - book.rating)))));
}
function ShelfD({
  title,
  books,
  onSelect,
  selected,
  view,
  idx,
  collapsed,
  onToggle
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "d-shelf " + (collapsed ? "is-collapsed" : "")
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "d-shelf-tag",
    onClick: onToggle,
    "aria-expanded": !collapsed
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-tag-num"
  }, "N.\xBA ", String(idx).padStart(2, "0")), /*#__PURE__*/React.createElement("h3", {
    className: "d-shelf-tag-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-tag-count"
  }, books.length, " libros"), /*#__PURE__*/React.createElement("span", {
    className: "d-shelf-tag-arrow",
    "aria-hidden": "true"
  }, "\u25BE")), !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-display " + (view === "spine" ? "is-spine" : "is-cover")
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-back"
  }), /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-books"
  }, view === "spine" ? books.map((b, i) => /*#__PURE__*/React.createElement(SpineD, {
    key: i,
    book: b,
    onSelect: onSelect
  })) : books.map((b, i) => /*#__PURE__*/React.createElement(CardD, {
    key: i,
    book: b,
    onSelect: onSelect,
    isSelected: selected === b
  }))), /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-plank"
  })));
}
function DetailD({
  book,
  onClose
}) {
  if (!book) return null;
  const colors = LD.spineColors(book);
  return /*#__PURE__*/React.createElement("div", {
    className: "d-detail-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-detail-wrap",
    onClick: e => e.stopPropagation(),
    style: {
      "--accent": colors.accent
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "d-detail-close",
    onClick: onClose
  }, "\xD7"), /*#__PURE__*/React.createElement("div", {
    className: "d-detail-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-detail-cover"
  }, /*#__PURE__*/React.createElement(CoverD, {
    book: book,
    size: "M"
  })), /*#__PURE__*/React.createElement("div", {
    className: "d-detail-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-detail-eyebrow"
  }, book.category || "Sin categoría"), /*#__PURE__*/React.createElement("h2", {
    className: "d-detail-title"
  }, book.title), /*#__PURE__*/React.createElement("div", {
    className: "d-detail-author"
  }, "por ", book.author), /*#__PURE__*/React.createElement("div", {
    className: "d-detail-tags"
  }, book.status && /*#__PURE__*/React.createElement("span", {
    className: "d-tag d-tag-" + book.status
  }, LD.STATUS_LABELS[book.status]), book.owned === false ? /*#__PURE__*/React.createElement("span", {
    className: "d-tag d-tag-out"
  }, "Le\xEDdo sin tener") : /*#__PURE__*/React.createElement("span", {
    className: "d-tag d-tag-out"
  }, "En la biblioteca")), book.rating && /*#__PURE__*/React.createElement("div", {
    className: "d-detail-stars"
  }, [1, 2, 3, 4, 5].map(i => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "d-big-star " + (i <= book.rating ? "on" : "")
  }, "\u2605"))), book.description && /*#__PURE__*/React.createElement("p", {
    className: "d-detail-desc"
  }, book.description, book.descriptionAi && /*#__PURE__*/React.createElement("span", {
    className: "d-detail-ai"
  }, " \u00b7 ", /*#__PURE__*/React.createElement("em", null, "Descripci\u00f3n generada con IA"))), /*#__PURE__*/React.createElement("p", {
    className: "d-detail-note"
  }, "Reposando en el estante de ", /*#__PURE__*/React.createElement("em", null, LD.shelfFor(book)), ".")))));
}
function StatsPanelD({
  books,
  onSelectBook
}) {
  const stats = LD.computeStats(books);
  const owned = books.filter(b => b.owned !== false);
  const readOnly = books.filter(b => b.owned === false);

  // Rating histogram (5..1)
  const ratingHist = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: books.filter(b => b.rating === r).length
  }));
  const maxRating = Math.max(1, ...ratingHist.map(r => r.count));

  // Top shelves (extended to 12)
  const shelfCounts = {};
  owned.forEach(b => {
    const s = LD.shelfFor(b);
    shelfCounts[s] = (shelfCounts[s] || 0) + 1;
  });
  const topShelves = Object.entries(shelfCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxShelf = topShelves.length ? topShelves[0][1] : 1;

  // Top authors among owned
  const authorCounts = {};
  owned.forEach(b => {
    authorCounts[b.author] = (authorCounts[b.author] || 0) + 1;
  });
  const topAuthors = Object.entries(authorCounts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return /*#__PURE__*/React.createElement("div", {
    className: "d-stats-panel"
  }, /*#__PURE__*/React.createElement("header", {
    className: "d-stats-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-eyebrow"
  }, "Resumen editorial"), /*#__PURE__*/React.createElement("h2", {
    className: "d-stats-h"
  }, "El estado de la biblioteca"), /*#__PURE__*/React.createElement("p", {
    className: "d-stats-sub"
  }, "Una colecci\xF3n de ", stats.total, " vol\xFAmenes \u2014 ", stats.owned, " en estanter\xEDa, ", readOnly.length, " le\xEDdos sin tener.")), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card d-stats-card-wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num d-stats-num-xl"
  }, stats.total), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-cap"
  }, "vol\xFAmenes registrados")), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "En la biblioteca"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num"
  }, stats.owned)), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Le\xEDdos sin tener"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num"
  }, readOnly.length)), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Calificaci\xF3n promedio"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num"
  }, stats.avgRating.toFixed(2)), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-cap"
  }, "de cinco estrellas")), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Le\xEDdos"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num",
    style: {
      color: "#6b7a3a"
    }
  }, stats.read)), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Leyendo"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num",
    style: {
      color: "#b8593a"
    }
  }, stats.reading)), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-stats-label"
  }, "Por leer"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-num",
    style: {
      color: "#7a6b54"
    }
  }, stats.toRead))), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-cols"
  }, /*#__PURE__*/React.createElement("section", {
    className: "d-stats-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "d-stats-h3"
  }, "Distribuci\xF3n por calificaci\xF3n"), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-rating-hist"
  }, ratingHist.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.rating,
    className: "d-stats-rating-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-stats-rating-stars"
  }, "★".repeat(r.rating), "★".repeat(5 - r.rating).replace(/./g, "·")), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-rating-bar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: r.count / maxRating * 100 + "%"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "d-stats-rating-count"
  }, r.count))))), /*#__PURE__*/React.createElement("section", {
    className: "d-stats-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "d-stats-h3"
  }, "Estantes principales"), /*#__PURE__*/React.createElement("ol", {
    className: "d-stats-shelflist"
  }, topShelves.map(([name, c]) => /*#__PURE__*/React.createElement("li", {
    key: name
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-stats-shelflist-name"
  }, name), /*#__PURE__*/React.createElement("div", {
    className: "d-stats-shelflist-bar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: c / maxShelf * 100 + "%"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "d-stats-shelflist-count"
  }, c)))))), topAuthors.length > 0 && /*#__PURE__*/React.createElement("section", {
    className: "d-stats-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "d-stats-h3"
  }, "Autores con m\xE1s vol\xFAmenes"), /*#__PURE__*/React.createElement("ul", {
    className: "d-stats-authors"
  }, topAuthors.map(([name, n]) => /*#__PURE__*/React.createElement("li", {
    key: name
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-stats-author-name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: "d-stats-author-count"
  }, n))))));
}
const SECTION_META = {
  library: {
    label: "Estantes",
    empty: "No hay libros en tu biblioteca."
  },
  readonly: {
    label: "Leídos sin tener",
    empty: "No has marcado libros como leídos sin tener."
  },
  toread: {
    label: "Por leer",
    empty: "No tienes libros marcados como “por leer”."
  },
  stats: {
    label: "Estadísticas",
    empty: ""
  }
};
function ConceptD({
  books
}) {
  const [section, setSection] = useStateD("library");
  const [organize, setOrganize] = useStateD("shelf");
  const [view, setView] = useStateD("cover");
  const [query, setQuery] = useStateD("");
  const [selected, setSelected] = useStateD(null);
  const [sideOpen, setSideOpen] = useStateD(false);
  const [collapsed, setCollapsed] = useStateD(new Set());
  const [userTouchedCollapse, setUserTouchedCollapse] = useStateD(false);
  const isMobile = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  const toggleShelf = name => {
    setUserTouchedCollapse(true);
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);else next.add(name);
      return next;
    });
  };
  const collapseAll = names => { setUserTouchedCollapse(true); setCollapsed(new Set(names)); };
  const expandAll = () => { setUserTouchedCollapse(true); setCollapsed(new Set()); };
  const owned = useMemoD(() => books.filter(b => b.owned !== false), [books]);
  const readOnly = useMemoD(() => books.filter(b => b.owned === false), [books]);
  const toRead = useMemoD(() => books.filter(b => b.status === "to-read"), [books]);
  const stats = useMemoD(() => LD.computeStats(books), [books]);
  const sectionBooks = useMemoD(() => {
    if (section === "readonly") return readOnly;
    if (section === "toread") return toRead;
    return owned;
  }, [section, owned, readOnly, toRead]);
  const filtered = useMemoD(() => sectionBooks.filter(b => LD.matches(b, query)), [sectionBooks, query]);
  const grouped = useMemoD(() => LD.groupBooks(filtered, organize), [filtered, organize]);
  // On mobile, start with every shelf collapsed for performance.
  const effectiveCollapsed = useMemoD(
    () => !userTouchedCollapse && isMobile ? new Set(grouped.map(([n]) => n)) : collapsed,
    [userTouchedCollapse, isMobile, collapsed, grouped]
  );
  const today = todayParts();
  const isStats = section === "stats";
  const tagline = section === "library" ? `Tu biblioteca: ${owned.length} volúmenes — leídos, leyéndose, esperando turno.` : section === "readonly" ? `${readOnly.length} libros que has leído pero no están en la estantería.` : section === "toread" ? `${toRead.length} libros marcados como pendientes de lectura.` : `Vista panorámica de la colección completa (${stats.total} volúmenes).`;
  return /*#__PURE__*/React.createElement("div", {
    className: "d-app"
  }, /*#__PURE__*/React.createElement("header", {
    className: "d-masthead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-mast-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-mast-marque"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "d-side-btn",
    onClick: () => setSideOpen(o => !o),
    "aria-label": sideOpen ? "Ocultar resumen" : "Mostrar resumen",
    "aria-pressed": sideOpen
  }, sideOpen ? "◧" : "◨"), "Catalogus"), /*#__PURE__*/React.createElement("nav", {
    className: "d-mast-nav"
  }, Object.entries(SECTION_META).map(([k, m]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "d-mast-nav-btn " + (section === k ? "is-active" : ""),
    onClick: () => setSection(k)
  }, m.label)))), /*#__PURE__*/React.createElement("div", {
    className: "d-mast-mid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "d-mast-title"
  }, "La Biblioteca"), /*#__PURE__*/React.createElement("p", {
    className: "d-mast-tagline"
  }, tagline)), /*#__PURE__*/React.createElement("div", {
    className: "d-mast-date"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-date-dow"
  }, today.dow), /*#__PURE__*/React.createElement("div", {
    className: "d-date-num"
  }, today.num), /*#__PURE__*/React.createElement("div", {
    className: "d-date-mon"
  }, today.monYear)))), /*#__PURE__*/React.createElement("div", {
    className: "d-layout " + (sideOpen ? "side-open" : "side-closed")
  }, /*#__PURE__*/React.createElement("button", {
    className: "d-side-toggle " + (sideOpen ? "is-open" : ""),
    onClick: () => setSideOpen(o => !o)
  }, /*#__PURE__*/React.createElement("span", null, "Estad\xEDsticas y resumen"), /*#__PURE__*/React.createElement("span", {
    className: "d-side-toggle-stats"
  }, stats.total, " vol\xFAmenes"), /*#__PURE__*/React.createElement("span", {
    className: "d-side-toggle-arrow"
  }, "\u25BE")), /*#__PURE__*/React.createElement("aside", {
    className: "d-side " + (sideOpen ? "is-open" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-h"
  }, "Composici\xF3n"), /*#__PURE__*/React.createElement("div", {
    className: "d-bignum"
  }, stats.total), /*#__PURE__*/React.createElement("div", {
    className: "d-side-cap"
  }, "vol\xFAmenes registrados"), /*#__PURE__*/React.createElement("div", {
    className: "d-side-mini"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, stats.owned), " en biblioteca"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, stats.total - stats.owned), " le\xEDdos sin tener"))), /*#__PURE__*/React.createElement("div", {
    className: "d-side-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-h"
  }, "Estado de lectura"), /*#__PURE__*/React.createElement("div", {
    className: "d-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-bar-seg",
    style: {
      flex: stats.read,
      background: "#6b7a3a"
    },
    title: "Le\xEDdos"
  }), /*#__PURE__*/React.createElement("div", {
    className: "d-bar-seg",
    style: {
      flex: stats.reading,
      background: "#b8593a"
    },
    title: "Leyendo"
  }), /*#__PURE__*/React.createElement("div", {
    className: "d-bar-seg",
    style: {
      flex: stats.toRead,
      background: "#7a6b54"
    },
    title: "Por leer"
  })), /*#__PURE__*/React.createElement("div", {
    className: "d-bar-legend"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: "#6b7a3a"
    }
  }), " Le\xEDdos \xB7 ", /*#__PURE__*/React.createElement("b", null, stats.read)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: "#b8593a"
    }
  }), " Leyendo \xB7 ", /*#__PURE__*/React.createElement("b", null, stats.reading)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: "#7a6b54"
    }
  }), " Por leer \xB7 ", /*#__PURE__*/React.createElement("b", null, stats.toRead)))), /*#__PURE__*/React.createElement("div", {
    className: "d-side-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-h"
  }, "Calificaci\xF3n promedio"), /*#__PURE__*/React.createElement("div", {
    className: "d-bignum"
  }, stats.avgRating.toFixed(2)), /*#__PURE__*/React.createElement("div", {
    className: "d-side-cap"
  }, "de cinco estrellas")), /*#__PURE__*/React.createElement("div", {
    className: "d-side-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-h"
  }, "Estantes principales"), /*#__PURE__*/React.createElement("ol", {
    className: "d-top-list"
  }, stats.topShelves.map(([n, c]) => /*#__PURE__*/React.createElement("li", {
    key: n
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-top-name"
  }, n), /*#__PURE__*/React.createElement("span", {
    className: "d-top-count"
  }, c)))))), /*#__PURE__*/React.createElement("main", {
    className: "d-main"
  }, !isStats && /*#__PURE__*/React.createElement("div", {
    className: "d-toolbar"
  }, /*#__PURE__*/React.createElement("input", {
    className: "d-search",
    placeholder: "\uD83D\uDD0D  Buscar t\xEDtulo o autor",
    value: query,
    onChange: e => setQuery(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    className: "d-toolbar-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-toolbar-label"
  }, "Organizar"), [["shelf", "Categoría"], ["status", "Estado"], ["rating", "Calificación"], ["author", "Autor"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "d-chip " + (organize === k ? "is-on" : ""),
    onClick: () => setOrganize(k)
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "d-toolbar-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "d-toolbar-label"
  }, "Vista"), /*#__PURE__*/React.createElement("button", {
    className: "d-chip " + (view === "cover" ? "is-on" : ""),
    onClick: () => setView("cover")
  }, "Portadas"), /*#__PURE__*/React.createElement("button", {
    className: "d-chip " + (view === "spine" ? "is-on" : ""),
    onClick: () => setView("spine")
  }, "Lomos")), /*#__PURE__*/React.createElement("div", {
    className: "d-toolbar-group"
  }, /*#__PURE__*/React.createElement("button", {
    className: "d-chip",
    onClick: () => effectiveCollapsed.size === grouped.length ? expandAll() : collapseAll(grouped.map(([n]) => n))
  }, effectiveCollapsed.size === grouped.length && grouped.length > 0 ? "Expandir todo" : "Contraer todo"))), isStats ? /*#__PURE__*/React.createElement(StatsPanelD, {
    books: books,
    onSelectBook: setSelected
  }) : grouped.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "d-empty"
  }, SECTION_META[section].empty) : /*#__PURE__*/React.createElement("div", {
    className: "d-shelves"
  }, grouped.map(([name, list], i) => /*#__PURE__*/React.createElement(ShelfD, {
    key: name,
    title: name,
    books: list,
    view: view,
    onSelect: setSelected,
    selected: selected,
    idx: i + 1,
    collapsed: effectiveCollapsed.has(name),
    onToggle: () => toggleShelf(name)
  }))))), /*#__PURE__*/React.createElement(DetailD, {
    book: selected,
    onClose: () => setSelected(null)
  }));
}
window.ConceptD = ConceptD;