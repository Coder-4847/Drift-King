import { settings } from '../settings.js';

// Standard mapping: 0=A/Cross 1=B/Circle 2=X/Square 5=RB 6=LT 7=RT 9=Start 12-15=D-pad
const BRAKE_BUTTONS = [0, 2, 5, 6, 7];

export class Gamepad {
  constructor(input) {
    this.input = input;
    this.steer = 0;
    this.brake = 0;
    this.prev = {};
    this.navAxisDir = 0;
    addEventListener('gamepadconnected', () => { /* picked up by poll() */ });
  }

  active() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  poll() {
    const p = this.active();
    if (!p) { this.steer = 0; this.brake = 0; return; }

    const btn = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    const pressed = (i) => !!(p.buttons[i] && p.buttons[i].pressed);

    const dz = settings.deadzone;
    const ax = applyDeadzone(p.axes[0] || 0, dz, settings.sensitivity);
    const dpad = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
    this.steer = dpad !== 0 ? dpad : ax;

    let brake = 0;
    for (const i of BRAKE_BUTTONS) brake = Math.max(brake, btn(i));
    this.brake = brake > 0.15 ? brake : 0;

    // Device switch + controller kind
    const any = p.buttons.some((b) => b.pressed) || Math.abs(p.axes[0] || 0) > 0.5 || Math.abs(p.axes[1] || 0) > 0.5;
    if (any) {
      this.input.emitActivity();
      this.input.setDevice('gamepad');
      const id = (p.id || '').toLowerCase();
      this.input.padKind = /playstation|dualshock|dualsense|054c/.test(id) ? 'playstation'
        : /xbox|xinput|045e/.test(id) ? 'xbox' : 'generic';
    }

    // Menu navigation (edge triggered)
    const edge = (name, now) => {
      const was = this.prev[name]; this.prev[name] = now; return now && !was;
    };
    const ay = p.axes[1] || 0;
    if (edge('up', pressed(12) || ay < -0.6)) this.input.emitNav('up');
    if (edge('down', pressed(13) || ay > 0.6)) this.input.emitNav('down');
    if (edge('left', pressed(14) || (p.axes[0] || 0) < -0.6)) this.input.emitNav('left');
    if (edge('right', pressed(15) || (p.axes[0] || 0) > 0.6)) this.input.emitNav('right');
    if (edge('confirm', pressed(0))) this.input.emitNav('confirm');
    if (edge('back', pressed(1))) this.input.emitNav('back');
    if (edge('pause', pressed(9))) this.input.emitNav('pause');
  }
}

function applyDeadzone(v, dz, sens) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  return Math.sign(v) * Math.min(1, Math.pow(n, 1 / Math.max(0.3, sens)));
}
