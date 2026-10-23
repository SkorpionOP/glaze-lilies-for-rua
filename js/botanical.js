/**
 * 3D Botanical Procedural Construction Engine
 * Ports all parametric modeling for Lilium orientalis stems, leaves, tepals,
 * papillae, stamens, pistils, and buds.
 */

import * as THREE from 'three';
import {
  clamp, smoothstep, smootherstep, vec3, normalizeV3, normV3,
  dotV3, crossV3, addV3, subV3, scaleV3, rotX, rotY, rotZ,
  buildBasisFromDir, transformByBasis, evalCubicBezier, computeBishopFrame,
  createPRNG
} from './math.js';
import {
  BotanicalSurfaceShader, BotanicalWireframeShader
} from './shaders.js';

export class BotanicalElement {
  constructor(kind, Nu, Nv, P, P_closed, C, wire_t0, wire_t1, surf_t0, surf_t1,
              sss_strength = 0.35, spec_strength = 0.25, shininess = 18.0,
              wire_color = [0.95, 0.78, 0.55], wire_stride_u = 4, wire_stride_v = 3,
              is_petal = false, papillae = []) {
    this.kind = kind;
    this.Nu = Nu;
    this.Nv = Nv;
    this.P = P;                       // Array of Nu x Nv [x,y,z]
    this.P_closed = P_closed || P;    // Array of Nu x Nv [x,y,z]
    this.C = C;                       // Array of Nu x Nv [r,g,b]
    this.wire_t0 = wire_t0;
    this.wire_t1 = wire_t1;
    this.surf_t0 = surf_t0;
    this.surf_t1 = surf_t1;
    this.sss_strength = sss_strength;
    this.spec_strength = spec_strength;
    this.shininess = shininess;
    this.wire_color = wire_color;
    this.wire_stride_u = wire_stride_u;
    this.wire_stride_v = wire_stride_v;
    this.is_petal = is_petal;
    this.papillae = papillae;

    // Three.js Scene Nodes
    this.mesh = null;
    this.wireLines = null;
    this.papillaeGroup = null;

    this.buildThreeMeshes();
  }

  buildThreeMeshes() {
    const Nu = this.Nu;
    const Nv = this.Nv;
    const numVerts = Nu * Nv;

    // Compute normals for full and closed states
    const normalsFull = computeGridNormals(this.P, Nu, Nv);
    const normalsClosed = this.is_petal ? computeGridNormals(this.P_closed, Nu, Nv) : normalsFull;

    const positions = new Float32Array(numVerts * 3);
    const positionsClosed = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);
    const normalsClosedArr = new Float32Array(numVerts * 3);
    const colors = new Float32Array(numVerts * 3);
    const uvParams = new Float32Array(numVerts * 2);

    for (let i = 0; i < Nu; i++) {
      const u = i / (Nu - 1);
      for (let j = 0; j < Nv; j++) {
        const v = -1.0 + (2.0 * j) / (Nv - 1);
        const idx = i * Nv + j;

        const p = this.P[idx];
        const pc = this.P_closed[idx];
        const n = normalsFull[idx];
        const nc = normalsClosed[idx];
        const c = this.C[idx];

        positions[idx * 3]     = p[0];
        positions[idx * 3 + 1] = p[1];
        positions[idx * 3 + 2] = p[2];

        positionsClosed[idx * 3]     = pc[0];
        positionsClosed[idx * 3 + 1] = pc[1];
        positionsClosed[idx * 3 + 2] = pc[2];

        normals[idx * 3]     = n[0];
        normals[idx * 3 + 1] = n[1];
        normals[idx * 3 + 2] = n[2];

        normalsClosedArr[idx * 3]     = nc[0];
        normalsClosedArr[idx * 3 + 1] = nc[1];
        normalsClosedArr[idx * 3 + 2] = nc[2];

        colors[idx * 3]     = c[0];
        colors[idx * 3 + 1] = c[1];
        colors[idx * 3 + 2] = c[2];

        uvParams[idx * 2]     = u;
        uvParams[idx * 2 + 1] = v;
      }
    }

