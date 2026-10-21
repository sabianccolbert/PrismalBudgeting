// Sounds: the site's crystal sound effects and its music (now and then a few soft, far-off twinkles), from
// Resources/Sounds/ (made by _tools/make-sounds.mjs). Every tap or click gets a sound by what it does:
//   - delete, off, cancel, close, sign out: a quick crystal shatter
//   - yes, save, add, on, sign in: one twinkling ding
//   - any other button: a small, gentle twinkle
//   - going to another page: a crystal rolling across other crystals (Layout.js plays it as the page slides out)
//   - anything else (a day, a box, a list): a soft shimmer that's easy to miss
// Settings turns music and sound effects on or off for this device (both on to start). Browsers only let a page play
// sound after a tap, so nothing plays before the first one. Sounds never get in the way of the person's own audio:
// on an iPhone they mix with it (and the silent switch silences them), and if anything interrupts them (another app's
// audio taking over, a call), they stop for the rest of the visit (this tab), so that audio can play on undisturbed.
// Settings can turn them back on.

(function sounds() {
  "use strict";

  const FILES = {
    twinkle: ["Twinkle1", "Twinkle2", "Twinkle3"],
    ding: ["Ding"],
    shatter: ["Shatter"],
    transition: ["Transition"],
    soft: ["Soft1", "Soft2"],
    ambient: ["Ambient1", "Ambient2", "Ambient3", "Ambient4", "Ambient5"]
  };
  // How loud each kind plays (the files are all made at about the same loudness)
  const VOLUMES = { twinkle: 0.16, ding: 0.24, shatter: 0.2, transition: 0.2, soft: 0.08, ambient: 0.1 };
  const MASTER_VOLUME = 0.8;
  // Music: a few far-off twinkles every AMBIENT_MIN_S to AMBIENT_MAX_S seconds, on the signed-in pages
  const AMBIENT_MIN_S = 7;
  const AMBIENT_MAX_S = 18;
  const MUSIC_PAGES = ["home", "recurring", "history", "accounts", "menu", "spreadsheets", "tracker", "calculator", "logs", "settings"];

  // This device's choices (Settings), and this visit's pause after an interruption
  const EFFECTS_KEY = "prismal_sound_effects"; // "off" when turned off
  const MUSIC_KEY = "prismal_music";           // "off" when turned off
  const PAUSED_KEY = "prismal_sounds_paused";  // In this tab's session storage: "1" after an interruption

  const read = (storage, key) => { try { return window[storage].getItem(key); } catch (e) { return null; } };
  const write = (storage, key, value) => {
    try {
      if (value === null) window[storage].removeItem(key);
      else window[storage].setItem(key, value);
    } catch (e) {}
  };

  const paused = () => read("sessionStorage", PAUSED_KEY) === "1";
  const effectsOn = () => read("localStorage", EFFECTS_KEY) !== "off" && !paused();
  const musicOn = () => read("localStorage", MUSIC_KEY) !== "off" && !paused() && MUSIC_PAGES.includes(window.PAGE) && !window.PUBLIC_PAGE;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let ourSuspend = false;    // The page suspended it itself (hidden, or paused): not an interruption
  let lastVisibleChange = 0; // When the page was last hidden or shown (an interruption right then is the page leaving the screen)
  const fileData = new Map(); // name -> Promise of its bytes
  const buffers = new Map();  // name -> Promise of { buffer, start (where the sound starts: an MP3 begins with a little silence) }

  // The bytes of a file, fetched once (at its fingerprinted address, so a browser keeps it)
  function fetchFile(name) {
    if (!fileData.has(name)) {
      const path = `/Resources/Sounds/${name}.mp3`;
      const address = typeof window.assetUrl === "function" ? window.assetUrl(path) : path;
      fileData.set(name, fetch(address).then(response => (response.ok ? response.arrayBuffer() : null)).catch(() => null));
    }
    return fileData.get(name);
  }

  // A file decoded, ready to play (null when it can't be)
  function loadSound(name) {
    if (!buffers.has(name)) {
      buffers.set(name, fetchFile(name).then(data => {
        if (!data || !context) return null;
        return new Promise(resolve => {
          // (Safari's older decodeAudioData only takes callbacks)
          const done = (buffer) => resolve(buffer ? { buffer, start: soundStart(buffer) } : null);
          const promise = context.decodeAudioData(data.slice(0), done, () => resolve(null));
          if (promise && typeof promise.catch === "function") promise.catch(() => resolve(null));
        });
      }));
    }
    return buffers.get(name);
  }

  // Where a decoded sound starts (seconds), past the MP3's silence at the front
  function soundStart(buffer) {
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > 0.01) return Math.max(0, i - 32) / buffer.sampleRate;
    return 0;
  }

  // The audio context, made in a tap (browsers start one only from a tap). On an iPhone the page's audio is "ambient",
  // so it mixes with other audio instead of stopping it, and the silent switch silences it.
  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) {
      try {
        if (navigator.audioSession) navigator.audioSession.type = "ambient";
      } catch (e) {}
      try {
        context = new AudioContextClass();
      } catch (e) {
        return null;
      }
      master = context.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(context.destination);
      context.addEventListener("statechange", noticeInterruption);
      Object.values(FILES).flat().filter(name => !name.startsWith("Ambient")).forEach(loadSound);
    }
    if (context.state !== "running" && !paused()) {
      ourSuspend = false;
      const resumed = context.resume();
      if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
    }
    return context;
  }

  // The music starts once the audio is playing (right away when it is, or when it starts: a tap's resume takes a moment)
  let musicWaiting = false;
  function startMusicWhenRunning() {
    if (!context || paused()) return;
    if (context.state === "running") {
      startMusic();
      return;
    }
    if (musicWaiting) return;
    musicWaiting = true;
    context.addEventListener("statechange", function started() {
      if (context.state !== "running") return;
      context.removeEventListener("statechange", started);
      musicWaiting = false;
      startMusic();
    });
  }

  // Something else took the speaker while the page was on the screen (another app's audio, a call): sounds stop for the
  // rest of this visit, so that audio isn't interrupted again
  function noticeInterruption() {
    if (!context || ourSuspend || context.state === "running") return;
    if (document.visibilityState !== "visible" || Date.now() - lastVisibleChange < 1500) return;
    if (context.state === "interrupted" || context.state === "suspended") pauseForVisit();
  }
  try {
    navigator.audioSession?.addEventListener?.("statechange", () => {
      if (navigator.audioSession.state === "interrupted" && document.visibilityState === "visible" && Date.now() - lastVisibleChange >= 1500) pauseForVisit();
    });
  } catch (e) {}

  // Stop everything for this visit (Settings can turn sounds back on)
  function pauseForVisit() {
    write("sessionStorage", PAUSED_KEY, "1");
    stopMusic();
    suspend();
  }

  function suspend() {
    if (!context || context.state === "closed") return;
    ourSuspend = true;
    const suspended = context.suspend();
    if (suspended && typeof suspended.catch === "function") suspended.catch(() => {});
  }

  // Play a kind of sound. options: { volume (times the kind's own), detune (a little higher or lower: up to ±3%) }
  async function play(kind, { volume = 1, detune = true } = {}) {
    const names = FILES[kind];
    if (!names || !effectsOn() || document.visibilityState !== "visible") return;
    const ctx = ensureContext();
    if (!ctx) return;
    const sound = await loadSound(names[Math.floor(Math.random() * names.length)]);
    if (!sound || ctx.state !== "running") return;
    startSound(sound, VOLUMES[kind] * volume, detune ? 0.97 + Math.random() * 0.06 : 1, 0);
  }

  function startSound(sound, gainValue, rate, pan) {
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    let last = gain;
    if (pan && typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      last = panner;
    }
    source.connect(gain);
    last.connect(master);
    source.start(0, sound.start);
  }

  /* ---------- Music ---------- */
  let musicTimer = 0;

  function startMusic() {
    if (musicTimer || !musicOn() || !context || context.state !== "running" || document.visibilityState !== "visible") return;
    FILES.ambient.forEach(loadSound);
    const next = () => {
      musicTimer = setTimeout(async () => {
        musicTimer = 0;
        if (!musicOn() || !context || context.state !== "running" || document.visibilityState !== "visible") return;
        const sound = await loadSound(FILES.ambient[Math.floor(Math.random() * FILES.ambient.length)]);
        if (sound && context.state === "running") startSound(sound, VOLUMES.ambient * (0.6 + Math.random() * 0.5), 0.96 + Math.random() * 0.08, Math.random() * 1.2 - 0.6);
        next();
      }, (AMBIENT_MIN_S + Math.random() * (AMBIENT_MAX_S - AMBIENT_MIN_S)) * 1000);
    };
    next();
  }

  function stopMusic() {
    clearTimeout(musicTimer);
    musicTimer = 0;
  }

  // Off the screen, nothing plays (and it isn't an interruption); back on it, it starts again at the next tap
  document.addEventListener("visibilitychange", () => {
    lastVisibleChange = Date.now();
    if (document.visibilityState === "hidden") {
      stopMusic();
      suspend();
    }
  });

  /* ---------- Which sound a tap gets ---------- */
  const OFF_WORDS = /^(delete|remove|cancel|close|×|✕|turn( icons)? off|off|sign out|log ?out|no( thanks)?|not now|clear|dismiss|forget|stop|discard)\b/i;
  const ON_WORDS = /^(save|add|ok|okay|yes|turn on|turn it on|on|connect|confirm|done|create|sign in|send|accept|use these|open spreadsheet|apply|start|resume|keep|copy)\b/i;
  let lastTapSound = 0;

  // The sound for something tapped (null for none: a link to another page sounds as it slides out, see Layout.js)
  function soundFor(target) {
    if (!target || !target.closest) return null;
    if (target.closest("label.checkboxField, input.pillSwitch")) return null; // (Its change sounds, below)
    const link = target.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href") || "";
      if (href === "logout" || link.id === "logoutButton") return "shatter";
      if (href.startsWith("#") || href.startsWith("mailto:") || link.target === "_blank") return "twinkle";
      return null;
    }
    const button = target.closest("button, [role='button'], .lineEntry, .upcomingButton");
    if (button) {
      const words = (button.getAttribute("aria-label") || button.textContent || "").trim();
      if (button.classList.contains("danger") || button.classList.contains("panelClose") || OFF_WORDS.test(words)) return "shatter";
      if (button.classList.contains("cell-action-btn")) return "soft";
      if (button.classList.contains("primary") || ON_WORDS.test(words)) return "ding";
      return "twinkle";
    }
    if (target.closest("input, select, textarea, summary, label, .elastic-table td, .dataTable tr")) return "soft";
    return null;
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted || (!effectsOn() && !musicOn())) return;
    // (Any tap lets the page play sound: browsers only allow it from one. The music starts once it can.)
    ensureContext();
    const kind = soundFor(e.target);
    // One sound per tap (a label's tap also clicks its box)
    if (kind && Date.now() - lastTapSound >= 80) {
      lastTapSound = Date.now();
      play(kind);
    }
    startMusicWhenRunning();
  }, true);

  // A switch turned on dings, and turned off shatters
  document.addEventListener("change", (e) => {
    const box = e.target;
    if (!e.isTrusted || !box.matches || !box.matches("input.pillSwitch")) return;
    lastTapSound = Date.now();
    play(box.checked ? "ding" : "shatter");
  }, true);

  // The first touch or key fetches the effects' files, so they're ready by the time its click comes
  const warmUp = () => {
    if (effectsOn()) Object.values(FILES).flat().filter(name => !name.startsWith("Ambient")).forEach(fetchFile);
  };
  ["pointerdown", "keydown"].forEach(type => document.addEventListener(type, warmUp, { once: true, passive: true, capture: true }));

  /* ---------- For Settings and Layout.js ---------- */
  window.Sounds = {
    play,
    // The page slides out to another one (skipped when the tap that started it just made its own sound)
    playTransition() {
      if (Date.now() - lastTapSound < 300) return;
      play("transition", { detune: false });
    },
    effectsOn: () => read("localStorage", EFFECTS_KEY) !== "off",
    musicOn: () => read("localStorage", MUSIC_KEY) !== "off",
    paused,
    setEffects(on) { write("localStorage", EFFECTS_KEY, on ? null : "off"); },
    setMusic(on) {
      write("localStorage", MUSIC_KEY, on ? null : "off");
      if (on) startMusicWhenRunning();
      else stopMusic();
    },
    // Sounds paused for this visit (after an interruption) play again (from a tap, which lets the page play sound)
    resume() {
      write("sessionStorage", PAUSED_KEY, null);
      ensureContext();
      startMusicWhenRunning();
    }
  };
})();
