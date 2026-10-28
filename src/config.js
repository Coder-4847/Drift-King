// All handling / camera / quality tuning lives here. Units: metres, seconds, radians.

export const PHYSICS_DT = 1 / 120;

// Default car handling. Individual cars (src/data/cars.js) override any of these.
export const CAR = {
  maxSpeed: 32,          // auto-accelerate cap (m/s)
  accel: 15,             // base acceleration (m/s^2), fades out near max speed
  brakeDecel: 28,        // braking deceleration (m/s^2)
  minBrakeSpeed: 9,      // braking never slows the car below this

  steerRate: 2.05,       // max yaw rate (rad/s) at full steering
  steerRefSpeed: 7,      // speed at which steering reaches full strength
  steerResponse: 14,     // how fast yaw rate follows input (1/s)

  grip: 8.5,             // lateral velocity decay (1/s) with full grip
  driftGrip: 4.2,        // lateral velocity decay while the rear is loose
  gripLoseRate: 14,      // rear grip blend lost per second while braking+turning
  gripRecoverRate: 3.2,  // rear grip blend regained per second after releasing
  gripSpeedKeep: 0.92,   // share of sideways speed kept when grip turns it forward
  driftSpeedKeep: 0.8,   // same while sliding (the rest is scrubbed off)
  driftYawMult: 1.35,    // extra yaw while sliding
  driftKick: 1.7,        // yaw impulse (rad/s) when brake is pressed while steering
  driftMinSpeed: 13,     // need at least this speed to start a drift
  driftSlipMin: 0.22,    // slip angle (rad) that counts as drifting
  maxSlip: 0.95,         // beyond this slip angle grip ramps back up
  driftBrakeFactor: 0.1, // braking strength while sliding
  driftAccelFactor: 0.8, // auto-accel kept while braking in a drift
  driftDrag: 0.05,       // extra speed loss per second while sliding

  // Mini-turbo on drift release: [tier1, tier2]
  boostMinTime: [0.8, 1.9],  // drift seconds needed
  boostSpeed: [4, 8],        // extra top speed
  boostTime: [0.9, 1.5],     // boost duration
  boostAccelMult: 3,

  driftScoreRate: 0.5,
};

// Surface effects, shared by every car.
export const SURFACE = {
  grassMaxSpeedMult: 0.55,
  grassDrag: 1.4,
  grassGripMult: 0.8,
  wallBounce: 0.35,        // fraction of normal velocity reflected
  wallSpeedLoss: 0.7,      // fraction of speed lost at full-speed head-on hit
  carRadius: 1.1,
};

export const CAMERA = {
  fov: 38,
  baseHeight: 44,          // landscape height above the car
  minVisibleWidth: 36,     // portrait: zoom out until this many metres fit across
  tiltBack: 0.30,          // horizontal distance behind target = height * this
  lookAheadView: 0.20,     // target shifted ahead by this fraction of the view height
  yawSmooth: 2.6,          // how fast the camera swings to the travel direction (1/s)
  posSmooth: 9,
  speedZoom: 0.16,         // extra height at top speed (fraction)
  boostZoom: 0.06,
};

export const QUALITY = {
  low:    { shadows: false, shadowMap: 512,  smoke: 90,  skids: 260, props: 0.4, pixelRatio: 1 },
  medium: { shadows: true,  shadowMap: 1024, smoke: 180, skids: 520, props: 0.75, pixelRatio: 1.5 },
  high:   { shadows: true,  shadowMap: 2048, smoke: 320, skids: 900, props: 1.0, pixelRatio: 2 },
};

export const COLORS = {
  haze: 0xe9d9b8,
  sun: 0xffe0b0,
  skyLight: 0xcfe3ff,
  groundLight: 0x6d6a3c,
  asphalt: 0x3a3b42,
  edgeLine: 0xd9d6cc,
  curbRed: 0xd83a34,
  curbWhite: 0xf2efe6,
  chevron: 0x45e06c,
};
