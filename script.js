const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  isPlaying: false,
  tempo: 120,
  volume: 0.7,
  currentSong: "twinkle",
  loadedFile: null,
  pressed: new Set(),
  sustain: false,
  sustained: new Set(),
  audio: {
    ctx: null,
    master: null,
    voices: new Map(), // midiNote -> {osc, gain}
  },
  midi: {
    access: null,
    input: null,
  },
};

const SONGS = {
  twinkle: { title: "Twinkle Twinkle Little Star", subtitle: "Traditional" },
  ode: { title: "Ode to Joy", subtitle: "Beethoven" },
  elise: { title: "Für Elise", subtitle: "Beethoven" },
  moonlight: { title: "Moonlight Sonata", subtitle: "Beethoven" },
};

const KEYBOARD = {
  start: 48, // C3
  end: 72, // C5
};

const PC_LABELS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const IS_BLACK = (pc) => [1, 3, 6, 8, 10].includes(pc);

function midiToName(n) {
  const pc = n % 12;
  const oct = Math.floor(n / 12) - 1;
  return `${PC_LABELS[pc]}${oct}`;
}

function midiToFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function toast(msg) {
  const el = $("#toast");
  const msgEl = $("#toastMsg");
  msgEl.textContent = msg;
  el.classList.add("is-open");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-open"), 3200);
}

function setSong(id) {
  state.currentSong = id;
  const meta = SONGS[id] ?? { title: "Unknown", subtitle: "" };
  $("#scoreTitle").textContent = meta.title;
  $("#scoreSubtitle").textContent = meta.subtitle || "—";
  $$(".list__item").forEach((b) => b.classList.toggle("is-active", b.dataset.song === id));
}

function setFile(file) {
  state.loadedFile = file;
  const meta = $("#dropzoneMeta");
  const clearBtn = $("#clearFileBtn");

  if (!file) {
    meta.textContent = "No file selected";
    clearBtn.disabled = true;
    return;
  }

  meta.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
  clearBtn.disabled = false;

  $("#scoreTitle").textContent = file.name;
  $("#scoreSubtitle").textContent = "Loaded from your device (demo UI)";
}

function ensureAudio() {
  if (state.audio.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = state.volume;
  master.connect(ctx.destination);
  state.audio.ctx = ctx;
  state.audio.master = master;
}

async function resumeAudioIfNeeded() {
  ensureAudio();
  const ctx = state.audio.ctx;
  if (ctx.state !== "running") {
    await ctx.resume();
  }
}

function voiceStart(note, velocity = 0.8) {
  ensureAudio();
  const { ctx, master, voices } = state.audio;
  if (!ctx || !master) return;

  // Retrigger safely
  if (voices.has(note)) voiceStop(note, true);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const freq = midiToFreq(note);
  osc.type = "sine";
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  const amp = Math.max(0.02, Math.min(1, velocity)) * state.volume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(amp, now + 0.015);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);

  voices.set(note, { osc, gain });
}

function voiceStop(note, immediate = false) {
  const { ctx, voices } = state.audio;
  const v = voices.get(note);
  if (!v || !ctx) return;

  const now = ctx.currentTime;
  const release = immediate ? 0.01 : 0.14;
  try {
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    v.osc.stop(now + release + 0.02);
  } catch {
    // ignore double-stop
  }

  voices.delete(note);
}

function allNotesOff() {
  state.sustained.clear();
  state.pressed.clear();
  for (const note of [...state.audio.voices.keys()]) voiceStop(note, true);
  $$(".key").forEach((k) => k.classList.remove("is-down", "is-accent"));
  toast("All notes off");
}

function press(note, velocity = 0.85, { accent = false } = {}) {
  if (note < KEYBOARD.start || note > KEYBOARD.end) return;
  state.pressed.add(note);
  if (accent) state.sustained.delete(note);
  const el = $(`.key[data-note="${note}"]`);
  if (el) {
    el.classList.add("is-down");
    if (accent) el.classList.add("is-accent");
  }
  voiceStart(note, velocity);
}

