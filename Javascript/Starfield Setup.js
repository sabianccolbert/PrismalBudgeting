// thank heavens for chatGPT <3
// Starfield Setup: the main-thread side of the starfield. Builds window.STARFIELD as a small bridge,
// starts the engine (Active Starfield.js) in a Web Worker on an OffscreenCanvas, and forwards page
// input to it: pointer, resize, sliders, freeze/unfreeze. Also owns saving to localStorage.
// The worker can't touch the DOM or localStorage, so everything page-side lives here.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) STARFIELD NAMESPACE (BRIDGE)
 *     - Create window.STARFIELD
 *     - sendToEngine / setFrozen / handleEngineMessage
 *
 *  2) STORAGE (localStorage)
 *     - Save the latest engine snapshot so sessions persist
 *     - Read + parse saved stars/meta for the engine
 *
 *  3) UI CONTROLS (STEPPERS + BINDINGS)
 *     - Slider/number binding (forwards changes to the engine)
 *     - Hold-to-repeat steppers
 *     - DOMContentLoaded wiring
 *
 *  4) ENGINE STARTUP
 *     - Worker + OffscreenCanvas (normal case)
 *     - Main-thread fallback when OffscreenCanvas is unsupported
 *
 *  5) PAGE INPUT -> ENGINE
 *     - Pointer/touch events
 *     - Resize
 *
 *  6) BOOTSTRAP
 *====================================================================*/


/*======================================================================
 * #region 1) STARFIELD NAMESPACE (BRIDGE)
 *====================================================================*/

/* GROUP: Global container */
// Create the global STARFIELD namespace container.
// On the page this is only a bridge: the real star state lives in the engine (worker).
window.STARFIELD = {};

// Create a short alias for the STARFIELD namespace.
var S = window.STARFIELD;

/* GROUP: Canvas wiring */
// Find the canvas element by id (required for the starfield).
// The 2D context is created by the engine, not here.
S.constellationCanvas = document.getElementById("constellations");

// Record whether the starfield can run on this page.
S.isCanvasReady = !!S.constellationCanvas;

// Warn when canvas is missing.
if (!S.isCanvasReady) {
  console.warn("Constellation canvas not found; starfield disabled.");
}

// Worker running Active Starfield.js (null in the main-thread fallback).
S.worker = null;

// Track whether the simulation is paused (mirrors what we last sent the engine).
S.isFrozen = false;

// Latest stars + meta the engine sent back. Saved to localStorage on freeze/leave.
S.latestSnapshot = null;

/* GROUP: Debug readouts */
// Optional debug elements (only on the 404 page). The engine sends DEBUG values when they exist.
S.debugReadouts = {
  misc: document.getElementById("dbgMisc"),
  circle: document.getElementById("dbgCircle"),
  speed: document.getElementById("dbgSpeed"),
  poke: document.getElementById("dbgPoke")
};

/* GROUP: Messaging */
// Send a message to the engine. Replaced in region 4 once the engine starts;
// until then input is dropped (there are no stars to affect yet).
S.sendToEngine = function sendToEngine() {};

// Pause or resume the simulation (Layout.js calls this on page hide/transition).
S.setFrozen = function setFrozen(IS_FROZEN) {
  S.isFrozen = !!IS_FROZEN;
  S.sendToEngine({ type: "FREEZE", frozen: S.isFrozen });
};

// Handle messages coming back from the engine.
S.handleEngineMessage = function handleEngineMessage(MESSAGE) {
  switch (MESSAGE.type) {
    case "SNAPSHOT":
      S.latestSnapshot = MESSAGE;

      // The engine sends a fresh snapshot right after FREEZE; save it immediately.
      if (S.isFrozen) S.saveStarfieldToStorage();
      break;

    case "DEBUG": {
      const DBG = S.debugReadouts;
      if (DBG.misc) DBG.misc.textContent = MESSAGE.misc;     // Show frame time (ms)
      if (DBG.circle) DBG.circle.textContent = MESSAGE.circle; // Show ring timer
      if (DBG.speed) DBG.speed.textContent = MESSAGE.speed;   // Show pointer energy
      if (DBG.poke) DBG.poke.textContent = MESSAGE.poke;      // Show poke timer
      break;
    }
  }
};

/* #endregion 1) STARFIELD NAMESPACE (BRIDGE) */



/*======================================================================
 * #region 2) STORAGE (localStorage)
 *====================================================================*/

