# Drift Kings

Top-down 3D drifting racer for the browser (Three.js + Vite, plain JavaScript, no external assets).
Everything - meshes, particles, sounds - is generated in code. Progress is saved in `localStorage`.

> **Status: Phase 4 (Grand Prix) done.** Phases 1-3 = foundation, track system, Career. Next: audio, garage,
> settings UI, ghost, performance pass; then the GitHub Pages deploy.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173   (add ?debug for an on-screen debug readout)
npm run build      # production build in dist/
npm run sim        # headless handling check of the car physics (tools/sim.js)
npm run tracks     # (re)generate src/data/tracks.js: finds a valid seed for all 110 tracks
npm run verify     # re-check all 110 tracks (geometry, bot lap, unique names)
npm run levels     # (re)generate the star times in src/data/levels.js from bot reference times
npm run aitune     # how fast is each AI difficulty vs the reference lap (compare with the `pace` column)
npm run gpsim -- gp5 3   # headless 6-car race on a GP track at a difficulty (0-4)
npm test           # career rules, lap/checkpoint/wrong-way, all 110 tracks, Grand Prix AI races
```

### Debug URLs

| URL | What it does |
|---|---|
| `/?track=c3l5` | drive a specific track (`c<chapter>l<level>` for Career, `gp<chapter>` for Grand Prix) |
| `/?track=c3l5&at=0.4` | start 40% of the way round (handy to look at a corner or an ice patch) |
| `/?preview` | minimap of all 110 tracks with stats and a live validity check; click a tile to drive it |
| `&debug` | on-screen speed / slip / grip readout |
| `?layout=halves` | try the alternative touch layout (screen halves steer, brake in the centre) until Settings exists |
| `?track=c3l5` | skips the menus and starts that Career level |
| `?track=gp4&diff=3` | skips the menus and starts a Grand Prix race (`diff` 0 Rookie ... 4 Legendary) |

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
src/game/          Car physics (pure maths), GridRace (multi-car race, standings), collisions, Race (laps),
                   career / gp (progress + rules), car model, camera rig, particles, world, game loop
src/tracks/        Track (spline -> samples + queries), TrackBuilder (meshes), generator (seeded),
                   validate (geometry + bot lap), trackDefs (seed -> track definition)
src/ai/            Driver (AI / bot, steer + brake only), line (racing line)
src/ui/            HUD, minimap, UI host (focus navigation), screens (main menu, level select, pre-race, results, pause)
src/App.js         game flow: menus <-> races, career results
src/data/          chapters (themes, props, name words), tracks (generated seeds), levels (star times),
                   difficulty (AI table, points, rivals), cars (+ paint rewards)
tools/             headless helpers: sim.js (handling), buildTracks.js, verifyTracks.js, racetest.js
```

## Track system (Phase 2)

* **Data -> track:** `src/data/tracks.js` holds one entry per track (id, name, seed, laps, length, bot
  reference time). `trackDefs.js` re-creates the control points deterministically from the seed
  (points are rounded to 0.1 m so every device gets the same track), `Track` turns them into a closed
  Catmull-Rom centreline sampled every 2 m, and `TrackBuilder` makes the road, edge lines, curbs (outside
  of corners), start line, ice patches, walls and the green racing-line chevrons.
* **Generator** (`src/tracks/generator.js`): a closed loop in polar form (superellipse base shape per
  chapter + harmonics + localized bumps for hairpins and chicanes). Parameters per slot come from
  `paramsFor()`: they ramp from easy (wide, gentle, no hairpins) to hard over the 100 levels.
  Grand Prix tracks are wider with a fixed medium difficulty.
* **Validation** (`src/tracks/validate.js`, run by `npm run tracks` / `npm run verify`): minimum corner
  radius >= 14 m, road width >= 10.5 m, length 600-2200 m, walls of distant road sections never touch
  (clearance), and a **bot lap** (the `Driver`, using only steer + brake) must finish without getting
  stuck or hitting walls. Bad seeds are rejected and the next one tried; the accepted seed is stored.
  After changing the generator, chapter styles or car handling, run `npm run tracks`.
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
  Retry / Next / Menu). Pause has Resume / Restart / Quit. Grand Prix, Garage and Settings are greyed out
  placeholders until their phases.
