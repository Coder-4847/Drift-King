// Simple line-drawing minimap. Static track layer is drawn once into an offscreen canvas;
// per frame we only blit it and draw the car dots. North-up in the default camera
// orientation (screen right = world -x, screen up = world +z).

const clampv = (v, a, b) => Math.max(a, Math.min(b, v));

/** Draw a track outline into ctx (size x size css px). Returns the world->canvas transform. */
export function drawTrackPath(ctx, track, size, { line = '#ffffff', outline = 'rgba(0,0,0,0.55)', lineWidth = 3, pad = 8 } = {}) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < track.n; i++) {
    const u = -track.x[i], v = -track.z[i];
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  const scale = (size - pad * 2) / Math.max(maxU - minU, maxV - minV);
  const ox = (size - (maxU - minU) * scale) / 2 - minU * scale;
  const oy = (size - (maxV - minV) * scale) / 2 - minV * scale;
  const T = { scale, ox, oy, x: (wx) => -wx * scale + ox, y: (wz) => -wz * scale + oy };

  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < track.n; i += 2) {
      const px = T.x(track.x[i]), py = T.y(track.z[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    if (track.closed) ctx.closePath();
  };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = outline; ctx.lineWidth = lineWidth + 3; path(); ctx.stroke();
  ctx.strokeStyle = line; ctx.lineWidth = lineWidth; path(); ctx.stroke();

  // start / finish tick
  const sx = T.x(track.x[0]), sy = T.y(track.z[0]);
  const nx = -track.nx[0], ny = -track.nz[0];
  ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(sx - nx * 5, sy - ny * 5); ctx.lineTo(sx + nx * 5, sy + ny * 5); ctx.stroke();
  return T;
}

export class Minimap {
  constructor(root) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.track = null;
    addEventListener('resize', () => this.rebuild());
  }

  setTrack(track) { this.track = track; this.rebuild(); }

  rebuild() {
    if (!this.track) return;
    const css = this.canvas.clientWidth || 110;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.size = css;
    for (const c of [this.canvas, this.layer]) { c.width = Math.round(css * dpr); c.height = Math.round(css * dpr); }
    const lctx = this.layer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, css, css);
    this.T = drawTrackPath(lctx, this.track, css, { lineWidth: 3 });
    this.dpr = dpr;
  }

  /** cars: [{ x, z, color, big }] */
  draw(cars) {
    if (!this.T) return;
    const ctx = this.ctx, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    for (const c of cars) {
      ctx.fillStyle = c.color || '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(clampv(this.T.x(c.x), 0, this.size), clampv(this.T.y(c.z), 0, this.size), c.big ? 4.2 : 3, 0, 6.283);
      ctx.fill(); ctx.stroke();
    }
  }
}
