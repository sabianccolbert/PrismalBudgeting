// thank heavens for chatGPT <3                                           // Credit header
// Active Starfield: the starfield engine. Owns state, physics, rendering, pointer math, and the loop. // File purpose
// Runs inside a Web Worker on an OffscreenCanvas, started by Starfield Setup.js. // Where it runs
// Workers can't see the page (no window/document/localStorage), so ALL input arrives as messages (region 6). // Key rule
// If OffscreenCanvas is unsupported, Setup loads this file on the main thread instead (same message path). // Fallback

/*======================================================================  // Big section divider
 *  MENU                                                                  // Table of contents
 *----------------------------------------------------------------------
 *  0) ENGINE STATE + HELPERS                                              // State, keyboard impulses, utilities, sprite
 *  1) PHYSICS                                                             // Forces + movement
 *  2) RENDERING                                                           // Drawing stars + links + ring
 *  3) USER INPUT                                                          // Pointer events (sent by Setup) -> speed + poke
 *  4) INIT: RESTORE OR CREATE STARS                                       // Adopt saved stars or build fresh ones
 *  5) RESIZE + ANIMATION LOOP                                             // Canvas sizing, scaling, loop, snapshots
 *  6) MESSAGES                                                            // Setup <-> engine message handling
 *====================================================================*/   // End menu block

// Wrap the engine so its names (S, KEYBOARD, helpers) never clash with page globals   // Why the wrapper exists
// when the main-thread fallback loads this file as a normal <script>.               // (Layout/Keyboard also use a global S)
(function STARFIELD_ENGINE() {


/*======================================================================  // Region divider
 * #region 0) ENGINE STATE + HELPERS                                      // Start region 0
 *====================================================================*/   // Divider

/* GROUP: Where are we running? */                                        // Group label
// True inside the Web Worker, false when Setup loaded us on the main thread as a fallback. // Explanation
const IS_WORKER =
  typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope; // Only workers have WorkerGlobalScope

/* GROUP: Engine state */                                                 // Group label
// The engine's own STARFIELD state. In the worker this is NOT window.STARFIELD   // Explanation
// (the worker can't see the page); Setup only reaches it through messages.      // Explanation
const S = {};

/* GROUP: Canvas wiring (filled by the INIT message) */
// OffscreenCanvas in the worker, or the real <canvas> in the fallback.
S.constellationCanvas = null;

// 2D drawing context for the canvas above.
S.drawingContext = null;

// Record whether canvas drawing is actually available.
S.isCanvasReady = false;

// Track whether the simulation should pause (Setup sends FREEZE on page hide/transition).
S.isFrozen = false;

// True when the page has debug readouts (404 page), so we post DEBUG values each frame.
S.wantsDebug = false;

/* GROUP: Pointer state (pointer events update these) */
// Track the current pointer X position in client coordinates.
S.pointerClientX = 0;

// Track the current pointer Y position in client coordinates.
S.pointerClientY = 0;

// Track the last pointer timestamp baseline in “perf-style ms”.
S.lastPointerTimeMs = 0;

// Track the current pointer speed in normalized “energy” units.
S.pointerSpeedUnits = 0;

// Track the poke impulse timer used by the poke burst effect.
S.pokeImpulseTimer = 0;

// Track the ring timer used to animate the pointer ring.
S.pointerRingTimer = 0;

/* GROUP: Canvas metrics (resize updates these) */
// Track current canvas pixel width used for physics + drawing.
S.canvasWidth = 0;

// Track current canvas pixel height used for physics + drawing.
S.canvasHeight = 0;

// Track a “screen size” proxy used for scaling (width + height).
S.screenPerimeter = 0;

// Track the scale-up factor used to grow values on large screens.
S.screenScaleUp = 0;

// Track the scale-down factor used to normalize values on small screens.
S.screenScaleDown = 0;

// Track the computed maximum number of stars allowed for this screen size.
S.starCountLimit = 0;

// Track the computed maximum link distance for this screen size.
S.maxLinkDistance = 0;

// Track the current target link distance (lets physics animate link distance smoothly).
S.goalLinkDistance = 0;

// Track the timer used to rebuild links after certain effects.
S.linkRebuildTimer = 0;

/* GROUP: Precomputed physics scaling powers */
// Store scaling multipliers so physics stays screen-consistent.
// Resize writes these, physics reads them each frame.
S.screenScalePowers = {

  // Scales attraction radius math for larger screens.
  attractionGradient: 1,

  // Scales repulsion radius math for larger screens.
  repulsionGradient: 1,

  // Scales attraction falloff curve shaping.
  attractionShape: 1,

  // Scales repel falloff curve shaping.
  repulsionShape: 1,

  // Scales attraction force strength across screens.
  attractionForce: 1,

  // Scales repulsion force strength across screens.
  repulsionForce: 1,

  // Scales the global momentum clamp across screens.
  forceClamp: 1
};

/* GROUP: Slider settings */
// Defaults only; Setup owns the sliders and sends the real values (INIT + SETTINGS messages).
S.interactionSettings = {
  attractStrength: 50,
  attractRadius: 50,
  attractScale: 5,
  clamp: 5,
  repelStrength: 50,
  repelRadius: 50,
  repelScale: 5,
  pokeStrength: 5
};

/* GROUP: Star storage */
// Store the active star objects array.
S.starList = [];

// Saved stars/meta from localStorage (sent in INIT), held until the canvas has a usable size.
S.pendingSave = null;

// Last time we posted a SNAPSHOT back to Setup for saving.
S.lastSnapshotMs = 0;

/* GROUP: Bootstrap guards */
// Prevent starting the animation loop more than once.
S.hasAnimationLoopStarted = false;

// Prevent restoring/creating stars more than once.
S.hasStarsInitialized = false;

/* GROUP: Keyboard impulses */
// One-frame forces from Keyboard Starfield.js (arrive as KEYBOARD messages).
// Physics reads these each frame, then resets the one-shot ones.
const KEYBOARD = {

  // Multiply star passive velocity X by this factor (ex: slow/fast modes).
  multX: 1,

  // Multiply star passive velocity Y by this factor (ex: slow/fast modes).
  multY: 1,

  // Add a global drift impulse on X (ex: WASD movement).
  addX: 0,

  // Add a global drift impulse on Y (ex: WASD movement).
  addY: 0,

  // Paddles: X position (0..100 style “percent” space used by your pong logic).
  paddlesX: 50,

  // Paddles: Y position (0..100 style “percent” space used by your pong logic).
  paddlesY: 50,

  // Paddles: timer that keeps paddles “active” briefly after input.
  paddlesTimer: 0,

  // When true, magnet targets pointer instead of quadrant coordinates.
  magnetPointer: false,

  // Magnet target X in percent space (0..100).
  magnetX: 0,

  // Magnet target Y in percent space (0..100).
  magnetY: 0
};

/* GROUP: Time base */
// Return a high-resolution timestamp in milliseconds when possible.
S.getNowMs = function getNowMs() {

  // Prefer performance.now() for stable frame deltas (exists in workers too).
  if (typeof performance !== "undefined" && performance.now) return performance.now();

  // Fallback to Date.now() when performance.now is unavailable.
  return Date.now();
};

/* GROUP: Pointer timestamp normalization */
/**
 * Convert pointer event timestamps into the same “perf-style ms” space as performance.now().
 * Setup sends epoch-style ms (the worker's clock starts at a different time than the page's),
 * and some browsers provide epoch-style timestamps anyway; this normalizes both.
 */
S.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {

  // If missing/invalid, use “now” so time deltas stay safe.
  if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return S.getNowMs();

  // Epoch ms is usually huge (ex: 1700000000000).
  // If we detect epoch-style values, translate to perf-space when possible.
  if (RAW_TIMESTAMP > 1e12) {

    // Use timeOrigin to convert epoch ms into performance.now() space.
    if (typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)) {
      return RAW_TIMESTAMP - performance.timeOrigin;
    }

    // If timeOrigin is unavailable, fall back to “now”.
    return S.getNowMs();
  }

  // Otherwise it already looks like performance.now() space.
  return RAW_TIMESTAMP;
};

/* GROUP: Random helpers */
// Return a random float between MIN_VALUE and MAX_VALUE.
S.randomBetween = (MIN_VALUE, MAX_VALUE) =>
  Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

/* GROUP: Talking back to Setup */
// Worker: postMessage to the page. Fallback: call Setup's handler directly.
function postToMain(MESSAGE) {
  if (IS_WORKER) self.postMessage(MESSAGE);
  else if (self.STARFIELD) self.STARFIELD.handleEngineMessage(MESSAGE);
}

/* GROUP: Sprite stars (WebP) */                                          // Group label
// Hold sprite loading state so rendering can bail until the image is ready. // Why we track load state
const STAR_SPRITES = {                                                    // Sprite load state container

  // True once the star image is fully loaded.                             // Meaning
  ready: false,                                                           // Loading gate

  // The ImageBitmap used by drawImage().                                  // Meaning
  img: null                                                               // Image reference
};                                                                        // End sprite state

// Load the star sprite immediately so it is ready by the time rendering starts. // Why IIFE exists
// Workers have no Image(), so fetch the file and decode it into an ImageBitmap. // Why fetch
(function loadStarSpriteNow() {                                           // IIFE: runs once at parse time
  fetch("/Resources/Star.webp")                                           // Sprite path (same origin as the worker)
    .then((RESPONSE) => {                                                 // Check the download
      if (!RESPONSE.ok) throw new Error("HTTP " + RESPONSE.status);       // Treat 404 etc. as a failure
      return RESPONSE.blob();                                             // Raw image bytes
    })
    .then((BLOB) => createImageBitmap(BLOB))                              // Decode off the render path
    .then((BITMAP) => {                                                   // Decoded and ready
      STAR_SPRITES.img = BITMAP;                                          // Save bitmap into sprite state
      STAR_SPRITES.ready = true;                                          // Flip ready flag on success
    })
    .catch((ERROR) => {                                                   // Download or decode failed
      STAR_SPRITES.ready = false;                                         // Keep ready false on error
      console.warn("Could not load star sprite:", ERROR);                 // Say why stars aren't drawing
    });
})();                                                                     // Invoke immediately

/* GROUP: Link throttle state */                                          // Group label
// Count frames so we can rebuild link geometry every N frames.            // Why LINK_FRAME exists
let LINK_FRAME = 0;                                                       // Frame counter for link throttling

// Flag used to force an immediate link rebuild (ex: fast pointer movement). // Why LINKS_DIRTY exists
let LINKS_DIRTY = true;                                                   // Start dirty so first frame builds links

/* GROUP: Links fade near the edges */                                    // Group label
// Faster edge fade helper for links (keeps rendering logic light).        // Why this helper exists
function getEdgeFadeFactorFast(STAR) {                                    // Returns 0..1 fade for link brightness

  // Approximate star "radius" based on how large it draws on screen.      // Why we compute radius
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;             // Star padding radius (safe fallback 0)

  // Measure padded distance to each edge (radius avoids visible popping at wrap). // Explanation
  const DIST_LEFT = STAR.x + STAR_RADIUS;                                 // Distance to left edge including radius
  const DIST_RIGHT = (S.canvasWidth + STAR_RADIUS) - STAR.x;              // Distance to right edge including radius
  const DIST_TOP = STAR.y + STAR_RADIUS;                                  // Distance to top edge including radius
  const DIST_BOTTOM = (S.canvasHeight + STAR_RADIUS) - STAR.y;            // Distance to bottom edge including radius

  // Find the closest edge distance (the "most at risk" direction).        // Why min
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM); // Closest edge distance

  // Define fade band width (cap it so it stays cheap).                    // Fade band logic
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03) || 1;          // Fade band size (never 0)

  // Convert closest distance into 0..1 fade factor.                       // Normalize into [0,1]
  const T =
    MIN_EDGE_DISTANCE <= 0 ? 0 :                                          // At/over edge => fully faded
    MIN_EDGE_DISTANCE >= FADE_BAND ? 1 :                                  // Safely inside => full strength
    (MIN_EDGE_DISTANCE / FADE_BAND);                                      // Otherwise scale proportionally

  // Square for quick easing (cheap “smooth-ish” curve).                   // Fast easing
  return T * T;                                                           // Ease-in curve
}                                                                          // End helper

