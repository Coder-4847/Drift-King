// Ghost replay of your best career run: position + heading sampled at 10 Hz, packed into an
// Int16 array (6 bytes per sample, ~5 KB for a minute) and stored as base64 in its own
// localStorage key, so it never bloats the main save.

const KEY = 'driftkings.ghosts.v1';
const RATE = 10; // samples per second

function b64encode(i16) {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(str) {
  const s = atob(str);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class GhostRecorder {
  constructor() { this.data = []; this.next = 0; }
  /** Call every frame with the race clock. */
  sample(t, car) {
    while (this.next <= t) {
      this.data.push(Math.round(car.x * 10), Math.round(car.z * 10), Math.round(wrap(car.heading) * 10000));
      this.next += 1 / RATE;
    }
  }
  pack() { return b64encode(Int16Array.from(this.data)); }
}

export class GhostPlayer {
  constructor(packed) { this.d = b64decode(packed); this.n = this.d.length / 3; }
  /** Interpolated state at race time t, or null if the ghost has no data. */
  at(t, out = { x: 0, z: 0, heading: 0 }) {
    if (!this.n) return null;
    const f = Math.max(0, t) * RATE;
    const i = Math.min(this.n - 1, Math.floor(f)), j = Math.min(this.n - 1, i + 1), k = Math.min(1, f - i);
    const d = this.d;
    out.x = (d[i * 3] + (d[j * 3] - d[i * 3]) * k) / 10;
    out.z = (d[i * 3 + 1] + (d[j * 3 + 1] - d[i * 3 + 1]) * k) / 10;
    const a = d[i * 3 + 2] / 10000, b = d[j * 3 + 2] / 10000;
    out.heading = a + wrap(b - a) * k;
    return out;
  }
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function loadGhost(id) {
  const g = readAll()[id];
  return g ? new GhostPlayer(g.d) : null;
}

export function saveGhost(id, time, packed) {
  const all = readAll();
  all[id] = { t: time, d: packed };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota: just skip the ghost */ }
}
