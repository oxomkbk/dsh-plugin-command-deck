// ─────────────────────────────────────────────────────────────────────────────
// ORBITAL COMMAND scene (WebGL, three.js r169) — the living background of the deck.
//
//   deep field ── star sphere · 3D glyph-rain volume (Matrix) · drifting motes
//   centre ────── holographic Earth with planetary engines (globe.js) on a holo-table:
//                 projector disc + light cone, tilted Jarvis orbit rings, a camera-facing
//                 HUD reticle, six tool satellites on their own orbits, data arcs over land
//   events ────── data streams Earth → result panel, arrival bursts, ignition cascades
//   post ──────── UnrealBloom + grade pass (vignette, edge chromatic split, grain)
//
// Agent state drives the whole scene (ring spin, engine thrust, scan speed, alert tint).
// Colour management is off on purpose: every hex in the theme is what reaches the screen.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/three/addons/postprocessing/ShaderPass.js';
import { Globe, ll2v } from './globe.js';

THREE.ColorManagement.enabled = false;
const FOV = 36;
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:.=*+-<>|';
export const TOOLS = ['web_search', 'news_search', 'video_search', 'image_search', 'wiki_lookup', 'fetch_page', 'geocode', 'calculator'];
const TOOL_LABEL = { web_search: 'WEB', news_search: 'NEWS', video_search: 'VIDEO', image_search: 'IMAGES', wiki_lookup: 'WIKI', fetch_page: 'READER', geocode: 'WORLD', calculator: 'COMPUTE' };
// assistant tools share a satellite with their family
const SAT_OF = { web_fetch: 'fetch_page', bash: 'calculator', pwsh: 'calculator', read: 'fetch_page', write: 'fetch_page', edit: 'fetch_page', str_replace_editor: 'fetch_page', glob: 'wiki_lookup', grep: 'wiki_lookup', read_image: 'image_search', todo_write: 'geocode', image_download: 'image_search', weather: 'geocode', world_time: 'geocode', unit_convert: 'calculator', currency: 'calculator', memory: 'calculator', reminder: 'calculator' };
export const TIERS = {
  high:     { cols: 260, motes: 900, stars: 5000, engines: 1600, arcs: 22, pr: 2,    bloom: true,  grade: true },
  balanced: { cols: 160, motes: 500, stars: 3200, engines: 900,  arcs: 14, pr: 1.25, bloom: true,  grade: true },
  low:      { cols: 70,  motes: 160, stars: 1500, engines: 320,  arcs: 6,  pr: 1,    bloom: false, grade: false },
};
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
// state → [ring spin, engine thrust, globe spin, scan]
const STATE_FX = {
  idle: [0.25, 0.22, 1], listening: [0.4, 0.3, 1], thinking: [1.4, 0.55, 1.6], tool_running: [2.6, 1.0, 2.2], rendering: [3.6, 1.25, 2.6],
  paused: [0.05, 0.06, 0.15], done: [0.6, 0.4, 1.2], error: [0.1, 0.0, 0.3], interrupted: [0.15, 0.08, 0.4],
};