/* GROUP: Time scaling helpers */                                         // Group label
// Define how many ms one 60fps frame represents (conversion constant).    // Explanation
const SIXTY_FPS_FRAME_MS = 1000 / 60;                                     // 16.666...ms per frame

// Clamp dt (ms) to prevent tab-sleep teleports and clock weirdness.       // Why we clamp dt
function clampDtMs(DT_MS) {                                               // Returns safe dt in ms

  // Prevent negative dt (clock weirdness) from producing inverted updates. // Explanation
  if (DT_MS < 0) return 0;                                                // Negative dt becomes 0

  // Cap dt so tab sleep / lag spikes don't cause massive forces and teleports. // Explanation
  if (DT_MS > 50) return 50;                                              // Cap at ~3 frames @ 60fps

  // Return dt unchanged when it is in a safe range.                       // Explanation
  return DT_MS;                                                           // Safe dt
}                                                                          // End clamp

// Convert a per-frame decay constant into a time-based decay.             // Why we convert
function decayPerFrameToDt(BASE_PER_FRAME, DT_FRAMES) {                   // Converts per-frame decay to variable FPS
  // Example: 0.98 per frame becomes 0.98^DT_FRAMES for variable FPS.      // Explanation
  return Math.pow(BASE_PER_FRAME, DT_FRAMES);                             // Exponentiate by frame count
}                                                                          // End decay converter

/* #endregion 0) PERF HELPERS */                                          // End region 0



/*======================================================================  // Region divider
 * #region 1) PHYSICS                                                     // Start region 1
 *====================================================================*/   // Divider

