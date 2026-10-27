// Layout + page transitions for Prismal Budget.
// This file owns navigation animations, bfcache hygiene, touch-safe tap handling, the screen layer floating
// windows live in, floating Help, the footer, and signing out. Starfield is treated as a "passenger" that we
// freeze/save during transitions.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) GLOBAL STATE + HELPERS
 *     - Transition guard flags
 *     - Timer hygiene for bfcache
 *     - Starfield freeze/save hooks
 *     - The screen layer (floating windows stay on the visible screen)
 *     - Slide timing (read from the CSS)
 *     - Which way pages slide
 *     - Navigation type detection
 *     - Referrer analysis for back button behavior (menu vs homepage vs internal)
 *
 *  2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *     - Helpers to lock/unlock document scroll
 *
 *  3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *     - Trigger slide-in (on load, or sooner if something is slow to load)
 *     - Decide back button visibility + stored back URL
 *
 *  4) BACK/FORWARD CACHE (PAGESHOW)
 *     - Repair state after bfcache restores
 *
 *  5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *     - Animate out, the way slideWay picks (a tab's glow slides to the tab that was tapped)
 *     - Load the next page meanwhile (prefetch)
 *     - Freeze+save near the end
 *     - Navigate on transitionend (with timeout fallback)
 *
 *  6) LINKS (CLICK + TOUCH TAP VS SWIPE), SIGNING OUT, HELP, MISSING IMAGES
 *     - One click listener for every link (ones added later too)
 *     - Swipe-to-scroll remains native
 *====================================================================*/


/*======================================================================
 * #region 1) GLOBAL STATE + HELPERS
 *====================================================================*/

/* GROUP: Transition guard flag */
// Track whether a transition is currently running.
// This prevents double clicks/taps from stacking multiple navigations.
let IS_TRANSITION_ACTIVE = false; // True while slide-out is in progress

/* GROUP: Starfield alias */
// Create a short alias to the STARFIELD namespace.
// Used only for freeze/save/resizing helpers.
var S = window.STARFIELD; // Local pointer to global STARFIELD (may be null on some pages)

/* GROUP: Pending transition timers */
// bfcache can resurrect timers if they were scheduled before leaving.
// We store handles so we can cancel them safely on pagehide/pageshow.
let SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;     // setTimeout handle: freeze/save shortly before navigation
let NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;  // setTimeout handle: fallback navigation if transitionend fails
let STILL_HERE = null;                       // { timer, onVisibility } while a page that slid out waits to be gone

/* GROUP: Timer hygiene */
// Cancel any pending transition timers and reset handles.
// Prevents "ghost navigations" after bfcache restores.
function clearPendingTransitionTimers() {
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID);
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID);

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;
  stopWaitingToBeGone();
}

/* GROUP: Starfield freeze + save */
// Freeze starfield motion and persist the latest state.
// Called when leaving or backgrounding so the canvas doesn't drift while hidden.
function freezeAndSaveStarfield() {
  S = window.STARFIELD; // Re-alias in case Setup loads after this file on some pages
  if (!S) return;

  if (typeof S.setFrozen === "function") S.setFrozen(true);

  if (typeof S.saveStarfieldToStorage === "function") {
    S.saveStarfieldToStorage();
  }
}

/* GROUP: The screen layer */
// Floating windows (panels, Search, Help, the date picker) live in one layer over the part of the page that's on the
// screen, at its normal size: the browser's visual viewport, which moves and shrinks when the page is pinch-zoomed or a
// phone's keyboard is up. (position: fixed on its own sticks to the page's full-size layout viewport instead, which left
// them in odd spots then.) The layer's own pixels are the screen's, so a window opens at its own size however the page is
// zoomed. While nothing is open in it, it follows the visual viewport (placeScreenLayer). Once a window opens, the layer
// stays put on the page instead (pinned: part of the page, where the screen was), so the page can be scrolled and
// pinch-zoomed with the window in it, the way the rest of the page is; when the last one closes, it follows the screen
// again. Notes, the idle sign-out's countdown, and the version badge are in a second layer that always follows the
// screen (NOTE_LAYER), so they're always in sight.
const SCREEN_LAYER = document.createElement("div");
SCREEN_LAYER.id = "screenLayer";
const NOTE_LAYER = document.createElement("div");
NOTE_LAYER.id = "noteLayer";
document.body.append(SCREEN_LAYER, NOTE_LAYER);
// (Boot.js added the version badge before this ran)
const VERSION_BADGE = document.getElementById("versionBadge");
if (VERSION_BADGE) NOTE_LAYER.appendChild(VERSION_BADGE);
let SCREEN = { x: 0, y: 0, width: 0, height: 0, scale: 1 }; // Where the screen is (page pixels) and its size (its own)
const SCREEN_LISTENERS = new Set();
let SCREEN_FRAME = 0;
let SCREEN_PINNED = false; // A window is open: the layer stays put on the page

// Put a layer over the visual viewport (fixed, or PAGE: pinned to the page where the screen is)
function coverScreen(LAYER, PAGE = false) {
  const VIEW = window.visualViewport;
  const X = PAGE ? (VIEW ? VIEW.pageLeft : window.scrollX) : SCREEN.x;
  const Y = PAGE ? (VIEW ? VIEW.pageTop : window.scrollY) : SCREEN.y;
  LAYER.style.width = `${SCREEN.width}px`;
  LAYER.style.height = `${SCREEN.height}px`;
  LAYER.style.transform = `translate(${X}px, ${Y}px) scale(${1 / SCREEN.scale})`;
}

// Follow the visual viewport (and tell what's in the screen layer that the screen moved, unless it's pinned)
function placeScreenLayer(FORCE = false) {
  SCREEN_FRAME = 0;
  const VIEW = window.visualViewport;
  const SCALE = VIEW && VIEW.scale > 0 ? VIEW.scale : 1;
  const NEXT = VIEW
    ? { x: VIEW.offsetLeft, y: VIEW.offsetTop, width: VIEW.width * SCALE, height: VIEW.height * SCALE, scale: SCALE }
    : { x: 0, y: 0, width: document.documentElement.clientWidth, height: window.innerHeight, scale: 1 };
  if (!FORCE && Object.keys(NEXT).every(KEY => Math.abs(NEXT[KEY] - SCREEN[KEY]) < 0.01)) return;
  SCREEN = NEXT;
  coverScreen(NOTE_LAYER);
  if (SCREEN_PINNED) return;
  coverScreen(SCREEN_LAYER);
  SCREEN_LISTENERS.forEach((LISTENER) => {
    try { LISTENER(); } catch (ERROR) { console.warn("Couldn't follow the screen:", ERROR); }
  });
}

// Once per frame, however often the screen moves
function queueScreenLayer() {
  if (!SCREEN_FRAME) SCREEN_FRAME = requestAnimationFrame(() => placeScreenLayer());
}

// Is a window in the screen layer (shown, or still shrinking away)?
function windowOpen() {
  return [...SCREEN_LAYER.children].some(CHILD => !CHILD.hidden && CHILD.getClientRects().length > 0);
}

