// Screen host with focus navigation. One screen is open at a time. Every interactive element
// has class "fx"; up / down / left / right (keyboard, controller) move focus to the nearest
// element in that direction, confirm clicks the focused one, back / pause call screen.onBack.
// Mouse and touch just click.

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** A focusable button. */
export function button(label, onClick, cls = '') {
  const b = el('button', `fx btn ${cls}`);
  b.type = 'button';
  b.tabIndex = -1;
  b.innerHTML = label;
  b.addEventListener('mousedown', (e) => e.preventDefault()); // never take real keyboard focus
  b.addEventListener('click', () => { if (!b.classList.contains('disabled')) onClick?.(b); else b.dispatchEvent(new CustomEvent('denied')); });
  return b;
}

export class UI {
  constructor(root) {
    this.root = root;
    this.cur = null;
    this.focused = null;
  }

  get isOpen() { return !!this.cur; }

  /** screen: { el, onBack?, onFocus?(el), autofocus?: element } */
  open(screen) {
    this.close();
    this.cur = screen;
    this.root.appendChild(screen.el);
    screen.el.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = e.target.closest?.('.fx');
      if (t && t !== this.focused) this.setFocus(t);
    });
    const first = screen.autofocus || this.list()[0];
    if (first) this.setFocus(first);
  }

  close() {
    if (this.cur) this.cur.el.remove();
    this.cur = null;
    this.focused = null;
  }

  list() {
    if (!this.cur) return [];
    return [...this.cur.el.querySelectorAll('.fx')].filter((e) => e.offsetParent !== null || e.getClientRects().length);
  }

  setFocus(e) {
    if (this.focused) this.focused.classList.remove('focus');
    this.focused = e;
    e.classList.add('focus');
    e.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.cur?.onFocus?.(e);
  }

  /** Re-focus after a screen re-rendered part of itself. */
  refocus(prefer) {
    const list = this.list();
    this.setFocus(prefer && list.includes(prefer) ? prefer : list[0]);
  }

  nav(action) {
    if (!this.cur) return false;
    if (action === 'back' || action === 'pause') { this.cur.onBack?.(); return true; }
    if (action === 'confirm') { this.focused?.click(); return true; }
    const list = this.list();
    if (!list.length) return true;
    if (!this.focused || !list.includes(this.focused)) { this.setFocus(list[0]); return true; }
    const c0 = center(this.focused.getBoundingClientRect());
    let best = null, bestScore = Infinity;
    for (const e of list) {
      if (e === this.focused) continue;
      const c = center(e.getBoundingClientRect());
      const dx = c.x - c0.x, dy = c.y - c0.y;
      const main = action === 'left' ? -dx : action === 'right' ? dx : action === 'up' ? -dy : dy;
      if (main < 4) continue;
      const perp = action === 'left' || action === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = main + perp * 2.5;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) this.setFocus(best);
    return true;
  }
}
