// Static game data: towers, enemies, waves, abilities, perks and maps.
'use strict';
window.TD = window.TD || {};

TD.TILE = 64;
TD.COLS = 20;
TD.ROWS = 12;

// Ranges and speeds are measured in tiles; rate is attacks per second.
// Towers have three base levels; most then pick one of two branches with two ranks each.
// Branch levels list their full stats (they replace, not add to, the level before).
TD.TOWERS = {
  archer: {
    name: 'Archer Tower', key: '1', cost: 70, damage: 'physical', projectile: 'arrow',
    blurb: 'Quick volleys at a single foe. Struggles against heavy armor.',
    levels: [
      { dmg: 11, rate: 1.5, range: 2.7 },
      { cost: 60, dmg: 18, rate: 1.75, range: 2.95 },
      { cost: 110, dmg: 27, rate: 2.1, range: 3.25 },
    ],
    branches: {
      ranger: {
        name: 'Ranger Lodge', blurb: 'Looses arrows at several foes at once.',
        levels: [
          { cost: 150, dmg: 30, rate: 2.2, range: 3.4, multishot: 2 },
          { cost: 210, dmg: 38, rate: 2.5, range: 3.6, multishot: 3 },
        ],
      },
      marksman: {
        name: 'Marksman Spire', blurb: 'Long-range shots that crit, pierce armor and finish off the wounded.',
        levels: [
          { cost: 170, dmg: 70, rate: 0.95, range: 4.6, crit: 0.2, armorPen: 0.4 },
          { cost: 240, dmg: 110, rate: 1.05, range: 5.2, crit: 0.3, armorPen: 0.5, execute: 0.12 },
        ],
      },
    },
  },
  catapult: {
    name: 'Catapult', key: '2', cost: 120, damage: 'physical', projectile: 'stone', armorPen: 0.3, ground: true,
    blurb: 'Lobs boulders that crush whole crowds. Slow to reload. Cannot hit flying foes.',
    levels: [
      { dmg: 26, rate: 0.42, range: 3.3, splash: 0.95 },
      { cost: 110, dmg: 44, rate: 0.46, range: 3.5, splash: 1.05 },
      { cost: 180, dmg: 72, rate: 0.5, range: 3.8, splash: 1.2 },
    ],
    branches: {
      bombard: {
        name: 'Bombard', blurb: 'Fire pots that set crowds, and later the ground itself, ablaze.', projectile: 'firepot',
        levels: [
          { cost: 190, dmg: 66, rate: 0.55, range: 3.8, splash: 1.3, burn: 22, burnDur: 3 },
          { cost: 250, dmg: 90, rate: 0.6, range: 4.0, splash: 1.4, burn: 40, burnDur: 3.5, fireField: 3 },
        ],
      },
      trebuchet: {
        name: 'Trebuchet', blurb: 'Colossal boulders hurled across the map that stun what they hit.',
        levels: [
          { cost: 210, dmg: 150, rate: 0.33, range: 6.0, splash: 1.05, stun: 0.8 },
          { cost: 290, dmg: 240, rate: 0.36, range: 7.0, splash: 1.2, stun: 1.2 },
        ],
      },
    },
  },
  wizard: {
    name: 'Wizard Tower', key: '3', cost: 100, damage: 'magic', projectile: 'orb',
    blurb: 'Arcane bolts ignore armor and slow their mark. Master wizards chain.',
    levels: [
      { dmg: 15, rate: 0.9, range: 2.6, slow: 0.35, slowDur: 1.5 },
      { cost: 90, dmg: 25, rate: 1.0, range: 2.8, slow: 0.45, slowDur: 1.7 },
      { cost: 150, dmg: 38, rate: 1.1, range: 3.0, slow: 0.55, slowDur: 2.0, chain: 2 },
    ],
    branches: {
      frost: {
        name: 'Frost Spire', blurb: 'Chills every foe in range and can freeze them solid.', projectile: 'ice',
        levels: [
          { cost: 160, dmg: 32, rate: 1.2, range: 3.1, slow: 0.6, slowDur: 2.0, aura: 0.25, freeze: 0.15, freezeDur: 1.0 },
          { cost: 220, dmg: 46, rate: 1.3, range: 3.3, slow: 0.65, slowDur: 2.2, aura: 0.35, freeze: 0.22, freezeDur: 1.4 },
        ],
      },
      storm: {
        name: 'Storm Tower', blurb: 'Lightning leaps between many foes and may stun them.', projectile: 'lightning',
        levels: [
          { cost: 180, dmg: 55, rate: 0.9, range: 3.2, chain: 4 },
          { cost: 250, dmg: 80, rate: 1.0, range: 3.4, chain: 6, stunChance: 0.2, stunDur: 0.6 },
        ],
      },
    },
  },
  ballista: {
    name: 'Ballista', key: '4', cost: 160, damage: 'physical', projectile: 'bolt', armorPen: 0.6,
    blurb: 'Huge bolts fly far, punch through armor and pierce several foes.',
    levels: [
      { dmg: 58, rate: 0.4, range: 4.3, pierce: 3 },
      { cost: 140, dmg: 95, rate: 0.45, range: 4.6, pierce: 4 },
      { cost: 220, dmg: 150, rate: 0.5, range: 5.0, pierce: 6 },
    ],
    branches: {
      scorpion: {
        name: 'Scorpion Nest', blurb: 'A repeating ballista that rattles off bolt after bolt.',
        levels: [
          { cost: 190, dmg: 66, rate: 1.4, range: 4.6, pierce: 3 },
          { cost: 250, dmg: 90, rate: 1.8, range: 4.9, pierce: 4 },
        ],
      },
      slayer: {
        name: 'Dragonslayer', blurb: 'Monstrous bolts that deal bonus damage to bosses and elites.',
        levels: [
          { cost: 230, dmg: 300, rate: 0.45, range: 5.6, pierce: 8, bossMult: 2 },
          { cost: 310, dmg: 450, rate: 0.5, range: 6.2, pierce: 10, bossMult: 3 },
        ],
      },
    },
  },
  barracks: {
    name: 'Barracks', key: '5', cost: 90, damage: 'physical', kind: 'barracks',
    blurb: 'Trains soldiers who block the road and hold foes in place. Fast outriders slip past.',
    levels: [
      { range: 2.4, soldiers: 2, hp: 120, dmg: 8, rate: 1.0, armor: 0.1, respawn: 9 },
      { cost: 80, range: 2.6, soldiers: 3, hp: 170, dmg: 12, rate: 1.0, armor: 0.2, respawn: 8 },
      { cost: 130, range: 2.8, soldiers: 3, hp: 250, dmg: 18, rate: 1.1, armor: 0.3, respawn: 7 },
    ],
    branches: {
      paladin: {
        name: 'Paladin Order', blurb: 'Holy knights in heavy plate who mend their own wounds.',
        levels: [
          { cost: 170, range: 2.9, soldiers: 3, hp: 420, dmg: 24, rate: 1.1, armor: 0.45, respawn: 7, regen: 20 },
          { cost: 230, range: 3.0, soldiers: 3, hp: 600, dmg: 32, rate: 1.2, armor: 0.55, respawn: 6, regen: 35 },
        ],
      },
      berserker: {
        name: 'Berserker Hall', blurb: 'Fearless axemen who hit hard and fast. Masters cleave nearby foes.',
        levels: [
          { cost: 170, range: 2.9, soldiers: 4, hp: 280, dmg: 40, rate: 1.4, armor: 0.15, respawn: 6 },
          { cost: 230, range: 3.0, soldiers: 4, hp: 340, dmg: 58, rate: 1.6, armor: 0.2, respawn: 5, cleave: 0.5 },
        ],
      },
    },
  },
  alchemist: {
    name: 'Alchemist', key: '6', cost: 110, damage: 'magic', projectile: 'flask', ground: true,
    blurb: 'Hurls flasks of liquid fire. Burning ignores armor; master brews corrode it. Cannot hit flying foes.',
    levels: [
      { dmg: 10, rate: 0.8, range: 2.7, splash: 0.75, burn: 12, burnDur: 3 },
      { cost: 90, dmg: 15, rate: 0.85, range: 2.9, splash: 0.85, burn: 20, burnDur: 3 },
      { cost: 140, dmg: 22, rate: 0.9, range: 3.1, splash: 0.95, burn: 30, burnDur: 3.5, corrode: 0.25 },
    ],
    branches: {
      plague: {
        name: 'Plague Doctor', blurb: 'Toxic flasks leave clouds that poison and corrode everything inside.',
        levels: [
          { cost: 170, dmg: 26, rate: 0.9, range: 3.2, splash: 1.0, burn: 34, burnDur: 4, corrode: 0.3, cloud: 3 },
          { cost: 230, dmg: 36, rate: 0.95, range: 3.4, splash: 1.1, burn: 50, burnDur: 4, corrode: 0.4, cloud: 4.5 },
        ],
      },
      pyro: {
        name: 'Pyromancer', blurb: 'Roaring fireballs whose flames burn far hotter and longer.', projectile: 'firepot',
        levels: [
          { cost: 180, dmg: 40, rate: 0.8, range: 3.2, splash: 1.2, burn: 60, burnDur: 4 },
          { cost: 240, dmg: 55, rate: 0.85, range: 3.4, splash: 1.3, burn: 95, burnDur: 4.5, fireField: 3 },
        ],
      },
    },
  },
  chapel: {
    name: 'Chapel', key: '7', cost: 120, kind: 'support',
    blurb: 'Blesses nearby towers with extra damage. At level 3 it also hastens them and heals soldiers.',
    levels: [
      { range: 2.3, buff: 0.15 },
      { cost: 100, range: 2.6, buff: 0.25 },
      { cost: 150, range: 2.9, buff: 0.3, haste: 0.15, heal: 15 },
    ],
    branches: {
      cathedral: {
        name: 'Cathedral', blurb: 'Grand blessings: more damage, faster towers and steady healing.',
        levels: [
          { cost: 180, range: 3.2, buff: 0.38, haste: 0.2, heal: 25 },
          { cost: 240, range: 3.5, buff: 0.45, haste: 0.25, heal: 40 },
        ],
      },
      oracle: {
        name: 'Oracle\u2019s Sanctum', blurb: 'Seers extend the reach of nearby towers and curse foes to take more damage.',
        levels: [
          { cost: 170, range: 3.0, buff: 0.3, reach: 0.12, curse: 0.12 },
          { cost: 230, range: 3.3, buff: 0.35, reach: 0.18, curse: 0.2 },
        ],
      },
    },
  },
  windmill: {
    name: 'Windmill', key: '8', cost: 140, kind: 'economy',
    blurb: 'Grinds grain into gold. Pays out every time a wave begins.',
    levels: [
      { income: 20 },
      { cost: 110, income: 35 },
      { cost: 170, income: 55 },
    ],
    branches: {
      bank: {
        name: 'Royal Bank', blurb: 'Pays more each wave, plus interest on the gold in your purse.',
        levels: [
          { cost: 200, income: 60, interest: 0.03, interestCap: 60 },
          { cost: 260, income: 80, interest: 0.05, interestCap: 120 },
        ],
      },
      granary: {
        name: 'Granary', blurb: 'Feeds the garrison: pays out and restores a life every few waves.',
        levels: [
          { cost: 180, income: 50, lifeEvery: 3 },
          { cost: 240, income: 70, lifeEvery: 2 },
        ],
      },
    },
  },

  // ---- Faction towers (one per faction, built with key 9) ----
  belltower: {
    name: 'Bell Tower', key: '9', cost: 130, faction: 'kingdom', kind: 'pulse', damage: 'physical', ground: true,
    blurb: 'Its great bell tolls at intervals, stunning and bruising every ground foe nearby.',
    levels: [
      { range: 2.2, interval: 7, stun: 0.8, dmg: 12 },
      { cost: 110, range: 2.4, interval: 6.5, stun: 1.0, dmg: 24 },
      { cost: 160, range: 2.7, interval: 6, stun: 1.3, dmg: 40 },
    ],
  },
  grove: {
    name: 'Thorn Grove', key: '9', cost: 120, faction: 'sylvan', kind: 'aura', damage: 'magic', ground: true,
    blurb: 'Living brambles lash every ground foe in reach, wounding and slowing them nonstop.',
    levels: [
      { range: 1.8, dps: 12, slow: 0.2 },
      { cost: 100, range: 2.0, dps: 22, slow: 0.25 },
      { cost: 150, range: 2.2, dps: 38, slow: 0.3 },
    ],
  },
  cannon: {
    name: 'Cannon Tower', key: '9', cost: 140, faction: 'ironhold', damage: 'physical', projectile: 'cannonball', armorPen: 0.5, ground: true,
    blurb: 'Dwarven cannons fire fast, heavy shot that bursts through armor and crowds alike.',
    levels: [
      { dmg: 40, rate: 0.7, range: 3.0, splash: 0.85 },
      { cost: 120, dmg: 66, rate: 0.75, range: 3.2, splash: 0.95 },
      { cost: 180, dmg: 105, rate: 0.8, range: 3.5, splash: 1.05 },
    ],
  },
  obelisk: {
    name: 'Mana Obelisk', key: '9', cost: 130, faction: 'conclave', kind: 'beam', damage: 'magic',
    blurb: 'A crystal beam that burns hotter the longer it stays on one foe (up to triple). Hits flyers.',
    levels: [
      { dps: 20, range: 2.8, ramp: 3 },
      { cost: 110, dps: 34, range: 3.0, ramp: 3 },
      { cost: 170, dps: 55, range: 3.2, ramp: 3 },
    ],
  },
};
TD.TOWER_ORDER = ['archer', 'catapult', 'wizard', 'ballista', 'barracks', 'alchemist', 'chapel', 'windmill'];
TD.TARGET_MODES = ['first', 'last', 'strong', 'close'];

