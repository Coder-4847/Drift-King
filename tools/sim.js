// Headless handling check: node tools/sim.js
// Prints speed / slip angle / looseness for scripted inputs so a handling change can be judged
// without playing. (Slip > 0 = nose left of the travel direction; steer > 0 = right.)
import { Car } from '../src/game/Car.js';
import { PHYSICS_DT } from '../src/config.js';

function run(label, inputAt, seconds = 5, speed0 = 28, every = 0.25) {
  const c = new Car();
  c.reset(0, 0, 0, speed0);
  const rows = [];
  const steps = Math.round(seconds / PHYSICS_DT);
  const per = Math.round(every / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    const t = i * PHYSICS_DT;
    c.step(inputAt(t, c), PHYSICS_DT, null);
    if (i % per === per - 1) {
      rows.push(`t=${(t + PHYSICS_DT).toFixed(2)} v=${c.speed.toFixed(1)} slip=${(c.slip * 57.3).toFixed(0).padStart(4)}° loose=${c.gripBlend.toFixed(2)} yaw=${c.yawVel.toFixed(2)} ${c.spinning ? 'SPIN' : c.drifting ? 'drift' : ''}`);
    }
  }
  console.log(label); console.log('  ' + rows.join('\n  '));
  return c;
}

run('Straight, auto accel', () => ({ steer: 0, brake: 0 }), 3, 0, 1);
run('Half steer right at speed (should grip)', (t) => ({ steer: t > 0.2 ? 0.45 : 0, brake: 0 }), 3);
run('Full steer right, nothing else (drift starts, then?)', (t) => ({ steer: t > 0.2 ? 1 : 0, brake: 0 }), 4);
run('Full steer 0.5 s then hold slip with counter-steer', (t, c) => {
  if (t < 0.2) return { steer: 0, brake: 0 };
  if (t < 0.7) return { steer: 1, brake: 0 };
  // hold slip near 0.55 rad: steer = -(slip - target) * gain (slip > 0 = nose left => steer right (+) to reduce)
  const target = -0.55; // right turn drift => nose points right of travel => slip negative
  return { steer: Math.max(-1, Math.min(1, (c.slip - target) * 2.5)), brake: 0 };
}, 5);
run('Full steer, then BRAKE to recover at t=1.2', (t) => ({ steer: t > 0.2 && t < 1.2 ? 1 : 0, brake: t >= 1.2 ? 1 : 0 }), 4);
