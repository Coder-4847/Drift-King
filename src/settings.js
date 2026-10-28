// Persistent settings + save data in localStorage. Every access is wrapped in try/catch
// so the game still runs in private windows or with storage blocked.

const KEY = 'driftkings.v1';

const DEFAULTS = {
  settings: {
    sfxVolume: 0.8,
    musicVolume: 0.5,
    touchLayout: 'corners',   // 'corners' | 'halves'
    buttonSize: 1,            // 0.7 .. 1.4
    buttonOpacity: 0.55,      // 0.2 .. 1
    deadzone: 0.12,
    sensitivity: 1,
    vibration: true,
    quality: 'high',          // 'low' | 'medium' | 'high'
    keys: {
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      brake: ['Space', 'KeyS', 'ArrowDown'],
    },
  },
  progress: {
    hintsSeen: false,
    career: { stars: {}, best: {}, drift: {} },   // keyed by level id, e.g. "c3l5"
    gp: { best: {}, rewards: {} },                // best[trackId][difficultyId] = { pos, points, time }; rewards[difficultyId] = true
  },
};

let data = clone(DEFAULTS);

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = merge(clone(DEFAULTS), JSON.parse(raw));
} catch { /* storage unavailable */ }

export const settings = data.settings;
export const progress = data.progress;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function resetAll() {
  const fresh = clone(DEFAULTS);
  merge(settings, fresh.settings);
  merge(progress, fresh.progress);
  save();
}
