#!/usr/bin/env python3
"""
Project Atlas — Local CLI & Zero-Dependency Server (v0.1.0-alpha)
Usage:
    atlas [path/to/project] [--port 4173] [--no-browser]
"""

import argparse
import http.server
import json
import mimetypes
import os
import socketserver
import threading
import urllib.parse
import webbrowser
from pathlib import Path

IGNORE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv",
    "env", ".mypy_cache", ".pytest_cache", ".ruff_cache", "dist", "build",
    "target", ".gradle", ".idea", ".vscode", ".next", ".nuxt", "coverage",
    ".cache", "bin", "obj", "out",
}

BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
    ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".class", ".pyc", ".wasm",
    ".ttf", ".otf", ".woff", ".woff2", ".eot", ".db", ".sqlite", ".sqlite3",
}

MAX_FILE_BYTES = 350_000
MAX_FILES = 1500

APP_ROOT = Path(__file__).resolve().parent
WEB_DIR = APP_ROOT / "web"


def scan_project(root_path: Path) -> dict:
    root_path = root_path.resolve()
    files: list[dict] = []
    skipped = 0

    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in IGNORE_DIRS and not d.startswith(".")
        )
        filenames.sort()

        for fname in filenames:
            if fname.startswith(".") and fname not in {".env.example", ".gitignore"}:
                continue
            fpath = Path(dirpath) / fname
            ext = fpath.suffix.lower()
            if ext in BINARY_EXTS:
                skipped += 1
                continue
            try:
                size = fpath.stat().st_size
            except OSError:
                continue
            if size > MAX_FILE_BYTES:
                skipped += 1
                continue
            if len(files) >= MAX_FILES:
                skipped += 1
                continue

            try:
                raw = fpath.read_bytes()
                if b"\x00" in raw[:4096]:
                    skipped += 1
                    continue
                content = raw.decode("utf-8", errors="replace")
            except OSError:
                continue

            rel = fpath.relative_to(root_path).as_posix()
            files.append({
                "path": rel,
                "size": size,
                "lines": content.count("\n") + 1,
                "content": content,
            })

    return {
        "name": root_path.name,
        "root": str(root_path),
        "files": files,
        "skipped": skipped,
    }


def make_handler(project_path: Path):
    project_cache = {"data": None}

    class AtlasHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _send_json(self, obj: dict, status: int = 200):
            payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            if path == "/api/project":
                qs = urllib.parse.parse_qs(parsed.query)
                if project_cache["data"] is None or "refresh" in qs:
                    project_cache["data"] = scan_project(project_path)
                self._send_json(project_cache["data"])
                return

            if path == "/api/health":
                self._send_json({"ok": True, "version": "1.0.0", "project": project_path.name})
                return

            # Serve static files from web/
            rel = "index.html" if path in ("/", "") else path.lstrip("/")
            target = (WEB_DIR / rel).resolve()
            if not str(target).startswith(str(WEB_DIR)) or not target.is_file():
                self.send_error(404, "Not Found")
                return

            ctype, _ = mimetypes.guess_type(str(target))
            if target.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            elif target.suffix == ".css":
                ctype = "text/css; charset=utf-8"
            elif target.suffix == ".html":
                ctype = "text/html; charset=utf-8"

            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

    return AtlasHandler


def main() -> int:
    parser = argparse.ArgumentParser(description="Project Atlas — Interactive Code Universe")
    parser.add_argument("path", nargs="?", default=".", help="Project folder to explore")
    parser.add_argument("--port", type=int, default=4173, help="Local HTTP port (default: 4173)")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser")
    args = parser.parse_args()

    target = Path(args.path).expanduser().resolve()
    if not target.is_dir():
        print(f"Error: directory not found: {target}")
        return 1

    socketserver.TCPServer.allow_reuse_address = True
    handler = make_handler(target)

    # Pick first available port starting at args.port
    httpd = None
    port = args.port
    for p in range(args.port, args.port + 20):
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", p), handler)
            port = p
            break
        except OSError:
            continue

    if httpd is None:
        print("Error: could not bind local port.")
        return 1

    url = f"http://127.0.0.1:{port}"
    print(f"\n  ✦ Project Atlas v1.0.0")
    print(f"  ✦ Project: {target}")
    print(f"  ✦ Open:    {url}")
    print(f"  ✦ Press Ctrl+C to stop\n")

    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  ✦ Project Atlas stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
