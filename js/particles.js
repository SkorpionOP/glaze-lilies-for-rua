/**
 * Botanical Floating Pollen & Sparkle Particle System
 */

import * as THREE from 'three';
import { BotanicalParticleShader } from './shaders.js';
import { createPRNG } from './math.js';

export class BotanicalParticleSystem {
  constructor(count = 120) {
    this.count = count;
    this.rng = createPRNG(42);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    this.basePositions = [];

    for (let i = 0; i < count; i++) {
      const bx = -1.2 + this.rng() * 2.4;
      const by = -1.8 + this.rng() * 3.6;
      const bz = -1.0 + this.rng() * 2.0;

      this.basePositions.push([bx, by, bz]);

      positions[i * 3]     = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      // Golden amber pollen with touches of soft rose
      const isGold = this.rng() > 0.3;
      if (isGold) {
        colors[i * 3]     = 1.0;
        colors[i * 3 + 1] = 0.85 + this.rng() * 0.15;
        colors[i * 3 + 2] = 0.45 + this.rng() * 0.25;
      } else {
        colors[i * 3]     = 0.95;
        colors[i * 3 + 1] = 0.65;
        colors[i * 3 + 2] = 0.80;
      }

      sizes[i] = 4.0 + this.rng() * 8.0;
      phases[i] = this.rng() * Math.PI * 2.0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: BotanicalParticleShader.vertexShader,
      fragmentShader: BotanicalParticleShader.fragmentShader,
      uniforms: {
        uTime: { value: 0.0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(t) {
    this.material.uniforms.uTime.value = t;

    const posAttr = this.geometry.attributes.position;
    const pos = posAttr.array;

    for (let i = 0; i < this.count; i++) {
      const base = this.basePositions[i];
      const phase = this.geometry.attributes.aPhase.array[i];

      // Gentle vertical float with horizontal swirl
      let y = base[1] + 0.18 * t + 0.08 * Math.sin(t * 1.5 + phase);
      y = ((y + 1.8) % 3.6) - 1.8;
      const x = base[0] + 0.08 * Math.cos(t * 1.1 + phase);
      const z = base[2] + 0.06 * Math.sin(t * 0.9 + phase);

      pos[i * 3]     = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }

    posAttr.needsUpdate = true;
  }
}
