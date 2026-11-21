(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =====================================================================
     HERO: a real A* route planner.
     The headline, the nav and the caption are obstacles too, so the route
     never runs under the type.
     ===================================================================== */
  function planner() {
    const cv = $('#field');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const statEl = $('#field-stat'), noteEl = $('#field-note'), hintEl = $('#field-hint');
    const modeBtns = $$('.mode');
    const INK = '#151513', MUTE = '#6d6a63', ACCENT = '#ff4f00', PAPER = '#f2f0eb';
    const NOTES = {
      robots: 'Robot soccer: the robot replans as opponents move.',
      drones: 'Drone missions: every route is checked against no-fly zones.',
      pipelines: 'Pipelines: the shortest line crosses protected land, so the route goes around it.'
    };

    let w = 0, h = 0, cell = 14, cols = 0, rows = 0, N = 0;
    let mask, blocked, gScore, came, closed;
    let mode = 'robots', visible = true, running = false, dirty = true;
    let path = [], explored = [], searched = 0, ms = 0, replans = 0, noRoute = false;
    let lastPlan = 0, lastStat = 0, prog = 0, last = performance.now();
    const S = { x: 0, y: 0 }, G = { x: 0, y: 0 }, agent = { x: 0, y: 0, a: 0 };
    const obs = [];
    let dots = null, hatch = null;
    let dragging = null, off = { x: 0, y: 0 }, downAt = null;
    const ripples = [], born = performance.now();

    /* ---------- layout ---------- */
    const WIDE = { S: [0.08, 0.7], G: [0.9, 0.2], O: [[0.24, 0.42], [0.4, 0.26], [0.5, 0.6], [0.63, 0.38], [0.76, 0.7], [0.8, 0.22], [0.36, 0.78]] };
    const TALL = { S: [0.1, 0.86], G: [0.88, 0.14], O: [[0.3, 0.28], [0.64, 0.3], [0.46, 0.56], [0.78, 0.66], [0.24, 0.66]] };

    function place() {
      const L = w < 760 ? TALL : WIDE;
      const r = clamp(Math.min(w, h) * 0.052, 20, 42);
      S.x = L.S[0] * w; S.y = L.S[1] * h; G.x = L.G[0] * w; G.y = L.G[1] * h;
      agent.x = S.x; agent.y = S.y;
      obs.length = 0;
      L.O.forEach((o, i) => {
        const shape = [];
        for (let k = 0; k < 10; k++) shape.push(0.8 + ((Math.sin(i * 7.3 + k * 2.1) + 1) / 2) * 0.32);
        obs.push({ x: o[0] * w, y: o[1] * h, bx: o[0] * w, by: o[1] * h, r: r * (0.85 + ((i * 37) % 5) * 0.08), ph: i * 1.7, shape });
      });
    }

    function resize() {
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ow = w, oh = h;
      w = rect.width; h = rect.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = w < 760 ? 12 : 14;
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell); N = cols * rows;
      mask = new Uint8Array(N); blocked = new Uint8Array(N);
      gScore = new Float32Array(N); came = new Int32Array(N); closed = new Uint8Array(N);
      if (!obs.length || (ow < 760) !== (w < 760)) place();
      else {
        const sx = w / ow, sy = h / oh;
        for (const p of [S, G, agent]) { p.x *= sx; p.y *= sy; }
        for (const o of obs) { o.x *= sx; o.y *= sy; o.bx *= sx; o.by *= sy; }
      }
      makePatterns();
      buildMask();
      dirty = true;
      if (reduced) frame(performance.now());
    }

    function makePatterns() {
      const d = document.createElement('canvas'); d.width = d.height = 28;
      const dc = d.getContext('2d'); dc.fillStyle = 'rgba(21,21,19,0.17)'; dc.fillRect(13.5, 13.5, 1.2, 1.2);
      dots = ctx.createPattern(d, 'repeat');
      const hc = document.createElement('canvas'); hc.width = hc.height = 8;
      const hx = hc.getContext('2d'); hx.strokeStyle = 'rgba(21,21,19,0.32)'; hx.lineWidth = 1;
      hx.beginPath(); hx.moveTo(-2, 10); hx.lineTo(10, -2); hx.moveTo(-2, 2); hx.lineTo(2, -2); hx.moveTo(6, 10); hx.lineTo(10, 6); hx.stroke();
      hatch = ctx.createPattern(hc, 'repeat');
    }

    /* the type on the page becomes part of the map */
    function buildMask() {
      mask.fill(0);
      const cr = cv.getBoundingClientRect();
      const rects = [];
      const navEl = $('#nav');
      if (navEl) rects.push(navEl.getBoundingClientRect());
      const h1 = $('#headline');
      if (h1) { const rg = document.createRange(); rg.selectNodeContents(h1); rects.push(...rg.getClientRects()); }
      for (const id of ['hero-meta', 'field-info']) { const el = document.getElementById(id); if (el) rects.push(el.getBoundingClientRect()); }
      const pad = 12;
      for (const r of rects) {
        const x0 = r.left - cr.left - pad, y0 = r.top - cr.top - pad, x1 = r.right - cr.left + pad, y1 = r.bottom - cr.top + pad;
        if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
        const c0 = clamp(Math.floor(x0 / cell), 0, cols - 1), c1 = clamp(Math.floor(x1 / cell), 0, cols - 1);
        const r0 = clamp(Math.floor(y0 / cell), 0, rows - 1), r1 = clamp(Math.floor(y1 / cell), 0, rows - 1);
        for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) mask[y * cols + x] = 1;
      }
    }

    function rebuildBlocked() {
      blocked.set(mask);
      const margin = 13;
      for (const o of obs) {
        const R = o.r * (mode === 'pipelines' ? 1.12 : 1) + margin;
        const c0 = clamp(Math.floor((o.x - R) / cell), 0, cols - 1), c1 = clamp(Math.floor((o.x + R) / cell), 0, cols - 1);
        const r0 = clamp(Math.floor((o.y - R) / cell), 0, rows - 1), r1 = clamp(Math.floor((o.y + R) / cell), 0, rows - 1);
        for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
          const dx = (x + 0.5) * cell - o.x, dy = (y + 0.5) * cell - o.y;
          if (dx * dx + dy * dy < R * R) blocked[y * cols + x] = 1;
        }
      }
    }

    /* ---------- search ---------- */
    const cellAt = (x, y) => clamp(Math.floor(y / cell), 0, rows - 1) * cols + clamp(Math.floor(x / cell), 0, cols - 1);
    function nearestFree(idx) {
      if (!blocked[idx]) return idx;
      const cx = idx % cols, cy = (idx / cols) | 0;
      for (let r = 1; r < 40; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          if (!blocked[y * cols + x]) return y * cols + x;
        }
      }
      return -1;
    }

    function astar(start, goal) {
      gScore.fill(Infinity); came.fill(-1); closed.fill(0);
      explored = [];
      const hf = [], hi = [];                                   // binary heap: f-scores and cell indices
      const push = (f, i) => {
        let n = hf.length; hf.push(f); hi.push(i);
        while (n > 0) { const p = (n - 1) >> 1; if (hf[p] <= hf[n]) break; [hf[p], hf[n]] = [hf[n], hf[p]]; [hi[p], hi[n]] = [hi[n], hi[p]]; n = p; }
      };
      const pop = () => {
        const top = hi[0], lf = hf.pop(), li = hi.pop();
        if (hf.length) {
          hf[0] = lf; hi[0] = li;
          let n = 0;
          for (;;) {
            const l = n * 2 + 1, r = l + 1; let m = n;
            if (l < hf.length && hf[l] < hf[m]) m = l;
            if (r < hf.length && hf[r] < hf[m]) m = r;
            if (m === n) break;
            [hf[m], hf[n]] = [hf[n], hf[m]]; [hi[m], hi[n]] = [hi[n], hi[m]]; n = m;
          }
        }
        return top;
      };
      const gx = goal % cols, gy = (goal / cols) | 0;
      const heur = (i) => { const dx = Math.abs((i % cols) - gx), dy = Math.abs(((i / cols) | 0) - gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
      gScore[start] = 0; push(heur(start), start);
      while (hf.length) {
        const cur = pop();
        if (closed[cur]) continue;
        closed[cur] = 1; explored.push(cur);
        if (cur === goal) break;
        const cx = cur % cols, cy = (cur / cols) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const n = y * cols + x;
          if (blocked[n] || closed[n]) continue;
          if (dx && dy && (blocked[cy * cols + x] || blocked[y * cols + cx])) continue;   // no cutting corners
          const g = gScore[cur] + (dx && dy ? Math.SQRT2 : 1);
          if (g < gScore[n]) { gScore[n] = g; came[n] = cur; push(g + heur(n), n); }
        }
      }
      if (!closed[goal]) return null;
      const out = [];
      for (let c = goal; c !== -1; c = came[c]) out.push(c);
      return out.reverse();
    }

    function clear(a, b) {                                       // line of sight between two cells
      const ax = a % cols, ay = (a / cols) | 0, bx = b % cols, by = (b / cols) | 0;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2.5);
      for (let i = 1; i < steps; i++) {
        const t = i / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (blocked[Math.round(y) * cols + Math.round(x)] || blocked[Math.floor(y) * cols + Math.floor(x)] || blocked[Math.ceil(y) * cols + Math.ceil(x)]) return false;
      }
      return true;
    }

    function plan(now) {
      const t = performance.now();
      rebuildBlocked();
      const from = mode === 'robots' ? agent : S;
      const sc = nearestFree(cellAt(from.x, from.y)), gc = nearestFree(cellAt(G.x, G.y));
      const cells = sc >= 0 && gc >= 0 ? astar(sc, gc) : null;
      searched = explored.length;
      noRoute = !cells;
      if (cells) {
        const sm = [cells[0]];                                   // pull the path tight
        let i = 0;
        while (i < cells.length - 1) {
          let j = cells.length - 1;
          while (j > i + 1 && !clear(cells[i], cells[j])) j--;
          sm.push(cells[j]); i = j;
        }
        path = sm.map((c) => ({ x: ((c % cols) + 0.5) * cell, y: (((c / cols) | 0) + 0.5) * cell }));
        if (!blocked[cellAt(from.x, from.y)]) path[0] = { x: from.x, y: from.y };
        if (!blocked[cellAt(G.x, G.y)]) path[path.length - 1] = { x: G.x, y: G.y };
      } else path = [];
      ms = performance.now() - t;
      replans++;
      lastPlan = now; dirty = false;
    }

    const pathLen = () => { let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); return L; };
    function pointAt(d) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], l = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= l || i === path.length - 1) { const t = l ? clamp(d / l, 0, 1) : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) }; }
        d -= l;
      }
      return { x: S.x, y: S.y, a: 0 };
    }

    function newGoal() {
      for (let k = 0; k < 60; k++) {
        const x = (0.06 + Math.random() * 0.88) * w, y = (0.08 + Math.random() * 0.84) * h;
        if (blocked[cellAt(x, y)] || Math.hypot(x - agent.x, y - agent.y) < Math.min(w, h) * 0.35) continue;
        G.x = x; G.y = y; return;
      }
    }

    /* ---------- simulation ---------- */
    function update(dt, now) {
      const t = now / 1000;
      if (mode === 'robots' && !reduced) {
        for (const o of obs) {
          if (o === dragging) continue;
          o.x = o.bx + Math.sin(t * 0.5 + o.ph) * 30;
          o.y = o.by + Math.cos(t * 0.37 + o.ph * 1.7) * 24;
        }
        if (now - lastPlan > 90) dirty = true;
      }
      if (dirty) plan(now);

      if (reduced) return;
      if (mode === 'robots' && path.length > 1) {
        let step = 120 * dt, i = 1;
        while (step > 0 && i < path.length) {
          const dx = path[i].x - agent.x, dy = path[i].y - agent.y, d = Math.hypot(dx, dy);
          if (d < 0.001) { i++; continue; }
          const m = Math.min(d, step);
          agent.x += (dx / d) * m; agent.y += (dy / d) * m; agent.a = Math.atan2(dy, dx);
          step -= m; if (m === d) i++;
        }
        if (Math.hypot(G.x - agent.x, G.y - agent.y) < 12) { newGoal(); dirty = true; }
      } else if (mode === 'drones' && path.length > 1) {
        prog += 90 * dt;
        if (prog >= pathLen()) { const sx = S.x, sy = S.y; S.x = G.x; S.y = G.y; G.x = sx; G.y = sy; prog = 0; dirty = true; }
        const p = pointAt(prog); agent.x = p.x; agent.y = p.y; agent.a = p.a;
      }
    }

    /* ---------- drawing ---------- */
    function blob(o) {
      const pts = o.shape.map((s, k) => { const a = (k / o.shape.length) * 6.2832; return [o.x + Math.cos(a) * o.r * s, o.y + Math.sin(a) * o.r * s]; });
      ctx.beginPath();
      const n = pts.length;
      ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
      for (let k = 0; k < n; k++) { const nx = pts[(k + 1) % n]; ctx.quadraticCurveTo(pts[k][0], pts[k][1], (pts[k][0] + nx[0]) / 2, (pts[k][1] + nx[1]) / 2); }
      ctx.closePath();
    }
    function label(text, x, y, color = MUTE) {
      ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function draw(now) {
      const ei = reduced ? 1 : 1 - Math.pow(1 - clamp((now - born) / 1500, 0, 1), 3);     // opening: the field assembles
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dots; ctx.fillRect(0, 0, w, h);

      // pitch markings, drawn like a plan
      if (w >= 760) {
        const m = Math.max(20, w * 0.03), top = 70, fw = w - m * 2, fh = h - top - m;
        const cy = top + fh / 2, da = Math.min(fw * 0.1, 120), dh = fh * 0.44;
        ctx.strokeStyle = `rgba(21,21,19,${(0.2 * ei).toFixed(3)})`; ctx.lineWidth = 1;
        ctx.strokeRect(m, top, fw, fh);
        ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.lineTo(w / 2, top + fh); ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2, cy, fh * 0.13, 0, 6.2832); ctx.stroke();
        ctx.strokeRect(m, cy - dh / 2, da, dh); ctx.strokeRect(w - m - da, cy - dh / 2, da, dh);
        ctx.strokeRect(m - 9, cy - fh * 0.085, 9, fh * 0.17); ctx.strokeRect(w - m, cy - fh * 0.085, 9, fh * 0.17);
      }

      // what the search looked at
      ctx.fillStyle = 'rgba(255,79,0,0.075)';
      for (const c of explored) ctx.fillRect((c % cols) * cell + 0.5, ((c / cols) | 0) * cell + 0.5, cell - 1, cell - 1);

      // the straight line that would be shortest
      if (mode === 'pipelines') {
        ctx.strokeStyle = MUTE; ctx.lineWidth = 1; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(G.x, G.y); ctx.stroke(); ctx.setLineDash([]);
      }

      // obstacles
      for (const o of obs) {
        if (mode === 'robots') {
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * ei, 0, 6.2832);
          ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(o.x, o.y, 2.5, 0, 6.2832); ctx.fillStyle = INK; ctx.fill();
        } else if (mode === 'drones') {
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832);
          ctx.fillStyle = PAPER; ctx.fill(); ctx.fillStyle = hatch; ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
          label('NO-FLY', o.x, o.y + o.r + 12);
        } else {
          blob(o);
          ctx.fillStyle = PAPER; ctx.fill(); ctx.fillStyle = hatch; ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
          label('PROTECTED', o.x, o.y + o.r * 1.12 + 12);
        }
      }

      // the route
      if (path.length > 1) {
        ctx.strokeStyle = ACCENT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.lineWidth = mode === 'pipelines' ? 5 : 2.25;
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length - 1; i++) ctx.arcTo(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, 18);
        ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
        ctx.stroke();
        if (mode === 'drones') {
          for (let i = 1; i < path.length - 1; i++) {
            ctx.fillStyle = PAPER; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5;
            ctx.fillRect(path[i].x - 4, path[i].y - 4, 8, 8); ctx.strokeRect(path[i].x - 4, path[i].y - 4, 8, 8);
          }
        }
      }

      // start and goal
      if (mode === 'robots') {
        ctx.beginPath(); ctx.arc(G.x, G.y, 12, 0, 6.2832); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(G.x, G.y, 4.5, 0, 6.2832); ctx.fillStyle = INK; ctx.fill();
      } else {
        ctx.fillStyle = INK; ctx.fillRect(S.x - 5, S.y - 5, 10, 10);
        label('A', S.x, S.y + 18, INK);
        ctx.beginPath(); ctx.arc(G.x, G.y, 7, 0, 6.2832); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(G.x, G.y, 2.2, 0, 6.2832); ctx.fillStyle = INK; ctx.fill();
        label('B', G.x, G.y - 18, INK);
      }

      // ripples where the ball was dropped
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].t) / 1000;
        if (age > 0.8) { ripples.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(ripples[i].x, ripples[i].y, 12 + age * 110, 0, 6.2832);
        ctx.strokeStyle = `rgba(255,79,0,${(1 - age / 0.8).toFixed(3)})`; ctx.lineWidth = 2; ctx.stroke();
      }

      // the thing that moves
      if (mode === 'robots') {
        ctx.save(); ctx.translate(agent.x, agent.y);
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.2832); ctx.fillStyle = ACCENT; ctx.fill();
        ctx.rotate(agent.a); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.restore();
      } else if (mode === 'drones' && !reduced && path.length > 1) {
        ctx.save(); ctx.translate(agent.x, agent.y); ctx.rotate(agent.a);
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7); ctx.closePath();
        ctx.fillStyle = ACCENT; ctx.fill(); ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }

      if (now - lastStat > 220) {
        lastStat = now;
        statEl.textContent = noRoute ? 'A* search · no route. Move an opponent.'
          : `A* search · ${searched.toLocaleString('en-US')} cells explored · ${ms.toFixed(1)} ms · ${replans.toLocaleString('en-US')} replans`;
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      update(dt, now);
      draw(now);
    }
    function loop(now) {
      if (!visible || document.hidden) { running = false; return; }
      frame(now);
      requestAnimationFrame(loop);
    }
    function start() {
      if (reduced) { frame(performance.now()); return; }
      if (running || !visible) return;
      running = true; last = performance.now();
      requestAnimationFrame(loop);
    }

    /* ---------- interaction ---------- */
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function pick(p) {
      if (Math.hypot(p.x - G.x, p.y - G.y) < 20) return G;
      if (mode !== 'robots' && Math.hypot(p.x - S.x, p.y - S.y) < 20) return S;
      for (const o of obs) if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + 6) return o;
      return null;
    }
    cv.addEventListener('pointerdown', (e) => {
      const p = local(e);
      downAt = p;
      dragging = pick(p);
      if (dragging) {
        off = { x: p.x - dragging.x, y: p.y - dragging.y };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        cv.style.cursor = 'grabbing';
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (dragging) {
        dragging.x = clamp(p.x - off.x, 0, w); dragging.y = clamp(p.y - off.y, 0, h);
        if ('bx' in dragging) { dragging.bx = dragging.x; dragging.by = dragging.y; }
        dirty = true;
        if (mode === 'drones') prog = 0;
        if (reduced) frame(performance.now());
      } else cv.style.cursor = pick(p) ? 'grab' : 'crosshair';
    });
    const release = (e) => {
      if (!dragging && downAt && e.type === 'pointerup') {
        const p = local(e);
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6 && !mask[cellAt(p.x, p.y)]) {
          G.x = p.x; G.y = p.y; dirty = true; if (mode === 'drones') prog = 0;
          ripples.push({ x: p.x, y: p.y, t: performance.now() });
          if (reduced) frame(performance.now());
        }
      }
      dragging = null; downAt = null; cv.style.cursor = 'crosshair';
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);

    function setMode(m) {
      if (m === mode) return;
      mode = m; prog = 0; replans = 0;
      if (m === 'robots') { agent.x = S.x; agent.y = S.y; }
      else { for (const o of obs) { o.x = o.bx; o.y = o.by; } }
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      noteEl.textContent = NOTES[m];
      dirty = true; lastStat = 0;
      if (reduced) frame(performance.now());
    }
    modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    if (coarse) hintEl.textContent = 'Tap the field to move the ball.';
    window.addEventListener('resize', resize);
    if ('ResizeObserver' in window) {                            // the field can change size without the window doing so
      new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1) resize(); }).observe(cv);
    }
    document.addEventListener('visibilitychange', start);
    if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; start(); }).observe(cv);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { buildMask(); dirty = true; if (reduced) frame(performance.now()); });
    resize();
    start();
  }

  /* =====================================================================
     PAGE
     ===================================================================== */
  function nav() {
    const bar = $('#nav');
    const links = $$('#nav nav a');
    const targets = links.map((a) => $(a.getAttribute('href')));
    let ticking = false;
    const update = () => {
      ticking = false;
      bar.classList.toggle('scrolled', window.scrollY > window.innerHeight - 80);
      let active = null;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= window.innerHeight * 0.4) active = links[i]; });
      links.forEach((l) => l.classList.toggle('active', l === active));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function rows() {
    $$('.row-head').forEach((btn) => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  function copyEmail() {
    const btn = $('#copy');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      let ok = false;
      try { await navigator.clipboard.writeText(email); ok = true; } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = email; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (err) {}
        ta.remove();
      }
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      btn.classList.toggle('done', ok);
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1800);
    });
  }

  function clock() {
    const el = $('#clock');
    if (el) {
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hour12: false });
        const tick = () => { el.textContent = fmt.format(new Date()); };
        tick(); setInterval(tick, 20000);
      } catch (e) {}
    }
    const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  }

  planner();
  nav();
  rows();
  copyEmail();
  clock();
})();