// atk = damage per hit against soldiers (one hit per second).
TD.ENEMIES = {
  peasant: {
    name: 'Peasant Mob', sprite: 'red_peasant', hp: 38, speed: 1.05, armor: 0, gold: 5, lives: 1, scale: 0.62, atk: 3,
    blurb: 'Unarmored and angry. Comes in crowds.',
  },
  footman: {
    name: 'Footman', sprite: 'red_soldier', hp: 85, speed: 0.9, armor: 0.2, gold: 9, lives: 1, scale: 0.65, atk: 6,
    blurb: 'Sword and leather. The backbone of the horde.',
  },
  outrider: {
    name: 'Outrider', sprite: 'green_soldier', hp: 55, speed: 1.75, armor: 0, gold: 8, lives: 1, scale: 0.62, atk: 4,
    noBlock: true,
    blurb: 'Fast scouts that dash past slow towers and slip around soldiers.',
  },
  knight: {
    name: 'Knight', sprite: 'red_knight', hp: 230, speed: 0.65, armor: 0.55, gold: 18, lives: 2, scale: 0.7, atk: 12,
    blurb: 'Heavy plate shrugs off arrows. Magic cuts right through.',
  },
  priest: {
    name: 'War Priest', sprite: 'red_mage', hp: 120, speed: 0.8, armor: 0, magicResist: 0.4, gold: 16, lives: 1, scale: 0.66, atk: 5,
    heal: { amount: 0.08, radius: 1.7, interval: 2.5 },
    blurb: 'Mends the wounds of nearby allies. Kill it first.',
  },
  shieldbearer: {
    name: 'Shieldbearer', sprite: 'grey_soldier', hp: 160, speed: 0.8, armor: 0.35, magicResist: 0.6, gold: 14, lives: 1, scale: 0.68, atk: 8,
    blurb: 'Tower shields turn spells aside. Arrows and boulders work better.',
  },
  berserker: {
    name: 'Berserker', sprite: 'green_peasant', hp: 150, speed: 0.85, armor: 0.1, gold: 13, lives: 1, scale: 0.68, atk: 14,
    rage: true,
    blurb: 'Flies into a rage and charges when wounded.',
  },
  necromancer: {
    name: 'Necromancer', sprite: 'green_mage', hp: 210, speed: 0.65, armor: 0, magicResist: 0.3, gold: 24, lives: 2, scale: 0.7, atk: 6,
    summon: { type: 'thrall', count: 2, interval: 6 },
    blurb: 'Raises the dead to march beside it.',
  },
  thrall: {
    name: 'Thrall', sprite: 'grey_peasant', hp: 32, speed: 1.0, armor: 0, gold: 1, lives: 1, scale: 0.58, atk: 3, minion: true,
    blurb: 'A risen corpse. Weak, but there are many.',
  },
  ironclad: {
    name: 'Ironclad', sprite: 'grey_knight', hp: 520, speed: 0.55, armor: 0.7, gold: 32, lives: 3, scale: 0.78, atk: 22,
    blurb: 'A walking fortress. Bring ballistae or wizards.',
  },
  bat: {
    name: 'Giant Bat', draw: 'bat', fly: true, hp: 38, speed: 0.95, armor: 0, gold: 6, lives: 1, scale: 0.8,
    blurb: 'Flaps straight over the fields to the keep. Catapults and alchemists can\u2019t hit it.',
  },
  wyvern: {
    name: 'Wyvern', draw: 'wyvern', fly: true, hp: 260, speed: 0.5, armor: 0.3, magicResist: 0.2, gold: 26, lives: 2, scale: 1.0,
    blurb: 'A scaled drake that ignores the road. Archers and ballistae bring it down.',
  },
  warlord: {
    name: 'Warlord', sprite: 'red_king', hp: 2600, speed: 0.45, armor: 0.35, magicResist: 0.2, gold: 200, lives: 10, scale: 1.0, atk: 50,
    boss: true, ability: { type: 'warcry', name: 'War Cry', interval: 8, radius: 2.2, haste: 0.4, duration: 4 },
    blurb: 'Leader of the horde. His war cry hastens nearby troops. Ten lives lost if he reaches the gate.',
  },
  witchqueen: {
    name: 'Witch Queen', sprite: 'green_king', hp: 3400, speed: 0.5, armor: 0.15, magicResist: 0.5, gold: 260, lives: 10, scale: 1.0, atk: 40,
    boss: true, heal: { amount: 0.05, radius: 2.4, interval: 3 }, summon: { type: 'thrall', count: 3, interval: 5 },
    ability: { type: 'hex', name: 'Hex', interval: 9, range: 3.0, count: 1, duration: 4 },
    blurb: 'Heals her followers, raises thralls and hexes towers so they cannot fire.',
  },
  ironking: {
    name: 'Iron King', sprite: 'grey_king', hp: 4200, speed: 0.4, armor: 0.6, magicResist: 0.3, gold: 260, lives: 10, scale: 1.05, atk: 60,
    boss: true, ability: { type: 'quake', name: 'Earthshaker', interval: 7, radius: 2.0, stun: 1.5, dmg: 60 },
    blurb: 'Clad in black iron. His stomps stun and batter soldiers and heroes. Bring Dragonslayers.',
  },
  dragon: {
    name: 'Red Dragon', draw: 'dragon', fly: true, hp: 3600, speed: 0.38, armor: 0.4, magicResist: 0.4, gold: 300, lives: 10, scale: 1.6,
    boss: true, ability: { type: 'scorch', name: 'Scorching Roar', interval: 10, range: 3.0, count: 2, duration: 3.5 },
    blurb: 'Soars straight for the keep, scorching towers below so they stop firing. Only ranged towers can reach it.',
  },
  lich: {
    name: 'Lich', sprite: 'grey_mage', hp: 3200, speed: 0.45, armor: 0.1, magicResist: 0.55, gold: 280, lives: 10, scale: 1.1, atk: 35,
    boss: true, raise: { type: 'revenant', radius: 2.4 },
    blurb: 'Every foe that falls near him rises again as a Revenant. Kill him first, or fight his escort far from him.',
  },
  revenant: {
    name: 'Revenant', sprite: 'grey_soldier', hp: 70, speed: 0.85, armor: 0.25, gold: 2, lives: 1, scale: 0.62, atk: 7, minion: true, risen: true,
    blurb: 'A fallen foe raised by the Lich. It cannot be raised again.',
  },
  juggernaut: {
    name: 'Siege Juggernaut', machine: 'siege', hp: 5200, speed: 0.3, armor: 0.55, magicResist: 0.1, gold: 320, lives: 10, scale: 1.4, atk: 70,
    boss: true, ability: { type: 'bombard', name: 'Bombard', interval: 7, range: 4.2, radius: 1.15, duration: 3.5, dmg: 70 },
    blurb: 'A rolling war machine that lobs boulders at your most valuable towers, burying them in rubble. Magic cracks its plating.',
  },
};

