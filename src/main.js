import { Input } from './input/Input.js';
import { Game } from './game/Game.js';
import { TEST_TRACK } from './tracks/testTrack.js';

const params = new URLSearchParams(location.search);

const input = new Input(document.getElementById('touch'));
const game = new Game({
  canvas: document.getElementById('game'),
  hudRoot: document.getElementById('hud'),
  overlayRoot: document.getElementById('overlay'),
  input,
  debug: params.has('debug'),
});

game.loadTrack(TEST_TRACK);
game.start();
window.__game = game; // handy for console tuning / automated tests
