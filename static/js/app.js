import { api, translateServerMessage } from "./api.js";
import { summarize, winnerMessage, roundSummary, formatScore, pad2, labelAr } from "./game.js";
import { Sketch, PALETTE, crayonSVG } from "./sketch.js";
import { Pip } from "./pip.js";
import { frameSVG, sketchAll, hashString, CHECK_PATH, CROSS_PATH, DOODLES } from "./doodle.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const t = (ms) => (reducedMotion ? 0 : ms);
const pickLine = (lines, i) => lines[i % lines.length];

const state = { health: null, game: null, lastResult: null };
const pips = {};

/* ================================================================ router */
const ROOMS = ["entrance", "challenge", "verdict", "studio", "behind"];
let firstRoute = true;

function route() {
  let name = (location.hash.replace(/^#\/?/, "") || "entrance").split("?")[0];
  if (!ROOMS.includes(name)) name = "entrance";
  if (name === "verdict" && !state.lastResult) name = "challenge";
  document.body.dataset.room = name;

  for (const room of ROOMS) {
    const el = $(`#room-${room}`);
    const active = room === name;
    el.hidden = !active;
    if (active && !firstRoute) {
      el.classList.remove("is-entering");
      void el.offsetWidth;
      el.classList.add("is-entering");
    }
  }
  $("#room-entrance").classList.remove("is-entering-door", "is-zooming");
  $$("[data-nav]").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === name || (name === "verdict" && a.dataset.nav === "challenge")));
  document.title = {
    entrance: "شخبط وخمّن! · Little Minds AI",
    challenge: "التحدي · شخبط وخمّن!",
    verdict: "النتيجة النهائية · شخبط وخمّن!",
    studio: "مرسم هيا · شخبط وخمّن!",
    behind: "كيف تفكّر هيا؟ · شخبط وخمّن!",
  }[name];

  if (name === "verdict") renderVerdict(state.lastResult);
  if (name === "behind") initBehind();
  if (name === "challenge" && !state.game) pips.intro.mood("idle").say("مستعد؟ أنا أُصيب في نحو 7 من كل 10 رسومات. لنرَ مَن يسبق!");
  if (!firstRoute) window.scrollTo({ top: 0 });
  firstRoute = false;
}

/* ================================================================ entrance */
function initEntrance() {
  const scene = $("#scene");
  const layers = $$(".layer", scene);
  if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    let raf = 0;
    window.addEventListener("pointermove", (e) => {
      if ($("#room-entrance").hidden) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
        for (const l of layers) {
          const d = Number(l.dataset.depth);
          l.style.transform = `translate(${-x * d * 40}px, ${-y * d * 16}px)`;
        }
      });
    });
  }

  $("#enterGallery").addEventListener("click", async (e) => {
    e.preventDefault();
    const room = $("#room-entrance");
    if (reducedMotion) { location.hash = "#/challenge"; return; }
    pips.hero.mood("celebrate").say("تفضّل بالدخول!");
    room.classList.add("is-entering-door");
    await wait(650);
    room.classList.add("is-zooming");
    await wait(850);
    location.hash = "#/challenge";
  });

  setTimeout(() => pips.hero.mood("idle").say("أهلاً! أنا هيا، تعلّمت من 7,382 رسمة لأطفال. تظن أنك تقدر تسبقني؟"), t(2200));
}

/* ================================================================ health / status */
async function loadHealth() {
  const pill = $("#statusPill");
  try {
    const h = await api.health();
    state.health = h;
    const mode = h.prediction_mode;
    pill.dataset.mode = mode;
    pill.querySelector("span").textContent = { live: "النموذج يعمل مباشرة", cached: "تخمينات مخزَّنة", offline: "النموذج غير متصل" }[mode];
    pill.title = {
      live: "تُحسب تخمينات هيا مباشرة بواسطة final_model.keras",
      cached: "النموذج الحي غير محمَّل. يستخدم التحدي تخمينات حقيقية حسبها final_model.keras مسبقاً.",
      offline: translateServerMessage(h.model.error) || "النموذج غير محمَّل.",
    }[mode];
    if (h.gallery && h.gallery.source) $("#introSource").textContent = `الرسومات: ${h.gallery.source}. هيا لم ترَها أبداً وهي تتعلّم.`;
    updateStudioAvailability();
  } catch {
    pill.dataset.mode = "offline";
    pill.querySelector("span").textContent = "الخادم غير متصل";
  }
}