// Elite foes appear in endless mode with one extra trait.
TD.ELITES = {
  giant: { name: 'Giant', color: '#ff6b4a', hp: 2.2, scale: 1.25 },
  swift: { name: 'Swift', color: '#ffd84a', hp: 1.4, speed: 1.45 },
  armored: { name: 'Armored', color: '#b8c7d6', hp: 1.4, armor: 0.3 },
  regen: { name: 'Regenerating', color: '#6be08a', hp: 1.5, regen: 0.03 },
};

// Each group: [enemy, count, gap between spawns (s), delay from wave start (s)]
TD.WAVES = [
  [['peasant', 8, 1.1, 0]],
  [['peasant', 12, 0.8, 0]],
  [['peasant', 8, 0.9, 0], ['footman', 4, 1.4, 4]],
  [['footman', 6, 1.2, 0], ['outrider', 5, 0.8, 5]],
  [['footman', 8, 1.0, 0], ['knight', 2, 2.5, 6]],
  [['peasant', 18, 0.45, 0], ['bat', 6, 0.8, 5]],
  [['knight', 4, 2.0, 0], ['priest', 2, 2.0, 2], ['footman', 6, 0.9, 8]],
  [['outrider', 12, 0.5, 0], ['berserker', 4, 1.4, 4]],
  [['knight', 6, 1.6, 0], ['priest', 3, 2.2, 3], ['footman', 8, 0.8, 9]],
  [['footman', 10, 0.8, 0], ['warlord', 1, 0, 6]],
  [['shieldbearer', 5, 1.2, 0], ['knight', 7, 1.3, 2], ['priest', 3, 1.6, 4]],
  [['outrider', 18, 0.35, 0], ['bat', 10, 0.5, 4]],
  [['ironclad', 3, 3.0, 0], ['footman', 8, 0.7, 2], ['berserker', 5, 1.0, 6]],
  [['knight', 10, 1.0, 0], ['shieldbearer', 6, 1.0, 3], ['priest', 4, 2.0, 2]],
  [['outrider', 10, 0.5, 0], ['knight', 8, 1.2, 4], ['warlord', 1, 0, 10]],
  [['peasant', 36, 0.22, 0], ['berserker', 6, 1.0, 3], ['priest', 3, 2.0, 4]],
  [['ironclad', 6, 2.0, 0], ['necromancer', 2, 4.0, 2], ['priest', 3, 3.0, 1], ['wyvern', 2, 4.0, 6]],
  [['outrider', 20, 0.3, 0], ['knight', 10, 1.0, 5], ['wyvern', 3, 3.0, 8], ['bat', 10, 0.4, 2]],
  [['ironclad', 8, 1.6, 0], ['shieldbearer', 8, 1.0, 2], ['necromancer', 3, 3.0, 4]],
  [['ironclad', 6, 2.0, 0], ['priest', 6, 1.5, 2], ['warlord', 2, 6.0, 8], ['ironking', 1, 0, 18]],
];

