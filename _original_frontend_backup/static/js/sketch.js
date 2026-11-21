// Sketchbook canvas for the AI Art Studio: crayon, colored pencil, eraser.
// The canvas is filled with OPAQUE WHITE and the export is composited onto
// white again. The paper texture on screen is a CSS overlay only, so the
// model always receives a plain white page with the visitor's strokes.

export const PALETTE = [
  "#1F2A44", "#4A4A4A", "#E2483D", "#F18F7A", "#F5B83D", "#F5D77A",
  "#5FA35A", "#A8BFA4", "#3D7FD9", "#8FB8E8", "#8C6BC8", "#A0673E",
];

const textureCache = new Map();
/** Waxy crayon texture: the colour with tiny random gaps (paper showing through). */
function crayonPattern(ctx, color) {
  if (textureCache.has(color)) return textureCache.get(color);
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const x = c.getContext("2d");
  x.fillStyle = color;
  x.fillRect(0, 0, 96, 96);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 900; i++) {
    x.globalAlpha = 0.25 + Math.random() * 0.6;
    const w = 0.6 + Math.random() * 1.8;
    x.fillRect(Math.random() * 96, Math.random() * 96, w, 0.6 + Math.random() * 1.2);
  }
  const pattern = ctx.createPattern(c, "repeat");
  textureCache.set(color, pattern);
  return pattern;
}

export class Sketch {
  constructor(canvas, { onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.color = PALETTE[0];
    this.size = 12;
    this.tool = "crayon"; // crayon | pencil | eraser
    this.undoStack = [];
    this.maxUndo = 30;
    this.dirty = false;
    this.onChange = onChange || (() => {});
    this.drawing = false;
    this.points = [];
    this.fillWhite();
    this.bind();
  }

  get eraser() { return this.tool === "eraser"; }
  set eraser(on) { this.tool = on ? "eraser" : "crayon"; }

  fillWhite() {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.canvas.width,
      y: ((e.clientY - r.top) / r.height) * this.canvas.height,
      p: e.pressure && e.pointerType === "pen" ? e.pressure : 0.6,
    };
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.pushUndo();
      this.drawing = true;
      this.points = [this.pos(e)];
      this.dot(this.points[0]);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.drawing) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) this.extend(this.pos(ev));
    });
    const end = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.points = [];
      this.dirty = true;
      this.onChange();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", end);
  }

  style() {
    const { ctx } = this;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1;
    if (this.tool === "eraser") {
      ctx.strokeStyle = ctx.fillStyle = "#FFFFFF";
      ctx.lineWidth = this.size * 1.8;
    } else if (this.tool === "pencil") {
      ctx.strokeStyle = ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = Math.max(1.6, this.size * 0.3);
    } else {
      const pat = crayonPattern(ctx, this.color);
      ctx.strokeStyle = ctx.fillStyle = pat;
      ctx.lineWidth = this.size;
    }
  }

  dot(p) {
    this.style();
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, this.ctx.lineWidth / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  segment(a, b, c) {
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    this.ctx.beginPath();
    this.ctx.moveTo(m1.x, m1.y);
    this.ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
    this.ctx.stroke();
  }

  extend(p) {
    const pts = this.points;
    pts.push(p);
    if (pts.length < 3) return;
    const [a, b, c] = pts.slice(-3);
    this.style();
    this.segment(a, b, c);
    if (this.tool === "crayon") {
      // a second, slightly offset, thinner pass gives the waxy, layered look
      const j = this.size * 0.18;
      const o = (q) => ({ x: q.x + j, y: q.y - j * 0.6 });
      this.ctx.lineWidth = this.size * 0.55;
      this.segment(o(a), o(b), o(c));
    }
  }

  pushUndo() {
    this.undoStack.push({ image: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height), dirty: this.dirty });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last) return;
    this.ctx.putImageData(last.image, 0, 0);
    this.dirty = last.dirty;
    this.onChange();
  }

  clear() {
    if (!this.dirty) return;
    this.pushUndo();
    this.fillWhite();
    this.dirty = false;
    this.onChange();
  }

  /** PNG blob composited onto opaque white. */
  toBlob() {
    const out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#FFFFFF";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(this.canvas, 0, 0);
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"));
  }
}

/** A crayon-shaped colour button. */
export function crayonSVG(color) {
  return `<svg viewBox="0 0 26 58" aria-hidden="true">
    <path d="M6 18L13 2l7 16z" fill="${color}" stroke="#1F2A44" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="5" y="17" width="16" height="40" rx="2.5" fill="${color}" stroke="#1F2A44" stroke-width="1.6"/>
    <rect x="5" y="24" width="16" height="16" fill="#FFFDF7" opacity=".55"/>
    <path d="M7 28h12M7 32h9" stroke="#1F2A44" stroke-width="1.2" opacity=".5"/>
  </svg>`;
}
