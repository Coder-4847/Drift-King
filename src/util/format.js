/** 12.34 or 1:02.34 */
export function fmtTime(t) {
  if (!isFinite(t)) return '--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}
export const fmtScore = (n) => Math.round(n).toLocaleString('en-US');
