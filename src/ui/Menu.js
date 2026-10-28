// Minimal overlay menu: a title and a vertical list of buttons. Works with mouse / touch
// (click) and with keyboard / controller (up, down, confirm, back via Input nav events).

export class Menu {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.el = null;
    this.items = [];
    this.index = 0;
    this.onBack = null;
    input.onNav((a) => this.nav(a));
  }

  get open() { return !!this.el; }

  show({ title, items, onBack = null }) {
    this.hide();
    this.items = items;
    this.onBack = onBack;
    this.index = 0;
    const el = document.createElement('div');
    el.className = 'menu';
    el.innerHTML = `<h1></h1>`;
    el.querySelector('h1').textContent = title;
    this.buttons = items.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.textContent = it.label;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // never take keyboard focus
      b.addEventListener('click', () => { this.index = i; this.activate(); });
      b.addEventListener('pointerenter', () => { this.index = i; this.paint(); });
      el.appendChild(b);
      return b;
    });
    const p = this.input.prompts();
    const hint = document.createElement('div');
    hint.className = 'prompt';
    hint.textContent = this.input.device === 'touch' ? '' : `${p.confirm} to select  ·  ${p.back} to go back`;
    el.appendChild(hint);
    this.root.appendChild(el);
    this.el = el;
    this.paint();
  }

  hide() {
    if (this.el) this.el.remove();
    this.el = null;
  }

  paint() { this.buttons?.forEach((b, i) => b.classList.toggle('focus', i === this.index)); }

  activate() { this.items[this.index]?.action?.(); }

  nav(action) {
    if (!this.el) return;
    const n = this.items.length;
    if (action === 'up') this.index = (this.index - 1 + n) % n;
    else if (action === 'down') this.index = (this.index + 1) % n;
    else if (action === 'confirm') return this.activate();
    else if (action === 'back') return this.onBack?.();
    this.paint();
  }
}
