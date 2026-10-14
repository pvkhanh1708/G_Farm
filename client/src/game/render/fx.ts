import { Color4, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';
import { leafParticleTexture, softDotTexture, sparkleTexture } from './textures';

/**
 * Particle effects with hard caps; `scale` comes from the quality preset so
 * low-end devices emit fewer particles.
 */
export class Fx {
  private sparkle: Texture;
  private dot: Texture;
  private leaf: Texture;
  scale = 1;

  constructor(private scene: Scene) {
    this.sparkle = sparkleTexture(scene);
    this.dot = softDotTexture(scene);
    this.leaf = leafParticleTexture(scene);
  }

  private burst(capacity: number, tex: Texture, setup: (ps: ParticleSystem) => void, pos: Vector3) {
    const n = Math.max(2, Math.round(capacity * this.scale));
    const ps = new ParticleSystem('burst', n, this.scene);
    ps.particleTexture = tex;
    ps.emitter = pos.clone();
    ps.manualEmitCount = n;
    ps.targetStopDuration = 0.1;
    ps.disposeOnStop = true;
    ps.preventAutoStart = true;
    setup(ps);
    ps.start();
    return ps;
  }

  sparkleBurst(pos: Vector3, count = 26, warm = true) {
    this.burst(count, this.sparkle, (ps) => {
      ps.createSphereEmitter(0.35, 0.6);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      const tint = warm ? new Color4(1, 0.93, 0.5, 1) : new Color4(0.8, 1, 0.7, 1);
      ps.addColorGradient(0, new Color4(1, 1, 1, 1));
      ps.addColorGradient(0.35, tint);
      ps.addColorGradient(1, new Color4(tint.r, tint.g, tint.b, 0));
      ps.minLifeTime = 0.45;
      ps.maxLifeTime = 0.9;
      ps.minEmitPower = 1.2;
      ps.maxEmitPower = 2.6;
      ps.gravity = new Vector3(0, 1.2, 0);
      ps.minAngularSpeed = -3;
      ps.maxAngularSpeed = 3;
      ps.addSizeGradient(0, 0.08, 0.12);
      ps.addSizeGradient(0.25, 0.22, 0.34);
      ps.addSizeGradient(1, 0.02, 0.04);
    }, pos);
  }

  leafBurst(pos: Vector3, count = 14) {
    this.burst(count, this.leaf, (ps) => {
      ps.createHemisphericEmitter(0.3, 0.2);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.minSize = 0.16;
      ps.maxSize = 0.28;
      ps.minLifeTime = 0.6;
      ps.maxLifeTime = 1.0;
      ps.minEmitPower = 2;
      ps.maxEmitPower = 3.4;
      ps.gravity = new Vector3(0, -7, 0);
      ps.minAngularSpeed = -6;
      ps.maxAngularSpeed = 6;
      ps.minInitialRotation = 0;
      ps.maxInitialRotation = Math.PI * 2;
      ps.addColorGradient(0, new Color4(1.25, 1.3, 1.1, 1));
      ps.addColorGradient(0.75, new Color4(1.15, 1.2, 1.0, 1));
      ps.addColorGradient(1, new Color4(1, 1, 1, 0));
    }, pos);
  }

  dustPuff(pos: Vector3, count = 16, color = new Color4(1, 0.93, 0.78, 0.7)) {
    this.burst(count, this.dot, (ps) => {
      ps.createCylinderEmitter(0.8, 0.05, 0.2, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.addColorGradient(0, color);
      ps.addColorGradient(1, new Color4(color.r, color.g, color.b, 0));
      ps.minLifeTime = 0.5;
      ps.maxLifeTime = 0.9;
      ps.minEmitPower = 0.5;
      ps.maxEmitPower = 1.2;
      ps.gravity = new Vector3(0, 0.6, 0);
      ps.addSizeGradient(0, 0.2, 0.3);
      ps.addSizeGradient(1, 0.55, 0.8);
    }, pos);
  }

  /** Ring of sparkles expanding across a plot (unlock). */
  sparkleRing(pos: Vector3, radius = 1.2) {
    this.burst(36, this.sparkle, (ps) => {
      ps.createCylinderEmitter(radius, 0.05, 0, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.addColorGradient(0, new Color4(1, 1, 0.85, 1));
      ps.addColorGradient(1, new Color4(0.85, 1, 0.6, 0));
      ps.minLifeTime = 0.7;
      ps.maxLifeTime = 1.3;
      ps.direction1 = new Vector3(-0.2, 1, -0.2);
      ps.direction2 = new Vector3(0.2, 1.6, 0.2);
      ps.minEmitPower = 1;
      ps.maxEmitPower = 2;
      ps.gravity = new Vector3(0, -0.4, 0);
      ps.addSizeGradient(0, 0.06, 0.1);
      ps.addSizeGradient(0.3, 0.2, 0.32);
      ps.addSizeGradient(1, 0.0, 0.02);
    }, pos);
  }

  /** Subtle twinkles over a harvestable plot; caller starts/stops it. */
  readyEmitter(pos: Vector3) {
    const ps = new ParticleSystem('ready', Math.max(3, Math.round(10 * this.scale)), this.scene);
    ps.particleTexture = this.sparkle;
    ps.emitter = pos.clone();
    ps.createBoxEmitter(new Vector3(0, 0.25, 0), new Vector3(0, 0.45, 0), new Vector3(-0.8, 0, -0.8), new Vector3(0.8, 0.5, 0.8));
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitRate = 4 * Math.max(0.5, this.scale);
    ps.addColorGradient(0, new Color4(1, 0.96, 0.7, 0));
    ps.addColorGradient(0.4, new Color4(1, 1, 0.9, 1));
    ps.addColorGradient(1, new Color4(1, 0.9, 0.5, 0));
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.4;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.4;
    ps.addSizeGradient(0, 0.02);
    ps.addSizeGradient(0.4, 0.14, 0.22);
    ps.addSizeGradient(1, 0.02);
    ps.minAngularSpeed = -1.5;
    ps.maxAngularSpeed = 1.5;
    return ps;
  }

  /** Slow drifting pollen motes around the farm. */
  ambientMotes(center: Vector3) {
    const ps = new ParticleSystem('motes', Math.max(10, Math.round(60 * this.scale)), this.scene);
    ps.particleTexture = this.dot;
    ps.emitter = center;
    ps.createBoxEmitter(new Vector3(-0.2, 0.05, -0.2), new Vector3(0.2, 0.2, 0.2), new Vector3(-12, 0.3, -12), new Vector3(12, 2.5, 12));
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitRate = 8 * Math.max(0.3, this.scale);
    ps.minSize = 0.05;
    ps.maxSize = 0.11;
    ps.minLifeTime = 4;
    ps.maxLifeTime = 7;
    ps.minEmitPower = 0.1;
    ps.maxEmitPower = 0.25;
    ps.addColorGradient(0, new Color4(1, 1, 0.8, 0));
    ps.addColorGradient(0.2, new Color4(1, 0.98, 0.75, 0.6));
    ps.addColorGradient(0.8, new Color4(1, 0.98, 0.75, 0.5));
    ps.addColorGradient(1, new Color4(1, 1, 0.8, 0));
    ps.start();
    return ps;
  }
}
