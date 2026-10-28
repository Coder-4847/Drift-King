// Grand Prix AI difficulty table. Tune freely; `npm run aitune` prints how fast each level
// is on the GP tracks relative to the reference lap (the pace column below is what it aims at).
//
//  speed        fraction of the car's top speed the AI is willing to use
//  cornerEntry  how hard it trusts the grip in corners (higher = brakes later, carries more speed)
//  brakeSkill   how well it uses the brakes (higher = later, harder braking)
//  line         0 = follows the road centre, 1 = follows an optimised racing line
//  drift        0 = brakes in a straight line before turning (no drifts), 1 = brakes while
//               turning in, which kicks the tail out: drifts every corner and collects boosts
//  steerNoise   amount of random wobble added to steering
//  mistake      chance of a mistake (late brake / running wide) at each corner entry
//  reaction     seconds of delay between deciding and acting
//  rubber       rubber-banding: 0 = none. Slows the AI when it is far ahead of the player and
//               speeds it up (a little) when far behind
//  bump         how much a collision upsets the AI (0 = unmoved, 1 = badly)
//  pace         (info only) intended lap time relative to the reference lap

export const DIFFICULTIES = [
  { id: 'rookie',    name: 'Rookie',    speed: 0.735, cornerEntry: 0.50, brakeSkill: 0.4, line: 0.0, drift: 0.0, steerNoise: 0.35, mistake: 0.30, reaction: 0.22, rubber: 1.0, bump: 1.0, pace: 1.50, color: 0x6fd66b },
  { id: 'amateur',   name: 'Amateur',   speed: 0.80, cornerEntry: 0.60, brakeSkill: 0.55, line: 0.2, drift: 0.2, steerNoise: 0.22, mistake: 0.15, reaction: 0.15, rubber: 0.7, bump: 0.7, pace: 1.28, color: 0x4fb4ff },
  { id: 'pro',       name: 'Pro',       speed: 0.90, cornerEntry: 0.72, brakeSkill: 0.7, line: 0.5, drift: 0.5, steerNoise: 0.12, mistake: 0.07, reaction: 0.09, rubber: 0.4, bump: 0.45, pace: 1.13, color: 0xffb13b },
  { id: 'expert',    name: 'Expert',    speed: 0.96, cornerEntry: 0.82, brakeSkill: 0.85, line: 0.85, drift: 0.85, steerNoise: 0.05, mistake: 0.02, reaction: 0.05, rubber: 0.15, bump: 0.25, pace: 1.04, color: 0xe85ad1 },
  { id: 'legendary', name: 'Legendary', speed: 1.00, cornerEntry: 0.90, brakeSkill: 1.0, line: 1.0, drift: 1.0, steerNoise: 0.0, mistake: 0.003, reaction: 0.02, rubber: 0.0, bump: 0.1, pace: 0.99, color: 0xffd23a },
];

// GP scoring: points for finishing positions 1..6
export const POINTS = [25, 18, 15, 12, 10, 8];

// The five AI rivals: name + paint
export const RIVALS = [
  { name: 'Nova', color: 0x3c8bff },
  { name: 'Kestrel', color: 0x35c46b },
  { name: 'Blaze', color: 0xff8a2a },
  { name: 'Violet', color: 0xa45cf0 },
  { name: 'Onyx', color: 0x2b2d33 },
];
