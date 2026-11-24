/**
 * Project Atlas — Internationalization (EN / RU)
 * Auto-detects browser language, persists manual choice in localStorage.
 */

export const STRINGS = {
  en: {
    loading: "Loading...",
    files: "files",
    links: "links",
    lines: "lines",
    btnSearch: "🔍 Ctrl+K",
    btnGithub: "🐙 GitHub",
    btnFolder: "📂 Folder",
    btnDemo: "✨ Demo",
    btnSvg: "📸 SVG",
    btnMmd: "📐 Mermaid",
    btnRoot: "◈ Root",
    btnCenter: "🎯 Center",
    lensStructure: "🌌 Structure",
    lensBlast: "🔥 Blast Radius",
    lensHealth: "🩺 Health",
    lensRoute: "🧭 Reading Route",
    btnResetBanner: "✕ Reset (Esc)",
    btnShowDeps: "⚡ Show imports & dependencies",
    btnHideDeps: "✕ Hide golden dependency rays",
    tabCode: "Code",
    tabSymbols: "Symbols",
    tabLinks: "Links",
    linksOutTitle: "Imports (outgoing →)",
    linksInTitle: "Used by (incoming ←)",
    emptySymbols: "No classes or functions found",
    emptyOut: "No outgoing internal imports",
    emptyIn: "No project files import this file",
    chipDeps: (inC, outC) => `← ${inC} used by · ${outC} imports →`,
    bannerDeps: (path, count) => `⚡ Imports & dependencies for <strong>${path}</strong> (${count} links)`,
    bannerBlast: (name, total, direct) => `🔥 <strong>Blast Radius</strong> for <strong>${name}</strong>: <strong>${total}</strong> files impacted (direct: ${direct}) · click any file`,
    bannerHealth: (score, cyc, god, orp) => `🩺 <strong>Health Score: ${score}/100</strong> · Cycles: <strong>${cyc}</strong> · Monoliths: <strong>${god}</strong> · Orphans: <strong>${orp}</strong>`,
    bannerRoute: (trail) => `🧭 <strong>Reading Route:</strong> ${trail || "no files"}`,
    bannerSvgSaved: "📸 <strong>Vector SVG</strong> snapshot saved!",
    bannerMmdCopied: "📐 <strong>Mermaid graph</strong> downloaded & copied to clipboard!",
    bannerMmdSaved: (f) => `📐 <strong>Mermaid graph</strong> saved to ${f}`,
    searchTitle: "🔍 Universe Teleport",
    searchPlaceholder: "Type a file or folder name...",
    searchEmpty: "Nothing found",
    ghTitle: "🐙 Load GitHub Repository",
    ghPlaceholder: "owner/repo or https://github.com/owner/repo",
    ghPresets: "Examples:",
    ghLoadBtn: "🚀 Launch into Universe",
    legendStruct: "Structure",
    legendDeps: "Imports",
    legendRoute: "Route",
    hintBottom: "Ctrl+K — teleport · Click folder — expand · Esc — reset",
  },
  ru: {
    loading: "Загрузка...",
    files: "файлов",
    links: "связей",
    lines: "строк",
    btnSearch: "🔍 Ctrl+K",
    btnGithub: "🐙 GitHub",
    btnFolder: "📂 Папка",
    btnDemo: "✨ Демо",
    btnSvg: "📸 SVG",
    btnMmd: "📐 Mermaid",
    btnRoot: "◈ Корень",
    btnCenter: "🎯 Центр",
    lensStructure: "🌌 Структура",
    lensBlast: "🔥 Влияние",
    lensHealth: "🩺 Здоровье",
    lensRoute: "🧭 Маршрут",
    btnResetBanner: "✕ Сбросить (Esc)",
    btnShowDeps: "⚡ Показать импорты и зависимости",
    btnHideDeps: "✕ Скрыть жёлтые лучи связей",
    tabCode: "Код",
    tabSymbols: "Символы",
    tabLinks: "Связи",
    linksOutTitle: "Импортирует (исходящие →)",
    linksInTitle: "Используется в (входящие ←)",
    emptySymbols: "Классы и функции не найдены",
    emptyOut: "Нет исходящих импортов внутри проекта",
    emptyIn: "Ни один файл проекта не импортирует этот файл",
    chipDeps: (inC, outC) => `← ${inC} используют · ${outC} импортирует →`,
    bannerDeps: (path, count) => `⚡ Импорты и зависимости для <strong>${path}</strong> (${count} связей)`,
    bannerBlast: (name, total, direct) => `🔥 <strong>Blast Radius</strong> для <strong>${name}</strong>: затронуто <strong>${total}</strong> файлов (напрямую: ${direct}) · кликай на любой файл`,
    bannerHealth: (score, cyc, god, orp) => `🩺 <strong>Health Score: ${score}/100</strong> · Циклы: <strong>${cyc}</strong> · Монолиты: <strong>${god}</strong> · Сироты: <strong>${orp}</strong>`,
    bannerRoute: (trail) => `🧭 <strong>Маршрут чтения:</strong> ${trail || "нет файлов"}`,
    bannerSvgSaved: "📸 <strong>Векторный SVG</strong> сохранён!",
    bannerMmdCopied: "📐 <strong>Mermaid-граф</strong> скачан и скопирован в буфер обмена!",
    bannerMmdSaved: (f) => `📐 <strong>Mermaid-граф</strong> сохранён в файл ${f}`,
    searchTitle: "🔍 Телепорт по вселенной",
    searchPlaceholder: "Введи имя файла или папки...",
    searchEmpty: "Ничего не найдено",
    ghTitle: "🐙 Загрузить репозиторий GitHub",
    ghPlaceholder: "owner/repo или https://github.com/owner/repo",
    ghPresets: "Примеры:",
    ghLoadBtn: "🚀 Загрузить в космос",
    legendStruct: "Структура",
    legendDeps: "Импорты",
    legendRoute: "Маршрут",
    hintBottom: "Ctrl+K — телепорт · Клик по папке — раскрыть · Esc — сброс",
  },
};

export function detectLang() {
  try {
    const saved = localStorage.getItem("atlas_lang");
    if (saved === "en" || saved === "ru") return saved;
  } catch {
    // ignore
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ru") ? "ru" : "en";
}

export function saveLang(lang) {
  try {
    localStorage.setItem("atlas_lang", lang);
  } catch {
    // ignore
  }
}
