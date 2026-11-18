# Hold the Keep

A medieval tower defense game for the browser. Plain HTML, CSS and JavaScript on a canvas, with no build step and no dependencies.

## Play

Open `index.html` in a browser (double-clicking it works). To serve it instead:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Features

- **3 modes**
  - **Campaign**: 20 waves per map, earn up to 3 stars.
  - **Endless**: procedurally generated waves that never stop, with elite foes from wave 12 and a boss every 10 waves. Your best wave is saved per map.
  - **Sandbox**: endless waves with unlimited gold and lives.
- **5 maps**: Greenvale Road, Twin Fords, Dunewatch, Ashen Hollow and Frostmarch Pass. Two of them have two entrances.
- **8 towers**: Archer, Catapult, Wizard, Ballista, Barracks (soldiers block the road), Alchemist (burn + armor corrosion), Chapel (buffs nearby towers) and Windmill (gold each wave).
- **Specializations**: at level 3, five towers pick one of two branches, each with 2 more ranks: Ranger Lodge / Marksman Spire, Bombard / Trebuchet, Frost Spire / Storm Tower, Scorpion Nest / Dragonslayer, Paladin Order / Berserker Hall.
- **Hero**: Sir Aldric, a knight you send anywhere on the map. He blocks foes, levels up to 10 and learns Whirlwind and Rallying Cry.
- **4 abilities**: Meteor Strike, Call to Arms, Winter's Grasp, War Horn.
- **4 road traps**: Spike Trap, Tar Pit, Powder Keg and Barricade.
- **16 enemy types**, including healers, summoners, flyers (bats, wyverns) that cross the map along dashed flight lanes, and four bosses (Warlord, Witch Queen, Iron King, Red Dragon).
- **Royal Armory**: permanent perks bought with Glory, which you earn in every game.
- **25 trophies** that pay out Glory, and a **Codex** of every foe, tower and trap you've met.
- **Quality of life**: auto-save with Continue, a full refund when you sell before the next wave, per-tower damage stats and an end-of-battle report, auto-waves, 1×–5× speed, and settings for volume, shake, particles and more.

### Controls

| Key | Action |
| --- | --- |
| `1`–`8` | Pick a tower to build |
| `Z` `X` `C` `V` | Lay a trap on the road |
| `Q` `W` `E` `R` | Abilities |
| `H` | Select the hero (then click the map to move him) |
| Click | Build / select a tower |
| `Shift` + click | Keep building the same tower |
| `U` / `Del` | Upgrade / sell the selected tower |
| `T` | Cycle the selected tower's targeting |
| `N` | Call the next wave (early = bonus gold) |
| `F` | Cycle game speed (1×/2×/3×/5×) |
| `A` | Toggle auto-waves |
| `M` | Mute |
| `^` | Cheat menu (gold, lives, abilities, hero level, Glory) |
| `Space` | Pause |
| `Esc` / right-click | Cancel |

## Project layout

```
index.html        page shell
css/style.css     UI styling
js/data.js        towers, enemies, waves, abilities, perks and maps (balance numbers live here)
js/sim.js         game rules and state, no DOM (also runs under Node)
js/render.js      canvas drawing, effects and procedural catapult/ballista art
js/audio.js       synthesized WebAudio sound effects
js/main.js        input, HUD, menus, progression and the main loop
assets/           sprites + manifest.js
```

## Credits

Sprites from the [“Medieval RTS” pack by Kenney](https://kenney.nl) (CC0, see `assets/KENNEY_LICENSE.txt`), downloaded via [OpenGameArt](https://opengameart.org/content/medieval-rts-120). Several tower sprites are recolors of Kenney sprites. Fonts: Pirata One and Alegreya Sans from Google Fonts.
