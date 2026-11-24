/**
 * Project Atlas — Main Application Controller (v0.2.0-beta)
 * Features: 4 Lenses, Golden Dependency Mode, Ctrl+K Teleport, GitHub Loader
 */

import { AtlasGraph } from "./graph.js";
import { CosmosRenderer } from "./canvas.js";
import { highlightCode } from "./parser.js";
import { DEMO_PROJECT } from "./demo-data.js";
import { loadGitHubRepo } from "./github.js";
import { exportUniverseSVG, generateMermaid, downloadTextFile } from "./export.js";

const IGNORE_SEGMENTS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv",
  "dist", "build", "target", ".idea", ".vscode", ".next",
]);

const $ = (id) => document.getElementById(id);

let graph = null;
let selectedFile = null;
let depActive = false;
let currentLens = "structure";
let searchItems = [];
let searchIdx = 0;

const renderer = new CosmosRenderer($("cosmos"), {
  onSelectFile: (node) => {
    openInspector(node);
    if (currentLens === "blast") {
      applyLens("blast");
    }
  },
  onClearDepFocus: (silent) => {
    depActive = false;
    $("btn-show-deps").classList.remove("active");
    $("btn-show-deps").textContent = "⚡ Показать импорты и зависимости";
    if (!silent) {
      renderer.clearDepFocus();
      if (currentLens === "structure") hideBanner();
    }
  },
});

function showBanner(html) {
  $("lens-banner-text").innerHTML = html;
  $("lens-banner").classList.remove("hidden");
}

function hideBanner() {
  $("lens-banner").classList.add("hidden");
}

function loadProject(data) {
  graph = new AtlasGraph(data);
  selectedFile = null;
  depActive = false;
  currentLens = "structure";
  $("inspector").classList.add("hidden");
  hideBanner();
  updateLensButtons("structure");

  $("project-name").textContent = data.name;
  $("project-stats").textContent = `${graph.fileCount} файлов · ${graph.edgeCount} связей`;
  renderer.setGraph(graph);
}

function updateLensButtons(lens) {
  document.querySelectorAll(".lens-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lens === lens);
  });
}

function applyLens(lens) {
  if (!graph) return;
  currentLens = lens;
  updateLensButtons(lens);

  // Reset golden single-file dep mode when switching lenses
  if (depActive) {
    depActive = false;
    renderer.clearDepFocus();
    $("btn-show-deps").classList.remove("active");
    $("btn-show-deps").textContent = "⚡ Показать импорты и зависимости";
  }

  if (lens === "structure") {
    renderer.setLens("structure", null);
    hideBanner();
    return;
  }

  if (lens === "blast") {
    let target = selectedFile;
    if (!target) {
      // Auto-pick the most depended-upon file so user sees Blast Radius immediately!
      const files = [...graph.nodes.values()].filter((n) => n.type === "file");
      files.sort((a, b) => b.importedBy.length - a.importedBy.length);
      target = files[0];
      if (target) {
        graph.expandPathTo(target.path);
        renderer.setSelected(target);
        openInspector(target);
      }
    }
    if (!target) return;
    const blast = graph.getBlastRadius(target);
    renderer.setLens("blast", blast);
    const totalAffected = Math.max(0, blast.levels.size - 1);
    const direct = [...blast.levels.values()].filter((d) => d === 1).length;
    showBanner(`🔥 <strong>Blast Radius</strong> для <strong>${target.name}</strong>: затронуто <strong>${totalAffected}</strong> файлов (напрямую: ${direct}) · кликай на любой файл`);
    return;
  }

  if (lens === "health") {
    const h = graph.analyzeHealth();
    renderer.setLens("health", h);
    showBanner(
      `🩺 <strong>Health Score: ${h.score}/100</strong> · Циклы: <strong>${h.cycleNodeIds.size}</strong> · Монолиты: <strong>${h.godNodeIds.size}</strong> · Сироты: <strong>${h.orphanNodeIds.size}</strong>`
    );
    return;
  }

  if (lens === "route") {
    const route = graph.computeReadingRoute();
    renderer.setLens("route", route);
    const trail = route.steps.map((s, i) => `<strong>${i + 1}.</strong> ${s.name}`).join(" → ");
    showBanner(`🧭 <strong>Маршрут чтения:</strong> ${trail || "нет файлов"}`);
  }
}

