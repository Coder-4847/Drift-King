// On-screen buttons: Left, Right, Brake. Pointer events give us multi-touch for free
// (turn + brake at the same time). Two layouts: 'corners' and 'halves'.

import { settings } from '../settings.js';

const ICONS = {
  left: '<svg viewBox="0 0 64 64"><path d="M40 12 20 32l20 20" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 64 64"><path d="M24 12l20 20-20 20" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // brake pedal: tilted pad with grip ridges
  brake: '<svg viewBox="0 0 64 64"><g transform="rotate(-12 32 32)"><rect x="19" y="10" width="26" height="44" rx="9" fill="#fff"/>' +
    '<g stroke="#2a2a2a" stroke-width="3.5" stroke-linecap="round" opacity=".55"><path d="M25 21h14M25 29h14M25 37h14M25 45h14"/></g></g></svg>',
};

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.left = false;
    this.right = false;
    this.brake = false;
    this.pointers = { left: new Set(), right: new Set(), brake: new Set() };
    this.visible = false;
    this.build();
    // Stop the browser's own gestures / menus on the whole control layer.
    for (const ev of ['contextmenu', 'gesturestart', 'selectstart', 'dblclick']) {
      root.addEventListener(ev, (e) => e.preventDefault());
    }
    addEventListener('blur', () => this.releaseAll());
  }

  build() {
    this.releaseAll();
    const r = this.root;
    r.innerHTML = '';
    r.className = `touch layout-${settings.touchLayout}` + (this.visible ? '' : ' hidden');
    r.style.setProperty('--btn-scale', settings.buttonSize);
    r.style.setProperty('--btn-alpha', settings.buttonOpacity);

    const make = (name, cls) => {
      const el = document.createElement('div');
      el.className = `tbtn ${cls} ${name}`;
      el.innerHTML = `<span class="ico">${ICONS[name]}</span>`;
      this.bind(el, name);
      r.appendChild(el);
      return el;
    };
    make('left', 'steer');
    make('right', 'steer');
    make('brake', 'brakebtn');
  }

  bind(el, name) {
    const set = this.pointers[name];
    const down = (e) => {
      e.preventDefault();
      set.add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this[name] = true;
      el.classList.add('pressed');
      if (settings.vibration && navigator.vibrate) navigator.vibrate(name === 'brake' ? 14 : 8);
    };
    const up = (e) => {
      set.delete(e.pointerId);
      if (set.size === 0) { this[name] = false; el.classList.remove('pressed'); }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  releaseAll() {
    for (const k of ['left', 'right', 'brake']) { this.pointers[k].clear(); this[k] = false; }
    this.root.querySelectorAll?.('.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) this.releaseAll();
  }

  // Call after settings (layout / size / opacity) change.
  refresh() { this.build(); }
}
