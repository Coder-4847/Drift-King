import { Input } from './input/Input.js';
import { Game } from './game/Game.js';
import { showTrackPreview } from './ui/TrackPreview.js';

const params = new URLSearchParams(location.search);

if (params.has('preview')) {
  // debug: minimap of every track
  showTrackPreview(document.body);
} else {
  const input = new Input(document.getElementById('touch'));
  const game = new Game({
    canvas: document.getElementById('game'),
    hudRoot: document.getElementById('hud'),
    overlayRoot: document.getElementById('overlay'),
    input,
    debug: params.has('debug'),
  });

  if (params.has('at')) game.debugStart = parseFloat(params.get('at')); // debug: start part-way round
  game.loadTrack(params.get('track') || 'c1l1');
  game.start();
  window.__game = game; // handy for console tuning / automated tests
}
