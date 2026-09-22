(function rangeFillSync(){
  const PAINT = (slider) => {
    if (!slider || slider.type !== "range") return;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const val = Number(slider.value);

    const range = (max - min) || 1;
    const pct = ((val - min) / range) * 100;

    slider.style.background = `
      linear-gradient(
        to right,
        #bdbdbd 0%,
        #bdbdbd ${pct}%,
        #000 ${pct}%,
        #000 100%
      )
    `;
  };

  const PAINT_ALL = (root=document) => {
    root.querySelectorAll('input[type="range"]').forEach(PAINT);
  };

  // 1) Paint on user interaction (drag + keyboard)
  const WIRE_LIVE = (root=document) => {
    root.querySelectorAll('input[type="range"]').forEach((slider) => {
      if (slider.dataset.fillWired) return;
      slider.dataset.fillWired = "1";

      slider.addEventListener("input", () => PAINT(slider));
      slider.addEventListener("change", () => PAINT(slider));
    });
  };

  // 2) Paint when JS changes slider.value (steppers, restore, bindings, etc.)
  const patchRangeValueSetter = () => {
    const proto = window.HTMLInputElement && HTMLInputElement.prototype;
    if (!proto) return;

    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (!desc || !desc.set || proto.__rangeFillPatched) return;

    Object.defineProperty(proto, "__rangeFillPatched", { value: true });

    Object.defineProperty(proto, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function(v) {
        desc.set.call(this, v);

        // Only paint for range inputs (fast bail for everything else)
        if (this && this.type === "range") PAINT(this);
      }
    });
  };

  // 3) Catch sliders added later (if your UI is injected)
  const watchForNewSliders = () => {
    const obs = new MutationObserver((mutations) => {
      let sawSomething = false;

      for (const m of mutations) {
        // new nodes
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('input[type="range"]') || node.querySelector?.('input[type="range"]')) {
            sawSomething = true;
          }
        }
      }

      if (sawSomething) {
        WIRE_LIVE(document);
        PAINT_ALL(document);
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  };

  // Boot
  const START = () => {
    patchRangeValueSetter();
    WIRE_LIVE(document);
    PAINT_ALL(document);

    // Optional but nice if controls appear later
    watchForNewSliders();

    // Also repaint once after everything settles (covers late “restore settings”)
    requestAnimationFrame(() => PAINT_ALL(document));
    setTimeout(() => PAINT_ALL(document), 0);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", START);
  } else {
    START();
  }
})();

// Clear the controller textbox
document.getElementById('controller').addEventListener('input', () => {
  document.getElementById('controller').value = '';
});