// The layer pins itself to the page (where the screen is) as a window opens, and follows the screen again once none is
// left
function pinScreenLayer() {
  const PIN = windowOpen();
  if (PIN === SCREEN_PINNED) return;
  SCREEN_PINNED = PIN;
  SCREEN_LAYER.classList.toggle("isPinned", PIN);
  placeScreenLayer(true);
  if (PIN) coverScreen(SCREEN_LAYER, true);
}
new MutationObserver(pinScreenLayer).observe(SCREEN_LAYER, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });

placeScreenLayer(true);
window.visualViewport?.addEventListener("resize", queueScreenLayer);
window.visualViewport?.addEventListener("scroll", queueScreenLayer);
window.addEventListener("resize", queueScreenLayer);

window.ScreenLayer = {
  element: SCREEN_LAYER,
  // Notes (toasts) and other notices that always stay in sight
  notes: NOTE_LAYER,
  // The page's zoom when the layer was placed (1 when it isn't pinch-zoomed): a page pixel is this many of the layer's
  scale: () => SCREEN.scale,
  // The layer's size, in its own pixels
  size: () => ({ width: SCREEN.width, height: SCREEN.height }),
  // Where an element is, in the layer's own pixels: { left, top, right, bottom, width, height } (from where the layer is
  // now, which a pinned layer's scroll moves)
  rectOf(EL) {
    const BOX = EL.getBoundingClientRect();
    const LAYER = SCREEN_LAYER.getBoundingClientRect();
    const LEFT = (BOX.left - LAYER.left) * SCREEN.scale;
    const TOP = (BOX.top - LAYER.top) * SCREEN.scale;
    return { left: LEFT, top: TOP, right: LEFT + BOX.width * SCREEN.scale, bottom: TOP + BOX.height * SCREEN.scale, width: BOX.width * SCREEN.scale, height: BOX.height * SCREEN.scale };
  },
  // LISTENER runs after the screen moved or changed size while the layer follows it (the page was zoomed or scrolled
  // while zoomed, or a keyboard came up), so something placed by its box can be placed again
  onChange(LISTENER) {
    SCREEN_LISTENERS.add(LISTENER);
  }
};

/* GROUP: Floating windows (Help, panels, search boxes) */
// They zoom out of the button that opened them, and back into it when they close (Budget UI.js's panels do
// the same). Each one also closes the moment the page is left, so the browser's Back button (which can
// bring a page back exactly as it was left) never shows one still open.
const PAGE_EXIT_CLOSERS = new Set();

// Does the device ask for less motion?
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Where the window would sit as its button: its corner on the button's corner, shrunk to the button's size. (A window in
// the screen layer moves in the layer's own pixels, which are a page pixel times the page's zoom.)
function zoomedToButton(EL, BUTTON) {
  const FROM = BUTTON.getBoundingClientRect();
  const TO = EL.getBoundingClientRect();
  const UNZOOM = SCREEN_LAYER.contains(EL) ? SCREEN.scale : 1;
  const SCALE_X = Math.max(FROM.width / (TO.width || 1), 0.05);
  const SCALE_Y = Math.max(FROM.height / (TO.height || 1), 0.05);
  return `translate(${(FROM.left - TO.left) * UNZOOM}px, ${(FROM.top - TO.top) * UNZOOM}px) scale(${SCALE_X}, ${SCALE_Y})`;
}

// Can EL zoom out of BUTTON? (animations work, the button is on the page, and motion is allowed)
function canZoom(EL, BUTTON) {
  return !!(EL.animate && BUTTON && BUTTON.isConnected && BUTTON.getClientRects().length && !prefersReducedMotion());
}

window.FloatingWindows = {
  // EL has just been shown: it grows out of BUTTON
  zoomOpen(EL, BUTTON) {
    if (EL.zoomAnimation) EL.zoomAnimation.cancel();
    EL.zoomAnimation = null;
    if (!canZoom(EL, BUTTON)) return;
    EL.zoomAnimation = EL.animate([
      { transformOrigin: "0 0", transform: zoomedToButton(EL, BUTTON), opacity: 0.35 },
      { transformOrigin: "0 0", transform: "none", opacity: 1 }
    ], { duration: 320, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" });
  },
  // EL shrinks back into BUTTON, then HIDE() hides it (right away when it can't zoom)
  zoomClose(EL, BUTTON, HIDE) {
    if (EL.zoomAnimation) EL.zoomAnimation.cancel();
    EL.zoomAnimation = null;
    if (!canZoom(EL, BUTTON) || !EL.getClientRects().length) {
      HIDE();
      return;
    }
    const ANIMATION = EL.animate([
      { transformOrigin: "0 0", transform: "none", opacity: 1 },
      { transformOrigin: "0 0", transform: zoomedToButton(EL, BUTTON), opacity: 0 }
    ], { duration: 200, easing: "ease-in", fill: "forwards" });
    EL.zoomAnimation = ANIMATION;
    ANIMATION.onfinish = () => {
      if (EL.zoomAnimation !== ANIMATION) return; // Opened again in the meantime
      EL.zoomAnimation = null;
      HIDE();
      ANIMATION.cancel(); // Back to normal for the next time it opens
    };
  },
  // CLOSE() closes a window right away (no animation) when the page is left
  closeOnPageExit(CLOSE) {
    PAGE_EXIT_CLOSERS.add(CLOSE);
  }
};

/* GROUP: Leave/return lifecycle */
// pagehide fires for real navigations and for bfcache entries.
// This is the most reliable "we are leaving" hook across browsers.
function closeFloatingWindows() {
  PAGE_EXIT_CLOSERS.forEach((CLOSE) => {
    try { CLOSE(); } catch (ERROR) { console.warn("Couldn't close a floating window:", ERROR); }
  });
}

window.addEventListener("pagehide", () => {
  clearPendingTransitionTimers();
  freezeAndSaveStarfield();
  closeFloatingWindows();
});

/* GROUP: Backgrounding + tab switching */
// visibilitychange helps on mobile where pagehide may not fire immediately.
document.addEventListener("visibilitychange", () => {
  S = window.STARFIELD;
  if (!S) return;

  if (document.visibilityState === "hidden") {
    freezeAndSaveStarfield();
  } else if (document.visibilityState === "visible") {
    if (typeof S.setFrozen === "function") S.setFrozen(false);
  }
});

/* GROUP: A Quick Entry icon's app comes back to Quick Entry */
// A Quick Entry icon on a phone's home screen opens as an app of its own (quick.html's meta tags). Its Home button can go
// on to the budget (signing in first), but the icon is for Quick Entry: left on another page and opened again, the app
// goes back to the Quick Entry page it opened on. That page is kept in the app's own session storage (QUICK_APP_KEY).
// Leaving the app hides its page without leaving it by a link, so the time it was hidden is kept too (APP_LEFT_KEY, taken
// off when a link or the app itself leaves the page, pagehide); back on the screen after APP_AWAY_MS or more (a passkey's
// sheet over it is shorter), or opened again on that page, it goes back to Quick Entry. Only in an app opened from the
// home screen (in a browser's tab, a page stays where it was left), and never from the login page, where a passkey's or a
// password's sheet can come and go while signing in.
// Brought back from another page, Quick Entry's Back goes to it (QUICK_RETURN_KEY, see showQuickBack); opened fresh from
// the icon, it has none.
const QUICK_APP_KEY = "prismal_quick_app";
const APP_LEFT_KEY = "prismal_app_left";
const QUICK_RETURN_KEY = "prismal_quick_return";
const APP_AWAY_MS = 3000;
const RUNNING_AS_APP = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const readSession = (KEY) => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const writeSession = (KEY, VALUE) => {
  try {
    if (VALUE === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, VALUE);
  } catch {}
};

// Back to the Quick Entry page the app opened on, when it's away from it (and has nothing unsaved)
function backToQuickEntry() {
  const LEFT = Number(readSession(APP_LEFT_KEY));
  writeSession(APP_LEFT_KEY, null);
  const QUICK = readSession(QUICK_APP_KEY);
  if (!QUICK || !LEFT || Date.now() - LEFT < APP_AWAY_MS || window.PAGE === "quick" || window.PAGE === "login" || hasChangesToSave()) return;
  writeSession(QUICK_RETURN_KEY, location.pathname + location.search + location.hash);
  if (typeof window.transitionTo === "function") window.transitionTo(QUICK, true);
  else location.replace(QUICK);
}

// Quick Entry's Back, once the app went back to it from another page: it goes to that page (signing in again first, like
// any page, if that time has passed). It's read once, so Quick Entry opened again later starts without it.
function showQuickBack() {
  const BACK = document.getElementById("quickBack");
  const RETURN = readSession(QUICK_RETURN_KEY);
  writeSession(QUICK_RETURN_KEY, null);
  if (!BACK || !RETURN || !RETURN.startsWith("/") || RETURN.startsWith("//")) return;
  BACK.href = RETURN;
  BACK.hidden = false;
}

if (RUNNING_AS_APP) {
  if (window.PAGE === "quick") {
    // (Its key is all it needs: quick.html?key=...)
    const KEY = new URLSearchParams(location.search).get("key");
    if (KEY) writeSession(QUICK_APP_KEY, `/quick.html?key=${encodeURIComponent(KEY)}`);
    onDOMReady(showQuickBack);
  } else if (readSession(QUICK_APP_KEY)) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") writeSession(APP_LEFT_KEY, String(Date.now()));
      else backToQuickEntry();
    });
    window.addEventListener("pagehide", () => writeSession(APP_LEFT_KEY, null));
    // (Opened again on this page: the phone had closed the page while the app was away)
    onDOMReady(backToQuickEntry);
  }
}