* **Stars:** each level has `gold` (3 stars), `silver` (2 stars) and `bronze` (1 star) times in
  `src/data/levels.js`; the time is the whole run including all laps. They were generated from a bot's
  reference run (`npm run levels`): gold = bot x 1.16 on level 1 easing to x 1.04 on level 100, silver
  x 1.34 -> 1.20, bronze x 1.75 -> 1.50. The tool checks the perfect bot can always reach 3 stars and
  that a bot driving at 80% speed still gets at least 1 star everywhere. **These are first guesses made
  without human play-testing** - edit the numbers in `levels.js` (plain data) or the factors at the top of
  `tools/buildLevels.js`.
* **Unlocks:** finishing with >= 1 star unlocks the next level of the chapter. Chapter N needs
  `20 x (N - 1)` total stars (`starsToUnlock` in `src/data/chapters.js`); locked chapters show a
  "34 / 40 stars to unlock Chapter 3" progress bar. Rules + progress live in `src/game/career.js`.
* **Saving:** `localStorage` key `driftkings.v1` (stars, best times, best drift scores per level, settings).
  Clear it from the browser dev tools to reset until the Settings screen has a reset button.
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
* **AI** (`src/ai/Driver.js`) uses exactly the player's inputs (steer + brake, physics are shared). It follows
  the track spline with a per-car lane, optionally an optimised **racing line** (`src/ai/line.js`), looks
  120 m ahead for corners and brakes for them, steers around slower cars in front and is bumped by contact.
* **Difficulty table** (`src/data/difficulty.js`, one row per level): `speed` (target speed %),
  `cornerEntry` (how late it brakes / how much grip it trusts), `brakeSkill`, `line` (centre -> racing line),
  `drift`, `steerNoise`, `mistake` (chance of a late brake or running wide at each braking zone), `reaction`
  (input delay), `rubber` (rubber-banding: slows the AI down when far ahead of you, a little faster when far
  behind; 0 on Legendary), `bump` (how much a collision upsets it). `npm run aitune` prints each level's solo
  pace relative to the reference lap: currently ~1.50 / 1.30 / 1.13 / 1.04 / 0.99 (Rookie ... Legendary).
  Legendary is a hair faster than the reference lap, i.e. beatable only with a clean, near-perfect run.
* **Drifting AI:** Amateur and up kick the tail out on tighter corners (a brake tap while steering hard, the
  same technique as the player); the better the driver, the more corners. Rookie always brakes in a straight
  line first. They do not hold long drifts for boosts: in this handling model holding a drift costs more
  time than it gains, so the AI uses short kicks and the table's pace is unaffected.
* **Car-to-car bumps** (`src/game/collisions.js`): each car is two circles; overlaps are pushed apart gently
  and speed is only partly cancelled, plus a small spin. No wrecks.
* **Headless race engine:** `GridRace` runs the same logic without rendering, which is how
  `tools/gptest.js` checks every AI finishes 3 laps on all 10 tracks at Rookie / Pro / Legendary.
* The car now keeps 30% steering authority at a standstill (`steerMinFactor`) so nobody can get stuck nose-first
  against a wall (found by the AI tests).

## Tuning

* **Handling:** `CAR` in `src/config.js` (max speed, accel, grip, drift grip, brake strength, steering
  speed, boost). Per-car overrides go in `src/data/cars.js`. `npm run sim` prints speed / slip angle for
  scripted inputs so you can see the effect of a change without playing.
* **Camera:** `CAMERA` in `src/config.js`. **Quality presets:** `QUALITY`.

## Decisions / assumptions (ambiguities resolved the simple way)

* The menu background is a slow bot drive on the current theme (demo mode), so no separate menu art is needed.
* Time-trial laps use a 3-2-1-GO countdown; the clock starts at GO.
* No reference screenshot was attached to the brief, so the look follows the written style description.
* The camera swings to face the direction of travel (not north-up), so "left" and "right" always
  match the screen.
* One metre = one world unit; the car is ~4.3 m long and tracks are ~13 m wide.
* The brake is the only way to start a drift. Braking while sliding is deliberately weak so the slide is
  sustained rather than killing speed.
* Tracks are star-shaped loops (single-valued in polar coordinates), so they cannot self-intersect; variety
  comes from per-seed proportions, harmonics, hairpin lobes/bays and chicanes. Fancier shapes (bridges,
  figure-eights) are not generated.
* Walls sit ~7 m beyond the road edge (grass in between slows you down); hitting them bounces gently.
