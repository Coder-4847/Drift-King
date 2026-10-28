import { Input } from './input/Input.js';
import { Game } from './game/Game.js';
import { App } from './App.js';
import { settings } from './settings.js';
import { levelById } from './game/career.js';
import { showTrackPreview } from './ui/TrackPreview.js';

const params = new URLSearchParams(location.search);

if (params.has('preview')) {
  // debug: minimap of every track
  showTrackPreview(document.body);
} else {
  if (params.has('layout')) settings.touchLayout = params.get('layout') === 'halves' ? 'halves' : 'corners';

  const input = new Input(document.getElementById('touch'));
  let app;
  const game = new Game({
    canvas: document.getElementById('game'),
    hudRoot: document.getElementById('hud'),
    input,
    debug: params.has('debug'),
    onPauseButton: () => app.pause(),
    onAutoPause: () => app.pause(),
  });
  app = new App({ game, input, overlayRoot: document.getElementById('overlay') });

  if (params.has('at')) game.debugStart = parseFloat(params.get('at')); // debug: start part-way round
  game.loadTrack('c1l1');
  game.start();

  const track = params.get('track');
  if (track) {
    if (levelById(track)) app.startCareerRace(track);
    else if (track.startsWith('gp')) app.startGpRace(track, Math.max(0, Math.min(4, parseInt(params.get('diff') ?? '2', 10)))); // &diff=0..4
    else app.startFreeRace(track);
  } else {
    app.openMainMenu();
  }
  window.__game = game; window.__app = app; // handy for console tuning / automated tests
}