/* GROUP: Save stars + meta */
// Persist the latest engine snapshot so the starfield survives reloads.
// This is synchronous on purpose: pagehide can't wait for a reply from the worker.
// This is “best effort”: storage can fail in private mode or with quota limits.
S.saveStarfieldToStorage = function saveStarfieldToStorage() {

  // Bail if there's nothing usable to save yet.
  if (!S.isCanvasReady || !S.latestSnapshot) return;

  try {
    // Save the star list under a stable key (kept for compatibility).
    localStorage.setItem("constellationStars", JSON.stringify(S.latestSnapshot.stars));

    // Save meta under a stable key (kept for compatibility).
    // Canvas size, pointer + timers come from the engine's snapshot.
    localStorage.setItem(
      "constellationMeta",
      JSON.stringify({
        ...S.latestSnapshot.meta,

        /* UI PARAMS */
        // Save attraction strength slider value.
        attractStrength: S.interactionSettings.attractStrength,

        // Save attraction radius slider value.
        attractRadius: S.interactionSettings.attractRadius,

        // Save attraction curve slider value.
        attractScale: S.interactionSettings.attractScale,

        // Save clamp slider value.
        clamp: S.interactionSettings.clamp,

        // Save repulsion strength slider value.
        repelStrength: S.interactionSettings.repelStrength,

        // Save repulsion radius slider value.
        repelRadius: S.interactionSettings.repelRadius,

        // Save repulsion curve slider value.
        repelScale: S.interactionSettings.repelScale,

        // Save poke strength slider value.
        pokeStrength: S.interactionSettings.pokeStrength
      })
    );
  } catch (ERROR) {

    // Storage can fail (private mode, quota, blocked), so warn and continue.
    console.warn("Could not save stars:", ERROR);
  }
};

/* GROUP: Read saved stars + meta */
// Read and parse what was saved last session, for the engine's INIT message.
// Returns { stars, meta } or null. Also restores the slider settings from meta.
S.readSavedStarfield = function readSavedStarfield() {

  /* GROUP: Load star list */
  let RAW_STARS_JSON = null;

  // Read saved star JSON (storage can throw in private mode).
  try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

  // No saved data: the engine will generate a new starfield.
  if (!RAW_STARS_JSON) return null;

  let PARSED_STARS = null;

  try {
    // Parse saved star list from JSON.
    PARSED_STARS = JSON.parse(RAW_STARS_JSON);
  } catch (ERROR) {

    // Stars JSON can be corrupted, so warn and let the engine regenerate.
    console.warn("Could not parse constellationStars; recreating.", ERROR);
    return null;
  }

  // Regenerate if parsed data is not a usable array.
  if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) return null;

  /* GROUP: Load meta */
  let SAVED_META = null;

  try {
    // Read + parse meta JSON (storage can throw in private mode).
    const RAW_META_JSON = localStorage.getItem("constellationMeta");
    if (RAW_META_JSON) SAVED_META = JSON.parse(RAW_META_JSON);
  } catch (ERROR) {

    // Meta can be corrupted, so warn and keep stars.
    console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
  }

  /* GROUP: Restore UI settings */
  // Sliders live on this page, so their saved values are restored here (fallback to current).
  if (SAVED_META) {
    for (const KEY of Object.keys(S.interactionSettings)) {
      S.interactionSettings[KEY] = SAVED_META[KEY] ?? S.interactionSettings[KEY];
    }
  }

  return { stars: PARSED_STARS, meta: SAVED_META };
};

/* #endregion 2) STORAGE */



/*======================================================================
 * #region 3) UI CONTROLS (STEPPERS + BINDINGS)
 *====================================================================*/

/* GROUP: Settings object */
// Store interactive settings controlled by sliders and steppers.
// The engine keeps its own copy; setInteractionSetting keeps the two in sync.
S.interactionSettings = {

  // How strongly stars are pulled toward the pointer.
  attractStrength: 50,

  // How far attraction reaches.
  attractRadius: 50,

  // How steep the attraction falloff curve is.
  attractScale: 5,

  // Maximum allowed momentum magnitude.
  clamp: 5,

  // How strongly stars push away from the pointer.
  repelStrength: 50,

  // How far repulsion reaches.
  repelRadius: 50,

  // How steep the repulsion falloff curve is.
  repelScale: 5,

  // Strength of poke burst on tap/click.
  pokeStrength: 5
};

