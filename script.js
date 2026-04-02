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
  recorder: {
    isRecording: false,
    isPlayingBack: false,
    startedAtMs: 0,
    events: [], // {tMs:number, type:"on"|"off", note:number, velocity?:number}
    playTimers: new Set(),
  },
  audio: {
    ctx: null,
    master: null,
    voices: new Map(), // midiNote -> {osc, gain}
  },
  midi: {
    access: null,
    input: null,
  },
  practice: {
    sequence: [], // midi notes
    idx: 0,
    active: false,
  },
  sheet: {
    notes: null, // [{note:number, dur:string}] | null
    title: null,
  },
  player: {
    isPlaying: false,
    startedAtMs: 0,
    offsetMs: 0,
    timers: new Set(),
    totalMs: 0,
  },
};

const SONGS = {
  twinkle: { title: "Twinkle Twinkle Little Star", subtitle: "Traditional" },
  ode: { title: "Ode to Joy", subtitle: "Beethoven" },
  elise: { title: "Für Elise", subtitle: "Beethoven" },
  moonlight: { title: "Moonlight Sonata", subtitle: "Beethoven" },
};

const SONG_META = {
  twinkle: { timeSig: "4/4", annotation: "degree-c" },
  ode: { timeSig: "4/4", annotation: "degree-c" },
  // Right-hand-only simplified demos
  elise: { timeSig: "3/8", annotation: "note-name" },
  moonlight: { timeSig: "4/4", annotation: "note-name" },
};