/* GROUP: Physics entry point */                                          // Group label
// Decide how each star should move.                                       // High-level purpose
S.updateStarPhysics = function updateStarPhysics() {                      // Install physics function onto STARFIELD

  // Bail early if we have no stars to simulate.                           // Guard
  if (!S.starList.length) return;                                         // Nothing to do

  // Sample time from Setup helper (performance.now when possible).        // Time source
  const NOW_MS = S.getNowMs();                                            // Current time (ms)

  // Mark start time for per-frame debug timing.                           // For debug time measurement
  const FRAME_START_MS = NOW_MS;                                          // Start timestamp for this frame

  // Use previous timestamp, or default to NOW on first frame.             // Last time fallback
  const LAST_PHYSICS_MS = S.lastPhysicsMs || NOW_MS;                      // Last physics timestamp

  // Compute elapsed time and clamp to avoid huge simulation jumps.        // dt computation
  const DT_MS = clampDtMs(NOW_MS - LAST_PHYSICS_MS);                      // Safe delta time in ms

  // Store this frame's timestamp for next update.                         // Persist last time
  S.lastPhysicsMs = NOW_MS;                                               // Save timestamp

  // Normalize elapsed time into “60fps frames”.                           // Convert dt into frame units
  const DT_FRAMES = DT_MS / SIXTY_FPS_FRAME_MS;                           // dt in "frames"

  // Bail if dt is zero so we don't waste work.                            // Guard
  if (DT_FRAMES <= 0) return;                                             // No time passed

  /* GROUP: Ranges + settings */                                          // Group label
  // Define maximum range where pointer forces can affect stars.           // Influence radius
  const INFLUENCE_RANGE = S.screenPerimeter * 0.2;                        // Range scales with screen

  // Precompute squared range for cheap comparisons.                       // Optimization
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;           // Range squared

  // Local distance threshold for wrap vs bounce behavior.                 // Wrap/bounce threshold
  const WRAP_DISTANCE_SQ = 200 * 200;                                     // 200px squared

  // Grab UI-tunable settings.                                             // Settings alias
  const SETTINGS = S.interactionSettings;                                 // Slider-driven settings

  // Grab precomputed screen scaling powers.                               // Scaling alias
  const SCALE = S.screenScalePowers;                                      // Screen scaling multipliers

  /* GROUP: Time-based decays */                                          // Group label
  // Convert legacy “per frame” decays into time-based multipliers.        // Explanation
  const MOMENTUM_DECAY = decayPerFrameToDt(0.98, DT_FRAMES);              // Momentum decay per dt
  const WHITE_DECAY = decayPerFrameToDt(0.98, DT_FRAMES);                 // White flash decay per dt
  const POINTER_SPEED_DECAY = decayPerFrameToDt(0.5, DT_FRAMES);          // Pointer energy decay per dt
  const RING_DECAY = decayPerFrameToDt(0.95, DT_FRAMES);                  // Ring timer decay per dt
  const POKE_DECAY = decayPerFrameToDt(0.85, DT_FRAMES);                  // Poke timer decay per dt

  /* GROUP: Update each star */                                           // Group label
  for (const STAR of S.starList) {                                        // Iterate all stars

    // Prevent paddle bounce and normal bounce from fighting each other.   // Why flag exists
    let DID_BOUNCE = false;                                               // Whether we already bounced this frame

    // Compute pointer delta vector (pointer minus star).                  // Delta vector
    const POINTER_DELTA_X = S.pointerClientX - STAR.x;                    // dx to pointer
    const POINTER_DELTA_Y = S.pointerClientY - STAR.y;                    // dy to pointer

    // Compute squared distance for range checks.                          // Distance squared
    const DISTANCE_TO_POINTER_SQ =
      POINTER_DELTA_X * POINTER_DELTA_X + POINTER_DELTA_Y * POINTER_DELTA_Y; // dx^2 + dy^2

    /* GROUP: Proximity-only forces */                                    // Group label
    if (DISTANCE_TO_POINTER_SQ < INFLUENCE_RANGE_SQ) {                    // Only compute expensive forces in range

      // Compute true distance and add epsilon to prevent divide-by-zero.  // Safe sqrt
      const DISTANCE_TO_POINTER = Math.sqrt(DISTANCE_TO_POINTER_SQ) + 0.0001; // Distance + epsilon

      // Normalize delta into a unit vector toward pointer.                // Unit direction
      const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE_TO_POINTER;    // ux
      const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE_TO_POINTER;    // uy

      /* GROUP: Attraction */                                             // Group label
      // Convert distance into 0..1 gradient inside attraction radius.     // Gradient mapping
      let ATTRACTION_GRADIENT =
        1 - (DISTANCE_TO_POINTER / ((SETTINGS.attractRadius * SCALE.attractionGradient) || 1)); // Invert normalized distance

      // Clamp so it never goes negative outside radius.                   // Clamp
      ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);             // 0..1

      // Shape attraction falloff curve.                                   // Curve shaping
      const ATTRACTION_SHAPE = Math.pow(                                 // Exponent curve
        ATTRACTION_GRADIENT,                                             // Base gradient
        Math.max(0.1, (SETTINGS.attractScale * SCALE.attractionShape)) // Exponent (never below 0.1)
      );

      // Compute attraction force (settings + screen scale + pointer energy + shape). // Force composition
      const ATTRACTION_FORCE =
        (SETTINGS.attractStrength * SCALE.attractionForce) *  // Base strength scaled
        S.pointerSpeedUnits *                                            // Pointer energy multiplier
        ATTRACTION_SHAPE;                                                // Curve-shaped falloff

      /* GROUP: Repulsion */                                              // Group label
      // Convert distance into 0..1 gradient inside repulsion radius.      // Gradient mapping
      let REPULSION_GRADIENT =
        1 - (DISTANCE_TO_POINTER / ((SETTINGS.repelRadius * SCALE.repulsionGradient) || 1)); // Invert normalized distance

      // Clamp so it never goes negative outside radius.                   // Clamp
      REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);               // 0..1

      // Shape repulsion falloff curve.                                    // Curve shaping
      const REPULSION_SHAPE = Math.pow(                                   // Exponent curve
        REPULSION_GRADIENT,                                               // Base gradient
        Math.max(0.1, (SETTINGS.repelScale * SCALE.repulsionShape))                        // Exponent (never below 0.1)
      );

      // Compute repulsion force (settings + screen scale + pointer energy + shape). // Force composition
      const REPULSION_FORCE =
        (SETTINGS.repelStrength * SCALE.repulsionForce) *      // Base strength scaled
        S.pointerSpeedUnits *                                             // Pointer energy multiplier
        REPULSION_SHAPE;                                                  // Curve-shaped falloff

      /* GROUP: Poke */                                                   // Group label
      // Define poke radius as a fraction of screen size.                  // Poke radius definition
      const POKE_RADIUS = S.screenPerimeter * 0.2;                        // Poke reach scales with screen

      // Convert distance into 0..1 poke gradient inside poke radius.      // Gradient mapping
      const POKE_GRADIENT = 1 - (DISTANCE_TO_POINTER / POKE_RADIUS);      // Inverted normalized distance

      // Shape poke so it ramps sharply near pointer.                      // Curve shaping
      const POKE_SHAPE = Math.pow(Math.max(0, POKE_GRADIENT), 2);         // Clamp then square

      // Compute poke force (settings + impulse timer + shape).            // Poke force composition
      const POKE_FORCE =
        (0.01 * SETTINGS.pokeStrength) *                                  // Poke strength base
        S.pokeImpulseTimer *                                              // Impulse timer multiplier
        POKE_SHAPE;                                                       // Shape falloff

      /* GROUP: Apply proximity-only forces */                            // Group label
      STAR.momentumX += (ATTRACTION_FORCE * UNIT_TO_POINTER_X) * DT_FRAMES; // Pull toward pointer (x)
      STAR.momentumY += (ATTRACTION_FORCE * UNIT_TO_POINTER_Y) * DT_FRAMES; // Pull toward pointer (y)

      STAR.momentumX += (REPULSION_FORCE * -UNIT_TO_POINTER_X) * DT_FRAMES; // Push away from pointer (x)
      STAR.momentumY += (REPULSION_FORCE * -UNIT_TO_POINTER_Y) * DT_FRAMES; // Push away from pointer (y)

      STAR.momentumX += (POKE_FORCE * -UNIT_TO_POINTER_X) * DT_FRAMES;      // Poke burst away (x)
      STAR.momentumY += (POKE_FORCE * -UNIT_TO_POINTER_Y) * DT_FRAMES;      // Poke burst away (y)
    }

    /* GROUP: Global forces */                                            // Group label
    const DRIFT_BOOST = Math.min(7, 0.01 * (S.pointerSpeedUnits + 0.0001)); // Drift boost increases with pointer energy (capped)

    STAR.momentumX += (STAR.vx * DRIFT_BOOST) * DT_FRAMES;                // Add baseline drift (x) into momentum
    STAR.momentumY += (STAR.vy * DRIFT_BOOST) * DT_FRAMES;                // Add baseline drift (y) into momentum

    /* GROUP: Keyboard influence */                                       // Group label
    STAR.momentumX += KEYBOARD.addX + (KEYBOARD.multX * STAR.vx * 0.05); // Add keyboard impulse + drift assist (x)
    STAR.momentumY += KEYBOARD.addY + (KEYBOARD.multY * STAR.vy * 0.05); // Add keyboard impulse + drift assist (y)

    STAR.momentumX *= KEYBOARD.multX;                               // Multiply momentum (x) for speed scaling keys
    STAR.momentumY *= KEYBOARD.multY;                               // Multiply momentum (y) for speed scaling keys

    /* GROUP: Magnet orbit */                                             // Group label
    if (KEYBOARD.magnetY > 0 || KEYBOARD.magnetPointer) {    // If magnet mode is active

      const CANVAS = S.constellationCanvas;                               // Canvas ref for bounding rect conversions

      if (CANVAS) {                                                       // Proceed only if canvas exists

        const RECT = { left: 0, top: 0 };                                 // Canvas is position:fixed + inset:0 (no DOM rect in a worker)

        // Magnet target in CANVAS space.                                // Target variables
        let MAGNET_X_CANVAS, MAGNET_Y_CANVAS;                             // Target coordinates

        if (KEYBOARD.magnetPointer) {                              // Pointer-centered magnet mode
          MAGNET_X_CANVAS = S.pointerClientX - RECT.left;                 // Pointer x relative to canvas
          MAGNET_Y_CANVAS = S.pointerClientY - RECT.top;                  // Pointer y relative to canvas
        } else {                                                          // Grid magnet mode
          MAGNET_X_CANVAS = (KEYBOARD.magnetX / 100) * S.canvasWidth;  // Percent -> canvas x
          MAGNET_Y_CANVAS = (KEYBOARD.magnetY / 100) * S.canvasHeight; // Percent -> canvas y
        }

        // Vector from star -> magnet.                                     // Delta vector
        const DELTA_TO_MAGNET_X = MAGNET_X_CANVAS - STAR.x;               // dx to magnet
        const DELTA_TO_MAGNET_Y = MAGNET_Y_CANVAS - STAR.y;               // dy to magnet

        // Distance to magnet (epsilon prevents divide-by-zero).           // Distance
        const DIST_TO_MAGNET = Math.sqrt(                                 // sqrt(dx^2 + dy^2)
          DELTA_TO_MAGNET_X * DELTA_TO_MAGNET_X + DELTA_TO_MAGNET_Y * DELTA_TO_MAGNET_Y
        ) + 0.0001;                                                       // Add epsilon

        // Unit vector toward magnet (scaled up for “snappy” feel).        // Direction vector
        const UNIT_TOWARD_MAGNET_X = (DELTA_TO_MAGNET_X / DIST_TO_MAGNET) * 5; // ux * gain
        const UNIT_TOWARD_MAGNET_Y = (DELTA_TO_MAGNET_Y / DIST_TO_MAGNET) * 5; // uy * gain

        // Orbit direction (default clockwise).                            // Orbit direction choice
        const ORBIT_DIR = (KEYBOARD.magnetDir === -1) ? -1 : 1;    // -1 for CCW if requested, else +1

        // Perpendicular orbit vector (rotate 90 degrees).                 // Perpendicular vector
        const UNIT_ORBIT_X = (-UNIT_TOWARD_MAGNET_Y) * ORBIT_DIR;         // Rotate (ux,uy) -> (-uy,ux)
        const UNIT_ORBIT_Y = ( UNIT_TOWARD_MAGNET_X) * ORBIT_DIR;         // Rotate (ux,uy) -> (-uy,ux)

        const MAGNET_STRENGTH = KEYBOARD.magnetStrength || 1;      // Optional external strength knob (default 1)

        const FALLOFF = 0.35;                                             // Distance falloff constant

        const FALL_FACTOR =
          1 / (1 + FALLOFF * DIST_TO_MAGNET / (S.screenPerimeter || 1));  // Soft falloff vs distance and screen size

        const BASE_FORCE =
          (0.08 * SETTINGS.clamp * SCALE.forceClamp) * MAGNET_STRENGTH * FALL_FACTOR; // Base force tied to clamp and scale

        const PULL_FORCE = BASE_FORCE * 0.55;                             // Portion of force used to pull inward
        const SPIN_FORCE = BASE_FORCE * 0.95;                             // Portion of force used to spin/orbit

        STAR.momentumX += (UNIT_TOWARD_MAGNET_X * PULL_FORCE + UNIT_ORBIT_X * SPIN_FORCE) * DT_FRAMES; // Apply pull+spin (x)
        STAR.momentumY += (UNIT_TOWARD_MAGNET_Y * PULL_FORCE + UNIT_ORBIT_Y * SPIN_FORCE) * DT_FRAMES; // Apply pull+spin (y)

        LINKS_DIRTY = true;                                               // Force link rebuild since geometry changed strongly
      }
    }

    /* GROUP: Momentum clamp */                                           // Group label
    const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;         // Max allowed momentum magnitude

    const MOMENTUM_MAG = Math.sqrt(                                       // Compute |momentum|
      STAR.momentumX * STAR.momentumX + STAR.momentumY * STAR.momentumY
    );

    if (MOMENTUM_MAG > MOMENTUM_LIMIT) {                                  // If momentum exceeds cap
      const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;               // Scale factor to bring magnitude down to cap
      STAR.momentumX *= MOMENTUM_SCALE;                                   // Clamp momentum (x)
      STAR.momentumY *= MOMENTUM_SCALE;                                   // Clamp momentum (y)
    }

    /* GROUP: Integration */                                              // Group label
    STAR.x += (STAR.vx + STAR.momentumX) * DT_FRAMES;                     // Integrate x position
    STAR.y += (STAR.vy + STAR.momentumY) * DT_FRAMES;                     // Integrate y position

    /* GROUP: Momentum friction with floor */                             // Group label
    const MIN_MOM = 0.01;                                                 // Minimum momentum floor to avoid "stuck" micro jitter

    STAR.momentumX *= MOMENTUM_DECAY;                                     // Apply momentum decay (x)
    STAR.momentumY *= MOMENTUM_DECAY;                                     // Apply momentum decay (y)

    if (STAR.momentumX !== 0) {                                           // If non-zero momentum exists (x)
      STAR.momentumX = Math.sign(STAR.momentumX) * Math.max(MIN_MOM, Math.abs(STAR.momentumX)); // Keep at least MIN_MOM
    }

    if (STAR.momentumY !== 0) {                                           // If non-zero momentum exists (y)
      STAR.momentumY = Math.sign(STAR.momentumY) * Math.max(MIN_MOM, Math.abs(STAR.momentumY)); // Keep at least MIN_MOM
    }

    /* GROUP: Paddle star physics */                                      // Group label
    if (KEYBOARD.paddlesTimer > 0 && STAR === S.starList[0]) {      // If paddles active and this is the special "ball" star

      STAR.whiteValue = 1;                                                // Force the ball star to appear bright
      STAR.opacity = 1;                                                   // Force full opacity for ball visibility

      const CANVAS = S.constellationCanvas;                               // Canvas ref for view bounds mapping

      if (CANVAS) {                                                       // Proceed only if canvas exists

        const RECT = { left: 0, top: 0 };                                 // Canvas is position:fixed + inset:0 (no DOM rect in a worker)

        const VIEW_LEFT = -RECT.left;                                     // Visible left bound in canvas space
        const VIEW_TOP = -RECT.top;                                       // Visible top bound in canvas space
        const VIEW_RIGHT = VIEW_LEFT + S.canvasWidth;                     // Visible right bound in canvas space
        const VIEW_BOTTOM = VIEW_TOP + S.canvasHeight;                    // Visible bottom bound in canvas space

        const PADDLE_CENTER_X =
          VIEW_LEFT + (KEYBOARD.paddlesX / 100) * S.canvasWidth;          // Paddle x (percent -> view/canvas space)
        const PADDLE_CENTER_Y =
          VIEW_TOP + (KEYBOARD.paddlesY / 100) * S.canvasHeight;          // Paddle y (percent -> view/canvas space)

        const PADDLE_W = S.canvasWidth * 0.10;                            // Paddle width as % of viewport
        const PADDLE_H = S.canvasHeight * 0.10;                           // Paddle height as % of viewport

        const HALF_PW = PADDLE_W * 0.5;                                   // Half paddle width
        const HALF_PH = PADDLE_H * 0.5;                                   // Half paddle height

        const PADDLE_THICKNESS = Math.max(                                // Paddle stroke thickness
          2,                                                              // Minimum thickness
          Math.min(S.canvasWidth, S.canvasHeight) * 0.03                  // Thickness scaled to viewport
        );

        const HALF_T = PADDLE_THICKNESS * 0.5;                            // Half thickness for collision padding

        const BALL_RADIUS = Math.max(2, (2 + STAR.size) || 2);            // Collision radius for ball star

        const TOTAL_VEL_X = (STAR.vx || 0) + (STAR.momentumX || 0);        // Current x velocity (drift + momentum)
        const TOTAL_VEL_Y = (STAR.vy || 0) + (STAR.momentumY || 0);        // Current y velocity (drift + momentum)

        const BALL_SPEED = Math.sqrt(TOTAL_VEL_X * TOTAL_VEL_X + TOTAL_VEL_Y * TOTAL_VEL_Y); // Speed magnitude

        if (BALL_SPEED > 0.0001) {                                        // Only bounce if moving

          const clamp = (V, A, B) => (V < A ? A : V > B ? B : V);          // Clamp helper for bounce angles

          const MAX_ANGLE = 1.25;                                         // Max deflection angle in radians (~71.6°)

          const PUSH_OUT_X = BALL_RADIUS + HALF_T + 0.5;                  // Push-out distance for left/right hits
          const PUSH_OUT_Y = BALL_RADIUS + HALF_T + 0.5;                  // Push-out distance for top/bottom hits

          const TOUCH_LEFT   = STAR.x <= VIEW_LEFT   + (BALL_RADIUS + HALF_T); // Is ball touching left wall zone
          const TOUCH_RIGHT  = STAR.x >= VIEW_RIGHT  - (BALL_RADIUS + HALF_T); // Is ball touching right wall zone
          const TOUCH_TOP    = STAR.y <= VIEW_TOP    + (BALL_RADIUS + HALF_T); // Is ball touching top wall zone
          const TOUCH_BOTTOM = STAR.y >= VIEW_BOTTOM - (BALL_RADIUS + HALF_T); // Is ball touching bottom wall zone

          const WITHIN_LR_PADDLE =
            (STAR.y >= (PADDLE_CENTER_Y - HALF_PH) && STAR.y <= (PADDLE_CENTER_Y + HALF_PH)); // Within vertical span for L/R paddles

          const WITHIN_TB_PADDLE =
            (STAR.x >= (PADDLE_CENTER_X - HALF_PW) && STAR.x <= (PADDLE_CENTER_X + HALF_PW)); // Within horizontal span for T/B paddles

          const HIT_COOLDOWN_MS = 60;                                     // Bounce cooldown to prevent rapid double-hits

          if (TOUCH_LEFT && WITHIN_LR_PADDLE && TOTAL_VEL_X < 0) {         // Left wall hit, within paddle, moving left

            const OFFSET = clamp((STAR.y - PADDLE_CENTER_Y) / (HALF_PH || 1), -1, 1); // Normalize contact point (-1..1)
            const ANG = OFFSET * MAX_ANGLE;                                // Convert offset into bounce angle

            const OUT_VEL_X = +1 * BALL_SPEED * Math.cos(ANG);            // Bounce to the right with angled component
            const OUT_VEL_Y = BALL_SPEED * Math.sin(ANG);                  // Y component based on angle

            DID_BOUNCE = bounceVertical(                                   // Apply vertical-wall bounce
              STAR, VIEW_LEFT, +1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_X, NOW_MS, HIT_COOLDOWN_MS, true
            ) || DID_BOUNCE;                                               // Preserve bounce flag
          } else if (TOUCH_RIGHT && WITHIN_LR_PADDLE && TOTAL_VEL_X > 0) {  // Right wall hit, within paddle, moving right

            const OFFSET = clamp((STAR.y - PADDLE_CENTER_Y) / (HALF_PH || 1), -1, 1); // Normalize contact point
            const ANG = OFFSET * MAX_ANGLE;                                // Convert offset into bounce angle

            const OUT_VEL_X = -1 * BALL_SPEED * Math.cos(ANG);             // Bounce to the left
            const OUT_VEL_Y = BALL_SPEED * Math.sin(ANG);                  // Y component

            DID_BOUNCE = bounceVertical(                                   // Apply vertical-wall bounce
              STAR, VIEW_RIGHT, -1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_X, NOW_MS, HIT_COOLDOWN_MS, true
            ) || DID_BOUNCE;                                               // Preserve bounce flag
          } else if (TOUCH_TOP && WITHIN_TB_PADDLE && TOTAL_VEL_Y < 0) {    // Top wall hit, within paddle, moving up

            const OFFSET = clamp((STAR.x - PADDLE_CENTER_X) / (HALF_PW || 1), -1, 1); // Normalize contact point
            const ANG = OFFSET * MAX_ANGLE;                                // Convert offset into bounce angle

            const OUT_VEL_Y = +1 * BALL_SPEED * Math.cos(ANG);             // Bounce downward
            const OUT_VEL_X = BALL_SPEED * Math.sin(ANG);                  // X component based on angle

            DID_BOUNCE = bounceHorizontal(                                 // Apply horizontal-wall bounce
              STAR, VIEW_TOP, +1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_Y, NOW_MS, HIT_COOLDOWN_MS, true
            ) || DID_BOUNCE;                                               // Preserve bounce flag
          } else if (TOUCH_BOTTOM && WITHIN_TB_PADDLE && TOTAL_VEL_Y > 0) { // Bottom wall hit, within paddle, moving down

            const OFFSET = clamp((STAR.x - PADDLE_CENTER_X) / (HALF_PW || 1), -1, 1); // Normalize contact point
            const ANG = OFFSET * MAX_ANGLE;                                // Convert offset into bounce angle

            const OUT_VEL_Y = -1 * BALL_SPEED * Math.cos(ANG);             // Bounce upward
            const OUT_VEL_X = BALL_SPEED * Math.sin(ANG);                  // X component based on angle

            DID_BOUNCE = bounceHorizontal(                                 // Apply horizontal-wall bounce
              STAR, VIEW_BOTTOM, -1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_Y, NOW_MS, HIT_COOLDOWN_MS, true
            ) || DID_BOUNCE;                                               // Preserve bounce flag
          }
        }
      }
    }

    /* GROUP: Edge behavior (wrap vs bounce) */                            // Group label
    if (S.pointerRingTimer === 0 || DISTANCE_TO_POINTER_SQ > WRAP_DISTANCE_SQ || S.pokeImpulseTimer > 10) { // Decide wrap mode

      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;          // Radius padding for wrap

      if (STAR.x < -STAR_RADIUS) STAR.x = S.canvasWidth + STAR_RADIUS;     // Wrap from left to right
      else if (STAR.x > S.canvasWidth + STAR_RADIUS) STAR.x = -STAR_RADIUS; // Wrap from right to left

      if (STAR.y < -STAR_RADIUS) STAR.y = S.canvasHeight + STAR_RADIUS;    // Wrap from top to bottom
      else if (STAR.y > S.canvasHeight + STAR_RADIUS) STAR.y = -STAR_RADIUS; // Wrap from bottom to top

    } else {                                                               // Bounce mode (ring active + close to pointer)

      if (!DID_BOUNCE) {                                                   // Only bounce if we didn't already bounce via paddles

        const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;         // Radius padding for bounce

        const TOTAL_VEL_X = (STAR.vx || 0) + (STAR.momentumX || 0);         // Current x velocity
        const TOTAL_VEL_Y = (STAR.vy || 0) + (STAR.momentumY || 0);         // Current y velocity

        const PUSH_OUT_X = STAR_RADIUS + 0.5;                               // Push-out for x bounces
        const PUSH_OUT_Y = STAR_RADIUS + 0.5;                               // Push-out for y bounces

        if (STAR.x < STAR_RADIUS) {                                         // Left edge collision
          const OUT_VEL_X = Math.abs(TOTAL_VEL_X);                          // Reflect to positive x
          const OUT_VEL_Y = TOTAL_VEL_Y;                                    // Keep y component
          bounceVertical(STAR, STAR_RADIUS, +1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_X, NOW_MS, 0); // Apply bounce
        } else if (STAR.x > S.canvasWidth - STAR_RADIUS) {                  // Right edge collision
          const OUT_VEL_X = -Math.abs(TOTAL_VEL_X);                         // Reflect to negative x
          const OUT_VEL_Y = TOTAL_VEL_Y;                                    // Keep y component
          bounceVertical(STAR, S.canvasWidth - STAR_RADIUS, -1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_X, NOW_MS, 0); // Apply bounce
        }

        if (STAR.y < STAR_RADIUS) {                                         // Top edge collision
          const OUT_VEL_X = TOTAL_VEL_X;                                    // Keep x component
          const OUT_VEL_Y = Math.abs(TOTAL_VEL_Y);                          // Reflect to positive y
          bounceHorizontal(STAR, STAR_RADIUS, +1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_Y, NOW_MS, 0); // Apply bounce
        } else if (STAR.y > S.canvasHeight - STAR_RADIUS) {                 // Bottom edge collision
          const OUT_VEL_X = TOTAL_VEL_X;                                    // Keep x component
          const OUT_VEL_Y = -Math.abs(TOTAL_VEL_Y);                         // Reflect to negative y
          bounceHorizontal(STAR, S.canvasHeight - STAR_RADIUS, -1, OUT_VEL_X, OUT_VEL_Y, PUSH_OUT_Y, NOW_MS, 0); // Apply bounce
        }
      }
    }

    /* GROUP: White flash decay */                                          // Group label
    if (STAR.whiteValue > 0) {                                             // If star is in white-flash state
      STAR.whiteValue *= WHITE_DECAY;                                      // Decay the white value over time
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;                    // Snap to 0 when tiny
    }

    /* GROUP: Opacity / twinkle cycle */                                   // Group label
    if (STAR.opacity <= 0.005) {                                           // If twinkle faded out
      STAR.opacity = 1;                                                    // Reset opacity to full
      if (Math.random() < 0.07) STAR.whiteValue = 1;                       // Occasional white "spark" on reset
    } else if (STAR.opacity > 0.02) {                                      // If still in main fade stage
      STAR.opacity -= (0.005 * STAR.fadeSpeed) * DT_FRAMES;                // Fade down faster early
    } else {                                                               // If nearly faded out
      STAR.opacity -= 0.0001 * DT_FRAMES;                                  // Fade slowly at the tail
    }
  }

  /* GROUP: Reset keyboard impulses */                                     // Group label
  KEYBOARD.multX = 1;                                               // Reset speed multiplier x
  KEYBOARD.multY = 1;                                               // Reset speed multiplier y
  KEYBOARD.addX = 0;                                                // Reset impulse add x
  KEYBOARD.addY = 0;                                                // Reset impulse add y
  KEYBOARD.magnetX = 0;                                             // Clear magnet target x
  KEYBOARD.magnetY = 0;                                             // Clear magnet target y
  KEYBOARD.magnetPointer = false;                                   // Clear pointer magnet flag

  /* GROUP: Pointer energy decay */                                        // Group label
  S.pointerSpeedUnits *= POINTER_SPEED_DECAY;                              // Decay pointer energy
  if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;                // Snap to 0 when tiny

  /* GROUP: Ring timer decay */                                            // Group label
  S.pointerRingTimer *= RING_DECAY;                                        // Decay ring timer
  if (S.pointerRingTimer < 1) S.pointerRingTimer = 0;                      // Snap to 0 when small

  /* GROUP: Poke timer decay */                                            // Group label
  S.pokeImpulseTimer *= POKE_DECAY;                                        // Decay poke timer
  if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;                      // Snap to 0 when small

  /* GROUP: Debug readouts (only when present) */                          // Group label
  if (S.wantsDebug) {                                                      // Only when the page has debug readouts
    postToMain({                                                           // Setup writes these into the DOM
      type: "DEBUG",                                                       // Message type
      misc: (S.getNowMs() - FRAME_START_MS).toFixed(3),                    // Frame time (ms)
      circle: S.pointerRingTimer.toFixed(3),                               // Ring timer
      speed: S.pointerSpeedUnits.toFixed(3),                               // Pointer energy
      poke: S.pokeImpulseTimer.toFixed(1)                                  // Poke timer
    });
  }

  /* GROUP: Adaptive link-distance “lag buster” */                         // Group label
  const FRAME_TIME_MS = S.getNowMs() - FRAME_START_MS;                     // Measure how long this physics frame took

  const TARGET_MS = 3;                                                     // Desired max budget for physics (ms)
  const SHRINK = 0.95;                                                     // Factor to shrink link distance when slow
  const GROW = 1.05;                                                       // Factor to grow link distance when fast

  const MIN_LINK_DISTANCE = S.goalLinkDistance * 0.3;                      // Minimum allowed maxLinkDistance
  const MAX_LINK_DISTANCE = S.goalLinkDistance;                            // Maximum allowed maxLinkDistance

  if (FRAME_TIME_MS > TARGET_MS) {                                         // If we're over budget
    S.maxLinkDistance *= SHRINK;                                           // Shrink link distance to reduce render cost
  } else {                                                                 // If we're under budget
    S.maxLinkDistance *= GROW;                                             // Grow link distance toward goal

    if (S.linkRebuildTimer > 0) {                                          // If we're in a rebuild animation window
      const T = 1 - (S.linkRebuildTimer / 300);                            // Normalize rebuild progress 0..1
      S.maxLinkDistance = S.goalLinkDistance * T;                          // Ramp link distance up over time
      LINKS_DIRTY = true;                                                  // Force link rebuild while ramping
    }
  }

  if (S.linkRebuildTimer > 0) S.linkRebuildTimer -= 0.1 * DT_MS;           // Decrease rebuild timer over time
  if (S.linkRebuildTimer < 0) S.linkRebuildTimer = 0;                      // Clamp rebuild timer at 0

  if (S.maxLinkDistance < MIN_LINK_DISTANCE) {                             // If link distance got too small
    S.maxLinkDistance = MIN_LINK_DISTANCE;                                 // Clamp to minimum
  } else if (S.maxLinkDistance > MAX_LINK_DISTANCE) {                      // If link distance overshot
    S.maxLinkDistance = MAX_LINK_DISTANCE;                                 // Clamp to maximum
  }
};                                                                         // End updateStarPhysics

