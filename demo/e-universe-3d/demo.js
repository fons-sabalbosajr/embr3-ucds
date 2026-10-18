/* ---------------------------------------------------------------------------
 * E-Universe — a three-minute 3D demo.
 *
 * Everything on screen is a pure function of one clock, `t` (0…180 s): the
 * camera, every scene, the captions and the chat. That is what makes the
 * scrubber, the chapter buttons and replay exact — seeking just evaluates the
 * same functions at another time.
 *
 * Nine chapters, each a THREE.Group placed somewhere in one shared space. The
 * camera flies from one to the next, so the app reads as a single universe:
 *
 *   0 Welcome            a spiral of records, the seals and the title
 *   1 Unification        Excel workbooks + the desktop ERMS migrate, then merge
 *   2 Architecture       browser → API → modules → MongoDB / NAS / HRPMS / AI
 *   3 Access & security  the gates every request passes
 *   4 Processing         a record from scan to archive box
 *   5 Document Portal    find → identify → terms → room of 50 → reader
 *   6 VERA               the dotted flame, in 3D, with a live conversation
 *   7 Dashboard          the Central DB and ERMS dashboards on a 3D screen
 *   8 One universe       closing card
 *
 * Content is drawn from the repository's README and the app's own sources.
 * Dashboard figures are illustrative and labelled as such on screen.
 * ------------------------------------------------------------------------- */