// Simple built-in sample melodies (treble clef) for sheet rendering.
// Format: { note: midiNumber, dur: VexFlowDuration }
const SAMPLE_SHEETS = {
  // Twinkle Twinkle Little Star (full main melody) in C major, 4/4
  // Phrase A: C C G G A A G | F F E E D D C
  // Phrase B: G G F F E E D | G G F F E E D
  // Phrase C: C C G G A A G | F F E E D D C
  twinkle: [
    { note: 60, dur: "q" },
    { note: 60, dur: "q" },
    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 69, dur: "q" },
    { note: 69, dur: "q" },
    { note: 67, dur: "h" },
    { note: 65, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "h" },

    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 65, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "h" },

    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 65, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "h" },

    { note: 60, dur: "q" },
    { note: 60, dur: "q" },
    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 69, dur: "q" },
    { note: 69, dur: "q" },
    { note: 67, dur: "h" },
    { note: 65, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "h" },
  ],
  // Ode to Joy (full main theme melody, simplified) in C major, 4/4
  // A: E E F G | G F E D | C C D E | E D D
  // A': E E F G | G F E D | C C D E | D C C
  // B: D D E C | D E F E | C D E F | E C D
  // B': D D E C | D E F E | C D E F | E D C
  ode: [
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 62, dur: "h" },

    { note: 64, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 67, dur: "q" },
    { note: 67, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "q" },
    { note: 60, dur: "h" },

    { note: 62, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "h" },

    { note: 62, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 60, dur: "q" },
    { note: 62, dur: "q" },
    { note: 64, dur: "q" },
    { note: 65, dur: "q" },
    { note: 64, dur: "q" },
    { note: 62, dur: "q" },
    { note: 60, dur: "h" },
  ],
  // Für Elise (longer opening section, simplified right-hand), 3/8 feel
  elise: [
    // Motif 1
    { note: 76, dur: "16" }, { note: 75, dur: "16" }, { note: 76, dur: "16" }, { note: 75, dur: "16" }, { note: 76, dur: "16" }, { note: 71, dur: "16" },
    { note: 74, dur: "16" }, { note: 72, dur: "16" }, { note: 69, dur: "8" }, { note: null, dur: "16" }, { note: 60, dur: "16" },

    // Continuation
    { note: 64, dur: "16" }, { note: 69, dur: "16" }, { note: 71, dur: "8" }, { note: null, dur: "16" }, { note: 64, dur: "16" },
    { note: 68, dur: "16" }, { note: 71, dur: "16" }, { note: 72, dur: "8" }, { note: null, dur: "16" }, { note: 64, dur: "16" },

    // Motif 2 (repeat)
    { note: 76, dur: "16" }, { note: 75, dur: "16" }, { note: 76, dur: "16" }, { note: 75, dur: "16" }, { note: 76, dur: "16" }, { note: 71, dur: "16" },
    { note: 74, dur: "16" }, { note: 72, dur: "16" }, { note: 69, dur: "8" }, { note: null, dur: "16" }, { note: 60, dur: "16" },

    // Cadence (simplified)
    { note: 64, dur: "16" }, { note: 72, dur: "16" }, { note: 71, dur: "16" }, { note: 69, dur: "16" }, { note: 68, dur: "16" }, { note: 69, dur: "16" },
    { note: 71, dur: "16" }, { note: 72, dur: "16" }, { note: 71, dur: "8" }, { note: null, dur: "16" }, { note: 64, dur: "16" },

    // Bridge idea (simplified arpeggio-ish)
    { note: 69, dur: "16" }, { note: 72, dur: "16" }, { note: 76, dur: "16" }, { note: 81, dur: "16" }, { note: 80, dur: "16" }, { note: 76, dur: "16" },
    { note: 72, dur: "16" }, { note: 69, dur: "16" }, { note: 64, dur: "8" }, { note: null, dur: "16" }, { note: 64, dur: "16" },
  ],
  // Moonlight Sonata (opening right-hand idea, simplified) in C# minor
  // Opening arpeggio texture (simplified, extended)
  moonlight: [
    // (G# C# E) pattern across several bars
    { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" },
    { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" }, { note: 73, dur: "8" },
    { note: 76, dur: "8" }, { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" },
    { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" },

    // Variation: (A C# E)
    { note: 69, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 69, dur: "8" },
    { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 69, dur: "8" }, { note: 73, dur: "8" },
    { note: 76, dur: "8" }, { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" },
    { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" },

    // Another pass
    { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" },
    { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 69, dur: "8" }, { note: 73, dur: "8" },
    { note: 76, dur: "8" }, { note: 69, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" },
    { note: 68, dur: "8" }, { note: 73, dur: "8" }, { note: 76, dur: "8" }, { note: 68, dur: "8" },
  ],
};

const KEYBOARD = {
  start: 21, // A0 (88-key piano start)
  end: 108, // C8 (88-key piano end)
};

const PC_LABELS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const IS_BLACK = (pc) => [1, 3, 6, 8, 10].includes(pc);

function midiToName(n) {
  const pc = n % 12;
  const oct = Math.floor(n / 12) - 1;
  return `${PC_LABELS[pc]}${oct}`;
}

function midiToVexKey(n) {
  const pc = n % 12;
  const oct = Math.floor(n / 12) - 1;
  const name = PC_LABELS[pc].toLowerCase(); // e.g. "c#"
  return `${name}/${oct}`;
}

function scaleDegreeCMajor(midi) {
  // 1=C,2=D,3=E,4=F,5=G,6=A,7=B; accidentals shown as ♯ suffix.
  const pc = ((midi % 12) + 12) % 12;
  const map = new Map([
    [0, "1"], // C
    [1, "1♯"],
    [2, "2"], // D
    [3, "2♯"],
    [4, "3"], // E
    [5, "4"], // F
    [6, "4♯"],
    [7, "5"], // G
    [8, "5♯"],
    [9, "6"], // A
    [10, "6♯"],
    [11, "7"], // B
  ]);
  return map.get(pc) ?? "";
}

function noteNamePc(midi) {
  return PC_LABELS[((midi % 12) + 12) % 12];
}

function annotationForSong(note, songId) {
  const mode = SONG_META[songId]?.annotation ?? "degree-c";
  if (mode === "note-name") return noteNamePc(note);
  return scaleDegreeCMajor(note);
}

function renderWrappedSheet(noteObjs, { width, timeSig = "4/4", songId = null } = {}) {
  const host = $("#sheet");
  const VF = window.Vex?.Flow;
  if (!host || !VF) return;

  host.innerHTML = "";

  const [numStr, denStr] = String(timeSig).split("/");
  const beatsPerBar = Number(numStr) || 4;
  const beatValue = Number(denStr) || 4;
  const quarterPerBeat = 4 / beatValue;
  const barBeatsInQuarter = beatsPerBar * quarterPerBeat;

  // Split into measures by beat budget.
  const measures = [];
  let cur = [];
  let curBeats = 0;
  for (const n of noteObjs) {
    const b = vfDurToBeats(n.dur);
    if (cur.length && curBeats + b > barBeatsInQuarter + 1e-6) {
      measures.push(cur);
      cur = [];
      curBeats = 0;
    }
    cur.push(n);
    curBeats += b;
  }
  if (cur.length) measures.push(cur);

  const measuresPerLine = Math.max(2, Math.floor((width - 40) / 220));
  const lines = [];
  for (let i = 0; i < measures.length; i += measuresPerLine) {
    lines.push(measures.slice(i, i + measuresPerLine));
  }

  const height = 90 + lines.length * 130;
  const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.setFont("Inter", 11, "");

  let y = 28;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineX = 10;
    const lineW = width - 20;
    const stave = new VF.Stave(lineX, y, lineW);
    stave.addClef("treble");
    if (li === 0) stave.addTimeSignature(timeSig);
    stave.setContext(ctx).draw();

    const tickables = [];
    for (const m of line) {
      for (const n of m) {
        if (n.note == null) {
          tickables.push(new VF.StaveNote({ clef: "treble", keys: ["b/4"], duration: `${n.dur}r` }));
          continue;
        }
        const sn = new VF.StaveNote({ clef: "treble", keys: [midiToVexKey(n.note)], duration: n.dur });
        if ([1, 3, 6, 8, 10].includes(n.note % 12)) sn.addModifier(new VF.Accidental("#"), 0);
        const label = songId ? annotationForSong(n.note, songId) : noteNamePc(n.note);
        sn.addModifier(
          new VF.Annotation(label).setVerticalJustification(VF.Annotation.VerticalJustify.TOP).setFont("Inter", 12, "700"),
          0,
        );
        tickables.push(sn);
      }
    }

    const lineBeats = line.reduce((acc, m) => acc + m.reduce((a, n) => a + vfDurToBeats(n.dur), 0), 0);
    const voice = new VF.Voice({ num_beats: Math.max(1, lineBeats), beat_value: 4 });
    voice.addTickables(tickables);
    new VF.Formatter().joinVoices([voice]).format([voice], lineW - 60);
    voice.draw(ctx, stave);

    y += 130;
  }
}

function renderSheet(songId) {
  const host = $("#sheet");
  const legend = $("#sheetLegend");
  if (!host || !legend) return;

  const data = SAMPLE_SHEETS[songId];
  if (!data) {
    host.innerHTML = "";
    legend.style.display = "none";
    return;
  }

  const VF = window.Vex?.Flow;
  if (!VF) {
    host.innerHTML = `<div class="muted">Sheet renderer failed to load.</div>`;
    legend.style.display = "none";
    return;
  }

  host.innerHTML = "";
  legend.style.display = "";

  const width = Math.max(720, host.clientWidth || 720);
  legend.textContent =
    SONG_META[songId]?.annotation === "note-name"
      ? "Letters show the note name (C, C#, D…)."
      : "Numbers show scale degree in C major (1=C, 2=D, …, 7=B).";

  const timeSig = SONG_META[songId]?.timeSig ?? "4/4";
  renderWrappedSheet(data, { width, timeSig, songId });
}

function midiToFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function renderSheetFromNotes(noteObjs, { title = null } = {}) {
  const host = $("#sheet");
  const legend = $("#sheetLegend");
  if (!host || !legend) return;

  const VF = window.Vex?.Flow;
  if (!VF) {
    host.innerHTML = `<div class="muted">Sheet renderer failed to load.</div>`;
    legend.style.display = "none";
    return;
  }

  host.innerHTML = "";
  legend.style.display = "";
  legend.textContent = "Letters show the note name (C, C#, D…).";

  const width = Math.max(720, host.clientWidth || 720);
  renderWrappedSheet(noteObjs, { width, timeSig: "4/4", songId: null });

  if (title) {
    // Non-invasive title overlay.
    const svg = host.querySelector("svg");
    if (svg) svg.setAttribute("aria-label", `Sheet music: ${title}`);
  }
}

function clearSheet() {
  state.sheet.notes = null;
  state.sheet.title = null;
  const host = $("#sheet");
  const legend = $("#sheetLegend");
  if (host) host.innerHTML = "";
  if (legend) legend.style.display = "none";
  practiceSetSequence([]);
  playerStop({ silent: true });
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
  renderSheet(id);
  state.sheet.notes = SAMPLE_SHEETS[id] ?? null;
  state.sheet.title = meta.title ?? null;
  const seq = (SAMPLE_SHEETS[id] ?? []).map((x) => x.note).filter((n) => typeof n === "number");
  practiceSetSequence(seq);
}

function setFile(file) {
  state.loadedFile = file;
  const meta = $("#dropzoneMeta");
  const clearBtn = $("#clearFileBtn");

  if (!file) {
    meta.textContent = "No file selected";
    clearBtn.disabled = true;
    clearSheet();
    return;
  }

  meta.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
  clearBtn.disabled = false;

  $("#scoreTitle").textContent = file.name;
  $("#scoreSubtitle").textContent = "Loaded from your device (demo UI)";

  const name = file.name.toLowerCase();
  if (name.endsWith(".xml") || name.endsWith(".musicxml")) {
    file
      .text()
      .then((text) => {
        const parsed = parseMusicXmlToNotes(text);
        if (!parsed.notes.length) {
          toast("No notes found in MusicXML");
          clearSheet();
          return;
        }
        state.sheet.notes = parsed.notes;
        state.sheet.title = parsed.title || file.name;
        renderSheetFromNotes(parsed.notes, { title: state.sheet.title });
        practiceSetSequence(parsed.notes.map((n) => n.note).filter((n) => typeof n === "number"));
        toast("Imported MusicXML");
      })
      .catch(() => {
        toast("Failed to read MusicXML");
        clearSheet();
      });
    return;
  }

  // For images/PDF we only preview; converting them into notes needs OMR.
  previewFileInSheet(file);
}

function vfDurToBeats(dur) {
  // VexFlow durations: "w","h","q","8","16","32"
  switch (dur) {
    case "w": return 4;
    case "h": return 2;
    case "q": return 1;
    case "8": return 0.5;
    case "16": return 0.25;
    case "32": return 0.125;
    default: return 1;
  }
}

function getPlayableSheetNotes() {
  return state.sheet.notes ?? SAMPLE_SHEETS[state.currentSong] ?? null;
}

function playerClearTimers() {
  for (const id of state.player.timers) window.clearTimeout(id);
  state.player.timers.clear();
}

function playerStop({ silent = false } = {}) {
  state.player.isPlaying = false;
  state.player.startedAtMs = 0;
  state.player.offsetMs = 0;
  state.player.totalMs = 0;
  playerClearTimers();
  allNotesOff();
  $("#btnPlay").textContent = "▶";
  if (!silent) toast("Stopped");
}

function playerPause() {
  if (!state.player.isPlaying) return;
  const elapsed = performance.now() - state.player.startedAtMs;
  state.player.offsetMs += Math.max(0, elapsed);
  state.player.isPlaying = false;
  playerClearTimers();
  allNotesOff();
  $("#btnPlay").textContent = "▶";
  toast("Paused");
}

async function playerPlayFromOffset() {
  const notes = getPlayableSheetNotes();
  if (!notes || !notes.length) {
    togglePlay(); // fallback demo mode
    return;
  }

  await resumeAudioIfNeeded();
  allNotesOff();
  playerClearTimers();

  const bpm = Math.max(40, Math.min(260, state.tempo));
  const beatMs = 60000 / bpm;

  // Build schedule with absolute times from 0
  const schedule = [];
  let tMs = 0;
  for (const n of notes) {
    const beats = vfDurToBeats(n.dur);
    const durMs = beats * beatMs;
    schedule.push({ atMs: tMs, durMs, note: n.note ?? null });
    tMs += durMs;
  }
  state.player.totalMs = tMs;

  const offset = Math.max(0, state.player.offsetMs);
  state.player.startedAtMs = performance.now();
  state.player.isPlaying = true;
  $("#btnPlay").textContent = "⏸";
  toast("Playing sheet…");

  // Schedule remaining events after offset
  for (const ev of schedule) {
    const startIn = ev.atMs - offset;
    if (startIn + ev.durMs <= 0) continue;
    if (startIn < 0 && ev.note != null) {
      // We are mid-note; just start it immediately for the remaining time.
      const remaining = Math.max(40, ev.durMs + startIn);
      press(ev.note, 0.85, { accent: true });
      const stopId = window.setTimeout(() => release(ev.note), remaining * 0.92);
      state.player.timers.add(stopId);
      continue;
    }
    if (ev.note == null) continue; // rest

    const startId = window.setTimeout(() => {
      if (!state.player.isPlaying) return;
      press(ev.note, 0.85, { accent: true });
      const stopId = window.setTimeout(() => release(ev.note), Math.max(40, ev.durMs * 0.92));
      state.player.timers.add(stopId);
    }, Math.max(0, startIn));
    state.player.timers.add(startId);
  }

  const doneIn = Math.max(0, state.player.totalMs - offset) + 60;
  const doneId = window.setTimeout(() => {
    state.player.isPlaying = false;
    state.player.offsetMs = 0;
    playerClearTimers();
    allNotesOff();
    $("#btnPlay").textContent = "▶";
    toast("Finished");
  }, doneIn);
  state.player.timers.add(doneId);
}

function playerToggle() {
  const notes = getPlayableSheetNotes();
  const hasSheet = Boolean(notes && notes.length);

  if (!hasSheet) {
    togglePlay();
    return;
  }

  if (state.player.isPlaying) {
    playerPause();
  } else {
    playerPlayFromOffset();
  }
}

function previewFileInSheet(file) {
  const host = $("#sheet");
  const legend = $("#sheetLegend");
  if (!host || !legend) return;
  legend.style.display = "none";
  host.innerHTML = "";
  const url = URL.createObjectURL(file);

  const ext = file.name.toLowerCase();
  if (ext.endsWith(".pdf")) {
    host.innerHTML = `<embed class="sheet__embed" src="${url}" type="application/pdf" />`;
  } else if (ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg")) {
    host.innerHTML = `<img class="sheet__img" src="${url}" alt="Uploaded sheet preview" />`;
  } else {
    host.innerHTML = `<div class="muted">Preview not available for this file type.</div>`;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  practiceSetSequence([]);
  toast("Preview loaded (conversion needs MusicXML)");
}

function parseMusicXmlToNotes(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) return { title: null, notes: [] };

  const title =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    null;

  const part = doc.querySelector("part");
  if (!part) return { title, notes: [] };

  let divisions = Number(doc.querySelector("attributes > divisions")?.textContent || "1");
  if (!Number.isFinite(divisions) || divisions <= 0) divisions = 1;

  const durToVf = (durDivs) => {
    // Map based on quarter=divisions.
    const q = divisions;
    const r = durDivs / q;
    if (r >= 3.75) return "w";
    if (r >= 1.75) return "h";
    if (r >= 0.875) return "q";
    if (r >= 0.4375) return "8";
    if (r >= 0.21875) return "16";
    return "32";
  };

  const stepToPc = (step) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step] ?? 0);
  const toMidi = (step, alter, octave) => {
    const pc = stepToPc(step) + (alter ?? 0);
    return (octave + 1) * 12 + pc;
  };

  const out = [];
  const measures = [...part.querySelectorAll("measure")];
  for (const m of measures) {
    const divInMeasure = m.querySelector("attributes > divisions");
    if (divInMeasure) {
      const d = Number(divInMeasure.textContent || "1");
      if (Number.isFinite(d) && d > 0) divisions = d;
    }

    const nodes = [...m.querySelectorAll("note")];
    for (const n of nodes) {
      if (n.querySelector("chord")) continue; // ignore chords for now (melody practice)
      const isRest = Boolean(n.querySelector("rest"));
      const durDivs = Number(n.querySelector("duration")?.textContent || "0");
      if (!Number.isFinite(durDivs) || durDivs <= 0) continue;
      const vfDur = durToVf(durDivs);

      if (isRest) {
        out.push({ note: null, dur: vfDur });
        continue;
      }
      const step = n.querySelector("pitch > step")?.textContent?.trim();
      const oct = Number(n.querySelector("pitch > octave")?.textContent || "");
      const alt = Number(n.querySelector("pitch > alter")?.textContent || "0");
      if (!step || !Number.isFinite(oct)) continue;
      const midi = toMidi(step, Number.isFinite(alt) ? alt : 0, oct);
      out.push({ note: midi, dur: vfDur });
    }
  }

  return { title, notes: out };
}

function practiceSetSequence(seq) {
  state.practice.sequence = seq;
  state.practice.idx = 0;
  state.practice.active = false;
  setTargetKey(null);
  updatePracticeUi();
}

function setTargetKey(note) {
  $$(".key").forEach((k) => k.classList.remove("is-target"));
  if (note == null) return;
  const el = $(`.key[data-note="${note}"]`);
  if (el) el.classList.add("is-target");
}

function practiceStart() {
  if (!state.practice.sequence.length) return;
  state.practice.active = true;
  state.practice.idx = Math.min(state.practice.idx, state.practice.sequence.length - 1);
  setTargetKey(state.practice.sequence[state.practice.idx]);
  updatePracticeUi();
  toast("Practice started");
}

function practiceStop() {
  state.practice.active = false;
  setTargetKey(null);
  updatePracticeUi();
  toast("Practice stopped");
}

function practiceReset() {
  state.practice.idx = 0;
  if (state.practice.active) setTargetKey(state.practice.sequence[0] ?? null);
  updatePracticeUi();
  toast("Practice reset");
}

function practiceOnPress(note) {
  if (!state.practice.active) return;
  const expected = state.practice.sequence[state.practice.idx];
  if (expected == null) return;
  if (note !== expected) return;

  state.practice.idx += 1;
  if (state.practice.idx >= state.practice.sequence.length) {
    toast("Finished!");
    practiceStop();
    return;
  }
  setTargetKey(state.practice.sequence[state.practice.idx]);
  updatePracticeUi();
}

function updatePracticeUi() {
  const startBtn = $("#practiceStartBtn");
  const resetBtn = $("#practiceResetBtn");
  const stopBtn = $("#practiceStopBtn");
  const next = $("#practiceNext");
  if (!startBtn || !resetBtn || !stopBtn || !next) return;

  const hasSeq = state.practice.sequence.length > 0;
  startBtn.disabled = !hasSeq || state.practice.active;
  resetBtn.disabled = !hasSeq;
  stopBtn.disabled = !state.practice.active;

  if (!hasSeq) {
    next.textContent = "Load a MusicXML file or pick a sample.";
    return;
  }

  const idx = state.practice.idx;
  const total = state.practice.sequence.length;
  const cur = state.practice.sequence[Math.min(idx, total - 1)];
  next.textContent = state.practice.active
    ? `Next: ${midiToName(cur)} (degree ${scaleDegreeCMajor(cur)}) • ${idx + 1}/${total}`
    : `Ready: ${total} notes • press Start`;
}

function bindPracticeUi() {
  updatePracticeUi();
  $("#practiceStartBtn")?.addEventListener("click", () => practiceStart());
  $("#practiceResetBtn")?.addEventListener("click", () => practiceReset());
  $("#practiceStopBtn")?.addEventListener("click", () => practiceStop());
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

  const now = ctx.currentTime;
  const vel = Math.max(0.02, Math.min(1, velocity));
  const amp = vel * state.volume;
  const freq = midiToFreq(note);

  // "Virtual piano" timbre: a few harmonics + filter + ADSR.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  const baseCutoff = 1400 + vel * 2600;
  filter.frequency.setValueAtTime(baseCutoff, now);
  filter.frequency.exponentialRampToValueAtTime(1100 + vel * 1200, now + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.012); // attack
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * 0.45), now + 0.10); // decay

  filter.connect(gain);
  gain.connect(master);

  const mkOsc = (type, mult, detuneCents, level) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, now);
    o.detune.setValueAtTime(detuneCents, now);
    g.gain.setValueAtTime(level, now);
    o.connect(g);
    g.connect(filter);
    o.start(now);
    return { o, g };
  };

  const oscs = [
    mkOsc("triangle", 1, -4, 0.82),
    mkOsc("triangle", 1, +4, 0.72),
    mkOsc("sine", 2, 0, 0.20),
    mkOsc("sine", 3, 0, 0.10),
  ];

  voices.set(note, { oscs, gain, filter });
}