/* GROUP: Apply one setting */
// Update the page copy and forward the change to the engine.
S.setInteractionSetting = function setInteractionSetting(KEY, VALUE) {
  S.interactionSettings[KEY] = VALUE;
  S.sendToEngine({ type: "SETTINGS", settings: { [KEY]: VALUE } });
};

/* GROUP: Hold-to-repeat steppers */
// Enable “press and hold” repeating behavior for stepper buttons.
S.enableHoldToRepeat = function enableHoldToRepeat(BUTTON, ON_STEP) {

  // Track initial delay timeout handle.
  let HOLD_DELAY_TIMER = null;

  // Track repeating interval handle.
  let REPEAT_INTERVAL_TIMER = null;

  /* GROUP: Repeat timing */
  // Wait time before repeating begins.
  const INITIAL_DELAY_MS = 350;

  // Initial repeat interval once repeating begins.
  const START_INTERVAL_MS = 120;

  // Fastest allowed repeat interval.
  const MIN_INTERVAL_MS = 40;

  // Acceleration multiplier (smaller = faster acceleration).
  const ACCELERATION = 0.88;

  // Start hold behavior: fire immediately, then repeat.
  const START_HOLD = () => {

    // Track current interval so we can accelerate over time.
    let CURRENT_INTERVAL_MS = START_INTERVAL_MS;

    // Fire once immediately on press.
    ON_STEP();

    // After a short delay, begin repeating.
    HOLD_DELAY_TIMER = setTimeout(() => {

      // Start repeating at current interval.
      REPEAT_INTERVAL_TIMER = setInterval(() => {

        // Execute one step.
        ON_STEP();

        // Accelerate interval down to minimum.
        CURRENT_INTERVAL_MS = Math.max(MIN_INTERVAL_MS, CURRENT_INTERVAL_MS * ACCELERATION);

        // Restart interval at the new faster speed.
        clearInterval(REPEAT_INTERVAL_TIMER);
        REPEAT_INTERVAL_TIMER = setInterval(ON_STEP, CURRENT_INTERVAL_MS);

      }, CURRENT_INTERVAL_MS);

    }, INITIAL_DELAY_MS);
  };

  // Stop hold behavior and clear timers.
  const STOP_HOLD = () => {

    // Cancel delayed start if it hasn't fired.
    clearTimeout(HOLD_DELAY_TIMER);

    // Cancel repeating interval if running.
    clearInterval(REPEAT_INTERVAL_TIMER);

    // Clear handles so state is clean.
    HOLD_DELAY_TIMER = null;
    REPEAT_INTERVAL_TIMER = null;
  };

  /* GROUP: Mouse events */
  // Start hold-repeat on mouse down.
  BUTTON.addEventListener("mousedown", (EVENT) => { EVENT.preventDefault(); START_HOLD(); });

  // Stop hold-repeat on mouse up.
  BUTTON.addEventListener("mouseup", STOP_HOLD);

  // Stop hold-repeat if mouse leaves button.
  BUTTON.addEventListener("mouseleave", STOP_HOLD);

  /* GROUP: Touch events */
  // Start hold-repeat on touch start (prevent ghost clicks).
  BUTTON.addEventListener(
    "touchstart",
    (EVENT) => { EVENT.preventDefault(); START_HOLD(); },
    { passive: false }
  );

  // Stop hold-repeat on touch end.
  BUTTON.addEventListener("touchend", STOP_HOLD);

  // Stop hold-repeat on touch cancel.
  BUTTON.addEventListener("touchcancel", STOP_HOLD);
};

