// thank heavens for chatGPT <3
// Keyboard-driven impulse controller for the Starfield engine.
// This file translates discrete key presses into one-frame forces
// and sends them to the engine (Active Starfield, in a worker) as KEYBOARD messages.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) SETUP
 *     - Keyboard alias
 *     - Keydown listener
 *     - Key → action dispatch table
 *
 *  2) GLOBAL MOVEMENT
 *     - Directional impulse nudges (WASD + diagonals)
 *
 *  3) QUADRANT MAGNETISM
 *     - Screen-space magnetic attractors (3×3 grid)
 *
 *  4) PONG
 *     - Paddle movement + visibility timer
 *
 *  5) OTHERS
 *     - Speed scaling
 *     - Orbit mode
 *     - Passive inversion
 *     - Link rebuild trigger
 *====================================================================*/


/*======================================================================
 * #region 1) SETUP
 *====================================================================*/

/* GROUP: Engine bridge */
// The engine runs in a worker and can't see this page's objects,
// so each key sends only the fields it changes. The engine merges them
// into its KEYBOARD object and clears the one-shot ones after a frame.
var S = window.STARFIELD;

// Send an impulse patch (ex: { addY: -1 }) to the engine.
function SEND_IMPULSE(IMPULSE) {
  S.sendToEngine({ type: "KEYBOARD", impulse: IMPULSE });
}

/* GROUP: Keydown listener */
// Listen globally so keyboard input works regardless of focus,
// unless the browser explicitly suppresses it.
window.addEventListener("keydown", (EVENT) => {

  // Ignore IME composition events (important for non-Latin keyboards).
  // Prevents accidental impulses while typing.
  if (EVENT.isComposing) return;

  // Normalize key to lowercase and dispatch if mapped.
  // Optional chaining keeps unknown keys harmless.
  KEY_FUNCTIONS[EVENT.key.toLowerCase()]?.();
});

/* GROUP: Key → action dispatch table */
// Maps physical keys to semantic actions.
// Each action sends impulses to the engine's KEYBOARD,
// which are then applied exactly once in the physics step.
const KEY_FUNCTIONS = {

  /* GROUP: GLOBAL MOVEMENT */
  // Cardinal directions
  w: () => RUN_W(), // Up
  a: () => RUN_A(), // Left
  s: () => RUN_S(), // Down
  d: () => RUN_D(), // Right

  // Diagonals
  q: () => RUN_Q(), // Up-left
  e: () => RUN_E(), // Up-right
  z: () => RUN_Z(), // Down-left
  x: () => RUN_X(), // Down-right

  /* GROUP: QUADRANT MAGNETISM */
  // 3×3 screen grid magnets (percent-based)
  y: () => RUN_Y(), // Top-left
  u: () => RUN_U(), // Top-center
  i: () => RUN_I(), // Top-right

  h: () => RUN_H(), // Middle-left
  j: () => RUN_J(), // Middle-center
  k: () => RUN_K(), // Middle-right

  b: () => RUN_B(), // Bottom-left
  n: () => RUN_N(), // Bottom-center
  m: () => RUN_M(), // Bottom-right

  /* GROUP: PONG */
  r: () => RUN_R(), // Paddle left
  t: () => RUN_T(), // Paddle right
  f: () => RUN_F(), // Paddle up
  c: () => RUN_C(), // Paddle down

  /* GROUP: OTHERS */
  v: () => RUN_V(), // Reduce velocity
  g: () => RUN_G(), // Increase velocity
  o: () => RUN_O(), // Orbit mode
  p: () => RUN_P(), // Passive drift inversion
  l: () => RUN_L()  // Link rebuild / shatter
};

/* #endregion 1) SETUP */


/*======================================================================
 * #region 2) GLOBAL MOVEMENT
 *====================================================================*/

/* GROUP: Cardinal impulses */
// These functions apply small additive impulses.
// They do NOT move stars directly.
// Active Starfield consumes and clears them next frame.

// W = Up
function RUN_W() {
  // Apply upward impulse in screen space.
  SEND_IMPULSE({ addY: -1 });
}

// A = Left
function RUN_A() {
  // Apply leftward impulse in screen space.
  SEND_IMPULSE({ addX: -1 });
}

// S = Down
function RUN_S() {
  // Apply downward impulse in screen space.
  SEND_IMPULSE({ addY: 1 });
}

// D = Right
function RUN_D() {
  // Apply rightward impulse in screen space.
  SEND_IMPULSE({ addX: 1 });
}

/* GROUP: Diagonal impulses */
// Diagonals are intentionally weaker to preserve total impulse magnitude.

// Q = Up-left
function RUN_Q() {
  SEND_IMPULSE({ addX: -0.5, addY: -0.5 }); // Left + up components
}

