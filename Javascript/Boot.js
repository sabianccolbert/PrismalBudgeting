(function boot(){
  "use strict";

  // JavaScript is on: drop the "turn on JavaScript" fallback first, so redirects below never show it
  document.documentElement.classList.remove("noJs");

  /* ===============================
   * 0) SITE VERSION (bump per deploy)
   * =============================== */
  const SITE_VERSION = "10.05.2026.B";
  window.SITE_VERSION = SITE_VERSION;

  /* ===============================
   * 1) HTML CACHE BUSTER
   * =============================== */
  const storedVersion = localStorage.getItem("LOCAL_SITE_VERSION");

  if (storedVersion !== SITE_VERSION) {
    localStorage.setItem("LOCAL_SITE_VERSION", SITE_VERSION);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('v', SITE_VERSION);
    window.location.replace(currentUrl.toString());
    return; 
  }

  function v(url){
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}v=${encodeURIComponent(SITE_VERSION)}`;
  }

  /* ===============================
   *  2) PAGE DETECTION
   * =============================== */
  function getPageKey(){
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

  /* ===============================
   *  3) AUTHENTICATION REDIRECT
   * =============================== */
  const hostname = window.location.hostname;

  // 1. Detect all local/dev environments
  // Simplest mobile setup:
  window.API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8787'
    : 'https://prismal-budget-api.prismalbudget.workers.dev'; // Production API handles both live & tunnel requests // Production Cloudflare Worker

  const isLoggedIn = !!localStorage.getItem("prismal_jwt");
  // The link in a password reset email (/login.html?reset=...) opens the login page even when signed in
  const isResetLink = PAGE === "login" && new URLSearchParams(location.search).has("reset");
  // Pages that work without logging in (Quick Entry uses the key in its link instead)
  const PUBLIC_PAGES = ["login", "privacy", "quick"];

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
  const html = document.documentElement;

  if (PAGE === "home") {
    html.classList.add("homeJs");
  } else {
    html.classList.add("otherJs");
  }
  /* ===============================
   *  5) Append page scripts at END
   * =============================== */
  // Starfield Setup starts the worker (Active Starfield.js) itself, so Active isn't listed here.
  // Setup must come before Keyboard and Layout, which use window.STARFIELD.
  const GLOBAL_SCRIPTS = [
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
    s.src = v(src);
    s.async = false;
    document.body.appendChild(s);
  }
  

  function loadPageScripts(){
    // Quick Entry's link carries its key, so that page never loads analytics
    GLOBAL_SCRIPTS.filter(src => PAGE !== "quick" || !src.endsWith("/Analytics.js")).forEach(appendScript);

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
      appendScript(PAGE_SCRIPTS[PAGE] || "/Javascript/Budget Pages.js");
    }
  }
  
  /* ===============================
   *  6) Add version badge
   * =============================== */
  const badgeHTML = `<div id="versionBadge">v${SITE_VERSION}</div>`;

  function addVersionBadge(){
    if (document.getElementById("versionBadge")) return;
    document.body.insertAdjacentHTML("beforeend", badgeHTML);
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
    const HTML = document.documentElement;
    const BODY = document.body;
    const CONTAINER = document.getElementById("transitionContainer");

    HTML.style.overflowY = "hidden";
    BODY.style.overflowY = "hidden";
    CONTAINER.style.overflowY = "visible";

    loadPageScripts();
    addVersionBadge();
  });
})();