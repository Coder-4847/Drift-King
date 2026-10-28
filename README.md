# Drift Kings

Top-down 3D drifting racer for the browser (Three.js + Vite, plain JavaScript, no external assets).
Everything - meshes, particles, sounds - is generated in code. Progress is saved in `localStorage`.

> **Status: all 6 phases done**, then reworked: drift handling, off-road = loss, new tracks, crash / loss screen.
> Play it: https://coder-4847.github.io/Drift-King/

## Run it

```bash
npm install
npm run dev        # http://localhost:5173   (add ?debug for an on-screen debug readout)
npm run build      # production build in dist/
npm run sim        # headless handling check: speed / slip angle for scripted inputs (tools/sim.js)
npm run tracks     # (re)generate src/data/tracks.js: finds a valid seed for all 110 tracks
npm run verify     # re-check all 110 tracks (geometry, bot lap, unique names)
npm run levels     # (re)generate the star times in src/data/levels.js from bot reference times
npm run aitune     # how fast is each AI difficulty vs the reference lap (compare with the `pace` column)
npm run gpsim -- gp5 3   # headless 6-car race on a GP track at a difficulty (0-4)
npm run human      # can a human-limited driver (reaction delay, keyboard steering) finish every track?  [delay] [analog]
npm test           # career rules, laps/checkpoints, all 110 tracks, Grand Prix AI races, ghost, human-limited driver
```

### Debug URLs

| URL | What it does |
|---|---|
| `/?track=c3l5` | drive a specific track (`c<chapter>l<level>` for Career, `gp<chapter>` for Grand Prix) |
| `/?track=c3l5&at=0.4` | start 40% of the way round (handy to look at a corner or an ice patch) |
| `/?preview` | minimap of all 110 tracks with stats and a live validity check; click a tile to drive it |
| `&debug` | on-screen speed / slip / grip readout |
| `?track=c3l5` | skips the menus and starts that Career level (leave the road to see the crash + loss screen) |
| `?track=gp4&diff=3` | skips the menus and starts a Grand Prix race (`diff` 0 Rookie ... 4 Legendary) |

## Deploy (GitHub Pages)

* `vite.config.js` uses `base: './'`, so the same build works at `https://<user>.github.io/<repo>/` or any other path.
* `.github/workflows/deploy.yml` runs `npm test`, `npm run build` and publishes `dist/` on every push to `main`
  (the Pages environment only accepts `main`) and on manual runs (Actions -> Deploy to GitHub Pages -> Run workflow).
* **One-time setup:** repository **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
* Manual deploy without Actions: `npm run build`, then publish the `dist/` folder with any static host.
* Local preview of the production build: `npm run build && npm run preview`.

## Controls (three inputs only: Left, Right, Brake)

The car accelerates by itself and **drifting is the way you take corners**:

* **Steer hard at speed** and the tail lets go. A slide is unstable: the angle wants to keep growing, so you
  **counter-steer to hold it** (steer back against the slide to reduce the angle, into the turn to add more).
  The slide angle sets how tight the car turns. Too much angle and you spin out.
* **Brake is the recovery tool**: use it to slow for a very tight corner or to save a spin. It sheds speed and
  pulls the nose back in line (and cancels the drift). It is not how you start a drift.
* A controlled slide earns **drift score**; straightening out after a long one gives a **mini-turbo**.
* **Leave the road and you lose.** The run ends with a slow-motion crash and the loss screen (Retry / Menu).
  A red glow at the screen edge warns you when you are near the road edge or about to spin.

| Device | Steer | Brake | Menus |
|---|---|---|---|
| Keyboard / mouse | `A` `D` or `←` `→` | `Space`, `S` or `↓` | arrows + `Enter`, `Backspace` back, `Esc`/`P` pause, mouse clicks |
| Controller | left stick or D-pad | `A`/`✕`, `X`/`□`, `RT`, `LT` or `RB` | D-pad/stick, `A` confirm, `B` back, `Start` pause |
| Touch | on-screen left / right buttons | round brake button (bottom centre) | tap |

The active device is detected automatically and can change at any time. Touch buttons are
multi-touch (turn + brake together) and vibrate on press when supported.
Touch layout, button size / opacity, vibration, controller deadzone / sensitivity and the keyboard bindings
are in **Settings**.

## Code layout

