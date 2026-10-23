/**
 * 3D Botanical Lily Mathematics & Easing Utilities
 * Direct port of the parametric algorithms from generate_lily_animation.py
 */

export function clamp(x, lo = 0.0, hi = 1.0) {
  return Math.min(Math.max(x, lo), hi);
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-8, (edge1 - edge0)), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-8, (edge1 - edge0)), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

export function vec3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function normV3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalizeV3(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n < 1e-8) return [0, 1, 0];
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function dotV3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function crossV3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function addV3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subV3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleV3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function rotX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c]
  ];
}

export function rotY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c]
  ];
}

export function rotZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1]
  ];
}

export function matMulV3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Construct an orthonormal 3x3 basis matrix whose local Y-axis aligns with `direction`.
 * Returns 3 row vectors: [xAxis, yAxis, zAxis] or basis columns
 */
export function buildBasisFromDir(direction, upHint = [0.0, 1.0, 0.0]) {
  const yAxis = normalizeV3(direction);
  if (Math.abs(dotV3(yAxis, upHint)) > 0.95) {
    upHint = [0.0, 0.0, 1.0];
  }
  let xAxis = crossV3(upHint, yAxis);
  xAxis = normalizeV3(xAxis);
  let zAxis = crossV3(xAxis, yAxis);
  zAxis = normalizeV3(zAxis);

  // Basis matrix where local [x, y, z] transforms as:
  // v_world = xAxis * x + yAxis * y + zAxis * z
  return { xAxis, yAxis, zAxis };
}

export function transformByBasis(pLocal, center, basis) {
  return [
    center[0] + basis.xAxis[0] * pLocal[0] + basis.yAxis[0] * pLocal[1] + basis.zAxis[0] * pLocal[2],
    center[1] + basis.xAxis[1] * pLocal[0] + basis.yAxis[1] * pLocal[1] + basis.zAxis[1] * pLocal[2],
    center[2] + basis.xAxis[2] * pLocal[0] + basis.yAxis[2] * pLocal[1] + basis.zAxis[2] * pLocal[2],
  ];
}

/**
 * Evaluate 3D cubic Bezier curve and its tangent at parameter u in [0, 1].
 */
export function evalCubicBezier(p0, p1, p2, p3, u) {
  const om = 1.0 - u;
  const om2 = om * om;
  const om3 = om2 * om;
  const u2 = u * u;
  const u3 = u2 * u;

  const pos = [
    om3 * p0[0] + 3.0 * om2 * u * p1[0] + 3.0 * om * u2 * p2[0] + u3 * p3[0],
    om3 * p0[1] + 3.0 * om2 * u * p1[1] + 3.0 * om * u2 * p2[1] + u3 * p3[1],
    om3 * p0[2] + 3.0 * om2 * u * p1[2] + 3.0 * om * u2 * p2[2] + u3 * p3[2],
  ];

  const tan = [
    3.0 * om2 * (p1[0] - p0[0]) + 6.0 * om * u * (p2[0] - p1[0]) + 3.0 * u2 * (p3[0] - p2[0]),
    3.0 * om2 * (p1[1] - p0[1]) + 6.0 * om * u * (p2[1] - p1[1]) + 3.0 * u2 * (p3[1] - p2[1]),
    3.0 * om2 * (p1[2] - p0[2]) + 6.0 * om * u * (p2[2] - p1[2]) + 3.0 * u2 * (p3[2] - p2[2]),
  ];

  return { pos, tan };
}

/**
 * Compute a twist-free Bishop parallel transport frame (N1, N2) along tangent array T.
 */
export function computeBishopFrame(T) {
  const Nu = T.length;
  const N1 = new Array(Nu);
  const N2 = new Array(Nu);

  const t0 = T[0];
  let ref = [0.0, 0.0, 1.0];
  if (Math.abs(dotV3(t0, ref)) > 0.9) {
    ref = [1.0, 0.0, 0.0];
  }
  let n1 = normalizeV3(crossV3(t0, ref));
  let n2 = crossV3(t0, n1);
  N1[0] = n1;
  N2[0] = n2;

  for (let i = 1; i < Nu; i++) {
    const ti = T[i];
    const dot = dotV3(n1, ti);
    let n1Proj = subV3(n1, scaleV3(ti, dot));
    let normN1 = normV3(n1Proj);
    if (normN1 < 1e-6) {
      n1Proj = crossV3(ti, n2);
      normN1 = normV3(n1Proj);
    }
    n1 = scaleV3(n1Proj, 1.0 / Math.max(1e-8, normN1));
    n2 = crossV3(ti, n1);
    N1[i] = n1;
    N2[i] = n2;
  }

  return { N1, N2 };
}

/**
 * Simple pseudo-random number generator for reproducible procedural papillae
 */
export function createPRNG(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
