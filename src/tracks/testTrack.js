// Hard-coded Phase 1 test track (x, z in metres). Start is at (0,0) heading +z.
// Note: with the camera behind the car, "right" is -x.
export const TEST_TRACK = {
  name: 'Pine Warm-up',
  theme: 'pine',
  width: 13,
  laps: 1,
  points: [
    [0, -30], [0, 40], [0, 110],            // start straight
    [-15, 165], [-55, 195], [-105, 200],    // long right sweeper
    [-150, 180], [-165, 140], [-140, 110],  // right hairpin-ish
    [-100, 100], [-70, 70], [-75, 25],      // left kink then squeeze
    [-105, -10], [-150, -30], [-175, -75],  // right sweep
    [-160, -125], [-110, -140], [-65, -115],// chicane out
    [-35, -80],
  ],
};
