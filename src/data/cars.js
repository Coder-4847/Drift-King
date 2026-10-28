// Car roster. `stats` overrides any key from CAR in src/config.js.
// Phase 5 adds the other three cars and the unlock-by-stars rules.
export const CARS = [
  { id: 'starter', name: 'Ember', color: 0xe8453c, accent: 0xf4efe6, stats: {}, starsToUnlock: 0 },
];

// Cosmetic paint unlocked by winning a Grand Prix on each difficulty (index = difficulty index).
// The Garage (Phase 5) lets you pick them.
export const REWARD_COLORS = [
  { id: 'rookie', name: 'Rookie Mint', color: 0x6fd66b },
  { id: 'amateur', name: 'Amateur Sky', color: 0x4fb4ff },
  { id: 'pro', name: 'Pro Amber', color: 0xffb13b },
  { id: 'expert', name: 'Expert Magenta', color: 0xe85ad1 },
  { id: 'legendary', name: 'Legendary Gold', color: 0xffd23a },
];
