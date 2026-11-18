// Canvas rendering: background, scenery, towers, soldiers, enemies, projectiles and effects.
'use strict';
(function () {
  const TD = window.TD;
  const T = TD.TILE;
  const W = TD.COLS * T, H = TD.ROWS * T;
  const EXTRA_SPRITES = ['keep_blue', 'dome_arcane', 'dome_frost', 'dome_storm', 'hall_blue', 'house_b_blue',
    'church_gold', 'hut_top_gold', 'roof_green', 'roof_blue'].map((n) => 'structures/' + n).concat(['units/hero']);
  const ROAD_TILES = {
    5: 'road_ns', 10: 'road_ew', 3: 'road_ne', 9: 'road_nw', 6: 'road_es', 12: 'road_ws',
    14: 'road_wes', 11: 'road_wen', 13: 'road_nsw', 7: 'road_nse', 15: 'road_x',
    1: 'road_end_n', 2: 'road_end_e', 4: 'road_end_s', 8: 'road_end_w',
  };
  const C = {
    outline: '#686d6d', stone: '#acb8b8', stoneDark: '#9da8a8', stoneLight: '#c1d0d0',
    wood: '#bb8044', woodMid: '#a6713b', woodDark: '#775029', woodDeep: '#4d3319',
    red: '#e0533d', gold: '#ffd166', goldDark: '#c98a1c', blue: '#4f8fe0', blueDark: '#2c5aa0', green: '#47b05a',
  };

  const images = {};
  const tintCache = new Map();
  const DEFAULT_SETTINGS = { shake: true, numbers: true, particles: 'normal', hoverRange: true };
  const opt = () => TD.settings || DEFAULT_SETTINGS;
  const PARTICLES = { low: 0.35, normal: 1, high: 1.6 };
  const tierOf = (t) => (t.branch ? 3 + (t.blevel || 0) : t.level);
  const statsOf = (t) => (t.branch ? t.def.branches[t.branch].levels[t.blevel || 0] : t.def.levels[t.level]);

  function load(onProgress) {
    const names = Object.keys(window.ASSET_MANIFEST).concat(EXTRA_SPRITES);
    let done = 0;
    return Promise.all(names.map((name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        done++;
        if (onProgress) onProgress(done / names.length);
        resolve();
      };
      img.src = 'assets/' + name + '.png';
      images[name] = img;
    })));
  }

  const img = (name) => images[name];

  // A flat-coloured silhouette of a sprite (hit flashes, frost tint). Compositing
  // works even on file:// where reading pixels back would be blocked.
  function tinted(name, color) {
    const key = name + color;
    let c = tintCache.get(key);
    if (!c) {
      const im = images[name];
      c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      tintCache.set(key, c);
    }
    return c;
  }

  // Draws a sprite anchored at its bottom centre. Sprites are 2x (retina) art.
  function sprite(ctx, name, x, y, scale, flip, source) {
    const im = source || images[name];
    if (!im || !im.width) return 0;
    const w = im.width * scale, h = im.height * scale;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(im, x - w / 2, y - h, w, h);
    }
    return h;
  }

  function shadow(ctx, x, y, rx, ry, alpha) {
    ctx.fillStyle = `rgba(20,30,10,${alpha == null ? 0.22 : alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glow(ctx, x, y, r, inner, outer) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Static background ---------------------------------------------------

  const CLUTTER = {
    grass: { tuft: '#1f9a50', flowers: ['#fff6d8', '#ffd966', '#f59ab5'] },
    sand: { tuft: '#c9b386', pebble: '#bfa77a' },
    snow: { tuft: '#c8e4f0', pebble: '#9fb2bd' },
    dirt: { tuft: '#9c6634', pebble: '#7e5530' },
  };

  function drawClutter(ctx, ground, x, y, v) {
    const pal = CLUTTER[ground] || CLUTTER.grass;
    if (pal.flowers && v > 0.8) {
      ctx.fillStyle = pal.flowers[Math.floor((v - 0.8) * 15) % pal.flowers.length];
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(x + (i - 1) * 3.5, y + (i % 2) * 2.5, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    if (pal.pebble && v > 0.7) {
      ctx.fillStyle = pal.pebble;
      ctx.beginPath(); ctx.ellipse(x, y, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 4, y + 1.5, 1.6, 1.2, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.strokeStyle = pal.tuft;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x - 3.5, y - 3, x - 5, y - 5);
    ctx.moveTo(x, y); ctx.lineTo(x + 0.5, y - 6);
    ctx.moveTo(x + 3, y); ctx.quadraticCurveTo(x + 3.5, y - 3, x + 5, y - 4.5);
    ctx.stroke();
  }

  function buildBackground(level, ground, scale) {
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        const i = y * level.cols + x;
        ctx.drawImage(images['tiles/' + ground + (level.groundVariant[i] ? '_b' : '_a')], x * T, y * T, T, T);
      }
    }
    for (const c of level.clutter) drawClutter(ctx, ground, c.x * T, c.y * T, c.v);
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        const tile = ROAD_TILES[level.road[y * level.cols + x]];
        if (tile) ctx.drawImage(images['tiles/' + tile], x * T, y * T, T, T);
      }
    }
    // Soft vignette to frame the battlefield.
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return c;
  }

  // ---- Scenery ---------------------------------------------------------------

  function drawStack(ctx, x, y, s, bottom, top) {
    const h = sprite(ctx, 'structures/' + bottom, x, y, s);
    return h + sprite(ctx, 'structures/' + top, x, y - h + 0.5, s);
  }

  function drawBlades(ctx, x, y, s, angle) {
    const blades = images['structures/mill_a'];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(blades, -blades.width * s / 2, -blades.height * s / 2, blades.width * s, blades.height * s);
    ctx.restore();
  }

  function drawProp(ctx, p, time) {
    const x = p.x * T, y = p.y * T, s = 0.5;
    shadow(ctx, x, y - 2, 24, 7, 0.16);
    switch (p.kind) {
      case 'mill': {
        const h = sprite(ctx, 'structures/house_b', x, y, s);
        drawBlades(ctx, x, y - h + 10, s, time * 0.9);
        break;
      }
      case 'market': drawStack(ctx, x, y, s, 'stall_pies', 'shop_top'); break;
      case 'church': drawStack(ctx, x, y, s, 'church', 'hut_top'); break;
      case 'cottage': drawStack(ctx, x, y, s, 'sand_house', 'cottage_top'); break;
      case 'stall': sprite(ctx, 'structures/stall_striped', x, y, s); break;
      default: sprite(ctx, 'structures/' + p.kind, x, y, s);
    }
  }

  function drawCastle(ctx, castle, flash, time) {
    const x = castle.x * T, y = castle.y * T + 6, s = 0.75;
    shadow(ctx, x, y - 2, 50, 10, 0.2);
    const h = sprite(ctx, 'structures/castle_base', x, y, s);
    sprite(ctx, 'structures/castle_top', x, y - h + 0.5, s);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.6, flash);
      const hb = sprite(ctx, null, x, y, s, false, tinted('structures/castle_base', '#ff3b2f'));
      sprite(ctx, null, x, y - hb + 0.5, s, false, tinted('structures/castle_top', '#ff3b2f'));
      ctx.globalAlpha = 1;
    }
    // A royal-blue standard flying over the keep.
    const fx = x + 2, fy = y - h * 2 + 6;
    pole(ctx, fx, fy, 26);
    drawFlag(ctx, fx, fy - 26, 18, 11, C.blue, time);
  }

  function pole(ctx, x, y, h) {
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  }

  function drawFlag(ctx, x, y, w, h, color, time) {
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      ctx.lineTo(x + w * k, y + Math.sin(time * 6 + k * 4) * 1.6 * k);
    }
    for (let i = 6; i >= 0; i--) {
      const k = i / 6;
      ctx.lineTo(x + w * k - (k === 1 ? 4 : 0), y + h + Math.sin(time * 6 + k * 4) * 1.6 * k - (k === 1 ? h / 2 : 0));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---- Towers ----------------------------------------------------------------

  function pips(ctx, x, y, tier) {
    for (let i = 0; i <= tier; i++) {
      const px = x + (i - tier / 2) * 8.5;
      const branch = i >= 3;
      ctx.fillStyle = branch ? '#8a3fb0' : C.goldDark;
      ctx.beginPath();
      ctx.moveTo(px, y - 4); ctx.lineTo(px + 4, y); ctx.lineTo(px, y + 4); ctx.lineTo(px - 4, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = branch ? '#e6a8ff' : C.gold;
      ctx.beginPath();
      ctx.moveTo(px, y - 2.5); ctx.lineTo(px + 2.5, y); ctx.lineTo(px, y + 2.5); ctx.lineTo(px - 2.5, y);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawArcher(ctx, t, x, y, time) {
    const s = 0.55, tier = tierOf(t);
    shadow(ctx, x, y - 1, 25, 7);
    const h = sprite(ctx, 'structures/keep_blue', x, y, s);
    if (tier === 0) {
      // A lone archer keeping watch on the battlements.
      sprite(ctx, 'units/blue_soldier', x, y - h + 10, 0.42);
      return;
    }
    const roof = t.branch === 'ranger' ? 'roof_green' : t.branch === 'marksman' ? 'roof_blue' : 'roof_red';
    const rs = t.branch === 'marksman' ? s * 1.12 : s;
    const rh = sprite(ctx, 'structures/' + roof, x, y - h + 0.5, rs);
    if (tier >= 2) {
      const tipY = y - h - rh + 3;
      const big = tier >= 4;
      pole(ctx, x, tipY, big ? 24 : 18);
      const color = t.branch === 'ranger' ? C.green : t.branch === 'marksman' ? C.gold : C.blue;
      drawFlag(ctx, x, tipY - (big ? 24 : 18), big ? 19 : 15, big ? 11 : 9, color, time + t.id);
    }
    if (t.branch === 'ranger') {
      // Extra archers posted on the walls.
      sprite(ctx, 'units/blue_soldier', x - 15, y - h + 12, 0.34);
      if (tier >= 4) sprite(ctx, 'units/blue_soldier', x + 15, y - h + 12, 0.34, true);
    }
  }

  function drawWizard(ctx, t, x, y, time) {
    const s = 0.5, tier = tierOf(t);
    shadow(ctx, x, y - 1, 26, 7);
    const dome = t.branch === 'frost' ? 'dome_frost' : t.branch === 'storm' ? 'dome_storm' : 'dome_arcane';
    const h = sprite(ctx, 'structures/' + dome, x, y, s);
    const color = t.branch === 'frost' ? '#9ff0ff' : t.branch === 'storm' ? '#ffe066' : ['#7fd3ff', '#a58bff', '#e07bff'][Math.min(2, t.level)];
    const flare = Math.max(0, 1 - t.fireT / 0.25);
    const oy = y - h - 10 + Math.sin(time * 2.5 + t.id) * 3;
    const r = 6 + Math.min(tier, 4) * 1.1 + flare * 4;
    const g = ctx.createRadialGradient(x, oy, 0, x, oy, r * 2.6);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.3, color);
    g.addColorStop(1, 'rgba(120,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, oy, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, oy, r * 0.45, 0, Math.PI * 2); ctx.fill();
    if (t.branch === 'storm') {
      // Crackling arcs around the orb.
      ctx.strokeStyle = 'rgba(255,240,150,0.9)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 2 + t.blevel; i++) {
        const a = Math.floor(time * 12 + i * 7) * 2.39;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x + Math.cos(a) * 9 + Math.sin(a * 3) * 3, oy + Math.sin(a) * 7);
        ctx.lineTo(x + Math.cos(a) * 15, oy + Math.sin(a) * 11);
        ctx.stroke();
      }
    } else if (tier > 0) {
      const n = Math.min(6, tier * 2);
      for (let i = 0; i < n; i++) {
        const a = time * 1.6 + (i / n) * Math.PI * 2;
        ctx.fillStyle = t.branch === 'frost' ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 14, oy + Math.sin(a) * 5, t.branch === 'frost' ? 2.2 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawCatapult(ctx, t, x, y, time, reload) {
    const tier = tierOf(t);
    const treb = t.branch === 'trebuchet', bomb = t.branch === 'bombard';
    const k = treb ? 1.25 + t.blevel * 0.06 : 1 + Math.min(tier, 2) * 0.07 + (bomb ? 0.06 + t.blevel * 0.04 : 0);
    shadow(ctx, x, y - 2, 25 * (treb ? 1.2 : 1), 7);
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.scale(t.aimX < t.x ? -k : k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Arm swing: snaps forward on release, then winches back during reload.
    const rest = Math.PI - 0.4, thrown = -Math.PI / 2 + 0.25;
    let a;
    if (t.fireT < 0.12) a = rest + (thrown - rest) * (t.fireT / 0.12);
    else a = thrown + (rest - thrown) * Math.min(1, (t.fireT - 0.12) / Math.max(0.3, reload * 0.6));
    const loaded = t.fireT > 0.12 + reload * 0.6;
    const band = bomb ? '#b5452f' : C.stoneDark;

    const wheel = (wx) => {
      ctx.fillStyle = C.woodDark; ctx.strokeStyle = C.woodDeep; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, -6, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.stone;
      ctx.beginPath(); ctx.arc(wx, -6, 2, 0, Math.PI * 2); ctx.fill();
    };
    wheel(-14);
    ctx.fillStyle = treb ? C.woodMid : C.wood; ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2;
    roundRect(ctx, -21, -17, 42, 9, 3); ctx.fill(); ctx.stroke();
    if (tier >= 1) {
      ctx.fillStyle = band;
      ctx.fillRect(-15, -17, 3, 9); ctx.fillRect(12, -17, 3, 9);
    }
    const px = -2, py = treb ? -42 : -33, len = treb ? 34 : 27;
    const bx = px + Math.cos(a) * len, by = py + Math.sin(a) * len;
    const cx = px - Math.cos(a) * 9, cy = py - Math.sin(a) * 9;
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = C.wood; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    if (tier >= 2) {
      ctx.fillStyle = C.stoneDark; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5;
      const cw = treb ? 14 : 10;
      roundRect(ctx, cx - cw / 2, cy - cw / 2, cw, cw, 2); ctx.fill(); ctx.stroke();
    }
    // Bucket and its load.
    ctx.fillStyle = C.woodMid; ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (loaded) {
      if (bomb) {
        glow(ctx, bx, by - 4, 9, 'rgba(255,220,120,0.95)', 'rgba(255,90,30,0)');
        ctx.fillStyle = '#7a3b22';
        ctx.beginPath(); ctx.arc(bx, by - 3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.moveTo(bx - 2.5, by - 6); ctx.quadraticCurveTo(bx, by - 13 - Math.sin(time * 20) * 2, bx + 2.5, by - 6); ctx.fill();
      } else {
        ctx.fillStyle = C.stone; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by - 3, treb ? 5.5 : 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(px, py); ctx.lineTo(8, -15); ctx.stroke();
    ctx.strokeStyle = C.woodMid; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(px, py); ctx.lineTo(8, -15); ctx.stroke();
    ctx.fillStyle = C.stone;
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    wheel(14);
    ctx.restore();
  }

  function drawBallista(ctx, t, x, y, time) {
    const tier = tierOf(t);
    const slayer = t.branch === 'slayer', scorp = t.branch === 'scorpion';
    shadow(ctx, x, y - 1, 26, 8);
    const by = y - 6, rx = 23, ry = 11, hgt = 9 + Math.min(tier, 2) * 2 + (t.branch ? 2 : 0);
    ctx.fillStyle = C.stoneDark; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, by, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(x - rx, by - hgt);
    ctx.ellipse(x, by - hgt, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(104,109,109,0.5)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const off = ry * Math.sqrt(1 - (i * 9 / rx) ** 2);
      ctx.beginPath(); ctx.moveTo(x + i * 9, by - hgt + off); ctx.lineTo(x + i * 9, by + off); ctx.stroke();
    }
    ctx.fillStyle = slayer ? '#c9a46a' : tier >= 2 ? '#d9c38a' : C.stoneLight; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, by - hgt, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (tier >= 1) {
      ctx.strokeStyle = slayer ? '#9c2f22' : C.woodMid; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, by - hgt, rx - 5, ry - 3, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Rotating bow, seen from above.
    const loaded = t.fireT > (scorp ? 0.2 : 0.5);
    const recoil = t.fireT < 0.15 ? (1 - t.fireT / 0.15) * 4 : 0;
    ctx.save();
    ctx.translate(x, by - hgt - 3);
    ctx.scale(1, 0.85);
    ctx.rotate(t.angle);
    ctx.translate(-recoil, 0);
    ctx.lineCap = 'round';
    const k = 1 + Math.min(tier, 2) * 0.08 + (slayer ? 0.18 : 0);
    ctx.scale(k, k);
    const bow = (bx, span, color) => {
      ctx.strokeStyle = C.woodDeep; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(bx, -span); ctx.quadraticCurveTo(bx + 9, 0, bx, span); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bx, -span); ctx.quadraticCurveTo(bx + 9, 0, bx, span); ctx.stroke();
    };
    ctx.fillStyle = C.wood; ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2;
    roundRect(ctx, -13, -3.5, 30, 7, 2.5); ctx.fill(); ctx.stroke();
    const pull = loaded ? -9 : 3;
    ctx.strokeStyle = '#f3e3c3'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(6, -16); ctx.lineTo(pull, 0); ctx.lineTo(6, 16); ctx.stroke();
    if (scorp) bow(-2, 13, C.wood);
    bow(6, 16, slayer || tier >= 2 ? C.gold : C.wood);
    if (loaded) {
      ctx.strokeStyle = C.woodDark; ctx.lineWidth = slayer ? 3.5 : 2.5;
      ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(19, 0); ctx.stroke();
      ctx.fillStyle = slayer ? '#c8d3dc' : C.outline;
      ctx.beginPath(); ctx.moveTo(slayer ? 25 : 23, 0); ctx.lineTo(18, -3.5); ctx.lineTo(18, 3.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (slayer) {
      pole(ctx, x + 18, by - hgt + 2, 22);
      drawFlag(ctx, x + 18, by - hgt - 20, 14, 8, C.red, time + t.id);
    }
  }

  function drawBarracks(ctx, t, x, y, time) {
    shadow(ctx, x, y - 1, 28, 8);
    const h = sprite(ctx, 'structures/hall_blue', x, y, 0.47);
    const color = t.branch === 'paladin' ? C.gold : t.branch === 'berserker' ? C.red : C.blue;
    pole(ctx, x + 18, y - h + 6, 20);
    drawFlag(ctx, x + 18, y - h - 14, 15, 9, color, time + t.id);
    if (tierOf(t) >= 2) {
      pole(ctx, x - 18, y - h + 6, 16);
      drawFlag(ctx, x - 18, y - h - 10, 12, 8, color, time + t.id + 1);
    }
  }

  function drawAlchemist(ctx, t, x, y, time) {
    shadow(ctx, x, y - 1, 26, 7);
    const h = sprite(ctx, 'structures/house_tower', x, y, 0.5);
    const tier = tierOf(t);
    const chimX = x + 16, chimY = y - h + 4;
    const colors = ['#8fe08a', '#b4e86a', '#c38bff'];
    for (let i = 0; i < 3; i++) {
      const p = (time * 0.55 + i / 3 + t.id * 0.13) % 1;
      ctx.globalAlpha = (1 - p) * 0.75;
      ctx.fillStyle = colors[Math.min(2, tier)];
      ctx.beginPath();
      ctx.arc(chimX + Math.sin(p * 6 + i) * 3, chimY - p * 26, 3 + p * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // A glowing flask on the doorstep.
    const fl = 0.5 + Math.sin(time * 4 + t.id) * 0.3;
    glow(ctx, x - 14, y - 6, 9, `rgba(150,255,120,${fl})`, 'rgba(150,255,120,0)');
    ctx.fillStyle = '#5bd36a'; ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x - 14, y - 6, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 15, y - 13, 2, 4);
  }

  function drawChapel(ctx, t, x, y, time) {
    const tier = tierOf(t);
    const pulse = 0.5 + Math.sin(time * 2 + t.id) * 0.25;
    glow(ctx, x, y - 50, 30 + tier * 4, `rgba(255,225,130,${0.35 * pulse + 0.1})`, 'rgba(255,225,130,0)');
    shadow(ctx, x, y - 1, 24, 7);
    const h = drawStack(ctx, x, y, 0.5, 'church_gold', 'hut_top_gold');
    if (tier >= 2) {
      // Golden rays from the steeple.
      ctx.strokeStyle = `rgba(255,236,160,${0.55 * pulse})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.35;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 8, y - h + 8 + Math.sin(a) * 8);
        ctx.lineTo(x + Math.cos(a) * 20, y - h + 8 + Math.sin(a) * 20);
        ctx.stroke();
      }
    }
  }

  function drawWindmill(ctx, t, x, y, time) {
    const tier = tierOf(t);
    shadow(ctx, x, y - 1, 24, 7);
    if (tier >= 1) {
      // Grain sacks piling up by the door.
      for (let i = 0; i < tier + 1; i++) {
        const sx = x - 22 + i * 7, sy = y - 3 - (i % 2) * 2;
        ctx.fillStyle = '#e8d3a2'; ctx.strokeStyle = '#a88b5a'; ctx.lineWidth = 1.2;
        roundRect(ctx, sx - 4, sy - 8, 8, 9, 3); ctx.fill(); ctx.stroke();
      }
    }
    const h = sprite(ctx, 'structures/house_b_blue', x, y, 0.5);
    drawBlades(ctx, x, y - h + 10, 0.5 + tier * 0.03, time * (0.9 + tier * 0.45) + t.id);
  }

  const DRAWERS = {
    archer: drawArcher, wizard: drawWizard, catapult: drawCatapult, ballista: drawBallista,
    barracks: drawBarracks, alchemist: drawAlchemist, chapel: drawChapel, windmill: drawWindmill,
  };

  function drawTower(ctx, t, x, y, time) {
    const s = statsOf(t);
    DRAWERS[t.type](ctx, t, x, y, time, s.rate ? 1 / s.rate : 1);
  }

  // Standalone tower picture for menus, build buttons and the info panel.
  function towerIcon(type, tier, size, branch) {
    tier = tier || 0;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = size * dpr;
    const ctx = c.getContext('2d');
    const box = type === 'archer' ? (tier === 0 ? 76 : tier === 1 ? 104 : 122)
      : type === 'chapel' ? 100 : type === 'windmill' ? 92 : branch === 'trebuchet' ? 92 : type === 'wizard' ? 86 : 76;
    const k = (size / box) * dpr;
    ctx.scale(k, k);
    const def = TD.TOWERS[type];
    const fake = {
      type, def, level: Math.min(tier, def.levels.length - 1), branch: branch || null, blevel: Math.max(0, tier - 3),
      id: 0, x: 0.5, y: 0.5, aimX: 1, aimY: 0.5, fireT: 9, angle: -0.5,
    };
    drawTower(ctx, fake, box / 2, box === 76 ? 70 : box - 6, 0);
    return c;
  }

  // ---- Flyers ------------------------------------------------------------------
  // Drawn in code (the art pack has no flying units), seen from the front with flapping wings.

  const FLYERS = {
    bat: { body: '#4a3560', dark: '#24182f', wing: '#6b4f8a', span: 17, flap: 15, eye: '#ff5a4a' },
    wyvern: { body: '#3f8f4a', dark: '#1d4d26', wing: '#77c46f', span: 24, flap: 8, eye: '#ffe066', head: true },
    dragon: { body: '#c0392b', dark: '#5e1a12', wing: '#e8704f', span: 26, flap: 5, eye: '#ffe066', head: true, belly: '#ffcf6a', horns: true },
  };
  const FLY_HEIGHT = 34;

  function drawFlyer(ctx, kind, x, y, scale, time, tint) {
    const f = FLYERS[kind];
    const c = (col) => tint || col;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = c(f.dark);
    const lift = Math.sin(time * f.flap) * f.span * 0.45;
    for (const side of [-1, 1]) {
      const sp = f.span * side;
      ctx.fillStyle = c(f.wing);
      ctx.beginPath();
      ctx.moveTo(side * 3, -4);
      ctx.lineTo(sp, -5 - lift);
      ctx.quadraticCurveTo(sp * 0.86, 2 - lift * 0.6, sp * 0.64, 1 - lift * 0.55);
      ctx.quadraticCurveTo(sp * 0.5, 6 - lift * 0.4, sp * 0.32, 2 - lift * 0.3);
      ctx.quadraticCurveTo(sp * 0.18, 6 - lift * 0.15, side * 3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 3, -3);
      ctx.lineTo(sp * 0.64, 1 - lift * 0.55);
      ctx.moveTo(side * 3, -3);
      ctx.lineTo(sp * 0.32, 2 - lift * 0.3);
      ctx.stroke();
    }
    if (f.head) {
      // Tail sweeping down behind the body.
      ctx.strokeStyle = c(f.dark);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(5, 12, 2 + Math.sin(time * 3) * 2, 17); ctx.stroke();
      ctx.strokeStyle = c(f.body);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = c(f.dark);
    }
    ctx.fillStyle = c(f.body);
    ctx.beginPath(); ctx.ellipse(0, 0, f.head ? 6.5 : 6, f.head ? 9 : 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (f.belly) {
      ctx.fillStyle = c(f.belly);
      ctx.beginPath(); ctx.ellipse(0, 2, 3.5, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    const hy = f.head ? -11 : -3;
    if (f.head) {
      ctx.fillStyle = c(f.body);
      ctx.beginPath(); ctx.arc(0, hy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, hy + 4, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (f.horns) {
        ctx.fillStyle = c('#f3e3c3');
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * 3, hy - 3); ctx.lineTo(side * 7, hy - 10); ctx.lineTo(side * 5, hy - 2); ctx.closePath(); ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = c(f.body);
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * 1.5, -6); ctx.lineTo(side * 4.5, -13); ctx.lineTo(side * 5, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (!tint) {
      ctx.fillStyle = f.eye;
      ctx.beginPath(); ctx.arc(-2, hy, 1.3, 0, Math.PI * 2); ctx.arc(2, hy, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Icon for menus and panels: a PNG path for ground units, a data URL for drawn flyers.
  const iconCache = {};
  function enemyIcon(type) {
    const def = TD.ENEMIES[type];
    if (!def.draw) return 'assets/units/' + def.sprite + '.png';
    if (!iconCache[type]) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      drawFlyer(ctx, def.draw, 32, 36, 1.15, 0.35);
      iconCache[type] = c.toDataURL();
    }
    return iconCache[type];
  }

  // ---- Traps -------------------------------------------------------------------

  function drawTrap(ctx, tr, time, now) {
    const x = tr.x * T, y = tr.y * T;
    if (tr.type === 'spikes') {
      ctx.globalAlpha *= 0.55 + 0.45 * Math.max(0, tr.uses) / tr.def.uses;
      ctx.fillStyle = '#8a5a2e'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
      roundRect(ctx, x - 18, y - 11, 36, 22, 4); ctx.fill(); ctx.stroke();
      const up = tr.firedT < 0.25 ? 1.6 : 1;
      ctx.fillStyle = '#c8d0d4'; ctx.strokeStyle = '#5b6060'; ctx.lineWidth = 1;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 4; k++) {
          const sx = x - 12 + k * 8, sy = y - 2 + r * 9;
          ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx, sy - 6 * up); ctx.lineTo(sx + 3, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    } else if (tr.type === 'tar') {
      const left = tr.until - now;
      ctx.globalAlpha *= Math.min(1, left / 5);
      ctx.fillStyle = 'rgba(52,38,26,0.9)';
      ctx.beginPath(); ctx.ellipse(x, y, 26, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(78,60,42,0.9)';
      ctx.beginPath(); ctx.ellipse(x - 4, y - 2, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(x - 9, y - 5, 6, 2.2, -0.3, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const p = (time * 0.7 + i * 0.37 + tr.id * 0.11) % 1;
        ctx.strokeStyle = `rgba(90,80,65,${1 - p})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x - 12 + i * 11, y + 3 - (i % 2) * 6, 1 + p * 3.5, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (tr.type === 'keg') {
      shadow(ctx, x, y + 2, 12, 4, 0.25);
      ctx.fillStyle = '#a0622d'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
      roundRect(ctx, x - 10, y - 22, 20, 24, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4d3319';
      ctx.fillRect(x - 10, y - 17, 20, 3); ctx.fillRect(x - 10, y - 5, 20, 3);
      ctx.fillStyle = '#d9473a';
      ctx.fillRect(x - 3, y - 13, 6, 7);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 2, y - 22); ctx.quadraticCurveTo(x + 6, y - 27, x + 4, y - 31); ctx.stroke();
      glow(ctx, x + 4, y - 31, 5 + Math.sin(time * 25) * 1.5, 'rgba(255,230,120,1)', 'rgba(255,120,30,0)');
    } else if (tr.type === 'barricade') {
      const shake = tr.firedT < 0.12 ? (Math.random() - 0.5) * 3 : 0;
      shadow(ctx, x, y + 3, 24, 5, 0.25);
      ctx.save();
      ctx.translate(x + shake, y);
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        for (const d of [-1, 1]) {
          ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(k * 13 - d * 7, 4); ctx.lineTo(k * 13 + d * 7, -18); ctx.stroke();
          ctx.strokeStyle = '#b07a42'; ctx.lineWidth = 2.6;
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#9a6a38'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
      roundRect(ctx, -24, -8, 48, 8, 3); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Effects -----------------------------------------------------------------

  class Effects {
    constructor() { this.list = []; this.shake = 0; }
    clear() { this.list.length = 0; this.shake = 0; }
    add(p) { this.list.push(p); }
    puff(x, y, n, color, speed, size, grav) {
      n = Math.round(n * PARTICLES[opt().particles || 'normal']);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
        this.add({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - speed * 0.3,
          life: 0, max: 0.4 + Math.random() * 0.35, size: size * (0.6 + Math.random() * 0.6), color, grav: grav || 0, drag: 3 });
      }
    }
    text(x, y, str, color, big) {
      // Keep big fights readable: drop small numbers once plenty are already floating.
      if (!big && (!opt().numbers || this.list.reduce((n, p) => n + (p.kind === 'text'), 0) > 14)) return;
      this.add({ kind: 'text', x, y, vx: 0, vy: -38, life: 0, max: big ? 1.6 : 1.0, str, color, big, drag: 1.5 });
    }
    ring(x, y, r, color, max) { this.add({ kind: 'ring', x, y, r, color, life: 0, max: max || 0.4 }); }
    bolt(pts, color, max) { this.add({ kind: 'bolt', pts, color, life: 0, max: max || 0.25 }); }
    update(dt) {
      this.shake = Math.max(0, this.shake - dt * 10);
      for (const p of this.list) {
        p.life += dt;
        if (p.vx != null) {
          p.vx *= Math.exp(-(p.drag || 0) * dt);
          p.vy = p.vy * Math.exp(-(p.drag || 0) * dt) + (p.grav || 0) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }
      this.list = this.list.filter((p) => p.life < p.max);
    }
    draw(ctx) {
      for (const p of this.list) {
        const k = p.life / p.max;
        if (p.kind === 'dot') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'ring') {
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.strokeStyle = p.color; ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (0.3 + k * 0.7), p.r * (0.3 + k * 0.7) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === 'bolt') {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = p.color || '#d9b8ff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
          for (const q of p.pts) ctx.lineTo(q[0], q[1]);
          ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
          ctx.stroke();
        } else if (p.kind === 'corpse') {
          // Foes topple over (flyers drop out of the sky) and fade away.
          const fall = Math.min(1, k * 2.4);
          ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          if (p.flyer) {
            const drop = FLY_HEIGHT * (1 - Math.min(1, k * 1.7));
            ctx.save();
            ctx.translate(p.x, p.y - drop);
            ctx.rotate(fall * 2.4);
            drawFlyer(ctx, p.flyer, 0, 0, p.scale, 0.5, null);
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.flip ? -1 : 1) * fall * Math.PI * 0.45);
            sprite(ctx, p.sprite, 0, 0, p.scale, p.flip);
            if (k < 0.15) {
              ctx.globalAlpha *= 0.7;
              sprite(ctx, null, 0, 0, p.scale, p.flip, tinted(p.sprite, '#ffffff'));
            }
            ctx.restore();
          }
        } else if (p.kind === 'ghost') {
          // A sold tower sinks into the ground.
          ctx.globalAlpha = 1 - k;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(1 - k * 0.5, 1 - k * 0.8);
          drawTower(ctx, p.t, 0, 0, 0);
          ctx.restore();
        } else if (p.kind === 'text') {
          ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          ctx.font = `800 ${p.big ? 22 : p.small ? 12 : 15}px "Alegreya Sans", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,24,10,0.85)';
          ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.str, p.x, p.y);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Jagged line between points (pixel coordinates) for lightning effects.
  function jagged(points, jitter) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[i + 1];
      for (let s = 0; s < 5; s++) {
        const k = s / 5, j = s === 0 ? 0 : (Math.random() - 0.5) * jitter;
        out.push([x1 + (x2 - x1) * k + j, y1 + (y2 - y1) * k + j]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  // ---- Renderer ----------------------------------------------------------------

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fx = new Effects();
      this.scale = 1;
      this.castleFlash = 0;
      this.weather = [];
      this.clouds = [];
      this.decals = [];
      this.pop = new Map();
      this.now = 0;
      this.laneAlpha = 0;
      this.heroMark = null;
    }

    resize(cssW, cssH) {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.canvas.style.width = cssW + 'px';
      this.canvas.style.height = cssH + 'px';
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      this.scale = this.canvas.width / W;
    }

    setGame(game) {
      this.game = game;
      this.bg = buildBackground(game.level, game.map.ground, 2);
      this.fx.clear();
      this.castleFlash = 0;
      this.decals = [];
      this.pop.clear();
      this.laneAlpha = 0;
      this.heroMark = null;
      this.weather = [];
      if (game.map.ground === 'snow') {
        for (let i = 0; i < 90; i++) this.weather.push({ kind: 'snow', x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2, v: 18 + Math.random() * 30, p: Math.random() * 6 });
      } else if (game.map.ground === 'dirt') {
        for (let i = 0; i < 40; i++) this.weather.push({ kind: 'ash', x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 1.6, v: 8 + Math.random() * 14, p: Math.random() * 6 });
      }
      this.clouds = [];
      for (let i = 0; i < 4; i++) this.clouds.push({ x: Math.random() * W * 1.4 - W * 0.2, y: Math.random() * H, r: 140 + Math.random() * 120, v: 6 + Math.random() * 6 });
    }

    // Translate simulation events into particles and floating numbers.
    handle(ev) {
      const fx = this.fx;
      const px = ev.x * T, py = ev.y * T;
      const castle = this.game.level.castle;
      switch (ev.type) {
        case 'kill': {
          const def = TD.ENEMIES[ev.enemy];
          fx.add({
            kind: 'corpse', x: px, y: py, life: 0, max: ev.boss ? 1.6 : 0.9, scale: ev.scale, flip: ev.flip,
            sprite: def.draw ? null : 'units/' + def.sprite, flyer: def.draw || null,
          });
          fx.puff(px, py - (ev.fly ? FLY_HEIGHT : 12), ev.boss ? 26 : 7, 'rgba(235,228,214,0.9)', ev.boss ? 120 : 55, ev.boss ? 7 : 4);
          fx.text(px, py - 30, '+' + ev.gold, '#ffd166', ev.boss || !!ev.elite);
          if (ev.boss) fx.shake = 1;
          break;
        }
        case 'splash':
          if (ev.kind === 'flask') {
            fx.ring(px, py, ev.radius * T * 1.3, 'rgba(160,255,130,0.9)', 0.4);
            fx.puff(px, py, 12, 'rgba(140,230,110,0.9)', 80, 4);
            fx.puff(px, py, 6, 'rgba(255,170,70,0.9)', 60, 3);
          } else if (ev.kind === 'firepot') {
            fx.ring(px, py, ev.radius * T * 1.4, 'rgba(255,190,90,0.95)', 0.45);
            fx.puff(px, py, 18, 'rgba(255,140,40,0.9)', 110, 5, -60);
            fx.puff(px, py, 8, 'rgba(90,70,60,0.8)', 80, 6, -30);
            fx.shake = Math.max(fx.shake, 0.4);
          } else {
            fx.ring(px, py, ev.radius * T * 1.4, 'rgba(255,240,210,0.9)', 0.45);
            fx.puff(px, py, ev.big ? 22 : 14, 'rgba(201,160,110,0.85)', ev.big ? 130 : 90, ev.big ? 7 : 5);
            fx.puff(px, py, 5, 'rgba(120,125,125,0.9)', 120, 3);
            fx.shake = Math.max(fx.shake, ev.big ? 0.8 : 0.35);
          }
          break;
        case 'hit':
          if (ev.kind === 'orb') fx.puff(px, py, 7, 'rgba(180,150,255,0.95)', 70, 3);
          else if (ev.kind === 'ice') fx.puff(px, py, 8, 'rgba(210,245,255,0.95)', 70, 3);
          else if (ev.kind === 'bolt') fx.puff(px, py, 4, 'rgba(255,240,200,0.9)', 80, 2.5);
          else fx.puff(px, py, 2, 'rgba(255,255,255,0.8)', 40, 2);
          break;
        case 'crit':
          if (this.lastCrit && performance.now() - this.lastCrit < 300) break;
          this.lastCrit = performance.now();
          fx.add({ kind: 'text', x: px, y: py - 44, vx: 0, vy: -30, life: 0, max: 0.8, str: 'Crit!', color: '#ff9b4a', small: true, drag: 1 }); break;
        case 'execute': fx.add({ kind: 'text', x: px, y: py - 44, vx: 0, vy: -30, life: 0, max: 0.9, str: 'Executed', color: '#ff6b5b', small: true, drag: 1 }); break;
        case 'melee': if (Math.random() < 0.5) fx.puff(px, py, 3, 'rgba(255,255,255,0.9)', 50, 2); break;
        case 'chain': {
          const pts = jagged([[ev.x1 * T, ev.y1 * T], [ev.x2 * T, ev.y2 * T]], 12);
          fx.bolt(pts, '#d9b8ff');
          break;
        }
        case 'lightning': {
          const pts = jagged(ev.pts.map(([x, y]) => [x * T, y * T]), 14);
          fx.bolt(pts, '#ffe680', 0.22);
          const end = ev.pts[ev.pts.length - 1];
          fx.puff(end[0] * T, end[1] * T, 5, 'rgba(255,240,150,0.95)', 70, 2.5);
          break;
        }
        case 'heal':
          fx.ring(px, py, ev.radius * T * 1.5, 'rgba(120,255,150,0.8)', 0.6);
          for (const t of ev.targets) {
            fx.add({ kind: 'text', x: t.x * T + (Math.random() - 0.5) * 10, y: t.y * T - 30, vx: 0, vy: -30, life: 0, max: 0.7, str: '+', color: '#7dff9a', drag: 1 });
          }
          break;
        case 'summon':
          fx.ring(px, py, 50, 'rgba(170,120,255,0.9)', 0.5);
          fx.puff(px, py - 10, 14, 'rgba(120,200,120,0.85)', 70, 4);
          break;
        case 'leak':
          this.castleFlash = 1;
          fx.text(castle.x * T, castle.y * T - 70, '-' + ev.lives, '#ff6b5b', ev.lives > 2);
          fx.shake = Math.max(fx.shake, ev.lives > 2 ? 1.2 : 0.4);
          break;
        case 'build':
        case 'upgrade':
          this.pop.set(ev.id, { t: this.now, build: ev.type === 'build' });
          fx.puff(px, py + 20, 14, 'rgba(225,205,170,0.9)', 80, 5);
          if (ev.type === 'upgrade') {
            fx.ring(px, py + 22, 50, ev.branch ? 'rgba(220,150,255,0.95)' : 'rgba(255,209,102,0.95)', 0.5);
            for (let i = 0; i < 12; i++) {
              fx.add({ kind: 'dot', x: px + (Math.random() - 0.5) * 40, y: py + 20 - Math.random() * 10, vx: 0, vy: -60 - Math.random() * 60, life: 0, max: 0.7, size: 2.2, color: ev.branch ? '#e6a8ff' : '#ffe08a', drag: 1.5 });
            }
          }
          break;
        case 'sell':
          fx.add({ kind: 'ghost', t: ev.tower, x: px, y: (ev.tower.cy + 0.86) * T, life: 0, max: 0.35 });
          fx.puff(px, py + 20, 12, 'rgba(225,205,170,0.9)', 80, 5);
          if (ev.gold) fx.text(px, py - 10, '+' + ev.gold + (ev.full ? ' (full refund)' : ''), '#ffd166');
          break;
        case 'trap':
          fx.puff(px, py, 10, 'rgba(225,205,170,0.9)', 60, 4);
          break;
        case 'spike':
          fx.puff(px, py - 4, 4, 'rgba(200,200,205,0.9)', 50, 2.5);
          break;
        case 'keg':
          fx.ring(px, py, ev.radius * T * 1.5, 'rgba(255,200,90,0.95)', 0.5);
          fx.puff(px, py, 22, 'rgba(255,130,40,0.95)', 140, 6, -40);
          fx.puff(px, py, 10, 'rgba(70,55,50,0.85)', 90, 7, -30);
          fx.shake = Math.max(fx.shake, 0.8);
          this.decals.push({ x: px, y: py, r: ev.radius * T * 0.7, life: 0, max: 8 });
          break;
        case 'barricadeDown':
          fx.puff(px, py - 8, 18, 'rgba(176,122,66,0.95)', 110, 4, 200);
          fx.puff(px, py - 8, 8, 'rgba(225,205,170,0.9)', 70, 5);
          break;
        case 'whirlwind':
          fx.ring(px, py, ev.radius * T * 1.6, 'rgba(255,230,150,0.95)', 0.4);
          fx.ring(px, py, ev.radius * T * 1.1, 'rgba(255,255,255,0.9)', 0.3);
          for (let i = 0; i < 3; i++) {
            const a0 = Math.random() * Math.PI * 2;
            const pts = [];
            for (let k = 0; k <= 6; k++) {
              const a = a0 + k * 0.32;
              pts.push([px + Math.cos(a) * ev.radius * T * 0.8, py - 14 + Math.sin(a) * ev.radius * T * 0.45]);
            }
            fx.bolt(pts, 'rgba(255,245,210,0.95)', 0.22);
          }
          break;
        case 'rallyCry':
          fx.ring(px, py, ev.radius * T * 1.5, 'rgba(130,255,160,0.9)', 0.6);
          for (let i = 0; i < 10; i++) {
            fx.add({ kind: 'text', x: px + (Math.random() - 0.5) * 70, y: py - 20 - Math.random() * 20, vx: 0, vy: -35, life: 0, max: 0.8, str: '+', color: '#7dff9a', drag: 1 });
          }
          break;
        case 'heroLevel':
          fx.text(px, py - 60, 'Level ' + ev.level + '!', '#ffd166', true);
          fx.ring(px, py, 60, 'rgba(255,209,102,0.95)', 0.7);
          for (let i = 0; i < 18; i++) {
            fx.add({ kind: 'dot', x: px + (Math.random() - 0.5) * 30, y: py - Math.random() * 20, vx: 0, vy: -80 - Math.random() * 80, life: 0, max: 0.9, size: 2.5, color: '#ffe08a', drag: 1.2 });
          }
          break;
        case 'heroMove':
          this.heroMark = { x: px, y: py, t: this.now };
          break;
        case 'income':
          fx.text(px, py - 40, '+' + ev.gold, '#ffd166');
          fx.puff(px, py - 30, 6, 'rgba(255,215,90,0.95)', 60, 2.5);
          break;
        case 'bonus':
        case 'waveClear':
          if (ev.gold) fx.text(castle.x * T, castle.y * T - 100, '+' + ev.gold, '#ffd166', true);
          break;
        case 'fire':
          if (ev.tower === 'catapult') fx.puff(px, py + 18, 4, 'rgba(225,205,170,0.8)', 40, 3);
          break;
        case 'soldierDown':
          fx.puff(px, py - 10, ev.hero ? 20 : ev.expired ? 10 : 7, 'rgba(225,225,235,0.9)', ev.hero ? 80 : 50, ev.hero ? 6 : 4);
          break;
        case 'soldierUp':
          fx.puff(px, py - 10, 6, 'rgba(160,200,255,0.9)', 40, 3);
          break;
        case 'rally':
          fx.ring(px, py, 40, 'rgba(120,180,255,0.95)', 0.5);
          break;
        case 'meteor':
          fx.ring(px, py, ev.radius * T * 1.5, 'rgba(255,200,90,0.95)', 0.55);
          fx.puff(px, py, 24, 'rgba(255,130,40,0.95)', 150, 6, -40);
          fx.puff(px, py, 10, 'rgba(70,55,50,0.85)', 90, 8, -30);
          fx.shake = Math.max(fx.shake, 1);
          this.decals.push({ x: px, y: py, r: ev.radius * T * 0.8, life: 0, max: 8 });
          break;
        case 'cast':
          if (ev.ability === 'frost') {
            fx.ring(px, py, ev.radius * T * 2, 'rgba(200,245,255,0.95)', 0.7);
            fx.ring(px, py, ev.radius * T * 1.4, 'rgba(255,255,255,0.9)', 0.5);
            for (let i = 0; i < 30; i++) {
              const a = Math.random() * Math.PI * 2, r = Math.random() * ev.radius * T;
              fx.add({ kind: 'dot', x: px + Math.cos(a) * r, y: py + Math.sin(a) * r * 0.6, vx: 0, vy: -20, life: 0, max: 0.8 + Math.random() * 0.6, size: 2 + Math.random() * 2.5, color: 'rgba(225,248,255,0.95)', drag: 1 });
            }
          } else if (ev.ability === 'reinforce') {
            fx.ring(px, py, 46, 'rgba(120,180,255,0.95)', 0.5);
            fx.puff(px, py - 10, 16, 'rgba(225,215,190,0.9)', 80, 5);
          } else if (ev.ability === 'horn') {
            for (const t of this.game.towers) fx.ring(t.x * T, (t.cy + 0.86) * T, 46, 'rgba(255,190,90,0.95)', 0.7);
          }
          break;
      }
    }

    draw(game, view, dt, time) {
      const ctx = this.ctx;
      this.now = time;
      this.fx.update(dt);
      this.castleFlash = Math.max(0, this.castleFlash - dt * 2.5);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1b2414';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const sh = opt().shake ? this.fx.shake * 3 : 0;
      ctx.setTransform(this.scale, 0, 0, this.scale, (Math.random() - 0.5) * sh * this.scale, (Math.random() - 0.5) * sh * this.scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.bg, 0, 0, W, H);

      this.drawLanes(ctx, game, view, dt, time);
      this.drawGround(ctx, game, dt, time);
      if (view.placing) this.drawGrid(ctx, game);
      if (view.trap) this.drawRoadGrid(ctx, game);
      const sel = view.selected;
      if (sel) {
        const s = game.towerStats(sel);
        if (s.range) this.drawRange(ctx, sel.x * T, sel.y * T, s.range, 'rgba(255,255,255,0.13)', 'rgba(255,255,255,0.7)');
        if (sel.rally) this.drawRallyFlag(ctx, sel.rally.x * T, sel.rally.y * T, time);
      }
      const hov = view.hoverTower;
      if (hov && hov !== sel && opt().hoverRange && !view.placing && !view.trap) {
        const s = game.towerStats(hov);
        if (s.range) this.drawRange(ctx, hov.x * T, hov.y * T, s.range, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.35)');
      }
      this.drawHeroMarks(ctx, game, view, time);

      // Everything that stands up gets sorted by its feet.
      const items = [];
      for (const d of game.level.decor) items.push({ y: d.y, d });
      for (const p of game.level.props) items.push({ y: p.y, p });
      items.push({ y: game.level.castle.y + 0.1, castle: true });
      for (const t of game.towers) items.push({ y: t.cy + 0.86, t });
      for (const s of game.soldiers) if (s.alive) items.push({ y: s.y, s });
      for (const e of game.enemies) if (!e.def.fly) items.push({ y: e.y, e });
      for (const tr of game.traps) if (tr.type === 'keg' || tr.type === 'barricade') items.push({ y: tr.y + 0.05, tr });
      items.sort((a, b) => a.y - b.y);
      const horn = game.time < game.hornUntil;
      for (const it of items) {
        if (it.d) {
          sprite(ctx, 'env/' + it.d.sprite, it.d.x * T, it.d.y * T, it.d.scale, it.d.flip);
        } else if (it.p) {
          drawProp(ctx, it.p, time);
        } else if (it.castle) {
          drawCastle(ctx, game.level.castle, this.castleFlash, time);
        } else if (it.t) {
          const t = it.t, bx = t.x * T, by = (t.cy + 0.86) * T;
          if (sel === t) {
            ctx.strokeStyle = `rgba(255,209,102,${0.6 + Math.sin(time * 6) * 0.3})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(bx, by - 2, 28, 10, 0, 0, Math.PI * 2); ctx.stroke();
          }
          if (t.buff > 0) glow(ctx, bx, by - 2, 30, 'rgba(255,220,120,0.35)', 'rgba(255,220,120,0)');
          if (horn && t.def.kind !== 'economy' && t.def.kind !== 'support') {
            ctx.strokeStyle = `rgba(255,170,70,${0.5 + Math.sin(time * 10) * 0.3})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.ellipse(bx, by - 2, 25, 9, 0, 0, Math.PI * 2); ctx.stroke();
          }
          this.drawTowerAnimated(ctx, t, bx, by, time);
        } else if (it.tr) {
          drawTrap(ctx, it.tr, time, game.time);
          ctx.globalAlpha = 1;
        } else if (it.s) {
          this.drawSoldier(ctx, it.s, time);
        } else {
          this.drawEnemy(ctx, it.e, game, time);
        }
      }

      // Flyers soar above everything on the ground.
      const flyers = game.enemies.filter((e) => e.def.fly).sort((a, b) => a.y - b.y);
      for (const e of flyers) this.drawFlyerEnemy(ctx, e, game, time);

      for (const t of game.towers) pips(ctx, t.x * T, (t.cy + 0.86) * T + 5, game.tier(t));
      if (view.placing && view.hover) this.drawGhost(ctx, game, view, time);
      if (view.trap && view.hover) this.drawTrapGhost(ctx, game, view, time);
      for (const e of game.enemies) {
        const top = e.def.fly ? e.y * T - FLY_HEIGHT - FLYERS[e.def.draw].span * e.scale * 0.35 - 14 : e.y * T - e.scale * 56 - 10;
        this.drawHealth(ctx, e.x * T, top, e.hp, e.maxHp, e.def.boss ? 54 : 30, e.def.boss ? 6 : 4.5, e.def.boss);
      }
      for (const s of game.soldiers) {
        if (!s.alive) continue;
        if (s.hero) this.drawHeroBar(ctx, s, game);
        else if (s.hp < s.maxHp) this.drawHealth(ctx, s.x * T, s.y * T - s.scale * 56 - 6, s.hp, s.maxHp, 22, 3.5, false, '#5aa9ff');
      }
      for (const tr of game.traps) {
        if (tr.type === 'barricade' && tr.hp < tr.maxHp) this.drawHealth(ctx, tr.x * T, tr.y * T - 30, tr.hp, tr.maxHp, 34, 4, false, '#c9a46a');
      }
      for (const p of game.projectiles) this.drawProjectile(ctx, p, dt);
      this.drawStrikes(ctx, game, time);
      this.fx.draw(ctx);
      this.drawTargeting(ctx, game, view, time);
      this.drawAmbience(ctx, game, dt, time);
    }

    // Scorch marks, fire fields and shadows under flying boulders.
    drawGround(ctx, game, dt, time) {
      for (const d of this.decals) {
        d.life += dt;
        const a = 0.3 * (1 - d.life / d.max);
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.scale(1, 0.55);
        glow(ctx, 0, 0, d.r, `rgba(40,25,15,${a})`, 'rgba(40,25,15,0)');
        ctx.restore();
      }
      this.decals = this.decals.filter((d) => d.life < d.max);
      for (const h of game.hazards) {
        const x = h.x * T, y = h.y * T, r = h.r * T;
        const fade = Math.min(1, (h.until - game.time) / 0.6);
        ctx.globalAlpha = fade;
        glow(ctx, x, y, r * 1.1, 'rgba(255,120,40,0.45)', 'rgba(255,80,20,0)');
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4, rr = (i / 7) * r * 0.8;
          const fl = 0.18 + Math.sin(time * 14 + i * 3) * 0.04;
          sprite(ctx, 'env/fire', x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.55, fl);
        }
        ctx.globalAlpha = 1;
      }
      for (const tr of game.traps) {
        if (tr.type === 'spikes' || tr.type === 'tar') {
          drawTrap(ctx, tr, time, game.time);
          ctx.globalAlpha = 1;
        }
      }
      for (const p of game.projectiles) {
        if (p.lob) shadow(ctx, p.x * T, p.y * T, Math.max(2, 6 - p.h), Math.max(1, 2.5 - p.h * 0.3), 0.25);
      }
    }

    // Dashed flight lanes show where flyers will cross, whenever flyers are about.
    drawLanes(ctx, game, view, dt, time) {
      const next = game.nextWaveGroups();
      const want = game.enemies.some((e) => e.def.fly) || (next && !game.waveRunning() && next.some(([type]) => TD.ENEMIES[type].fly)) ||
        ((view.placing || view.trap) && game.seen.has('bat'));
      this.laneAlpha += ((want ? 1 : 0) - this.laneAlpha) * Math.min(1, dt * 3);
      if (this.laneAlpha < 0.02) return;
      ctx.save();
      ctx.globalAlpha = this.laneAlpha;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 11]);
      ctx.lineDashOffset = -time * 24;
      for (const f of game.level.flights) {
        const a = TD.pointAt(f, 0.8), b = TD.pointAt(f, f.length - 0.4);
        ctx.strokeStyle = 'rgba(70,40,100,0.35)';
        ctx.beginPath(); ctx.moveTo(a.x * T, a.y * T + 2); ctx.lineTo(b.x * T, b.y * T + 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(235,220,255,0.55)';
        ctx.beginPath(); ctx.moveTo(a.x * T, a.y * T); ctx.lineTo(b.x * T, b.y * T); ctx.stroke();
        // Chevrons pointing toward the keep.
        const s = f.segs[0];
        for (let d = 2; d < f.length - 1; d += 3) {
          const p = TD.pointAt(f, d), ang = Math.atan2(s.dy, s.dx);
          ctx.save();
          ctx.translate(p.x * T, p.y * T);
          ctx.rotate(ang);
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(235,220,255,0.6)';
          ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(2, 0); ctx.lineTo(-5, 6); ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    drawTowerAnimated(ctx, t, x, y, time) {
      let sx = 1, sy = 1;
      const pop = this.pop.get(t.id);
      if (pop) {
        const k = (time - pop.t) / 0.4;
        if (k >= 1 || k < 0) this.pop.delete(t.id);
        else {
          // Ease-out-back: overshoots a little, then settles.
          const e = 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
          const s = pop.build ? 0.5 + 0.5 * e : 1 + Math.sin(k * Math.PI) * 0.12;
          sx *= s; sy *= s;
        }
      }
      if (t.fireT < 0.16 && (t.type === 'archer' || t.type === 'wizard' || t.type === 'alchemist')) {
        const q = Math.sin((t.fireT / 0.16) * Math.PI);
        sx *= 1 + q * 0.035; sy *= 1 - q * 0.06;
      }
      if (sx === 1 && sy === 1) { drawTower(ctx, t, x, y, time); return; }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      drawTower(ctx, t, 0, 0, time);
      ctx.restore();
    }

    drawRoadGrid(ctx, game) {
      for (const [x, y] of game.level.cells) {
        if (!game.canPlaceTrap(x, y)) continue;
        ctx.fillStyle = 'rgba(255,200,120,0.12)';
        ctx.fillRect(x * T + 3, y * T + 3, T - 6, T - 6);
      }
    }

    drawTrapGhost(ctx, game, view, time) {
      const { x, y } = view.hover;
      const def = TD.TRAPS[view.trap];
      const ok = game.canPlaceTrap(x, y);
      const good = ok && game.gold >= game.trapCost(view.trap);
      ctx.fillStyle = good ? 'rgba(120,255,140,0.25)' : 'rgba(255,80,60,0.3)';
      ctx.fillRect(x * T, y * T, T, T);
      if (!ok) return;
      if (def.radius) this.drawRange(ctx, (x + 0.5) * T, (y + 0.5) * T, def.radius, 'rgba(255,140,60,0.1)', 'rgba(255,170,90,0.7)');
      ctx.globalAlpha = 0.75;
      drawTrap(ctx, { type: view.trap, def, x: x + 0.5, y: y + 0.5, uses: def.uses || 1, until: game.time + 99, id: 0, firedT: 9 }, time, game.time);
      ctx.globalAlpha = 1;
    }

    // Gold ring under the hero, his move order marker and (when selected) his reach.
    drawHeroMarks(ctx, game, view, time) {
      const h = game.hero;
      const m = this.heroMark;
      if (h.ordered) {
        const x = h.hx * T, y = h.hy * T;
        ctx.strokeStyle = `rgba(255,209,102,${0.6 + Math.sin(time * 8) * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
      } else if (m && time - m.t < 0.6) {
        const k = (time - m.t) / 0.6;
        ctx.strokeStyle = `rgba(255,209,102,${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, 10 + k * 14, (10 + k * 14) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (!h.alive) return;
      const x = h.x * T, y = h.y * T;
      if (view.hero) {
        ctx.fillStyle = 'rgba(255,209,102,0.08)';
        ctx.strokeStyle = 'rgba(255,209,102,0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.ellipse(h.hx * T, h.hy * T, 1.3 * T, 1.3 * T * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = `rgba(255,209,102,${view.hero ? 0.75 + Math.sin(time * 6) * 0.25 : 0.55})`;
      ctx.lineWidth = view.hero ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(x, y + 1, 15, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }

    drawHeroBar(ctx, h, game) {
      const x = h.x * T, y = h.y * T - h.scale * 56 - 9;
      this.drawHealth(ctx, x + 5, y, h.hp, h.maxHp, 28, 4, true, '#ffd166');
      ctx.fillStyle = '#6a2c86';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 14, y + 2, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 9px "Alegreya Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.level), x - 14, y + 2.5);
      ctx.textBaseline = 'alphabetic';
    }

    drawFlyerEnemy(ctx, e, game, time) {
      const x = e.x * T, gy = e.y * T;
      const now = game.time;
      const remaining = e.path.length - e.dist;
      const alpha = remaining < 0.7 ? Math.max(0, remaining / 0.7) : 1;
      const y = gy - FLY_HEIGHT + Math.sin(time * 2.2 + e.phase) * 3;
      const kind = e.def.draw;
      const flapTime = e.stunUntil > now ? 0.35 : time + e.phase;
      ctx.globalAlpha = alpha * 0.8;
      shadow(ctx, x, gy, 9 * e.scale, 3.5 * e.scale, 0.22);
      if (e.elite) {
        ctx.strokeStyle = TD.ELITES[e.elite].color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, gy, 14 * e.scale, 5 * e.scale, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      drawFlyer(ctx, kind, x, y, e.scale, flapTime, null);
      const over = (color, a) => { ctx.globalAlpha = alpha * a; drawFlyer(ctx, kind, x, y, e.scale, flapTime, color); };
      if (e.stunUntil > now && e.frozen) over('#cdefff', 0.65);
      else if (e.slowUntil > now) over('#8fd0ff', 0.35);
      if (e.burnUntil > now) over('#ff8a3d', 0.3);
      if (e.flash > 0) over('#ffffff', Math.min(1, e.flash / 0.09) * 0.75);
      ctx.globalAlpha = 1;
      if (e.burnUntil > now && Math.random() < 0.35) {
        this.fx.add({ kind: 'dot', x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 10, vx: 0, vy: -40, life: 0, max: 0.4, size: 2.5 + Math.random() * 2, color: 'rgba(255,150,60,0.9)', drag: 1 });
      }
    }

    drawRallyFlag(ctx, x, y, time) {
      shadow(ctx, x, y, 6, 2.5, 0.3);
      pole(ctx, x, y, 22);
      drawFlag(ctx, x, y - 22, 12, 8, C.blue, time);
    }

    drawTargeting(ctx, game, view, time) {
      const m = view.mouse;
      if (!m) return;
      if (view.ability) {
        const a = TD.ABILITIES[view.ability];
        let x = m.x * T, y = m.y * T, ok = true;
        if (a.target === 'road') {
          const p = TD.nearestRoad(game.level, m.x, m.y, 1.2);
          ok = !!p;
          if (p) { x = p.x * T; y = p.y * T; }
        }
        const color = view.ability === 'frost' ? '180,235,255' : view.ability === 'meteor' ? '255,140,60' : '120,180,255';
        ctx.fillStyle = ok ? `rgba(${color},0.18)` : 'rgba(255,80,60,0.15)';
        ctx.strokeStyle = ok ? `rgba(${color},0.9)` : 'rgba(255,90,70,0.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -time * 30;
        ctx.beginPath(); ctx.ellipse(x, y, a.radius * T, a.radius * T * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      } else if (view.rallyFor) {
        const t = view.rallyFor;
        this.drawRange(ctx, t.x * T, t.y * T, game.towerStats(t).range, 'rgba(120,180,255,0.12)', 'rgba(120,180,255,0.8)');
        const p = TD.nearestRoad(game.level, m.x, m.y, 0.9);
        if (p && Math.hypot(p.x - t.x, p.y - t.y) <= game.towerStats(t).range) {
          ctx.globalAlpha = 0.7;
          this.drawRallyFlag(ctx, p.x * T, p.y * T, time);
          ctx.globalAlpha = 1;
        }
      }
    }

    drawStrikes(ctx, game, time) {
      for (const s of game.strikes) {
        const x = s.x * T, y = s.y * T;
        const k = 1 - s.t / s.t0;
        ctx.strokeStyle = `rgba(255,120,50,${0.4 + k * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, s.r * T * (1.2 - k * 0.3), s.r * T * 0.6 * (1.2 - k * 0.3), 0, 0, Math.PI * 2); ctx.stroke();
        const mx = x + (1 - k) * 150, my = y - (1 - k) * 360;
        glow(ctx, mx, my, 26, 'rgba(255,235,160,1)', 'rgba(255,90,20,0)');
        ctx.fillStyle = '#5a3a2a';
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.arc(mx - 2, my - 2, 4, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.8) this.fx.add({ kind: 'dot', x: mx, y: my, vx: 30 + Math.random() * 30, vy: -60 - Math.random() * 40, life: 0, max: 0.4, size: 4 + Math.random() * 3, color: 'rgba(255,150,60,0.85)', drag: 2 });
      }
    }

    drawGrid(ctx, game) {
      ctx.lineWidth = 1;
      for (let y = 0; y < TD.ROWS; y++) {
        for (let x = 0; x < TD.COLS; x++) {
          if (!game.canPlace(x, y)) continue;
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.strokeRect(x * T + 2.5, y * T + 2.5, T - 5, T - 5);
        }
      }
    }

    drawRange(ctx, x, y, range, fill, stroke) {
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(x, y, range * T, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }

    drawGhost(ctx, game, view, time) {
      const { x, y } = view.hover;
      if (x < 0 || y < 0 || x >= TD.COLS || y >= TD.ROWS) return;
      const def = TD.TOWERS[view.placing];
      const ok = game.canPlace(x, y);
      const good = ok && game.gold >= game.towerCost(view.placing);
      ctx.fillStyle = good ? 'rgba(120,255,140,0.25)' : 'rgba(255,80,60,0.3)';
      ctx.fillRect(x * T, y * T, T, T);
      const range = def.levels[0].range;
      if (range) {
        this.drawRange(ctx, (x + 0.5) * T, (y + 0.5) * T, range,
          good ? 'rgba(255,255,255,0.1)' : 'rgba(255,80,60,0.08)', good ? 'rgba(255,255,255,0.7)' : 'rgba(255,120,100,0.7)');
      }
      if (ok) {
        ctx.globalAlpha = 0.7;
        drawTower(ctx, { type: view.placing, level: 0, branch: null, blevel: 0, def, id: 0, x: x + 0.5, y: y + 0.5, cy: y, aimX: x + 2, aimY: y, fireT: 9, angle: -Math.PI / 2 },
          (x + 0.5) * T, (y + 0.86) * T, time);
        ctx.globalAlpha = 1;
        if (def.kind === 'barracks') {
          const p = TD.nearestRoad(game.level, x + 0.5, y + 0.5, range);
          if (p) this.drawRallyFlag(ctx, p.x * T, p.y * T, time);
        }
      }
    }

    drawSoldier(ctx, s, time) {
      const x = s.x * T, y = s.y * T;
      const bob = s.moving ? Math.abs(Math.sin(time * 11 + s.phase)) * 2.4 : 0;
      const lunge = s.lunge > 0 ? s.dirX * (s.lunge / 0.15) * 5 : 0;
      const name = 'units/' + s.sprite;
      ctx.globalAlpha = s.tower ? 1 : Math.min(1, s.until / 1.5);
      shadow(ctx, x, y, 10 * s.scale, 3.6 * s.scale, 0.25);
      sprite(ctx, name, x + lunge, y - bob, s.scale, s.dirX < 0);
      if (s.flash > 0) {
        ctx.globalAlpha *= Math.min(1, s.flash / 0.09) * 0.7;
        sprite(ctx, null, x + lunge, y - bob, s.scale, s.dirX < 0, tinted(name, '#ffffff'));
      }
      ctx.globalAlpha = 1;
    }

    drawEnemy(ctx, e, game, time) {
      const def = e.def, x = e.x * T, y = e.y * T;
      const name = 'units/' + def.sprite;
      const s = e.scale;
      const now = game.time;
      const stunned = e.stunUntil > now;
      const frozen = stunned && e.frozen;
      const slowed = e.slowUntil > now;
      const burning = e.burnUntil > now;
      const raging = def.rage && e.hp < e.maxHp * 0.5;
      const pace = e.held ? 0.35 : game.speedOf(e);
      const step = time * pace * 9 + e.phase;
      const bob = Math.abs(Math.sin(step)) * 2.6 * s;
      const remaining = e.path.length - e.dist;
      ctx.globalAlpha = remaining < 0.7 ? Math.max(0, remaining / 0.7) : 1;
      shadow(ctx, x, y, 11 * s, 4 * s, 0.25);
      if (def.boss) {
        ctx.fillStyle = 'rgba(255,90,60,0.18)';
        ctx.beginPath(); ctx.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (e.elite) {
        ctx.strokeStyle = TD.ELITES[e.elite].color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha *= 0.65 + Math.sin(time * 5 + e.phase) * 0.3;
        ctx.beginPath(); ctx.ellipse(x, y, 15 * s, 6 * s, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = remaining < 0.7 ? Math.max(0, remaining / 0.7) : 1;
      }
      ctx.save();
      ctx.translate(x, y - bob);
      ctx.rotate(stunned ? 0 : Math.sin(step) * 0.07);
      if (e.flash > 0) ctx.scale(1.08, 0.93);
      const flip = e.dirX < -0.1;
      const base = ctx.globalAlpha;
      sprite(ctx, name, 0, 0, s, flip);
      const overlay = (color, a) => {
        ctx.globalAlpha = base * a;
        sprite(ctx, null, 0, 0, s, flip, tinted(name, color));
        ctx.globalAlpha = base;
      };
      if (frozen) overlay('#bfeaff', 0.6);
      else if (slowed) overlay('#7fc8ff', 0.4);
      if (burning) overlay('#ff8a3d', 0.28 + Math.sin(time * 18) * 0.08);
      if (raging) overlay('#ff3b2f', 0.25 + Math.sin(time * 10) * 0.12);
      if (e.flash > 0) overlay('#ffffff', Math.min(1, e.flash / 0.09) * 0.75);
      ctx.restore();
      const top = y - s * 56;
      if (frozen) {
        ctx.fillStyle = 'rgba(200,240,255,0.3)';
        ctx.strokeStyle = 'rgba(235,252,255,0.9)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x - 15 * s, top + 2, 30 * s, y - top, 5); ctx.fill(); ctx.stroke();
      } else if (stunned) {
        for (let i = 0; i < 3; i++) {
          const a = time * 6 + i * 2.1;
          ctx.fillStyle = '#ffe066';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9, top - 2 + Math.sin(a) * 3, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (burning && Math.random() < 0.35) {
        this.fx.add({ kind: 'dot', x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 30, vx: 0, vy: -40, life: 0, max: 0.4, size: 2.5 + Math.random() * 2, color: Math.random() < 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(255,90,30,0.9)', drag: 1 });
      }
      if (e.corrodeUntil > now && Math.random() < 0.12) {
        this.fx.add({ kind: 'dot', x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 26, vx: 0, vy: 25, life: 0, max: 0.5, size: 2, color: 'rgba(140,230,90,0.9)', drag: 0 });
      }
      if (slowed && !frozen && Math.random() < 0.08) {
        this.fx.add({ kind: 'dot', x: x + (Math.random() - 0.5) * 16, y: y - Math.random() * 30, vx: 0, vy: 12, life: 0, max: 0.5, size: 1.6, color: '#d8f1ff', drag: 0 });
      }
    }

    drawHealth(ctx, cx, y, hp, maxHp, w, h, always, color) {
      if (hp >= maxHp && !always) return;
      const x = cx - w / 2;
      const k = Math.max(0, hp / maxHp);
      ctx.fillStyle = 'rgba(30,20,12,0.8)';
      roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 2.5); ctx.fill();
      ctx.fillStyle = color || (k > 0.5 ? '#6bd35b' : k > 0.25 ? '#f2c14e' : '#e9573f');
      if (k > 0) { roundRect(ctx, x, y, w * k, h, 1.5); ctx.fill(); }
    }

    drawProjectile(ctx, p, dt) {
      const x = p.x * T, y = p.y * T;
      if (p.kind === 'arrow') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        if (p.heavy) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-9, 0); ctx.stroke();
        }
        ctx.strokeStyle = '#7a4b22'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = '#5b6060';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f5f0e6';
        ctx.fillRect(-10, -2.5, 4, 1.6); ctx.fillRect(-10, 0.9, 4, 1.6);
        ctx.restore();
      } else if (p.kind === 'orb' || p.kind === 'ice') {
        const ice = p.kind === 'ice';
        glow(ctx, x, y, 11, 'rgba(255,255,255,1)', ice ? 'rgba(150,230,255,0)' : 'rgba(120,80,255,0)');
        glow(ctx, x, y, 7, ice ? 'rgba(200,245,255,0.9)' : 'rgba(170,140,255,0.95)', 'rgba(0,0,0,0)');
        if (Math.random() < 0.6) this.fx.add({ kind: 'dot', x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0, max: 0.35, size: 2.4, color: ice ? 'rgba(220,250,255,0.9)' : 'rgba(190,160,255,0.9)', drag: 2 });
      } else if (p.lob) {
        const sy = y - p.h * T;
        if (p.kind === 'flask') {
          ctx.save(); ctx.translate(x, sy); ctx.rotate(p.t * 14);
          ctx.fillStyle = '#5bd36a'; ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 2, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#d9c7a0'; ctx.fillRect(-1.5, -5, 3, 4);
          ctx.restore();
        } else if (p.kind === 'firepot') {
          glow(ctx, x, sy, 14, 'rgba(255,220,120,0.9)', 'rgba(255,90,30,0)');
          ctx.fillStyle = '#7a3b22'; ctx.strokeStyle = '#4d2414'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (Math.random() < 0.7) this.fx.add({ kind: 'dot', x, y: sy, vx: (Math.random() - 0.5) * 20, vy: -20, life: 0, max: 0.35, size: 3.5, color: 'rgba(255,150,50,0.85)', drag: 2 });
        } else {
          const r = p.big ? 9.5 : 6.5;
          ctx.fillStyle = C.stoneDark; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = C.stoneLight;
          ctx.beginPath(); ctx.arc(x - r * 0.3, sy - r * 0.3, r * 0.34, 0, Math.PI * 2); ctx.fill();
        }
      } else if (p.kind === 'bolt') {
        const a = Math.atan2(p.vy, p.vx);
        const k = p.big ? 1.5 : 1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(k, k);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-12, 0); ctx.stroke();
        ctx.strokeStyle = C.woodDark; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.fillStyle = p.big ? '#c8d3dc' : C.outline;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    drawAmbience(ctx, game, dt, time) {
      // Drifting cloud shadows.
      for (const c of this.clouds) {
        c.x += c.v * dt;
        if (c.x - c.r > W) { c.x = -c.r * 1.5; c.y = Math.random() * H; }
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
        g.addColorStop(0, 'rgba(10,20,30,0.08)');
        g.addColorStop(1, 'rgba(10,20,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 1.4, c.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (const f of this.weather) {
        f.y += f.v * dt;
        f.x += Math.sin(time + f.p) * 12 * dt;
        if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; }
        ctx.fillStyle = f.kind === 'ash' ? `rgba(255,${120 + Math.sin(time * 3 + f.p) * 60 | 0},60,0.7)` : 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2); ctx.fill();
      }
      if (game.time < game.hornUntil) {
        const k = Math.min(1, (game.hornUntil - game.time) / 1);
        ctx.fillStyle = `rgba(255,170,60,${0.07 * k})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // Small overview of a map for the level-select screen.
  function mapPreview(map, width) {
    const level = TD.buildLevel(map);
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = (width / W) * dpr;
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const ctx = c.getContext('2d');
    ctx.drawImage(buildBackground(level, map.ground, 1), 0, 0, c.width, c.height);
    ctx.scale(k, k);
    const items = level.decor.map((d) => ({ y: d.y, d })).concat(level.props.map((p) => ({ y: p.y, p })));
    items.push({ y: level.castle.y + 0.1, castle: true });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.d) sprite(ctx, 'env/' + it.d.sprite, it.d.x * T, it.d.y * T, it.d.scale, it.d.flip);
      else if (it.p) drawProp(ctx, it.p, 0);
      else drawCastle(ctx, level.castle, 0, 0);
    }
    return c;
  }

  TD.Render = { load, img, Renderer, towerIcon, mapPreview, enemyIcon, drawTrap, W, H };
})();
