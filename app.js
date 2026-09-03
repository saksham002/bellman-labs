/* pi* — deck controller and interactions. Content is readable without JS. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const onSlide = (id, fn) => document.addEventListener('slidechange', (e) => fn(e.detail.id === id, e.detail));

  /* ---------- deck: one slide per deck page, flipped on scroll ---------- */
  const deck = (() => {
    const slides = $$('.deck .slide'); const ids = slides.map((s) => s.id);
    let cur = -1, busy = false, lastFlip = 0, acc = 0;
    const dots = document.createElement('nav'); dots.className = 'dots'; dots.setAttribute('aria-label', 'Pages');
    slides.forEach((s, i) => { const b = document.createElement('button'); b.dataset.label = s.dataset.label || s.id; b.setAttribute('aria-label', 'Go to ' + b.dataset.label); b.addEventListener('click', () => go(i)); dots.appendChild(b); });
    document.body.appendChild(dots);
    const links = $$('.nav-links a'), dotBtns = $$('button', dots);
    function paint() {
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + ids[cur]));
      dotBtns.forEach((b, i) => b.classList.toggle('on', i === cur));
    }
    function reveal(slide) {
      const els = $$('[data-reveal]', slide); els.forEach((el) => el.classList.remove('in'));
      void slide.offsetWidth; setTimeout(() => els.forEach((el) => el.classList.add('in')), 80);
    }
    function go(i, animate = true) {
      i = clamp(i, 0, slides.length - 1); if (i === cur || busy) return;
      const from = slides[cur], to = slides[i], fwd = i > cur, anim = animate && !reduced;
      if (anim) { to.classList.add(fwd ? 'from-below' : 'from-above'); void to.offsetWidth; to.classList.remove('from-below', 'from-above'); }
      to.classList.add('active'); to.scrollTop = 0;
      if (from) { from.classList.remove('active'); if (anim) from.classList.add(fwd ? 'to-above' : 'to-below'); }
      cur = i; busy = anim; lastFlip = performance.now(); acc = 0;
      if (anim) setTimeout(() => { from && from.classList.remove('to-above', 'to-below'); busy = false; }, 900);
      try { history.replaceState(null, '', '#' + ids[i]); } catch (_) {}
      paint(); reveal(to);
      document.dispatchEvent(new CustomEvent('slidechange', { detail: { id: ids[i], index: i } }));
    }
    document.addEventListener('wheel', (e) => {
      const s = slides[cur]; const dir = e.deltaY > 0 ? 1 : -1;
      const canScroll = dir > 0 ? s.scrollTop + s.clientHeight < s.scrollHeight - 1 : s.scrollTop > 0;
      if (canScroll) { acc = 0; return; }
      e.preventDefault();
      if (busy || performance.now() - lastFlip < 1100) return;
      acc += e.deltaY; if (Math.abs(acc) < 30) return;
      go(cur + dir);
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && e.target === document.body)) { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
      else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
    });
    let ty = 0, atTop = false, atBot = false;
    document.addEventListener('touchstart', (e) => { const s = slides[cur]; ty = e.touches[0].clientY; atTop = s.scrollTop <= 0; atBot = s.scrollTop + s.clientHeight >= s.scrollHeight - 1; }, { passive: true });
    document.addEventListener('touchend', (e) => { const dy = ty - e.changedTouches[0].clientY; if (dy > 70 && atBot) go(cur + 1); else if (dy < -70 && atTop) go(cur - 1); }, { passive: true });
    document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const i = ids.indexOf(a.getAttribute('href').slice(1)); if (i >= 0) { e.preventDefault(); go(i); } });
    window.addEventListener('hashchange', () => { const i = ids.indexOf(location.hash.slice(1)); if (i >= 0) go(i); });
    go(Math.max(0, ids.indexOf(location.hash.slice(1))), false);
    return { go, get id() { return ids[cur]; } };
  })();

  /* ---------- hero tagline letters ---------- */
  const tag = $('#tagline');
  if (tag) { const text = tag.textContent; tag.textContent = ''; [...text].forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.style.animationDelay = (600 + i * 45) + 'ms'; tag.appendChild(s); }); }

  /* ---------- hero: live order book ----------
     Columns are time steps streaming in from the right. The mid price random-walks
     like a real instrument; ask depth stacks above it in slate blue, bid depth
     below it in gold. Trades print green (buy lifts the ask) or red (sell hits
     the bid) at the touch. The probe reads the book qualitatively. */
  (() => {
    const cv = $('#book'); if (!cv) return;
    const ctx = cv.getContext('2d'); const probe = $('#probe');
    const CELL = 8, PITCH = 11, ROWS = 12, RANGE = 4.2;
    const BID = [195, 154, 85], ASK = [92, 117, 144], UP = [62, 155, 110], DOWN = [184, 84, 80];
    let W = 0, H = 0, cols = 0, baseY = 0, cells = [], offset = 0, hoverCol = -1, mouse = null, flashes = [], active = true;
    let bidD = 7, askD = 7, mid = 0, vel = 0, drift = 0;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    function newCol() {
      drift = clamp(drift + rand(-0.08, 0.08) - drift * 0.05, -0.35, 0.35);           // slow regime
      vel = clamp(vel * 0.72 + rand(-0.5, 0.5) + drift, -1.3, 1.3);                     // momentum
      const jump = Math.random() < 0.035 ? rand(-1.6, 1.6) : 0;                          // occasional gap
      mid = clamp(mid + vel * 0.35 + jump - mid * 0.015, -RANGE, RANGE);                 // price in rows
      bidD = clamp(bidD + rand(-1.1, 1.1) + (7 - bidD) * 0.1 - vel * 0.35, 1, ROWS);   // thinner on the side price moves toward
      askD = clamp(askD + rand(-1.1, 1.1) + (7 - askD) * 0.1 + vel * 0.35, 1, ROWS);
      const b = Math.round(bidD), a = Math.round(askD);
      const tones = Array.from({ length: ROWS * 2 }, () => rand(0.55, 1));
      const marks = [], r = Math.random(), pBuy = 0.06 + (vel > 0.2 ? 0.1 : 0), pSell = 0.06 + (vel < -0.2 ? 0.1 : 0);
      if (r < pBuy) marks.push({ side: 1, row: 0 }); else if (r < pBuy + pSell) marks.push({ side: -1, row: 0 });
      if (marks.length && Math.random() < 0.3) marks.push({ side: marks[0].side, row: 1 });
      return { b, a, tones, marks, mid, vel };
    }
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / PITCH) + 2; baseY = H - 200;
      while (cells.length < cols) cells.push(newCol());
      while (cells.length > cols) cells.shift();
    }
    const midY = (c) => baseY - c.mid * PITCH;
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i], x = i * PITCH - offset; if (x + CELL < 0 || x > W) continue;
        const my = midY(c), hov = i === hoverCol;
        for (let r = 0; r < c.a; r++) {
          const y = my - 6 - (r + 1) * PITCH + (PITCH - CELL);
          let col = ASK, al = (0.28 + 0.5 * c.tones[r]) * (1 - r / (ROWS * 1.5));
          if (c.marks.some((m) => m.side === 1 && m.row === r)) { col = UP; al = 0.95; }
          if (hov) al = Math.min(1, al + 0.3);
          ctx.fillStyle = rgba(col, al); ctx.fillRect(x, y, CELL, CELL);
        }
        for (let r = 0; r < c.b; r++) {
          const y = my + 6 + r * PITCH;
          let col = BID, al = (0.28 + 0.5 * c.tones[ROWS + r]) * (1 - r / (ROWS * 1.5));
          if (c.marks.some((m) => m.side === -1 && m.row === r)) { col = DOWN; al = 0.95; }
          if (hov) al = Math.min(1, al + 0.3);
          ctx.fillStyle = rgba(col, al); ctx.fillRect(x, y, CELL, CELL);
        }
      }
      // price trace through the mid of every column
      ctx.beginPath();
      for (let i = 0; i < cells.length; i++) { const x = i * PITCH - offset + CELL / 2, y = midY(cells[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = 'rgba(231,234,240,.42)'; ctx.lineWidth = 1; ctx.stroke();
      // add/cancel flickers
      flashes = flashes.filter((f) => now - f.t0 < 420);
      for (const f of flashes) {
        const c = cells[f.col]; if (!c) continue;
        const k = 1 - (now - f.t0) / 420, x = f.col * PITCH - offset, my = midY(c);
        const y = f.side > 0 ? my - 6 - (f.row + 1) * PITCH + (PITCH - CELL) : my + 6 + f.row * PITCH;
        ctx.fillStyle = f.add ? rgba([231, 234, 240], 0.75 * k) : rgba([10, 14, 22], 0.9 * k);
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (hoverCol >= 0 && cells[hoverCol]) {
        const x = hoverCol * PITCH - offset + CELL / 2, c = cells[hoverCol], my = midY(c);
        ctx.fillStyle = 'rgba(195,154,85,.4)'; ctx.fillRect(x, my - 6 - c.a * PITCH - 8, 1, (c.a + c.b) * PITCH + 26);
      }
    }
    let last = 0, acc = 0;
    function frame(now) {
      if (!active) { last = 0; requestAnimationFrame(frame); return; }
      const dt = Math.min(64, now - (last || now)); last = now; acc += dt;
      offset += dt * (PITCH / 110);
      while (offset >= PITCH) { offset -= PITCH; cells.shift(); cells.push(newCol()); flashes.forEach((f) => f.col--); }
      if (acc > 60) {
        acc = 0; const col = Math.floor(rand(0, cells.length)), c = cells[col];
        if (c) {
          const side = Math.random() < 0.5 ? 1 : -1, depth = side > 0 ? c.a : c.b, add = Math.random() < 0.55;
          if (add && depth < ROWS) { if (side > 0) c.a++; else c.b++; flashes.push({ col, side, row: depth, add: true, t0: now }); }
          else if (!add && depth > 1) { if (side > 0) c.a--; else c.b--; flashes.push({ col, side, row: depth - 1, add: false, t0: now }); }
        }
      }
      updateProbe(); draw(now); requestAnimationFrame(frame);
    }
    function updateProbe() {
      if (!mouse) { hoverCol = -1; probe.classList.remove('on'); return; }
      const col = Math.floor((mouse.x + offset) / PITCH), c = cells[col];
      if (!c) { hoverCol = -1; probe.classList.remove('on'); return; }
      const my = midY(c), top = my - 6 - c.a * PITCH, bot = my + 6 + c.b * PITCH;
      if (mouse.y < top - 24 || mouse.y > bot + 24) { hoverCol = -1; probe.classList.remove('on'); return; }
      hoverCol = col;
      const imb = (c.b - c.a) / (c.b + c.a);
      const book = imb > 0.2 ? '<span class="bid">Bid-heavy</span>' : imb < -0.2 ? '<span class="ask">Ask-heavy</span>' : 'Balanced';
      const px = c.vel > 0.25 ? '<span class="buy">Rising</span>' : c.vel < -0.25 ? '<span class="sell">Falling</span>' : 'Flat';
      const lastT = c.marks.length ? (c.marks[0].side > 0 ? '<span class="buy">Buy</span>' : '<span class="sell">Sell</span>') : '—';
      probe.innerHTML = `${book} · Price ${px} · Last ${lastT}`;
      probe.style.left = clamp(mouse.x, 150, W - 150) + 'px'; probe.style.top = (top - 14) + 'px';
      probe.classList.add('on');
    }
    const hero = cv.parentElement;
    hero.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (reduced) { updateProbe(); draw(performance.now()); } });
    hero.addEventListener('pointerleave', () => { mouse = null; if (reduced) { updateProbe(); draw(performance.now()); } });
    window.addEventListener('resize', () => { resize(); if (reduced) draw(performance.now()); });
    onSlide('top', (on) => { active = on; });
    resize();
    if (reduced) draw(performance.now()); else requestAnimationFrame(frame);
  })();

  /* ---------- problem: pipeline stages ---------- */
  (() => {
    const pipe = $('#pipeline'), detail = $('#stage-detail'); if (!pipe) return;
    const COPY = {
      data: ['Market data', 'The raw exchange feed: adds, cancels, modifies and trade prints, millions per day per instrument. This part is not the problem.'],
      features: ['Hand-built features', 'Order-flow imbalance, microprice, realized volatility, pair spreads. Each one is a formula a person wrote down. The model can only see the market through them.'],
      model: ['Predictive model', 'A regression or tree ensemble over those features, forecasting the next few hundred milliseconds. It is only as expressive as its inputs.'],
      signals: ['Signals', 'Thresholded forecasts become buy and sell intents. The thresholds are tuned by hand too.'],
      execution: ['Execution', 'Order placement and cancellation logic, also hand-written, sitting on top of the whole chain.'],
    };
    pipe.addEventListener('click', (e) => {
      const st = e.target.closest('.stage'); if (!st) return;
      $$('.stage', pipe).forEach((s) => s.classList.toggle('on', s === st));
      const [h, body] = COPY[st.dataset.key]; detail.innerHTML = `<b>${h}</b>${body}`;
      detail.classList.toggle('problem', st.classList.contains('problem'));
    });
  })();

  /* ---------- solution: packet-flow simulation ---------- */
  (() => {
    const svg = $('#flow'); if (!svg) return;
    const paths = [0, 1, 2, 3].map((i) => $('#p-feed-' + i)), lens = paths.map((p) => p.getTotalLength());
    const outPath = $('#p-out'), outLen = outPath.getTotalLength();
    const layer = $('#packets'), model = $('#model'), order = $('#order'), crit = $('#crit');
    const tapeIn = $('#tape-in'), tapeOut = $('#tape-out'), strip = $('#kvstrip');
    const KV = 24, cellEls = [], kv = [];
    for (let i = 0; i < KV; i++) { const r = svgEl('rect', { class: 'kvcell', x: 529 + i * 10.5, y: 210, width: 9, height: 9, fill: '#1B2333' }); strip.appendChild(r); cellEls.push(r); }
    const COL = { A: '#5C7590', C: '#3A4456', M: '#8B94A5', T: '#C39A55' }, NAME = { A: 'ADD', C: 'CANCEL', M: 'MODIFY', T: 'TRADE' };
    let rate = 1, visible = deck.id === 'solution', packets = [], tokens = [], last = 0, acc = 0, sinceCrit = 0, t0 = performance.now(), price = 101.25, glowT = null;
    const fmt = (p) => p.toFixed(2), stamp = () => 't+' + ((performance.now() - t0) / 1000).toFixed(1) + 's';
    function log(list, cls, k, body) {
      const li = document.createElement('li'); li.className = cls;
      li.innerHTML = `<span class="t">${stamp()}</span><span class="k">${k}</span><span>${body}</span>`;
      list.prepend(li); const max = window.innerHeight < 820 ? 3 : 4; while (list.children.length > max) list.lastChild.remove();
    }
    function detail(k) {
      const side = Math.random() < 0.5 ? 'BID' : 'ASK', px = fmt(price + (side === 'BID' ? -1 : 1) * pick([0.01, 0.02, 0.03])), qty = pick([100, 200, 300, 500, 1000]);
      if (k === 'M') return `${side} ${px} → ${fmt(+px + (side === 'BID' ? 0.01 : -0.01))}`;
      if (k === 'T') return `${fmt(price)} × ${qty}`;
      return `${side} ${px} × ${qty}`;
    }
    function spawn(i, k) {
      const g = svgEl('g'); g.appendChild(svgEl('circle', { r: 8, fill: COL[k], stroke: '#0A0E16', 'stroke-width': 1 }));
      const t = svgEl('text', { class: 'pkt', fill: '#0A0E16', y: 0.5 }); t.textContent = k; g.appendChild(t);
      layer.appendChild(g); packets.push({ el: g, i, k, d: 0 });
      const feed = svg.querySelector(`.feed[data-i="${i}"]`); feed.classList.add('hit'); setTimeout(() => feed.classList.remove('hit'), 220);
      log(tapeIn, 'pkt-' + k, NAME[k], detail(k));
    }
    function absorb(p) {
      p.el.remove(); model.classList.add('glow'); clearTimeout(glowT); glowT = setTimeout(() => model.classList.remove('glow'), 260);
      kv.push(COL[p.k]); if (kv.length > KV) kv.shift(); cellEls.forEach((c, i) => c.setAttribute('fill', kv[i] || '#1B2333'));
      sinceCrit++;
      if ((p.k === 'T' && Math.random() < 0.55) || (sinceCrit >= 10 && Math.random() < 0.35)) { sinceCrit = 0; critical(); }
    }
    function critical() {
      crit.classList.remove('on'); void crit.getBBox(); crit.classList.add('on');
      const g = svgEl('g'); g.appendChild(svgEl('circle', { r: 9, fill: '#C39A55', stroke: '#0A0E16', 'stroke-width': 1 }));
      const t = svgEl('text', { class: 'pkt', fill: '#0A0E16', y: 0.5 }); t.textContent = '★'; g.appendChild(t);
      layer.appendChild(g); tokens.push({ el: g, d: 0 });
    }
    function sent() {
      const buy = Math.random() < 0.5; price = +(price + (buy ? 1 : -1) * pick([0.01, 0.01, 0.02])).toFixed(2);
      order.classList.add('sent'); setTimeout(() => order.classList.remove('sent'), 520);
      log(tapeOut, buy ? 'buy' : 'sell', `<span class="side">${buy ? 'BUY' : 'SELL'}</span>`, `${pick([100, 200, 300])} @ ${fmt(price)}`);
    }
    const place = (el, pt) => el.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
    function frame(now) {
      const dt = Math.min(64, now - (last || now)); last = now;
      if (visible && rate > 0) { acc += dt * rate; while (acc > 620) { acc -= 620 + rand(-150, 150); const r = Math.random(); spawn(Math.floor(rand(0, 4)), r < 0.42 ? 'A' : r < 0.72 ? 'C' : r < 0.86 ? 'M' : 'T'); } }
      const speed = 340 * (rate > 1 ? Math.sqrt(rate) : 1) * dt / 1000;
      packets = packets.filter((p) => { p.d += speed; if (p.d >= lens[p.i]) { absorb(p); return false; } place(p.el, paths[p.i].getPointAtLength(p.d)); return true; });
      tokens = tokens.filter((t) => { t.d += speed * 1.3; if (t.d >= outLen) { t.el.remove(); sent(); return false; } place(t.el, outPath.getPointAtLength(t.d)); return true; });
      requestAnimationFrame(frame);
    }
    onSlide('solution', (on) => { visible = on; if (on) last = 0; });
    $$('.feed', svg).forEach((f) => {
      const go = () => spawn(+f.dataset.i, f.dataset.k);
      f.addEventListener('click', go);
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } });
    });
    $$('#speed button').forEach((b) => b.addEventListener('click', () => {
      rate = +b.dataset.rate; $$('#speed button').forEach((x) => x.classList.toggle('on', x === b));
      $('#pause').textContent = b.id === 'pause' ? 'Paused' : 'Pause';
    }));
    if (!reduced) requestAnimationFrame(frame);
    else { $('#speed').hidden = true; for (let i = 0; i < 12; i++) kv.push(pick(Object.values(COL))); cellEls.forEach((c, i) => c.setAttribute('fill', kv[i] || '#1B2333')); }
  })();

  /* ---------- training: two-phase stepper ---------- */
  (() => {
    const svg = $('#train'); if (!svg) return;
    const p1 = $('#p1'), p2 = $('#p2'), alphas = $('#alphas'), copy = $('#step-copy');
    const w = { alphas: $('#w-alphas'), in: $('#w-in'), il: $('#w-il'), bp: $('#w-bp'), rl: $('#w-rl') };
    const disc = [$('#disc-1'), $('#disc-2')], btns = $$('#stepper [data-step]');
    const COPY = {
      1: '<b>Phase 01 · Imitation learning.</b> Order-book, volatility, pair and sequence alphas that people already trade are the pretraining corpus. The base policy learns to mimic expert trading behavior directly from the raw feed.',
      2: '<b>Phase 02 · Reinforcement learning.</b> The base policy practices in GPU-native trading simulators in a self-play loop. Exploration finds new alphas beyond human play: strategies no one hand-wrote.',
    };
    let timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const redraw = (el) => { el.classList.remove('go'); void el.getBoundingClientRect(); el.classList.add('go'); };
    function setStep(n, animate = true) {
      timers.forEach(clearTimeout); timers = [];
      btns.forEach((b) => { const on = +b.dataset.step === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      copy.innerHTML = COPY[n]; disc.forEach((d) => d.classList.remove('show'));
      const D = animate && !reduced ? 1 : 0;
      if (n === 1) {
        p2.classList.add('dim'); p2.classList.remove('lit'); p1.classList.add('lit'); alphas.classList.add('lit');
        w.bp.classList.remove('go'); w.rl.classList.remove('go');
        redraw(w.alphas); later(() => redraw(w.in), 500 * D); later(() => redraw(w.il), 1100 * D);
      } else {
        p2.classList.remove('dim'); p1.classList.remove('lit'); alphas.classList.remove('lit');
        ['alphas', 'in', 'il'].forEach((k) => w[k].classList.add('go'));
        redraw(w.bp); later(() => { p2.classList.add('lit'); redraw(w.rl); }, 900 * D);
        later(() => disc[0].classList.add('show'), 2000 * D); later(() => disc[1].classList.add('show'), 2600 * D);
      }
    }
    function replay() { setStep(1); later(() => setStep(2), reduced ? 0 : 3400); }
    btns.forEach((b) => b.addEventListener('click', () => setStep(+b.dataset.step)));
    $('#replay').addEventListener('click', replay);
    setStep(1, false);
    onSlide('training', (on) => { if (on) later(replay, 500); else { timers.forEach(clearTimeout); timers = []; } });
    if (deck.id === 'training') later(replay, 500);
  })();

  /* ---------- why now: parallel books ---------- */
  (() => {
    const cv = $('#books-grid'); if (!cv) return;
    const ctx = cv.getContext('2d'), card = cv.closest('.card');
    let W = 0, H = 0, dense = false, books = [], visible = deck.id === 'why-now', last = 0, acc = 0;
    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = dense ? 26 : 44, ch = dense ? 26 : 36, nx = Math.floor(W / cw), ny = Math.floor(H / ch);
      books = [];
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) books.push({ x: x * cw + (W - nx * cw) / 2, y: y * ch + (H - ny * ch) / 2, w: cw, h: ch, d: Array.from({ length: 5 }, () => [rand(0.2, 1), rand(0.2, 1)]), born: performance.now() + (x + y) * 18 });
    }
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      for (const b of books) {
        const k = clamp((now - b.born) / 300, 0, 1); if (k <= 0) continue;
        const pad = 4, n = b.d.length, bw = (b.w - pad * 2) / n, mid = b.y + b.h / 2, half = (b.h / 2 - pad) * k;
        for (let i = 0; i < n; i++) {
          const x = b.x + pad + i * bw, [a, bd] = b.d[i];
          ctx.fillStyle = 'rgba(92,117,144,.85)'; ctx.fillRect(x, mid - 1 - half * a, bw - 1.5, half * a);
          ctx.fillStyle = 'rgba(195,154,85,.85)'; ctx.fillRect(x, mid + 1, bw - 1.5, half * bd);
        }
      }
    }
    function frame(now) {
      const dt = Math.min(64, now - (last || now)); last = now; acc += dt;
      if (visible && acc > 120) { acc = 0; for (const b of books) { const i = Math.floor(rand(0, b.d.length)); b.d[i][0] = clamp(b.d[i][0] + rand(-0.3, 0.3), 0.1, 1); b.d[i][1] = clamp(b.d[i][1] + rand(-0.3, 0.3), 0.1, 1); } }
      if (visible) draw(now); requestAnimationFrame(frame);
    }
    onSlide('why-now', (on) => { visible = on; if (on) layout(); });
    card.addEventListener('pointerenter', () => { dense = true; layout(); });
    card.addEventListener('pointerleave', () => { dense = false; layout(); });
    window.addEventListener('resize', layout);
    layout();
    if (reduced) { for (const b of books) b.born = 0; draw(performance.now()); } else requestAnimationFrame(frame);
  })();
})();
