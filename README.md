# ✦ Project Atlas

> **Explore any codebase as a living interactive universe — understand architecture in 30 seconds.**

[Русская версия](README_Ru.md)

**Project Atlas** turns local folders and public GitHub repositories into an interactive, 60 FPS constellation map. Instead of dumping 500 overlapping nodes at once, Atlas starts from the project root and lets you expand folders organically, inspect syntax-highlighted code on the right, and illuminate golden dependency rays on demand.

---

## ✨ Key Features

- **🌌 Progressive-Disclosure Constellations** — starts clean at the root; click any folder to expand its star cluster with organic constellation layout, zero-gravity float, and automatic dimming of inactive branches on large repositories.
- **⚡ Golden Dependency Mode** — click any file and hit **"Show imports & dependencies"**: Atlas auto-expands connected branches, smoothly frames the camera, dims unrelated files, and draws animated golden dependency rays over the white structural rays.
- **🔭 4 Architecture Lenses:**
  - **🌌 Structure** — clean constellation overview of folders & files.
  - **🔥 Blast Radius** — click any file to see the BFS wave of direct & indirect downstream files impacted by changes.
  - **🩺 Health** — computes a 0–100 Health Score and highlights circular dependencies, monoliths (god-files), and orphan code files.
  - **🧭 Reading Route** — automatically detects entry points and numbers the recommended onboarding trail (`1 → 2 → 3 → ...`).
- **🔍 `Ctrl + K` Universe Teleport** — instant fuzzy search across files & folders; pressing Enter expands the path and flies the camera straight to the target star.
- **🐙 Zero-Backend GitHub Loader + Local Folder Picker** — paste any `owner/repo` URL, open a local folder directly in the browser, or launch via CLI (`atlas .`) with zero external dependencies.
- **📸 One-Click Export** — save a crisp vector **SVG** snapshot of the universe (immune to browser Canvas anti-fingerprinting) or export the dependency graph as **Mermaid (`.mmd`)** (copied to clipboard automatically).
- **🧠 Multi-Language Static Parser** — Python, JavaScript/TypeScript, Java, C/C++, Rust, Go, Lua, HTML, CSS.

---

## 🚀 Quick Start

### Option 1 — Local CLI (Linux / macOS / Windows with Python 3)
```bash
git clone https://github.com/Goblin-Inc/Project-Atlas.git
cd Project-Atlas
./install.sh

# Launch inside any project folder:
atlas .
# or specify a path:
atlas ~/Projects/my-app
```

### Option 2 — Pure Static Web App (Zero Server)
Simply open `web/index.html` on any static host (e.g., GitHub Pages) to use the **built-in Demo**, **Local Folder Picker**, and **GitHub Repo Loader** directly in the browser.

---

## ⌨️ Controls & Shortcuts

| Action | Control |
|---|---|
| Expand / collapse folder | Click folder star |
| Inspect file code & symbols | Click file star |
| Show golden dependency rays | Click **⚡ Show imports & dependencies** in inspector |
| Teleport to any file / folder | `Ctrl + K` |
| Pan / Zoom universe | Drag canvas / Mouse wheel |
| Exit lens or dependency focus | `Esc` |

---

## 🛠️ Tech Stack
- **Frontend:** Vanilla ES Modules + HTML5 Canvas 2D (60 FPS, zero build step, zero npm bloat)
- **CLI Server:** Python 3 standard library (`http.server`, zero third-party packages)

## 📄 License
MIT © [Goblin-Inc](https://github.com/Goblin-Inc)
