// Debug screen: a minimap tile for every track with its stats and a live geometry check.
// Open with ?preview ; click a tile to drive that track (?track=id).

import { CHAPTERS } from '../data/chapters.js';
import { allTracks, getTrackDef } from '../tracks/trackDefs.js';
import { Track } from '../tracks/Track.js';
import { checkGeometry } from '../tracks/validate.js';
import { drawTrackPath } from './Minimap.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function showTrackPreview(root) {
  const el = document.createElement('div');
  el.className = 'preview';
  const specs = allTracks();
  el.innerHTML = `<header><h1>Track preview <small>${specs.length} tracks</small></h1><div class="chips"></div><div class="summary"></div></header><div class="grid"></div>`;
  root.appendChild(el);
  const chips = el.querySelector('.chips'), grid = el.querySelector('.grid'), summary = el.querySelector('.summary');
  let filter = 'all';
  let bad = 0;
  const names = new Set();

  const tiles = specs.map((spec) => {
    const def = getTrackDef(spec.id);
    const track = new Track(def);
    const geo = checkGeometry(track);
    if (!geo.ok) bad++;
    if (names.has(spec.name)) bad++;
    names.add(spec.name);
    const tile = document.createElement('a');
    tile.className = 'tile' + (geo.ok ? '' : ' bad');
    tile.href = `?track=${spec.id}`;
    const ch = CHAPTERS[spec.chapter];
    const canvas = document.createElement('canvas');
    const S = 180, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = S * dpr; canvas.height = S * dpr; canvas.style.width = S + 'px'; canvas.style.height = S + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = hex(ch.theme.ground); ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1;
    drawTrackPath(ctx, track, S, { lineWidth: 4, line: '#fff' });
    tile.appendChild(canvas);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<b>${spec.id.toUpperCase()}</b> ${spec.name}<br>` +
      `${spec.kind === 'gp' ? 'Grand Prix' : ch.name}<br>` +
      `${spec.length} m · R ${spec.minRadius} m · w ${def.width.toFixed(1)}<br>` +
      `bot ${spec.ref.toFixed(1)} s · ${spec.laps} lap${spec.laps > 1 ? 's' : ''}${def.iceZones.length ? ' · ice' : ''}<br>` +
      (geo.ok ? '<span class="ok">✓ valid</span>' : `<span class="no">✗ ${geo.reasons.join(', ')}</span>`);
    tile.appendChild(info);
    grid.appendChild(tile);
    return { spec, tile };
  });

  const apply = () => {
    for (const { spec, tile } of tiles) {
      const show = filter === 'all' || (filter === 'gp' ? spec.kind === 'gp' : spec.kind === 'career' && spec.chapter === filter);
      tile.style.display = show ? '' : 'none';
    }
    chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === String(filter)));
  };
  const chip = (label, f) => {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.f = String(f);
    b.addEventListener('click', () => { filter = f; apply(); });
    chips.appendChild(b);
  };
  chip('All', 'all');
  CHAPTERS.forEach((c, i) => chip(`${i + 1}`, i));
  chip('GP', 'gp');
  summary.textContent = bad === 0 ? `All ${specs.length} tracks pass the geometry checks; all names unique.` : `${bad} problem(s) - see red tiles.`;
  apply();
}
