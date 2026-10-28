import { settings } from '../settings.js';

const NAV = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', NumpadEnter: 'confirm', Backspace: 'back',
  Escape: 'pause', KeyP: 'pause',
};

export class Keyboard {
  constructor(input) {
    this.input = input;
    this.down = new Set();
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.down.clear());
  }

  held(action) { return settings.keys[action].some((c) => this.down.has(c)); }
  get left() { return this.held('left'); }
  get right() { return this.held('right'); }
  get brake() { return this.held('brake'); }

  onKey(e, isDown) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const bound = ['left', 'right', 'brake'].some((a) => settings.keys[a].includes(e.code));
    if (bound || NAV[e.code]) e.preventDefault();
    if (isDown) {
      this.input.setDevice('keyboard');
      if (!e.repeat) {
        this.down.add(e.code);
        const nav = NAV[e.code];
        if (nav) this.input.emitNav(nav);
        if (e.code === 'Space') this.input.emitNav('confirm');
      }
    } else {
      this.down.delete(e.code);
    }
  }
}
