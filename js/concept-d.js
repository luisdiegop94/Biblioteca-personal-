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
  return { dow: DOW_ES[d.getDay()], num: d.getDate(), monYear: `de ${MONTH_ES[d.getMonth()]}, ${d.getFullYear()}` };
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
  idx
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "d-shelf"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-tag"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-tag-num"
  }, "N.\xBA ", String(idx).padStart(2, "0")), /*#__PURE__*/React.createElement("h3", {
    className: "d-shelf-tag-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "d-shelf-tag-count"
  }, books.length, " libros")), /*#__PURE__*/React.createElement("div", {
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
    size: "L"
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
  }, "\u2605"))), /*#__PURE__*/React.createElement("p", {
    className: "d-detail-note"
  }, "Reposando en el estante de ", /*#__PURE__*/React.createElement("em", null, LD.shelfFor(book)), ".")))));
}
function ConceptD({
  books
}) {
  const [organize, setOrganize] = useStateD("shelf");
  const [view, setView] = useStateD("cover");
  const [query, setQuery] = useStateD("");
  const [selected, setSelected] = useStateD(null);
  const [sideOpen, setSideOpen] = useStateD(false);
  const owned = useMemoD(() => books.filter(b => b.owned !== false), [books]);
  const stats = useMemoD(() => LD.computeStats(books), [books]);
  const reading = useMemoD(() => LD.currentlyReading(owned), [owned]);
  const filtered = useMemoD(() => owned.filter(b => LD.matches(b, query)), [owned, query]);
  const grouped = useMemoD(() => LD.groupBooks(filtered, organize), [filtered, organize]);
  const today = todayParts();
  return /*#__PURE__*/React.createElement("div", {
    className: "d-app"
  }, /*#__PURE__*/React.createElement("header", {
    className: "d-masthead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-mast-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-mast-marque"
  }, "Catalogus"), /*#__PURE__*/React.createElement("nav", {
    className: "d-mast-nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: "d-mast-nav-btn is-active"
  }, "Estantes"), /*#__PURE__*/React.createElement("button", {
    className: "d-mast-nav-btn"
  }, "Por leer"), /*#__PURE__*/React.createElement("button", {
    className: "d-mast-nav-btn"
  }, "Estad\xEDsticas"))), /*#__PURE__*/React.createElement("div", {
    className: "d-mast-mid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "d-mast-title"
  }, "La Biblioteca", /*#__PURE__*/React.createElement("span", {
    className: "d-mast-amp"
  }, "&"), "su orden secreto"), /*#__PURE__*/React.createElement("p", {
    className: "d-mast-tagline"
  }, "Una colecci\xF3n personal de ", stats.total, " vol\xFAmenes \u2014 le\xEDdos, ley\xE9ndose, esperando turno.")), /*#__PURE__*/React.createElement("div", {
    className: "d-mast-date"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-date-dow"
  }, today.dow), /*#__PURE__*/React.createElement("div", {
    className: "d-date-num"
  }, today.num), /*#__PURE__*/React.createElement("div", {
    className: "d-date-mon"
  }, today.monYear)))), /*#__PURE__*/React.createElement("div", {
    className: "d-layout"
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
  }, c))))), reading.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "d-side-block d-side-reading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "d-side-h"
  }, "En curso"), reading.map((b, i) => {
    const colors = LD.spineColors(b);
    const progress = 20 + LD.hash(b.title) % 75;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      className: "d-side-reading-card",
      onClick: () => setSelected(b)
    }, /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-cover"
    }, /*#__PURE__*/React.createElement(CoverD, {
      book: b,
      size: "M"
    })), /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-meta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-title"
    }, b.title), /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-author"
    }, b.author), /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-bar"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: progress + "%",
        background: colors.accent
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "d-side-reading-pct"
    }, progress, "%")));
  }))), /*#__PURE__*/React.createElement("main", {
    className: "d-main"
  }, /*#__PURE__*/React.createElement("div", {
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
  }, "Lomos"))), /*#__PURE__*/React.createElement("div", {
    className: "d-shelves"
  }, grouped.map(([name, list], i) => /*#__PURE__*/React.createElement(ShelfD, {
    key: name,
    title: name,
    books: list,
    view: view,
    onSelect: setSelected,
    selected: selected,
    idx: i + 1
  }))))), /*#__PURE__*/React.createElement(DetailD, {
    book: selected,
    onClose: () => setSelected(null)
  }));
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
window.ConceptD = ConceptD;