function voiceStop(note, immediate = false) {
  const { ctx, voices } = state.audio;
  const v = voices.get(note);
  if (!v || !ctx) return;

  const now = ctx.currentTime;
  const release = immediate ? 0.01 : 0.22;
  try {
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    for (const { o } of v.oscs ?? []) o.stop(now + release + 0.03);
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
  recorderEvent("on", note, velocity);
  practiceOnPress(note);
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
  recorderEvent("off", note);
}

function sustainSet(on) {
  // While playing back a recording, ignore user sustain changes so playback timing stays accurate.
  if (state.recorder.isPlayingBack) return;
  state.sustain = on;
  if (!on) {
    // Release any sustained notes not currently held
    for (const note of [...state.sustained]) {
      if (!state.pressed.has(note)) {
        const el = $(`.key[data-note="${note}"]`);
        if (el) el.classList.remove("is-down", "is-accent");
        recorderEvent("off", note);
        voiceStop(note);
      }
      state.sustained.delete(note);
    }
  }
}

function recorderEvent(type, note, velocity) {
  const r = state.recorder;
  if (!r.isRecording || r.isPlayingBack) return;
  const tMs = performance.now() - r.startedAtMs;
  if (type === "on") r.events.push({ tMs, type, note, velocity });
  else r.events.push({ tMs, type, note });
  updateRecorderUi();
}

function recorderStart() {
  const r = state.recorder;
  r.events = [];
  r.isRecording = true;
  r.startedAtMs = performance.now();
  toast("Recording…");
  updateRecorderUi();
}

function recorderStop() {
  const r = state.recorder;
  if (!r.isRecording) return;
  r.isRecording = false;
  toast(`Recorded ${r.events.length} event${r.events.length === 1 ? "" : "s"}`);
  updateRecorderUi();
}

function recorderClearPlaybackTimers() {
  const r = state.recorder;
  for (const id of r.playTimers) window.clearTimeout(id);
  r.playTimers.clear();
}

function recordingToExportObject() {
  const r = state.recorder;
  const durationMs = r.events.length ? r.events.at(-1).tMs : 0;
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tempo: state.tempo,
    keyboard: { ...KEYBOARD },
    durationMs,
    events: r.events,
  };
}