/* GROUP: DOM helpers */
// Get the transition wrapper element.
// This container receives slide-in/out classes in CSS.
const getTransitionContainer = () => document.getElementById("transitionContainer");

/* GROUP: Slide timing */
// How long the container's slide takes, straight from the CSS (stylesheet.css section 10), so the two
// never disagree. 0 when there's no slide (reduced motion), and then nothing waits for one. Between the
// budget's four pages only the page under the header and the tabs slides (TAB_SLIDE), so that's what's timed.
function getSlideDurationSeconds(TAB_SLIDE = document.documentElement.classList.contains("tabSlide")) {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return 0;
  if (!TAB_SLIDE) return parseFloat(getComputedStyle(CONTAINER).transitionDuration) || 0;
  // (The parts only get their transition once they start sliding)
  if (prefersReducedMotion()) return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--SLIDE_DURATION")) || 0;
}

// The first part of the page that slides between the budget's four pages (stylesheet.css section 10)
function firstSlidingPart() {
  return document.querySelector("#transitionContainer > main > :not(.pageTop), #transitionContainer .pageTop > :not(.pageTabs)");
}

// How far into its time a slide out has the page out of sight: with the CSS's ease-in-out, it has gone 95% of the way
// by then, past the screen's edge (it slides 110% of the screen)
const OUT_OF_SIGHT = 0.85;

// The classes for each way (stylesheet.css section 10): html's while a page slides in (Boot.js adds them), and the
// container's while it slides out (down and out needs none)
const SLIDE_IN_CLASSES = ["tabSlide", "fromRight", "fromLeft", "fromTop"];
const SLIDE_OUT_CLASSES = { left: "toLeft", right: "toRight", up: "toTop" };

/* GROUP: Which way pages slide */
// Pages slide as if they sat side by side: the Menu and its pages to the right of the budget (going there slides left,
// coming back slides right), Quick Entry and the Privacy Policy to its left (going there slides right, leaving slides
// left), and Settings above it all (it slides down into view, and back up to leave). Signing in slides left and
// signing out slides right, as if the login page sat to the left of the budget (and to the right of the front page,
// so Sign In there slides left too). Between the budget's four pages, only what's under their tabs slides. The page
// that opens slides in the same way the last one slid out (Boot.js reads the note transitionTo leaves).
const MENU_PAGES = ["menu", "spreadsheets", "tracker", "calculator", "logs", "bob"];
const SIDE_PAGES = ["quick", "privacy"];
const BUDGET_TABS = ["home", "recurring", "history", "accounts"];

// The way from page FROM to page TO: "left", "right", "up", "down", "tab", or null (anything else: the page slides
// down and out, and the next one up into view)
function slideWay(FROM, TO) {
  const SIGNED_IN = !!readStored("prismal_jwt");
  if (!FROM || !TO || FROM === TO) return null;
  if (TO === "settings") return "down";
  if (FROM === "settings") return "up";
  if (SIDE_PAGES.includes(TO)) return "right";
  if (SIDE_PAGES.includes(FROM)) return "left";
  if (FROM === "login") return SIGNED_IN ? "left" : TO === "home" ? "right" : null;
  if (TO === "login") return FROM === "home" && !SIGNED_IN ? "left" : null;
  if (MENU_PAGES.includes(TO) && (FROM === "menu" || !MENU_PAGES.includes(FROM))) return "left";
  if (MENU_PAGES.includes(FROM)) return "right";
  if (BUDGET_TABS.includes(FROM) && BUDGET_TABS.includes(TO) && SIGNED_IN) return "tab";
  return null;
}

// Which of the site's pages an address is (Boot.js pageKeyOf), or null for another site's
function pageOf(ADDRESS) {
  try {
    const TARGET = new URL(ADDRESS, location.href);
    if (TARGET.origin !== location.origin || typeof window.pageKeyOf !== "function") return null;
    return window.pageKeyOf(TARGET.pathname);
  } catch {
    return null;
  }
}

/* GROUP: Navigation type detection */
// Detect whether this page was restored via back/forward (often bfcache).
// We use this to repair state when a user returns without a full reload.
function isBackForwardNavigation(EVENT) {
  if (EVENT?.persisted) return true;

  try {
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  } catch {
    return false;
  }
}

/* GROUP: Referrer analysis */
// Determine whether the referrer is internal, and whether it was the Menu page or the Homepage.
// This controls whether certain back buttons should appear and what "back" should mean.
function getReferrerInfo() {
  const REFERRER = document.referrer;

  let IS_INTERNAL_REFERRER = false; // True if referrer is same-origin
  let CAME_FROM_MENU_PAGE = false;  // True if referrer path matches /menu
  let CAME_FROM_HOME_PAGE = false;  // True if referrer path matches homepage (/ or /index.html)
  let CAME_FROM_LOGIN_PAGE = false; // True if referrer path matches the login page

  if (!REFERRER) return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE, CAME_FROM_LOGIN_PAGE };

  try {
    const REFERRER_URL = new URL(REFERRER);
    IS_INTERNAL_REFERRER = REFERRER_URL.origin === location.origin;

    const REFERRER_PATH = REFERRER_URL.pathname.toLowerCase();

    CAME_FROM_MENU_PAGE =
      REFERRER_PATH === "/menu" ||
      REFERRER_PATH === "/menu/" ||
      REFERRER_PATH.endsWith("/menu/index.html");

    CAME_FROM_HOME_PAGE =
      REFERRER_PATH === "/" ||
      REFERRER_PATH === "" ||
      REFERRER_PATH === "/index.html" ||
      REFERRER_PATH === "/index.htm";

    CAME_FROM_LOGIN_PAGE =
      REFERRER_PATH === "/login" ||
      REFERRER_PATH === "/login/" ||
      REFERRER_PATH === "/login.html" ||
      REFERRER_PATH === "/login.htm";
  } catch {}

  return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE, CAME_FROM_LOGIN_PAGE };
}