function openInspector(node) {
  selectedFile = node;
  depActive = false;
  renderer.clearDepFocus();
  if (currentLens === "structure") hideBanner();

  const ins = $("inspector");
  ins.classList.remove("hidden");

  $("file-dot").style.background = node.color;
  $("file-dot").style.color = node.color;
  $("file-name").textContent = node.name;
  $("file-path").textContent = node.path;

  $("chip-lang").textContent = node.lang.name;
  $("chip-lines").textContent = `${node.file.lines} строк`;
  $("chip-deps").textContent = `← ${node.importedBy.length} используют · ${node.imports.length} импортирует →`;

  const btnDeps = $("btn-show-deps");
  btnDeps.classList.remove("active");
  btnDeps.textContent = "⚡ Показать импорты и зависимости";

  const lines = highlightCode(node.file.content);
  $("code-view").innerHTML = lines
    .map((html, i) => `<div class="code-line" data-line="${i + 1}"><span class="ln">${i + 1}</span><span>${html || " "}</span></div>`)
    .join("");

  const syms = graph.getSymbols(node);
  $("sym-count").textContent = syms.length;
  const symList = $("symbols-list");
  if (syms.length === 0) {
    symList.innerHTML = `<li class="empty-note">Классы и функции не найдены</li>`;
  } else {
    symList.innerHTML = syms
      .map(
        (s) =>
          `<li class="item-row" data-line="${s.line}">
            <span><span class="sym-kind sym-${s.kind}">${s.kind}</span>${s.name}</span>
            <span class="project-stats">:${s.line}</span>
          </li>`
      )
      .join("");
    symList.querySelectorAll(".item-row").forEach((el) => {
      el.addEventListener("click", () => jumpToLine(Number(el.dataset.line)));
    });
  }

  $("link-count").textContent = node.imports.length + node.importedBy.length;
  renderLinkList($("links-out"), node.imports, "Нет исходящих импортов внутри проекта");
  renderLinkList($("links-in"), node.importedBy, "Ни один файл проекта не импортирует этот файл");

  switchTab("code");
}

function renderLinkList(ul, paths, emptyText) {
  if (!paths.length) {
    ul.innerHTML = `<li class="empty-note">${emptyText}</li>`;
    return;
  }
  ul.innerHTML = paths
    .map((p) => `<li class="item-row" data-path="${p}"><span>${p}</span><span class="project-stats">↗</span></li>`)
    .join("");
  ul.querySelectorAll(".item-row").forEach((el) => {
    el.addEventListener("click", () => teleportToPath(el.dataset.path));
  });
}

function teleportToNode(node) {
  if (!node || !graph) return;
  if (node.type === "file") {
    graph.expandPathTo(node.path);
    renderer.setSelected(node);
    renderer.focusNode(node, 1.25);
    openInspector(node);
  } else if (node.type === "folder") {
    let p = node.parent;
    while (p && p.type === "folder") {
      p.expanded = true;
      p = p.parent;
    }
    node.expanded = true;
    graph.relayout();
    renderer.fitNodes([node, ...node.children], 0.72);
  }
}

function teleportToPath(path) {
  const target = graph.expandPathTo(path);
  if (target) teleportToNode(target);
}

function jumpToLine(lineNo) {
  switchTab("code");
  const codeView = $("code-view");
  codeView.querySelectorAll(".code-line.highlight").forEach((el) => el.classList.remove("highlight"));
  const row = codeView.querySelector(`.code-line[data-line="${lineNo}"]`);
  if (row) {
    row.classList.add("highlight");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
}

function toggleDependenciesMode() {
  if (!selectedFile || !graph) return;
  if (depActive) {
    depActive = false;
    renderer.clearDepFocus();
    $("btn-show-deps").classList.remove("active");
    $("btn-show-deps").textContent = "⚡ Показать импорты и зависимости";
    if (currentLens === "structure") hideBanner();
    else applyLens(currentLens);
    return;
  }

  const focus = graph.getDependencyFocus(selectedFile);
  if (!focus) return;
  depActive = true;
  renderer.setDepFocus(focus);

  showBanner(`⚡ Импорты и зависимости для <strong>${selectedFile.path}</strong> (${focus.depLinks.length} связей)`);
  $("btn-show-deps").classList.add("active");
  $("btn-show-deps").textContent = "✕ Скрыть жёлтые лучи связей";
}

// Ctrl+K Teleport Modal
function openSearchModal() {
  if (!graph) return;
  $("modal-search").classList.remove("hidden");
  const inp = $("search-input");
  inp.value = "";
  inp.focus();
  renderSearchResults("");
}

function closeSearchModal() {
  $("modal-search").classList.add("hidden");
}

function renderSearchResults(q) {
  searchItems = graph.search(q);
  searchIdx = 0;
  const ul = $("search-results");
  if (searchItems.length === 0) {
    ul.innerHTML = `<li class="empty-note">Ничего не найдено</li>`;
    return;
  }
  ul.innerHTML = searchItems
    .map((n, idx) => {
      const icon = n.type === "folder" ? "📁" : "✦";
      return `<li class="search-row ${idx === 0 ? "selected" : ""}" data-idx="${idx}">
        <span>${icon} <strong>${n.name}</strong></span>
        <span class="project-stats">${n.path}</span>
      </li>`;
    })
    .join("");
  ul.querySelectorAll(".search-row").forEach((el) => {
    el.addEventListener("click", () => {
      const n = searchItems[Number(el.dataset.idx)];
      closeSearchModal();
      teleportToNode(n);
    });
  });
}

function updateSearchSelection() {
  $("search-results").querySelectorAll(".search-row").forEach((el, i) => {
    el.classList.toggle("selected", i === searchIdx);
  });
}

// GitHub Modal
function openGhModal() {
  $("modal-github").classList.remove("hidden");
  $("gh-status").textContent = "";
  $("gh-input").focus();
}

function closeGhModal() {
  $("modal-github").classList.add("hidden");
}

async function handleGhLoad() {
  const val = $("gh-input").value.trim();
  if (!val) return;
  const status = $("gh-status");
  const btn = $("btn-gh-load");
  btn.disabled = true;
  try {
    const proj = await loadGitHubRepo(val, (msg) => {
      status.textContent = msg;
    });
    closeGhModal();
    loadProject(proj);
  } catch (err) {
    status.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

// Browser-native folder picker
async function readBrowserFolder(fileList) {
  const files = [];
  let rootName = "local-project";

  for (const f of fileList) {
    const relFull = f.webkitRelativePath || f.name;
    const parts = relFull.split("/");
    if (parts.length > 1) rootName = parts[0];
    const rel = parts.length > 1 ? parts.slice(1).join("/") : relFull;

    if (parts.some((p) => IGNORE_SEGMENTS.has(p) || (p.startsWith(".") && p !== ".env.example"))) continue;
    if (f.size > 350_000 || files.length >= 1200) continue;

    try {
      const content = await f.text();
      if (content.includes("\u0000")) continue;
      files.push({ path: rel, size: f.size, lines: content.split("\n").length, content });
    } catch {
      // skip
    }
  }

  if (files.length > 0) {
    loadProject({ name: rootName, root: `local://${rootName}`, files, skipped: 0 });
  }
}

// Event Bindings
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".lens-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyLens(btn.dataset.lens));
});

$("btn-show-deps").addEventListener("click", toggleDependenciesMode);
$("btn-exit-banner").addEventListener("click", () => {
  if (depActive) toggleDependenciesMode();
  else applyLens("structure");
});
$("btn-close-inspector").addEventListener("click", () => {
  $("inspector").classList.add("hidden");
  if (depActive) toggleDependenciesMode();
});

$("btn-search").addEventListener("click", openSearchModal);
$("modal-search").addEventListener("click", (e) => { if (e.target === $("modal-search")) closeSearchModal(); });
$("search-input").addEventListener("input", (e) => renderSearchResults(e.target.value));
$("search-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchIdx = Math.min(searchItems.length - 1, searchIdx + 1);
    updateSearchSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchIdx = Math.max(0, searchIdx - 1);
    updateSearchSelection();
  } else if (e.key === "Enter" && searchItems[searchIdx]) {
    e.preventDefault();
    const n = searchItems[searchIdx];
    closeSearchModal();
    teleportToNode(n);
  }
});

