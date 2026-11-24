/**
 * Project Atlas — Multi-language Import, Symbol & Syntax Parser
 * Supports: JS/TS, Python, Java, C/C++, Rust, Go, Lua, CSS, HTML
 */

export const LANG_META = {
  js:   { name: "JavaScript", color: "#f9e2af" },
  jsx:  { name: "JSX",        color: "#f9e2af" },
  mjs:  { name: "JS Module",  color: "#f9e2af" },
  ts:   { name: "TypeScript", color: "#89b4fa" },
  tsx:  { name: "TSX",        color: "#89b4fa" },
  py:   { name: "Python",     color: "#74c7ec" },
  java: { name: "Java",       color: "#fab387" },
  c:    { name: "C",          color: "#a6adc8" },
  h:    { name: "C Header",   color: "#a6adc8" },
  cpp:  { name: "C++",        color: "#f38ba8" },
  hpp:  { name: "C++ Header", color: "#f38ba8" },
  rs:   { name: "Rust",       color: "#eba0ac" },
  go:   { name: "Go",         color: "#94e2d5" },
  lua:  { name: "Lua",        color: "#b4befe" },
  css:  { name: "CSS",        color: "#cba6f7" },
  html: { name: "HTML",       color: "#f38ba8" },
  json: { name: "JSON",       color: "#a6e3a1" },
  md:   { name: "Markdown",   color: "#cdd6f4" },
  sh:   { name: "Shell",      color: "#a6e3a1" },
  yml:  { name: "YAML",       color: "#f2cdcd" },
  yaml: { name: "YAML",       color: "#f2cdcd" },
  toml: { name: "TOML",       color: "#f2cdcd" },
};

export function getExt(path) {
  const base = path.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : "";
}

export function getLangInfo(path) {
  const ext = getExt(path);
  return LANG_META[ext] || { name: ext ? ext.toUpperCase() : "File", color: "#9399b2" };
}

/**
 * Extract raw import specifiers from source text
 */
export function extractRawImports(path, content) {
  const ext = getExt(path);
  const refs = new Set();
  if (!content) return [];

  const add = (s) => {
    if (s && s.trim()) refs.add(s.trim());
  };

  if (["js", "jsx", "mjs", "ts", "tsx"].includes(ext)) {
    for (const m of content.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) add(m[1]);
    for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]);
    for (const m of content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]);
  } else if (ext === "py") {
    for (const m of content.matchAll(/^\s*from\s+(\.+[\w.]*|[\w.]+)\s+import\s+([\w,\s*]+)/gm)) {
      add(m[1]);
      // Also allow resolving `from pkg import submodule`
      for (const item of m[2].split(",")) {
        const clean = item.trim().split(/\s+as\s+/)[0].trim();
        if (clean && clean !== "*") add(`${m[1]}.${clean}`);
      }
    }
    for (const m of content.matchAll(/^\s*import\s+([\w.,\s]+)/gm)) {
      for (const part of m[1].split(",")) {
        const mod = part.trim().split(/\s+as\s+/)[0].trim();
        if (mod) add(mod);
      }
    }
  } else if (["c", "h", "cpp", "hpp", "cc"].includes(ext)) {
    for (const m of content.matchAll(/^\s*#include\s*"([^"]+)"/gm)) add(m[1]);
  } else if (ext === "lua") {
    for (const m of content.matchAll(/require\s*\(?\s*['"]([^'"]+)['"]\s*\)?/g)) add(m[1]);
    for (const m of content.matchAll(/dofile\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]);
  } else if (ext === "java") {
    for (const m of content.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+);/gm)) add(m[1]);
  } else if (ext === "rs") {
    for (const m of content.matchAll(/^\s*mod\s+(\w+)\s*;/gm)) add(`./${m[1]}`);
    for (const m of content.matchAll(/^\s*use\s+(?:crate|super|self)::([\w:]+)/gm)) add(m[1].replace(/::/g, "/"));
  } else if (ext === "go") {
    for (const m of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) add(m[1]);
    for (const block of content.matchAll(/import\s*\(([\s\S]*?)\)/g)) {
      for (const m of block[1].matchAll(/"([^"]+)"/g)) add(m[1]);
    }
  } else if (ext === "html") {
    for (const m of content.matchAll(/(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)) {
      if (!/^https?:|^#|^data:/.test(m[1])) add(m[1]);
    }
  } else if (ext === "css") {
    for (const m of content.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g)) add(m[1]);
  }

  return [...refs];
}