/* GROUP: Slider + number binding */
// Bind a slider and optional number input to a setting, plus optional steppers.
S.bindSliderAndNumberInput = function bindSliderAndNumberInput(
  CONTROL_ID,
  APPLY_SETTING_VALUE,
  INITIAL_VALUE
) {

  // Find the slider element by id.
  const SLIDER = document.getElementById(CONTROL_ID);

  // Bail if slider does not exist on this page.
  if (!SLIDER) return false;

  // Find the matching number input box (optional).
  const NUMBER_INPUT = document.getElementById(CONTROL_ID + "_num");

  // Find the nearest control block wrapper for steppers (optional).
  const CONTROL_BLOCK = SLIDER.closest(".controlBlock");

  // Find stepper buttons inside this control block (optional).
  const STEP_BUTTONS = CONTROL_BLOCK
    ? CONTROL_BLOCK.querySelectorAll(".stepBtn[data-step]")
    : [];

  /* GROUP: Range + step */
  // Read min value from slider or number input.
  const MIN_VALUE = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);

  // Read max value from slider or number input.
  const MAX_VALUE = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

  // Read raw step from slider or number input.
  const RAW_STEP_SIZE = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);

  // Use safe step default when missing/invalid.
  const STEP_SIZE =
    Number.isFinite(RAW_STEP_SIZE) && RAW_STEP_SIZE > 0
      ? RAW_STEP_SIZE
      : 1;

  // Clamp value into allowed min/max range.
  const CLAMP_VALUE = (VALUE) => Math.min(MAX_VALUE, Math.max(MIN_VALUE, VALUE));

  // Snap value to nearest step increment.
  const SNAP_TO_STEP = (VALUE) => {

    // Compute nearest step-aligned value.
    const SNAPPED = MIN_VALUE + Math.round((VALUE - MIN_VALUE) / STEP_SIZE) * STEP_SIZE;

    // Determine decimal places needed for step precision.
    const DECIMAL_PLACES = (String(STEP_SIZE).split(".")[1] || "").length;

    // Return numeric value rounded to correct precision.
    return Number(SNAPPED.toFixed(DECIMAL_PLACES));
  };

  // Apply a value to UI + settings in one place.
  const APPLY_VALUE = (VALUE) => {

    // Convert incoming value to number.
    VALUE = Number(VALUE);

    // Bail if value is not a finite number.
    if (!Number.isFinite(VALUE)) return;

    // Clamp + snap to the step grid.
    VALUE = SNAP_TO_STEP(CLAMP_VALUE(VALUE));

    // Write slider value.
    SLIDER.value = String(VALUE);

    // Write number input value if present.
    if (NUMBER_INPUT) NUMBER_INPUT.value = String(VALUE);

    // Apply into settings via callback.
    APPLY_SETTING_VALUE(VALUE);
  };

  // Nudge current value by one step in a direction.
  const NUDGE_BY_STEP = (DIRECTION) =>
    APPLY_VALUE(Number(SLIDER.value) + DIRECTION * STEP_SIZE);

  // Initialize control with provided value (or keep slider's current).
  APPLY_VALUE(INITIAL_VALUE ?? SLIDER.value);

  // Wire slider changes.
  SLIDER.addEventListener("input", () => APPLY_VALUE(SLIDER.value));

  // Wire number input changes if present.
  if (NUMBER_INPUT) {
    NUMBER_INPUT.addEventListener("input", () => APPLY_VALUE(NUMBER_INPUT.value));
    NUMBER_INPUT.addEventListener("change", () => APPLY_VALUE(NUMBER_INPUT.value));
  }

  // Wire stepper buttons if present.
  STEP_BUTTONS.forEach((BUTTON) => {

    // Read direction from data-step attribute.
    const DIRECTION = Number(BUTTON.dataset.step) || 0;

    // Skip buttons without a valid direction.
    if (!DIRECTION) return;

    // Enable hold-to-repeat using the nudge function.
    S.enableHoldToRepeat(BUTTON, () => NUDGE_BY_STEP(DIRECTION));
  });

  // Report success to caller.
  return true;
};

/* GROUP: Control initialization */
// Bind gravity controls only if they exist on the current page.
S.initializeGravityControlsIfPresent = function initializeGravityControlsIfPresent() {

  // Skip when neither major control exists (page without controller UI).
  if (
    !document.getElementById("ATTRACT_STRENGTH") &&
    !document.getElementById("REPEL_STRENGTH")
  ) {
    return;
  }

  /* GROUP: Attract controls */
  S.bindSliderAndNumberInput(
    "ATTRACT_STRENGTH",
    (VALUE) => S.setInteractionSetting("attractStrength", VALUE),
    S.interactionSettings.attractStrength
  );

  S.bindSliderAndNumberInput(
    "ATTRACT_RADIUS",
    (VALUE) => S.setInteractionSetting("attractRadius", VALUE),
    S.interactionSettings.attractRadius
  );

  S.bindSliderAndNumberInput(
    "ATTRACT_SCALE",
    (VALUE) => S.setInteractionSetting("attractScale", VALUE),
    S.interactionSettings.attractScale
  );

  /* GROUP: Clamp control */
  S.bindSliderAndNumberInput(
    "CLAMP",
    (VALUE) => S.setInteractionSetting("clamp", VALUE),
    S.interactionSettings.clamp
  );

  /* GROUP: Repel controls */
  S.bindSliderAndNumberInput(
    "REPEL_STRENGTH",
    (VALUE) => S.setInteractionSetting("repelStrength", VALUE),
    S.interactionSettings.repelStrength
  );

  S.bindSliderAndNumberInput(
    "REPEL_RADIUS",
    (VALUE) => S.setInteractionSetting("repelRadius", VALUE),
    S.interactionSettings.repelRadius
  );

  S.bindSliderAndNumberInput(
    "REPEL_SCALE",
    (VALUE) => S.setInteractionSetting("repelScale", VALUE),
    S.interactionSettings.repelScale
  );

  /* GROUP: Poke control */
  S.bindSliderAndNumberInput(
    "POKE_STRENGTH",
    (VALUE) => S.setInteractionSetting("pokeStrength", VALUE),
    S.interactionSettings.pokeStrength
  );
};

