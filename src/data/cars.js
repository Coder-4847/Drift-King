// Car roster. `stats` overrides any key from CAR in src/config.js (stats only; same low-poly body).
// Cars unlock with total career stars. The AI always drives the default stats (CAR).
export const CARS = [
  { id: 'ember', name: 'Ember', color: 0xe8453c, accent: 0xf4efe6, starsToUnlock: 0,
    blurb: 'Balanced all-rounder. Easy to drive, hard to fault.', stats: {} },
  { id: 'breeze', name: 'Breeze', color: 0x3c8bff, accent: 0xf4efe6, starsToUnlock: 25,
    blurb: 'Nimble and grippy: easier to hold a drift, but a lower top speed.',
    stats: { maxSpeed: 22.5, accel: 13, steerRate: 2.2, grip: 4.4, looseGrip: 2.8, oversteer: 2.7 } },
  { id: 'bruiser', name: 'Bruiser', color: 0xff8a2a, accent: 0x23242a, starsToUnlock: 70,
    blurb: 'Heavy and fast. Great top speed, but the tail snaps round easily.',
    stats: { maxSpeed: 27.5, accel: 10.5, steerRate: 1.9, grip: 3.4, looseGrip: 2.2, oversteer: 3.0, brakeDecel: 21 } },
  { id: 'phantom', name: 'Phantom', color: 0x8a5cf0, accent: 0xf4efe6, starsToUnlock: 130,
    blurb: 'Drift machine: a forgiving slide and bigger, longer boosts.',
    stats: { maxSpeed: 25, steerRate: 2.1, grip: 3.6, looseGrip: 2.2, oversteer: 2.7, slideSteer: 0.72, boostSpeed: [5, 9], boostTime: [1.1, 1.8] } },
];

// Cosmetic paint unlocked by winning a Grand Prix on each difficulty (index = difficulty index).
export const REWARD_COLORS = [
  { id: 'rookie', name: 'Rookie Mint', color: 0x6fd66b },
  { id: 'amateur', name: 'Amateur Sky', color: 0x4fb4ff },
  { id: 'pro', name: 'Pro Amber', color: 0xffb13b },
  { id: 'expert', name: 'Expert Magenta', color: 0xe85ad1 },
  { id: 'legendary', name: 'Legendary Gold', color: 0xffd23a },
];
