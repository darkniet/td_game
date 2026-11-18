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
- **7 maps**: Greenvale Road, Twin Fords, Dunewatch, Ashen Hollow, Frostmarch Pass, Kingsbridge and Blackwood (three entrances).
- **4 playable factions**, each with its own colours, stat bonuses and drawbacks, and a unique faction tower:
  - **Kingdom of Aldmere**: tougher soldiers, extra militia; *Bell Tower* stuns everything around it.
  - **Sylvan Wardens**: long-range archers, stronger slows; *Thorn Grove* lashes and slows all nearby foes.
  - **Ironhold Clans**: heavy siege and armor, cheap traps, pricier towers; *Cannon Tower* blasts through armor.
  - **Arcane Conclave**: stronger magic and abilities; *Mana Obelisk* fires a beam that heats up on one target.
- **8 shared towers**: Archer, Catapult, Wizard, Ballista, Barracks (soldiers block the road), Alchemist (burn + armor corrosion), Chapel (buffs nearby towers) and Windmill (gold each wave).
- **16 specializations**: at level 3, eight towers pick one of two branches, each with 2 more ranks: Ranger Lodge / Marksman Spire, Bombard / Trebuchet, Frost Spire / Storm Tower, Scorpion Nest / Dragonslayer, Paladin Order / Berserker Hall, Plague Doctor / Pyromancer, Cathedral / Oracle's Sanctum, Royal Bank / Granary.
- **4 heroes** you send anywhere on the map, each levelling up to 10 with two skills: Sir Aldric (knight), Lyra Swiftbow (ranged archer), Thane Borin (dwarf tank) and Archmage Vael (ranged mage).
- **4 abilities**: Meteor Strike, Call to Arms, Winter's Grasp, War Horn.
- **4 road traps**: Spike Trap, Tar Pit, Powder Keg and Barricade.
- **16 enemy types**, including healers, summoners, flyers (bats, wyverns) that cross the map along dashed flight lanes, and four bosses with signature moves: the Warlord's War Cry hastens his troops, the Iron King's stomps stun your soldiers, and the Witch Queen and Red Dragon hex or scorch towers so they stop firing.
- **Combos**: heavy hits *shatter* frozen foes for 50% extra damage, and burning foes *ignite* tar pits into fire fields.
- **Click any foe** to inspect its health, armor, speed, traits and current status effects. Tower panels show estimated damage per second.
- **Royal Armory**: 14 permanent perks bought with Glory, which you earn in every game.
- **29 trophies** that pay out Glory, and a **Codex** of every foe, tower and trap you've met.
- **Quality of life**: auto-save with Continue, a full refund when you sell before the next wave, per-tower damage stats and an end-of-battle report, auto-waves, 1×–5× speed, and settings for volume, shake, particles and more.

### Controls

| Key | Action |
| --- | --- |
| `1`–`9` | Pick a tower to build (`9` is your faction's tower) |
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
| `^` | Cheat menu (gold, lives, abilities, hero level, Glory); also in the pause menu |
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

## License

Code is released under the [MIT License](LICENSE). The Kenney sprites in `assets/` keep their own CC0 license.
