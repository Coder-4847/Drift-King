// All handling / camera / quality tuning lives here. Units: metres, seconds, radians.

export const PHYSICS_DT = 1 / 120;

// Default car handling. Individual cars (src/data/cars.js) override any of these.
export const CAR = {
  maxSpeed: 24,          // auto-accelerate cap (m/s)
  accel: 12,             // base acceleration (m/s^2), fades out near max speed
  brakeDecel: 24,        // braking deceleration (m/s^2)
  minBrakeSpeed: 7,      // braking never slows the car below this

  steerRate: 2.05,       // yaw rate (rad/s) at full steering and low speed
  steerSpeedGain: 0.8,   // extra yaw authority at top speed (fraction): this is what lets the tail go
  steerRefSpeed: 6,      // speed at which steering reaches full strength
  steerMinFactor: 0.3,   // steering authority at standstill
  steerResponse: 14,     // how fast yaw rate follows (1/s)

  // grip / drift
  grip: 3.8,             // sideways velocity decay (1/s) while gripping
  looseGrip: 2.4,        // ... while sliding (the car keeps going the way it was going)
  slipLoose0: 0.17,      // slip angle (rad) where the tail starts to let go ...
  slipLoose1: 0.34,      // ... and is fully loose
  looseRise: 9,          // how fast the tail lets go (1/s)
  looseFall: 3.2,        // how fast grip comes back (1/s)
  slideSteer: 0.6,       // steering authority left while sliding (a locked-over wheel does less)
  oversteer: 2.5,        // slide: yaw rate gained per rad of slip at top speed (the instability you counter-steer)
  align: 5.0,            // grip: yaw rate lost per rad of slip (self straightening)
  brakeAlign: 4.5,       // braking pulls the nose back in line (recovery)
  brakeGrip: 0.8,        // braking gives grip back (share of looseness removed at full brake)
  spinSlip: 1.2,         // slip angle (rad) beyond which the car is spinning out
  spinScrub: 1.3,        // speed lost per second (exponential rate) while spinning out
  gripSpeedKeep: 0.92,   // share of sideways speed kept when grip turns it forward
  driftSpeedKeep: 0.8,   // same while sliding (the rest is scrubbed off)
  driftMinSpeed: 9,     // below this the car just grips
  driftSlipMin: 0.25,    // slip angle (rad) that counts as drifting

  // Mini-turbo on drift release: [tier1, tier2]
  boostMinTime: [0.8, 1.9],  // drift seconds needed
  boostSpeed: [3, 6],        // extra top speed
  boostTime: [0.9, 1.5],     // boost duration
  boostAccelMult: 3,

  driftScoreRate: 5,
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
