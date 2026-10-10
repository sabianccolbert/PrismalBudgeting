(function boot(){
  "use strict";

  // JavaScript is on: drop the "turn on JavaScript" fallback first, so redirects below never show it
  document.documentElement.classList.remove("noJs");

  /* ===============================
   * 0) VERSIONS
   * =============================== */
  // The release's name, shown in the corner (and in How It Works). Change it with each release.
  const SITE_VERSION = "10.10.2026.A";
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
    "/Javascript/Active Starfield.js": "2803600ede",
    "/Javascript/Analytics.js": "dac605ae19",
    "/Javascript/Budget Pages.js": "434888ec2b",
    "/Javascript/Budget Search.js": "61e70de7c5",
    "/Javascript/Budget UI.js": "d5687c9081",
    "/Javascript/Calendar Page.js": "4d04a01de9",
    "/Javascript/Debug.js": "3c205d5fa0",
    "/Javascript/Keyboard Starfield.js": "2b28e8ba7c",
    "/Javascript/Layout.js": "4b7f954329",
    "/Javascript/Login.js": "cb5b2c6e2e",
    "/Javascript/Passkeys.js": "a2905991dd",
    "/Javascript/Process Budget.js": "07d9b0fb2e",
    "/Javascript/Quick Entry.js": "0894737feb",
    "/Javascript/Session.js": "ff5a8f1a97",
    "/Javascript/Settings Page.js": "3606ca67a2",
    "/Javascript/Sheet Import.js": "59aab8b637",
    "/Javascript/Sprites.js": "4c4e2d66b8",
    "/Javascript/Starfield Setup.js": "65f71b67e6",
    "/Resources/Sprites/Hidden.webp": "2827d5c983",
    "/Resources/Sprites/Recurring.webp": "4f494bda3d",
    "/Resources/Sprites/Regular.webp": "6d52ba4e84",
    "/Resources/Sprites/Transfer.webp": "8ac57c50be"
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
  window.PUBLIC_PAGE = PUBLIC_PAGES.includes(PAGE);

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
  if (!storage && (PAGE === "login" || !PUBLIC_PAGES.includes(PAGE))) {
    document.documentElement.classList.add("noStorage");
    return;
  }

  // Before October 2026, every release reloaded each page once with ?v= added to its address. Pages are
  // always fresh now, so that's taken back out of the address (old bookmarks keep working), and the
  // version those releases kept here is forgotten.
  if (new URLSearchParams(location.search).has("v")) {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("v");
    history.replaceState(history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
  try { if (storage) storage.removeItem("LOCAL_SITE_VERSION"); } catch (e) {}

  /* ===============================
   *  3) AUTHENTICATION REDIRECT
   * =============================== */
  // The local API while testing on this computer; the real one everywhere else (a Cloudflare tunnel too).
  // (The test harnesses swap the local address by its exact text, quotes included.)
  window.API_BASE_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? 'http://127.0.0.1:8787'
    : "https://prismal-budget-api.prismalbudget.workers.dev";

  const isLoggedIn = !!(storage && storage.getItem("prismal_jwt"));
  // The link in a password reset email (/login.html?reset=...) opens the login page even when signed in.
  // Login.js moves the code into this tab's session storage, so a reload of that page still counts.
  let hasResetCode = false;
  try { hasResetCode = !!sessionStorage.getItem("prismal_reset_token"); } catch (e) {}
  const isResetLink = PAGE === "login" && (new URLSearchParams(location.search).has("reset") || hasResetCode);

  // If they are not logged in, and not already on a page that works without it, redirect them.
  if (!isLoggedIn && !PUBLIC_PAGES.includes(PAGE)) {
    window.location.replace("/login.html");
    return;
  }
  if (isLoggedIn && PAGE === "login" && !isResetLink) {
    window.location.replace("/index.html");
    return;
  }

  /* ===============================
   *  4) CSS mode flip
   * =============================== */
  document.documentElement.classList.add(PAGE === "home" ? "homeJs" : "otherJs");

  /* ===============================
   *  5) Append page scripts at END
   * =============================== */
  // Starfield Setup starts the worker (Active Starfield.js) itself, so Active isn't listed here.
  // Setup must come before Keyboard and Layout, which use window.STARFIELD. Sprites goes first, so the
  // ❗️ ✖️ ⭕️ ✔️ images are in before the page slides in.
  const GLOBAL_SCRIPTS = [
    "/Javascript/Sprites.js",
    "/Javascript/Starfield Setup.js",
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

  function appendScript(src){
    const s = document.createElement("script");
    s.src = window.assetUrl(src);
    s.async = false;
    document.body.appendChild(s);
  }

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
    else if (!PUBLIC_PAGES.includes(PAGE)) {
      appendScript("/Javascript/Session.js"); // Sends signed-out visitors to login, so public pages skip it
    }
    if (PAGE === "notfound") {
      appendScript("/Javascript/Debug.js");
    }
    // Every page that shows budget data loads + saves it through Process Budget,
    // then draws itself: the calendar page, settings, or the menu data pages
    if (BUDGET_PAGES.includes(PAGE)) {
      appendScript("/Javascript/Process Budget.js");
      appendScript("/Javascript/Budget UI.js");
      // Search (Home's and History's): before the page script, which opens it
      if (PAGE === "home" || PAGE === "history") appendScript("/Javascript/Budget Search.js");
      appendScript(PAGE_SCRIPTS[PAGE] || "/Javascript/Budget Pages.js");
      // Temporary: bringing a Google Sheets budget over (see Sheet Import.js)
      if (PAGE === "home") appendScript("/Javascript/Sheet Import.js");
    }
  }

  /* ===============================
   *  6) Add version badge
   * =============================== */
  function addVersionBadge(){
    if (document.getElementById("versionBadge")) return;
    const badge = document.createElement("div");
    badge.id = "versionBadge";
    badge.textContent = `v${SITE_VERSION}`;
    document.body.appendChild(badge);
  }

  /* ===============================
   *  7) Init
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
