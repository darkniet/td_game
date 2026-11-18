// Bootstraps the game: DOM wiring, input, HUD, menus and the main loop.
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
  };

  const ui = {
    canvas: $('#game'), board: $('#board'), stage: $('#stage'), overlay: $('#overlay'),
    toasts: $('#toasts'), banner: $('#banner'), abilities: $('#abilities'),
    lives: $('#lives'), gold: $('#gold'), wave: $('#wave'), waves: $('#waves'), wavesWrap: $('#waves-wrap'), chip: $('#mode-chip'),
    buildList: $('#build-list'), info: $('#info'), next: $('#next-wave'),
    waveBtn: $('#btn-wave'), pauseBtn: $('#btn-pause'), soundBtn: $('#btn-sound'),
    speedBtns: [...document.querySelectorAll('#speed button')],
  };

  const renderer = new TD.Render.Renderer(ui.canvas);
  let game = null;
  let inMenu = true;
  let paused = false;
  let speed = store.get('speed', 1);
  let menuMode = store.get('mode', 'campaign');
  let acc = 0, lastT = 0, vtime = 0;
  const view = { placing: null, hover: null, mouse: null, selected: null, ability: null, rallyFor: null };
  const shown = {};

  const fmt = (n) => (n === Infinity ? '∞' : Math.floor(n));

  // ---- Layout ----------------------------------------------------------------

  function fit() {
    const narrow = window.innerWidth <= 860;
    const w = ui.stage.clientWidth - 20, h = ui.stage.clientHeight - 20;
    const k = narrow ? w / TD.Render.W : Math.min(w / TD.Render.W, h / TD.Render.H);
    const cw = Math.max(320, Math.floor(TD.Render.W * k)), ch = Math.floor(cw * TD.Render.H / TD.Render.W);
    ui.board.style.width = cw + 'px';
    ui.board.style.height = ch + 'px';
    renderer.resize(cw, ch);
  }

  // ---- Toasts & banners ---------------------------------------------------------

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

  const unitSrc = (type) => 'assets/units/' + TD.ENEMIES[type].sprite + '.png';

  function starStr(n, max) {
    let s = '';
    for (let i = 0; i < (max || 3); i++) s += i < n ? '★' : '<span class="dim">★</span>';
    return s;
  }

  // ---- Progress (records, glory, perks) -------------------------------------------

  const progress = {
    glory: () => store.get('glory', 0),
    perks: () => store.get('perks', {}),
    addGlory(n) { store.set('glory', progress.glory() + n); },
    perkCost(rank) { return TD.PERK_COSTS[rank]; },
    buy(id) {
      const perks = progress.perks();
      const rank = perks[id] || 0;
      const cost = TD.PERK_COSTS[rank];
      if (cost == null || progress.glory() < cost) return false;
      perks[id] = rank + 1;
      store.set('perks', perks);
      store.set('glory', progress.glory() - cost);
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

  // ---- Screens -----------------------------------------------------------------

  function showMenu() {
    inMenu = true;
    paused = false;
    clearModes();
    if (!game) setGame(TD.MAPS[0], 'campaign');
    const best = store.get('best', {});
    const endless = store.get('endless', {});
    const tabs = Object.entries(TD.MODES).map(([id, m]) => `<button data-mode="${id}" class="${id === menuMode ? 'on' : ''}">${m.name}</button>`).join('');
    ui.overlay.innerHTML = `
      <div class="menu">
        <h1>Hold the Keep</h1>
        <div class="tag-line">The horde marches on the realm. Build towers along the road and let none reach the gate.</div>
        <div class="menu-bar">
          <div class="seg mode-tabs">${tabs}</div>
          <button class="btn gold armory-btn" data-act="armory">Royal Armory · <span class="glory-i">${progress.glory()}</span></button>
        </div>
        <div class="mode-blurb">${TD.MODES[menuMode].blurb}</div>
        <div class="maps"></div>
        <div class="how">
          <span><kbd>1</kbd>–<kbd>8</kbd> towers</span>
          <span><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> abilities</span>
          <span><kbd>U</kbd> upgrade · <kbd>Del</kbd> sell · <kbd>T</kbd> target</span>
          <span><kbd>Space</kbd> pause · <kbd>F</kbd> speed · <kbd>N</kbd> next wave</span>
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
          <small>Earn Glory by winning campaign maps, surviving endless waves, and even by valiant defeats.</small></div>
        <div class="perks">${rows}</div>
        <div class="buttons">
          <button class="btn green" data-act="menu">Back to maps</button>
          <button class="btn" data-act="refund">Refund all</button>
        </div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  function setGame(map, mode) {
    game = new TD.Game(map, { mode, perks: mode === 'sandbox' ? {} : progress.perks(), seed: (Math.random() * 1e9) | 0 });
    renderer.setGame(game);
    acc = 0;
    for (const k in shown) delete shown[k];
    buildAbilityBar();
  }

  function startGame(map, mode) {
    setGame(map, mode);
    inMenu = false;
    paused = false;
    clearModes();
    ui.overlay.classList.remove('show');
    ui.overlay.innerHTML = '';
    ui.toasts.innerHTML = '';
    const tip = mode === 'sandbox' ? 'Sandbox: gold and lives are unlimited. Send waves whenever you like.'
      : mode === 'endless' ? 'Endless: how many waves can you hold? Elite foes join from wave 12.'
        : 'Build towers beside the road, then press <b>Start Wave 1</b>.';
    toast(`<span>${tip}</span>`, '', 5000);
    refreshAll();
  }

  function setPaused(p) {
    if (inMenu || !game || game.state !== 'playing') return;
    paused = p;
    ui.pauseBtn.classList.toggle('active', p);
    if (p) {
      ui.overlay.innerHTML = `
        <div class="dialog">
          <h2>Paused</h2>
          <div class="lines">${game.map.name} · ${TD.MODES[game.mode].name} · Wave <b>${game.wave}</b>${game.endless ? '' : ' of ' + game.totalWaves}</div>
          <div class="buttons">
            <button class="btn green" data-act="resume">Resume</button>
            <button class="btn" data-act="restart">Restart</button>
            <button class="btn" data-act="menu">${game.endless && game.wave > 1 && !game.sandbox ? 'Retreat' : 'Choose map'}</button>
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

  function showResult() {
    const r = game.result();
    const map = game.map;
    const glory = gloryFor(game);
    if (glory) progress.addGlory(glory);
    let record = '';
    if (r.won) {
      const best = store.get('best', {});
      if ((best[map.id] || 0) < r.stars) {
        best[map.id] = r.stars;
        store.set('best', best);
      }
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
      <div class="dialog ${r.won ? 'win' : 'lose'}">
        <h2>${title}</h2>
        ${r.won ? `<div class="big-stars">${starStr(r.stars)}</div>` : ''}
        <div class="lines">
          ${line}<br>
          Foes slain <b>${game.stats.kills}</b>${game.endless ? '' : ` · Lives left <b>${game.lives}/${game.maxLives}</b>`}
          ${glory ? `<div class="glory-line">+<span class="glory-i">${glory}</span> Glory for the Royal Armory</div>` : ''}
        </div>
        <div class="buttons">
          ${r.won && nextMap ? `<button class="btn gold" data-act="next">Next: ${nextMap.name}</button>` : ''}
          ${r.won ? '<button class="btn" data-act="endless">Try Endless here</button>' : ''}
          <button class="btn ${r.won ? '' : 'red'}" data-act="restart">${r.won ? 'Play again' : 'Try again'}</button>
          <button class="btn" data-act="menu">Choose map</button>
        </div>
      </div>`;
    ui.overlay.classList.add('show');
  }

  // Leaving an endless run early still banks the waves you held.
  function leaveToMenu() {
    if (game && !inMenu && game.mode === 'endless' && game.state === 'playing' && game.wave > 1) {
      game.state = 'lost';
      showResult();
      return;
    }
    showMenu();
  }

  ui.overlay.addEventListener('click', (e) => {
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
    const act = e.target.closest('[data-act]');
    if (!act) return;
    TD.Audio.unlock();
    TD.Audio.play('click');
    const a = act.dataset.act;
    if (a === 'resume') setPaused(false);
    else if (a === 'restart') startGame(game.map, game.mode);
    else if (a === 'menu') { if (paused) { paused = false; leaveToMenu(); } else showMenu(); }
    else if (a === 'next') startGame(TD.MAPS[TD.MAPS.indexOf(game.map) + 1], 'campaign');
    else if (a === 'endless') startGame(game.map, 'endless');
    else if (a === 'armory') showArmory();
    else if (a === 'refund') { progress.refund(); showArmory(); }
  });

  // ---- Build cards ---------------------------------------------------------------

  const cards = {};
  function buildCards() {
    for (const type of TD.TOWER_ORDER) {
      const def = TD.TOWERS[type];
      const b = document.createElement('button');
      b.className = 'card';
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

  function clearModes() {
    view.placing = view.selected = view.ability = view.rallyFor = null;
  }

  function togglePlacing(type) {
    if (inMenu || !game || game.state !== 'playing') return;
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

  // ---- Abilities ----------------------------------------------------------------------

  const abilityBtns = {};
  function buildAbilityBar() {
    if (ui.abilities.children.length) return;
    for (const id of TD.ABILITY_ORDER) {
      const a = TD.ABILITIES[id];
      const b = document.createElement('button');
      b.className = 'ability ab-' + id;
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

  function useAbility(id) {
    if (inMenu || paused || !game || game.state !== 'playing') return;
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

  let abilityKey = '';
  function refreshAbilities() {
    if (!game) return;
    let key = '';
    for (const id of TD.ABILITY_ORDER) {
      const st = game.abilities[id];
      const frac = st.cd > 0 ? st.cd / (TD.ABILITIES[id].cooldown * game.mods.cooldown) : 0;
      key += id + frac.toFixed(2) + (view.ability === id) + ',';
    }
    if (key === abilityKey) return;
    abilityKey = key;
    for (const id of TD.ABILITY_ORDER) {
      const b = abilityBtns[id], st = game.abilities[id];
      const frac = st.cd > 0 ? st.cd / (TD.ABILITIES[id].cooldown * game.mods.cooldown) : 0;
      b.style.setProperty('--cd', frac.toFixed(3));
      b.classList.toggle('cooling', frac > 0);
      b.classList.toggle('on', view.ability === id);
      b.querySelector('.cd').textContent = frac > 0 ? Math.ceil(st.cd) : '';
    }
  }

  // ---- Info panel -------------------------------------------------------------------

  const pct = (v) => Math.round(v * 100) + '%';
  const STAT_ROWS = [
    ['dmg', (t) => (t.kind === 'barracks' ? 'Soldier damage' : t.damage === 'magic' ? 'Magic damage' : 'Damage'), (v) => Math.round(v)],
    ['rate', (t) => (t.kind === 'barracks' ? 'Soldier attacks / sec' : 'Attacks / sec'), (v) => v.toFixed(2)],
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
    ['heal', () => 'Heals soldiers / sec'],
    ['income', () => 'Gold each wave', (v) => '+' + v],
  ];

  function statRows(def, s, n) {
    const merged = Object.assign({ armorPen: def.armorPen }, s);
    const next = n ? Object.assign({ armorPen: def.armorPen }, n) : null;
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

  const kindLabel = (def) => (def.kind === 'support' ? 'support' : def.kind === 'economy' ? 'economy' : def.kind === 'barracks' ? 'melee' : def.damage + ' damage');

  let infoKey = '';
  function refreshInfo() {
    const t = view.selected;
    let key;
    if (inMenu || !game) key = 'none';
    else if (view.placing) key = 'p' + view.placing + (game.gold >= game.towerCost(view.placing));
    else if (t) {
      const branches = game.canBranch(t) ? Object.keys(t.def.branches).map((b) => game.gold >= game.branchCost(t, b)).join() : '';
      key = ['t', t.id, game.tier(t), t.mode, game.gold >= (game.upgradeCost(t) ?? Infinity), branches, game.state, !!view.rallyFor].join();
    } else key = 'hint';
    if (key === infoKey) return;
    infoKey = key;

    if (view.placing) {
      const def = TD.TOWERS[view.placing];
      ui.info.innerHTML = `
        <div class="head"><div><h3>${def.name}</h3><div class="sub"><span class="coin-i">${fmt(game.towerCost(view.placing))}</span> · ${kindLabel(def)}</div></div></div>
        <p>${def.blurb}</p>
        ${statRows(def, def.levels[0])}
        <p class="tip">Click a highlighted tile to build. <b>Shift</b>+click keeps building. <b>Esc</b> or right-click cancels.</p>`;
      ui.info.querySelector('.head').prepend(TD.Render.towerIcon(view.placing, 0, 56));
      return;
    }
    if (t) {
      const def = t.def;
      const tier = game.tier(t);
      const maxTier = def.branches ? 5 : def.levels.length;
      const cost = game.upgradeCost(t);
      const s = game.towerStats(t);
      let next = null;
      if (cost != null) next = t.branch ? def.branches[t.branch].levels[t.blevel + 1] : def.levels[t.level + 1];
      const attacks = !def.kind;
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
      ui.info.innerHTML = `
        <div class="head"><div><h3>${game.towerName(t)}</h3><div class="stars">${starStr(tier + 1, maxTier)}</div><div class="sub">${t.branch ? def.name + ' · ' : ''}${kindLabel(def)}</div></div></div>
        ${statRows(def, s, next)}
        ${branchHtml}
        ${attacks ? `<div class="target-row"><span>Target</span><div class="seg">${modes}</div></div>` : ''}
        ${def.kind === 'barracks' ? `<button class="btn rally-btn ${view.rallyFor ? 'on' : ''}" data-act="rally">${view.rallyFor ? 'Click the road to set the rally point…' : 'Move rally point'}</button>` : ''}
        <div class="actions">
          ${game.canBranch(t) ? '' : `<button class="btn gold" data-act="upgrade" ${cost == null || game.gold < cost ? 'disabled' : ''}>
            ${cost == null ? 'Max level' : 'Upgrade'}${cost != null ? `<small><span class="coin-i">${fmt(cost)}</span> · U</small>` : ''}
          </button>`}
          <button class="btn red" data-act="sell">Sell<small><span class="coin-i">${game.sandbox ? 0 : game.sellValue(t)}</span> · Del</small></button>
        </div>`;
      ui.info.querySelector('.head').prepend(TD.Render.towerIcon(t.type, tier, 56, t.branch));
      for (const el of ui.info.querySelectorAll('[data-icon]')) el.appendChild(TD.Render.towerIcon(t.type, 3, 40, el.dataset.icon));
      return;
    }
    ui.info.innerHTML = `
      <h2>Orders</h2>
      <p>Pick a tower and build it beside the road. Click a tower to upgrade it, change its target or sell it.</p>
      <p class="tip">At level 3 most towers choose one of <b>two specializations</b> with two more ranks.</p>
      <p class="tip"><b>Armor</b> blunts arrows, boulders and bolts. <b>Magic</b> ignores it. <b>Burning</b> ignores everything.</p>
      <p class="tip">Use abilities <b>Q W E R</b> in a pinch. Calling a wave early earns bonus gold.</p>`;
  }

  ui.info.addEventListener('click', (e) => {
    const t = view.selected;
    if (!t || !game) return;
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      t.mode = mode.dataset.mode;
      TD.Audio.play('click');
      refreshInfo();
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
      const tag = def.boss ? '<span class="tag boss">Boss</span>' : !game.seen.has(type) ? '<span class="tag">New</span>' : '';
      return `<div class="foe" title="${def.name}: ${def.blurb}"><span class="pic"><img src="${unitSrc(type)}" alt=""></span><span class="n">×${n}</span><span class="nm">${def.name}</span>${tag}</div>`;
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
      if (lastGold != null && gold > lastGold && !inMenu) bump(ui.gold, 'bump');
      ui.gold.textContent = fmt(gold);
      lastGold = gold;
      for (const type of TD.TOWER_ORDER) {
        cards[type].classList.toggle('poor', gold < game.towerCost(type));
        cards[type].querySelector('.cost').textContent = game.sandbox ? 'Free' : fmt(game.towerCost(type));
      }
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
    for (const type of TD.TOWER_ORDER) cards[type].classList.toggle('on', view.placing === type);

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
    ui.abilities.style.display = inMenu ? 'none' : '';
    refreshAbilities();
    refreshInfo();
    refreshNext();
  }

  function refreshAll() {
    infoKey = nextKey = waveLabel = abilityKey = chipKey = '';
    lastGold = lastLives = null;
    refreshHud();
    ui.speedBtns.forEach((b) => b.classList.toggle('on', +b.dataset.speed === speed));
    ui.soundBtn.classList.toggle('muted', TD.Audio.muted);
    ui.pauseBtn.classList.toggle('active', paused);
    ui.canvas.classList.toggle('placing', !!(view.placing || view.ability || view.rallyFor));
  }

  // ---- Simulation events ---------------------------------------------------------------

  const FIRE_SOUND = { arrow: 'arrow', stone: 'stoneLaunch', firepot: 'stoneLaunch', flask: 'flaskThrow', orb: 'orb', ice: 'orb', bolt: 'bolt' };
  const CAST_SOUND = { meteor: 'meteorFall', reinforce: 'reinforce', frost: 'freeze', horn: 'hornCall' };

  function processEvents() {
    for (const ev of game.events) {
      renderer.handle(ev);
      switch (ev.type) {
        case 'fire': if (FIRE_SOUND[ev.kind]) TD.Audio.play(FIRE_SOUND[ev.kind]); break;
        case 'lightning': TD.Audio.play('lightning'); break;
        case 'splash': TD.Audio.play(ev.kind === 'flask' ? 'flask' : ev.kind === 'firepot' ? 'firepot' : 'stoneHit'); break;
        case 'hit': if (ev.kind === 'arrow') TD.Audio.play('hit'); break;
        case 'crit': TD.Audio.play('crit'); break;
        case 'chain': TD.Audio.play('chain'); break;
        case 'melee': TD.Audio.play('melee'); break;
        case 'kill': TD.Audio.play(ev.boss ? 'upgrade' : 'kill'); break;
        case 'heal': TD.Audio.play('heal'); break;
        case 'summon': TD.Audio.play('summon'); break;
        case 'leak': TD.Audio.play('leak'); break;
        case 'build': TD.Audio.play('build'); break;
        case 'upgrade': TD.Audio.play('upgrade'); break;
        case 'sell': TD.Audio.play('sell'); break;
        case 'income': TD.Audio.play('coin'); break;
        case 'soldierDown': if (!ev.expired) TD.Audio.play('soldierDown'); break;
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
          if (bossType) banner(`Wave ${ev.wave}`, `The ${TD.ENEMIES[bossType].name} rides to battle!`, true);
          else banner(`Wave ${ev.wave}`, ev.wave === game.totalWaves ? 'The final assault!' : '');
          if (game.endless && ev.wave === 12) {
            toast('<span><b>Elite foes appear!</b> Coloured rings mark giant, swift, armored and regenerating foes. They pay double.</span>', 'bad', 6000);
          }
          break;
        }
        case 'newEnemy': {
          const def = TD.ENEMIES[ev.enemy];
          if (game.wave > 1 && !shown[ev.enemy] && !def.minion) {
            shown[ev.enemy] = true;
            toast(`<img src="${unitSrc(ev.enemy)}" alt=""><span><b>New foe: ${def.name}.</b> ${def.blurb}</span>`, def.boss ? 'bad' : '', 5200);
          }
          break;
        }
        case 'won':
        case 'lost': {
          TD.Audio.play(ev.type === 'won' ? 'win' : 'lose');
          const ended = game;
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

  ui.canvas.addEventListener('pointermove', (e) => {
    const m = worldFromEvent(e);
    view.mouse = m;
    view.hover = { x: Math.floor(m.x), y: Math.floor(m.y) };
    if (game && !inMenu) {
      const busy = view.placing || view.ability || view.rallyFor;
      ui.canvas.classList.toggle('pointing', !busy && !!game.towerAt(view.hover.x, view.hover.y));
    }
  });
  ui.canvas.addEventListener('pointerleave', () => { view.hover = null; view.mouse = null; });
  ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.canvas.addEventListener('pointerdown', (e) => {
    if (!game || inMenu || paused || game.state !== 'playing') return;
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
    } else {
      const t = game.towerAt(c.x, c.y);
      if (t) TD.Audio.play('click');
      view.selected = t;
    }
    refreshAll();
  });

  function cancel() {
    if (view.ability || view.rallyFor) {
      view.ability = view.rallyFor = null;
      refreshAll();
      return true;
    }
    if (view.placing || view.selected) {
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

  ui.waveBtn.addEventListener('click', callWave);
  ui.pauseBtn.addEventListener('click', () => setPaused(!paused));
  ui.soundBtn.addEventListener('click', () => {
    TD.Audio.unlock();
    TD.Audio.setMuted(!TD.Audio.muted);
    store.set('muted', TD.Audio.muted);
    refreshAll();
  });
  ui.speedBtns.forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    TD.Audio.unlock();
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      setPaused(!paused);
      return;
    }
    if (k === 'escape') {
      if (paused) setPaused(false);
      else if (!cancel()) setPaused(true);
      return;
    }
    if (inMenu || paused || !game || game.state !== 'playing') return;
    const type = TD.TOWER_ORDER.find((t) => TD.TOWERS[t].key === k);
    const ability = TD.ABILITY_ORDER.find((a) => TD.ABILITIES[a].key === k);
    if (type) togglePlacing(type);
    else if (ability) useAbility(ability);
    else if (k === 'u') doUpgrade();
    else if (k === 'delete' || k === 'backspace') doSell();
    else if (k === 'n') callWave();
    else if (k === 'f') setSpeed(speed % 3 + 1);
    else if (k === 't' && view.selected && !view.selected.def.kind) {
      const m = TD.TARGET_MODES;
      view.selected.mode = m[(m.indexOf(view.selected.mode) + 1) % m.length];
      refreshAll();
    }
  });

  // ---- Main loop ---------------------------------------------------------------------

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    if (game) {
      const running = !inMenu && !paused && game.state === 'playing';
      if (running) {
        acc += dt * speed;
        let steps = 0;
        while (acc >= STEP && steps < 12) {
          game.update(STEP);
          acc -= STEP;
          steps++;
        }
        if (steps >= 12) acc = 0;
        processEvents();
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

  TD.Audio.setMuted(store.get('muted', false));
  window.addEventListener('resize', fit);
  fit();
  TD.Render.load((p) => {
    const el = document.getElementById('load-pct');
    if (el) el.textContent = Math.round(p * 100) + '%';
  }).then(() => {
    buildCards();
    showMenu();
    fit();
    requestAnimationFrame(frame);
    // Hooks for automated smoke tests.
    window.__htk = { get game() { return game; }, startGame, view, setSpeed, showArmory, progress };
  });
})();