/* ===============================
 * DOM READY HELPER
 * =============================== */
function onDOMReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

/* #endregion 3) UI CONTROLS */



/*======================================================================
 * #region 4) ENGINE STARTUP
 *====================================================================*/

/* GROUP: Engine script location */
// Absolute path: a relative one would resolve against the page URL, not /Javascript/.
S.engineScriptUrl = "/Javascript/Active Starfield.js";

// The engine's address with its fingerprint (Boot.js), so a changed engine reaches browsers right away
S.getVersionedUrl = function getVersionedUrl(URL) {
  return typeof window.assetUrl === "function" ? window.assetUrl(URL) : URL;
};

/* GROUP: Start the engine */
// Prefer a worker drawing on an OffscreenCanvas; fall back to the main thread if unsupported.
S.startEngine = function startEngine() {

  // Bail if this page has no canvas.
  if (!S.isCanvasReady) return;

  // Reduced motion hides the canvas (stylesheet.css), so don't animate what nobody sees.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Read saved stars first (this also restores slider settings before the sliders bind).
  const SAVED = S.readSavedStarfield();

  // Everything the engine needs to begin (the canvas's size: see canvasBox, in section 5).
  const CANVAS_BOX = S.canvasBox();
  const INIT_MESSAGE = {
    type: "INIT",
    width: Math.round(CANVAS_BOX.width),
    height: Math.round(CANVAS_BOX.height),
    settings: { ...S.interactionSettings },
    saved: SAVED,
    wantsDebug: Object.values(S.debugReadouts).some(Boolean)
  };

  /* GROUP: Worker path */
  const SUPPORTS_OFFSCREEN =
    typeof Worker !== "undefined" &&
    typeof S.constellationCanvas.transferControlToOffscreen === "function";

  if (SUPPORTS_OFFSCREEN) {

    // Hand drawing control to the worker. After this the page can't draw on (or resize) the canvas.
    const OFFSCREEN = S.constellationCanvas.transferControlToOffscreen();

    S.worker = new Worker(S.getVersionedUrl(S.engineScriptUrl));
    S.worker.onmessage = (EVENT) => S.handleEngineMessage(EVENT.data);
    S.worker.onerror = (EVENT) => console.error("Starfield worker error:", EVENT.message, EVENT);

    // postMessage queues until the worker script has loaded, so it's safe to send right away.
    S.sendToEngine = (MESSAGE, TRANSFER) => S.worker.postMessage(MESSAGE, TRANSFER || []);

    // The OffscreenCanvas must be in the transfer list (it moves, it can't be copied).
    INIT_MESSAGE.canvas = OFFSCREEN;
    S.sendToEngine(INIT_MESSAGE, [OFFSCREEN]);
    return;
  }

  /* GROUP: Main-thread fallback */
  // Load the engine as a normal script. It installs S.engineReceive, and we call it directly.
  console.info("OffscreenCanvas not supported; running starfield on the main thread.");

  const SCRIPT = document.createElement("script");
  SCRIPT.src = S.getVersionedUrl(S.engineScriptUrl);
  SCRIPT.onload = () => {
    if (typeof S.engineReceive !== "function") return;

    S.sendToEngine = (MESSAGE) => S.engineReceive(MESSAGE);

    // Real <canvas> instead of an OffscreenCanvas; grab settings now in case sliders moved meanwhile.
    INIT_MESSAGE.canvas = S.constellationCanvas;
    INIT_MESSAGE.settings = { ...S.interactionSettings };
    S.sendToEngine(INIT_MESSAGE);

    // Pick up any freeze that happened while the script was loading.
    if (S.isFrozen) S.setFrozen(true);
  };
  document.body.appendChild(SCRIPT);
};

