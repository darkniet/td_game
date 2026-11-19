// Game rules and state. No DOM access here, so it also runs headless under Node.
'use strict';
(function () {
  const TD = window.TD;
  const N = 1, E = 2, S = 4, W = 8;
  const FREE = 0, PATH = 1, BLOCKED = 2;
  TD.CELL = { FREE, PATH, BLOCKED };

  // Small seeded PRNG whose state can be saved and restored.
  function mulberry32(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.state = () => a;
    next.setState = (v) => { a = v | 0; };
    return next;
  }
  TD.rng = mulberry32;

  const dirBit = (dx, dy) => (dx > 0 ? E : dx < 0 ? W : dy > 0 ? S : N);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const TURRET_SHOT = { projectile: 'arrow', damage: 'physical' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makePath(pts, index) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ ax: a.x, ay: a.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, len, start: total });
      total += len;
    }
    return { segs, length: total, index };
  }

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
      paths.push(makePath(pts, paths.length));
    }

    // Castle sits just beyond the last road cell (maps always end heading north).
    const castle = { x: last[0] + 0.5, y: last[1] };
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 1; dy <= 2; dy++) {
        const cx = last[0] + dx, cy = last[1] - dy;
        if (inside(cx, cy)) grid[idx(cx, cy)] = BLOCKED;
      }
    }

    // Flyers ignore the road and head straight from each entrance to the keep, but only from
    // entrances far enough away to give towers a fair shot at them.
    let lanes = paths.map((p) => [{ x: p.segs[0].ax, y: p.segs[0].ay }, { x: castle.x, y: castle.y + 0.1 }]);
    const far = lanes.filter(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) >= 10);
    if (far.length) lanes = far;
    const flights = lanes.map((pts, i) => makePath(pts, i));

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
      cols, rows, grid, road, groundVariant, paths, flights, cells: [...allCells.values()],
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
      this.perks = opts.perks || {};
      this.factionId = TD.FACTIONS[opts.faction] ? opts.faction : 'kingdom';
      this.faction = TD.FACTIONS[this.factionId];
      this.heroId = TD.HEROES[opts.hero] ? opts.hero : this.faction.hero;
      this.heroDef = TD.HEROES[this.heroId];
      this.gearId = TD.GEAR[opts.gear] ? opts.gear : null;
      this.gear = this.gearId ? TD.GEAR[this.gearId] : {};
      const pk = (id) => this.perks[id] || 0;
      this.mods = {
        gold: 40 * pk('chest'), lives: 3 * pk('walls'), cost: 1 - 0.04 * pk('masons'), dmg: 1 + 0.05 * pk('steel'),
        bounty: (1 + 0.08 * pk('bounty')) * (this.faction.bounty || 1), soldierHp: 1 + 0.15 * pk('drill'),
        cooldown: (1 - 0.1 * pk('rites')) * (this.faction.cooldown || 1), power: (1 + 0.15 * pk('lore')) * (this.faction.power || 1),
        range: 1 + 0.04 * pk('fletching'), heroXp: 1 + 0.2 * pk('heroism'), heroHp: 1 + 0.1 * pk('heroism'),
        trapCost: (1 - 0.1 * pk('trapmaster')) * (this.faction.trapCost || 1), trapPower: 1 + 0.15 * pk('trapmaster'),
        tithe: 1 + 0.1 * pk('tithe'), gate: 0.1 * pk('gate'), heroSpeed: 1 + 0.1 * pk('boots'), respawn: 1 - 0.15 * pk('boots'),
      };
      this.statCache = new Map();
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
      this.traps = [];
      this.projectiles = [];
      this.hazards = [];
      this.strikes = [];
      this.shells = [];
      this.spawners = [];
      this.pending = {};
      this.countdown = null;
      this.events = [];
      this.state = 'playing';
      this.nextId = 1;
      this.spawnCount = 0;
      this.hornUntil = 0;
      this.castCount = 0;
      this.seed = opts.seed != null ? opts.seed : map.seed * 7919 + 1;
      this.rand = mulberry32(this.seed);
      this.waveRand = mulberry32(this.seed ^ 0x5bd1e995);
      this.waveCache = {};
      this.abilities = {};
      for (const id of TD.ABILITY_ORDER) this.abilities[id] = { cd: 0 };
      this.abilitySrc = { statKey: 'abilities' };
      this.seen = new Set();
      this.stats = { kills: 0, leaked: 0, built: 0, early: 0, types: {} };
      this.damageBy = {};
      this.hero = this.makeHero();
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

    waveRunning() { return this.spawners.length > 0 || this.enemies.length > 0; }

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
        this.stats.early++;
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
        t.recent = 0;
        const st = this.towerStats(t);
        if (!st.income || this.sandbox) continue;
        let income = Math.round(st.income * this.mods.tithe);
        if (st.interest) income += Math.min(st.interestCap, Math.floor(this.gold * st.interest));
        this.gold += income;
        this.emit('income', { x: t.x, y: t.y, gold: income });
        if (st.lifeEvery && (t.fed = (t.fed || 0) + 1) >= st.lifeEvery) {
          t.fed = 0;
          if (this.lives < this.maxLives) {
            this.lives++;
            this.emit('lifeRestored', { x: t.x, y: t.y });
          }
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
      let path;
      if (from) path = from.path;
      else {
        const routes = def.fly ? this.level.flights : this.level.paths;
        path = routes[this.spawnCount++ % routes.length];
      }
      const spread = def.fly ? (def.boss ? 0.2 : 0.7) : def.boss ? 0.1 : 0.3;
      const e = {
        id: this.nextId++, type, def, wave, hp, maxHp: hp, path,
        dist: from ? Math.max(0, from.dist - 0.15 - r() * 0.4) : 0, x: 0, y: 0, dirX: 1, dirY: 0,
        speed, armor, mres, scale, regen, elite,
        atk: (def.atk || 4) * Math.sqrt(TD.waveHpScale(wave)) * (elite === 'giant' ? 1.6 : 1),
        ox: (r() - 0.5) * spread, oy: (r() - 0.5) * spread * 0.87,
        slow: 0, slowUntil: 0, stunUntil: 0, frozen: false, burnDps: 0, burnUntil: 0, burnSrc: null,
        corrode: 0, corrodeUntil: 0, flash: 0, alive: true, phase: r() * 10, atkCd: 0.5,
        blockedBy: null, held: false, heldFor: 0, freeUntil: 0, hurtAt: -9,
        healT: def.heal ? def.heal.interval * (0.3 + r() * 0.7) : 0,
        summonT: def.summon ? def.summon.interval * (0.5 + r() * 0.5) : 0,
        abilityT: def.ability ? def.ability.interval * 0.6 : 0, haste: 0, hasteUntil: 0,
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
      if (e.hasteUntil > this.time) s *= 1 + e.haste;
      return s;
    }

    // ---- Combat ------------------------------------------------------------

    armorOf(e) { return Math.max(0, e.armor - (e.corrodeUntil > this.time ? e.corrode : 0)); }

    canHit(t, e) { return !(e.def.fly && t.def.ground); }

    // Damage and kills are credited to a source (tower, hero, trap or ability) for battle stats.
    credit(src, dmg, kills) {
      if (!src) return;
      const key = src.statKey || 'other';
      const agg = this.damageBy[key] || (this.damageBy[key] = { dmg: 0, kills: 0 });
      agg.dmg += dmg;
      agg.kills += kills || 0;
      if (src.track) {
        src.dmgDealt += dmg;
        src.kills += kills || 0;
      }
    }

    damage(e, amount, kind, pen, bossMult, src) {
      if (!e.alive) return 0;
      if (bossMult && (e.def.boss || e.elite)) amount *= bossMult;
      if (kind === 'physical' && e.frozen && e.stunUntil > this.time && amount >= 15) {
        amount *= 1.5;
        e.stunUntil = this.time;
        e.frozen = false;
        this.emit('shatter', { x: e.x, y: this.aimY(e) });
      }
      const mult = kind === 'magic' ? 1 - e.mres : kind === 'true' ? 1 : 1 - this.armorOf(e) * (1 - (pen || 0));
      const dealt = amount * mult * (1 + (e.curse || 0));
      this.credit(src, Math.min(dealt, Math.max(0, e.hp)));
      e.hp -= dealt;
      e.flash = 0.09;
      e.hurtAt = this.time;
      if (e.hp <= 0) this.kill(e, src);
      return dealt;
    }

    // Continuous damage (beams, brambles) that doesn't flash the target every frame.
    drain(e, amount, kind, src) {
      if (!e.alive) return;
      const mult = kind === 'magic' ? 1 - e.mres : 1 - this.armorOf(e);
      const dealt = amount * mult * (1 + (e.curse || 0));
      this.credit(src, Math.min(dealt, Math.max(0, e.hp)));
      e.hp -= dealt;
      e.hurtAt = this.time;
      if (e.hp <= 0) this.kill(e, src);
    }

    kill(e, src) {
      e.alive = false;
      if (e.blockedBy && e.blockedBy.target === e) e.blockedBy.target = null;
      const late = this.endless ? TD.endlessBounty(e.wave) : 1;
      const gold = Math.max(1, Math.round(e.def.gold * this.mods.bounty * (e.elite ? 2 : 1) * late));
      this.gold += gold;
      this.stats.kills++;
      this.pending[e.wave]--;
      this.credit(src, 0, 1);
      const h = this.hero;
      if (h.alive && (src === h || dist2(h, e) < 9)) this.gainXp(e.def.gold * (e.elite ? 2 : 1) * this.mods.heroXp);
      this.emit('kill', {
        x: e.x, y: e.y, gold, enemy: e.type, boss: !!e.def.boss, elite: e.elite, fly: !!e.def.fly,
        source: src ? src.statKey : null, cast: src ? src.cast : null, scale: e.scale, flip: e.dirX < -0.1,
      });
      // A Lich raises ground foes that fall near him. The risen can't be raised again.
      if (!e.def.minion && !e.def.boss && !e.def.fly) {
        const lich = this.enemies.find((o) => o.alive && o.def.raise && dist2(o, e) <= o.def.raise.radius ** 2);
        if (lich) {
          this.spawn(lich.def.raise.type, e.wave, e);
          this.pending[e.wave]++;
          this.emit('raise', { x: e.x, y: e.y, fromX: lich.x, fromY: lich.y });
        }
      }
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

    burn(e, dps, dur, src) {
      if (!e.alive) return;
      if (e.burnUntil <= this.time || dps >= e.burnDps) {
        e.burnDps = dps;
        e.burnSrc = src || null;
      }
      e.burnUntil = Math.max(e.burnUntil, this.time + dur);
    }

    corrode(e, amount, dur) {
      if (!e.alive) return;
      e.corrode = Math.max(e.corrodeUntil > this.time ? e.corrode : 0, amount);
      e.corrodeUntil = this.time + dur;
    }

    // ---- Towers ------------------------------------------------------------

    costOf(base) { return this.sandbox ? 0 : Math.round(base * this.mods.cost); }

    // Faction price modifier for a tower type (all towers and type-specific multiply).
    factionCost(type) {
      const fm = this.faction.mods || {};
      return ((fm.all && fm.all.cost) || 1) * ((fm[type] && fm[type].cost) || 1);
    }

    towerCost(type) { return this.costOf(TD.TOWERS[type].cost * this.factionCost(type)); }

    // Towers this faction can build: the shared roster plus its own faction tower.
    towerTypes() { return TD.TOWER_ORDER.concat(this.faction.unique); }

    branchDef(t) { return t.branch ? t.def.branches[t.branch] : null; }

    // Stats of a tower level after faction and perk modifiers (cached, never mutated).
    levelStats(type, level, branch, blevel, vet) {
      const key = type + '|' + level + '|' + (branch || '') + '|' + (blevel || 0) + '|' + (vet || 0);
      let s = this.statCache.get(key);
      if (!s) {
        const def = TD.TOWERS[type];
        s = Object.assign({}, branch ? def.branches[branch].levels[blevel || 0] : def.levels[level]);
        const fm = this.faction.mods || {};
        const m = Object.assign({}, fm.all, fm[type]);
        for (const k of ['dmg', 'dps', 'rate', 'hp']) if (s[k] != null && m[k]) s[k] *= m[k];
        if (s.range != null) s.range *= (m.range || 1) * this.mods.range;
        if (s.armor != null && m.armor) s.armor = Math.min(0.85, s.armor + m.armor);
        if (s.slow != null && m.slow) s.slow = Math.min(0.85, s.slow + m.slow);
        if (vet) {
          const k = Math.pow(TD.VETERAN.mult, vet);
          for (const stat of ['dmg', 'dps', 'burn', 'hp']) if (s[stat] != null) s[stat] *= k;
        }
        this.statCache.set(key, s);
      }
      return s;
    }

    towerStats(t) { return this.levelStats(t.type, t.level, t.branch, t.blevel, t.vet); }

    // Range including an Oracle's blessing.
    rangeOf(t) { return (this.towerStats(t).range || 0) * (1 + (t.reach || 0)); }

    // 0-2 are the base levels, 3-4 the branch ranks.
    tier(t) { return t.branch ? 3 + t.blevel : t.level; }

    towerName(t) { return t.branch ? t.def.branches[t.branch].name : t.def.name; }

    projectileOf(t) { const b = this.branchDef(t); return (b && b.projectile) || t.def.projectile; }

    canBranch(t) { return !t.branch && t.level === t.def.levels.length - 1 && !!t.def.branches; }

    upgradeCost(t) {
      const fc = this.factionCost(t.type);
      if (!t.branch && t.level < t.def.levels.length - 1) return this.costOf(t.def.levels[t.level + 1].cost * fc);
      const b = this.branchDef(t);
      if (b && t.blevel < b.levels.length - 1) return this.costOf(b.levels[t.blevel + 1].cost * fc);
      if (this.canVeteran(t)) return this.veteranCost(t);
      return null;
    }

    // Veteran ranks: endless training for combat towers that have nothing left to upgrade.
    canVeteran(t) {
      if (!this.endless || t.def.kind === 'economy' || t.def.kind === 'support') return false;
      const b = this.branchDef(t);
      return b ? t.blevel === b.levels.length - 1 : !t.def.branches && t.level === t.def.levels.length - 1;
    }

    veteranCost(t) {
      const levels = t.branch ? this.branchDef(t).levels : t.def.levels;
      const base = levels[levels.length - 1].cost * TD.VETERAN.cost * Math.pow(TD.VETERAN.growth, t.vet);
      return this.costOf(base * this.factionCost(t.type));
    }

    branchCost(t, key) { return this.costOf(t.def.branches[key].levels[0].cost * this.factionCost(t.type)); }

    // Gold spent since the last wave began is refunded in full while no wave is running,
    // or for a few seconds after spending it; everything else returns 70%.
    fullRefund(t) {
      return !this.sandbox && t.recent > 0 && (!this.waveRunning() || this.time - t.recentAt <= 5);
    }

    sellValue(t) {
      if (this.sandbox) return 0;
      const older = t.invested - t.recent;
      return Math.floor(older * 0.7) + (this.fullRefund(t) ? t.recent : Math.floor(t.recent * 0.7));
    }

    invest(t, cost) {
      t.invested += cost;
      t.recent += cost;
      t.recentAt = this.time;
    }

    makeTower(type, cx, cy) {
      return {
        id: this.nextId++, type, def: TD.TOWERS[type], level: 0, branch: null, blevel: 0, cx, cy, x: cx + 0.5, y: cy + 0.5,
        cooldown: 0.3, mode: 'first', invested: 0, recent: 0, recentAt: this.time, builtAt: this.time, vet: 0,
        angle: -Math.PI / 2, aimX: cx + 0.5, aimY: cy, fireT: 9, buff: 0, haste: 0, squad: [], rally: null,
        statKey: type, track: true, dmgDealt: 0, kills: 0,
      };
    }

    build(type, cx, cy) {
      const def = TD.TOWERS[type];
      if (!def || !this.canPlace(cx, cy) || this.state !== 'playing') return null;
      if (def.faction && def.faction !== this.factionId) return null;
      const cost = this.towerCost(type);
      if (!this.spend(cost)) return null;
      const t = this.makeTower(type, cx, cy);
      this.invest(t, cost);
      this.towers.push(t);
      this.stats.built++;
      this.stats.types[type] = true;
      if (def.kind === 'barracks') {
        const p = TD.nearestRoad(this.level, t.x, t.y, this.towerStats(t).range);
        t.rally = p || { x: t.x, y: t.y + 0.6 };
        this.syncSquad(t);
      }
      this.emit('build', { x: t.x, y: t.y, tower: type, id: t.id, count: this.towers.length });
      return t;
    }

    upgrade(t) {
      const cost = this.upgradeCost(t);
      if (cost == null || this.state !== 'playing' || !this.spend(cost)) return false;
      const vet = this.canVeteran(t);
      this.invest(t, cost);
      if (vet) t.vet++;
      else if (t.branch) t.blevel++;
      else t.level++;
      if (t.def.kind === 'barracks') this.syncSquad(t);
      this.emit('upgrade', { x: t.x, y: t.y, tower: t.type, id: t.id, level: this.tier(t), branch: t.branch, vet: t.vet });
      return true;
    }

    chooseBranch(t, key) {
      if (!this.canBranch(t) || !t.def.branches[key] || this.state !== 'playing') return false;
      const cost = this.branchCost(t, key);
      if (!this.spend(cost)) return false;
      this.invest(t, cost);
      t.branch = key;
      t.blevel = 0;
      if (t.def.kind === 'barracks') this.syncSquad(t);
      this.emit('upgrade', { x: t.x, y: t.y, tower: t.type, id: t.id, level: this.tier(t), branch: key });
      return true;
    }

    sell(t) {
      const i = this.towers.indexOf(t);
      if (i < 0 || this.state !== 'playing') return false;
      const value = this.sellValue(t);
      const full = this.fullRefund(t);
      this.towers.splice(i, 1);
      for (const s of t.squad) this.removeSoldier(s);
      this.gold += value;
      this.emit('sell', { x: t.x, y: t.y, gold: value, full, tower: t });
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

    // ---- Traps --------------------------------------------------------------

    trapAt(cx, cy) { return this.traps.find((tr) => tr.cx === cx && tr.cy === cy) || null; }

    canPlaceTrap(cx, cy) { return this.cellAt(cx, cy) === PATH && !this.trapAt(cx, cy); }

    trapCost(type) { return this.costOf(TD.TRAPS[type].cost * this.mods.trapCost); }

    placeTrap(type, cx, cy) {
      const def = TD.TRAPS[type];
      if (!def || !this.canPlaceTrap(cx, cy) || this.state !== 'playing') return null;
      if (!this.spend(this.trapCost(type))) return null;
      // Traps keep up with the horde: stronger the later they are laid.
      const k = Math.sqrt(this.hpScale(Math.max(1, this.wave)) / this.map.hpMul) * this.mods.trapPower;
      const hp = def.hp ? Math.round(def.hp * k * k) : 0;
      const tr = {
        id: this.nextId++, type, def, cx, cy, x: cx + 0.5, y: cy + 0.5, statKey: 'traps',
        uses: def.uses || 1, until: def.duration ? this.time + def.duration : Infinity,
        dmg: (def.dmg || 0) * k, hp, maxHp: hp, hit: new Set(), firedT: 9,
      };
      this.traps.push(tr);
      this.emit('trap', { x: tr.x, y: tr.y, trap: type });
      return tr;
    }

    barricadeNear(e) {
      if (e.def.fly) return null;
      for (const tr of this.traps) {
        if (tr.type === 'barricade' && tr.hp > 0 && (e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 < 0.25) return tr;
      }
      return null;
    }

    updateTraps(dt) {
      const near = (e, tr, r) => e.alive && !e.def.fly && (e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 < r * r;
      for (const tr of this.traps) {
        tr.firedT += dt;
        if (tr.type === 'spikes') {
          for (const e of this.enemies) {
            if (tr.uses <= 0 || tr.hit.has(e.id) || !near(e, tr, 0.42)) continue;
            tr.hit.add(e.id);
            tr.uses--;
            tr.firedT = 0;
            this.damage(e, tr.dmg, 'physical', 0.5, 0, tr);
            this.emit('spike', { x: tr.x, y: tr.y });
          }
        } else if (tr.type === 'tar') {
          for (const e of this.enemies) {
            if (!near(e, tr, 0.5)) continue;
            this.applySlow(e, tr.def.slow, 0.3);
            if (e.burnUntil > this.time) {
              const k = Math.sqrt(this.hpScale(Math.max(1, this.wave)) / this.map.hpMul);
              this.hazards.push({ x: tr.x, y: tr.y, r: 0.75, dps: (30 + 4 * this.wave) * k * this.mods.trapPower, until: this.time + 6, t0: this.time, src: tr });
              tr.uses = 0;
              this.emit('tarIgnite', { x: tr.x, y: tr.y });
              break;
            }
          }
        } else if (tr.type === 'keg') {
          if (this.enemies.some((e) => near(e, tr, 0.45))) {
            for (const e of this.enemies) if (near(e, tr, tr.def.radius)) this.damage(e, tr.dmg, 'physical', 0.5, 0, tr);
            tr.uses = 0;
            this.emit('keg', { x: tr.x, y: tr.y, radius: tr.def.radius });
          }
        }
      }
      this.traps = this.traps.filter((tr) => tr.uses > 0 && tr.until > this.time && (tr.type !== 'barricade' || tr.hp > 0));
    }

    // ---- Soldiers & hero ---------------------------------------------------------

    soldierSprite(t) {
      const tint = this.faction.tint;
      if (t.branch === 'paladin') return tint + '_king';
      if (t.branch === 'berserker') return tint + '_peasant';
      return tint + (t.level >= 2 ? '_knight' : '_soldier');
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
        phase: this.rand() * 10, flash: 0, lunge: 0, moving: false, dirX: 1, src: tower,
      };
    }

    makeHero() {
      const H = this.heroDef, c = this.level.castle;
      const h = this.makeSoldier(c.x, c.y + 0.4, null);
      const post = TD.nearestRoad(this.level, c.x, c.y + 1.6, 3);
      const skillCd = {};
      for (const id in H.skills) skillCd[id] = H.skills[id].cooldown * 0.3;
      Object.assign(h, {
        hero: true, level: 1, xp: 0, sprite: H.sprite, scale: H.scale, armor: H.armor, rate: H.rate, regen: H.regen,
        hx: post ? post.x : c.x, hy: post ? post.y : c.y + 1, ordered: false, shieldUntil: 0,
        skillCd, statKey: 'hero', track: true, dmgDealt: 0, kills: 0,
      });
      h.src = h;
      this.applyHeroLevel(h);
      h.hp = h.maxHp;
      this.soldiers.push(h);
      return h;
    }

    applyHeroLevel(h) {
      const H = this.heroDef;
      h.maxHp = Math.round((H.hp + H.hpPerLevel * (h.level - 1)) * this.mods.soldierHp * this.mods.heroHp);
      h.dmg = H.dmg + H.dmgPerLevel * (h.level - 1);
    }

    heroNextXp() { return this.hero.level < TD.HERO_XP.length ? TD.HERO_XP[this.hero.level] : null; }

    gainXp(n) {
      const h = this.hero, XP = TD.HERO_XP;
      if (h.level >= XP.length) return;
      h.xp += n;
      while (h.level < XP.length && h.xp >= XP[h.level]) {
        h.level++;
        this.applyHeroLevel(h);
        h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.3);
        this.emit('heroLevel', { x: h.x, y: h.y, level: h.level });
      }
    }

    moveHero(x, y) {
      const h = this.hero;
      if (this.state !== 'playing') return false;
      h.hx = clamp(x, 0.3, this.level.cols - 0.3);
      h.hy = clamp(y, 0.4, this.level.rows - 0.15);
      h.ordered = true;
      this.release(h);
      this.emit('heroMove', { x: h.hx, y: h.hy });
      return true;
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
      if (s.shieldUntil > this.time) dmg *= 1 - this.heroDef.skills.ironskin.reduce;
      s.hp -= dmg * (1 - s.armor);
      s.flash = 0.09;
      if (s.hp > 0) return;
      this.release(s);
      s.alive = false;
      this.emit('soldierDown', { x: s.x, y: s.y, hero: !!s.hero });
      if (s.tower) s.respawn = this.towerStats(s.tower).respawn;
      else if (s.hero) s.respawn = (this.heroDef.respawn - 0.5 * (s.level - 1)) * this.mods.respawn;
      else this.removeSoldier(s);
    }

    respawnSoldier(s) {
      const c = this.level.castle;
      s.alive = true;
      s.hp = s.maxHp;
      s.x = s.tower ? s.tower.x : c.x;
      s.y = s.tower ? s.tower.y + 0.3 : c.y + 0.4;
      this.emit('soldierUp', { x: s.x, y: s.y, hero: !!s.hero });
    }

    // First foe (closest to the gate) within range of a point, flyers included.
    heroTarget(h, range) {
      let best = null, bp = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || dist2(e, h) > range * range) continue;
        const p = this.progress(e);
        if (p < bp) { bp = p; best = e; }
      }
      return best;
    }

    heroShoot(h, e, dmg, weapon, skill) {
      const r = weapon || this.heroDef.ranged;
      this.projectiles.push({
        kind: r.projectile, x: h.x, y: h.y - 0.45, target: e, tx: e.x, ty: this.aimY(e),
        speed: r.projectile === 'arrow' ? 13 : 8, dmg, damage: r.damage, pen: 0, chain: 0, src: h.src || h, vx: 0, vy: -1, skill: !!skill,
      });
      h.dirX = e.x >= h.x ? 1 : -1;
      h.aim = Math.atan2(this.aimY(e) - (h.y - 0.27), e.x - h.x);
      h.lunge = 0.12;
      this.emit('fire', { tower: 'hero', kind: r.projectile, x: h.x, y: h.y - 0.45 });
    }

    // Each hero has two skills; they fire on their own whenever their conditions are met.
    heroSkills(h, dt) {
      const H = this.heroDef;
      for (const id in H.skills) h.skillCd[id] -= dt;
      if (h.ordered) return;
      const power = this.gear.power || 1;
      const dmg = h.dmg * this.mods.dmg * power;
      const ready = (id) => h.level >= H.skills[id].level && h.skillCd[id] <= 0;
      const around = (r, air) => this.enemies.filter((e) => e.alive && (air || !e.def.fly) && dist2(e, h) < r * r);
      const used = (id, data) => {
        h.skillCd[id] = H.skills[id].cooldown * (this.gear.cooldown || 1);
        this.emit('heroSkill', Object.assign({ skill: id, x: h.x, y: h.y }, data));
      };
      for (const id in H.skills) {
        if (!ready(id)) continue;
        const sk = H.skills[id];
        if (id === 'whirlwind' || id === 'slam') {
          const near = around(sk.radius, false);
          if (near.length >= 2 || (near.length && near[0].def.boss)) {
            for (const e of near) {
              this.damage(e, dmg * sk.mult, 'physical', 0.2, 0, h);
              if (sk.stun) this.stun(e, sk.stun);
              this.skillHit(e, dmg * sk.mult);
            }
            used(id, { radius: sk.radius });
          }
        } else if (id === 'rally') {
          if (h.hp < h.maxHp * 0.45) {
            for (const s of this.soldiers) {
              if (s.alive && dist2(s, h) < sk.radius * sk.radius) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * sk.heal * power);
            }
            used(id, { radius: sk.radius });
          }
        } else if (id === 'ironskin') {
          if (h.hp < h.maxHp * 0.6 && h.target) {
            h.shieldUntil = this.time + sk.duration;
            used(id, {});
          }
        } else if (id === 'volley') {
          const targets = this.enemies.filter((e) => e.alive && dist2(e, h) < H.ranged.range ** 2)
            .sort((a, b) => this.progress(a) - this.progress(b)).slice(0, sk.arrows);
          if (targets.length >= 2) {
            for (const e of targets) this.heroShoot(h, e, dmg * sk.mult, null, true);
            used(id, {});
          }
        } else if (id === 'snare') {
          const target = this.enemies.filter((e) => e.alive && dist2(e, h) < H.ranged.range ** 2).sort((a, b) => b.hp - a.hp)[0];
          if (target) {
            this.stun(target, sk.stun);
            this.damage(target, dmg * sk.mult, 'physical', 0.3, 0, h);
            this.skillHit(target, dmg * sk.mult);
            used(id, { tx: target.x, ty: target.y });
          }
        } else if (id === 'nova') {
          const near = around(sk.radius, true);
          if (near.length >= 2 || (near.length && near[0].def.boss)) {
            for (const e of near) {
              this.damage(e, dmg * sk.mult, 'magic', 0, 0, h);
              this.skillHit(e, dmg * sk.mult);
            }
            used(id, { radius: sk.radius });
          }
        } else if (id === 'storm') {
          const first = this.heroTarget(h, H.ranged.range);
          if (first) {
            this.lightning(h, { chain: sk.chain, skill: true }, first, { x: h.x, y: h.y - 0.5 }, dmg * sk.mult);
            used(id, {});
          }
        } else if (id === 'mend') {
          const near = this.soldiers.filter((s) => s.alive && !s.turret && dist2(s, h) < sk.radius * sk.radius);
          if (near.some((s) => s.hp < s.maxHp * 0.7)) {
            for (const s of near) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * sk.heal * power);
            used(id, { radius: sk.radius });
          }
        } else if (id === 'sanctify') {
          // Cleanses whenever something nearby is hexed, buried or stunned, and blesses during any big fight.
          const r2 = sk.radius * sk.radius;
          const towers = this.towers.filter((t) => dist2(t, h) < r2);
          const silenced = towers.filter((t) => t.disabledUntil > this.time);
          const stunned = this.soldiers.filter((s) => s.alive && s.stunUntil > this.time && dist2(s, h) < r2);
          if (towers.length && (silenced.length || stunned.length || around(sk.radius, true).length >= 3)) {
            for (const t of silenced) t.disabledUntil = 0;
            for (const s of stunned) s.stunUntil = 0;
            for (const t of towers) { t.blessUntil = this.time + sk.duration; t.bless = sk.buff; }
            used(id, { radius: sk.radius, targets: towers.map((t) => ({ x: t.x, y: t.y })) });
          }
        } else if (id === 'turret') {
          if (around(sk.range, true).length) {
            this.deployTurret(h, sk);
            used(id, {});
          }
        } else if (id === 'charge') {
          // Aim at the ground foe with the most others packed around it.
          const r2 = sk.radius * sk.radius;
          const foes = around(sk.range, false);
          let best = null, crowd = 0;
          for (const e of foes) {
            const n = foes.filter((o) => dist2(o, e) < r2).length;
            if (n > crowd) { crowd = n; best = e; }
          }
          if (best && (crowd >= 3 || best.def.boss)) {
            for (const o of this.enemies) {
              if (!o.alive || o.def.fly || dist2(o, best) >= r2) continue;
              this.damage(o, dmg * sk.mult, 'physical', 0.4, 0, h);
              this.stun(o, sk.stun);
              this.skillHit(o, dmg * sk.mult);
            }
            used(id, { tx: best.x, ty: best.y, radius: sk.radius });
          }
        }
      }
    }

    // Gear effects that ride on every hit from a hero skill.
    skillHit(e, amount) {
      const g = this.gear, h = this.hero;
      if (g.drain && h.alive) h.hp = Math.min(h.maxHp, h.hp + amount * g.drain);
      if (!e.alive) return;
      if (g.slow) this.applySlow(e, g.slow, g.slowDur);
      if (g.stun) this.stun(e, g.stun);
      if (g.burn) this.burn(e, amount * g.burn, 3, h);
    }

    // The engineer's turrets are stationary soldiers that shoot and never block the road.
    deployTurret(h, sk) {
      const built = this.soldiers.filter((s) => s.turret && s.alive);
      if (built.length >= sk.max) this.removeSoldier(built[0]);
      const t = this.makeSoldier(h.x - (h.dirX < 0 ? -0.45 : 0.45), h.y + 0.15, null);
      Object.assign(t, {
        turret: true, until: sk.duration, range: sk.range, rate: sk.rate, dmg: h.dmg * sk.mult * (this.gear.power || 1), armor: 0.3,
        maxHp: Math.round(h.maxHp * 0.5), sprite: null, scale: 0.6, cd: 0.4, src: h, dirX: h.dirX,
      });
      t.hp = t.maxHp;
      this.soldiers.push(t);
    }

    updateSoldiers(dt) {
      for (const s of this.soldiers.slice()) {
        s.flash = Math.max(0, s.flash - dt);
        s.lunge = Math.max(0, s.lunge - dt);
        if (!s.alive) {
          if ((s.tower || s.hero) && (s.respawn -= dt) <= 0) this.respawnSoldier(s);
          continue;
        }
        if (!s.tower && !s.hero && (s.until -= dt) <= 0) {
          this.emit('soldierDown', { x: s.x, y: s.y, expired: true });
          this.removeSoldier(s);
          continue;
        }
        if (s.stunUntil > this.time) continue;
        if (s.turret) {
          s.cd -= dt;
          const shot = this.heroTarget(s, s.range);
          if (shot && s.cd <= 0) {
            s.cd = 1 / s.rate;
            this.heroShoot(s, shot, s.dmg * this.mods.dmg, TURRET_SHOT);
          }
          continue;
        }
        if (s.hero) this.heroSkills(s, dt);
        const home = { x: s.hx, y: s.hy };
        const ranged = s.hero && this.heroDef.ranged;
        const reach = ranged ? 0.6 : s.hero ? 1.3 : 1.0, leash = ranged ? 1.0 : s.hero ? 2.0 : 1.6;
        if (s.target && (!s.target.alive || dist2(s.target, home) > leash * leash)) this.release(s);
        if (!s.target && !s.ordered) {
          let best = null, bd = reach * reach;
          for (const e of this.enemies) {
            if (!e.alive || e.def.noBlock || e.def.fly || e.freeUntil > this.time || (e.blockedBy && e.blockedBy !== s && e.blockedBy.alive)) continue;
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
          const step = Math.min(d, (s.hero ? this.heroDef.speed * this.mods.heroSpeed : 2.4) * dt);
          s.x += (dx / d) * step;
          s.y += (dy / d) * step;
          if (Math.abs(dx) > 0.02) s.dirX = Math.sign(dx);
        } else if (s.ordered) {
          s.ordered = false;
        }
        if (ranged) {
          s.cd -= dt;
          const shot = s.ordered ? null : s.target || this.heroTarget(s, ranged.range);
          if (shot && s.cd <= 0) {
            s.cd = 1 / s.rate;
            this.heroShoot(s, shot, s.dmg * this.mods.dmg);
          }
          if (!s.target) s.hp = Math.min(s.maxHp, s.hp + s.regen * dt);
        } else if (s.target && Math.hypot(s.target.x - s.x, s.target.y - s.y) < 0.5) {
          const e = s.target;
          s.dirX = e.x >= s.x ? 1 : -1;
          s.cd -= dt;
          if (s.cd <= 0) {
            s.cd = 1 / s.rate;
            s.lunge = 0.15;
            this.damage(e, s.dmg * this.mods.dmg, 'physical', 0, 0, s.src);
            if (s.cleave) {
              for (const o of this.enemies) {
                if (o !== e && o.alive && dist2(o, e) < 0.6 * 0.6) this.damage(o, s.dmg * s.cleave * this.mods.dmg, 'physical', 0, 0, s.src);
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
        const src = { statKey: 'abilities', cast: ++this.castCount };
        for (let k = 0; k < 3; k++) {
          const ang = this.rand() * Math.PI * 2, rr = k === 0 ? 0 : 0.45 + this.rand() * 0.35;
          const delay = 0.55 + k * 0.22;
          this.strikes.push({
            x: x + Math.cos(ang) * rr, y: y + Math.sin(ang) * rr, t: delay, t0: delay,
            dmg: (60 + 10 * w) * power, r: 1.05, burn: (10 + 2 * w) * power, src,
          });
        }
      } else if (id === 'reinforce') {
        const p = TD.nearestRoad(this.level, x, y, 1.2);
        if (!p) return false;
        const count = this.faction.militia || 2;
        for (let k = 0; k < count; k++) {
          const off = (k - (count - 1) / 2) * 0.32;
          const s = this.makeSoldier(p.x + off, p.y - 0.6, null);
          Object.assign(s, {
            hx: p.x + off, hy: p.y, maxHp: Math.round((120 + 16 * w) * this.mods.soldierHp * power),
            dmg: (8 + 1.2 * w) * power, rate: 1, armor: 0.2, until: 18, sprite: this.faction.tint + '_woman', scale: 0.64, src: this.abilitySrc,
          });
          s.hp = s.maxHp;
          this.soldiers.push(s);
        }
        x = p.x; y = p.y;
      } else if (id === 'frost') {
        for (const e of this.enemies) {
          if (!e.alive || (e.x - x) ** 2 + (e.y - y) ** 2 > a.radius * a.radius) continue;
          this.damage(e, (20 + 3 * w) * power, 'magic', 0, 0, this.abilitySrc);
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
      return this.enemies.filter((e) => e.alive && this.canHit(t, e) && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2);
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

    // Visual height of a foe's chest, so shots fly at the body (flyers sit higher).
    aimY(e) { return e.y - (e.def.fly ? 0.6 : 0.25); }

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
            crit: s.crit || 0, execute: s.execute || 0, vx: 0, vy: -1, heavy: !!s.crit, src: t,
          });
        }
      } else if (kind === 'lightning') {
        this.lightning(t, s, target, o, dmg);
      } else if (kind === 'stone' || kind === 'firepot' || kind === 'flask' || kind === 'cannonball') {
        const dist = Math.hypot(target.x - o.x, target.y - o.y);
        const T = kind === 'cannonball' ? 0.25 + dist * 0.06 : (kind === 'flask' ? 0.5 : 0.7) + dist * (kind === 'flask' ? 0.07 : 0.09);
        const p = this.predict(target, T);
        this.projectiles.push({
          kind, lob: true, sx: o.x, sy: o.y, tx: p.x, ty: p.y, x: o.x, y: o.y, h: 0, t: 0, T,
          dmg, damage: dmgType, pen, splash: s.splash, burn: s.burn, burnDur: s.burnDur, fireField: s.fireField,
          stun: s.stun, corrode: s.corrode, cloud: s.cloud, big: t.branch === 'trebuchet', src: t,
        });
        t.aimX = p.x;
        t.aimY = p.y;
      } else if (kind === 'bolt') {
        const speed = t.branch === 'scorpion' ? 17 : 15;
        const dist = Math.hypot(target.x - o.x, target.y - o.y);
        const p = this.predict(target, dist / speed);
        p.y += target.def.fly ? -0.4 : 0;
        const len = Math.hypot(p.x - o.x, p.y - o.y) || 1;
        const vx = (p.x - o.x) / len, vy = (p.y - o.y) / len;
        t.angle = Math.atan2(vy, vx);
        this.projectiles.push({
          kind: 'bolt', x: o.x, y: o.y, vx, vy, speed, travelled: 0, maxDist: s.range + 1.5,
          pierce: s.pierce, hit: new Set(), dmg, damage: dmgType, pen, bossMult: s.bossMult || 0,
          big: t.branch === 'slayer', src: t,
        });
      }
      this.emit('fire', { tower: t.type, branch: t.branch, kind, x: o.x, y: o.y, id: t.id });
    }

    lightning(t, s, first, o, dmg) {
      const pts = [[o.x, o.y]];
      const hit = [];
      let cur = first, power = dmg;
      for (let c = 0; c <= s.chain && cur; c++) {
        hit.push(cur);
        pts.push([cur.x, this.aimY(cur)]);
        this.damage(cur, power, 'magic', 0, 0, t);
        if (s.stunChance && this.rand() < s.stunChance) this.stun(cur, s.stunDur);
        if (s.skill) this.skillHit(cur, power);
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
      this.updateTraps(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateHazards(dt);

      if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);

      for (const w in this.pending) {
        if (this.pending[w] <= 0 && !this.spawners.some((s) => s.wave === +w)) {
          delete this.pending[w];
          const gold = this.sandbox ? 0 : Math.round((20 + 5 * Math.min(+w, 30)) * this.mods.tithe);
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
          const dealt = e.burnDps * dt;
          this.credit(e.burnSrc, Math.min(dealt, Math.max(0, e.hp)));
          e.hp -= dealt;
          if (e.hp <= 0) { this.kill(e, e.burnSrc); continue; }
        }
        if (e.regen && this.time - e.hurtAt > 2.5) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);

        // Held in place while a living soldier stands toe to toe with it.
        const b = e.blockedBy;
        if (b && (!b.alive || b.target !== e)) e.blockedBy = null;
        const byFoe = !!(e.blockedBy && Math.hypot(e.blockedBy.x - e.x, e.blockedBy.y - e.y) < 0.55);
        e.heldFor = byFoe ? e.heldFor + dt : 0;
        if (e.heldFor > 15) {
          // Nobody holds a foe forever: shove past and keep marching.
          this.release(e.blockedBy);
          e.heldFor = 0;
          e.freeUntil = this.time + 4;
        }
        const soldier = byFoe && e.blockedBy ? e.blockedBy : null;
        const wall = soldier ? null : this.barricadeNear(e);
        e.held = !!(soldier || wall);
        if (e.held) {
          if (e.stunUntil <= this.time && (e.atkCd -= dt) <= 0) {
            e.atkCd = 1;
            if (soldier) this.hitSoldier(soldier, e.atk);
            else {
              wall.hp -= e.atk;
              wall.firedT = 0;
              if (wall.hp <= 0) this.emit('barricadeDown', { x: wall.x, y: wall.y });
            }
          }
        } else {
          e.dist += this.speedOf(e) * dt;
        }
        if (e.dist >= e.path.length) {
          e.alive = false;
          if (e.blockedBy) this.release(e.blockedBy);
          this.pending[e.wave]--;
          if (this.mods.gate && this.rand() < this.mods.gate) {
            this.emit('gateHeld', { x: e.x, y: e.y });
            continue;
          }
          this.lives -= e.def.lives;
          this.stats.leaked++;
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
        if (e.def.ability && e.stunUntil <= this.time && (e.abilityT -= dt) <= 0 && e.dist > 1.5) this.bossAbility(e);
        const sm = e.def.summon;
        if (sm && e.stunUntil <= this.time && (e.summonT -= dt) <= 0 && e.dist > 1) {
          e.summonT = sm.interval;
          for (let k = 0; k < sm.count; k++) this.spawn(sm.type, e.wave, e);
          this.pending[e.wave] += sm.count;
          this.emit('summon', { x: e.x, y: e.y });
        }
      }
    }

    // Boss signature moves. Returns quietly (and retries soon) when nothing is in reach.
    bossAbility(e) {
      const a = e.def.ability;
      const hits = [];
      if (a.type === 'warcry') {
        for (const o of this.enemies) {
          if (!o.alive || dist2(o, e) > a.radius * a.radius) continue;
          o.haste = a.haste;
          o.hasteUntil = this.time + a.duration;
          hits.push({ x: o.x, y: o.y });
        }
      } else if (a.type === 'quake') {
        const k = Math.sqrt(TD.waveHpScale(e.wave));
        for (const s of this.soldiers) {
          if (!s.alive || dist2(s, e) > a.radius * a.radius) continue;
          s.stunUntil = this.time + a.stun;
          this.hitSoldier(s, a.dmg * k);
          hits.push({ x: s.x, y: s.y });
        }
      } else if (a.type === 'bombard') {
        // Lob a boulder at the most valuable working tower in range; it lands a moment later.
        const t = this.towers.filter((o) => !(o.disabledUntil > this.time) && dist2(o, e) <= a.range * a.range)
          .sort((p, q) => q.invested - p.invested)[0];
        if (t) {
          this.shells.push({
            x: t.x, y: t.y, fromX: e.x, fromY: e.y, t: 1.4, t0: 1.4, r: a.radius, duration: a.duration,
            dmg: a.dmg * Math.sqrt(TD.waveHpScale(e.wave)),
          });
          hits.push({ x: t.x, y: t.y });
        }
      } else {
        // Hex and Scorch silence the nearest working towers.
        const towers = this.towers.filter((t) => !(t.disabledUntil > this.time) && (t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= a.range * a.range)
          .sort((p, q) => dist2(p, e) - dist2(q, e)).slice(0, a.count);
        for (const t of towers) {
          t.disabledUntil = this.time + a.duration;
          t.disabledBy = a.type;
          hits.push({ x: t.x, y: t.y });
        }
      }
      if (!hits.length) {
        e.abilityT = 1;
        return;
      }
      e.abilityT = a.interval;
      this.emit('bossAbility', { ability: a.type, enemy: e.type, x: e.x, y: e.y, radius: a.radius || a.range, targets: hits });
    }

    updateTowers(dt) {
      // Chapel blessings: each tower takes the strongest one in range.
      const chapels = this.towers.filter((t) => t.def.kind === 'support' && !(t.disabledUntil > this.time));
      for (const t of this.towers) {
        t.buff = 0; t.haste = 0; t.reach = 0;
        for (const c of chapels) {
          const cs = this.towerStats(c);
          if (c !== t && (c.x - t.x) ** 2 + (c.y - t.y) ** 2 <= cs.range * cs.range) {
            t.buff = Math.max(t.buff, cs.buff);
            t.haste = Math.max(t.haste, cs.haste || 0);
            t.reach = Math.max(t.reach, cs.reach || 0);
          }
        }
        if (t.blessUntil > this.time) t.buff = Math.max(t.buff, t.bless);
      }
      // Oracles curse every foe in their range to take extra damage.
      for (const e of this.enemies) e.curse = 0;
      for (const c of chapels) {
        const cs = this.towerStats(c);
        if (!cs.curse) continue;
        for (const e of this.enemies) {
          if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 <= cs.range * cs.range) e.curse = Math.max(e.curse, cs.curse);
        }
      }
      const horn = this.time < this.hornUntil ? 1.4 : 1;
      for (const t of this.towers) {
        const s = this.towerStats(t);
        t.fireT += dt;
        if (t.disabledUntil > this.time) {
          t.beam = null;
          continue;
        }
        if (t.def.kind === 'support') {
          if (s.heal) {
            for (const sol of this.soldiers) {
              if (sol.alive && (sol.x - t.x) ** 2 + (sol.y - t.y) ** 2 <= s.range * s.range) sol.hp = Math.min(sol.maxHp, sol.hp + s.heal * dt);
            }
          }
          continue;
        }
        if (t.def.kind === 'economy' || t.def.kind === 'barracks') continue;
        const range = this.rangeOf(t);
        const power = (1 + t.buff) * this.mods.dmg, pace = (1 + t.haste) * horn;
        if (t.def.kind === 'pulse') {
          t.pulseT = (t.pulseT || 0) + dt * pace;
          if (t.pulseT >= s.interval) {
            const hit = this.targetsInRange(t, range);
            if (hit.length) {
              for (const e of hit) {
                this.damage(e, s.dmg * power, 'physical', 0.3, 0, t);
                this.stun(e, s.stun);
              }
              t.pulseT = 0;
              t.fireT = 0;
              this.emit('bell', { x: t.x, y: t.y, radius: range });
            } else {
              t.pulseT = s.interval;
            }
          }
          continue;
        }
        if (t.def.kind === 'aura') {
          const hit = this.targetsInRange(t, range);
          t.active = hit.length > 0;
          for (const e of hit) {
            this.drain(e, s.dps * power * dt, 'magic', t);
            this.applySlow(e, s.slow, 0.3);
          }
          continue;
        }
        if (t.def.kind === 'beam') {
          const b = t.beam;
          if (b && (!b.alive || (b.x - t.x) ** 2 + (b.y - t.y) ** 2 > range * range)) t.beam = null;
          if (!t.beam) {
            t.beam = this.pickTargets(t, range, 1)[0] || null;
            t.focus = 0;
          }
          if (t.beam) {
            t.focus += dt;
            t.aimX = t.beam.x;
            t.aimY = t.beam.y;
            const ramp = 1 + (s.ramp - 1) * Math.min(1, t.focus / 3);
            this.drain(t.beam, s.dps * ramp * power * pace * dt, 'magic', t);
          }
          continue;
        }
        if (s.aura) {
          for (const e of this.targetsInRange(t, range)) this.applySlow(e, s.aura, 0.25);
        }
        t.cooldown -= dt * pace;
        if (t.type === 'ballista' || t.cooldown <= 0) {
          const targets = this.pickTargets(t, range, s.multishot || 1);
          const target = targets[0];
          if (target && t.type === 'ballista') {
            const want = Math.atan2(this.aimY(target) + 0.25 - (t.y - 0.35), target.x - t.x);
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
        if (p.kind === 'arrow' || p.kind === 'orb' || p.kind === 'ice' || p.kind === 'holy') {
          if (p.target.alive) { p.tx = p.target.x; p.ty = this.aimY(p.target); }
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
          p.h = p.kind === 'cannonball' ? Math.sin(Math.PI * k) * 0.35 + (1 - k) * 0.3
            : Math.sin(Math.PI * k) * (p.kind === 'flask' ? 0.7 + p.T * 0.4 : 1.1 + p.T * 0.6) + (1 - k) * 0.4;
          if (k >= 1) { this.land(p); continue; }
          out.push(p);
        } else if (p.kind === 'bolt') {
          const step = p.speed * dt;
          p.x += p.vx * step; p.y += p.vy * step; p.travelled += step;
          for (const e of this.enemies) {
            if (!e.alive || p.hit.has(e.id)) continue;
            if ((e.x - p.x) ** 2 + (this.aimY(e) + 0.05 - p.y) ** 2 < 0.16) {
              p.hit.add(e.id);
              this.damage(e, p.dmg * Math.pow(0.85, p.hit.size - 1), p.damage, p.pen, p.bossMult, p.src);
              this.emit('hit', { kind: 'bolt', x: e.x, y: this.aimY(e) });
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
        if (!e.alive || e.def.fly || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
        this.damage(e, p.dmg, p.damage, p.pen, 0, p.src);
        if (p.burn) this.burn(e, p.burn, p.burnDur, p.src);
        if (p.stun) this.stun(e, p.stun);
        if (p.corrode) this.corrode(e, p.corrode, 4);
      }
      if (p.fireField) this.hazards.push({ x: p.x, y: p.y, r: p.splash * 0.8, dps: p.burn * 0.6, until: this.time + p.fireField, t0: this.time, src: p.src });
      if (p.cloud) this.hazards.push({ kind: 'poison', x: p.x, y: p.y, r: p.splash * 0.9, dps: p.burn * 0.5, corrode: p.corrode, until: this.time + p.cloud, t0: this.time, src: p.src });
      this.emit('splash', { x: p.x, y: p.y, radius: p.splash, kind: p.kind, big: p.big });
    }

    hitHoming(p) {
      const e = p.target;
      let dmg = p.dmg;
      if (p.crit && this.rand() < p.crit) {
        dmg *= 2.5;
        this.emit('crit', { x: e.x, y: e.y });
      }
      this.damage(e, dmg, p.damage, p.pen, 0, p.src);
      if (p.execute && e.alive && !e.def.boss && e.hp < e.maxHp * p.execute) {
        this.emit('execute', { x: e.x, y: e.y });
        this.credit(p.src, Math.max(0, e.hp));
        this.kill(e, p.src);
      }
      this.emit('hit', { kind: p.kind, x: p.tx, y: p.ty });
      if (p.skill) this.skillHit(e, dmg);
      if (p.kind === 'arrow') return;
      if (p.slow) this.applySlow(e, p.slow, p.slowDur);
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
          this.emit('chain', { x1: from.x, y1: this.aimY(from), x2: next.x, y2: this.aimY(next) });
          this.damage(next, p.dmg * 0.6, 'magic', 0, 0, p.src);
          if (p.slow) this.applySlow(next, p.slow, p.slowDur);
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
          this.damage(e, s.dmg, 'magic', 0, 0, s.src);
          this.burn(e, s.burn, 3, s.src);
        }
        this.emit('meteor', { x: s.x, y: s.y, radius: s.r });
      }
      this.strikes = this.strikes.filter((s) => s.t > 0);
      // Juggernaut boulders bury nearby towers in rubble and batter soldiers.
      for (const s of this.shells) {
        s.t -= dt;
        if (s.t > 0) continue;
        for (const t of this.towers) {
          if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 > s.r * s.r) continue;
          t.disabledUntil = Math.max(t.disabledUntil || 0, this.time + s.duration);
          t.disabledBy = 'rubble';
        }
        for (const sol of this.soldiers) {
          if (sol.alive && (sol.x - s.x) ** 2 + (sol.y - s.y) ** 2 <= s.r * s.r) this.hitSoldier(sol, s.dmg);
        }
        this.emit('shellHit', { x: s.x, y: s.y, radius: s.r });
      }
      this.shells = this.shells.filter((s) => s.t > 0);
      for (const h of this.hazards) {
        for (const e of this.enemies) {
          if (!e.alive || e.def.fly || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > h.r * h.r) continue;
          this.burn(e, h.dps, 0.6, h.src);
          if (h.corrode) this.corrode(e, h.corrode, 1);
        }
      }
      this.hazards = this.hazards.filter((h) => h.until > this.time);
    }

    result() {
      const frac = this.lives / this.maxLives;
      const won = this.state === 'won';
      return { won, stars: !won ? 0 : frac >= 1 ? 3 : frac >= 0.5 ? 2 : 1, wave: this.wave };
    }

    // ---- Save & restore ------------------------------------------------------------
    // Projectiles in flight are dropped; everything else is captured exactly.

    serialize() {
      const num = (v) => (v === Infinity ? 'inf' : v);
      const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
      return {
        v: 1, map: this.map.id, mode: this.mode, perks: this.perks, seed: this.seed, faction: this.factionId, hero: this.heroId, gear: this.gearId,
        rand: this.rand.state(), waveRand: this.waveRand.state(), waveCache: this.waveCache,
        gold: num(this.gold), lives: num(this.lives), maxLives: num(this.maxLives),
        ...pick(this, ['wave', 'time', 'countdown', 'nextId', 'spawnCount', 'hornUntil', 'castCount', 'stats', 'damageBy', 'pending', 'spawners', 'cheated']),
        abilities: Object.fromEntries(Object.entries(this.abilities).map(([k, v]) => [k, v.cd])),
        seen: [...this.seen],
        towers: this.towers.map((t) => ({
          ...pick(t, ['id', 'type', 'cx', 'cy', 'level', 'branch', 'blevel', 'vet', 'mode', 'invested', 'recent', 'recentAt', 'builtAt', 'angle', 'dmgDealt', 'kills', 'cooldown', 'pulseT', 'fed', 'disabledUntil', 'disabledBy']),
          rally: t.rally && { x: t.rally.x, y: t.rally.y },
        })),
        traps: this.traps.map((tr) => ({ ...pick(tr, ['id', 'type', 'cx', 'cy', 'uses', 'dmg', 'hp', 'maxHp']), until: num(tr.until) })),
        enemies: this.enemies.filter((e) => e.alive).map((e) => ({
          ...pick(e, ['id', 'type', 'wave', 'hp', 'maxHp', 'dist', 'speed', 'armor', 'mres', 'scale', 'regen', 'elite', 'atk', 'ox', 'oy',
            'slow', 'slowUntil', 'stunUntil', 'frozen', 'burnDps', 'burnUntil', 'corrode', 'corrodeUntil', 'phase', 'healT', 'summonT', 'atkCd', 'hurtAt', 'freeUntil',
            'abilityT', 'haste', 'hasteUntil']),
          route: e.path.index, fly: !!e.def.fly,
        })),
        soldiers: this.soldiers.map((s) => ({
          ...pick(s, ['id', 'hero', 'x', 'y', 'hx', 'hy', 'hp', 'maxHp', 'dmg', 'rate', 'armor', 'regen', 'cleave', 'alive', 'respawn', 'sprite', 'scale',
            'level', 'xp', 'skillCd', 'ordered', 'dmgDealt', 'kills', 'shieldUntil', 'stunUntil', 'turret', 'range']),
          tower: s.tower ? s.tower.id : null, until: num(s.until), militia: !s.tower && !s.hero,
        })),
        hazards: this.hazards.map((h) => pick(h, ['kind', 'x', 'y', 'r', 'dps', 'corrode', 'until', 't0'])),
      };
    }

    static restore(data) {
      const map = TD.MAPS.find((m) => m.id === data.map);
      if (!map || data.v !== 1) return null;
      const den = (v) => (v === 'inf' ? Infinity : v);
      const g = new Game(map, { mode: data.mode, perks: data.perks, seed: data.seed, faction: data.faction, hero: data.hero, gear: data.gear });
      Object.assign(g, {
        waveCache: data.waveCache || {}, gold: den(data.gold), lives: den(data.lives), maxLives: den(data.maxLives),
        wave: data.wave, time: data.time, countdown: data.countdown, nextId: data.nextId, spawnCount: data.spawnCount,
        hornUntil: data.hornUntil, castCount: data.castCount || 0, stats: data.stats, damageBy: data.damageBy || {},
        pending: data.pending, spawners: data.spawners, seen: new Set(data.seen), cheated: !!data.cheated,
      });
      for (const id in data.abilities) if (g.abilities[id]) g.abilities[id].cd = data.abilities[id];
      const towers = new Map();
      g.towers = data.towers.map((d) => {
        const t = g.makeTower(d.type, d.cx, d.cy);
        Object.assign(t, d, { rally: d.rally });
        towers.set(t.id, t);
        return t;
      });
      g.soldiers = [];
      g.hero = null;
      for (const d of data.soldiers) {
        const tower = d.tower != null ? towers.get(d.tower) : null;
        if (d.tower != null && !tower) continue;
        const s = g.makeSoldier(d.x, d.y, tower);
        Object.assign(s, d, { tower, until: den(d.until), target: null });
        if (s.hero) {
          Object.assign(s, { statKey: 'hero', track: true, src: s });
          g.hero = s;
        } else {
          s.src = tower || g.abilitySrc;
        }
        if (tower) tower.squad.push(s);
        g.soldiers.push(s);
      }
      if (!g.hero) g.hero = g.makeHero();
      for (const s of g.soldiers) if (s.turret) s.src = g.hero;
      g.traps = data.traps.map((d) => Object.assign({
        def: TD.TRAPS[d.type], x: d.cx + 0.5, y: d.cy + 0.5, statKey: 'traps', hit: new Set(), firedT: 9,
      }, d, { until: den(d.until) }));
      g.enemies = data.enemies.map((d) => {
        const def = TD.ENEMIES[d.type];
        const e = Object.assign({
          def, path: (d.fly ? g.level.flights : g.level.paths)[d.route] || g.level.paths[0],
          x: 0, y: 0, dirX: 1, dirY: 0, flash: 0, alive: true, blockedBy: null, held: false, heldFor: 0, burnSrc: null,
        }, d);
        g.placeEnemy(e);
        return e;
      });
      g.hazards = data.hazards || [];
      // Rebuilding objects above consumed ids and random numbers, so restore those last.
      g.nextId = data.nextId;
      g.rand.setState(data.rand);
      g.waveRand.setState(data.waveRand);
      return g;
    }
  }

  TD.Game = Game;
})();
