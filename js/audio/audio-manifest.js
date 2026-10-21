/**
 * MathMon audio file manifest.
 *
 * Every sound id the game uses is generated in code (js/audio/audio-synth.js),
 * so no files are required. To use real recordings instead:
 *   1. Put files in the /audio folder using the filenames below (see audio/README.md).
 *   2. Set `filesEnabled: true`.
 * Each file that loads replaces its generated sound; files that are missing
 * fall back to the generated version automatically.
 *
 * Element / monster / action variants: the manager looks up the most specific
 * id first, e.g. 'attack.impact.fire.skill2' → 'attack.impact.fire' → generated.
 */
const MathMonAudioManifest = {
    filesEnabled: false,
    basePath: 'audio/',

    // Looping music. `intense` (optional) is a second, layered stem with the
    // same length/tempo that fades in as battle intensity rises.
    music: {
        menu:      { file: 'music/menu_ambient.ogg' },
        overworld: { file: 'music/overworld_theme.ogg' },
        battle:    { file: 'music/battle_theme.ogg', intense: 'music/battle_theme_intense.ogg' }
    },

    sfx: {
        // UI
        'ui.click': 'sfx/ui_click.ogg',
        'ui.hover': 'sfx/ui_hover.ogg',
        'ui.select': 'sfx/ui_select.ogg',
        'ui.denied': 'sfx/ui_denied.ogg',
        'ui.door': 'sfx/ui_door.ogg',
        'ui.travel': 'sfx/ui_travel.ogg',
        'ui.levelup': 'sfx/ui_levelup.ogg',
        // Question gate
        'quiz.correct': 'sfx/quiz_correct.ogg',
        'quiz.wrong': 'sfx/quiz_wrong.ogg',
        'quiz.tick': 'sfx/quiz_tick.ogg',
        // MP / turns / health
        'mp.charge': 'sfx/mp_charge.ogg',
        'mp.ready': 'sfx/mp_ultimate_ready.ogg',
        'turn.player': 'sfx/turn_player.ogg',
        'turn.enemy': 'sfx/turn_enemy.ogg',
        'hit.damage': 'sfx/hit_damage.ogg',
        'heal': 'sfx/heal.ogg',
        'status.burn': 'sfx/status_burn.ogg',
        'status.stun': 'sfx/status_stun.ogg',
        // Attacks: cast (wind-up) and impact, per element and per move
        'attack.cast.fire.normal': 'sfx/fire_normal_swing.ogg',
        'attack.cast.fire.skill1': 'sfx/fire_skill1_cast.ogg',
        'attack.cast.fire.skill2': 'sfx/fire_skill2_cast.ogg',
        'attack.impact.fire': 'sfx/fire_impact.ogg',
        'attack.cast.water.normal': 'sfx/water_normal_swing.ogg',
        'attack.cast.water.skill1': 'sfx/water_skill1_cast.ogg',
        'attack.cast.water.skill2': 'sfx/water_skill2_cast.ogg',
        'attack.impact.water': 'sfx/water_impact.ogg',
        'attack.cast.wind.normal': 'sfx/wind_normal_swing.ogg',
        'attack.cast.wind.skill1': 'sfx/wind_skill1_cast.ogg',
        'attack.cast.wind.skill2': 'sfx/wind_skill2_cast.ogg',
        'attack.impact.wind': 'sfx/wind_impact.ogg',
        'attack.cast.earth.normal': 'sfx/earth_normal_swing.ogg',
        'attack.cast.earth.skill1': 'sfx/earth_skill1_cast.ogg',
        'attack.cast.earth.skill2': 'sfx/earth_skill2_cast.ogg',
        'attack.impact.earth': 'sfx/earth_impact.ogg',
        'ult.charge': 'sfx/ultimate_charge.ogg',
        'attack.impact.ultimate': 'sfx/ultimate_impact.ogg',
        // Monster voices
        'monster.dragon.roar': 'sfx/dragon_roar.ogg',
        'monster.dragon.hurt': 'sfx/dragon_hurt.ogg',
        'monster.dragon.defeat': 'sfx/dragon_defeat.ogg',
        'monster.kraken.roar': 'sfx/kraken_roar.ogg',
        'monster.kraken.hurt': 'sfx/kraken_hurt.ogg',
        'monster.kraken.defeat': 'sfx/kraken_defeat.ogg',
        'monster.typhoeus.roar': 'sfx/typhoeus_roar.ogg',
        'monster.typhoeus.hurt': 'sfx/typhoeus_hurt.ogg',
        'monster.typhoeus.defeat': 'sfx/typhoeus_defeat.ogg',
        'monster.titan.roar': 'sfx/titan_roar.ogg',
        'monster.titan.hurt': 'sfx/titan_hurt.ogg',
        'monster.titan.defeat': 'sfx/titan_defeat.ogg',
        // Jingles
        'jingle.victory': 'sfx/jingle_victory.ogg',
        'jingle.defeat': 'sfx/jingle_defeat.ogg'
    }
};
