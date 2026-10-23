// ─────────────────────────────────────────────────────────────────────────────
// Holographic Earth for the command scene:
//   • land mask rasterised at runtime from Natural Earth 110m (world-atlas TopoJSON, vendored)
//   • dot-matrix continents, glowing coastlines, lat/long grid, night-side city lights, scan band
//   • fresnel atmosphere + limb highlight
//   • planetary engines: instanced plasma jets on the land of one hemisphere — their thrust
//     follows the agent state (idle trickle → full burn while tools run, cascading ignition)
// Everything is procedural: no image textures, nothing fetched from the network.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/** Decode TopoJSON arcs (quantized + delta encoded) and draw the land polygons, equirectangular. */
export async function landMask(url, W = 2048, H = 1024) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  try {
    const topo = await (await fetch(url)).json();
    const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
    const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
    const ring = (idx) => idx.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
    const P = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    g.fillStyle = '#fff';
    for (const geom of topo.objects.land.geometries) {
      const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
      for (const poly of polys) {
        g.beginPath();
        for (const r of poly) ring(r).forEach(([lon, lat], i) => { const [x, y] = P(lon, lat); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.fill('evenodd');
      }
    }
  } catch (e) { console.warn('land mask unavailable — plain globe', e); }
  const data = g.getImageData(0, 0, W, H).data;
  const isLand = (lat, lon) => { const x = Math.floor((lon + 180) / 360 * W) % W, y = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))); return data[(y * W + x) * 4] > 127; };
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearMipMapLinearFilter; tex.anisotropy = 4;
  return { tex, isLand };
}

/** lat/lon (deg) → unit vector in the globe's local frame (three.js sphere UV convention). */
export function ll2v(lat, lon, r = 1) {
  const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.cos(th) * Math.sin(phi) * r, Math.cos(phi) * r, Math.sin(th) * Math.sin(phi) * r);
}

const GLOBE_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vWN;
  void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const GLOBE_F = `uniform sampler2D uLand; uniform vec3 uColor, uWarm, uSun; uniform float uTime, uScan, uAlert;
  varying vec2 vUv; varying vec3 vN; varying vec3 vWN;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  float gline(float v){ float d = min(fract(v), 1.0 - fract(v)); return 1.0 - smoothstep(0.0, fwidth(v)*1.4, d); }
  void main(){
    float land = texture2D(uLand, vUv).r;
    vec2 px = vec2(1.0/2048.0, 1.0/1024.0)*2.0;
    float nb = (texture2D(uLand, vUv + vec2(px.x,0.)).r + texture2D(uLand, vUv - vec2(px.x,0.)).r + texture2D(uLand, vUv + vec2(0.,px.y)).r + texture2D(uLand, vUv - vec2(0.,px.y)).r)*0.25;
    float coast = clamp(abs(land - nb)*3.0, 0.0, 1.0);
    vec2 grid = vec2(vUv.x*180.0, vUv.y*90.0), cell = floor(grid), f = fract(grid) - 0.5;
    float cl = texture2D(uLand, (cell + 0.5)/vec2(180.0, 90.0)).r;
    float dotA = cl*(1.0 - smoothstep(0.2, 0.36, length(f)));
    float day = dot(normalize(vWN), normalize(uSun));
    float lit = 0.25 + 0.75*smoothstep(-0.25, 0.6, day);
    float rim = pow(clamp(1.0 - vN.z, 0.0, 1.0), 2.6);
    vec3 col = vec3(0.004, 0.02, 0.045) + uColor*0.03;
    col += uColor*(gline(vUv.x*24.0) + gline(vUv.y*12.0))*0.10*lit;
    col = mix(col, uColor*0.10*lit + vec3(0.0, 0.02, 0.03), land*0.85);
    col += uColor*dotA*(0.22 + 0.55*lit);
    col += uColor*coast*0.75;
    float city = step(0.8, hash(cell*1.37))*cl*(1.0 - smoothstep(-0.3, 0.15, day));
    col += uWarm*city*(0.7 + 0.3*sin(uTime*3.0 + hash(cell)*30.0));
    float sd = (vUv.y - uScan)*60.0; float sb = exp(-sd*sd);
    col += uColor*sb*(0.18 + land*0.5);
    col += uColor*rim*0.38;
    col = mix(col, col*vec3(1.6, 0.35, 0.4), uAlert);
    gl_FragColor = vec4(col, 1.0);
  }`;
