/**
 * GLSL Shaders for Botanical Subsurface Scattering, Petal Morphing,
 * Wavefront Glowing Construction Edge, and Physical Cuticle Lighting.
 */

export const BotanicalSurfaceShader = {
  vertexShader: `
    attribute vec2 uvParam;        // (u in [0,1], v in [-1,1])
    attribute vec3 positionClosed; // Position in bud/semi-closed state
    attribute vec3 normalClosed;   // Normal in bud state
    attribute vec3 color;          // Base botanical pigment

    uniform float uBloomT;         // Morph factor [0, 1]
    uniform float uIsPetal;        // 1.0 if petal, 0.0 otherwise

    varying vec3 vColor;
    varying vec2 vUVParam;
    varying vec3 vNormalCam;
    varying vec3 vViewPos;

    void main() {
      vec3 pos = position;
      vec3 norm = normal;

      if (uIsPetal > 0.5) {
        pos = mix(positionClosed, position, uBloomT);
        norm = normalize(mix(normalClosed, normal, uBloomT));
      }

      vColor = color;
      vUVParam = uvParam;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      vViewPos = -mvPosition.xyz;
      
      // Transform normal into view/camera space
      vNormalCam = normalize(normalMatrix * norm);

      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    uniform float uSurfProg;       // Construction progress [0, 1]
    uniform float uSssStrength;    // Subsurface scattering strength
    uniform float uSpecStrength;   // Blinn-Phong specular highlight strength
    uniform float uShininess;      // Waxy cuticle glossiness
    uniform float uHueShift;       // Hue rotation in radians
    uniform float uIsPetal;        // 1.0 if petal, 0.0 otherwise
    uniform float uBloomT;         // Bloom factor [0, 1]

    varying vec3 vColor;
    varying vec2 vUVParam;
    varying vec3 vNormalCam;
    varying vec3 vViewPos;

    // RGB ↔ HSL conversion for hue rotation
    vec3 rgb2hsl(vec3 c) {
      float mx = max(max(c.r, c.g), c.b);
      float mn = min(min(c.r, c.g), c.b);
      float l = (mx + mn) * 0.5;
      if (mx == mn) return vec3(0.0, 0.0, l);
      float d = mx - mn;
      float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
      float h;
      if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
      else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
      else h = (c.r - c.g) / d + 4.0;
      h /= 6.0;
      return vec3(h, s, l);
    }

    float hue2rgb(float p, float q, float t) {
      if (t < 0.0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
      if (t < 1.0/2.0) return q;
      if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
      return p;
    }

    vec3 hsl2rgb(vec3 c) {
      if (c.y == 0.0) return vec3(c.z);
      float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
      float p = 2.0 * c.z - q;
      return vec3(
        hue2rgb(p, q, c.x + 1.0/3.0),
        hue2rgb(p, q, c.x),
        hue2rgb(p, q, c.x - 1.0/3.0)
      );
    }

    void main() {
      // 1. Progressive Surface Materialization along u and v
      float u = vUVParam.x;
      float v = vUVParam.y;
      float eff_u = 0.85 * u + 0.15 * abs(v);

      if (uSurfProg < 0.001 || eff_u > (uSurfProg * 1.02)) {
        discard;
      }

      // Apply hue shift to petals (keep green stems & leaves natural)
      vec3 baseColor = vColor;
      if (uIsPetal > 0.5 && abs(uHueShift) > 0.001) {
        vec3 hsl = rgb2hsl(baseColor);
        hsl.x = fract(hsl.x + uHueShift / 6.2831853);
        baseColor = hsl2rgb(hsl);
      }

      // 2. 3D Procedural Petal Venation & Longitudinal Rib Normal Perturbation
      float rib_freq = (uIsPetal > 0.5) ? 38.0 : 22.0;
      float rib_wave = sin(v * rib_freq * 3.14159265);
      float rib_slope = cos(v * rib_freq * 3.14159265);
      float midrib_keel = 1.0 - smoothstep(0.0, 0.075, abs(v));

      vec3 N = (vNormalCam.z < 0.0) ? -vNormalCam : vNormalCam;
      N = normalize(N);

      // Micro-relief 3D perturbation catching physical highlights on veins
      vec3 T_v = normalize(cross(N, vec3(0.0, 1.0, 0.0)));
      if (length(T_v) < 0.1) T_v = normalize(cross(N, vec3(1.0, 0.0, 0.0)));
      float bump_factor = (uIsPetal > 0.5) ? 0.24 : 0.14;
      vec3 N_bump = normalize(N + T_v * (rib_slope * bump_factor));

      // 3. Camera-Space Botanical Lighting
      vec3 L_key = normalize(vec3(-0.42, 0.62, 0.66));
      vec3 L_fill = normalize(vec3(0.65, -0.20, 0.73));
      vec3 V_dir = vec3(0.0, 0.0, 1.0);

      float ndotl_key = dot(N_bump, L_key);
      float diff_key = clamp((ndotl_key + 0.25) / 1.25, 0.0, 1.0);

      float ndotl_fill = dot(N_bump, L_fill);
      float diff_fill = clamp((ndotl_fill + 0.40) / 1.40, 0.0, 1.0);

      float ndotv = clamp(dot(N_bump, V_dir), 0.0, 1.0);
      float fresnel_rim = pow(1.0 - ndotv, 2.2);
      float back_trans = clamp(-ndotl_key * 0.6 + 0.45, 0.0, 1.0);
      float sss = uSssStrength * (0.55 * fresnel_rim + 0.45 * back_trans);

      vec3 H_key = normalize(L_key + V_dir);
      float ndoth = clamp(dot(N_bump, H_key), 0.0, 1.0);
      float spec = uSpecStrength * pow(ndoth, uShininess);

      vec3 key_col = vec3(1.02, 0.99, 0.96);
      vec3 fill_col = vec3(0.72, 0.80, 0.90);
      vec3 sss_col = (uIsPetal > 0.5) ? vec3(0.85, 0.92, 1.05) : vec3(0.85, 1.05, 0.80);

      // 4. 3D Tactile Venation & Procedural Contour Grid printed on surface
      float tex_3d = 0.92 + 0.08 * rib_wave + 0.12 * midrib_keel;

      // 3D Parametric Contour Grid (Holographic Isoline Blueprint Texture)
      float grid_u = fract(u * 28.0);
      float grid_v = fract((v * 0.5 + 0.5) * 16.0);
      float line_u = 1.0 - smoothstep(0.0, 0.065, min(grid_u, 1.0 - grid_u));
      float line_v = 1.0 - smoothstep(0.0, 0.085, min(grid_v, 1.0 - grid_v));
      float isogrid = max(line_u, line_v);

      // The 3D grid glows gently during blooming and remains as a rich tactile texture at full bloom
      float grid_glow = isogrid * (0.16 + 0.48 * (1.0 - uBloomT));
      vec3 grid_color = mix(baseColor * 1.5 + vec3(0.2, 0.35, 0.5), vec3(0.75, 0.92, 1.0), 0.6);

      vec3 lit_rgb = baseColor * tex_3d * (0.30 + 0.68 * diff_key * key_col + 0.20 * diff_fill * fill_col)
                   + baseColor * sss * sss_col
                   + spec * vec3(0.96, 0.95, 0.93)
                   + grid_glow * grid_color;

      // 5. Glowing Construction Wavefront Rim (the 3D holographic laser trace effect when blooming)
      if (uSurfProg < 0.995) {
        float dist_edge = (uSurfProg * 1.02) - eff_u;
        if (dist_edge >= 0.0 && dist_edge < 0.06) {
          float rim_glow = exp(-pow(dist_edge / 0.024, 2.0));
          vec3 glow_col = (uIsPetal > 0.5) ? vec3(0.55, 0.90, 1.0) : vec3(0.85, 1.0, 0.65);
          lit_rgb += 1.10 * rim_glow * glow_col;
        }
      }

      // Tonemapping & Soft Compression
      lit_rgb = clamp(lit_rgb, 0.0, 1.35);
      lit_rgb = lit_rgb / (1.0 + 0.12 * lit_rgb);

      gl_FragColor = vec4(clamp(lit_rgb, 0.0, 1.0), 1.0);
    }
  `
};