/* ================================================================ challenge */
const el = {};
function cacheChallengeEls() {
  Object.assign(el, {
    intro: $("#challengeIntro"), stage: $("#stage"), frame: $("#frame"), img: $("#artImage"), frameSketch: $("#frameSketch"),
    artNo: $("#artNo"), artTheme: $("#artTheme"), roundNow: $("#roundNow"), roundTotal: $("#roundTotal"),
    scoreHuman: $("#scoreHuman"), scoreAI: $("#scoreAI"), dots: $("#progressDots"),
    ask: $("#phaseAsk"), reveal: $("#phaseReveal"), lock: $("#lockAnswer"), next: $("#nextArtwork"),
    choices: $$(".choice"), stamp: $("#stamp"), humanValue: $("#humanValue"), aiValue: $("#aiValue"),
    aiScore: $("#aiScore"), humanMark: $("#humanMark"), aiMark: $("#aiMark"), cardHuman: $("#cardHuman"),
    cardAI: $("#cardAI"), truth: $("#truth"), truthValue: $("#truthValue"), truthSummary: $("#truthSummary"),
    sourceBadge: $("#sourceBadge"), roundError: $("#roundError"), introError: $("#challengeError"),
  });
}

const STAR = "M14 2l3.6 7.6 8.4 1.1-6.1 5.8 1.5 8.3L14 20.8l-7.4 4 1.5-8.3L2 10.7l8.4-1.1z";

async function startChallenge() {
  const btn = $("#startChallenge");
  btn.disabled = true;
  btn.classList.add("is-busy");
  el.introError.hidden = true;
  try {
    const s = await api.newSession();
    state.game = { sessionId: s.session_id, artworks: s.artworks, index: 0, rounds: [], choice: null, phase: "ask", seed: hashString(s.session_id) };
    $("#artMeta").textContent = `فنان صغير مجهول · ${s.source || "بيانات KIDO"}`;
    el.roundTotal.textContent = pad2(s.artworks.length);
    el.dots.style.setProperty("--n", s.artworks.length);
    el.dots.innerHTML = s.artworks.map(() => `<li><svg viewBox="0 0 28 28"><path d="${STAR}"/></svg></li>`).join("");
    el.scoreHuman.textContent = "0";
    el.scoreAI.textContent = "0";
    el.intro.hidden = true;
    el.stage.hidden = false;
    renderRound();
  } catch (err) {
    el.introError.textContent = err.status === 503
      ? "لم يُثبَّت المعرض على هذا الخادم بعد. أضف صور المعرض (راجع README ← 'Build the gallery')."
      : err.message;
    el.introError.hidden = false;
    pips.intro.mood("oops").say("همم، لا أجد الرسومات الآن.");
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
  }
}

function preload(url) { const i = new Image(); i.src = url; }

function drawFrame() {
  const g = state.game;
  const w = el.frame.offsetWidth, h = el.frame.offsetHeight;
  if (!g || !w) return;
  el.frameSketch.innerHTML = frameSVG(w, h, (g.seed + g.index * 7919) % 100000);
}

const ROUND_LINES = [
  "انظر جيداً… ما الذي طُلب من هذا الطفل أن يرسمه؟",
  "رسمة جديدة! ثق بعينيك.",
  "انظر إلى الصورة كاملة، لا إلى زاوية واحدة فقط.",
  "دورك أولاً… وأنا مغمضة عينيّ!",
  "واحدة أخرى! ما رأيك؟",
];