// E = Up-right
function RUN_E() {
  SEND_IMPULSE({ addX: 0.5, addY: -0.5 });  // Right + up components
}

// Z = Down-left
function RUN_Z() {
  SEND_IMPULSE({ addX: -0.5, addY: 0.5 });  // Left + down components
}

// X = Down-right
function RUN_X() {
  SEND_IMPULSE({ addX: 0.5, addY: 0.5 });   // Right + down components
}

/* #endregion 2) GLOBAL MOVEMENT */


/*======================================================================
 * #region 3) QUADRANT MAGNETISM
 *====================================================================*/

/* GROUP: Screen-space magnetic targets */
// These set magnetX / magnetY in percent-of-screen space.
// Active Starfield converts these into canvas coordinates
// and applies attraction + orbit forces.

// Y = Top-left
function RUN_Y() {
  SEND_IMPULSE({ magnetX: 16.5, magnetY: 16.5 }); // Near left, near top
}

// U = Top-center
function RUN_U() {
  SEND_IMPULSE({ magnetX: 50, magnetY: 16.5 });   // Center horizontally, near top
}

// I = Top-right
function RUN_I() {
  SEND_IMPULSE({ magnetX: 83.5, magnetY: 16.5 }); // Near right, near top
}

// H = Middle-left
function RUN_H() {
  SEND_IMPULSE({ magnetX: 16.5, magnetY: 50 });
}

// J = Middle-center
function RUN_J() {
  SEND_IMPULSE({ magnetX: 50, magnetY: 50 });
}

// K = Middle-right
function RUN_K() {
  SEND_IMPULSE({ magnetX: 83.5, magnetY: 50 });
}

// B = Bottom-left
function RUN_B() {
  SEND_IMPULSE({ magnetX: 16.5, magnetY: 83.5 });
}

// N = Bottom-center
function RUN_N() {
  SEND_IMPULSE({ magnetX: 50, magnetY: 83.5 });
}

// M = Bottom-right
function RUN_M() {
  SEND_IMPULSE({ magnetX: 83.5, magnetY: 83.5 });
}

/* #endregion 3) QUADRANT MAGNETISM */


/*======================================================================
 * #region 4) PONG
 *====================================================================*/

/* GROUP: Paddle impulses */
// These control the paddles overlay and the special “ball star”.
// paddlesTimer controls visibility fade-out.

// Paddle position is tracked here so relative nudges can be sent as absolute values.
// Clamped to 0..100 (percent space), same as the engine's render clamp.
const PADDLES = { x: 50, y: 50 };

// Shift paddles and make them visible.
function NUDGE_PADDLES(DX, DY) {
  PADDLES.x = Math.max(0, Math.min(100, PADDLES.x + DX));
  PADDLES.y = Math.max(0, Math.min(100, PADDLES.y + DY));

  SEND_IMPULSE({
    paddlesTimer: 50,     // Make paddles visible
    paddlesX: PADDLES.x,
    paddlesY: PADDLES.y
  });
}

// R = Paddle left
function RUN_R() {
  NUDGE_PADDLES(-1, 0);
}

// T = Paddle right
function RUN_T() {
  NUDGE_PADDLES(1, 0);
}

// F = Paddle up
function RUN_F() {
  NUDGE_PADDLES(0, -1);
}

// C = Paddle down
function RUN_C() {
  NUDGE_PADDLES(0, 1);
}

/* #endregion 4) PONG */


/*======================================================================
 * #region 5) OTHERS
 *====================================================================*/

/* GROUP: Velocity scaling */
// These multiply implied velocity during the next physics step.

// V = Reduce speed
function RUN_V() {
  SEND_IMPULSE({ multX: 0.6, multY: 0.6 }); // Horizontal + vertical slowdown
}

// G = Increase speed
function RUN_G() {
  SEND_IMPULSE({ multX: 1.7, multY: 1.7 }); // Horizontal + vertical boost
}

/* GROUP: Orbit mode */
// Enables pointer-centered magnetism.
// Active Starfield reads this and clears it every frame.
function RUN_O() {
  SEND_IMPULSE({ magnetPointer: true });
}

/* GROUP: Passive drift inversion */
// Immediately flips base drift velocity for every star.
// This is a permanent change, not an impulse (the engine owns the stars, so it does the flip).
function RUN_P() {
  S.sendToEngine({ type: "INVERT_DRIFT" });
}

/* GROUP: Link rebuild trigger */
// Forces links to disappear and fade back in over time.
function RUN_L() {
  S.sendToEngine({ type: "REBUILD_LINKS" });
}

/* #endregion 5) OTHERS */

// GPT Joke: If the keyboard were a spaceship, these functions are the tiny thrusters.
// Not enough to warp-drive, but plenty to bonk a star into the next zip code. 🚀