    // Indices for grid quads (two triangles per quad)
    const indices = [];
    for (let i = 0; i < Nu - 1; i++) {
      for (let j = 0; j < Nv - 1; j++) {
        const i00 = i * Nv + j;
        const i10 = (i + 1) * Nv + j;
        const i11 = (i + 1) * Nv + (j + 1);
        const i01 = i * Nv + (j + 1);

        indices.push(i00, i10, i11);
        indices.push(i00, i11, i01);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('positionClosed', new THREE.BufferAttribute(positionsClosed, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('normalClosed', new THREE.BufferAttribute(normalsClosedArr, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uvParam', new THREE.BufferAttribute(uvParams, 2));
    geometry.setIndex(indices);

    this.surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: BotanicalSurfaceShader.vertexShader,
      fragmentShader: BotanicalSurfaceShader.fragmentShader,
      uniforms: {
        uBloomT: { value: 1.0 },
        uIsPetal: { value: this.is_petal ? 1.0 : 0.0 },
        uSurfProg: { value: 0.0 },
        uSssStrength: { value: this.sss_strength },
        uSpecStrength: { value: this.spec_strength },
        uShininess: { value: this.shininess },
        uHueShift: { value: 0.0 }
      },
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      depthTest: true
    });

    this.mesh = new THREE.Mesh(geometry, this.surfaceMaterial);
    this.mesh.frustumCulled = false;

    // 2. Wireframe Isoline Curves (tactile 3D holographic contour texture)
    const wireIndices = [];
    const wireUParams = [];
    const wirePositions = [];
    const wirePositionsClosed = [];

    // Longitudinal isolines along u (constant v)
    const vIndices = [];
    for (let j = 0; j < Nv; j += this.wire_stride_v) {
      vIndices.push(j);
    }
    if (!vIndices.includes(Nv - 1)) vIndices.push(Nv - 1);

    for (const j of vIndices) {
      for (let i = 0; i < Nu - 1; i++) {
        const idxA = i * Nv + j;
        const idxB = (i + 1) * Nv + j;
        const pA = this.P[idxA];
        const pB = this.P[idxB];
        const pcA = this.P_closed[idxA];
        const pcB = this.P_closed[idxB];
        const uA = i / (Nu - 1);
        const uB = (i + 1) / (Nu - 1);

        const baseIdx = wirePositions.length / 3;
        wirePositions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
        wirePositionsClosed.push(pcA[0], pcA[1], pcA[2], pcB[0], pcB[1], pcB[2]);
        wireUParams.push(uA, uB);
        wireIndices.push(baseIdx, baseIdx + 1);
      }
    }

    // Transverse isolines along v (constant u)
    for (let i = 0; i < Nu; i += this.wire_stride_u) {
      const u = i / (Nu - 1);
      for (let j = 0; j < Nv - 1; j++) {
        const idxA = i * Nv + j;
        const idxB = i * Nv + (j + 1);
        const pA = this.P[idxA];
        const pB = this.P[idxB];
        const pcA = this.P_closed[idxA];
        const pcB = this.P_closed[idxB];

        const baseIdx = wirePositions.length / 3;
        wirePositions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
        wirePositionsClosed.push(pcA[0], pcA[1], pcA[2], pcB[0], pcB[1], pcB[2]);
        wireUParams.push(u, u);
        wireIndices.push(baseIdx, baseIdx + 1);
      }
    }

    if (wirePositions.length > 0) {
      const wireGeom = new THREE.BufferGeometry();
      wireGeom.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
      wireGeom.setAttribute('positionClosed', new THREE.Float32BufferAttribute(wirePositionsClosed, 3));
      wireGeom.setAttribute('paramU', new THREE.Float32BufferAttribute(wireUParams, 1));
      wireGeom.setIndex(wireIndices);

      this.wireMaterial = new THREE.ShaderMaterial({
        vertexShader: BotanicalWireframeShader.vertexShader,
        fragmentShader: BotanicalWireframeShader.fragmentShader,
        uniforms: {
          uWireProg: { value: 0.0 },
          uWireAlpha: { value: 0.0 },
          uWireColor: { value: new THREE.Vector3(...this.wire_color) },
          uHueShift: { value: 0.0 },
          uBloomT: { value: 1.0 },
          uIsPetal: { value: this.is_petal ? 1.0 : 0.0 }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true
      });

      this.wireLines = new THREE.LineSegments(wireGeom, this.wireMaterial);
      this.wireLines.renderOrder = 10;
      this.wireLines.frustumCulled = false;
    }

    // 3. 3D Raised Botanical Papillae (Ruby spots)
    if (this.papillae && this.papillae.length > 0) {
      this.papillaeGroup = new THREE.Group();
      const dotGeom = new THREE.SphereGeometry(1, 8, 8);
      dotGeom.scale(1, 0.45, 1); // Flatten slightly against petal surface

      const dotMat = new THREE.MeshBasicMaterial({
        color: 0x5a0a25,
        depthTest: true
      });

      for (const pap of this.papillae) {
        const m = new THREE.Mesh(dotGeom, dotMat.clone());
        const scale = pap.rad_px * 0.0035;
        m.scale.set(scale, scale, scale);
        m.visible = false;
        m.userData = {
          u_idx: pap.u_idx,
          v_idx: pap.v_idx,
          eff_u: pap.eff_u,
          core_color: pap.core_color,
          rim_color: pap.rim_color
        };
        this.papillaeGroup.add(m);
      }
    }
  }

  update(t, duration, globalWireAlpha) {
    const min_t0 = Math.min(this.wire_t0, this.surf_t0);
    if (t < min_t0) {
      if (this.mesh) this.mesh.visible = false;
      if (this.wireLines) this.wireLines.visible = false;
      if (this.papillaeGroup) this.papillaeGroup.visible = false;
      return;
    }

    const w_prog = smootherstep(this.wire_t0, this.wire_t1, t);
    // Surface growth: stems & leaves emerge along length; petals form bud quickly then unfurl
    const s_prog = this.is_petal
      ? smootherstep(this.surf_t0, this.surf_t0 + 0.8, t)
      : smootherstep(this.surf_t0, this.surf_t1, t);

    // True botanical bloom progression from 0.0 (closed bud) to 1.0 (fully open blossom)
    const bloom_t = this.is_petal
      ? smootherstep(this.surf_t0 + 0.2, Math.min(duration - 1.5, this.surf_t1 + 1.2), t)
      : 1.0;

    // Update surface shader uniforms
    if (this.mesh) {
      this.mesh.visible = s_prog > 0.001;
      this.surfaceMaterial.uniforms.uBloomT.value = bloom_t;
      this.surfaceMaterial.uniforms.uSurfProg.value = s_prog;
    }

    // Update 3D wireframe isoline texture (active during bloom, stays subtle at full bloom)
    if (this.wireLines) {
      const wire_active = w_prog > 0.01;
      // High prominence and glow (0.75) during blooming construction, settles to elegant contour (0.28) at full bloom
      const wire_alpha = (bloom_t < 0.98)
        ? 0.75 * (1.0 - 0.35 * bloom_t)
        : 0.28;

      this.wireLines.visible = wire_active;
      this.wireMaterial.uniforms.uWireProg.value = Math.max(w_prog, Math.min(1.0, s_prog * 1.05));
      this.wireMaterial.uniforms.uWireAlpha.value = wire_alpha;
      this.wireMaterial.uniforms.uBloomT.value = bloom_t;
      this.wireMaterial.uniforms.uIsPetal.value = this.is_petal ? 1.0 : 0.0;
    }

    // Update papillae visibility & position if blooming
    if (this.papillaeGroup) {
      this.papillaeGroup.visible = s_prog > 0.05;
      if (this.papillaeGroup.visible) {
        for (let k = 0; k < this.papillaeGroup.children.length; k++) {
          const m = this.papillaeGroup.children[k];
          const visible = m.userData.eff_u <= (s_prog * 0.98);
          m.visible = visible;
          if (visible) {
            const idx = m.userData.u_idx * this.Nv + m.userData.v_idx;
            const pFull = this.P[idx];
            const pClosed = this.P_closed[idx];
            const px = pClosed[0] * (1.0 - bloom_t) + pFull[0] * bloom_t;
            const py = pClosed[1] * (1.0 - bloom_t) + pFull[1] * bloom_t;
            const pz = pClosed[2] * (1.0 - bloom_t) + pFull[2] * bloom_t;
            m.position.set(px, py, pz);
          }
        }
      }
    }
  }
}

function computeGridNormals(P, Nu, Nv) {
  const normals = new Array(Nu * Nv);
  for (let i = 0; i < Nu; i++) {
    for (let j = 0; j < Nv; j++) {
      const idx = i * Nv + j;
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(Nu - 1, i + 1);
      const jPrev = Math.max(0, j - 1);
      const jNext = Math.min(Nv - 1, j + 1);

      const p00 = P[iPrev * Nv + jPrev];
      const p10 = P[iNext * Nv + jPrev];
      const p01 = P[iPrev * Nv + jNext];
      const p11 = P[iNext * Nv + jNext];

      const du = [p10[0] - p00[0] + p11[0] - p01[0], p10[1] - p00[1] + p11[1] - p01[1], p10[2] - p00[2] + p11[2] - p01[2]];
      const dv = [p01[0] - p00[0] + p11[0] - p10[0], p01[1] - p00[1] + p11[1] - p10[1], p01[2] - p00[2] + p11[2] - p10[2]];

      let norm = crossV3(dv, du);
      normals[idx] = normalizeV3(norm);
    }
  }
  return normals;
}

/**
 * 1. Stem & Pedicel Tube Generator
 */
export function generateStemTube(p0, p1, p2, p3, r_base, r_tip, Nu, Nv,
                                 col_base, col_tip, wire_t0, wire_t1, surf_t0, surf_t1) {
  const uArr = [];
  const posArr = [];
  const tanArr = [];

  for (let i = 0; i < Nu; i++) {
    const u = i / (Nu - 1);
    uArr.push(u);
    const { pos, tan } = evalCubicBezier(p0, p1, p2, p3, u);
    posArr.push(pos);
    tanArr.push(normalizeV3(tan));
  }

  const { N1, N2 } = computeBishopFrame(tanArr);

  const P = new Array(Nu * Nv);
  const C = new Array(Nu * Nv);

  for (let i = 0; i < Nu; i++) {
    const u = uArr[i];
    const n1 = N1[i];
    const n2 = N2[i];
    const pos = posArr[i];

    let r = r_base * (1.0 - u) + r_tip * u;
    if (u > 0.90) {
      r *= 1.0 + 0.25 * smoothstep(0.90, 1.0, u);
    }

    for (let j = 0; j < Nv; j++) {
      const v = -1.0 + (2.0 * j) / (Nv - 1);
      const theta = (v + 1.0) * Math.PI;

      const ridge = 1.0 + 0.025 * Math.cos(6.0 * theta);
      const rad = r * ridge;

      const cosTh = Math.cos(theta);
      const sinTh = Math.sin(theta);

      const px = pos[0] + rad * (cosTh * n1[0] + sinTh * n2[0]);
      const py = pos[1] + rad * (cosTh * n1[1] + sinTh * n2[1]);
      const pz = pos[2] + rad * (cosTh * n1[2] + sinTh * n2[2]);

      const idx = i * Nv + j;
      P[idx] = [px, py, pz];

      const mix = u;
      const baseR = (1.0 - mix) * col_base[0] + mix * col_tip[0];
      const baseG = (1.0 - mix) * col_base[1] + mix * col_tip[1];
      const baseB = (1.0 - mix) * col_base[2] + mix * col_tip[2];
      const striation = 0.95 + 0.05 * Math.cos(6.0 * theta);

      C[idx] = [baseR * striation, baseG * striation, baseB * striation];
    }
  }

  const element = new BotanicalElement(
    'stem', Nu, Nv, P, null, C,
    wire_t0, wire_t1, surf_t0, surf_t1,
    0.22, 0.25, 18.0,
    [0.38, 0.88, 0.50], 6, 4
  );

  return { element, posArr, tanArr };
}

/**
 * 2. Lanceolate Leaf Generator
 */
export function generateLanceolateLeaf(origin, stem_dir, azimuth, length, width,
                                       arch_drop, twist, wire_t0, wire_t1, surf_t0, surf_t1) {
  const Nu = 32;
  const Nv = 15;
  const P = new Array(Nu * Nv);
  const C = new Array(Nu * Nv);

  const c_dark = [0.08, 0.27, 0.12];
  const c_mid  = [0.16, 0.45, 0.19];
  const c_vein = [0.36, 0.65, 0.30];
  const c_tip  = [0.24, 0.50, 0.18];

  const rot = rotY(azimuth);

  for (let i = 0; i < Nu; i++) {
    const u = i / (Nu - 1);
    const w_prof = width * Math.pow(Math.max(0.0, Math.sin(Math.PI * Math.pow(u, 0.66))), 0.92) * (1.0 - 0.12 * u)
                 + 0.10 * width * Math.pow(1.0 - u, 3);
    const reach = length * (0.90 * u + 0.10 * Math.sin(0.5 * Math.PI * u));
    const elev = length * (0.46 * u - arch_drop * Math.pow(u, 2.1));
    const tw_ang = twist * Math.pow(u, 1.35);

    for (let j = 0; j < Nv; j++) {
      const v = -1.0 + (2.0 * j) / (Nv - 1);
      const absV = Math.abs(v);
      const fold = 0.055 * width * Math.pow(absV, 1.35) * (1.0 - 0.45 * u) - 0.025 * width * Math.pow(v, 4);

      const x_loc = w_prof * v * Math.cos(tw_ang) - fold * Math.sin(tw_ang);
      const z_loc = elev + w_prof * v * Math.sin(tw_ang) + fold * Math.cos(tw_ang);
      const y_loc = reach;

      // Rotate around Y
      const rx = rot[0][0] * x_loc + rot[0][2] * z_loc;
      const rz = rot[2][0] * x_loc + rot[2][2] * z_loc;
      const ry = y_loc;

      const idx = i * Nv + j;
      P[idx] = [origin[0] + rx, origin[1] + ry, origin[2] + rz];

      const midrib_mask = Math.exp(-Math.pow(v / 0.10, 2));
      const parallel_veins = Math.pow(0.5 + 0.5 * Math.cos(v * 8.0 * Math.PI), 4);
      const edge_grad = Math.pow(absV, 1.4);

      let cr = (1.0 - edge_grad) * c_mid[0] + edge_grad * c_dark[0];
      let cg = (1.0 - edge_grad) * c_mid[1] + edge_grad * c_dark[1];
      let cb = (1.0 - edge_grad) * c_mid[2] + edge_grad * c_dark[2];

      const uSq = 0.32 * u * u;
      cr = cr * (1.0 - uSq) + c_tip[0] * uSq;
      cg = cg * (1.0 - uSq) + c_tip[1] * uSq;
      cb = cb * (1.0 - uSq) + c_tip[2] * uSq;

      const mid_f = 0.48 * midrib_mask;
      cr = cr * (1.0 - mid_f) + c_vein[0] * mid_f + 0.06 * parallel_veins * c_vein[0];
      cg = cg * (1.0 - mid_f) + c_vein[1] * mid_f + 0.06 * parallel_veins * c_vein[1];
      cb = cb * (1.0 - mid_f) + c_vein[2] * mid_f + 0.06 * parallel_veins * c_vein[2];

      C[idx] = [cr, cg, cb];
    }
  }

  return new BotanicalElement(
    'leaf', Nu, Nv, P, null, C,
    wire_t0, wire_t1, surf_t0, surf_t1,
    0.30, 0.35, 24.0,
    [0.42, 0.92, 0.52], 5, 3
  );
}

/**
 * 3. Oriental Lily Tepal (Petal/Sepal) Generator with Papillae & Pigmentation
 */
export function generateLilyTepal(center, basis, azimuth, is_inner, scale, openness,
                                  color_variant, wire_t0, wire_t1, surf_t0, surf_t1, rng_seed) {
  const rng = createPRNG(rng_seed);
  const Nu = 54;
  const Nv = 27;

  const w_max = (is_inner ? 0.46 : 0.39) * scale;
  const length = (is_inner ? 1.26 : 1.24) * scale;

  function buildTepalSurface(openFactor) {
    const theta_base = is_inner ? 0.18 : 0.30;
    const theta_flare = (is_inner ? 0.74 : 0.88) * openFactor + 0.14;
    const theta_recurve = (is_inner ? 1.55 : 1.72) * Math.pow(openFactor, 1.18);

    const ds = length / (Nu - 1);
    const r_mid = new Float32Array(Nu);
    const y_mid = new Float32Array(Nu);
    const angles = new Float32Array(Nu);

    r_mid[0] = (is_inner ? 0.036 : 0.078) * scale;
    y_mid[0] = (is_inner ? 0.035 : 0.0) * scale;

    for (let i = 0; i < Nu; i++) {
      const u1d = i / (Nu - 1);
      angles[i] = theta_base + theta_flare * smoothstep(0.04, 0.58, u1d)
                + (theta_recurve - theta_flare) * Math.pow(smoothstep(0.42, 1.0, u1d), 1.25);
    }

    for (let i = 1; i < Nu; i++) {
      const ang = 0.5 * (angles[i - 1] + angles[i]);
      r_mid[i] = r_mid[i - 1] + ds * Math.sin(ang);
      y_mid[i] = y_mid[i - 1] + ds * Math.cos(ang);
    }

    const P = new Array(Nu * Nv);
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);

    for (let i = 0; i < Nu; i++) {
      const u = i / (Nu - 1);
      const envelope = Math.pow(Math.max(0.0, Math.sin(Math.PI * Math.pow(u, 0.58))), 0.72);
      const tip_round = 1.0 - 0.12 * Math.pow(u, 3);
      const w_profile = w_max * envelope * tip_round + 0.055 * scale * Math.pow(1.0 - u, 2.6);

      const R_mid = r_mid[i];
      const Y_mid = y_mid[i];
      const ang = angles[i];
      const out_r = Math.cos(ang);
      const out_y = -Math.sin(ang);

      const ruffle_amp = (is_inner ? 0.044 : 0.028) * scale * openFactor;
      const ruffle_env = Math.max(0.0, Math.sin(Math.PI * u)) * smoothstep(0.15, 0.88, u);
      const phase = is_inner ? 0.85 : -0.75;

      const cyl_blend = 1.0 - 0.55 * smoothstep(0.35, 0.85, u);
      const wrap_r = R_mid + 0.16 * scale;

      for (let j = 0; j < Nv; j++) {
        const v = -1.0 + (2.0 * j) / (Nv - 1);
        const absV = Math.abs(v);
        const signV = v >= 0 ? 1.0 : -1.0;

        const furrow = 0.028 * scale * Math.exp(-Math.pow(v / 0.16, 2)) * (1.0 - 0.60 * u);
        const reflex = 0.045 * scale * (v * v) * smoothstep(0.35, 0.90, u);
        const ruffle = ruffle_amp * ruffle_env * Math.pow(absV, 2.3) * Math.sin(6.0 * Math.PI * u + phase * signV);
        const disp_out = furrow + reflex + ruffle;

        const phi_local = (w_profile * v) / wrap_r;
        const phi_eff = phi_local * cyl_blend;
        const x_planar = (w_profile * v) * (1.0 - cyl_blend);

        const r_base_surf = wrap_r * Math.cos(phi_eff) - 0.16 * scale + disp_out * out_r;
        const x_base_surf = wrap_r * Math.sin(phi_eff) + x_planar;
        const y_local = Y_mid + disp_out * out_y;

        const px = x_base_surf * ca + r_base_surf * sa;
        const pz = -x_base_surf * sa + r_base_surf * ca;
        const py = y_local;

        const pFlower = [px, py, pz];
        P[i * Nv + j] = transformByBasis(pFlower, center, basis);
      }
    }
    return P;
  }

  const P_full = buildTepalSurface(openness);
  const P_semi = buildTepalSurface(Math.max(0.28, openness * 0.45));

  // Botanical Pigmentation (Emerald Nectar Star + Magenta Core + Ivory Rim)
  const c_nectar = [0.38, 0.68, 0.18];
  const c_ivory  = [0.99, 0.97, 0.96];
  let c_deep, c_blush;

  if (color_variant === 'stargazer') {
    c_deep = [0.74, 0.08, 0.31];
    c_blush = [0.93, 0.38, 0.58];
  } else if (color_variant === 'soft_rose') {
    c_deep = [0.82, 0.18, 0.42];
    c_blush = [0.95, 0.54, 0.69];
  } else { // blush_ivory
    c_deep = [0.85, 0.28, 0.48];
    c_blush = [0.96, 0.66, 0.77];
  }

  const C = new Array(Nu * Nv);
  for (let i = 0; i < Nu; i++) {
    const u = i / (Nu - 1);
    const u_flush = smoothstep(0.05, 0.20, u) * (1.0 - smoothstep(0.48, 0.86, u));
    const u_core = smoothstep(0.07, 0.18, u) * (1.0 - smoothstep(0.38, 0.74, u));
    const nectar_u = (1.0 - smoothstep(0.04, 0.24, u));
    const midrib_u = smoothstep(0.14, 0.28, u) * (1.0 - smoothstep(0.58, 0.92, u));
    const vein_strength = 0.045 * smoothstep(0.08, 0.88, u);

    for (let j = 0; j < Nv; j++) {
      const v = -1.0 + (2.0 * j) / (Nv - 1);
      const absV = Math.abs(v);

      const v_margin = 1.0 - smoothstep(0.32, 0.78, absV);
      const flush_mask = u_flush * v_margin;
      const core_mask = u_core * Math.exp(-Math.pow(v / 0.40, 2));

      let cr = (1.0 - flush_mask) * c_ivory[0] + flush_mask * c_blush[0];
      let cg = (1.0 - flush_mask) * c_ivory[1] + flush_mask * c_blush[1];
      let cb = (1.0 - flush_mask) * c_ivory[2] + flush_mask * c_blush[2];

      cr = cr * (1.0 - 0.85 * core_mask) + c_deep[0] * (0.85 * core_mask);
      cg = cg * (1.0 - 0.85 * core_mask) + c_deep[1] * (0.85 * core_mask);
      cb = cb * (1.0 - 0.85 * core_mask) + c_deep[2] * (0.85 * core_mask);

      // Emerald nectar guide
      const nectar_rad = 0.36 - 0.18 * u;
      const nectar_mask = nectar_u * Math.exp(-Math.pow(v / Math.max(0.01, nectar_rad), 2));
      cr = cr * (1.0 - 0.90 * nectar_mask) + c_nectar[0] * (0.90 * nectar_mask);
      cg = cg * (1.0 - 0.90 * nectar_mask) + c_nectar[1] * (0.90 * nectar_mask);
      cb = cb * (1.0 - 0.90 * nectar_mask) + c_nectar[2] * (0.90 * nectar_mask);

      // Midrib keel line
      const midrib_vein = midrib_u * Math.exp(-Math.pow(v / 0.058, 2));
      const c_midrib_r = 0.78 * c_deep[0] + 0.22 * c_ivory[0];
      const c_midrib_g = 0.78 * c_deep[1] + 0.22 * c_ivory[1];
      const c_midrib_b = 0.78 * c_deep[2] + 0.22 * c_ivory[2];
      cr = cr * (1.0 - 0.70 * midrib_vein) + c_midrib_r * (0.70 * midrib_vein);
      cg = cg * (1.0 - 0.70 * midrib_vein) + c_midrib_g * (0.70 * midrib_vein);
      cb = cb * (1.0 - 0.70 * midrib_vein) + c_midrib_b * (0.70 * midrib_vein);

      // Parallel venation
      const vein_rib = 0.5 + 0.5 * Math.cos(v * 18.0 * Math.PI);
      const vein_eff = vein_strength * (1.0 - nectar_mask) * (1.0 - vein_rib);
      cr -= vein_eff * 0.05;
      cg -= vein_eff * 0.11;
      cb -= vein_eff * 0.07;

      C[i * Nv + j] = [clamp(cr), clamp(cg), clamp(cb)];
    }
  }

  // Discrete 3D Papillae spots
  const papillae = [];
  const n_pap = is_inner ? 60 : 42;
  for (let k = 0; k < n_pap; k++) {
    const pu = 0.15 + rng() * (0.62 - 0.15);
    const pv_side = rng() < 0.5 ? -1.0 : 1.0;
    const pv = pv_side * (0.07 + rng() * (0.62 - 0.07));
    const u_idx = Math.min(Nu - 2, Math.max(1, Math.round(pu * (Nu - 1))));
    const v_idx = Math.min(Nv - 2, Math.max(1, Math.round(((pv + 1.0) * 0.5) * (Nv - 1))));
    const rad_px = (1.6 + rng() * (2.9 - 1.6)) * scale;
    const eff_u = 0.85 * pu + 0.15 * Math.abs(pv);

    papillae.push({
      u_idx, v_idx, rad_px, eff_u,
      core_color: 0x4a0a1a,
      rim_color: 0x8a2040
    });
  }

  return new BotanicalElement(
    'petal', Nu, Nv, P_full, P_semi, C,
    wire_t0, wire_t1, surf_t0, surf_t1,
    0.46, 0.26, 22.0,
    [0.96, 0.45, 0.68], 6, 3,
    true, papillae
  );
}

/**
 * 4. Stamens & Central Pistil Generator
 */
export function generateStamensAndPistil(center, basis, scale, wire_t0, wire_t1, surf_t0, surf_t1) {
  const elements = [];

  // 1. Central Pistil (Style + 3-lobed Stigma)
  const Nu_s = 28;
  const Nv_s = 13;
  const p0 = [0.0, 0.0, 0.0];
  const p1 = [0.02 * scale, 0.36 * scale, 0.03 * scale];
  const p2 = [0.04 * scale, 0.72 * scale, 0.07 * scale];
  const p3 = [0.02 * scale, 1.02 * scale, 0.14 * scale];

  const posArr = [];
  const tanArr = [];
  for (let i = 0; i < Nu_s; i++) {
    const u = i / (Nu_s - 1);
    const { pos, tan } = evalCubicBezier(p0, p1, p2, p3, u);
    posArr.push(pos);
    tanArr.push(normalizeV3(tan));
  }
  const { N1, N2 } = computeBishopFrame(tanArr);

  const P_style = new Array(Nu_s * Nv_s);
  const C_style = new Array(Nu_s * Nv_s);
  const c_green = [0.52, 0.76, 0.30];
  const c_stigma = [0.62, 0.18, 0.35];

  for (let i = 0; i < Nu_s; i++) {
    const u = i / (Nu_s - 1);
    const n1 = N1[i];
    const n2 = N2[i];
    const pos = posArr[i];

    const tip_close = u > 0.92 ? Math.pow(Math.sin(Math.PI * u), 0.22) : 1.0;
    const base_r = scale * 0.020 * (1.0 - 0.20 * u);

    for (let j = 0; j < Nv_s; j++) {
      const v = -1.0 + (2.0 * j) / (Nv_s - 1);
      const theta = (v + 1.0) * Math.PI;

      let r = base_r;
      if (u > 0.84) {
        const sw = Math.sin(Math.PI * (u - 0.84) / 0.16);
        const lobe = 1.0 + 0.45 * Math.cos(3.0 * theta);
        r = (base_r + scale * 0.022 * sw * lobe) * tip_close;
      }

      const pLocal = [
        pos[0] + r * (Math.cos(theta) * n1[0] + Math.sin(theta) * n2[0]),
        pos[1] + r * (Math.cos(theta) * n1[1] + Math.sin(theta) * n2[1]),
        pos[2] + r * (Math.cos(theta) * n1[2] + Math.sin(theta) * n2[2])
      ];

      const idx = i * Nv_s + j;
      P_style[idx] = transformByBasis(pLocal, center, basis);

      const stigma_mix = smoothstep(0.82, 0.92, u);
      C_style[idx] = [
        (1.0 - stigma_mix) * c_green[0] + stigma_mix * c_stigma[0],
        (1.0 - stigma_mix) * c_green[1] + stigma_mix * c_stigma[1],
        (1.0 - stigma_mix) * c_green[2] + stigma_mix * c_stigma[2]
      ];
    }
  }

  elements.push(new BotanicalElement(
    'pistil', Nu_s, Nv_s, P_style, null, C_style,
    wire_t0, wire_t1, surf_t0, surf_t1,
    0.30, 0.38, 28.0,
    [0.75, 0.95, 0.55], 6, 4
  ));

  // 2. Six Filaments + Versatile Pollen Anthers
  for (let k = 0; k < 6; k++) {
    const az = k * (Math.PI / 3.0) + 0.26;
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const flare = (0.27 + 0.03 * (k % 2)) * scale;
    const h_tip = (0.88 + 0.04 * (k % 3)) * scale;

    const fp0 = [0.028 * scale * ca, 0.02 * scale, 0.028 * scale * sa];
    const fp1 = [0.075 * scale * ca, 0.34 * scale, 0.075 * scale * sa];
    const fp2 = [0.195 * scale * ca, 0.68 * scale, 0.195 * scale * sa];
    const fp3 = [flare * ca, h_tip, flare * sa];

    const Nu_f = 22;
    const Nv_f = 8;
    const fPos = [];
    const fTan = [];
    for (let i = 0; i < Nu_f; i++) {
      const u = i / (Nu_f - 1);
      const { pos, tan } = evalCubicBezier(fp0, fp1, fp2, fp3, u);
      fPos.push(pos);
      fTan.push(normalizeV3(tan));
    }
    const { N1: N1f, N2: N2f } = computeBishopFrame(fTan);

    const P_fil = new Array(Nu_f * Nv_f);
    const C_fil = new Array(Nu_f * Nv_f);
    const c_fil_base = [0.56, 0.80, 0.36];
    const c_fil_tip = [0.98, 0.95, 0.96];

    for (let i = 0; i < Nu_f; i++) {
      const u = i / (Nu_f - 1);
      const rf = scale * (0.012 * (1.0 - 0.45 * u));
      const pos = fPos[i];
      const n1 = N1f[i];
      const n2 = N2f[i];

      const mix = smoothstep(0.15, 0.75, u);
      const cr = (1.0 - mix) * c_fil_base[0] + mix * c_fil_tip[0];
      const cg = (1.0 - mix) * c_fil_base[1] + mix * c_fil_tip[1];
      const cb = (1.0 - mix) * c_fil_base[2] + mix * c_fil_tip[2];

      for (let j = 0; j < Nv_f; j++) {
        const v = -1.0 + (2.0 * j) / (Nv_f - 1);
        const theta = (v + 1.0) * Math.PI;

        const pLocal = [
          pos[0] + rf * (Math.cos(theta) * n1[0] + Math.sin(theta) * n2[0]),
          pos[1] + rf * (Math.cos(theta) * n1[1] + Math.sin(theta) * n2[1]),
          pos[2] + rf * (Math.cos(theta) * n1[2] + Math.sin(theta) * n2[2])
        ];

        const idx = i * Nv_f + j;
        P_fil[idx] = transformByBasis(pLocal, center, basis);
        C_fil[idx] = [cr, cg, cb];
      }
    }

    const st_delay = 0.06 * k;
    elements.push(new BotanicalElement(
      'filament', Nu_f, Nv_f, P_fil, null, C_fil,
      wire_t0 + st_delay, wire_t1 + st_delay * 0.5,
      surf_t0 + st_delay, surf_t1 + st_delay * 0.5,
      0.35, 0.25, 20.0,
      [0.95, 0.90, 0.65], 5, 3
    ));

    // Versatile Pollen Anther
    const Nu_a = 14;
    const Nv_a = 10;
    const anther_len = 0.145 * scale;
    const rad_dir = [ca, 0.0, sa];
    const tan_dir = [-sa, 0.0, ca];

    let a_axis = [
      0.75 * tan_dir[0] + 0.25 * rad_dir[0],
      0.35,
      0.75 * tan_dir[2] + 0.25 * rad_dir[2]
    ];
    a_axis = normalizeV3(a_axis);
    const a_n1 = normalizeV3(crossV3(a_axis, rad_dir));
    const a_n2 = normalizeV3(crossV3(a_axis, a_n1));

    const P_anth = new Array(Nu_a * Nv_a);
    const C_anth = new Array(Nu_a * Nv_a);
    const c_pollen_1 = [0.76, 0.30, 0.07];
    const c_pollen_2 = [0.94, 0.58, 0.14];

    for (let i = 0; i < Nu_a; i++) {
      const ua = i / (Nu_a - 1);
      const s_along = (ua - 0.5) * anther_len;
      const env = Math.pow(Math.max(0.0, Math.sin(Math.PI * ua)), 0.60);

      for (let j = 0; j < Nv_a; j++) {
        const va = -1.0 + (2.0 * j) / (Nv_a - 1);
        const tha = (va + 1.0) * Math.PI;

        const bilobe = 1.0 + 0.28 * Math.cos(2.0 * tha);
        const ra = 0.023 * scale * env * bilobe;

        const cosTh = Math.cos(tha);
        const sinTh = Math.sin(tha);

        const pLocal = [
          fp3[0] + s_along * a_axis[0] + ra * (cosTh * a_n1[0] + sinTh * a_n2[0]),
          fp3[1] + s_along * a_axis[1] + ra * (cosTh * a_n1[1] + sinTh * a_n2[1]),
          fp3[2] + s_along * a_axis[2] + ra * (cosTh * a_n1[2] + sinTh * a_n2[2])
        ];

        const grain = 0.5 + 0.5 * Math.sin(19.0 * ua + 7.0 * tha);
        const idx = i * Nv_a + j;
        P_anth[idx] = transformByBasis(pLocal, center, basis);
        C_anth[idx] = [
          (1.0 - 0.45 * grain) * c_pollen_1[0] + 0.45 * grain * c_pollen_2[0],
          (1.0 - 0.45 * grain) * c_pollen_1[1] + 0.45 * grain * c_pollen_2[1],
          (1.0 - 0.45 * grain) * c_pollen_1[2] + 0.45 * grain * c_pollen_2[2]
        ];
      }
    }

    elements.push(new BotanicalElement(
      'anther', Nu_a, Nv_a, P_anth, null, C_anth,
      wire_t0 + 0.25 + st_delay, wire_t1 + 0.20 + st_delay * 0.5,
      surf_t0 + 0.25 + st_delay, surf_t1 + st_delay * 0.5,
      0.22, 0.15, 10.0,
      [1.0, 0.75, 0.25], 4, 3
    ));
  }

  return elements;
}

/**
 * 5. Lily Bud Generator
 */
export function generateLilyBud(center, basis, scale, is_cracking, wire_t0, wire_t1, surf_t0, surf_t1) {
  const Nu = 30;
  const Nv = 19;
  const length = 0.90 * scale;

  const P = new Array(Nu * Nv);
  const C = new Array(Nu * Nv);

  const c_green = [0.34, 0.62, 0.22];
  const c_rose  = [0.86, 0.34, 0.54];
  const c_ivory = [0.96, 0.92, 0.90];

  for (let i = 0; i < Nu; i++) {
    const u = i / (Nu - 1);
    const r_prof = 0.21 * scale * Math.pow(Math.max(0.0, Math.sin(Math.PI * Math.pow(u, 0.66))), 1.12) * (1.0 - 0.12 * u)
                 + 0.028 * scale * Math.pow(1.0 - u, 2);
    const y = length * u;
    const rose_u = smoothstep(0.24, 0.68, u);
    const tip_u = smoothstep(0.78, 0.98, u);

    for (let j = 0; j < Nv; j++) {
      const v = -1.0 + (2.0 * j) / (Nv - 1);
      const theta = (v + 1.0) * Math.PI;

      const rib = 1.0 + 0.08 * Math.cos(3.0 * theta) * Math.max(0.0, Math.sin(Math.PI * u));
      const rad = r_prof * rib;

      const px = rad * Math.cos(theta);
      const pz = rad * Math.sin(theta);
      const py = y;

      const idx = i * Nv + j;
      P[idx] = transformByBasis([px, py, pz], center, basis);

      let rose_mix = rose_u * (1.0 - 0.45 * (0.5 + 0.5 * Math.cos(3.0 * theta)));
      if (!is_cracking) rose_mix *= 0.45;

      let cr = (1.0 - rose_mix) * c_green[0] + rose_mix * c_rose[0];
      let cg = (1.0 - rose_mix) * c_green[1] + rose_mix * c_rose[1];
      let cb = (1.0 - rose_mix) * c_green[2] + rose_mix * c_rose[2];

      cr = (1.0 - tip_u) * cr + tip_u * c_ivory[0];
      cg = (1.0 - tip_u) * cg + tip_u * c_ivory[1];
      cb = (1.0 - tip_u) * cb + tip_u * c_ivory[2];

      C[idx] = [cr, cg, cb];
    }
  }

  return new BotanicalElement(
    'bud', Nu, Nv, P, null, C,
    wire_t0, wire_t1, surf_t0, surf_t1,
    0.34, 0.30, 22.0,
    [0.68, 0.92, 0.58], 6, 4
  );
}

/**
 * 6. Full Lily Bouquet Scene Assembly
 */
export function buildLilyBouquetScene() {
  const elements = [];
  const c_stem_base = [0.13, 0.35, 0.15];
  const c_stem_tip = [0.32, 0.58, 0.24];

  // 1. Three Main Stems (0.0s -> 2.4s)
  const stems_spec = [
    { p0: [0.03, -2.55, 0.02], p1: [0.09, -1.35, 0.06], p2: [0.14, -0.35, 0.04], p3: [0.10, 0.34, 0.10], rb: 0.048, rt: 0.034, wt0: 0.0, wt1: 1.3, st0: 0.3, st1: 2.0 },
    { p0: [-0.06, -2.55, -0.04], p1: [-0.14, -1.25, -0.05], p2: [-0.18, -0.10, -0.02], p3: [-0.14, 0.82, -0.04], rb: 0.046, rt: 0.032, wt0: 0.15, wt1: 1.5, st0: 0.45, st1: 2.2 },
    { p0: [0.00, -2.55, -0.08], p1: [-0.04, -1.40, -0.10], p2: [0.02, -0.20, -0.09], p3: [0.03, 1.28, -0.10], rb: 0.042, rt: 0.027, wt0: 0.25, wt1: 1.7, st0: 0.6, st1: 2.4 }
  ];

  const stem_curves = [];
  for (const s of stems_spec) {
    const { element, posArr, tanArr } = generateStemTube(
      s.p0, s.p1, s.p2, s.p3, s.rb, s.rt, 36, 13,
      c_stem_base, c_stem_tip, s.wt0, s.wt1, s.st0, s.st1
    );
    elements.push(element);
    stem_curves.push({ posArr, tanArr });
  }

  // 2. Five Branching Pedicels (0.85s -> 2.8s)
  const pedicels_spec = [
    { p0: [0.12, 0.08, 0.07], p1: [0.19, 0.20, 0.15], p2: [0.24, 0.29, 0.23], p3: [0.27, 0.36, 0.30], rb: 0.030, rt: 0.025, wt0: 0.85, wt1: 1.9, st0: 1.2, st1: 2.4 },
    { p0: [-0.15, 0.52, -0.03], p1: [-0.23, 0.68, 0.04], p2: [-0.29, 0.80, 0.10], p3: [-0.34, 0.90, 0.15], rb: 0.028, rt: 0.024, wt0: 1.0, wt1: 2.1, st0: 1.35, st1: 2.55 },
    { p0: [-0.14, -0.45, -0.04], p1: [-0.25, -0.34, 0.05], p2: [-0.33, -0.25, 0.12], p3: [-0.38, -0.18, 0.18], rb: 0.027, rt: 0.023, wt0: 1.1, wt1: 2.2, st0: 1.45, st1: 2.65 },
    { p0: [0.02, 1.12, -0.09], p1: [0.05, 1.30, -0.06], p2: [0.07, 1.46, -0.04], p3: [0.08, 1.60, -0.02], rb: 0.025, rt: 0.021, wt0: 1.25, wt1: 2.3, st0: 1.6, st1: 2.75 },
    { p0: [0.10, 0.34, 0.10], p1: [0.28, 0.66, 0.02], p2: [0.42, 0.94, -0.04], p3: [0.50, 1.16, -0.08], rb: 0.025, rt: 0.021, wt0: 1.3, wt1: 2.35, st0: 1.65, st1: 2.8 }
  ];

  for (const p of pedicels_spec) {
    const { element } = generateStemTube(
      p.p0, p.p1, p.p2, p.p3, p.rb, p.rt, 22, 11,
      c_stem_base, c_stem_tip, p.wt0, p.wt1, p.st0, p.st1
    );
    elements.push(element);
  }

  // 3. 15 Lanceolate Leaves (0.75s -> 3.6s)
  const leaves_spec = [
    [0, 5,  0.45,  0.92, 0.17, 0.35,  0.20, 0.00],
    [0, 9,  2.35,  1.00, 0.18, 0.36, -0.16, 0.12],
    [0, 14, -1.15, 1.04, 0.19, 0.33,  0.22, 0.24],
    [0, 19, 0.85,  0.94, 0.17, 0.30, -0.18, 0.36],
    [0, 24, -0.55, 0.84, 0.16, 0.27,  0.14, 0.48],
    [0, 30, 1.65,  0.74, 0.14, 0.24, -0.14, 0.60],

    [1, 7,  -2.25, 0.94, 0.17, 0.35, -0.20, 0.10],
    [1, 12, 3.05,  1.02, 0.18, 0.34,  0.16, 0.22],
    [1, 17, -1.65, 0.98, 0.18, 0.32, -0.22, 0.34],
    [1, 23, 2.25,  0.88, 0.16, 0.29,  0.18, 0.46],
    [1, 29, -2.55, 0.78, 0.15, 0.25, -0.15, 0.58],

    [2, 10, -0.25, 0.88, 0.16, 0.34,  0.15, 0.20],
    [2, 16, 1.25,  0.92, 0.17, 0.31, -0.18, 0.35],
    [2, 22, -2.85, 0.82, 0.15, 0.28,  0.16, 0.50],
    [2, 28, 0.55,  0.72, 0.13, 0.24, -0.12, 0.65],
  ];

  for (const spec of leaves_spec) {
    const [s_idx, u_idx, az, l_len, l_wid, arch, tw, dly] = spec;
    const curve = stem_curves[s_idx];
    const origin = curve.posArr[u_idx];
    const s_dir = curve.tanArr[u_idx];
    elements.push(generateLanceolateLeaf(
      origin, s_dir, az, l_len, l_wid, arch, tw,
      0.75 + dly, 2.10 + dly,
      1.35 + dly, 3.15 + dly
    ));
  }

  // 4. Three Blooming Oriental Lilies (Buds emerge at 1.8s-2.4s, then bloom open till ~7.5s)
  const flowers_spec = [
    // Flower 1: Hero Center-Right (Full Stargazer Oriental Lily)
    {
      center: [0.27, 0.36, 0.30],
      dir: [0.22, 0.50, 0.84],
      scale: 0.90,
      openness: 1.00,
      variant: 'stargazer',
      rot_offset: 0.22,
      wire_t0: 1.0, wire_t1: 2.0,
      surf_t0: 1.8, surf_t1: 6.6,
      stamen_t0: 3.8, stamen_t1: 7.0,
      seed_base: 100
    },
    // Flower 2: Hero Upper-Left (Full Soft-Rose Oriental Lily)
    {
      center: [-0.34, 0.90, 0.15],
      dir: [-0.24, 0.58, 0.78],
      scale: 0.84,
      openness: 0.95,
      variant: 'soft_rose',
      rot_offset: 0.75,
      wire_t0: 1.2, wire_t1: 2.2,
      surf_t0: 2.1, surf_t1: 6.9,
      stamen_t0: 4.1, stamen_t1: 7.3,
      seed_base: 200
    },
    // Flower 3: Lower-Left Trumpet-Stage Bloom
    {
      center: [-0.38, -0.18, 0.18],
      dir: [-0.30, 0.46, 0.83],
      scale: 0.76,
      openness: 0.82,
      variant: 'blush_ivory',
      rot_offset: -0.32,
      wire_t0: 1.4, wire_t1: 2.4,
      surf_t0: 2.4, surf_t1: 7.2,
      stamen_t0: 4.4, stamen_t1: 7.6,
      seed_base: 300
    }
  ];

  for (const f of flowers_spec) {
    const basis = buildBasisFromDir(f.dir);

    // 3 Outer Sepals
    for (let k = 0; k < 3; k++) {
      const az = f.rot_offset + k * (2.0 * Math.PI / 3.0);
      const dly = 0.08 * k;
      elements.push(generateLilyTepal(
        f.center, basis, az, false,
        f.scale, f.openness, f.variant,
        f.wire_t0 + dly, f.wire_t1 + dly,
        f.surf_t0 + dly, f.surf_t1 + dly,
        f.seed_base + k
      ));
    }

    // 3 Inner Petals
    for (let k = 0; k < 3; k++) {
      const az = f.rot_offset + (k + 0.5) * (2.0 * Math.PI / 3.0);
      const dly = 0.12 + 0.08 * k;
      elements.push(generateLilyTepal(
        f.center, basis, az, true,
        f.scale, f.openness, f.variant,
        f.wire_t0 + dly, f.wire_t1 + dly,
        f.surf_t0 + dly, f.surf_t1 + dly,
        f.seed_base + 10 + k
      ));
    }

    // Stamens & Pistil
    const stamenElements = generateStamensAndPistil(
      f.center, basis, f.scale,
      f.stamen_t0, f.stamen_t0 + 1.2,
      f.stamen_t0 + 0.3, f.stamen_t1
    );
    elements.push(...stamenElements);
  }

  // 5. Two Botanical Lily Buds (Crown & Right Flank)
  const bud1_basis = buildBasisFromDir([0.06, 0.95, 0.16]);
  elements.push(generateLilyBud(
    [0.08, 1.60, -0.02], bud1_basis, 0.80, true,
    1.2, 2.0, 1.6, 2.8
  ));

  const bud2_basis = buildBasisFromDir([0.36, 0.90, 0.12]);
  elements.push(generateLilyBud(
    [0.50, 1.16, -0.08], bud2_basis, 0.74, false,
    1.3, 2.1, 1.8, 3.0
  ));

  return elements;
}
