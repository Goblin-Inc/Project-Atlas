/**
 * Project Atlas — Progressive-Disclosure Universe Graph & Radial Layout
 */

import { getLangInfo, resolveImports, extractSymbols } from "./parser.js";

export class AtlasGraph {
  constructor(projectData) {
    this.project = projectData;
    this.nodes = new Map();       // id -> node
    this.root = null;
    this.importsMap = new Map();
    this.importedByMap = new Map();
    this.fileCount = projectData.files.length;
    this.edgeCount = 0;

    this._buildTree(projectData);
    this.relayout();
  }

  _buildTree(projectData) {
    const { importsMap, importedByMap } = resolveImports(projectData.files);
    this.importsMap = importsMap;
    this.importedByMap = importedByMap;

    let edges = 0;
    for (const s of importsMap.values()) edges += s.size;
    this.edgeCount = edges;

    const root = {
      id: "__root__",
      name: projectData.name,
      path: "",
      type: "root",
      depth: 0,
      parent: null,
      children: [],
      expanded: true,
      totalFiles: projectData.files.length,
      x: 0, y: 0, tx: 0, ty: 0,
      alpha: 1, tAlpha: 1,
      radius: 24,
      color: "#e4e6f8",
    };
    this.root = root;
    this.nodes.set(root.id, root);

    const ensureFolder = (parts) => {
      let cur = root;
      let acc = "";
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        acc = acc ? `${acc}/${seg}` : seg;
        const id = `dir:${acc}`;
        let node = this.nodes.get(id);
        if (!node) {
          node = {
            id,
            name: seg,
            path: acc,
            type: "folder",
            depth: i + 1,
            parent: cur,
            children: [],
            expanded: false,
            totalFiles: 0,
            x: cur.x, y: cur.y, tx: 0, ty: 0,
            alpha: 0, tAlpha: 1,
            radius: 16,
            color: "#b4befe",
          };
          this.nodes.set(id, node);
          cur.children.push(node);
        }
        cur = node;
      }
      return cur;
    };

    for (const f of projectData.files) {
      const parts = f.path.split("/");
      const fname = parts.pop();
      const parent = parts.length ? ensureFolder(parts) : root;
      const lang = getLangInfo(f.path);
      const id = `file:${f.path}`;

      const deg = (importsMap.get(f.path)?.size || 0) + (importedByMap.get(f.path)?.size || 0);
      const radius = Math.max(7.5, Math.min(15, 7.5 + Math.log2(f.lines + 2) * 0.9 + deg * 0.45));

      const fnode = {
        id,
        name: fname,
        path: f.path,
        type: "file",
        depth: parent.depth + 1,
        parent,
        children: [],
        expanded: false,
        file: f,
        lang,
        symbols: null, // lazy-extracted on inspect
        imports: [...(importsMap.get(f.path) || [])],
        importedBy: [...(importedByMap.get(f.path) || [])],
        x: parent.x, y: parent.y, tx: 0, ty: 0,
        alpha: 0, tAlpha: 1,
        radius,
        color: lang.color,
      };

      this.nodes.set(id, fnode);
      parent.children.push(fnode);

      // Increment descendant file counts up the ancestor chain
      let p = parent;
      while (p && p !== root) {
        p.totalFiles += 1;
        p = p.parent;
      }
    }

    // Sort children: folders first, then files alphabetically
    for (const n of this.nodes.values()) {
      n.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
  }

  getSymbols(node) {
    if (!node || node.type !== "file") return [];
    if (node.symbols === null) {
      node.symbols = extractSymbols(node.path, node.file.content);
    }
    return node.symbols;
  }

  toggleFolder(node) {
    if (!node || node.type !== "folder") return false;
    node.expanded = !node.expanded;
    if (node.expanded) {
      for (const ch of node.children) {
        ch.x = node.x;
        ch.y = node.y;
        ch.alpha = 0;
      }
    }
    this.relayout();
    return node.expanded;
  }

