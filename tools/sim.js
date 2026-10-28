// Headless handling check: node tools/sim.js
import { Car } from '../src/game/Car.js';
import { PHYSICS_DT } from '../src/config.js';

function run(label, inputAt, seconds = 6, speed0 = 0) {
  const c = new Car();
  c.reset(0, 0, 0, speed0);
  const rows = [];
  const steps = Math.round(seconds / PHYSICS_DT);
  let heading0 = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * PHYSICS_DT;
    c.step(inputAt(t), PHYSICS_DT, null);
    if (i % Math.round(1 / PHYSICS_DT) === Math.round(1 / PHYSICS_DT) - 1) {
      rows.push(`  t=${(t + PHYSICS_DT).toFixed(0)}s speed=${c.speed.toFixed(1)} slip=${(c.slip * 57.3).toFixed(0)}deg drifting=${c.drifting} dT=${c.driftTime.toFixed(1)} yaw=${c.yawVel.toFixed(2)} boost=${c.boostTimer.toFixed(1)}`);
    }
  }
  console.log(label); console.log(rows.join('\n'));
  return c;
}

run('Straight (auto accel)', () => ({ steer: 0, brake: 0 }), 5);
run('Steer right, no brake (grip turn)', (t) => ({ steer: t > 3 ? 1 : 0, brake: 0 }), 8);
run('Steer right + brake held (drift) from t=3, release at t=6', (t) => ({ steer: t > 3 ? 1 : 0, brake: t > 3 && t < 6 ? 1 : 0 }), 9);
run('Brake TAP while steering (0.15s)', (t) => ({ steer: t > 3 ? 1 : 0, brake: t > 3 && t < 3.15 ? 1 : 0 }), 7);
run('Brake only, straight', (t) => ({ steer: 0, brake: t > 3 ? 1 : 0 }), 6);

// Brake-tap detail: slip angle every 0.1s after the tap
{
  const c = new Car(); c.reset(0, 0, 0, 24);
  let line = 'Tap detail (slip deg @0.1s steps): ';
  for (let i = 0; i < 1.2 / PHYSICS_DT; i++) {
    const t = i * PHYSICS_DT;
    c.step({ steer: 1, brake: t < 0.15 ? 1 : 0 }, PHYSICS_DT, null);
    if (i % 12 === 11) line += `${(c.slip * 57.3).toFixed(0)}${c.drifting ? '*' : ''} `;
  }
  console.log(line);
}