function release(note) {
  if (note < KEYBOARD.start || note > KEYBOARD.end) return;
  state.pressed.delete(note);

  if (state.sustain) {
    state.sustained.add(note);
    return;
  }

  const el = $(`.key[data-note="${note}"]`);
  if (el) el.classList.remove("is-down", "is-accent");
  voiceStop(note);
}

function sustainSet(on) {
  state.sustain = on;
  if (!on) {
    // Release any sustained notes not currently held
    for (const note of [...state.sustained]) {
      if (!state.pressed.has(note)) {
        const el = $(`.key[data-note="${note}"]`);
        if (el) el.classList.remove("is-down", "is-accent");
        voiceStop(note);
      }
      state.sustained.delete(note);
    }
  }
}

function buildKeyboard() {
  const el = $("#keyboard");
  el.innerHTML = "";

  const whiteNotes = [];
  for (let n = KEYBOARD.start; n <= KEYBOARD.end; n++) {
    if (!IS_BLACK(n % 12)) whiteNotes.push(n);
  }

  const whiteW = 100 / whiteNotes.length;
  const blackW = whiteW * 0.62;

  // White keys
  whiteNotes.forEach((note, i) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key key--white";
    key.dataset.note = String(note);
    key.style.left = `${i * whiteW}%`;
    key.style.width = `${whiteW}%`;
    key.style.height = `170px`;
    key.innerHTML = `<span class="key__label">${midiToName(note)}</span>`;
    el.appendChild(key);
  });

  // Black keys
  for (let n = KEYBOARD.start; n <= KEYBOARD.end; n++) {
    if (!IS_BLACK(n % 12)) continue;

    // place above between adjacent white keys
    const prevWhite = (() => {
      for (let x = n - 1; x >= KEYBOARD.start; x--) if (!IS_BLACK(x % 12)) return x;
      return null;
    })();
    if (prevWhite == null) continue;
    const i = whiteNotes.indexOf(prevWhite);
    if (i < 0) continue;

    const key = document.createElement("button");
    key.type = "button";
    key.className = "key key--black";
    key.dataset.note = String(n);
    key.style.left = `${(i + 1) * whiteW - blackW / 2}%`;
    key.style.width = `${blackW}%`;
    key.innerHTML = `<span class="key__label">${midiToName(n)}</span>`;
    el.appendChild(key);
  }
}

function bindKeyboardMouse() {
  const root = $("#keyboard");
  let mouseDown = false;
  const activePointerNote = new Map(); // pointerId -> midiNote

  const down = async (target) => {
    const btn = target?.closest?.(".key");
    if (!btn) return;
    const note = Number(btn.dataset.note);
    await resumeAudioIfNeeded();
    press(note, 0.9);
  };

  root.addEventListener("pointerdown", (e) => {
    mouseDown = true;
    root.setPointerCapture?.(e.pointerId);
    const btn = e.target?.closest?.(".key");
    if (!btn) return;
    const note = Number(btn.dataset.note);
    activePointerNote.set(e.pointerId, note);
    down(btn);
  });
  root.addEventListener("pointerup", (e) => {
    mouseDown = false;
    const note = activePointerNote.get(e.pointerId);
    if (note != null) release(note);
    activePointerNote.delete(e.pointerId);
  });
  root.addEventListener("pointercancel", (e) => {
    mouseDown = false;
    const note = activePointerNote.get(e.pointerId);
    if (note != null) release(note);
    activePointerNote.delete(e.pointerId);
  });
  root.addEventListener("pointermove", (e) => {
    if (!mouseDown) return;
    const btn = e.target?.closest?.(".key");
    if (!btn) return;
    const note = Number(btn.dataset.note);
    const prev = activePointerNote.get(e.pointerId);
    if (prev != null && prev !== note) release(prev);
    activePointerNote.set(e.pointerId, note);
    if (!state.pressed.has(note)) down(btn);
  });
  window.addEventListener("blur", () => allNotesOff());
}