// Storage can be blocked (the browser's cookies and site data setting); these never throw
function readStored(KEY) {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

// Save a value (null removes it)
function writeStored(KEY, VALUE) {
  try {
    if (VALUE === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, VALUE);
  } catch {}
}

/* #endregion 1) GLOBAL STATE + HELPERS */



/*======================================================================
 * #region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *====================================================================*/

/* GROUP: Lock scroll during transitions */
// We lock both html and body for maximum cross-browser reliability.
function disableDocumentScroll() {
  const CONTAINER = getTransitionContainer();

  document.documentElement.style.overflowY = "hidden";
  document.body.style.overflowY = "hidden";

  if (CONTAINER) CONTAINER.style.overflowY = "visible";
}

/* GROUP: Restore scroll after transitions/load */
// Put scroll back on the document.
function enableDocumentScroll() {
  const CONTAINER = getTransitionContainer();

  document.documentElement.style.overflowY = "auto";
  document.body.style.overflowY = "visible";
  if (CONTAINER) CONTAINER.style.overflowY = "hidden";
  settlePage();
}

/* GROUP: The page stays at its top while it slides in */
// While a page is still sliding in, it's below the screen, so anything that brings a spot into view (a box taking the
// focus, the browser filling in a password, a #spot in the address) would scroll the page down by that much, and it
// would land scrolled to the bottom. So until it's in place it stays at its top (unless the browser is putting it back
// where it was: Back, Forward, or a reload), and then a #spot in the address is scrolled to.
let PAGE_SETTLED = false;

// Is the browser putting this page back where it was? (Back, Forward, or a reload)
function isReturningPage() {
  if (isBackForwardNavigation()) return true;
  try { return performance.getEntriesByType("navigation")[0]?.type === "reload"; } catch { return false; }
}

window.addEventListener("scroll", () => {
  if (PAGE_SETTLED || isReturningPage()) return;
  if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
}, { passive: true });

// The page has slid in: it scrolls normally from here, and a #spot in the address comes into view
function settlePage() {
  if (PAGE_SETTLED) return;
  PAGE_SETTLED = true;
  document.documentElement.classList.remove(...SLIDE_IN_CLASSES);
  if (!location.hash || isReturningPage()) return;
  let SPOT = null;
  try { SPOT = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch {}
  if (SPOT) SPOT.scrollIntoView();
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



/*======================================================================
 * #region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *====================================================================*/

/* GROUP: Slide in */
// The page slides in once everything has loaded, so images and fonts are settled first. A page still
// waiting on something slow (a big image on a weak connection) slides in anyway after a moment.
const SLIDE_IN_AT_THE_LATEST_MS = 1500;
let HAS_SLID_IN = false;

// The page slides in (once)
function slideIn() {
  if (HAS_SLID_IN) return;
  HAS_SLID_IN = true;
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;
  requestAnimationFrame(() => {
    CONTAINER.classList.add("ready");
    // Scrolling comes back when the slide ends (section 6), right away with no slide (reduced motion),
    // and in any case once the slide's time is up (in case its end never comes, like an interrupted slide)
    const DURATION_MS = getSlideDurationSeconds() * 1000;
    if (DURATION_MS === 0) enableDocumentScroll();
    else setTimeout(() => { if (!IS_TRANSITION_ACTIVE) enableDocumentScroll(); }, DURATION_MS + 200);
  });
}

window.addEventListener("load", () => {
  slideIn();
  setUpBackButton();
});
setTimeout(slideIn, SLIDE_IN_AT_THE_LATEST_MS);

/* GROUP: Back button logic (supports multiple pages) */
function setUpBackButton() {
  const { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE, CAME_FROM_LOGIN_PAGE } = getReferrerInfo();

  // The Menu's pages: Back goes to the page that opened this one (the Menu, unless another of the site's pages did)
  const MENU_BACK = document.getElementById("menuBack");
  if (MENU_BACK && IS_INTERNAL_REFERRER && !CAME_FROM_LOGIN_PAGE) {
    try {
      if (new URL(REFERRER).pathname !== location.pathname) MENU_BACK.href = REFERRER;
    } catch {}
  }

  // Some pages may have different back buttons; use whichever exists.
  const HOME_BACK = document.getElementById("homeBack");
  const NORMAL_BACK = document.getElementById("normalBack");
  const BACK_LINK = HOME_BACK || NORMAL_BACK;

  if (!BACK_LINK) return;

  // If we came from Menu or directly from Homepage, hide "back" (avoid weird loops).
  if (CAME_FROM_MENU_PAGE && HOME_BACK || CAME_FROM_HOME_PAGE && NORMAL_BACK || CAME_FROM_LOGIN_PAGE && BACK_LINK) {
    BACK_LINK.hidden = true;
    return;
  }

  // If internal referrer exists, show back and store it for "back" keyword navigation.
  if (IS_INTERNAL_REFERRER && REFERRER) {
    BACK_LINK.hidden = false;
    writeStored("homepageBackUrl", REFERRER);
    return;
  }

  // External/unknown referrer: hide and clear stored back URL.
  BACK_LINK.hidden = true;
  writeStored("homepageBackUrl", null);
}

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



/*======================================================================
 * #region 4) BACK/FORWARD CACHE (PAGESHOW)
 *====================================================================*/

/* GROUP: Repair state after bfcache restore */
// pageshow fires when a page is shown, including bfcache restores.
// We repair timers, transition flags, and CSS classes so the UI is stable.
window.addEventListener("pageshow", (EVENT) => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  // Back to a signed-in page after signing out (it came back from the back/forward cache): go to login (which slides
  // in like any sign-out, and nothing slides this page out on the way). Back to the front page after signing in: the
  // budget.
  if (!readStored("prismal_jwt") && !window.PUBLIC_PAGE) {
    IS_TRANSITION_ACTIVE = true;
    leaveNote("login", "right");
    window.location.replace("/login.html");
    return;
  }
  if (window.FRONT_PAGE && readStored("prismal_jwt")) {
    window.location.reload();
    return;
  }

  clearPendingTransitionTimers();

  S = window.STARFIELD;
  if (S && typeof S.setFrozen === "function") S.setFrozen(false);

  if (!isBackForwardNavigation(EVENT)) return;
  bringPageBack();
  CONTAINER.scrollTop = 0;
});

// A page that slid out shows again: Back or Forward brought it back, or it was still here after it was left (section 5).
// It slides back in the way it left. Its slide out was still easing to a stop when it was left, so that's stopped where
// it was headed first, or the page would jump back instead. One that slid up or down stays clipped to the screen until
// it's back (section 6 takes the clip off), so what's above or below doesn't run past.
function bringPageBack() {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;
  stopWaitingToBeGone();
  if (CONTAINER.getAnimations) CONTAINER.getAnimations().forEach(ANIMATION => ANIMATION.cancel());
  void getComputedStyle(CONTAINER).transform; // (where it went is where its slide back starts)
  CONTAINER.classList.remove("slide-out", "tab-slide-out", ...Object.values(SLIDE_OUT_CLASSES));
  CONTAINER.classList.add("ready");
  document.documentElement.classList.remove(...SLIDE_IN_CLASSES);
  setTimeout(() => { if (!IS_TRANSITION_ACTIVE) CONTAINER.style.clipPath = ""; }, getSlideDurationSeconds() * 1000 + 200);
  // A tab's glow that was sliding over when the page was left goes back where it belongs
  document.querySelectorAll(".tabGlow").forEach(GLOW => GLOW.remove());
  document.querySelectorAll(".pageTabs.isGliding").forEach(TABS => TABS.classList.remove("isGliding"));
  document.querySelectorAll(".isGlideTarget").forEach(TAB => TAB.classList.remove("isGlideTarget"));
  try { sessionStorage.removeItem("prismal_slide"); } catch {} // (The note for the page it was going to)
  IS_TRANSITION_ACTIVE = false;
  enableDocumentScroll();
  S = window.STARFIELD;
  if (S && typeof S.setFrozen === "function") S.setFrozen(false);
}

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*======================================================================
 * #region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *====================================================================*/

/* GROUP: Transition navigation entry point */
// Animate slide-out, then navigate once the page is out of sight.
// ADDRESS may be a real href or the special keyword "back". WAY: which way the page slides (slideWay works it out when
// it's left out). Between the budget's four pages ("tab"), only the page under the header and the tabs slides out,
// while the glow on the tab that's showing slides over to the next page's tab. The next page slides in the same way:
// this tab's session storage keeps a note for it (Boot.js).
function transitionTo(ADDRESS, useReplace = false, WAY) {
  if (IS_TRANSITION_ACTIVE) return;
  if (!ADDRESS) return;

  /* GROUP: "back" keyword support */
  if (ADDRESS === "back") {
    ADDRESS = readStored("homepageBackUrl") || "/";
  }

  /* GROUP: Which way, and the note for the next page */
  const TO = pageOf(ADDRESS);
  if (WAY === undefined) WAY = slideWay(window.PAGE, TO);
  const CONTAINER = getTransitionContainer();
  const TAB = WAY === "tab" ? tabFor(TO) : null;
  if (WAY === "tab" && !(TAB && firstSlidingPart())) WAY = null;
  const MOVING = WAY === "tab" ? firstSlidingPart() : CONTAINER;
  // Leaving another way while this page is still sliding in by its tab: the whole page slides out after all
  if (WAY !== "tab") document.documentElement.classList.remove("tabSlide");
  const DURATION_MS = getSlideDurationSeconds(WAY === "tab") * 1000;
  if (TO) leaveNote(TO, WAY);

  /* GROUP: Floating windows close before the page slides out */
  closeFloatingWindows();

  // (A page that slid out stays marked as leaving until it's gone: it opens the next page before its slide has quite
  // ended, and that end mustn't give it back its scrolling. Brought back by Back or Forward, section 4 unmarks it.)
  const LEAVE = () => {
    if (useReplace) window.location.replace(ADDRESS);
    else window.location.href = ADDRESS;
  };

  /* GROUP: Leaving without a slide */
  // Nothing to animate (no container, or reduced motion), a page that hasn't slid in yet (it's still out of sight),
  // changes that haven't been saved yet (the browser asks before the page is left, and staying keeps the page as it is),
  // or Quick Entry in its icon's app: there the link is followed during the tap itself, since a phone can open a page of
  // the site outside the app, or hold back a link followed a moment after the tap, and the page would be left slid out
  if (!CONTAINER || DURATION_MS === 0 || !CONTAINER.classList.contains("ready") || hasChangesToSave() || (RUNNING_AS_APP && window.PAGE === "quick")) {
    freezeAndSaveStarfield();
    LEAVE();
    return;
  }

  clearPendingTransitionTimers();
  IS_TRANSITION_ACTIVE = true;
  if (TO) prefetchPage(ADDRESS, TO);

  /* GROUP: Slide distance computation (supports different scroll owners) */
  const CONTAINER_SCROLL = CONTAINER.scrollTop || 0;
  const DOC_SCROLL = document.documentElement.scrollTop || document.body.scrollTop || 0;
  const ACTIVE_SCROLL = Math.max(DOC_SCROLL, CONTAINER_SCROLL);
  const SIDEWAYS = WAY === "left" || WAY === "right";

  if (WAY === "tab") {
    // The page under the tabs, from where it's scrolled to below the screen. The header and the tabs stay: scrolled
    // down, they glide back to the top while the page slides out, so they're right where the next page's are.
    document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${(window.innerHeight * 1.1) + ACTIVE_SCROLL}px`);
    if (DOC_SCROLL > 0) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } else {
    // The whole page, just past the screen's edge. Sliding up or down, only the part on the screen slides (what's
    // above or below it would otherwise run past on its way out).
    document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${(SIDEWAYS ? window.innerWidth : window.innerHeight) * 1.1}px`);
    if (!SIDEWAYS) clipToScreen(CONTAINER, ACTIVE_SCROLL);
  }
  disableDocumentScroll();

  /* GROUP: Start slide-out */
  window.Sounds?.playTransition(); // (A crystal rolling across crystals, over before the next page opens)
  if (WAY === "tab") {
    CONTAINER.classList.add("tab-slide-out");
    glideTabGlow(TAB, DURATION_MS);
  } else {
    CONTAINER.classList.add("slide-out");
    if (SLIDE_OUT_CLASSES[WAY]) CONTAINER.classList.add(SLIDE_OUT_CLASSES[WAY]);
  }

  /* GROUP: Navigate once the sliding part is out of sight */
  // The slide eases into its end, and by OUT_OF_SIGHT of its time the page is already past the screen's edge, so the
  // next page opens then instead of after that last unseen stretch (a shorter pause between the two slides). Where the
  // slide's progress can't be read, its end does it (or the timer after it).
  const onDone = (EVENT) => {
    // Only accept that part's transform finishing,
    // not random child transitions bubbling up.
    if (EVENT && (EVENT.target !== MOVING || EVENT.propertyName !== "transform")) return;

    CONTAINER.removeEventListener("transitionend", onDone);
    clearPendingTransitionTimers();
    LEAVE();
    waitToBeGone();
  };

  CONTAINER.addEventListener("transitionend", onDone);
  const SLIDE = MOVING.getAnimations ? MOVING.getAnimations().find(ANIMATION => ANIMATION.transitionProperty === "transform") : null;
  const watchSlide = () => {
    if (!IS_TRANSITION_ACTIVE) return;
    if (SLIDE.currentTime >= DURATION_MS * OUT_OF_SIGHT) onDone();
    else requestAnimationFrame(watchSlide);
  };
  if (SLIDE) requestAnimationFrame(watchSlide);

  // Safety net fallback (in case transitionend never fires)
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => onDone(), DURATION_MS + 150);

  // Freeze/save shortly before leaving (keeps canvas state stable)
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout(
    freezeAndSaveStarfield,
    Math.max(0, DURATION_MS * (SLIDE ? OUT_OF_SIGHT : 1) - 50)
  );
}

