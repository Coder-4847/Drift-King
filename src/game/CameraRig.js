// Near top-down camera that follows the car and swings to face the direction of travel.
// The car stays in the lower part of the screen so there is room to see the corner ahead.

import * as THREE from 'three';
import { CAMERA } from '../config.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class CameraRig {
  constructor(aspect = 1) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 5, 500);
    this.yaw = 0;
    this.zoom = 1;
    this.focus = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.height = CAMERA.baseHeight;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  snap(car) {
    this.yaw = car.heading;
    this.anchor.set(car.x, 0, car.z);
    this.height = this.targetHeight(car);
    this.apply();
  }

  targetHeight(car) {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const fitWidth = (CAMERA.minVisibleWidth / 2) / (tanHalf * this.camera.aspect);
    const base = Math.max(CAMERA.baseHeight, fitWidth);
    const speedK = Math.min(1, car.speed / car.stats.maxSpeed);
    return base * (1 + CAMERA.speedZoom * speedK + (car.boosting ? CAMERA.boostZoom : 0));
  }

  update(car, dt) {
    // face the travel direction, nudged towards where the nose points
    const travel = car.speed > 4 ? Math.atan2(car.vx, car.vz) : car.heading;
    const target = travel + wrapAngle(car.heading - travel) * 0.35;
    this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-CAMERA.yawSmooth * dt));

    const k = 1 - Math.exp(-CAMERA.posSmooth * dt);
    this.anchor.x += (car.x - this.anchor.x) * k;
    this.anchor.z += (car.z - this.anchor.z) * k;
    this.height += (this.targetHeight(car) - this.height) * (1 - Math.exp(-2.5 * dt));
    this.apply();
  }

  apply() {
    const H = this.height;
    const viewH = 2 * H * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const ahead = viewH * CAMERA.lookAheadView;
    this.focus.set(this.anchor.x + fx * ahead, 0, this.anchor.z + fz * ahead);
    const back = H * CAMERA.tiltBack;
    this.camera.position.set(this.focus.x - fx * back, H, this.focus.z - fz * back);
    this.camera.lookAt(this.focus);
  }
}
