// Bootstraps the game: DOM wiring, input, HUD, menus, progression and the main loop.
'use strict';
(function () {
  const TD = window.TD;
  const $ = (s) => document.querySelector(s);
  const STEP = 1 / 60;
  const MODE_LABEL = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };
  const ABILITY_ICONS = {
    meteor: '<svg viewBox="0 0 32 32"><path class="trail" d="M14 18L26 5M11 15L20 3M17 21L29 10"/><circle cx="11" cy="21" r="7"/><circle class="hot" cx="9.5" cy="19.5" r="3"/></svg>',
    reinforce: '<svg viewBox="0 0 32 32"><path d="M16 3l10 4v7c0 7-4.5 12-10 15C10.5 26 6 21 6 14V7z"/><path class="mark" d="M16 9v13M10.5 14h11"/></svg>',
    frost: '<svg viewBox="0 0 32 32"><path class="flake" d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13M12 5l4 4 4-4M12 27l4-4 4 4M5 14l5.5 1.5L9 21M27 14l-5.5 1.5L23 21"/></svg>',
    horn: '<svg viewBox="0 0 32 32"><path d="M5 13c8 0 13-4 19-9v24c-6-5-11-9-19-9z"/><rect x="2" y="12" width="5" height="8" rx="2"/><path class="mark" d="M24 4c3 3 4 7 4 12s-1 9-4 12"/></svg>',
  };
  const DEFAULT_SETTINGS = { volume: 0.8, shake: true, numbers: true, particles: 'normal', hoverRange: true, coins: true, autoWave: false };
  const STAT_NAMES = { traps: 'Traps', abilities: 'Abilities' };
  const statName = (key) => (key === 'hero' ? game.heroDef.name : STAT_NAMES[key] || TD.TOWERS[key].name);
  const CREST_ICONS = {
    crown: '<path class="sym" d="M7 15l-1-6 3.2 2.6L12 7l2.8 4.6L18 9l-1 6z"/>',
    leaf: '<path class="sym" d="M7 16c0-5 3.5-8.5 10-9 0 6.5-3.5 10-9 10M8 16l5-5"/>',
    hammer: '<path class="sym" d="M7 7h8v4H7zM10 11h2v7h-2z"/>',
    star: '<path class="sym" d="M12 6l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"/>',
  };
  const crestSvg = (f) => `<svg viewBox="0 0 24 24" class="crest-svg"><path class="shield" d="M12 2l8 3v6c0 5.5-3.4 9.3-8 11-4.6-1.7-8-5.5-8-11V5z" style="fill:${f.color}"/>${CREST_ICONS[f.icon]}</svg>`;

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('htk.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('htk.' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem('htk.' + key); } catch (e) { /* storage unavailable */ }
    },
  };

  TD.settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));

  // Faction and hero picked on the menu for the next battle.
  let pickFaction = store.get('faction', 'kingdom');
  let pickHero = store.get('hero', 'aldric');
  if (!TD.FACTIONS[pickFaction]) pickFaction = 'kingdom';
  if (!TD.HEROES[pickHero]) pickHero = 'aldric';

  const ui = {
    canvas: $('#game'), board: $('#board'), stage: $('#stage'), overlay: $('#overlay'), command: $('#command'),
    toasts: $('#toasts'), banner: $('#banner'), abilities: $('#abilities'), traps: $('#traps'),
    lives: $('#lives'), gold: $('#gold'), wave: $('#wave'), waves: $('#waves'), wavesWrap: $('#waves-wrap'), chip: $('#mode-chip'),
    buildList: $('#build-list'), info: $('#info'), next: $('#next-wave'),
    waveBtn: $('#btn-wave'), pauseBtn: $('#btn-pause'), settingsBtn: $('#btn-settings'), autoBtn: $('#btn-auto'),
    speedBtns: [...document.querySelectorAll('#speed button')],
    heroCard: $('#hero-card'), heroLvl: $('#hero-lvl'), heroHp: $('#hero-hp'), heroXp: $('#hero-xp'), heroRespawn: $('#hero-respawn'),
    heroImg: $('#hero-img'), heroName: $('#hero-name'), factionChip: $('#faction-chip'),
  };

  const renderer = new TD.Render.Renderer(ui.canvas);
  let game = null;
  let inMenu = true;
  let paused = false;
  let speed = store.get('speed', 1);
  if (!TD.SPEEDS.includes(speed)) speed = 1;
  let menuMode = store.get('mode', 'campaign');
  let acc = 0, lastT = 0, vtime = 0, saveTimer = 0;
  let overlayReturn = null;
  const view = { placing: null, trap: null, hover: null, hoverTower: null, mouse: null, selected: null, hero: false, ability: null, rallyFor: null, inspect: null };
  const shown = {};

  const fmt = (n) => (n === Infinity ? '∞' : n >= 1e5 ? big(n) : Math.floor(n));
  const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
  const enemySrc = (type) => TD.Render.enemyIcon(type);

  // ---- Layout ----------------------------------------------------------------

  function fit() {
    const narrow = window.innerWidth <= 860;
    const bar = ui.command.offsetHeight + 12;
    const w = ui.stage.clientWidth - 20, h = ui.stage.clientHeight - 20 - bar;
    const k = narrow ? w / TD.Render.W : Math.min(w / TD.Render.W, h / TD.Render.H);
    const cw = Math.max(320, Math.floor(TD.Render.W * k)), ch = Math.floor(cw * TD.Render.H / TD.Render.W);
    ui.board.style.width = cw + 'px';
    ui.board.style.height = ch + 'px';
    renderer.resize(cw, ch);
  }

  // ---- Toasts, banners, flying coins ----------------------------------------------

  function toast(html, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = html;
    ui.toasts.appendChild(el);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, ms || 3200);
  }

  function banner(text, sub, boss) {
    ui.banner.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    ui.banner.className = '';
    void ui.banner.offsetWidth;
    ui.banner.className = 'show' + (boss ? ' boss' : '');
  }

  function bump(el, cls) {
    const stat = el.closest('.stat');
    stat.classList.remove(cls);
    void stat.offsetWidth;
    stat.classList.add(cls);
  }

  let coinsInFlight = 0;
  function flyCoin(x, y) {
    if (!TD.settings.coins || coinsInFlight > 10 || !ui.canvas.animate) return;
    const r = ui.canvas.getBoundingClientRect(), g = ui.gold.getBoundingClientRect();
    const sx = r.left + (x / TD.COLS) * r.width, sy = r.top + (y / TD.ROWS) * r.height;
    const dx = g.left + g.width / 2 - sx, dy = g.top + g.height / 2 - sy;
    const el = document.createElement('div');
    el.className = 'fly-coin';
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    document.body.appendChild(el);
    coinsInFlight++;
    el.animate([
      { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.8 },
      { transform: `translate(calc(-50% + ${dx * 0.25}px), calc(-50% + ${dy * 0.15 - 50}px)) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 1 },
    ], { duration: 650 + Math.random() * 200, easing: 'cubic-bezier(.45,0,.8,.45)' }).onfinish = () => {
      el.remove();
      coinsInFlight--;
      bump(ui.gold, 'bump');
    };
  }

  function starStr(n, max) {
    let s = '';
    for (let i = 0; i < (max || 3); i++) s += i < n ? '★' : '<span class="dim">★</span>';
    return s;
  }

  // ---- Progress: glory, perks, trophies, codex, saves ---------------------------------

  const progress = {
    glory: () => store.get('glory', 0),
    perks: () => store.get('perks', {}),
    addGlory(n) { store.set('glory', progress.glory() + n); },
    buy(id) {
      const perks = progress.perks();
      const rank = perks[id] || 0;
      const cost = TD.PERK_COSTS[rank];
      if (cost == null || progress.glory() < cost) return false;
      perks[id] = rank + 1;
      store.set('perks', perks);
      store.set('glory', progress.glory() - cost);
      if (TD.PERKS.every((p) => (perks[p.id] || 0) >= TD.PERK_COSTS.length)) trophies.unlock('armory');
      return true;
    },
    refund() {
      const perks = progress.perks();
      let back = 0;
      for (const id in perks) for (let r = 0; r < perks[id]; r++) back += TD.PERK_COSTS[r];
      store.set('perks', {});
      store.set('glory', progress.glory() + back);
      return back;
    },
  };

  // Lifetime counters live in memory and are flushed to storage every few seconds.
  const trophies = {
    got: store.get('trophies', {}),
    life: Object.assign({ kills: 0, flyKills: 0, trapKills: 0, branches: {} }, store.get('lifetime', {})),
    castKills: {},
    dirty: false,
    unlock(id) {
      if (this.got[id] || (game && (game.sandbox || game.cheated) && !inMenu)) return;
      const a = TD.ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      this.got[id] = Date.now();
      store.set('trophies', this.got);
      if (a.glory) progress.addGlory(a.glory);
      TD.Audio.play('trophy');
      toast(`<span class="trophy-i">🏆</span><span><b>Trophy: ${a.name}</b> ${a.blurb}${a.glory ? ` <b class="glory-i">+${a.glory}</b>` : ''}</span>`, 'gold', 4500);
    },
    flush() {
      if (!this.dirty) return;
      this.dirty = false;
      store.set('lifetime', this.life);
      const l = this.life;
      if (l.kills >= 1000) this.unlock('kills1k');
      if (l.kills >= 10000) this.unlock('kills10k');
      if (l.flyKills >= 100) this.unlock('skyguard');
      if (l.trapKills >= 100) this.unlock('trapper');
      if (Object.keys(l.branches).length >= 16) this.unlock('specialist');
    },
    // React to simulation events (never in sandbox, where gold and lives are free).
    onEvent(ev) {
      if (game.sandbox || game.cheated) return;
      const l = this.life;
      switch (ev.type) {
        case 'kill':
          l.kills++;
          if (ev.fly) l.flyKills++;
          if (ev.source === 'traps') l.trapKills++;
          if (ev.boss) this.unlock('boss_' + ev.enemy);
          if (ev.cast) {
            this.castKills[ev.cast] = (this.castKills[ev.cast] || 0) + 1;
            if (this.castKills[ev.cast] >= 10) this.unlock('meteor10');
          }
          this.dirty = true;
          break;
        case 'upgrade':
          if (ev.branch) { l.branches[ev.tower + ':' + ev.branch] = 1; this.dirty = true; }
          if (ev.level >= 4) this.unlock('rank5');
          if (TD.TOWERS[ev.tower].faction && ev.level >= 2) this.unlock('unique_max');
          break;
        case 'build':
          if (ev.count >= 20) this.unlock('builder');
          break;
        case 'heroLevel':
          if (ev.level >= 10) this.unlock('hero10');
          break;
        case 'bonus':
          if (game.stats.early >= 10) this.unlock('early_bird');
          break;
        case 'wave':
          if (game.endless) {
            if (ev.wave >= 20) this.unlock('endless20');
            if (ev.wave >= 35) this.unlock('endless35');
            if (ev.wave >= 50) this.unlock('endless50');
            if (ev.wave >= 100) this.unlock('endless100');
          }
          break;
      }
    },
    onWin(g, stars) {
      if (g.mode !== 'campaign' || g.cheated) return;
      this.unlock('first_win');
      const l = this.life;
      l.factionWins = Object.assign({}, l.factionWins, { [g.factionId]: 1 });
      l.heroWins = Object.assign({}, l.heroWins, { [g.heroId]: 1 });
      this.dirty = true;
      if (TD.FACTION_ORDER.every((f) => l.factionWins[f])) this.unlock('all_factions');
      if (TD.HERO_ORDER.every((h) => l.heroWins[h])) this.unlock('all_heroes');
      if (g.map.id === 'blackwood') this.unlock('blackwood_win');
      if (g.lives >= g.maxLives) this.unlock('flawless');
      if (g.map.id === 'frostmarch') this.unlock('frost_win');
      const types = Object.keys(g.stats.types);
      if (types.length === 1 && types[0] === 'archer') this.unlock('purist');
      const best = store.get('best', {});
      if (TD.MAPS.every((m) => best[m.id] >= 1)) this.unlock('all_maps');
      if (TD.MAPS.every((m) => best[m.id] >= 3)) this.unlock('all_stars');
    },
  };

  const codex = {
    seen: new Set(store.get('codex', [])),
    see(type) {
      if (this.seen.has(type)) return;
      this.seen.add(type);
      store.set('codex', [...this.seen]);
    },
  };

  const saves = {
    get: () => store.get('save', null),
    put() {
      if (!game || inMenu || game.state !== 'playing') return;
      store.set('save', { at: Date.now(), name: game.map.name, mode: game.mode, faction: game.factionId, wave: game.wave, data: game.serialize() });
    },
    clear: () => store.remove('save'),
  };

  // ---- Screens -----------------------------------------------------------------

  function showMenu() {
    inMenu = true;
    paused = false;
    overlayReturn = null;
    clearModes();
    // The idle battlefield behind the menu follows the chosen faction (build list, colours).
    if (!game || game.factionId !== pickFaction) setGame(new TD.Game(TD.MAPS[0], { mode: 'campaign', faction: pickFaction, hero: pickHero }));
    const best = store.get('best', {});
    const endless = store.get('endless', {});
    const save = saves.get();
    const got = Object.keys(trophies.got).length;
    const tabs = Object.entries(TD.MODES).map(([id, m]) => `<button data-mode="${id}" class="${id === menuMode ? 'on' : ''}">${m.name}</button>`).join('');
    ui.overlay.innerHTML = `
      <div class="menu">
        <h1>Hold the Keep</h1>
        <div class="tag-line">The horde marches on the realm. Build towers along the road and let none reach the gate.</div>
        ${save ? `<button class="continue" data-act="continue">
          <span class="c-title">Continue</span>
          <span class="c-sub">${save.name} · ${TD.MODES[save.mode].name}${save.faction ? ' · ' + TD.FACTIONS[save.faction].short : ''} · wave ${save.wave} · ${ago(save.at)}</span>
        </button>` : ''}
        <div class="menu-bar">
          <div class="seg mode-tabs">${tabs}</div>
        </div>
        <div class="mode-blurb">${TD.MODES[menuMode].blurb}</div>
        ${councilHtml()}
        <div class="maps"></div>
        <div class="menu-bar small">
          <button class="btn gold" data-act="armory">Royal Armory · <span class="glory-i">${progress.glory()}</span></button>
          <button class="btn" data-act="trophies">Trophies · ${got}/${TD.ACHIEVEMENTS.length}</button>
          <button class="btn" data-act="codex">Codex</button>
          <button class="btn" data-act="settings">Settings</button>
        </div>
        <div class="how">
          <span><kbd>1</kbd>–<kbd>9</kbd> towers</span>
          <span><kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd> traps</span>
          <span><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> abilities</span>
          <span><kbd>H</kbd> hero</span>
          <span><kbd>U</kbd> upgrade · <kbd>Del</kbd> sell · <kbd>T</kbd> target</span>
          <span><kbd>Space</kbd> pause · <kbd>F</kbd> speed · <kbd>A</kbd> auto-waves · <kbd>N</kbd> next wave</span>
        </div>
        <div class="credit">Art: “Medieval RTS” by <a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> (CC0)</div>
      </div>`;
    const maps = ui.overlay.querySelector('.maps');
    TD.MAPS.forEach((map) => {
      const card = document.createElement('button');
      card.className = 'map-card';
      let record;
      if (menuMode === 'campaign') record = `<span class="stars">${starStr(best[map.id] || 0)}</span>`;
      else if (menuMode === 'endless') record = `<span class="record">${endless[map.id] ? 'Best: wave ' + endless[map.id] : 'No record yet'}</span>`;
      else record = '<span class="record">Free play</span>';
      card.innerHTML = `
        <div class="body">
          <div class="row"><h3>${map.name}</h3><span class="pill ${map.difficulty}">${map.difficulty}</span></div>
          <p>${map.blurb}</p>
          <div class="meta">${record}<span>${map.lives} lives</span><span class="coin-i">${map.gold}</span>${map.paths.length > 1 ? '<span>2 roads</span>' : ''}</div>
        </div>`;
      card.prepend(TD.Render.mapPreview(map, 300));
      card.addEventListener('click', () => {
        TD.Audio.unlock();
        TD.Audio.play('click');
        startGame(map, menuMode);
      });
      maps.appendChild(card);
    });
    ui.overlay.classList.add('show');
    refreshAll();
  }

  // Faction and hero choice for the next battle.
  function councilHtml() {
    const f = TD.FACTIONS[pickFaction], h = TD.HEROES[pickHero];
    const crests = TD.FACTION_ORDER.map((id) => {
      const x = TD.FACTIONS[id];
      return `<button class="crest ${id === pickFaction ? 'on' : ''}" data-faction="${id}" title="${x.name}" style="--fc:${x.color}">${crestSvg(x)}<span>${x.short}</span></button>`;
    }).join('');
    const heroes = TD.HERO_ORDER.map((id) => {
      const x = TD.HEROES[id];
      return `<button class="hero-pick ${id === pickHero ? 'on' : ''}" data-hero="${id}" title="${x.name}, ${x.title}"><img src="assets/units/${x.sprite}.png" alt=""><span>${x.name.split(' ').pop()}</span></button>`;
    }).join('');
    const skills = Object.values(h.skills).map((k) => `<b>${k.name}</b>`).join(' · ');
    return `<div class="council">
      <div class="pick">
        <div class="pick-title">Faction</div>
        <div class="pick-row">${crests}</div>
        <div class="pick-info" style="--fc:${f.color}"><b>${f.name}.</b> ${f.blurb}<ul>${f.perks.map((p) => `<li>${p}</li>`).join('')}</ul></div>
      </div>
      <div class="pick">
        <div class="pick-title">Hero</div>
        <div class="pick-row">${heroes}</div>
        <div class="pick-info"><b>${h.name}</b>, ${h.title}. ${h.blurb}<br><small>${h.ranged ? 'Ranged' : 'Melee'} · ${skills}</small></div>
      </div>
    </div>`;
  }

  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
  }

  function showArmory() {
    const perks = progress.perks();
    const glory = progress.glory();
    const rows = TD.PERKS.map((p) => {
      const rank = perks[p.id] || 0;
      const cost = TD.PERK_COSTS[rank];
      const pipsHtml = TD.PERK_COSTS.map((_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      return `<div class="perk">
        <div class="perk-text"><b>${p.name}</b><small>${p.blurb}</small><span class="ranks">${pipsHtml}</span></div>
        <button class="btn ${cost == null ? '' : 'gold'}" data-perk="${p.id}" ${cost == null || glory < cost ? 'disabled' : ''}>
          ${cost == null ? 'Mastered' : `<span class="glory-i">${cost}</span>`}
        </button>
      </div>`;
    }).join('');
    ui.overlay.innerHTML = `
      <div class="dialog armory">
        <h2>Royal Armory</h2>
        <div class="lines">Spend <b>Glory</b> on lasting upgrades for every battle. You have <b class="glory-i">${glory}</b>.<br>
          <small>Earn Glory by winning campaign maps, surviving endless waves, earning trophies, and even by valiant defeats.</small></div>
        <div class="perks">${rows}</div>
        <div class="buttons">
          <button class="btn green" data-act="menu">Back to maps</button>
          <button class="btn" data-act="refund">Refund all</button>
        </div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  function showTrophies() {
    trophies.flush();
    const l = trophies.life;
    const counters = { kills1k: [l.kills, 1000], kills10k: [l.kills, 10000], skyguard: [l.flyKills, 100], trapper: [l.trapKills, 100], specialist: [Object.keys(l.branches).length, 10] };
    const rows = TD.ACHIEVEMENTS.map((a) => {
      const got = trophies.got[a.id];
      const c = counters[a.id];
      const bar = !got && c ? `<span class="t-bar"><i style="width:${Math.min(100, (c[0] / c[1]) * 100)}%"></i></span><small class="t-count">${big(Math.min(c[0], c[1]))} / ${big(c[1])}</small>` : '';
      return `<div class="trophy ${got ? 'got' : ''}">
        <span class="t-icon">${got ? '🏆' : '🔒'}</span>
        <span class="t-text"><b>${a.name}</b><small>${a.blurb}</small>${bar}</span>
        ${a.glory ? `<span class="glory-i">${a.glory}</span>` : ''}
      </div>`;
    }).join('');
    const n = Object.keys(trophies.got).length;
    ui.overlay.innerHTML = `
      <div class="dialog wide">
        <h2>Trophies</h2>
        <div class="lines">${n} of ${TD.ACHIEVEMENTS.length} earned. Each trophy also pays out Glory for the Royal Armory.<br><small>Trophies can't be earned in Sandbox mode.</small></div>
        <div class="trophies">${rows}</div>
        <div class="buttons"><button class="btn green" data-act="menu">Back to maps</button></div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  const COMBOS = [
    ['Shatter', 'Frozen foes (Winter\u2019s Grasp, Frost Spire) take 50% extra damage from the next heavy physical hit, which breaks the ice.'],
    ['Ignite', 'A burning foe that wades into a Tar Pit sets it ablaze, turning it into a fire field for six seconds.'],
    ['Corrode & crush', 'Alchemists and Plague Doctors strip armor, so arrows, boulders and bolts hit corroded foes much harder.'],
    ['Hold & bombard', 'Barricades and soldiers bunch foes together: perfect targets for catapults, cannons and Meteor Strike.'],
  ];
  let codexTab = 'foes';
  function showCodex() {
    const tabs = [['foes', 'Foes'], ['towers', 'Towers'], ['factions', 'Factions'], ['other', 'Heroes, Traps & Combos']]
      .map(([id, name]) => `<button data-codex="${id}" class="${codexTab === id ? 'on' : ''}">${name}</button>`).join('');
    let body = '';
    if (codexTab === 'foes') {
      body = Object.entries(TD.ENEMIES).map(([type, d]) => {
        if (!codex.seen.has(type)) {
          return `<div class="entry locked"><span class="e-pic">?</span><span class="e-text"><b>Unknown foe</b><small>Not yet encountered. Keep fighting to learn more.</small></span></div>`;
        }
        const tags = [d.boss && 'Boss', d.fly && 'Flying', d.noBlock && 'Unblockable', d.heal && 'Heals allies', d.summon && 'Summons', d.raise && 'Raises the fallen', d.rage && 'Enrages', d.minion && 'Summoned']
          .filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join('');
        return `<div class="entry"><span class="e-pic"><img src="${enemySrc(type)}" alt=""></span><span class="e-text">
          <b>${d.name}</b>${tags ? `<span class="e-tags">${tags}</span>` : ''}<small>${d.blurb}</small>
          <span class="e-stats">
            <span>Health <b>${d.hp}</b></span><span>Speed <b>${d.speed}</b></span>
            <span>Armor <b>${Math.round((d.armor || 0) * 100)}%</b></span><span>Magic resist <b>${Math.round((d.magicResist || 0) * 100)}%</b></span>
            <span>Lives <b>${d.lives}</b></span><span>Bounty <b>${d.gold}</b></span>
          </span></span></div>`;
      }).join('');
    } else if (codexTab === 'towers') {
      body = TD.TOWER_ORDER.concat(TD.FACTION_ORDER.map((f) => TD.FACTIONS[f].unique)).map((type) => {
        const d = TD.TOWERS[type];
        const lv = d.levels.map((l, i) => `<span>Lv ${i + 1}: ${l.dmg ? `${l.dmg} dmg` : l.dps ? `${l.dps} dmg/s` : l.soldiers ? `${l.soldiers}× ${l.hp} hp` : l.buff ? `+${Math.round(l.buff * 100)}% dmg` : `+${l.income} gold`}${l.range ? ` · ${l.range} range` : ''}${l.cost ? ` · ${l.cost}g` : ''}</span>`).join('');
        const br = d.branches ? Object.entries(d.branches).map(([, b]) => `<span class="branch-line"><b>${b.name}</b> — ${b.blurb}</span>`).join('') : '';
        return `<div class="entry"><span class="e-pic" data-tower="${type}"></span><span class="e-text">
          <b>${d.name}</b><span class="e-tags"><span class="tag">${d.cost} gold</span>${d.faction ? `<span class="tag" style="background:${TD.FACTIONS[d.faction].color}">${TD.FACTIONS[d.faction].short} only</span>` : ''}${d.ground ? '<span class="tag">Ground only</span>' : ''}</span><small>${d.blurb}</small>
          <span class="e-levels">${lv}</span>${br}</span></div>`;
      }).join('');
    } else if (codexTab === 'factions') {
      body = TD.FACTION_ORDER.map((id) => {
        const f = TD.FACTIONS[id];
        return `<div class="entry"><span class="e-pic crest-pic">${crestSvg(f)}</span><span class="e-text">
          <b>${f.name}</b><span class="e-tags"><span class="tag" style="background:${f.color}">Hero: ${TD.HEROES[f.hero].name}</span></span><small>${f.blurb}</small>
          <span class="e-levels">${f.perks.map((p) => `<span>• ${p}</span>`).join('')}</span></span></div>`;
      }).join('');
    } else {
      body = TD.HERO_ORDER.map((id) => {
        const H = TD.HEROES[id];
        return `<div class="entry"><span class="e-pic"><img src="assets/units/${H.sprite}.png" alt=""></span><span class="e-text">
          <b>${H.name}</b><span class="e-tags"><span class="tag">${H.title}</span><span class="tag">${H.ranged ? 'Ranged' : 'Melee'}</span></span><small>${H.blurb} Health ${H.hp}, damage ${H.dmg}, armor ${Math.round(H.armor * 100)}%.</small>
          <span class="e-levels">${Object.values(H.skills).map((k) => `<span><b>${k.name}</b> (level ${k.level}): ${k.blurb} ${k.cooldown}s cooldown.</span>`).join('')}</span>
        </span></div>`;
      }).join('') + TD.TRAP_ORDER.map((type) => {
        const d = TD.TRAPS[type];
        return `<div class="entry"><span class="e-pic" data-trap="${type}"></span><span class="e-text">
          <b>${d.name}</b><span class="e-tags"><span class="tag">${d.cost} gold</span><span class="tag">Key ${d.key.toUpperCase()}</span></span><small>${d.blurb} Placed on road tiles; flyers are unaffected.</small></span></div>`;
      }).join('') + COMBOS.map(([name, text]) => `<div class="entry"><span class="e-pic combo-pic">✦</span><span class="e-text">
          <b>${name}</b><span class="e-tags"><span class="tag">Combo</span></span><small>${text}</small></span></div>`).join('');
    }
    ui.overlay.innerHTML = `
      <div class="dialog wide codex">
        <h2>Codex</h2>
        <div class="seg codex-tabs">${tabs}</div>
        <div class="entries">${body}</div>
        <div class="buttons"><button class="btn green" data-act="back">Back</button></div>
      </div>`;
    for (const el of ui.overlay.querySelectorAll('[data-tower]')) el.appendChild(TD.Render.towerIcon(el.dataset.tower, 0, 52));
    for (const el of ui.overlay.querySelectorAll('[data-trap]')) el.appendChild(trapIcon(el.dataset.trap, 52));
    ui.overlay.classList.add('show');
  }

  function showSettings(from) {
    overlayReturn = from;
    const s = TD.settings;
    const toggle = (key, label, hint) => `<label class="setting toggle"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}><i></i></label>`;
    const parts = ['low', 'normal', 'high'].map((p) => `<button data-particles="${p}" class="${s.particles === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('');
    ui.overlay.innerHTML = `
      <div class="dialog settings">
        <h2>Settings</h2>
        <label class="setting"><span><b>Sound volume</b></span><input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-set="volume"></label>
        <div class="setting"><span><b>Particle effects</b></span><div class="seg">${parts}</div></div>
        ${toggle('shake', 'Screen shake', 'Explosions and big hits rattle the view.')}
        ${toggle('numbers', 'Floating numbers', 'Gold and damage text over the battlefield.')}
        ${toggle('coins', 'Flying coins', 'Coins fly from fallen foes to your purse.')}
        ${toggle('hoverRange', 'Range on hover', 'Show a tower’s range when the mouse is over it.')}
        ${toggle('autoWave', 'Auto-call waves', 'Send the next wave as soon as the last one has spawned (with early bonus). Also on the A key.')}
        <div class="setting danger"><span><b>Reset all progress</b><small>Stars, records, Glory, perks, trophies, codex and the saved game.</small></span>
          <button class="btn red" data-act="reset-progress">Reset…</button></div>
        <div class="buttons"><button class="btn green" data-act="close-settings">Done</button></div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  function saveSettings() {
    store.set('settings', TD.settings);
    TD.Audio.setVolume(TD.settings.volume);
    refreshAll();
  }

  ui.overlay.addEventListener('input', (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    TD.settings[el.dataset.set] = el.type === 'checkbox' ? el.checked : +el.value / 100;
    saveSettings();
    if (el.dataset.set === 'volume') TD.Audio.play('click');
  });

  function trapIcon(type, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = size * dpr;
    const ctx = c.getContext('2d');
    ctx.scale((size / 64) * dpr, (size / 64) * dpr);
    const def = TD.TRAPS[type];
    TD.Render.drawTrap(ctx, { type, def, x: 0.5, y: type === 'keg' ? 0.78 : type === 'barricade' ? 0.72 : 0.55, uses: def.uses || 1, until: 99, id: 0, firedT: 9 }, 0, 0);
    return c;
  }

  let cardsFor = '';
  function setGame(g) {
    game = g;
    renderer.setGame(game);
    if (cardsFor !== game.factionId) {
      cardsFor = game.factionId;
      buildCards();
    }
    ui.heroImg.src = `assets/units/${game.heroDef.sprite}.png`;
    ui.heroName.textContent = game.heroDef.name;
    ui.heroCard.title = `${game.heroDef.name} (H): select, then click the map to move`;
    ui.factionChip.textContent = game.faction.short;
    ui.factionChip.style.background = game.faction.color;
    acc = 0;
    trophies.castKills = {};
    for (const k in shown) delete shown[k];
    for (const t of game.seen) shown[t] = true;
  }

  function startGame(map, mode) {
    setGame(new TD.Game(map, {
      mode, perks: mode === 'sandbox' ? {} : progress.perks(), seed: (Math.random() * 1e9) | 0, faction: pickFaction, hero: pickHero,
    }));
    beginPlay();
    const tip = mode === 'sandbox' ? 'Sandbox: gold and lives are unlimited. Send waves whenever you like.'
      : mode === 'endless' ? 'Endless: how many waves can you hold? Elite foes join from wave 12.'
        : `Build towers beside the road, then press <b>Start Wave 1</b>. Press <b>H</b> to command ${game.heroDef.name}.`;
    toast(`<span>${tip}</span>`, '', 5000);
    saves.put();
  }

  function continueGame() {
    const save = saves.get();
    const g = save && TD.Game.restore(save.data);
    if (!g) {
      saves.clear();
      toast('That saved game could not be loaded.', 'bad', 2500);
      showMenu();
      return;
    }
    setGame(g);
    beginPlay();
    toast(`<span>Welcome back! ${g.map.name}, wave ${g.wave}.</span>`, '', 3000);
  }

  function beginPlay() {
    inMenu = false;
    paused = false;
    overlayReturn = null;
    clearModes();
    ui.overlay.classList.remove('show');
    ui.overlay.innerHTML = '';
    ui.toasts.innerHTML = '';
    refreshAll();
  }

  function setPaused(p) {
    if (inMenu || !game || game.state !== 'playing') return;
    paused = p;
    ui.pauseBtn.classList.toggle('active', p);
    if (p) {
      saves.put();
      ui.overlay.innerHTML = `
        <div class="dialog">
          <h2>Paused</h2>
          <div class="lines">${game.map.name} · ${TD.MODES[game.mode].name} · Wave <b>${game.wave}</b>${game.endless ? '' : ' of ' + game.totalWaves}</div>
          <div class="buttons">
            <button class="btn green" data-act="resume">Resume</button>
            <button class="btn" data-act="restart">Restart</button>
            <button class="btn" data-act="pause-settings">Settings</button>
            <button class="btn" data-act="cheats">Cheats (^)</button>
            <button class="btn" data-act="menu">${game.endless && game.wave > 1 && !game.sandbox ? 'Retreat' : 'Save & quit'}</button>
          </div>
        </div>`;
      ui.overlay.classList.add('show');
    } else {
      ui.overlay.classList.remove('show');
    }
  }

  function gloryFor(g) {
    if (g.sandbox) return 0;
    if (g.mode === 'campaign') return g.state === 'won' ? 10 + 10 * g.result().stars : Math.max(1, g.wave);
    const held = Math.max(0, g.wave - 1);
    return held + 5 * Math.floor(held / 10);
  }

  function battleReport(g) {
    const rows = Object.entries(g.damageBy).filter(([, v]) => v.dmg > 0 || v.kills > 0).sort((a, b) => b[1].dmg - a[1].dmg);
    if (!rows.length) return '';
    const top = rows[0][1].dmg || 1;
    return `<div class="report"><div class="report-title">Battle report</div>${rows.map(([key, v]) => `
      <div class="r-row"><span class="r-name">${statName(key)}</span>
        <span class="r-bar"><i style="width:${Math.max(2, (v.dmg / top) * 100)}%"></i></span>
        <span class="r-val">${big(v.dmg)} dmg · ${v.kills} kills</span></div>`).join('')}</div>`;
  }

  function showResult() {
    const r = game.result();
    const map = game.map;
    const glory = gloryFor(game);
    if (glory) progress.addGlory(glory);
    saves.clear();
    trophies.flush();
    let record = '';
    if (r.won) {
      const best = store.get('best', {});
      if ((best[map.id] || 0) < r.stars) {
        best[map.id] = r.stars;
        store.set('best', best);
      }
      trophies.onWin(game, r.stars);
    } else if (game.mode === 'endless') {
      const endless = store.get('endless', {});
      const prev = endless[map.id] || 0;
      if (game.wave > prev) {
        endless[map.id] = game.wave;
        store.set('endless', endless);
        record = prev ? `<b class="new-record">New record!</b> (was wave ${prev})` : '<b class="new-record">First record set!</b>';
      } else {
        record = `Best: wave ${prev}`;
      }
    }
    const nextMap = TD.MAPS[TD.MAPS.indexOf(map) + 1];
    clearModes();
    const title = r.won ? 'Victory!' : 'The Keep has Fallen';
    const line = r.won ? `The horde is broken and ${map.name} is safe.`
      : game.endless ? `You held ${map.name} until wave <b>${game.wave}</b>. ${record}`
        : `The horde overran the gate on wave <b>${game.wave}</b>.`;
    ui.overlay.innerHTML = `
      <div class="dialog result ${r.won ? 'win' : 'lose'}">
        <h2>${title}</h2>
        ${r.won ? `<div class="big-stars">${starStr(r.stars)}</div>` : ''}
        <div class="lines">
          ${line}<br>
          Foes slain <b>${game.stats.kills}</b>${game.endless ? '' : ` · Lives left <b>${game.lives}/${game.maxLives}</b>`} · Hero level <b>${game.hero.level}</b>
          ${glory ? `<div class="glory-line">+<span class="glory-i">${glory}</span> Glory for the Royal Armory</div>` : ''}
        </div>
        ${battleReport(game)}
        <div class="buttons">
          ${r.won && nextMap ? `<button class="btn gold" data-act="next">Next: ${nextMap.name}</button>` : ''}
          ${r.won ? '<button class="btn" data-act="endless">Try Endless here</button>' : ''}
          <button class="btn ${r.won ? '' : 'red'}" data-act="restart">${r.won ? 'Play again' : 'Try again'}</button>
          <button class="btn" data-act="menu">Choose map</button>
        </div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  // Retreating from an endless run banks the waves you held; other modes keep their save.
  function leaveToMenu() {
    if (game && !inMenu && game.mode === 'endless' && game.state === 'playing' && game.wave > 1) {
      game.state = 'lost';
      showResult();
      return;
    }
    saves.put();
    showMenu();
  }

  let resetArmed = false;
  ui.overlay.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-faction], [data-hero]');
    if (pick) {
      if (pick.dataset.faction) {
        pickFaction = pick.dataset.faction;
        // Picking a faction suggests its own hero; any hero can still be chosen afterwards.
        pickHero = TD.FACTIONS[pickFaction].hero;
        store.set('faction', pickFaction);
      } else {
        pickHero = pick.dataset.hero;
      }
      store.set('hero', pickHero);
      TD.Audio.play('click');
      showMenu();
      return;
    }
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      menuMode = modeBtn.dataset.mode;
      store.set('mode', menuMode);
      TD.Audio.play('click');
      showMenu();
      return;
    }
    const perk = e.target.closest('[data-perk]');
    if (perk) {
      if (progress.buy(perk.dataset.perk)) TD.Audio.play('upgrade');
      showArmory();
      return;
    }
    const tab = e.target.closest('[data-codex]');
    if (tab) {
      codexTab = tab.dataset.codex;
      TD.Audio.play('click');
      showCodex();
      return;
    }
    const part = e.target.closest('[data-particles]');
    if (part) {
      TD.settings.particles = part.dataset.particles;
      saveSettings();
      showSettings(overlayReturn);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    TD.Audio.unlock();
    TD.Audio.play('click');
    const a = act.dataset.act;
    if (a === 'resume') setPaused(false);
    else if (a === 'restart') startGame(game.map, game.mode);
    else if (a === 'menu') { if (paused) { paused = false; leaveToMenu(); } else showMenu(); }
    else if (a === 'continue') continueGame();
    else if (a === 'next') startGame(TD.MAPS[TD.MAPS.indexOf(game.map) + 1], 'campaign');
    else if (a === 'endless') startGame(game.map, 'endless');
    else if (a === 'armory') showArmory();
    else if (a === 'trophies') showTrophies();
    else if (a === 'codex') showCodex();
    else if (a === 'back') { if (overlayReturn === 'pause') setPaused(true); else showMenu(); }
    else if (a === 'settings') showSettings('menu');
    else if (a === 'pause-settings') showSettings('pause');
    else if (a === 'cheats') { setPaused(false); toggleCheats(true); }
    else if (a === 'refund') { progress.refund(); showArmory(); }
    else if (a === 'close-settings') {
      resetArmed = false;
      if (overlayReturn === 'pause') setPaused(true);
      else if (overlayReturn === 'game') { overlayReturn = null; paused = false; ui.overlay.classList.remove('show'); refreshAll(); }
      else showMenu();
    } else if (a === 'reset-progress') {
      if (!resetArmed) {
        resetArmed = true;
        act.textContent = 'Click again to wipe everything';
        return;
      }
      for (const k of ['best', 'endless', 'glory', 'perks', 'trophies', 'lifetime', 'codex', 'save']) store.remove(k);
      trophies.got = {};
      trophies.life = { kills: 0, flyKills: 0, trapKills: 0, branches: {} };
      codex.seen = new Set();
      resetArmed = false;
      toast('All progress has been reset.', 'bad', 2500);
      showSettings(overlayReturn);
    }
  });

  // ---- Build cards, traps, abilities ---------------------------------------------------

  let cards = {};
  function buildCards() {
    ui.buildList.innerHTML = '';
    cards = {};
    for (const type of game.towerTypes()) {
      const def = TD.TOWERS[type];
      const b = document.createElement('button');
      b.className = 'card' + (def.faction ? ' faction' : '');
      if (def.faction) b.style.setProperty('--fc', TD.FACTIONS[def.faction].color);
      b.title = `${def.name} (${def.key}): ${def.blurb}`;
      b.innerHTML = `<kbd>${def.key}</kbd><span class="txt"><span class="name">${def.name}</span><span class="cost">${def.cost}</span></span>`;
      b.prepend(TD.Render.towerIcon(type, 0, 46));
      b.addEventListener('click', () => {
        TD.Audio.unlock();
        togglePlacing(type);
      });
      ui.buildList.appendChild(b);
      cards[type] = b;
    }
  }

  const trapBtns = {};
  function buildTrapBar() {
    for (const type of TD.TRAP_ORDER) {
      const def = TD.TRAPS[type];
      const b = document.createElement('button');
      b.className = 'act trap';
      b.title = `${def.name} (${def.key.toUpperCase()}): ${def.blurb}`;
      b.innerHTML = `<span class="cost">${def.cost}</span><kbd>${def.key.toUpperCase()}</kbd>`;
      b.prepend(trapIcon(type, 34));
      b.addEventListener('click', () => {
        TD.Audio.unlock();
        toggleTrap(type);
      });
      ui.traps.appendChild(b);
      trapBtns[type] = b;
    }
  }

  const abilityBtns = {};
  function buildAbilityBar() {
    for (const id of TD.ABILITY_ORDER) {
      const a = TD.ABILITIES[id];
      const b = document.createElement('button');
      b.className = 'act ability ab-' + id;
      b.title = `${a.name} (${a.key.toUpperCase()}): ${a.blurb} Recharges in ${a.cooldown}s.`;
      b.innerHTML = `${ABILITY_ICONS[id]}<span class="cd"></span><kbd>${a.key.toUpperCase()}</kbd>`;
      b.addEventListener('click', () => {
        TD.Audio.unlock();
        useAbility(id);
      });
      ui.abilities.appendChild(b);
      abilityBtns[id] = b;
    }
  }

  function clearModes() {
    view.placing = view.trap = view.selected = view.ability = view.rallyFor = view.inspect = null;
    view.hero = false;
  }

  const playing = () => !inMenu && !paused && game && game.state === 'playing';

  function togglePlacing(type) {
    if (!playing()) return;
    if (view.placing === type) {
      view.placing = null;
    } else {
      clearModes();
      view.placing = type;
      if (game.gold < game.towerCost(type)) toast(`Not enough gold for a <b>${TD.TOWERS[type].name}</b> yet.`, 'bad', 1800);
    }
    TD.Audio.play('click');
    refreshAll();
  }

  function toggleTrap(type) {
    if (!playing()) return;
    if (view.trap === type) {
      view.trap = null;
    } else {
      clearModes();
      view.trap = type;
      if (game.gold < game.trapCost(type)) toast(`Not enough gold for a <b>${TD.TRAPS[type].name}</b> yet.`, 'bad', 1800);
    }
    TD.Audio.play('click');
    refreshAll();
  }

  function toggleHero() {
    if (!playing()) return;
    const was = view.hero;
    clearModes();
    view.hero = !was;
    TD.Audio.play(view.hero ? 'command' : 'click');
    refreshAll();
  }

  function useAbility(id) {
    if (!playing()) return;
    const a = TD.ABILITIES[id];
    if (!game.abilityReady(id)) {
      TD.Audio.play('error');
      toast(`${a.name} recharges in <b>${Math.ceil(game.abilities[id].cd)}s</b>.`, 'bad', 1400);
      return;
    }
    if (!a.target) {
      game.cast(id, 0, 0);
      refreshAll();
      return;
    }
    const was = view.ability;
    clearModes();
    view.ability = was === id ? null : id;
    TD.Audio.play('click');
    refreshAll();
  }

  let barKey = '';
  function refreshBar() {
    if (!game) return;
    const h = game.hero;
    const next = game.heroNextXp();
    const prev = TD.HERO_XP[h.level - 1] || 0;
    ui.heroLvl.textContent = h.level;
    ui.heroHp.style.width = (h.alive ? (h.hp / h.maxHp) * 100 : 0) + '%';
    ui.heroXp.style.width = (next == null ? 100 : ((h.xp - prev) / (next - prev)) * 100) + '%';
    ui.heroRespawn.textContent = h.alive ? '' : Math.ceil(Math.max(0, h.respawn));
    ui.heroCard.classList.toggle('dead', !h.alive);
    ui.heroCard.classList.toggle('on', view.hero);
    let key = '';
    for (const id of TD.ABILITY_ORDER) {
      const st = game.abilities[id];
      const frac = st.cd > 0 ? st.cd / (TD.ABILITIES[id].cooldown * game.mods.cooldown) : 0;
      key += id + frac.toFixed(2) + (view.ability === id) + ',';
    }
    for (const type of TD.TRAP_ORDER) key += type + (view.trap === type) + (game.gold >= game.trapCost(type));
    if (key === barKey) return;
    barKey = key;
    for (const id of TD.ABILITY_ORDER) {
      const b = abilityBtns[id], st = game.abilities[id];
      const frac = st.cd > 0 ? st.cd / (TD.ABILITIES[id].cooldown * game.mods.cooldown) : 0;
      b.style.setProperty('--cd', frac.toFixed(3));
      b.classList.toggle('cooling', frac > 0);
      b.classList.toggle('on', view.ability === id);
      b.querySelector('.cd').textContent = frac > 0 ? Math.ceil(st.cd) : '';
    }
    for (const type of TD.TRAP_ORDER) {
      const b = trapBtns[type];
      b.classList.toggle('on', view.trap === type);
      b.classList.toggle('poor', game.gold < game.trapCost(type));
      b.querySelector('.cost').textContent = game.sandbox ? 'Free' : game.trapCost(type);
    }
  }

  // ---- Info panel -------------------------------------------------------------------

  const pct = (v) => Math.round(v * 100) + '%';
  const STAT_ROWS = [
    ['estDps', () => 'Damage / sec (est.)', (v) => Math.round(v)],
    ['dmg', (t) => (t.kind === 'barracks' ? 'Soldier damage' : t.damage === 'magic' ? 'Magic damage' : 'Damage'), (v) => Math.round(v)],
    ['rate', (t) => (t.kind === 'barracks' ? 'Soldier attacks / sec' : 'Attacks / sec'), (v) => v.toFixed(2)],
    ['dps', () => 'Damage / sec', (v) => Math.round(v)],
    ['ramp', () => 'Heats up to', (v) => '×' + v],
    ['interval', () => 'Tolls every', (v) => v + 's'],
    ['range', () => 'Range', (v) => v.toFixed(1)],
    ['soldiers', () => 'Soldiers'],
    ['hp', () => 'Soldier health'],
    ['armor', () => 'Soldier armor', pct],
    ['regen', () => 'Regeneration / sec'],
    ['cleave', () => 'Cleave', pct],
    ['respawn', () => 'Respawn', (v) => v + 's'],
    ['multishot', () => 'Targets at once'],
    ['splash', () => 'Splash radius', (v) => v.toFixed(2)],
    ['burn', () => 'Burn / sec'],
    ['fireField', () => 'Burning ground', (v) => v + 's'],
    ['corrode', () => 'Armor corrosion', pct],
    ['cloud', () => 'Poison cloud', (v) => v + 's'],
    ['stun', () => 'Stun', (v) => v + 's'],
    ['slow', () => 'Slow', pct],
    ['aura', () => 'Chill aura', pct],
    ['freeze', () => 'Freeze chance', pct],
    ['chain', () => 'Chains to', (v) => v + ' foes'],
    ['stunChance', () => 'Stun chance', pct],
    ['pierce', () => 'Pierces'],
    ['crit', () => 'Crit chance (×2.5)', pct],
    ['execute', () => 'Executes below', pct],
    ['armorPen', () => 'Armor pierce', pct],
    ['bossMult', () => 'Vs. bosses & elites', (v) => '×' + v],
    ['buff', () => 'Damage blessing', (v) => '+' + pct(v)],
    ['haste', () => 'Haste', (v) => '+' + pct(v)],
    ['reach', () => 'Range blessing', (v) => '+' + pct(v)],
    ['curse', () => 'Curse (damage taken)', (v) => '+' + pct(v)],
    ['heal', () => 'Heals soldiers / sec'],
    ['income', () => 'Gold each wave', (v) => '+' + v],
    ['interest', () => 'Interest on your gold', pct],
    ['lifeEvery', () => 'Restores a life every', (v) => v + ' waves'],
  ];

  // Rough single-target damage per second before buffs and armor (null when it doesn't apply).
  const estDps = (st) => (st == null || st.dps != null ? null : st.interval ? st.dmg / st.interval
    : st.soldiers ? st.soldiers * st.dmg * st.rate : st.dmg != null && st.rate ? st.dmg * st.rate * (st.multishot || 1) : null);

  function statRows(def, s, n) {
    const merged = Object.assign({ armorPen: def.armorPen, estDps: estDps(s) }, s);
    const next = n ? Object.assign({ armorPen: def.armorPen, estDps: estDps(n) }, n) : null;
    let html = '';
    for (const [key, label, f] of STAT_ROWS) {
      const a = merged[key], b = next ? next[key] : null;
      if (a == null && b == null) continue;
      const show = f || ((v) => v);
      const changed = b != null && b !== a;
      html += `<dt>${label(def)}</dt><dd>${a != null ? show(a) : '—'}${changed ? ` <span class="up">→ ${show(b)}</span>` : ''}</dd>`;
    }
    return `<dl class="stats">${html}</dl>`;
  }

  const ABILITY_TEXT = {
    warcry: (a) => `Every ${a.interval}s, nearby foes run ${pct(a.haste)} faster for ${a.duration}s.`,
    quake: (a) => `Every ${a.interval}s, stuns and batters soldiers and heroes around it for ${a.stun}s.`,
    hex: (a) => `Every ${a.interval}s, hexes the nearest tower so it can't act for ${a.duration}s.`,
    scorch: (a) => `Every ${a.interval}s, scorches up to ${a.count} towers below so they stop for ${a.duration}s.`,
    bombard: (a) => `Every ${a.interval}s, lobs a boulder at your most valuable tower in range, burying towers around it for ${a.duration}s and battering soldiers.`,
  };

  const KIND_LABEL = { support: 'support', economy: 'economy', barracks: 'melee', pulse: 'stunning toll', aura: 'thorn aura', beam: 'magic beam' };
  const kindLabel = (def) => (KIND_LABEL[def.kind] || def.damage + ' damage') + (def.faction ? ' · faction tower' : '') + (def.ground ? ' · ground only' : '');

  let infoKey = '';
  function refreshInfo() {
    const t = view.selected;
    let key;
    if (inMenu || !game) key = 'none';
    else if (view.placing) key = 'p' + view.placing + (game.gold >= game.towerCost(view.placing));
    else if (view.trap) key = 'trap' + view.trap;
    else if (view.hero) key = 'hero' + game.hero.level;
    else if (view.inspect) {
      if (!view.inspect.alive) view.inspect = null;
      key = view.inspect ? 'foe' + view.inspect.id : 'hint';
    }
    else if (t) {
      const branches = game.canBranch(t) ? Object.keys(t.def.branches).map((b) => game.gold >= game.branchCost(t, b)).join() : '';
      key = ['t', t.id, game.tier(t), t.vet, t.mode, game.gold >= (game.upgradeCost(t) ?? Infinity), branches, game.state, !!view.rallyFor, game.fullRefund(t), game.sellValue(t)].join();
    } else key = 'hint';
    if (key !== infoKey) {
      infoKey = key;
      renderInfo(t);
    }
    refreshLiveInfo(t);
  }

  function renderInfo(t) {
    if (view.placing) {
      const def = TD.TOWERS[view.placing];
      ui.info.innerHTML = `
        <div class="head"><div><h3>${def.name}</h3><div class="sub"><span class="coin-i">${fmt(game.towerCost(view.placing))}</span> · ${kindLabel(def)}</div></div></div>
        <p>${def.blurb}</p>
        ${statRows(def, game.levelStats(view.placing, 0))}
        <p class="tip">Click a highlighted tile to build. <b>Shift</b>+click keeps building. <b>Esc</b> or right-click cancels.</p>`;
      ui.info.querySelector('.head').prepend(TD.Render.towerIcon(view.placing, 0, 56));
      return;
    }
    if (view.trap) {
      const def = TD.TRAPS[view.trap];
      ui.info.innerHTML = `
        <div class="head"><div><h3>${def.name}</h3><div class="sub"><span class="coin-i">${fmt(game.trapCost(view.trap))}</span> · trap</div></div></div>
        <p>${def.blurb}</p>
        <p class="tip">Click a road tile to lay it. Traps grow stronger in later waves. Flyers pass over them.</p>`;
      ui.info.querySelector('.head').prepend(trapIcon(view.trap, 56));
      return;
    }
    if (view.inspect) {
      const e = view.inspect, d = e.def;
      const tags = [d.boss && 'Boss', e.elite && TD.ELITES[e.elite].name + ' elite', d.fly && 'Flying', d.noBlock && 'Slips past soldiers', d.minion && 'Summoned']
        .filter(Boolean);
      const traits = [];
      if (d.heal) traits.push(['Heals allies', `Restores ${pct(d.heal.amount)} health to nearby foes every ${d.heal.interval}s.`]);
      if (d.summon) traits.push(['Summoner', `Raises ${d.summon.count} thralls every ${d.summon.interval}s.`]);
      if (d.raise) traits.push(['Raise Dead', `Ground foes that fall within ${d.raise.radius} tiles rise again as Revenants.`]);
      if (d.rage) traits.push(['Enrages', 'Runs 80% faster below half health.']);
      if (d.ability) traits.push([d.ability.name, ABILITY_TEXT[d.ability.type](d.ability)]);
      if (e.regen) traits.push(['Regenerates', `${pct(e.regen)} of its health per second while not being hit.`]);
      ui.info.innerHTML = `
        <div class="head"><span class="hero-pic"><img src="${enemySrc(e.type)}" alt=""></span><div><h3>${d.name}</h3><div class="sub">${tags.join(' · ') || 'Foe'}</div></div></div>
        <div class="xpbar hpbar"><i data-live="ehp"></i><span data-live="ehptext"></span></div>
        <dl class="stats">
          <dt>Armor</dt><dd data-live="earmor"></dd>
          <dt>Magic resist</dt><dd>${pct(e.mres)}</dd>
          <dt>Speed</dt><dd data-live="espeed"></dd>
          <dt>Lives lost if it gets through</dt><dd>${d.lives}</dd>
          <dt>Bounty</dt><dd>${Math.round(d.gold * game.mods.bounty * (e.elite ? 2 : 1))}</dd>
        </dl>
        ${traits.length ? `<div class="skills">${traits.map(([name, text]) => `<div class="skill"><b>${name}</b><span>${text}</span></div>`).join('')}</div>` : ''}
        <div class="statuses" data-live="estatus"></div>
        <p class="tip">${d.blurb}</p>`;
      return;
    }
    if (view.hero) {
      const H = game.heroDef, h = game.hero;
      const skills = Object.values(H.skills).map((k) => `<div class="skill ${h.level >= k.level ? '' : 'locked'}">
        <b>${k.name}</b> <small>${h.level >= k.level ? `${k.cooldown}s cooldown` : `unlocks at level ${k.level}`}</small><span>${k.blurb}</span></div>`).join('');
      ui.info.innerHTML = `
        <div class="head"><span class="hero-pic"><img src="assets/units/${H.sprite}.png" alt=""></span><div><h3>${H.name}</h3><div class="sub">Level ${h.level} ${H.title} · ${H.ranged ? 'ranged' : 'melee'}</div></div></div>
        <div class="xpbar"><i data-live="xp"></i><span data-live="xptext"></span></div>
        <dl class="stats">
          <dt>Health</dt><dd data-live="hp"></dd>
          <dt>Damage</dt><dd>${Math.round(h.dmg)}</dd>
          <dt>Attacks / sec</dt><dd>${H.rate}</dd>
          <dt>Armor</dt><dd>${pct(H.armor)}</dd>
          <dt>Regeneration / sec</dt><dd>${H.regen}</dd>
          ${H.ranged ? `<dt>Range</dt><dd>${H.ranged.range}</dd>` : ''}
          <dt>Damage dealt</dt><dd data-live="hdmg"></dd>
        </dl>
        <div class="skills">${skills}</div>
        <p class="tip">Click anywhere on the map to send ${H.name.split(' ').pop()} there. Heroes level up as foes fall near them and respawn at the keep.</p>`;
      return;
    }
    if (t) {
      const def = t.def;
      const tier = game.tier(t);
      const maxTier = def.branches ? 5 : def.levels.length;
      const cost = game.upgradeCost(t);
      const vet = game.canVeteran(t);
      const s = game.towerStats(t);
      let next = null;
      if (vet) next = game.levelStats(t.type, t.level, t.branch, t.blevel, t.vet + 1);
      else if (cost != null) next = t.branch ? game.levelStats(t.type, t.level, t.branch, t.blevel + 1) : game.levelStats(t.type, t.level + 1);
      const vetGain = Math.round((TD.VETERAN.mult - 1) * 100);
      const attacks = !def.kind || def.kind === 'beam';
      const modes = TD.TARGET_MODES.map((m) => `<button data-mode="${m}" class="${t.mode === m ? 'on' : ''}">${MODE_LABEL[m]}</button>`).join('');
      let branchHtml = '';
      if (game.canBranch(t)) {
        branchHtml = `<div class="branch-title">Choose a specialization</div><div class="branches">` +
          Object.entries(def.branches).map(([id, b]) => {
            const c = game.branchCost(t, id);
            return `<button class="branch" data-branch="${id}" ${game.gold < c ? 'disabled' : ''}>
              <span class="b-icon" data-icon="${id}"></span>
              <b>${b.name}</b><small>${b.blurb}</small><span class="cost">${fmt(c)}</span>
            </button>`;
          }).join('') + '</div>';
      }
      const full = game.fullRefund(t);
      ui.info.innerHTML = `
        <div class="head"><div><h3>${game.towerName(t)}</h3><div class="stars">${starStr(tier + 1, maxTier)}${t.vet ? `<span class="vet">Veteran ${t.vet}</span>` : ''}</div><div class="sub">${t.branch ? def.name + ' · ' : ''}${kindLabel(def)}</div></div></div>
        ${statRows(def, s, next)}
        ${def.kind === 'economy' || def.kind === 'support' ? '' : '<div class="live-stats" data-live="tstats"></div>'}
        ${branchHtml}
        ${vet ? `<p class="tip">Fully upgraded. <b>Veteran ranks</b> add ${vetGain}% ${def.kind === 'barracks' ? 'damage and soldier health' : 'damage'} each, with no limit.</p>` : ''}
        ${attacks ? `<div class="target-row"><span>Target</span><div class="seg">${modes}</div></div>` : ''}
        ${def.kind === 'barracks' ? `<button class="btn rally-btn ${view.rallyFor ? 'on' : ''}" data-act="rally">${view.rallyFor ? 'Click the road to set the rally point…' : 'Move rally point'}</button>` : ''}
        <div class="actions">
          ${game.canBranch(t) ? '' : `<button class="btn gold" data-act="upgrade" ${cost == null || game.gold < cost ? 'disabled' : ''}>
            ${cost == null ? 'Max level' : vet ? 'Veteran rank' : 'Upgrade'}${cost != null ? `<small><span class="coin-i">${fmt(cost)}</span> · U</small>` : ''}
          </button>`}
          <button class="btn red ${full ? 'refund' : ''}" data-act="sell">${full ? 'Undo' : 'Sell'}<small><span class="coin-i">${game.sellValue(t)}</span>${full ? ' · full refund' : ' · Del'}</small></button>
        </div>`;
      ui.info.querySelector('.head').prepend(TD.Render.towerIcon(t.type, tier, 56, t.branch));
      for (const el of ui.info.querySelectorAll('[data-icon]')) el.appendChild(TD.Render.towerIcon(t.type, 3, 40, el.dataset.icon));
      return;
    }
    ui.info.innerHTML = `
      <h2>Orders</h2>
      <p>Pick a tower and build it beside the road. Click a tower to upgrade it, change its target or sell it.</p>
      <p class="tip">Press <b>H</b> (or click your hero) to command them. Key <b>9</b> builds your faction\u2019s own tower. Lay <b>traps</b> on the road with <b>Z X C V</b>.</p>
      <p class="tip"><b>Armor</b> blunts arrows, boulders and bolts. <b>Magic</b> ignores it. <b>Flyers</b> follow the dashed lanes and dodge catapults, alchemists, soldiers and traps.</p>
      <p class="tip"><b>Click a foe</b> to inspect it. Combos: heavy hits <b>shatter</b> frozen foes; burning foes <b>ignite</b> tar pits.</p>
      <p class="tip">Changed your mind? Selling refunds <b>everything</b> spent before the next wave starts.</p>`;
  }

  // Numbers that change every frame are patched in place instead of rebuilding the panel.
  function refreshLiveInfo(t) {
    if (view.inspect && game) {
      const e = view.inspect, now = game.time;
      const set = (k, v) => { const el = ui.info.querySelector(`[data-live="${k}"]`); if (el && el.innerHTML !== v) el.innerHTML = v; };
      const bar = ui.info.querySelector('[data-live="ehp"]');
      if (bar) bar.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      set('ehptext', `${Math.max(0, Math.ceil(e.hp))} / ${e.maxHp}`);
      const armor = game.armorOf(e);
      set('earmor', pct(armor) + (armor < e.armor ? ' <span class="up">(corroded)</span>' : ''));
      set('espeed', e.held ? 'held in place' : game.speedOf(e).toFixed(2));
      const st = [];
      if (e.stunUntil > now) st.push(e.frozen ? 'Frozen' : 'Stunned');
      else if (e.slowUntil > now) st.push('Slowed');
      if (e.burnUntil > now) st.push('Burning');
      if (e.corrodeUntil > now) st.push('Corroded');
      if (e.curse > 0) st.push('Cursed');
      if (e.hasteUntil > now) st.push('Hasted');
      set('estatus', st.map((x) => `<span class="chip-s s-${x.toLowerCase()}">${x}</span>`).join(''));
    } else if (view.hero && game) {
      const h = game.hero, next = game.heroNextXp(), prev = TD.HERO_XP[h.level - 1] || 0;
      const set = (k, v) => { const el = ui.info.querySelector(`[data-live="${k}"]`); if (el) el.textContent = v; };
      const xp = ui.info.querySelector('[data-live="xp"]');
      if (xp) xp.style.width = (next == null ? 100 : ((h.xp - prev) / (next - prev)) * 100) + '%';
      set('xptext', next == null ? 'Max level' : `XP ${Math.floor(h.xp)} / ${next}`);
      set('hp', h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}` : `Respawning in ${Math.ceil(h.respawn)}s`);
      set('hdmg', `${big(h.dmgDealt)} · ${h.kills} kills`);
    } else if (t) {
      const el = ui.info.querySelector('[data-live="tstats"]');
      if (el) el.textContent = `Damage dealt ${big(t.dmgDealt)} · ${t.kills} kills`;
    }
  }

  ui.info.addEventListener('click', (e) => {
    const t = view.selected;
    if (!t || !game) return;
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      t.mode = mode.dataset.mode;
      TD.Audio.play('click');
      infoKey = '';
      return;
    }
    const br = e.target.closest('[data-branch]');
    if (br) {
      if (!game.chooseBranch(t, br.dataset.branch)) TD.Audio.play('error');
      refreshAll();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'upgrade') doUpgrade();
    else if (act.dataset.act === 'sell') doSell();
    else if (act.dataset.act === 'rally') {
      view.rallyFor = view.rallyFor ? null : t;
      TD.Audio.play('click');
      refreshAll();
    }
  });

  function doUpgrade() {
    const t = view.selected;
    if (!t) return;
    if (game.canBranch(t)) {
      toast('Choose a specialization in the panel on the right.', '', 1800);
      return;
    }
    if (!game.upgrade(t)) TD.Audio.play('error');
    refreshAll();
  }

  function doSell() {
    const t = view.selected;
    if (!t) return;
    game.sell(t);
    clearModes();
    refreshAll();
  }

  // ---- Next wave panel ---------------------------------------------------------------

  let nextKey = '';
  function refreshNext() {
    const key = game ? game.wave + ':' + game.map.id + ':' + inMenu + ':' + game.mode : 'none';
    if (key === nextKey) return;
    nextKey = key;
    const groups = game && game.nextWaveGroups();
    if (!groups) {
      ui.next.innerHTML = `<div class="muted">No more waves. Hold the line!</div>`;
      return;
    }
    const counts = {};
    for (const [type, n] of groups) counts[type] = (counts[type] || 0) + n;
    let html = Object.entries(counts).map(([type, n]) => {
      const def = TD.ENEMIES[type];
      const tag = def.boss ? '<span class="tag boss">Boss</span>' : !game.seen.has(type) ? '<span class="tag">New</span>' : def.fly ? '<span class="tag fly">Flying</span>' : '';
      return `<div class="foe" title="${def.name}: ${def.blurb}"><span class="pic"><img src="${enemySrc(type)}" alt=""></span><span class="n">×${n}</span><span class="nm">${def.name}</span>${tag}</div>`;
    }).join('');
    const elite = game.endless ? TD.eliteChance(game.wave + 1) : 0;
    if (elite) html += `<div class="muted elite-note">${Math.round(elite * 100)}% chance each foe is an elite</div>`;
    ui.next.innerHTML = html;
  }

  // ---- HUD -------------------------------------------------------------------------

  let lastGold = null, lastLives = null, waveLabel = '', chipKey = '';
  function refreshHud() {
    if (!game) return;
    const gold = game.gold === Infinity ? Infinity : Math.floor(game.gold);
    if (gold !== lastGold) {
      if (lastGold != null && gold > lastGold && !inMenu && !TD.settings.coins) bump(ui.gold, 'bump');
      ui.gold.textContent = fmt(gold);
      lastGold = gold;
      for (const type in cards) {
        cards[type].classList.toggle('poor', gold < game.towerCost(type));
        cards[type].querySelector('.cost').textContent = game.sandbox ? 'Free' : fmt(game.towerCost(type));
      }
      if (!game.sandbox && !inMenu && gold >= 2000) trophies.unlock('hoarder');
    }
    if (game.lives !== lastLives) {
      if (lastLives != null && game.lives < lastLives) bump(ui.lives, 'hurt');
      ui.lives.textContent = fmt(game.lives);
      lastLives = game.lives;
    }
    ui.wave.textContent = game.wave;
    ui.wavesWrap.style.display = game.endless ? 'none' : '';
    ui.waves.textContent = game.totalWaves;
    const ck = inMenu ? '' : game.mode + game.map.id;
    if (ck !== chipKey) {
      chipKey = ck;
      const best = store.get('endless', {})[game.map.id];
      ui.chip.textContent = inMenu ? '' : game.mode === 'endless' ? `Endless${best ? ' · best ' + best : ''}` : game.mode === 'sandbox' ? 'Sandbox' : '';
      ui.chip.style.display = ui.chip.textContent ? '' : 'none';
    }
    for (const type in cards) cards[type].classList.toggle('on', view.placing === type);

    let label, enabled = false, pulse = false;
    if (inMenu) {
      label = 'Choose a map';
    } else if (game.state !== 'playing') {
      label = game.state === 'won' ? 'Victory!' : 'Defeat';
    } else if (game.canCallWave()) {
      enabled = true;
      const bonus = game.earlyBonus();
      const b = bonus ? `<span class="bonus">+${bonus}</span>` : '';
      if (game.wave === 0) { label = 'Start Wave 1'; pulse = true; }
      else if (game.sandbox) label = `Send wave ${game.wave + 1}`;
      else if (game.countdown != null) label = `Wave ${game.wave + 1} in ${Math.ceil(game.countdown)}s ${b}`;
      else label = `Call wave ${game.wave + 1} early ${b}`;
    } else if (game.wave >= game.totalWaves) {
      label = 'Final wave!';
    } else {
      label = 'Wave incoming…';
    }
    const key = label + enabled + pulse;
    if (key !== waveLabel) {
      waveLabel = key;
      ui.waveBtn.innerHTML = label;
      ui.waveBtn.disabled = !enabled;
      ui.waveBtn.classList.toggle('pulse', pulse);
    }
    ui.command.style.visibility = inMenu ? 'hidden' : '';
    refreshBar();
    refreshInfo();
    refreshNext();
  }

  function refreshAll() {
    infoKey = nextKey = waveLabel = barKey = chipKey = '';
    lastGold = lastLives = null;
    refreshHud();
    ui.speedBtns.forEach((b) => b.classList.toggle('on', +b.dataset.speed === speed));
    ui.autoBtn.classList.toggle('active', !!TD.settings.autoWave);
    ui.pauseBtn.classList.toggle('active', paused);
    ui.canvas.classList.toggle('placing', !!(view.placing || view.trap || view.ability || view.rallyFor || view.hero));
  }

  // ---- Simulation events ---------------------------------------------------------------

  const FIRE_SOUND = { arrow: 'arrow', stone: 'stoneLaunch', firepot: 'stoneLaunch', flask: 'flaskThrow', orb: 'orb', ice: 'orb', holy: 'orb', bolt: 'bolt' };
  const CAST_SOUND = { meteor: 'meteorFall', reinforce: 'reinforce', frost: 'freeze', horn: 'hornCall' };

  function processEvents() {
    for (const ev of game.events) {
      renderer.handle(ev);
      trophies.onEvent(ev);
      switch (ev.type) {
        case 'fire': if (FIRE_SOUND[ev.kind]) TD.Audio.play(FIRE_SOUND[ev.kind]); break;
        case 'lightning': TD.Audio.play('lightning'); break;
        case 'splash': TD.Audio.play(ev.kind === 'flask' ? 'flask' : ev.kind === 'firepot' ? 'firepot' : 'stoneHit'); break;
        case 'hit': if (ev.kind === 'arrow') TD.Audio.play('hit'); break;
        case 'crit': TD.Audio.play('crit'); break;
        case 'chain': TD.Audio.play('chain'); break;
        case 'melee': TD.Audio.play('melee'); break;
        case 'kill':
          TD.Audio.play(ev.boss ? 'upgrade' : 'kill');
          flyCoin(ev.x, ev.y - (ev.fly ? 0.55 : 0.2));
          break;
        case 'heal': TD.Audio.play('heal'); break;
        case 'summon': TD.Audio.play('summon'); break;
        case 'raise': TD.Audio.play('summon'); break;
        case 'shellHit': TD.Audio.play('stoneHit'); break;
        case 'leak': TD.Audio.play('leak'); break;
        case 'build': TD.Audio.play('build'); break;
        case 'trap': TD.Audio.play('build'); break;
        case 'spike': TD.Audio.play('spike'); break;
        case 'keg': TD.Audio.play('keg'); break;
        case 'barricadeDown':
          TD.Audio.play('barricade');
          toast('A barricade has been smashed!', 'bad', 1600);
          break;
        case 'upgrade': TD.Audio.play('upgrade'); break;
        case 'sell': TD.Audio.play('sell'); break;
        case 'income': TD.Audio.play('coin'); break;
        case 'heroSkill':
          TD.Audio.play({ whirlwind: 'whirlwind', rally: 'heal', slam: 'keg', ironskin: 'upgrade', volley: 'arrow', snare: 'chain', nova: 'freeze', storm: 'lightning', mend: 'heal', sanctify: 'freeze', turret: 'build', charge: 'keg' }[ev.skill]);
          break;
        case 'bell': TD.Audio.play('bell'); break;
        case 'lifeRestored':
          TD.Audio.play('heal');
          toast('The granary feeds the garrison: <b>+1 life</b>.', 'gold', 1800);
          break;
        case 'gateHeld': TD.Audio.play('barricade'); break;
        case 'bossAbility': {
          TD.Audio.play({ warcry: 'wave', quake: 'keg', hex: 'summon', scorch: 'firepot', bombard: 'stoneLaunch' }[ev.ability]);
          if (!shown['ability:' + ev.ability]) {
            shown['ability:' + ev.ability] = true;
            const d = TD.ENEMIES[ev.enemy];
            toast(`<img src="${enemySrc(ev.enemy)}" alt=""><span><b>${d.ability.name}!</b> ${ABILITY_TEXT[ev.ability](d.ability)}</span>`, 'bad', 4500);
          }
          break;
        }
        case 'shatter':
          TD.Audio.play('flask');
          if (!shown.shatter) { shown.shatter = true; toast('<span><b>Shatter!</b> Heavy hits on frozen foes deal 50% extra damage.</span>', 'gold', 3500); }
          break;
        case 'tarIgnite':
          TD.Audio.play('firepot');
          if (!shown.ignite) { shown.ignite = true; toast('<span><b>Ignite!</b> A burning foe set the tar pit ablaze.</span>', 'gold', 3500); }
          break;
        case 'heroMove': TD.Audio.play('command'); break;
        case 'heroLevel':
          TD.Audio.play('heroLevel');
          for (const k of Object.values(game.heroDef.skills)) {
            if (k.level === ev.level) toast(`<span><b>${game.heroDef.name}</b> learned <b>${k.name}</b>!</span>`, 'gold', 3000);
          }
          break;
        case 'soldierDown':
          if (ev.hero) {
            TD.Audio.play('heroDown');
            toast(`<span><b>${game.heroDef.name}</b> has fallen and will return to the keep shortly.</span>`, 'bad', 2500);
          } else if (!ev.expired) TD.Audio.play('soldierDown');
          break;
        case 'meteor': TD.Audio.play('meteor'); break;
        case 'cast':
          TD.Audio.play(CAST_SOUND[ev.ability]);
          if (ev.ability === 'horn') banner('War Horn!', 'Towers attack 40% faster', false);
          break;
        case 'bonus':
          TD.Audio.play('coin');
          toast(`Early call bonus <b class="coin-i">+${ev.gold}</b>`, 'gold', 1800);
          break;
        case 'waveClear':
          if (!ev.gold) break;
          TD.Audio.play('coin');
          toast(`Wave ${ev.wave} repelled! <b class="coin-i">+${ev.gold}</b>`, 'gold', 2200);
          break;
        case 'wave': {
          const groups = game.wavesFor(ev.wave);
          const bossType = groups.map(([type]) => type).find((type) => TD.ENEMIES[type].boss);
          TD.Audio.play(bossType ? 'boss' : 'wave');
          if (bossType) banner(`Wave ${ev.wave}`, `The ${TD.ENEMIES[bossType].name} ${TD.ENEMIES[bossType].fly ? 'takes to the sky' : 'rides to battle'}!`, true);
          else banner(`Wave ${ev.wave}`, ev.wave === game.totalWaves ? 'The final assault!' : '');
          if (game.endless && ev.wave === 12) {
            toast('<span><b>Elite foes appear!</b> Coloured rings mark giant, swift, armored and regenerating foes. They pay double.</span>', 'bad', 6000);
          }
          saves.put();
          break;
        }
        case 'newEnemy': {
          const def = TD.ENEMIES[ev.enemy];
          codex.see(ev.enemy);
          if (game.wave > 1 && !shown[ev.enemy] && !def.minion) {
            shown[ev.enemy] = true;
            toast(`<img src="${enemySrc(ev.enemy)}" alt=""><span><b>New foe: ${def.name}.</b> ${def.blurb}</span>`, def.boss ? 'bad' : '', 4200);
          }
          break;
        }
        case 'won':
        case 'lost': {
          TD.Audio.play(ev.type === 'won' ? 'win' : 'lose');
          const ended = game;
          saves.clear();
          setTimeout(() => { if (game === ended && !inMenu) showResult(); }, 900);
          break;
        }
      }
    }
    game.events.length = 0;
  }

  // ---- Input -------------------------------------------------------------------------

  function worldFromEvent(e) {
    const r = ui.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * TD.COLS, y: ((e.clientY - r.top) / r.height) * TD.ROWS };
  }

  const overHero = (m) => game.hero.alive && Math.hypot(m.x - game.hero.x, m.y - (game.hero.y - 0.35)) < 0.45;

  ui.canvas.addEventListener('pointermove', (e) => {
    const m = worldFromEvent(e);
    view.mouse = m;
    view.hover = { x: Math.floor(m.x), y: Math.floor(m.y) };
    if (game && !inMenu) {
      view.hoverTower = game.towerAt(view.hover.x, view.hover.y);
      const busy = view.placing || view.trap || view.ability || view.rallyFor;
      ui.canvas.classList.toggle('pointing', !busy && (!!view.hoverTower || overHero(m)));
    }
  });
  ui.canvas.addEventListener('pointerleave', () => { view.hover = null; view.mouse = null; view.hoverTower = null; });
  ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.canvas.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    TD.Audio.unlock();
    if (e.button === 2) { cancel(); return; }
    const m = worldFromEvent(e);
    const c = { x: Math.floor(m.x), y: Math.floor(m.y) };
    view.mouse = m;
    view.hover = c;
    if (view.ability) {
      const id = view.ability;
      if (game.cast(id, m.x, m.y)) view.ability = null;
      else {
        TD.Audio.play('error');
        if (TD.ABILITIES[id].target === 'road') toast('Call to Arms must target the road.', 'bad', 1500);
      }
    } else if (view.rallyFor) {
      if (game.setRally(view.rallyFor, m.x, m.y)) { view.rallyFor = null; TD.Audio.play('click'); }
      else {
        TD.Audio.play('error');
        toast('Pick a spot on the road inside the barracks’ range.', 'bad', 1500);
      }
    } else if (view.trap) {
      const type = view.trap;
      if (!game.canPlaceTrap(c.x, c.y)) {
        TD.Audio.play('error');
        toast('Traps go on empty road tiles.', 'bad', 1400);
      } else if (game.gold < game.trapCost(type)) {
        TD.Audio.play('error');
        toast(`Not enough gold — a ${TD.TRAPS[type].name} costs <b class="coin-i">${game.trapCost(type)}</b>`, 'bad', 1800);
      } else {
        game.placeTrap(type, c.x, c.y);
        if (!e.shiftKey || game.gold < game.trapCost(type)) view.trap = null;
      }
    } else if (view.placing) {
      const type = view.placing;
      if (game.canPlace(c.x, c.y)) {
        const cost = game.towerCost(type);
        if (game.gold < cost) {
          TD.Audio.play('error');
          toast(`Not enough gold — a ${TD.TOWERS[type].name} costs <b class="coin-i">${cost}</b>`, 'bad', 1800);
        } else {
          game.build(type, c.x, c.y);
          if (!e.shiftKey || game.gold < cost) view.placing = null;
        }
      } else {
        const t = game.towerAt(c.x, c.y);
        if (t) { view.placing = null; view.selected = t; TD.Audio.play('click'); }
        else TD.Audio.play('error');
      }
    } else if (view.hero) {
      const t = game.towerAt(c.x, c.y);
      if (t) { clearModes(); view.selected = t; TD.Audio.play('click'); }
      else if (!overHero(m)) {
        if (!game.hero.alive) toast(`${game.heroDef.name} is still recovering at the keep.`, 'bad', 1400);
        else game.moveHero(m.x, m.y);
      }
    } else if (overHero(m)) {
      clearModes();
      view.hero = true;
      TD.Audio.play('command');
    } else {
      const foe = enemyAt(m);
      clearModes();
      if (foe) {
        view.inspect = foe;
        TD.Audio.play('click');
      } else {
        const t = game.towerAt(c.x, c.y);
        if (t) TD.Audio.play('click');
        view.selected = t;
      }
    }
    refreshAll();
  });

  // The foe drawn under the cursor, if any (flyers are drawn higher up).
  function enemyAt(m) {
    let best = null, bd = Infinity;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const cy = e.def.fly ? e.y - 0.6 : e.y - 0.3 * Math.max(1, e.scale / 0.65);
      const r = 0.4 * Math.max(1, e.scale);
      const d2 = (m.x - e.x) ** 2 + (m.y - cy) ** 2;
      if (d2 < r * r && d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  function cancel() {
    if (view.ability || view.rallyFor) {
      view.ability = view.rallyFor = null;
      refreshAll();
      return true;
    }
    if (view.placing || view.trap || view.selected || view.hero || view.inspect) {
      clearModes();
      refreshAll();
      return true;
    }
    return false;
  }

  function callWave() {
    if (!game || inMenu || paused) return;
    TD.Audio.unlock();
    if (!game.callWave(true)) TD.Audio.play('error');
    refreshAll();
  }

  function setSpeed(s) {
    speed = s;
    store.set('speed', s);
    refreshAll();
  }

  function toggleAuto() {
    TD.settings.autoWave = !TD.settings.autoWave;
    saveSettings();
    toast(TD.settings.autoWave ? 'Auto-waves <b>on</b>: each wave is called as soon as the last has spawned.' : 'Auto-waves <b>off</b>.', '', 1800);
  }

  ui.waveBtn.addEventListener('click', callWave);
  ui.pauseBtn.addEventListener('click', () => setPaused(!paused));
  ui.autoBtn.addEventListener('click', () => { TD.Audio.unlock(); toggleAuto(); });
  ui.heroCard.addEventListener('click', () => { TD.Audio.unlock(); toggleHero(); });
  ui.settingsBtn.addEventListener('click', () => {
    TD.Audio.unlock();
    if (inMenu) { showSettings('menu'); return; }
    if (!game || game.state !== 'playing') return;
    const fromPause = paused;
    paused = true;
    showSettings(fromPause ? 'pause' : 'game');
  });
  ui.speedBtns.forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));

  // ---- Cheat menu (^) -------------------------------------------------------------

  const cheatPanel = document.createElement('div');
  cheatPanel.id = 'cheats';
  cheatPanel.innerHTML = `
    <div class="cheat-head"><b>Cheats</b><button data-cheat="close" title="Close (^)">×</button></div>
    <div class="cheat-row">
      <button data-cheat="gold" data-n="100">+100</button>
      <button data-cheat="gold" data-n="1000">+1k</button>
      <button data-cheat="gold" data-n="10000">+10k</button>
    </div>
    <form class="cheat-row" data-cheat-form>
      <input type="text" inputmode="numeric" autocomplete="off" placeholder="Amount" aria-label="Gold amount">
      <button type="submit">Give gold</button>
    </form>
    <div class="cheat-row">
      <button data-cheat="lives">+10 lives</button>
      <button data-cheat="abilities">Recharge abilities</button>
    </div>
    <div class="cheat-row">
      <button data-cheat="kill">Slay all foes</button>
      <button data-cheat="hero">Hero +1 level</button>
    </div>
    <div class="cheat-row">
      <button data-cheat="glory">+100 Glory</button>
    </div>
    <small>Runs where you cheat don't earn trophies.</small>`;
  document.body.appendChild(cheatPanel);

  function toggleCheats(force) {
    const open = force != null ? force : !cheatPanel.classList.contains('open');
    cheatPanel.classList.toggle('open', open);
    // Never focus the amount box here: a pending ^ dead key would leak into it.
    if (!open && cheatPanel.contains(document.activeElement)) document.activeElement.blur();
  }

  function giveGold(n) {
    if (!game || inMenu || game.state !== 'playing' || !(n > 0)) return false;
    game.gold += Math.floor(n);
    game.cheated = true;
    return true;
  }

  function cheat(kind, n) {
    if (kind === 'close') { toggleCheats(false); return; }
    if (kind === 'glory') {
      progress.addGlory(100);
      toast('<b class="glory-i">+100</b> Glory', 'gold', 1400);
      if (inMenu) showMenu();
      return;
    }
    if (!game || inMenu || game.state !== 'playing') {
      toast('Start a game to use that cheat.', 'bad', 1400);
      return;
    }
    game.cheated = true;
    if (kind === 'gold') {
      giveGold(n);
    } else if (kind === 'lives') {
      game.lives += 10;
    } else if (kind === 'abilities') {
      for (const id in game.abilities) game.abilities[id].cd = 0;
    } else if (kind === 'kill') {
      for (const e of game.enemies) if (e.alive) game.kill(e, null);
    } else if (kind === 'hero') {
      const next = game.heroNextXp();
      if (next == null) toast(`${game.heroDef.name} is already at max level.`, '', 1400);
      else game.gainXp(next - game.hero.xp);
    }
    TD.Audio.play('coin');
    refreshAll();
  }

  cheatPanel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cheat]');
    if (b) cheat(b.dataset.cheat, +b.dataset.n || 0);
  });
  const amountBox = cheatPanel.querySelector('input');
  amountBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    cheatPanel.querySelector('[data-cheat-form]').requestSubmit();
  });
  cheatPanel.querySelector('[data-cheat-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = amountBox;
    // Ignore anything that isn't a digit (e.g. a stray ^ from the dead key, or 10.000).
    const n = Math.floor(+input.value.replace(/\D/g, ''));
    if (n > 0) cheat('gold', n);
    else TD.Audio.play('error');
    input.select();
  });

  // ^ is a dead key on German layouts and browsers report it differently, so match the
  // character, any dead key except the accent key, and the physical key left of 1
  // (Backquote, or IntlBackslash on Mac ISO keyboards).
  const isCaret = (e) => e.key === '^' || e.key === '°' || (e.key === 'Dead' && e.code !== 'Equal') ||
    e.code === 'Backquote' || e.code === 'IntlBackslash';
  let caretHandled = false;

  // Some browsers only report the dead key on release, so keyup toggles when keydown didn't.
  window.addEventListener('keyup', (e) => {
    if (!isCaret(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!caretHandled) toggleCheats();
    caretHandled = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isCaret(e)) {
      e.preventDefault();
      if (!e.repeat) toggleCheats();
      caretHandled = true;
      return;
    }
    if (e.target.closest && e.target.closest('input')) {
      if (e.key === 'Escape') toggleCheats(false);
      return;
    }
    TD.Audio.unlock();
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (overlayReturn) return;
      setPaused(!paused);
      return;
    }
    if (k === 'escape') {
      if (overlayReturn) return;
      if (paused) setPaused(false);
      else if (!cancel()) setPaused(true);
      return;
    }
    if (k === 'm') {
      TD.Audio.setMuted(!TD.Audio.muted);
      toast(TD.Audio.muted ? 'Sound muted (M)' : 'Sound on', '', 1200);
      return;
    }
    if (!playing()) return;
    const type = game.towerTypes().find((t) => TD.TOWERS[t].key === k);
    const ability = TD.ABILITY_ORDER.find((a) => TD.ABILITIES[a].key === k);
    const trap = TD.TRAP_ORDER.find((t) => TD.TRAPS[t].key === k);
    if (type) togglePlacing(type);
    else if (ability) useAbility(ability);
    else if (trap) toggleTrap(trap);
    else if (k === TD.HERO_KEY) toggleHero();
    else if (k === 'u') doUpgrade();
    else if (k === 'delete' || k === 'backspace') doSell();
    else if (k === 'n') callWave();
    else if (k === 'a') toggleAuto();
    else if (k === 'f') setSpeed(TD.SPEEDS[(TD.SPEEDS.indexOf(speed) + 1) % TD.SPEEDS.length]);
    else if (k === 't' && view.selected && !view.selected.def.kind) {
      const m = TD.TARGET_MODES;
      view.selected.mode = m[(m.indexOf(view.selected.mode) + 1) % m.length];
      refreshAll();
    }
  });

  // Keep the save fresh when the tab is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden) saves.put(); });
  window.addEventListener('pagehide', () => saves.put());

  // ---- Main loop ---------------------------------------------------------------------

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    if (game) {
      const running = !inMenu && !paused && game.state === 'playing';
      if (running) {
        acc += dt * speed;
        let steps = 0;
        while (acc >= STEP && steps < 24) {
          game.update(STEP);
          acc -= STEP;
          steps++;
        }
        if (steps >= 24) acc = 0;
        if (TD.settings.autoWave && game.wave > 0 && game.canCallWave() && !game.sandbox) game.callWave(true);
        processEvents();
        saveTimer += dt;
        if (saveTimer > 5) { saveTimer = 0; saves.put(); trophies.flush(); }
      }
      const vdt = paused ? 0 : dt * (inMenu ? 1 : speed);
      vtime += vdt;
      if (view.selected && !game.towers.includes(view.selected)) clearModes();
      renderer.draw(game, inMenu ? {} : view, vdt, vtime);
      refreshHud();
    }
    requestAnimationFrame(frame);
  }

  // ---- Boot --------------------------------------------------------------------------

  TD.Audio.setVolume(TD.settings.volume);
  window.addEventListener('resize', fit);
  fit();
  TD.Render.load((p) => {
    const el = document.getElementById('load-pct');
    if (el) el.textContent = Math.round(p * 100) + '%';
  }).then(() => {
    buildAbilityBar();
    buildTrapBar();
    showMenu();
    fit();
    requestAnimationFrame(frame);
    // Hooks for automated smoke tests.
    window.__htk = { get game() { return game; }, startGame, view, setSpeed, showArmory, showTrophies, showCodex, showSettings, progress, trophies, saves, continueGame };
  });
})();
