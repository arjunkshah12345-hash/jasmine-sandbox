// Shared, deterministic helpers for the Jasmine film. Everything is a function of timeline time.
(function () {
  const GLYPHS = "░▒▓█▚▞▖▗▘▝";
  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // Resolve `text` into `el` out of dither glyphs, left to right, over `dur` seconds from `at` on `tl`.
  function scramble(tl, el, text, at, dur) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    const p = { v: 0 };
    const paint = () => {
      const settled = Math.floor(p.v * (text.length + 3));
      const step = Math.floor(p.v * 48);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === " " || i < settled - 3) s += c;
        else if (i < settled) s += GLYPHS[Math.floor(hash(i, step) * GLYPHS.length)];
        else s += " ";
      }
      node.textContent = s;
    };
    paint();
    tl.fromTo(p, { v: 0 }, { v: 1, duration: dur, ease: "none", onUpdate: paint, immediateRender: false }, at);
    tl.set(p, { v: 1, onComplete: paint }, at + dur);
  }
  // Type `text` into `el`, one character per `cps`-th of a second.
  function type(tl, el, text, at, cps) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    const p = { n: 0 };
    tl.fromTo(p, { n: 0 }, { n: text.length, duration: text.length / cps, ease: "none", immediateRender: false,
      onUpdate: () => { node.textContent = text.slice(0, Math.round(p.n)); } }, at);
  }
  // 4x4 Bayer dither wipe on a canvas: cells fill (dir=1) or clear (dir=-1) left to right over `dur` from `at`.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(tl, el, color, at, dur, dir = 1, cell = 24) {
    const c = typeof el === "string" ? document.querySelector(el) : el;
    const g = c.getContext("2d");
    const cols = Math.ceil(c.width / cell), rows = Math.ceil(c.height / cell);
    const p = { v: 0 };
    const paint = () => {
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = color;
      const k = p.v * 1.42;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const t = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16 * 0.7 + (x / cols) * 0.7;
        const on = t < k;
        if (dir > 0 ? on : !on) g.fillRect(x * cell, y * cell, cell, cell);
      }
    };
    tl.fromTo(p, { v: 0 }, { v: 1, duration: dur, ease: "none", onUpdate: paint, immediateRender: false }, at);
  }
  window.JX = { hash, scramble, type, bayer, GLYPHS };
})();