// How long a page that was left can stay on the screen before it shows again (longer than a next page takes to open,
// even on a slow connection)
const STILL_HERE_MS = 5000;

// A page that slid out and was left, but is still here: the link opened outside this page (a phone's app can open the
// site's other pages in a window of their own, which comes back here once it's closed) or was held back. It comes back
// into view instead of leaving just the starfield: when it's back on the screen after being hidden, or if it's still on
// the screen STILL_HERE_MS after it was left.
function waitToBeGone() {
  stopWaitingToBeGone();
  let WAS_HIDDEN = document.visibilityState === "hidden";
  const onVisibility = () => {
    if (document.visibilityState === "hidden") WAS_HIDDEN = true;
    else if (WAS_HIDDEN) bringPageBack();
  };
  document.addEventListener("visibilitychange", onVisibility);
  STILL_HERE = {
    onVisibility,
    timer: setTimeout(() => {
      if (document.visibilityState === "visible") bringPageBack();
      else WAS_HIDDEN = true;
    }, STILL_HERE_MS)
  };
}

// The page is gone (or back): nothing more to wait for
function stopWaitingToBeGone() {
  if (!STILL_HERE) return;
  clearTimeout(STILL_HERE.timer);
  document.removeEventListener("visibilitychange", STILL_HERE.onVisibility);
  STILL_HERE = null;
}