// Enemy health multiplier for a given wave (1-based), before the map's own multiplier.
TD.waveHpScale = (w) => 1 + 0.08 * (w - 1) + 0.0035 * (w - 1) * (w - 1);

// Endless waves are generated from a budget of "threat" that grows every wave.
// [enemy, first wave it can appear, threat per unit]
// Listed in order of first appearance, since newer types are favoured.
const ENDLESS_POOL = [
  ['peasant', 1, 1], ['footman', 2, 2], ['outrider', 4, 1.5], ['knight', 5, 5], ['bat', 5, 3], ['berserker', 7, 3],
  ['priest', 8, 3], ['shieldbearer', 9, 3.2], ['ironclad', 13, 10], ['wyvern', 14, 14], ['necromancer', 15, 7],
];
// One boss every ten waves, in this order, then the cycle repeats with more of them.
const ENDLESS_BOSSES = ['warlord', 'witchqueen', 'ironking', 'dragon', 'lich', 'juggernaut'];

TD.endlessWave = function (w, rand) {
  const boss = w % 10 === 0;
  const budget = (6 + 3.5 * (w - 1) + 0.17 * (w - 1) * (w - 1)) * (boss ? 0.6 : 1);
  const pool = ENDLESS_POOL.filter((p) => p[1] <= w);
  const groups = [];
  const n = w < 3 ? 1 : w < 8 ? 2 : 2 + (rand() < 0.55 ? 1 : 0);
  const used = new Set();
  let delay = 0;
  for (let g = 0; g < n; g++) {
    let pick;
    for (let tries = 0; tries < 4; tries++) {
      // Newer enemy types are a little more likely to show up.
      pick = pool[Math.min(pool.length - 1, Math.floor(Math.pow(rand(), 0.65) * pool.length))];
      if (!used.has(pick[0])) break;
    }
    used.add(pick[0]);
    // Flyers skip the maze, so they come in smaller flocks.
    const cap = TD.ENEMIES[pick[0]].fly ? 4 + Math.floor(w / 3) : 60;
    const count = Math.max(1, Math.min(cap, Math.round(budget / n / pick[2])));
    // Early waves trickle in; later ones arrive in tighter columns.
    const spread = 1 + 1.8 * Math.max(0, (10 - w) / 10);
    const gap = Math.max(0.22, 0.34 * Math.sqrt(pick[2]) * spread * (count > 20 ? 0.75 : 1));
    groups.push([pick[0], count, +gap.toFixed(2), +delay.toFixed(1)]);
    delay += Math.min(count * gap * (w < 10 ? 1 : 0.6), 12);
  }
  if (boss) groups.push([ENDLESS_BOSSES[(w / 10 - 1) % ENDLESS_BOSSES.length], 1 + Math.floor(w / 40), 5, +(delay * 0.5 + 4).toFixed(1)]);
  return groups;
};