export const BotanicalWireframeShader = {
  vertexShader: `
    attribute float paramU;
    attribute vec3 positionClosed;
    uniform float uBloomT;
    uniform float uIsPetal;
    varying float vParamU;

    void main() {
      vParamU = paramU;
      vec3 pos = position;
      if (uIsPetal > 0.5) {
        pos = mix(positionClosed, position, uBloomT);
      }
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      // Nudge forward slightly in view-space so 3D wireframe contours float crisply over the surface
      mvPosition.z += 0.0035;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    uniform float uWireProg;   // Isoline trace progress [0, 1]
    uniform float uWireAlpha;  // Fadeout alpha
    uniform vec3 uWireColor;   // Color of isoline
    uniform float uHueShift;   // Hue rotation in radians
    uniform float uIsPetal;    // 1.0 if petal

    varying float vParamU;

    vec3 rgb2hsl(vec3 c) {
      float mx = max(max(c.r, c.g), c.b);
      float mn = min(min(c.r, c.g), c.b);
      float l = (mx + mn) * 0.5;
      if (mx == mn) return vec3(0.0, 0.0, l);
      float d = mx - mn;
      float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
      float h;
      if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
      else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
      else h = (c.r - c.g) / d + 4.0;
      h /= 6.0;
      return vec3(h, s, l);
    }

    float hue2rgb(float p, float q, float t) {
      if (t < 0.0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
      if (t < 1.0/2.0) return q;
      if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
      return p;
    }

    vec3 hsl2rgb(vec3 c) {
      if (c.y == 0.0) return vec3(c.z);
      float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
      float p = 2.0 * c.z - q;
      return vec3(
        hue2rgb(p, q, c.x + 1.0/3.0),
        hue2rgb(p, q, c.x),
        hue2rgb(p, q, c.x - 1.0/3.0)
      );
    }

    void main() {
      if (vParamU > uWireProg || uWireAlpha <= 0.01) {
        discard;
      }
      vec3 col = uWireColor;
      if (uIsPetal > 0.5 && abs(uHueShift) > 0.001) {
        vec3 hsl = rgb2hsl(col);
        hsl.x = fract(hsl.x + uHueShift / 6.2831853);
        col = hsl2rgb(hsl);
      }
      gl_FragColor = vec4(col, uWireAlpha);
    }
  `
};

export const BotanicalParticleShader = {
  vertexShader: `
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aPhase;

    uniform float uTime;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      vColor = aColor;
      float twinkle = 0.4 + 0.6 * sin(uTime * 2.4 + aPhase);
      vAlpha = twinkle * 0.55;

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float d = max(-mvPosition.z, 0.8);
      // Small, gentle golden dust specks (3px to 8px max)
      gl_PointSize = clamp(aSize * (14.0 / d), 2.0, 8.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      float soft = smoothstep(0.5, 0.08, dist);
      gl_FragColor = vec4(vColor, vAlpha * soft);
    }
  `
};
