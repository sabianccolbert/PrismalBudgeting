// Sprites: the four special emoji, ❗️ (Regular), ✖️ (Hidden), ⭕️ (Transfer), and ✔️ (Recurring), show as the
// site's own small images everywhere, on every page, instead of each device's own emoji (which look different
// everywhere, and some are black on the dark background). Only what's shown changes: the stored budget, the
// text in boxes, and anything copied or read aloud still have the emoji (each image's alt text is its emoji).
//
// The images are Resources/Sprites/*.webp. To change one, replace its file (any square image with a
// transparent background works; around 128x128 is plenty), then stamp the site (node _tools/stamp.mjs) so
// browsers get the new one. If an image can't load, its emoji shows instead.

(function sprites() {
  "use strict";

  // Each emoji's character (without the U+FE0F that asks for emoji style) and its image
  const SPRITES = new Map([
    ["\u2757", "/Resources/Sprites/Regular.webp"],   // ❗️
    ["\u2716", "/Resources/Sprites/Hidden.webp"],    // ✖️
    ["\u2B55", "/Resources/Sprites/Transfer.webp"],  // ⭕️
    ["\u2714", "/Resources/Sprites/Recurring.webp"]  // ✔️
  ]);
  const FIND = /([\u2757\u2716\u2B55\u2714])\uFE0F?/g;
  const HAS = /[\u2757\u2716\u2B55\u2714]/;

  // Text that can't hold an image (or shouldn't change): page titles, scripts, form controls, and the
  // words a missing image shows instead (Layout.js)
  const SKIP = "title, script, style, noscript, textarea, select, option, datalist, svg, .missingImage, [data-no-sprites]";

  const url = (path) => (typeof window.assetUrl === "function" ? window.assetUrl(path) : path);

  function spriteImage(character) {
    const img = document.createElement("img");
    img.className = "sprite";
    img.src = url(SPRITES.get(character));
    img.alt = character + "\uFE0F";
    img.draggable = false;
    img.decoding = "async";
    return img;
  }

  // One text node: its emoji become images (the text around them stays text)
  function swap(textNode) {
    const text = textNode.data;
    const parent = textNode.parentNode;
    if (!HAS.test(text) || !parent || parent.nodeType !== Node.ELEMENT_NODE || parent.closest(SKIP)) return;
    const pieces = document.createDocumentFragment();
    let from = 0;
    for (const match of text.matchAll(FIND)) {
      if (match.index > from) pieces.append(text.slice(from, match.index));
      pieces.append(spriteImage(match[1]));
      from = match.index + match[0].length;
    }
    if (from < text.length) pieces.append(text.slice(from));
    parent.replaceChild(pieces, textNode);
  }

  // Every text node with an emoji under (or at) node
  function swapAll(node) {
    if (node.nodeType === Node.TEXT_NODE) return swap(node);
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest(SKIP)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => (HAS.test(text.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const found = [];
    while (walker.nextNode()) found.push(walker.currentNode);
    found.forEach(swap);
  }

  // The page as it is now, then everything the page (or a browser translating it) adds or changes later
  swapAll(document.body);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") swap(record.target);
      else record.addedNodes.forEach(swapAll);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
