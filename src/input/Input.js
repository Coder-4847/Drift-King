// One small input layer. Every device is reduced to { steer: -1..1, brake: 0..1 }
// (steer < 0 = left). Player, AI and replays all consume this same shape.
// Menu navigation is exposed separately as 'nav' events.

import { Keyboard } from './keyboard.js';
import { Gamepad } from './gamepad.js';
import { TouchControls } from './touch.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor(touchRoot) {
    this.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this.padKind = 'xbox'; // 'xbox' | 'playstation' | 'generic'
    this.navListeners = new Set();
    this.deviceListeners = new Set();

    this.keyboard = new Keyboard(this);
    this.gamepad = new Gamepad(this);
    this.touch = new TouchControls(touchRoot, this);

    this.steerDigital = 0; // eased value for keys / touch buttons
    this.out = { steer: 0, brake: 0 };

    // Any real touch switches to touch controls, even on hybrid laptops.
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setDevice('touch');
      else if (e.pointerType === 'mouse') this.setDevice('keyboard');
    }, { capture: true });
  }

  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    for (const cb of this.deviceListeners) cb(d);
  }

  onDevice(cb) { this.deviceListeners.add(cb); return () => this.deviceListeners.delete(cb); }
  onNav(cb) { this.navListeners.add(cb); return () => this.navListeners.delete(cb); }
  emitNav(action) { for (const cb of this.navListeners) cb(action); }

  // Show the touch buttons only while racing on a touch device.
  setTouchVisible(v) { this.touch.setVisible(v && this.device === 'touch'); }

  // Call once per frame. Returns the shared out object (do not keep a reference past the frame).
  update(dt) {
    this.gamepad.poll();

    const left = this.keyboard.left || this.touch.left;
    const right = this.keyboard.right || this.touch.right;
    const target = (right ? 1 : 0) - (left ? 1 : 0);

    // Eased digital steering: quick to build, a bit quicker to centre.
    const cur = this.steerDigital;
    let rate = target === 0 ? 11 : 7.5;
    if (target !== 0 && Math.sign(cur) === -target) rate = 16; // fast reversal
    const diff = target - cur;
    this.steerDigital = cur + Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);

    const analog = this.gamepad.steer;
    const steer = Math.abs(analog) > Math.abs(this.steerDigital) ? analog : this.steerDigital;
    const brake = Math.max(this.keyboard.brake ? 1 : 0, this.touch.brake ? 1 : 0, this.gamepad.brake);

    this.out.steer = clamp(steer, -1, 1);
    this.out.brake = clamp(brake, 0, 1);
    return this.out;
  }

  // Button prompts matching the last used device (for hints and menus).
  prompts() {
    if (this.device === 'gamepad') {
      const ps = this.padKind === 'playstation';
      return {
        confirm: ps ? '✕' : 'A', back: ps ? '○' : 'B', pause: ps ? 'Options' : 'Start',
        steer: 'Left stick', brake: ps ? '✕ / R2' : 'A / RT',
      };
    }
    if (this.device === 'touch') {
      return { confirm: 'Tap', back: 'Back', pause: 'Pause', steer: 'Left / Right buttons', brake: 'Brake button' };
    }
    return { confirm: 'Enter', back: 'Backspace', pause: 'Esc', steer: 'A / D or ← →', brake: 'Space' };
  }
}
