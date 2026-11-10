// Boot: the first script on every page (in its <head>). It names the release and the files' fingerprints, works out
// which page this is and whether the browser is signed in (sending it to the login page, or on to Home, when it
// needs to), gives the starfield a head start, and then adds the scripts the page needs, in order.

(function boot(){
  "use strict";

  // JavaScript is on: drop the "turn on JavaScript" fallback first, so redirects below never show it
  document.documentElement.classList.remove("noJs");

  /* ===============================
   * 0) VERSIONS
   * =============================== */
  // The release's name, shown in the corner (and in How It Works). Change it with each release.
  const SITE_VERSION = "11.09.2026.B";
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
    "/Javascript/Active Starfield.js": "1eb314a462",
    "/Javascript/Analytics.js": "2e26ee1f3d",
    "/Javascript/Bob Page.js": "aeec73b776",
    "/Javascript/Budget Pages.js": "ade681577d",
    "/Javascript/Budget Search.js": "11ff6fc913",
    "/Javascript/Budget UI.js": "e84f79f067",
    "/Javascript/Budgets.js": "16c4641f91",
    "/Javascript/Calendar Page.js": "661d27406e",
    "/Javascript/Calendars Page.js": "781d2c0641",
    "/Javascript/Calendars.js": "b7ba7b529a",
    "/Javascript/Dates.js": "331a3e1cb1",
    "/Javascript/Debug.js": "8ebdd719db",
    "/Javascript/Keyboard Starfield.js": "7dea1b413a",
    "/Javascript/Layout.js": "2cd5a2b83e",
    "/Javascript/Line Graph.js": "8dec370bf9",
    "/Javascript/Login.js": "6df6f52525",
    "/Javascript/Notifications.js": "facb1b76b2",
    "/Javascript/Passkeys.js": "5bb712fb48",
    "/Javascript/Process Budget.js": "355a1a752a",
    "/Javascript/Quick Entry.js": "9f2dea8391",
    "/Javascript/Quick Icon.js": "4851e4c76a",
    "/Javascript/Session.js": "988bbb66b5",
    "/Javascript/Settings Page.js": "67fd96ae5d",
    "/Javascript/Sounds.js": "4cfba7dffa",
    "/Javascript/Spreadsheets Page.js": "771fbbe59d",
    "/Javascript/Spreadsheets.js": "30cbb8f933",
    "/Javascript/Sprites.js": "c6c86160d9",
    "/Javascript/Starfield Setup.js": "e86b316303",
    "/Resources/Sounds/Ambient1.mp3": "06aafa32d7",
    "/Resources/Sounds/Ambient2.mp3": "aab38039a1",
    "/Resources/Sounds/Ambient3.mp3": "4b81f3efe0",
    "/Resources/Sounds/Ambient4.mp3": "d45ab25404",
    "/Resources/Sounds/Ambient5.mp3": "6c45b4defc",
    "/Resources/Sounds/Ding.mp3": "8784ee2a6b",
    "/Resources/Sounds/Shatter.mp3": "27051e78fe",
    "/Resources/Sounds/Soft1.mp3": "6e0c25ed91",
    "/Resources/Sounds/Soft2.mp3": "8d8289f61e",
    "/Resources/Sounds/Transition.mp3": "4b7e0e51c3",
    "/Resources/Sounds/Twinkle1.mp3": "5f9b9a22de",
    "/Resources/Sounds/Twinkle2.mp3": "23912ae518",
    "/Resources/Sounds/Twinkle3.mp3": "053548a0e8",
    "/Resources/Sprites/Costs.webp": "d2a34fae6e",
    "/Resources/Sprites/Gains.webp": "a5e3b75e17",
    "/Resources/Sprites/Hidden.webp": "cb92741fc5",
    "/Resources/Sprites/InBank.webp": "40a6bd5f60",
    "/Resources/Sprites/Negative.webp": "4f6dda7720",
    "/Resources/Sprites/Recurring.webp": "6cb875e72a",
    "/Resources/Sprites/Regular.webp": "660dede305",
    "/Resources/Sprites/Spreadsheet.webp": "dc1ebacc81",
    "/Resources/Sprites/Transfer.webp": "e62e14338d",
    "/Resources/Star.webp": "f2d3021d0b",
    "/themes.css": "0e56d3f317"
  };
  // </stamp:files>

  // A file's address with its fingerprint ("/Javascript/Layout.js?v=1a2b3c4d5e"), for scripts and images
  window.assetUrl = function assetUrl(path) {
    return FILE_VERSIONS[path] ? `${path}?v=${FILE_VERSIONS[path]}` : path;
  };

  /* ===============================
   *  1) PAGE DETECTION
   * =============================== */
  // Which page an address is (Layout.js asks too, for the page a link goes to)
  function pageKeyOf(pathname){
    let p = pathname.toLowerCase();

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
    if (p === "/menu/spreadsheets") return "spreadsheets";
    if (p === "/menu/tracker") return "tracker";
    if (p === "/menu/calculator") return "calculator";
    if (p === "/menu/payments") return "payments";
    if (p === "/menu/logs") return "logs";
    if (p === "/menu/bob") return "bob";

    return "generic";
  }
  window.pageKeyOf = pageKeyOf;

  // GitHub Pages shows 404.html at whatever address was asked for, so that page says what it is
  window.PAGE = document.documentElement.dataset.page === "notfound" ? "notfound" : pageKeyOf(location.pathname);

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
  // Settings' Reduced Motion, kept on this device whoever signs in on it: the starfield holding still (STILL_STARS_KEY),
  // and the other animations off (LESS_MOTION_KEY: pages sliding, windows zooming open, cards floating, days zooming). A
  // device that asks for less motion on its own gets both, and no starfield at all (stylesheet.css section 11).
  // html.lessMotion turns the animations off in the CSS, and the scripts ask lessMotion() and stillStars().
  const STILL_STARS_KEY = "prismal_still_stars";
  const LESS_MOTION_KEY = "prismal_less_motion";
  const deviceAsksLessMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const motionSwitch = (key) => {
    try { return !!storage && storage.getItem(key) === "1"; } catch (e) { return false; }
  };
  window.lessMotion = () => deviceAsksLessMotion() || motionSwitch(LESS_MOTION_KEY);
  window.stillStars = () => deviceAsksLessMotion() || motionSwitch(STILL_STARS_KEY);
  // The page as Reduced Motion has it: html.lessMotion, and the starfield moving or held still
  function applyMotion() {
    document.documentElement.classList.toggle("lessMotion", window.lessMotion());
    if (window.STARFIELD && typeof window.STARFIELD.setStill === "function") window.STARFIELD.setStill(window.stillStars());
  }
  applyMotion();
  window.Motion = {
    deviceAsks: deviceAsksLessMotion,
    // Whether a switch is on: the starfield's ("stars") or the other animations' ("animations")
    isOn: (which) => motionSwitch(which === "stars" ? STILL_STARS_KEY : LESS_MOTION_KEY),
    // Turns a switch on or off (false when this browser won't keep it)
    set(which, on) {
      try {
        const key = which === "stars" ? STILL_STARS_KEY : LESS_MOTION_KEY;
        if (on) storage.setItem(key, "1");
        else storage.removeItem(key);
      } catch (e) {
        return false;
      }
      applyMotion();
      return true;
    }
  };

  const isLoggedIn = !!(storage && storage.getItem("prismal_jwt"));
  // A sign-in that's over but not signed out yet: left 15 minutes without activity (Session.js signs it out once a
  // signed-in page opens), or past the end its token gives. The login page shows for it instead of sending it Home.
  const signInOver = (() => {
    if (!isLoggedIn) return false;
    const lastActivity = Number(storage.getItem("prismal_last_activity") || 0);
    if (lastActivity && Date.now() - lastActivity >= 15 * 60 * 1000) return true;
    try {
      const claims = JSON.parse(atob(storage.getItem("prismal_jwt").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return typeof claims.exp === "number" && claims.exp * 1000 <= Date.now();
    } catch (e) {
      return false;
    }
  })();

  // Home is the budget for anyone signed in, and the front page (what Prismal Planning is, with Sign In and
  // Create Account) for anyone else, search engines included. index.html starts as the front page, so it
  // reads the same without JavaScript.
  const FRONT_PAGE = PAGE === "home" && !isLoggedIn;
  window.FRONT_PAGE = FRONT_PAGE;
  document.documentElement.classList.toggle("frontPage", FRONT_PAGE);
  if (PAGE === "home" && !FRONT_PAGE) document.title = "Prismal Planning - Home";
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

  // The links in a password reset email (/login.html?reset=...), an email verification email
  // (/login.html?verify=...), and the email that confirms another email of the account's (Other Emails,
  // /login.html?sheet-email=...) open the login page even when signed in. Login.js moves a reset code into this
  // tab's session storage, so a reload of that page still counts.
  let hasResetCode = false;
  try { hasResetCode = !!sessionStorage.getItem("prismal_reset_token"); } catch (e) {}
  const pageParams = new URLSearchParams(location.search);
  const isEmailLink = PAGE === "login" && (pageParams.has("reset") || pageParams.has("verify") || pageParams.has("sheet-email") || hasResetCode);

  // If they are not logged in, and not already on a page that works without it, redirect them.
  if (!isLoggedIn && !IS_PUBLIC) {
    window.location.replace("/login.html");
    return;
  }
  if (isLoggedIn && PAGE === "login" && !isEmailLink && !signInOver) {
    window.location.replace("/index.html");
    return;
  }

  /* ===============================
   *  3b) THEME (this device)
   * =============================== */
  // The theme picked in Settings, kept on this device (so two devices on the same budget can each have their own):
  // html[data-theme] sets the colors, edges, background, icons, and font (themes.css), and the starfield's look (Active
  // Starfield.js). Only the pages behind a sign-in, and Quick Entry, have one: the login page, the front page, and the
  // pages for anyone (How It Works, the Privacy Policy) always look like Prismal, which has no data-theme.
  // Custom is a theme of the person's own (Settings' Custom window): one of the others to start from (its data-theme),
  // with five colors of their own (the page behind the cards, the cards, the words, the glow, and what's chosen) worked
  // out into the tokens on html itself (customTokens), and if they like, small or sharp corners, another font, other
  // stars, and gray or glowing icons (html's data-corners and data-icons, themes.css). (themes.css's header lists
  // everything a new theme needs.)
  const THEMES = ["prismal", "professional", "dark", "spooky", "elements", "poison", "blue", "fall", "winter", "festive", "floral", "digital", "love", "clovers", "playful", "mechanical", "custom"];
  const BASE_THEMES = THEMES.filter(theme => theme !== "custom");
  // The themes with dark words on light cards (html gets lightCards, as it does for a Custom theme with light cards)
  const LIGHT_THEMES = ["professional", "winter", "floral", "love", "playful"];
  const THEME_KEY = "prismal_theme";
  const CUSTOM_KEY = "prismal_custom_theme";
  // Each theme's five colors (Custom starts from them; the first is also what the browser paints around the page, like a
  // phone's status bar, except Prismal's black)
  const THEME_PALETTES = {
    prismal:      { background: "#05041d", cards: "#181a46", words: "#f2f3ff", glow: "#6070ff", chosen: "#e8230a" },
    professional: { background: "#eef2f7", cards: "#ffffff", words: "#0f172a", glow: "#2563eb", chosen: "#2563eb" },
    dark:         { background: "#0f1115", cards: "#1b1f26", words: "#f0f3f6", glow: "#388bfd", chosen: "#388bfd" },
    spooky:       { background: "#070405", cards: "#150708", words: "#f5ebe6", glow: "#dc141e", chosen: "#ff5a14" },
    elements:     { background: "#1e1b18", cards: "#2e2924", words: "#f6f0e7", glow: "#3a87a8", chosen: "#d0643b" },
    poison:       { background: "#0d0714", cards: "#241036", words: "#f3ecff", glow: "#963ce6", chosen: "#46dc28" },
    blue:         { background: "#2457a0", cards: "#24528f", words: "#ffffff", glow: "#96d2ff", chosen: "#ffbe28" },
    fall:         { background: "#1a0f08", cards: "#3a2010", words: "#fff3e4", glow: "#ff8a2a", chosen: "#e8432e" },
    winter:       { background: "#e3effb", cards: "#ffffff", words: "#0c2440", glow: "#3a9be0", chosen: "#2747c9" },
    festive:      { background: "#06190f", cards: "#103a24", words: "#fffaf0", glow: "#f2c14e", chosen: "#e63946" },
    floral:       { background: "#fde8f1", cards: "#fffcfe", words: "#3d1a35", glow: "#f472b6", chosen: "#9b6dff" },
    digital:      { background: "#020805", cards: "#04160c", words: "#e4ffee", glow: "#00ff88", chosen: "#ffb000" },
    love:         { background: "#ffe3ea", cards: "#fffbfc", words: "#44101f", glow: "#f27a94", chosen: "#d92944" },
    clovers:      { background: "#0a2117", cards: "#163e2c", words: "#f2f6f3", glow: "#9be8a8", chosen: "#d6e0da" },
    playful:      { background: "#e6f6ff", cards: "#fffef6", words: "#2a275a", glow: "#4aa8e0", chosen: "#f05d96" },
    mechanical:   { background: "#141210", cards: "#34302d", words: "#f1ece4", glow: "#c49a5a", chosen: "#aab2ba" }
  };
  // A Custom theme's other choices ("theme": the one it starts from keeps its own)
  const CUSTOM_CHOICES = {
    corners: ["theme", "small", "sharp"],
    font: ["theme", "prismal", "plain", "sharp", "rounded", "digital"],
    stars: ["theme", "stars", "dots", "embers", "elements", "bubbles", "leaves", "snow", "ornaments", "flowers", "pixels", "hearts", "clovers", "eggs", "gears"],
    icons: ["theme", "gray", "glowing"]
  };
  const CUSTOM_FONTS = {
    prismal: "'Main Font', sans-serif",
    plain: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    sharp: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif',
    rounded: "ui-rounded, 'SF Pro Rounded', 'Main Font', sans-serif",
    digital: 'ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, "Roboto Mono", "DejaVu Sans Mono", monospace'
  };
  // Which theme's stars each Stars choice borrows (dots: Professional's on light cards, Dark's on dark ones)
  const CUSTOM_STARS = { stars: "prismal", embers: "spooky", elements: "elements", bubbles: "poison", leaves: "fall", snow: "winter", ornaments: "festive", flowers: "floral", pixels: "digital", hearts: "love", clovers: "clovers", eggs: "playful", gears: "mechanical" };
  const THEMED = !IS_PUBLIC || PAGE === "quick";
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  // The theme this device keeps (Prismal when it has none, or one it doesn't know)
  function savedTheme() {
    try {
      const theme = storage.getItem(THEME_KEY);
      return THEMES.includes(theme) ? theme : "prismal";
    } catch (e) {
      return "prismal";
    }
  }

  // The look a link hands on (Quick Entry's Home, to the login page, and a Quick Entry icon's own address, for a phone
  // whose home screen app keeps its own storage): { theme, custom (a Custom theme's parts) }, or null
  let lookGiven = null;
  function readLookGiven() {
    if (PAGE !== "login" && PAGE !== "quick") return null;
    const params = new URLSearchParams(location.search);
    const theme = params.get("look");
    if (!THEMES.includes(theme) || theme === "prismal") return null;
    if (theme !== "custom") return { theme };
    try {
      return { theme, custom: tidyCustom(JSON.parse(params.get("custom") || "")) };
    } catch (e) {
      return null;
    }
  }

  // Does this device keep a theme of its own?
  function keepsTheme() {
    try {
      return storage.getItem(THEME_KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  // The theme this page shows
  function shownTheme() {
    if (PAGE === "login") return lookGiven ? lookGiven.theme : "prismal";
    if (PAGE === "quick" && lookGiven && !keepsTheme()) return lookGiven.theme;
    return THEMED ? savedTheme() : "prismal";
  }

  // A Custom theme with every part as it should be (what's missing or odd comes from the theme it starts from)
  function tidyCustom(custom) {
    const given = custom && typeof custom === "object" ? custom : {};
    const base = BASE_THEMES.includes(given.base) ? given.base : "prismal";
    const tidy = { base };
    for (const part of Object.keys(THEME_PALETTES.prismal)) {
      tidy[part] = HEX_COLOR.test(given[part]) ? given[part].toLowerCase() : THEME_PALETTES[base][part];
    }
    for (const [part, choices] of Object.entries(CUSTOM_CHOICES)) tidy[part] = choices.includes(given[part]) ? given[part] : "theme";
    return tidy;
  }

  // The Custom theme this device keeps (null when it has none yet)
  function savedCustom() {
    try {
      const text = storage.getItem(CUSTOM_KEY);
      return text ? tidyCustom(JSON.parse(text)) : null;
    } catch (e) {
      return null;
    }
  }

  // Colors as numbers: "#rrggbb" as [r, g, b], how light one is (0 to 1), SHARE of the way from one to another, and
  // back to "r, g, b" for rgba(var(--NAME), alpha)
  const rgbOf = (hex) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  const lightness = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const mix = (from, to, share) => from.map((value, at) => value + (to[at] - value) * share);
  const rgbText = (rgb) => rgb.map(Math.round).join(", ");
  const rgba = (rgb, alpha) => `rgba(${rgbText(rgb)}, ${alpha})`;
  const rgbColor = (rgb) => `rgb(${rgbText(rgb)})`;
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];
  const SLATE = [15, 23, 42];
  // How easy one color is to read on another (the contrast ratio of the accessibility guidelines: 1 to 21)
  const luminance = (rgb) => rgb.map(value => value / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, at) => sum + c * [0.2126, 0.7152, 0.0722][at], 0);
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  // Are a Custom theme's cards light (so shadows stay dark, but halos, boxes, and wells go light)? And are they the other
  // lightness from the theme it starts from's (light cards on a dark theme, or dark ones on a light theme)?
  const lightCards = (custom) => lightness(rgbOf(custom.cards)) > 0.6;
  const flipped = (custom) => lightCards(custom) !== LIGHT_THEMES.includes(custom.base);
  // A Custom theme's icons: its choice, or gray when it keeps the theme's but its cards are the other lightness (the
  // theme's icons are made for its own cards)
  const iconsFor = (custom) => (custom.icons === "theme" && flipped(custom) ? "gray" : custom.icons);
  // Costs, gains, placeholders, and Delete's words for light cards (Professional's) and for dark ones (Prismal's)
  const LIGHT_CARD_SHADES = {
    "--NEGATIVE_TEXT": "#b91c1c", "--POSITIVE_TEXT": "#047857", "--ZERO_TEXT": "#94a3b8", "--PLACEHOLDER_TEXT": "#9a4708", "--DANGER_TEXT": "#b91c1c",
    "--YELLOW_RGB": "202, 138, 4", "--PLACEHOLDER_COLOR": "rgba(100, 116, 139, 0.7)",
    "--NEGATIVE_DAY_FILL": "linear-gradient(180deg, #fee2e2, #fff1f2)", "--NEGATIVE_DAY_SOLID": "linear-gradient(180deg, #fee2e2, #fff1f2)",
    "--NEGATIVE_DAY_EDGE": "rgba(220, 38, 38, 0.55)", "--NEGATIVE_GLOW_FILL": "linear-gradient(rgba(220, 38, 38, 0.1), rgba(220, 38, 38, 0.1))"
  };
  const DARK_CARD_SHADES = {
    "--NEGATIVE_TEXT": "#ff8a95", "--NEGATIVE_ON_RED": "#ffb0b9", "--POSITIVE_TEXT": "#5ee39a", "--ZERO_TEXT": "#6f7396", "--PLACEHOLDER_TEXT": "#ffd447", "--DANGER_TEXT": "#d98a94",
    "--YELLOW_RGB": "255, 205, 40", "--PLACEHOLDER_COLOR": "rgba(90, 90, 90, 0.5)",
    "--NEGATIVE_DAY_FILL": "linear-gradient(180deg, rgba(122, 14, 48, 0.68) 0%, rgba(122, 14, 48, 0) 50%)",
    "--NEGATIVE_DAY_SOLID": "linear-gradient(180deg, rgb(112, 12, 44), rgb(42, 6, 24))", "--NEGATIVE_DAY_EDGE": "rgba(255, 80, 100, 0.6)",
    "--NEGATIVE_GLOW_FILL": "radial-gradient(ellipse at center, rgba(255, 70, 90, 0.5) 0%, rgba(200, 20, 50, 0.28) 50%, rgba(90, 0, 30, 0.1) 85%, transparent 100%)"
  };

  // A Custom theme's tokens (stylesheet.css section 1, and budgetStyle.css's), worked out from its five colors
  function customTokens(custom) {
    const page = rgbOf(custom.background);
    const card = rgbOf(custom.cards);
    const text = rgbOf(custom.words);
    const glow = rgbOf(custom.glow);
    const pick = rgbOf(custom.chosen);
    const light = lightCards(custom);
    const glowLight = mix(glow, WHITE, 0.4);
    const pickLight = mix(pick, WHITE, 0.45);
    const pickDark = mix(pick, BLACK, 0.35);
    const cardDeep = mix(card, BLACK, light ? 0.04 : 0.35);
    const button = mix(card, light ? WHITE : BLACK, 0.1);
    // (A recommended button is mostly its glow, brightest in its middle where its words are: they're white or dark,
    // whichever is easier to read there)
    const recommendedMiddle = mix(card, glow, 0.82);
    const darkWords = contrast(SLATE, recommendedMiddle) > contrast(WHITE, recommendedMiddle);
    const tokens = {
      "--BASE_COLOR": rgbColor(mix(text, card, 0.12)),
      "--TEXT_BRIGHT": rgbColor(text),
      // (Dim, but still easy to read: a little closer to the words on light cards)
      "--TEXT_DIM": rgbColor(mix(text, card, light ? 0.25 : 0.35)),
      "--TEXT_HOT": rgbColor(light ? mix(text, BLACK, 0.3) : mix(text, WHITE, 0.5)),
      "--PRIMARY_TEXT": darkWords ? "#0f172a" : "#ffffff",
      "--LINK_LIGHT": rgbColor(pick),
      "--LINK_DARK": rgbColor(pickDark),
      "--GLASS": `linear-gradient(180deg, ${rgba(card, light ? 1 : 0.86)}, ${rgba(cardDeep, light ? 1 : 0.9)})`,
      "--GLASS_BUTTON": rgba(button, light ? 1 : 0.8),
      "--GLASS_LINE": rgba(light ? SLATE : glowLight, light ? 0.14 : 0.26),
      "--GLASS_LINE_BRIGHT": rgba(light ? SLATE : glowLight, light ? 0.26 : 0.48),
      "--GLASS_SHADOW": light ? "0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 14px rgba(15, 23, 42, 0.08)" : "0 10px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
      "--HOVER_GRADIENT": `linear-gradient(160deg, ${rgba(mix(card, glow, light ? 0.04 : 0.14), 0.98)}, ${rgba(cardDeep, 0.98)})`,
      "--FLOAT_SHADOW": `0 16px 40px rgba(0, 0, 0, ${light ? 0.2 : 0.7}), 0 0 26px ${rgba(glow, 0.28)}`,
      "--GLOW_RGB": rgbText(glow),
      "--GLOW_LIGHT_RGB": rgbText(glowLight),
      "--GLOW_FILL": `radial-gradient(ellipse at center, ${rgba(glow, 0.5)} 0%, ${rgba(glow, 0.26)} 45%, ${rgba(glow, 0.1)} 75%, ${rgba(glow, 0.04)} 100%)`,
      "--GLOW_EDGE": rgba(light ? glow : glowLight, 0.92),
      "--GLOW_SHADOW": `0 0 16px ${rgba(glow, 0.55)}, inset 0 0 12px ${rgba(glow, 0.25)}`,
      "--HOVER_SHADOW": `0 0 12px ${rgba(glow, 0.55)}`,
      "--TITLE_GLOW": light ? "none" : `0 0 14px ${rgba(glow, 0.45)}`,
      "--RECOMMENDED_FILL": `linear-gradient(90deg, ${rgba(glow, 0.65)}, ${rgba(mix(glow, pick, 0.3), 0.65)})`,
      "--PICK_RGB": rgbText(pick),
      "--PICK_EDGE": rgbColor(mix(pick, WHITE, 0.15)),
      "--PICK_FILL": `radial-gradient(ellipse at center, ${rgba(pickLight, 0.42)} 0%, ${rgba(pick, 0.22)} 50%, ${rgba(pickDark, 0.08)} 85%, transparent 100%)`,
      "--EDGE_GRADIENT": `linear-gradient(135deg, ${rgbColor(pickDark)} 0%, ${rgbColor(pick)} 55%, ${rgbColor(pickLight)} 100%)`,
      "--SHADOW": `0 0 20px ${rgba(pick, 1)}`,
      "--PICK_SHADOW": `0 0 16px ${rgba(pick, 0.75)}`,
      "--DARK_BUTTON": rgba(mix(card, light ? SLATE : BLACK, light ? 0.06 : 0.6), 0.9),
      "--DAY_FILL": light ? `linear-gradient(180deg, ${rgbColor(card)}, ${rgbColor(cardDeep)})` : `linear-gradient(180deg, ${rgba(mix(card, glow, 0.12), 0.62)} 0%, ${rgba(mix(card, glow, 0.12), 0)} 50%)`,
      "--DAY_SOLID": `linear-gradient(180deg, ${rgbColor(mix(card, glow, light ? 0.03 : 0.1))}, ${rgbColor(cardDeep)})`,
      "--DAY_EDGE": rgba(light ? SLATE : glowLight, light ? 0.14 : 0.24),
      "--LIST_FILL": rgbColor(light ? card : mix(card, BLACK, 0.2)),
      "--BOX_FILL": light ? "#ffffff" : rgba(mix(card, BLACK, 0.6), 0.6),
      "--WELL_RGB": light ? "255, 255, 255" : rgbText(mix(card, BLACK, 0.6)),
      "--INSET_RGB": light ? rgbText(mix(card, SLATE, 0.14)) : "0, 0, 0",
      "--SHADE_RGB": light ? "15, 23, 42" : "0, 0, 0",
      "--HALO_RGB": light ? "255, 255, 255" : "0, 0, 0",
      "--TINT_RGB": light ? "15, 23, 42" : "255, 255, 255",
      "--PANEL_DEEP": rgba(mix(card, glow, light ? 0.08 : 0.25), light ? 1 : 0.7),
      "--PANEL_SOFT": rgba(mix(card, glow, 0.1), light ? 0.4 : 0.35),
      "--PANEL_DARK": rgba(cardDeep, light ? 1 : 0.62),
      "--PANEL_LINE": rgba(light ? SLATE : glowLight, light ? 0.08 : 0.16),
      "--PANEL_BORDER": rgba(light ? SLATE : glowLight, light ? 0.16 : 0.36),
      "--TILE_FILL": `radial-gradient(circle at 50% 40%, ${rgba(glow, 0.35)}, ${rgba(cardDeep, 0.92)})`,
      "--LINE_GRADIENT": `linear-gradient(90deg, transparent, ${rgba(glow, 0.65)} 25%, ${rgba(mix(glow, pick, 0.4), 0.65)} 75%, transparent)`,
      "--BAR_FILL": `linear-gradient(90deg, ${rgbColor(glow)}, ${rgbColor(glowLight)})`,
      // New Entry's ring in the glow's colors (the theme it starts from may have its own), and Quick Entry's bolt the
      // color of its words
      "--RING_FILL": `conic-gradient(from 200deg, ${rgbColor(glow)}, ${rgbColor(glowLight)}, ${rgbColor(mix(glow, pick, 0.35))}, ${rgbColor(glow)})`,
      "--PRIMARY_ICON": darkWords ? "brightness(0) invert(0.08)" : "brightness(0) invert(1)",
      // The page behind the cards (themes.css CUSTOM: a glow at the top left, darker at the bottom right)
      "--CUSTOM_BG": rgbColor(page),
      "--CUSTOM_BG_GLOW": rgba(glow, light ? 0.1 : 0.22),
      "--CUSTOM_BG_DEEP": rgbColor(mix(page, BLACK, light ? 0.06 : 0.35))
    };
    // Cards lighter or darker than the theme it starts from take costs, gains, placeholders, and Delete's words in shades
    // made for them (a dark theme's are too pale on light cards, and a light theme's too dark on dark ones)
    if (flipped(custom)) Object.assign(tokens, light ? LIGHT_CARD_SHADES : DARK_CARD_SHADES);
    if (custom.font !== "theme") tokens["--FONT"] = CUSTOM_FONTS[custom.font];
    // Gray icons: dark on light cards, light on dark ones; glowing: the same, with the glow around them
    const iconGray = light ? "grayscale(1) brightness(0.32)" : "grayscale(1) brightness(1.7)";
    const icons = iconsFor(custom);
    if (icons === "gray") tokens["--ICON_FILTER"] = iconGray;
    if (icons === "glowing") tokens["--ICON_FILTER"] = `${iconGray} drop-shadow(0 0 6px ${rgba(glow, 0.8)})`;
    return tokens;
  }

  // The starfield's look on this page: { name: the theme whose stars it has, colors: lines, ring, and paddles, or null
  // for that theme's own }
  function starLook(custom, base) {
    if (!custom) return { name: base, colors: null };
    const glow = rgbOf(custom.glow);
    const name = custom.stars === "theme" ? custom.base
      : custom.stars === "dots" ? (lightCards(custom) ? "professional" : "dark")
      : CUSTOM_STARS[custom.stars];
    return { name, colors: { link: rgbText(mix(glow, [110, 110, 110], 0.55)), ring: rgbText(mix(glow, WHITE, 0.35)), paddle: rgbText(rgbOf(custom.words)) } };
  }

  // What Settings is showing before it's kept (a theme's name, or a Custom theme), or null
  let previewing = null;
  const CUSTOM_SET = new Set(); // The tokens a Custom theme set on html, taken off when it isn't shown
  let shownLook = { name: "prismal", colors: null };

  // Show this page's theme: its data-theme, a Custom theme's tokens and choices, the browser's color around the page,
  // and the starfield's look
  function applyTheme() {
    const shown = previewing || shownTheme();
    const custom = typeof shown === "object" ? shown : shown === "custom" ? lookGiven?.custom || savedCustom() || tidyCustom(null) : null;
    const base = custom ? custom.base : shown;
    const root = document.documentElement;
    if (base === "prismal") delete root.dataset.theme;
    else root.dataset.theme = base;
    root.classList.toggle("customTheme", !!custom);
    root.classList.toggle("lightCards", custom ? lightCards(custom) : LIGHT_THEMES.includes(base));
    const tokens = custom ? customTokens(custom) : {};
    CUSTOM_SET.forEach(name => { if (!(name in tokens)) root.style.removeProperty(name); });
    CUSTOM_SET.clear();
    Object.entries(tokens).forEach(([name, value]) => {
      root.style.setProperty(name, value);
      CUSTOM_SET.add(name);
    });
    const choices = { corners: custom ? custom.corners : "theme", icons: custom ? iconsFor(custom) : "theme" };
    for (const [part, choice] of Object.entries(choices)) {
      if (choice !== "theme") root.dataset[part] = choice;
      else delete root.dataset[part];
    }
    root.style.colorScheme = custom ? (lightCards(custom) ? "light" : "dark") : "";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = custom ? custom.background : base === "prismal" ? "#000000" : THEME_PALETTES[base].background;
    shownLook = starLook(custom, base);
    if (window.STARFIELD && typeof window.STARFIELD.setTheme === "function") window.STARFIELD.setTheme(shownLook.name, shownLook.colors);
  }
  lookGiven = readLookGiven();
  // (The login page has no theme of its own: its stylesheet comes only when a look is handed to it)
  if (PAGE === "login" && lookGiven) {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = window.assetUrl("/themes.css");
    document.head.appendChild(sheet);
  }
  applyTheme();

  window.Themes = {
    list: THEMES,
    palettes: THEME_PALETTES,
    choices: CUSTOM_CHOICES,
    // The one this device keeps, and the one this page shows (Prismal on a page that isn't themed)
    saved: savedTheme,
    shown: shownTheme,
    // The Custom theme this device keeps (null when it has none yet), and one with every part as it should be
    custom: savedCustom,
    tidyCustom,
    // What a link from this page adds to hand on its look ("look=fall", and a Custom theme's parts; "" for Prismal's)
    lookQuery() {
      const shown = shownTheme();
      if (shown === "prismal") return "";
      if (shown !== "custom") return `look=${shown}`;
      const custom = lookGiven?.custom || savedCustom();
      return custom ? `look=custom&custom=${encodeURIComponent(JSON.stringify(custom))}` : "";
    },
    // The starfield's look on this page (Starfield Setup.js): { name, colors }
    starLook: () => shownLook,
    // Keeps THEME on this device and shows it (false when this browser won't keep it)
    set(theme) {
      if (!THEMES.includes(theme)) return false;
      try {
        if (theme === "prismal") storage.removeItem(THEME_KEY);
        else storage.setItem(THEME_KEY, theme);
      } catch (e) {
        return false;
      }
      previewing = null;
      applyTheme();
      return true;
    },
    // Keeps a Custom theme on this device, and shows it
    saveCustom(custom) {
      try {
        storage.setItem(CUSTOM_KEY, JSON.stringify(tidyCustom(custom)));
        storage.setItem(THEME_KEY, "custom");
      } catch (e) {
        return false;
      }
      previewing = null;
      applyTheme();
      return true;
    },
    // Shows a theme (a name, or a Custom theme) without keeping it, until endPreview
    preview(theme) {
      previewing = theme && typeof theme === "object" ? tidyCustom(theme) : THEMES.includes(theme) ? theme : null;
      applyTheme();
    },
    endPreview() {
      previewing = null;
      applyTheme();
    }
  };

  // Another tab on this device changed the theme or Reduced Motion: this one follows
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY || event.key === CUSTOM_KEY) applyTheme();
    if (event.key === STILL_STARS_KEY || event.key === LESS_MOTION_KEY) applyMotion();
  });

  /* ===============================
   *  4) STARFIELD HEAD START
   * =============================== */
  // The starfield's engine (a worker running Active Starfield.js) and its star image start loading now, while
  // the page itself is still loading, instead of after it: Starfield Setup.js picks them both up, so the stars
  // are drawn as soon as the page shows instead of a moment later. Not when the device asks for reduced motion
  // (there's no starfield then), or in a browser that can't hand the canvas to a worker (Setup draws on the page).
  // (Settings' Reduced Motion switch for the starfield doesn't stop it from starting: it draws the stars once, and they
  // hold still.)
  if (!deviceAsksLessMotion() && typeof Worker === "function" && window.HTMLCanvasElement && "transferControlToOffscreen" in HTMLCanvasElement.prototype) {
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

  // Which way this page slides in. A link or button of the site's that opened it left a note for this tab (Layout.js
  // slideWay): the page slides in the way the last one slid out, from the right, the left, or the top, or (between the
  // budget's four pages, by a tab) the header and the tabs are already in place and only the rest of the page slides
  // in. Layout.js takes the class off once it's in. Anything else (Back, Forward, a reload, or a link from somewhere
  // else) slides it up into view.
  const SLIDE_CLASSES = { left: "fromRight", right: "fromLeft", down: "fromTop", tab: "tabSlide" };
  const TAB_PAGES = ["home", "recurring", "history", "accounts"];
  let slide = null;
  try {
    slide = JSON.parse(sessionStorage.getItem("prismal_slide") || "null");
    sessionStorage.removeItem("prismal_slide");
  } catch (e) {}
  let navigationType = "navigate";
  try { navigationType = performance.getEntriesByType("navigation")[0].type; } catch (e) {}
  const slideClass = slide && slide.page === PAGE && navigationType === "navigate" && Math.abs(Date.now() - slide.at) < 30000 && SLIDE_CLASSES[slide.way];
  if (slideClass && (slideClass !== "tabSlide" || (TAB_PAGES.includes(PAGE) && !FRONT_PAGE))) document.documentElement.classList.add(slideClass);

  /* ===============================
   *  6) Append page scripts at END
   * =============================== */
  // Starfield Setup goes first, so the stars start right away (Boot.js has already started its worker, see
  // above), and it has to come before Keyboard and Layout, which use window.STARFIELD. Then Sprites, so the
  // emoji's images (the entry types, and In Bank, Gains, and Costs) are in before the page slides in. Sounds plays
  // the site's sound effects and music.
  const GLOBAL_SCRIPTS = [
    "/Javascript/Starfield Setup.js",
    "/Javascript/Sprites.js",
    "/Javascript/Layout.js",
    "/Javascript/Sounds.js",
    "/Javascript/Keyboard Starfield.js",
    "/Javascript/Analytics.js"
  ];

  // Quick Entry borrows the budget helpers and New Entry form without loading a budget (see Quick Entry.js)
  const BUDGET_PAGES = ["home", "recurring", "history", "accounts", "spreadsheets", "tracker", "calculator", "payments", "logs", "bob", "settings", "quick"];

  // The script that draws each budget page (the menu data pages share Budget Pages.js)
  const PAGE_SCRIPTS = {
    home: "/Javascript/Calendar Page.js",
    settings: "/Javascript/Settings Page.js",
    spreadsheets: "/Javascript/Spreadsheets Page.js",
    bob: "/Javascript/Bob Page.js",
    quick: "/Javascript/Quick Entry.js"
  };

  // Add a script at the end of the page, at its fingerprinted address (they run in the order they're added)
  function appendScript(src){
    const s = document.createElement("script");
    s.src = window.assetUrl(src);
    s.async = false;
    document.body.appendChild(s);
  }

  // The scripts a page needs, in order: the shared ones, sign-in, then the budget and the page's own
  function scriptsFor(page, signedIn){
    const frontPage = page === "home" && !signedIn;
    const isPublic = frontPage || PUBLIC_PAGES.includes(page);
    // Quick Entry's link carries its key, so that page never loads analytics
    const scripts = GLOBAL_SCRIPTS.filter(src => page !== "quick" || !src.endsWith("/Analytics.js"));

    // Passkeys (Face ID, Touch ID, Windows Hello): signing in on the login page, managing them in Settings
    if (page === "login" || page === "settings") {
      scripts.push("/Javascript/Passkeys.js");
    }
    if (page === "login") {
      scripts.push("/Javascript/Dates.js"); // The birth date's box and its calendar
      scripts.push("/Javascript/Login.js");
    }
    else if (!isPublic) {
      scripts.push("/Javascript/Session.js"); // Sends signed-out visitors to login, so public pages skip it
      // Which budget the page opens, and the budget picker over the header's buttons (before Process Budget, which asks
      // it which budget to load)
      scripts.push("/Javascript/Budgets.js");
      // The Menu page shows no budget, but its picker's list and Share open the same panels as the budget pages'
      if (page === "menu") scripts.push("/Javascript/Budget UI.js");
    }
    if (page === "notfound") {
      scripts.push("/Javascript/Debug.js");
    }
    // Every page that shows budget data loads + saves it through Process Budget,
    // then draws itself: the calendar page, settings, or the menu data pages (the front page shows none)
    if (BUDGET_PAGES.includes(page) && !frontPage) {
      scripts.push("/Javascript/Dates.js"); // Days stored, shown, typed, and picked (Process Budget.js uses it)
      scripts.push("/Javascript/Process Budget.js");
      scripts.push("/Javascript/Budget UI.js");
      // Connected spreadsheets' reading (Quick Entry never reads them)
      if (page !== "quick") scripts.push("/Javascript/Spreadsheets.js");
      // Connected calendars' reading and pay, on the pages that keep them up to date
      if (page === "home" || page === "spreadsheets") scripts.push("/Javascript/Calendars.js");
      // Search (Home's and History's): before the page script, which opens it
      if (page === "home" || page === "history") scripts.push("/Javascript/Budget Search.js");
      // The Quick Entry icon: Settings makes it, and the Quick Entry page puts it in its icon links
      if (page === "settings" || page === "quick") scripts.push("/Javascript/Quick Icon.js");
      // The line graphs (Bob's Data windows and the Debt Calculator)
      if (page === "bob" || page === "payments") scripts.push("/Javascript/Line Graph.js");
      // Push notifications on this device: Settings turns them on and off, and Home asks once after a sign-in
      if (page === "home" || page === "settings") scripts.push("/Javascript/Notifications.js");
      // Bob's page works out his warnings for Home too (Calendar Page.js renderBobWarnings)
      if (page === "home") scripts.push("/Javascript/Bob Page.js");
      scripts.push(PAGE_SCRIPTS[page] || "/Javascript/Budget Pages.js");
      // The Spreadsheets & Calendars page's calendars
      if (page === "spreadsheets") scripts.push("/Javascript/Calendars Page.js");
    }
    return scripts;
  }

  // Another page's scripts, at their fingerprinted addresses: Layout.js loads them early, while this page slides out
  window.pageScripts = function pageScripts(page){
    let signedIn = false;
    try { signedIn = !!storage.getItem("prismal_jwt"); } catch (e) {}
    return scriptsFor(page, signedIn).map(window.assetUrl);
  };

  // This page's scripts
  function loadPageScripts(){
    scriptsFor(PAGE, isLoggedIn).forEach(appendScript);
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
    applyTheme(); // (Its color for the browser's bar: the page's <meta> is in now)
  });
})();
