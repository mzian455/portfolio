(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ACCENT = '#ff4f00', WHITE = 'rgba(255,255,255,0.92)', DIM = 'rgba(255,255,255,0.55)';
  const YELLOW = '#ffd21f', BLUE = '#3b82f6';
  const MONO = '500 10px "DM Mono", ui-monospace, monospace';

  /* a canvas that sizes itself and only animates while it is on screen */
  function stage(cv, draw) {
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, vis = false, run = false, last = 0, hover = false;
    const once = () => { if (w) draw(ctx, w, h, 0, performance.now() / 1000); };
    function size() {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!run) once();
    }
    function loop(now) {
      if (!vis || document.hidden || (reduced && !hover)) { run = false; return; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      draw(ctx, w, h, dt, now / 1000);
      requestAnimationFrame(loop);
    }
    function kick() {
      if (run || !vis) return;
      if (reduced && !hover) { once(); return; }
      run = true; last = performance.now(); requestAnimationFrame(loop);
    }
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv); else window.addEventListener('resize', size);
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { vis = e[0].isIntersecting; kick(); }).observe(cv); else vis = true;
    cv.addEventListener('pointerenter', () => { hover = true; kick(); });
    cv.addEventListener('pointerleave', () => { hover = false; });
    document.addEventListener('visibilitychange', kick);
    size(); kick();
    return { local: (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }, once, kick, size: () => ({ w, h }) };
  }
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  function tag(ctx, text, x, y, color = WHITE, align = 'left') {
    ctx.font = MONO; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  /* =====================================================================
     THE FIELD: RoboCup small-size league, division B (9 m x 6 m), to scale
     ===================================================================== */
  function view(w, h, cx, cy, metresWide) {
    const s = w / metresWide;
    return { s, X: (m) => w / 2 + (m - cx) * s, Y: (m) => h / 2 + (m - cy) * s, mx: (px) => (px - w / 2) / s + cx, my: (px) => (px - h / 2) / s + cy };
  }
  function pitch(ctx, w, h, v) {
    ctx.fillStyle = '#234a30'; ctx.fillRect(0, 0, w, h);                       // run-off
    const x0 = v.X(-4.8), y0 = v.Y(-3.3), x1 = v.X(4.8), y1 = v.Y(3.3);
    ctx.fillStyle = '#2f6a43'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);          // carpet
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);                                // overhead lighting
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = Math.max(1.4, v.s * 0.012);
    ctx.strokeRect(v.X(-4.5), v.Y(-3), 9 * v.s, 6 * v.s);
    ctx.beginPath(); ctx.moveTo(v.X(0), v.Y(-3)); ctx.lineTo(v.X(0), v.Y(3)); ctx.moveTo(v.X(-4.5), v.Y(0)); ctx.lineTo(v.X(4.5), v.Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), 0.5 * v.s, 0, 6.2832); ctx.stroke();
    ctx.strokeRect(v.X(-4.5), v.Y(-1), v.s, 2 * v.s); ctx.strokeRect(v.X(3.5), v.Y(-1), v.s, 2 * v.s);
    for (const sx of [-1, 1]) {                                                 // goals
      const gx = sx < 0 ? v.X(-4.68) : v.X(4.5);
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(gx, v.Y(-0.5), 0.18 * v.s, v.s);
      ctx.strokeStyle = '#e9e9e9'; ctx.lineWidth = Math.max(2, v.s * 0.02); ctx.strokeRect(gx, v.Y(-0.5), 0.18 * v.s, v.s);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = Math.max(1.4, v.s * 0.012);
    }
  }
  function robot(ctx, x, y, s, a, team, alpha = 1) {
    const r = Math.max(9, 0.09 * s * 1.25);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + r * 0.22, y + r * 0.28, r * 1.02, r * 0.98, 0, 0, 6.2832); ctx.fill();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#131313'; ctx.beginPath(); ctx.arc(0, 0, r, 0.62, 6.2832 - 0.62); ctx.closePath(); ctx.fill();   // flat kicker face
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = team === 'y' ? YELLOW : BLUE; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 6.2832); ctx.fill();
    const pat = [[0.48, -0.5, '#ff5fae'], [0.48, 0.5, '#3ddc84'], [-0.5, -0.46, '#3ddc84'], [-0.5, 0.46, '#ff5fae']];
    for (const p of pat) { ctx.fillStyle = p[2]; ctx.beginPath(); ctx.arc(p[0] * r, p[1] * r, r * 0.17, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    return r;
  }
  function ball(ctx, x, y, s) {
    const r = Math.max(3.6, 0.0215 * s * 1.6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 6.2832); ctx.fill();
  }

  /* =====================================================================
     01  KALMAN FILTER  (constant-velocity model, one filter per axis)
     ===================================================================== */
  function kalman() {
    const cv = $('#kf'); if (!cv) return;
    const noiseEl = $('#kf-noise'), out = $('#kf-out');
    const ptr = { x: 0, y: 0, on: false };
    const axis = () => ({ x: 0, v: 0, p00: 400, p01: 0, p10: 0, p11: 400 });
    const fx = axis(), fy = axis();
    let init = false, acc = 0, lastOut = 0, heading = 0, bot = null;
    const meas = [], est = [], errs = [];
    const DT = 1 / 30, Q = 300000;                    // tuned offline: roughly halves the raw error

    function step(f, z, R) {
      f.x += f.v * DT;
      const a = f.p00 + DT * (f.p10 + f.p01) + DT * DT * f.p11 + Q * DT ** 4 / 4;
      const b = f.p01 + DT * f.p11 + Q * DT ** 3 / 2;
      const c = f.p10 + DT * f.p11 + Q * DT ** 3 / 2;
      const d = f.p11 + Q * DT * DT;
      const s = a + R, k0 = a / s, k1 = c / s, y = z - f.x;
      f.x += k0 * y; f.v += k1 * y;
      f.p00 = (1 - k0) * a; f.p01 = (1 - k0) * b; f.p10 = c - k1 * a; f.p11 = d - k1 * b;
    }

    const st = stage(cv, (ctx, w, h, dt, t) => {
      const v = view(w, h, 2.1, 0, 5.4), sigma = +noiseEl.value;
      const goal = ptr.on ? { x: ptr.x, y: ptr.y } : { x: w / 2 + Math.cos(t * 0.45) * w * 0.3, y: h / 2 + Math.sin(t * 0.75) * h * 0.28 };
      if (!bot) bot = { x: goal.x, y: goal.y, vx: 0, vy: 0 };
      // the robot drives to the goal like a real one: limited top speed and acceleration, and it brakes to stop
      if (dt > 0) {
        const VMAX = 1.5 * v.s, AMAX = 2.4 * v.s;
        const dx = goal.x - bot.x, dy = goal.y - bot.y, d = Math.hypot(dx, dy);
        const want = d > 1 ? Math.min(VMAX, Math.sqrt(2 * AMAX * 0.55 * d)) : 0;
        let ax = ((d > 1 ? (dx / d) * want : 0) - bot.vx) / dt, ay = ((d > 1 ? (dy / d) * want : 0) - bot.vy) / dt;
        const am = Math.hypot(ax, ay); if (am > AMAX) { ax *= AMAX / am; ay *= AMAX / am; }
        bot.vx += ax * dt; bot.vy += ay * dt; bot.x += bot.vx * dt; bot.y += bot.vy * dt;
        if (Math.hypot(bot.vx, bot.vy) > 6) heading = Math.atan2(bot.vy, bot.vx);
      }
      const truth = { x: bot.x, y: bot.y };
      if (!init) { fx.x = truth.x; fy.x = truth.y; init = true; }
      acc += dt;
      while (acc >= DT) {
        acc -= DT;
        const zx = truth.x + gauss() * sigma, zy = truth.y + gauss() * sigma;
        step(fx, zx, sigma * sigma); step(fy, zy, sigma * sigma);
        meas.push({ x: zx, y: zy }); if (meas.length > 46) meas.shift();
        est.push({ x: fx.x, y: fy.x }); if (est.length > 120) est.shift();
        errs.push([Math.hypot(zx - truth.x, zy - truth.y), Math.hypot(fx.x - truth.x, fy.x - truth.y)]); if (errs.length > 90) errs.shift();
      }
      pitch(ctx, w, h, v);
      meas.forEach((m, i) => {                                   // raw camera detections
        ctx.globalAlpha = 0.15 + 0.8 * (i / meas.length);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.strokeRect(m.x - 4.5, m.y - 4.5, 9, 9);
      });
      ctx.globalAlpha = 1;
      if (est.length > 1) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(est[0].x, est[0].y);
        for (let i = 1; i < est.length; i++) ctx.lineTo(est[i].x, est[i].y);
        ctx.stroke();
      }
      if (ptr.on) {                                              // where you are telling it to go
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(goal.x - 9, goal.y); ctx.lineTo(goal.x + 9, goal.y); ctx.moveTo(goal.x, goal.y - 9); ctx.lineTo(goal.x, goal.y + 9); ctx.stroke();
        ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(truth.x, truth.y); ctx.lineTo(goal.x, goal.y); ctx.stroke(); ctx.setLineDash([]);
      }
      const r = robot(ctx, truth.x, truth.y, v.s, heading, 'y');
      ctx.beginPath(); ctx.arc(fx.x, fy.x, r + 5, 0, 6.2832); ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.stroke();
      tag(ctx, '□ CAMERA DETECTION', 12, h - 30); tag(ctx, '○ FILTER ESTIMATE', 12, h - 14, '#ffb08a');
      if (!ptr.on) tag(ctx, 'MOVE YOUR CURSOR HERE', w - 12, 16, DIM, 'right');

      if (t - lastOut > 0.25 && errs.length > 10) {
        lastOut = t;
        const rms = (k) => Math.sqrt(errs.reduce((s, e) => s + e[k] * e[k], 0) / errs.length) / v.s * 100;
        out.innerHTML = `Raw error ${rms(0).toFixed(1)} cm · filtered <b>${rms(1).toFixed(1)} cm</b>`;
      }
    });
    const set = (e) => { const p = st.local(e); ptr.x = p.x; ptr.y = p.y; ptr.on = true; };
    cv.addEventListener('pointermove', set); cv.addEventListener('pointerdown', set);
    cv.addEventListener('pointerleave', () => { ptr.on = false; });
  }

  /* =====================================================================
     02  PID  vs  PID + FEEDFORWARD: two identical robots, one target
     ===================================================================== */
  function pid() {
    const cv = $('#pid'); if (!cv) return;
    const kpEl = $('#pid-kp'), kdEl = $('#pid-kd'), out = $('#pid-out');
    const M = 1, C = 2.2, KI = 2, H = 1 / 240, W0 = 0.8, AX = 2.5, AY = 1.25;
    const mk = () => ({ x: 0, y: 0, vx: 0, vy: 0, ix: 0, iy: 0, a: 0 });
    const A = mk(), B = mk();
    let time = 0, acc = 0, lastOut = 0, sample = 0;
    const errs = [];
    const ref = (t) => ({
      x: AX * Math.sin(W0 * t), y: AY * Math.sin(2 * W0 * t),
      vx: AX * W0 * Math.cos(W0 * t), vy: 2 * AY * W0 * Math.cos(2 * W0 * t),
      ax: -AX * W0 * W0 * Math.sin(W0 * t), ay: -4 * AY * W0 * W0 * Math.sin(2 * W0 * t)
    });
    function sim(s, kp, kd, ff, r) {
      const ex = r.x - s.x, ey = r.y - s.y;
      s.ix = clamp(s.ix + ex * H, -0.5, 0.5); s.iy = clamp(s.iy + ey * H, -0.5, 0.5);
      const ux = kp * ex + kd * (r.vx - s.vx) + KI * s.ix + (ff ? M * r.ax + C * r.vx : 0);
      const uy = kp * ey + kd * (r.vy - s.vy) + KI * s.iy + (ff ? M * r.ay + C * r.vy : 0);
      s.vx += ((ux - C * s.vx) / M) * H; s.vy += ((uy - C * s.vy) / M) * H;
      s.x += s.vx * H; s.y += s.vy * H;
      if (Math.hypot(s.vx, s.vy) > 0.05) s.a = Math.atan2(s.vy, s.vx);
    }
    $('#pid-kick').addEventListener('click', () => { for (const s of [A, B]) { s.vx += 2.2; s.vy -= 1.6; } });

    stage(cv, (ctx, w, h, dt, t) => {
      const v = view(w, h, 0, 0, 7.2), kp = +kpEl.value, kd = +kdEl.value;
      acc += dt;
      let r = ref(time);
      while (acc >= H) {
        acc -= H; time += H; r = ref(time);
        sim(A, kp, kd, false, r); sim(B, kp, kd, true, r);
        sample += H;
        if (sample >= 1 / 30) { sample = 0; errs.push([Math.hypot(A.x - r.x, A.y - r.y), Math.hypot(B.x - r.x, B.y - r.y)]); if (errs.length > 200) errs.shift(); }
      }
      pitch(ctx, w, h, v);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);     // the path the target follows
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const p = ref((i / 120) * (6.2832 / W0)); i ? ctx.lineTo(v.X(p.x), v.Y(p.y)) : ctx.moveTo(v.X(p.x), v.Y(p.y)); }
      ctx.stroke(); ctx.setLineDash([]);
      const tx = v.X(r.x), ty = v.Y(r.y);
      const ra = robot(ctx, v.X(A.x), v.Y(A.y), v.s, A.a, 'b');
      robot(ctx, v.X(B.x), v.Y(B.y), v.s, B.a, 'y');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(tx, ty, ra + 6, 0, 6.2832); ctx.moveTo(tx - ra - 11, ty); ctx.lineTo(tx - ra - 2, ty); ctx.moveTo(tx + ra + 2, ty); ctx.lineTo(tx + ra + 11, ty);
      ctx.moveTo(tx, ty - ra - 11); ctx.lineTo(tx, ty - ra - 2); ctx.moveTo(tx, ty + ra + 2); ctx.lineTo(tx, ty + ra + 11); ctx.stroke();
      tag(ctx, 'PID', v.X(A.x), v.Y(A.y) + ra + 12, '#a9c8ff', 'center');
      tag(ctx, 'PID + FF', v.X(B.x), v.Y(B.y) - ra - 12, YELLOW, 'center');
      tag(ctx, '⌖ TARGET', 12, h - 14);
      if (t - lastOut > 0.3 && errs.length > 40) {
        lastOut = t;
        const rms = (k) => Math.sqrt(errs.reduce((s, e) => s + e[k] * e[k], 0) / errs.length) * 100;
        out.innerHTML = `Average error · PID ${rms(0).toFixed(1)} cm · with feedforward <b>${rms(1).toFixed(1)} cm</b>`;
      }
    });
  }

  /* =====================================================================
     03  COMMAND RESPONSE: send a move command, measure what the robot does
     ===================================================================== */
  function response() {
    const cv = $('#resp'); if (!cv) return;
    const kpEl = $('#resp-kp'), kdEl = $('#resp-kd'), out = $('#resp-out');
    const H = 1 / 240, AMAX = 5, VMAX = 3.5;
    const bot = { x: -1.9, y: 1.0, vx: 0, vy: 0, a: 0 };
    let cmd = null, acc = 0, trail = [];

    function command(tx, ty) {
      const D = Math.hypot(tx - bot.x, ty - bot.y);
      if (D < 0.15) return;
      cmd = { sx: bot.x, sy: bot.y, tx, ty, D, t: 0, hist: [], rise: null, peak: 0, lastOut: 0, done: false };
      bot.a = Math.atan2(ty - bot.y, tx - bot.x); trail = [];
    }
    function report() {
      const c = cmd;
      const over = Math.max(0, (c.peak - c.D) / c.D * 100);
      const settle = c.lastOut + 1 / 60;
      out.innerHTML = c.rise == null ? 'Measuring ...'
        : `Rise ${c.rise.toFixed(2)} s · overshoot <b>${over.toFixed(1)}%</b>` + (c.done ? ` · settled in ${settle.toFixed(2)} s` : ' · settling ...');
    }

    const st = stage(cv, (ctx, w, h, dt) => {
      const v = view(w, h, 0, 0, 7.2);
      if (!cmd) command(1.7, -0.8);
      acc += dt;
      while (acc >= H) {
        acc -= H;
        const kp = +kpEl.value, kd = +kdEl.value;
        let ax = kp * (cmd.tx - bot.x) - kd * bot.vx, ay = kp * (cmd.ty - bot.y) - kd * bot.vy;
        const am = Math.hypot(ax, ay); if (am > AMAX) { ax *= AMAX / am; ay *= AMAX / am; }
        bot.vx += ax * H; bot.vy += ay * H;
        const vm = Math.hypot(bot.vx, bot.vy); if (vm > VMAX) { bot.vx *= VMAX / vm; bot.vy *= VMAX / vm; }
        bot.x += bot.vx * H; bot.y += bot.vy * H;
        if (!cmd.done) {
          cmd.t += H;
          const s = ((bot.x - cmd.sx) * (cmd.tx - cmd.sx) + (bot.y - cmd.sy) * (cmd.ty - cmd.sy)) / cmd.D;
          if (cmd.rise == null && s >= 0.9 * cmd.D) cmd.rise = cmd.t;
          cmd.peak = Math.max(cmd.peak, s);
          if (Math.abs(s - cmd.D) > 0.02 * cmd.D + 0.005) cmd.lastOut = cmd.t;
          if (cmd.hist.length < 900 && (cmd.hist.length === 0 || cmd.t - cmd.hist[cmd.hist.length - 1][0] >= 1 / 60)) cmd.hist.push([cmd.t, s / cmd.D]);
          if (cmd.t - cmd.lastOut > 0.6 || cmd.t > 8) cmd.done = true;
        }
      }
      trail.push([bot.x, bot.y]); if (trail.length > 400) trail.shift();
      report();

      pitch(ctx, w, h, v);
      const sx = v.X(cmd.sx), sy = v.Y(cmd.sy), tx = v.X(cmd.tx), ty = v.Y(cmd.ty);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5);
      ctx.moveTo(tx - 12, ty); ctx.lineTo(tx + 12, ty); ctx.moveTo(tx, ty - 12); ctx.lineTo(tx, ty + 12); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 6.2832); ctx.stroke();
      if (trail.length > 1) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.beginPath(); trail.forEach((p, i) => (i ? ctx.lineTo(v.X(p[0]), v.Y(p[1])) : ctx.moveTo(v.X(p[0]), v.Y(p[1])))); ctx.stroke();
      }
      robot(ctx, v.X(bot.x), v.Y(bot.y), v.s, bot.a, 'y');
      tag(ctx, 'COMMAND', tx, ty - 20, WHITE, 'center');

      // inset chart: distance travelled against the command
      const cw = Math.min(w * 0.46, 300), ch = Math.min(h * 0.36, 150), cx = 12, cy = h - ch - 12, T = 3;
      ctx.fillStyle = 'rgba(12,18,14,0.78)'; ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      const px = (t) => cx + 10 + (t / T) * (cw - 20), py = (f) => cy + ch - 14 - f * (ch - 34) / 1.3;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(0), py(1)); ctx.lineTo(px(T), py(1)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.2; ctx.beginPath();
      cmd.hist.forEach((p, i) => { if (p[0] > T) return; i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1])); });
      ctx.stroke();
      if (cmd.rise != null && cmd.rise < T) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(cmd.rise), py(0)); ctx.lineTo(px(cmd.rise), py(0.9)); ctx.stroke(); tag(ctx, 'RISE', px(cmd.rise) + 4, py(0) - 8, DIM); }
      tag(ctx, 'COMMAND', cx + cw - 10, py(1) - 9, DIM, 'right');
      tag(ctx, `0 — ${T} S`, cx + cw - 10, cy + ch - 7, DIM, 'right');
      tag(ctx, 'CLICK THE FIELD', w - 12, 16, DIM, 'right');
    });
    cv.addEventListener('click', (e) => {
      const p = st.local(e), s = st.size(), v = view(s.w, s.h, 0, 0, 7.2);
      command(clamp(v.mx(p.x), -3.4, 3.4), clamp(v.my(p.y), -2.3, 2.3)); st.kick(); st.once();
    });
    [kpEl, kdEl].forEach((el) => el.addEventListener('input', () => { if (cmd && cmd.done) { const tx = cmd.sx, ty = cmd.sy; command(tx, ty); st.kick(); } }));
  }

  /* =====================================================================
     04  PASS OR SHOOT: a hand-written scoring rule for the ball carrier
     ===================================================================== */
  function tactics() {
    const cv = $('#tac'); if (!cv) return;
    const out = $('#tac-out');
    const VW = 5, VC = 2.5, GX = 4.5, GH = 0.5, BLOCK = 0.13;
    const me = { x: 1.7, y: 0.55, team: 'y' };
    const mates = [{ x: 3.0, y: -1.15, team: 'y' }, { x: 0.9, y: -0.9, team: 'y' }];
    const opp = [{ x: 4.28, y: 0.12, team: 'b' }, { x: 3.1, y: 0.42, team: 'b' }, { x: 2.35, y: -0.3, team: 'b' }];
    const all = [me, ...mates, ...opp];
    let drag = null;

    const segDist = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy; const t = l ? clamp(((px - x0) * dx + (py - y0) * dy) / l, 0, 1) : 0; return Math.hypot(x0 + dx * t - px, y0 + dy * t - py); };
    function shot(p) {                                   // which parts of the goal mouth can this robot see?
      const N = 41, open = [];
      for (let i = 0; i < N; i++) { const gy = -GH + (i / (N - 1)) * 2 * GH; open.push(opp.every((o) => segDist(o.x, o.y, p.x, p.y, GX, gy) > BLOCK)); }
      let best = [0, -1], cur = 0, start = 0;
      open.forEach((o, i) => { if (o) { if (!cur) start = i; cur++; if (cur > best[0]) best = [cur, start]; } else cur = 0; });
      const frac = open.filter(Boolean).length / N;
      const dist = Math.hypot(GX - p.x, p.y);
      const aimY = best[0] ? -GH + ((best[1] + (best[0] - 1) / 2) / (N - 1)) * 2 * GH : 0;
      return { open, frac, score: frac * clamp(1.15 - dist / 5, 0.3, 1), aimY };
    }

    const st = stage(cv, (ctx, w, h) => {
      const v = view(w, h, VC, 0, VW);
      pitch(ctx, w, h, v);
      const mine = shot(me);
      const passes = mates.map((m) => {
        const lane = Math.min(...opp.map((o) => segDist(o.x, o.y, me.x, me.y, m.x, m.y)));
        const safe = clamp((lane - BLOCK) / 0.45, 0, 1), their = shot(m);
        return { m, safe, their, score: safe * (0.3 + 0.7 * their.score) * 0.95 };
      });
      const bestPass = passes.reduce((a, b) => (b.score > a.score ? b : a));
      const choice = Math.max(mine.score, bestPass.score) < 0.14 ? 'hold' : mine.score >= bestPass.score ? 'shoot' : 'pass';

      // open parts of the goal, as a fan from the ball
      const bx = v.X(me.x), by = v.Y(me.y), N = mine.open.length;
      ctx.fillStyle = choice === 'shoot' ? 'rgba(255,79,0,0.22)' : 'rgba(255,255,255,0.13)';
      for (let i = 0; i < N - 1; i++) {
        if (!(mine.open[i] && mine.open[i + 1])) continue;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.lineTo(v.X(GX), v.Y(-GH + (i / (N - 1)) * 2 * GH)); ctx.lineTo(v.X(GX), v.Y(-GH + ((i + 1) / (N - 1)) * 2 * GH)); ctx.closePath(); ctx.fill();
      }
      passes.forEach((p) => {
        const chosen = choice === 'pass' && p === bestPass;
        ctx.strokeStyle = chosen ? ACCENT : 'rgba(255,255,255,0.6)'; ctx.lineWidth = chosen ? 3.5 : 1.3; ctx.setLineDash(chosen ? [] : [5, 6]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(v.X(p.m.x), v.Y(p.m.y)); ctx.stroke(); ctx.setLineDash([]);
        tag(ctx, `PASS ${p.score.toFixed(2)}`, (bx + v.X(p.m.x)) / 2 + 8, (by + v.Y(p.m.y)) / 2 - 9, chosen ? '#ffb08a' : WHITE);
      });
      if (choice === 'shoot') { ctx.strokeStyle = ACCENT; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(v.X(GX), v.Y(mine.aimY)); ctx.stroke(); }
      tag(ctx, `SHOT ${mine.score.toFixed(2)}`, v.X(GX) - 10, v.Y(-GH) - 12, choice === 'shoot' ? '#ffb08a' : WHITE, 'right');

      opp.forEach((o) => robot(ctx, v.X(o.x), v.Y(o.y), v.s, Math.atan2(me.y - o.y, me.x - o.x), 'b'));
      mates.forEach((m) => robot(ctx, v.X(m.x), v.Y(m.y), v.s, Math.atan2(-m.y, GX - m.x), 'y'));
      const aim = choice === 'pass' ? Math.atan2(bestPass.m.y - me.y, bestPass.m.x - me.x) : Math.atan2(mine.aimY - me.y, GX - me.x);
      const r = robot(ctx, bx, by, v.s, aim, 'y');
      ball(ctx, bx + Math.cos(aim) * (r + 3), by + Math.sin(aim) * (r + 3), v.s);
      tag(ctx, 'DRAG ANY ROBOT', 12, 16, DIM);

      const pct = Math.round(mine.frac * 100);
      out.innerHTML = choice === 'shoot' ? `Decision · <b>Shoot.</b> ${pct}% of the goal is open.`
        : choice === 'pass' ? `Decision · <b>Pass.</b> The lane is ${Math.round(bestPass.safe * 100)}% safe and the receiver sees ${Math.round(bestPass.their.frac * 100)}% of the goal.`
        : 'Decision · <b>Hold and reposition.</b> Nothing is open.';
    });

    const toM = (e) => { const p = st.local(e), s = st.size(), v = view(s.w, s.h, VC, 0, VW); return { x: v.mx(p.x), y: v.my(p.y), s: v.s }; };
    cv.addEventListener('pointerdown', (e) => {
      const p = toM(e);
      drag = all.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < Math.max(0.2, 22 / p.s)) || null;
      if (drag) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} cv.style.cursor = 'grabbing'; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toM(e);
      if (drag) { drag.x = clamp(p.x, 0.25, 4.35); drag.y = clamp(p.y, -1.5, 1.5); st.once(); }
      else cv.style.cursor = all.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < Math.max(0.2, 22 / p.s)) ? 'grab' : 'crosshair';
    });
    const up = () => { drag = null; cv.style.cursor = 'crosshair'; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  /* =====================================================================
     05  VOICE2VECTOR: parse plain language, check it, fly it
     ===================================================================== */
  function v2v() {
    const cv = $('#v2v'); if (!cv) return;
    const form = $('#v2v-form'), input = $('#v2v-input'), list = $('#v2v-steps');
    const CEIL = 120, RANGE = 600, NF = { x: 260, y: 60, r: 80 };
    const DIRS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [0.7071, 0.7071], northwest: [-0.7071, 0.7071], southeast: [0.7071, -0.7071], southwest: [-0.7071, -0.7071] };
    const ALIAS = { n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };
    const DIR_RE = '(north\\s?-?east|north\\s?-?west|south\\s?-?east|south\\s?-?west|north|south|east|west|ne|nw|se|sw|n|s|e|w)';
    const DIST_RE = '(\\d+(?:\\.\\d+)?)\\s*(km|kilometers?|kilometres?|m|meters?|metres?)?';
    const normDir = (d) => { d = d.replace(/[\s-]/g, ''); return ALIAS[d] || d; };

    function parse(text) {
      return text.toLowerCase().split(/,|;|\bthen\b|\band\b|\./).map((c) => c.trim()).filter(Boolean).map((c) => {
        let m;
        if (/take\s*-?off|launch|lift\s*off/.test(c)) return { type: 'TAKEOFF', raw: c };
        if (/return|come back|go home|back to (base|home)|\brtl\b|\brth\b/.test(c)) return { type: 'RETURN', raw: c };
        if (/\bland\b|touch\s*down/.test(c)) return { type: 'LAND', raw: c };
        if ((m = c.match(/(?:climb|ascend|descend|go up|go down|altitude)[^\d]*(\d+(?:\.\d+)?)\s*(ft|feet|m|meters?|metres?)?/))) return { type: 'ALTITUDE', alt: Math.round(+m[1] * (/f/.test(m[2] || '') ? 0.3048 : 1)), raw: c };
        if ((m = c.match(new RegExp('(?:fly|go|head|move|travel)\\s+(?:to the\\s+)?' + DIR_RE + '\\b\\s*(?:for\\s+)?' + DIST_RE)))) return { type: 'MOVE', dir: normDir(m[1]), dist: +m[2] * (/^k/.test(m[3] || '') ? 1000 : 1), raw: c };
        if ((m = c.match(new RegExp('(?:fly|go|head|move|travel)\\s+' + DIST_RE + '\\s*(?:to the\\s+)?' + DIR_RE + '\\b')))) return { type: 'MOVE', dir: normDir(m[3]), dist: +m[1] * (/^k/.test(m[2] || '') ? 1000 : 1), raw: c };
        if ((m = c.match(/(?:hover|hold|wait|loiter)[^\d]*(\d+)?\s*(min|minutes?|s|sec|seconds?)?/))) return { type: 'HOVER', secs: (+m[1] || 10) * (/^min/.test(m[2] || '') ? 60 : 1), raw: c };
        return { type: 'UNKNOWN', raw: c };
      });
    }
    const hitsNoFly = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy; const t = l2 ? clamp(((NF.x - x0) * dx + (NF.y - y0) * dy) / l2, 0, 1) : 0; return Math.hypot(x0 + dx * t - NF.x, y0 + dy * t - NF.y) < NF.r; };

    let legs = [], rejected = null, progress = 0, total = 0, finalAlt = 0;
    function run(text) {
      const s = { x: 0, y: 0, alt: 0, air: false };
      legs = []; rejected = null;
      let stopped = false;
      const rows = parse(text).map((c) => {
        if (stopped) return { ok: false, skip: true, name: c.type, msg: 'not run' };
        let ok = true, msg = '';
        const need = () => { if (!s.air) { ok = false; msg = 'not airborne. Take off first.'; } return s.air; };
        const move = (nx, ny, label) => {
          if (Math.hypot(nx, ny) > RANGE) { ok = false; msg = `leaves the ${RANGE} m perimeter.`; rejected = { x0: s.x, y0: s.y, x1: nx, y1: ny }; return; }
          if (hitsNoFly(s.x, s.y, nx, ny)) { ok = false; msg = 'crosses the fuel-depot no-fly zone.'; rejected = { x0: s.x, y0: s.y, x1: nx, y1: ny }; return; }
          legs.push({ x0: s.x, y0: s.y, x1: nx, y1: ny, alt: s.alt }); s.x = nx; s.y = ny; msg = label;
        };
        if (c.type === 'TAKEOFF') { if (s.air) { ok = false; msg = 'already airborne.'; } else { s.air = true; s.alt = 30; msg = 'to 30 m.'; } }
        else if (c.type === 'ALTITUDE') { if (need()) { if (c.alt > CEIL) { ok = false; msg = `${c.alt} m is above the ${CEIL} m ceiling.`; } else if (c.alt < 5) { ok = false; msg = 'too low. Use land.'; } else { s.alt = c.alt; msg = `to ${c.alt} m.`; } } }
        else if (c.type === 'MOVE') { if (need()) { const d = DIRS[c.dir]; move(s.x + d[0] * c.dist, s.y + d[1] * c.dist, `${c.dir} ${c.dist} m at ${s.alt} m.`); } }
        else if (c.type === 'RETURN') { if (need()) move(0, 0, 'to the landing pad.'); }
        else if (c.type === 'HOVER') { if (need()) msg = `for ${c.secs} s.`; }
        else if (c.type === 'LAND') { if (need()) { s.air = false; s.alt = 0; msg = 'at current position.'; } }
        else { ok = false; msg = `"${c.raw}" was not understood. In Voice2Vector this is where the language model takes over.`; }
        if (!ok) stopped = true;
        return { ok, name: c.type === 'UNKNOWN' ? '?' : c.type, msg };
      });
      finalAlt = s.alt;
      list.textContent = '';
      rows.forEach((r) => {
        const li = document.createElement('li'); li.className = r.ok ? 'ok' : 'no';
        const i = document.createElement('i'); i.textContent = r.ok ? '✓' : r.skip ? '·' : '✕';
        const sp = document.createElement('span'), b = document.createElement('b'); b.textContent = r.name;
        sp.append(b, document.createTextNode((r.ok || r.skip ? '' : 'Rejected: ') + r.msg));
        li.append(i, sp); list.appendChild(li);
      });
      if (!rows.length) { const li = document.createElement('li'); li.className = 'no'; li.innerHTML = '<i>·</i><span>Type a mission, for example: take off, fly north 200 m</span>'; list.appendChild(li); }
      total = legs.reduce((a, l) => a + Math.hypot(l.x1 - l.x0, l.y1 - l.y0), 0);
      progress = reduced ? total : 0;
      st.kick(); st.once();
    }

    const st = stage(cv, (ctx, w, h, dt) => {
      const sc = (Math.min(w, h) * 0.46) / RANGE, cx = w / 2, cy = h / 2;
      const P = (x, y) => [cx + x * sc, cy - y * sc];
      progress = Math.min(total, progress + dt * 420);
      // ground: scrub, a service road, a few buildings
      ctx.fillStyle = '#3d4233'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#454a38'; ctx.beginPath(); ctx.moveTo(0, h * 0.55); ctx.lineTo(w * 0.42, h * 0.3); ctx.lineTo(w * 0.5, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#363b2e'; ctx.beginPath(); ctx.moveTo(w, h * 0.5); ctx.lineTo(w * 0.6, h * 0.72); ctx.lineTo(w * 0.52, h); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6b6756'; ctx.lineWidth = Math.max(5, 18 * sc); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-10, cy + 260 * sc); ctx.lineTo(cx - 60 * sc, cy + 30 * sc); ctx.lineTo(cx + 420 * sc, cy - 520 * sc); ctx.stroke();
      ctx.fillStyle = '#2a2d24';
      for (const b of [[-210, 150, 70, 44], [-330, -120, 54, 54], [120, -260, 90, 40]]) { const p = P(b[0], b[1]); ctx.fillRect(p[0], p[1], b[2] * sc, b[3] * sc); }
      const gv = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.25, cx, cy, Math.max(w, h) * 0.75);
      gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = gv; ctx.fillRect(0, 0, w, h);
      // perimeter
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, RANGE * sc, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      tag(ctx, `PERIMETER ${RANGE} M`, cx, cy + RANGE * sc - 11, DIM, 'center'); tag(ctx, 'N ↑', cx, cy - RANGE * sc + 12, DIM, 'center');
      // fuel depot: the no-fly zone
      const nf = P(NF.x, NF.y);
      ctx.fillStyle = '#8f8a78'; for (const o of [[-22, -14, 20], [20, 6, 24], [-10, 26, 16]]) { ctx.beginPath(); ctx.arc(nf[0] + o[0] * sc, nf[1] + o[1] * sc, o[2] * sc, 0, 6.2832); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,79,0,0.16)'; ctx.beginPath(); ctx.arc(nf[0], nf[1], NF.r * sc, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      tag(ctx, 'FUEL DEPOT · NO-FLY', nf[0], nf[1] + NF.r * sc + 12, '#ffb08a', 'center');
      // rejected leg
      if (rejected && progress >= total) {
        const a = P(rejected.x0, rejected.y0), b = P(rejected.x1, rejected.y1);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(b[0] - 6, b[1] - 6); ctx.lineTo(b[0] + 6, b[1] + 6); ctx.moveTo(b[0] + 6, b[1] - 6); ctx.lineTo(b[0] - 6, b[1] + 6); ctx.stroke();
        tag(ctx, 'REJECTED', clamp(b[0], 40, w - 40), clamp(b[1] - 15, 12, h - 12), WHITE, 'center');
      }
      // landing pad
      const hm = P(0, 0);
      ctx.fillStyle = '#55584a'; ctx.beginPath(); ctx.arc(hm[0], hm[1], Math.max(11, 26 * sc), 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.font = '600 11px "Hanken Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('H', hm[0], hm[1] + 0.5);
      // flown legs
      let left = progress, pos = hm, ang = -Math.PI / 2, alt = legs.length ? legs[0].alt : finalAlt;
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pos[0], pos[1]);
      for (const l of legs) {
        const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0); if (left <= 0) break;
        const t = Math.min(1, left / len); pos = P(l.x0 + (l.x1 - l.x0) * t, l.y0 + (l.y1 - l.y0) * t);
        ctx.lineTo(pos[0], pos[1]); ang = Math.atan2(-(l.y1 - l.y0), l.x1 - l.x0); alt = l.alt; left -= len;
      }
      ctx.stroke();
      // the drone: a quadcopter seen from above
      ctx.save(); ctx.translate(pos[0], pos[1]); ctx.rotate(ang + Math.PI / 4);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
      for (const q of [[-9, 0], [9, 0], [0, -9], [0, 9]]) { ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = ACCENT; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
      if (legs.length || finalAlt) tag(ctx, `ALT ${progress >= total ? finalAlt : alt} M`, pos[0] + 17, pos[1] - 14, '#ffb08a');
    });

    form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
    $$('#v2v-chips .chip').forEach((c) => c.addEventListener('click', () => { input.value = c.textContent; run(input.value); }));
    run(input.value);
  }

  /* =====================================================================
     TERMINAL
     ===================================================================== */
  function terminal() {
    const out = $('#term-out'), input = $('#term-input'), box = $('#term');
    if (!out || !input) return;
    const hist = []; let hi = 0;
    const jump = (el) => el && el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    const print = (text, cls = 'o') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; out.appendChild(d); out.scrollTop = out.scrollHeight; };
    const table = (i) => $$('.table')[i] ? $$('tr', $$('.table')[i]).map((tr) => $$('th, td', tr).map((c) => c.textContent.trim().replace(/\s+/g, ' ')).join('  ·  ')).join('\n') : '';
    const projects = () => $$('.row').map((r) => ({ el: r, no: $('.row-no', r).textContent, title: $('.row-title', r).textContent, sum: $('.row-sum', r).textContent }));
    const SECTIONS = ['about', 'experience', 'work', 'lab', 'terminal', 'contact'];

    const HELP = [
      ['about', 'who I am'], ['experience', 'roles'], ['awards', 'competition results'], ['education', 'degrees'],
      ['work', 'list my projects'], ['open <name|number>', 'open a project, e.g. open auditron'], ['skills', 'languages and tools'],
      ['contact', 'how to reach me'], ['email', 'copy my email address'], ['goto <section>', SECTIONS.join(', ')], ['clear', 'clear the screen']
    ];
    const cmds = {
      help: () => print(HELP.map(([c, d]) => c.padEnd(22) + d).join('\n')),
      about: () => print($$('.about-text p').map((p) => p.textContent.trim()).join('\n\n')),
      whoami: () => print('Muhammad Zian. Computer Science, University of Calgary. Writes motion-planning software for soccer robots.'),
      work: () => print(projects().map((p) => `${p.no}  ${p.title.padEnd(18)} ${p.sum}`).join('\n') + '\n\nTry: open 4'),
      ls: () => cmds.work(),
      open: (arg) => {
        if (!arg) return print('usage: open <name|number>', 'a');
        const all = projects(), n = parseInt(arg, 10);
        const p = n ? all[n - 1] : all.find((q) => q.title.toLowerCase().replace(/\s/g, '').includes(arg.replace(/\s/g, '')));
        if (!p) return print(`no project matches "${arg}". Type work to list them.`, 'a');
        $('.row-head', p.el).setAttribute('aria-expanded', 'true');
        print(`opening ${p.title} ...`, 'a'); jump(p.el);
      },
      experience: () => print(table(0)),
      awards: () => print(table(1)),
      education: () => print(table(2)),
      skills: () => print($$('.facts > div').slice(0, 4).map((d) => $('dt', d).textContent.toUpperCase().padEnd(18) + $('dd', d).textContent).join('\n')),
      contact: () => print('email     muhammadz200513@gmail.com\nlinkedin  linkedin.com/in/mzian\ngithub    github.com/mzian455\n\nTry: email'),
      email: async () => { try { await navigator.clipboard.writeText('muhammadz200513@gmail.com'); print('copied muhammadz200513@gmail.com to your clipboard.', 'a'); } catch (e) { print('muhammadz200513@gmail.com'); } },
      goto: (arg) => { if (!SECTIONS.includes(arg)) return print('usage: goto <' + SECTIONS.join('|') + '>', 'a'); print(`going to ${arg} ...`, 'a'); jump(document.getElementById(arg)); },
      date: () => print(new Date().toString()),
      sudo: () => print('permission denied. Nice try.', 'a'),
      clear: () => { out.textContent = ''; }
    };
    const names = Object.keys(cmds);
    function run(raw) {
      const line = raw.trim(); if (!line) return;
      print(line, 'c');
      const [name, ...rest] = line.toLowerCase().split(/\s+/);
      if (Object.prototype.hasOwnProperty.call(cmds, name)) cmds[name](rest.join(' '));
      else print(`command not found: ${name}. Type help.`, 'a');
    }
    print('Ask me about Muhammad. Type help to see what I know.', 'a');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = input.value; if (v.trim()) { hist.push(v); hi = hist.length; } run(v); input.value = ''; }
      else if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = hist[hi]; e.preventDefault(); } }
      else if (e.key === 'ArrowDown') { if (hi < hist.length - 1) { hi++; input.value = hist[hi]; } else { hi = hist.length; input.value = ''; } }
      else if (e.key === 'Tab' && input.value && !input.value.includes(' ')) {
        const m = names.filter((n) => n.startsWith(input.value.toLowerCase()));
        if (m.length === 1) { input.value = m[0] + ' '; e.preventDefault(); } else if (m.length > 1) { print(m.join('   ')); e.preventDefault(); }
      }
    });
    $$('#term-chips .chip').forEach((c) => c.addEventListener('click', () => { run(c.textContent); input.focus({ preventScroll: true }); }));
    box.addEventListener('click', (e) => { if (!e.target.closest('button') && !window.getSelection().toString()) input.focus({ preventScroll: true }); });
    window.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /input|textarea/i.test(document.activeElement.tagName)) return;
      e.preventDefault(); jump($('#terminal')); input.focus({ preventScroll: true });
    });
  }

  /* =====================================================================
     MOTION: everything scroll-linked runs off one smoothed scroll value
     ===================================================================== */
  function motion() {
    const rail = $('#rail'), heroInner = $('#hero-inner'), hero = $('#top');
    const wordsEl = $('[data-words]');
    let words = [];
    if (wordsEl) {
      const text = wordsEl.textContent.trim().split(/\s+/);
      wordsEl.textContent = '';
      wordsEl.setAttribute('aria-label', text.join(' '));
      text.forEach((t, i) => { const s = document.createElement('span'); s.className = 'w'; s.setAttribute('aria-hidden', 'true'); s.textContent = t; wordsEl.append(s, i < text.length - 1 ? ' ' : ''); });
      words = $$('.w', wordsEl);
      if (reduced) words.forEach((w) => w.classList.add('on'));
    }
    const items = $$('[data-reveal]');
    $$('.rows, .tables').forEach((g) => $$(':scope > [data-reveal]', g).forEach((el, i) => el.style.setProperty('--i', i % 4)));
    if (reduced || !('IntersectionObserver' in window)) items.forEach((el) => el.classList.add('in'));
    else {
      const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -7% 0px' });
      items.forEach((el) => io.observe(el));
    }
    if (reduced) return;

    let target = window.scrollY, cur = target, running = false;
    function frame() {
      cur += (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.05) cur = target;
      const vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
      if (rail) rail.style.transform = `scaleY(${max > 0 ? clamp(cur / max, 0, 1).toFixed(4) : 0})`;
      if (heroInner && window.innerWidth >= 760) {
        const p = clamp(cur / hero.offsetHeight, 0, 1);
        heroInner.style.transform = `translate3d(0, ${(p * hero.offsetHeight * 0.3).toFixed(1)}px, 0) scale(${(1 - p * 0.06).toFixed(4)})`;
        heroInner.style.opacity = (1 - p * 0.75).toFixed(3);
      } else if (heroInner) { heroInner.style.transform = ''; heroInner.style.opacity = ''; }
      if (words.length) {
        const r = wordsEl.getBoundingClientRect();
        const p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.42), 0, 1);
        const n = Math.round(p * words.length * 1.05);
        words.forEach((w, i) => w.classList.toggle('on', i < n));
      }
      if (cur !== target) requestAnimationFrame(frame); else running = false;
    }
    const kick = () => { target = window.scrollY; if (!running) { running = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    running = true; requestAnimationFrame(frame);

    const tagEl = $('#cursor-tag');
    if (tagEl && fine) {
      let x = 0, y = 0, tx = 0, ty = 0, s = 0, ts = 0, on = false;
      const loop = () => {
        x += (tx - x) * 0.18; y += (ty - y) * 0.18; s += (ts - s) * 0.2;
        tagEl.style.setProperty('--x', x.toFixed(1) + 'px'); tagEl.style.setProperty('--y', y.toFixed(1) + 'px'); tagEl.style.setProperty('--s', s.toFixed(3));
        if (ts > 0 || s > 0.01) requestAnimationFrame(loop); else { on = false; tagEl.style.setProperty('--s', '0'); }
      };
      window.addEventListener('mousemove', (e) => {
        tx = e.clientX + 46; ty = e.clientY + 6;
        const head = e.target.closest && e.target.closest('.row-head');
        ts = head ? 1 : 0;
        if (head) tagEl.textContent = head.getAttribute('aria-expanded') === 'true' ? 'Close' : 'Open';
        if (!on && ts) { on = true; x = tx; y = ty; requestAnimationFrame(loop); }
      }, { passive: true });
      document.addEventListener('click', (e) => { const head = e.target.closest && e.target.closest('.row-head'); if (head) setTimeout(() => { tagEl.textContent = head.getAttribute('aria-expanded') === 'true' ? 'Close' : 'Open'; }, 0); });
    }
  }

  /* =====================================================================
     EFFECTS: count-ups, marquee, wordmark, cursor ring, magnets, nav
     ===================================================================== */
  function fx() {
    // stagger paragraphs and table rows
    $$('.about-text > [data-reveal]').forEach((el, i) => el.style.setProperty('--i', i));
    $$('.table').forEach((t) => $$('tr', t).forEach((tr, i) => tr.style.setProperty('--r', i + 1)));

    // wordmark letters
    const wm = $('#wordmark');
    if (wm) {
      const text = wm.textContent; wm.textContent = '';
      [...text].forEach((c, i) => { const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--c', i); s.textContent = c === ' ' ? '\u00a0' : c; wm.appendChild(s); });
    }

    // things that switch on when they enter the view
    const counts = $$('[data-count]');
    const heads = $$('.section-head');
    const fmt = (el, v) => { const d = +(el.dataset.decimals || 0); return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + (el.dataset.suffix || ''); };
    const countUp = (el) => {
      const to = +el.dataset.count;
      if (reduced) { el.textContent = fmt(el, to); return; }
      const t0 = performance.now(), dur = 1600;
      const step = (now) => { const p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(el, to * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    if (reduced || !('IntersectionObserver' in window)) { heads.forEach((h) => h.classList.add('in')); if (wm) wm.classList.add('in'); }
    else {
      const io = new IntersectionObserver((en) => en.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        if (e.target.dataset.count) countUp(e.target); else e.target.classList.add('in');
      }), { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
      heads.forEach((h) => io.observe(h)); counts.forEach((c) => io.observe(c)); if (wm) io.observe(wm);
    }
    if (reduced) return;

    // scroll-linked: robot on the track, marquee, nav
    const stmt = $('#statement'), bot = $('.track-bot'), mq = $('#marquee'), nav = $('#nav');
    let target = window.scrollY, cur = target, running = false, lastY = target, half = 0;
    const measure = () => { if (mq) half = mq.scrollWidth / 2; };
    measure();
    function frame() {
      cur += (target - cur) * 0.12;
      if (Math.abs(target - cur) < 0.05) cur = target;
      const vh = window.innerHeight;
      if (bot && stmt) { const r = stmt.getBoundingClientRect(); bot.style.setProperty('--p', clamp((vh - r.top) / (vh + r.height), 0, 1).toFixed(4)); }
      if (mq && half) mq.style.setProperty('--mx', (-((cur * 0.55) % half)).toFixed(1) + 'px');
      if (cur !== target) requestAnimationFrame(frame); else running = false;
    }
    const kick = () => {
      target = window.scrollY;
      if (nav) { const down = target > lastY + 4, up = target < lastY - 4; if (down && target > window.innerHeight) nav.classList.add('away'); else if (up || target < window.innerHeight) nav.classList.remove('away'); }
      if (Math.abs(target - lastY) > 4) lastY = target;
      if (!running) { running = true; requestAnimationFrame(frame); }
    };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', () => { measure(); kick(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    running = true; requestAnimationFrame(frame);
    if (nav) nav.addEventListener('focusin', () => nav.classList.remove('away'));

    if (!fine) return;
    // cursor ring
    const ring = $('#cursor');
    if (ring) {
      let x = 0, y = 0, tx = 0, ty = 0, s = 1, ts = 1, live = false;
      const loop = () => {
        x += (tx - x) * 0.22; y += (ty - y) * 0.22; s += (ts - s) * 0.18;
        ring.style.setProperty('--x', x.toFixed(1) + 'px'); ring.style.setProperty('--y', y.toFixed(1) + 'px'); ring.style.setProperty('--s', s.toFixed(3));
        if (Math.abs(tx - x) + Math.abs(ty - y) > 0.2 || Math.abs(ts - s) > 0.01) requestAnimationFrame(loop); else live = false;
      };
      window.addEventListener('mousemove', (e) => {
        tx = e.clientX; ty = e.clientY;
        const t = e.target.closest ? e.target : document.body;
        const row = t.closest('.row-head'), hot = t.closest('a, button, input, label'), stageEl = t.closest('.demo-stage, .term');
        ts = row ? 0 : hot ? 1.9 : stageEl ? 0.45 : 1;
        ring.classList.toggle('hot', !!hot && !row); ring.classList.toggle('dark', !!stageEl);
        if (!ring.classList.contains('on')) { x = tx; y = ty; ring.classList.add('on'); }
        if (!live) { live = true; requestAnimationFrame(loop); }
      }, { passive: true });
      document.addEventListener('mouseleave', () => ring.classList.remove('on'));
    }
    // buttons lean toward the cursor
    $$('.copy, .btn, .nav-name, .elsewhere a').forEach((el) => {
      el.classList.add('mag');
      el.addEventListener('mousemove', (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate3d(${((e.clientX - r.left - r.width / 2) * 0.28).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.4).toFixed(1)}px, 0)`; });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* =====================================================================
     SIDE ANIMATIONS: one MQ-9 across three sections.
     About: the parts come together.  Experience: it rolls and takes off.
     Work: it shows up on a ground control display.  All driven by scroll.
     ===================================================================== */
  function uavSide() {
    const NS = 'http://www.w3.org/2000/svg';
    const smooth = (t) => t * t * (3 - 2 * t);
    const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
    // top view, nose up, to scale: 20 m span, 11 m long. Each part: path, exploded offset [dx, dy, rotation], pivot
    const PARTS = [
      { c: 'u-fus', d: 'M100 46C94.5 46 92.5 52 92.5 60C92.5 70 94 78 95 88L96 128L97.5 150L102.5 150L104 128L105 88C106 78 107.5 70 107.5 60C107.5 52 105.5 46 100 46Z', ex: [0, -30, 0], pv: [100, 98] },
      { c: 'u-wing', d: 'M95 90L6 97L6 100.5L95 103Z', ex: [-3, 26, -19], pv: [95, 96] },
      { c: 'u-wing', d: 'M105 90L194 97L194 100.5L105 103Z', ex: [3, 26, 19], pv: [105, 96] },
      { c: 'u-tail', d: 'M98 138L76 152L76 156.5L98 148Z', ex: [-20, 40, -32], pv: [90, 147] },
      { c: 'u-tail', d: 'M102 138L124 152L124 156.5L102 148Z', ex: [20, 40, 32], pv: [110, 147] },
      { c: 'u-prop', d: 'M89 151.6H111V153.4H89ZM98.4 149.6H101.6V155H98.4Z', ex: [0, 62, 90], pv: [100, 152.5] },
      { c: 'u-eye', d: 'M100 50.2A2.8 2.8 0 1 0 100 55.8A2.8 2.8 0 1 0 100 50.2Z', ex: [0, -54, 0], pv: [100, 53] }
    ];
    const DETAIL = '<path class="u-det" d="M100 62V86M96.3 132H103.7M70 96.2V102.1M130 96.2V102.1M45 98.1V101.2M155 98.1V101.2"/>';
    const whole = (cls = '') => `<g class="uav ${cls}">${PARTS.map((p) => `<path class="${p.c}" d="${p.d}"/>`).join('')}${DETAIL}</g>`;

    const make = (id, name, svg, extra = '') => {
      const sec = document.getElementById(id), head = sec && $('.section-head', sec);
      if (!head) return null;
      const box = document.createElement('div'); box.className = 'mini'; box.setAttribute('aria-hidden', 'true');
      box.innerHTML = `${svg}${extra}<p class="label mini-read"><span>${name}</span><b></b></p>`;
      head.appendChild(box);
      return { sec, box, read: $('.mini-read b', box), cur: 0, p: -1 };
    };

    /* ---- 1. assembly ---- */
    const A = make('about', '01 Assembly', `<svg viewBox="0 0 200 250" xmlns="${NS}"><g transform="translate(0 22)">
      ${PARTS.map((p, i) => `<path class="u-guide" data-g="${i}" d="M${p.pv[0]} ${p.pv[1]}L${p.pv[0] + p.ex[0]} ${p.pv[1] + p.ex[1]}"/>`).join('')}
      ${PARTS.map((p, i) => `<path class="${p.c}" data-i="${i}" d="${p.d}"/>`).join('')}
      <g class="u-final">${DETAIL}<path class="u-dim" d="M6 186H194M6 181V191M194 181V191"/><text class="u-txt" x="100" y="201" text-anchor="middle">SPAN 20 M</text></g>
    </g></svg>`);
    if (A) { A.parts = $$('[data-i]', A.box); A.guides = $$('[data-g]', A.box); A.fin = $('.u-final', A.box); }
    const drawA = (p) => {
      let done = 0;
      PARTS.forEach((part, i) => {
        const e = smooth(seg(p, i * 0.085, 0.42 + i * 0.085)), k = 1 - e;
        if (e >= 0.999) done++;
        A.parts[i].setAttribute('transform', `translate(${(part.ex[0] * k).toFixed(2)} ${(part.ex[1] * k).toFixed(2)}) rotate(${(part.ex[2] * k).toFixed(2)} ${part.pv[0]} ${part.pv[1]})`);
        A.guides[i].style.opacity = (k * 0.9).toFixed(3);
      });
      A.fin.style.opacity = seg(p, 0.9, 1).toFixed(3);
      A.read.textContent = `${done} / ${PARTS.length} parts`;
    };

    /* ---- 2. runway and takeoff ---- */
    const B = make('experience', '02 Takeoff', `<svg viewBox="0 0 200 250" xmlns="${NS}">
      <defs><clipPath id="rw-clip"><rect x="0" y="0" width="200" height="250"/></clipPath><filter id="rw-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
      <g clip-path="url(#rw-clip)">
        <g class="rw">
          <rect class="rw-surf" x="58" y="-20" width="84" height="290"/>
          <path class="rw-edge" d="M62 -20V270M138 -20V270"/>
          <g class="rw-marks"><path class="rw-dash" d="M100 -300V600"/><g class="rw-thr">${[66, 73, 80, 87, 109, 116, 123, 130].map((x) => `<rect x="${x}" y="148" width="4" height="22"/>`).join('')}</g>
          <text class="rw-num" x="100" y="138" text-anchor="middle">27</text></g>
        </g>
        <g class="u-shadow" filter="url(#rw-blur)">${whole('shadow')}</g>
        <g class="u-plane">${whole()}</g>
      </g></svg>`);
    if (B) { B.rw = $('.rw', B.box); B.marks = $('.rw-marks', B.box); B.sh = $('.u-shadow', B.box); B.pl = $('.u-plane', B.box); }
    const place = (g, x, y, s) => g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(4)}) translate(-100 -98)`);
    const drawB = (p) => {
      const zoom = smooth(seg(p, 0, 0.26));                 // camera pulls back until the runway fits
      const roll = seg(p, 0.26, 0.74), lift = smooth(seg(p, 0.7, 1));
      const s = 1 - zoom * 0.66 + lift * 0.3;
      const dist = roll * roll * 520 + lift * 260;           // accelerating ground roll
      const y = 120 + zoom * 78 - Math.min(dist, 110) - lift * 150;
      B.rw.style.opacity = zoom.toFixed(3);
      B.marks.setAttribute('transform', `translate(0 ${(Math.max(0, dist - 110)).toFixed(2)})`);
      place(B.pl, 100, y, s);
      place(B.sh, 100 + lift * 16, y + lift * 26, s * (1 - lift * 0.12));
      B.sh.style.opacity = (zoom * 0.22 * (1 - lift * 0.75)).toFixed(3);
      B.read.textContent = p < 0.26 ? 'Lined up' : lift > 0.05 ? 'Airborne' : `${Math.round(roll * roll * 210)} km/h`;
    };

    /* ---- 3. ground control ---- */
    const TRACK = 'M34 128C24 96 40 52 78 38S150 30 168 62S160 118 124 122S84 104 64 124S44 150 34 128Z';
    const C = make('work', '03 Control', `<svg viewBox="0 0 200 172" xmlns="${NS}">
      <rect class="gc-frame" x="0.5" y="0.5" width="199" height="171"/>
      <path class="gc-grid" d="M40 0V172M80 0V172M120 0V172M160 0V172M0 43H200M0 86H200M0 129H200"/>
      <circle class="gc-ring" cx="34" cy="128" r="26"/><rect class="gc-home" x="31" y="125" width="6" height="6"/><text class="u-txt" x="44" y="146">BASE</text>
      <path class="gc-plan" d="${TRACK}"/><path class="gc-flown" d="${TRACK}"/>
      ${[[78, 38, 'WP1'], [168, 62, 'WP2'], [124, 122, 'WP3']].map((w) => `<rect class="gc-wp" x="${w[0] - 3}" y="${w[1] - 3}" width="6" height="6"/><text class="u-txt" x="${w[0] + 7}" y="${w[1] - 6}">${w[2]}</text>`).join('')}
      <g class="gc-uav">${whole()}</g>
    </svg>`, `<dl class="gc-data label"><div><dt>Alt</dt><dd data-k="alt">0 m</dd></div><div><dt>Spd</dt><dd data-k="spd">0 km/h</dd></div><div><dt>Hdg</dt><dd data-k="hdg">000°</dd></div><div><dt>Endur</dt><dd data-k="end">27:00</dd></div><div><dt>Link</dt><dd><i></i>Satcom</dd></div><div><dt>Feed</dt><dd>Simulated</dd></div></dl>`);
    if (C) {
      C.flown = $('.gc-flown', C.box); C.len = C.flown.getTotalLength(); C.icon = $('.gc-uav', C.box);
      C.flown.style.strokeDasharray = C.len;
      C.k = {}; $$('[data-k]', C.box).forEach((d) => { C.k[d.dataset.k] = d; });
    }
    const drawC = (p) => {
      const d = p * C.len, a = C.flown.getPointAtLength(d), b = C.flown.getPointAtLength(Math.min(C.len, d + 1.5));
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      C.flown.style.strokeDashoffset = (C.len - d).toFixed(2);
      C.icon.setAttribute('transform', `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) rotate(${(ang + 90).toFixed(1)}) scale(0.15) translate(-100 -98)`);
      const up = smooth(seg(p, 0, 0.4));
      const mins = Math.round(27 * 60 - p * 190);
      C.k.alt.textContent = Math.round(7600 * up).toLocaleString('en-US') + ' m';
      C.k.spd.textContent = (p > 0.002 ? Math.round(150 + 160 * up) : 0) + ' km/h';
      C.k.hdg.textContent = String(Math.round(((ang + 90) % 360 + 360) % 360)).padStart(3, '0') + '°';
      C.k.end.textContent = Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
      C.read.textContent = Math.round(p * 100) + '%';
    };

    const items = [[A, drawA], [B, drawB], [C, drawC]].filter((x) => x[0]);
    if (!items.length) return;
    if (reduced) { items.forEach(([it, draw]) => draw(it === B ? 0.5 : 1)); return; }
    let running = false;
    function frame() {
      const vh = window.innerHeight; let moving = false;
      for (const [it, draw] of items) {
        const r = it.sec.getBoundingClientRect();
        const target = clamp((vh * 0.6 - r.top) / Math.max(1, r.height - vh * 0.2), 0, 1);
        it.cur += (target - it.cur) * 0.1;
        if (Math.abs(target - it.cur) < 0.0006) it.cur = target; else moving = true;
        if (it.cur !== it.p) { it.p = it.cur; draw(it.cur); }
      }
      if (moving) requestAnimationFrame(frame); else running = false;
    }
    const kick = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    items.forEach(([it, draw]) => draw(0));
    kick();
  }

  motion();
  fx();
  uavSide();
  kalman();
  pid();
  response();
  tactics();
  v2v();
  terminal();
})();
