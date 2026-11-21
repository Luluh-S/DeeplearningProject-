// Hand-drawn rendering helpers: seeded wobbly shapes, sketch borders, doodles.
const NS = "http://www.w3.org/2000/svg";

export const INK = {
  ink: "#1D2232", coral: "#E8574A", lavender: "#7B62B8", sage: "#4FA35A",
  yellow: "#E79A00", sky: "#3D8FD1", light: "#FFFDF8",
};
export const FRAME_COLORS = ["#E8574A", "#7B62B8", "#4FA35A", "#E79A00", "#3D8FD1", "#F39A3D"];

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const f = (n) => n.toFixed(1);

/** A slightly bowed, overshooting line: the signature of a hand-drawn stroke. */
function sketchLine(x1, y1, x2, y2, r, rough) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const bow = (r() - 0.5) * rough * Math.min(len / 50, 3);
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const ox = (x2 - x1) / len, oy = (y2 - y1) / len;
  const s0 = (r() * 0.8) * rough, s1 = (r() * 0.8) * rough; // overshoot
  const ax = x1 - ox * s0 + (r() - 0.5) * rough, ay = y1 - oy * s0 + (r() - 0.5) * rough;
  const bx = x2 + ox * s1 + (r() - 0.5) * rough, by = y2 + oy * s1 + (r() - 0.5) * rough;
  const mx = (x1 + x2) / 2 + nx * bow, my = (y1 + y2) / 2 + ny * bow;
  return `M${f(ax)} ${f(ay)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`;
}

export function sketchRect(x, y, w, h, seed, { rough = 1.6, passes = 2 } = {}) {
  const r = rng(seed);
  let d = "";
  for (let p = 0; p < passes; p++) {
    const j = () => (r() - 0.5) * rough * 1.2;
    const c = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]];
    for (let i = 0; i < 4; i++) {
      const [a, b] = [c[i], c[(i + 1) % 4]];
      d += sketchLine(a[0], a[1], b[0], b[1], r, rough);
    }
  }
  return d;
}

