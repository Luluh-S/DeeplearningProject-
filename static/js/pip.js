// Pip, the Little Minds AI companion: a scribble-drawn creature with a
// pencil-spark antenna. Pip's moods describe Pip's own state (thinking, unsure,
// pleased with a correct guess…), never the theme of a drawing.

export function pipSVG() {
  return `
<svg class="pip-svg" viewBox="0 0 140 150" aria-hidden="true">
  <ellipse class="pip-shadow" cx="70" cy="143" rx="32" ry="5"/>
  <g class="pip-all">
    <g class="pip-extras">
      <path class="pip-q" d="M114 26c2-9 15-8 14 1-1 6-8 6-8 13M120 48v1" />
      <g class="pip-dots"><circle cx="112" cy="40" r="3"/><circle cx="121" cy="30" r="4"/><circle cx="131" cy="18" r="5"/></g>
      <path class="pip-drop" d="M118 58c-4 6-5 9-2 11 3 2 6-1 5-4-.5-2-2-4-3-7z"/>
      <g class="pip-sparkles">
        <path d="M18 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M122 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M128 70l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/>
      </g>
    </g>
    <path class="pip-antenna" d="M70 36c-5-10 7-14 2-26"/>
    <path class="pip-spark" d="M72 1l3 6 6 2-6 2-3 6-3-6-6-2 6-2z"/>
    <path class="pip-arm pip-arm--l" d="M27 94c-9 0-15-6-18-14"/>
    <path class="pip-arm pip-arm--r" d="M113 94c9 0 15-6 18-14"/>
    <path class="pip-leg" d="M56 134l-2 9M84 134l2 9"/>
    <path class="pip-body" d="M70 35c35-2 51 24 50 54-1 30-21 47-50 47-31 1-50-19-50-49 0-30 17-51 50-52z"/>
    <path class="pip-body-line" d="M71 37c32 0 47 25 47 52-1 27-19 44-47 45-29 0-47-18-48-46 0-29 16-50 48-51" />
    <circle class="pip-cheek" cx="40" cy="101" r="7"/><circle class="pip-cheek" cx="100" cy="101" r="7"/>
    <g class="pip-eyes">
      <g class="pip-eye"><ellipse cx="54" cy="80" rx="11" ry="12.5"/><circle class="pip-pupil" cx="55" cy="82" r="5"/></g>
      <g class="pip-eye"><ellipse cx="86" cy="80" rx="11" ry="12.5"/><circle class="pip-pupil" cx="87" cy="82" r="5"/></g>
    </g>
    <path class="pip-happy-eyes" d="M45 83q9-11 18 0M77 83q9-11 18 0"/>
    <path class="pip-mouth m-neutral" d="M62 106q8 5 16 0"/>
    <path class="pip-mouth m-smile" d="M57 102q13 14 26 0"/>
    <ellipse class="pip-mouth m-o" cx="70" cy="107" rx="4.5" ry="5.5"/>
    <path class="pip-mouth m-wavy" d="M57 108q4-5 8 0t8 0t8 0"/>
    <path class="pip-mouth m-oops" d="M60 110q10-8 20 0"/>
  </g>
</svg>`;
}

export class Pip {
  constructor(root, { bubble = true } = {}) {
    this.root = root;
    root.classList.add("pip");
    root.innerHTML = pipSVG() + (bubble ? '<div class="pip-bubble" role="status" aria-live="polite"><p></p></div>' : "");
    this.text = root.querySelector(".pip-bubble p");
    this.mood("idle");
  }

  mood(name) {
    this.root.dataset.mood = name;
    const svg = this.root.querySelector(".pip-svg");
    svg.classList.remove("pip-pop"); void svg.getBoundingClientRect(); // restart pop animation
    requestAnimationFrame(() => svg.classList.add("pip-pop"));
    return this;
  }

  say(text) {
    if (!this.text) return this;
    this.text.classList.remove("is-writing");
    this.text.textContent = text;
    void this.text.offsetWidth;
    this.text.classList.add("is-writing");
    return this;
  }
}
