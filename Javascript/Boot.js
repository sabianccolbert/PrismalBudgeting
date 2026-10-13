(function boot(){
  "use strict";

  // JavaScript is on: drop the "turn on JavaScript" fallback first, so redirects below never show it
  document.documentElement.classList.remove("noJs");

  /* ===============================
   * 0) VERSIONS
   * =============================== */
  // The release's name, shown in the corner (and in How It Works). Change it with each release.
  const SITE_VERSION = "10.13.2026.A";
  window.SITE_VERSION = SITE_VERSION;

  // How updates reach browsers without making them download everything again:
  //   - Pages and this file are always checked for a newer copy (Cloudflare sends them with
  //     Cache-Control: no-cache), which costs a quick "nothing changed" answer when there's nothing new.
  //   - Every other file's address carries its fingerprint (?v=, a short hash of its contents), so browsers
  //     keep their saved copy until the file really changes, and the new address gets the new copy right away.
  // The fingerprints are written by `node _tools/stamp.mjs` (pages' and stylesheets' links, and this list of
  // the files loaded from here); the pre-commit hook refuses a commit whose fingerprints are out of date.
  // <stamp:files> (written by _tools/stamp.mjs)
  const FILE_VERSIONS = {
    "/Javascript/Active Starfield.js": "558a7e0f16",
    "/Javascript/Analytics.js": "dac605ae19",
    "/Javascript/Budget Pages.js": "381b372560",
    "/Javascript/Budget Search.js": "25dc57d117",
    "/Javascript/Budget UI.js": "581d3e1633",
    "/Javascript/Calendar Page.js": "2cab0844a7",
    "/Javascript/Debug.js": "8ebdd719db",
    "/Javascript/Keyboard Starfield.js": "c627653108",
    "/Javascript/Layout.js": "1d4cd5a7ea",
    "/Javascript/Login.js": "ff9d2b2fbd",
    "/Javascript/Passkeys.js": "67a10905c2",
    "/Javascript/Process Budget.js": "83a4c3002c",
    "/Javascript/Quick Entry.js": "9d91ce521a",
    "/Javascript/Session.js": "ec241e0ce9",
    "/Javascript/Settings Page.js": "788ff1e6ee",
    "/Javascript/Sheet Import.js": "2dda717131",
    "/Javascript/Spreadsheets.js": "705aaf25d2",
    "/Javascript/Sprites.js": "4f0c83ae83",
    "/Javascript/Starfield Setup.js": "d728f1054f",
    "/Resources/Sprites/Hidden.webp": "9c3afd2c80",
    "/Resources/Sprites/Recurring.webp": "f35a230cbd",
    "/Resources/Sprites/Regular.webp": "11a1321f81",
    "/Resources/Sprites/Spreadsheet.webp": "dc1ebacc81",
    "/Resources/Sprites/Transfer.webp": "0b848dff24",
    "/Resources/Star.webp": "f2d3021d0b"
  };
  // </stamp:files>

  // A file's address with its fingerprint ("/Javascript/Layout.js?v=1a2b3c4d5e"), for scripts and images
  window.assetUrl = function assetUrl(path) {
    return FILE_VERSIONS[path] ? `${path}?v=${FILE_VERSIONS[path]}` : path;
  };

  /* ===============================
   *  1) PAGE DETECTION
   * =============================== */
  function getPageKey(){
    // GitHub Pages shows 404.html at whatever address was asked for, so that page says what it is
    if (document.documentElement.dataset.page === "notfound") return "notfound";

    let p = location.pathname.toLowerCase();

    if (p.endsWith("/")) p = p.slice(0, -1);
    if (p.endsWith(".html")) p = p.slice(0, -5);
    if (p === "") p = "/";

    if (p === "/" || p === "/index") return "home";
    if (p === "/404") return "notfound";
    if (p === "/login") return "login";
    if (p === "/privacy%20and%20terms") return "privacy";
    if (p === "/settings") return "settings";
    if (p === "/quick") return "quick";
    if (p === "/how-it-works") return "guide";

    // Menu pages (folder: /menu/)
    if (p === "/menu" || p === "/menu/index") return "menu";
    if (p === "/menu/recurring") return "recurring";
    if (p === "/menu/history") return "history";
    if (p === "/menu/accounts") return "accounts";
    if (p === "/menu/tracker") return "tracker";
    if (p === "/menu/calculator") return "calculator";
    if (p === "/menu/logs") return "logs";

    return "generic";
  }

  window.PAGE = getPageKey();

  // Pages that work without logging in (Quick Entry uses the key in its link instead; How It Works and
  // the Not Found page are for anyone, search engines included)
  const PUBLIC_PAGES = ["login", "privacy", "quick", "guide", "notfound"];

  /* ===============================
   *  2) SITE DATA
   * =============================== */
  // Signing in lives in this browser's storage. A browser that blocks site data throws on any use of it,
  // so the pages that need it say how to fix that (stylesheet.css .noStorage) instead of breaking quietly.
  let storage = null;
  try {
    storage = window.localStorage;
    storage.getItem("prismal_jwt");
  } catch (e) {
    storage = null;
  }
  const isLoggedIn = !!(storage && storage.getItem("prismal_jwt"));

  // Home is the budget for anyone signed in, and the front page (what Prismal Budget is, with Sign In and
  // Create Account) for anyone else, search engines included. index.html starts as the front page, so it
  // reads the same without JavaScript.
  const FRONT_PAGE = PAGE === "home" && !isLoggedIn;
  window.FRONT_PAGE = FRONT_PAGE;
  document.documentElement.classList.toggle("frontPage", FRONT_PAGE);
  if (PAGE === "home" && !FRONT_PAGE) document.title = "Prismal Budget - Home";
  const IS_PUBLIC = FRONT_PAGE || PUBLIC_PAGES.includes(PAGE);
  window.PUBLIC_PAGE = IS_PUBLIC;

  if (!storage && (PAGE === "login" || !IS_PUBLIC)) {
    document.documentElement.classList.add("noStorage");
    return;
  }

  /* ===============================
   *  3) AUTHENTICATION REDIRECT
   * =============================== */
  // The local API while testing on this computer; the real one everywhere else (a Cloudflare tunnel too).
  // (The test harnesses swap the local address by its exact text, quotes included.)
  window.API_BASE_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? 'http://127.0.0.1:8787'
    : "https://prismal-budget-api.prismalbudget.workers.dev";

  // The links in a password reset email (/login.html?reset=...) and an email verification email
  // (/login.html?verify=...) open the login page even when signed in. Login.js moves a reset code into this
  // tab's session storage, so a reload of that page still counts.
  let hasResetCode = false;
  try { hasResetCode = !!sessionStorage.getItem("prismal_reset_token"); } catch (e) {}
  const pageParams = new URLSearchParams(location.search);
  const isEmailLink = PAGE === "login" && (pageParams.has("reset") || pageParams.has("verify") || hasResetCode);

  // If they are not logged in, and not already on a page that works without it, redirect them.
  if (!isLoggedIn && !IS_PUBLIC) {
    window.location.replace("/login.html");
    return;
  }
  if (isLoggedIn && PAGE === "login" && !isEmailLink) {
    window.location.replace("/index.html");
    return;
  }

  /* ===============================
   *  4) STARFIELD HEAD START
   * =============================== */
  // The starfield's engine (a worker running Active Starfield.js) and its star image start loading now, while
  // the page itself is still loading, instead of after it: Starfield Setup.js picks them both up, so the stars
  // are drawn as soon as the page shows instead of a moment later. Not when the device asks for reduced motion
  // (there's no starfield then), or in a browser that can't hand the canvas to a worker (Setup draws on the page).
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!reducedMotion && typeof Worker === "function" && window.HTMLCanvasElement && "transferControlToOffscreen" in HTMLCanvasElement.prototype) {
    try {
      window.STARFIELD_HEAD_START = {
        worker: new Worker(window.assetUrl("/Javascript/Active Starfield.js")),
        // The star image, decoded and ready to hand over (null if it couldn't be: the engine fetches it then)
        starImage: typeof createImageBitmap === "function"
          ? fetch(window.assetUrl("/Resources/Star.webp"))
              .then(response => (response.ok ? response.blob() : null))
              .then(blob => (blob ? createImageBitmap(blob) : null))
              .catch(() => null)
          : Promise.resolve(null)
      };
    } catch (e) {
      window.STARFIELD_HEAD_START = null;
    }
  }

  /* ===============================
   *  5) CSS mode flip
   * =============================== */
  document.documentElement.classList.add(PAGE === "home" ? "homeJs" : "otherJs");

  /* ===============================
   *  6) Append page scripts at END
   * =============================== */
  // Starfield Setup goes first, so the stars start right away (Boot.js has already started its worker, see
  // above), and it has to come before Keyboard and Layout, which use window.STARFIELD. Then Sprites, so the
  // ❗️ ✖️ ⭕️ ✔️ ➕ images are in before the page slides in.
  const GLOBAL_SCRIPTS = [
    "/Javascript/Starfield Setup.js",
    "/Javascript/Sprites.js",
    "/Javascript/Layout.js",
    "/Javascript/Keyboard Starfield.js",
    "/Javascript/Analytics.js"
  ];

  // Quick Entry borrows the budget helpers and New Entry form without loading a budget (see Quick Entry.js)
  const BUDGET_PAGES = ["home", "recurring", "history", "accounts", "tracker", "calculator", "logs", "settings", "quick"];

  // The script that draws each budget page (the menu data pages share Budget Pages.js)
  const PAGE_SCRIPTS = {
    home: "/Javascript/Calendar Page.js",
    settings: "/Javascript/Settings Page.js",
    quick: "/Javascript/Quick Entry.js"
  };

  // Add a script at the end of the page, at its fingerprinted address (they run in the order they're added)
  function appendScript(src){
    const s = document.createElement("script");
    s.src = window.assetUrl(src);
    s.async = false;
    document.body.appendChild(s);
  }

  // The scripts this page needs: the shared ones, sign-in, then the budget and the page's own
  function loadPageScripts(){
    // Quick Entry's link carries its key, so that page never loads analytics
    GLOBAL_SCRIPTS.filter(src => PAGE !== "quick" || !src.endsWith("/Analytics.js")).forEach(appendScript);

    // Passkeys (Face ID, Touch ID, Windows Hello): signing in on the login page, managing them in Settings
    if (PAGE === "login" || PAGE === "settings") {
      appendScript("/Javascript/Passkeys.js");
    }
    if (PAGE === "login") {
      appendScript("/Javascript/Login.js");
    }
    else if (!IS_PUBLIC) {
      appendScript("/Javascript/Session.js"); // Sends signed-out visitors to login, so public pages skip it
    }
    if (PAGE === "notfound") {
      appendScript("/Javascript/Debug.js");
    }
    // Every page that shows budget data loads + saves it through Process Budget,
    // then draws itself: the calendar page, settings, or the menu data pages (the front page shows none)
    if (BUDGET_PAGES.includes(PAGE) && !FRONT_PAGE) {
      appendScript("/Javascript/Process Budget.js");
      appendScript("/Javascript/Budget UI.js");
      // Connected spreadsheets' reading (Quick Entry never reads them)
      if (PAGE !== "quick") appendScript("/Javascript/Spreadsheets.js");
      // Search (Home's and History's): before the page script, which opens it
      if (PAGE === "home" || PAGE === "history") appendScript("/Javascript/Budget Search.js");
      appendScript(PAGE_SCRIPTS[PAGE] || "/Javascript/Budget Pages.js");
      // Temporary: bringing a Google Sheets budget over (see Sheet Import.js)
      if (PAGE === "home") appendScript("/Javascript/Sheet Import.js");
    }
  }

  /* ===============================
   *  7) Add version badge
   * =============================== */
  function addVersionBadge(){
    if (document.getElementById("versionBadge")) return;
    const badge = document.createElement("div");
    badge.id = "versionBadge";
    badge.textContent = `v${SITE_VERSION}`;
    document.body.appendChild(badge);
  }

  /* ===============================
   *  8) Init
   * =============================== */
  function onDOMReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onDOMReady(() => {
    // The page holds still until it has slid in (Layout.js gives scrolling back)
    const CONTAINER = document.getElementById("transitionContainer");
    if (CONTAINER) {
      document.documentElement.style.overflowY = "hidden";
      document.body.style.overflowY = "hidden";
      CONTAINER.style.overflowY = "visible";
    }

    loadPageScripts();
    addVersionBadge();
  });
})();