$("btn-github").addEventListener("click", openGhModal);
$("btn-close-gh").addEventListener("click", closeGhModal);
$("modal-github").addEventListener("click", (e) => { if (e.target === $("modal-github")) closeGhModal(); });
$("btn-gh-load").addEventListener("click", handleGhLoad);
$("gh-input").addEventListener("keydown", (e) => { if (e.key === "Enter") handleGhLoad(); });
document.querySelectorAll(".chip-btn[data-repo]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("gh-input").value = btn.dataset.repo;
    handleGhLoad();
  });
});

$("btn-demo").addEventListener("click", () => loadProject(DEMO_PROJECT));
$("btn-export-svg").addEventListener("click", () => {
  if (!graph) return;
  exportUniverseSVG(graph, renderer);
  showBanner(`📸 <strong>Векторный SVG</strong> сохранён!`);
});
$("btn-export-mmd").addEventListener("click", async () => {
  if (!graph) return;
  const mmd = generateMermaid(graph);
  const safe = graph.project.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  downloadTextFile(`${safe}_atlas.mmd`, mmd);
  try {
    await navigator.clipboard.writeText(mmd);
    showBanner(`📐 <strong>Mermaid-граф</strong> скачан и скопирован в буфер обмена!`);
  } catch {
    showBanner(`📐 <strong>Mermaid-граф</strong> сохранён в файл ${safe}_atlas.mmd`);
  }
});
$("btn-collapse").addEventListener("click", () => {
  if (!graph) return;
  if (depActive) toggleDependenciesMode();
  applyLens("structure");
  graph.collapseAll();
  renderer.fitNodes(graph.getVisible().visibleNodes, 0.82);
});
$("btn-center").addEventListener("click", () => {
  if (!graph) return;
  renderer.fitNodes(graph.getVisible().visibleNodes, 0.80);
});

$("btn-open-folder").addEventListener("click", () => $("folder-input").click());
$("folder-input").addEventListener("change", (e) => {
  if (e.target.files?.length) readBrowserFolder(e.target.files);
});

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if ($("modal-search").classList.contains("hidden")) openSearchModal();
    else closeSearchModal();
  } else if (e.key === "Escape") {
    if (!$("modal-search").classList.contains("hidden")) closeSearchModal();
    else if (!$("modal-github").classList.contains("hidden")) closeGhModal();
    else if (depActive) toggleDependenciesMode();
    else if (currentLens !== "structure") applyLens("structure");
  }
});

// Boot
async function boot() {
  try {
    const res = await fetch("/api/project", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.files) && data.files.length > 0) {
        loadProject(data);
        return;
      }
    }
  } catch {
    // static mode -> Demo
  }
  loadProject(DEMO_PROJECT);
}

boot();
