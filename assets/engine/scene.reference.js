/* 达人内容匹配 · 内训视频逐帧渲染引擎
   画面状态完全由 t（秒）决定，不依赖真实时钟。 */
(function () {
  'use strict';

  const W = 1920, H = 1080, S = 2;
  const P = {
    ink: '#0F1826', ink2: '#1D2939', muted: '#5B6B86', faint: '#93A3B8',
    blue: '#1169FF', blueD: '#0B4FD6', cyan: '#52E1FF', purple: '#795CFF',
    pink: '#FF3D6E', line: '#DCE6F6', pale: '#EAF2FF', soft: '#F5F9FF', white: '#FFFFFF'
  };
  const FF = '"Hiragino Sans GB","PingFang SC","Heiti SC",sans-serif';
  const fnt = (s, w) => (w || 400) + ' ' + s + 'px ' + FF;

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  cv.width = W * S; cv.height = H * S;
  ctx.scale(S, S);

  const TL = window.TIMELINE;
  const SCENES = TL.scenes;
  const TOTAL = SCENES[SCENES.length - 1].end;
  const __POS = {};
  SCENES.forEach((s, i) => { __POS[s.number] = i + 1; });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
  const easeIO = p => { p = clamp(p, 0, 1); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  const seg = (u, at, dur) => clamp((u - at) / dur, 0, 1);
  const pad2 = n => (n < 10 ? '0' + n : '' + n);
  const at = (arr, i, fb) => (arr[i] === undefined ? (arr[arr.length - 1] === undefined ? fb : arr[arr.length - 1]) : arr[i]);

  function tx(c, s, x, y, o) {
    o = o || {};
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    if (alpha <= 0.001) return;
    c.save();
    c.globalAlpha = alpha;
    c.font = fnt(o.size || 30, o.weight || 400);
    c.fillStyle = o.color || P.ink;
    c.textAlign = o.align || 'left';
    c.textBaseline = o.baseline || 'alphabetic';
    c.fillText(s, x, y);
    c.restore();
  }

  function measure(c, s, size, weight) {
    c.save(); c.font = fnt(size, weight); const w = c.measureText(s).width; c.restore();
    return w;
  }

  function wrap(c, s, size, maxW, weight) {
    c.save(); c.font = fnt(size, weight);
    const out = []; let cur = '';
    for (const ch of s) {
      if (ch === '\n') { out.push(cur); cur = ''; continue; }
      if (cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) out.push(cur);
    c.restore();
    return out;
  }

  function para(c, s, x, y, o) {
    const size = o.size || 30, lh = o.lh || size * 1.42, weight = o.weight || 400;
    let lines = wrap(c, s, size, o.maxW || 1200, weight);
    if (o.maxLines) lines = lines.slice(0, o.maxLines);
    lines.forEach((ln, i) => tx(c, ln, x, y + i * lh, { size, color: o.color, weight, align: o.align, alpha: o.alpha }));
    return lines.length * lh;
  }

  /* 卡片用离屏精灵缓存阴影，避免每帧 shadowBlur */
  const SPR = new Map();
  function sprite(w, h, r) {
    const key = Math.round(w) + '|' + Math.round(h) + '|' + Math.round(r);
    let s = SPR.get(key);
    if (!s) {
      const pad = 46;
      const c2 = document.createElement('canvas');
      c2.width = (w + pad * 2) * S; c2.height = (h + pad * 2) * S;
      const g = c2.getContext('2d'); g.scale(S, S);
      g.shadowColor = 'rgba(45,64,105,.14)'; g.shadowBlur = 26; g.shadowOffsetY = 10;
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.roundRect(pad, pad, w, h, r); g.fill();
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      const lg = g.createLinearGradient(0, pad, 0, pad + h);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(236,244,255,.55)');
      g.fillStyle = lg; g.beginPath(); g.roundRect(pad, pad, w, h, r); g.fill();
      s = { cv: c2, pad: pad }; SPR.set(key, s);
    }
    return s;
  }

  function card(c, x, y, w, h, r, alpha) {
    const s = sprite(w, h, r === undefined ? 30 : r);
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.drawImage(s.cv, x - s.pad, y - s.pad, w + s.pad * 2, h + s.pad * 2);
    c.globalAlpha = 1;
  }

  function frameCard(c, x, y, w, h, r, color, lw, alpha) {
    c.save();
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.strokeStyle = color; c.lineWidth = lw || 2;
    c.beginPath(); c.roundRect(x, y, w, h, r); c.stroke();
    c.restore();
  }

  function pill(c, x, y, w, h, label, o) {
    o = o || {};
    const al = o.alpha === undefined ? 1 : o.alpha;
    if (al <= 0.001) return;
    c.save(); c.globalAlpha = al;
    c.fillStyle = o.fill || P.blue;
    c.beginPath(); c.roundRect(x, y, w, h, o.r === undefined ? h / 2 : o.r); c.fill();
    c.restore();
    tx(c, label, x + w / 2, y + h / 2 + (o.size || 26) * 0.35, {
      size: o.size || 26, color: o.color || '#fff', weight: o.weight || 600, align: 'center', alpha: al
    });
  }

  function tag(c, x, y, label, o) {
    o = o || {};
    const size = o.size || 22, p = o.pad === undefined ? 14 : o.pad;
    const w = measure(c, label, size, o.weight || 600) + p * 2, h = o.h || size + 20;
    c.save(); c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    if (o.dashed) {
      c.strokeStyle = o.color || P.pink; c.lineWidth = 2;
      c.beginPath(); c.roundRect(x, y, w, h, 8); c.stroke();
    } else {
      c.fillStyle = o.fill || 'rgba(17,105,255,.10)';
      c.beginPath(); c.roundRect(x, y, w, h, 8); c.fill();
    }
    c.restore();
    tx(c, label, x + w / 2, y + h / 2 + size * 0.35, {
      size: size, color: o.color || P.blue, weight: o.weight || 600, align: 'center', alpha: o.alpha
    });
    return w;
  }

  const BG = (function () {
    const c2 = document.createElement('canvas');
    c2.width = W * S; c2.height = H * S;
    const g = c2.getContext('2d'); g.scale(S, S);
    const lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, '#E7E4FE'); lg.addColorStop(.34, '#EEF1FE');
    lg.addColorStop(.62, '#F9FAFF'); lg.addColorStop(1, '#FDECF1');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    g.save(); g.filter = 'blur(90px)';
    const blob = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    blob(120, 40, 420, 300, 'rgba(126,104,255,.20)');
    blob(1840, 1020, 460, 340, 'rgba(255,120,158,.16)');
    blob(1700, 120, 360, 260, 'rgba(255,150,180,.10)');
    g.restore();
    g.save(); g.filter = 'blur(22px)';
    const dot = (x, y, r, a) => { g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    dot(250, 300, 52, .55); dot(120, 660, 96, .50); dot(250, 720, 74, .42);
    dot(1780, 300, 46, .40); dot(1860, 560, 52, .34);
    dot(1710, 940, 120, .26); dot(1520, 1010, 80, .22);
    dot(760, 60, 60, .30); dot(1120, 1010, 46, .22);
    g.restore();
    return c2;
  })();

  function bgDraw(t) {
    const z = 1.014 + 0.005 * Math.sin(t / 27);
    const dx = 10 * Math.sin(t / 33), dy = 7 * Math.cos(t / 41);
    ctx.save();
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(BG, 0, 0, W, H);
    ctx.restore();
  }

  const CHAIN = ['项目目标', '常态数据', '内容关注点', '场景与角色', '提报结论'];
  const CHAPTER = {
    1: '问题', 2: '人群', 3: '产出', 4: '方法', 5: '目标', 6: '画像', 7: '例外',
    8: '常态', 9: '案例', 10: '案例', 11: '异常值', 12: '核查', 13: '内容',
    14: '形式', 15: '案例', 16: '预期', 17: '场景', 18: '行为', 19: '角色',
    20: '案例', 21: '露出', 22: '提报', 23: '练习', 24: '答案', 25: '边界', 26: '收束'
  };

  function header(c, n, u) { /* 参考样片版式：无页眉、无页码 */ }

  function title(c, s, u) {
    const ap = easeOut(seg(u, 0.18, 0.6));
    let size = 80;
    c.save(); c.font = fnt(size, 600);
    while (size > 50 && c.measureText(s).width > 1620) { size -= 2; c.font = fnt(size, 600); }
    c.restore();
    tx(c, s, 116, 276 + (1 - ap) * 18, { size: size, color: P.ink, weight: 600, alpha: ap });
  }

  const SUBS = [];
  SCENES.forEach(sc => sc.clauses.forEach(cl => SUBS.push({ t0: cl.start + 0.05, t1: cl.end + 0.10, text: cl.text })));

  function subtitle(c, t) {
    let cur = null;
    for (let i = 0; i < SUBS.length; i++) if (t >= SUBS[i].t0 && t <= SUBS[i].t1) { cur = SUBS[i]; break; }
    if (!cur) return;
    const a = Math.min(easeOut(seg(t, cur.t0, 0.20)), 1 - seg(t, cur.t1 - 0.10, 0.10));
    if (a <= 0.01) return;
    let size = 42, lines = wrap(c, cur.text, size, 1520, 500);
    if (lines.length > 2) { size = 34; lines = wrap(c, cur.text, size, 1590, 500); }
    lines = lines.slice(0, 2);
    const lh = size * 1.42;
    const maxW = Math.max.apply(null, lines.map(l => measure(c, l, size, 500)));
    const w = Math.min(1670, maxW + 92), h = lines.length * lh + 38;
    const x = (W - w) / 2, y = 986 - h;
    c.save();
    c.globalAlpha = a;
    c.shadowColor = 'rgba(45,64,105,.16)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = 'rgba(255,255,255,.94)';
    c.beginPath(); c.roundRect(x, y, w, h, 18); c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.restore();
    lines.forEach((l, i) => tx(c, l, W / 2, y + 30 + size * 0.98 + i * lh, {
      size: size, color: '#1B2936', weight: 500, align: 'center', alpha: a
    }));
  }

  function progress(c, t) {
    const y = 1026;
    c.save(); c.strokeStyle = 'rgba(17,105,255,.12)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(116, y); c.lineTo(1804, y); c.stroke();
    const p = clamp(t / TOTAL, 0, 1);
    c.strokeStyle = P.blue;
    c.beginPath(); c.moveTo(116, y); c.lineTo(116 + 1688 * p, y); c.stroke();
    c.fillStyle = P.blue; c.beginPath(); c.arc(116 + 1688 * p, y, 5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  const IMG = {};
  const ASSET_FILES = ['01-近期曝光低.png', '02-近期曝光稳定.png', '03-点赞偏低.png', '04-高赞低曝.png'];
  let loaded = 0;
  ASSET_FILES.forEach(function (n) {
    const im = new Image();
    im.onload = function () {
      loaded++;
      if (loaded === ASSET_FILES.length) window.__ready = true;
    };
    im.src = 'assets/' + n;
    IMG[n.slice(0, 2)] = im;
  });
  window.__ready = false;

  function drawImg(c, key, x, y, w, h, crop, alpha) {
    const im = IMG[key];
    if (!im || !im.naturalWidth) return;
    const cr = crop || [0, 0, 1, 1];
    const sx = cr[0] * im.naturalWidth, sy = cr[1] * im.naturalHeight;
    const sw = cr[2] * im.naturalWidth, sh = cr[3] * im.naturalHeight;
    const ar = sw / sh;
    let dw = w, dh = h;
    if (ar > w / h) dh = w / ar; else dw = h * ar;
    c.save(); c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.drawImage(im, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    c.restore();
  }

  function person(c, cx, base, h, o) {
    o = o || {};
    const col = o.color || '#B6CBEA', dark = o.dark || '#7F9CC6';
    const al = o.alpha === undefined ? 1 : o.alpha;
    if (al <= 0.001) return;
    c.save(); c.globalAlpha = al;
    const hy = base - h * 0.86, hr = h * 0.098;
    c.strokeStyle = dark; c.lineWidth = h * 0.052; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - h * 0.045, base - h * 0.34); c.lineTo(cx - h * 0.065, base); c.stroke();
    c.beginPath(); c.moveTo(cx + h * 0.045, base - h * 0.34); c.lineTo(cx + h * 0.065, base); c.stroke();
    c.fillStyle = col;
    c.beginPath(); c.roundRect(cx - h * 0.115, base - h * 0.72, h * 0.23, h * 0.42, h * 0.10); c.fill();
    c.beginPath(); c.arc(cx, hy, hr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = dark; c.lineWidth = h * 0.048;
    const sy0 = base - h * 0.66, pose = o.pose || 'idle';
    if (pose === 'tired') {
      c.beginPath(); c.moveTo(cx - h * 0.10, sy0);
      c.quadraticCurveTo(cx - h * 0.28, base - h * 0.84, cx - h * 0.05, hy + h * 0.03); c.stroke();
      c.beginPath(); c.moveTo(cx + h * 0.10, sy0); c.lineTo(cx + h * 0.15, base - h * 0.42); c.stroke();
    } else if (pose === 'share') {
      c.beginPath(); c.moveTo(cx - h * 0.10, sy0); c.lineTo(cx - h * 0.16, base - h * 0.40); c.stroke();
      c.beginPath(); c.moveTo(cx + h * 0.10, sy0); c.lineTo(cx + h * 0.32, base - h * 0.58); c.stroke();
    } else if (pose === 'hungry') {
      c.beginPath(); c.moveTo(cx - h * 0.10, sy0);
      c.quadraticCurveTo(cx - h * 0.22, base - h * 0.50, cx - h * 0.01, base - h * 0.43); c.stroke();
      c.beginPath(); c.moveTo(cx + h * 0.10, sy0); c.lineTo(cx + h * 0.14, base - h * 0.40); c.stroke();
    } else {
      c.beginPath(); c.moveTo(cx - h * 0.10, sy0); c.lineTo(cx - h * 0.14, base - h * 0.40); c.stroke();
      c.beginPath(); c.moveTo(cx + h * 0.10, sy0); c.lineTo(cx + h * 0.14, base - h * 0.40); c.stroke();
    }
    c.restore();
  }

  function pack(c, x, y, w, h, alpha, o) {
    o = o || {};
    const al = alpha === undefined ? 1 : alpha;
    if (al <= 0.001) return;
    c.save(); c.globalAlpha = al;
    c.fillStyle = o.color || '#FFC24B';
    c.beginPath(); c.roundRect(x, y, w, h, Math.min(7, w * .08)); c.fill();
    c.fillStyle = o.band || '#E39A14';
    c.fillRect(x, y + h * 0.31, w, h * 0.18);
    c.restore();
    tx(c, o.label || '零食', x + w / 2, y + h * 0.86, {
      size: Math.max(10, h * 0.16), color: '#7A4A00', weight: 600, align: 'center', alpha: al
    });
  }

  const D = {};

  /* ---------------- 26 镜 ---------------- */
  const __META = {
    1: { title: '便宜＋数据好，为什么仍被退？' },
    2: { title: '先核人群，再谈性价比' },
    3: { title: '交判断，不只交链接' },
    4: { title: '提报前的五步判断链' },
    5: { title: '先有本项目的尺子' },
    6: { title: '画像证据缺失＝待核对' },
    7: { title: '例外要上交判断，不可默认通过' },
    8: { title: '看多条、看常态、看拟合作形式' },
    9: { title: '连续性比单条峰值更重要' },
    10: { title: '播放看触达；互动看反应' },
    11: { title: '异常值单列；CPM 口径待确认' },
    12: { title: '数据真实性与可合作状态仍需核对' },
    13: { title: '观众为什么看这个账号？' },
    14: { title: '看有效形式，不看账号标签' },
    15: { title: '拟合作形式的数据才相关' },
    16: { title: '题材相近，不等于产品有角色' },
    17: { title: '场景＝人 × 行为 × 当下需求' },
    18: { title: '先有行为和需求，再有产品' },
    19: { title: '去掉产品，内容还能成立吗？' },
    20: { title: '能加入 ≠ 有必要；可复刻＋关键作用' },
    21: { title: '露出时长要服务讲解任务' },
    22: { title: '把证据排成一张判断卡' },
    23: { title: '练习：粉丝相符、数据尚可、内容是拆盲盒' },
    24: { title: '当前方案不提报；新方案须复核' },
    25: { title: '四个口径边界，按项目确认' },
    26: { title: '提号前，问自己三句' }
  };

  D[1] = function (c, u, q) {
    const items = [['低报价', '一两千元'], ['数据不错', '播放表现良好'], ['曾被通过', '品牌审核过']];
    const w = 500, h = 168, gap = 44, x0 = 166, y0 = 408;
    const fade = 1 - 0.28 * easeOut(seg(u, 6.4, 0.9));
    items.forEach(function (it, i) {
      const p = seg(u, 0.30 + i * 0.85, 0.55);
      if (p <= 0) return;
      const e = easeOut(p), al = e * fade, dy = (1 - e) * 34;
      const x = x0 + i * (w + gap);
      card(c, x, y0 + dy, w, h, 22, al);
      tx(c, '0' + (i + 1), x + 34, y0 + dy + 50, { size: 21, color: P.blue, weight: 600, alpha: al });
      tx(c, it[0], x + 34, y0 + dy + 108, { size: 42, color: P.ink, weight: 600, alpha: al });
      tx(c, it[1], x + 34, y0 + dy + 146, { size: 24, color: P.muted, alpha: al });
    });

    const pp = seg(u, 7.95, 0.5);
    if (pp > 0) {
      const al = easeOut(pp);
      c.save(); c.globalAlpha = al * 0.85; c.strokeStyle = P.blue; c.lineWidth = 2; c.setLineDash([9, 9]);
      c.beginPath(); c.moveTo(960, y0 + h + 24); c.lineTo(960, 612); c.stroke(); c.restore();
      pill(c, 690, 606, 400, 86, '建议提报', { size: 38, alpha: al });
    }

    const sp = seg(u, 9.30, 0.40);
    if (sp > 0) {
      const k = easeOut(sp);
      c.save();
      c.translate(1226, 664); c.rotate(-0.12);
      c.scale(1.5 - 0.5 * k, 1.5 - 0.5 * k);
      c.globalAlpha = Math.min(1, sp * 1.6);
      c.strokeStyle = P.pink; c.lineWidth = 4;
      c.beginPath(); c.roundRect(-148, -44, 296, 88, 10); c.stroke();
      tx(c, '被退回', 0, 18, { size: 50, color: P.pink, weight: 700, align: 'center' });
      c.restore();
      const rp = seg(u, 9.3, 1.2);
      if (rp < 1) {
        c.save(); c.globalAlpha = (1 - rp) * 0.30; c.strokeStyle = P.pink; c.lineWidth = 3;
        c.beginPath(); c.arc(1226, 664, 78 + rp * 240, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    }

    const qq = seg(u, at(q, 2), 0.5);
    if (qq > 0) {
      const al = easeOut(qq);
    }

    const n = seg(u, at(q, 3), 0.6);
    if (n > 0) {
      const al = easeOut(n);
      card(c, 166, 748, 1020, 62, 15, al * 0.96);
      c.save(); c.globalAlpha = al; c.fillStyle = P.pink;
      c.beginPath(); c.roundRect(188, 767, 4, 20, 2); c.fill(); c.restore();
      tx(c, '只看价格＋播放量，容易误判成“划算的合作”', 214, 789, { size: 27, color: P.ink2, weight: 500, alpha: al });
    }
  };

  D[2] = function (c, u, q) {
    const ex = easeOut(seg(u, 0.02, 0.75));
    if (ex < 1) {
      card(c, 166, 396, 392, 74, 15, 1 - ex);
      tx(c, '报价低 ≠ 合适', 190, 443, { size: 26, color: P.pink, weight: 600, alpha: 1 - ex });
    }

    const bx = 520, bw = 980;
    const p1 = easeOut(seg(u, 0.30, 0.8));
    if (p1 > 0) {
      tx(c, '项目希望触达', 166, 470, { size: 26, color: P.muted, alpha: p1 });
      tx(c, '女性方向', 166, 508, { size: 31, color: P.ink, weight: 600, alpha: p1 });
      c.save(); c.globalAlpha = p1 * .12; c.fillStyle = P.pale;
      c.beginPath(); c.roundRect(bx, 450, bw, 58, 29); c.fill(); c.restore();
      c.save(); c.globalAlpha = p1; c.fillStyle = P.blue;
      c.beginPath(); c.roundRect(bx, 450, Math.max(58, bw * p1), 58, 29); c.fill(); c.restore();
      tx(c, '目标：女性受众', bx + 30, 488, { size: 24, color: '#fff', weight: 600, alpha: p1 });
    }

    const p2 = easeOut(seg(u, at(q, 1) + 0.5, 1.0));
    if (p2 > 0) {
      tx(c, '该案例账号', 166, 594, { size: 26, color: P.muted, alpha: p2 });
      tx(c, '吃播 · 后台受众数据', 166, 630, { size: 24, color: P.faint, alpha: p2 });
      const mw = bw * 0.80 * p2, fw = bw * 0.20 * p2;
      c.save(); c.globalAlpha = p2 * .12; c.fillStyle = P.pale;
      c.beginPath(); c.roundRect(bx, 576, bw, 58, 29); c.fill(); c.restore();
      c.save(); c.globalAlpha = p2; c.fillStyle = P.pink;
      c.beginPath(); c.roundRect(bx, 576, Math.max(20, mw), 58, mw > 58 ? 29 : 6); c.fill(); c.restore();
      if (fw > 3) {
        c.save(); c.globalAlpha = p2; c.fillStyle = P.blue;
        c.beginPath(); c.roundRect(bx + mw, 576, fw, 58, 0); c.fill(); c.restore();
      }
      tx(c, '男性约 80%', bx + 28, 614, { size: 24, color: '#fff', weight: 600, alpha: p2 > .55 ? 1 : 0 });
      if (p2 > .95) tx(c, '女性约 20%', bx + bw * 0.80 + 12, 614, { size: 19, color: '#fff', weight: 600 });
    }

    const dd = easeOut(seg(u, at(q, 2), 0.65));
    if (dd > 0) {
      c.save(); c.globalAlpha = dd; c.strokeStyle = P.pink; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(bx + bw * .795, 652); c.lineTo(bx + bw * 1.0, 652); c.stroke();
      c.beginPath(); c.moveTo(bx + bw * .795, 652); c.lineTo(bx + bw * .78, 660); c.stroke();
      c.beginPath(); c.moveTo(bx + bw * 1.0, 652); c.lineTo(bx + bw * 1.0, 664); c.stroke();
      c.restore();
      tx(c, '目标人群在此只占约两成', bx + bw * .90, 700, { size: 24, color: P.pink, weight: 600, align: 'center', alpha: dd });
      card(c, 166, 744, 1688, 64, 15, dd * 0.96);
      tx(c, '本案例数字只说明偏差，不是所有项目的通用比例门槛', 198, 786, { size: 26, color: P.ink2, weight: 500, alpha: dd });
    }
  };

  D[3] = function (c, u, q) {
    const ap = easeOut(seg(u, 0.25, 0.6));
    card(c, 166, 396, 1688, 412, 26, ap);
    tx(c, '提报判断卡', 202, 446, { size: 29, color: P.ink, weight: 600, alpha: ap });
    tx(c, '为什么提 / 为什么不提 / 还缺什么信息', 202, 482, { size: 22, color: P.muted, alpha: ap });

    const t1 = at(q, 1), t2 = at(q, 2), t3 = at(q, 3);
    const fields = [
      ['项目目标', '本次产品要找谁', t1],
      ['画像与数据', '后台截图 · 近期常态', t1 === undefined ? 0 : t1 + 1.15],
      ['有效内容', '观众为什么看', t2],
      ['内容构想', '场景与产品角色', t2 === undefined ? 0 : t2 + 1.3],
      ['结论与风险', '提 / 不提 / 待核对', t3]
    ];
    fields.forEach(function (f, i) {
      const p = easeOut(seg(u, f[2] || 0.25, 0.55));
      if (p <= 0) return;
      const x = 202 + i * 322, y = 524;
      c.save(); c.globalAlpha = p; c.fillStyle = 'rgba(17,105,255,.07)';
      c.beginPath(); c.roundRect(x, y, 288, 250, 18); c.fill(); c.restore();
      tx(c, pad2(i + 1), x + 24, y + 44, { size: 21, color: P.blue, weight: 600, alpha: p });
      tx(c, f[0], x + 24, y + 90, { size: 30, color: P.ink, weight: 600, alpha: p });
      tx(c, f[1], x + 24, y + 132, { size: 20, color: P.muted, alpha: p });
      c.save(); c.globalAlpha = p * .65; c.strokeStyle = '#BCD2F1'; c.lineWidth = 1.5; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(x + 24, y + 196); c.lineTo(x + 262, y + 196); c.stroke(); c.restore();
    });
  };

  D[4] = function (c, u, q) {
    const nodes = [['项目目标', '本次产品找谁'], ['常态数据', '能否稳定触达'], ['内容关注点', '观众为什么看'], ['场景与角色', '产品为何被需要'], ['提报结论', '提 / 不提 / 待核对']];
    const y = 588, xs = [214, 562, 910, 1258, 1606];
    const track = easeOut(seg(u, 0.12, 0.75));
    c.save(); c.globalAlpha = .55; c.strokeStyle = '#CBDCF5'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(xs[0], y); c.lineTo(xs[0] + (xs[4] - xs[0]) * track, y); c.stroke(); c.restore();

    let lit = -1, grow = 0;
    nodes.forEach(function (nd, i) {
      const cue = q[i + 1];
      const p = cue === undefined ? 0 : easeOut(seg(u, cue, 0.5));
      if (p > 0) { lit = i; grow = p; }
      const on = p > 0;
      c.save(); c.globalAlpha = on ? 1 : .32;
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(xs[i], y, 36, 0, Math.PI * 2); c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? P.blue : '#C7D6EC';
      c.beginPath(); c.arc(xs[i], y, 36, 0, Math.PI * 2); c.stroke();
      tx(c, pad2(i + 1), xs[i], y + 9, { size: 23, color: on ? P.blue : P.faint, weight: 600, align: 'center' });
      c.restore();
      if (on) {
        tx(c, nd[0], xs[i], y + 92, { size: 29, color: P.ink, weight: 600, align: 'center', alpha: p });
        tx(c, nd[1], xs[i], y + 128, { size: 21, color: P.muted, align: 'center', alpha: p });
      }
    });
    if (lit >= 1) {
      c.save(); c.strokeStyle = P.blue; c.lineWidth = 4;
      c.beginPath(); c.moveTo(xs[0], y);
      const px = xs[0] + (xs[lit] - xs[0]) * grow;
      c.lineTo(px, y); c.stroke(); c.restore();
    }
    const cap = easeOut(seg(u, at(q, 5), 0.6));
    if (cap > 0) {
      card(c, 166, 736, 1688, 62, 15, cap * 0.96);
      tx(c, '每过一关，都留下一份别人能复核的依据', 198, 778, { size: 26, color: P.ink2, weight: 500, alpha: cap });
    }
  };

  D[5] = function (c, u, q) {
    const left = easeOut(seg(u, 0.12, 0.6));
    card(c, 166, 396, 470, 250, 24, left);
    tx(c, '本项目的 brief', 196, 442, { size: 22, color: P.muted, alpha: left });
    tx(c, '美食达人', 196, 512, { size: 47, color: P.ink, weight: 600, alpha: left });
    tag(c, 196, 546, '需求不明确', { dashed: true, color: '#98A8BE', fill: '#fff', alpha: left });

    const cells = [['目标人群', '女性？职场人？\n具体到本次产品'], ['待测场景', '办公室？居家？\n产品何时被用'], ['待测内容方向', '测评？剧情？\n本次要验证什么']];
    cells.forEach(function (cell, i) {
      const p = easeOut(seg(u, at(q, 1) + 0.35 + i * 0.75, 0.55));
      if (p <= 0) return;
      const x = 700 + i * 380;
      card(c, x, 396, 340, 250, 24, p);
      tx(c, '0' + (i + 1), x + 26, 442, { size: 21, color: P.blue, weight: 600, alpha: p });
      tx(c, cell[0], x + 26, 494, { size: 30, color: P.ink, weight: 600, alpha: p });
      para(c, cell[1], x + 26, 536, { size: 21, color: P.muted, maxW: 288, lh: 32, alpha: p, maxLines: 2 });
    });

    const note = easeOut(seg(u, at(q, 2), 0.6));
    if (note > 0) {
      card(c, 166, 688, 760, 70, 16, note * 0.96);
      c.save(); c.globalAlpha = note; c.fillStyle = P.blue;
      c.beginPath(); c.roundRect(188, 708, 4, 20, 2); c.fill(); c.restore();
      tx(c, '没有项目目标，就无法判断粉丝画像是否“合适”', 214, 730, { size: 25, color: P.ink2, weight: 500, alpha: note });
    }

    const old = easeOut(seg(u, at(q, 3), 0.6));
    if (old > 0) {
      const dx = (1 - old) * 60;
      card(c, 960 + dx, 688, 894, 70, 16, old * 0.96);
      tx(c, '上一款产品的性别／年龄要求', 986 + dx, 730, { size: 24, color: P.muted, alpha: old });
      c.save(); c.globalAlpha = old; c.strokeStyle = P.pink; c.lineWidth = 2;
      c.beginPath(); c.moveTo(984 + dx, 720); c.lineTo(1280 + dx, 720); c.stroke();
      tx(c, '✕ 不能直接套用', 1300 + dx, 730, { size: 24, color: P.pink, weight: 600, alpha: old });
      c.restore();
    }
  };

  D[6] = function (c, u, q) {
    const l = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 396, 560, 306, 24, l * (1 - 0.25 * easeOut(seg(u, at(q, 1), 0.6))));
    tx(c, '账号主页印象', 198, 444, { size: 27, color: P.ink, weight: 600, alpha: l });
    [0, 1, 2].forEach(function (i) {
      c.save(); c.globalAlpha = l * .35; c.fillStyle = '#DCE7F6';
      c.beginPath(); c.roundRect(198, 472 + i * 62, 480, 42, 10); c.fill(); c.restore();
    });
    const nope = easeOut(seg(u, at(q, 1), 0.55));
    if (nope > 0) {
      frameCard(c, 166, 396, 560, 306, 24, P.pink, 2, nope * .8);
      tag(c, 198, 636, '主页印象不能作为依据', { fill: 'rgba(255,61,110,.10)', color: P.pink, alpha: nope });
    }

    const r = easeOut(seg(u, 0.45, 0.6));
    card(c, 760, 396, 700, 306, 24, r);
    tx(c, '后台画像截图（示意）', 792, 444, { size: 27, color: P.ink, weight: 600, alpha: r });
    tx(c, '完整截图优于一句“粉丝挺准”', 792, 478, { size: 21, color: P.muted, alpha: r });

    const b = easeOut(seg(u, at(q, 2) + 0.35, 0.8));
    if (b > 0) {
      tx(c, '男性', 792, 560, { size: 22, color: P.muted, alpha: b });
      c.save(); c.globalAlpha = b * .12; c.fillStyle = P.pale;
      c.beginPath(); c.roundRect(880, 542, 520, 34, 17); c.fill(); c.restore();
      c.save(); c.globalAlpha = b; c.fillStyle = P.pink;
      c.beginPath(); c.roundRect(880, 542, 520 * .8 * b, 34, 17); c.fill(); c.restore();
      tx(c, '约 80%', 890 + 520 * .8 * b, 568, { size: 20, color: '#fff', weight: 600, alpha: b });
      tx(c, '女性', 792, 626, { size: 22, color: P.muted, alpha: b });
      c.save(); c.globalAlpha = b * .12; c.fillStyle = P.pale;
      c.beginPath(); c.roundRect(880, 608, 520, 34, 17); c.fill(); c.restore();
      c.save(); c.globalAlpha = b; c.fillStyle = P.blue;
      c.beginPath(); c.roundRect(880, 608, 520 * .2 * b, 34, 17); c.fill(); c.restore();
      tx(c, '约 20%', 890 + 520 * .2 * b + 8, 634, { size: 20, color: '#fff', weight: 600, alpha: b });
    }

    const br = easeOut(seg(u, 0.7, 0.6));
    if (br > 0) {
      pill(c, 166, 738, 340, 66, '截图已核 → 可用', { size: 24, fill: 'rgba(17,105,255,.10)', color: P.blue, alpha: br });
      pill(c, 530, 738, 380, 66, '缺截图 → 待核对', { size: 24, fill: 'rgba(255,61,110,.10)', color: P.pink, alpha: br });
      tx(c, '缺项时请达人补完整后台截图', 940, 780, { size: 24, color: P.muted, alpha: br });
    }
  };

  D[7] = function (c, u, q) {
    const root = easeOut(seg(u, 0.1, 0.6));
    pill(c, 166, 396, 330, 62, '人群有偏差', { size: 26, fill: P.purple, alpha: root });

    const cards = [
      ['明显不符', '目标人群对不上\n不建议本次提报', 166, P.pink],
      ['内容有特殊价值', '写清偏差与可能用途\n交 PM／编导判断', 700, P.purple],
      ['项目层面测试人群', '项目策略安排\n不是单个账号自动过关', 1234, P.blue]
    ];
    cards.forEach(function (item, i) {
      const p = easeOut(seg(u, at(q, i === 0 ? 0 : i === 1 ? 1 : 2), 0.6));
      if (p <= 0) return;
      const x = item[2], w = i === 2 ? 470 : 500, y = 500;
      card(c, x, y, w, 216, 22, p);
      c.save(); c.globalAlpha = p; c.fillStyle = item[3];
      c.beginPath(); c.roundRect(x, y, 6, 216, 3); c.fill(); c.restore();
      tx(c, item[0], x + 30, y + 58, { size: 31, color: P.ink, weight: 600, alpha: p });
      para(c, item[1], x + 30, y + 106, { size: 22, color: P.muted, maxW: w - 60, lh: 34, alpha: p, maxLines: 2 });
      c.save(); c.globalAlpha = p * .7; c.strokeStyle = 'rgba(17,105,255,.3)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(330, 458); c.lineTo(x + w / 2, 500); c.stroke(); c.restore();
    });

    const mid = easeOut(seg(u, at(q, 1) + 3.2, 0.55));
    if (mid > 0) {
      tag(c, 730, 646, '例外必须写理由', { fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: mid });
    }
    const c3 = easeOut(seg(u, at(q, 3), 0.6));
    if (c3 > 0) {
      tx(c, '项目策略 ≠ 单个账号自动通过', 1258, 720, { size: 21, color: P.pink, weight: 600, alpha: c3 });
      card(c, 166, 748, 1688, 62, 15, c3 * 0.96);
      tx(c, '偏差不能自行消化：要么换人，要么带着理由上交判断', 198, 790, { size: 26, color: P.ink2, weight: 500, alpha: c3 });
    }
  };


  D[8] = function (c, u, q) {
    card(c, 166, 392, 1140, 412, 26, 1);
    const vals = [32, 64, 44, 71, 58, 93, 48, 57, 42, 66, 50, 60, 55, 45, 53];
    const base = 726, x0 = 222, bw = 46, gp = 18;
    const zoom = 1 + 0.85 * (1 - easeOut(seg(u, at(q, 1), 1.0)));
    c.save();
    c.beginPath(); c.roundRect(166, 392, 1140, 412, 26); c.clip();
    const cx = x0 + 5.5 * (bw + gp), cy = 590;
    c.translate(cx, cy); c.scale(zoom, zoom); c.translate(-cx, -cy);
    tx(c, '播放量 / 近期 15 条', 196, 436, { size: 22, color: P.muted, alpha: 1 / zoom });
    vals.forEach(function (v, i) {
      const g = easeOut(seg(u, 0.15 + i * 0.045, 0.45));
      const h = Math.max(3, v / 100 * 246 * g);
      let col = '#BBD4FA';
      if (i >= 9) col = P.blue;
      if (i === 5) col = P.pink;
      if (at(q, 2) > 0 && u > at(q, 2) + 0.4) col = i >= 9 ? P.blue : '#CEDDF3';
      if (at(q, 3) > 0 && u > at(q, 3)) col = i >= 9 ? P.blue : '#DAE5F4';
      c.save(); c.fillStyle = col;
      c.beginPath(); c.roundRect(x0 + i * (bw + gp), base - h, bw, h, Math.min(6, h / 2)); c.fill(); c.restore();
    });
    c.save(); c.strokeStyle = P.line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(206, base + 2); c.lineTo(1180, base + 2); c.stroke(); c.restore();
    c.restore();

    const band = easeOut(seg(u, at(q, 2), 0.8));
    if (band > 0) {
      c.save(); c.globalAlpha = band * .55; c.fillStyle = 'rgba(17,105,255,.10)';
      c.beginPath(); c.roundRect(206, 556, 974, 74, 12); c.fill(); c.restore();
      tx(c, '常态区间：多数作品落在这里', 222, 548, { size: 22, color: P.blue, weight: 600, alpha: band });
    }
    const vary = easeOut(seg(u, at(q, 3), 0.7));
    if (vary > 0) {
      c.save(); c.globalAlpha = vary; c.strokeStyle = P.purple; c.lineWidth = 2; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(206, 504); c.lineTo(1180, 504); c.stroke(); c.restore();
      tx(c, '起伏大小：看差距，不只看最高', 222, 494, { size: 21, color: P.purple, weight: 600, alpha: vary });
    }
    const form = easeOut(seg(u, at(q, 4), 0.8));
    if (form > 0) {
      c.save(); c.globalAlpha = form; c.strokeStyle = P.blue; c.lineWidth = 2.5;
      c.beginPath(); c.roundRect(206 + 9 * (bw + gp) - 10, 448, 5 * (bw + gp) + 4, 330, 10); c.stroke(); c.restore();
      tx(c, '拟合作形式的近几条', 206 + 9 * (bw + gp) - 4, 438, { size: 21, color: P.blue, weight: 600, alpha: form });
    }

    const items = [['单条峰值', '不代表整体', 0.45], ['近期多条', '看常态与起伏', at(q, 2)], ['拟合作形式', '有没有持续表现', at(q, 4)]];
    items.forEach(function (it, i) {
      const p = easeOut(seg(u, it[2], 0.55));
      if (p <= 0) return;
      card(c, 1336, 404 + i * 132, 400, 112, 20, p);
      tx(c, '0' + (i + 1), 1360, 440 + i * 132, { size: 19, color: P.blue, weight: 600, alpha: p });
      tx(c, it[0], 1360, 482 + i * 132, { size: 29, color: P.ink, weight: 600, alpha: p });
      tx(c, it[1], 1360, 510 + i * 132, { size: 21, color: P.muted, alpha: p });
    });
  };

  D[9] = function (c, u, q) {
    const p = easeOut(seg(u, 0.15, 0.7));
    const cs = [
      { key: '01', x: 166, label: '历史案例 A：近期多条偏低', crop: [0.60, 0.30, 0.36, 0.62] },
      { key: '02', x: 966, label: '历史案例 B：整体更稳定', crop: [0.62, 0.22, 0.36, 0.62] }
    ];
    cs.forEach(function (s, i) {
      card(c, s.x, 392, 800, 352, 24, p);
      tx(c, s.label, s.x + 26, 432, { size: 25, color: P.ink, weight: 600, alpha: p });
      tag(c, s.x + 620, 410, '历史截图', { size: 18, fill: 'rgba(17,105,255,.10)', color: P.blue, alpha: p });
      const z = easeOut(seg(u, at(q, 1) + i * 1.2, 1.3));
      const crop = [
        0 + (s.crop[0]) * z, 0 + (s.crop[1]) * z,
        1 - (1 - s.crop[2]) * z, 1 - (1 - s.crop[3]) * z
      ];
      drawImg(c, s.key, s.x + 22, 456, 756, 264, crop, p);
      frameCard(c, s.x + 22, 456, 756, 264, 10, 'rgba(17,105,255,.16)', 1, p);
      if (z > .6) {
        c.save(); c.globalAlpha = (z - .6) / .4;
        c.strokeStyle = P.pink; c.lineWidth = 3;
        c.beginPath(); c.roundRect(s.x + 22 + 756 * .55, 456 + 264 * .46, 756 * .42, 264 * .42, 8); c.stroke();
        c.restore();
      }
    });

    const cap = easeOut(seg(u, at(q, 1), 0.6));
    if (cap > 0) {
      card(c, 166, 760, 1688, 56, 14, cap * 0.96);
      tx(c, '一个低值不应一票否决；一条高值也不能替代对连续表现的判断', 198, 796, { size: 25, color: P.ink2, weight: 500, alpha: cap });
    }
    const ten = easeOut(seg(u, at(q, 2), 0.6));
    if (ten > 0) {
      tag(c, 1030, 690, '“十万”只是案例里的数量，不是统一门槛', { size: 19, fill: 'rgba(255,61,110,.10)', color: P.pink, alpha: ten });
    }
  };

  D[10] = function (c, u, q) {
    const p = easeOut(seg(u, 0.12, 0.65));
    card(c, 166, 392, 800, 316, 24, p);
    card(c, 966, 392, 800, 316, 24, p);
    tx(c, 'A：长期点赞偏低', 196, 434, { size: 26, color: P.ink, weight: 600, alpha: p });
    tx(c, 'B：单条点赞不错、播放不高', 996, 434, { size: 26, color: P.ink, weight: 600, alpha: p });
    drawImg(c, '03', 186, 456, 760, 232, [0.06, 0.20, 0.88, 0.55], p);
    drawImg(c, '04', 986, 456, 760, 232, [0.02, 0.10, 0.92, 0.62], p);

    const labels = [
      { x: 166, t: '播放 → 触达', sub: '多少人看到', at: at(q, 1), col: P.blue },
      { x: 640, t: '互动 → 反应', sub: '多少人愿意回应', at: at(q, 4), col: P.purple },
      { x: 966, t: '播放 → 触达', sub: '这条触达并不大', at: at(q, 3), col: P.blue },
      { x: 1440, t: '互动 → 反应', sub: '老粉更愿意互动', at: at(q, 4), col: P.purple }
    ];
    labels.forEach(function (l) {
      const pp = easeOut(seg(u, l.at, 0.55));
      if (pp <= 0) return;
      tag(c, l.x, 728, l.t, { size: 20, fill: 'rgba(17,105,255,.10)', color: l.col, alpha: pp });
      tx(c, l.sub, l.x, 786, { size: 19, color: P.muted, alpha: pp });
    });

    const con = easeOut(seg(u, at(q, 6), 0.6));
    if (con > 0) {
      card(c, 166, 760, 1688, 0, 0, 0);
      tx(c, '每个数字回答的是不同问题：触达看播放，反应看互动', 166, 790, { size: 26, color: P.ink2, weight: 600, alpha: con });
    }
  };

  D[11] = function (c, u, q) {
    card(c, 166, 392, 1120, 412, 26, 1);
    const vals = [25, 30, 27, 26, 28, 31, 29, 96, 30, 33, 28, 32, 27, 30, 31];
    const base = 720, x0 = 226, bw = 44, gp = 16;
    const sep = easeOut(seg(u, at(q, 1), 0.9));
    vals.forEach(function (v, i) {
      const g = easeOut(seg(u, 0.2 + i * 0.04, 0.45));
      const h = Math.max(3, v / 100 * 250 * g);
      const isPeak = i === 7;
      let col = '#BBD4FA';
      if (isPeak) col = sep > .5 ? P.pink : P.pink;
      if (i < 7) col = '#9DC2F7';
      c.save(); c.fillStyle = col;
      c.beginPath(); c.roundRect(x0 + i * (bw + gp) + (isPeak ? sep * 60 : 0), base - h, bw, h, Math.min(6, h / 2)); c.fill();
      c.restore();
      if (isPeak && sep > .5) {
        tx(c, '单列', x0 + i * (bw + gp) + 60 + bw / 2, base + 26, { size: 18, color: P.pink, weight: 600, align: 'center', alpha: (sep - .5) * 2 });
      }
    });
    c.save(); c.strokeStyle = P.line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(210, base + 2); c.lineTo(1160, base + 2); c.stroke(); c.restore();

    if (sep > 0) {
      c.save(); c.globalAlpha = sep; c.strokeStyle = 'rgba(255,61,110,.55)'; c.lineWidth = 2; c.setLineDash([8, 8]);
      c.beginPath(); c.moveTo(210, 470); c.lineTo(1160, 470); c.stroke(); c.restore();
      tx(c, '含异常值：均值被拉高', 226, 458, { size: 21, color: P.pink, weight: 600, alpha: sep });
      c.save(); c.globalAlpha = sep; c.strokeStyle = 'rgba(17,105,255,.55)'; c.lineWidth = 2; c.setLineDash([8, 8]);
      c.beginPath(); c.moveTo(210, 552); c.lineTo(1160, 552); c.stroke(); c.restore();
      tx(c, '单列后：回看常态', 226, 540, { size: 21, color: P.blue, weight: 600, alpha: sep });
    }

    const items = [['异常峰值', '单独标出，不混进均值', at(q, 1)], ['自然／商单', '两类内容分开看', at(q, 1) + 1.6], ['CPM 口径', '统计窗口、剔除、分母待确认', at(q, 2)]];
    items.forEach(function (it, i) {
      const p = easeOut(seg(u, it[2], 0.55));
      if (p <= 0) return;
      card(c, 1320, 404 + i * 134, 420, 112, 20, p);
      tx(c, it[0], 1346, 446 + i * 134, { size: 28, color: P.ink, weight: 600, alpha: p });
      para(c, it[1], 1346, 478 + i * 134, { size: 19, color: P.muted, maxW: 372, lh: 26, alpha: p, maxLines: 2 });
    });

    const pend = easeOut(seg(u, at(q, 3), 0.6));
    if (pend > 0) {
      tag(c, 1320, 760, 'CPM 不在视频里定公式', { size: 21, dashed: true, color: P.pink, alpha: pend });
    }
    const no = easeOut(seg(u, at(q, 4), 0.6));
    if (no > 0) {
      tx(c, '口径由项目确认，讲解只指出方法', 166 + 0, 800, { size: 24, color: P.ink2, weight: 500, alpha: no });
    }
  };

  D[12] = function (c, u, q) {
    const buckets = [['讨论内容', '剧情、形式、作品本身', 166], ['讨论产品', '体验、用法、值不值', 700], ['只讨论达人本人', '形象、关系、情绪', 1234]];
    buckets.forEach(function (b, i) {
      const p = easeOut(seg(u, 0.15 + i * 0.15, 0.6));
      card(c, b[2], 470, 470, 196, 22, p);
      tx(c, b[0], b[2] + 28, 516, { size: 30, color: P.ink, weight: 600, alpha: p });
      tx(c, b[1], b[2] + 28, 552, { size: 21, color: P.muted, alpha: p });
      c.save(); c.globalAlpha = p * .7; c.strokeStyle = P.line; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(b[2] + 28, 576); c.lineTo(b[2] + 442, 576); c.stroke(); c.restore();
    });

    const bubbles = [
      ['这条剧情好哭', 0, 0.9], ['这个零食哪里买', 1, 2.1], ['他本人好可爱', 2, 3.3]
    ];
    bubbles.forEach(function (b, i) {
      const p = easeOut(seg(u, b[2], 0.7));
      if (p <= 0) return;
      const bx = 300 + i * 300, by = 690;
      const tx2 = b[1] === 0 ? 260 : b[1] === 1 ? 794 : 1328;
      const ty = 620;
      const x = bx + (tx2 - bx) * p, y = by + (ty - by) * p;
      c.save(); c.globalAlpha = Math.min(1, p * 1.5);
      c.fillStyle = 'rgba(17,105,255,.07)';
      c.beginPath(); c.roundRect(x, y, 250, 54, 27); c.fill();
      c.restore();
      tx(c, b[0], x + 125, y + 36, { size: 21, color: P.ink2, weight: 500, align: 'center', alpha: Math.min(1, p * 1.5) });
    });

    const clue = easeOut(seg(u, at(q, 1), 0.6));
    if (clue > 0) {
      tag(c, 166, 742, '点赞 ≈ 评论：只是进一步核查的线索', { size: 22, fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: clue });
    }
    const chk = easeOut(seg(u, at(q, 2), 0.6));
    if (chk > 0) {
      tag(c, 720, 742, '最近是否更新', { size: 21, dashed: true, color: P.pink, alpha: chk });
      tag(c, 930, 742, '时长与平台审核规则', { size: 21, dashed: true, color: P.pink, alpha: chk });
      tx(c, '按当前项目与平台规则复核，历史经验不是永久标准', 1210, 776, { size: 20, color: P.muted, alpha: chk });
    }
  };

  D[13] = function (c, u, q) {
    const back = easeOut(seg(u, 0.05, 0.8));
    c.save(); c.globalAlpha = .22 * (1 - back * .5);
    const vals = [30, 55, 38, 62, 45, 70, 40, 52, 36];
    vals.forEach(function (v, i) {
      c.fillStyle = '#9DC2F7';
      c.beginPath(); c.roundRect(166 + i * 46, 470 - v, 30, v, 4); c.fill();
    });
    c.restore();
    tx(c, '数据：多少人看', 166, 500, { size: 20, color: P.faint, alpha: .6 });

    const drawers = [
      ['人', ['形象', '关系', '情绪'], 0.35, P.purple],
      ['形式', ['拆盲盒', '短梗', 'Vlog', '剧情'], 1.55, P.blue],
      ['品类', ['玩具', '甜品', '零食'], 2.75, P.blue]
    ];
    drawers.forEach(function (d, i) {
      const p = easeOut(seg(u, at(q, 1) + d[2], 0.6));
      if (p <= 0) return;
      const x = 166 + i * 560, y = 470, w = 500;
      card(c, x, y, w, 296, 24, p);
      tx(c, d[0], x + 28, y + 48, { size: 34, color: P.ink, weight: 600, alpha: p });
      c.save(); c.globalAlpha = p * .7; c.strokeStyle = P.line; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + 28, y + 68); c.lineTo(x + w - 28, y + 68); c.stroke(); c.restore();
      const op = easeOut(seg(u, at(q, 1) + d[2] + 0.25, 0.55));
      d[1].forEach(function (item, j) {
        if (op <= 0) return;
        const yy = y + 104 + j * 44;
        c.save(); c.globalAlpha = op; c.fillStyle = i === 0 ? 'rgba(121,92,255,.10)' : 'rgba(17,105,255,.09)';
        c.beginPath(); c.roundRect(x + 28, yy - 26, w - 56, 36, 9); c.fill(); c.restore();
        tx(c, item, x + 44, yy, { size: 22, color: P.ink2, weight: 500, alpha: op });
      });
    });

    const con = easeOut(seg(u, at(q, 2), 0.6));
    if (con > 0) {
      card(c, 166, 776, 1688, 34, 10, 0);
      tx(c, '观众为什么看，决定合作内容能借到什么', 166 + 500, 800, { size: 27, color: P.ink2, weight: 600, alpha: con, align: 'center' });
    }
  };

  D[14] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 700, 412, 24, p);
    tx(c, '同一个账号：作品与评论', 196, 436, { size: 26, color: P.ink, weight: 600, alpha: p });

    const thumbs = ['情感', '关系', 'Vlog'];
    thumbs.forEach(function (t, i) {
      const x = 196 + i * 216;
      const gd = c.createLinearGradient(x, 466, x + 190, 606);
      gd.addColorStop(0, 'rgba(121,92,255,.14)'); gd.addColorStop(1, 'rgba(17,105,255,.10)');
      c.save(); c.globalAlpha = p; c.fillStyle = gd;
      c.beginPath(); c.roundRect(x, 466, 190, 140, 12); c.fill(); c.restore();
      tx(c, t, x + 95, 588, { size: 20, color: P.muted, align: 'center', alpha: p });
    });

    const com = [['“好甜，磕到了”', 0], ['“他们俩好配”', 1], ['“本人状态真松弛”', 2]];
    com.forEach(function (cm, i) {
      const qq = easeOut(seg(u, 1.2 + i * 0.5, 0.5));
      if (qq <= 0) return;
      const y = 640 + i * 52;
      c.save(); c.globalAlpha = qq * .9; c.fillStyle = 'rgba(255,255,255,.9)'; c.strokeStyle = P.line; c.lineWidth = 1;
      c.beginPath(); c.roundRect(196, y - 30, 640, 40, 20); c.fill(); c.stroke(); c.restore();
      tx(c, cm[0], 220, y, { size: 21, color: P.ink2, alpha: qq });
    });

    const hl = easeOut(seg(u, at(q, 1), 0.6));
    if (hl > 0) {
      tag(c, 196, 780, '关注对象是人：产品未必进入讨论', { size: 20, fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: hl });
    }

    const forms = [['拆盲盒', 900, 420], ['短梗', 1304, 420], ['Vlog', 900, 612], ['剧情', 1304, 612]];
    forms.forEach(function (f, i) {
      const pp = easeOut(seg(u, 0.4 + i * 0.12, 0.55));
      if (pp <= 0) return;
      const sel = f[0] === '短梗' ? easeOut(seg(u, at(q, 2), 0.6)) : 0;
      const dim = sel > 0 && f[0] !== '短梗' ? 1 - sel * 0.45 : 1;
      card(c, f[1], f[2], 380, 168, 22, pp * dim);
      tx(c, f[0], f[1] + 28, f[2] + 76, { size: 34, color: sel > .4 && f[0] === '短梗' ? P.blue : P.ink, weight: 600, alpha: pp * dim });
      tx(c, f[0] === '拆盲盒' ? '等玩具开出什么' : f[0] === '短梗' ? '等笑点与反差' : f[0] === 'Vlog' ? '等生活质感' : '等情节推进',
        f[1] + 28, f[2] + 112, { size: 20, color: P.muted, alpha: pp * dim });
      if (sel > 0 && f[0] === '短梗') {
        frameCard(c, f[1], f[2], 380, 168, 22, P.blue, 2.5, sel);
      }
    });

    const con = easeOut(seg(u, at(q, 3), 0.6));
    if (con > 0) {
      tx(c, '合作提案要借得上那个真正有效的形式', 900, 800, { size: 23, color: P.ink2, weight: 600, alpha: con });
    }
  };

  D[15] = function (c, u, q) {
    const p = easeOut(seg(u, 0.12, 0.6));
    card(c, 166, 392, 700, 360, 24, p);
    card(c, 900, 392, 700, 360, 24, p);
    tx(c, '情感内容', 198, 438, { size: 28, color: P.ink, weight: 600, alpha: p });
    tx(c, 'Vlog', 932, 438, { size: 28, color: P.ink, weight: 600, alpha: p });

    const rows = [
      [198, [82, 76, 71], P.purple, '情感'],
      [932, [34, 28, 31], P.blue, 'Vlog']
    ];
    rows.forEach(function (r, ri) {
      r[1].forEach(function (v, i) {
        const g = easeOut(seg(u, 0.4 + i * 0.25 + ri * 1.2, 0.6));
        const y = 512 + i * 62;
        c.save(); c.globalAlpha = p * .12; c.fillStyle = P.pale;
        c.beginPath(); c.roundRect(r[0], y, 560, 32, 16); c.fill(); c.restore();
        c.save(); c.globalAlpha = p; c.fillStyle = r[2];
        c.beginPath(); c.roundRect(r[0], y, Math.max(16, 560 * v / 100 * g), 32, 16); c.fill(); c.restore();
        tx(c, '作品 ' + (i + 1), r[0] + 12, y + 23, { size: 18, color: '#fff', weight: 600, alpha: p });
        tx(c, v + '', r[0] + 560 * v / 100 * g + 12, y + 23, { size: 18, color: P.muted, alpha: p * g });
      });
    });

    const warn = easeOut(seg(u, at(q, 1), 0.6));
    if (warn > 0) {
      c.save(); c.globalAlpha = warn * .55; c.fillStyle = 'rgba(255,61,110,.10)';
      c.beginPath(); c.roundRect(184, 480, 664, 208, 14); c.fill(); c.restore();
      tag(c, 560, 700, '不能用这里的数据为 Vlog 背书', { size: 20, fill: 'rgba(255,61,110,.12)', color: P.pink, alpha: warn });
    }

    const arrow = easeOut(seg(u, at(q, 2), 0.7));
    if (arrow > 0) {
      c.save(); c.globalAlpha = arrow; c.strokeStyle = P.blue; c.lineWidth = 3;
      c.beginPath(); c.moveTo(766, 742); c.quadraticCurveTo(900, 800, 1040, 704); c.stroke();
      c.beginPath(); c.moveTo(1040, 704); c.lineTo(1030, 716); c.moveTo(1040, 704); c.lineTo(1026, 700); c.stroke();
      c.restore();
      tx(c, '拟合作方案：生活化植入 → 比较 Vlog 的常态表现', 166, 800, { size: 23, color: P.blue, weight: 600, alpha: arrow });
    }
  };

  D[16] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 730, 404, 24, p);
    card(c, 920, 392, 784, 404, 24, p);
    tx(c, '拆盲盒：等的是玩具结果', 196, 436, { size: 25, color: P.ink, weight: 600, alpha: p });
    tx(c, '甜品教程：等的是制作过程', 950, 436, { size: 25, color: P.ink, weight: 600, alpha: p });

    // 盲盒
    const open = easeOut(seg(u, at(q, 1), 0.9));
    c.save(); c.globalAlpha = p;
    c.fillStyle = '#E8EEFA'; c.beginPath(); c.roundRect(340, 600, 240, 132, 12); c.fill();
    c.fillStyle = '#D6E2F5'; c.beginPath(); c.roundRect(330, 570, 260, 44, 10); c.fill();
    c.restore();
    if (open > 0) {
      c.save(); c.globalAlpha = open;
      c.translate(460, 574); c.rotate(-0.28 * open);
      c.fillStyle = '#DCE7F8'; c.beginPath(); c.roundRect(-130, -26, 260, 36, 10); c.fill();
      c.restore();
      c.save(); c.globalAlpha = open;
      c.fillStyle = 'rgba(255,194,75,.9)';
      c.beginPath(); c.arc(460, 596, 34 * open, 0, Math.PI * 2); c.fill();
      c.restore();
      tx(c, '玩具', 460, 682, { size: 20, color: P.muted, align: 'center', alpha: open });
    }

    // 甜品
    c.save(); c.globalAlpha = p;
    c.fillStyle = '#E8EEFA'; c.beginPath(); c.ellipse(1140, 690, 180, 54, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#D9E4F5'; c.beginPath(); c.roundRect(1000, 640, 280, 46, 20); c.fill();
    c.fillStyle = '#F3E7D6'; c.beginPath(); c.roundRect(1040, 604, 200, 46, 10); c.fill();
    c.restore();

    // 零食卡进入
    const snack = seg(u, at(q, 3), 1.0);
    if (snack > 0) {
      const s = easeOut(snack);
      const sx = 340 + (300 - 340) * s, sy = 720 + (600 - 720) * s;
      pack(c, sx, 700, 90, 110, s, { label: '零食' });
      tag(c, 600, 748, '被挤到边上', { size: 20, fill: 'rgba(255,61,110,.12)', color: P.pink, alpha: s });
    }

    const cov = easeOut(seg(u, at(q, 2), 0.8));
    if (cov > 0) {
      const ing = ['面粉', '奶油', '水果'];
      ing.forEach(function (name, i) {
        const y = 600 + i * 42;
        card(c, 1000, y, 176, 34, 8, cov);
        tx(c, name, 1020, y + 24, { size: 18, color: P.muted, alpha: cov });
      });
    }

    const con = easeOut(seg(u, at(q, 4), 0.6));
    if (con > 0) {
      card(c, 166, 800, 1688, 0, 0, 0);
      tx(c, '观众原本追什么，决定产品会不会被注意', 166 + 660, 806, { size: 25, color: P.ink2, weight: 600, alpha: con, align: 'center' });
    }
  };

  D[17] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 1060, 412, 24, p);
    // 办公室背景
    c.save(); c.globalAlpha = p;
    c.fillStyle = '#F3F7FE'; c.fillRect(200, 470, 992, 296);
    c.fillStyle = '#E6EEFB'; c.fillRect(200, 726, 992, 40);
    c.fillStyle = '#DCE7F7'; c.beginPath(); c.roundRect(960, 500, 190, 180, 8); c.fill();
    c.fillStyle = '#CBDCF3'; c.fillRect(1050, 500, 8, 180);
    // 桌子
    c.fillStyle = '#E1EAF7'; c.beginPath(); c.roundRect(420, 636, 420, 26, 8); c.fill();
    c.fillRect(450, 662, 12, 64); c.fillRect(800, 662, 12, 64);
    c.restore();

    const bgTags = [['办公室', 260], ['宿舍', 470], ['厨房', 680]];
    const bgIn = easeOut(seg(u, 0.5, 0.6));
    const bgOut = 1 - easeOut(seg(u, at(q, 2), 0.7));
    bgTags.forEach(function (b) {
      if (bgIn <= 0) return;
      tag(c, b[1], 402, b[0], { size: 20, fill: 'rgba(17,105,255,.09)', color: P.blue, alpha: bgIn * bgOut });
    });

    // 行为阶段
    const rel = u - at(q, 2);
    let phase = rel < 2.9 ? 0 : rel < 5.8 ? 1 : 2;
    if (rel < 0) phase = -1;
    const needs = [['疲惫：想提神', '个人需求', 0], ['同事想分享', '社交需求', 1], ['临时饿了', '即时需求', 2]];
    if (phase >= 0) {
      const pose = ['tired', 'share', 'hungry'][phase];
      person(c, 620, 736, 300, { pose: pose, alpha: p });
      if (phase === 1) {
        person(c, 800, 736, 290, { pose: 'share', alpha: p, color: '#C6D8F2' });
        pack(c, 812, 640, 54, 70, p, { label: '' });
      }
      const np = easeOut(seg(u, at(q, 2) + [0, 2.9, 5.8][phase], 0.45));
      const need = needs[phase];
      card(c, 1250, 470, 452, 196, 22, np);
      tx(c, need[0], 1278, 524, { size: 30, color: P.ink, weight: 600, alpha: np });
      tx(c, need[1], 1278, 562, { size: 21, color: P.muted, alpha: np });
      tx(c, '产品该扮演的角色随之变化', 1278, 620, { size: 19, color: P.blue, alpha: np });
    }

    const con = easeOut(seg(u, at(q, 1), 0.6));
    if (con > 0) {
      tag(c, 1010, 402, '背景 ≠ 场景', { size: 21, dashed: true, color: P.pink, alpha: con });
      tx(c, '场景 = 一个人在那里做什么、遇到什么需求', 200, 806, { size: 24, color: P.ink2, weight: 500, alpha: con });
    }
  };

  D[18] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    const veil = easeOut(seg(u, at(q, 3), 1.0));
    card(c, 166, 392, 780, 412, 24, p);
    card(c, 980, 392, 724, 412, 24, p);
    tx(c, '只有背景', 196, 436, { size: 26, color: P.ink, weight: 600, alpha: p });
    tx(c, '有行为，也有需求', 1010, 436, { size: 26, color: P.ink, weight: 600, alpha: p });

    // 左：静态
    c.save(); c.globalAlpha = p;
    c.fillStyle = '#F3F7FE'; c.fillRect(196, 462, 720, 300);
    c.fillStyle = '#E1EAF7'; c.beginPath(); c.roundRect(300, 630, 420, 24, 8); c.fill();
    pack(c, 430, 560, 74, 92, 1, { label: '零食' });
    c.restore();
    if (veil > 0) {
      c.save(); c.globalAlpha = veil * .82; c.fillStyle = '#FBFDFF';
      c.beginPath(); c.roundRect(196, 462, 720, 300, 12); c.fill(); c.restore();
      frameCard(c, 196, 462, 720, 300, 12, P.pink, 2, veil);
      tag(c, 760, 402, '只是被放进画面', { size: 20, fill: 'rgba(255,61,110,.12)', color: P.pink, alpha: veil });
    }

    // 右：行为
    const act = easeOut(seg(u, 0.6, 0.8));
    if (act > 0) {
      c.save(); c.globalAlpha = p * act;
      c.fillStyle = '#F3F7FE'; c.fillRect(1010, 462, 664, 300);
      c.fillStyle = '#E1EAF7'; c.beginPath(); c.roundRect(1060, 690, 560, 20, 6); c.fill();
      c.restore();
      person(c, 1150, 700, 230, { pose: 'share', alpha: p * act });
      person(c, 1310, 700, 220, { pose: 'share', alpha: p * act, color: '#C6D8F2' });
      pack(c, 1215, 616, 46, 60, p * act, { label: '' });
      const b1 = easeOut(seg(u, 0.9, 0.5)), b2 = easeOut(seg(u, 1.5, 0.5));
      tag(c, 1240, 500, '要不要来点？', { size: 20, fill: 'rgba(17,105,255,.12)', color: P.blue, alpha: b1 });
      tag(c, 1080, 552, '这个还挺好吃', { size: 20, fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: b2 });
    }

    const q1 = easeOut(seg(u, at(q, 1), 0.55));
    if (q1 > 0) {
      tag(c, 196, 760, '他平时会自然拍出这个行为吗？', { size: 20, dashed: true, color: P.blue, alpha: q1 });
    }
    const q2 = easeOut(seg(u, at(q, 2), 0.55));
    if (q2 > 0) {
      tag(c, 570, 760, '这一刻为什么需要这个产品？', { size: 20, dashed: true, color: P.blue, alpha: q2 });
    }
    const con = easeOut(seg(u, at(q, 3), 0.6));
    if (con > 0) {
      tx(c, '先有行为与需求，产品才有落点', 980, 800, { size: 23, color: P.ink2, weight: 600, alpha: con });
    }
  };

  D[19] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 880, 412, 24, p);
    tx(c, '内容画面', 196, 436, { size: 25, color: P.ink, weight: 600, alpha: p });
    c.save(); c.globalAlpha = p;
    c.fillStyle = '#F4F8FE'; c.fillRect(196, 462, 820, 300);
    c.fillStyle = '#E1EAF7'; c.beginPath(); c.roundRect(320, 650, 420, 20, 6); c.fill();
    c.fillStyle = '#DCE7F7'; c.beginPath(); c.arc(470, 600, 34, 0, Math.PI * 2); c.fill();
    c.restore();

    const out = easeOut(seg(u, at(q, 1) + 0.4, 0.9));
    const pxx = 560, pyy = 540;
    if (out > 0) {
      frameCard(c, pxx, pyy, 84, 104, 8, 'rgba(255,61,110,.55)', 2, out);
      tx(c, '产品被拿掉', pxx + 42, pyy + 128, { size: 17, color: P.pink, align: 'center', alpha: out });
    }
    pack(c, pxx, pyy - out * 90, 84, 104, p * (1 - out * 0.75), { label: '零食' });

    const ok = easeOut(seg(u, at(q, 1) + 1.1, 0.6));
    if (ok > 0) {
      tag(c, 700, 676, '内容仍成立 → 可替代', { size: 20, fill: 'rgba(255,61,110,.10)', color: P.pink, alpha: ok });
    }

    const checks = [['内容是否仍成立', '拿掉后关键动作是否受影响', at(q, 1) + 1.6], ['观众是否注意体验', '产品带来的变化看不看得见', at(q, 2)], ['是否知道为什么需要', '看完能否说出使用理由', at(q, 3)]];
    checks.forEach(function (ck, i) {
      const cp = easeOut(seg(u, ck[2], 0.55));
      if (cp <= 0) return;
      card(c, 1090, 396 + i * 138, 614, 120, 20, cp);
      tx(c, '0' + (i + 1), 1118, 434 + i * 138, { size: 20, color: P.blue, weight: 600, alpha: cp });
      tx(c, ck[0], 1118, 478 + i * 138, { size: 29, color: P.ink, weight: 600, alpha: cp });
      tx(c, ck[1], 1118, 506 + i * 138, { size: 19, color: P.muted, alpha: cp });
    });

    const con = easeOut(seg(u, at(q, 3), 0.6));
    if (con > 0) {
      tx(c, '出现 ≠ 记住；记住 ≠ 需要', 166, 806, { size: 25, color: P.ink2, weight: 600, alpha: con });
    }
  };

  D[20] = function (c, u, q) {
    card(c, 166, 392, 1688, 412, 26, 1);
    const rows = [
      ['复杂甜品教程', '硬加魔芋爽', 0.16, at(q, 1), P.pink],
      ['三分钟海鲜自制', '只短暂出现', 0.30, at(q, 2), P.pink],
      ['简单可复刻搭配', '产品参与核心动作', 0.34, at(q, 3), P.blue]
    ];
    rows.forEach(function (r, i) {
      const y = 448 + i * 116;
      const p = easeOut(seg(u, Math.min(r[3], 0.8) + i * 0.1, 0.55));
      if (p <= 0) return;
      tx(c, r[0], 200, y + 30, { size: 25, color: P.ink, weight: 600, alpha: p });
      tx(c, r[1], 200, y + 58, { size: 18, color: P.muted, alpha: p });
      const bx = 460, bwid = 1060;
      c.save(); c.globalAlpha = p * .12; c.fillStyle = P.pale;
      c.beginPath(); c.roundRect(bx, y + 6, bwid, 34, 17); c.fill(); c.restore();
      c.save(); c.globalAlpha = p * .35; c.fillStyle = P.blue;
      c.beginPath(); c.roundRect(bx, y + 6, bwid * (i < 2 ? 0.55 : 0.62), 34, 17); c.fill(); c.restore();
      const rp = easeOut(seg(u, r[3] + 0.3, 0.8));
      if (i < 2) {
        c.save(); c.globalAlpha = rp; c.fillStyle = P.pink;
        c.beginPath(); c.arc(bx + bwid * r[2], y + 23, 11, 0, Math.PI * 2); c.fill();
        c.restore();
        tx(c, '产品闪一下', bx + bwid * r[2] + 18, y + 29, { size: 17, color: P.pink, alpha: rp });
      } else {
        c.save(); c.globalAlpha = rp; c.fillStyle = P.blue;
        c.beginPath(); c.roundRect(bx + bwid * 0.30, y - 2, bwid * 0.34, 50, 25); c.fill(); c.restore();
        tx(c, '关键作用', bx + bwid * 0.47, y + 27, { size: 18, color: '#fff', weight: 600, align: 'center', alpha: rp });
        tag(c, bx + bwid * 0.68, y + 4, '可复刻', { size: 17, fill: 'rgba(17,105,255,.10)', color: P.blue, alpha: rp });
      }
    });

    const con = easeOut(seg(u, at(q, 3) + 2.2, 0.6));
    if (con > 0) {
      tx(c, '能加入 ≠ 有必要；产品要在搭配里有关键作用', 166 + 500, 800, { size: 26, color: P.ink2, weight: 600, alpha: con, align: 'center' });
    }
  };

  D[21] = function (c, u, q) {
    card(c, 166, 392, 1688, 412, 26, 1);
    tx(c, '一条 19 秒的短内容', 200, 452, { size: 25, color: P.ink, weight: 600 });
    const bx = 400, bwid = 1180, y = 500;
    c.save(); c.strokeStyle = P.line; c.lineWidth = 2;
    c.beginPath(); c.roundRect(bx, y, bwid, 42, 21); c.stroke(); c.restore();
    const lit = easeOut(seg(u, 0.5, 0.8));
    c.save(); c.globalAlpha = lit; c.fillStyle = P.pink;
    c.beginPath(); c.roundRect(bx, y, bwid * 0.21, 42, 21); c.fill(); c.restore();
    tx(c, '产品露出 ≈ 4 秒', bx + 20, y + 29, { size: 18, color: '#fff', weight: 600, alpha: lit });
    tx(c, '0s', bx - 6, y + 70, { size: 17, color: P.faint });
    tx(c, '19s', bx + bwid - 10, y + 70, { size: 17, color: P.faint, align: 'right' });

    const need = ['要交代为什么出现', '要交代有什么体验', '要交代为什么需要'];
    const info = easeOut(seg(u, at(q, 1), 0.6));
    need.forEach(function (n, i) {
      if (info <= 0) return;
      const y2 = 590 + i * 66;
      frameCard(c, 400, y2, 560, 50, 12, P.pink, 1.8, info);
      tx(c, n, 424, y2 + 33, { size: 21, color: P.ink2, alpha: info });
      tag(c, 980, y2 + 8, '塞不下', { size: 17, fill: 'rgba(255,61,110,.12)', color: P.pink, alpha: info });
    });

    const con = easeOut(seg(u, at(q, 2), 0.6));
    if (con > 0) {
      tx(c, '不是不能拍短内容，而是它要讲的必须有空间', 400, 790, { size: 24, color: P.ink2, weight: 600, alpha: con });
      tx(c, '吸引力 ≠ 讲清楚', 1250, 790, { size: 24, color: P.blue, weight: 600, alpha: con });
    }
  };

  D[22] = function (c, u, q) {
    const ap = easeOut(seg(u, 0.12, 0.6));
    card(c, 166, 392, 1688, 412, 26, ap);
    tx(c, '提报判断卡', 200, 438, { size: 28, color: P.ink, weight: 600, alpha: ap });
    tx(c, '目标｜证据｜内容构想｜结论与风险', 380, 438, { size: 21, color: P.muted, alpha: ap });

    const cols = [
      ['项目目标', '本次产品要找谁', '明细', at(q, 1)],
      ['画像与数据', '截图＋近期常态', '证据', at(q, 2)],
      ['有效内容', '观众为什么看', '证据', at(q, 3)],
      ['内容构想', '行为场景＋产品角色', '推断', at(q, 4)],
      ['结论与风险', '提 / 不提 / 待核对', '判断', at(q, 5)]
    ];
    cols.forEach(function (col, i) {
      const p = easeOut(seg(u, col[3], 0.55));
      if (p <= 0) return;
      const x = 200 + i * 330, y = 470;
      c.save(); c.globalAlpha = p; c.fillStyle = 'rgba(17,105,255,.06)';
      c.beginPath(); c.roundRect(x, y, 310, 240, 16); c.fill(); c.restore();
      tx(c, col[0], x + 22, y + 46, { size: 26, color: P.ink, weight: 600, alpha: p });
      tx(c, col[1], x + 22, y + 82, { size: 19, color: P.muted, alpha: p });
      tag(c, x + 22, y + 110, col[2], { size: 16, fill: 'rgba(17,105,255,.12)', color: P.blue, alpha: p });
      c.save(); c.globalAlpha = p * .6; c.strokeStyle = '#BCD2F1'; c.lineWidth = 1.5; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(x + 22, y + 186); c.lineTo(x + 286, y + 186); c.stroke(); c.restore();
      tx(c, '截图 / 链接 / 口径', x + 22, y + 212, { size: 16, color: P.faint, alpha: p });
    });

    const final = easeOut(seg(u, at(q, 6), 0.6));
    if (final > 0) {
      const opts = ['建议提报', '不提报', '待核对'];
      opts.forEach(function (o, i) {
        pill(c, 200 + i * 210, 736, 188, 54, o, { size: 22, fill: i === 0 ? 'rgba(17,105,255,.12)' : i === 1 ? 'rgba(255,61,110,.10)' : 'rgba(121,92,255,.12)', color: i === 0 ? P.blue : i === 1 ? P.pink : P.purple, alpha: final });
      });
      tx(c, '＋ 风险与例外：写清为什么，不只写结论', 860, 772, { size: 22, color: P.ink2, weight: 500, alpha: final });
    }
  };

  D[23] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 900, 396, 24, p);
    tx(c, '情境', 196, 436, { size: 24, color: P.muted, alpha: p });
    const facts = [['粉丝与目标人群接近', '画像方向对得上'], ['近期数据也可以', '常态没有明显问题'], ['观众主要看拆盲盒', '现有内容里找不到零食的自然角色']];
    facts.forEach(function (f, i) {
      const fp = easeOut(seg(u, 0.45 + i * 0.75, 0.55));
      if (fp <= 0) return;
      c.save(); c.globalAlpha = fp; c.fillStyle = 'rgba(17,105,255,.06)';
      c.beginPath(); c.roundRect(196, 462 + i * 104, 840, 84, 14); c.fill(); c.restore();
      tx(c, '0' + (i + 1), 218, 496 + i * 104, { size: 19, color: P.blue, weight: 600, alpha: fp });
      tx(c, f[0], 218, 528 + i * 104, { size: 26, color: P.ink, weight: 600, alpha: fp });
      tx(c, f[1], 620, 528 + i * 104, { size: 18, color: P.muted, alpha: fp });
    });

    const opts = ['直接提报', '不提报', '待核对'];
    opts.forEach(function (o, i) {
      const op = easeOut(seg(u, 0.3 + i * 0.1, 0.55));
      const y = 424 + i * 116;
      frameCard(c, 1100, y, 560, 92, 20, '#C3D3EA', 2, op);
      tx(c, o, 1380, y + 56, { size: 28, color: P.muted, weight: 600, align: 'center', alpha: op });
    });

    const ask = easeOut(seg(u, at(q, 2), 0.55));
    if (ask > 0) {
      tag(c, 1100, 760, '先写下理由，再点答案', { size: 20, fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: ask });
      const hold = clamp((u - at(q, 2)) / 10, 0, 1);
      c.save(); c.strokeStyle = 'rgba(121,92,255,.55)'; c.lineWidth = 3;
      c.beginPath(); c.arc(1660, 806, 0, 0, 0); c.restore();
      tx(c, '静止 ' + Math.ceil(10 - (u - at(q, 2) > 0 ? Math.min(10, u - at(q, 2)) : 0)) + ' 秒', 1660, 806, { size: 22, color: P.purple, weight: 600, align: 'right', alpha: ask });
    }
  };

  D[24] = function (c, u, q) {
    const p = easeOut(seg(u, 0.08, 0.55));
    const opts = [['直接提报', 0], ['不提报', 1], ['待核对', 2]];
    opts.forEach(function (o, i) {
      const lit = o[1] === 1 ? easeOut(seg(u, at(q, 0), 0.6)) : easeOut(seg(u, 0.2, 0.5));
      const y = 424 + i * 116;
      const on = o[1] === 1 ? lit : 1;
      card(c, 1100, y, 560, 92, 20, p);
      if (o[1] === 1) {
        c.save(); c.globalAlpha = lit; c.fillStyle = 'rgba(121,92,255,.12)';
        c.beginPath(); c.roundRect(1100, y, 560, 92, 20); c.fill(); c.restore();
        frameCard(c, 1100, y, 560, 92, 20, P.purple, 2, lit);
      }
      tx(c, o[0], 1380, y + 56, { size: 28, color: o[1] === 1 ? P.purple : P.faint, weight: 600, align: 'center', alpha: on * 0.9 + 0.1 });
    });

    const c1 = easeOut(seg(u, at(q, 1), 0.55));
    if (c1 > 0) {
      card(c, 166, 396, 860, 200, 22, c1);
      tx(c, '观众等的是盲盒结果', 200, 450, { size: 28, color: P.ink, weight: 600, alpha: c1 });
      tx(c, '零食在现有内容里没有清楚角色', 200, 492, { size: 22, color: P.muted, alpha: c1 });
      tag(c, 200, 516, '理由：需求不成立', { size: 17, fill: 'rgba(255,61,110,.10)', color: P.pink, alpha: c1 });
    }

    const br = easeOut(seg(u, at(q, 2), 0.6));
    if (br > 0) {
      card(c, 166, 634, 860, 174, 22, br);
      tx(c, '例外路径：零食成为关键道具', 200, 682, { size: 25, color: P.ink, weight: 600, alpha: br });
      tx(c, '且不破坏观看体验 → 交 PM／编导复核', 200, 718, { size: 21, color: P.muted, alpha: br });
      tag(c, 200, 738, '必须有具体方案', { size: 17, fill: 'rgba(121,92,255,.12)', color: P.purple, alpha: br });
    }

    const no = easeOut(seg(u, at(q, 4), 0.6));
    if (no > 0) {
      tx(c, '“可以植入”不能代替判断', 166, 806, { size: 24, color: P.pink, weight: 600, alpha: no });
    }
  };

  D[25] = function (c, u, q) {
    card(c, 166, 392, 1688, 412, 26, 1);
    const rows = [
      ['统计窗口', '近五天，还是近五条？按项目最新口径确认', at(q, 1)],
      ['CPM 口径', '异常值剔除方式与分母必须统一', at(q, 2)],
      ['人群比例', '某产品的人群占比有没有当场确认', at(q, 3)],
      ['形式判断', '图文、Vlog 等形式不能一概而论', at(q, 4)]
    ];
    rows.forEach(function (r, i) {
      const y = 412 + i * 98;
      tx(c, r[0], 200, y + 52, { size: 27, color: P.ink, weight: 600 });
      tx(c, r[1], 420, y + 52, { size: 21, color: P.muted });
      c.save(); c.globalAlpha = .6; c.strokeStyle = P.line; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(200, y + 74); c.lineTo(1800, y + 74); c.stroke(); c.restore();
      const sp = easeOut(seg(u, r[2], 0.5));
      if (sp > 0) {
        c.save();
        c.translate(1600, y + 22); c.rotate(-0.04);
        c.scale(1.35 - 0.35 * sp, 1.35 - 0.35 * sp);
        c.globalAlpha = sp;
        c.strokeStyle = P.purple; c.lineWidth = 2.5;
        c.beginPath(); c.roundRect(-95, -24, 190, 48, 8); c.stroke();
        tx(c, '待确认', 0, 12, { size: 26, color: P.purple, weight: 700, align: 'center' });
        c.restore();
      }
    });

    const con = easeOut(seg(u, at(q, 5), 0.6));
    if (con > 0) {
      tx(c, '写进待核对项，按项目最新口径确认', 166 + 700, 800, { size: 25, color: P.ink2, weight: 600, alpha: con, align: 'center' });
    }
  };

  D[26] = function (c, u, q) {
    const p = easeOut(seg(u, 0.1, 0.6));
    card(c, 166, 392, 960, 412, 26, p);
    tx(c, '提报判断卡', 200, 438, { size: 27, color: P.ink, weight: 600, alpha: p });

    const rows = [
      ['证据', '用什么证明账号合适', at(q, 0), P.blue],
      ['观看理由', '观众为什么看这条内容', at(q, 1), P.blue],
      ['产品理由', '观众为什么会记住、需要', at(q, 2), P.blue],
      ['结论', '提 / 不提 / 待核对 + 风险', at(q, 3), P.purple]
    ];
    rows.forEach(function (r, i) {
      const rp = easeOut(seg(u, r[2], 0.55));
      if (rp <= 0) return;
      const y = 470 + i * 78;
      c.save(); c.globalAlpha = rp; c.fillStyle = 'rgba(17,105,255,.06)';
      c.beginPath(); c.roundRect(200, y, 892, 64, 12); c.fill(); c.restore();
      tx(c, r[0], 220, y + 42, { size: 22, color: r[3], weight: 600, alpha: rp });
      tx(c, r[1], 350, y + 42, { size: 21, color: P.ink2, alpha: rp });
      c.save(); c.globalAlpha = rp; c.strokeStyle = P.blue; c.lineWidth = 2;
      c.beginPath(); c.moveTo(1010, y + 32); c.lineTo(1030, y + 32); c.stroke();
      c.beginPath(); c.moveTo(1022, y + 26); c.lineTo(1030, y + 32); c.lineTo(1022, y + 38); c.stroke();
      c.restore();
    });

    const qs = ['我用什么证据证明账号合适？', '观众为什么会看这条合作内容？', '观众为什么会记住、需要这个产品？'];
    qs.forEach(function (s, i) {
      const qp = easeOut(seg(u, at(q, i), 0.55));
      if (qp <= 0) return;
      card(c, 1160, 402 + i * 118, 544, 100, 20, qp);
      tx(c, '0' + (i + 1), 1188, 440 + i * 118, { size: 18, color: P.blue, weight: 600, alpha: qp });
      para(c, s, 1188, 476 + i * 118, { size: 20, color: P.ink2, maxW: 490, lh: 28, alpha: qp, maxLines: 2 });
    });

    const end = easeOut(seg(u, 0.55, 0.8));
    if (end > 0) {
      tag(c, 1160, 762, '证据 → 观看理由 → 产品理由 → 结论', { size: 22, fill: 'rgba(17,105,255,.12)', color: P.blue, alpha: end });
    }
  };

  window.__render = function (t) {
    t = clamp(t, 0, TOTAL);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W * S, H * S);
    ctx.scale(S, S);
    bgDraw(t);
    let sc = SCENES[SCENES.length - 1];
    for (let i = 0; i < SCENES.length; i++) if (t < SCENES[i].end) { sc = SCENES[i]; break; }
    const u = t - sc.start;
    const q = sc.clauses.map(cl => cl.start - sc.start);
    header(ctx, sc.number, u);
    title(ctx, __META[sc.number].title, u);
    D[sc.number](ctx, u, q);
    subtitle(ctx, t);
    ctx.restore();
  };

  window.__duration = TOTAL;
  window.__sceneStarts = SCENES.map(s => s.start);
})();