// The note for the next page (page TO), so it slides in the way this one slides out (Boot.js reads it)
function leaveNote(TO, WAY) {
  try { sessionStorage.setItem("prismal_slide", JSON.stringify({ page: TO, way: WAY, at: Date.now() })); } catch {}
}

// This page's tab for page TO (one of the budget's four pages), or null
function tabFor(TO) {
  return [...document.querySelectorAll(".pageTabs a.pageTab")].find(TAB => pageOf(TAB.getAttribute("href")) === TO) || null;
}

// The page is clipped to the part of it on the screen (in its own pixels, so the clip moves with it)
function clipToScreen(CONTAINER, SCROLL) {
  const TOP = Math.max(0, SCROLL - CONTAINER.offsetTop);
  const BOTTOM = Math.max(0, CONTAINER.offsetTop + CONTAINER.offsetHeight - SCROLL - window.innerHeight);
  CONTAINER.style.clipPath = `inset(${TOP}px 0 ${BOTTOM}px 0)`;
}

// Changes the server doesn't have yet (Process Budget.js): the browser asks about them before the page is left
function hasChangesToSave() {
  return typeof hasUnsavedChanges === "function" && typeof workspaceLoaded !== "undefined" && workspaceLoaded && hasUnsavedChanges();
}

/* GROUP: The next page loads while this one slides out */
// The next page, Boot.js (every page's first script, which browsers check for a newer copy each time), and the page's
// other scripts are fetched as soon as the slide starts, so they're here by the time it ends and the next page slides
// in sooner. (A browser that doesn't prefetch loads them when the page opens, as always.)
function prefetchPage(ADDRESS, TO) {
  const ADDRESSES = [ADDRESS, "/Javascript/Boot.js", ...(typeof window.pageScripts === "function" ? window.pageScripts(TO) : [])];
  ADDRESSES.forEach((HREF) => {
    const LINK = document.createElement("link");
    LINK.rel = "prefetch";
    LINK.href = HREF;
    document.head.appendChild(LINK);
  });
}

