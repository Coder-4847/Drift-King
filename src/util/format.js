/** 12.34 or 1:02.34 */
export function fmtTime(t) {
  if (!isFinite(t)) return '--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}
export const fmtScore = (n) => Math.round(n).toLocaleString('en-US');

const KEYNAMES = { Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'" };
/** Readable label for a KeyboardEvent.code (used in key bindings and hints). */
export const keyName = (code) => KEYNAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

