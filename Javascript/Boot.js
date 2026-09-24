(function boot(){
  "use strict";

  /* ===============================
   * 0) SITE VERSION (bump per deploy)
   * =============================== */
  const SITE_VERSION = "09.23.2026.A";
  window.SITE_VERSION = SITE_VERSION;

  /* ===============================
   * 0.5) HTML CACHE BUSTER
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
   *  1) PAGE DETECTION
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

    return "generic";
  }

  const PAGE = getPageKey();

  /* ===============================
   *  1.5) AUTHENTICATION REDIRECT
   * =============================== */
  const isLoggedIn = !!localStorage.getItem("prismal_user_id");
  
  // If they are not logged in, and not already on the login page, redirect them.
  if (!isLoggedIn && PAGE !== "login" && PAGE !== "privacy") {
    window.location.replace("/login.html");
    return;
  }
  if (isLoggedIn && PAGE === "login") {
    window.location.replace("/index.html");
    return;
  }

  /* ===============================
   *  3) CSS mode flip
   * =============================== */
  const html = document.documentElement;
  html.classList.remove("noJs");

  if (PAGE === "home") {
    html.classList.add("homeJs");
  } else {
    html.classList.add("otherJs");
  }
  
  /* ===============================
   *  4) Inject versioned CSS
   * =============================== */
  document.write(`<link rel="stylesheet" href="${v("/stylesheet.css")}">`);

  /* ===============================
   *  5) Append page scripts at END
   * =============================== */
  const GLOBAL_SCRIPTS = [
    "/Javascript/Starfield Setup.js",
    "/Javascript/Active Starfield.js",
    "/Javascript/Layout.js",
    "/Javascript/Keyboard Starfield.js",
    "/Javascript/Analytics.js"
  ];

  function appendScript(src){
    const s = document.createElement("script");
    s.src = v(src);
    s.async = false;
    document.body.appendChild(s);
  }
  

  function loadPageScripts(){
    GLOBAL_SCRIPTS.forEach(appendScript);

    if (PAGE === "notfound") {
      appendScript("/Javascript/Debug.js");
    }
    if (PAGE === "login") {
      appendScript("/Javascript/Login.js");
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