TD.eliteChance = (w) => (w < 12 ? 0 : Math.min(0.45, (w - 11) * 0.02));

// Endless foes toughen exponentially on top of the normal curve.
TD.endlessHpScale = (w) => TD.waveHpScale(w) * (w > 15 ? Math.pow(1.045, w - 15) : 1);

// Endless bounties grow with foe health from wave 20 on, a little slower than health itself:
// gold keeps buying veteran ranks, but every run still ends at some wall of foes.
TD.endlessBounty = (w) => (w > 20 ? Math.pow(TD.endlessHpScale(w) / TD.endlessHpScale(20), 0.85) : 1);

// Endless and Sandbox: a fully upgraded combat tower keeps training veteran ranks. Each rank
// multiplies its damage (and its soldiers' health); the price is a share of its last upgrade
// and grows with every rank.
TD.VETERAN = { mult: 1.25, cost: 0.6, growth: 1.3 };

// Player abilities. Damage figures scale with the current wave.
TD.ABILITIES = {
  meteor: {
    name: 'Meteor Strike', key: 'q', cooldown: 50, radius: 1.3, target: 'area',
    blurb: 'Three blazing rocks crash down on an area and set it alight.',
  },
  reinforce: {
    name: 'Call to Arms', key: 'w', cooldown: 26, radius: 0.5, target: 'road',
    blurb: 'Two militiamen join the fight on the road for 18 seconds.',
  },
  frost: {
    name: 'Winter’s Grasp', key: 'e', cooldown: 45, radius: 1.8, target: 'area',
    blurb: 'Freezes every foe in a wide area solid for a few seconds.',
  },
  horn: {
    name: 'War Horn', key: 'r', cooldown: 60, duration: 8,
    blurb: 'Every tower attacks 40% faster for 8 seconds.',
  },
};
TD.ABILITY_ORDER = ['meteor', 'reinforce', 'frost', 'horn'];

// One-off items placed on road tiles. Their strength scales with the current wave.
TD.TRAPS = {
  spikes: {
    name: 'Spike Trap', key: 'z', cost: 40, dmg: 30, uses: 30,
    blurb: 'Wounds every ground foe that walks over it. Wears out after 30 foes.',
  },
  tar: {
    name: 'Tar Pit', key: 'x', cost: 45, slow: 0.5, duration: 90,
    blurb: 'Ground foes wade through at half speed. Dries up after 90 seconds.',
  },
  keg: {
    name: 'Powder Keg', key: 'c', cost: 60, dmg: 160, radius: 1.3,
    blurb: 'Explodes when a foe comes close, blasting everything around it.',
  },
  barricade: {
    name: 'Barricade', key: 'v', cost: 50, hp: 350,
    blurb: 'Blocks the road until the horde hacks it down. Flyers pass over it.',
  },
};
TD.TRAP_ORDER = ['spikes', 'tar', 'keg', 'barricade'];

