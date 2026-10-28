# Drift Kings

Top-down 3D drifting racer for the browser (Three.js + Vite, plain JavaScript, no external assets).
Everything - meshes, particles, sounds - is generated in code. Progress is saved in `localStorage`.

> **Status: Phase 1 (Foundation) done.** Later phases add the track system, Career, Grand Prix,
> audio / garage / settings UI and the GitHub Pages deploy.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173   (add ?debug for an on-screen debug readout)
npm run build      # production build in dist/
npm run sim        # headless handling check of the car physics (tools/sim.js)
```

## Controls (three inputs only: Left, Right, Brake)

The car accelerates by itself. Hold **Brake while turning** to drift; release to get a mini-turbo.
A short brake tap before a corner kicks the tail out.

| Device | Steer | Brake | Menus |
|---|---|---|---|
| Keyboard / mouse | `A` `D` or `←` `→` | `Space`, `S` or `↓` | arrows + `Enter`, `Backspace` back, `Esc`/`P` pause, mouse clicks |
| Controller | left stick or D-pad | `A`/`✕`, `X`/`□`, `RT`, `LT` or `RB` | D-pad/stick, `A` confirm, `B` back, `Start` pause |
| Touch | on-screen left / right buttons | round brake button (bottom centre) | tap |

The active device is detected automatically and can change at any time. Touch buttons are
multi-touch (turn + brake together) and vibrate on press when supported.
The touch layout (`corners` or `halves`) is `touchLayout` in `src/settings.js` until the Settings
screen lands in Phase 5.

## Code layout

```
src/config.js      all handling / camera / quality constants (start here to tune the feel)
src/settings.js    settings + save data (localStorage)
src/input/         one input layer -> { steer: -1..1, brake: 0..1 }; keyboard, gamepad, touch
src/game/          Car physics (pure maths), car model, camera rig, particles, world, game loop
src/tracks/        Track (spline -> samples + queries), TrackBuilder (meshes), test track data
src/ui/            HUD, overlay menu
src/data/          cars (levels, chapters, difficulty land in later phases)
tools/             headless helpers (sim.js, trackinfo.js)
```

## Tuning

* **Handling:** `CAR` in `src/config.js` (max speed, accel, grip, drift grip, brake strength, steering
  speed, boost). Per-car overrides go in `src/data/cars.js`. `npm run sim` prints speed / slip angle for
  scripted inputs so you can see the effect of a change without playing.
* **Camera:** `CAMERA` in `src/config.js`. **Quality presets:** `QUALITY`.

## Decisions / assumptions (ambiguities resolved the simple way)

* No reference screenshot was attached to the brief, so the look follows the written style description.
* The camera swings to face the direction of travel (not north-up), so "left" and "right" always
  match the screen.
* One metre = one world unit; the car is ~4.3 m long and tracks are ~13 m wide.
* The brake is the only way to start a drift. Braking while sliding is deliberately weak so the slide is
  sustained rather than killing speed.
* Walls sit ~9 m beyond the road edge (grass in between slows you down); hitting them bounces gently.
