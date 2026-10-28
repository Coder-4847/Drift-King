// Car roster. `stats` overrides any key from CAR in src/config.js (stats only; same low-poly body).
// Cars unlock with total career stars. The AI always drives the default stats (CAR).
export const CARS = [
  { id: 'ember', name: 'Ember', color: 0xe8453c, accent: 0xf4efe6, starsToUnlock: 0,
    blurb: 'Balanced all-rounder. Easy to drive, hard to fault.', stats: {} },
  { id: 'breeze', name: 'Breeze', color: 0x3c8bff, accent: 0xf4efe6, starsToUnlock: 25,
    blurb: 'Nimble. Turns in sharply and grips well, but tops out lower.',
    stats: { maxSpeed: 30.5, accel: 16.5, steerRate: 2.3, grip: 9.5, driftGrip: 4.8 } },
  { id: 'bruiser', name: 'Bruiser', color: 0xff8a2a, accent: 0x23242a, starsToUnlock: 70,
    blurb: 'Heavy and fast. Great top speed, but wide in the corners.',
    stats: { maxSpeed: 35, accel: 13, steerRate: 1.85, grip: 7.5, brakeDecel: 26, driftGrip: 3.6 } },
  { id: 'phantom', name: 'Phantom', color: 0x8a5cf0, accent: 0xf4efe6, starsToUnlock: 130,
    blurb: 'Drift machine. A loose tail and bigger, longer boosts.',
    stats: { maxSpeed: 32, steerRate: 2.1, grip: 8, driftGrip: 3.4, driftYawMult: 1.5, driftKick: 2.0, boostSpeed: [6, 11], boostTime: [1.1, 1.8] } },
];

// Cosmetic paint unlocked by winning a Grand Prix on each difficulty (index = difficulty index).
export const REWARD_COLORS = [
  { id: 'rookie', name: 'Rookie Mint', color: 0x6fd66b },
  { id: 'amateur', name: 'Amateur Sky', color: 0x4fb4ff },
  { id: 'pro', name: 'Pro Amber', color: 0xffb13b },
  { id: 'expert', name: 'Expert Magenta', color: 0xe85ad1 },
  { id: 'legendary', name: 'Legendary Gold', color: 0xffd23a },
];