/* GROUP: The tab's glow slides to the tab that was tapped */
// While the page under the tabs slides out, the glow on the tab that's showing slides up or down to the tab that was
// tapped, where the next page has it already: a copy of its bright edge, glow, and dot does the moving (the tabs keep
// their places), and the light inside fades from the tab it left into the tapped one in the same time (budgetStyle.css
// .isGliding), so the tapped one looks just like the next page's when it comes.
function glideTabGlow(TAB, DURATION_MS) {
  const TABS = TAB.closest(".pageTabs");
  const CURRENT = TABS && TABS.querySelector('.pageTab[aria-current="page"]');
  if (!CURRENT || CURRENT === TAB || !TABS.animate) return;
  const BOX = (EL) => ({ left: EL.offsetLeft, top: EL.offsetTop, width: EL.offsetWidth, height: EL.offsetHeight });
  const FROM = BOX(CURRENT);
  const TO = BOX(TAB);
  // It gets there a little before the page leaves, so it rests on its tab for a moment
  const GLIDE_MS = Math.max(200, DURATION_MS * 0.75);
  const GLOW = document.createElement("span");
  GLOW.className = "tabGlow";
  GLOW.setAttribute("aria-hidden", "true");
  Object.assign(GLOW.style, { left: `${FROM.left}px`, top: `${FROM.top}px`, width: `${FROM.width}px`, height: `${FROM.height}px` });
  TABS.style.setProperty("--GLIDE_TIME", `${GLIDE_MS}ms`);
  TABS.appendChild(GLOW);
  TABS.classList.add("isGliding");
  TAB.classList.add("isGlideTarget");
  GLOW.animate([
    { transform: "translate(0, 0)", width: `${FROM.width}px`, height: `${FROM.height}px` },
    { transform: `translate(${TO.left - FROM.left}px, ${TO.top - FROM.top}px)`, width: `${TO.width}px`, height: `${TO.height}px` }
  ], { duration: GLIDE_MS, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



/*======================================================================
 * #region 6) LINKS, SIGNING OUT, HELP, MISSING IMAGES
 *====================================================================*/

/* GROUP: Small DOM utility */
// Toggle an element's hidden state by id. Returns the element (null if there isn't one).
function toggleElement(ELEMENT_ID) {
  if (!ELEMENT_ID) return null;
  const ELEMENT = document.getElementById(ELEMENT_ID);
  if (ELEMENT) ELEMENT.hidden = !ELEMENT.hidden;
  return ELEMENT;
}

/* GROUP: Touch tap vs swipe */
// A touch that moved more than a tap (a scroll that happened to end on a link) doesn't follow the link.
// Listening on the document covers every link, including ones added later.
let TOUCH = null; // { id, x, y, moved } for the touch in progress

document.addEventListener("pointerdown", (EVENT) => {
  TOUCH = EVENT.pointerType === "touch" ? { id: EVENT.pointerId, x: EVENT.clientX, y: EVENT.clientY, moved: false } : null;
}, { capture: true, passive: true });

document.addEventListener("pointermove", (EVENT) => {
  if (!TOUCH || EVENT.pointerId !== TOUCH.id || TOUCH.moved) return;
  if (Math.hypot(EVENT.clientX - TOUCH.x, EVENT.clientY - TOUCH.y) > 10) TOUCH.moved = true;
}, { capture: true, passive: true });

/* GROUP: Click (all inputs) */
// Links within the site slide the page out first. Everything else behaves like any link: other sites,
// other apps (mail, phone, calendars), new tabs and downloads, links opened with a modifier key or the
// middle button, and a spot on this same page (like How It Works' contents, which just scrolls there).
document.addEventListener("click", (EVENT) => {
  const LINK = EVENT.target.closest?.("a[href]");
  if (!LINK || EVENT.defaultPrevented) return;
  const HREF = LINK.getAttribute("href");

  // Touch swipe that ended on the link: don't navigate
  if (TOUCH && TOUCH.moved) {
    EVENT.preventDefault();
    return;
  }

  // The tab for the page that's already showing (aria-current="page"): nothing to go to
  if (LINK.getAttribute("aria-current") === "page") {
    EVENT.preventDefault();
    return;
  }

  // Special keywords
  if (HREF === "back") {
    EVENT.preventDefault();
    transitionTo("back");
    return;
  }
  if (HREF === "logout") {
    EVENT.preventDefault();
    signOut();
    return;
  }

  if (EVENT.button !== 0 || EVENT.metaKey || EVENT.ctrlKey || EVENT.shiftKey || EVENT.altKey) return;
  if (LINK.target === "_blank" || LINK.hasAttribute("download")) return;

  let TARGET;
  try { TARGET = new URL(HREF, location.href); } catch { return; }
  if (TARGET.origin !== location.origin || !/^https?:$/.test(TARGET.protocol)) return;
  if (TARGET.pathname === location.pathname && TARGET.search === location.search && TARGET.hash) return;

  // Everything else: we own navigation timing (and which way the page slides, see slideWay)
  EVENT.preventDefault();
  transitionTo(TARGET.href);
});

/* GROUP: Signing out */
// Signing out (or deleting the account) forgets everything this browser kept for the account, including
// this tab's Undo history, but keeps the device's own choices: whether analytics is off here, its date format,
// whether music and sound effects are off (Sounds.js), the kind of phone picked for the Steps for lists, the passkey
// it last signed in with (Passkeys.js; the login page tries it by itself), the Quick Entry icons it made or used
// (their entries are added when the budget opens here, see holdQuickEntries), and the day picked for Bob's Accounts
// card (Bob Page.js).
const DEVICE_SETTINGS = ["prismal_analytics", "prismal_date_format", "prismal_music", "prismal_sound_effects", "prismal_device", "prismal_last_passkey", "prismal_quick_icons", "prismal_bob_accounts_day"];
function clearSignedInData() {
  try {
    Object.keys(localStorage).filter(KEY => !DEVICE_SETTINGS.includes(KEY)).forEach(KEY => localStorage.removeItem(KEY));
    Object.keys(sessionStorage).filter(KEY => KEY.startsWith("prismal_undo_")).forEach(KEY => sessionStorage.removeItem(KEY));
  } catch {}
}

// Signing out ends the session on the server too, so its token stops working everywhere, even a copy.
// keepalive lets the request finish while the page moves on.
function endServerSession() {
  const TOKEN = readStored("prismal_jwt");
  if (!TOKEN || !window.API_BASE_URL) return;
  try {
    fetch(`${window.API_BASE_URL}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, keepalive: true }).catch(() => {});
  } catch {}
}

// Logout. A change that hasn't reached the server yet (offline) would be lost, so that asks first. Once
// it's decided, nothing more is saved and leaving doesn't ask again. The login page then waits for a sign-in
// instead of trying this device's passkey by itself, so another account can sign in. Signing out, of any kind,
// slides right.
function signOut() {
  if (hasChangesToSave() && !window.confirm("Some of your changes haven't been saved yet (they'll save once you're back online). Sign out anyway and lose them?")) return;
  if (typeof workspaceLoaded !== "undefined") workspaceLoaded = false;
  endServerSession();
  clearSignedInData();
  try { sessionStorage.setItem("prismal_signed_out", "logout"); } catch {}
  transitionTo("/login.html", true, "right");
}

/* GROUP: Missing images */
// An image that's missing or fails to load shows its words (its alt text) instead of a broken-image
// icon, so a button still says what it does.
function showMissingImage(IMG) {
  if (!IMG.alt || !IMG.isConnected) return;
  const STAND_IN = document.createElement("span");
  STAND_IN.className = `${IMG.className} missingImage`.trim();
  STAND_IN.textContent = IMG.alt;
  IMG.replaceWith(STAND_IN);
}

document.addEventListener("error", (EVENT) => {
  if (EVENT.target instanceof HTMLImageElement) showMissingImage(EVENT.target);
}, true);

/* GROUP: Steps for each kind of phone */
// Steps that differ from phone to phone (like adding an icon to the home screen) are in a .deviceGuide: one part per
// kind of device, each with data-device (the kinds it's for, like "pixel oneplus", or "other" for any kind without
// its own part) and a .deviceName heading. Without JavaScript every part shows, under its heading. With it, a list
// over them picks one, starting with the kind this device looks like, and the pick is kept on this device (for every
// guide on the site, signed in or not).
const DEVICES = [
  ["iphone", "iPhone or iPad"],
  ["samsung", "Samsung Galaxy"],
  ["pixel", "Google Pixel"],
  ["oneplus", "OnePlus"],
  ["motorola", "Motorola"],
  ["xiaomi", "Xiaomi, Redmi, or POCO"],
  ["android", "Another Android phone"],
  ["computer", "A computer"]
];
const DEVICE_KEY = "prismal_device";

// The kind of device this looks like (Chrome on Android hides the phone's model from its name, so that's asked for
// separately, see guessDeviceModel)
function guessDevice(MODEL = "") {
  const AGENT = `${navigator.userAgent} ${MODEL}`;
  if (/iPhone|iPad|iPod/.test(AGENT) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iphone";
  if (!/Android/i.test(AGENT)) return "computer";
  if (/SM-|Samsung|Galaxy/i.test(AGENT)) return "samsung";
  if (/Pixel/i.test(AGENT)) return "pixel";
  if (/OnePlus/i.test(AGENT)) return "oneplus";
  if (/moto|Motorola/i.test(AGENT)) return "motorola";
  if (/Xiaomi|Redmi|POCO|MIUI|HyperOS/i.test(AGENT)) return "xiaomi";
  return "android";
}

// The kind picked on this device, or the one it looks like
function pickedDevice(MODEL = "") {
  const STORED = readStored(DEVICE_KEY);
  return DEVICES.some(([KEY]) => KEY === STORED) ? STORED : guessDevice(MODEL);
}

// Show one kind's part in every guide on the page
function showDevice(KEY) {
  document.querySelectorAll(".deviceGuide.isPicking").forEach((GUIDE) => {
    const SELECT = GUIDE.querySelector(".deviceSelect");
    if (SELECT) SELECT.value = KEY;
    const PARTS = [...GUIDE.children].filter(PART => PART.dataset.device);
    const forKey = (PART, K) => PART.dataset.device.split(/\s+/).includes(K);
    const SHOWN = PARTS.find(PART => forKey(PART, KEY)) || PARTS.find(PART => forKey(PART, "other")) || PARTS[0];
    PARTS.forEach(PART => { PART.hidden = PART !== SHOWN; });
  });
}

// A guide gets its list (once). Guides added to a page later call this too (window.DeviceGuides.wire).
function wireDeviceGuide(GUIDE) {
  if (GUIDE.classList.contains("isPicking")) return;
  GUIDE.classList.add("isPicking");
  const PICK = document.createElement("label");
  PICK.className = "deviceGuidePick";
  const SELECT = document.createElement("select");
  SELECT.className = "selectInput deviceSelect";
  for (const [KEY, NAME] of DEVICES) SELECT.append(new Option(NAME, KEY));
  PICK.append(Object.assign(document.createElement("span"), { textContent: "Steps for" }), SELECT);
  GUIDE.prepend(PICK);
  SELECT.addEventListener("change", () => {
    writeStored(DEVICE_KEY, SELECT.value);
    showDevice(SELECT.value);
  });
  showDevice(pickedDevice());
}

window.DeviceGuides = { wire: wireDeviceGuide };

// Chrome on Android can say the phone's model when asked, which picks Samsung, Pixel, and the rest more often
function guessDeviceModel() {
  if (readStored(DEVICE_KEY) || !navigator.userAgentData?.getHighEntropyValues || !document.querySelector(".deviceGuide")) return;
  navigator.userAgentData.getHighEntropyValues(["model"]).then(({ model }) => {
    if (model && !readStored(DEVICE_KEY)) showDevice(pickedDevice(model));
  }).catch(() => {});
}

/* GROUP: Logout only when signed in */
// Public pages (like the Privacy Policy) can be read signed out, and then there's nothing to log out of
function hideLogoutWhenSignedOut() {
  const LOGOUT = document.getElementById("logoutButton");
  if (LOGOUT) LOGOUT.hidden = !readStored("prismal_jwt");
}

/* GROUP: Wire after DOM is ready */
function onDOMReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}
/* GROUP: Floating help */
// A page's Help (a .helpView section, opened by its data-toggle button) floats over the page instead of
// pushing it around: × , Escape, or a tap outside closes it. It moves into the screen layer (above), out of the
// page's #transitionContainer, which is transformed and would make a fixed-position section scroll with the page. The
// dimmed backdrop under it stays in <body>, fixed over the whole window, so it still covers the page wherever the page is
// scrolled while the help is open (in the screen layer, pinned to the page, it would only cover where the help opened).
let OPEN_HELP = null;
const HELP_BACKDROP = document.createElement("div");
HELP_BACKDROP.className = "overlayBackdrop";
HELP_BACKDROP.hidden = true;
document.body.appendChild(HELP_BACKDROP);

// A page's Help moves into the screen layer as a floating dialog, with its ×
function setupFloatingHelp(BUTTON, HELP) {
  SCREEN_LAYER.append(HELP);
  HELP.setAttribute("role", "dialog");
  HELP.setAttribute("aria-modal", "true");
  const CLOSE = document.createElement("button");
  CLOSE.type = "button";
  CLOSE.className = "panelClose helpClose";
  CLOSE.textContent = "×";
  CLOSE.setAttribute("aria-label", "Close help");
  CLOSE.addEventListener("click", () => closeHelp());
  HELP.prepend(CLOSE);
  HELP.helpButton = BUTTON;
}

// Open a page's Help: it zooms out of its button, over a dimmed page
function openHelp(HELP) {
  OPEN_HELP = HELP;
  HELP.hidden = false;
  HELP_BACKDROP.hidden = false;
  HELP.scrollTop = 0;
  HELP.helpButton.setAttribute("aria-expanded", "true");
  HELP.querySelector(".helpClose").focus({ preventScroll: true });
  window.FloatingWindows.zoomOpen(HELP, HELP.helpButton);
}

// IMMEDIATE: no zoom back into the button (leaving the page)
function closeHelp(IMMEDIATE = false) {
  if (!OPEN_HELP) return;
  const HELP = OPEN_HELP;
  OPEN_HELP = null;
  HELP_BACKDROP.hidden = true;
  HELP.helpButton.setAttribute("aria-expanded", "false");
  const HIDE = () => { HELP.hidden = true; };
  if (IMMEDIATE) {
    if (HELP.zoomAnimation) HELP.zoomAnimation.cancel();
    HELP.zoomAnimation = null;
    HIDE();
    return;
  }
  HELP.helpButton.focus({ preventScroll: true });
  window.FloatingWindows.zoomClose(HELP, HELP.helpButton, HIDE);
}

window.FloatingWindows.closeOnPageExit(() => closeHelp(true));

HELP_BACKDROP.addEventListener("click", () => closeHelp());
// Capture, so Escape closes the help and nothing under it (like an open panel)
window.addEventListener("keydown", (EVENT) => {
  if (EVENT.key !== "Escape" || !OPEN_HELP) return;
  EVENT.stopImmediatePropagation();
  closeHelp();
}, true);

onDOMReady(() => {
  // Buttons that show/hide a section; a page's Help floats over the page
  document.querySelectorAll("button[data-toggle]").forEach((btn) => {
    const TARGET = document.getElementById(btn.getAttribute("data-toggle"));
    if (TARGET && TARGET.classList.contains("helpView")) {
      setupFloatingHelp(btn, TARGET);
      btn.addEventListener("click", () => (OPEN_HELP === TARGET ? closeHelp() : openHelp(TARGET)));
      return;
    }
    btn.addEventListener("click", () => {
      const ELEMENT = toggleElement(btn.getAttribute("data-toggle"));
      if (ELEMENT) btn.setAttribute("aria-expanded", String(!ELEMENT.hidden));
    });
  });
  injectGlobalFooter();
  hideLogoutWhenSignedOut();
  document.querySelectorAll(".deviceGuide").forEach(wireDeviceGuide);
  guessDeviceModel();
  // Images that already failed before this script ran
  document.querySelectorAll("img").forEach((IMG) => {
    if (IMG.complete && IMG.naturalWidth === 0 && IMG.getAttribute("src")) showMissingImage(IMG);
  });
  const CONTAINER = getTransitionContainer();
  if (CONTAINER) {
    // The slide-in finished: the document scrolls again (and a page back from the back/forward cache shows whole)
    CONTAINER.addEventListener("transitionend", (EVENT) => {
      if (EVENT.target !== CONTAINER || IS_TRANSITION_ACTIVE) return;
      CONTAINER.style.clipPath = "";
      enableDocumentScroll();
    });
  }
});

/* #endregion 6) LINKS, SIGNING OUT, HELP, MISSING IMAGES */



/*======================================================================
 * FOOTER INJECTION (SHARED ACROSS ALL PAGES)
 *====================================================================*/

// The footer every page shares: the trademark note, the contact address (it can break onto a new line before the @,
// <wbr>, without a hidden character ending up in a copied address), and the Privacy Policy and How It Works links. A
// page's Help button moves into it, just under its line.
function injectGlobalFooter() {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  // Prevent duplicate footers (important for bfcache/pageshow)
  if (CONTAINER.querySelector("footer[data-global-footer]")) return;

  const FOOTER = document.createElement("footer");
  FOOTER.setAttribute("data-global-footer", "true");

  FOOTER.innerHTML = `
    <hr>
        <p><span translate="no">Prismal Budget™</span> and its logo are trademarked</p>
        <p>Contact:
        <a href="mailto:admin@prismalbudget.org">
          admin<wbr>@prismalbudget.org
        </a>
        </p>
        <a href="/privacy and terms.html">
          Privacy Policy & Terms of Use
        </a>
        <a href="/how-it-works.html">
          How Prismal Budget Works
        </a>
  `;

  // The page's Help button goes just under the footer's line
  const HELP_BUTTON = CONTAINER.querySelector(".helpButton");
  if (HELP_BUTTON) {
    FOOTER.querySelector("hr").after(HELP_BUTTON);
    FOOTER.classList.add("hasHelp");
  }
  CONTAINER.appendChild(FOOTER);
}
