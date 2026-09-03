/* pi* — interactions. Everything degrades to static content without JS. */
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

  /* ---------- reveal on scroll ---------- */
  const revealHooks = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('in');
      const hook = revealHooks.get(en.target); if (hook) hook();
      io.unobserve(en.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));

  /* ---------- nav ---------- */
  const nav = $('#nav');
  const links = $$('.nav-links a');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const secIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
    }
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
  $$('main section[id]').forEach((s) => secIO.observe(s));

  /* ---------- hero tagline letters ---------- */
  const tag = $('#tagline');
  if (tag) {
    const text = tag.textContent; tag.textContent = '';
    [...text].forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.style.animationDelay = (600 + i * 45) + 'ms'; tag.appendChild(s); });
  }

  /* ---------- hero: live order-book strip ----------
     Columns are time steps streaming in from the right. Ask depth stacks up
     from the mid line in slate blue, bid depth stacks down in gold. Trades
     print red (sell hits bid) or green (buy lifts ask) at the touch. */
  (() => {
    const cv = $('#book'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const probe = $('#probe');
    const CELL = 8, PITCH = 11, ROWS = 14;
    const BID = [195, 154, 85], ASK = [92, 117, 144], UP = [62, 155, 110], DOWN = [184, 84, 80];
    let W = 0, H = 0, dpr = 1, cols = 0, midY = 0, cells = [], offset = 0, hoverCol = -1, mouse = null;
    let bidD = 8, askD = 8, drift = 0, flashes = [];
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    function newCol() {
      // depths random-walk with mean reversion; occasional bursts thin one side
      drift = clamp(drift + rand(-0.15, 0.15), -0.6, 0.6);
      bidD = clamp(bidD + rand(-1.2, 1.2) + drift * 0.4 + (8 - bidD) * 0.08, 1, ROWS);
      askD = clamp(askD + rand(-1.2, 1.2) - drift * 0.4 + (8 - askD) * 0.08, 1, ROWS);
      const b = Math.round(bidD), a = Math.round(askD);
      const tones = [];
      for (let r = 0; r < ROWS * 2; r++) tones.push(rand(0.55, 1));
      let trade = 0; // 0 none, 1 buy (green on ask side), -1 sell (red on bid side)
      const roll = Math.random();
      if (roll < 0.08) trade = 1; else if (roll < 0.16) trade = -1;
      const marks = [];
      if (trade) { const n = 1 + (Math.random() < 0.3 ? 1 : 0); for (let k = 0; k < n; k++) marks.push({ side: trade, row: k }); }
      return { b, a, tones, marks, imb: (b - a) / (b + a) };
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / PITCH) + 2;
      midY = H - 170;
      while (cells.length < cols) cells.push(newCol());
      while (cells.length > cols) cells.shift();
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      // rule above the strip, echoing the deck
      ctx.fillStyle = 'rgba(39,49,74,.55)';
      ctx.fillRect(0, midY - ROWS * PITCH - 14, W, 1);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const x = i * PITCH - offset;
        if (x + CELL < 0 || x > W) continue;
        const hov = i === hoverCol;
        for (let r = 0; r < c.a; r++) {
          const y = midY - 6 - (r + 1) * PITCH + (PITCH - CELL);
          let col = ASK, al = (0.28 + 0.5 * c.tones[r]) * (1 - r / (ROWS * 1.6));
          const m = c.marks.find((mm) => mm.side === 1 && mm.row === r); if (m) { col = UP; al = 0.95; }
          if (hov) al = Math.min(1, al + 0.3);
          ctx.fillStyle = rgba(col, al); ctx.fillRect(x, y, CELL, CELL);
        }
        for (let r = 0; r < c.b; r++) {
          const y = midY + 6 + r * PITCH;
          let col = BID, al = (0.28 + 0.5 * c.tones[ROWS + r]) * (1 - r / (ROWS * 1.6));
          const m = c.marks.find((mm) => mm.side === -1 && mm.row === r); if (m) { col = DOWN; al = 0.95; }
          if (hov) al = Math.min(1, al + 0.3);
          ctx.fillStyle = rgba(col, al); ctx.fillRect(x, y, CELL, CELL);
        }
      }
      // add/cancel flickers
      const now = performance.now();
      flashes = flashes.filter((f) => now - f.t0 < 420);
      for (const f of flashes) {
        const k = 1 - (now - f.t0) / 420, x = f.col * PITCH - offset;
        if (x < -PITCH || x > W) continue;
        const y = f.side > 0 ? midY - 6 - (f.row + 1) * PITCH + (PITCH - CELL) : midY + 6 + f.row * PITCH;
        ctx.fillStyle = f.add ? rgba([231, 234, 240], 0.75 * k) : rgba([10, 14, 22], 0.9 * k);
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (hoverCol >= 0) {
        const x = hoverCol * PITCH - offset + CELL / 2;
        ctx.fillStyle = 'rgba(195,154,85,.35)'; ctx.fillRect(x, midY - ROWS * PITCH - 14, 1, ROWS * 2 * PITCH + 20);
      }
    }
    let last = 0, acc = 0;
    function frame(now) {
      const dt = Math.min(64, now - (last || now)); last = now;
      acc += dt;
      offset += dt * (PITCH / 110); // one column per 110 ms
      while (offset >= PITCH) { offset -= PITCH; cells.shift(); cells.push(newCol()); }
      // sprinkle adds and cancels anywhere in the visible book
      if (acc > 60) { acc = 0; const col = Math.floor(rand(0, cells.length)); const c = cells[col];
        if (c) { const side = Math.random() < 0.5 ? 1 : -1; const depth = side > 0 ? c.a : c.b; const add = Math.random() < 0.55;
          if (add && depth < ROWS) { if (side > 0) c.a++; else c.b++; flashes.push({ col, side, row: depth, add: true, t0: now }); }
          else if (!add && depth > 1) { if (side > 0) c.a--; else c.b--; flashes.push({ col, side, row: depth - 1, add: false, t0: now }); } } }
      updateProbe();
      draw();
      requestAnimationFrame(frame);
    }
    function updateProbe() {
      if (!mouse) { hoverCol = -1; probe.classList.remove('on'); return; }
      const inStrip = mouse.y > midY - ROWS * PITCH - 20 && mouse.y < midY + ROWS * PITCH + 10;
      if (!inStrip) { hoverCol = -1; probe.classList.remove('on'); return; }
      hoverCol = Math.floor((mouse.x + offset) / PITCH);
      const c = cells[hoverCol]; if (!c) return;
      const age = ((cells.length - 1 - hoverCol) * 0.11).toFixed(2);
      const last = c.marks.length ? (c.marks[0].side > 0 ? '<span style="color:#7FBF7F">BUY</span>' : '<span style="color:#B85450">SELL</span>') : '—';
      probe.innerHTML = `<b>t−${age}s</b> &nbsp;<span class="ask">ASK ${c.a}</span> · <span class="bid">BID ${c.b}</span> &nbsp;IMB <b>${(c.imb >= 0 ? '+' : '') + c.imb.toFixed(2)}</b> &nbsp;LAST ${last}`;
      probe.style.left = clamp(mouse.x, 120, W - 120) + 'px';
      probe.style.top = (midY - ROWS * PITCH - 26) + 'px';
      probe.classList.add('on');
    }
    const hero = cv.parentElement;
    hero.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (reduced) { updateProbe(); draw(); } });
    hero.addEventListener('pointerleave', () => { mouse = null; if (reduced) { updateProbe(); draw(); } });
    window.addEventListener('resize', () => { resize(); if (reduced) draw(); });
    resize();
    if (reduced) draw(); else requestAnimationFrame(frame);
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
      const [h, body] = COPY[st.dataset.key];
      detail.innerHTML = `<b>${h}</b>${body}`;
      detail.classList.toggle('problem', st.classList.contains('problem'));
    });
  })();

  /* ---------- solution: packet-flow simulation ---------- */
  (() => {
    const svg = $('#flow'); if (!svg) return;
    const paths = [0, 1, 2, 3].map((i) => $('#p-feed-' + i));
    const lens = paths.map((p) => p.getTotalLength());
    const outPath = $('#p-out'), outLen = outPath.getTotalLength();
    const layer = $('#packets'), model = $('#model'), order = $('#order'), crit = $('#crit');
    const tapeIn = $('#tape-in'), tapeOut = $('#tape-out');
    const strip = $('#kvstrip'); const KV = 24; const cellEls = []; const kv = [];
    for (let i = 0; i < KV; i++) { const r = svgEl('rect', { class: 'kvcell', x: 545 + i * 9.5, y: 208, width: 7.5, height: 8, fill: '#1B2333' }); strip.appendChild(r); cellEls.push(r); }
    const COL = { A: '#5C7590', C: '#3A4456', M: '#8B94A5', T: '#C39A55' };
    const NAME = { A: 'ADD', C: 'CANCEL', M: 'MODIFY', T: 'TRADE' };
    let rate = 1, visible = false, packets = [], tokens = [], last = 0, acc = 0, sinceCrit = 0, t0 = performance.now(), price = 101.25, glowT = null;
    const fmt = (p) => p.toFixed(2);
    const stamp = () => 't+' + ((performance.now() - t0) / 1000).toFixed(1) + 's';
    function log(list, cls, k, body) {
      const li = document.createElement('li'); li.className = cls;
      li.innerHTML = `<span class="t">${stamp()}</span><span class="k">${k}</span><span>${body}</span>`;
      list.prepend(li); while (list.children.length > 5) list.lastChild.remove();
    }
    function detail(k) {
      const side = Math.random() < 0.5 ? 'BID' : 'ASK', px = fmt(price + (side === 'BID' ? -1 : 1) * pick([0.01, 0.02, 0.03]));
      const qty = pick([100, 200, 300, 500, 1000]);
      if (k === 'A') return `${side} ${px} × ${qty}`;
      if (k === 'C') return `${side} ${px} × ${qty}`;
      if (k === 'M') return `${side} ${px} → ${fmt(+px + (side === 'BID' ? 0.01 : -0.01))}`;
      return `${fmt(price)} × ${qty}`;
    }
    function spawn(i, k) {
      const g = svgEl('g'); g.appendChild(svgEl('circle', { r: 7, fill: COL[k], stroke: '#0A0E16', 'stroke-width': 1 }));
      const t = svgEl('text', { class: 'pkt', fill: '#0A0E16', y: 0.5 }); t.textContent = k; g.appendChild(t);
      layer.appendChild(g); packets.push({ el: g, i, k, d: 0 });
      const feed = svg.querySelector(`.feed[data-i="${i}"]`); feed.classList.add('hit'); setTimeout(() => feed.classList.remove('hit'), 220);
      log(tapeIn, 'pkt-' + k, NAME[k], detail(k));
    }
    function absorb(p) {
      p.el.remove();
      model.classList.add('glow'); clearTimeout(glowT); glowT = setTimeout(() => model.classList.remove('glow'), 260);
      kv.push(COL[p.k]); if (kv.length > KV) kv.shift();
      cellEls.forEach((c, i) => c.setAttribute('fill', kv[i] || '#1B2333'));
      sinceCrit++;
      if ((p.k === 'T' && Math.random() < 0.55) || (sinceCrit >= 10 && Math.random() < 0.35)) { sinceCrit = 0; critical(); }
    }
    function critical() {
      crit.classList.remove('on'); void crit.getBBox(); crit.classList.add('on');
      const g = svgEl('g'); g.appendChild(svgEl('circle', { r: 8, fill: '#C39A55', stroke: '#0A0E16', 'stroke-width': 1 }));
      const t = svgEl('text', { class: 'pkt', fill: '#0A0E16', y: 0.5 }); t.textContent = '★'; g.appendChild(t);
      layer.appendChild(g); tokens.push({ el: g, d: 0 });
    }
    function sent() {
      const buy = Math.random() < 0.5; price = +(price + (buy ? 1 : -1) * pick([0.01, 0.01, 0.02])).toFixed(2);
      order.classList.add('sent'); setTimeout(() => order.classList.remove('sent'), 520);
      log(tapeOut, buy ? 'buy' : 'sell', `<span class="side">${buy ? 'BUY' : 'SELL'}</span>`, `${pick([100, 200, 300])} @ ${fmt(price)}`);
    }
    function place(el, pt) { el.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`); }
    function frame(now) {
      const dt = Math.min(64, now - (last || now)); last = now;
      if (visible && rate > 0) {
        acc += dt * rate;
        while (acc > 620) { acc -= 620 + rand(-150, 150); const r = Math.random(); spawn(Math.floor(rand(0, 4)), r < 0.42 ? 'A' : r < 0.72 ? 'C' : r < 0.86 ? 'M' : 'T'); }
      }
      const speed = 340 * (rate > 1 ? Math.sqrt(rate) : 1) * dt / 1000;
      packets = packets.filter((p) => { p.d += speed; if (p.d >= lens[p.i]) { absorb(p); return false; } place(p.el, paths[p.i].getPointAtLength(p.d)); return true; });
      tokens = tokens.filter((t) => { t.d += speed * 1.3; if (t.d >= outLen) { t.el.remove(); sent(); return false; } place(t.el, outPath.getPointAtLength(t.d)); return true; });
      requestAnimationFrame(frame);
    }
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { threshold: 0.2 }).observe(svg);
    $$('.feed', svg).forEach((f) => {
      const go = () => spawn(+f.dataset.i, f.dataset.k);
      f.addEventListener('click', go);
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    $$('#speed button').forEach((b) => b.addEventListener('click', () => {
      rate = +b.dataset.rate; $$('#speed button').forEach((x) => x.classList.toggle('on', x === b));
      b.textContent = b.id === 'pause' ? 'Paused' : b.textContent; if (b.id !== 'pause') $('#pause').textContent = 'Pause';
    }));
    if (!reduced) requestAnimationFrame(frame); else { $('#speed').hidden = true; for (let i = 0; i < 12; i++) kv.push(pick(Object.values(COL))); cellEls.forEach((c, i) => c.setAttribute('fill', kv[i] || '#1B2333')); }
  })();

  /* ---------- training: two-phase stepper ---------- */
  (() => {
    const svg = $('#train'); if (!svg) return;
    const p1 = $('#p1'), p2 = $('#p2'), alphas = $('#alphas'), copy = $('#step-copy');
    const w = { alphas: $('#w-alphas'), in: $('#w-in'), il: $('#w-il'), bp: $('#w-bp'), rl: $('#w-rl') };
    const disc = [$('#disc-1'), $('#disc-2')];
    const btns = $$('#stepper [data-step]');
    const COPY = {
      1: '<b>Phase 01 · Imitation learning.</b> Order-book, volatility, pair and sequence alphas that people already trade are the pretraining corpus. The base policy learns to mimic expert trading behavior directly from the raw feed.',
      2: '<b>Phase 02 · Reinforcement learning.</b> The base policy practices in GPU-native trading simulators in a self-play loop. Exploration finds new alphas beyond human play: strategies no one hand-wrote.',
    };
    let timers = [], step = 0;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const redraw = (el) => { el.classList.remove('go'); void el.getBoundingClientRect(); el.classList.add('go'); };
    function setStep(n, animate = true) {
      timers.forEach(clearTimeout); timers = []; step = n;
      btns.forEach((b) => { const on = +b.dataset.step === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      copy.innerHTML = COPY[n];
      disc.forEach((d) => d.classList.remove('show'));
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
    // initial static state, then auto-play once when scrolled into view
    p2.classList.add('dim'); ['alphas', 'in', 'il'].forEach((k) => w[k].classList.add('go')); alphas.classList.add('lit'); p1.classList.add('lit');
    const wrap = svg.closest('[data-reveal]');
    if (wrap && !wrap.classList.contains('in')) revealHooks.set(wrap, () => setTimeout(replay, 300)); else replay();
  })();

  /* ---------- why now: parallel books ---------- */
  (() => {
    const cv = $('#books-grid'); if (!cv) return;
    const ctx = cv.getContext('2d'); const card = cv.closest('.card');
    let W = 0, H = 0, dense = false, books = [], visible = false, last = 0, acc = 0;
    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = dense ? 26 : 44, ch = dense ? 26 : 40;
      const nx = Math.floor(W / cw), ny = Math.floor(H / ch);
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
      draw(now); requestAnimationFrame(frame);
    }
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { threshold: 0.2 }).observe(cv);
    card.addEventListener('pointerenter', () => { dense = true; layout(); });
    card.addEventListener('pointerleave', () => { dense = false; layout(); });
    window.addEventListener('resize', layout);
    layout();
    if (reduced) { for (const b of books) b.born = 0; draw(performance.now()); } else requestAnimationFrame(frame);
  })();
})();
