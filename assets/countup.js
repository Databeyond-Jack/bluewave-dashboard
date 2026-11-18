// Animated number count-up for any <span class="countup" data-value data-format>.
// Remembers the last shown value per element id, so updates tween from old to new.
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const last = {};

  const compact = (v) =>
    Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" :
    Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);

  const formats = {
    money: (v) => "£" + compact(v),
    money2: (v) => "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    int: (v) => Math.round(v).toLocaleString("en-GB"),
    dec1: (v) => v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pct: (v) => v.toFixed(1) + "%",
  };

  function animate(el) {
    const target = parseFloat(el.dataset.value);
    if (isNaN(target)) return;
    const key = el.id || "";
    const from = last[key] ?? 0;
    const fmt = formats[el.dataset.format] || formats.int;
    const dur = reduce ? 0 : 900;
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1;
      const v = from + (target - from) * (1 - Math.pow(1 - t, 3));
      el.textContent = fmt(v);
      last[key] = v;
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes" && m.target.classList.contains("countup")) animate(m.target);
      for (const n of m.addedNodes || []) {
        if (n.nodeType !== 1) continue;
        if (n.matches(".countup")) animate(n);
        n.querySelectorAll(".countup").forEach(animate);
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["data-value"],
  });
})();
