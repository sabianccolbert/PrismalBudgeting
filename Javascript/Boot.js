(function boot(){
  "use strict";

  /* ===============================
   * 0) SITE VERSION (bump per deploy)
   * =============================== */
  const SITE_VERSION = "05.08.2026.F";
  window.SITE_VERSION = SITE_VERSION;

  /* ===============================
   * 0.5) HTML CACHE BUSTER
   * =============================== */
  const storedVersion = localStorage.getItem("LOCAL_SITE_VERSION");

  if (storedVersion !== SITE_VERSION) {
    // 1. Update local storage so we don't get stuck in an infinite reload loop
    localStorage.setItem("LOCAL_SITE_VERSION", SITE_VERSION);

    // 2. Force the browser to fetch a fresh HTML file by appending the version to the URL
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('v', SITE_VERSION);
    
    // 3. Replace the current URL and stop executing the rest of this script
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

    return "generic";
  }

  const PAGE = getPageKey();

  /* ===============================
   *  2) CSP-safe GA init (no inline)
   * =============================== */
  // Dynamically insert the Google Tag script element
  const gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-KD7WLLVTWC';
  document.head.appendChild(gtagScript);
  
  // Initialize dataLayer and the gtag function globally
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  
  // Configure tracking
  gtag('js', new Date());
  gtag('config', 'G-KD7WLLVTWC');

  /* ===============================
   *  3) CSS mode flip
   * =============================== */
  const html = document.documentElement;
  html.classList.remove("noJs");
  html.classList.add("hasJs");

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
    "/Javascript/Keyboard Starfield.js"
  ];

  function appendScript(src){
    const s = document.createElement("script");
    s.src = v(src);
    s.async = false; // preserve order
    document.body.appendChild(s);
  }

  function loadPageScripts(){
    GLOBAL_SCRIPTS.forEach(appendScript);

    if (PAGE === "notfound") {
      appendScript("/Javascript/Debug.js");
    }
  }
  
    /* ===============================
   *  6) Add version badge
   * =============================== */

  const badgeHTML = `<div id="versionBadge">v${SITE_VERSION}</div>`;

  function addVersionBadge(){
    if (document.getElementById("versionBadge")) return; // prevent duplicates
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
