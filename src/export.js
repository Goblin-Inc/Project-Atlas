/**
 * Project Atlas — Export Module (PNG Snapshot & Mermaid Diagram)
 */

export function exportCanvasPNG(canvas, projectName = "project-atlas") {
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const link = document.createElement("a");
  link.download = `${safeName}_atlas.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function generateMermaid(graph) {
  const lines = ["graph LR"];
  const idMap = new Map();
  let seq = 0;

  const getId = (path) => {
    if (!idMap.has(path)) {
      idMap.set(path, `N${++seq}`);
    }
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
    // Fallback to folder hierarchy if no imports exist
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

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
