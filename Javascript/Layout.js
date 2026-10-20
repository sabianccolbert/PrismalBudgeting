// Layout + page transitions for Prismal Budget.
// This file owns navigation animations, bfcache hygiene, touch-safe tap handling, floating Help, the
// footer, and signing out. Starfield is treated as a "passenger" that we freeze/save during transitions.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) GLOBAL STATE + HELPERS
 *     - Transition guard flags
 *     - Timer hygiene for bfcache
 *     - Starfield freeze/save hooks
 *     - Slide timing (read from the CSS)
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
 *     - Animate out
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

/* GROUP: Timer hygiene */
// Cancel any pending transition timers and reset handles.
// Prevents "ghost navigations" after bfcache restores.
function clearPendingTransitionTimers() {
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID);
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID);

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;
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

/* GROUP: Floating windows (Help, panels, search boxes) */
// They zoom out of the button that opened them, and back into it when they close (Budget UI.js's panels do
// the same). Each one also closes the moment the page is left, so the browser's Back button (which can
// bring a page back exactly as it was left) never shows one still open.
const PAGE_EXIT_CLOSERS = new Set();

// Does the device ask for less motion?
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Where the window would sit as its button: its corner on the button's corner, shrunk to the button's size
function zoomedToButton(EL, BUTTON) {
  const FROM = BUTTON.getBoundingClientRect();
  const TO = EL.getBoundingClientRect();
  const SCALE_X = Math.max(FROM.width / (TO.width || 1), 0.05);
  const SCALE_Y = Math.max(FROM.height / (TO.height || 1), 0.05);
  return `translate(${FROM.left - TO.left}px, ${FROM.top - TO.top}px) scale(${SCALE_X}, ${SCALE_Y})`;
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
  document.documentElement.classList.remove("tabSlide");
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

  // Back to a signed-in page after signing out (it came back from the back/forward cache): go to login.
  // Back to the front page after signing in: the budget.
  if (!readStored("prismal_jwt") && !window.PUBLIC_PAGE) {
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

  CONTAINER.classList.remove("slide-out", "tab-slide-out");
  CONTAINER.classList.add("ready");
  document.documentElement.classList.remove("tabSlide");
  IS_TRANSITION_ACTIVE = false;
  enableDocumentScroll();

  CONTAINER.scrollTop = 0;
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*======================================================================
 * #region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *====================================================================*/

/* GROUP: Transition navigation entry point */
// Animate slide-out, then navigate after the animation duration.
// URL may be a real href or the special keyword "back". TAB_SLIDE: one of the budget's four pages' tabs was
// followed, so only the page under the header and the tabs slides out (and the next page knows to do the same).
function transitionTo(URL, useReplace = false, TAB_SLIDE = false) {
  if (IS_TRANSITION_ACTIVE) return;
  if (!URL) return;

  /* GROUP: "back" keyword support */
  if (URL === "back") {
    URL = readStored("homepageBackUrl") || "/";
  }

  /* GROUP: Floating windows close before the page slides out */
  closeFloatingWindows();

  const LEAVE = () => {
    IS_TRANSITION_ACTIVE = false; // safety unlock (in case navigation is blocked)
    if (useReplace) window.location.replace(URL);
    else window.location.href = URL;
  };

  const CONTAINER = getTransitionContainer();
  const MOVING = TAB_SLIDE ? firstSlidingPart() : CONTAINER;
  if (TAB_SLIDE && !MOVING) TAB_SLIDE = false;
  // Leaving another way while this page is still sliding in by its tab: the whole page slides out after all
  if (!TAB_SLIDE) document.documentElement.classList.remove("tabSlide");
  const DURATION_MS = getSlideDurationSeconds(TAB_SLIDE) * 1000;
  if (TAB_SLIDE) {
    try { sessionStorage.setItem("prismal_tab_slide", "1"); } catch {}
  }

  /* GROUP: Nothing to animate (no container, or reduced motion) */
  if (!CONTAINER || DURATION_MS === 0) {
    freezeAndSaveStarfield();
    LEAVE();
    return;
  }

  clearPendingTransitionTimers();
  IS_TRANSITION_ACTIVE = true;

  /* GROUP: Slide distance computation (supports different scroll owners) */
  const CONTAINER_SCROLL = CONTAINER.scrollTop || 0;
  const DOC_SCROLL = document.documentElement.scrollTop || document.body.scrollTop || 0;

  const ACTIVE_SCROLL = Math.max(DOC_SCROLL, CONTAINER_SCROLL);
  const SLIDE_DISTANCE_PX = (window.innerHeight * 1.1) + ACTIVE_SCROLL;

  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${SLIDE_DISTANCE_PX}px`);

  // The header and the tabs stay: scrolled down, they glide back to the top while the page slides out, so they're
  // right where the next page's are
  if (TAB_SLIDE && DOC_SCROLL > 0) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  disableDocumentScroll();

  /* GROUP: Start slide-out */
  CONTAINER.classList.add(TAB_SLIDE ? "tab-slide-out" : "slide-out");

  /* GROUP: Navigate when the sliding part's own transform transition ends */
  const onDone = (EVENT) => {
    // Only accept that part's transform finishing,
    // not random child transitions bubbling up.
    if (EVENT && (EVENT.target !== MOVING || EVENT.propertyName !== "transform")) return;

    CONTAINER.removeEventListener("transitionend", onDone);
    clearPendingTransitionTimers();
    LEAVE();
  };

  CONTAINER.addEventListener("transitionend", onDone);

  // Safety net fallback (in case transitionend never fires)
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => onDone(), DURATION_MS + 150);

  // Freeze/save shortly before leaving (keeps canvas state stable)
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout(
    freezeAndSaveStarfield,
    Math.max(0, DURATION_MS - 50)
  );
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

  // Everything else: we own navigation timing (a tab of the budget's four pages slides only the page under the tabs)
  EVENT.preventDefault();
  transitionTo(TARGET.href, false, !!LINK.closest(".pageTabs"));
});

/* GROUP: Signing out */
// Signing out (or deleting the account) forgets everything this browser kept for the account, including
// this tab's Undo history, but keeps the device's own choices: whether analytics is off here, its date format,
// and the kind of phone picked for the Steps for lists. Signing out also keeps which of Dave's tips were shown and when (just their names and days, not
// what they said), so signing back in goes on to his next tip instead of starting the day's tips over;
// deleting the account (FORGET_TIPS) forgets those too.
const DEVICE_SETTINGS = ["prismal_analytics", "prismal_date_format", "prismal_device"];
const DAVE_TIPS_PREFIX = "prismal_dave_";
function clearSignedInData(FORGET_TIPS = false) {
  try {
    const KEPT_TIPS = FORGET_TIPS ? [] : Object.keys(localStorage)
      .filter(KEY => KEY.startsWith(DAVE_TIPS_PREFIX))
      .map(KEY => [KEY, tipsShown(readStored(KEY))])
      .filter(([, VALUE]) => VALUE);
    Object.keys(localStorage).filter(KEY => !DEVICE_SETTINGS.includes(KEY)).forEach(KEY => localStorage.removeItem(KEY));
    Object.keys(sessionStorage).filter(KEY => KEY.startsWith("prismal_undo_")).forEach(KEY => sessionStorage.removeItem(KEY));
    KEPT_TIPS.forEach(([KEY, VALUE]) => localStorage.setItem(KEY, VALUE));
  } catch {}
}

// Dave's tips as kept after signing out: the day, the tips shown that day, and the day each weekly tip was
// last shown (the tip showing now, and a purchase's tip waiting for Home, are left out: they say amounts).
// null when there's nothing to keep.
function tipsShown(STORED) {
  try {
    const STATE = JSON.parse(STORED);
    if (!STATE || typeof STATE !== "object" || typeof STATE.day !== "string") return null;
    const SHOWN = Array.isArray(STATE.shown) ? STATE.shown.filter(ID => typeof ID === "string") : [];
    const WEEKLY = {};
    for (const [ID, DAY] of Object.entries(STATE.weekly && typeof STATE.weekly === "object" ? STATE.weekly : {})) {
      if (typeof DAY === "string") WEEKLY[ID] = DAY;
    }
    return JSON.stringify({ day: STATE.day, shown: SHOWN, weekly: WEEKLY });
  } catch {
    return null;
  }
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
// it's decided, nothing more is saved and leaving doesn't ask again.
function signOut() {
  const HAS_UNSAVED = typeof hasUnsavedChanges === "function" && typeof workspaceLoaded !== "undefined" && workspaceLoaded && hasUnsavedChanges();
  if (HAS_UNSAVED && !window.confirm("Some of your changes haven't been saved yet (they'll save once you're back online). Sign out anyway and lose them?")) return;
  if (typeof workspaceLoaded !== "undefined") workspaceLoaded = false;
  endServerSession();
  clearSignedInData();
  transitionTo("/login.html", true);
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
// pushing it around: × , Escape, or a tap outside closes it. It moves into <body> because the page's
// #transitionContainer is transformed, which would make a fixed-position section scroll with the page.
let OPEN_HELP = null;
const HELP_BACKDROP = document.createElement("div");
HELP_BACKDROP.className = "overlayBackdrop";
HELP_BACKDROP.hidden = true;

// A page's Help moves into <body> as a floating dialog, with its ×
function setupFloatingHelp(BUTTON, HELP) {
  document.body.append(HELP_BACKDROP, HELP);
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
    // The slide-in finished: the document scrolls again
    CONTAINER.addEventListener("transitionend", (EVENT) => {
      if (EVENT.target === CONTAINER && !IS_TRANSITION_ACTIVE) enableDocumentScroll();
    });
  }
});

/* #endregion 6) LINKS, SIGNING OUT, HELP, MISSING IMAGES */



/*======================================================================
 * FOOTER INJECTION (SHARED ACROSS ALL PAGES)
 *====================================================================*/

// The footer every page shares: the trademark note, the contact address (it can break onto a new line before the @,
// <wbr>, without a hidden character ending up in a copied address), and the Privacy Policy and How It Works links
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

  CONTAINER.appendChild(FOOTER);
}
