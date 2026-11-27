/**
 * Persistent zero-asset Web Audio ambient soundscapes (keeps playing across Swup visits):
 * - rain  (细雨): filtered pink noise with soft high-frequency rain texture
 * - fire  (壁炉): warm brown-noise hearth rumble + gentle organic crackle pops
 * - wind  (夜风): LFO-modulated bandpass breeze swells
 * - study (书房): velvety low-passed pink/brown study hush
 */
import { toast } from "./toast";

export type AmbientPreset = "rain" | "fire" | "wind" | "study";

const PRESET_STORAGE_KEY = "mote-ambient-sound";

export const AMBIENT_META: Record<
  AmbientPreset,
  { short: string; label: string; gain: number }
> = {
  rain: { short: "雨声", label: "细雨", gain: 0.3 },
  fire: { short: "壁炉", label: "壁炉微火", gain: 0.36 },
  wind: { short: "夜风", label: "深夜风声", gain: 0.28 },
  study: { short: "书房", label: "书房粉噪", gain: 0.24 },
};

interface ActiveGraph {
  stop: () => void;
  gain: GainNode;
}

let audioCtx: AudioContext | null = null;
let currentGraph: ActiveGraph | null = null;
let playing = false;
let activePreset: AmbientPreset = readSavedPreset();

function isAmbientPreset(value: string | undefined | null): value is AmbientPreset {
  return value === "rain" || value === "fire" || value === "wind" || value === "study";
}

function readSavedPreset(): AmbientPreset {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (isAmbientPreset(raw)) return raw;
  } catch {
    /* Storage is optional. */
  }
  return "rain";
}

function savePreset(preset: AmbientPreset) {
  try {
    if (preset === "rain") localStorage.removeItem(PRESET_STORAGE_KEY);
    else localStorage.setItem(PRESET_STORAGE_KEY, preset);
  } catch {
    /* Storage is optional. */
  }
}

function createPinkBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.036;
    b6 = white * 0.115926;
  }
  return buffer;
}

function createFireBuffer(ctx: AudioContext, seconds = 6): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = sr * seconds;
  const buffer = ctx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  let brown = 0;
  let crackleEnv = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.022 * white) / 1.022;

    // Gentle hearth glow modulation (~0.45Hz)
    const warmth = 0.86 + 0.14 * Math.sin((i / sr) * Math.PI * 0.9);

    // Sparse organic soft crackles (~5–7 subtle pops per second)
    if (Math.random() < 6.5 / sr) {
      crackleEnv = 0.25 + Math.random() * 0.55;
    }
    crackleEnv *= 0.992;
    const crackle = crackleEnv > 0.002 ? (Math.random() * 2 - 1) * crackleEnv * 0.34 : 0;

    data[i] = brown * 0.52 * warmth + crackle;
  }
  return buffer;
}

function createStudyBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.018 * white) / 1.018;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.95 * b2 + white * 0.048;
    data[i] = brown * 0.38 + (b0 + b1 + b2) * 0.22;
  }
  return buffer;
}

function buildGraph(ctx: AudioContext, preset: AmbientPreset): ActiveGraph {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.connect(ctx.destination);

  const stops: Array<() => void> = [];

  if (preset === "rain") {
    const src = ctx.createBufferSource();
    src.buffer = createPinkBuffer(ctx, 4);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1150;

    src.connect(filter);
    filter.connect(master);
    src.start();
    stops.push(() => {
      src.stop();
      src.disconnect();
      filter.disconnect();
    });
  } else if (preset === "fire") {
    const src = ctx.createBufferSource();
    src.buffer = createFireBuffer(ctx, 6);
    src.loop = true;

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 900;

    const warm = ctx.createBiquadFilter();
    warm.type = "lowshelf";
    warm.frequency.value = 240;
    warm.gain.value = 5;

    src.connect(low);
    low.connect(warm);
    warm.connect(master);
    src.start();
    stops.push(() => {
      src.stop();
      src.disconnect();
      low.disconnect();
      warm.disconnect();
    });
  } else if (preset === "wind") {
    const src = ctx.createBufferSource();
    src.buffer = createPinkBuffer(ctx, 5);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 390;
    band.Q.value = 1.35;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.11;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 145;

    lfo.connect(lfoGain);
    lfoGain.connect(band.frequency);

    src.connect(band);
    band.connect(master);
    src.start();
    lfo.start();
    stops.push(() => {
      src.stop();
      lfo.stop();
      src.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      band.disconnect();
    });
  } else {
    const src = ctx.createBufferSource();
    src.buffer = createStudyBuffer(ctx, 4);
    src.loop = true;

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 640;

    src.connect(low);
    low.connect(master);
    src.start();
    stops.push(() => {
      src.stop();
      src.disconnect();
      low.disconnect();
    });
  }

  return {
    gain: master,
    stop: () => {
      stops.forEach((fn) => {
        try {
          fn();
        } catch {
          /* Ignore already stopped nodes. */
        }
      });
      try {
        master.disconnect();
      } catch {
        /* Ignore disconnect errors. */
      }
    },
  };
}

function ensureContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    toast("当前浏览器不支持音频播放");
    return null;
  }
  audioCtx = new AudioCtx();
  return audioCtx;
}

function fadeOutGraph(graph: ActiveGraph, duration = 0.3) {
  if (!audioCtx) {
    graph.stop();
    return;
  }
  const now = audioCtx.currentTime;
  graph.gain.gain.cancelScheduledValues(now);
  graph.gain.gain.setValueAtTime(Math.max(0.0001, graph.gain.gain.value), now);
  graph.gain.gain.linearRampToValueAtTime(0.0001, now + duration);
  window.setTimeout(() => graph.stop(), Math.round(duration * 1000) + 60);
}

function startPreset(preset: AmbientPreset) {
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") void ctx.resume();

  if (currentGraph) {
    fadeOutGraph(currentGraph, 0.25);
    currentGraph = null;
  }

  const next = buildGraph(ctx, preset);
  currentGraph = next;
  const now = ctx.currentTime;
  next.gain.gain.cancelScheduledValues(now);
  next.gain.gain.setValueAtTime(0.0001, now);
  next.gain.gain.linearRampToValueAtTime(AMBIENT_META[preset].gain, now + 0.52);
  playing = true;
  return true;
}

export function syncAmbientButtons() {
  const meta = AMBIENT_META[activePreset];
  const tip = playing ? `关闭${meta.label}白噪音` : `开启${meta.label}白噪音`;

  document
    .querySelectorAll<HTMLButtonElement>("[data-rain-toggle]")
    .forEach((btn) => {
      btn.setAttribute("aria-pressed", String(playing));
      btn.dataset.tip = tip;
    });

  document
    .querySelectorAll<HTMLElement>("[data-ambient-short]")
    .forEach((el) => {
      el.textContent = meta.short;
    });

  document
    .querySelectorAll<HTMLElement>("[data-ambient-label]")
    .forEach((el) => {
      el.textContent = `${meta.label}白噪音`;
    });

  document
    .querySelectorAll<HTMLElement>("[data-ambient-desc]")
    .forEach((el) => {
      el.textContent = playing
        ? `正在播放「${meta.label}」，切页不断流`
        : "纯 Web Audio 合成，切页不断流";
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-ambient-pick]")
    .forEach((btn) => {
      const active = btn.dataset.ambientPick === activePreset;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
}

export function toggleAmbientAudio() {
  const meta = AMBIENT_META[activePreset];
  if (playing) {
    if (currentGraph) {
      fadeOutGraph(currentGraph, 0.32);
      currentGraph = null;
    }
    playing = false;
    syncAmbientButtons();
    toast(`已关闭${meta.label}白噪音`, "info");
    return;
  }

  if (!startPreset(activePreset)) return;
  syncAmbientButtons();
  toast(`已开启${meta.label}白噪音`, "info");
}

export function selectAmbientPreset(raw: string | undefined) {
  if (!isAmbientPreset(raw)) return;
  const changed = raw !== activePreset;
  activePreset = raw;
  savePreset(raw);

  const meta = AMBIENT_META[raw];
  if (playing) {
    if (changed) {
      startPreset(raw);
      toast(`已切换白噪音：${meta.label}`, "info");
    }
  } else {
    if (startPreset(raw)) {
      toast(`已开启${meta.label}白噪音`, "info");
    }
  }
  syncAmbientButtons();
}

export function resetAmbientPreset() {
  activePreset = "rain";
  savePreset("rain");
  if (playing) {
    if (currentGraph) {
      fadeOutGraph(currentGraph, 0.28);
      currentGraph = null;
    }
    playing = false;
  }
  syncAmbientButtons();
}