function downloadRecording() {
  const r = state.recorder;
  if (!r.events.length) {
    toast("No recording yet");
    return;
  }
  if (r.isRecording) recorderStop();

  const data = recordingToExportObject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const name = `piano-recording-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Downloaded recording");
}

async function recorderPlay() {
  const r = state.recorder;
  if (r.isRecording) recorderStop();
  if (!r.events.length) {
    toast("No recording yet");
    return;
  }

  recorderClearPlaybackTimers();
  allNotesOff();
  await resumeAudioIfNeeded();
  r.isPlayingBack = true;
  toast("Playing recording…");
  updateRecorderUi();

  const events = [...r.events].sort((a, b) => a.tMs - b.tMs);
  const endAtMs = events.at(-1)?.tMs ?? 0;

  for (const ev of events) {
    const id = window.setTimeout(() => {
      if (!state.recorder.isPlayingBack) return;
      if (ev.type === "on") press(ev.note, ev.velocity ?? 0.8, { accent: true });
      else release(ev.note);
    }, Math.max(0, ev.tMs));
    r.playTimers.add(id);
  }

  const doneId = window.setTimeout(() => {
    r.isPlayingBack = false;
    recorderClearPlaybackTimers();
    allNotesOff();
    toast("Playback finished");
    updateRecorderUi();
  }, Math.max(0, endAtMs + 30));
  r.playTimers.add(doneId);
}

function updateRecorderUi() {
  const recordBtn = $("#recordBtn");
  const stopBtn = $("#stopRecordBtn");
  const playBtn = $("#playRecordBtn");
  const downloadBtn = $("#downloadRecordBtn");
  if (!recordBtn || !stopBtn || !playBtn || !downloadBtn) return;

  const r = state.recorder;
  recordBtn.disabled = r.isRecording || r.isPlayingBack;
  stopBtn.disabled = !r.isRecording;
  playBtn.disabled = r.isRecording || r.isPlayingBack || r.events.length === 0;
  downloadBtn.disabled = r.isRecording || r.isPlayingBack || r.events.length === 0;

  recordBtn.textContent = r.isRecording ? "Recording…" : "Record";
  playBtn.textContent = r.isPlayingBack ? "Playing…" : "Play recording";
}

function bindRecorderUi() {
  updateRecorderUi();
  $("#recordBtn")?.addEventListener("click", async () => {
    await resumeAudioIfNeeded();
    if (!state.recorder.isRecording) recorderStart();
  });
  $("#stopRecordBtn")?.addEventListener("click", () => recorderStop());
  $("#playRecordBtn")?.addEventListener("click", () => recorderPlay());
  $("#downloadRecordBtn")?.addEventListener("click", () => downloadRecording());

  const importInput = $("#importRecordInput");
  $("#importRecordBtn")?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.version !== 1 || !Array.isArray(data.events)) {
        toast("Invalid recording file");
        return;
      }

      const importedEvents = data.events
        .filter((e) => e && typeof e.tMs === "number" && (e.type === "on" || e.type === "off") && typeof e.note === "number")
        .map((e) => ({
          tMs: e.tMs,
          type: e.type,
          note: e.note,
          velocity: typeof e.velocity === "number" ? e.velocity : undefined,
        }))
        .sort((a, b) => a.tMs - b.tMs);

      const r = state.recorder;
      recorderClearPlaybackTimers();
      allNotesOff();
      r.isRecording = false;
      r.isPlayingBack = false;
      r.events = importedEvents;
      toast(`Imported ${importedEvents.length} event${importedEvents.length === 1 ? "" : "s"}`);
      updateRecorderUi();
    } catch {
      toast("Failed to import recording");
    } finally {
      importInput.value = "";
    }
  });
}

function buildKeyboard() {
  const el = $("#keyboard");
  el.innerHTML = "";

  const whiteNotes = [];
  for (let n = KEYBOARD.start; n <= KEYBOARD.end; n++) {
    if (!IS_BLACK(n % 12)) whiteNotes.push(n);
  }

  const WHITE_W = 34; // px
  const BLACK_W = 22; // px
  const KEY_H = 170; // px
  const BLACK_H = 108; // px

  el.style.width = `${whiteNotes.length * WHITE_W}px`;
  el.style.height = `${KEY_H}px`;

  // White keys
  whiteNotes.forEach((note, i) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key key--white";
    key.dataset.note = String(note);
    key.style.left = `${i * WHITE_W}px`;
    key.style.width = `${WHITE_W}px`;
    key.style.height = `${KEY_H}px`;
    const showName = note % 12 === 0; // only label C notes to avoid clutter
    const q = noteToQwertyLabel(note);
    key.innerHTML = `
      <span class="key__name ${showName ? "" : "is-hidden"}">${midiToName(note)}</span>
      <span class="key__qwerty ${q ? "" : "is-hidden"}">${q}</span>
    `;
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
    key.style.left = `${(i + 1) * WHITE_W - BLACK_W / 2}px`;
    key.style.width = `${BLACK_W}px`;
    key.style.height = `${BLACK_H}px`;
    const q = noteToQwertyLabel(n);
    key.innerHTML = `
      <span class="key__qwerty ${q ? "" : "is-hidden"}">${q}</span>
    `;
    el.appendChild(key);
  }
}

function updateKeyboardRangeLabel() {
  const pill = $("#keyboardRangePill");
  if (!pill) return;
  pill.textContent = `${midiToName(KEYBOARD.start)} → ${midiToName(KEYBOARD.end)}`;
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

function noteToQwertyLabel(note) {
  for (const [k, n] of QWERTY_MAP.entries()) {
    if (n === note) return k.toUpperCase();
  }
  return "";
}

function bindQwerty() {
  const held = new Set();
  window.addEventListener("keydown", async (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " ") {
      e.preventDefault();
      playerToggle();
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
    playerToggle();
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
  // Legacy demo mode toggle (used only when no sheet is loaded)
  state.isPlaying = !state.isPlaying;
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
  updateKeyboardRangeLabel();
  bindKeyboardMouse();
  bindQwerty();
  bindTransport();
  bindRecorderUi();
  bindPracticeUi();
  bindSamples();
  bindUpload();
  bindMidiUi();
  bindMisc();
  setSong(state.currentSong);
}

init();