export function sketchEllipse(cx, cy, rx, ry, seed, { rough = 1.5, passes = 2 } = {}) {
  const r = rng(seed);
  let d = "";
  for (let p = 0; p < passes; p++) {
    const steps = 14, start = r() * Math.PI * 2, extra = 0.25 + r() * 0.3;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = start + (i / steps) * (Math.PI * 2 + extra);
      const k = 1 + (r() - 0.5) * 0.05 * rough;
      pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    d += `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
    }
  }
  return d;
}

/* ---------------------------------------------------------------- doodles */
export const DOODLES = {
  star: (x, y, s) => {
    let d = "";
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      d += `${i ? "L" : "M"}${f(x + Math.cos(a) * s)} ${f(y + Math.sin(a) * s)}`;
    }
    return d;
  },
  flower: (x, y, s) => {
    let d = "";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const px = x + Math.cos(a) * s * 0.55, py = y + Math.sin(a) * s * 0.55;
      d += `M${f(px + s * 0.38)} ${f(py)}a${f(s * 0.38)} ${f(s * 0.38)} 0 1 0 0.1 0`;
    }
    return d + `M${f(x + s * 0.22)} ${f(y)}a${f(s * 0.22)} ${f(s * 0.22)} 0 1 0 0.1 0`;
  },
  spiral: (x, y, s) => {
    let d = `M${f(x)} ${f(y)}`;
    for (let i = 1; i < 40; i++) {
      const a = i * 0.45, rr = (i / 40) * s;
      d += `L${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr)}`;
    }
    return d;
  },
  sparkle: (x, y, s) => `M${f(x)} ${f(y - s)}Q${f(x + s * 0.15)} ${f(y - s * 0.15)} ${f(x + s)} ${f(y)}Q${f(x + s * 0.15)} ${f(y + s * 0.15)} ${f(x)} ${f(y + s)}Q${f(x - s * 0.15)} ${f(y + s * 0.15)} ${f(x - s)} ${f(y)}Q${f(x - s * 0.15)} ${f(y - s * 0.15)} ${f(x)} ${f(y - s)}Z`,
  heart: (x, y, s) => `M${f(x)} ${f(y + s * 0.7)}C${f(x - s * 1.2)} ${f(y - s * 0.1)} ${f(x - s * 0.5)} ${f(y - s * 0.9)} ${f(x)} ${f(y - s * 0.3)}C${f(x + s * 0.5)} ${f(y - s * 0.9)} ${f(x + s * 1.2)} ${f(y - s * 0.1)} ${f(x)} ${f(y + s * 0.7)}`,
  swirl: (x, y, s) => `M${f(x - s)} ${f(y)}c${f(s * 0.4)} ${f(-s * 0.8)} ${f(s * 0.9)} ${f(-s * 0.8)} ${f(s)} 0s${f(s * 0.5)} ${f(s * 0.8)} ${f(s)} 0`,
};

export const CHECK_PATH = "M6 26 C12 30 16 36 20 42 C28 26 38 14 52 6";
export const CROSS_PATH = "M10 10 C22 22 34 32 46 46 M46 10 C34 20 22 34 10 46";

/** Unique hand-drawn crayon frame for an artwork. */
export function frameSVG(w, h, seed) {
  const r = rng(seed);
  const color = FRAME_COLORS[seed % FRAME_COLORS.length];
  const pad = 10;
  const outer = sketchRect(pad, pad, w - pad * 2, h - pad * 2, seed, { rough: 4, passes: 2 });
  const inner = sketchRect(pad + 14, pad + 14, w - (pad + 14) * 2, h - (pad + 14) * 2, seed + 7, { rough: 1.6, passes: 1 });
  const kinds = ["star", "flower", "spiral", "sparkle", "heart", "swirl"];
  const corners = [[pad + 6, pad + 6], [w - pad - 6, pad + 6], [w - pad - 6, h - pad - 6], [pad + 6, h - pad - 6]];
  const pick = corners[(r() * 4) | 0];
  const kind = kinds[(r() * kinds.length) | 0];
  const doodleColor = FRAME_COLORS[(seed + 2) % FRAME_COLORS.length];
  return `<svg class="art-frame-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <path class="draw" pathLength="1" d="${outer}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" filter="url(#crayon)"/>
    <path class="draw draw--late" pathLength="1" d="${inner}" fill="none" stroke="${INK.ink}" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>
    <path class="draw draw--doodle" pathLength="1" d="${DOODLES[kind](pick[0], pick[1], 22)}" fill="none" stroke="${doodleColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#crayon)"/>
  </svg>`;
}

/* ---------------------------------------------------------------- sketch borders */
const mounted = new WeakSet();
let counter = 0;

/** Draw a sketchy border on top of an element: <div data-sketch="ink" data-sketch-w="2"> */
export function mountSketch(el) {
  if (mounted.has(el)) return;
  mounted.add(el);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "sketch-svg");
  svg.setAttribute("aria-hidden", "true");
  el.appendChild(svg);
  const seed = Number(el.dataset.seed) || hashString((el.id || el.className || "") + ++counter);
  const color = INK[el.dataset.sketch] || el.dataset.sketch || INK.ink;
  const width = Number(el.dataset.sketchW || 2);
  const rough = Number(el.dataset.sketchRough || 1.5);
  const shape = el.dataset.sketchShape || "rect";
  let last = "";
  const draw = () => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h || `${w}x${h}` === last) return;
    last = `${w}x${h}`;
    const inset = width + 1.5;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const d = shape === "ellipse"
      ? sketchEllipse(w / 2, h / 2, w / 2 - inset, h / 2 - inset, seed, { rough })
      : sketchRect(inset, inset, w - inset * 2, h - inset * 2, seed, { rough });
    svg.innerHTML = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  new ResizeObserver(draw).observe(el);
}

export function sketchAll(root = document) {
  root.querySelectorAll("[data-sketch]").forEach(mountSketch);
}