function renderRound() {
  const g = state.game;
  const art = g.artworks[g.index];
  g.choice = null;
  g.phase = "ask";

  el.roundNow.textContent = pad2(g.index + 1);
  el.artNo.textContent = `الرسمة رقم ${pad2(g.index + 1)}`;
  el.artTheme.innerHTML = "الموضوع: <b>مخفي</b>";
  el.artTheme.classList.remove("is-revealed");
  $$("li", el.dots).forEach((li, i) => {
    li.classList.toggle("is-done", i < g.index);
    li.classList.toggle("is-current", i === g.index);
  });

  el.ask.hidden = false;
  el.reveal.hidden = true;
  el.roundError.hidden = true;
  // wipe the previous round's reveal so nothing lingers in the DOM
  el.truth.classList.remove("is-revealed");
  el.truthValue.textContent = "?";
  el.truthSummary.textContent = "";
  el.humanValue.textContent = "?";
  el.aiValue.textContent = "?";
  el.aiScore.textContent = "";
  el.humanMark.className = el.aiMark.className = "vcard__mark";
  el.humanMark.innerHTML = el.aiMark.innerHTML = "";
  el.lock.disabled = true;
  el.choices.forEach((c) => { c.disabled = false; c.setAttribute("aria-checked", "false"); c.classList.remove("is-dimmed", "is-locked"); });
  pips.game.mood("idle").say(g.index === 0 ? "الجولة الأولى! ما الذي طُلب من هذا الطفل أن يرسمه؟" : pickLine(ROUND_LINES, g.index));

  el.frame.classList.remove("is-shown", "is-scanning");
  el.frame.classList.add("is-loading");
  el.frameSketch.innerHTML = "";
  el.img.onload = () => {
    el.frame.classList.remove("is-loading");
    requestAnimationFrame(() => { el.frame.classList.add("is-shown"); drawFrame(); });
  };
  el.img.onerror = () => {
    el.frame.classList.remove("is-loading");
    el.roundError.textContent = "تعذّر تحميل هذه الرسمة.";
    el.roundError.hidden = false;
  };
  el.img.src = art.image_url;
  const nextArt = g.artworks[g.index + 1];
  if (nextArt) preload(nextArt.image_url);
}

function choose(choice) {
  const g = state.game;
  if (!g || g.phase !== "ask") return;
  const changed = g.choice !== choice;
  g.choice = choice;
  el.choices.forEach((c) => c.setAttribute("aria-checked", String(c.dataset.choice === choice)));
  el.lock.disabled = false;
  if (changed) pips.game.mood("idle").say(`${labelAr(choice)}؟ ثبّت إجابتك عندما تكون متأكداً.`);
}

function markHTML(ok) {
  return `<svg viewBox="0 0 56 56" aria-hidden="true"><path pathLength="1" d="${ok ? CHECK_PATH : CROSS_PATH}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" filter="url(#crayon)"/></svg>${ok ? "صحيح" : "خطأ"}`;
}

