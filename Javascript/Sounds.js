// Sounds: the site's crystal sound effects and its music (a quiet bed of soft, far-off twinkles, with a clearer few now
// and then), from Resources/Sounds/ (made by _tools/make-sounds.mjs). Every tap or click gets a sound by what it does:
//   - delete, off, cancel, close, sign out: a quick crystal shatter
//   - yes, save, add, on, sign in: one twinkling ding
//   - any other button: a small, gentle twinkle
//   - going to another page: a crystal rolling across other crystals (Layout.js plays it as the page slides out)
//   - anything else (a day, a box, a list): a soft shimmer that's easy to miss
// Settings turns music and sound effects on or off for this device (both on to start). Browsers only let a page play
// sound after a tap, so nothing plays before the first one. On an iPhone they mix with the person's own audio instead of
// stopping it (and the silent switch silences them). Something that takes the speaker (a call) pauses them, and the
// next tap plays them again.

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
  const VOLUMES = { twinkle: 0.16, ding: 0.24, shatter: 0.2, transition: 0.2, soft: 0.08, ambient: 0.018 };
  const MASTER_VOLUME = 0.8;
  // Music, on the signed-in pages: a quiet bed of far-off twinkles, one every AMBIENT_BED_MIN_S to AMBIENT_BED_MAX_S
  // seconds (each about 2.6 seconds long, so they run together), at AMBIENT_BED_SHARE of the music's volume, lower and
  // softer; and now and then (every AMBIENT_MIN_S to AMBIENT_MAX_S seconds) a clearer few, at the music's own volume
  const AMBIENT_MIN_S = 7;
  const AMBIENT_MAX_S = 18;
  const AMBIENT_BED_MIN_S = 1.4;
  const AMBIENT_BED_MAX_S = 3.2;
  const AMBIENT_BED_SHARE = 0.3;
  const AMBIENT_BED_LOWPASS = 3800; // Hz: the bed's twinkles sound farther off
  const MUSIC_PAGES = ["home", "recurring", "accounts", "bob", "menu", "spreadsheets", "calculator", "logs", "business", "settings", "snapshot"];

  // This device's choices (Settings)
  const EFFECTS_KEY = "prismal_sound_effects"; // "off" when turned off
  const MUSIC_KEY = "prismal_music";           // "off" when turned off

  const read = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  };

  const effectsOn = () => read(EFFECTS_KEY) !== "off";
  const musicOn = () => read(MUSIC_KEY) !== "off" && MUSIC_PAGES.includes(window.PAGE) && !window.PUBLIC_PAGE;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
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

  // The audio context, started in a tap (browsers start one only from a tap), with the effects' sounds made ready the
  // first time. On an iPhone the page's audio is "ambient", so it mixes with other audio instead of stopping it, and the
  // silent switch silences it.
  let effectsLoading = false;
  function ensureContext() {
    if (!makeContext()) return null;
    if (!effectsLoading) {
      effectsLoading = true;
      Object.values(FILES).flat().filter(name => !name.startsWith("Ambient")).forEach(loadSound);
    }
    if (context.state !== "running") {
      const resumed = context.resume();
      if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
    }
    return context;
  }

  // The context itself, not started yet (null where the browser has none)
  function makeContext() {
    if (context) return context;
    if (!AudioContextClass) return null;
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
    return context;
  }

  // Making the context can take a moment on a slow device, and made in the first tap, it held up that tap's own work (like
  // zooming a day) until it was done. So it's made ahead, a moment after the page has loaded and while nothing else is
  // happening (when sound is on), and a tap only starts it. (Chrome's console notes it can't start before a tap: expected.)
  if (AudioContextClass) {
    const early = () => {
      if (!context && (effectsOn() || musicOn()) && document.visibilityState === "visible") makeContext();
    };
    const whenIdle = typeof window.requestIdleCallback === "function" ? (fn) => window.requestIdleCallback(fn, { timeout: 5000 }) : (fn) => setTimeout(fn, 0);
    const soon = () => setTimeout(() => whenIdle(early), 2000);
    if (document.readyState === "complete") soon();
    else window.addEventListener("load", soon, { once: true });
  }

  // The music starts once the audio is playing (right away when it is, or when it starts: a tap's resume takes a moment)
  let musicWaiting = false;
  function startMusicWhenRunning() {
    if (!context) return;
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

  function suspend() {
    if (!context || context.state === "closed") return;
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

  // lowpass: a frequency (Hz) above which it's softened, for a sound that's farther off
  function startSound(sound, gainValue, rate, pan, lowpass = 0) {
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    let last = gain;
    if (lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      last.connect(filter);
      last = filter;
    }
    if (pan && typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      last.connect(panner);
      last = panner;
    }
    source.connect(gain);
    last.connect(master);
    source.start(0, sound.start);
  }

  /* ---------- Music ---------- */
  // Two timers: the quiet bed, and the clearer twinkles now and then. Each stops by itself when the music can't play
  // (it's off, the page is off the screen, or the audio isn't running), and the next tap starts them again.
  const musicTimers = { bed: 0, now: 0 };
  const PLAYING = -1; // A loop's timer while its sound loads
  const canPlayMusic = () => musicOn() && !!context && context.state === "running" && document.visibilityState === "visible";
  const randomBetween = (low, high) => low + Math.random() * (high - low);

  // (Each loop starts unless it's already going: one can stop a few seconds before the other)
  function startMusic() {
    if (!canPlayMusic()) return;
    FILES.ambient.forEach(loadSound);
    // (While a sound loads, its loop is still running: PLAYING. stopMusic in the meantime ends it.)
    const loop = (timer, minS, maxS, play) => {
      musicTimers[timer] = setTimeout(async () => {
        if (!canPlayMusic()) {
          musicTimers[timer] = 0;
          return;
        }
        musicTimers[timer] = PLAYING;
        const sound = await loadSound(FILES.ambient[Math.floor(Math.random() * FILES.ambient.length)]);
        if (musicTimers[timer] !== PLAYING) return;
        if (sound && context.state === "running") play(sound);
        loop(timer, minS, maxS, play);
      }, randomBetween(minS, maxS) * 1000);
    };
    if (!musicTimers.bed) {
      loop("bed", AMBIENT_BED_MIN_S, AMBIENT_BED_MAX_S, (sound) =>
        startSound(sound, VOLUMES.ambient * AMBIENT_BED_SHARE * randomBetween(0.7, 1.1), randomBetween(0.78, 1.02), randomBetween(-0.8, 0.8), AMBIENT_BED_LOWPASS));
    }
    if (!musicTimers.now) {
      loop("now", AMBIENT_MIN_S, AMBIENT_MAX_S, (sound) =>
        startSound(sound, VOLUMES.ambient * randomBetween(0.6, 1.1), randomBetween(0.96, 1.04), randomBetween(-0.6, 0.6)));
    }
  }

  function stopMusic() {
    clearTimeout(musicTimers.bed);
    clearTimeout(musicTimers.now);
    musicTimers.bed = musicTimers.now = 0;
  }

  // Off the screen, nothing plays; back on it, it starts again at the next tap
  document.addEventListener("visibilitychange", () => {
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

  /* ---------- An alarm (a calendar entry's alert with its Alarm switch on: sw.js and Layout.js) ---------- */
  // A loud crystalline chime, made here rather than from a file: five bell-like notes rising (each a few ringing partials,
  // the way struck glass rings), with a shimmering echo, again every ALARM_EVERY_MS, a little louder each time, until it's
  // stopped. It rings whatever Settings says about sound effects (it was asked for), and on an iPhone it plays even with the
  // silent switch on while it rings (its audio session is "playback" then, and "ambient" again after). Browsers only start
  // sound after a tap, so on a page that hasn't had one yet it starts with the next.
  const ALARM_NOTES = [1318.5, 1661.2, 1975.5, 2489.0, 2637.0]; // E6, G#6, B6, D#7, E7
  const ALARM_PARTIALS = [[1, 1, 1.8], [2.76, 0.45, 1], [5.4, 0.22, 0.55], [8.93, 0.1, 0.3]]; // [ratio, share, seconds]
  const ALARM_EVERY_MS = 2400;
  let alarm = null; // { out, timer, level, nodes } while it rings

  // One ring of the chime, at a level (0 to 1)
  function ringOnce(level) {
    const now = context.currentTime + 0.02;
    ALARM_NOTES.forEach((frequency, index) => {
      const at = now + index * 0.16;
      for (const [ratio, share, seconds] of ALARM_PARTIALS) {
        const tone = context.createOscillator();
        tone.type = "sine";
        tone.frequency.value = frequency * ratio * (1 + (Math.random() - 0.5) * 0.003);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * share), at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
        tone.connect(gain);
        gain.connect(alarm.out);
        tone.start(at);
        tone.stop(at + seconds + 0.05);
      }
    });
  }

  // Start ringing; true when it can be heard now (false: the page needs a tap first)
  function startAlarm() {
    const ctx = ensureContext();
    if (!ctx) return false;
    if (alarm) return ctx.state === "running";
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch (e) {}
    // (Its notes, and a fading echo of them, through a compressor so the loudest rings don't distort)
    const out = ctx.createGain();
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const limiter = ctx.createDynamicsCompressor();
    out.connect(limiter);
    out.connect(echo);
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(limiter);
    limiter.connect(ctx.destination);
    alarm = { out, timer: 0, level: 0.25, nodes: [out, echo, feedback, limiter] };
    const ring = () => {
      if (!alarm) return;
      if (ctx.state === "running") {
        ringOnce(alarm.level);
        alarm.level = Math.min(0.6, alarm.level * 1.2);
      }
    };
    // (A tap starts the sound on a page that hasn't had one yet)
    const resume = () => {
      if (alarm && ctx.state !== "running") ctx.resume().catch(() => {});
    };
    alarm.resume = resume;
    ["pointerdown", "keydown"].forEach(type => document.addEventListener(type, resume, { passive: true, capture: true }));
    ring();
    alarm.timer = setInterval(ring, ALARM_EVERY_MS);
    return ctx.state === "running";
  }

  // Stop ringing
  function stopAlarm() {
    if (!alarm) return;
    clearInterval(alarm.timer);
    ["pointerdown", "keydown"].forEach(type => document.removeEventListener(type, alarm.resume, { capture: true }));
    for (const node of alarm.nodes) {
      try { node.disconnect(); } catch (e) {}
    }
    alarm = null;
    try {
      if (navigator.audioSession) navigator.audioSession.type = "ambient";
    } catch (e) {}
  }

  /* ---------- For Settings and Layout.js ---------- */
  window.Sounds = {
    play,
    startAlarm,
    stopAlarm,
    alarmRinging: () => !!alarm,
    // The page slides out to another one (skipped when the tap that started it just made its own sound)
    playTransition() {
      if (Date.now() - lastTapSound < 300) return;
      play("transition", { detune: false });
    },
    effectsOn,
    musicOn: () => read(MUSIC_KEY) !== "off",
    setEffects(on) { write(EFFECTS_KEY, on ? null : "off"); },
    setMusic(on) {
      write(MUSIC_KEY, on ? null : "off");
      if (on) startMusicWhenRunning();
      else stopMusic();
    }
  };
})();