const ATMO_V = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`;
const ATMO_F = `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vP;
  void main(){ float f = dot(normalize(vN), normalize(-vP)); float a = pow(clamp(1.0 + f*1.15, 0.0, 1.0), 3.0); gl_FragColor = vec4(uColor*a*uI, 1.0); }`;
const LIMB_F = `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vP;
  void main(){ float f = clamp(1.0 - dot(normalize(vN), normalize(-vP)), 0.0, 1.0); float f2 = f*f; gl_FragColor = vec4(uColor*f2*f2*f*uI, 1.0); }`;

const ENGINE_V = `attribute vec3 aDir; attribute float aSeed; uniform float uTime, uPower, uIgnite, uR, uLen;
  varying float vY; varying float vOn;
  void main(){
    vec3 up = abs(aDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, aDir)), B = cross(aDir, T);
    float on = smoothstep(aSeed - 0.08, aSeed, uIgnite);
    float flick = 0.82 + 0.18*sin(uTime*(17.0 + aSeed*23.0) + aSeed*90.0) + 0.1*sin(uTime*41.0 + aSeed*7.0);
    float len = uLen*(0.25 + uPower*(0.7 + aSeed*0.6))*flick*on;
    float w = uR*0.0042*(0.6 + aSeed*0.8)*(0.8 + 0.4*uPower);
    vec3 p = aDir*(uR*1.002 + position.y*len) + (T*position.x + B*position.z)*w*(1.0 - position.y*0.75);
    float face = dot(normalize(normalMatrix*aDir), vec3(0.0, 0.0, 1.0));   // jets aimed at the viewer stack on a tiny area → fade them
    vY = position.y; vOn = on*(1.0 - 0.75*smoothstep(0.35, 0.95, face));
    gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0);
  }`;
const ENGINE_F = `uniform vec3 uColor; uniform float uPower, uGain; varying float vY; varying float vOn;
  void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.6)*vOn; vec3 c = mix(vec3(0.85, 0.95, 1.0), uColor, smoothstep(0.0, 0.12, vY));
    gl_FragColor = vec4(c*a*(0.16 + 0.5*uPower)*uGain, 1.0); }`;

export class Globe {
  constructor({ R = 240, color, warm, engineColor }) {
    this.R = R;
    this.group = new THREE.Group();            // tilt (fixed) → spin (rotates)
    this.spin = new THREE.Group(); this.group.add(this.spin);
    this.group.rotation.z = 0.41;              // 23.4° axial tilt
    this.power = 0.25; this.goal = 0.25; this.ignite = 1; this.igniteGoal = 1; this.alert = 0;
    this.u = {
      uLand: { value: null }, uColor: { value: color }, uWarm: { value: warm }, uSun: { value: new THREE.Vector3(-0.6, 0.35, 0.75) },
      uTime: { value: 0 }, uScan: { value: 0.5 }, uAlert: { value: 0 },
    };
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: GLOBE_V, fragmentShader: GLOBE_F }));
    this.spin.add(this.surface);
    const add = (THREE.AdditiveBlending);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 64, 32), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uI: { value: 0.5 } }, vertexShader: ATMO_V, fragmentShader: ATMO_F, side: THREE.BackSide, transparent: true, depthWrite: false, blending: add }));
    this.limb = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 32), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uI: { value: 0.55 } }, vertexShader: ATMO_V, fragmentShader: LIMB_F, transparent: true, depthWrite: false, blending: add }));
    this.group.add(this.atmo, this.limb);
    this.engineColor = engineColor;
    this.ready = landMask('vendor/geo/land-110m.json').then(({ tex, isLand }) => { this.u.uLand.value = tex; this.isLand = isLand; return this; });
  }

  /** Planetary engines on the land of the eastern hemisphere (rebuilt per quality tier). */
  buildEngines(count) {
    if (this.engines) { this.spin.remove(this.engines); this.engines.geometry.dispose(); }
    if (!count || !this.isLand) return;
    const dirs = [], seeds = [];
    for (let tries = 0; seeds.length < count && tries < count * 60; tries++) {
      const lat = Math.asin(Math.random() * 1.7 - 0.85) * 180 / Math.PI, lon = -25 + Math.random() * 175;
      if (!this.isLand(lat, lon)) continue;
      dirs.push(...ll2v(lat, lon).toArray());
      seeds.push(((lon + 25) / 175) * 0.85 + Math.random() * 0.15);        // ignition sweeps west → east
    }
    const base = new THREE.CylinderGeometry(0.35, 1, 1, 6, 1, true); base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry().copy(base);
    g.instanceCount = seeds.length;
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(dirs), 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    this.eu ||= { uTime: this.u.uTime, uPower: { value: this.power }, uIgnite: { value: 1 }, uR: { value: this.R }, uLen: { value: this.R * 0.62 }, uColor: { value: this.engineColor }, uGain: { value: 1 } };
    // more jets on higher tiers overlap more: keep the summed glow constant so High never saturates into a white blob
    this.eu.uGain.value = Math.min(1, Math.sqrt(420 / seeds.length));
    this.engines = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.eu, vertexShader: ENGINE_V, fragmentShader: ENGINE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.engines.frustumCulled = false;
    this.spin.add(this.engines);
  }

  /** Engine thrust 0…1.3; `cascade` restarts the west→east ignition sweep. */
  thrust(p, cascade = false) {
    this.goal = p;
    if (cascade) { this.ignite = 0; this.igniteGoal = 1; }
  }
  /** Random land point (local unit vector) — anchors for data arcs. */
  randomLand() {
    for (let i = 0; i < 200; i++) { const lat = Math.asin(Math.random() * 1.8 - 0.9) * 180 / Math.PI, lon = Math.random() * 360 - 180; if (!this.isLand || this.isLand(lat, lon)) return ll2v(lat, lon); }
    return ll2v(0, 0);
  }
  update(t, dt, spinRate) {
    this.u.uTime.value = t / 1000;
    this.u.uScan.value = 0.5 + 0.42 * Math.sin(t * 0.00035);
    this.spin.rotation.y += spinRate * dt;
    this.power += (this.goal - this.power) * Math.min(1, dt * 0.004);
    this.ignite += (this.igniteGoal - this.ignite) * Math.min(1, dt * 0.0016);
    this.u.uAlert.value += (this.alert - this.u.uAlert.value) * Math.min(1, dt * 0.006);
    if (this.eu) { this.eu.uPower.value = this.power; this.eu.uIgnite.value = this.ignite + 0.1; }
  }
}