```
src/config.js      all handling / camera / quality constants (start here to tune the feel)
src/settings.js    settings + save data (localStorage)
src/input/         one input layer -> { steer: -1..1, brake: 0..1 }; keyboard, gamepad, touch
src/game/          Car physics (pure maths), GridRace (multi-car race, standings), collisions, Race (laps),
                   career / gp (progress + rules), car model, camera rig, particles, world, game loop
src/tracks/        Track (spline -> samples + queries), TrackBuilder (meshes), generator (seeded),
                   validate (geometry + bot lap), trackDefs (seed -> track definition)
src/ai/            Driver (AI / bot, steer + brake only), line (racing line)
src/audio/         Web Audio engine (engine / tyre / effects synths) + music sequencer (styles in src/data/music.js)
src/ui/            HUD, minimap, UI host (focus navigation), screens (menus, level select, results, settings, garage ...)
src/App.js         game flow: menus <-> races, career results
src/data/          chapters (themes, props, name words), tracks (generated seeds), levels (star times),
                   difficulty (AI table, points, rivals), cars (+ paint rewards)
tools/             headless helpers: sim.js (handling), buildTracks.js / verifyTracks.js / buildLevels.js,
                   aitune.js / gpsim.js (AI), and the test scripts run by `npm test`
```

## Track system (Phase 2)

* **Data -> track:** `src/data/tracks.js` holds one entry per track (id, name, seed, laps, length, bot
  reference time). `trackDefs.js` re-creates the control points deterministically from the seed
  (points are rounded to 0.1 m so every device gets the same track), `Track` turns them into a closed
  Catmull-Rom centreline sampled every 2 m, and `TrackBuilder` makes the road, edge lines, curbs (outside
  of corners), start line, ice patches, walls and the green racing-line chevrons.
* **Generator** (`src/tracks/generator.js`): a turtle walk of corners (arcs) and straights. Corner radius, angle,
  S-bend / hairpin / chicane counts and straight lengths come from per-chapter styles and a difficulty ramp
  (`paramsFor()`); the corner angles are adjusted to a net 360 degrees and the straight lengths solved by least
  squares so the loop closes. Most of each track is drift-sized corners. Bad loops (self-crossing, too tight) are
  rejected and the next seed tried.
* **Stored points:** `npm run tracks` writes the final control points (and ice patches, width) into
  `src/data/tracks.js` so every browser gets *exactly* the same track (no float differences between engines);
  `npm run verify` also checks the stored points still equal what the generator makes from the seed.
* **Validation** (`src/tracks/validate.js`, run by `npm run tracks` / `npm run verify`): corner radius >= 16 m,
  width >= 10.5 m, length 600-2200 m, walls of distant road never touch, and bots must finish **without ever
  leaving the road**: a *drift bot* (the reference run, must also really drift) and a *cautious grip bot* that
  never drifts and just brakes for corners. A third check (`npm run human`) drives with a human's limits.
* **Laps / checkpoints** (`src/game/Race.js`): progress is the unwrapped distance along the centreline;
  checkpoints must be passed in order, reversing never counts, and driving against the road direction for
  ~0.7 s shows "WRONG WAY". Career laps are chosen so a run is ~30-90 s (`laps` in the data file).
* **Themes** (`src/data/chapters.js`): ground / sky / haze / light colours, curbs, walls, chevrons, props
  (pines, snow pines, round trees, palms, cacti, mesas, dunes, rocks, dead trees, poles, lamps with light
  pools, neon signs, buildings with lit windows, containers, cranes) and the name word lists.
  Frostbite Pass also has **ice patches** (40% grip) on gentle sections. Edit `props` to change density.
* **Minimap:** simple line drawing in the HUD corner (north-up, start line in red).
* **Names:** every track gets a "First Second" name (or a single word) from its chapter's lists, unique
  across all 110.

## Career (Phase 3)

* **Flow:** Main menu -> Career -> chapter tabs + 10-level grid -> pre-race card (name, laps, the three
  medal times, your best) -> 3-2-1-GO -> race -> result screen (time, best, animated stars, drift score,
  Retry / Next / Menu). Pause has Resume / Restart / Quit.
