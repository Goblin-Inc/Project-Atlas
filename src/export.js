/**
 * Project Atlas — Export Module (Vector SVG Snapshot & Mermaid Diagram)
 * Generates pure SVG directly from graph coordinates so browser Canvas
 * anti-fingerprinting (e.g. Firefox resistFingerprinting) never corrupts exports.
 */

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportUniverseSVG(graph, renderer) {
  const { visibleNodes, structLinks } = graph.getVisible();
  if (!visibleNodes.length) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of visibleNodes) {
    minX = Math.min(minX, n.x - 95);
    maxX = Math.max(maxX, n.x + 95);
    minY = Math.min(minY, n.y - 75);
    maxY = Math.max(maxY, n.y + 85);
  }

  const pad = 60;
  const vx = Math.floor(minX - pad);
  const vy = Math.floor(minY - pad);
  const vw = Math.max(800, Math.ceil(maxX - minX + pad * 2));
  const vh = Math.max(520, Math.ceil(maxY - minY + pad * 2));

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">`,
    `<defs>`,
    `  <radialGradient id="nebula" cx="45%" cy="45%" r="65%">`,
    `    <stop offset="0%" stop-color="#2c3363" stop-opacity="0.35"/>`,
    `    <stop offset="60%" stop-color="#11152c" stop-opacity="0.18"/>`,
    `    <stop offset="100%" stop-color="#070912" stop-opacity="0"/>`,
    `  </radialGradient>`,
    `  <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">`,
    `    <feGaussianBlur stdDeviation="4" result="blur"/>`,
    `    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`,
    `  </filter>`,
    `</defs>`,
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#070912"/>`,
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#nebula)"/>`
  );

  // 1. White structural rays
  for (const { from, to } of structLinks) {
    const a = Math.min(from.alpha ?? 1, to.alpha ?? 1);
    const op = (a > 0.5 ? 0.42 : 0.1).toFixed(2);
    const w = from.type === "root" ? 1.6 : 1.15;
    parts.push(
      `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="#ebf0ff" stroke-opacity="${op}" stroke-width="${w}"/>`
    );
  }

  // 2. Active overlay rays (golden deps / blast / health / route)
  const drawCurvedRay = (from, to, color) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const bend = Math.min(75, dist * 0.18);
    const cx = (from.x + to.x) / 2 + (-dy / dist) * bend;
    const cy = (from.y + to.y) / 2 + (dx / dist) * bend;
    parts.push(
      `<path d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.2" filter="url(#glow)"/>`
    );
  };

  if (renderer.depFocus) {
    for (const l of renderer.depFocus.depLinks) drawCurvedRay(l.from, l.to, "#facc15");
  } else if (renderer.lens === "blast" && renderer.lensData) {
    for (const e of renderer.lensData.edges) {
      const col = e.dist === 1 ? "#f38ba8" : (e.dist === 2 ? "#fab387" : "#f9e2af");
      drawCurvedRay(e.from, e.to, col);
    }
  } else if (renderer.lens === "health" && renderer.lensData) {
    for (const e of renderer.lensData.cycleEdges) drawCurvedRay(e.from, e.to, "#ef4444");
  } else if (renderer.lens === "route" && renderer.lensData) {
    for (const e of renderer.lensData.edges) drawCurvedRay(e.from, e.to, "#2dd4bf");
  }

  // 3. Nodes & Labels
  for (const n of visibleNodes) {
    const op = Math.max(0.12, Math.min(1, n.alpha ?? 1)).toFixed(2);
    const x = n.x.toFixed(1);
    const y = n.y.toFixed(1);
    parts.push(`<g opacity="${op}">`);

    if (n.type === "root") {
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${n.radius + 8}" fill="none" stroke="#b4befe" stroke-opacity="0.38" stroke-dasharray="4 4"/>`,
        `<circle cx="${x}" cy="${y}" r="${n.radius}" fill="#161b33" stroke="#e4e6f8" stroke-width="2.5" filter="url(#glow)"/>`
      );
    } else if (n.type === "folder") {
      const fill = n.expanded ? "rgba(180,190,254,0.24)" : "#1e223c";
      const badge = n.expanded ? "−" : `+${n.children.length}`;
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${n.radius}" fill="${fill}" stroke="#b4befe" stroke-width="1.8"/>`,
        `<text x="${x}" y="${(n.y + 3.5).toFixed(1)}" text-anchor="middle" fill="#e4e6f8" font-family="monospace" font-size="10" font-weight="600">${escXml(badge)}</text>`
      );
    } else {
      const isCenter = renderer.depFocus && renderer.depFocus.center === n;
      const fill = isCenter ? "#facc15" : n.color;
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${n.radius + 5}" fill="${fill}" fill-opacity="0.18"/>`,
        `<circle cx="${x}" cy="${y}" r="${n.radius}" fill="${fill}"/>`
      );
    }

    if ((n.alpha ?? 1) > 0.35 || n === renderer.selectedNode) {
      const fsize = n.type === "root" ? 13 : (n.type === "folder" ? 11.5 : 10.5);
      parts.push(
        `<text x="${x}" y="${(n.y + n.radius + 17).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-family="monospace" font-size="${fsize}" font-weight="${n.type !== "file" ? "600" : "500"}">${escXml(n.name)}</text>`
      );
    }
    parts.push(`</g>`);
  }

  // Subtle watermark
  parts.push(
    `<text x="${vx + vw - 18}" y="${vy + vh - 16}" text-anchor="end" fill="#8b90b2" font-family="monospace" font-size="12">✦ Project Atlas · ${escXml(graph.project.name)}</text>`,
    `</svg>`
  );

  const safeName = graph.project.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  downloadTextFile(`${safeName}_atlas.svg`, parts.join("\n"), "image/svg+xml;charset=utf-8");
}

export function generateMermaid(graph) {
  const lines = ["graph LR"];
  const idMap = new Map();
  let seq = 0;

  const getId = (path) => {
    if (!idMap.has(path)) idMap.set(path, `N${++seq}`);
    return idMap.get(path);
  };

  let edgeCount = 0;
  for (const [src, targets] of graph.importsMap.entries()) {
    for (const dst of targets) {
      const a = getId(src);
      const b = getId(dst);
      lines.push(`  ${a}["${src}"] --> ${b}["${dst}"]`);
      edgeCount++;
    }
  }

  if (edgeCount === 0) {
    for (const n of graph.nodes.values()) {
      if (n.parent) {
        const a = getId(n.parent.path || graph.project.name);
        const b = getId(n.path || n.name);
        lines.push(`  ${a}["${n.parent.name}"] --> ${b}["${n.name}"]`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

export function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