/* GROUP: Bounce helpers (momentum-only, no hard stop) */                  // Group label
function bounceVertical(
  STAR,
  WALL_X,
  WALL_SIGN,
  OUT_VEL_X,
  OUT_VEL_Y,
  PUSH_OUT,
  NOW_MS,
  COOLDOWN_MS = 0,
  IS_PERMANENT = false
) {
  if (COOLDOWN_MS > 0) {
    const LAST = STAR.lastBounceV_Ms || 0;
    if (NOW_MS - LAST < COOLDOWN_MS) return false;
    STAR.lastBounceV_Ms = NOW_MS;
  }

  // Snapshot original base drift
  const BASE_VX = STAR.vx || 0;
  const BASE_VY = STAR.vy || 0;

  // If permanent, rotate base drift to match the OUT direction (includes angle),
  // while preserving the original base drift magnitude.
  if (IS_PERMANENT) {
    const BASE_SPEED = Math.hypot(BASE_VX, BASE_VY);            // keep drift speed
    const OUT_SPEED  = Math.hypot(OUT_VEL_X, OUT_VEL_Y) || 1;   // direction source
    STAR.vx = (OUT_VEL_X / OUT_SPEED) * BASE_SPEED;
    STAR.vy = (OUT_VEL_Y / OUT_SPEED) * BASE_SPEED;
  }

  // Set momentum so (base + momentum) == OUT exactly
  STAR.momentumX = OUT_VEL_X - (STAR.vx || 0);
  STAR.momentumY = OUT_VEL_Y - (STAR.vy || 0);

  // Push out of wall to avoid re-colliding
  STAR.x = WALL_X + WALL_SIGN * PUSH_OUT;

  return true;
}

