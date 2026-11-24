/**
 * Project Atlas — GitHub Public Repository Loader (Client-side, Zero-Backend)
 */

const IGNORE_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
  "target", ".idea", ".vscode", ".next", "coverage", "vendor", "out",
]);

const CODE_EXTS = new Set([
  "js", "jsx", "mjs", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp",
  "cc", "rs", "go", "lua", "css", "html", "json", "md", "sh", "yml", "yaml", "toml",
]);

const MAX_FILES = 90;
const MAX_CONCURRENCY = 8;

export function parseGitHubInput(input) {
  const clean = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const urlMatch = clean.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = clean.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

export async function loadGitHubRepo(input, onProgress) {
  const parsed = parseGitHubInput(input);
  if (!parsed) throw new Error("Неверный формат. Используй owner/repo или ссылку на GitHub.");

  const { owner, repo } = parsed;
  onProgress?.(`Подключаюсь к ${owner}/${repo}...`);

  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error(`Репозиторий ${owner}/${repo} не найден (или приватный).`);
    if (repoRes.status === 403) throw new Error("Достигнут лимит GitHub API (60 запросов/час). Попробуй позже или открой локальную папку.");
    throw new Error(`Ошибка GitHub API (${repoRes.status})`);
  }
  const repoInfo = await repoRes.json();
  const branch = repoInfo.default_branch || "main";

  onProgress?.(`Читаю дерево ветки ${branch}...`);
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) throw new Error(`Не удалось загрузить дерево репозитория (${treeRes.status})`);
  const treeData = await treeRes.json();

  const candidates = (treeData.tree || [])
    .filter((item) => item.type === "blob" && (item.size || 0) <= 220_000)
    .filter((item) => {
      const parts = item.path.split("/");
      if (parts.some((p) => IGNORE_DIRS.has(p) || (p.startsWith(".") && p !== ".gitignore"))) return false;
      const ext = (parts[parts.length - 1].split(".").pop() || "").toLowerCase();
      return CODE_EXTS.has(ext);
    })
    .slice(0, MAX_FILES);

  if (candidates.length === 0) {
    throw new Error("В репозитории не найдено поддерживаемых исходных файлов.");
  }

  const files = [];
  let done = 0;

  async function worker(queue) {
    while (queue.length > 0) {
      const item = queue.shift();
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
      try {
        const res = await fetch(rawUrl);
        if (res.ok) {
          const content = await res.text();
          if (!content.includes("\u0000")) {
            files.push({
              path: item.path,
              size: item.size || content.length,
              lines: content.split("\n").length,
              content,
            });
          }
        }
      } catch {
        // skip single failed file
      }
      done++;
      onProgress?.(`Загружено ${done} / ${candidates.length} файлов...`);
    }
  }

  const queue = [...candidates];
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, () => worker(queue)));

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    name: `${owner}/${repo}`,
    root: `github://${owner}/${repo}@${branch}`,
    files,
    skipped: Math.max(0, (treeData.tree || []).length - files.length),
  };
}