async function lockAnswer() {
  const g = state.game;
  if (!g || g.phase !== "ask" || !g.choice) return;
  g.phase = "locking";
  const art = g.artworks[g.index];
  el.lock.disabled = true;
  el.choices.forEach((c) => {
    c.disabled = true;
    c.classList.toggle("is-dimmed", c.dataset.choice !== g.choice);
    c.classList.toggle("is-locked", c.dataset.choice === g.choice);
  });

  el.stamp.classList.remove("is-on"); void el.stamp.offsetWidth; el.stamp.classList.add("is-on");
  await wait(t(700));

  el.ask.hidden = true;
  el.reveal.hidden = false;
  el.next.disabled = true;
  el.next.textContent = g.index === g.artworks.length - 1 ? "اعرض الحكم النهائي" : "الرسمة التالية";
  el.humanValue.textContent = labelAr(g.choice);
  el.aiValue.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  el.aiScore.textContent = "هيا تتأمّل الرسمة…";
  el.sourceBadge.hidden = true;
  for (const card of [el.cardHuman, el.cardAI]) { card.classList.remove("flip-in"); void card.offsetWidth; card.classList.add("flip-in"); }
  el.cardAI.style.animationDelay = reducedMotion ? "0s" : ".15s";
  el.frame.classList.add("is-scanning");
  pips.game.mood("thinking").say("دعني أنظر عن قرب…");

  let result;
  try {
    [result] = await Promise.all([api.reveal(g.sessionId, art.id, g.choice), wait(t(1300))]);
  } catch (err) {
    el.frame.classList.remove("is-scanning");
    g.phase = "ask";
    el.reveal.hidden = true;
    el.ask.hidden = false;
    el.choices.forEach((c) => { c.disabled = false; c.classList.remove("is-dimmed", "is-locked"); });
    el.lock.disabled = false;
    el.roundError.textContent = err.status === 410 ? err.message : `تعذّر على هيا الإجابة: ${err.message}`;
    el.roundError.hidden = false;
    pips.game.mood("oops").say("حدث خطأ من جهتي. هل تحاول مرة أخرى؟");
    return;
  }
  el.frame.classList.remove("is-scanning");

  // 1) Pip reveals the real model prediction
  const ai = result.ai;
  el.aiValue.textContent = labelAr(ai.label);
  el.aiScore.textContent = `درجة مخرج النموذج ${formatScore(ai.sadness_score)}`;
  if (ai.band === "uncertain") pips.game.mood("unsure").say(`هذه صعبة… سأقول ${labelAr(ai.label)}، لكنني قريبة جداً من الحد الفاصل.`);
  else pips.game.mood("confident").say(`أظنها ${labelAr(ai.label)}!`);
  el.sourceBadge.innerHTML = ai.source === "live"
    ? "<b>تخمين مباشر</b> · حسبه final_model.keras الآن"
    : "<b>تخمين حقيقي مخزَّن</b> · حسبه final_model.keras مسبقاً (وضع العرض الآمن)";
  el.sourceBadge.hidden = false;
  await wait(t(1100));

  // 2) the original label is unpinned
  el.truth.classList.add("is-revealed");
  el.truthValue.textContent = labelAr(result.original_label);
  el.truthSummary.textContent = roundSummary(result.human.correct, ai.correct);
  el.artTheme.innerHTML = `الموضوع: <b>${labelAr(result.original_label)}</b>`;
  el.artTheme.classList.add("is-revealed");
  el.humanMark.className = `vcard__mark ${result.human.correct ? "ok" : "miss"}`;
  el.humanMark.innerHTML = markHTML(result.human.correct);
  setTimeout(() => {
    el.aiMark.className = `vcard__mark ${ai.correct ? "ok" : "miss"}`;
    el.aiMark.innerHTML = markHTML(ai.correct);
  }, t(220));
  if (ai.correct) pips.game.mood("happy").say(result.human.correct ? "أصبنا كلانا!" : "نعم، أصبت في هذه!");
  else pips.game.mood("oops").say(result.human.correct ? "أنت أصبت، وأنا أخطأت!" : "أوه، لم يُصب أيٌّ منا هذه المرة.");

  g.rounds.push({
    artworkId: art.id, imageUrl: art.image_url, human: g.choice, ai: ai.label,
    aiScore: ai.sadness_score, aiSource: ai.source, label: result.original_label,
    humanCorrect: result.human.correct, aiCorrect: ai.correct,
  });
  const s = summarize(g.rounds);
  bump(el.scoreHuman, s.human);
  bump(el.scoreAI, s.ai);
  $$("li", el.dots)[g.index].classList.add("is-done");

  g.phase = "revealed";
  el.next.disabled = false;
  el.next.focus({ preventScroll: true });
}

function bump(node, value) {
  if (node.textContent === String(value)) return;
  node.textContent = value;
  node.classList.remove("bump"); void node.offsetWidth; node.classList.add("bump");
}

function nextArtwork() {
  const g = state.game;
  if (!g || g.phase !== "revealed") return;
  if (g.index < g.artworks.length - 1) {
    g.index++;
    renderRound();
    if (window.innerWidth < 1020) el.frame.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    state.lastResult = { rounds: g.rounds.slice(), summary: summarize(g.rounds) };
    state.game = null;
    resetChallengeUI();
    location.hash = "#/verdict";
  }
}

function resetChallengeUI() {
  el.stage.hidden = true;
  el.intro.hidden = false;
}