  expandPathTo(filePath) {
    const node = this.nodes.get(`file:${filePath}`);
    if (!node) return null;
    let p = node.parent;
    const toExpand = [];
    while (p && p.type === "folder") {
      if (!p.expanded) toExpand.push(p);
      p = p.parent;
    }
    for (let i = toExpand.length - 1; i >= 0; i--) {
      const folder = toExpand[i];
      folder.expanded = true;
      for (const ch of folder.children) {
        ch.x = folder.x;
        ch.y = folder.y;
        ch.alpha = 0;
      }
    }
    if (toExpand.length > 0) this.relayout();
    return node;
  }

  collapseAll() {
    for (const n of this.nodes.values()) {
      if (n.type === "folder") n.expanded = false;
    }
    this.relayout();
  }

  /**
   * Returns currently visible nodes & structural links (white rays)
   */
  getVisible() {
    const visibleNodes = [];
    const structLinks = [];

    const walk = (node) => {
      visibleNodes.push(node);
      if (node.expanded && node.children.length > 0) {
        for (const ch of node.children) {
          structLinks.push({ from: node, to: ch });
          walk(ch);
        }
      }
    };
    walk(this.root);
    return { visibleNodes, structLinks };
  }

  /**
   * Deterministic pseudo-random [0, 1) from string so each constellation keeps a recognizable shape
   */
  _hash01(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  /**
   * Organic constellation layout:
   * - Varied ray lengths & natural angular scatter (not a rigid compass circle)
   * - Local cluster fan-out around each expanded folder
   * - Gentle collision relaxation so stars and labels never overlap
   */
  relayout() {
    const weights = new Map();
    const calcWeight = (node) => {
      if (!node.expanded || node.children.length === 0) {
        weights.set(node.id, 1);
        return 1;
      }
      let sum = 0;
      for (const ch of node.children) sum += calcWeight(ch);
      const w = Math.max(1.3, sum);
      weights.set(node.id, w);
      return w;
    };
    calcWeight(this.root);

    this.root.tx = 0;
    this.root.ty = 0;

    const placeChildren = (node, startAngle, endAngle) => {
      if (!node.expanded || node.children.length === 0) return;
      const totalW = node.children.reduce((s, c) => s + weights.get(c.id), 0);
      let cursor = startAngle;

      const count = node.children.length;
      const baseDist = node.depth === 0
        ? Math.max(175, 130 + count * 10)
        : Math.max(125, 95 + count * 12);

      for (let i = 0; i < node.children.length; i++) {
        const ch = node.children[i];
        const share = (weights.get(ch.id) / totalW) * (endAngle - startAngle);

        // Deterministic constellation scatter in angle & distance
        const r1 = this._hash01(ch.id + ":ang");
        const r2 = this._hash01(ch.id + ":dist");
        const angJitter = (r1 - 0.5) * Math.min(0.42, share * 0.52);
        const mid = cursor + share / 2 + angJitter;

        // Alternate slightly & vary ray length for a natural star-chart feel
        const distMult = (ch.type === "folder" ? 1.12 : 0.78) + r2 * 0.62;
        const dist = baseDist * distMult;

        ch.tx = node.tx + Math.cos(mid) * dist;
        ch.ty = node.ty + Math.sin(mid) * dist;

        if (ch.expanded && ch.children.length > 0) {
          // Fan out sub-constellation outward from parent's direction
          const span = Math.min(Math.PI * 1.35, Math.max(Math.PI * 0.65, share * 1.45));
          placeChildren(ch, mid - span / 2, mid + span / 2);
        }
        cursor += share;
      }
    };

    placeChildren(this.root, -Math.PI * 0.65, Math.PI * 1.35);

    // Gentle collision relaxation so no two visible stars crowd each other
    const { visibleNodes } = this.getVisible();
    const minDist = 82;
    for (let iter = 0; iter < 18; iter++) {
      for (let i = 0; i < visibleNodes.length; i++) {
        const a = visibleNodes[i];
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const b = visibleNodes[j];
          const dx = b.tx - a.tx;
          const dy = b.ty - a.ty;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d < minDist) {
            const push = (minDist - d) * 0.35;
            const ux = dx / d;
            const uy = dy / d;
            if (a.type !== "root") {
              a.tx -= ux * push;
              a.ty -= uy * push;
            }
            if (b.type !== "root") {
              b.tx += ux * push;
              b.ty += uy * push;
            }
          }
        }
      }
    }
  }

  /**
   * Build dependency focus set for a selected file node
   */
  getDependencyFocus(fileNode) {
    if (!fileNode || fileNode.type !== "file") return null;

    // Auto-expand paths to all connected files
    for (const p of fileNode.imports) this.expandPathTo(p);
    for (const p of fileNode.importedBy) this.expandPathTo(p);

    const nodeIds = new Set([fileNode.id]);
    const depLinks = [];

    const addAncestors = (n) => {
      let p = n.parent;
      while (p) {
        nodeIds.add(p.id);
        p = p.parent;
      }
    };
    addAncestors(fileNode);

    for (const targetPath of fileNode.imports) {
      const target = this.nodes.get(`file:${targetPath}`);
      if (target) {
        nodeIds.add(target.id);
        addAncestors(target);
        depLinks.push({ from: fileNode, to: target, kind: "outgoing" });
      }
    }

    for (const srcPath of fileNode.importedBy) {
      const src = this.nodes.get(`file:${srcPath}`);
      if (src) {
        nodeIds.add(src.id);
        addAncestors(src);
        depLinks.push({ from: src, to: fileNode, kind: "incoming" });
      }
    }

    const focusNodes = [...nodeIds]
      .map((id) => this.nodes.get(id))
      .filter((n) => n && n.type === "file");
    if (focusNodes.length === 0) focusNodes.push(fileNode);

    return { center: fileNode, nodeIds, depLinks, focusNodes };
  }

  /**
   * Lens 2: Blast Radius (BFS wave of downstream files affected if fileNode changes)
   */
  getBlastRadius(fileNode) {
    if (!fileNode || fileNode.type !== "file") return null;

    const levels = new Map(); // nodeId -> hop distance (0 = origin, 1 = direct, 2 = indirect, ...)
    const edges = [];
    const queue = [{ node: fileNode, dist: 0 }];
    levels.set(fileNode.id, 0);

    while (queue.length > 0) {
      const { node, dist } = queue.shift();
      if (dist >= 4) continue;
      for (const dependentPath of node.importedBy) {
        const depNode = this.nodes.get(`file:${dependentPath}`);
        if (!depNode) continue;
        edges.push({ from: node, to: depNode, dist: dist + 1 });
        if (!levels.has(depNode.id)) {
          levels.set(depNode.id, dist + 1);
          queue.push({ node: depNode, dist: dist + 1 });
        }
      }
    }

    // Expand paths to all impacted nodes
    for (const id of levels.keys()) {
      const n = this.nodes.get(id);
      if (n && n.type === "file") this.expandPathTo(n.path);
    }

    const nodeIds = new Set(levels.keys());
    const focusNodes = [];
    for (const id of levels.keys()) {
      const n = this.nodes.get(id);
      if (!n) continue;
      if (n.type === "file") focusNodes.push(n);
      let p = n.parent;
      while (p) {
        nodeIds.add(p.id);
        p = p.parent;
      }
    }

    return { origin: fileNode, levels, edges, nodeIds, focusNodes };
  }

  /**
   * Lens 3: Architecture Health (cycles, god-files, orphan code files)
   */
  analyzeHealth() {
    const fileNodes = [...this.nodes.values()].filter((n) => n.type === "file");
    const cycleNodeIds = new Set();
    const cycleEdges = [];

    // Detect cycles via 3-color DFS
    const state = new Map(); // 0=unvisited, 1=visiting, 2=done
    const stack = [];

    const dfs = (u) => {
      state.set(u.id, 1);
      stack.push(u);
      for (const targetPath of u.imports) {
        const v = this.nodes.get(`file:${targetPath}`);
        if (!v) continue;
        const st = state.get(v.id) || 0;
        if (st === 1) {
          const idx = stack.indexOf(v);
          for (let i = idx; i < stack.length; i++) {
            cycleNodeIds.add(stack[i].id);
            const next = i + 1 < stack.length ? stack[i + 1] : v;
            cycleEdges.push({ from: stack[i], to: next });
          }
        } else if (st === 0) {
          dfs(v);
        }
      }
      stack.pop();
      state.set(u.id, 2);
    };

    for (const f of fileNodes) {
      if ((state.get(f.id) || 0) === 0) dfs(f);
    }

    const godNodeIds = new Set();
    const orphanNodeIds = new Set();
    const codeExts = new Set(["js", "jsx", "mjs", "ts", "tsx", "py", "java", "c", "cpp", "rs", "go", "lua"]);

    for (const f of fileNodes) {
      const ext = f.path.split(".").pop()?.toLowerCase() || "";
      if (f.file.lines >= 320 || f.importedBy.length >= 6) {
        godNodeIds.add(f.id);
      }
      const isEntry = /^(main|index|app|cli|server|init|__init__)\./i.test(f.name);
      if (codeExts.has(ext) && !isEntry && f.imports.length === 0 && f.importedBy.length === 0) {
        orphanNodeIds.add(f.id);
      }
    }

    // Expand folders containing issues so they are immediately visible
    for (const id of [...cycleNodeIds, ...godNodeIds, ...orphanNodeIds]) {
      const n = this.nodes.get(id);
      if (n && n.type === "file") this.expandPathTo(n.path);
    }

    const score = Math.max(
      15,
      100 - cycleNodeIds.size * 14 - godNodeIds.size * 8 - orphanNodeIds.size * 4
    );

    return { score, cycleNodeIds, cycleEdges, godNodeIds, orphanNodeIds };
  }

  /**
   * Lens 4: Recommended Reading Route (from entry point -> core modules)
   */
  computeReadingRoute() {
    const fileNodes = [...this.nodes.values()].filter((n) => n.type === "file");
    if (fileNodes.length === 0) return { steps: [], stepMap: new Map(), edges: [] };

    // Score candidate entry points
    const entryScore = (f) => {
      let s = 0;
      if (/^(main|index|app|bootstrap|cli|server|rc)\./i.test(f.name)) s += 50;
      if (f.depth === 1) s += 18;
      if (f.importedBy.length === 0 && f.imports.length > 0) s += 25;
      s += f.imports.length * 4;
      return s;
    };

    const sorted = [...fileNodes].sort((a, b) => entryScore(b) - entryScore(a));
    const start = sorted[0];

    const steps = [];
    const visited = new Set();
    const edges = [];

    const queue = [start];
    visited.add(start.id);

    while (queue.length > 0 && steps.length < 7) {
      const cur = queue.shift();
      steps.push(cur);
      const nexts = cur.imports
        .map((p) => this.nodes.get(`file:${p}`))
        .filter((n) => n && !visited.has(n.id))
        .sort((a, b) => (b.importedBy.length + b.imports.length) - (a.importedBy.length + a.imports.length));

      for (const nx of nexts) {
        if (visited.size >= 7) break;
        visited.add(nx.id);
        edges.push({ from: cur, to: nx });
        queue.push(nx);
      }
    }

    for (const n of steps) this.expandPathTo(n.path);

    const stepMap = new Map();
    steps.forEach((n, idx) => stepMap.set(n.id, idx + 1));

    return { steps, stepMap, edges };
  }

  /**
   * Fast search across files & folders for Ctrl+K Teleport
   */
  search(query) {
    const q = query.trim().toLowerCase();
    const all = [...this.nodes.values()].filter((n) => n.type !== "root");
    if (!q) {
      return all
        .filter((n) => n.type === "file")
        .sort((a, b) => (b.imports.length + b.importedBy.length) - (a.imports.length + a.importedBy.length))
        .slice(0, 12);
    }
    return all
      .filter((n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
      .sort((a, b) => {
        const aExact = a.name.toLowerCase().startsWith(q) ? 1 : 0;
        const bExact = b.name.toLowerCase().startsWith(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return a.path.length - b.path.length;
      })
      .slice(0, 14);
  }
}
