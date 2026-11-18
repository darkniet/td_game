// Game rules and state. No DOM access here, so it also runs headless under Node.
'use strict';
(function () {
  const TD = window.TD;
  const N = 1, E = 2, S = 4, W = 8;
  const FREE = 0, PATH = 1, BLOCKED = 2;
  TD.CELL = { FREE, PATH, BLOCKED };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  TD.rng = mulberry32;

  const dirBit = (dx, dy) => (dx > 0 ? E : dx < 0 ? W : dy > 0 ? S : N);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  // Turns a map definition into grid, road connections, world paths and scenery.
  TD.buildLevel = function (map) {
    const cols = TD.COLS, rows = TD.ROWS;
    const idx = (x, y) => y * cols + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const grid = new Uint8Array(cols * rows);
    const road = new Uint8Array(cols * rows);
    const allCells = new Map();
    const paths = [];
    let last, fdy, fdx;

    for (const wp of map.paths) {
      const cells = [];
      for (let i = 0; i < wp.length - 1; i++) {
        const [x0, y0] = wp[i], [x1, y1] = wp[i + 1];
        const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
        let x = x0, y = y0;
        if (i > 0) { x += dx; y += dy; }
        for (;;) {
          cells.push([x, y]);
          if (x === x1 && y === y1) break;
          x += dx; y += dy;
        }
      }
      cells.forEach(([x, y], i) => {
        if (!inside(x, y)) return;
        grid[idx(x, y)] = PATH;
        allCells.set(idx(x, y), [x, y]);
        for (const c of [cells[i - 1], cells[i + 1]]) {
          if (c) road[idx(x, y)] |= dirBit(c[0] - x, c[1] - y);
        }
      });
      last = cells[cells.length - 1];
      const prev = cells[cells.length - 2];
      fdx = last[0] - prev[0]; fdy = last[1] - prev[1];
      road[idx(last[0], last[1])] |= dirBit(fdx, fdy);

      // World-space path through cell centres, starting off-screen and ending in the gate.
      const pts = wp.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
      const s0 = pts[0], s1 = pts[1];
      const sl = Math.hypot(s1.x - s0.x, s1.y - s0.y);
      pts[0] = { x: s0.x - (s1.x - s0.x) / sl * 0.7, y: s0.y - (s1.y - s0.y) / sl * 0.7 };
      const end = pts[pts.length - 1];
      pts.push({ x: end.x + fdx * 0.62, y: end.y + fdy * 0.62 });
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push({ ax: a.x, ay: a.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, len, start: total });
        total += len;
      }
      paths.push({ segs, length: total, index: paths.length });
    }

    // Castle sits just beyond the last road cell (maps always end heading north).
    const castle = { x: last[0] + 0.5, y: last[1] };
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 1; dy <= 2; dy++) {
        const cx = last[0] + dx, cy = last[1] - dy;
        if (inside(cx, cy)) grid[idx(cx, cy)] = BLOCKED;
      }
    }

    const rand = mulberry32(map.seed);
    const props = [];
    for (const [kind, x, y] of map.props || []) {
      if (!inside(x, y) || grid[idx(x, y)] !== FREE) continue;
      grid[idx(x, y)] = BLOCKED;
      props.push({ kind, x: x + 0.5, y: y + 0.88, flip: false });
    }

    // Distance (in steps) from each cell to the road, used to keep the roadside buildable.
    const dist = new Int16Array(cols * rows).fill(-1);
    const queue = [];
    for (let i = 0; i < grid.length; i++) if (grid[i] === PATH) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % cols, y = (i / cols) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (inside(nx, ny) && dist[idx(nx, ny)] < 0) { dist[idx(nx, ny)] = dist[i] + 1; queue.push(idx(nx, ny)); }
      }
    }

    const decor = [];
    const clutter = [];
    const groundVariant = new Uint8Array(cols * rows);
    const isTree = (name) => /pine|tree/.test(name);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = idx(x, y);
        groundVariant[i] = rand() < 0.35 ? 1 : 0;
        if (grid[i] === PATH) continue;
        // Flat ground details (tufts, flowers, pebbles) that never block building.
        const bits = (rand() * 3) | 0;
        for (let k = 0; k < bits; k++) clutter.push({ x: x + 0.1 + rand() * 0.8, y: y + 0.15 + rand() * 0.75, v: rand() });
        if (grid[i] !== FREE) continue;
        const d = dist[i];
        const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        let p = d <= 1 ? 0.03 : d === 2 ? 0.14 : map.density;
        if (edge) p += 0.15;
        if (rand() >= p) continue;
        grid[i] = BLOCKED;
        const pick = map.decor[(rand() * map.decor.length) | 0];
        const count = isTree(pick) && rand() < 0.65 ? 2 + (rand() < 0.5 ? 1 : 0) + (rand() < 0.25 ? 1 : 0) : 1;
        for (let k = 0; k < count; k++) {
          const other = map.decor[(rand() * map.decor.length) | 0];
          const name = k === 0 || !isTree(other) ? pick : other;
          const spread = count > 1 ? 0.3 : 0.08;
          decor.push({
            sprite: name,
            x: x + 0.5 + (rand() - 0.5) * spread * 2,
            y: y + 0.86 - (count > 1 ? rand() * 0.4 : 0),
            flip: rand() < 0.5,
            scale: isTree(name) ? 0.56 * (0.9 + rand() * 0.35) : 0.5 * (0.85 + rand() * 0.25),
          });
        }
      }
    }

    return {
      cols, rows, grid, road, groundVariant, paths, cells: [...allCells.values()],
      castle, props, decor, clutter,
    };
  };

  TD.pointAt = function (path, d) {
    const segs = path.segs;
    let s = segs[segs.length - 1];
    for (let i = 0; i < segs.length; i++) {
      if (d < segs[i].start + segs[i].len) { s = segs[i]; break; }
    }
    const t = Math.max(0, Math.min(s.len, d - s.start));
    return { x: s.ax + s.dx * t, y: s.ay + s.dy * t, dx: s.dx, dy: s.dy };
  };

  // Closest point on any road to (x, y), optionally within a maximum distance.
  TD.nearestRoad = function (level, x, y, maxDist) {
    let best = null, bd = maxDist == null ? Infinity : maxDist * maxDist;
    for (const path of level.paths) {
      for (let d = 0.8; d < path.length - 0.6; d += 0.2) {
        const p = TD.pointAt(path, d);
        const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d2 < bd) { bd = d2; best = { x: p.x, y: p.y, path, dist: d }; }
      }
    }
    return best;
  };

  const SLOTS = {
    1: [[0, 0]],
    2: [[-0.24, 0], [0.24, 0]],
    3: [[-0.28, 0.12], [0.28, 0.12], [0, -0.2]],
    4: [[-0.27, -0.16], [0.27, -0.16], [-0.27, 0.18], [0.27, 0.18]],
  };

  class Game {
    constructor(map, opts) {
      opts = opts || {};
      this.map = map;
      this.mode = opts.mode || 'campaign';
      this.endless = this.mode !== 'campaign';
      this.sandbox = this.mode === 'sandbox';
      const perks = opts.perks || {};
      const pk = (id) => perks[id] || 0;
      this.mods = {
        gold: 40 * pk('chest'), lives: 3 * pk('walls'), cost: 1 - 0.04 * pk('masons'), dmg: 1 + 0.05 * pk('steel'),
        bounty: 1 + 0.08 * pk('bounty'), soldierHp: 1 + 0.15 * pk('drill'),
        cooldown: 1 - 0.1 * pk('rites'), power: 1 + 0.15 * pk('lore'),
      };
      this.level = TD.buildLevel(map);
      this.gold = this.sandbox ? Infinity : map.gold + this.mods.gold;
      this.lives = this.sandbox ? Infinity : map.lives + this.mods.lives;
      this.maxLives = this.lives;
      this.wave = 0;
      this.totalWaves = this.endless ? Infinity : TD.WAVES.length;
      this.time = 0;
      this.enemies = [];
      this.towers = [];
      this.soldiers = [];
      this.projectiles = [];
      this.hazards = [];
      this.strikes = [];
      this.spawners = [];
      this.pending = {};
      this.countdown = null;
      this.events = [];
      this.state = 'playing';
      this.nextId = 1;
      this.spawnCount = 0;
      this.hornUntil = 0;
      const seed = opts.seed != null ? opts.seed : map.seed * 7919 + 1;
      this.rand = mulberry32(seed);
      this.waveRand = mulberry32(seed ^ 0x5bd1e995);
      this.waveCache = {};
      this.abilities = {};
      for (const id of TD.ABILITY_ORDER) this.abilities[id] = { cd: 0 };
      this.seen = new Set();
      this.stats = { kills: 0, leaked: 0, built: 0 };
    }

    emit(type, data) { this.events.push(Object.assign({ type }, data)); }

    hpScale(wave) { return this.map.hpMul * (this.endless ? TD.endlessHpScale(wave) : TD.waveHpScale(wave)); }

    cellAt(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.level.cols || cy >= this.level.rows) return BLOCKED;
      return this.level.grid[cy * this.level.cols + cx];
    }

    towerAt(cx, cy) { return this.towers.find((t) => t.cx === cx && t.cy === cy) || null; }

    canPlace(cx, cy) { return this.cellAt(cx, cy) === FREE && !this.towerAt(cx, cy); }

    spend(cost) {
      if (this.gold < cost) return false;
      this.gold -= cost;
      return true;
    }

    // ---- Waves -------------------------------------------------------------

    wavesFor(w) {
      if (!this.endless) return TD.WAVES[w - 1];
      if (!this.waveCache[w]) this.waveCache[w] = TD.endlessWave(w, this.waveRand);
      return this.waveCache[w];
    }

    nextWaveGroups() {
      return this.wave < this.totalWaves ? this.wavesFor(this.wave + 1) : null;
    }

    canCallWave() {
      return this.state === 'playing' && this.wave < this.totalWaves && (this.sandbox || this.spawners.length === 0);
    }

    earlyBonus() {
      if (this.wave === 0 || this.sandbox || !this.canCallWave()) return 0;
      if (this.countdown != null) return Math.ceil(this.countdown) * 2;
      return this.enemies.length ? 10 + this.wave * 2 : 0;
    }

    callWave(manual) {
      if (!this.canCallWave()) return false;
      const bonus = manual ? this.earlyBonus() : 0;
      if (bonus) {
        this.gold += bonus;
        this.emit('bonus', { gold: bonus });
      }
      this.wave++;
      this.countdown = null;
      const queue = [];
      for (const [type, count, gap, delay] of this.wavesFor(this.wave)) {
        for (let k = 0; k < count; k++) queue.push({ time: delay + k * gap, type });
      }
      queue.sort((a, b) => a.time - b.time);
      this.spawners.push({ wave: this.wave, t: 0, queue, i: 0 });
      this.pending[this.wave] = queue.length;
      for (const t of this.towers) {
        const income = this.towerStats(t).income;
        if (income && !this.sandbox) {
          this.gold += income;
          this.emit('income', { x: t.x, y: t.y, gold: income });
        }
      }
      this.emit('wave', { wave: this.wave });
      return true;
    }

    spawn(type, wave, from) {
      const def = TD.ENEMIES[type];
      const r = this.rand;
      let hp = def.hp * this.hpScale(wave);
      let speed = def.speed * (0.94 + r() * 0.12);
      let armor = def.armor || 0, mres = def.magicResist || 0, scale = def.scale, regen = 0, elite = null;
      if (this.endless && !def.boss && !def.minion && r() < TD.eliteChance(wave)) {
        const keys = Object.keys(TD.ELITES);
        elite = keys[(r() * keys.length) | 0];
        const el = TD.ELITES[elite];
        hp *= el.hp;
        speed *= el.speed || 1;
        scale *= el.scale || 1;
        regen = el.regen || 0;
        if (el.armor) { armor = Math.min(0.85, armor + el.armor); mres = Math.min(0.85, mres + el.armor); }
      }
      hp = Math.round(hp);
      const path = from ? from.path : this.level.paths[this.spawnCount++ % this.level.paths.length];
      const e = {
        id: this.nextId++, type, def, wave, hp, maxHp: hp, path,
        dist: from ? Math.max(0, from.dist - 0.15 - r() * 0.4) : 0, x: 0, y: 0, dirX: 1, dirY: 0,
        speed, armor, mres, scale, regen, elite,
        atk: (def.atk || 4) * Math.sqrt(TD.waveHpScale(wave)) * (elite === 'giant' ? 1.6 : 1),
        ox: (r() - 0.5) * (def.boss ? 0.1 : 0.3), oy: (r() - 0.5) * (def.boss ? 0.1 : 0.26),
        slow: 0, slowUntil: 0, stunUntil: 0, frozen: false, burnDps: 0, burnUntil: 0,
        corrode: 0, corrodeUntil: 0, flash: 0, alive: true, phase: r() * 10, atkCd: 0.5,
        blockedBy: null, held: false, heldFor: 0, freeUntil: 0, hurtAt: -9,
        healT: def.heal ? def.heal.interval * (0.3 + r() * 0.7) : 0,
        summonT: def.summon ? def.summon.interval * (0.5 + r() * 0.5) : 0,
      };
      this.placeEnemy(e);
      this.enemies.push(e);
      if (!this.seen.has(type)) {
        this.seen.add(type);
        this.emit('newEnemy', { enemy: type });
      }
      return e;
    }

    placeEnemy(e) {
      const p = TD.pointAt(e.path, e.dist);
      e.x = p.x + e.ox;
      e.y = p.y + e.oy;
      e.dirX = p.dx;
      e.dirY = p.dy;
    }

    speedOf(e) {
      if (e.stunUntil > this.time) return 0;
      let s = e.speed * (e.slowUntil > this.time ? 1 - e.slow : 1);
      if (e.def.rage && e.hp < e.maxHp * 0.5) s *= 1.8;
      return s;
    }

    // ---- Combat ------------------------------------------------------------

    armorOf(e) { return Math.max(0, e.armor - (e.corrodeUntil > this.time ? e.corrode : 0)); }

    damage(e, amount, kind, pen, bossMult) {
      if (!e.alive) return 0;
      if (bossMult && (e.def.boss || e.elite)) amount *= bossMult;
      const mult = kind === 'magic' ? 1 - e.mres : kind === 'true' ? 1 : 1 - this.armorOf(e) * (1 - (pen || 0));
      const dealt = amount * mult;
      e.hp -= dealt;
      e.flash = 0.09;
      e.hurtAt = this.time;
      if (e.hp <= 0) this.kill(e);
      return dealt;
    }

    kill(e) {
      e.alive = false;
      if (e.blockedBy && e.blockedBy.target === e) e.blockedBy.target = null;
      const gold = Math.max(1, Math.round(e.def.gold * this.mods.bounty * (e.elite ? 2 : 1)));
      this.gold += gold;
      this.stats.kills++;
      this.pending[e.wave]--;
      this.emit('kill', { x: e.x, y: e.y, gold, enemy: e.type, boss: !!e.def.boss, elite: e.elite });
    }

    applySlow(e, amount, dur) {
      if (!e.alive) return;
      if (e.slowUntil <= this.time || amount >= e.slow) e.slow = amount;
      e.slowUntil = Math.max(e.slowUntil, this.time + dur);
    }

    stun(e, dur, frozen) {
      if (!e.alive) return;
      if (e.def.boss) dur *= 0.5;
      if (this.time + dur > e.stunUntil) {
        e.stunUntil = this.time + dur;
        e.frozen = !!frozen;
      }
    }

    burn(e, dps, dur) {
      if (!e.alive) return;
      if (e.burnUntil <= this.time || dps >= e.burnDps) e.burnDps = dps;
      e.burnUntil = Math.max(e.burnUntil, this.time + dur);
    }

    corrode(e, amount, dur) {
      if (!e.alive) return;
      e.corrode = Math.max(e.corrodeUntil > this.time ? e.corrode : 0, amount);
      e.corrodeUntil = this.time + dur;
    }

    // ---- Towers ------------------------------------------------------------

    costOf(base) { return this.sandbox ? 0 : Math.round(base * this.mods.cost); }

    towerCost(type) { return this.costOf(TD.TOWERS[type].cost); }

    branchDef(t) { return t.branch ? t.def.branches[t.branch] : null; }

    towerStats(t) { return t.branch ? t.def.branches[t.branch].levels[t.blevel] : t.def.levels[t.level]; }

    // 0-2 are the base levels, 3-4 the branch ranks.
    tier(t) { return t.branch ? 3 + t.blevel : t.level; }

    towerName(t) { return t.branch ? t.def.branches[t.branch].name : t.def.name; }

    projectileOf(t) { const b = this.branchDef(t); return (b && b.projectile) || t.def.projectile; }

    canBranch(t) { return !t.branch && t.level === t.def.levels.length - 1 && !!t.def.branches; }

    upgradeCost(t) {
      if (!t.branch && t.level < t.def.levels.length - 1) return this.costOf(t.def.levels[t.level + 1].cost);
      const b = this.branchDef(t);
      if (b && t.blevel < b.levels.length - 1) return this.costOf(b.levels[t.blevel + 1].cost);
      return null;
    }

    branchCost(t, key) { return this.costOf(t.def.branches[key].levels[0].cost); }

    sellValue(t) { return Math.floor(t.invested * 0.7); }

    build(type, cx, cy) {
      const def = TD.TOWERS[type];
      if (!def || !this.canPlace(cx, cy) || this.state !== 'playing') return null;
      const cost = this.towerCost(type);
      if (!this.spend(cost)) return null;
      const t = {
        id: this.nextId++, type, def, level: 0, branch: null, blevel: 0, cx, cy, x: cx + 0.5, y: cy + 0.5,
        cooldown: 0.3, mode: 'first', invested: cost, angle: -Math.PI / 2,
        aimX: cx + 0.5, aimY: cy, fireT: 9, kills: 0, buff: 0, haste: 0, squad: [], rally: null,
      };
      this.towers.push(t);
      this.stats.built++;
      if (def.kind === 'barracks') {
        const p = TD.nearestRoad(this.level, t.x, t.y, this.towerStats(t).range);
        t.rally = p || { x: t.x, y: t.y + 0.6 };
        this.syncSquad(t);
      }
      this.emit('build', { x: t.x, y: t.y, tower: type });
      return t;
    }

    upgrade(t) {
      const cost = this.upgradeCost(t);
      if (cost == null || this.state !== 'playing' || !this.spend(cost)) return false;
      t.invested += cost;
      if (t.branch) t.blevel++;
      else t.level++;
      if (t.def.kind === 'barracks') this.syncSquad(t);
      this.emit('upgrade', { x: t.x, y: t.y, tower: t.type, level: this.tier(t) });
      return true;
    }

    chooseBranch(t, key) {
      if (!this.canBranch(t) || !t.def.branches[key] || this.state !== 'playing') return false;
      const cost = this.branchCost(t, key);
      if (!this.spend(cost)) return false;
      t.invested += cost;
      t.branch = key;
      t.blevel = 0;
      if (t.def.kind === 'barracks') this.syncSquad(t);
      this.emit('upgrade', { x: t.x, y: t.y, tower: t.type, level: this.tier(t), branch: key });
      return true;
    }

    sell(t) {
      const i = this.towers.indexOf(t);
      if (i < 0 || this.state !== 'playing') return false;
      this.towers.splice(i, 1);
      for (const s of t.squad) this.removeSoldier(s);
      const value = this.sellValue(t);
      this.gold += value;
      this.emit('sell', { x: t.x, y: t.y, gold: this.sandbox ? 0 : value });
      return true;
    }

    setRally(t, x, y) {
      const p = TD.nearestRoad(this.level, x, y, 0.9);
      if (!p || Math.hypot(p.x - t.x, p.y - t.y) > this.towerStats(t).range) return false;
      t.rally = p;
      for (const s of t.squad) this.release(s);
      this.syncSquad(t);
      this.emit('rally', { x: p.x, y: p.y });
      return true;
    }

    // ---- Soldiers -----------------------------------------------------------

    soldierSprite(t) {
      if (t.branch === 'paladin') return 'blue_king';
      if (t.branch === 'berserker') return 'blue_peasant';
      return t.level >= 2 ? 'blue_knight' : 'blue_soldier';
    }

    // Keeps a barracks' squad in line with its current level (count, stats, rally slots).
    syncSquad(t) {
      const s = this.towerStats(t);
      while (t.squad.length < s.soldiers) {
        const sol = this.makeSoldier(t.x, t.y + 0.3, t);
        t.squad.push(sol);
        this.soldiers.push(sol);
      }
      const slots = SLOTS[s.soldiers];
      t.squad.forEach((sol, i) => {
        const maxHp = Math.round(s.hp * this.mods.soldierHp);
        if (sol.alive) sol.hp += Math.max(0, maxHp - sol.maxHp);
        sol.maxHp = maxHp;
        sol.dmg = s.dmg;
        sol.rate = s.rate;
        sol.armor = s.armor;
        sol.regen = s.regen || 0;
        sol.cleave = s.cleave || 0;
        sol.sprite = this.soldierSprite(t);
        sol.scale = t.branch ? 0.7 : 0.64;
        sol.hx = t.rally.x + slots[i][0];
        sol.hy = t.rally.y + slots[i][1];
      });
    }

    makeSoldier(x, y, tower) {
      return {
        id: this.nextId++, tower, x, y, hx: x, hy: y, hp: 1, maxHp: 1, dmg: 0, rate: 1, armor: 0, regen: 0, cleave: 0,
        cd: 0, target: null, alive: true, respawn: 0, until: Infinity, sprite: 'blue_soldier', scale: 0.64,
        phase: this.rand() * 10, flash: 0, lunge: 0, moving: false, dirX: 1,
      };
    }

    release(s) {
      if (s.target && s.target.blockedBy === s) s.target.blockedBy = null;
      s.target = null;
    }

    removeSoldier(s) {
      this.release(s);
      s.alive = false;
      s.gone = true;
      this.soldiers = this.soldiers.filter((o) => o !== s);
    }

    hitSoldier(s, dmg) {
      s.hp -= dmg * (1 - s.armor);
      s.flash = 0.09;
      if (s.hp > 0) return;
      this.release(s);
      s.alive = false;
      this.emit('soldierDown', { x: s.x, y: s.y });
      if (s.tower) {
        s.respawn = this.towerStats(s.tower).respawn;
      } else {
        this.removeSoldier(s);
      }
    }

    updateSoldiers(dt) {
      for (const s of this.soldiers.slice()) {
        s.flash = Math.max(0, s.flash - dt);
        s.lunge = Math.max(0, s.lunge - dt);
        if (!s.alive) {
          if (s.tower && (s.respawn -= dt) <= 0) {
            s.alive = true;
            s.hp = s.maxHp;
            s.x = s.tower.x;
            s.y = s.tower.y + 0.3;
            this.emit('soldierUp', { x: s.x, y: s.y });
          }
          continue;
        }
        if (!s.tower && (s.until -= dt) <= 0) {
          this.emit('soldierDown', { x: s.x, y: s.y, expired: true });
          this.removeSoldier(s);
          continue;
        }
        const home = { x: s.hx, y: s.hy };
        if (s.target && (!s.target.alive || dist2(s.target, home) > 1.6 * 1.6)) this.release(s);
        if (!s.target) {
          let best = null, bd = 1.0 * 1.0;
          for (const e of this.enemies) {
            if (!e.alive || e.def.noBlock || e.freeUntil > this.time || (e.blockedBy && e.blockedBy !== s && e.blockedBy.alive)) continue;
            const d = dist2(e, home);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) { s.target = best; best.blockedBy = s; }
        }
        let gx = s.hx, gy = s.hy;
        if (s.target) {
          const e = s.target;
          const side = s.x <= e.x ? -1 : 1;
          gx = e.x + side * 0.3;
          gy = e.y;
        }
        const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
        s.moving = d > 0.05;
        if (s.moving) {
          const step = Math.min(d, 2.4 * dt);
          s.x += (dx / d) * step;
          s.y += (dy / d) * step;
          if (Math.abs(dx) > 0.02) s.dirX = Math.sign(dx);
        }
        if (s.target && Math.hypot(s.target.x - s.x, s.target.y - s.y) < 0.5) {
          const e = s.target;
          s.dirX = e.x >= s.x ? 1 : -1;
          s.cd -= dt;
          if (s.cd <= 0) {
            s.cd = 1 / s.rate;
            s.lunge = 0.15;
            this.damage(e, s.dmg * this.mods.dmg, 'physical', 0);
            if (s.cleave) {
              for (const o of this.enemies) {
                if (o !== e && o.alive && dist2(o, e) < 0.6 * 0.6) this.damage(o, s.dmg * s.cleave * this.mods.dmg, 'physical', 0);
              }
            }
            this.emit('melee', { x: e.x, y: e.y - 0.2 });
          }
        } else if (!s.target) {
          s.hp = Math.min(s.maxHp, s.hp + (s.regen || 4) * dt);
        }
        if (s.target && s.regen) s.hp = Math.min(s.maxHp, s.hp + s.regen * 0.5 * dt);
      }
    }

    // ---- Abilities ------------------------------------------------------------

    abilityReady(id) { return this.abilities[id].cd <= 0 && this.state === 'playing'; }

    cast(id, x, y) {
      if (!this.abilityReady(id)) return false;
      const a = TD.ABILITIES[id];
      const w = Math.max(1, this.wave);
      const power = this.mods.power;
      if (id === 'meteor') {
        for (let k = 0; k < 3; k++) {
          const ang = this.rand() * Math.PI * 2, rr = k === 0 ? 0 : 0.45 + this.rand() * 0.35;
          const delay = 0.55 + k * 0.22;
          this.strikes.push({
            x: x + Math.cos(ang) * rr, y: y + Math.sin(ang) * rr, t: delay, t0: delay,
            dmg: (60 + 10 * w) * power, r: 1.05, burn: (10 + 2 * w) * power,
          });
        }
      } else if (id === 'reinforce') {
        const p = TD.nearestRoad(this.level, x, y, 1.2);
        if (!p) return false;
        for (let k = 0; k < 2; k++) {
          const s = this.makeSoldier(p.x + (k ? 0.25 : -0.25), p.y - 0.6, null);
          Object.assign(s, {
            hx: p.x + (k ? 0.25 : -0.25), hy: p.y, maxHp: Math.round((120 + 16 * w) * this.mods.soldierHp * power),
            dmg: (8 + 1.2 * w) * power, rate: 1, armor: 0.2, until: 18, sprite: 'blue_woman', scale: 0.64,
          });
          s.hp = s.maxHp;
          this.soldiers.push(s);
        }
        x = p.x; y = p.y;
      } else if (id === 'frost') {
        for (const e of this.enemies) {
          if (!e.alive || (e.x - x) ** 2 + (e.y - y) ** 2 > a.radius * a.radius) continue;
          this.damage(e, (20 + 3 * w) * power, 'magic', 0);
          this.stun(e, 2 * Math.min(1.5, power), true);
        }
      } else if (id === 'horn') {
        this.hornUntil = this.time + a.duration;
      }
      this.abilities[id].cd = a.cooldown * this.mods.cooldown;
      this.emit('cast', { ability: id, x, y, radius: a.radius });
      return true;
    }

    // ---- Targeting & firing -------------------------------------------------------

    targetsInRange(t, range) {
      const r2 = range * range;
      return this.enemies.filter((e) => e.alive && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2);
    }

    // "First" means closest to the gate, measured as distance left to walk.
    progress(e) { return e.path.length - e.dist; }

    pickTargets(t, range, n) {
      const list = this.targetsInRange(t, range);
      const key = t.mode === 'first' ? (e) => -this.progress(e)
        : t.mode === 'last' ? (e) => this.progress(e)
          : t.mode === 'strong' ? (e) => e.hp - this.progress(e) * 0.01
            : (e) => -((e.x - t.x) ** 2 + (e.y - t.y) ** 2);
      list.sort((a, b) => key(b) - key(a));
      return list.slice(0, n);
    }

    // Where an enemy will be after `dt` seconds if it keeps walking.
    predict(e, dt) {
      const moving = e.held ? 0 : this.speedOf(e);
      const p = TD.pointAt(e.path, Math.min(e.path.length, e.dist + moving * dt));
      return { x: p.x + e.ox, y: p.y + e.oy };
    }

    muzzle(t) {
      const h = t.type === 'archer' ? 0.9 + Math.min(t.level, 1) * 0.3 : t.type === 'wizard' ? 1.0 : t.type === 'alchemist' ? 0.9 : 0.35;
      return { x: t.x, y: t.y - h };
    }

    fire(t, s, targets) {
      const kind = this.projectileOf(t);
      const dmgType = t.def.damage;
      const pen = s.armorPen != null ? s.armorPen : t.def.armorPen || 0;
      const dmg = s.dmg * (1 + t.buff) * this.mods.dmg;
      const o = this.muzzle(t);
      const target = targets[0];
      t.fireT = 0;
      t.aimX = target.x;
      t.aimY = target.y;
      if (kind === 'arrow' || kind === 'orb' || kind === 'ice') {
        for (const e of targets) {
          this.projectiles.push({
            kind, x: o.x, y: o.y, target: e, tx: e.x, ty: e.y,
            speed: kind === 'arrow' ? (s.crit ? 17 : 11) : 7, dmg, damage: dmgType, pen,
            slow: s.slow, slowDur: s.slowDur, chain: s.chain || 0, freeze: s.freeze || 0, freezeDur: s.freezeDur,
            crit: s.crit || 0, execute: s.execute || 0, vx: 0, vy: -1, heavy: !!s.crit,
          });
        }
      } else if (kind === 'lightning') {
        this.lightning(t, s, target, o, dmg);
      } else if (kind === 'stone' || kind === 'firepot' || kind === 'flask') {
        const dist = Math.hypot(target.x - o.x, target.y - o.y);
        const T = (kind === 'flask' ? 0.5 : 0.7) + dist * (kind === 'flask' ? 0.07 : 0.09);
        const p = this.predict(target, T);
        this.projectiles.push({
          kind, lob: true, sx: o.x, sy: o.y, tx: p.x, ty: p.y, x: o.x, y: o.y, h: 0, t: 0, T,
          dmg, damage: dmgType, pen, splash: s.splash, burn: s.burn, burnDur: s.burnDur, fireField: s.fireField,
          stun: s.stun, corrode: s.corrode, big: t.branch === 'trebuchet',
        });
        t.aimX = p.x;
        t.aimY = p.y;
      } else if (kind === 'bolt') {
        const speed = t.branch === 'scorpion' ? 17 : 15;
        const dist = Math.hypot(target.x - o.x, target.y - o.y);
        const p = this.predict(target, dist / speed);
        const len = Math.hypot(p.x - o.x, p.y - o.y) || 1;
        const vx = (p.x - o.x) / len, vy = (p.y - o.y) / len;
        t.angle = Math.atan2(vy, vx);
        this.projectiles.push({
          kind: 'bolt', x: o.x, y: o.y, vx, vy, speed, travelled: 0, maxDist: s.range + 1.5,
          pierce: s.pierce, hit: new Set(), dmg, damage: dmgType, pen, bossMult: s.bossMult || 0,
          big: t.branch === 'slayer',
        });
      }
      this.emit('fire', { tower: t.type, branch: t.branch, kind, x: o.x, y: o.y });
    }

    lightning(t, s, first, o, dmg) {
      const pts = [[o.x, o.y]];
      const hit = [];
      let cur = first, power = dmg;
      for (let c = 0; c <= s.chain && cur; c++) {
        hit.push(cur);
        pts.push([cur.x, cur.y - 0.25]);
        this.damage(cur, power, 'magic', 0);
        if (s.stunChance && this.rand() < s.stunChance) this.stun(cur, s.stunDur);
        power *= 0.85;
        let next = null, best = 2.2 * 2.2;
        for (const e of this.enemies) {
          if (!e.alive || hit.includes(e)) continue;
          const d2 = dist2(e, cur);
          if (d2 < best) { best = d2; next = e; }
        }
        cur = next;
      }
      this.emit('lightning', { pts });
    }

    // ---- Update ---------------------------------------------------------------

    update(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      for (const id in this.abilities) this.abilities[id].cd = Math.max(0, this.abilities[id].cd - dt);

      for (const s of this.spawners) {
        s.t += dt;
        while (s.i < s.queue.length && s.queue[s.i].time <= s.t) this.spawn(s.queue[s.i++].type, s.wave);
      }
      const before = this.spawners.length;
      this.spawners = this.spawners.filter((s) => s.i < s.queue.length);
      if (before && !this.spawners.length) this.emit('spawnDone', { wave: this.wave });

      this.updateEnemies(dt);
      this.updateSoldiers(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateHazards(dt);

      if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);

      for (const w in this.pending) {
        if (this.pending[w] <= 0 && !this.spawners.some((s) => s.wave === +w)) {
          delete this.pending[w];
          const gold = this.sandbox ? 0 : 20 + 5 * Math.min(+w, 30);
          this.gold += gold;
          this.emit('waveClear', { wave: +w, gold });
        }
      }

      if (this.lives <= 0) {
        this.lives = 0;
        this.state = 'lost';
        this.emit('lost', {});
        return;
      }
      if (!this.spawners.length && !this.enemies.length) {
        if (this.wave >= this.totalWaves) {
          this.state = 'won';
          this.emit('won', {});
          return;
        }
        if (this.wave > 0 && this.countdown == null) this.countdown = this.endless ? 10 : 12;
      }
      if (this.countdown != null) {
        this.countdown -= dt;
        if (this.countdown <= 0) this.callWave(false);
      }
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.flash = Math.max(0, e.flash - dt);
        if (e.burnUntil > this.time) {
          e.hp -= e.burnDps * dt;
          if (e.hp <= 0) { this.kill(e); continue; }
        }
        if (e.regen && this.time - e.hurtAt > 2.5) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);

        // Held in place while a living soldier stands toe to toe with it.
        const b = e.blockedBy;
        if (b && (!b.alive || b.target !== e)) e.blockedBy = null;
        e.held = !!(e.blockedBy && Math.hypot(e.blockedBy.x - e.x, e.blockedBy.y - e.y) < 0.55);
        e.heldFor = e.held ? e.heldFor + dt : 0;
        if (e.heldFor > 15) {
          // Nobody holds a foe forever: shove past and keep marching.
          this.release(e.blockedBy);
          e.held = false;
          e.heldFor = 0;
          e.freeUntil = this.time + 4;
        }
        if (e.held) {
          if (e.stunUntil <= this.time && (e.atkCd -= dt) <= 0) {
            e.atkCd = 1;
            this.hitSoldier(e.blockedBy, e.atk);
          }
        } else {
          e.dist += this.speedOf(e) * dt;
        }
        if (e.dist >= e.path.length) {
          e.alive = false;
          if (e.blockedBy) this.release(e.blockedBy);
          this.lives -= e.def.lives;
          this.stats.leaked++;
          this.pending[e.wave]--;
          this.emit('leak', { lives: e.def.lives, enemy: e.type, x: e.x, y: e.y });
          continue;
        }
        this.placeEnemy(e);

        const heal = e.def.heal;
        if (heal && e.stunUntil <= this.time && (e.healT -= dt) <= 0) {
          const r2 = heal.radius * heal.radius;
          const hurt = this.enemies.filter((o) => o.alive && o.hp < o.maxHp && dist2(o, e) <= r2);
          if (hurt.length) {
            e.healT = heal.interval;
            for (const o of hurt) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * heal.amount);
            this.emit('heal', { x: e.x, y: e.y, radius: heal.radius, targets: hurt.map((o) => ({ x: o.x, y: o.y })) });
          } else {
            e.healT = 0.4;
          }
        }
        const sm = e.def.summon;
        if (sm && e.stunUntil <= this.time && (e.summonT -= dt) <= 0 && e.dist > 1) {
          e.summonT = sm.interval;
          for (let k = 0; k < sm.count; k++) this.spawn(sm.type, e.wave, e);
          this.pending[e.wave] += sm.count;
          this.emit('summon', { x: e.x, y: e.y });
        }
      }
    }

    updateTowers(dt) {
      // Chapel blessings: each tower takes the strongest one in range.
      const chapels = this.towers.filter((t) => t.def.kind === 'support');
      for (const t of this.towers) {
        t.buff = 0; t.haste = 0;
        for (const c of chapels) {
          const cs = this.towerStats(c);
          if (c !== t && (c.x - t.x) ** 2 + (c.y - t.y) ** 2 <= cs.range * cs.range) {
            t.buff = Math.max(t.buff, cs.buff);
            t.haste = Math.max(t.haste, cs.haste || 0);
          }
        }
      }
      const horn = this.time < this.hornUntil ? 1.4 : 1;
      for (const t of this.towers) {
        const s = this.towerStats(t);
        t.fireT += dt;
        if (t.def.kind === 'support') {
          if (s.heal) {
            for (const sol of this.soldiers) {
              if (sol.alive && (sol.x - t.x) ** 2 + (sol.y - t.y) ** 2 <= s.range * s.range) sol.hp = Math.min(sol.maxHp, sol.hp + s.heal * dt);
            }
          }
          continue;
        }
        if (t.def.kind === 'economy' || t.def.kind === 'barracks') continue;
        if (s.aura) {
          for (const e of this.targetsInRange(t, s.range)) this.applySlow(e, s.aura, 0.25);
        }
        t.cooldown -= dt * (1 + t.haste) * horn;
        if (t.type === 'ballista' || t.cooldown <= 0) {
          const targets = this.pickTargets(t, s.range, s.multishot || 1);
          const target = targets[0];
          if (target && t.type === 'ballista') {
            const want = Math.atan2(target.y - (t.y - 0.35), target.x - t.x);
            let diff = want - t.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            t.angle += Math.max(-dt * 6, Math.min(dt * 6, diff));
          }
          if (t.cooldown <= 0) {
            if (target) {
              this.fire(t, s, targets);
              t.cooldown += 1 / s.rate;
              if (t.cooldown < 0) t.cooldown = 1 / s.rate;
            } else {
              t.cooldown = 0;
            }
          }
        }
      }
    }

    updateProjectiles(dt) {
      const out = [];
      for (const p of this.projectiles) {
        if (p.kind === 'arrow' || p.kind === 'orb' || p.kind === 'ice') {
          if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.y - 0.25; }
          const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
          const step = p.speed * dt;
          if (d <= step + 0.05) {
            if (p.target.alive) this.hitHoming(p);
            else this.emit('miss', { kind: p.kind, x: p.tx, y: p.ty });
            continue;
          }
          p.vx = dx / d; p.vy = dy / d;
          p.x += p.vx * step; p.y += p.vy * step;
          out.push(p);
        } else if (p.lob) {
          p.t += dt;
          const k = Math.min(1, p.t / p.T);
          p.x = p.sx + (p.tx - p.sx) * k;
          p.y = p.sy + (p.ty - p.sy) * k;
          p.h = Math.sin(Math.PI * k) * (p.kind === 'flask' ? 0.7 + p.T * 0.4 : 1.1 + p.T * 0.6) + (1 - k) * 0.4;
          if (k >= 1) { this.land(p); continue; }
          out.push(p);
        } else if (p.kind === 'bolt') {
          const step = p.speed * dt;
          p.x += p.vx * step; p.y += p.vy * step; p.travelled += step;
          for (const e of this.enemies) {
            if (!e.alive || p.hit.has(e.id)) continue;
            if ((e.x - p.x) ** 2 + (e.y - 0.2 - p.y) ** 2 < 0.16) {
              p.hit.add(e.id);
              this.damage(e, p.dmg * Math.pow(0.85, p.hit.size - 1), p.damage, p.pen, p.bossMult);
              this.emit('hit', { kind: 'bolt', x: e.x, y: e.y - 0.2 });
              if (p.hit.size >= p.pierce) break;
            }
          }
          if (p.hit.size < p.pierce && p.travelled < p.maxDist) out.push(p);
        }
      }
      this.projectiles = out;
    }

    land(p) {
      const r2 = p.splash * p.splash;
      for (const e of this.enemies) {
        if (!e.alive || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
        this.damage(e, p.dmg, p.damage, p.pen);
        if (p.burn) this.burn(e, p.burn, p.burnDur);
        if (p.stun) this.stun(e, p.stun);
        if (p.corrode) this.corrode(e, p.corrode, 4);
      }
      if (p.fireField) this.hazards.push({ x: p.x, y: p.y, r: p.splash * 0.8, dps: p.burn * 0.6, until: this.time + p.fireField, t0: this.time });
      this.emit('splash', { x: p.x, y: p.y, radius: p.splash, kind: p.kind, big: p.big });
    }

    hitHoming(p) {
      const e = p.target;
      let dmg = p.dmg;
      if (p.crit && this.rand() < p.crit) {
        dmg *= 2.5;
        this.emit('crit', { x: e.x, y: e.y });
      }
      this.damage(e, dmg, p.damage, p.pen);
      if (p.execute && e.alive && !e.def.boss && e.hp < e.maxHp * p.execute) {
        this.emit('execute', { x: e.x, y: e.y });
        this.kill(e);
      }
      this.emit('hit', { kind: p.kind, x: p.tx, y: p.ty });
      if (p.kind === 'arrow') return;
      this.applySlow(e, p.slow, p.slowDur);
      if (p.freeze && this.rand() < p.freeze) this.stun(e, p.freezeDur, true);
      if (p.chain) {
        const hit = [e];
        let from = e;
        for (let c = 0; c < p.chain; c++) {
          let next = null, best = 2.2 * 2.2;
          for (const o of this.enemies) {
            if (!o.alive || hit.includes(o)) continue;
            const d2 = dist2(o, from);
            if (d2 < best) { best = d2; next = o; }
          }
          if (!next) break;
          this.emit('chain', { x1: from.x, y1: from.y - 0.25, x2: next.x, y2: next.y - 0.25 });
          this.damage(next, p.dmg * 0.6, 'magic', 0);
          this.applySlow(next, p.slow, p.slowDur);
          hit.push(next);
          from = next;
        }
      }
    }

    updateHazards(dt) {
      for (const s of this.strikes) {
        s.t -= dt;
        if (s.t > 0) continue;
        for (const e of this.enemies) {
          if (!e.alive || (e.x - s.x) ** 2 + (e.y - s.y) ** 2 > s.r * s.r) continue;
          this.damage(e, s.dmg, 'magic', 0);
          this.burn(e, s.burn, 3);
        }
        this.emit('meteor', { x: s.x, y: s.y, radius: s.r });
      }
      this.strikes = this.strikes.filter((s) => s.t > 0);
      for (const h of this.hazards) {
        for (const e of this.enemies) {
          if (e.alive && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= h.r * h.r) this.burn(e, h.dps, 0.6);
        }
      }
      this.hazards = this.hazards.filter((h) => h.until > this.time);
    }

    result() {
      const frac = this.lives / this.maxLives;
      const won = this.state === 'won';
      return { won, stars: !won ? 0 : frac >= 1 ? 3 : frac >= 0.5 ? 2 : 1, wave: this.wave };
    }
  }

  TD.Game = Game;
})();