* **Stars:** each level has `gold` (3 stars), `silver` (2 stars) and `bronze` (1 star) times in
  `src/data/levels.js`; the time is the whole run including all laps. They come from bot runs (`npm run levels`):
  gold = drift bot x 1.30 on level 1 easing to x 1.12 on level 100, silver x 1.65 -> 1.36, and bronze is the
  larger of (x 2.1 -> 1.7) and 1.1x the time of the cautious grip bot, so anyone who can finish without leaving the
  road gets at least one star. Drifting is worth a lot: the grip bot is about 1.3-2.1x slower. **These are
  first guesses made without human play-testing** - edit `levels.js` (plain data) or the factors at the top of
  `tools/buildLevels.js`.
* **Unlocks:** finishing with >= 1 star unlocks the next level of the chapter. Chapter N needs
  `20 x (N - 1)` total stars (`starsToUnlock` in `src/data/chapters.js`); locked chapters show a
  "34 / 40 stars to unlock Chapter 3" progress bar. Rules + progress live in `src/game/career.js`.
* **Saving:** `localStorage` key `driftkings.v1` (stars, best times, best drift scores per level, settings).
  Settings -> Reset progress erases it (settings are kept).
* **Menus on every device:** one focus system (`src/ui/UI.js`): mouse / touch click, keyboard arrows + Enter /
  Backspace / Esc, controller D-pad or stick + A / B / Start. Menu prompts follow the last used device.

## Grand Prix (Phase 4)

* **Flow:** Main menu -> Grand Prix -> difficulty tabs (Rookie ... Legendary) + 10 tracks (all unlocked) ->
  pre-race card -> 3-2-1-GO from a 6-car grid (you start 4th) -> 3 laps -> results table with points.
  HUD: position (`4th/6`), lap counter and a live standings list. Retry / Next track / Menu afterwards.
* **Points:** 25-18-15-12-10-8 (`POINTS` in `src/data/difficulty.js`). Best finish per track and difficulty
  is saved. When you finish, rivals still racing are classified by distance covered (their time is an
  estimate, shown with `~`).
* **Rewards:** your first win on a difficulty unlocks a car paint (`REWARD_COLORS` in `src/data/cars.js`:
  Rookie Mint, Amateur Sky, Pro Amber, Expert Magenta, Legendary Gold). The Garage (Phase 5) lets you use them.
* **AI** (`src/ai/Driver.js`) uses exactly the player's inputs (steer + brake, shared physics). It steers the
  car's *velocity* along the track (an optional optimised racing line, `src/ai/line.js`): it works out how fast the
  direction of travel must turn, converts that to the slip angle needed and counter-steers to hold it. **Style
  `drift`** slides corners tighter than the grip limit; **style `grip`** brakes for them. It looks 130 m ahead for
  corners and brakes, steers around slower cars (staying inside the road), is bumped by contact, catches a slide
  that is about to become a spin with the brake, and if it does leave the road it is put back on it (a rival just
  loses time, only *you* lose the race).