// Playable factions: tower stat tweaks (multipliers; armor and slow add), a colour scheme and
// a unique tower each.
TD.FACTIONS = {
  kingdom: {
    name: 'Kingdom of Aldmere', short: 'Kingdom', tint: 'blue', color: '#4f8fe0', hero: 'aldric', unique: 'belltower', icon: 'crown',
    blurb: 'Steadfast knights and holy orders. Balanced, with tougher soldiers.',
    perks: ['Soldiers have +20% health', 'Call to Arms summons 3 militia', '+10% gold from slain foes', 'Chapels cost 20% less', 'Faction tower: Bell Tower'],
    mods: { barracks: { hp: 1.2 }, chapel: { cost: 0.8 } }, militia: 3, bounty: 1.1,
  },
  sylvan: {
    name: 'Sylvan Wardens', short: 'Sylvan', tint: 'teal', color: '#2fbfb0', hero: 'lyra', unique: 'grove', icon: 'leaf',
    blurb: 'Elven archers and druids of the deep woods.',
    perks: ['Archer towers +15% range and +10% damage', 'Wizard slows 10% stronger', 'Catapults cost 15% more', 'Faction tower: Thorn Grove'],
    mods: { archer: { range: 1.15, dmg: 1.1 }, wizard: { slow: 0.1 }, catapult: { cost: 1.15 } },
  },
  ironhold: {
    name: 'Ironhold Clans', short: 'Ironhold', tint: 'gold', color: '#e0b030', hero: 'borin', unique: 'cannon', icon: 'hammer',
    blurb: 'Dwarven engineers from under the mountain.',
    perks: ['Catapults +25%, ballistae +20% damage', 'Soldiers +30% health, +10% armor', 'Traps cost 25% less', 'Archers 10% slower, all towers 8% pricier', 'Faction tower: Cannon Tower'],
    mods: { all: { cost: 1.08 }, catapult: { dmg: 1.25 }, ballista: { dmg: 1.2 }, barracks: { hp: 1.3, armor: 0.1 }, archer: { rate: 0.9 } },
    trapCost: 0.75,
  },
  conclave: {
    name: 'Arcane Conclave', short: 'Conclave', tint: 'violet', color: '#9b59d0', hero: 'vael', unique: 'obelisk', icon: 'star',
    blurb: 'Battle mages of the violet tower.',
    perks: ['Wizard towers +25% damage, +7% range', 'Alchemists +20% damage', 'Abilities recharge 20% faster, hit 20% harder', 'Archers and catapults deal 10% less', 'Faction tower: Mana Obelisk'],
    mods: { wizard: { dmg: 1.25, range: 1.07 }, alchemist: { dmg: 1.2 }, archer: { dmg: 0.9 }, catapult: { dmg: 0.9 } },
    cooldown: 0.8, power: 1.2,
  },
};
TD.FACTION_ORDER = ['kingdom', 'sylvan', 'ironhold', 'conclave'];

// Heroes fight on their own, grow stronger as foes fall near them and respawn at the keep.
// Total experience needed to leave each level (index = current level).
TD.HERO_XP = [0, 40, 100, 180, 290, 430, 600, 820, 1100, 1450];
TD.HERO_KEY = 'h';
TD.HEROES = {
  aldric: {
    name: 'Sir Aldric', title: 'Knight Commander', sprite: 'hero', scale: 0.78,
    blurb: 'A stalwart knight who holds the line and shrugs off blows.',
    hp: 380, hpPerLevel: 55, dmg: 20, dmgPerLevel: 5, rate: 1.25, armor: 0.3, speed: 2.3, regen: 10, respawn: 15,
    skills: {
      whirlwind: { name: 'Whirlwind', level: 1, cooldown: 8, radius: 1.1, mult: 1.6, blurb: 'Spins to strike every foe around him.' },
      rally: { name: 'Rallying Cry', level: 3, cooldown: 18, radius: 2.0, heal: 0.35, blurb: 'When badly hurt, heals himself and nearby soldiers.' },
    },
  },
  lyra: {
    name: 'Lyra Swiftbow', title: 'Elven Ranger', sprite: 'hero_lyra', scale: 0.74,
    blurb: 'A deadly archer who shoots from afar and pins foes in place. Fragile up close.',
    hp: 230, hpPerLevel: 32, dmg: 15, dmgPerLevel: 4, rate: 1.6, armor: 0.1, speed: 2.8, regen: 8, respawn: 12,
    ranged: { range: 2.9, projectile: 'arrow', damage: 'physical' },
    skills: {
      volley: { name: 'Volley', level: 1, cooldown: 7, arrows: 5, mult: 1.0, blurb: 'Looses an arrow at up to five foes at once.' },
      snare: { name: 'Entangling Shot', level: 3, cooldown: 12, stun: 2.2, mult: 2.0, blurb: 'Pins the toughest foe in range to the ground.' },
    },
  },
  borin: {
    name: 'Thane Borin', title: 'Dwarven Warlord', sprite: 'hero_borin', scale: 0.7,
    blurb: 'A stubborn dwarf in heavy plate. Slow, but nearly impossible to bring down.',
    hp: 540, hpPerLevel: 78, dmg: 17, dmgPerLevel: 4, rate: 1.0, armor: 0.45, speed: 1.9, regen: 14, respawn: 18,
    skills: {
      slam: { name: 'Ground Slam', level: 1, cooldown: 10, radius: 1.3, mult: 1.3, stun: 1.0, blurb: 'Smashes the ground, damaging and stunning foes around him.' },
      ironskin: { name: 'Iron Skin', level: 3, cooldown: 20, duration: 6, reduce: 0.6, blurb: 'When hurt, hardens his skin to block 60% of damage.' },
    },
  },
  vael: {
    name: 'Archmage Vael', title: 'Conclave Archmage', sprite: 'hero_vael', scale: 0.74,
    blurb: 'A master of arcane fire whose bolts ignore armor. Keep him behind the line.',
    hp: 250, hpPerLevel: 34, dmg: 22, dmgPerLevel: 6, rate: 0.85, armor: 0.05, speed: 2.2, regen: 8, respawn: 14,
    ranged: { range: 2.6, projectile: 'orb', damage: 'magic' },
    skills: {
      nova: { name: 'Arcane Nova', level: 1, cooldown: 9, radius: 1.6, mult: 2.0, blurb: 'Blasts every foe around him with raw magic.' },
      storm: { name: 'Chain Lightning', level: 3, cooldown: 11, chain: 5, mult: 1.6, blurb: 'Lightning arcs between up to six foes.' },
    },
  },
};
TD.HERO_ORDER = ['aldric', 'lyra', 'borin', 'vael'];

TD.SPEEDS = [1, 2, 3, 5];