function normalizePath(parts) {
  const out = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

/**
 * Resolve raw import strings to actual file paths inside the project
 */
export function resolveImports(files) {
  const fileSet = new Set(files.map((f) => f.path));
  const stemIndex = new Map(); // stem path without ext -> [full paths]
  const baseIndex = new Map(); // filename without ext -> [full paths]

  for (const f of files) {
    const noExt = f.path.replace(/\.[^/.]+$/, "");
    if (!stemIndex.has(noExt)) stemIndex.set(noExt, []);
    stemIndex.get(noExt).push(f.path);

    const base = noExt.split("/").pop();
    if (!baseIndex.has(base)) baseIndex.set(base, []);
    baseIndex.get(base).push(f.path);
  }

  const tryCandidate = (cand) => {
    if (fileSet.has(cand)) return cand;
    if (stemIndex.has(cand)) return stemIndex.get(cand)[0];
    for (const idx of ["index", "__init__", "mod"]) {
      const k = `${cand}/${idx}`;
      if (stemIndex.has(k)) return stemIndex.get(k)[0];
    }
    return null;
  };

  const importsMap = new Map();     // file -> Set(targets)
  const importedByMap = new Map();  // file -> Set(sources)
  for (const f of files) {
    importsMap.set(f.path, new Set());
    importedByMap.set(f.path, new Set());
  }

  for (const f of files) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    const ext = getExt(f.path);
    const raws = extractRawImports(f.path, f.content);

    for (const raw of raws) {
      let target = null;

      // 1. Relative path (./ or ../ or HTML/C relative)
      if (raw.startsWith("./") || raw.startsWith("../")) {
        const joined = normalizePath([...dir.split("/"), ...raw.split("/")]);
        target = tryCandidate(joined);
      } else if (ext === "py" && raw.startsWith(".")) {
        const dots = raw.match(/^\.+/)[0].length;
        const rest = raw.slice(dots).replace(/\./g, "/");
        const up = dir ? dir.split("/") : [];
        for (let i = 1; i < dots; i++) up.pop();
        const joined = normalizePath([...up, ...rest.split("/")]);
        target = tryCandidate(joined);
      } else {
        // Direct relative to same dir (e.g. HTML src="app.js", C #include "util.h")
        const sameDir = normalizePath([...dir.split("/"), ...raw.split("/")]);
        target = tryCandidate(sameDir);

        // Dotted module path (Python/Java/Lua)
        if (!target) {
          const asSlash = raw.replace(/\./g, "/");
          target = tryCandidate(asSlash);
          if (!target && dir) {
            target = tryCandidate(normalizePath([...dir.split("/"), ...asSlash.split("/")]));
          }
          // Suffix match for Java/Go packages or src/ roots
          if (!target) {
            for (const [stem, paths] of stemIndex.entries()) {
              if (stem.endsWith("/" + asSlash) || stem === asSlash) {
                target = paths[0];
                break;
              }
            }
          }
        }
      }

      if (target && target !== f.path) {
        importsMap.get(f.path).add(target);
        importedByMap.get(target).add(f.path);
      }
    }
  }

  return { importsMap, importedByMap };
}

/**
 * Extract functions, classes, structs, and exports with line numbers
 */
export function extractSymbols(path, content) {
  if (!content) return [];
  const ext = getExt(path);
  const lines = content.split("\n");
  const symbols = [];

  lines.forEach((line, idx) => {
    const ln = idx + 1;
    let m;
    if (["js", "jsx", "mjs", "ts", "tsx"].includes(ext)) {
      if ((m = line.match(/^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (ext === "py") {
      if ((m = line.match(/^\s*class\s+(\w+)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (ext === "lua") {
      if ((m = line.match(/^\s*(?:local\s+)?function\s+([\w.:]+)\s*\(/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (ext === "rs") {
      if ((m = line.match(/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (ext === "java") {
      if ((m = line.match(/^\s*(?:public|private|protected)?\s*(?:abstract|final)?\s*(?:class|interface|enum)\s+(\w+)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>[\]]+\s+(\w+)\s*\(/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (ext === "go") {
      if ((m = line.match(/^\s*type\s+(\w+)\s+(?:struct|interface)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/))) {
        symbols.push({ kind: "fn", name: m[1], line: ln });
      }
    } else if (["c", "h", "cpp", "hpp"].includes(ext)) {
      if ((m = line.match(/^\s*(?:class|struct)\s+(\w+)/))) {
        symbols.push({ kind: "class", name: m[1], line: ln });
      } else if ((m = line.match(/^(?:static\s+|inline\s+)?[\w:*&<>]+\s+(\w+)\s*\([^;]*\)\s*\{?\s*$/))) {
        if (!["if", "for", "while", "switch"].includes(m[1])) {
          symbols.push({ kind: "fn", name: m[1], line: ln });
        }
      }
    }
  });

  return symbols;
}

/**
 * Lightweight safe syntax highlighter (returns HTML lines)
 */
export function highlightCode(content) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const kw = /\b(import|from|export|default|const|let|var|function|return|async|await|class|extends|new|if|else|for|while|switch|case|break|continue|try|catch|finally|def|elif|pass|with|as|yield|lambda|pub|fn|struct|enum|impl|mod|use|local|end|then|do|package|public|private|protected|static|void|int|float|bool|string|true|false|null|None|True|False|self|this)\b/g;

  return content.split("\n").map((line) => {
    let s = esc(line);
    // Comments (simple line comments)
    if (/^\s*(\/\/|#|--)/.test(line)) {
      return `<span class="tok-com">${s}</span>`;
    }
    s = s.replace(/(&quot;|"|'|`)(?:(?=(\\?))\2.)*?\1/g, '<span class="tok-str">$&</span>');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
    s = s.replace(kw, '<span class="tok-kw">$1</span>');
    return s;
  });
}