* **Difficulty table** (`src/data/difficulty.js`, one row per level): `speed`, `cornerEntry` (how much of the
  car's cornering capacity it trusts), `brakeSkill`, `line`, `drift` (>= 0.5 = drift style), `steerNoise`,
  `mistake` (late brake / running wide at a braking zone), `reaction` (input delay), `rubber` (rubber-banding: slows
  the AI when far ahead of you, a little faster when far behind; 0 on Legendary), `bump`. `npm run aitune` prints
  each level's solo pace relative to the reference lap: ~1.51 / 1.27 / 1.12 / 1.04 / 0.97 (Rookie ... Legendary).
  Legendary is a little faster than the reference lap, so beating it takes a clean, near-perfect run.
* **Car-to-car bumps** (`src/game/collisions.js`): each car is two circles; overlaps are pushed apart gently
  and speed is only partly cancelled, plus a small spin. No wrecks.
* **Headless race engine:** `GridRace` runs the same logic without rendering, which is how
  `tools/gptest.js` checks every AI finishes 3 laps on all 10 tracks at Rookie / Pro / Legendary.
* The car keeps 30% steering authority at a standstill (`steerMinFactor`) so it can never be stuck facing a wall.

## Polish (Phase 5)

* **Audio** (`src/audio`): everything is synthesised with Web Audio, no files. The audio context starts on the
  first key / tap / controller press (browser autoplay rules). Engine tone that shifts through 5 "gears" with
  speed, tyre squeal while sliding, countdown beeps + GO, boost whoosh, wall thud, bump, lap ping, star jingle
  (timed to the star animation), fanfare for a new best / victory, menu click / focus / back / denied sounds.
  **Music:** one generated loop per chapter (`src/data/music.js`: tempo, scale, chord loop, layers such as
  arpeggio, bass, pad, lead, bells, drums), played by a look-ahead sequencer. Menus play the chapter of the
  background track. Music is ducked (muffled) in pause. Both volumes are in Settings (music 0 = off).
  The `vol` per style is a loudness trim measured with an offline render (all chapters ~equal level).
* **Settings:** sound / music volume, touch layout (corner buttons or screen halves), button size, opacity,
  vibration, controller deadzone and steering sensitivity, key rebinding (two keys per action; Esc / Enter /
  Backspace / P are reserved for menus), graphics quality (low / medium / high: shadows, shadow map size,
  particle caps, prop density, render scale) and Reset progress (with a confirmation). While Settings is open on
  a touch device the buttons are shown dimmed behind the menu so you can see size / opacity changes.
* **Garage:** a 3D turntable. **4 cars** (stats only, `src/data/cars.js`): Ember (balanced, free), Breeze (nimble,
  25 stars), Bruiser (heavy, fast, 70 stars), Phantom (loose tail, big boosts, 130 stars), unlocked with total
  career stars. **Paints:** each car's own colour plus the 5 Grand Prix reward colours. Star times and AI are
  tuned for the Ember: other cars change how the stars feel (Bruiser's top speed helps on straights, Breeze helps
  in twisty tracks).
* **Ghost:** in Career, your best run is replayed as a translucent car next to you (10 Hz samples, ~5 KB, stored
  under its own `localStorage` key `driftkings.ghosts.v1`). Saved when you set a new best time.
* **Performance pass:** instanced props, ~40 draw calls, 120 Hz fixed-step physics costing well under 1 ms per
  frame even with 6 cars, no per-frame allocations in the hot paths, throttled HUD text / minimap updates, MSAA
  off on dense (pixel ratio >= 1.75) screens, and **dynamic resolution**: if a race averages under ~48 fps the
  render scale is reduced in 0.25 steps (down to 0.75). I could not measure on real phone hardware - please check.
* Small fixes: the control hint hides while paused, follows the active device and shows your rebound keys.

## Tuning

* **Handling:** `CAR` in `src/config.js` (max speed, accel, grip, slip thresholds, `oversteer` = how unstable a slide
  is, `spinSlip`, brake strength, steering speed, boost). Per-car overrides go in `src/data/cars.js`. `npm run sim` prints speed / slip angle for
  scripted inputs so you can see the effect of a change without playing.
* **Camera:** `CAMERA` in `src/config.js`. **Quality presets:** `QUALITY`. **Cars:** `src/data/cars.js`.
* **Music / sounds:** `src/data/music.js` (styles), `src/audio/Audio.js` (synth voices and effects).

## Decisions / assumptions (ambiguities resolved the simple way)

* The menu background is a slow bot drive on the current theme (demo mode), so no separate menu art is needed.
* Time-trial laps use a 3-2-1-GO countdown; the clock starts at GO.
* No reference screenshot was attached to the brief, so the look follows the written style description.
* The camera swings to face the direction of travel (not north-up), so "left" and "right" always
  match the screen.
* One metre = one world unit; the car is ~4.3 m long and tracks are ~13 m wide.
* **Handling rework (per your feedback):** the original brief had the brake start the drift. Drifting is now
  started by steering and held by counter-steering, brake is only for slowing / recovering, and leaving the road
  is an instant loss. The brief's three inputs (steer left, steer right, brake) are unchanged.
* The handling is tuned so a human with keyboard-style steering and ~0.10-0.14 s effective reaction time can
  finish every track (`npm run human`); a 0.18 s analog driver can too. Top speed is deliberately modest (24 m/s)
  because reaction-delay tolerance falls off sharply with speed. I could only test with bots, so **the feel needs
  your hands**: the main knobs are `oversteer` (how fast a slide grows), `spinSlip`, `slideSteer` and `maxSpeed`.
* Tracks are built from arcs and straights (see Track system), not random blobs.
* Road edge = the outer edge of the curbs; the car's centre crossing it loses. Walls sit just beyond (3.5 m).