TD.ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Victory', blurb: 'Win any campaign map.', glory: 5 },
  { id: 'flawless', name: 'Not a Scratch', blurb: 'Win a campaign map without losing a single life.', glory: 10 },
  { id: 'all_maps', name: 'Defender of the Realm', blurb: 'Win every campaign map.', glory: 25 },
  { id: 'all_stars', name: 'Star of the Realm', blurb: 'Earn three stars on every campaign map.', glory: 40 },
  { id: 'frost_win', name: 'Winter Is Over', blurb: 'Win Frostmarch Pass.', glory: 15 },
  { id: 'purist', name: 'Archery Purist', blurb: 'Win a campaign map building only Archer Towers.', glory: 25 },
  { id: 'endless20', name: 'Stubborn', blurb: 'Reach wave 20 in Endless.', glory: 10 },
  { id: 'endless35', name: 'Unbreakable', blurb: 'Reach wave 35 in Endless.', glory: 20 },
  { id: 'endless50', name: 'Living Legend', blurb: 'Reach wave 50 in Endless.', glory: 40 },
  { id: 'endless100', name: 'Eternal Watch', blurb: 'Reach wave 100 in Endless.', glory: 60 },
  { id: 'kills1k', name: 'Slayer', blurb: 'Defeat 1,000 foes in total.', glory: 10 },
  { id: 'kills10k', name: 'Scourge of the Horde', blurb: 'Defeat 10,000 foes in total.', glory: 30 },
  { id: 'boss_warlord', name: 'Kingslayer', blurb: 'Defeat the Warlord.', glory: 5 },
  { id: 'boss_witchqueen', name: 'Witch Hunter', blurb: 'Defeat the Witch Queen.', glory: 10 },
  { id: 'boss_ironking', name: 'Rust to Rust', blurb: 'Defeat the Iron King.', glory: 10 },
  { id: 'boss_dragon', name: 'Dragonbane', blurb: 'Defeat the Red Dragon.', glory: 15 },
  { id: 'boss_lich', name: 'Laid to Rest', blurb: 'Defeat the Lich.', glory: 20 },
  { id: 'boss_juggernaut', name: 'Siege Breaker', blurb: 'Defeat the Siege Juggernaut.', glory: 20 },
  { id: 'skyguard', name: 'Skyguard', blurb: 'Bring down 100 flying foes in total.', glory: 10 },
  { id: 'trapper', name: 'Trapper', blurb: 'Defeat 100 foes with traps in total.', glory: 10 },
  { id: 'meteor10', name: 'Extinction Event', blurb: 'Defeat 10 foes with a single Meteor Strike.', glory: 15 },
  { id: 'hero10', name: 'Hero of the Realm', blurb: 'Raise any hero to level 10.', glory: 15 },
  { id: 'specialist', name: 'Specialist', blurb: 'Build all sixteen tower specializations.', glory: 25 },
  { id: 'rank5', name: 'Masterwork', blurb: 'Raise any tower to rank five.', glory: 5 },
  { id: 'builder', name: 'Master Builder', blurb: 'Have 20 towers standing at once.', glory: 10 },
  { id: 'hoarder', name: 'Treasury Overflowing', blurb: 'Hold 2,000 gold at once.', glory: 10 },
  { id: 'early_bird', name: 'Eager for Battle', blurb: 'Call 10 waves early in a single game.', glory: 10 },
  { id: 'all_factions', name: 'Grand Alliance', blurb: 'Win a campaign map with every faction.', glory: 30 },
  { id: 'all_heroes', name: 'Hall of Heroes', blurb: 'Win a campaign map with every hero.', glory: 30 },
  { id: 'unique_max', name: 'Signature Strength', blurb: 'Raise a faction tower to level 3.', glory: 10 },
  { id: 'blackwood_win', name: 'Out of the Woods', blurb: 'Win Blackwood.', glory: 20 },
  { id: 'armory', name: 'Fully Armed', blurb: 'Master every Royal Armory perk.', glory: 0 },
];

// Permanent upgrades bought with Glory, earned by playing.
TD.PERKS = [
  { id: 'chest', name: 'War Chest', blurb: '+40 starting gold per rank.' },
  { id: 'walls', name: 'Stout Walls', blurb: '+3 lives per rank.' },
  { id: 'masons', name: 'Master Masons', blurb: 'Towers and upgrades cost 4% less per rank.' },
  { id: 'steel', name: 'Tempered Steel', blurb: '+5% tower damage per rank.' },
  { id: 'bounty', name: 'Royal Bounty', blurb: '+8% gold from slain foes per rank.' },
  { id: 'drill', name: 'Drill Sergeants', blurb: '+15% soldier health per rank.' },
  { id: 'rites', name: 'Swift Rites', blurb: 'Abilities recharge 10% faster per rank.' },
  { id: 'lore', name: 'Arcane Lore', blurb: '+15% ability power per rank.' },
  { id: 'fletching', name: 'Fletching', blurb: '+4% tower range per rank.' },
  { id: 'heroism', name: 'Hero Training', blurb: 'Heroes earn 20% more experience and have 10% more health per rank.' },
  { id: 'trapmaster', name: 'Trapmaster', blurb: 'Traps cost 10% less and hit 15% harder per rank.' },
  { id: 'tithe', name: 'Royal Tithe', blurb: '+10% windmill income and wave-clear gold per rank.' },
  { id: 'gate', name: 'Fortified Gate', blurb: '10% chance per rank that a foe reaching the keep costs no lives.' },
  { id: 'boots', name: 'Swift Boots', blurb: 'Heroes move 10% faster and return 15% sooner per rank.' },
];
TD.PERK_COSTS = [10, 20, 35];

TD.MODES = {
  campaign: { name: 'Campaign', blurb: '20 waves per map. Earn up to three stars.' },
  endless: { name: 'Endless', blurb: 'Waves never stop and keep getting nastier. How long can you hold?' },
  sandbox: { name: 'Sandbox', blurb: 'Endless waves with unlimited gold and an unbreakable keep. Try anything.' },
};