function bounceHorizontal(
  STAR,
  WALL_Y,
  WALL_SIGN,
  OUT_VEL_X,
  OUT_VEL_Y,
  PUSH_OUT,
  NOW_MS,
  COOLDOWN_MS = 0,
  IS_PERMANENT = false
) {
  if (COOLDOWN_MS > 0) {
    const LAST = STAR.lastBounceH_Ms || 0;
    if (NOW_MS - LAST < COOLDOWN_MS) return false;
    STAR.lastBounceH_Ms = NOW_MS;
  }

  // Snapshot original base drift
  const BASE_VX = STAR.vx || 0;
  const BASE_VY = STAR.vy || 0;

  // If permanent, rotate base drift to match the OUT direction (includes angle),
  // while preserving the original base drift magnitude.
  if (IS_PERMANENT) {
    const BASE_SPEED = Math.hypot(BASE_VX, BASE_VY);
    const OUT_SPEED  = Math.hypot(OUT_VEL_X, OUT_VEL_Y) || 1;
    STAR.vx = (OUT_VEL_X / OUT_SPEED) * BASE_SPEED;
    STAR.vy = (OUT_VEL_Y / OUT_SPEED) * BASE_SPEED;
  }

  // Set momentum so (base + momentum) == OUT exactly
  STAR.momentumX = OUT_VEL_X - (STAR.vx || 0);
  STAR.momentumY = OUT_VEL_Y - (STAR.vy || 0);

  // Push out of wall to avoid re-colliding
  STAR.y = WALL_Y + WALL_SIGN * PUSH_OUT;

  return true;
}

/* #endregion 1) PHYSICS */                                                // End region 1



/*======================================================================  // Region divider
 * #region 2) RENDERING                                                   // Start region 2
 *====================================================================*/   // Divider

/* GROUP: Link bucket constants */                                        // Group label
const LINK_BUCKET_COUNT = 18;                                             // Number of alpha buckets for batching strokes

let LINK_PATHS_BY_BUCKET = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D()); // One Path2D per alpha bucket