/* #endregion 4) ENGINE STARTUP */



/*======================================================================
 * #region 5) PAGE INPUT -> ENGINE
 *====================================================================*/

/* GROUP: Pointer timestamps */
// Event timestamps are relative to this page's clock, and the worker's clock starts at a
// different moment. Send epoch ms; the engine converts it into its own performance.now() space.
S.toEngineTimeMs = function toEngineTimeMs(EVENT_TIMESTAMP) {
  if (EVENT_TIMESTAMP > 1e12) return EVENT_TIMESTAMP; // Already epoch-style (some Safari versions)
  if (!Number.isFinite(performance.timeOrigin)) return undefined; // Engine falls back to “now”
  return performance.timeOrigin + EVENT_TIMESTAMP;
};

// The canvas's size and spot, in the same page coordinates pointer events use. Not innerWidth/innerHeight:
// while a phone is pinch-zoomed, Safari shrinks those to the zoomed-in part, so the stars were laid out
// for a smaller screen and a tap's burst landed away from the finger.
S.canvasBox = function canvasBox() {
  const BOX = S.constellationCanvas && S.constellationCanvas.getBoundingClientRect();
  if (BOX && BOX.width && BOX.height) return BOX;
  return { left: 0, top: 0, width: document.documentElement.clientWidth || window.innerWidth || 0, height: window.innerHeight || 0 };
};

// Forward one pointer sample to the engine, relative to the canvas.
S.sendPointer = function sendPointer(TYPE, X, Y, EVENT_TIMESTAMP) {
  const BOX = S.canvasBox();
  S.sendToEngine({ type: TYPE, x: X - BOX.left, y: Y - BOX.top, time: S.toEngineTimeMs(EVENT_TIMESTAMP) });
};

/* GROUP: Event listeners */
// Mouse click starts interaction.
window.addEventListener("mousedown", (EVENT) =>
  S.sendPointer("POINTER_DOWN", EVENT.clientX, EVENT.clientY, EVENT.timeStamp)
);

// Pointer move for mouse/pen.
// Touch is handled by touchmove instead: pointermove stops (pointercancel) once a touch starts scrolling.
window.addEventListener("pointermove", (EVENT) => {
  if (EVENT.pointerType === "touch") return;
  S.sendPointer("POINTER_MOVE", EVENT.clientX, EVENT.clientY, EVENT.timeStamp);
});

// Touch begins: start poke/ring at touch position.
window.addEventListener(
  "touchstart",
  (EVENT) => {
    const TOUCH = EVENT.touches[0];
    if (!TOUCH) return;
    S.sendPointer("POINTER_DOWN", TOUCH.clientX, TOUCH.clientY, EVENT.timeStamp);
  },
  { passive: true } // Passive: allow native scrolling
);

// Touch moves: update pointer energy/position (keeps firing while the page scrolls).
window.addEventListener(
  "touchmove",
  (EVENT) => {
    const TOUCH = EVENT.touches[0];
    if (!TOUCH) return;
    S.sendPointer("POINTER_MOVE", TOUCH.clientX, TOUCH.clientY, EVENT.timeStamp);
  },
  { passive: true } // Passive: allow native scrolling
);

/* GROUP: Resize */
// The engine resizes the canvas backing store; it just needs the canvas's new size (see canvasBox).
window.addEventListener("resize", () => {
  const BOX = S.canvasBox();
  S.sendToEngine({
    type: "RESIZE",
    width: Math.round(BOX.width),
    height: Math.round(BOX.height)
  });
});

/* #endregion 5) PAGE INPUT -> ENGINE */



/*======================================================================
 * #region 6) BOOTSTRAP
 *====================================================================*/

/* GROUP: Bootstrap guard */
try {
  S.startEngine();
} catch (ERROR) {
  console.error("Initialization error in Starfield Setup:", ERROR);
}

// Wire UI bindings after the DOM is ready (after startEngine so restored values show).
onDOMReady(S.initializeGravityControlsIfPresent);

/* #endregion 6) BOOTSTRAP */
