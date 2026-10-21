# MathMon audio

The game ships with **every sound and music track generated in code**
(`js/audio/audio-synth.js`), so it plays complete audio with this folder empty.
Add real recordings here to replace any of them — one at a time is fine.

## Setup

1. Drop files into `audio/music/` and `audio/sfx/` using the names below
   (`.ogg` recommended; `.mp3` / `.wav` also work if you change the extension in
   `js/audio/audio-manifest.js`).
2. In `js/audio/audio-manifest.js` set `filesEnabled: true`.
3. Reload. Files are preloaded before each battle starts; any file that is missing
   or fails to decode silently falls back to its generated sound.

Tips: trim silence at the start of SFX (they are triggered on the exact impact
frame), normalize to about −3 dBFS peak, keep music loops seamless (the loop point
is the file's end), and make `battle_theme_intense.ogg` the same length and tempo
as `battle_theme.ogg` — it is layered on top and faded in as the fight heats up.

## File list

### Music (`audio/music/`)

| File | Used for |
|------|----------|
| `menu_ambient.ogg` | Title / menus — calm ambient loop |
| `overworld_theme.ogg` | Towns — light exploration loop |
| `battle_theme.ogg` | Battle — epic energetic loop |
| `battle_theme_intense.ogg` | Optional layer faded in at low HP / ultimate ready (same length as the battle theme) |

### Sound effects (`audio/sfx/`)

| File | Moment |
|------|--------|
| `ui_click.ogg`, `ui_hover.ogg`, `ui_select.ogg`, `ui_denied.ogg` | Buttons, menu hover, confirm, not enough MP |
| `ui_door.ogg`, `ui_travel.ogg`, `ui_levelup.ogg` | Enter house, change town, level up |
| `quiz_correct.ogg`, `quiz_wrong.ogg`, `quiz_tick.ogg` | Correct-answer chime, wrong-answer buzz, last-seconds timer tick |
| `mp_charge.ogg`, `mp_ultimate_ready.ogg` | MP gained (pitch rises with the bar), ultimate ready |
| `turn_player.ogg`, `turn_enemy.ogg` | Turn change |
| `hit_damage.ogg`, `heal.ogg` | Taking damage, healing |
| `status_burn.ogg`, `status_stun.ogg` | Burn tick, stunned |
| `fire_normal_swing.ogg`, `fire_skill1_cast.ogg`, `fire_skill2_cast.ogg`, `fire_impact.ogg` | Fire: roaring flames, crackling |
| `water_normal_swing.ogg`, `water_skill1_cast.ogg`, `water_skill2_cast.ogg`, `water_impact.ogg` | Water: rushing waves, splashes |
| `wind_normal_swing.ogg`, `wind_skill1_cast.ogg`, `wind_skill2_cast.ogg`, `wind_impact.ogg` | Wind: sharp whooshes, gusts |
| `earth_normal_swing.ogg`, `earth_skill1_cast.ogg`, `earth_skill2_cast.ogg`, `earth_impact.ogg` | Earth: deep rumbles, rock impacts |
| `ultimate_charge.ogg`, `ultimate_impact.ogg` | Ultimate charge-up riser and the big hit (echo is added by the engine's reverb) |
| `dragon_roar.ogg`, `dragon_hurt.ogg`, `dragon_defeat.ogg` | Pyrovex (Fire Dragon) |
| `kraken_roar.ogg`, `kraken_hurt.ogg`, `kraken_defeat.ogg` | Kraken |
| `typhoeus_roar.ogg`, `typhoeus_hurt.ogg`, `typhoeus_defeat.ogg` | Typhoeus (storm giant) |
| `titan_roar.ogg`, `titan_hurt.ogg`, `titan_defeat.ogg` | Seismodon (Earth Titan) |
| `jingle_victory.ogg`, `jingle_defeat.ogg` | Victory fanfare, somber defeat sting |

Effectiveness is applied by the engine, so one impact file per element is enough:
super-effective hits get a heavier sub-boom and more level, weak hits are
low-pass filtered ("muffled") and quieter.

## Free sources

| Source | What | License notes |
|--------|------|---------------|
| [Pixabay — sound effects](https://pixabay.com/sound-effects/) and [music](https://pixabay.com/music/) | Roars, whooshes, impacts, battle / ambient loops | Pixabay Content License — free for games, no attribution required |
| [freesound.org](https://freesound.org) | Huge library: fire crackle, waves, rock impacts, creature roars | Filter by **CC0** to avoid attribution; CC-BY needs credit |
| [Kenney — audio packs](https://kenney.nl/assets?q=audio) | UI clicks, impacts, interface sounds | CC0 |
| [OpenGameArt](https://opengameart.org) | Battle music, jingles, SFX | Mixed — check each (CC0 / CC-BY / GPL) |
| [Sonniss GDC Game Audio Bundle](https://sonniss.com/gameaudiogdc) | Professional SFX libraries (yearly free bundle) | Royalty-free for commercial use |

### Generate your own

- **[jsfxr](https://sfxr.me)** / **[ChipTone](https://sfbgames.itch.io/chiptone)** — retro hits, chimes, buzzes, power-ups in seconds.
- **[BeepBox](https://www.beepbox.co)** — make and export music loops in the browser.
- **[Audacity](https://www.audacityteam.org)** — trim, normalize, add reverb, export `.ogg`.
- Or edit the generators in `js/audio/audio-synth.js` — every sound is a short,
  commented Web Audio function you can tweak.