function restartChallenge() {
  state.game = null;
  resetChallengeUI();
  startChallenge();
}

/* ================================================================ verdict */
function countUp(node, to, ms = 1400, delay = 600) {
  if (reducedMotion || to === 0) { node.textContent = to; return; }
  node.textContent = "0";
  setTimeout(() => {
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

function storyText(s) {
  const opening = `كان يا ما كان، صديقان تأمّلا ${s.total} من رسومات الأطفال: أنت وهيا.`;
  if (s.winner === "human") {
    const d = s.human - s.ai;
    return `${opening} وفي النهاية خمّنت ${s.human} منها صحيحاً، أي أكثر من هيا بـ ${d}. عينك فازت في هذه الحكاية!`;
  }
  if (s.winner === "ai") {
    const d = s.ai - s.human;
    return `${opening} خمّنت هيا ${s.ai} منها صحيحاً، أي أكثر منك بـ ${d}. هذه المرة فازت هيا… جاهز لجولة ثأر؟`;
  }
  return `${opening} خمّن كلٌّ منكما ${s.human} صحيحاً. وبعض الحكايات تنتهي بتعادل جميل!`;
}

function renderVerdict(result) {
  if (!result) return;
  const room = $("#room-verdict");
  room.classList.remove("is-playing"); void room.offsetWidth; room.classList.add("is-playing");
  const s = result.summary;
  $$(".finalTotal").forEach((n) => (n.textContent = s.total));
  countUp($("#finalHuman"), s.human);
  countUp($("#finalAI"), s.ai);
  $("#accHuman").textContent = `دقة ${s.humanAcc}%`;
  $("#accAI").textContent = `دقة ${s.aiAcc}%`;
  $("#barHuman").style.width = "0"; $("#barAI").style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("#barHuman").style.width = `${s.humanAcc}%`;
    $("#barAI").style.width = `${s.aiAcc}%`;
  }));
  $(".duel__side--human").classList.toggle("is-winner", s.winner === "human");
  $(".duel__side--ai").classList.toggle("is-winner", s.winner === "ai");
  pips.verdict.mood(s.winner === "ai" ? "celebrate" : "happy");

  const banner = $("#winnerBanner");
  banner.classList.remove("is-in");
  banner.textContent = winnerMessage(s);
  $("#storyText").textContent = storyText(s);
  setTimeout(() => banner.classList.add("is-in"), t(1700));

  const tl = $("#timeline");
  tl.style.setProperty("--n", Math.min(result.rounds.length, 10));
  const mark = (ok) => `<svg class="tl-mark" viewBox="0 0 56 56"><path d="${ok ? CHECK_PATH : CROSS_PATH}" fill="none" stroke="${ok ? "#4FA35A" : "#E8574A"}" stroke-width="8" stroke-linecap="round"/></svg>`;
  tl.innerHTML = result.rounds.map((r, i) => `
    <li style="--i:${i}; --rot:${((i * 37) % 7) - 3}deg" aria-label="الجولة ${i + 1}: التسمية ${labelAr(r.label)}؛ أنت ${r.humanCorrect ? "صحيح" : "خطأ"}؛ هيا ${r.aiCorrect ? "صحيح" : "خطأ"}">
      <div class="tl-thumb"><img src="${r.imageUrl}" alt="" loading="lazy"></div>
      <div class="tl-row"><span>أنت</span>${mark(r.humanCorrect)}</div>
      <div class="tl-row"><span>هيا</span>${mark(r.aiCorrect)}</div>
      <div class="tl-label">${labelAr(r.label)}</div>
    </li>`).join("");

  $("#breakdown").innerHTML = [
    ["أصبتما كلاكما", s.both], ["أنت فقط", s.onlyHuman], ["هيا فقط", s.onlyAI], ["أخطأتما كلاكما", s.neither],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  setTimeout(() => confetti($("#confetti"), s.winner === "tie" ? 60 : 130), t(1900));
}

function confetti(canvas, count) {
  if (reducedMotion) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const colors = ["#E8574A", "#7B62B8", "#E79A00", "#4FA35A", "#3D8FD1"];
  const kinds = ["star", "sparkle", "heart", "swirl"];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width, y: -Math.random() * canvas.height * 0.5,
    s: (6 + Math.random() * 7) * dpr, vy: (1.2 + Math.random() * 2) * dpr, vx: (Math.random() - 0.5) * 1.2 * dpr,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.08,
    c: colors[(Math.random() * colors.length) | 0], k: kinds[(Math.random() * kinds.length) | 0],
  }));
  const paths = Object.fromEntries(kinds.map((k) => [k, new Path2D(DOODLES[k](0, 0, 1))]));
  const end = performance.now() + 5200;
  const frame = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx + Math.sin(now / 700 + p.r) * 0.5; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(p.s, p.s);
      ctx.globalAlpha = Math.max(0, Math.min(1, (end - now) / 1200));
      ctx.strokeStyle = p.c; ctx.lineWidth = 2.4 / p.s; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke(paths[p.k]); ctx.restore();
    }
    if (now < end && !$("#room-verdict").hidden) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  requestAnimationFrame(frame);
}