// Paths are waypoints in cell coordinates; every leg must be straight. All paths of a map
// end on the same cell heading north, so the horde marches up into the castle gate.
TD.MAPS = [
  {
    id: 'greenvale', name: 'Greenvale Road', difficulty: 'Squire',
    blurb: 'A long road winding through farmland. A fine place to learn the trade.',
    ground: 'grass', hpMul: 1.1, gold: 260, lives: 20, seed: 11, density: 0.36,
    paths: [[[-1, 3], [3, 3], [3, 9], [8, 9], [8, 4], [12, 4], [12, 10], [16, 10], [16, 5]]],
    decor: ['pine', 'pine', 'tree_tall', 'tree_slim', 'pine_small', 'bush', 'berry_bush', 'rock_m', 'rock_s', 'log', 'stump'],
    props: [['mill', 18, 2], ['house', 19, 4], ['market', 18, 6], ['church', 19, 9], ['house_b', 18, 11], ['statue', 14, 2]],
  },
  {
    id: 'twinfords', name: 'Twin Fords', difficulty: 'Squire',
    blurb: 'Two roads from the west meet before the gate. Watch both flanks.',
    ground: 'grass', hpMul: 1.0, gold: 280, lives: 20, seed: 31, density: 0.34,
    paths: [
      [[-1, 2], [6, 2], [6, 6], [11, 6], [11, 9], [15, 9], [15, 4]],
      [[-1, 10], [4, 10], [4, 8], [9, 8], [9, 6], [11, 6], [11, 9], [15, 9], [15, 4]],
    ],
    decor: ['tree_tall', 'tree_slim', 'pine', 'bush', 'berry_bush', 'rock_m', 'log', 'stump', 'pine_small'],
    props: [['mill', 18, 1], ['house', 17, 6], ['church', 19, 7], ['market', 18, 10], ['house_b', 13, 1]],
  },
  {
    id: 'dunewatch', name: 'Dunewatch', difficulty: 'Knight',
    blurb: 'Sun-baked switchbacks with little room to spare. The horde hits harder here.',
    ground: 'sand', hpMul: 1.5, gold: 240, lives: 15, seed: 4, density: 0.3,
    paths: [[[2, -1], [2, 7], [6, 7], [6, 3], [10, 3], [10, 10], [15, 10], [15, 5]]],
    decor: ['clay_m', 'clay_s', 'clay_pair', 'clay_cluster', 'clay_gold', 'tree_slim', 'bush', 'rock_s', 'log'],
    props: [['cottage', 17, 2], ['market', 18, 4], ['dome', 18, 7], ['cottage', 19, 9], ['stall', 17, 10]],
  },
  {
    id: 'ashenhollow', name: 'Ashen Hollow', difficulty: 'Knight',
    blurb: 'Scorched earth where roads from north and south converge on a short final stretch.',
    ground: 'dirt', hpMul: 1.25, gold: 280, lives: 15, seed: 57, density: 0.3,
    paths: [
      [[1, -1], [1, 4], [5, 4], [5, 1], [9, 1], [9, 6], [14, 6], [14, 4]],
      [[-1, 10], [4, 10], [4, 8], [7, 8], [7, 10], [11, 10], [11, 6], [14, 6], [14, 4]],
    ],
    decor: ['pine', 'pine_small', 'stump', 'stump', 'log', 'rock_m', 'rock_pair', 'clay_m', 'bush', 'fire'],
    props: [['house_b', 17, 2], ['cottage', 18, 5], ['stall', 17, 8], ['house', 16, 10], ['statue', 12, 3]],
  },
  {
    id: 'frostmarch', name: 'Frostmarch Pass', difficulty: 'Warlord',
    blurb: 'A short, frozen pass. Every arrow counts and the keep can take few blows.',
    ground: 'snow', hpMul: 1.2, gold: 230, lives: 10, seed: 23, density: 0.36,
    paths: [[[-1, 6], [5, 6], [5, 2], [11, 2], [11, 9], [17, 9], [17, 5]]],
    decor: ['pine', 'pine', 'pine', 'pine_small', 'rock_m', 'rock_pair', 'rock_cluster', 'rock_s', 'stump'],
    props: [['house', 19, 1], ['mill', 15, 4], ['church', 19, 7], ['house_b', 14, 11]],
  },
  {
    id: 'kingsbridge', name: 'Kingsbridge', difficulty: 'Knight',
    blurb: 'Grey stone streets snaking through the old city. The longest road in the realm.',
    ground: 'stone', hpMul: 1.3, gold: 260, lives: 15, seed: 77, density: 0.24,
    paths: [[[-1, 2], [3, 2], [3, 9], [7, 9], [7, 4], [11, 4], [11, 10], [15, 10], [15, 7], [18, 7], [18, 3]]],
    decor: ['rock_m', 'rock_s', 'rock_pair', 'tree_slim', 'tree_tall', 'bush', 'log', 'stump'],
    props: [['house', 15, 1], ['market', 13, 7], ['church', 9, 1], ['statue', 5, 6], ['house_b', 19, 9], ['stall', 1, 6]],
  },
  {
    id: 'blackwood', name: 'Blackwood', difficulty: 'Warlord',
    blurb: 'Three roads cut through a dark forest and meet beneath the keep.',
    ground: 'grass', hpMul: 1.0, gold: 340, lives: 20, seed: 91, density: 0.45, weather: 'leaves',
    paths: [
      [[-1, 1], [5, 1], [5, 5], [10, 5], [10, 8], [14, 8], [14, 4]],
      [[-1, 10], [6, 10], [6, 8], [10, 8], [14, 8], [14, 4]],
      [[20, 1], [17, 1], [17, 6], [19, 6], [19, 10], [16, 10], [16, 8], [14, 8], [14, 4]],
    ],
    decor: ['pine', 'pine', 'tree_tall', 'pine_small', 'tree_slim', 'bush', 'stump', 'log', 'rock_m'],
    props: [['house_b', 1, 4], ['mill', 8, 2], ['church', 2, 7], ['house', 18, 3], ['statue', 12, 6]],
  },
];