const QWERTY_MAP = (() => {
  // Two rows spanning ~1.5 octaves starting at C4 (60)
  // a w s e d f t g y h u j k o l p ;
  const keys = ["a","w","s","e","d","f","t","g","y","h","u","j","k","o","l","p",";"];
  const start = 60;
  const map = new Map();
  keys.forEach((k, i) => map.set(k, start + i));
  return map;
})();

function bindQwerty() {
  const held = new Set();
  window.addEventListener("keydown", async (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " ") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (k === "shift") {
      sustainSet(true);
      return;
    }
    const note = QWERTY_MAP.get(k);
    if (!note) return;
    if (held.has(k)) return;
    held.add(k);
    await resumeAudioIfNeeded();
    press(note, 0.8, { accent: true });
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "shift") {
      sustainSet(false);
      return;
    }
    const note = QWERTY_MAP.get(k);
    if (!note) return;
    held.delete(k);
    release(note);
  });
}

function bindTransport() {
  const playBtn = $("#btnPlay");
  playBtn.addEventListener("click", async () => {
    await resumeAudioIfNeeded();
    togglePlay();
  });

  $("#panicBtn").addEventListener("click", allNotesOff);
  $("#btnUndo").addEventListener("click", () => toast("Undo (demo)"));
  $("#btnRedo").addEventListener("click", () => toast("Redo (demo)"));
  $("#btnPrev").addEventListener("click", () => toast("Previous (demo)"));
  $("#btnNext").addEventListener("click", () => toast("Next (demo)"));

  const tempo = $("#tempo");
  tempo.addEventListener("input", () => {
    state.tempo = Number(tempo.value);
    $("#tempoValue").textContent = `${state.tempo} BPM`;
  });

  const volume = $("#volume");
  volume.addEventListener("input", () => {
    const v = Number(volume.value) / 100;
    state.volume = v;
    $("#volumeValue").textContent = `${Math.round(v * 100)}%`;
    if (state.audio.master) state.audio.master.gain.value = v;
  });
}

function togglePlay() {
  state.isPlaying = !state.isPlaying;
  $("#btnPlay").textContent = state.isPlaying ? "⏸" : "▶";
  toast(state.isPlaying ? "Play (demo)" : "Pause (demo)");
}

function bindSamples() {
  $$(".list__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFile(null);
      setSong(btn.dataset.song);
      toast(`Loaded: ${SONGS[btn.dataset.song]?.title ?? "Sample"}`);
    });
  });
}

function bindUpload() {
  const dz = $("#dropzone");
  const input = $("#fileInput");

  $("#chooseFileBtn").addEventListener("click", () => input.click());
  $("#clearFileBtn").addEventListener("click", () => {
    input.value = "";
    setFile(null);
    setSong(state.currentSong);
    $("#scoreSubtitle").textContent = "Upload a file or choose a sample song.";
    toast("Cleared");
  });

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0] ?? null;
    setFile(file);
    if (file) toast("File loaded (demo)");
  });

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      prevent(e);
      dz.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      prevent(e);
      dz.classList.remove("is-dragover");
    });
  });
  dz.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0] ?? null;
    if (!file) return;
    setFile(file);
    toast("File dropped (demo)");
  });
}