function resetLinkPaths() {                                               // Clears link paths each rebuild
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) { // Loop buckets
    LINK_PATHS_BY_BUCKET[BUCKET_INDEX] = new Path2D();                    // Replace path with empty Path2D
  }
}

/* GROUP: Render entry point */                                           // Group label
S.renderStarsAndLinks = function renderStarsAndLinks() {                  // Install render function onto STARFIELD

  const CONTEXT = S.drawingContext;                                       // Canvas 2D context alias

  CONTEXT.clearRect(0, 0, S.canvasWidth, S.canvasHeight);                 // Clear full canvas each frame

  /* GROUP: Paddles overlay */                                            // Group label
  if (KEYBOARD.paddlesTimer > 0) {                                 // Draw paddles only when active

    KEYBOARD.paddlesX = Math.max(0, Math.min(100, KEYBOARD.paddlesX)); // Clamp paddlesX to 0..100
    KEYBOARD.paddlesY = Math.max(0, Math.min(100, KEYBOARD.paddlesY)); // Clamp paddlesY to 0..100

    const CANVAS = S.constellationCanvas;                                 // Canvas ref
    if (!CANVAS) return;                                                  // Bail if missing (safety)

    const RECT = { left: 0, top: 0 };                                     // Canvas is position:fixed + inset:0 (no DOM rect in a worker)

    const VIEW_LEFT = -RECT.left;                                         // View left in canvas space
    const VIEW_TOP = -RECT.top;                                           // View top in canvas space
    const VIEW_RIGHT = VIEW_LEFT + S.canvasWidth;                         // View right in canvas space
    const VIEW_BOTTOM = VIEW_TOP + S.canvasHeight;                        // View bottom in canvas space

    const ALPHA = Math.min(1, Math.max(0, KEYBOARD.paddlesTimer)); // Map timer into alpha 0..1

    const PADDLE_CENTER_X =
      VIEW_LEFT + (KEYBOARD.paddlesX / 100) * S.canvasWidth;              // Paddle center x
    const PADDLE_CENTER_Y =
      VIEW_TOP + (KEYBOARD.paddlesY / 100) * S.canvasHeight;              // Paddle center y

    const PADDLE_W = S.canvasWidth * 0.10;                                // Paddle width
    const PADDLE_H = S.canvasHeight * 0.10;                               // Paddle height

    CONTEXT.save();                                                       // Save canvas state
    CONTEXT.globalAlpha = ALPHA;                                          // Apply fade
    CONTEXT.lineWidth = Math.max(2, Math.min(S.canvasWidth, S.canvasHeight) * 0.03); // Paddle thickness
    CONTEXT.lineCap = "round";                                            // Rounded ends
    CONTEXT.strokeStyle = "rgba(255,255,255,1)";                          // Paddle color

    CONTEXT.beginPath();                                                  // Begin paddle path

    CONTEXT.moveTo(VIEW_LEFT, Math.max(VIEW_TOP, PADDLE_CENTER_Y - PADDLE_H / 2)); // Left paddle start
    CONTEXT.lineTo(VIEW_LEFT, Math.min(VIEW_BOTTOM, PADDLE_CENTER_Y + PADDLE_H / 2)); // Left paddle end
    CONTEXT.moveTo(VIEW_RIGHT, Math.max(VIEW_TOP, PADDLE_CENTER_Y - PADDLE_H / 2)); // Right paddle start
    CONTEXT.lineTo(VIEW_RIGHT, Math.min(VIEW_BOTTOM, PADDLE_CENTER_Y + PADDLE_H / 2)); // Right paddle end

    CONTEXT.moveTo(Math.max(VIEW_LEFT, PADDLE_CENTER_X - PADDLE_W / 2), VIEW_TOP); // Top paddle start
    CONTEXT.lineTo(Math.min(VIEW_RIGHT, PADDLE_CENTER_X + PADDLE_W / 2), VIEW_TOP); // Top paddle end
    CONTEXT.moveTo(Math.max(VIEW_LEFT, PADDLE_CENTER_X - PADDLE_W / 2), VIEW_BOTTOM); // Bottom paddle start
    CONTEXT.lineTo(Math.min(VIEW_RIGHT, PADDLE_CENTER_X + PADDLE_W / 2), VIEW_BOTTOM); // Bottom paddle end

    CONTEXT.stroke();                                                     // Draw paddles
    CONTEXT.restore();                                                    // Restore canvas state

    KEYBOARD.paddlesTimer -= 0.1;                                  // Decrease paddles visibility timer
  }

  /* GROUP: Links */                                                      // Group label
  CONTEXT.lineWidth = 1;                                                  // Link stroke width

  const STAR_COUNT = S.starList.length;                                   // Cache star count

  if (STAR_COUNT) {                                                       // Only render links if stars exist

    LINK_FRAME++;                                                         // Increment link frame counter

    if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;                     // Fast motion forces more frequent link rebuilds

    const SHOULD_REBUILD_LINKS = LINKS_DIRTY || (LINK_FRAME % 2 === 0);    // Rebuild now if dirty or every other frame

    if (SHOULD_REBUILD_LINKS) {                                           // Rebuild link geometry

      LINKS_DIRTY = false;                                                // Clear dirty flag (we are rebuilding now)

      for (let I = 0; I < STAR_COUNT; I++) {                              // Precompute edge fade for all stars
        S.starList[I].edge = getEdgeFadeFactorFast(S.starList[I]);        // Cache edge fade factor
      }

      const LINK_DISTANCE_SCALE = S.screenPerimeter / 500;                // Scale factor for distance normalization

      const RAW_LINK_CUTOFF = S.maxLinkDistance / LINK_DISTANCE_SCALE;    // Convert screen-scaled link distance into raw canvas cutoff
      const LINK_CUTOFF_SQ = RAW_LINK_CUTOFF * RAW_LINK_CUTOFF;           // Square cutoff for fast rejection

      resetLinkPaths();                                                   // Clear bucket paths

      for (let A_INDEX = 0; A_INDEX < STAR_COUNT; A_INDEX++) {            // Outer loop over stars

        const STAR_A = S.starList[A_INDEX];                               // Star A reference

        const AX = STAR_A.x;                                              // Cache A x
        const AY = STAR_A.y;                                              // Cache A y

        const OPACITY_A = STAR_A.opacity;                                 // Cache A opacity
        const EDGE_A = STAR_A.edge;                                       // Cache A edge fade

        for (let B_INDEX = A_INDEX + 1; B_INDEX < STAR_COUNT; B_INDEX++) { // Inner loop for unique pairs (A<B)

          const STAR_B = S.starList[B_INDEX];                             // Star B reference

          const DELTA_X = AX - STAR_B.x;                                  // dx between stars
          const DELTA_Y = AY - STAR_B.y;                                  // dy between stars

          const DISTANCE_SQ = DELTA_X * DELTA_X + DELTA_Y * DELTA_Y;      // Squared distance

          if (DISTANCE_SQ > LINK_CUTOFF_SQ) continue;                     // Skip pairs beyond cutoff

          const SCALED_DISTANCE = Math.sqrt(DISTANCE_SQ) * LINK_DISTANCE_SCALE; // Convert to scaled distance

          const MIN_OPACITY = OPACITY_A < STAR_B.opacity ? OPACITY_A : STAR_B.opacity; // Min opacity between endpoints
          const MIN_EDGE = EDGE_A < STAR_B.edge ? EDGE_A : STAR_B.edge;   // Min edge fade between endpoints

          const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance); // Fade based on distance
          const DISTANCE_CLAMP = DISTANCE_FADE > 0 ? DISTANCE_FADE : 0;   // Clamp at 0

          let LINK_ALPHA = DISTANCE_CLAMP * MIN_OPACITY * MIN_EDGE;       // Combine distance fade + opacity + edges
          LINK_ALPHA = Math.min(1, (LINK_ALPHA * (LINK_ALPHA + 1)));      // Boost low alpha a bit, clamp to 1

          if (LINK_ALPHA <= 0.002) continue;                              // Skip nearly invisible links

          let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;  // Convert alpha to bucket index using bitwise floor
          if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;                         // Clamp low
          if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1; // Clamp high

          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);              // Begin link at star A
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);  // Draw link to star B
        }
      }
    }

    for (let I = 0; I < LINK_BUCKET_COUNT; I++) {                         // Draw each bucket path once
      const BUCKET_ALPHA = I / (LINK_BUCKET_COUNT - 1);                   // Map bucket index to alpha 0..1
      if (BUCKET_ALPHA <= 0) continue;                                    // Skip fully transparent bucket

      CONTEXT.strokeStyle = `rgba(100, 100, 100, ${BUCKET_ALPHA})`;       // Set stroke alpha for this bucket
      CONTEXT.stroke(LINK_PATHS_BY_BUCKET[I]);                            // Stroke the bucket path
    }
  }

  /* GROUP: Stars */                                                      // Group label
  if (!STAR_SPRITES.ready) return;                                        // Bail until sprite image is loaded

  const IMG = STAR_SPRITES.img;                                           // Sprite image alias

  for (const STAR of S.starList) {                                        // Draw each star

    const BASE_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 1;           // Base radius influenced by whiteValue
    const SPRITE_SIZE = Math.max(2, BASE_RADIUS * 2.4);                   // Sprite size in pixels

    const STAR_CENTER_X = STAR.x;                                         // Star center x
    const STAR_CENTER_Y = STAR.y;                                         // Star center y

    const OVERLAY_RADIUS = SPRITE_SIZE * 0.48;                            // Radius for darkness/white overlays

    let RED_T = (STAR.redValue - 50) / 150;                               // Normalize redValue into 0..1
    if (RED_T < 0) RED_T = 0;                                             // Clamp low
    if (RED_T > 1) RED_T = 1;                                             // Clamp high

    const DARKNESS = 0.15 + 0.55 * (1 - RED_T);                           // Darkness factor (less red => darker)

    CONTEXT.save();                                                      // Save state for per-star transforms

    CONTEXT.globalAlpha = STAR.opacity;                                   // Apply star opacity (twinkle)

    CONTEXT.translate(STAR_CENTER_X, STAR_CENTER_Y);                      // Move origin to star center
    CONTEXT.rotate(STAR.rotation || 0);                                   // Rotate sprite for variation
    CONTEXT.drawImage(IMG, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE); // Draw sprite centered

    CONTEXT.globalCompositeOperation = "source-atop";                     // Restrict overlay to sprite pixels
    CONTEXT.globalAlpha = STAR.opacity * DARKNESS;                        // Alpha for darkness overlay
    CONTEXT.fillStyle = "rgba(0, 0, 0, 1)";                               // Black overlay
    CONTEXT.beginPath();                                                  // Begin overlay circle
    CONTEXT.arc(0, 0, OVERLAY_RADIUS, 0, Math.PI * 2);                    // Circle at center
    CONTEXT.fill();                                                       // Fill overlay

    if (STAR.whiteValue > 0.01) {                                         // If star is flashing white
      CONTEXT.globalCompositeOperation = "lighter";                       // Additive blend for glow
      CONTEXT.globalAlpha = STAR.opacity * (STAR.whiteValue > 1 ? 1 : STAR.whiteValue); // Scale glow by whiteValue
      CONTEXT.fillStyle = "rgba(255, 255, 255, 1)";                       // White glow color
      CONTEXT.beginPath();                                                // Begin glow circle
      CONTEXT.arc(0, 0, OVERLAY_RADIUS, 0, Math.PI * 2);                  // Circle at center
      CONTEXT.fill();                                                     // Fill glow
    }

    CONTEXT.restore();                                                    // Restore state so transforms don't stack
  }

  /* GROUP: User pointer ring */                                          // Group label
  const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);      // Base ring radius based on screen size

  let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);       // Ring radius based on timer
  let RING_WIDTH = S.pointerRingTimer * 0.15;                             // Ring stroke width based on timer
  let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);                // Ring alpha based on timer

  if (S.pointerSpeedUnits < 1) {                                         // If pointer is mostly "still"

    const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200)); // Map poke timer into 0..1
    const INVERTED_POKE = 1 - NORMALIZED_POKE;                            // Invert so ring expands as poke fades

    RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;                     // Poke ring radius behavior
    RING_WIDTH = NORMALIZED_POKE * 7;                                     // Poke ring thickness behavior
    RING_ALPHA = NORMALIZED_POKE;                                         // Poke ring alpha behavior
  }

  if (RING_ALPHA > 0.001) {                                               // Only draw if visible
    CONTEXT.save();                                                       // Save state
    CONTEXT.lineWidth = RING_WIDTH;                                       // Set ring stroke width
    CONTEXT.strokeStyle = "rgba(189, 189, 189, 1)";                       // Ring color
    CONTEXT.globalAlpha = RING_ALPHA;                                     // Ring alpha
    CONTEXT.beginPath();                                                  // Begin ring path
    CONTEXT.arc(S.pointerClientX, S.pointerClientY, RING_RADIUS, 0, Math.PI * 2); // Ring centered on pointer
    CONTEXT.stroke();                                                     // Stroke ring
    CONTEXT.restore();                                                    // Restore state
  }
};                                                                         // End renderStarsAndLinks

