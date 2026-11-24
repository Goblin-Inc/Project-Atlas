/**
 * Project Atlas — Built-in Interactive Demo Universe
 * Realistic multi-folder project so anyone can test Atlas in 1 click.
 */

export const DEMO_PROJECT = {
  name: "nebula-engine (Demo)",
  root: "demo://nebula-engine",
  skipped: 0,
  files: [
    {
      path: "main.py",
      lines: 24,
      size: 620,
      content: `from core.engine import NebulaEngine
from core.config import load_config
from ui.hud import HudOverlay
from net.sync import StateSync

def bootstrap():
    cfg = load_config("config.json")
    sync = StateSync(cfg.endpoint)
    engine = NebulaEngine(cfg, sync)
    hud = HudOverlay(engine)
    engine.attach_hud(hud)
    engine.run()

if __name__ == "__main__":
    bootstrap()
`,
    },
    {
      path: "config.json",
      lines: 10,
      size: 210,
      content: `{
  "title": "Nebula Engine",
  "fps": 60,
  "endpoint": "wss://relay.nebula.local/v1",
  "theme": "cosmos-dark"
}
`,
    },
    {
      path: "README.md",
      lines: 8,
      size: 240,
      content: `# Nebula Engine
Demo repository for **Project Atlas**.
Click any folder to expand its constellation, then click a file
and hit **"Показать импорты и зависимости"** to see golden dependency rays!
`,
    },
    {
      path: "core/engine.py",
      lines: 34,
      size: 890,
      content: `from core.scheduler import FrameScheduler
from core.events import EventBus
from core.config import Config
from render.pipeline import RenderPipeline

class NebulaEngine:
    def __init__(self, cfg: Config, sync):
        self.cfg = cfg
        self.sync = sync
        self.bus = EventBus()
        self.scheduler = FrameScheduler(cfg.fps)
        self.pipeline = RenderPipeline(self.bus)
        self.hud = None

    def attach_hud(self, hud):
        self.hud = hud

    def tick(self, dt: float):
        self.sync.poll(self.bus)
        self.pipeline.draw(dt)
        if self.hud:
            self.hud.render(dt)

    def run(self):
        self.scheduler.loop(self.tick)
`,
    },
    {
      path: "core/config.py",
      lines: 18,
      size: 410,
      content: `import json

class Config:
    def __init__(self, data: dict):
        self.fps = data.get("fps", 60)
        self.endpoint = data.get("endpoint", "")
        self.theme = data.get("theme", "cosmos-dark")

def load_config(path: str) -> Config:
    with open(path, "r", encoding="utf-8") as f:
        return Config(json.load(f))
`,
    },
    {
      path: "core/events.py",
      lines: 20,
      size: 460,
      content: `class EventBus:
    def __init__(self):
        self._listeners = {}

    def on(self, topic: str, handler):
        self._listeners.setdefault(topic, []).append(handler)

    def emit(self, topic: str, payload=None):
        for fn in self._listeners.get(topic, []):
            fn(payload)
`,
    },
    {
      path: "core/scheduler.py",
      lines: 16,
      size: 360,
      content: `import time

class FrameScheduler:
    def __init__(self, fps: int = 60):
        self.dt = 1.0 / max(1, fps)

    def loop(self, callback):
        while True:
            callback(self.dt)
            time.sleep(self.dt)
`,
    },
    {
      path: "render/pipeline.py",
      lines: 24,
      size: 620,
      content: `from render.camera import Camera2D
from render.shaders import GlowShader
from core.events import EventBus

class RenderPipeline:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.camera = Camera2D()
        self.shader = GlowShader()

    def draw(self, dt: float):
        self.camera.update(dt)
        self.shader.apply(self.camera.matrix())
`,
    },
    {
      path: "render/camera.py",
      lines: 22,
      size: 510,
      content: `from utils.math_vec import Vec2, lerp

class Camera2D:
    def __init__(self):
        self.pos = Vec2(0.0, 0.0)
        self.target = Vec2(0.0, 0.0)
        self.zoom = 1.0

    def focus(self, x: float, y: float):
        self.target = Vec2(x, y)

    def update(self, dt: float):
        self.pos.x = lerp(self.pos.x, self.target.x, dt * 8)
        self.pos.y = lerp(self.pos.y, self.target.y, dt * 8)

    def matrix(self):
        return (self.pos.x, self.pos.y, self.zoom)
`,
    },
    {
      path: "render/shaders.py",
      lines: 15,
      size: 330,
      content: `class GlowShader:
    def __init__(self, intensity: float = 0.85):
        self.intensity = intensity

    def apply(self, matrix):
        return {"matrix": matrix, "glow": self.intensity}
`,
    },
    {
      path: "ui/hud.py",
      lines: 20,
      size: 480,
      content: `from ui.theme import PALETTE
from render.camera import Camera2D

class HudOverlay:
    def __init__(self, engine):
        self.engine = engine
        self.palette = PALETTE

    def render(self, dt: float):
        fps = int(1.0 / max(dt, 0.001))
        return f"FPS: {fps} | accent={self.palette['accent']}"
`,
    },
    {
      path: "ui/theme.py",
      lines: 11,
      size: 240,
      content: `PALETTE = {
    "bg": "#090b14",
    "surface": "#121629",
    "accent": "#b4befe",
    "ray_struct": "#ffffff",
    "ray_dep": "#fbbf24",
}
`,
    },
    {
      path: "net/sync.py",
      lines: 21,
      size: 520,
      content: `from net.protocol import decode_packet
from core.events import EventBus

class StateSync:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint

    def poll(self, bus: EventBus):
        pkt = decode_packet(b"{}")
        if pkt:
            bus.emit("net:packet", pkt)
`,
    },
    {
      path: "net/protocol.py",
      lines: 13,
      size: 290,
      content: `import json

def decode_packet(raw: bytes) -> dict:
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}
`,
    },
    {
      path: "utils/math_vec.py",
      lines: 16,
      size: 310,
      content: `class Vec2:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y

def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))
`,
    },
    {
      path: "utils/legacy_unused.py",
      lines: 9,
      size: 190,
      content: `# Example orphan file with no incoming or outgoing imports
def old_helper(x):
    return x * 42
`,
    },
  ],
};