async function enableMidi() {
  const status = $("#midiStatus");
  const select = $("#midiInputSelect");
  const enableBtn = $("#enableMidiBtn");
  const disableBtn = $("#disableMidiBtn");

  if (!navigator.requestMIDIAccess) {
    status.textContent = "Unsupported";
    toast("Web MIDI not supported in this browser");
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    state.midi.access = access;
    status.textContent = "On";
    enableBtn.disabled = true;
    disableBtn.disabled = false;

    const inputs = [...access.inputs.values()];
    select.innerHTML = "";
    if (inputs.length === 0) {
      select.disabled = true;
      select.innerHTML = `<option value="">No device</option>`;
      toast("MIDI enabled, but no input device found");
      return;
    }

    select.disabled = false;
    for (const i of inputs) {
      const opt = document.createElement("option");
      opt.value = i.id;
      opt.textContent = i.name || `Input ${i.id}`;
      select.appendChild(opt);
    }

    const pick = (id) => {
      if (state.midi.input) state.midi.input.onmidimessage = null;
      const inp = access.inputs.get(id);
      state.midi.input = inp ?? null;
      if (!inp) return;
      inp.onmidimessage = onMidiMessage;
      toast(`MIDI input: ${inp.name ?? "Selected"}`);
    };

    pick(inputs[0].id);
    select.value = inputs[0].id;

    select.onchange = () => pick(select.value);
    access.onstatechange = () => {
      // Refresh list on hotplug
      const cur = select.value;
      const all = [...access.inputs.values()];
      select.innerHTML = "";
      if (all.length === 0) {
        select.disabled = true;
        select.innerHTML = `<option value="">No device</option>`;
        state.midi.input = null;
        toast("No MIDI device");
        return;
      }
      select.disabled = false;
      for (const i of all) {
        const opt = document.createElement("option");
        opt.value = i.id;
        opt.textContent = i.name || `Input ${i.id}`;
        select.appendChild(opt);
      }
      if (all.some((i) => i.id === cur)) {
        select.value = cur;
      } else {
        select.value = all[0].id;
      }
      pick(select.value);
    };
  } catch (e) {
    status.textContent = "Denied";
    toast("MIDI permission denied");
  }
}

function disableMidi() {
  const status = $("#midiStatus");
  const select = $("#midiInputSelect");
  const enableBtn = $("#enableMidiBtn");
  const disableBtn = $("#disableMidiBtn");

  if (state.midi.input) state.midi.input.onmidimessage = null;
  state.midi.input = null;
  state.midi.access = null;
  select.disabled = true;
  select.innerHTML = `<option value="">No device</option>`;
  status.textContent = "Off";
  enableBtn.disabled = false;
  disableBtn.disabled = true;
  toast("MIDI disabled");
}

function onMidiMessage(e) {
  const [status, data1, data2] = e.data;
  const cmd = status & 0xf0;

  // Note On (0x90): vel 0 => off
  if (cmd === 0x90) {
    const note = data1;
    const vel = data2;
    resumeAudioIfNeeded().then(() => {
      if (vel === 0) release(note);
      else press(note, vel / 127, { accent: true });
    });
    return;
  }

  // Note Off (0x80)
  if (cmd === 0x80) {
    release(data1);
    return;
  }

  // CC (0xB0): sustain pedal 64
  if (cmd === 0xb0) {
    const cc = data1;
    const value = data2;
    if (cc === 64) sustainSet(value >= 64);
  }
}

function bindMidiUi() {
  $("#enableMidiBtn").addEventListener("click", enableMidi);
  $("#disableMidiBtn").addEventListener("click", disableMidi);
}

function bindMisc() {
  $("#toastClose").addEventListener("click", () => $("#toast").classList.remove("is-open"));

  $("#inviteBtn").addEventListener("click", () => toast("Invite link (demo)"));
  $("#loginBtn").addEventListener("click", () => toast("Login (demo)"));
  $("#settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    toast("Settings (demo)");
  });
  $("#aboutLink").addEventListener("click", (e) => {
    e.preventDefault();
    toast("About (demo)");
  });
}

function init() {
  buildKeyboard();
  bindKeyboardMouse();
  bindQwerty();
  bindTransport();
  bindSamples();
  bindUpload();
  bindMidiUi();
  bindMisc();
  setSong(state.currentSong);
}

init();