function glyphAtlas() {
  const a = document.createElement('canvas'); a.width = a.height = 512; const g = a.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#fff'; g.font = '50px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 64; i++) { g.save(); g.translate((i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 32); g.scale(-1, 1); g.fillText(GLYPHS[i % GLYPHS.length], 0, 2); g.restore(); }
  const t = new THREE.CanvasTexture(a); t.minFilter = THREE.LinearMipMapLinearFilter; return t;
}
const ringMat = (color, segs, gap, alpha) => new THREE.ShaderMaterial({
  ...add, side: THREE.DoubleSide,
  uniforms: { uColor: { value: color }, uAlpha: { value: alpha }, uSegs: { value: segs }, uGap: { value: gap }, uPulse: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uSegs, uGap, uPulse; varying vec3 vP;
    void main(){ float a = atan(vP.y, vP.x)/6.2831853 + 0.5; float s = step(uGap, fract(a*uSegs)); gl_FragColor = vec4(uColor*s*(uAlpha + uPulse*0.6), 1.0); }`,
});

export class Space {
  constructor(host) {
    this.host = host;
    this.ok = true; this.tier = 'balanced'; this.reduced = false; this.state = 'idle'; this.rainLevel = 1;
    this.view = { yaw: 0, pitch: 0.16, zoom: 1 };          // user camera (drag / wheel / hands)
    this.goal = { yaw: 0, pitch: 0.16, zoom: 1 };
    this.spinVel = 0; this.parallax = { x: 0, y: 0 };
    this.focusRect = { x: innerWidth * 0.3, y: 90, w: innerWidth * 0.4, h: innerHeight * 0.6 };
    this.flows = []; this.bursts = []; this.labels = []; this.tickers = new Set(); this.sats = [];
    this.color = new THREE.Color('#49e6ff'); this.hot = new THREE.Color('#eafcff'); this.warm = new THREE.Color('#ffb347'); this.engine = new THREE.Color('#58c8ff');
    this.camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 10, 40000);
    this.scene = new THREE.Scene();
    try {
      this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
      this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.gl.setClearColor(0x000308, 1);
      this.gl.domElement.id = 'space';
      (document.getElementById('zoom-root') || document.body).prepend(this.gl.domElement);
      const ctx = this.gl.getContext(), dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      this.gpu = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl';
      this.atlas = glyphAtlas();
      this.buildWorld();
    } catch (e) {
      console.warn('WebGL unavailable — orbital scene disabled', e);
      this.ok = false; this.gl = null;
    }
    this.raycaster = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); this.v = new THREE.Vector3();
    addEventListener('resize', () => this.resize());
    this.setTier(this.gpu && /swiftshader|llvmpipe|software/i.test(this.gpu) ? 'low' : 'balanced');
    this.resize();
    this.fps = 60; this.frames = 0; this.fpsT = performance.now(); this.last = performance.now(); this.t = this.last;
    this.autoPerf = true;
    requestAnimationFrame((t) => this.frame(t));
  }
  get T() { return TIERS[this.tier]; }

  // ───────────── build
  buildWorld() {
    const R = this.R = 240;
    this.globe = new Globe({ R, color: this.color, warm: this.warm, engineColor: this.engine });
    this.scene.add(this.globe.group);
    this.globe.ready.then(() => { this.globe.buildEngines(this.T.engines); this.rebuildArcs(); });
    this.buildSky(); this.buildHud(); this.buildTable(); this.buildSatellites();
    const mkPts = (n, size) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
      const m = new THREE.ShaderMaterial({ ...add, uniforms: { uColor: { value: this.hot }, uScale: { value: size } },
        vertexShader: 'attribute float aA; uniform float uScale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aA > 0.0 ? uScale*900.0/max(-mv.z,1.0) : 0.0; }',
        fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float r = length(gl_PointCoord-0.5); gl_FragColor = vec4(uColor*(1.0 - smoothstep(0.0, 0.5, r))*vA, 1.0); }' });
      const p = new THREE.Points(g, m); p.frustumCulled = false; this.scene.add(p); return p;
    };
    this.streamPts = mkPts(1400, 10); this.burstPts = mkPts(700, 8);
    this.flowLines = new THREE.Group(); this.scene.add(this.flowLines);
  }
  /**
   * v5.5 SKY DOME — the theme's world behind everything: a two-tone gradient with a glowing horizon band, and
   * optional set pieces: the striped OUTRUN sun behind the globe, AURORA ribbons, Martian DUST haze, deep-sea
   * CAUSTICS. Drawn first (no depth), NaN-safe (no pow of negatives, ordered smoothstep edges, clamped acos).
   */
  buildSky() {
    const C = (h) => new THREE.Color(h);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: { uTop: { value: C('#000308') }, uHor: { value: C('#03182a') }, uSunA: { value: C('#ffd319') }, uSunB: { value: C('#ff2975') },
        uAccent: { value: this.color }, uWarm: { value: this.warm }, uHorizon: { value: 0.55 }, uSun: { value: 0 }, uAurora: { value: 0 }, uDust: { value: 0 },
        uCaustics: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop, uHor, uSunA, uSunB, uAccent, uWarm; uniform float uHorizon, uSun, uAurora, uDust, uCaustics, uTime; varying vec3 vD;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
        void main(){
          // the camera looks DOWN at the globe (~17°), so the backdrop's "horizon" sits behind the upper globe, not at true 0°
          vec3 d = normalize(vD); float y = d.y + 0.20, az = atan(d.x, -d.z);
          // mostly the dark top colour; the horizon colour lives in a narrow glowing band (and dimly below it)
          vec3 col = mix(uHor*0.28, uTop, smoothstep(-0.04, 0.16, y));
          col += uHor*exp(-abs(y - 0.005)*30.0)*0.32*uHorizon + uHor*exp(-abs(y)*6.0)*0.06*uHorizon;
          // OUTRUN sun: a big disc behind the globe, striped in its lower half
          vec3 sd = normalize(vec3(0.0, -0.09, -1.0)); float a = acos(clamp(dot(d, sd), -1.0, 1.0));
          float rel = clamp((d.y - sd.y)/0.2, -1.0, 1.0);
          float bars = rel < 0.3 ? step(0.3 + (0.3 - rel)*0.4, fract(rel*7.0 + 0.5)) : 1.0;
          float disc = (1.0 - smoothstep(0.2, 0.205, a))*bars*step(0.0, y);
          vec3 sunc = mix(uSunB, uSunA, rel*0.5 + 0.5);
          col = mix(col, sunc*0.62, disc*uSun);
          col += sunc*exp(-a*9.0)*0.1*uSun*step(-0.02, y);
          // AURORA: two drifting curtains of light high in the sky
          if (uAurora > 0.0) {
            float n1 = noise(vec2(az*2.2 + uTime*0.05, uTime*0.03)), n2 = noise(vec2(az*3.1 - uTime*0.04, 3.0 + uTime*0.02));
            float b1 = 0.13 + sin(az*2.0 + uTime*0.12 + n1*3.0)*0.04, b2 = 0.2 + sin(az*1.3 - uTime*0.09 + n2*2.5)*0.035;
            float c1 = exp(-abs(y - b1)*48.0)*smoothstep(0.03, 0.1, y), c2 = exp(-abs(y - b2)*60.0)*smoothstep(0.08, 0.16, y);
            float rays = 0.65 + 0.35*noise(vec2(az*40.0, uTime*0.4));
            col += (uAccent*c1 + mix(uAccent, uWarm, 0.7)*c2*0.8)*rays*0.32*uAurora;   // kept under the bloom threshold: ribbons, not a white-out
          }
          // DUST: warm haze rising from the horizon, slowly churning
          col += uWarm*exp(-abs(y + 0.01)*10.0)*(0.06 + 0.06*noise(vec2(az*6.0 + uTime*0.06, y*8.0)))*uDust;
          // CAUSTICS: rippling light from above (deep sea)
          if (uCaustics > 0.0) {
            vec2 q = vec2(az*7.0, y*14.0); float w = noise(q*1.7 + uTime*0.18) + noise(q*3.1 - uTime*0.13);
            float cs = 1.0 - smoothstep(0.0, 0.08, abs(w - 1.0));
            col += uAccent*cs*0.2*smoothstep(-0.12, 0.2, y)*uCaustics;
          }
          gl_FragColor = vec4(max(col, vec3(0.0)), 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), this.skyMat);
    sky.renderOrder = -100; sky.frustumCulled = false; this.scene.add(sky); this.sky = sky;
  }
  /** Apply a theme's world (core/themes.js → scene). Colours glide over ~0.8 s. */
  setTheme(sc, accent) {
    this.sceneTheme = sc;
    const g = this.skyGoal = { top: new THREE.Color(sc.sky[0]), hor: new THREE.Color(sc.sky[1]), sunA: new THREE.Color(sc.sunColor?.[0] || '#ffd319'), sunB: new THREE.Color(sc.sunColor?.[1] || '#ff2975'),
      floor: new THREE.Color(sc.floorTint || accent || '#49e6ff') };
    const u = this.skyMat?.uniforms; if (!u) return;
    Object.assign(this.skyNum = {}, { uHorizon: sc.horizon ?? 0.6, uSun: sc.sun || 0, uAurora: sc.aurora || 0, uDust: sc.dust || 0, uCaustics: sc.caustics || 0 });
    if (this.bloom) this.bloom.strength = sc.bloom ?? 0.72;
    if (this.floorMat) this.floorMat.uniforms.uGain.value = sc.floor ?? 1;
    if (this.starMat) this.starMat.uniforms.uGain.value = sc.stars ?? 1;
    if (this.moteMat) this.moteMat.uniforms.uGain.value = sc.motes ?? 1;
    if (!this.skyInit) { this.skyInit = true; this.skyStep(1); }               // first theme: no fade from the defaults
  }
  skyStep(k) {
    const u = this.skyMat?.uniforms, g = this.skyGoal; if (!u || !g) return;
    u.uTop.value.lerp(g.top, k); u.uHor.value.lerp(g.hor, k); u.uSunA.value.lerp(g.sunA, k); u.uSunB.value.lerp(g.sunB, k);
    this.floorTint.lerp(g.floor, k);
    for (const [key, v] of Object.entries(this.skyNum || {})) u[key].value += (v - u[key].value) * k;
  }
  /** Jarvis rings: two tilted orbit rings + a camera-facing reticle. */
  buildHud() {
    const R = this.R, c = this.color, ring = (r1, r2, segs, gap, alpha, col = c) => new THREE.Mesh(new THREE.RingGeometry(r1, r2, 192, 1), ringMat(col, segs, gap, alpha));
    this.tilted = new THREE.Group(); this.scene.add(this.tilted);
    const a = new THREE.Group(); a.rotation.set(1.28, 0.25, 0); a.add(ring(R * 1.34, R * 1.355, 90, 0.45, 0.55), ring(R * 1.4, R * 1.405, 1, 0, 0.18));
    const b = new THREE.Group(); b.rotation.set(1.05, -0.55, 0.3); b.add(ring(R * 1.5, R * 1.51, 4, 0.1, 0.35, this.warm));
    this.tilted.add(a, b); this.tiltRings = [a, b];
    this.reticle = new THREE.Group(); this.scene.add(this.reticle);
    this.retRings = [ring(R * 1.62, R * 1.64, 3, 0.1, 0.6), ring(R * 1.7, R * 1.72, 120, 0.6, 0.45), ring(R * 1.78, R * 1.83, 240, 0.82, 0.25), ring(R * 1.92, R * 1.925, 1, 0, 0.14), ring(R * 1.86, R * 1.875, 6, 0.55, 0.5, this.warm)];
    this.retRings.forEach((r) => this.reticle.add(r));
  }
  /** Holo-table under the globe: polar grid disc with a radar sweep + projector light cone. */
  buildTable() {
    const R = this.R, y = -R * 1.55;
    this.table = new THREE.Group(); this.table.position.y = y; this.scene.add(this.table);
    this.discMat = new THREE.ShaderMaterial({
      ...add, side: THREE.DoubleSide,
      uniforms: { uColor: { value: this.color }, uWarm: { value: this.warm }, uTime: { value: 0 }, uSweep: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor, uWarm; uniform float uTime, uSweep; varying vec2 vP;
        float ln(float v, float w){ float d = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, d); }
        void main(){ float r = length(vP)/${(R * 2.6).toFixed(1)}; if (r > 1.0) discard; float a = atan(vP.y, vP.x);
          float rings = ln(r*14.0, 0.035)*0.5 + ln(r*3.5, 0.02)*0.9;
          float spokes = ln(a/6.2831853*72.0, 0.04)*step(0.86, r)*0.8 + ln(a/6.2831853*12.0, 0.012)*0.35;
          float sw = mod(a - uTime*0.9*uSweep, 6.2831853); float wedge = exp(-sw*3.0)*0.55*(1.0 - smoothstep(0.2, 1.0, r));
          float edge = (1.0 - smoothstep(0.97, 1.0, r))*smoothstep(0.93, 0.97, r);
          float fade = (1.0 - smoothstep(0.55, 1.0, r))*0.85 + 0.15;
          vec3 col = uColor*(rings + spokes + wedge)*fade*0.32 + uColor*edge*0.45;
          col += uColor*exp(-r*r*18.0)*0.22;
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(R * 5.2, R * 5.2), this.discMat); disc.rotation.x = -Math.PI / 2; this.table.add(disc);
    this.coneMat = new THREE.ShaderMaterial({
      ...add, side: THREE.DoubleSide, uniforms: { uColor: { value: this.color }, uI: { value: 0.2 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vP; void main(){ vY = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vP; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(-vP))); gl_FragColor = vec4(uColor*pow(clamp(1.0 - vY, 0.0, 1.0), 1.6)*(0.25 + f*0.9)*uI, 1.0); }',
    });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 1.25, R * 0.95, 64, 1, true), this.coneMat);
    cone.position.y = R * 0.475; this.table.add(cone);
    // v5.4 hangar floor: an anti-aliased perspective grid running to the horizon (strong depth cue), with a
    // slow drift and a pulse ring expanding from the table while the agent works. All terms are well-defined
    // (no pow of negatives, no reversed smoothstep) — see the v5.1 NaN notes.
    this.floorMat = new THREE.ShaderMaterial({
      ...add,
      uniforms: { uColor: { value: this.floorTint = new THREE.Color('#49e6ff') }, uWarm: { value: this.warm }, uTime: { value: 0 }, uPulse: { value: 0 }, uGain: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor, uWarm; uniform float uTime, uPulse, uGain; varying vec2 vP;
        void main(){
          float d = length(vP);
          vec2 p = vP / ${(R * 0.5).toFixed(1)}; p.y += uTime * 0.06;
          vec2 q = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4));
          float line = 1.0 - min(min(q.x, q.y), 1.0);
          vec2 p2 = vP / ${(R * 2.5).toFixed(1)}; p2.y += uTime * 0.012;
          vec2 q2 = abs(fract(p2 - 0.5) - 0.5) / max(fwidth(p2), vec2(1e-4));
          float major = 1.0 - min(min(q2.x, q2.y), 1.0);
          float far = clamp(1.0 - d / ${(R * 26).toFixed(1)}, 0.0, 1.0);
          float hole = smoothstep(${(R * 2.3).toFixed(1)}, ${(R * 3.4).toFixed(1)}, d);
          float ring = uPulse * exp(-abs(d - mod(uTime * ${(R * 3).toFixed(1)}, ${(R * 22).toFixed(1)}) - ${(R * 2.6).toFixed(1)}) / ${(R * 0.35).toFixed(1)});
          vec3 col = uColor * (line * 0.16 + major * 0.32) * far * far * hole * uGain + uWarm * ring * far * hole * 0.35;
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 56, R * 56), this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -R * 0.04; floor.renderOrder = -1; this.table.add(floor);
  }
  /** One satellite per agent tool; a tool call flares its satellite and beams down to Earth. */
  buildSatellites() {
    const R = this.R;
    TOOLS.forEach((tool, i) => {
      const orbit = new THREE.Group(); orbit.rotation.set(1.1 + (i % 3) * 0.28, i * 1.05, (i % 2 ? 1 : -1) * 0.22);
      const r = R * (1.55 + (i % 3) * 0.13), n = 160, pos = new Float32Array(n * 3), ang = new Float32Array(n);
      for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; pos.set([Math.cos(t) * r, Math.sin(t) * r, 0], k * 3); ang[k] = t; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
      const u = { uColor: { value: this.color }, uAng: { value: Math.random() * 6.28 }, uHot: { value: 0 } };
      const line = new THREE.LineLoop(g, new THREE.ShaderMaterial({ ...add, uniforms: u,
        vertexShader: 'attribute float aAng; varying float vA; void main(){ vA = aAng; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uAng, uHot; varying float vA; void main(){ float d = mod(uAng - vA, 6.2831853); gl_FragColor = vec4(uColor*(0.07 + exp(-d*2.2)*(0.55 + uHot)), 1.0); }' }));
      orbit.add(line);
      const sat = new THREE.Mesh(new THREE.OctahedronGeometry(5.5, 0), new THREE.MeshBasicMaterial({ color: this.hot }));
      orbit.add(sat);
      this.scene.add(orbit);
      this.sats.push({ tool, orbit, line, sat, r, u, speed: 0.00012 + i * 0.00002, hot: 0, label: TOOL_LABEL[tool] });
    });
  }
  /** Great-circle data arcs between land points, pulses travelling along them. */
  rebuildArcs() {
    if (!this.ok) return;
    if (this.arcs) { this.globe.spin.remove(this.arcs); this.arcs.geometry.dispose(); }
    const n = this.T.arcs, SEG = 48, R = this.R, pos = [], prog = [], meta = [];
    for (let i = 0; i < n; i++) {
      const a = this.globe.randomLand(), b = this.globe.randomLand(), h = 0.12 + a.distanceTo(b) * 0.22, st = Math.random() * 8, dur = 2.2 + Math.random() * 2.5;
      let prev = null;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG, p = a.clone().lerp(b, t).normalize().multiplyScalar(R * (1.003 + Math.sin(t * Math.PI) * h));
        if (prev) { pos.push(...prev.p.toArray(), ...p.toArray()); prog.push(prev.t, t); meta.push(st, dur, st, dur); }
        prev = { p, t };
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(prog, 1)); g.setAttribute('aM', new THREE.Float32BufferAttribute(meta, 2));
    this.arcU ||= { uColor: { value: this.warm }, uBase: { value: this.color }, uTime: { value: 0 }, uRate: { value: 1 } };
    this.arcs = new THREE.LineSegments(g, new THREE.ShaderMaterial({ ...add, uniforms: this.arcU,
      vertexShader: 'attribute float aT; attribute vec2 aM; varying float vT; varying vec2 vM; void main(){ vT = aT; vM = aM; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor, uBase; uniform float uTime; varying float vT; varying vec2 vM;
        void main(){ float head = mod(uTime - vM.x, vM.y + 1.5)/vM.y; float d = head - vT; float pulse = d > 0.0 ? exp(-d*9.0) : 0.0;
          gl_FragColor = vec4(uBase*0.12 + uColor*pulse*1.4, 1.0); }` }));
    this.arcs.frustumCulled = false;
    this.globe.spin.add(this.arcs);
  }
  buildRain(cols) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); }
    const TRAIL = 22, n = cols * TRAIL;
    const col = new Float32Array(n * 3), k = new Float32Array(n), seed = new Float32Array(n);
    for (let c = 0; c < cols; c++) {
      const x = (Math.random() - 0.5) * 11000, z = -1800 - Math.pow(Math.random(), 0.7) * 7000, sp = 160 + Math.random() * 380, s = Math.random();
      for (let i = 0; i < TRAIL; i++) { const j = c * TRAIL + i; col.set([x, z, sp], j * 3); k[j] = i; seed[j] = s; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aK', new THREE.BufferAttribute(k, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.rainMat ||= new THREE.ShaderMaterial({
      ...add,
      uniforms: { uTime: { value: 0 }, uColor: { value: this.color }, uHot: { value: this.hot }, uAtlas: { value: this.atlas }, uScale: { value: 800 }, uIntensity: { value: 1 } },
      vertexShader: `attribute vec3 aCol; attribute float aK, aSeed; uniform float uTime, uScale; varying float vB, vG, vFog;
        float h(float n){ return fract(sin(n*127.1)*43758.5453); }
        void main(){ float range = 7000.0; float head = 3500.0 - mod(uTime*aCol.z + aSeed*range, range);
          vec4 mv = modelViewMatrix*vec4(aCol.x, head + aK*30.0, aCol.y, 1.0); gl_Position = projectionMatrix*mv; float dist = -mv.z;
          gl_PointSize = 30.0*uScale/max(dist, 1.0); vB = aK < 0.5 ? 1.7 : exp(-aK/6.5);
          vG = floor(h(aSeed*91.0 + aK*13.0 + floor(uTime*(0.4 + h(aSeed)*2.5)))*64.0); vFog = 1.0 - smoothstep(2400.0, 10500.0, dist); }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uColor, uHot; uniform float uIntensity; varying float vB, vG, vFog;
        void main(){ vec2 cell = vec2(mod(vG, 8.0), floor(vG/8.0)); vec2 uv = vec2((cell.x + gl_PointCoord.x)/8.0, 1.0 - (cell.y + gl_PointCoord.y)/8.0);
          float g = texture2D(uAtlas, uv).r; vec3 c = vB > 1.0 ? mix(uColor, uHot, 0.75) : uColor; gl_FragColor = vec4(c*g*min(vB, 1.3)*vFog*uIntensity*0.5, 1.0); }`,
    });
    this.rain = new THREE.Points(g, this.rainMat); this.rain.frustumCulled = false; this.scene.add(this.rain);
  }
  buildStars(n) {
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); }
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(9000 + Math.random() * 6000); if (v.z > 4000) v.z = -v.z; p.set(v.toArray(), i * 3); s[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    this.starMat ||= new THREE.ShaderMaterial({ ...add, uniforms: { uTime: { value: 0 }, uColor: { value: this.color }, uGain: { value: 1 } },
      vertexShader: 'attribute float aS; uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = 1.0 + aS*aS*2.6; vA = (0.35 + 0.65*aS)*(0.65 + 0.35*sin(uTime*(0.8 + aS*2.0) + aS*40.0)); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uGain; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.35)*(1.0 - smoothstep(0.0, 0.5, r))*vA*uGain, 1.0); }' });
    this.stars = new THREE.Points(g, this.starMat); this.stars.frustumCulled = false; this.scene.add(this.stars);
  }
  buildMotes(n) {
    if (this.motes) { this.scene.remove(this.motes); this.motes.geometry.dispose(); }
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { p.set([(Math.random() - 0.5) * 4200, (Math.random() - 0.5) * 2600, 700 - Math.random() * 3200], i * 3); s[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    this.moteMat ||= new THREE.ShaderMaterial({ ...add, uniforms: { uTime: { value: 0 }, uColor: { value: this.color }, uScale: { value: 800 }, uGain: { value: 1 } },
      vertexShader: `attribute float aS; uniform float uTime, uScale; varying float vA;
        void main(){ vec3 p = position + vec3(sin(uTime*0.00006 + aS*40.0)*60.0, cos(uTime*0.00005 + aS*20.0)*40.0 + mod(uTime*0.01*aS, 300.0), 0.0);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; float d = max(-mv.z, 1.0);
          gl_PointSize = (2.0 + aS*4.0)*uScale/d*2.0; vA = (0.15 + aS*0.4)*(1.0 - smoothstep(500.0, 4000.0, d)); }`,
      fragmentShader: 'uniform vec3 uColor; uniform float uGain; varying float vA; void main(){ float r = length(gl_PointCoord-0.5); gl_FragColor = vec4(uColor*(1.0 - smoothstep(0.0, 0.5, r))*vA*uGain, 1.0); }' });
    this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; this.scene.add(this.motes);
  }
  buildPost() {
    this.composer?.dispose?.();
    this.composer = null;
    if (!this.T.bloom) return;
    const w = innerWidth, h = innerHeight;
    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // SANITIZE (v5.1): a single NaN/Inf pixel in the HDR buffer is smeared by the bloom's mip-blur chain into
    // flickering black SQUARES (only the bloom tiers — high/balanced — showed them). Some GPUs/drivers (ANGLE on
    // D3D in particular) return NaN for edge cases such as pow() of a tiny negative base. Every pixel that is not a
    // finite, non-negative number is replaced before the bloom sees it, and HDR peaks are capped.
    this.sanitize = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        // bit-exact finiteness test: exponent bits all set = Inf/NaN (compilers may fold x == x away, they cannot fold this)
        bool finite(float x){ return (floatBitsToUint(x) & 0x7F800000u) != 0x7F800000u; }
        float ok(float x){ return (finite(x) && x > 0.0) ? x/(1.0 + max(x - 1.6, 0.0)*0.55) : 0.0; }   // soft shoulder above 1.6 keeps HDR peaks from saturating the bloom
        void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(ok(c.r), ok(c.g), ok(c.b), 1.0); }`,
    });
    this.composer.addPass(this.sanitize);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), this.sceneTheme?.bloom ?? 0.72, 0.42, 0.22);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAlert: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAlert, uFlash; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime)*43758.5453); }
        float fin(float x){ return ((floatBitsToUint(x) & 0x7F800000u) != 0x7F800000u) ? clamp(x, 0.0, 1.0) : 0.0; }   // last line of defence: only finite, displayable values reach the screen
        void main(){ vec2 c = vUv - 0.5; float r2 = dot(c, c); vec2 off = c*r2*0.012;
          vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
          col *= 1.0 - r2*1.25; col += (h(vUv*1000.0) - 0.5)*0.025; col += vec3(0.5, 0.9, 1.0)*uFlash*0.12*(1.0 - r2*2.0);
          col = mix(col, col*vec3(1.35, 0.45, 0.5), uAlert*0.6);
          gl_FragColor = vec4(fin(col.r), fin(col.g), fin(col.b), 1.0); }`,
    });
    this.composer.addPass(this.grade);
    this.composer.setPixelRatio(this.gl.getPixelRatio()); this.composer.setSize(w, h);
  }

  // ───────────── quality tiers
  setTier(name) {
    if (!TIERS[name]) return;
    this.tier = name; const T = TIERS[name];
    document.body.dataset.perf = name;
    if (!this.ok) return;
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, T.pr));
    this.buildRain(T.cols); this.buildMotes(T.motes); this.buildStars(T.stars);
    if (this.globe.isLand) { this.globe.buildEngines(T.engines); this.rebuildArcs(); }
    this.buildPost(); this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    const key = `${w}x${h}@${this.gl?.getPixelRatio()}`;
    if (key === this._size && this.composer === this._sizedComposer) { this.layout(); return; }   // setting the canvas size clears it → only when it really changed
    this._size = key; this._sizedComposer = this.composer;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.ok) {
      this.gl.setSize(w, h); this.composer?.setSize(w, h);
      const scale = (h / (2 * Math.tan(FOV * Math.PI / 360))) * this.gl.getPixelRatio();
      for (const m of [this.rainMat, this.moteMat]) if (m) m.uniforms.uScale.value = scale;
    }
    this.D0 = (h / 2) / Math.tan(FOV * Math.PI / 360);
    this.layout();
  }
  /** The free screen area between the HUD columns; the globe is framed inside it. */
  setFocusRect(r) { this.focusRect = r; this.layout(); }
  layout() {
    const r = this.focusRect, w = innerWidth, h = innerHeight;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rpx = Math.max(90, Math.min(r.w * 0.27, r.h * 0.3));
    this.baseDist = this.D0 * this.R / rpx;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  }

  /** Test hook: scatter points whose shader outputs NaN (what a misbehaving GPU produces) — the sanitize pass must hide them. */
  debugNaN(on = true, n = 24) {
    if (this.nanPts) { this.scene.remove(this.nanPts); this.nanPts.geometry.dispose(); this.nanPts = null; }
    if (!on || !this.ok) return;
    const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * this.R * 3, (Math.random() - 0.5) * this.R * 1.6, this.R * 1.3], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.nanPts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uZero: { value: 0 } }, depthTest: false,
      vertexShader: 'void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = 3.0; }',
      fragmentShader: 'uniform float uZero; void main(){ float n = uZero/uZero; gl_FragColor = vec4(n, n, n, 1.0); }' }));
    this.nanPts.frustumCulled = false; this.scene.add(this.nanPts);
  }

  // ───────────── camera / user control
  /** Drag: horizontal spins the globe (with inertia), vertical tilts the camera. */
  rotateBy(dx, dy) { this.spinVel = dx * 0.006; this.globe && (this.globe.spin.rotation.y += dx * 0.006); this.goal.pitch = Math.max(-0.12, Math.min(0.55, this.goal.pitch + dy * 0.003)); }
  zoomBy(f) { this.goal.zoom = Math.max(0.55, Math.min(1.9, this.goal.zoom * f)); }
  resetView() { Object.assign(this.goal, { yaw: 0, pitch: 0.16, zoom: 1 }); this.spinVel = 0; }
  get zoom() { return this.goal.zoom; }
  apply() {
    const v = this.view, g = this.goal, k = this.reduced ? 1 : 0.08;
    for (const key of ['yaw', 'pitch', 'zoom']) v[key] += (g[key] - v[key]) * k;
    const drift = this.reduced ? 0 : 1, t = this.t;
    const yaw = v.yaw + drift * (Math.sin(t * 0.00009) * 0.05 + this.parallax.x * 0.11), pitch = v.pitch + drift * (Math.sin(t * 0.00013) * 0.02 - this.parallax.y * 0.07);   // parallax: fx/depth.js
    const d = this.baseDist / v.zoom;
    this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }
  /** Screen point → world point on the plane z (used to aim data streams at DOM panels). */
  toWorld(px, py, z = 0) {
    const ndc = { x: (px / innerWidth) * 2 - 1, y: -(py / innerHeight) * 2 + 1 };
    this.raycaster.setFromCamera(ndc, this.camera);
    this.plane.constant = -z;
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.v);
    return hit ? hit.clone() : new THREE.Vector3(0, 0, z);
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, behind: p.z > 1 };
  }
  /** Screen position of the globe centre / radius (HUD overlays align to it). */
  globeScreen() {
    if (!this.ok) return { x: innerWidth / 2, y: innerHeight / 2, r: 200 };
    const c = this.toScreen(new THREE.Vector3()), e = this.toScreen(new THREE.Vector3(this.R, 0, 0).applyQuaternion(this.camera.quaternion));
    return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) };
  }
  /** Project a 3D anchor to the screen every frame and hand it to a DOM label. */
  addLabel(get, el) { const l = { get, el }; this.labels.push(l); return l; }
  removeLabel(l) { this.labels = this.labels.filter((x) => x !== l); }

  /** Key entities of the results as glowing nodes on a slow outer orbit, tethered to the globe. Size = weight. */
  // ───────────── places: beacons on the globe + fly-to (geocoded results, “fly to Tokyo”)
  /** Replace the place markers; each is a light beam + pulsing ring on the surface, rotating with the globe. */
  setPlaces(list) {
    if (!this.ok) return;
    for (const m of this.markers || []) { this.globe.spin.remove(m.g); m.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    this.markers = [];
    for (const p of (list || []).slice(0, 6)) {
      const n = ll2v(p.lat, p.lon), g = new THREE.Group(), R = this.R;
      g.position.copy(n.clone().multiplyScalar(R * 1.002)); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, R * 0.55, 10, 1, true), new THREE.MeshBasicMaterial({ color: this.warm, ...add, opacity: 0.55, side: THREE.DoubleSide }));
      beam.position.y = R * 0.275;
      const ring = new THREE.Mesh(new THREE.RingGeometry(4, 5.6, 40), new THREE.MeshBasicMaterial({ color: this.warm, ...add, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ color: this.hot }));
      g.add(beam, ring, dot); this.globe.spin.add(g);
      this.markers.push({ g, ring, beam, p, t0: performance.now(), v: new THREE.Vector3() });
    }
  }
  markerPos(i) { const m = this.markers?.[i]; if (!m) return null; return m.g.localToWorld(m.v.set(0, this.R * 0.56, 0)); }
  /** Rotate the globe so lat/lon faces the viewer (shortest way), tilt toward its latitude, hold still a while. */
  flyTo(lat, lon) {
    if (!this.ok) return;
    const v = ll2v(lat, lon), cam = this.camera.position.clone().normalize(), spin = this.globe.spin, y0 = spin.rotation.y, w = new THREE.Vector3();
    let best = y0, bd = -2;
    for (let k = 0; k < 360; k++) {
      spin.rotation.y = k * Math.PI / 180; spin.updateMatrixWorld(true);
      const d = w.copy(v).applyMatrix4(spin.matrixWorld).sub(this.globe.group.position).normalize().dot(cam);
      if (d > bd) { bd = d; best = spin.rotation.y; }
    }
    spin.rotation.y = y0;
    let delta = ((best - y0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    this.fly = { from: y0, delta, t0: performance.now(), ms: 1700 }; this.spinVel = 0; this.holdSpin = performance.now() + 9000;
    this.goal.pitch = Math.max(-0.12, Math.min(0.55, lat / 90 * 0.6)); this.goal.zoom = Math.max(this.goal.zoom, 1.15);
    this.flash = 0.6;
  }
  setEntities(list) {
    if (!this.ok) return;
    if (this.ents) { this.scene.remove(this.ents.group); this.ents.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.ents = null; }
    if (!list.length) return;
    const group = new THREE.Group(); group.rotation.set(0.32, 0, -0.12);
    const R = this.R * 2.08, nodes = list.map((e, i) => {
      const a = (i / list.length) * Math.PI * 2 + 0.4, p = new THREE.Vector3(Math.cos(a) * R, Math.sin(i * 1.7) * this.R * 0.18, Math.sin(a) * R);
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(4 + 7 * Math.min(1, e.weight ?? 0.5), 0), new THREE.MeshBasicMaterial({ color: e.query_term ? this.warm : this.hot, transparent: true, opacity: 0.95 }));
      m.position.copy(p); m.scale.setScalar(0.001); group.add(m);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, p.clone().normalize().multiplyScalar(this.R * 1.03)]),
        new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(line);
      return { m, line, t0: performance.now() + i * 90 };
    });
    this.scene.add(group);
    this.ents = { group, nodes, v: new THREE.Vector3() };
  }
  entityPos(i) {
    const n = this.ents?.nodes[i]; if (!n || n.m.scale.x < 0.2) return null;
    return n.m.getWorldPosition(this.ents.v);
  }

  setColors(primary, warm, engine) {
    this.color.set(primary); if (warm) this.warm.set(warm); this.engine.set(engine || primary);
  }
  setAgentState(s) {
    const prev = this.state; this.state = s;
    if (!this.ok) return;
    const fx = STATE_FX[s] || STATE_FX.idle;
    this.globe.thrust(fx[1], (s === 'thinking' || s === 'tool_running') && !['thinking', 'tool_running', 'paused'].includes(prev));
    this.globe.alert = s === 'error' ? 1 : 0;
  }
  /** A tool call: its satellite flares and a beam drops to the surface. */
  toolPulse(tool) {
    const s = this.sats.find((x) => x.tool === (SAT_OF[tool] || tool)) || this.sats[0]; if (!s || !this.ok) return;
    s.hot = 1.6;
    const wp = new THREE.Vector3(); s.sat.getWorldPosition(wp);
    this.flowWorld(wp, wp.clone().normalize().multiplyScalar(this.R * 1.01), { ms: 900, color: this.warm, lift: 0.1 });
  }
  /** Animated data stream from the globe to a SCREEN point (a result panel's edge). */
  flow(screen, { ms = 1500, color } = {}) {
    if (!this.ok) return;
    const b = this.toWorld(screen.x, screen.y, this.R * 0.9), a = b.clone().normalize().multiplyScalar(this.R * 1.02);
    this.flowWorld(a, b, { ms, color });
  }
  flowWorld(a, b, { ms = 1500, color, lift = 0.35 } = {}) {
    const mid = a.clone().lerp(b, 0.5); mid.add(mid.clone().normalize().multiplyScalar(a.distanceTo(b) * lift));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: color || this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
    this.flowLines.add(line);
    this.flows.push({ curve, line, t0: performance.now(), ms: this.reduced ? 400 : ms });
  }
  burst(screen, n = 160) {
    if (!this.ok || this.reduced) return;
    const b = this.toWorld(screen.x, screen.y, this.R * 0.9), a = new THREE.Vector3();
    for (let i = 0; i < n; i++) this.bursts.push({ a, b, off: new THREE.Vector3().randomDirection().multiplyScalar(160 + Math.random() * 260), t0: performance.now() + Math.random() * 300, ms: 900 + Math.random() * 500 });
    this.flash = 1;
  }
  /** Workspace switch: the globe swings to a new longitude while the HUD changes. */
  swing(dir = 1) { if (this.ok) this.spinVel += dir * 0.06; this.flash = 0.6; }

  // ───────────── frame loop
  frame(t) {
    this.t = t;
    const dt = Math.min(64, t - this.last); this.last = t;
    this.frames++;
    if (t - this.fpsT > 1000) {
      this.fps = this.frames * 1000 / (t - this.fpsT); this.frames = 0; this.fpsT = t;
      if (this.autoPerf && document.visibilityState === 'visible') {
        this.lowStreak = this.fps < 36 ? (this.lowStreak || 0) + 1 : 0;
        this.highStreak = this.fps >= 55 ? (this.highStreak || 0) + 1 : 0;
        if (this.lowStreak >= 3 && this.tier !== 'low') {
          (this.blocked ||= new Set()).add(this.tier);                     // never climb back into a tier that was too slow
          this.setTier(this.tier === 'high' ? 'balanced' : 'low'); this.lowStreak = this.highStreak = 0; this.onAutoTier?.(this.tier);
        } else if (this.highStreak >= 8 && this.tier !== 'high') {        // plenty of headroom for 8 s → one step up
          const up = this.tier === 'low' ? 'balanced' : 'high';
          if (!this.blocked?.has(up) && !/swiftshader|llvmpipe|software/i.test(this.gpu || '')) { this.setTier(up); this.onAutoTier?.(this.tier, true); }
          this.highStreak = 0;
        }
      }
    }
    this.apply();
    for (const fn of this.tickers) fn(dt, t);
    if (this.ok) this.renderGL(t, dt);
    for (const l of this.labels) {
      const p = l.get(); if (!p) { l.el.hidden = true; continue; }
      const s = this.toScreen(p); l.el.hidden = s.behind; l.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  renderGL(t, dt) {
    const fx = STATE_FX[this.state] || STATE_FX.idle, slow = this.reduced ? 0.2 : 1;
    this.rainTime = (this.rainTime || 0) + dt / 1000 * (this.reduced ? 0.3 : fx[2]);
    this.rainMat.uniforms.uTime.value = this.rainTime;
    this.rainMat.uniforms.uIntensity.value = (this.state === 'error' ? 0.5 : 1) * (this.rainLevel ?? 1);
    this.moteMat.uniforms.uTime.value = t; this.starMat.uniforms.uTime.value = t / 1000;
    if (this.skyMat) { this.skyMat.uniforms.uTime.value = t / 1000 * slow; const rd = t - (this.skyT ?? t); this.skyT = t; this.skyStep(1 - Math.exp(-rd / 260)); }   // real time: a slow frame rate must not leave the old theme behind
    // globe: idle rotation + user spin inertia
    this.spinVel *= Math.pow(0.94, dt / 16);
    const holding = this.holdSpin && t < this.holdSpin;
    if (this.fly) {
      const k = Math.min(1, (t - this.fly.t0) / this.fly.ms);
      this.globe.spin.rotation.y = this.fly.from + this.fly.delta * easeInOut(k);
      if (k >= 1) this.fly = null;
    }
    this.globe.update(t, dt, this.fly || holding ? 0 : (0.00005 * fx[2] * slow) + this.spinVel / 16);
    for (const m of this.markers || []) {
      const k = ((t - m.t0) / 1600) % 1; m.ring.scale.setScalar(1 + k * 2.2); m.ring.material.opacity = 0.9 * (1 - k);
      m.beam.material.opacity = 0.35 + 0.25 * Math.sin(t * 0.006);
    }
    if (this.arcU) { this.arcU.uTime.value += dt / 1000 * (0.6 + fx[2] * 0.5); }
    // rings + reticle
    const spin = fx[0] * slow, pulse = (this.state === 'thinking' || this.state === 'tool_running') ? (Math.sin(t * 0.008) * 0.5 + 0.5) : 0;
    this.tiltRings[0].rotation.z += 0.00018 * spin * dt; this.tiltRings[1].rotation.z -= 0.00011 * spin * dt;
    this.reticle.quaternion.copy(this.camera.quaternion);
    this.retRings.forEach((r, i) => { r.rotation.z += (i % 2 ? -1 : 1) * (0.00008 + i * 0.00004) * spin * dt; r.material.uniforms.uPulse.value = pulse * (i === 0 ? 1 : 0.35); });
    this.discMat.uniforms.uTime.value = t / 1000; this.discMat.uniforms.uSweep.value = 0.6 + fx[0] * 0.5;
    if (this.floorMat) { const u = this.floorMat.uniforms; u.uTime.value = t / 1000 * slow; u.uPulse.value += ((['thinking', 'tool_running', 'rendering'].includes(this.state) ? 1 : 0) - u.uPulse.value) * Math.min(1, dt / 400); }
    this.flash = Math.max(0, (this.flash || 0) - dt / 900);
    this.coneMat.uniforms.uI.value = 0.16 + pulse * 0.1 + this.flash * 0.5;
    // satellites
    for (const s of this.sats) {
      s.u.uAng.value += s.speed * dt * (0.6 + fx[0] * 0.4) * slow;
      s.hot = Math.max(0, s.hot - dt / 1400); s.u.uHot.value = s.hot;
      s.sat.position.set(Math.cos(s.u.uAng.value) * s.r, Math.sin(s.u.uAng.value) * s.r, 0);
      s.sat.rotation.x += 0.02; s.sat.rotation.y += 0.015; s.sat.scale.setScalar(1 + s.hot * 0.8);
    }
    // entity constellation: pop in, slow orbit, gentle bob
    if (this.ents) {
      this.ents.group.rotation.y += 0.00004 * dt * (0.5 + fx[0] * 0.3) * slow;
      for (const n of this.ents.nodes) {
        const k = Math.max(0, Math.min(1, (t - n.t0) / 700)), e = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
        n.m.scale.setScalar(Math.max(0.001, e)); n.m.rotation.y += 0.01; n.line.material.opacity = 0.28 * k;
      }
    }
    // flows & bursts
    const sp = this.streamPts.geometry.attributes.position.array, sa = this.streamPts.geometry.attributes.aA.array; sa.fill(0);
    let si = 0;
    this.flows = this.flows.filter((f) => {
      const k = (t - f.t0) / f.ms;
      if (k >= 1) { this.flowLines.remove(f.line); f.line.geometry.dispose(); f.line.material.dispose(); return false; }
      f.line.material.opacity = Math.sin(k * Math.PI) * 0.7;
      for (let j = 0; j < 24 && si < 1400; j++, si++) {
        const u = (k * 1.4 - j * 0.03); if (u < 0 || u > 1) continue;
        const p = f.curve.getPoint(u); sp[si * 3] = p.x; sp[si * 3 + 1] = p.y; sp[si * 3 + 2] = p.z; sa[si] = (1 - j / 24) * Math.sin(k * Math.PI);
      }
      return true;
    });
    this.streamPts.geometry.attributes.position.needsUpdate = true; this.streamPts.geometry.attributes.aA.needsUpdate = true;
    const bp = this.burstPts.geometry.attributes.position.array, ba = this.burstPts.geometry.attributes.aA.array; ba.fill(0);
    let bi = 0;
    this.bursts = this.bursts.filter((b) => {
      const k = (t - b.t0) / b.ms; if (k >= 1) return false; if (k < 0 || bi >= 700) return true;
      const e = easeInOut(k), p = b.a.clone().lerp(b.b, e).addScaledVector(b.off, Math.sin(k * Math.PI));
      bp[bi * 3] = p.x; bp[bi * 3 + 1] = p.y; bp[bi * 3 + 2] = p.z; ba[bi] = Math.sin(k * Math.PI); bi++;
      return true;
    });
    this.burstPts.geometry.attributes.position.needsUpdate = true; this.burstPts.geometry.attributes.aA.needsUpdate = true;
    if (this.composer) {
      this.grade.uniforms.uTime.value = (t / 1000) % 100; this.grade.uniforms.uFlash.value = this.flash;
      this.grade.uniforms.uAlert.value += ((this.state === 'error' ? 1 : 0) - this.grade.uniforms.uAlert.value) * 0.05;
      this.composer.render();
    } else this.gl.render(this.scene, this.camera);
  }
}
export { easeOut };
