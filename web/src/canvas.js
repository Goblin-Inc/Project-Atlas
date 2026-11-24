/**
 * Project Atlas — 60 FPS Cosmos Canvas Renderer
 * Features:
 * - Smooth spring-lerp node expansion & camera flight
 * - Crisp white structural rays (folder -> children)
 * - Golden animated dependency rays (with moving light pulse)
 * - Soft auto-dimming of inactive branches on large projects
 */

export class CosmosRenderer {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cb = callbacks;

    this.graph = null;
    this.selectedNode = null;
    this.hoveredNode = null;
    this.activeBranchFolder = null;
    this.depFocus = null; // { center, nodeIds, depLinks, focusNodes }
    this.lens = "structure"; // structure | blast | health | route
    this.lensData = null;

    // Camera state (world coordinates at screen center)
    this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tZoom: 1 };

    // Interaction
    this.dragging = false;
    this.dragMoved = false;
    this.lastMouse = { x: 0, y: 0 };

    // Background subtle starfield
    this.stars = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.2,
      a: 0.12 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
    }));

    this._bindEvents();
    this.resize();
    this._t = 0;
    this._loop();
  }

  setGraph(graph) {
    this.graph = graph;
    this.selectedNode = null;
    this.hoveredNode = null;
    this.activeBranchFolder = null;
    this.depFocus = null;
    this.lens = "structure";
    this.lensData = null;
    // Snap initial root & top-level children smoothly
    this.fitNodes(graph.getVisible().visibleNodes, 0.82);
  }

  setLens(lens, data) {
    this.lens = lens;
    this.lensData = data || null;
    if (lens === "blast" && data?.focusNodes?.length) {
      this.fitNodes(data.focusNodes, 0.72, -160);
    } else if (lens === "route" && data?.steps?.length) {
      this.fitNodes(data.steps, 0.74);
    } else if (lens === "health" && this.graph) {
      this.fitNodes(this.graph.getVisible().visibleNodes, 0.76);
    }
  }

  setSelected(node) {
    this.selectedNode = node;
    if (node && node.type === "file") {
      this.activeBranchFolder = node.parent && node.parent.type === "folder" ? node.parent : null;
    }
  }

  setDepFocus(depFocus) {
    this.depFocus = depFocus;
    if (depFocus && depFocus.focusNodes.length > 0) {
      // Frame the connected files cleanly (leaving space for the right inspector)
      this.fitNodes(depFocus.focusNodes, 0.72, -160);
    }
  }

  clearDepFocus() {
    this.depFocus = null;
  }

  focusNode(node, zoom = 1.15) {
    if (!node) return;
    this.cam.tx = node.tx + 90;
    this.cam.ty = node.ty;
    this.cam.tZoom = Math.max(0.55, Math.min(2.2, zoom));
  }

  fitNodes(nodes, fill = 0.78, xOffsetPx = 0) {
    if (!nodes || nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.tx - 50);
      maxX = Math.max(maxX, n.tx + 50);
      minY = Math.min(minY, n.ty - 50);
      maxY = Math.max(maxY, n.ty + 50);
    }
    const w = Math.max(240, maxX - minX);
    const h = Math.max(200, maxY - minY);
    const viewW = Math.max(300, this.width - (xOffsetPx ? Math.abs(xOffsetPx) * 2 : 80));
    const viewH = Math.max(300, this.height - 100);
    const z = Math.max(0.28, Math.min(1.55, Math.min(viewW / w, viewH / h) * fill));

    this.cam.tx = (minX + maxX) / 2 - xOffsetPx / z;
    this.cam.ty = (minY + maxY) / 2;
    this.cam.tZoom = z;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  _hitTest(sx, sy) {
    if (!this.graph) return null;
    const { x, y } = this.screenToWorld(sx, sy);
    const { visibleNodes } = this.graph.getVisible();
    let best = null;
    let bestDist = Infinity;
    for (let i = visibleNodes.length - 1; i >= 0; i--) {
      const n = visibleNodes[i];
      const dx = x - n.x;
      const dy = y - n.y;
      const hitR = Math.max(n.radius + 9, 18 / this.cam.zoom);
      const d = Math.hypot(dx, dy);
      if (d <= hitR && d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resize());

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragMoved = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (this.dragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.hypot(dx, dy) > 3) this.dragMoved = true;
        this.cam.x -= dx / this.cam.zoom;
        this.cam.y -= dy / this.cam.zoom;
        this.cam.tx = this.cam.x;
        this.cam.ty = this.cam.y;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }

      const hit = this._hitTest(sx, sy);
      this.hoveredNode = hit;
      this.canvas.style.cursor = hit ? "pointer" : "grab";
    });

    window.addEventListener("mouseup", (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.dragMoved) return;

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (sx < 0 || sy < 0 || sx > this.width || sy > this.height) return;

      const hit = this._hitTest(sx, sy);
      if (!hit) {
        if (this.depFocus) this.cb.onClearDepFocus?.();
        return;
      }

      if (hit.type === "folder") {
        this.depFocus = null;
        this.cb.onClearDepFocus?.(true);
        const expanded = this.graph.toggleFolder(hit);
        this.activeBranchFolder = expanded ? hit : (hit.parent?.type === "folder" ? hit.parent : null);
        if (expanded) {
          this.fitNodes([hit, ...hit.children], 0.72);
        }
        this.cb.onFolderToggle?.(hit, expanded);
      } else if (hit.type === "file") {
        this.depFocus = null;
        this.selectedNode = hit;
        this.activeBranchFolder = hit.parent?.type === "folder" ? hit.parent : null;
        this.cb.onSelectFile?.(hit);
      } else if (hit.type === "root") {
        this.activeBranchFolder = null;
        this.depFocus = null;
        this.cb.onClearDepFocus?.(true);
        this.fitNodes(this.graph.getVisible().visibleNodes, 0.80);
      }
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = this.screenToWorld(sx, sy);

        const factor = e.deltaY < 0 ? 1.13 : 0.885;
        this.cam.tZoom = Math.max(0.22, Math.min(3.0, this.cam.tZoom * factor));
        this.cam.zoom = this.cam.tZoom;

        const after = this.screenToWorld(sx, sy);
        this.cam.x += before.x - after.x;
        this.cam.y += before.y - after.y;
        this.cam.tx = this.cam.x;
        this.cam.ty = this.cam.y;
      },
      { passive: false }
    );
  }

  _isInBranch(node, folder) {
    if (!folder) return true;
    if (node === folder || node.type === "root") return true;
    let p = node.parent;
    while (p) {
      if (p === folder) return true;
      p = p.parent;
    }
    // Keep ancestors of the active folder bright
    let a = folder.parent;
    while (a) {
      if (a === node) return true;
      a = a.parent;
    }
    return false;
  }

  _drawBackground(ctx) {
    ctx.fillStyle = "#070912";
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle deep-space radial nebula
    const g = ctx.createRadialGradient(
      this.width * 0.42, this.height * 0.45, 40,
      this.width * 0.42, this.height * 0.45, Math.max(this.width, this.height) * 0.72
    );
    g.addColorStop(0, "rgba(68, 76, 138, 0.14)");
    g.addColorStop(0.5, "rgba(24, 28, 56, 0.08)");
    g.addColorStop(1, "rgba(7, 9, 18, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle twinkling stars
    for (const s of this.stars) {
      const a = s.a * (0.65 + 0.35 * Math.sin(this._t * 0.8 + s.phase));
      ctx.fillStyle = `rgba(210, 220, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * this.width, s.y * this.height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDepRay(ctx, link, color = "#facc15", glow = "rgba(251, 191, 36, 0.28)", pulseColor = "#fef08a") {
    const { from, to } = link;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Gentle quadratic curve so colored rays stand out cleanly above white structural rays
    const nx = -dy / dist;
    const ny = dx / dist;
    const bend = Math.min(75, dist * 0.18);
    const cx = (from.x + to.x) / 2 + nx * bend;
    const cy = (from.y + to.y) / 2 + ny * bend;

    ctx.save();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 6 / this.cam.zoom;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(cx, cy, to.x, to.y);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1 / this.cam.zoom;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(cx, cy, to.x, to.y);
    ctx.stroke();

    // Animated light pulse traveling along the ray
    const p = (this._t * 0.55) % 1;
    const inv = 1 - p;
    const px = inv * inv * from.x + 2 * inv * p * cx + p * p * to.x;
    const py = inv * inv * from.y + 2 * inv * p * cy + p * p * to.y;

    ctx.fillStyle = pulseColor;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, 3.6 / Math.sqrt(this.cam.zoom), 0, Math.PI * 2);
    ctx.fill();

    // Directional arrowhead near destination node
    const tArrow = Math.max(0.55, 1 - (to.radius + 10) / dist);
    const iA = 1 - tArrow;
    const ax = iA * iA * from.x + 2 * iA * tArrow * cx + tArrow * tArrow * to.x;
    const ay = iA * iA * from.y + 2 * iA * tArrow * cy + tArrow * tArrow * to.y;
    const tx = 2 * iA * (cx - from.x) + 2 * tArrow * (to.x - cx);
    const ty = 2 * iA * (cy - from.y) + 2 * tArrow * (to.y - cy);
    const ang = Math.atan2(ty, tx);
    const head = 8 / Math.sqrt(this.cam.zoom);

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - head * Math.cos(ang - 0.42), ay - head * Math.sin(ang - 0.42));
    ctx.lineTo(ax - head * Math.cos(ang + 0.42), ay - head * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    this._t += 0.016;

    const ctx = this.ctx;
    this._drawBackground(ctx);
    if (!this.graph) return;

    // Smooth camera interpolation
    this.cam.x += (this.cam.tx - this.cam.x) * 0.11;
    this.cam.y += (this.cam.ty - this.cam.y) * 0.11;
    this.cam.zoom += (this.cam.tZoom - this.cam.zoom) * 0.11;

    const { visibleNodes, structLinks } = this.graph.getVisible();
    const isLarge = visibleNodes.length > 26;

    // Update spring positions (with gentle zero-gravity cosmic float) & target dimming alpha
    for (const n of visibleNodes) {
      if (n._phase === undefined) n._phase = (n.tx * 0.017 + n.ty * 0.023) % (Math.PI * 2);
      const floatX = n.type === "root" ? 0 : Math.cos(this._t * 0.55 + n._phase) * 2.2;
      const floatY = n.type === "root" ? 0 : Math.sin(this._t * 0.45 + n._phase * 1.3) * 2.2;

      n.x += (n.tx + floatX - n.x) * 0.14;
      n.y += (n.ty + floatY - n.y) * 0.14;

      let targetA = 1.0;
      if (this.depFocus) {
        targetA = this.depFocus.nodeIds.has(n.id) ? 1.0 : 0.12;
      } else if (this.lens === "blast" && this.lensData) {
        targetA = this.lensData.nodeIds.has(n.id) ? 1.0 : 0.14;
      } else if (this.lens === "route" && this.lensData) {
        targetA = (this.lensData.stepMap.has(n.id) || n.type !== "file") ? 1.0 : 0.22;
      } else if (this.lens === "health" && this.lensData && n.type === "file") {
        const isIssue =
          this.lensData.cycleNodeIds.has(n.id) ||
          this.lensData.godNodeIds.has(n.id) ||
          this.lensData.orphanNodeIds.has(n.id);
        targetA = isIssue ? 1.0 : 0.25;
      } else if (isLarge && this.activeBranchFolder) {
        targetA = this._isInBranch(n, this.activeBranchFolder) ? 1.0 : 0.24;
      }
      n.alpha += (targetA - n.alpha) * 0.14;
    }

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    // 1. White Structural Rays (Hierarchy: parent -> child)
    for (const { from, to } of structLinks) {
      const a = Math.min(from.alpha, to.alpha);
      const dimmed = this.depFocus || this.lens !== "structure";
      const baseAlpha = dimmed ? (a > 0.5 ? 0.30 : 0.05) : (a > 0.5 ? 0.42 : 0.09);
      ctx.strokeStyle = `rgba(235, 240, 255, ${baseAlpha.toFixed(3)})`;
      ctx.lineWidth = (from.type === "root" ? 1.6 : 1.15) / Math.sqrt(this.cam.zoom);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    // 2. Active Overlay Rays (Golden Deps / Blast Wave / Health Cycles / Reading Route)
    if (this.depFocus) {
      for (const link of this.depFocus.depLinks) {
        this._drawDepRay(ctx, link);
      }
    } else if (this.lens === "blast" && this.lensData) {
      for (const edge of this.lensData.edges) {
        const col = edge.dist === 1 ? "#f38ba8" : (edge.dist === 2 ? "#fab387" : "#f9e2af");
        const glow = edge.dist === 1 ? "rgba(243, 139, 168, 0.28)" : "rgba(250, 179, 135, 0.24)";
        this._drawDepRay(ctx, edge, col, glow, "#ffffff");
      }
    } else if (this.lens === "health" && this.lensData) {
      for (const edge of this.lensData.cycleEdges) {
        this._drawDepRay(ctx, edge, "#ef4444", "rgba(239, 68, 68, 0.32)", "#fecaca");
      }
    } else if (this.lens === "route" && this.lensData) {
      for (const edge of this.lensData.edges) {
        this._drawDepRay(ctx, edge, "#2dd4bf", "rgba(45, 212, 191, 0.26)", "#ccfbf1");
      }
    }

    // 3. Draw Nodes
    for (const n of visibleNodes) {
      const isSelected = n === this.selectedNode;
      const isHovered = n === this.hoveredNode;
      const isDepCenter = this.depFocus && this.depFocus.center === n;
      const isDepMember = this.depFocus && this.depFocus.nodeIds.has(n.id) && n.type === "file";

      ctx.save();
      ctx.globalAlpha = Math.max(0.08, Math.min(1, n.alpha));

      // Glow aura
      if (isSelected || isHovered || isDepCenter || n.type === "root") {
        const glowColor = isDepCenter ? "#facc15" : n.color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isDepCenter ? 26 : 18;
      }

      if (n.type === "root") {
        // Core star
        ctx.fillStyle = "#161b33";
        ctx.strokeStyle = "#e4e6f8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Outer orbital ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(180, 190, 254, 0.38)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 8, this._t * 0.25, this._t * 0.25 + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (n.type === "folder") {
        // Folder planet
        ctx.fillStyle = n.expanded ? "rgba(180, 190, 254, 0.24)" : "rgba(30, 34, 60, 0.92)";
        ctx.strokeStyle = isHovered ? "#ffffff" : "#b4befe";
        ctx.lineWidth = n.expanded ? 2.2 : 1.7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Child count badge inside collapsed folder
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e4e6f8";
        ctx.font = `600 ${Math.max(9, 10 / Math.sqrt(this.cam.zoom))}px "JetBrainsMono Nerd Font", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.expanded ? "−" : `+${n.children.length}`, n.x, n.y + 0.5);
      } else {
        // File star with subtle cosmic halo
        ctx.save();
        ctx.fillStyle = isDepCenter ? "rgba(250, 204, 21, 0.22)" : `${n.color}28`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = isDepCenter ? "#facc15" : n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected || isHovered || isDepMember) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isDepCenter ? "#fef08a" : (isDepMember ? "#facc15" : "#ffffff");
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Lens-specific visual badges & rings on files
        if (!this.depFocus && this.lens === "blast" && this.lensData?.levels?.has(n.id)) {
          const hop = this.lensData.levels.get(n.id);
          const ringCol = hop === 0 ? "#facc15" : (hop === 1 ? "#f38ba8" : (hop === 2 ? "#fab387" : "#f9e2af"));
          ctx.shadowBlur = 0;
          ctx.strokeStyle = ringCol;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 5 + Math.sin(this._t * 3 + hop) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (!this.depFocus && this.lens === "health" && this.lensData) {
          ctx.shadowBlur = 0;
          if (this.lensData.cycleNodeIds.has(n.id)) {
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 6 + Math.sin(this._t * 4) * 2, 0, Math.PI * 2);
            ctx.stroke();
          } else if (this.lensData.godNodeIds.has(n.id)) {
            ctx.strokeStyle = "#fb923c";
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
          } else if (this.lensData.orphanNodeIds.has(n.id)) {
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 1.6;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (!this.depFocus && this.lens === "route" && this.lensData?.stepMap?.has(n.id)) {
          const num = this.lensData.stepMap.get(n.id);
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#2dd4bf";
          ctx.beginPath();
          ctx.arc(n.x + n.radius + 3, n.y - n.radius - 3, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#071318";
          ctx.font = '700 10px "JetBrainsMono Nerd Font", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(num), n.x + n.radius + 3, n.y - n.radius - 2.5);
        }
      }

      // Label
      ctx.shadowBlur = 0;
      const showLabel = n.alpha > 0.35 || isHovered || isSelected || isDepMember;
      if (showLabel) {
        const fontSize = n.type === "root" ? 13 : (n.type === "folder" ? 11.5 : 10.5);
        ctx.font = `${n.type !== "file" || isSelected ? "600" : "500"} ${fontSize}px "JetBrainsMono Nerd Font", ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDepCenter ? "#fef08a" : (isSelected || isHovered ? "#ffffff" : "rgba(226, 232, 240, 0.88)");
        ctx.fillText(n.name, n.x, n.y + n.radius + 7);
      }

      ctx.restore();
    }

    ctx.restore();
  }
}
