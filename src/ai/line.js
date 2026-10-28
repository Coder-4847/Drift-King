// Racing line: lateral offsets from the centreline that straighten the path (shortest path
// inside the road), which raises the radius of every corner. Computed once per track.

export function racingLine(track, margin = 2.4, iterations = 2500) {
  if (track._line) return track._line;
  const n = track.n, lim = track.halfWidth - margin;
  const off = new Float32Array(n);
  const px = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = track.x[i]; pz[i] = track.z[i]; }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = track.prev(i), b = track.next(i);
      const mx = (px[a] + px[b]) / 2, mz = (pz[a] + pz[b]) / 2;
      // project the averaged point back onto this sample's normal
      let o = (mx - track.x[i]) * track.nx[i] + (mz - track.z[i]) * track.nz[i];
      o = off[i] + (o - off[i]) * 1.6;           // over-relax: converges ~2x faster
      o = Math.max(-lim, Math.min(lim, o));
      off[i] = o;
      px[i] = track.x[i] + track.nx[i] * o;
      pz[i] = track.z[i] + track.nz[i] * o;
    }
  }
  // curvature of the line (+ = right turn, same convention as Track.curv), smoothed
  const curv = new Float32Array(n);
  const sp = track.length / n, K = 3;
  const ang = (i) => { const j = track.next(i); return Math.atan2(px[j] - px[i], pz[j] - pz[i]); };
  for (let i = 0; i < n; i++) {
    let d = ang((i + K) % n) - ang((i - K + n) % n);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    curv[i] = -d / (2 * K * sp);
  }
  track._line = { off, x: px, z: pz, curv };
  return track._line;
}
