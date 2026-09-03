/*!
 * curved-carousel.js — a draggable ribbon of curved video cards in WebGL.
 * No dependencies, no build step. Drop the file in, call init(), done.
 *
 *   <div id="work"></div>
 *
 *   CurvedCarousel.init({
 *     container: "#work",
 *     projects: [
 *       { title:"dag ett", tag:"Löpning",
 *         poster:"media/dagett.jpg",
 *         video:{ webm:"media/dagett.webm", mp4:"media/dagett.mp4" } }
 *     ]
 *   });
 *
 * Returns a handle with .destroy(). Falls back to a plain scrolling list of
 * posters when WebGL is missing or the visitor asked for reduced motion.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    container: null,
    projects: [],
    aspect: 16 / 9,        // card shape; match your recordings or they letterbox
    cardsAcross: 3.4,      // roughly how many cards span the container
    heightShare: 0.56,     // most of the container height one card may take
    gap: 0.05,             // spacing between cards, in card-height units
    wave: {
      amplitude: 0.46,     // how deep the ribbon bows away from the viewer
      perCards: 2.2,       // wavelength, in cards. Lower = every card bows more
      vertical: 0.09       // gentle up/down snake
    },
    ripple: {
      reach: 0.30,         // how far from the cursor the rings travel
      strength: 0.022,     // how far the picture actually slides (0.02 = 2%)
      frequency: 15.0,     // ring spacing
      speed: 3.2           // how fast rings drift outward
    },
    cornerRadius: 0.12,    // in half-card-height units
    background: [0.984, 0.980, 0.972],  // must match the page behind it
    playAll: true,         // play every visible clip, not just the middle one
    labels: true,
    hint: null             // e.g. "Drag to browse"; null for none
  };

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      for (var k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
          target[k] = assign({}, target[k] || {}, src[k]);
        } else if (src[k] !== undefined) {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  var VERT = [
    "attribute vec2 aPos;",
    "attribute vec2 aUV;",
    "uniform float uOffsetX, uDist, uAmp, uFreq, uYAmp;",
    "uniform mat4  uProj;",
    "varying mediump vec2  vUV;",
    "varying mediump vec2  vWorld;",
    "varying mediump float vShade;",
    "void main(){",
    "  float wx = aPos.x + uOffsetX;",
    "  float ph = wx * uFreq;",
    "  float z  = uAmp * (cos(ph) - 1.0);",
    "  float y  = aPos.y + uYAmp * sin(ph * 0.5);",
    "  vUV = aUV; vWorld = vec2(wx, y); vShade = z / max(uAmp, 0.0001);",
    "  gl_Position = uProj * vec4(wx, y, z - uDist, 1.0);",
    "}"
  ].join("\n");

  // The cursor distorts the picture, never the geometry: displacing vertices
  // towards the camera magnifies them under perspective, which reads as the
  // card swelling as you approach it.
  var FRAG = [
    "precision mediump float;",
    "uniform sampler2D uTex;",
    "uniform float uRadius, uAspect, uAlpha, uFall, uPull, uWarp, uRingFreq, uRingSpeed, uTime;",
    "uniform vec2  uMouse, uCardSize, uBgA;",
    "uniform float uBgB;",
    "varying mediump vec2  vUV;",
    "varying mediump vec2  vWorld;",
    "varying mediump float vShade;",
    "void main(){",
    "  vec2 p = abs(vUV - 0.5) * vec2(uAspect, 1.0) * 2.0;",
    "  vec2 halfSize = vec2(uAspect, 1.0) - uRadius;",
    "  vec2 dd = max(p - halfSize, 0.0);",
    "  float a = 1.0 - smoothstep(-0.005, 0.005, length(dd) - uRadius);",
    "  if(a <= 0.001) discard;",
    "  vec2  delta = uMouse - vWorld;",
    "  float d     = length(delta);",
    "  vec2  dir   = d > 1e-4 ? delta / d : vec2(0.0);",
    "  float env   = smoothstep(uFall, 0.0, d);",
    "  float ring  = sin(d * uRingFreq - uTime * uRingSpeed);",
    "  float infl  = env * uWarp;",
    "  vec2  duv   = vec2(dir.x / uCardSize.x, -dir.y / uCardSize.y);",
    "  vec2  uvw   = clamp(vUV + duv * ring * infl * uPull, 0.0, 1.0);",
    "  vec4 tex = texture2D(uTex, uvw);",
    "  float shade = 1.0 + vShade * 0.22 + infl * 0.025;",
    "  vec3 bg = vec3(uBgA, uBgB);",
    "  gl_FragColor = vec4(mix(bg, tex.rgb * shade, 0.90 + 0.06 * infl), a * uAlpha);",
    "}"
  ].join("\n");

  function CurvedCarousel(options) {
    var o = assign({}, DEFAULTS, options || {});
    var root = typeof o.container === "string"
      ? document.querySelector(o.container) : o.container;
    if (!root) throw new Error("curved-carousel: container not found");
    if (!o.projects.length) throw new Error("curved-carousel: no projects given");

    this.options = o;
    this.root = root;
    this._destroyed = false;
    this._build();
  }

  CurvedCarousel.prototype._fallback = function () {
    var o = this.options, root = this.root;
    root.setAttribute("data-carousel", "fallback");
    var ul = document.createElement("ul");
    ul.className = "cc-fallback";
    ul.style.cssText = "display:flex;gap:20px;list-style:none;margin:0;padding:0;" +
      "overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch";
    o.projects.forEach(function (p) {
      var li = document.createElement("li");
      li.style.cssText = "flex:0 0 min(78vw,560px);scroll-snap-align:center";
      var img = document.createElement("img");
      img.src = p.poster; img.alt = p.alt || p.title || "";
      img.loading = "eager";            // lazy never fires inside a hidden parent
      img.style.cssText = "width:100%;height:auto;border-radius:14px;display:block";
      li.appendChild(img);
      if (o.labels && p.title) {
        var cap = document.createElement("div");
        cap.textContent = p.title;
        cap.style.cssText = "margin-top:12px;font-size:18px";
        li.appendChild(cap);
      }
      ul.appendChild(li);
    });
    root.appendChild(ul);
  };

  CurvedCarousel.prototype._build = function () {
    var self = this, o = this.options, root = this.root;

    if (getComputedStyle(root).position === "static") root.style.position = "relative";
    root.style.touchAction = "pan-y";
    root.style.userSelect = "none";

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.setAttribute("aria-hidden", "true");

    var gl = null;
    if (!reduce) {
      try {
        gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false })
          || canvas.getContext("experimental-webgl");
      } catch (e) { gl = null; }
    }
    if (!gl) { this._fallback(); return; }
    root.appendChild(canvas);
    this.canvas = canvas; this.gl = gl;

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("curved-carousel shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { root.removeChild(canvas); this._fallback(); return; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // a precision mismatch between stages lands here and is otherwise silent
      console.warn("curved-carousel link:", gl.getProgramInfoLog(prog));
      root.removeChild(canvas); this._fallback(); return;
    }
    gl.useProgram(prog);
    this.prog = prog;

    var ASPECT = o.aspect, PLANE_H = 1, PLANE_W = PLANE_H * ASPECT, HALF_W = PLANE_W / 2;
    var SEG = 44, pos = [], uv = [], idx = [];
    for (var iy = 0; iy <= 1; iy++) {
      for (var ix = 0; ix <= SEG; ix++) {
        var u = ix / SEG;
        pos.push((u - 0.5) * PLANE_W, (iy - 0.5) * PLANE_H);
        uv.push(u, 1 - iy);
      }
    }
    for (var i = 0; i < SEG; i++) {
      var a = i, b = a + 1, c = a + (SEG + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    function buf(data, target, Type) {
      var bb = gl.createBuffer(); gl.bindBuffer(target, bb);
      gl.bufferData(target, new Type(data), gl.STATIC_DRAW); return bb;
    }
    var posBuf = buf(pos, gl.ARRAY_BUFFER, Float32Array);
    var uvBuf = buf(uv, gl.ARRAY_BUFFER, Float32Array);
    buf(idx, gl.ELEMENT_ARRAY_BUFFER, Uint16Array);
    var aPos = gl.getAttribLocation(prog, "aPos"), aUV = gl.getAttribLocation(prog, "aUV");
    var U = function (n) { return gl.getUniformLocation(prog, n); };
    var u = {
      proj: U("uProj"), offsetX: U("uOffsetX"), dist: U("uDist"), amp: U("uAmp"),
      freq: U("uFreq"), yAmp: U("uYAmp"), mouse: U("uMouse"), warp: U("uWarp"),
      fall: U("uFall"), pull: U("uPull"), cardSize: U("uCardSize"), tex: U("uTex"),
      radius: U("uRadius"), aspect: U("uAspect"), alpha: U("uAlpha"),
      ringFreq: U("uRingFreq"), ringSpeed: U("uRingSpeed"), time: U("uTime"),
      bgA: U("uBgA"), bgB: U("uBgB")
    };

    function makeTexture() {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([245, 245, 243, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }

    var items = o.projects.map(function (p) {
      var it = { def: p, tex: makeTexture(), video: null, ready: false, playing: false };
      if (p.poster) {
        var img = new Image();
        img.onload = function () {
          gl.bindTexture(gl.TEXTURE_2D, it.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          needsDraw = true;
        };
        img.src = p.poster;
      }
      return it;
    });

    // repeat the list so the ribbon never shows where it loops
    var repeats = Math.max(2, Math.ceil(7 / items.length)), slots = [];
    for (var r = 0; r < repeats; r++) for (var k = 0; k < items.length; k++) slots.push(k);

    var GAP = o.gap, SPAN = PLANE_W + GAP, TOTAL = SPAN * slots.length;
    var scroll = 0, target = 0, pointerX = null, pointerY = null;
    var dragging = false, lastX = 0, dragVel = 0, speed = 0, clock = 0;
    var width = 0, height = 0, needsDraw = true, visible = false, hovered = -1;
    var hoverAmt = slots.map(function () { return 0; });
    var proj, camDist, viewHalfW, raf = null;

    function wrap(x) { return ((x + TOTAL / 2) % TOTAL + TOTAL) % TOTAL - TOTAL / 2; }
    var freq = (2 * Math.PI) / (SPAN * o.wave.perCards);
    function waveZ(x) { return o.wave.amplitude * (Math.cos(x * freq) - 1); }
    function waveY(x) { return o.wave.vertical * Math.sin(x * freq * 0.5); }

    function resize() {
      var rect = root.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);

      var aspect = width / height, fov = 45 * Math.PI / 180, tanHalf = Math.tan(fov / 2);
      // bound the card by whichever axis runs out first, or a short container
      // will grow cards taller than itself
      var visW = o.cardsAcross * SPAN;
      var fromWidth = visW / (2 * tanHalf * aspect);
      var fromHeight = (PLANE_H / o.heightShare) / (2 * tanHalf);
      camDist = Math.max(fromWidth, fromHeight);
      var f = 1 / tanHalf, nf = 1 / (0.1 - 100);
      proj = new Float32Array([
        f / aspect, 0, 0, 0, 0, f, 0, 0,
        0, 0, 100.1 * nf, -1, 0, 0, 20 * nf, 0
      ]);
      viewHalfW = camDist * tanHalf * aspect;
      needsDraw = true;
    }

    var labelEls = [];
    if (o.labels) {
      var layer = document.createElement("div");
      // clip: labels for cards that have scrolled off would otherwise push
      // the page wider than the viewport
      layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      layer.setAttribute("aria-hidden", "true");
      root.appendChild(layer);
      labelEls = slots.map(function (itemIndex) {
        var el = document.createElement("div");
        var p = items[itemIndex].def;
        el.style.cssText = "position:absolute;top:0;left:0;text-align:center;white-space:nowrap;transform:translate(-50%,0)";
        el.innerHTML = '<div class="cc-title"></div><div class="cc-tag"></div>';
        el.firstChild.textContent = p.title || "";
        el.lastChild.textContent = p.tag || "";
        layer.appendChild(el);
        return el;
      });
      this._layer = layer;
    }

    if (o.hint) {
      var hint = document.createElement("div");
      hint.className = "cc-hint";
      hint.textContent = o.hint;
      hint.style.cssText = "position:absolute;left:50%;bottom:0;transform:translateX(-50%);pointer-events:none;transition:opacity .5s";
      root.appendChild(hint);
      this._hint = hint;
    }

    function project(x, y, z) {
      var w = -(z - camDist) || 1e-6;
      return {
        x: ((proj[0] * x) / w * 0.5 + 0.5) * width,
        y: (1 - ((proj[5] * y) / w * 0.5 + 0.5)) * height
      };
    }
    function pointerWorldAt(z) {
      if (pointerX == null) return null;
      var viewZ = camDist - z;
      return {
        x: ((pointerX / width) * 2 - 1) * viewZ / proj[0],
        y: (1 - (pointerY / height) * 2) * viewZ / proj[5]
      };
    }
    function layout() {
      return slots.map(function (item, s) {
        var ox = wrap(s * SPAN - scroll);
        var edge = Math.abs(ox) / (TOTAL / 2);
        var alpha = 1 - Math.min(1, Math.max(0, (edge - 0.86) / (0.99 - 0.86)));
        return { s: s, item: item, ox: ox, alpha: alpha, z: waveZ(ox), sy: waveY(ox) };
      });
    }
    function hitTest(px, py) {
      if (px == null) return -1;
      var best = -1, bestZ = -Infinity;
      layout().forEach(function (c) {
        if (c.alpha < 0.4) return;
        var tl = project(c.ox - HALF_W, c.sy + PLANE_H / 2, c.z);
        var br = project(c.ox + HALF_W, c.sy - PLANE_H / 2, c.z);
        if (px >= tl.x && px <= br.x && py >= tl.y && py <= br.y && c.z > bestZ) {
          best = c.s; bestZ = c.z;
        }
      });
      return best;
    }

    function ensureVideo(it) {
      if (it.video || !it.def.video) return;
      var v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      v.preload = "auto";
      var canWebm = v.canPlayType('video/webm; codecs="vp9"');
      v.src = (canWebm === "probably" || canWebm === "maybe") && it.def.video.webm
        ? it.def.video.webm : it.def.video.mp4;
      v.addEventListener("playing", function () { it.ready = true; }, { once: true });
      it.video = v;
    }
    function centreItem() {
      var best = 0, bd = Infinity;
      slots.forEach(function (item, s) {
        var d = Math.abs(wrap(s * SPAN - scroll));
        if (d < bd) { bd = d; best = item; }
      });
      return best;
    }
    function syncVideos() {
      var all = o.playAll && width >= 720, mid = centreItem();
      items.forEach(function (it, i) {
        ensureVideo(it);
        if (!it.video) return;
        var want = all || i === mid;
        if (want && !it.playing) {
          var pr = it.video.play(); if (pr && pr.catch) pr.catch(function () { });
          it.playing = true;
        } else if (!want && it.playing) { it.video.pause(); it.playing = false; }
      });
    }
    function stopVideos() {
      items.forEach(function (it) {
        if (it.video && it.playing) { it.video.pause(); it.playing = false; }
      });
    }

    function draw() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(u.proj, false, proj);
      gl.uniform1f(u.dist, camDist);
      gl.uniform1f(u.amp, o.wave.amplitude);
      gl.uniform1f(u.freq, freq);
      gl.uniform1f(u.yAmp, o.wave.vertical);
      gl.uniform1f(u.radius, o.cornerRadius);
      gl.uniform1f(u.aspect, ASPECT);
      gl.uniform1f(u.fall, o.ripple.reach);
      gl.uniform1f(u.ringFreq, o.ripple.frequency);
      gl.uniform1f(u.ringSpeed, o.ripple.speed);
      gl.uniform1f(u.time, clock);
      gl.uniform2f(u.cardSize, PLANE_W, PLANE_H);
      gl.uniform2f(u.bgA, o.background[0], o.background[1]);
      gl.uniform1f(u.bgB, o.background[2]);
      gl.uniform1i(u.tex, 0); gl.activeTexture(gl.TEXTURE0);

      // upload each playing clip once, not once per card that shows it
      items.forEach(function (it) {
        if (it.playing && it.ready && it.video.readyState >= 2) {
          gl.bindTexture(gl.TEXTURE_2D, it.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, it.video);
        }
      });

      layout().sort(function (a, b) { return a.z - b.z; }).forEach(function (c) {
        if (c.alpha <= 0.002) { if (labelEls[c.s]) labelEls[c.s].style.opacity = "0"; return; }
        gl.bindTexture(gl.TEXTURE_2D, items[c.item].tex);
        var h = hoverAmt[c.s];
        var m = h > 0.002 ? pointerWorldAt(c.z) : null;
        gl.uniform1f(u.offsetX, c.ox);
        gl.uniform2f(u.mouse, m ? m.x : 1e6, m ? m.y : 1e6);
        gl.uniform1f(u.warp, h);
        gl.uniform1f(u.pull, o.ripple.strength * (1 + speed * 0.8));
        gl.uniform1f(u.alpha, c.alpha);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

        if (labelEls[c.s]) {
          var p = project(c.ox, c.sy - PLANE_H / 2, c.z);
          labelEls[c.s].style.transform =
            "translate(-50%,0) translate(" + p.x + "px," + (p.y + 16) + "px)";
          labelEls[c.s].style.opacity = String(c.alpha * (0.5 + 0.5 * h));
        }
      });
    }

    var last = performance.now();
    function frame(now) {
      if (self._destroyed) return;
      var dt = Math.min((now - last) / 1000, 0.05); last = now; clock += dt;
      if (visible) {
        if (!dragging) {
          target += dragVel;
          dragVel *= Math.pow(0.02, dt);
          if (Math.abs(dragVel) < 0.00002) dragVel = 0;
        }
        var before = scroll;
        scroll += (target - scroll) * (1 - Math.exp(-dt / 0.085));
        speed *= Math.pow(0.0008, dt);

        var nowHovered = dragging ? -1 : hitTest(pointerX, pointerY);
        if (nowHovered !== hovered) {
          hovered = nowHovered;
          root.style.cursor = hovered >= 0 ? "pointer" : "grab";
        }
        var moving = speed > 0.002;
        for (var s = 0; s < hoverAmt.length; s++) {
          var want = (s === hovered) ? 1 : 0;
          var tau = want ? 0.075 : 0.20;
          var nh = hoverAmt[s] + (want - hoverAmt[s]) * (1 - Math.exp(-dt / tau));
          if (Math.abs(nh - hoverAmt[s]) > 0.0004) moving = true;
          hoverAmt[s] = nh;
        }
        syncVideos();
        var playing = items.some(function (it) { return it.playing && it.ready; });
        if (moving || needsDraw || playing || Math.abs(scroll - before) > 0.00005 ||
            dragging || hovered >= 0) { draw(); needsDraw = false; }
      }
      raf = requestAnimationFrame(frame);
    }

    function toWorld(px) { return (px / width) * (viewHalfW * 2); }
    var handlers = {
      pointerdown: function (e) {
        dragging = true; lastX = e.clientX; dragVel = 0;
        root.style.cursor = "grabbing";
        try { root.setPointerCapture(e.pointerId); } catch (err) { }
        if (self._hint) self._hint.style.opacity = "0";
      },
      pointermove: function (e) {
        var rect = root.getBoundingClientRect();
        var nx = e.clientX - rect.left, ny = e.clientY - rect.top;
        if (pointerX != null) {
          speed = Math.min(1, speed + Math.hypot(nx - pointerX, ny - pointerY) / Math.max(width, 1) * 3);
        }
        pointerX = nx; pointerY = ny;
        if (!dragging) { needsDraw = true; return; }
        var dx = e.clientX - lastX; lastX = e.clientX;
        var d = toWorld(dx);
        target -= d; scroll -= d; dragVel = -d * 0.6; needsDraw = true;
      },
      pointerup: function (e) {
        if (!dragging) return;
        dragging = false; root.style.cursor = "grab";
        try { root.releasePointerCapture(e.pointerId); } catch (err) { }
      },
      pointerleave: function () { pointerX = pointerY = null; },
      wheel: function (e) {
        var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
        if (!dx) return;
        e.preventDefault();
        target += toWorld(dx); dragVel = 0;
        if (self._hint) self._hint.style.opacity = "0";
      }
    };
    handlers.pointercancel = handlers.pointerup;
    Object.keys(handlers).forEach(function (name) {
      root.addEventListener(name, handlers[name], name === "wheel" ? { passive: false } : undefined);
    });
    this._handlers = handlers;

    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) needsDraw = true; else stopVideos();
    }, { threshold: 0.15 });
    io.observe(root);
    this._io = io;

    this._onResize = resize;
    window.addEventListener("resize", resize, { passive: true });
    root.style.cursor = "grab";
    resize();
    raf = requestAnimationFrame(frame);
    this._stop = function () {
      if (raf) cancelAnimationFrame(raf);
      stopVideos();
    };
  };

  CurvedCarousel.prototype.destroy = function () {
    this._destroyed = true;
    if (this._stop) this._stop();
    if (this._io) this._io.disconnect();
    if (this._onResize) window.removeEventListener("resize", this._onResize);
    var root = this.root, handlers = this._handlers;
    if (handlers) Object.keys(handlers).forEach(function (n) {
      root.removeEventListener(n, handlers[n]);
    });
    root.innerHTML = "";
  };

  var api = {
    init: function (options) { return new CurvedCarousel(options); },
    defaults: DEFAULTS
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else global.CurvedCarousel = api;

})(typeof window !== "undefined" ? window : this);