/* ================================================================ studio */
let sketch = null;
let uploadFile = null;
let previewUrl = null;
let studioTab = "draw";
const MAX_UPLOAD = 8 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];

function initStudio() {
  const tabs = { upload: $("#tabUpload"), draw: $("#tabDraw") };
  const panels = { upload: $("#panelUpload"), draw: $("#panelDraw") };
  const select = (name) => {
    studioTab = name;
    for (const k of Object.keys(tabs)) {
      tabs[k].setAttribute("aria-selected", String(k === name));
      panels[k].hidden = k !== name;
    }
    $("#tray").hidden = name !== "draw";
    if (name === "draw" && !sketch) initSketch();
    updateAnalyze();
  };
  tabs.upload.addEventListener("click", () => select("upload"));
  tabs.draw.addEventListener("click", () => select("draw"));
  select("draw");

  const input = $("#fileInput");
  const zone = $("#dropzone");
  input.addEventListener("change", () => input.files[0] && setUpload(input.files[0]));
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("is-over");
    const f = e.dataTransfer.files[0];
    if (f) setUpload(f);
  });
  $("#clearUpload").addEventListener("click", (e) => { e.preventDefault(); clearUpload(); input.value = ""; input.click(); });
  $("#analyze").addEventListener("click", analyze);
  pips.studio.say("ارسم ما تحب أو علّق رسمة، وسأخبرك في أي فئة أضعها!");
}

function setUpload(file) {
  $("#studioError").hidden = true;
  if (!OK_TYPES.includes(file.type)) return showStudioError("يُرجى اختيار صورة بصيغة PNG أو JPEG أو WEBP.");
  if (file.size > MAX_UPLOAD) return showStudioError("حجم هذا الملف أكبر من 8 ميغابايت.");
  clearUpload();
  uploadFile = file;
  previewUrl = URL.createObjectURL(file);
  const img = $("#uploadPreview");
  img.src = previewUrl;
  img.hidden = false;
  $("#polaroid").hidden = false;
  $("#dropEmpty").hidden = true;
  $("#clearUpload").hidden = false;
  pips.studio.mood("idle").say("رائع! اضغط «اسأل هيا» عندما تكون جاهزاً.");
  updateAnalyze();
}

function clearUpload() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  uploadFile = null;
  $("#uploadPreview").hidden = true;
  $("#uploadPreview").removeAttribute("src");
  $("#polaroid").hidden = true;
  $("#dropEmpty").hidden = false;
  $("#clearUpload").hidden = true;
  updateAnalyze();
}