/* #endregion 2) RENDERING */                                              // End region 2



/*======================================================================  // Region divider
 * #region 3) USER INPUT                                                  // Start region 3
 *====================================================================*/   // Divider

/* GROUP: Pointer speed energy */                                          // Group label
S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y, EVENT_TIME_MS) { // Update pointer position + compute energy

  // Use the event's own timestamp, not arrival time: messages can reach the worker bunched up, // Why not getNowMs()
  // and two moves "1ms apart" would read as a huge speed spike.                               // Explanation
  const NOW_MS = S.normalizePointerTimestampMs(EVENT_TIME_MS);            // Event time in this thread's perf space

  if (!S.lastPointerTimeMs) {                                             // If this is the first pointer sample

    S.pointerClientX = CURRENT_X;                                         // Initialize pointer x
    S.pointerClientY = CURRENT_Y;                                         // Initialize pointer y

    S.lastPointerTimeMs = NOW_MS;                                         // Initialize last pointer time
    S.pointerSpeedUnits = 0;                                              // Start with 0 speed/energy

    return;                                                               // Done for first sample
  }

  const DT_MS = Math.max(1, NOW_MS - S.lastPointerTimeMs);                // Time delta (min 1ms to avoid divide-by-zero)

  const DELTA_X = CURRENT_X - S.pointerClientX;                           // Pointer dx
  const DELTA_Y = CURRENT_Y - S.pointerClientY;                           // Pointer dy

  const RAW_SPEED = Math.sqrt(DELTA_X * DELTA_X + DELTA_Y * DELTA_Y) / DT_MS; // Pixels per ms

  S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50); // Convert speed into energy units (scaled + clamped)

  S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits); // Ensure ring timer is at least as big as current energy

  if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;                       // Fast pointer movement triggers link rebuild

  S.pointerClientX = CURRENT_X;                                           // Store pointer x
  S.pointerClientY = CURRENT_Y;                                           // Store pointer y

  S.lastPointerTimeMs = NOW_MS;                                           // Store pointer time
};

/* GROUP: Begin interaction */                                             // Group label
S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y, EVENT_TIME_MS) { // Called on click/tap start
  S.pokeImpulseTimer = 200;                                               // Kick poke timer to full impulse
  S.lastPointerTimeMs = 0;                                                // Force pointer speed to re-init cleanly
  S.updatePointerSpeed(START_X, START_Y, EVENT_TIME_MS);                  // Seed pointer position and energy
};


/* #endregion 3) USER INPUT */                                             // End region 3



/*======================================================================
 * #region 4) INIT: RESTORE OR CREATE STARS
 *====================================================================*/

/* GROUP: Restore or create */
// Adopt saved stars if possible, otherwise create a fresh random field.
// Setup reads + parses localStorage (workers can't) and sends the result in INIT.
S.restoreOrCreateStars = function restoreOrCreateStars(SAVED) {

  // Bail if canvas isn't active so we don't create unusable state.
  if (!S.isCanvasReady) return;

  // If there is no usable saved data, generate a new starfield.
  if (!SAVED || !Array.isArray(SAVED.stars) || !SAVED.stars.length) {
    S.createNewStars();
    return;
  }

  // Adopt saved stars (keep object shape stable for compatibility).
  S.starList = SAVED.stars;

  // If meta is missing, keep stars and exit.
  const SAVED_META = SAVED.meta;
  if (!SAVED_META) return;

  /* GROUP: Rescale stars */
  // Rescale stars to current canvas so they don’t “corner spawn” after resize.
  if (SAVED_META.width > 0 && SAVED_META.height > 0) {

    // Compute X scale ratio from old canvas to new canvas.
    const SCALE_X = S.canvasWidth / SAVED_META.width;

    // Compute Y scale ratio from old canvas to new canvas.
    const SCALE_Y = S.canvasHeight / SAVED_META.height;

    // Compute a size scale ratio from old perimeter to new perimeter.
    const SIZE_SCALE =
      (S.canvasWidth + S.canvasHeight) / (SAVED_META.width + SAVED_META.height);

    // Apply rescale to each star position and size.
    for (const STAR of S.starList) {
      STAR.x *= SCALE_X;        // Scale X into new canvas space.
      STAR.y *= SCALE_Y;        // Scale Y into new canvas space.
      STAR.size *= SIZE_SCALE;  // Scale size for consistent feel.
    }
  }

  /* GROUP: Restore interaction state */
  // (Slider settings are restored by Setup, which owns the sliders.)
  // Restore poke timer (fallback to 0).
  S.pokeImpulseTimer = SAVED_META.pokeTimer ?? 0;

  // Restore pointer speed “energy” (fallback to 0).
  S.pointerSpeedUnits = SAVED_META.userSpeed ?? 0;

  // Restore ring timer (fallback to 0).
  S.pointerRingTimer = SAVED_META.ringTimer ?? 0;

  /* GROUP: Restore pointer position */
  // Restore pointer X when saved as a number.
  if (typeof SAVED_META.userX === "number") S.pointerClientX = SAVED_META.userX;

  // Restore pointer Y when saved as a number.
  if (typeof SAVED_META.userY === "number") S.pointerClientY = SAVED_META.userY;

  /* GROUP: Reset pointer time baseline */
  // Reset timing baseline to “now” so next delta is sane.
  S.lastPointerTimeMs = S.getNowMs();
};

/* GROUP: Create new stars */
// Create a fresh randomized set of stars sized for the current screen.
S.createNewStars = function createNewStars() {

  // Bail if canvas isn't active so we don't create unusable state.
  if (!S.isCanvasReady) return;

  // Clear any existing stars before rebuilding.
  S.starList = [];

  /* GROUP: Star size limits */
  // Define minimum allowed star size.
  const MIN_SIZE = 3;

  // Define maximum allowed star size (scaled by screen).
  const MAX_SIZE = Math.min(10, S.screenPerimeter / 400 || 3);

  /* GROUP: Build stars */
  // Create each star object (keep fields stable for storage compatibility).
  for (let STAR_INDEX = 0; STAR_INDEX < S.starCountLimit; STAR_INDEX++) {
    S.starList.push({

      // Spawn X uniformly across the canvas.
      x: Math.random() * S.canvasWidth,

      // Spawn Y uniformly across the canvas.
      y: Math.random() * S.canvasHeight,

      // Passive drift velocity X.
      vx: S.randomBetween(-0.15, 0.15),

      // Passive drift velocity Y.
      vy: S.randomBetween(-0.15, 0.15),

      // Base size used by rendering.
      size: S.randomBetween(
        Math.min(MIN_SIZE, MAX_SIZE),
        Math.max(MIN_SIZE, MAX_SIZE)
      ),

      // Rotation (used by line-y sprite / starburst style).
      rotation: Math.random() * Math.PI * 2,

      // Twinkle opacity baseline.
      opacity: S.randomBetween(0.005, 1.8),

      // Twinkle fade speed multiplier.
      fadeSpeed: S.randomBetween(1, 2.1),

      // Redness used by darkness overlay.
      redValue: S.randomBetween(50, 200),

      // White flash intensity (physics updates this).
      whiteValue: 0,

      // Accumulated momentum X (forces add here).
      momentumX: 0,

      // Accumulated momentum Y (forces add here).
      momentumY: 0,

      // Cached edge fade factor used by link brightness.
      edge: 1,

      // Keyboard force X (legacy/optional).
      keyboardForceX: 0,

      // Keyboard force Y (legacy/optional).
      keyboardForceY: 0
    });
  }

  /* GROUP: Pong ball consistency */
  // Force star[0] to have a consistent velocity for the paddles ball.
  if (S.starList.length) {
    S.starList[0].vx = 0.25;
    S.starList[0].vy = 0.25;
  }
};

