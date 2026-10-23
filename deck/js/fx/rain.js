// Matrix digital rain as a single-pass WebGL2 fragment shader (glyph atlas +
// per-column hashed drops), in the spirit of Rezmason/matrix. Speed, density,
// brightness and glitch follow the agent state; falls back to Canvas 2D.
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:.=*+-<>|';
const PROFILE = {
  idle: [0.35, 0.55, 0.0], listening: [0.5, 0.65, 0.05], thinking: [0.85, 0.8, 0.0], tool_running: [1.3, 0.95, 0.0], paused: [0.08, 0.6, 0.0],
  rendering: [2.0, 1.0, 0.0], done: [0.45, 0.6, 0.0], error: [0.4, 0.7, 1.0], interrupted: [0.25, 0.55, 0.3],
};
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D atlas; uniform vec2 res; uniform float t, speed, density, glitch, cell; uniform vec3 col;
float h(float n){ return fract(sin(n*127.1)*43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 px = uv*res;
  if (glitch > 0.0) { float band = floor(px.y/18.0); if (h(band + floor(t*8.0)) > 1.0 - 0.06*glitch) px.x += (h(band*3.1+t)-0.5)*60.0*glitch; }
  vec2 c = floor(px/cell); vec2 f = fract(px/cell);
  float cols = res.x/cell;
  if (h(c.x*1.7) > density) { o = vec4(0.); return; }
  float sp = (0.35 + h(c.x)*0.9) * speed;
  float rows = res.y/cell;
  float head = fract(t*sp*0.12 + h(c.x*3.3)) * (rows + 30.0);
  float d = head - (rows - c.y);              // distance behind the drop head (in cells)
  float trail = 14.0 + h(c.x*9.1)*22.0;
  float b = d < 0.0 ? 0.0 : exp(-d/trail*2.6);
  float g = floor(h2(c + floor(t*(1.0+h(c.x)*4.0)*step(0.6,h2(c*0.7))))*64.0);
  vec2 a = (vec2(mod(g,8.0), floor(g/8.0)) + vec2(f.x, 1.0-f.y)) / 8.0;
  float glyph = texture(atlas, a).r;
  vec3 color = col * b;
  if (d >= 0.0 && d < 1.0) color = mix(color, vec3(0.9,1.0,0.95), 0.8);
  o = vec4(color * glyph * 1.3, 1.0);
}`;

export class Rain {
  constructor(canvas) {
    this.c = canvas; this.state = 'idle'; this.p = [...PROFILE.idle]; this.user = 1; this.glitchLevel = 1; this.rgb = [0, 1, 0.55];
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (this.gl) this.initGL(); else this.ctx2d = canvas.getContext('2d');
    addEventListener('resize', () => this.resize()); this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }
  setColor(hex) { const n = parseInt(hex.replace('#', ''), 16); this.rgb = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  setState(s) { this.state = s; }
  pulse() { this.burst = 1; }
  resize() { const d = Math.min(devicePixelRatio, 1.5); this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.d = d; }
  initGL() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    this.pr = pr;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // glyph atlas 8×8
    const a = document.createElement('canvas'); a.width = a.height = 512; const g = a.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#fff'; g.font = '52px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 64; i++) { g.save(); g.translate((i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 32); g.scale(-1, 1); g.fillText(GLYPHS[i % GLYPHS.length], 0, 2); g.restore(); }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.u = Object.fromEntries(['res', 't', 'speed', 'density', 'glitch', 'cell', 'col'].map((k) => [k, gl.getUniformLocation(pr, k)]));
  }
  frame(t) {
    if (this.user <= 0) {                     // rain density 0 = rain fully off (saves GPU/CPU)
      if (!this.cleared) { if (this.gl) { this.gl.clearColor(0, 0, 0, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT); } else this.ctx2d.clearRect(0, 0, this.c.width, this.c.height); this.cleared = true; }
      requestAnimationFrame((tt) => this.frame(tt)); return;
    }
    this.cleared = false;
    const target = PROFILE[this.state] || PROFILE.idle;
    for (let i = 0; i < 3; i++) this.p[i] += (target[i] - this.p[i]) * 0.04;
    this.burst = Math.max(0, (this.burst || 0) - 0.02);
    this.time = (this.time || 0) + 0.016 * (this.p[0] + this.burst * 2);
    if (this.gl) {
      const gl = this.gl, u = this.u;
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.uniform2f(u.res, this.c.width, this.c.height); gl.uniform1f(u.t, this.time * 4);
      gl.uniform1f(u.speed, 1.0); gl.uniform1f(u.density, Math.min(1, this.p[1] * this.user));
      gl.uniform1f(u.glitch, this.p[2] * this.glitchLevel); gl.uniform1f(u.cell, 18 * this.d);
      const red = this.state === 'error';
      gl.uniform3f(u.col, ...(red ? [1, 0.23, 0.36] : this.rgb));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else this.frame2d();
    requestAnimationFrame((tt) => this.frame(tt));
  }
  frame2d() {
    const g = this.ctx2d, w = this.c.width, hh = this.c.height, sz = 18 * this.d;
    this.drops ||= Array.from({ length: Math.ceil(w / sz) }, () => Math.random() * -50);
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, w, hh);
    g.fillStyle = `rgb(${this.rgb.map((v) => v * 255).join(',')})`; g.font = `${sz}px monospace`;
    this.drops.forEach((y, i) => { if (i / this.drops.length > this.p[1] * this.user) return; g.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * sz, y * sz); this.drops[i] = y * sz > hh && Math.random() > 0.97 ? 0 : y + this.p[0]; });
  }
}