(() => {
  "use strict";

  const THREE = window.THREE;
  const BRAND = window.EU_BRAND;
  const DURATION = 180;
  // ?render: the page is driven frame by frame by scripts/render-video.cjs.
  const RENDER = new URLSearchParams(location.search).has("render");

  // ------------------------------------------------------------------ math
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const win = (t, a, b, fi = 0.6, fo = 0.6) => Math.min(span(t, a, a + fi), 1 - span(t, b - fo, b));
  const frac = (x) => x - Math.floor(x);
  const hash = (i) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  const C = {
    ucds: 0x2f9e44, erms: 0x1677ff, portal: 0x13c2c2, shared: 0xfaad14, vera: 0x14d2be,
    danger: 0xff4d4f, ok: 0x52c41a, core: 0x22b8a8, mongo: 0x47a248, nas: 0xb37feb, hr: 0x7b8cff, api: 0x7aa7ff,
  };
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");
  const rgba = (c, a) => {
    const n = typeof c === "number" ? c : parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const FONT = '"Segoe UI", Inter, system-ui, -apple-system, Roboto, Arial, sans-serif';
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // -------------------------------------------------------------- renderer
  const canvas = document.getElementById("stage");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: RENDER });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x040914, 1);
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x040914, 75, 200);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1500);
  scene.add(new THREE.AmbientLight(0x9fb4e0, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(30, 60, 40);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6aa8ff, 0.45);
  rim.position.set(-40, -10, -30);
  scene.add(rim);

  // ------------------------------------------------------------ textures
  const mkCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  function canvasTex(cv) {
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = MAX_ANISO;
    return t;
  }
  function radial(stops, size = 128) {
    const c = mkCanvas(size, size), g = c.getContext("2d"), h = size / 2;
    const r = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`));
    g.fillStyle = r;
    g.fillRect(0, 0, size, size);
    return canvasTex(c);
  }
  const GLOW = radial([[0, 1], [0.22, 0.5], [0.55, 0.12], [1, 0]]);
  const DOT = radial([[0, 1], [0.42, 0.95], [0.62, 0.35], [1, 0]], 64);

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** A label card: optional numbered badge, accent bar, title and sub-lines. */
  function cardCanvas(o) {
    const s = 2;
    const title = o.title || "", subs = o.sub ? [].concat(o.sub) : [];
    const ts = (o.ts || 30) * s, ss = (o.ss || 19) * s, pad = (o.pad ?? 18) * s;
    const m = mkCanvas(4, 4).getContext("2d");
    m.font = `650 ${ts}px ${FONT}`;
    const tw = m.measureText(title).width;
    m.font = `400 ${ss}px ${FONT}`;
    const sw = subs.reduce((w, l) => Math.max(w, m.measureText(l).width), 0);
    const bar = o.bar === false ? 0 : 6 * s;
    const badge = o.badge ? ts * 1.25 : 0;
    const W = Math.ceil(pad * 2 + (bar ? bar + 12 * s : 0) + (badge ? badge + 12 * s : 0) + Math.max(tw, sw));
    const H = Math.ceil(pad * 2 + ts * 1.18 + subs.length * ss * 1.42);
    const c = mkCanvas(W, H), g = c.getContext("2d");
    const col = typeof o.color === "number" ? hex(o.color) : o.color || "#1677ff";
    rr(g, s, s, W - 2 * s, H - 2 * s, (o.radius ?? 14) * s);
    g.fillStyle = o.bg || "rgba(8, 17, 34, 0.88)";
    g.fill();
    g.lineWidth = 2 * s;
    g.strokeStyle = rgba(col, o.strokeA ?? 0.55);
    g.stroke();
    let x = pad;
    g.textBaseline = "top";
    if (bar) {
      rr(g, pad, pad, bar, H - pad * 2, bar / 2);
      g.fillStyle = col;
      g.fill();
      x += bar + 12 * s;
    }
    if (badge) {
      g.beginPath();
      g.arc(x + badge / 2, pad + ts * 0.58, badge / 2, 0, TAU);
      g.fillStyle = col;
      g.fill();
      g.fillStyle = "#fff";
      g.font = `700 ${ts * 0.7}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(o.badge, x + badge / 2, pad + ts * 0.62);
      g.textAlign = "left";
      g.textBaseline = "top";
      x += badge + 12 * s;
    }
    g.fillStyle = o.ink || "#f2f6fd";
    g.font = `650 ${ts}px ${FONT}`;
    g.fillText(title, x, pad);
    g.fillStyle = o.subInk || "#a9b8cf";
    g.font = `400 ${ss}px ${FONT}`;
    subs.forEach((l, i) => g.fillText(l, x, pad + ts * 1.18 + i * ss * 1.42 + 2 * s));
    return c;
  }

  function spriteOf(cv, height, o = {}) {
    const mat = new THREE.SpriteMaterial({ map: canvasTex(cv), transparent: true, depthWrite: false, fog: o.fog ?? true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set((height * cv.width) / cv.height, height, 1);
    sp.renderOrder = o.order ?? 5;
    return sp;
  }
  const card = (o, h = 1.3) => spriteOf(cardCanvas(o), h, o);
  const chip = (title, color, h = 0.8, extra = {}) => card({ title, color, ts: 24, pad: 12, radius: 12, ...extra }, h);

  /** A sprite whose canvas is redrawn only when its text changes. */
  function liveChip(w, h, height, draw) {
    const cv = mkCanvas(w, h), g = cv.getContext("2d");
    const tex = canvasTex(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set((height * w) / h, height, 1);
    sp.renderOrder = 6;
    let last = null;
    sp.userData.set = (v) => {
      const key = JSON.stringify(v);
      if (key === last) return;
      last = key;
      g.clearRect(0, 0, w, h);
      draw(g, v, w, h);
      tex.needsUpdate = true;
    };
    return sp;
  }

  function glow(color, size, opacity = 0.6) {
    const m = new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }
  const std = (color, o = {}) =>
    new THREE.MeshStandardMaterial({
      color, emissive: o.emissive ?? color, emissiveIntensity: o.ei ?? 0.25, roughness: o.rough ?? 0.45,
      metalness: o.metal ?? 0.15, flatShading: !!o.flat, transparent: !!o.transparent, opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    });
  const basic = (color, opacity = 1, o = {}) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: o.depthWrite ?? opacity >= 1, wireframe: !!o.wire, side: o.side ?? THREE.FrontSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  const place = (o, x, y, z) => (o.position.set(x, y, z), o);
  function edges(geo, color, opacity = 0.7) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  function floorGrid(radius, color = 0x1d3b6e, opacity = 0.35) {
    const g = new THREE.PolarGridHelper(radius, 16, 6, 96, color, color);
    g.material.transparent = true;
    g.material.opacity = opacity;
    g.material.depthWrite = false;
    return g;
  }

  /** A flat document page: header in the unit's colour, lines, a stamp. */
  const pageCache = {};
  function pageTex(color, label = "", withheld = false) {
    const key = color + label + withheld;
    if (pageCache[key]) return pageCache[key];
    const c = mkCanvas(240, 312), g = c.getContext("2d");
    rr(g, 2, 2, 236, 308, 12);
    g.fillStyle = withheld ? "#3a1b22" : "#f7f9fc";
    g.fill();
    g.fillStyle = hex(color);
    rr(g, 18, 18, 204, 30, 6);
    g.fill();
    g.fillStyle = withheld ? "rgba(255,120,120,.35)" : "#c9d3e3";
    for (let i = 0; i < 9; i++) g.fillRect(18, 66 + i * 21, i % 3 === 2 ? 130 : 204, 8);
    if (label) {
      g.fillStyle = withheld ? "#ff8a8a" : "#5b6b85";
      g.font = `700 26px ${FONT}`;
      g.textAlign = "center";
      g.fillText(label, 120, 284);
    }
    if (withheld) {
      g.strokeStyle = "#ff4d4f";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(60, 110);
      g.lineTo(180, 230);
      g.moveTo(180, 110);
      g.lineTo(60, 230);
      g.stroke();
    } else {
      g.strokeStyle = rgba(color, 0.8);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(184, 250, 22, 0, TAU);
      g.stroke();
    }
    return (pageCache[key] = canvasTex(c));
  }

  // ---------------------------------------------------------------- fading
  /** Opacity cascades: material base × group fade × every ancestor's userData.fade. */
  function applyFade(obj, f) {
    const k = f * (obj.userData.fade ?? 1);
    obj.visible = k > 0.004;
    if (!obj.visible) return;
    const m = obj.material;
    if (m) {
      for (const mm of Array.isArray(m) ? m : [m]) {
        if (mm.userData.base === undefined) {
          mm.userData.base = mm.opacity;
          mm.userData.wasT = mm.transparent;
        }
        mm.opacity = mm.userData.base * k;
        mm.transparent = mm.userData.wasT || k < 0.999;
      }
    }
    for (const c of obj.children) applyFade(c, k);
  }

  // ----------------------------------------------------------- the stars
  const sky = new THREE.Group();
  scene.add(sky);
  {
    const n = 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = hash(i * 3 + 1) * 2 - 1, a = hash(i * 3 + 2) * TAU, r = 520 + hash(i * 3 + 3) * 300;
      const q = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r], i * 3);
      const tint = hash(i + 9000);
      const c = tint < 0.15 ? [0.6, 0.8, 1] : tint < 0.25 ? [1, 0.85, 0.6] : [0.85, 0.9, 1];
      const b = 0.35 + hash(i + 7000) * 0.65;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    sky.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: DOT, transparent: true, depthWrite: false, fog: false })));
  }
  // Dust that streams past during the flights between chapters.
  {
    const n = 7000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([-120 + hash(i + 1) * 680, -70 + hash(i + 2e4) * 170, -360 + hash(i + 4e4) * 620], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, color: 0x7fa6e6, map: DOT, transparent: true, opacity: 0.55, depthWrite: false })));
  }

  // ------------------------------------------------------------- scenes
  const S = [];
  function defineScene(o) {
    o.group = new THREE.Group();
    o.group.position.copy(o.center);
    scene.add(o.group);
    S.push(o);
    return o;
  }
  const at = (t) => {
    for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].start) return i;
    return 0;
  };

  /** Keyed camera: [time, [px,py,pz], [lx,ly,lz]], eased between keys. */
  function keyed(keys, lt) {
    const pose = (k) => ({ p: V(...k[1]), l: V(...k[2]) });
    if (lt <= keys[0][0]) return pose(keys[0]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (lt <= b[0]) {
        const k = ease((lt - a[0]) / (b[0] - a[0]));
        const A = pose(a), B = pose(b);
        return { p: A.p.lerp(B.p, k), l: A.l.lerp(B.l, k) };
      }
    }
    return pose(keys[keys.length - 1]);
  }

  // =====================================================================
  // 0 · Welcome
  // =====================================================================
  const textures = {};

  const intro = defineScene({
    key: "intro", name: "Welcome", start: 0, end: 10, center: V(0, 0, 0), accent: "#8fc0ff",
    big: {
      cls: "",
      html: `<div class="logos sm"><img data-logo="emb" alt="Environmental Management Bureau" /><span class="brand-divider"></span><img data-logo="bp" alt="Bagong Pilipinas" /></div>
             <div class="kicker">DENR · Environmental Management Bureau · Region III</div>
             <h1>E-Universe</h1>
             <div class="sub">Unified Information and Records Management System</div>
             <div class="tag">Universe Central DB · ERMS · Document Portal · VERA</div>`,
      op: (lt) => win(lt, 1.8, 9.6, 1.1, 1.0),
    },
    build() {
      const g = this.group;
      // A spiral galaxy of records: four arms in the four domains' colours.
      const n = 5200, arms = [C.ucds, C.erms, C.portal, C.shared].map((c) => new THREE.Color(c));
      const white = new THREE.Color(0xdfe9ff);
      this.from = new Float32Array(n * 3);
      this.to = new Float32Array(n * 3);
      this.delay = new Float32Array(n);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const core = i % 9 === 0;
        const arm = i % 4, h1 = hash(i + 11), h2 = hash(i + 23), h3 = hash(i + 37);
        const r = core ? Math.pow(h1, 1.6) * 3.2 : 1.6 + Math.pow(h1, 0.75) * 17;
        const a = core ? h2 * TAU : (arm / 4) * TAU + r * 0.36 + (h2 - 0.5) * (0.35 + r * 0.035);
        const y = (h3 - 0.5) * (core ? 1.6 : 0.9 * (1 - r / 22));
        this.to.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
        const u = hash(i + 51) * 2 - 1, b = hash(i + 67) * TAU, R = 24 + hash(i + 79) * 30, q = Math.sqrt(1 - u * u);
        this.from.set([Math.cos(b) * q * R, u * R * 0.6, Math.sin(b) * q * R], i * 3);
        this.delay[i] = hash(i + 91) * 0.9 + (r / 19) * 0.6;
        const c = (core ? white : arms[arm]).clone().lerp(white, core ? 0 : clamp(0.55 - r / 30));
        const k = 0.55 + hash(i + 97) * 0.45;
        col.set([c.r * k, c.g * k, c.b * k], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(this.from.slice(), 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      this.galaxyGeo = geo;
      this.galaxy = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, map: DOT, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.galaxy.frustumCulled = false;
      this.disk = new THREE.Group();
      this.disk.add(this.galaxy);
      this.disk.add(glow(0x9cc8ff, 12, 0.55));
      this.disk.add(glow(0x4f86ff, 46, 0.14));
      g.add(this.disk);
      this.formed = -1;
      // The four parts of the app, orbiting in the disk.
      this.parts = [
        ["Universe Central DB", C.ucds], ["ERMS", C.erms], ["Document Portal", C.portal], ["VERA", C.vera],
      ].map(([t, c], i) => {
        const p = new THREE.Group();
        p.add(mesh(new THREE.SphereGeometry(0.45, 20, 14), basic(c, 1)));
        p.add(glow(c, 3.4, 0.7));
        const l = chip(t, c, 0.72, { ts: 22 });
        l.position.y = 1.0;
        p.add(l);
        p.userData.a = (i / 4) * TAU + 0.5;
        g.add(p);
        return p;
      });
    },
    update(lt) {
      // The swirl forms once; after that only the disk turns, so no per-dot work.
      const k = clamp(lt / 3.8);
      if (k < 1 || this.formed !== 1) {
        const P = this.galaxyGeo.attributes.position.array;
        for (let i = 0; i < this.delay.length; i++) {
          const e = ease(clamp((lt - this.delay[i] * 1.3) / 2.2));
          for (let j = 0; j < 3; j++) P[i * 3 + j] = lerp(this.from[i * 3 + j], this.to[i * 3 + j], e);
        }
        this.galaxyGeo.attributes.position.needsUpdate = true;
        this.formed = k >= 1 ? 1 : 0;
      }
      this.disk.rotation.y = -lt * 0.09;
      this.parts.forEach((p, i) => {
        const a = p.userData.a - lt * 0.12;
        const r = 14.5 + (i % 2) * 2.5;
        p.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
        p.userData.fade = span(lt, 3.2 + i * 0.4, 4 + i * 0.4);
      });
    },
    cam(lt) {
      return keyed(
        [
          [0, [0, 70, 16], [0, 0, 0]],
          [4, [0, 13, 31], [0, 2.8, 0]],
          [10, [-2.5, 10.5, 27], [0, 2.6, 0]],
        ],
        lt
      );
    },
  });

  // =====================================================================
  // 1 · Two systems, one universe — from the legacy tools to one app
  // =====================================================================
  function planet(color, r = 3) {
    const g = new THREE.Group();
    g.add(glow(color, r * 5, 0.42));
    g.add(mesh(new THREE.IcosahedronGeometry(r, 2), std(color, { flat: true, ei: 0.35 })));
    const wire = mesh(new THREE.IcosahedronGeometry(r * 1.14, 1), basic(color, 0.32, { wire: true }));
    g.add(wire);
    g.userData.wire = wire;
    return g;
  }
  function satellite(text, color) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.22, 16, 12), basic(color, 1)));
    g.add(glow(color, 1.6, 0.6));
    const l = chip(text, color, 0.82);
    l.position.y = 0.75;
    g.add(l);
    return g;
  }

  /** A spreadsheet page, the way the Planning Unit's workbooks look. */
  function workbookTex(name) {
    const c = mkCanvas(360, 440), g = c.getContext("2d");
    rr(g, 2, 2, 356, 436, 14);
    g.fillStyle = "#fbfdfb";
    g.fill();
    g.fillStyle = "#1e7145";
    rr(g, 2, 2, 356, 62, 14);
    g.fill();
    g.fillRect(2, 40, 356, 24);
    g.fillStyle = "#fff";
    g.font = `700 21px ${FONT}`;
    g.fillText(name, 18, 42);
    g.fillStyle = "#e8eee9";
    g.fillRect(2, 64, 356, 26);
    g.fillStyle = "#5f7466";
    g.font = `600 14px ${FONT}`;
    "ABCDEF".split("").forEach((ch, i) => g.fillText(ch, 52 + i * 52, 82));
    for (let r = 0; r < 13; r++) {
      const y = 90 + r * 26;
      g.fillStyle = "#8a9a8f";
      g.font = `500 12px ${FONT}`;
      g.fillText(String(r + 1), 10, y + 18);
      for (let k = 0; k < 6; k++) {
        const fill = hash(r * 7 + k + name.length) ;
        g.fillStyle = r === 0 ? "#d7eadc" : fill < 0.12 ? "#fff1b8" : fill < 0.2 ? "#d9f2e1" : "#ffffff";
        g.fillRect(32 + k * 52, y, 52, 26);
        if (r > 0 && fill > 0.3) {
          g.fillStyle = "#9fb0a5";
          g.fillRect(38 + k * 52, y + 11, 18 + fill * 22, 5);
        }
      }
    }
    g.strokeStyle = "#cfd9d2";
    g.lineWidth = 1;
    for (let k = 0; k <= 6; k++) (g.beginPath(), g.moveTo(32 + k * 52, 64), g.lineTo(32 + k * 52, 428), g.stroke());
    for (let r = 0; r <= 13; r++) (g.beginPath(), g.moveTo(2, 90 + r * 26), g.lineTo(358, 90 + r * 26), g.stroke());
    return canvasTex(c);
  }

  /** The desktop EMB-ERMS window, as its screens are named in its databases. */
  function desktopTex() {
    const c = mkCanvas(800, 480), g = c.getContext("2d");
    g.fillStyle = "#3a6ea5";
    g.fillRect(0, 0, 800, 480);
    g.fillStyle = "#d4d0c8";
    g.fillRect(24, 22, 752, 436);
    const tb = g.createLinearGradient(24, 0, 776, 0);
    tb.addColorStop(0, "#0a246a");
    tb.addColorStop(1, "#a6caf0");
    g.fillStyle = tb;
    g.fillRect(24, 22, 752, 30);
    g.fillStyle = "#fff";
    g.font = `700 17px Tahoma, ${FONT}`;
    g.fillText("EMB-ERMS — Electronic Records Management Sub-System", 36, 43);
    ["Records", "Legal", "Laboratory", "Upload", "Search", "Reports"].forEach((t, i) => {
      g.fillStyle = i === 0 ? "#ffffff" : "#ece9d8";
      g.fillRect(36, 66 + i * 50, 132, 40);
      g.strokeStyle = "#808080";
      g.strokeRect(36, 66 + i * 50, 132, 40);
      g.fillStyle = "#000";
      g.font = `600 16px Tahoma, ${FONT}`;
      g.fillText(t, 50, 92 + i * 50);
    });
    g.fillStyle = "#fff";
    g.fillRect(184, 66, 578, 330);
    g.strokeStyle = "#808080";
    g.strokeRect(184, 66, 578, 330);
    const cols = ["File serial", "Permit type", "Permit no.", "Province"];
    g.fillStyle = "#ece9d8";
    g.fillRect(185, 67, 576, 28);
    g.fillStyle = "#000";
    g.font = `700 14px Tahoma, ${FONT}`;
    cols.forEach((h, i) => g.fillText(h, 194 + i * 144, 86));
    const kinds = ["ECC (Original)", "CNC", "ECC (Amended)", "HW Generator"];
    const provs = ["Bulacan", "Pampanga", "Tarlac", "Bataan", "Zambales", "Aurora", "Nueva Ecija"];
    for (let r = 0; r < 10; r++) {
      const y = 96 + r * 30;
      if (r === 2) {
        g.fillStyle = "#316ac5";
        g.fillRect(185, y, 576, 30);
      }
      g.fillStyle = r === 2 ? "#fff" : "#000";
      g.font = `400 14px Tahoma, ${FONT}`;
      g.fillText("FSN-" + String(510 + r).padStart(7, "0"), 194, y + 20);
      g.fillText(kinds[r % 4], 338, y + 20);
      g.fillText(`R03-${1300 + r * 7}-${String(400 + r * 13).padStart(4, "0")}`, 482, y + 20);
      g.fillText(provs[r % 7], 626, y + 20);
    }
    g.fillStyle = "#ece9d8";
    g.fillRect(24, 410, 752, 48);
    g.fillStyle = "#333";
    g.font = `400 15px Tahoma, ${FONT}`;
    g.fillText("Z:\\RECORDS\\Database\\Records Database\\Bulacan\\2016\\…", 36, 440);
    return canvasTex(c);
  }

  const merge = defineScene({
    key: "merge", name: "Two systems · one universe", start: 10, end: 32, center: V(0, 0, -150), accent: "#22b8a8",
    kicker: "From legacy to one app", title: "Two systems, one universe",
    captions: [
      [0, "Before: the Planning Unit kept its universe of establishments in Excel workbooks — one per province, per year — passed around as files."],
      [4, "Records, Legal Services and the Laboratory used the desktop EMB-ERMS: three SQL Server databases, and a Z: drive mapped on each PC."],
      [8, "Both were migrated: the workbooks into a register per year, the SQL exports into MongoDB — 18,069 records, 667 legal and 6,212 laboratory documents. The scans stay on the NAS."],
      [13.5, "E-Universe brings them into one web application — one sign-in, one account model, one audit trail."],
      [18, "Around it: the public Document Portal, and a shared platform for sign-in, audit, presence, live notices and VERA."],
    ],
    features: {
      title: "From legacy to E-Universe",
      items: [
        [0.8, "<b>Excel workbooks</b> — UNIVERSE-<i>year</i>-<i>province</i>.xlsx"],
        [4, "<b>Desktop EMB-ERMS</b> — 3 SQL Server databases, a Z: drive per PC"],
        [8, "<b>Migrated, re-runnable</b> — legacy IDs kept for provenance"],
        [10.5, "<b>Parallel run</b> — a daily check compares desktop and web"],
        [13.5, "<b>One account model</b> across both domains"],
        [18, "<b>Document Portal</b> and the <b>shared platform</b>"],
      ],
    },
    build() {
      const g = this.group;

      // --- the legacy tools -------------------------------------------
      this.excel = new THREE.Group();
      this.excel.position.set(-8.6, 4.2, -5);
      this.excel.scale.setScalar(1.3);
      const provs = ["AURORA", "BATAAN", "BULACAN", "NUEVA_ECIJA", "PAMPANGA", "TARLAC", "ZAMBALES"];
      this.sheets = provs.map((p, i) => {
        const m = mesh(new THREE.PlaneGeometry(2.4, 2.93), new THREE.MeshBasicMaterial({ map: workbookTex(`UNIVERSE-2025-${p}.xlsx`), transparent: true, side: THREE.DoubleSide }));
        m.userData.i = i;
        this.excel.add(m);
        return m;
      });
      const xl = card({ title: "Planning Unit · Excel", sub: "a RAW workbook per province, per year", color: 0x1e9e55 }, 1.25);
      xl.position.set(0, -2.9, 0.6);
      this.excel.add(xl);
      this.excel.add(place(glow(0x2fbf6a, 13, 0.18), 0, 0, -1));
      g.add(this.excel);

      this.desk = new THREE.Group();
      this.desk.position.set(7.8, 4.2, -5);
      this.desk.scale.setScalar(1.3);
      const mon = mesh(new THREE.BoxGeometry(5.6, 3.6, 0.32), std(0x2b2e35, { ei: 0.05, rough: 0.7 }));
      this.desk.add(mon);
      const scr = mesh(new THREE.PlaneGeometry(5.2, 3.12), new THREE.MeshBasicMaterial({ map: desktopTex(), transparent: true }));
      scr.position.z = 0.17;
      this.desk.add(scr);
      this.desk.add(place(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), std(0x2b2e35, { ei: 0.05 })), 0, -2.2, -0.1));
      this.desk.add(place(mesh(new THREE.BoxGeometry(2.4, 0.16, 1.2), std(0x2b2e35, { ei: 0.05 })), 0, -2.66, 0));
      const tower = mesh(new THREE.BoxGeometry(1.2, 3.2, 2.4), std(0x34373f, { ei: 0.05, rough: 0.7 }));
      tower.position.set(3.7, -1.1, -0.4);
      this.desk.add(tower);
      this.desk.add(place(mesh(new THREE.CircleGeometry(0.08, 10), basic(C.ok, 1)), 3.7, -0.1, 0.81));
      const dl = card({ title: "Desktop EMB-ERMS", sub: "3 SQL Server databases · Z: drive per PC", color: 0x6b8fc7 }, 1.25);
      dl.position.set(0, 2.75, 0.3);
      this.desk.add(dl);
      this.dbs = ["dbmain_ermsrecords", "dbmain_ermslegal", "dbmain_ermssublab"].map((name, i) => {
        const d = new THREE.Group();
        for (let k = 0; k < 2; k++) d.add(place(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 32), std(0x8796b0, { ei: 0.2 })), 0, k * 0.52, 0));
        const l = chip(name, 0x8796b0, 0.5, { ts: 20 });
        l.position.y = -0.75;
        d.add(l);
        d.position.set(-3.4 + i * 3.4, -4.1, 1.2);
        this.desk.add(d);
        return d;
      });
      g.add(this.desk);

      // --- the migration streams ----------------------------------------
      const stream = (color, n) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, color, map: DOT, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
        pts.frustumCulled = false;
        g.add(pts);
        return pts;
      };
      this.xlStream = stream(0x3ddc84, 420);
      this.dbStream = stream(0x5aa2ff, 420);
      this.xlChip = chip("RAW workbooks → a register per year", 0x3ddc84, 0.62, { ts: 21 });
      this.dbChip = chip("SQL exports → MongoDB · scans stay on the NAS", 0x5aa2ff, 0.62, { ts: 21 });
      g.add(this.xlChip, this.dbChip);

      // --- the two systems, then one --------------------------------
      this.ucds = planet(C.ucds);
      this.erms = planet(C.erms);
      const lu = card({ title: "Universe Central DB", sub: "Planning Unit · register by province & year", color: C.ucds }, 1.5);
      lu.position.y = -4.9;
      this.ucds.add(lu);
      const le = card({ title: "ERMS", sub: "Records · Legal Services · Laboratory", color: C.erms }, 1.5);
      le.position.y = -4.9;
      this.erms.add(le);
      g.add(this.ucds, this.erms);

      const us = ["Monitoring Plan", "PTO · WWDP · PCO permits", "Year containers", "Datasets & custom tables", "Monitoring calendar"];
      const es = ["Document Library", "Upload record · FSN", "Custody tracking", "Archive boxes", "Portal Requests"];
      this.sats = [...us.map((s) => [satellite(s, C.ucds), 0]), ...es.map((s) => [satellite(s, C.erms), 1])];
      this.sats.forEach(([s]) => g.add(s));

      this.core = new THREE.Group();
      this.core.add(glow(C.core, 26, 0.5));
      this.core.add(mesh(new THREE.IcosahedronGeometry(4.2, 3), std(C.core, { ei: 0.45, rough: 0.3 })));
      const cw = mesh(new THREE.IcosahedronGeometry(4.9, 1), basic(0x9ff5ea, 0.28, { wire: true }));
      this.core.add(cw);
      this.coreWire = cw;
      const cl = card({ title: "E-Universe", sub: "one web application", color: C.core, ts: 36 }, 1.9);
      cl.position.y = -6.6;
      this.core.add(cl);
      g.add(this.core);

      this.burst = glow(0xd6fff8, 40, 0.85);
      g.add(this.burst);

      this.moon = new THREE.Group();
      this.moon.add(mesh(new THREE.SphereGeometry(1.05, 32, 20), std(C.portal, { ei: 0.5 })));
      this.moon.add(glow(C.portal, 6, 0.5));
      const ml = card({ title: "Document Portal", sub: "public · no account", color: C.portal }, 1.15);
      ml.position.y = 2.1;
      this.moon.add(ml);
      g.add(this.moon);

      this.shared = new THREE.Group();
      const tor = mesh(new THREE.TorusGeometry(8, 0.07, 10, 160), basic(C.shared, 0.9));
      tor.rotation.x = Math.PI / 2;
      this.shared.add(tor);
      const sl = card({ title: "Shared platform", sub: "auth · audit · presence · notices · VERA", color: C.shared }, 1.15);
      sl.position.set(0, 0.9, 8);
      this.shared.add(sl);
      this.shared.rotation.set(0.42, 0, -0.12);
      g.add(this.shared);
    },
    update(lt) {
      // --- legacy (0–10 s) ---------------------------------------------
      const gone = span(lt, 8.8, 10.8);
      this.excel.userData.fade = span(lt, 0.2, 1.2) * (1 - gone);
      this.sheets.forEach((m) => {
        const i = m.userData.i, k = easeOut(span(lt, 0.2 + i * 0.16, 1.2 + i * 0.16));
        m.position.set((i - 3) * 0.78 * k, Math.sin(lt * 1.2 + i) * 0.08 + Math.abs(i - 3) * -0.12, -i * 0.05);
        m.rotation.set(0, 0.25, (i - 3) * -0.13 * k);
        m.userData.fade = k * (1 - span(lt, 6 + i * 0.3, 9.5 + i * 0.15) * 0.75);
      });
      this.excel.rotation.y = Math.sin(lt * 0.4) * 0.08;
      this.desk.userData.fade = span(lt, 1, 2.2) * (1 - gone);
      this.desk.rotation.y = -0.22 + Math.sin(lt * 0.4) * 0.05;
      this.dbs.forEach((d, i) => (d.userData.fade = span(lt, 4 + i * 0.3, 4.6 + i * 0.3) * (1 - span(lt, 6.5 + i * 0.4, 9.5) * 0.7)));

      // --- migration (5.5–11 s) ----------------------------------------
      const flow = win(lt, 5.4, 11.2, 0.8, 1.2);
      const pour = (pts, src, dst, seed) => {
        pts.userData.fade = flow;
        if (flow <= 0) return;
        const P = pts.geometry.attributes.position.array, n = P.length / 3;
        const ctl = src.clone().lerp(dst, 0.5).add(V(0, 4.5, 3));
        for (let i = 0; i < n; i++) {
          const u = frac((lt - 5.4) * 0.38 + hash(i + seed));
          const jx = (hash(i + seed + 1) - 0.5), jy = (hash(i + seed + 2) - 0.5), jz = (hash(i + seed + 3) - 0.5);
          const a = 1 - u, w0 = a * a, w1 = 2 * a * u, w2 = u * u;
          P[i * 3] = w0 * (src.x + jx * 3) + w1 * (ctl.x + jx * 2) + w2 * (dst.x + jx * 1.2);
          P[i * 3 + 1] = w0 * (src.y + jy * 3) + w1 * (ctl.y + jy * 2) + w2 * (dst.y + jy * 1.2);
          P[i * 3 + 2] = w0 * (src.z + jz * 1.5) + w1 * (ctl.z + jz * 2) + w2 * (dst.z + jz * 1.2);
        }
        pts.geometry.attributes.position.needsUpdate = true;
      };

      // --- the planets: formed by the migration, then merged ---------
      const L = lt - 5.5; // the original unification timeline, after the legacy prelude
      const m = ease(span(L, 8, 12.4));
      const fuse = span(L, 11.4, 12.8);
      const form = easeOut(span(lt, 6.4, 9.6));
      this.ucds.position.set(lerp(-10, -1.6, m), Math.sin(lt * 0.9) * 0.4, 0);
      this.erms.position.set(lerp(10, 1.6, m), Math.sin(lt * 0.9 + 2) * 0.4, 0);
      for (const p of [this.ucds, this.erms]) {
        p.rotation.y = lt * 0.25;
        p.userData.wire.rotation.x = lt * 0.2;
        p.userData.fade = span(lt, 6.4, 7.8) * (1 - fuse);
        p.scale.setScalar(Math.max(0.01, form) * (1 - 0.35 * m));
      }
      pour(this.xlStream, this.excel.position, this.ucds.position, 1000);
      pour(this.dbStream, this.desk.position.clone().add(V(0, -2.5, 1)), this.erms.position, 5000);
      this.xlChip.position.copy(this.excel.position).lerp(this.ucds.position, 0.5).add(V(-1.5, 3.4, 2));
      this.dbChip.position.copy(this.desk.position).lerp(this.erms.position, 0.5).add(V(1.5, 3.4, 2));
      this.xlChip.userData.fade = this.dbChip.userData.fade = win(lt, 6, 10.8, 0.5, 0.6);

      const merged = ease(span(L, 11, 14.5));
      this.sats.forEach(([s, side], i) => {
        const j = i % 5, home = side ? this.erms.position : this.ucds.position;
        const a = (j / 5) * TAU + lt * 0.32 * (side ? -1 : 1) + side;
        const r = 5.4;
        const pre = V(home.x + Math.cos(a) * r, home.y + Math.sin(a) * r * 0.28 + (j - 2) * 0.35, home.z + Math.sin(a) * r * 0.75);
        const b = (i / 10) * TAU + lt * 0.16;
        const post = V(Math.cos(b) * 11.5, Math.sin(b * 2) * 1.1 + 0.4, Math.sin(b) * 7.5);
        s.position.copy(pre.lerp(post, merged));
        s.userData.fade = span(L, 4 + j * 0.25 + side * 1.0, 4.8 + j * 0.25 + side * 1.0);
      });
      const cs = span(L, 11.6, 13.6);
      this.core.userData.fade = cs;
      this.core.scale.setScalar(0.55 + 0.45 * easeOut(cs));
      this.core.rotation.y = lt * 0.18;
      this.coreWire.rotation.x = -lt * 0.12;
      this.burst.userData.fade = win(L, 11.3, 13.8, 0.45, 1.6);
      this.burst.scale.setScalar(lerp(8, 36, span(L, 11.3, 13.8)));
      const ma = lt * 0.42;
      this.moon.position.set(Math.cos(ma) * 15, 2 + Math.sin(ma) * 2.4, Math.sin(ma) * 9);
      this.moon.userData.fade = span(L, 12.2, 13.4);
      this.shared.rotation.y = lt * 0.1;
      this.shared.userData.fade = span(L, 12.8, 14.2);
    },
    cam(lt) {
      const a = -0.2 + lt * 0.016, d = lerp(34, 29, span(lt, 14, 22));
      const look = V(1.4, 3.2, -4).lerp(V(1.8, 0.4, 0), ease(span(lt, 7, 11)));
      look.x *= 1 - ease(span(lt, 13.5, 18));
      return { p: look.clone().add(V(Math.sin(a) * d, lerp(6.5, 5.2, span(lt, 0, 22)), Math.cos(a) * d)), l: look };
    },
  });

  // =====================================================================
  // 2 · How it connects
  // =====================================================================
  function glyph(kind, color) {
    const g = new THREE.Group();
    const add = (geo, mat, y = 0) => {
      const m = mesh(geo, mat);
      m.position.y = y;
      g.add(m);
      return m;
    };
    if (kind === "screen") {
      add(new THREE.BoxGeometry(3.4, 2.1, 0.16), std(0x0d1a33, { ei: 0.1 }));
      const scr = add(new THREE.PlaneGeometry(3.1, 1.8), basic(color, 0.85));
      scr.position.z = 0.09;
      for (let i = 0; i < 3; i++) {
        const l = add(new THREE.PlaneGeometry(i ? 1.6 : 2.4, 0.16), basic(0xffffff, 0.75), 0.45 - i * 0.38);
        l.position.set(i ? -0.55 : -0.2, 0.45 - i * 0.38, 0.1);
      }
      add(new THREE.BoxGeometry(0.3, 0.6, 0.12), std(0x0d1a33), -1.3);
    } else if (kind === "hex") {
      const h = add(new THREE.CylinderGeometry(1.75, 1.75, 1.1, 6), std(color, { ei: 0.4, flat: true }));
      h.rotation.x = Math.PI / 2;
      const e = edges(new THREE.CylinderGeometry(1.76, 1.76, 1.12, 6), 0xffffff, 0.6);
      e.rotation.x = Math.PI / 2;
      g.add(e);
    } else if (kind === "box") {
      const geo = new THREE.BoxGeometry(2.6, 1.5, 1.5);
      add(geo, std(color, { ei: 0.38 }));
      g.add(edges(geo, 0xffffff, 0.55));
    } else if (kind === "db") {
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 40), std(color, { ei: 0.4 }), -0.66 + i * 0.66);
    } else if (kind === "server") {
      const geo = new THREE.BoxGeometry(1.5, 2.3, 1.4);
      add(geo, std(0x2a3550, { ei: 0.1 }));
      g.add(edges(geo, color, 0.8));
      for (let i = 0; i < 4; i++) {
        const l = add(new THREE.PlaneGeometry(1.1, 0.12), basic(color, 0.9), 0.75 - i * 0.45);
        l.position.z = 0.71;
      }
    } else if (kind === "nas") {
      for (let i = 0; i < 2; i++) {
        const geo = new THREE.BoxGeometry(2.6, 0.8, 1.6);
        add(geo, std(0x2a2340, { ei: 0.1 }), -0.45 + i * 0.95);
        const e = edges(geo, color, 0.85);
        e.position.y = -0.45 + i * 0.95;
        g.add(e);
        for (let j = 0; j < 4; j++) {
          const d = add(new THREE.CircleGeometry(0.08, 10), basic(j % 2 ? C.ok : color, 1), -0.45 + i * 0.95);
          d.position.set(-0.9 + j * 0.3, -0.45 + i * 0.95, 0.81);
        }
      }
    } else if (kind === "ai") {
      add(new THREE.IcosahedronGeometry(1.25, 0), std(color, { ei: 0.5, flat: true }));
      g.add(mesh(new THREE.IcosahedronGeometry(1.6, 1), basic(color, 0.3, { wire: true })));
    }
    g.add(glow(color, 6.5, 0.28));
    return g;
  }

  const arch = defineScene({
    key: "arch", name: "How it connects", start: 32, end: 58, center: V(140, 8, -270), accent: "#1677ff",
    kicker: "Architecture", title: "How it connects",
    captions: [
      [0, "A modular monolith: one Express API, one React single-page app, one MongoDB database — and two business domains that own their own data."],
      [7, "Staff sign in over HTTPS and Socket.IO. Public visitors reach only the Document Portal, recognised by an httpOnly ticket cookie."],
      [13, "Write ownership is exclusive: only ERMS writes erms-*, only UCDS writes ucds-*, only the Portal writes portal-*. Each reads the other only through its exported service."],
      [19.5, "Documents stay on the Synology NAS, reached through the office server over the tailnet. The API streams each file and decides who may open it."],
      [23.5, "VERA can phrase answers through Anthropic Claude or Google Gemini — optional, and it never sees a record."],
    ],
    features: {
      title: "The stack",
      items: [
        [1, "<b>Front end</b> — React 18, Vite 6, Ant Design 5, TanStack Query"],
        [3, "<b>API</b> — Node.js 20, Express, Socket.IO, Zod, helmet, rate limits"],
        [6.5, "<b>Data</b> — MongoDB Atlas <i>universe-db</i>, native driver"],
        [8, "<b>Documents</b> — Synology NAS over SMB via the office server"],
        [9.5, "<b>Directory</b> — HRPMS designations, read-only"],
        [11, "<b>Assistant</b> — Anthropic Claude or Gemini, optional"],
      ],
    },
    build() {
      const g = this.group;
      const N = (this.nodes = {
        staff: { p: [-22, 4.8, 0], kind: "screen", title: "Staff browser", sub: "React 18 · Ant Design 5", color: C.erms, at: 0.6 },
        public: { p: [-22, -4.8, 0], kind: "screen", title: "Public visitor", sub: "Document Portal page", color: C.portal, at: 1.3 },
        api: { p: [-10.5, 0, 0], kind: "hex", title: "Express API", sub: "Node 20 · Socket.IO · Zod", color: C.api, at: 2.4 },
        ucds: { p: [1.5, 8.6, 0], kind: "box", title: "UCDS module", sub: "register · years · datasets", color: C.ucds, at: 3.8 },
        erms: { p: [1.5, 2.9, 0], kind: "box", title: "ERMS module", sub: "records · units · documents", color: C.erms, at: 4.3 },
        portal: { p: [1.5, -2.9, 0], kind: "box", title: "Portal module", sub: "room · requests · chat", color: C.portal, at: 4.8 },
        shared: { p: [1.5, -8.6, 0], kind: "box", title: "Shared platform", sub: "auth · audit · presence · VERA", color: C.shared, at: 5.3 },
        mongo: { p: [14, 0.2, 0], kind: "db", title: "MongoDB Atlas", sub: "universe-db", color: C.mongo, at: 6.6 },
        bridge: { p: [14, 9.6, 0], kind: "server", title: "Office server", sub: "NAS bridge · Tailscale", color: 0x9fb0cf, at: 7.6 },
        nas: { p: [25, 9.6, 0], kind: "nas", title: "Synology NAS", sub: "scanned documents", color: C.nas, at: 8.3 },
        hrpms: { p: [14, -7.2, 0], kind: "db", title: "db-hrpms", sub: "designations · read-only", color: C.hr, at: 9.3 },
        llm: { p: [25, -7.2, 0], kind: "ai", title: "Anthropic / Gemini", sub: "VERA phrasing · optional", color: C.vera, at: 10.3 },
      });
      for (const [id, n] of Object.entries(N)) {
        n.g = new THREE.Group();
        n.g.position.set(...n.p);
        n.glyph = glyph(n.kind, n.color);
        n.g.add(n.glyph);
        const l = card({ title: n.title, sub: n.sub, color: n.color, ts: 27, ss: 18 }, 1.3);
        l.position.y = -2.25;
        n.g.add(l);
        n.id = id;
        g.add(n.g);
      }
      const E = [
        ["staff", "api", C.erms, "HTTPS · Socket.IO"],
        ["public", "api", C.portal, "ticket cookie"],
        ["api", "ucds", C.ucds], ["api", "erms", C.erms], ["api", "portal", C.portal], ["api", "shared", C.shared],
        ["ucds", "mongo", C.ucds, "ucds-*", "own"], ["erms", "mongo", C.erms, "erms-*", "own"],
        ["portal", "mongo", C.portal, "portal-*", "own"], ["shared", "mongo", C.shared, "users · app-logs", "own"],
        ["erms", "bridge", C.nas, "SMB over tailnet", "nas"], ["bridge", "nas", C.nas, null, "nas"],
        ["portal", "bridge", C.portal, "approved pages only", "nas"],
        ["portal", "hrpms", C.hr, "designations", "hr", true], ["shared", "llm", C.vera, "optional", "llm", true],
      ];
      this.edges = E.map(([a, b, color, label, grp, dashed], i) => {
        const A = V(...N[a].p), B = V(...N[b].p);
        const dir = B.x > A.x ? 1 : -1;
        const s = A.clone().add(V(2 * dir, 0, 0)), e = B.clone().add(V(-2 * dir, 0, 0));
        const mid = s.clone().lerp(e, 0.5).add(V(0, 0, 2.6));
        const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
        const edge = { a, b, color, grp, dashed, curve, i };
        if (dashed) {
          const pts = curve.getPoints(36);
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          edge.obj = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.32, color, map: DOT, transparent: true, opacity: 0.95, depthWrite: false }));
          edge.count = pts.length;
        } else {
          const geo = new THREE.TubeGeometry(curve, 48, 0.07, 6, false);
          edge.obj = mesh(geo, basic(color, 0.8, { add: true }));
          edge.count = geo.index.count;
        }
        g.add(edge.obj);
        if (label) {
          edge.label = chip(label, color, 0.72, { ts: 21 });
          edge.label.position.copy(curve.getPoint(0.5)).add(V(0, 0.65, 0.2));
          edge.label.userData.s0 = edge.label.scale.clone();
          g.add(edge.label);
        }
        edge.packets = [0, 1].map(() => {
          const p = glow(color, 1.25, 0.95);
          g.add(p);
          return p;
        });
        return edge;
      });
      g.add(place(floorGrid(34, 0x1b3765, 0.22), 1, -13, 0));
    },
    update(lt) {
      const N = this.nodes;
      const hl = { own: win(lt, 13, 19.5, 1, 1), nas: win(lt, 19.5, 23.6, 0.9, 0.9), llm: win(lt, 23.5, 30, 0.9, 1) };
      const any = Math.max(hl.own, hl.nas, hl.llm);
      const involved = {};
      for (const e of this.edges) {
        const h = e.grp ? hl[e.grp] || 0 : 0;
        if (h > 0) involved[e.a] = Math.max(involved[e.a] || 0, h), involved[e.b] = Math.max(involved[e.b] || 0, h);
      }
      for (const n of Object.values(N)) {
        const ap = easeOut(span(lt, n.at, n.at + 0.8));
        const emph = involved[n.id] || 0;
        n.g.userData.fade = ap * (1 - any * 0.55 + emph * 0.55);
        n.g.scale.setScalar((0.6 + 0.4 * ap) * (1 + emph * 0.08));
        n.glyph.rotation.y = Math.sin(lt * 0.5 + n.p[1]) * 0.35;
      }
      for (const e of this.edges) {
        const start = Math.max(N[e.a].at, N[e.b].at) + 0.5;
        const rv = ease(span(lt, start, start + 1.3));
        const h = e.grp ? hl[e.grp] || 0 : 0;
        const dim = 1 - any * 0.65 + h * 0.65;
        if (e.dashed) e.obj.geometry.setDrawRange(0, Math.floor(rv * e.count));
        else e.obj.geometry.setDrawRange(0, Math.floor((rv * e.count) / 6) * 6);
        e.obj.userData.fade = (rv > 0 ? 1 : 0) * dim;
        if (e.label) {
          e.label.userData.fade = span(lt, start + 1, start + 1.8) * dim;
          e.label.scale.copy(e.label.userData.s0).multiplyScalar(1 + h * 0.25);
        }
        e.packets.forEach((p, j) => {
          const u = frac(lt * (e.dashed ? 0.16 : 0.3) + j * 0.5 + e.i * 0.137);
          p.position.copy(e.curve.getPoint(u));
          p.userData.fade = (rv >= 1 ? 1 : 0) * Math.sqrt(Math.sin(u * Math.PI)) * dim;
          p.scale.setScalar(1.25 * (1 + h * 0.5));
        });
      }
    },
    cam(lt) {
      const fOwn = win(lt, 13, 19.5, 1.4, 1.4), fNas = win(lt, 19.5, 23.7, 1.3, 1.2), fLlm = win(lt, 23.5, 30, 1.2, 1);
      const a = -0.42 + 0.5 * ease(span(lt, 0, 26));
      const look = V(1.5, 0.5, 0);
      look.lerp(V(9, 0, 0), fOwn);
      look.lerp(V(17, 7.5, 0), fNas);
      look.lerp(V(17, -5, 0), fLlm);
      const d = lerp(54, 47, span(lt, 0, 12)) - 13 * Math.max(fOwn * 0.7, fNas, fLlm);
      return { p: look.clone().add(V(Math.sin(a) * d, 5 + Math.sin(lt * 0.25) * 1.5, Math.cos(a) * d)), l: look };
    },
  });

  // =====================================================================
  // 3 · Access & security
  // =====================================================================
  const sec = defineScene({
    key: "sec", name: "Access & security", start: 58, end: 78, center: V(310, -4, -230), accent: "#faad14",
    kicker: "Access & security", title: "One account model, guarded on the server",
    captions: [
      [0, "Every request passes the same gates. Sessions live on the server, one per browser tab, so several accounts can be open at once."],
      [5.5, "Role → domains → capabilities → province and year scope. Scope is applied inside the services, never just by hiding a menu item."],
      [10.5, "A request outside its domain is refused by requireDomain. A record you may not see reports “not found”, so its existence is never confirmed."],
      [15.5, "Every open, refusal and change goes to one audit trail — and npm run audit:routes fails the build on any unguarded route."],
    ],
    features: {
      title: "Safeguards",
      items: [
        [1, "<b>Server-side sessions</b> in MongoDB, one per tab"],
        [3.5, "<b>Route guards</b> — requireDomain, requireRole, authenticateSession"],
        [6.5, "<b>Province & year scope</b> applied in the services"],
        [9, "<b>Sign-in rate limits</b> per account and per address"],
        [12, "<b>Secrets</b> only in server/.env · NAS credentials encrypted"],
        [15.5, "<b>One audit trail</b> (app-logs) across both domains"],
      ],
    },
    build() {
      const g = this.group;
      const defs = [
        ["Session", "one per browser tab", C.api],
        ["Role", "Planning · Records · Legal · Lab · Admin", 0xb37feb],
        ["Domains", "UCDS · ERMS", C.portal],
        ["Capabilities", "view · file · decide · configure", C.ucds],
        ["Province & year scope", "Aurora … Zambales · year containers", C.shared],
        ["Audit trail", "app-logs · every open and refusal", 0xff9c6e],
      ];
      this.gates = defs.map(([title, sub, color], i) => {
        const gg = new THREE.Group();
        gg.position.z = -i * 9;
        const torMat = std(color, { ei: 0.4 });
        const tor = mesh(new THREE.TorusGeometry(3.7, 0.13, 16, 120), torMat);
        const inner = mesh(new THREE.TorusGeometry(3.15, 0.03, 8, 120), basic(color, 0.5));
        const memMat = basic(color, 0.05, { side: THREE.DoubleSide, add: true });
        const mem = mesh(new THREE.CircleGeometry(3.6, 64), memMat);
        for (let k = 0; k < 8; k++) {
          const b = mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), std(color, { ei: 0.6 }));
          const a = (k / 8) * TAU;
          b.position.set(Math.cos(a) * 3.7, Math.sin(a) * 3.7, 0);
          b.rotation.z = a;
          gg.add(b);
        }
        const l = card({ title, sub, color, badge: String(i + 1), ts: 27, ss: 18 }, 1.35);
        l.position.set(0, 5.35, 0);
        gg.add(tor, inner, mem, l);
        g.add(gg);
        return { gg, torMat, memMat, mem, label: l, color: new THREE.Color(color), z: -i * 9 };
      });
      // A tunnel floor of light.
      const floor = mesh(new THREE.PlaneGeometry(4, 64), basic(0x274b86, 0.18, { add: true }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -3.9, -20);
      g.add(floor);

      const pk = (color, text) => {
        const p = new THREE.Group();
        p.add(mesh(new THREE.SphereGeometry(0.42, 24, 16), basic(color, 1)));
        p.add(glow(color, 4, 0.8));
        const l = chip(text, color, 0.72, { ts: 21 });
        l.position.y = 1.15;
        p.add(l);
        p.userData.label = l;
        g.add(p);
        return p;
      };
      this.good = pk(C.ok, "Planning · Bulacan → open Monitoring Plan");
      this.bad = pk(0xffc069, "Planning-only account → ERMS record");
      this.refused = chip("Refused · requireDomain", C.danger, 0.85, { ts: 24 });
      g.add(this.refused);
      this.badRed = new THREE.Color(C.danger);
      this.badCore = this.bad.children[0].material;
      this.badGlow = this.bad.children[1].material;

      this.logs = [
        [8.6, "sign-in · Planning Unit", C.api],
        [12.9, "refused · requireDomain · ERMS", C.danger],
        [15.6, "open · Monitoring Plan · Bulacan", C.ok],
      ].map(([t0, text, color], i) => {
        const l = chip(text, color, 0.7, { ts: 21 });
        l.position.set(-6.2, 3.2 - i * 0.95, -45);
        l.userData.t0 = t0;
        g.add(l);
        return l;
      });
    },
    goodZ: (lt) => 9 - clamp(lt - 1, 0, 14.6) * 3.7,
    badZ(lt) {
      const hit = -18 + 1.0, t1 = 6.2, v = 4.2, tHit = t1 + (9 - hit) / v;
      if (lt < tHit) return { z: 9 - Math.max(0, lt - t1) * v, hit: 0, tHit };
      return { z: hit + Math.min(lt - tHit, 1.4) * 2.2, hit: 1, tHit };
    },
    update(lt) {
      const gz = this.goodZ(lt), b = this.badZ(lt);
      this.good.position.set(-1.1, 0, gz);
      this.good.userData.fade = span(lt, 0.4, 1.2) * (1 - span(lt, 16.2, 17.2));
      this.bad.position.set(1.1, 0.2, b.z);
      this.bad.userData.fade = span(lt, 6, 6.8) * (1 - span(lt, b.tHit + 1.2, b.tHit + 2.2));
      const red = b.hit ? 1 : 0;
      this.badCore.color.set(red ? C.danger : 0xffc069);
      this.badGlow.color.set(red ? C.danger : 0xffc069);
      this.refused.position.set(1.1, 2.1, b.z + 0.3);
      this.refused.userData.fade = b.hit ? win(lt, b.tHit, b.tHit + 3.2, 0.25, 0.8) : 0;
      this.gates.forEach((gt, i) => {
        const fg = Math.exp(-Math.pow(gz - gt.z, 2) / 2.2);
        const fb = i <= 2 ? Math.exp(-Math.pow(b.z - gt.z, 2) / 2.2) * span(lt, 6, 6.8) : 0;
        const deny = i === 2 && b.hit ? win(lt, b.tHit, b.tHit + 2.4, 0.1, 1.2) : 0;
        gt.torMat.emissiveIntensity = 0.35 + (fg + fb) * 1.4 + deny * 1.2;
        gt.torMat.emissive.copy(gt.color).lerp(this.badRed, deny);
        gt.memMat.color.copy(gt.color).lerp(this.badRed, deny);
        gt.mem.userData.fade = 1 + (fg + fb) * 4 + deny * 7;
        gt.gg.rotation.z = lt * 0.08 * (i % 2 ? -1 : 1);
        gt.gg.userData.fade = span(lt, i * 0.35, i * 0.35 + 0.8);
        const camZ = this.cam(lt).p.z;
        gt.label.userData.fade = clamp((camZ - 6 - gt.z) / 5);
      });
      this.logs.forEach((l) => (l.userData.fade = span(lt, l.userData.t0, l.userData.t0 + 0.5)));
    },
    cam(lt) {
      const z = clamp(this.goodZ(lt), -41, 7);
      const follow = { p: V(12.5, 4.6, z + 17), l: V(0, 0.6, z - 7) };
      const k = ease(span(lt, 15.5, 20));
      return { p: follow.p.lerp(V(24, 12, -8), k), l: follow.l.lerp(V(5, 0.5, -30), k) };
    },
  });

  // =====================================================================
  // 4 · Processing a record
  // =====================================================================
  const proc = defineScene({
    key: "proc", name: "Processing records", start: 78, end: 104, center: V(430, -12, -100), accent: "#1677ff",
    kicker: "How it processes records", title: "From scan to shelf",
    captions: [
      [0, "Records staff file a scan and its details. Autocomplete offers values already on file — a known docket fills in its company."],
      [5, "On save the next File Serial Number is claimed, and permit numbers are checked against the Central DB register as you type."],
      [10.5, "The record is written to its domain’s own collection. Shared reads are cached briefly, and cleared by the writes that change them."],
      [15, "The scan is filed on the NAS in the desktop system’s layout — province › year range › year › project. The record keeps the path, not the file."],
      [20, "Custody is tracked in a trail that cannot be edited after the fact — through to archive boxes, sealing and disposal."],
    ],
    features: {
      title: "Data handling",
      items: [
        [1, "<b>Document Library</b> — search by FSN, permit, proponent, title"],
        [5, "<b>FSN</b> claimed on save — the next serial, every time"],
        [7, "<b>Register link</b> — permits checked as you type"],
        [10.5, "<b>Short-lived cache</b>, cleared by the writes"],
        [12.5, "<b>Live notices</b> pushed over Socket.IO"],
        [15, "<b>Scans on the NAS</b> — records store paths"],
        [20, "<b>Custody · archive · disposal</b>, append-only"],
      ],
    },
    build() {
      const g = this.group;
      const defs = [
        ["Upload record", "scan + form, laid out in tabs", C.erms],
        ["FSN claimed on save", "the next serial number", C.api],
        ["Permit check", "against the Central DB register", C.ucds],
        ["Saved · erms-records", "MongoDB · cache cleared", C.mongo],
        ["Filed on the NAS", "province › year range › year › project", C.nas],
        ["Custody tracking", "cannot be edited after the fact", C.shared],
        ["Archive box", "sealing and disposal records", 0xd9a066],
      ];
      this.st = defs.map(([title, sub, color], i) => {
        const x = -27 + i * 9;
        const sg = new THREE.Group();
        sg.position.x = x;
        sg.add(mesh(new THREE.CylinderGeometry(1.9, 2.15, 0.5, 48), std(0x0e1b34, { ei: 0.05 })));
        const ringMat = basic(color, 0.9, { add: true });
        const ringM = mesh(new THREE.TorusGeometry(2.0, 0.06, 8, 96), ringMat);
        ringM.rotation.x = Math.PI / 2;
        ringM.position.y = 0.26;
        sg.add(ringM);
        const halo = glow(color, 7, 0.3);
        halo.position.y = 1.6;
        sg.add(halo);
        const l = card({ title, sub, color, badge: String(i + 1), ts: 26, ss: 17 }, 1.25);
        l.position.set(0, 5.4, 0);
        sg.add(l);
        g.add(sg);
        return { sg, x, color, halo, ringM };
      });
      const S0 = this.st;
      // glyphs
      const gl = (i, obj, y = 1.7) => {
        obj.position.y = y;
        S0[i].sg.add(obj);
        S0[i].glyph = obj;
        return obj;
      };
      {
        const stack = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const p = mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ map: pageTex(C.erms), transparent: true, side: THREE.DoubleSide }));
          p.position.set(-0.25 + k * 0.25, k * 0.1, -k * 0.15);
          p.rotation.z = (k - 1) * 0.12;
          stack.add(p);
        }
        const arrow = mesh(new THREE.ConeGeometry(0.35, 0.6, 16), basic(C.erms, 1));
        arrow.position.set(0.95, 1.1, 0.2);
        stack.add(arrow);
        gl(0, stack, 1.9);
      }
      this.fsn = liveChip(560, 150, 1.0, (g2, v, w, h) => {
        rr(g2, 4, 4, w - 8, h - 8, 26);
        g2.fillStyle = "rgba(8,17,34,.92)";
        g2.fill();
        g2.lineWidth = 4;
        g2.strokeStyle = hex(C.api);
        g2.stroke();
        g2.fillStyle = "#8fb4ff";
        g2.font = `600 30px ${FONT}`;
        g2.fillText("next serial", 34, 48);
        g2.fillStyle = "#fff";
        g2.font = `700 60px Consolas, "Cascadia Mono", monospace`;
        g2.fillText(v, 34, 118);
      });
      gl(1, this.fsn, 2.0);
      {
        const gp = new THREE.Group();
        gp.add(mesh(new THREE.IcosahedronGeometry(0.85, 1), std(C.ucds, { flat: true, ei: 0.4 })));
        const cv = mkCanvas(128, 128), cg = cv.getContext("2d");
        cg.fillStyle = hex(C.ok);
        cg.beginPath();
        cg.arc(64, 64, 60, 0, TAU);
        cg.fill();
        cg.strokeStyle = "#fff";
        cg.lineWidth = 14;
        cg.lineCap = "round";
        cg.beginPath();
        cg.moveTo(36, 66);
        cg.lineTo(56, 86);
        cg.lineTo(94, 44);
        cg.stroke();
        this.check = spriteOf(cv, 0.9);
        this.check.position.set(0.95, 0.85, 0.6);
        gp.add(this.check);
        gl(2, gp, 1.9);
      }
      {
        const db = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const c = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.45, 40), std(C.mongo, { ei: 0.4 }));
          c.position.y = k * 0.58;
          db.add(c);
        }
        gl(3, db, 1.0);
      }
      gl(4, glyph("nas", C.nas), 1.75);
      {
        const chain = new THREE.Group();
        this.links = [];
        for (let k = 0; k < 4; k++) {
          const mat = std(C.shared, { ei: 0.15 });
          const b = mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mat);
          b.position.set(-1.2 + k * 0.8, 0, 0);
          chain.add(b);
          this.links.push(mat);
          if (k) {
            const r = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), basic(C.shared, 0.9));
            r.rotation.z = Math.PI / 2;
            r.position.set(-1.6 + k * 0.8, 0, 0);
            chain.add(r);
          }
        }
        gl(5, chain, 1.8);
      }
      {
        const box = new THREE.Group();
        const geo = new THREE.BoxGeometry(2.3, 1.4, 1.6);
        box.add(mesh(geo, std(0x9a6b3c, { ei: 0.12, rough: 0.8 })));
        box.add(edges(geo, 0xffd8a8, 0.6));
        this.lid = new THREE.Group();
        const lidM = mesh(new THREE.BoxGeometry(2.4, 0.12, 1.7), std(0xb07c45, { ei: 0.12, rough: 0.8 }));
        lidM.position.z = 0.85;
        this.lid.add(lidM);
        this.lid.position.set(0, 0.72, -0.85);
        box.add(this.lid);
        this.sealed = chip("SEALED", C.danger, 0.6, { ts: 24, bg: "rgba(60,10,14,.9)" });
        this.sealed.position.set(0, 0, 0.95);
        box.add(this.sealed);
        gl(6, box, 1.2);
      }
      // the track
      const track = mesh(new THREE.BoxGeometry(62, 0.14, 1.2), std(0x0b1630, { ei: 0.05 }));
      track.position.set(0, 0.2, 3.1);
      g.add(track);
      for (const dz of [-0.55, 0.55]) {
        const s = mesh(new THREE.BoxGeometry(62, 0.05, 0.06), basic(0x4aa3ff, 0.9, { add: true }));
        s.position.set(0, 0.3, 3.1 + dz);
        g.add(s);
      }
      // folder tree behind the NAS
      const fx = S0[4].x;
      this.tree = ["Bulacan", "2021–2025", "2024", "project folder"].map((t, k) => {
        const l = chip(t, C.nas, 0.62, { ts: 21 });
        l.position.set(fx - 3.2 + k * 2.15, 1.0 + k * 0.85, -3.4);
        g.add(l);
        return l;
      });
      // live notice
      this.bell = chip("Live notice · Socket.IO", C.portal, 0.7, { ts: 21 });
      this.bell.position.set(S0[3].x, 8.4, -0.5);
      g.add(this.bell);
      // documents
      this.docs = Array.from({ length: 10 }, (_, k) => {
        const d = mesh(new THREE.PlaneGeometry(1.15, 1.5), new THREE.MeshBasicMaterial({ map: pageTex([C.erms, 0xd46b08, 0x08979c][k % 3]), transparent: true, side: THREE.DoubleSide }));
        d.renderOrder = 4;
        g.add(d);
        const n = glow(C.portal, 1.1, 0.9);
        g.add(n);
        return { d, n, t0: 0.6 + k * 2.3 };
      });
      g.add(place(floorGrid(40, 0x1b3765, 0.2), 0, -0.05, 0));
    },
    update(lt) {
      const SEG = 2.0, xs = this.st.map((s) => s.x);
      const pulse = new Array(7).fill(0);
      let passed1 = 0, passed5 = 0, atBox = 0;
      for (const doc of this.docs) {
        const u = (lt - doc.t0) / SEG;
        if (u < 0 || u > 6.9) {
          doc.d.userData.fade = 0;
          doc.n.userData.fade = 0;
          if (u >= 1) passed1++;
          if (u >= 5) passed5++;
          continue;
        }
        const s = Math.floor(u), f = u - s;
        const mv = s >= 6 ? 0 : ease(clamp((f - 0.38) / 0.62));
        const x = s >= 6 ? xs[6] : lerp(xs[s], xs[s + 1], mv);
        let y = 1.45 + Math.sin(mv * Math.PI) * 0.9, z = 3.1, fade = span(u, 0, 0.2);
        if (s >= 6) {
          y = lerp(1.45, 2.4, ease(clamp(f / 0.35))) - ease(clamp((f - 0.35) / 0.4)) * 1.6;
          z = lerp(3.1, 1.2, ease(clamp(f / 0.4)));
          fade *= 1 - span(f, 0.6, 0.9);
          atBox = Math.max(atBox, win(f, 0, 0.95, 0.2, 0.25));
        }
        doc.d.position.set(x, y, z);
        doc.d.rotation.set(0, Math.sin(lt * 1.3 + doc.t0) * 0.25, Math.sin(lt * 2 + doc.t0) * 0.05);
        doc.d.userData.fade = fade;
        // a notice leaves the database station
        const nu = u - 3;
        doc.n.position.set(xs[3], lerp(3.2, 8.1, clamp(nu / 0.9)), -0.3);
        doc.n.userData.fade = nu > 0 && nu < 0.9 ? Math.sin((nu / 0.9) * Math.PI) : 0;
        if (s < 6) pulse[s] = Math.max(pulse[s], 1 - clamp(f / 0.38));
        if (u >= 1) passed1++;
        if (u >= 5) passed5++;
      }
      this.st.forEach((s, i) => {
        s.halo.userData.fade = 1 + pulse[i] * 2.2;
        s.ringM.scale.setScalar(1 + pulse[i] * 0.12);
        if (s.glyph) s.glyph.rotation.y = i === 1 ? 0 : Math.sin(lt * 0.6 + i) * 0.35;
        s.sg.userData.fade = span(lt, i * 0.3, i * 0.3 + 0.9);
      });
      this.fsn.userData.set("FSN-" + String(18068 + passed1).padStart(7, "0"));
      this.check.userData.fade = 0.25 + pulse[2] * 0.75;
      this.check.scale.setScalar(0.9 * (1 + pulse[2] * 0.4));
      this.links.forEach((m, k) => (m.emissiveIntensity = k < passed5 ? 0.9 : 0.12));
      this.lid.rotation.x = -atBox * 1.6;
      this.sealed.userData.fade = span(lt, 23.2, 23.8);
      this.tree.forEach((l, k) => (l.userData.fade = span(lt, 14.2 + k * 0.55, 14.8 + k * 0.55)));
      this.bell.userData.fade = span(lt, 11.5, 12.3);
    },
    cam(lt) {
      const xk = [[0, -26], [5, -15], [10.5, -2], [15, 8], [20, 18], [22.4, 23]];
      let x = xk[xk.length - 1][1];
      for (let i = 0; i < xk.length - 1; i++) {
        if (lt <= xk[i + 1][0]) {
          x = lerp(xk[i][1], xk[i + 1][1], smooth(span(lt, xk[i][0], xk[i + 1][0])));
          break;
        }
      }
      if (lt < 0) x = xk[0][1];
      const follow = { p: V(x - 3.5, 7.6, 22.5), l: V(x + 2.5, 2.4, 0) };
      const k = ease(span(lt, 21.5, 26));
      return { p: follow.p.lerp(V(4, 17, 46), k), l: follow.l.lerp(V(0, 1.5, 0), k) };
    },
  });
  function smooth(k) {
    return lerp(k, k * k * (3 - 2 * k), 0.5);
  }

  // =====================================================================
  // 5 · Document Portal
  // =====================================================================
  const portal = defineScene({
    key: "portal", name: "Document Portal", start: 104, end: 126, center: V(400, 0, 70), accent: "#13c2c2",
    kicker: "Public · no account needed", title: "The Document Portal",
    captions: [
      [0, "Anyone can ask for a scanned office document — find it, say who they are, and agree to the terms. No account is needed."],
      [5.5, "Employees see Data Privacy (RA 10173). Everyone else sees Freedom of Information (EO No. 2, s. 2016) first. Each step is scrolled and ticked."],
      [10.5, "The room holds 50 at a time. A full room gives a waiting line with an estimate, and people are seated automatically."],
      [15.5, "The unit that keeps the document decides. Only approved pages are sent — the PDF is rebuilt without the rest, its metadata stripped."],
      [19.5, "Access ends at the approved time, or 24 hours after first opening — whichever comes first."],
    ],
    features: {
      title: "Request flow",
      items: [
        [1, "<b>1 · Find</b> — by docket, permit, title or company"],
        [3.2, "<b>2 · Say who you are</b> — employee, agency, student, citizen"],
        [5.5, "<b>3 · Agree</b> — FOI and Data Privacy terms"],
        [10.5, "<b>4 · Wait in the room</b> — 50 seats, live line"],
        [15.5, "<b>5 · Read it here</b> — view-only, approved pages"],
        [19, "<b>Messages</b> erased after 12 idle hours"],
      ],
    },
    build() {
      const g = this.group;
      const steps = [
        ["Find the document", "ECC · CNC · PTO · Legal · Lab"],
        ["Say who you are", "name · designation · purpose"],
        ["Agree to the terms", "FOI EO 2 s.2016 · RA 10173"],
        ["Wait in the room", "50 seats · waiting line"],
        ["Read it here", "approved pages · view-only"],
      ];
      this.stepAt = [1, 3.2, 5.5, 10.5, 15.5];
      this.steps = steps.map(([title, sub], i) => {
        const c = card({ title, sub, color: C.portal, badge: String(i + 1), ts: 27, ss: 18 }, 1.45);
        c.position.set(-17 + i * 8.5, 9.8 - Math.abs(i - 2) * 0.5, -13 + Math.abs(i - 2) * 1.2);
        c.userData.s0 = c.scale.clone();
        g.add(c);
        const halo = glow(C.portal, 9, 0.3);
        halo.position.copy(c.position).add(V(0, 0, -0.4));
        g.add(halo);
        return { c, halo };
      });
      // the room — five tiers of ten seats
      this.seats = [];
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 10; k++) {
          const th = (-70 + (k / 9) * 140) * (Math.PI / 180);
          const R = 6.4 + r * 1.3;
          const seat = new THREE.Group();
          seat.position.set(Math.sin(th) * R, 0.2 + r * 0.5, -Math.cos(th) * R - 1);
          seat.rotation.y = -th;
          const mat = std(0x1a2a44, { ei: 0.1 });
          seat.add(mesh(new THREE.BoxGeometry(0.8, 0.36, 0.8), mat));
          const person = mesh(new THREE.SphereGeometry(0.2, 14, 10), basic(0xffffff, 0.95));
          person.position.y = 0.48;
          seat.add(person);
          g.add(seat);
          const i = this.seats.length;
          const occ = 1.0 + hash(i + 3) * 8.6;
          this.seats.push({ seat, mat, person, occ, dec: occ + 3 + hash(i + 77) * 6.5, ok: hash(i + 131) < 0.74 });
        }
      }
      const stage = mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.4, 64), std(0x0c1f33, { ei: 0.08 }));
      stage.position.set(0, 0, 1);
      g.add(stage);
      const stRing = mesh(new THREE.TorusGeometry(4.3, 0.06, 8, 120), basic(C.portal, 0.9, { add: true }));
      stRing.rotation.x = Math.PI / 2;
      stRing.position.set(0, 0.22, 1);
      g.add(stRing);
      this.counter = liveChip(620, 150, 1.05, (g2, v, w, h) => {
        rr(g2, 4, 4, w - 8, h - 8, 26);
        g2.fillStyle = "rgba(6,22,30,.92)";
        g2.fill();
        g2.lineWidth = 4;
        g2.strokeStyle = hex(C.portal);
        g2.stroke();
        g2.fillStyle = "#7ee8e8";
        g2.font = `600 28px ${FONT}`;
        g2.fillText("THE ROOM", 34, 46);
        g2.fillStyle = "#fff";
        g2.font = `700 54px ${FONT}`;
        g2.fillText(`${v[0]} / 50 seated`, 34, 112);
        if (v[1]) {
          g2.fillStyle = "#ffd666";
          g2.font = `600 30px ${FONT}`;
          g2.fillText(`+${v[1]} waiting`, 430, 112);
        }
      });
      this.counter.position.set(0, 2.1, 1);
      g.add(this.counter);
      this.line = Array.from({ length: 7 }, (_, j) => {
        const d = new THREE.Group();
        d.add(mesh(new THREE.SphereGeometry(0.24, 14, 10), basic(0xffd666, 1)));
        d.add(glow(0xffd666, 1.5, 0.6));
        d.position.set(7 + j * 0.85, 2.4, -13.5 - j * 0.15);
        g.add(d);
        return d;
      });
      this.lineLabel = chip("Waiting line · estimate shown", 0xffd666, 0.65, { ts: 21 });
      this.lineLabel.position.set(9.6, 3.7, -13.8);
      g.add(this.lineLabel);

      // the reader
      this.reader = new THREE.Group();
      this.reader.position.set(0, 5.2, 7.5);
      const frame = mesh(new THREE.PlaneGeometry(9.6, 5.2), basic(0x07131c, 0.94));
      this.reader.add(frame);
      this.reader.add(edges(new THREE.PlaneGeometry(9.6, 5.2), C.portal, 0.9));
      const rl = chip("View-only reader · approved pages only", C.portal, 0.62, { ts: 21 });
      rl.position.set(0, 3.05, 0.02);
      this.reader.add(rl);
      this.timer = liveChip(520, 96, 0.5, (g2, v, w, h) => {
        rr(g2, 3, 3, w - 6, h - 6, 20);
        g2.fillStyle = "rgba(6,22,30,.92)";
        g2.fill();
        g2.fillStyle = "#9feaea";
        g2.font = `600 40px ${FONT}`;
        g2.fillText("Access ends in " + v, 26, 62);
      });
      this.timer.position.set(2.9, -3.0, 0.02);
      this.reader.add(this.timer);
      g.add(this.reader);
      const pages = [
        [1, true], [2, true], [3, false], [4, true], [5, true], [6, false],
      ];
      let slot = 0;
      this.pages = pages.map(([n, ok], i) => {
        const p = mesh(new THREE.PlaneGeometry(1.6, 2.1), new THREE.MeshBasicMaterial({ map: pageTex(ok ? C.portal : C.danger, "p." + n, !ok), transparent: true, side: THREE.DoubleSide }));
        p.renderOrder = 6;
        g.add(p);
        return { p, ok, from: V(-11.5 + i * 0.12, 3.2 + i * 0.1, 4 - i * 0.06), to: ok ? V(-3.3 + slot++ * 2.2, 5.4, 7.6) : V(-11.5 + i * 0.12, 3.2 + i * 0.1, 4 - i * 0.06), i };
      });
      const src = card({ title: "Original scan", sub: "6 pages on the NAS", color: C.nas, ts: 22, ss: 16 }, 0.95);
      src.position.set(-11.2, 5.0, 4);
      g.add(src);
      this.src = src;
      g.add(place(floorGrid(26, 0x14415a, 0.22), 0, -0.15, 0));
    },
    update(lt) {
      let seated = 0;
      this.seats.forEach((s) => {
        const occupied = lt >= s.occ;
        const decided = lt >= s.dec;
        const col = !occupied ? 0x1a2a44 : !decided ? C.portal : s.ok ? C.ok : 0x8c3b3f;
        s.mat.color.set(col);
        s.mat.emissive.set(col);
        s.mat.emissiveIntensity = occupied ? 0.55 + (decided && s.ok ? 0.25 * Math.sin(lt * 3 + s.occ) : 0) : 0.08;
        s.person.userData.fade = occupied ? span(lt, s.occ, s.occ + 0.4) : 0;
        if (occupied) seated++;
      });
      const waiting = lt < 9.4 ? 0 : clamp(Math.floor((lt - 9.4) * 1.3), 0, 6) - clamp(Math.floor((lt - 15) * 0.9), 0, 5);
      this.counter.userData.set([seated, Math.max(0, waiting)]);
      this.line.forEach((d, j) => {
        d.userData.fade = (j < waiting ? 1 : 0) * (1 - span(lt, 14.6, 15.4));
        d.position.y = 2.4 + Math.abs(Math.sin(lt * 3 + j)) * 0.12;
      });
      this.lineLabel.userData.fade = (waiting > 0 ? 1 : 0) * (1 - span(lt, 14.6, 15.4));
      this.steps.forEach(({ c, halo }, i) => {
        const on = span(lt, this.stepAt[i], this.stepAt[i] + 0.6);
        const next = this.stepAt[i + 1] ?? 99;
        const active = lt >= this.stepAt[i] && lt < next ? 1 : 0;
        c.userData.fade = on * (0.55 + 0.45 * active) * (1 - 0.65 * span(lt, 15.2, 16.2) * (1 - active));
        c.scale.copy(c.userData.s0).multiplyScalar(1 + active * 0.12);
        halo.userData.fade = on * active;
      });
      const rd = span(lt, 15.2, 16.2);
      this.reader.userData.fade = rd;
      this.src.userData.fade = span(lt, 14.6, 15.4);
      this.pages.forEach((pg) => {
        const k = ease(span(lt, 16 + pg.i * 0.35, 17.3 + pg.i * 0.35));
        pg.p.position.copy(pg.from).lerp(pg.to, pg.ok ? k : 0);
        if (pg.ok) pg.p.position.y += Math.sin(k * Math.PI) * 1.2;
        pg.p.rotation.y = pg.ok ? (1 - k) * 0.5 : 0.35;
        pg.p.userData.fade = span(lt, 14.8, 15.6) * (pg.ok ? 1 : 1 - span(lt, 19, 21) * 0.6);
      });
      const left = Math.max(0, 24 * 3600 - Math.max(0, lt - 17) * 1);
      const hh = String(Math.floor(left / 3600)).padStart(2, "0");
      const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
      const ss = String(Math.floor(left % 60)).padStart(2, "0");
      this.timer.userData.set(`${hh}:${mm}:${ss}`);
    },
    cam(lt) {
      return keyed(
        [
          [0, [-8, 15, 25], [-3, 5.5, -7]],
          [5, [-2, 14, 23], [0, 5.5, -7]],
          [9.6, [5, 12.5, 22], [2, 4.5, -6]],
          [13.6, [10, 9.5, 19], [1, 1.6, -5]],
          [16.6, [0, 7.5, 21], [-1.5, 4.6, 4]],
          [22, [1.5, 7, 19.5], [-1, 4.8, 5]],
        ],
        lt
      );
    },
  });

  // =====================================================================
  // 6 · VERA
  // =====================================================================
  const vera = defineScene({
    key: "vera", name: "VERA", start: 126, end: 150, center: V(250, 12, 150), accent: "#14d2be", trans: 3.0,
    kicker: "The AI agent", title: "VERA, the assistant", lowerFrom: 6.2,
    big: {
      cls: "left",
      html: `<div class="kicker">Meet the AI agent of E-Universe</div>
             <h1>VERA</h1>
             <div class="sub">Virtual Environmental Response Assistant</div>
             <div class="tag">Ask VERA — on every screen, and on the Document Portal</div>`,
      op: (lt) => win(lt, 2.0, 6.2, 0.8, 0.7),
    },
    captions: [
      [6.2, "VERA is the Ask VERA button on every screen. She answers from a built-in help library, phrased by an AI model when one is switched on."],
      [10.5, "Her knowledge follows the account: Planning gets register articles, the ERMS units get document articles, administrators get configuration."],
      [15.5, "Guards run on the server before any model is reached: secrets are refused for every role, and off-topic questions are declined."],
      [20, "VERA never reads a record. Questions and answers are never stored — only who, when, which screen, and the tokens used."],
    ],
    chat: [
      { at: 2.8, who: "user", text: "Where do I file a Notice of Violation?" },
      { at: 3.9, who: "vera", text: "Open ERMS · Legal › Upload document and choose NOV. The form is laid out in tabs, and a known docket fills in its company for you." },
      { at: 9.4, who: "user", text: "How many records can I see in Records?" },
      { at: 10.4, who: "vera", text: "I quote live counts for exactly the records your account can see — the same figures your dashboard uses." },
      { at: 15.2, who: "user", text: "What is the database password?" },
      { at: 16.2, who: "vera", refuse: true, text: "I can’t share secrets, keys or environment values. That is refused on the server, for every role." },
      { at: 21.0, who: "sys", text: "Questions and answers are never stored" },
    ],
    chatWin: [2.2, 23.6],
    build() {
      const g = this.group;
      const D = BRAND.vera;
      const n = D.p.length;
      this.dots = D.p.map((d, i) => {
        const seed = ((i * 2654435761) >>> 0) / 4294967296;
        const seed2 = ((i * 40503 + 17) % 997) / 997;
        const fy = 1 - ((i + 0.5) / n) * 2, fr = Math.sqrt(1 - fy * fy), fa = i * 2.399963;
        return {
          x: d[0], y: d[1], edge: d[3], seed, seed2, z: (seed2 - 0.5) * 0.24,
          r: ((d[2] >> 16) & 255) / 255, g: ((d[2] >> 8) & 255) / 255, b: (d[2] & 255) / 255,
          sx: Math.cos(fa) * fr, sy: fy, sz: Math.sin(fa) * fr, h: clamp((1 - d[1]) / 2),
        };
      });
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
      this.dots.forEach((p, i) => col.set([p.r, p.g, p.b], i * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: DOT }, uOpacity: { value: 1 }, uScale: { value: 800 } },
        vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
          varying vec3 vColor; varying float vAlpha; uniform float uScale;
          void main(){ vColor=aColor; vAlpha=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
            gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
          void main(){ float a=texture2D(uMap,gl_PointCoord).a*vAlpha*uOpacity; if(a<0.01) discard; gl_FragColor=vec4(vColor*1.1,a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.pts = new THREE.Points(geo, mat);
      this.pts.frustumCulled = false;
      this.pts.onBeforeRender = () => (mat.uniforms.uOpacity.value = mat.opacity);
      this.veraMat = mat;
      this.flame = new THREE.Group();
      this.flame.add(this.pts);
      this.halo = glow(0x14d2be, 22, 0.32);
      this.halo.position.set(0, -0.6, -1);
      this.flame.add(this.halo);
      g.add(this.flame);
      this.geo = geo;
      this.base = D.s * 5.6 * 0.95;

      const tags = [
        "Built-in help library", "Knowledge follows the account", "Live counts for staff",
        "No access to records", "Server-side guards", "Anthropic or Gemini · optional", "Daily limits · person & office",
      ];
      this.tags = tags.map((t, i) => {
        const c = chip(t, C.vera, 0.78, { ts: 23 });
        c.userData.t0 = 6.3 + i * 0.75;
        c.userData.a = (i / tags.length) * TAU;
        c.userData.y = -1.2 + (i % 4) * 1.9;
        g.add(c);
        return c;
      });
      const ring = mesh(new THREE.TorusGeometry(8.5, 0.04, 8, 160), basic(C.vera, 0.55, { add: true }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -5.4;
      g.add(ring);
      g.add(place(floorGrid(16, 0x0f4a4a, 0.3), 0, -5.5, 0));
    },
    // ports of the app's own flame states (engine/veraFlame.js), y down, unit size
    burning(p, t, o) {
      const h = p.h;
      const lick = 0.5 + 0.5 * Math.sin(t * 4.2 - p.y * 7 + p.seed * 2.5);
      const calm = p.edge ? 0.45 : 1;
      const sway = Math.sin(t * 2.6 + p.y * 5 + p.x * 2) * 0.01 * (0.2 + h) * h;
      let x = p.x + sway + Math.sin(t * 2.6 + p.y * 5 + p.seed * 6) * 0.006 * (0.25 + h) * calm;
      let y = p.y - lick * 0.022 * h * h * calm;
      let s = p.edge ? 0.94 + 0.1 * Math.sin(t * 4 - p.y * 8) : 0.74 + 0.36 * (0.5 + 0.5 * Math.sin(t * 5 - p.y * 9 + p.seed * 4));
      let a = 1;
      if (p.edge && h > 0.5 && p.seed > 0.8) {
        const ph = (t * 0.55 + p.seed * 7.3) % 1;
        if (ph > 0.55) {
          const e = (ph - 0.55) / 0.45;
          y -= e * 0.32;
          x += Math.sin(e * 5 + p.seed * 9) * 0.04 * e;
          s *= 1 - e * 0.8;
          a = 1 - e;
        }
      }
      o[0] = x; o[1] = y; o[2] = p.z; o[3] = s; o[4] = a;
    },
    sphere(p, t, o) {
      const R = 0.66, ry = t * 0.7, rx = 0.38;
      let x = p.sx * R, y = p.sy * R, z = p.sz * R;
      const cy = Math.cos(ry), sy = Math.sin(ry);
      [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      const cx = Math.cos(rx), sx = Math.sin(rx);
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      const depth = (z / R + 1) / 2;
      const pulse = Math.sin(p.sy * 6 - t * 3);
      o[0] = x; o[1] = y + 0.12; o[2] = z; o[3] = (0.55 + depth * 0.6) * (0.85 + 0.35 * Math.max(0, pulse)); o[4] = 0.35 + depth * 0.65;
    },
    working(p, t, o) {
      if (p.seed < 0.16 && !p.edge) {
        const ring = Math.floor(p.seed / 0.0534);
        const ang = t * (1.1 + ring * 0.35) * (ring % 2 ? -1 : 1) + p.seed2 * TAU;
        const R = 0.86 + ring * 0.08;
        let x = Math.cos(ang) * R, y = 0, z = Math.sin(ang) * R;
        const tx = [1.15, 0.5, -0.9][ring] || 0, tz = [0.35, -0.6, 0.2][ring] || 0;
        [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
        [x, y] = [x * Math.cos(tz) - y * Math.sin(tz), x * Math.sin(tz) + y * Math.cos(tz)];
        const d = (z / R + 1) / 2;
        o[0] = x; o[1] = y + 0.08; o[2] = z; o[3] = 0.6 + d * 0.8; o[4] = 0.4 + d * 0.6;
        return;
      }
      this.burning(p, t, o);
    },
    update(lt) {
      const orb = Math.max(win(lt, 3.3, 5.1, 0.6, 0.7), win(lt, 9.9, 11.6, 0.6, 0.7), win(lt, 15.7, 17.3, 0.6, 0.7));
      const work = win(lt, 11.4, 15.4, 0.8, 0.8);
      const P = this.geo.attributes.position.array, Z = this.geo.attributes.aSize.array, A = this.geo.attributes.aAlpha.array;
      const a = [0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0];
      const W = 5.6;
      const born = easeOut(span(lt, 0, 1.6));
      this.dots.forEach((p, i) => {
        this.burning(p, lt, a);
        if (work > 0) {
          this.working(p, lt, c);
          for (let j = 0; j < 5; j++) a[j] = lerp(a[j], c[j], ease(clamp(work * 1.4 - p.seed * 0.4)));
        }
        if (orb > 0) {
          this.sphere(p, lt, b);
          const k = ease(clamp(orb * 1.5 - p.seed * 0.5));
          for (let j = 0; j < 5; j++) a[j] = lerp(a[j], b[j], k);
        }
        // the dots gather out of a scattered sphere as the chapter opens
        const sx = (p.sx * 3.2) * (1 - born), sy = (p.sy * 3.2) * (1 - born), sz = (p.sz * 3.2) * (1 - born);
        P[i * 3] = a[0] * W + sx;
        P[i * 3 + 1] = -a[1] * W + sy;
        P[i * 3 + 2] = -a[2] * W * 1.6 + sz;
        Z[i] = this.base * a[3] * 1.15;
        A[i] = clamp(a[4]) * 0.95;
      });
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.flame.rotation.y = Math.sin(lt * 0.35) * 0.45;
      this.halo.userData.fade = 0.8 + 0.25 * Math.sin(lt * 2.1) + orb * 0.6;
      this.tags.forEach((tg) => {
        const ang = tg.userData.a + lt * 0.17;
        tg.position.set(Math.cos(ang) * 9.5, tg.userData.y + Math.sin(lt * 0.8 + tg.userData.a) * 0.25, Math.sin(ang) * 4.2);
        tg.userData.fade = span(lt, tg.userData.t0, tg.userData.t0 + 0.6);
      });
    },
    cam(lt) {
      const a = -0.18 + 0.3 * ease(span(lt, 0, 24));
      const look = V(lerp(-1.5, 3.4, ease(span(lt, 5.2, 7.6))), 0.4, 0);
      const d = lerp(24, 21.5, span(lt, 0, 24));
      return { p: look.clone().add(V(Math.sin(a) * d, 2.2, Math.cos(a) * d)), l: look };
    },
  });

  // =====================================================================
  // 7 · Dashboard
  // =====================================================================
  const DASH_W = 1920, DASH_H = 1080;
  const dash = defineScene({
    key: "dash", name: "Dashboard", start: 150, end: 172, center: V(100, 0, 170), accent: "#2f9e44",
    kicker: "What staff see first", title: "The dashboard", note: "Dashboard figures and names shown here are illustrative",
    captions: [
      [0, "Each account lands on its own dashboard. The Central DB opens with what needs attention: expired permits, permits expiring soon, establishments not yet monitored."],
      [6, "Then the register counted, its charts, the monitoring calendar, and the permits expiring soonest — PTO, WWDP and PCO."],
      [11.8, "The ERMS units get the same shape for their records: what needs review, portal requests waiting, uploads and custody."],
      [16.8, "Everything updates live: notices reach every screen and device of the people they concern, with a bell of action items."],
    ],
    build() {
      const g = this.group;
      this.cv = mkCanvas(DASH_W, DASH_H);
      this.ctx = this.cv.getContext("2d");
      this.tex = canvasTex(this.cv);
      const screen = new THREE.Group();
      screen.position.set(0, 8.6, 0);
      const frameGeo = new THREE.BoxGeometry(33.2, 19.2, 0.6);
      const frame = mesh(frameGeo, std(0x0a1428, { ei: 0.05 }));
      frame.position.z = -0.32;
      screen.add(frame);
      screen.add(place(edges(frameGeo, 0x4a8dff, 0.8), 0, 0, -0.32));
      const face = mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
      face.position.z = 0.01;
      screen.add(face);
      const back = glow(0x2f7bff, 60, 0.22);
      back.position.z = -3;
      screen.add(back);
      g.add(screen);
      this.screen = screen;

      // 3D province bars
      const provinces = ["Aurora", "Bataan", "Bulacan", "Nueva Ecija", "Pampanga", "Tarlac", "Zambales"];
      const sched = [42, 68, 124, 98, 106, 72, 58];
      const ratio = [0.82, 0.74, 0.69, 0.77, 0.81, 0.72, 0.66];
      this.bars = new THREE.Group();
      this.bars.position.set(0, -4.6, 8);
      const plate = mesh(new THREE.BoxGeometry(27, 0.3, 4.6), std(0x0c1830, { ei: 0.05 }));
      this.bars.add(plate);
      this.bars.add(edges(new THREE.BoxGeometry(27, 0.3, 4.6), 0x3a6fd0, 0.6));
      this.barSet = provinces.map((p, i) => {
        const x = -11.4 + i * 3.8;
        const hS = sched[i] * 0.058, hM = sched[i] * ratio[i] * 0.058;
        const sm = mesh(new THREE.BoxGeometry(1.2, 1, 1.2), basic(0x6fa3ff, 0.18));
        const se = edges(new THREE.BoxGeometry(1.2, 1, 1.2), 0x6fa3ff, 0.7);
        const mm = mesh(new THREE.BoxGeometry(1.2, 1, 1.2), std(C.ucds, { ei: 0.45 }));
        sm.position.set(x + 0.7, 0, 0);
        se.position.copy(sm.position);
        mm.position.set(x - 0.7, 0, 0);
        const l = chip(p, C.ucds, 0.62, { ts: 22, bar: false });
        l.position.set(x, -0.9, 2.3);
        const v = chip(`${Math.round(sched[i] * ratio[i])} / ${sched[i]}`, 0x6fa3ff, 0.5, { ts: 20, bar: false });
        this.bars.add(sm, se, mm, l, v);
        return { sm, se, mm, v, hS, hM, i };
      });
      const bt = card({ title: "Monitored vs scheduled", sub: "by province · illustrative", color: C.ucds, ts: 24, ss: 16 }, 1.0);
      bt.position.set(0, 7.9, 0.5);
      this.bars.add(bt);
      this.barTitle = bt;
      g.add(this.bars);

      // 3D donut
      this.donut = new THREE.Group();
      this.donut.position.set(22.5, 9, 2);
      const vals = [[58, C.ucds, "Operational"], [12, C.danger, "Non-operational"], [22, C.erms, "Not yet monitored"], [8, 0x8c8c8c, "Other"]];
      const tot = vals.reduce((a, v) => a + v[0], 0);
      let acc = 0;
      this.segs = vals.map(([v, color, label]) => {
        const arc = (v / tot) * TAU;
        const seg = { arc, start: acc, color, m: null };
        acc += arc;
        return seg;
      });
      this.donutLabel = card({ title: "Project status", sub: ["Operational · Non-operational", "Not yet monitored · Other"], color: C.ucds, ts: 24, ss: 16 }, 1.4);
      this.donutLabel.position.set(0, -5.2, 0);
      this.donut.add(this.donutLabel);
      g.add(this.donut);

      this.toast = 0;
      this.imgs = { emb: textures.embImg, bp: textures.bpImg };
      this.lastFrame = -1;
    },
    update(lt) {
      // donut grows (geometry rebuilt only while growing)
      const grow = ease(span(lt, 2.5, 5));
      const gk = Math.round(grow * 40);
      if (gk !== this.lastGrow) {
        this.lastGrow = gk;
        this.segs.forEach((s) => {
          if (s.m) {
            this.donut.remove(s.m);
            s.m.geometry.dispose();
          }
          const arc = Math.max(0.001, s.arc * (gk / 40) - 0.04);
          s.m = mesh(new THREE.TorusGeometry(3, 0.95, 18, 64, arc), std(s.color, { ei: 0.45 }));
          s.m.rotation.z = s.start * (gk / 40) + Math.PI / 2;
          this.donut.add(s.m);
        });
      }
      this.donut.rotation.set(-0.35 + Math.sin(lt * 0.4) * 0.1, -0.5 + Math.sin(lt * 0.3) * 0.15, 0);
      this.donut.userData.fade = span(lt, 2.2, 3.2);
      this.barSet.forEach((b) => {
        const k = easeOut(span(lt, 6.8 + b.i * 0.18, 8.6 + b.i * 0.18));
        const hS = Math.max(0.01, b.hS * k), hM = Math.max(0.01, b.hM * k);
        b.sm.scale.y = hS;
        b.sm.position.y = 0.15 + hS / 2;
        b.se.scale.y = hS;
        b.se.position.y = b.sm.position.y;
        b.mm.scale.y = hM;
        b.mm.position.y = 0.15 + hM / 2;
        b.v.position.set(b.sm.position.x - 0.7, 0.15 + hS + 0.55, 0);
        b.v.userData.fade = span(lt, 8.4 + b.i * 0.18, 9 + b.i * 0.18);
      });
      this.bars.userData.fade = Math.max(win(lt, 7.4, 11.8, 1, 0.8), span(lt, 18.2, 19.6));
      // redraw the screen at ~30 fps
      const fk = Math.floor(lt * 30);
      if (fk !== this.lastFrame) {
        this.lastFrame = fk;
        drawDashboard(this.ctx, lt, this.imgs);
        this.tex.needsUpdate = true;
      }
      this.screen.rotation.y = Math.sin(lt * 0.25) * 0.04;
    },
    cam(lt) {
      return keyed(
        [
          [0, [-17, 13, 42], [0, 7.5, 0]],
          [3.6, [-4, 9.4, 28.5], [-0.5, 8.2, 0]],
          [6.4, [1.5, 8.8, 29.5], [0.5, 7.6, 0]],
          [9.6, [7, 3.8, 31], [0, 1.4, 5]],
          [12, [1, 9.2, 30], [0, 8.2, 0]],
          [16.6, [-1.5, 9.6, 29.5], [0, 8.4, 0]],
          [22, [15, 13, 43], [4, 3.2, 2]],
        ],
        lt
      );
    },
  });

  /** The dashboard screen, drawn in the app's own shape (Universe Central DB, then ERMS · Records). */
  function drawDashboard(g, lt, imgs) {
    const mode = span(lt, 11.4, 12.4);
    g.save();
    g.globalAlpha = 1;
    if (mode < 1) drawDash(g, lt, imgs, "ucds", 1);
    if (mode > 0) {
      g.globalAlpha = mode;
      drawDash(g, (lt - 11.9) * 1.6 + 0.4, imgs, "erms", mode);
    }
    g.restore();
  }

  function drawDash(g, lt, imgs, kind, alpha) {
    const ucds = kind === "ucds";
    const accent = ucds ? "#2f9e44" : "#1677ff";
    const W = DASH_W, H = DASH_H, SB = 300;
    const count = (v, t0) => fmt(v * easeOut(span(lt, t0, t0 + 1.6)));
    g.save();
    g.globalAlpha = alpha;
    // page
    g.fillStyle = "#f3f6fb";
    g.fillRect(0, 0, W, H);
    // sidebar
    const sg = g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, "#10224a");
    sg.addColorStop(1, "#0a1630");
    g.fillStyle = sg;
    g.fillRect(0, 0, SB, H);
    if (imgs.emb) g.drawImage(imgs.emb, 22, 20, 50, 50);
    if (imgs.bp) g.drawImage(imgs.bp, 80, 21, 47, 49);
    g.fillStyle = "#fff";
    g.font = `700 25px ${FONT}`;
    g.fillText("E-Universe", 140, 44);
    g.fillStyle = "#8ea3c7";
    g.font = `400 14px ${FONT}`;
    g.fillText("EMB Region III", 140, 66);
    rr(g, 22, 92, SB - 44, 40, 10);
    g.fillStyle = "rgba(255,255,255,.08)";
    g.fill();
    g.fillStyle = "#dfe8f7";
    g.font = `600 16px ${FONT}`;
    g.fillText("2026 Data", 40, 118);
    g.fillStyle = "#8ea3c7";
    g.fillText("▾", SB - 50, 118);
    const menu = [
      ["UNIVERSE CENTRAL DB", ["Dashboard", "Register", "Reports", "Healthcare Industries", "Manila Bay Pipeline"], "#2f9e44"],
      ["ERMS · RECORDS", ["Dashboard", "Upload document", "Document Library", "Portal Requests"], "#1677ff"],
      ["ERMS · LEGAL", null],
      ["ERMS · LABORATORY", null],
      ["ADMIN SETTINGS", ["User Accounts", "Organizational Units", "Storage", "VERA Assistant"], "#8c9bb5"],
    ];
    let y = 170;
    menu.forEach(([cap, items, col], gi) => {
      g.fillStyle = "#6f86ad";
      g.font = `600 12.5px ${FONT}`;
      g.fillText(cap, 30, y);
      if (!items) g.fillText("›", SB - 40, y);
      y += 14;
      (items || []).forEach((it) => {
        const active = it === "Dashboard" && ((ucds && gi === 0) || (!ucds && gi === 1));
        if (active) {
          rr(g, 14, y, SB - 28, 38, 9);
          g.fillStyle = rgba(accent, 0.28);
          g.fill();
          g.fillStyle = accent;
          g.fillRect(14, y + 7, 4, 24);
        }
        g.fillStyle = active ? "#fff" : "#c3d0e6";
        g.font = `${active ? 600 : 400} 16px ${FONT}`;
        g.beginPath();
        g.arc(40, y + 19, 4, 0, TAU);
        g.fillStyle = active ? accent : "rgba(195,208,230,.5)";
        g.fill();
        g.fillStyle = active ? "#fff" : "#c3d0e6";
        g.fillText(it, 56, y + 25);
        y += 40;
      });
      y += 22;
    });
    // header
    g.fillStyle = "#ffffff";
    g.fillRect(SB, 0, W - SB, 72);
    g.fillStyle = "#e3e9f3";
    g.fillRect(SB, 72, W - SB, 1);
    g.fillStyle = "#6b7a93";
    g.font = `400 16px ${FONT}`;
    g.fillText(ucds ? "Universe Central DB  /  Dashboard" : "ERMS · Records  /  Dashboard", SB + 32, 43);
    rr(g, W - 640, 18, 300, 38, 19);
    g.fillStyle = "#f1f4f9";
    g.fill();
    g.fillStyle = "#9aa7bd";
    g.fillText(ucds ? "Search establishments…" : "Search FSN, permit, proponent…", W - 618, 43);
    // bell
    g.strokeStyle = "#4b5a75";
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(W - 296, 36, 10, Math.PI, 0);
    g.lineTo(W - 286, 46);
    g.lineTo(W - 306, 46);
    g.closePath();
    g.stroke();
    const badgeN = ucds ? 3 : 5 + (lt > 5 ? 1 : 0);
    g.fillStyle = "#ff4d4f";
    g.beginPath();
    g.arc(W - 284, 24, 10, 0, TAU);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `700 12px ${FONT}`;
    g.textAlign = "center";
    g.fillText(String(badgeN), W - 284, 28);
    g.textAlign = "left";
    g.beginPath();
    g.arc(W - 236, 36, 19, 0, TAU);
    g.fillStyle = accent;
    g.fill();
    g.fillStyle = "#fff";
    g.font = `700 14px ${FONT}`;
    g.textAlign = "center";
    g.fillText(ucds ? "PU" : "RU", W - 236, 41);
    g.textAlign = "left";
    g.fillStyle = "#1d2b45";
    g.font = `600 16px ${FONT}`;
    g.fillText(ucds ? "Planning Unit" : "Records Unit", W - 206, 42);

    const X0 = SB + 32, CW = W - SB - 64;
    // title row
    g.fillStyle = accent;
    rr(g, X0, 100, 6, 36, 3);
    g.fill();
    g.fillStyle = "#10213f";
    g.font = `700 32px ${FONT}`;
    g.fillText(ucds ? "Universe Central DB" : "ERMS · Records", X0 + 20, 130);
    const btn = (x, w, text, filled) => {
      rr(g, x, 98, w, 40, 8);
      g.fillStyle = filled ? accent : "#fff";
      g.fill();
      g.strokeStyle = filled ? accent : "#cfd8e6";
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = filled ? "#fff" : "#1d2b45";
      g.font = `600 15px ${FONT}`;
      g.fillText(text, x + 18, 123);
    };
    if (ucds) {
      btn(X0 + CW - 430, 120, "Reports", false);
      btn(X0 + CW - 296, 296, "Export Monitoring Plan", false);
    } else {
      btn(X0 + CW - 380, 170, "Document Library", false);
      btn(X0 + CW - 196, 196, "+ Upload record", true);
    }

    // attention tiles
    const att = ucds
      ? [["Establishments with an expired permit", 214, "#ff4d4f", "PTO, WWDP or PCO"], ["Permits expired or expiring soon", 96, "#faad14", "establishments"], ["Not yet monitored", 352, "#1677ff", "no project status"]]
      : [["Records that need review", 37, "#faad14", "missing details or duplicates"], ["Portal requests waiting", 5 + (lt > 5 ? 1 : 0), "#13c2c2", "decide for your unit"], ["Documents without a scan", 128, "#ff4d4f", "file the scan when you have it"]];
    const aw = (CW - 40) / 3;
    att.forEach(([label, v, col, hint], i) => {
      const x = X0 + i * (aw + 20), yy = 160;
      const pop = easeOut(span(lt, 0.4 + i * 0.25, 1.2 + i * 0.25));
      g.save();
      g.globalAlpha *= pop;
      g.translate(0, (1 - pop) * 16);
      rr(g, x, yy, aw, 118, 12);
      g.fillStyle = "#fff";
      g.fill();
      g.strokeStyle = rgba(col, 0.35);
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = col;
      rr(g, x, yy, 6, 118, 3);
      g.fill();
      g.beginPath();
      g.arc(x + 46, yy + 59, 24, 0, TAU);
      g.fillStyle = rgba(col, 0.14);
      g.fill();
      g.fillStyle = col;
      g.font = `800 24px ${FONT}`;
      g.textAlign = "center";
      g.fillText("!", x + 46, yy + 68);
      g.textAlign = "left";
      g.fillStyle = "#5b6b85";
      g.font = `500 16px ${FONT}`;
      g.fillText(label, x + 86, yy + 38);
      g.fillStyle = col;
      g.font = `750 42px ${FONT}`;
      g.fillText(count(v, 0.6 + i * 0.25), x + 86, yy + 86);
      g.fillStyle = "#9aa7bd";
      g.font = `400 14px ${FONT}`;
      g.fillText(hint, x + 86, yy + 106);
      g.restore();
    });

    // stat tiles
    const stats = ucds
      ? [["Establishments", 3482], ["With ECC / CNC", 2915], ["With Permit to Operate", 1876], ["Monitored this year", 1204]]
      : [["Records on file", 18067], ["Filed this month", 412], ["Archive boxes", 1136], ["Linked to the register", 15903]];
    const sw = (CW - 60) / 4;
    stats.forEach(([label, v], i) => {
      const x = X0 + i * (sw + 20), yy = 298;
      const pop = easeOut(span(lt, 1.6 + i * 0.18, 2.3 + i * 0.18));
      g.save();
      g.globalAlpha *= pop;
      rr(g, x, yy, sw, 108, 12);
      g.fillStyle = "#fff";
      g.fill();
      g.strokeStyle = "#e3e9f3";
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = "#6b7a93";
      g.font = `500 15px ${FONT}`;
      g.fillText(label, x + 22, yy + 32);
      g.fillStyle = "#10213f";
      g.font = `750 36px ${FONT}`;
      g.fillText(count(v, 1.8 + i * 0.18), x + 22, yy + 80);
      // sparkline
      g.strokeStyle = accent;
      g.lineWidth = 2.5;
      g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const px = x + sw - 150 + k * 11, py = yy + 78 - (Math.sin(k * 0.9 + i) * 0.5 + 0.5 + k * 0.06) * 30 * pop;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
      g.restore();
    });

    // chart cards
    const cy = 426, ch = 352;
    const cardBox = (x, w, title, sub) => {
      rr(g, x, cy, w, ch, 12);
      g.fillStyle = "#fff";
      g.fill();
      g.strokeStyle = "#e3e9f3";
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = "#10213f";
      g.font = `650 18px ${FONT}`;
      g.fillText(title, x + 22, cy + 36);
      g.fillStyle = "#9aa7bd";
      g.font = `400 13px ${FONT}`;
      g.fillText(sub, x + 22, cy + 56);
      g.fillStyle = accent;
      g.font = `600 13px ${FONT}`;
      g.fillText("See more ›", x + w - 96, cy + 36);
    };
    const w1 = 440, w2 = 520, w3 = CW - w1 - w2 - 40;
    // donut
    const dvals = ucds
      ? [[58, "#2f9e44", "Operational"], [12, "#ff4d4f", "Non-operational"], [22, "#1677ff", "Not yet monitored"], [8, "#9aa7bd", "Other"]]
      : [[41, "#2f9e44", "ECC / CNC"], [27, "#1677ff", "PTO"], [14, "#13c2c2", "Discharge permit"], [10, "#faad14", "Hazardous waste"], [8, "#9aa7bd", "Other"]];
    cardBox(X0, w1, ucds ? "Project status" : "Records by kind", ucds ? "establishments in the register" : "Records Unit documents");
    {
      const cx = X0 + 130, cyy = cy + 205, R = 92, th = 32;
      const tot = dvals.reduce((a, v) => a + v[0], 0);
      const sweep = easeOut(span(lt, 2.4, 4.2));
      let a0 = -Math.PI / 2;
      dvals.forEach(([v, col]) => {
        const a1 = a0 + (v / tot) * TAU * sweep;
        g.beginPath();
        g.arc(cx, cyy, R, a0, a1);
        g.strokeStyle = col;
        g.lineWidth = th;
        g.stroke();
        a0 = a1 + 0.0;
      });
      g.fillStyle = "#10213f";
      g.font = `750 30px ${FONT}`;
      g.textAlign = "center";
      g.fillText(ucds ? count(3482, 2.4) : count(18067, 2.4), cx, cyy + 6);
      g.fillStyle = "#9aa7bd";
      g.font = `400 13px ${FONT}`;
      g.fillText(ucds ? "establishments" : "records", cx, cyy + 28);
      g.textAlign = "left";
      dvals.forEach(([v, col, label], i) => {
        const ly = cy + 128 + i * 36;
        g.fillStyle = col;
        rr(g, X0 + 260, ly - 11, 14, 14, 3);
        g.fill();
        g.fillStyle = "#33415c";
        g.font = `500 14px ${FONT}`;
        g.fillText(label, X0 + 282, ly + 1);
        g.fillStyle = "#9aa7bd";
        g.fillText(`${v}%`, X0 + 282, ly + 19);
      });
    }
    // bars
    const bx = X0 + w1 + 20;
    const bvals = ucds
      ? [["ECC / CNC", 2915], ["Permit to Operate", 1876], ["Wastewater Discharge", 1043], ["Hazardous Waste Gen.", 688], ["PCO accreditation", 1490]]
      : [["Aurora", 812], ["Bataan", 2104], ["Bulacan", 4630], ["Nueva Ecija", 2987], ["Pampanga", 3911], ["Tarlac", 1956], ["Zambales", 1667]];
    cardBox(bx, w2, ucds ? "Permits on file" : "Records by province", ucds ? "establishments holding each permit" : "your provinces only");
    {
      const max = Math.max(...bvals.map((b) => b[1]));
      const rows = bvals.length, rh = Math.min(48, 260 / rows);
      bvals.forEach(([label, v], i) => {
        const ry = cy + 92 + i * rh;
        const k = easeOut(span(lt, 3 + i * 0.12, 4.6 + i * 0.12));
        g.fillStyle = "#33415c";
        g.font = `500 14px ${FONT}`;
        g.fillText(label, bx + 22, ry + 14);
        rr(g, bx + 190, ry + 2, w2 - 290, 16, 8);
        g.fillStyle = "#eef2f8";
        g.fill();
        rr(g, bx + 190, ry + 2, Math.max(16, (w2 - 290) * (v / max) * k), 16, 8);
        g.fillStyle = accent;
        g.fill();
        g.fillStyle = "#5b6b85";
        g.font = `600 14px ${FONT}`;
        g.fillText(fmt(v * k), bx + w2 - 88, ry + 15);
      });
    }
    // calendar / portal requests
    const kx = bx + w2 + 20;
    if (ucds) {
      cardBox(kx, w3, "Monitoring calendar", "October 2026 · scheduled visits");
      const cols = 7, cw = (w3 - 44) / cols, rh = 46;
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      g.font = `600 12px ${FONT}`;
      days.forEach((d, i) => {
        g.fillStyle = "#9aa7bd";
        g.fillText(d, kx + 22 + i * cw + 6, cy + 86);
      });
      // Oct 1 2026 is a Thursday
      for (let d = 1; d <= 31; d++) {
        const idx = d + 3, r = Math.floor(idx / 7), c = idx % 7;
        const x = kx + 22 + c * cw, yy = cy + 96 + r * rh;
        const today = d === 18;
        if (today) {
          rr(g, x + 2, yy, cw - 6, rh - 6, 8);
          g.fillStyle = rgba(accent, 0.15);
          g.fill();
        }
        g.fillStyle = today ? accent : "#33415c";
        g.font = `${today ? 700 : 500} 14px ${FONT}`;
        g.fillText(String(d), x + 8, yy + 20);
        const nEv = hash(d * 7) < 0.55 ? 1 + Math.floor(hash(d * 3) * 3) : 0;
        const show = span(lt, 4 + d * 0.04, 4.4 + d * 0.04);
        for (let e = 0; e < nEv; e++) {
          g.beginPath();
          g.arc(x + 12 + e * 12, yy + 32, 4, 0, TAU);
          g.fillStyle = rgba(["#2f9e44", "#1677ff", "#faad14"][e], show);
          g.fill();
        }
      }
    } else {
      cardBox(kx, w3, "Portal requests", "decided by the unit that keeps the document");
      const reqs = [["ECC R03-2410-0182", "Waiting", "#13c2c2"], ["PTO 24-PTO-C-0349", "Approved · 3 days", "#52c41a"], ["CNC R03-2509-1177", "Approved · pages 1–4", "#52c41a"], ["ECC R03-2307-0451", "Ended · time up", "#9aa7bd"], ["DP 2025-DP-0218", "Waiting", "#13c2c2"]];
      reqs.forEach(([ref, st, col], i) => {
        const ry = cy + 84 + i * 52;
        const k = span(lt, 2.6 + i * 0.2, 3.2 + i * 0.2);
        g.save();
        g.globalAlpha *= k;
        g.fillStyle = "#10213f";
        g.font = `600 15px ${FONT}`;
        g.fillText(ref, kx + 22, ry + 20);
        rr(g, kx + w3 - 210, ry + 2, 188, 28, 14);
        g.fillStyle = rgba(col, 0.14);
        g.fill();
        g.fillStyle = col;
        g.font = `600 13px ${FONT}`;
        g.fillText(st, kx + w3 - 196, ry + 21);
        g.fillStyle = "#eef2f8";
        g.fillRect(kx + 22, ry + 40, w3 - 44, 1);
        g.restore();
      });
    }

    // table
    const ty = cy + ch + 20, th2 = H - ty - 24;
    rr(g, X0, ty, CW, th2, 12);
    g.fillStyle = "#fff";
    g.fill();
    g.strokeStyle = "#e3e9f3";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "#10213f";
    g.font = `650 18px ${FONT}`;
    g.fillText(ucds ? "Permits expiring soonest" : "Recent uploads", X0 + 22, ty + 34);
    const head = ucds ? ["Establishment", "Province", "Permit", "Expires", "Days left"] : ["FSN", "Kind", "Proponent", "Province", "Filed"];
    const colX = [0, 520, 760, 960, 1200].map((c) => X0 + 22 + c);
    g.fillStyle = "#9aa7bd";
    g.font = `600 13px ${FONT}`;
    head.forEach((h, i) => g.fillText(h.toUpperCase(), colX[i], ty + 64));
    const rowsT = ucds
      ? [["Sample Industrial Corp.", "Bulacan", "PTO", "Oct 24, 2026", 6], ["Sample Poultry Farm", "Tarlac", "WWDP", "Oct 31, 2026", 13], ["Sample Food Processing", "Pampanga", "PCO", "Nov 8, 2026", 21]]
      : [["FSN-0018068", "ECC", "Sample Builders Inc.", "Bulacan", "today, 9:14"], ["FSN-0018067", "PTO", "Sample Agro Corp.", "Nueva Ecija", "today, 8:52"], ["FSN-0018066", "CNC", "Sample Resort", "Zambales", "yesterday"]];
    rowsT.forEach((r, i) => {
      const ry = ty + 96 + i * 34;
      const k = span(lt, 5 + i * 0.2, 5.6 + i * 0.2);
      g.save();
      g.globalAlpha *= k;
      r.forEach((cell, j) => {
        if (ucds && j === 4) {
          const col = cell < 10 ? "#ff4d4f" : cell < 20 ? "#faad14" : "#1677ff";
          rr(g, colX[j], ry - 18, 92, 26, 13);
          g.fillStyle = rgba(col, 0.14);
          g.fill();
          g.fillStyle = col;
          g.font = `700 13px ${FONT}`;
          g.fillText(`${cell} days`, colX[j] + 16, ry);
        } else if (j === (ucds ? 2 : 1)) {
          rr(g, colX[j], ry - 18, 62, 26, 6);
          g.fillStyle = rgba(accent, 0.12);
          g.fill();
          g.fillStyle = accent;
          g.font = `700 13px ${FONT}`;
          g.fillText(cell, colX[j] + 12, ry);
        } else {
          g.fillStyle = j === 0 ? "#10213f" : "#5b6b85";
          g.font = `${j === 0 ? 600 : 400} 15px ${FONT}`;
          g.fillText(String(cell), colX[j], ry);
        }
      });
      g.restore();
    });

    // live notice toast (ERMS)
    if (!ucds) {
      const tk = win(lt, 5.2, 9.8, 0.5, 0.6);
      if (tk > 0) {
        const tx = W - 460 + (1 - easeOut(tk)) * 120, ty2 = 92;
        g.save();
        g.globalAlpha *= tk;
        g.shadowColor = "rgba(16,33,63,.18)";
        g.shadowBlur = 24;
        rr(g, tx, ty2, 430, 84, 12);
        g.fillStyle = "#fff";
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#13c2c2";
        rr(g, tx, ty2, 6, 84, 3);
        g.fill();
        g.fillStyle = "#10213f";
        g.font = `650 16px ${FONT}`;
        g.fillText("New portal request", tx + 24, ty2 + 32);
        g.fillStyle = "#5b6b85";
        g.font = `400 14px ${FONT}`;
        g.fillText("ECC R03-2410-0182 · a request for your unit", tx + 24, ty2 + 58);
        g.restore();
      }
    }
    // Ask VERA
    {
      const x = W - 196, yy = H - 78;
      g.shadowColor = "rgba(20,210,190,.45)";
      g.shadowBlur = 20;
      rr(g, x, yy, 168, 52, 26);
      g.fillStyle = "#0d2d33";
      g.fill();
      g.shadowBlur = 0;
      const rg = g.createRadialGradient(x + 27, yy + 28, 2, x + 27, yy + 26, 16);
      rg.addColorStop(0, "#d9fff8");
      rg.addColorStop(0.6, "#14d2be");
      rg.addColorStop(1, "#0b7d8a");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x + 27, yy + 26, 15, 0, TAU);
      g.fill();
      g.fillStyle = "#e8fffb";
      g.font = `650 17px ${FONT}`;
      g.fillText("Ask VERA", x + 54, yy + 32);
    }
    g.restore();
  }

  // =====================================================================
  // 8 · One universe
  // =====================================================================
  const outro = defineScene({
    key: "outro", name: "One universe", start: 172, end: 180, center: V(-10, 22, 40), accent: "#8fc0ff", trans: 3.4,
    big: {
      cls: "",
      html: `<div class="logos"><img data-logo="emb" alt="Environmental Management Bureau" /><span class="brand-divider"></span><img data-logo="bp" alt="Bagong Pilipinas" /></div>
             <div class="kicker">DENR · Environmental Management Bureau · Region III</div>
             <h1>E-Universe</h1>
             <div class="sub">Unified Information and Records Management System</div>
             <div class="tag">One sign-in · one record · one universe</div>`,
      op: (lt) => span(lt, 1.8, 3.0),
    },
    build() {
      const g = this.group;
      this.core = new THREE.Group();
      this.core.add(glow(C.core, 30, 0.3));
      this.core.add(mesh(new THREE.IcosahedronGeometry(4, 3), std(C.core, { ei: 0.22, rough: 0.5 })));
      this.wire = mesh(new THREE.IcosahedronGeometry(4.8, 1), basic(0x9ff5ea, 0.25, { wire: true }));
      this.core.add(this.wire);
      g.add(this.core);
      this.moons = [C.ucds, C.erms, C.portal, C.shared, C.vera].map((c, i) => {
        const m = new THREE.Group();
        m.add(mesh(new THREE.SphereGeometry(0.75, 24, 16), std(c, { ei: 0.5 })));
        m.add(glow(c, 4.5, 0.55));
        g.add(m);
        return { m, a: (i / 5) * TAU, r: 9 + (i % 2) * 2.2, tilt: 0.3 + i * 0.12 };
      });
    },
    update(lt) {
      this.core.rotation.y = lt * 0.25;
      this.wire.rotation.x = lt * 0.18;
      this.moons.forEach((o) => {
        const a = o.a + lt * 0.45;
        o.m.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r * o.tilt, Math.sin(a) * o.r);
      });
    },
    cam(lt) {
      return { p: V(Math.sin(lt * 0.08) * 6, 3 - lt * 0.2, lerp(46, 38, ease(span(lt, 0, 8)))), l: V(0, -1.5, 0) };
    },
  });

  // ------------------------------------------------------------ camera
  const worldCam = (s, lt) => {
    const c = s.cam(lt);
    return { p: c.p.clone().add(s.center), l: c.l.clone().add(s.center) };
  };
  function cameraAt(t) {
    const i = at(t), s = S[i], lt = t - s.start;
    const cur = worldCam(s, lt);
    const TR = s.trans ?? 3.6;
    if (i > 0 && lt < TR) {
      const p = S[i - 1];
      const prev = worldCam(p, p.end - p.start);
      const k = ease(lt / TR);
      const pos = prev.p.clone().lerp(cur.p, k);
      pos.y += Math.sin(k * Math.PI) * 10;
      const look = prev.l.clone().lerp(cur.l, ease(clamp(lt / TR * 1.15)));
      return { p: pos, l: look };
    }
    return cur;
  }

  // ------------------------------------------------------------- HUD
  const $ = (q) => document.querySelector(q);
  const ui = {
    brand: $("#brand"), chapter: $("#chapter"), num: $("#chapter-num"), name: $("#chapter-name"), big: $("#bigtitle"),
    lower: $("#lower"), kicker: $("#lower-kicker"), title: $("#lower-title"), caption: $("#caption"),
    features: $("#features"), fTitle: $("#features-title"), fList: $("#features-list"),
    chat: $("#chat"), chatBody: $("#chat-body"), note: $("#note"),
  };
  const setLogos = (root = document) => root.querySelectorAll("img[data-logo]").forEach((im) => (im.src = BRAND[im.dataset.logo]));
  let hudScene = -1, capKey = null, capTimer = 0, capSwap = null;
  const pad2 = (n) => String(n).padStart(2, "0");

  function updateHud(t) {
    const i = at(t), s = S[i], lt = t - s.start, dur = s.end - s.start;
    if (i !== hudScene) {
      hudScene = i;
      document.documentElement.style.setProperty("--accent", s.accent);
      ui.num.textContent = `${pad2(i + 1)} / ${pad2(S.length)}`;
      ui.name.textContent = s.name;
      ui.kicker.textContent = s.kicker || "";
      ui.title.textContent = s.title || "";
      ui.big.className = s.big ? s.big.cls : "";
      ui.big.innerHTML = s.big ? s.big.html : "";
      setLogos(ui.big);
      ui.fTitle.textContent = s.features ? s.features.title : "";
      ui.fList.innerHTML = s.features ? s.features.items.map(([, h]) => `<li>${h}</li>`).join("") : "";
      ui.note.textContent = s.note || "";
      ui.chatBody.innerHTML = "";
      for (const sc of S) (sc.chat || []).forEach((m) => ((m.el = null), (m.last = null)));
      capKey = null;
    }
    ui.brand.classList.toggle("show", t > 9.4 && t < 173.2);
    ui.chapter.classList.toggle("show", t > 10.2 && t < 173.2);
    const lowerOn = !!s.title && lt > (s.lowerFrom ?? 1.0) && lt < dur - 0.4;
    ui.lower.classList.toggle("show", lowerOn);
    // caption
    let cap = null;
    for (const c of s.captions || []) if (lt >= c[0]) cap = c;
    const key = cap ? s.key + cap[0] : null;
    if (key !== capKey) {
      capKey = key;
      clearTimeout(capTimer);
      capSwap = null;
      const apply = () => {
        ui.caption.textContent = cap ? cap[1] : "";
        ui.caption.classList.remove("swap");
      };
      if (!ui.caption.textContent) apply();
      else {
        ui.caption.classList.add("swap");
        if (RENDER) capSwap = { at: t + 0.26, apply };
        else capTimer = setTimeout(apply, 260);
      }
    }
    if (capSwap && t >= capSwap.at) capSwap.apply(), (capSwap = null);
    // features
    if (s.features) {
      const lis = ui.fList.children;
      let now = -1;
      s.features.items.forEach(([t0], k) => {
        const on = lt >= t0;
        lis[k].classList.toggle("on", on);
        if (on) now = k;
      });
      for (let k = 0; k < lis.length; k++) lis[k].classList.toggle("now", k === now);
    }
    ui.features.classList.toggle("show", !!s.features && lt > 0.8 && lt < dur - 0.4);
    // big title
    ui.big.style.opacity = s.big ? s.big.op(lt) : 0;
    // chat
    if (s.chat) {
      ui.chat.classList.toggle("show", lt > s.chatWin[0] && lt < s.chatWin[1]);
      s.chat.forEach((m) => {
        const vis = lt >= m.at;
        if (!vis) {
          if (m.el) m.el.remove(), (m.el = null), (m.last = null);
          return;
        }
        if (!m.el) {
          m.el = document.createElement("div");
          m.el.className = `msg ${m.who}${m.refuse ? " refuse" : ""}`;
          ui.chatBody.appendChild(m.el);
        }
        let html;
        if (m.who === "vera") {
          const tt = lt - m.at - 0.9;
          if (tt < 0) html = '<span class="typing"><i></i><i></i><i></i></span>';
          else {
            const n = Math.floor(tt * 46);
            html = escapeHtml(m.text.slice(0, n)) + (n < m.text.length ? '<span class="caret"></span>' : "");
          }
        } else html = escapeHtml(m.text);
        if (html !== m.last) (m.el.innerHTML = html), (m.last = html);
      });
    } else ui.chat.classList.remove("show");
    ui.note.classList.toggle("show", !!s.note && lt > 1 && lt < dur - 0.5);
  }
  const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

  // ------------------------------------------------------------- audio
  // A light corporate track, synthesised: bright plucks over C–G–Am–F at
  // 104 BPM, a soft pad, bass, and gentle kick, clap and hi-hat. It follows
  // the demo clock (the step is worked out from `t`), so seeking lands on the
  // beat, and the arrangement follows the chapters:
  //   0–10 s   pad + plucks            10–32 s  + bass, hi-hat
  //   32 s on  + kick and clap         126–150  VERA: drums drop out
  //   150 s    drums back              172 s on pad + plucks, fade to 3:00
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [
    { pad: [60, 64, 67], bass: 36 }, // C
    { pad: [59, 62, 67], bass: 43 }, // G
    { pad: [60, 64, 69], bass: 45 }, // Am
    { pad: [60, 65, 69], bass: 41 }, // F
  ];
  const ARP = [0, 1, 2, 1, 3, 2, 1, 2];

  const audio = {
    ctx: null, master: null, on: true, BPM: 104, next: 0, step: 0, synced: false,
    start(given) {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = (this.ctx = given || new AC());
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 3;
        comp.attack.value = 0.01;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(comp);
        // A dotted-eighth echo gives the plucks their shimmer.
        this.echo = ctx.createDelay(1);
        this.echo.delayTime.value = (60 / this.BPM) * 0.75;
        const fb = ctx.createGain(), wet = ctx.createGain(), tone = ctx.createBiquadFilter();
        fb.gain.value = 0.3;
        wet.gain.value = 0.25;
        tone.type = "lowpass";
        tone.frequency.value = 2800;
        this.echo.connect(tone);
        tone.connect(fb);
        fb.connect(this.echo);
        tone.connect(wet);
        wet.connect(this.master);
        const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch (e) {
        this.ctx = null;
      }
    },
    // ---- voices
    env(g, at, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    },
    osc(type, f, at, end, out, detune = 0) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(out);
      o.start(at);
      o.stop(end);
      return o;
    },
    pluck(at, m, peak) {
      const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(5200, at);
      lp.frequency.exponentialRampToValueAtTime(1400, at + 0.3);
      g.connect(lp);
      lp.connect(this.master);
      lp.connect(this.echo);
      this.env(g, at, peak, 0.006, 0.42);
      this.osc("triangle", midiHz(m), at, at + 0.5, g);
      const h = ctx.createGain();
      h.gain.value = 0.35;
      h.connect(g);
      this.osc("sine", midiHz(m + 12), at, at + 0.5, h);
    },
    pad(at, notes, dur) {
      const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      g.connect(lp);
      lp.connect(this.master);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.028, at + 0.35);
      g.gain.setValueAtTime(0.028, at + dur - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.45);
      for (const m of notes) for (const dt of [-7, 7]) this.osc("sawtooth", midiHz(m), at, at + dur + 0.5, g, dt);
    },
    bass(at, m, dur) {
      const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      g.connect(lp);
      lp.connect(this.master);
      this.env(g, at, 0.2, 0.01, dur);
      this.osc("triangle", midiHz(m), at, at + dur + 0.05, g);
      this.osc("sine", midiHz(m - 12), at, at + dur + 0.05, g);
    },
    kick(at) {
      const ctx = this.ctx, g = ctx.createGain(), o = ctx.createOscillator();
      o.frequency.setValueAtTime(130, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      o.connect(g);
      g.connect(this.master);
      this.env(g, at, 0.42, 0.004, 0.26);
      o.start(at);
      o.stop(at + 0.32);
    },
    hiss(at, type, freq, q, peak, decay) {
      const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      this.env(g, at, peak, 0.002, decay);
      src.start(at, Math.random() * 0.5);
      src.stop(at + decay + 0.05);
    },
    // ---- the arrangement: one sixteenth note
    play(s, at, sd) {
      const tAt = s * sd, bar = Math.floor(s / 16), pos = s % 16, ch = PROG[bar % 4];
      const drums = tAt >= 32 && tAt < 170 && !(tAt >= 126 && tAt < 150);
      if (pos === 0) this.pad(at, ch.pad, sd * 16);
      if (pos % 2 === 0 && tAt > 0.4) {
        const tones = [...ch.pad.map((m) => m + 12), ch.pad[0] + 24];
        this.pluck(at, tones[ARP[pos / 2]], pos === 0 ? 0.075 : 0.055);
      }
      if (tAt >= 10 && tAt < 172) {
        if (pos === 0 || pos === 8) this.bass(at, ch.bass, sd * 5);
        if (pos === 14) this.bass(at, ch.bass + 12, sd * 1.5);
        if (pos % 4 === 2) this.hiss(at, "highpass", 8000, 0.7, 0.035, 0.05);
      }
      if (drums) {
        if (pos === 0 || pos === 8 || pos === 10) this.kick(at);
        if (pos === 4 || pos === 12) this.hiss(at, "bandpass", 1700, 0.8, 0.09, 0.16);
      }
    },
    tick(t) {
      if (!this.ctx) return;
      const sd = 60 / this.BPM / 4, now = this.ctx.currentTime;
      if (this.synced && this.next < now - 0.1) this.synced = false; // the tab was hidden
      if (!this.synced) {
        this.step = Math.ceil(t / sd);
        this.next = now + 0.05 + (this.step * sd - t);
        this.synced = true;
      }
      while (this.next < now + 0.15) {
        if (this.on && this.step * sd < DURATION) this.play(this.step, this.next, sd);
        this.step++;
        this.next += sd;
      }
      this.master.gain.setTargetAtTime(this.on ? 0.6 * (1 - span(t, 176.5, 180)) : 0, now, 0.15);
    },
    resync() {
      this.synced = false;
    },
    level(playing) {
      if (!this.ctx) return;
      if (playing && this.ctx.state === "suspended") this.ctx.resume();
      if (!playing) {
        this.synced = false;
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      }
    },
    // A soft swoosh into each chapter.
    chime(when) {
      if (!this.ctx || !this.on) return;
      const ctx = this.ctx, at = when ?? ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise;
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(500, at);
      f.frequency.exponentialRampToValueAtTime(4200, at + 0.7);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.07, at + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);
      src.start(at);
      src.stop(at + 1);
    },
  };

  // ---------------------------------------------------------- controls
  const body = document.body;
  const scrub = $("#scrub"), fill = $("#track-fill"), timeEl = $("#time"), gate = $("#gate");
  let t = 0, playing = false, lastChapter = 0, ready = false;
  const fmtTime = (x) => `${Math.floor(x / 60)}:${pad2(Math.floor(x % 60))}`;

  function setPlaying(p) {
    if (p && t >= DURATION - 0.05) seek(0);
    playing = p;
    body.classList.toggle("playing", p);
    audio.level(p);
    poke();
  }
  function seek(nt) {
    t = clamp(nt, 0, DURATION);
    lastChapter = at(t);
    audio.resync();
  }
  function chapter(d) {
    const i = at(t);
    const target = d < 0 && t - S[i].start > 2 ? i : clamp(i + d, 0, S.length - 1);
    seek(S[target].start + (target ? 0.01 : 0));
  }
  function showGate(end) {
    gate.querySelector("#btn-start span").textContent = end ? "Replay the demo" : "Play the 3-minute demo";
    gate.classList.remove("hide");
  }
  function start() {
    gate.classList.add("hide");
    audio.start();
    setPlaying(true);
  }

  $("#btn-start").addEventListener("click", start);
  $("#btn-play").addEventListener("click", () => setPlaying(!playing));
  $("#btn-prev").addEventListener("click", () => chapter(-1));
  $("#btn-next").addEventListener("click", () => chapter(1));
  $("#btn-cc").addEventListener("click", (e) => {
    body.classList.toggle("no-cc");
    e.currentTarget.classList.toggle("on", !body.classList.contains("no-cc"));
  });
  const soundBtn = $("#btn-sound");
  soundBtn.addEventListener("click", () => {
    audio.on = !audio.on;
    soundBtn.classList.toggle("on", audio.on);
    audio.start();
    audio.level(playing);
  });
  const fullBtn = $("#btn-full");
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  fullBtn.addEventListener("click", toggleFull);
  scrub.addEventListener("input", () => {
    seek(scrub.value / 10);
    gate.classList.add("hide");
  });

  // chapter ticks
  const ticks = $("#ticks");
  S.forEach((s) => {
    const el = document.createElement("span");
    el.style.left = `${(s.start / DURATION) * 100}%`;
    el.innerHTML = `<em>${s.name}</em>`;
    ticks.appendChild(el);
  });
  $("#track").addEventListener("mousemove", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = at(((e.clientX - r.left) / r.width) * DURATION);
    [...ticks.children].forEach((el, k) => el.classList.toggle("hover", k === i));
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.key !== " ") return;
    const k = e.key.toLowerCase();
    if (k === " ") {
      e.preventDefault();
      if (!gate.classList.contains("hide")) start();
      else setPlaying(!playing);
    } else if (k === "arrowright") chapter(1);
    else if (k === "arrowleft") chapter(-1);
    else if (k === "c") $("#btn-cc").click();
    else if (k === "m") soundBtn.click();
    else if (k === "f") toggleFull();
    else if (k === "h") body.classList.toggle("hud-hidden");
    else if (k === "r") seek(0);
    else return;
    poke();
  });

  let idleTimer = 0;
  function poke() {
    body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => playing && body.classList.add("idle"), 2600);
  }
  window.addEventListener("mousemove", poke);
  window.addEventListener("touchstart", poke, { passive: true });

  // ------------------------------------------------------------ resize
  function resize() {
    if (!vera.veraMat) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1.25 ? Math.min(72, 45 * Math.pow(1.25 / camera.aspect, 0.75)) : 45;
    camera.updateProjectionMatrix();
    const px = renderer.domElement.height;
    vera.veraMat.uniforms.uScale.value = px / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  window.addEventListener("resize", resize);

  // -------------------------------------------------------------- frame
  function update(time) {
    for (const s of S) {
      const pre = s.start === 0 ? 0 : 2.6, post = s.key === "outro" ? 1 : 2.6;
      const f = s.start === 0 ? 1 - span(time, s.end + post - 2.6, s.end + post) : win(time, s.start - pre, s.end + post, pre, post);
      if (f > 0) s.update(time - s.start);
      applyFade(s.group, f);
    }
    const c = cameraAt(time);
    camera.position.copy(c.p);
    camera.lookAt(c.l);
    sky.position.copy(camera.position);
    updateHud(time);
    fill.style.width = `${(time / DURATION) * 100}%`;
    if (document.activeElement !== scrub) scrub.value = Math.round(time * 10);
    timeEl.textContent = `${fmtTime(time)} / ${fmtTime(DURATION)}`;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      t += dt;
      if (t >= DURATION) {
        t = DURATION;
        setPlaying(false);
        showGate(true);
      }
      const ch = at(t);
      if (ch !== lastChapter) {
        lastChapter = ch;
        audio.chime();
      }
      audio.tick(t);
    }
    update(t);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------ video render
  // render-video.cjs steps the page one frame at a time. CSS transitions and
  // animations (the HUD fades, the chat bubbles) are paused and advanced by
  // the same step, so the captured frames match real playback.
  function renderFrame(time, dtMs) {
    t = clamp(time, 0, DURATION);
    update(t);
    renderer.render(scene, camera);
    for (const a of document.getAnimations()) {
      if (a.playState !== "paused") a.pause();
      a.__vt = (a.__vt ?? 0) + dtMs;
      a.currentTime = a.__vt;
    }
  }

  /** The whole soundtrack, rendered offline: 16-bit stereo PCM. */
  async function renderAudio(rate = 48000) {
    const off = new OfflineAudioContext(2, rate * DURATION, rate);
    const a = Object.create(audio);
    a.ctx = null;
    a.on = true;
    a.start(off);
    a.master.gain.setValueAtTime(0.6, 0);
    a.master.gain.setValueAtTime(0.6, 176.5);
    a.master.gain.linearRampToValueAtTime(0.0001, DURATION);
    const sd = 60 / a.BPM / 4;
    for (let s = 0; s * sd < DURATION; s++) a.play(s, s * sd, sd);
    S.slice(1).forEach((sc) => a.chime(sc.start));
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) {
      pcm[i * 2] = clamp(L[i], -1, 1) * 32767;
      pcm[i * 2 + 1] = clamp(R[i], -1, 1) * 32767;
    }
    window.__pcm = new Uint8Array(pcm.buffer);
    return { bytes: window.__pcm.length, rate };
  }
  function pcmChunk(from, size) {
    const b = window.__pcm.subarray(from, from + size);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ------------------------------------------------------------- boot
  const loadImage = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });

  Promise.all([loadImage(BRAND.emb), loadImage(BRAND.bp)]).then(([emb, bp]) => {
    textures.embImg = emb;
    textures.bpImg = bp;
    setLogos();
    S.forEach((s) => s.build());
    resize();
    const q = new URLSearchParams(location.search);
    if (q.has("t")) seek(parseFloat(q.get("t")) || 0);
    update(t);
    renderer.compile(scene, camera);
    ready = true;
    if (RENDER) body.classList.add("render");
    else renderer.setAnimationLoop(frame);
    document.getElementById("loading").classList.add("hide");
    if (q.has("autoplay")) start();
    else if (q.has("t")) gate.classList.add("hide");
    window.__demo = { audio, renderFrame, renderAudio, pcmChunk, seek: (x) => seek(x), get t() { return t; }, play: () => setPlaying(true), pause: () => setPlaying(false), ready: () => ready };
  });
})();