/* #endregion 4) INIT */



/*======================================================================
 * #region 5) RESIZE + ANIMATION LOOP
 *====================================================================*/

/* GROUP: Resize canvas + recompute scaling */
// Resize canvas, recompute scaling, and rescale stars to match new viewport.
// Width/height come from Setup (the worker has no window.innerWidth).
S.resizeStarfieldCanvas = function resizeStarfieldCanvas(WIDTH, HEIGHT) {

  // Bail if canvas isn't active so we don't work with null refs.
  if (!S.isCanvasReady) return;

  /* GROUP: Capture old state for rescale */
  const OLD_WIDTH = S.canvasWidth;
  const OLD_HEIGHT = S.canvasHeight;
  const OLD_SCREEN_PERIMETER = S.screenPerimeter || 1;

  /* GROUP: Read new viewport size */
  S.canvasWidth = WIDTH || 0;
  S.canvasHeight = HEIGHT || 0;

  /* GROUP: Resize canvas backing store */
  // On an OffscreenCanvas this also resizes the on-page <canvas> it came from.
  S.constellationCanvas.width = S.canvasWidth;
  S.constellationCanvas.height = S.canvasHeight;

  /* GROUP: Recompute scaling helpers */
  S.screenPerimeter = S.canvasWidth + S.canvasHeight;
  S.screenScaleUp = Math.pow(S.screenPerimeter / 1200, 0.35);
  S.screenScaleDown = Math.pow(1200 / S.screenPerimeter, 0.35);

  /* GROUP: Recompute caps */
  S.starCountLimit = Math.min(400, S.screenScaleUp * 80);
  S.maxLinkDistance = S.screenScaleUp ** 6.5 * 275;
  S.goalLinkDistance = S.maxLinkDistance;

  /* GROUP: Recompute physics scaling powers */
  S.screenScalePowers.attractionGradient = 5.51 * S.screenScaleUp ** 0.5;
  S.screenScalePowers.repulsionGradient = 2.8 * S.screenScaleUp ** 0.66;
  S.screenScalePowers.attractionShape = 0.48 * S.screenScaleDown ** 8.89;
  S.screenScalePowers.repulsionShape = 0.64;
  S.screenScalePowers.attractionForce = 0.0053 * S.screenScaleDown ** 6.46;
  S.screenScalePowers.repulsionForce = 0.0171 * S.screenScaleDown ** 0.89;
  S.screenScalePowers.forceClamp = S.screenScaleUp ** 1.8;

  /* GROUP: Rescale existing stars */
  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0 && S.starList.length) {

    const SCALE_X = S.canvasWidth / OLD_WIDTH;
    const SCALE_Y = S.canvasHeight / OLD_HEIGHT;
    const SIZE_SCALE = S.screenPerimeter / OLD_SCREEN_PERIMETER;

    for (const STAR of S.starList) {
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SIZE_SCALE;
    }
  }
};

/* GROUP: Frame scheduling */
// requestAnimationFrame exists in modern workers; fall back to a ~60fps timer if not.
function requestFrame(CALLBACK) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(CALLBACK);
  return setTimeout(() => CALLBACK(S.getNowMs()), SIXTY_FPS_FRAME_MS);
}

/* GROUP: Snapshots for saving */
// How often to send Setup a fresh copy of the stars. Setup keeps the latest one so it can
// save synchronously on pagehide (it can't wait for a worker reply while the page unloads).
const SNAPSHOT_INTERVAL_MS = 500;

// Send current stars + meta to Setup, which writes them to localStorage.
function postSnapshot() {
  if (!S.hasStarsInitialized) return;

  postToMain({
    type: "SNAPSHOT",
    stars: S.starList,
    meta: {

      /* CANVAS SIZE */
      // Save canvas width so we can rescale X later on restore.
      width: S.canvasWidth,

      // Save canvas height so we can rescale Y later on restore.
      height: S.canvasHeight,

      /* POINTER + TIMERS */
      // Save poke timer so poke resumes smoothly after reload.
      pokeTimer: S.pokeImpulseTimer,

      // Save pointer speed so interaction “energy” resumes smoothly.
      userSpeed: S.pointerSpeedUnits,

      // Save pointer X so ring resumes at correct position.
      userX: S.pointerClientX,

      // Save pointer Y so ring resumes at correct position.
      userY: S.pointerClientY,

      // Save pointer time baseline (legacy/optional field).
      userTime: S.lastPointerTimeMs,

      // Save ring timer so ring resumes smoothly.
      ringTimer: S.pointerRingTimer
    }
  });
}

/* GROUP: Animation loop */
// Main animation loop that runs physics + render each frame.
function runAnimationLoop() {

  if (!S.isCanvasReady) return;

  if (S.isFrozen) {
    requestFrame(runAnimationLoop);
    return;
  }

  S.updateStarPhysics();
  S.renderStarsAndLinks();

  // Periodically hand Setup a copy of the stars for saving.
  const NOW_MS = S.getNowMs();
  if (NOW_MS - S.lastSnapshotMs > SNAPSHOT_INTERVAL_MS) {
    S.lastSnapshotMs = NOW_MS;
    postSnapshot();
  }

  requestFrame(runAnimationLoop);
}

/* GROUP: Canvas usability check */
// Return true when canvas size is stable enough to run starfield.
function isCanvasSizeUsable() {
  return (
    Number.isFinite(S.canvasWidth) &&
    Number.isFinite(S.canvasHeight) &&
    S.canvasWidth > 50 &&
    S.canvasHeight > 50
  );
}

/* GROUP: Start once the canvas is usable */
// Called after INIT and after every RESIZE; does nothing until the size is usable.
function startEngineIfReady() {

  if (!S.isCanvasReady || !isCanvasSizeUsable()) return;

  /* GROUP: Stars init */
  if (!S.hasStarsInitialized) {
    S.hasStarsInitialized = true;
    S.restoreOrCreateStars(S.pendingSave);
    S.pendingSave = null;
  }

  /* GROUP: Start loop */
  if (!S.hasAnimationLoopStarted) {
    S.hasAnimationLoopStarted = true;
    requestFrame(runAnimationLoop);
  }
}

/* #endregion 5) RESIZE + ANIMATION LOOP */



/*======================================================================
 * #region 6) MESSAGES
 *====================================================================*/

/* =========================================================
 * Engine message handler
 * Everything from the page arrives here: Setup forwards pointer, resize,
 * slider and freeze events; Keyboard Starfield forwards key impulses.
 * ========================================================= */
function handleMainMessage(MESSAGE) {
  const { type, x, y, time, width, height, canvas } = MESSAGE;

  switch (type) {
    case "INIT":
      // Take ownership of the canvas and the saved state, then start once sized.
      S.constellationCanvas = canvas;
      S.drawingContext = canvas ? canvas.getContext("2d") : null;
      S.isCanvasReady = !!S.drawingContext;
      if (!S.isCanvasReady) console.warn("Starfield engine: no 2D context; starfield disabled.");

      Object.assign(S.interactionSettings, MESSAGE.settings);
      S.wantsDebug = !!MESSAGE.wantsDebug;
      S.pendingSave = MESSAGE.saved || null;

      S.resizeStarfieldCanvas(width, height);
      startEngineIfReady();
      break;

    case "RESIZE":
      S.resizeStarfieldCanvas(width, height);
      startEngineIfReady();
      break;

    case "POINTER_DOWN":
      S.beginPointerInteraction(x, y, time);
      break;

    case "POINTER_MOVE":
      S.updatePointerSpeed(x, y, time);
      break;

    case "KEYBOARD":
      // Merge this key's impulse; physics consumes and resets it next frame.
      Object.assign(KEYBOARD, MESSAGE.impulse);
      break;

    case "SETTINGS":
      Object.assign(S.interactionSettings, MESSAGE.settings);
      break;

    case "FREEZE":
      S.isFrozen = !!MESSAGE.frozen;
      // Send a fresh snapshot right away so the save on leave is up to date.
      if (S.isFrozen) postSnapshot();
      break;

    case "INVERT_DRIFT":
      // Immediately flips base drift velocity for every star (permanent, not an impulse).
      for (const STAR of S.starList) {
        STAR.vx = -STAR.vx; // Invert X drift
        STAR.vy = -STAR.vy; // Invert Y drift
      }
      break;

    case "REBUILD_LINKS":
      // Forces links to disappear and fade back in over time.
      S.linkRebuildTimer = 300;
      break;
  }
}

/* GROUP: Wire the handler */
// Worker: listen for postMessage. Fallback: give Setup a direct function to call.
if (IS_WORKER) {
  self.onmessage = (EVENT) => handleMainMessage(EVENT.data);
} else if (self.STARFIELD) {
  self.STARFIELD.engineReceive = handleMainMessage;
}

/* #endregion 6) MESSAGES */

})(); // End STARFIELD_ENGINE
