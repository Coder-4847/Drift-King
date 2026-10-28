// Garage: which car and paint the player has chosen, and what is unlocked.

import { progress, save } from '../settings.js';
import { CARS, REWARD_COLORS } from '../data/cars.js';
import { CAR } from '../config.js';
import { totalStars } from './career.js';

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
export const carUnlocked = (car) => totalStars() >= car.starsToUnlock;
export const paintUnlocked = (paintId) => paintId === 'default' || !!progress.gp.rewards[paintId];

export function selectedCar() {
  const c = carById(progress.garage.car);
  return carUnlocked(c) ? c : CARS[0];
}
export function selectedPaint() {
  return paintUnlocked(progress.garage.paint) ? progress.garage.paint : 'default';
}
export const paintColor = (paintId, car) => (paintId === 'default' ? car.color : (REWARD_COLORS.find((r) => r.id === paintId) || { color: car.color }).color);

/** What the game should use right now. */
export function loadout() {
  const car = selectedCar();
  return { car, color: paintColor(selectedPaint(), car), accent: car.accent, stats: car.stats };
}

export function setCar(id) { progress.garage.car = id; save(); }
export function setPaint(id) { progress.garage.paint = id; save(); }

/** 0..1 bars for the garage screen. */
export function statBars(car) {
  const s = { ...CAR, ...car.stats };
  const c = (v) => Math.max(0.05, Math.min(1, v));
  return {
    Speed: c(s.maxSpeed / 28),
    Acceleration: c(s.accel / 14),
    Handling: c((s.steerRate / 2.4) * 0.5 + (s.grip / 5) * 0.5),
    Drift: c(((s.looseGrip - 1.5) / 1.5) * 0.35 + (s.boostSpeed[1] / 9) * 0.35 + (s.slideSteer ?? 0.6) * 0.3),
  };
}