function initSketch() {
  sketch = new Sketch($("#sketchCanvas"), { onChange: updateAnalyze });
  const sw = $("#swatches");
  sw.innerHTML = PALETTE.map((c, i) => `<button class="swatch" type="button" data-color="${c}" aria-label="اللون ${c}" aria-pressed="${i === 0}">${crayonSVG(c)}</button>`).join("");
  sw.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    sketch.color = b.dataset.color;
    if (sketch.tool === "eraser") setTool("crayon");
    $$(".swatch", sw).forEach((s) => s.setAttribute("aria-pressed", String(s === b)));
  });
  const setTool = (tool) => {
    sketch.tool = tool;
    $$(".tool[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
  };
  $$(".tool[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $("#brushSize").addEventListener("input", (e) => (sketch.size = Number(e.target.value)));
  $("#toolUndo").addEventListener("click", () => sketch.undo());
  $("#toolClear").addEventListener("click", () => sketch.clear());
}

function studioReady() {
  return studioTab === "upload" ? Boolean(uploadFile) : Boolean(sketch && sketch.dirty);
}

function updateAnalyze() {
  const available = !state.health || state.health.studio_available;
  $("#analyze").disabled = !studioReady() || !available;
}

function updateStudioAvailability() {
  if (state.health && !state.health.studio_available) {
    showStudioError("يحتاج المرسم إلى النموذج الحي، وهو غير محمَّل على هذا الخادم. (أما التحدي فيمكنه العمل بالتخمينات الحقيقية المخزَّنة.)");
  }
  updateAnalyze();
}

function showStudioError(msg) {
  const box = $("#studioError");
  box.textContent = msg;
  box.hidden = false;
}

async function analyze() {
  const btn = $("#analyze");
  if (!studioReady()) return;
  $("#studioError").hidden = true;
  btn.disabled = true;
  btn.classList.add("is-busy");
  pips.studio.mood("thinking").say("أتأمّل رسمتك…");
  try {
    const blob = studioTab === "upload" ? uploadFile : await sketch.toBlob();
    const name = studioTab === "upload" ? uploadFile.name : "canvas-drawing.png";
    const [res] = await Promise.all([api.predict(blob, name), wait(t(900))]);
    showReading(res);
  } catch (err) {
    showStudioError(err.message);
    pips.studio.mood("oops").say("لم أتمكّن من قراءة هذه الرسمة.");
  } finally {
    btn.classList.remove("is-busy");
    updateAnalyze();
  }
}

// Arabic wording of the backend's three bands (app/preprocessing.py → interpret).
const BAND_TEXT_AR = {
  uncertain: () => "هيا محتارة؛ هذه الرسمة قريبة جداً من الحد الفاصل.",
  leaning: (label) => `هيا تميل إلى ${label}.`,
  clear: (label) => `هيا تميل بوضوح إلى ${label}، وهذا لا يعني أنها على صواب حتماً.`,
};

function showReading(res) {
  $("#readingEmpty").hidden = true;
  const box = $("#readingResult");
  box.hidden = false;
  box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
  $("#readLabel").textContent = labelAr(res.label);
  const band = $("#readBand");
  band.textContent = BAND_TEXT_AR[res.band] ? BAND_TEXT_AR[res.band](labelAr(res.label)) : res.band_text;
  band.className = `reading__band ${res.band}`;
  $("#readScore").textContent = formatScore(res.sadness_score);
  $("#readHappy").textContent = formatScore(res.happiness_score);
  const needle = $("#meterNeedle");
  needle.style.left = "50%";
  requestAnimationFrame(() => requestAnimationFrame(() => (needle.style.left = `${(res.sadness_score * 100).toFixed(1)}%`)));
  if (res.band === "uncertain") pips.studio.mood("unsure").say(`همم، هذه الرسمة قريبة من الحد الفاصل. سأقول ${labelAr(res.label)}، لكن بفارق بسيط.`);
  else pips.studio.mood("confident").say(`أضع هذه الرسمة في فئة: ${labelAr(res.label)}.`);
  if (window.innerWidth < 1020) $("#reading").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ================================================================ behind */
const EXPERIMENTS = [
  { name: "MobileNetV2 · ضبط دقيق", tag: "بالألوان", f1: 0.6912, best: true },
  { name: "MobileNetV2 · ضبط دقيق", tag: "رمادي", f1: 0.6516, gray: true },
  { name: "CNN v3 · معدل تعلّم أقل", tag: "بالألوان", f1: 0.6478 },
  { name: "CNN v2 · 4 كتل التفافية", tag: "بالألوان", f1: 0.6406 },
  { name: "CNN الأساسية", tag: "بالألوان", f1: 0.6315 },
  { name: "CNN v2 · 4 كتل التفافية", tag: "رمادي", f1: 0.3333, gray: true },
];
let behindReady = false;
function initBehind() {
  if (behindReady) return;
  behindReady = true;
  $("#experimentBars").innerHTML = EXPERIMENTS.map((e) => `
    <div class="bar-row ${e.best ? "is-best" : ""} ${e.gray ? "is-gray" : ""}">
      <span class="bar-row__name">${e.name}<small>${e.tag}</small></span>
      <span class="bar-row__track"><span class="bar-row__fill" data-w="${(e.f1 * 100).toFixed(1)}"></span></span>
      <span class="bar-row__val">${e.f1.toFixed(3)}</span>
    </div>`).join("");

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add("is-visible");
      $$(".bar-row__fill", en.target).forEach((f) => (f.style.width = `${f.dataset.w}%`));
      io.unobserve(en.target);
    }
  }, { threshold: 0.12 });
  $$("#room-behind .observe").forEach((n) => io.observe(n));
}

/* ================================================================ exhibition mode */
let hintTimer;
function setExhibition(on) {
  document.body.classList.toggle("exhibition", on);
  $("#exhibitionToggle").setAttribute("aria-pressed", String(on));
  $("#exhibitionToggle span").textContent = on ? "الخروج من وضع المعرض" : "وضع المعرض";
  if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  showHint();
}
function showHint() {
  const h = $("#exhibitionHint");
  h.classList.remove("is-faded");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => h.classList.add("is-faded"), 5000);
}

function onKey(e) {
  if (e.target.matches("input, textarea")) return;
  const key = e.key.toLowerCase();
  if (document.body.classList.contains("exhibition")) showHint();
  if (key === "escape" && document.body.classList.contains("exhibition")) return setExhibition(false);

  const inChallenge = !$("#room-challenge").hidden && state.game;
  if (!inChallenge) return;
  const g = state.game;
  if (g.phase === "ask") {
    if (key === "h" || key === "1" || e.code === "KeyH") { e.preventDefault(); choose("Happiness"); }
    else if (key === "s" || key === "2" || e.code === "KeyS") { e.preventDefault(); choose("Sadness"); }
    else if (key === "enter" && g.choice && !e.target.closest("button")) { e.preventDefault(); lockAnswer(); }
  } else if (g.phase === "revealed" && (key === "enter" || key === "arrowright" || key === "arrowleft" || key === "n" || e.code === "KeyN") && !e.target.closest("button")) {
    e.preventDefault(); nextArtwork();
  }
}

/* ================================================================ init */
function init() {
  pips.logo = new Pip($("#logoPip"), { bubble: false });
  pips.hero = new Pip($("#heroPip"));
  pips.intro = new Pip($("#introPip"));
  pips.game = new Pip($("#gamePip"));
  pips.studio = new Pip($("#studioPip"));
  pips.verdict = new Pip($("#verdictPip"), { bubble: false });

  cacheChallengeEls();
  sketchAll();
  initEntrance();

  $("#startChallenge").addEventListener("click", startChallenge);
  el.choices.forEach((c) => c.addEventListener("click", () => choose(c.dataset.choice)));
  el.lock.addEventListener("click", lockAnswer);
  el.next.addEventListener("click", nextArtwork);
  $("#restartChallenge").addEventListener("click", restartChallenge);
  $("#replay").addEventListener("click", () => { location.hash = "#/challenge"; startChallenge(); });
  $("#exhibitionToggle").addEventListener("click", () => setExhibition(!document.body.classList.contains("exhibition")));
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("exhibition")) setExhibition(false);
  });
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", () => $("#topbar").classList.toggle("is-scrolled", window.scrollY > 8), { passive: true });
  window.addEventListener("hashchange", route);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (state.game && el.frame.classList.contains("is-shown")) drawFrame(); }, 200); });

  initStudio();
  if (new URLSearchParams(location.search).has("exhibition")) setExhibition(true);
  route();
  loadHealth();
}

init();
