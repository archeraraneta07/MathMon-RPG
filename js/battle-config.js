/**
 * MathMon battle balance & rules configuration.
 *
 * Every tunable number for the question gate, battle commands, mana and the
 * elemental system lives here so balance can be adjusted without touching
 * engine code. See README.md → "Battle System Tuning" for guidance.
 */
const MathMonBattleConfig = {
    // ---- Question gate --------------------------------------------------------
    // Turn order: choose a move → answer a math question whose difficulty matches
    // the move (questionTiers) → the attack resolves.
    questionGate: {
        // 'strict'  → wrong answer / timeout: the attack fails.
        // 'lenient' → wrong answer / timeout: the attack lands at reduced damage.
        rule: 'strict',
        wrongAnswerDamageMultiplier: 0.5,   // used by 'lenient' only
        refundMpOnMiss: true,               // a failed attack does not spend its MP
        timerEnabled: true,                 // seconds per tier: questionTiers.<tier>.timerSeconds
        fastAnswerSeconds: 4,               // answer within this many seconds…
        fastCritMultiplier: 1.3,            // …for a CRITICAL hit (× this)
        comboStep: 0.05,                    // +5% damage per consecutive correct answer after the first…
        maxComboBonus: 0.25,                // …capped at +25%
        streakLength: 3,                    // every N correct answers in a row…
        streakMpBonus: 15,                  // …grants this much bonus MP
        mpPerCorrectAnswer: 5,              // small MP trickle for each correct answer
        feedbackDelayMs: 700,               // pause on "Correct!" before the attack launches
        wrongRevealDelayMs: 1500,           // pause showing "Incorrect, the answer was X"
        // 'generated' (rules in questionTiers), 'bank' (js/question-bank.js), or 'mixed'
        source: 'generated',
        mixedBankChance: 0.4,
        // Which difficulty tier each move asks for.
        actionTier: { normal: 'easy', skill1: 'medium', skill2: 'medium', ultimate: 'hard' }
    },

    /*
     * Question difficulty per tier (js/question-deck.js). Only + − × ÷ with
     * whole-number answers: subtraction never goes below zero, division is built
     * as (divisor × quotient) ÷ divisor so it always divides exactly.
     * Ranges are inclusive [min, max]; `weights` pick how often each operation appears.
     */
    questionTiers: {
        easy: {                               // e.g. 12 + 7, 18 − 9, 4 × 6, 20 ÷ 5
            timerSeconds: 15,
            weights: { addition: 3, subtraction: 3, multiplication: 1, division: 1 },
            addition: { a: [5, 20], b: [2, 15] },
            subtraction: { a: [10, 30], b: [2, 15] },
            multiplication: { a: [2, 5], b: [2, 9] },
            division: { divisor: [2, 5], quotient: [2, 9] }
        },
        medium: {                             // e.g. 8 × 6, 56 ÷ 7, 47 + 28
            timerSeconds: 20,
            weights: { addition: 1, subtraction: 1, multiplication: 3, division: 3 },
            addition: { a: [20, 79], b: [11, 49] },
            subtraction: { a: [40, 99], b: [11, 39] },
            multiplication: { a: [3, 12], b: [3, 12] },
            division: { divisor: [3, 12], quotient: [3, 12] }
        },
        hard: {                               // e.g. 144 ÷ 12, 348 + 276, 23 × 7
            timerSeconds: 30,
            weights: { addition: 2, subtraction: 2, multiplication: 2, division: 3 },
            addition: { a: [120, 499], b: [101, 399] },
            subtraction: { a: [300, 999], b: [101, 299] },
            multiplication: { a: [12, 25], b: [3, 9] },
            division: { divisor: [6, 12], quotient: [8, 15] }
        }
    },

    // ---- Typed-answer input ------------------------------------------------------
    answers: {
        maxLength: 6,           // digits only — answers are whole numbers
        blockPaste: true        // block paste / drag-drop into the answer box
    },

    // ---- First-turn tutorial -------------------------------------------------------
    tutorial: {
        enabled: true,
        everyBattle: true       // false → only until the player has seen it once (localStorage)
    },

    // ---- Hint button --------------------------------------------------------
    hint: {
        enabled: true,
        penalty: 'damage',      // 'damage' → damage × (1 − damagePenalty) this turn; 'mp' → costs mpCost
        damagePenalty: 0.25,
        mpCost: 10
    },

    // ---- Mana (Feature 2) ----------------------------------------------------
    mp: {
        max: 100,
        start: 0
    },

    // ---- Battle commands (Feature 2) -----------------------------------------
    // power = multiplier on the base damage. effectSlot points at the element's
    // skill definition below (names/effects are element specific).
    actions: {
        normal:   { slot: 1, label: 'Normal Attack', cost: 0,   mpGain: 10, power: 1.0 },
        skill1:   { slot: 2, label: '1st Skill',     cost: 20,  mpGain: 0,  power: 1.6 },
        skill2:   { slot: 3, label: '2nd Skill',     cost: 40,  mpGain: 0,  power: 2.2 },
        ultimate: { slot: 4, label: 'Ultimate',      cost: 100, mpGain: 0,  power: 4.0, resetsMp: true }
    },
    actionOrder: ['normal', 'skill1', 'skill2', 'ultimate'],

    // ---- Damage --------------------------------------------------------------
    damage: {
        playerBase: 10,          // base = playerBase + level * playerPerLevel
        playerPerLevel: 1.5,
        variance: 0.1,           // ±10% random spread
        minimum: 1,
        heavyHitShakeRatio: 0.18 // screen shake when a hit removes ≥18% of max HP
    },

    enemy: {
        hpBase: 55,              // hp = hpBase + (level - 1) * hpPerLevel
        hpPerLevel: 8,
        gymHpMultiplier: 1.4,
        trainingHpMultiplier: 0.8,
        damageBase: 8,           // dmg = damageBase + floor(level * damagePerLevel)
        damagePerLevel: 0.4,
        gymDamageMultiplier: 1.2,
        usesElements: true,      // enemy attacks also respect type effectiveness
        wrongAnswerHealPercent: 0 // set to e.g. 0.1 to restore the old "enemy heals on miss" rule
    },

    player: {
        hpBase: 50,              // hp = hpBase + level * hpPerLevel
        hpPerLevel: 10
    },

    // ---- Elemental system (Feature 3) ----------------------------------------
    // Cycle: Water > Fire > Wind > Earth > Water
    effectiveness: {
        strong:  { multiplier: 1.5, label: 'Super Effective!' },
        weak:    { multiplier: 0.5, label: 'Not Very Effective...' },
        neutral: { multiplier: 1.0, label: '' }
    },

    elementOrder: ['fire', 'water', 'wind', 'earth'],

    // ---- Signature boss monsters (one per element, each with its own 3D arena)
    // `arena` picks the environment in js/battle-3d/environments.js;
    // `model` (optional) is a .glb to use instead of the procedural model;
    // `sprite2d` is the Phaser texture used by the 2D fallback stage.
    monsters: {
        dragon:   { name: 'Pyrovex',   title: 'Fire Dragon',        element: 'fire',  arena: 'volcano', sprite2d: 'embercub', model: null },
        kraken:   { name: 'Kraken',    title: 'Abyssal Kraken',     element: 'water', arena: 'ocean',   sprite2d: 'aquabbit', model: null },
        typhoeus: { name: 'Typhoeus',  title: 'Storm Giant',        element: 'wind',  arena: 'peak',    sprite2d: 'mistFox',  model: null },
        titan:    { name: 'Seismodon', title: 'Earth Titan',        element: 'earth', arena: 'ruins',   sprite2d: 'rockite',  model: null }
    },

    /*
     * Skill effect types (applied by js/battle-rules.js):
     *   burn       { turns, percent, chance } enemy loses percent × maxHP each enemy turn
     *   weaken     { turns, multiplier }      enemy's outgoing damage × multiplier
     *   vulnerable { turns, multiplier }      enemy takes damage × multiplier
     *   stun       { chance }                 enemy skips its next attack
     *   shield     { turns, multiplier }      player takes damage × multiplier
     *   heal       { percent }                player heals percent × damage dealt
     *   crit       { chance, multiplier }     chance for a critical hit on this attack
     */
    elements: {
        fire: {
            name: 'Fire', color: '#ff5a1f', accent: '#ffd166', dark: '#7a1f0a',
            beats: 'wind', monster: 'dragon',
            skills: {
                normal:   { name: 'Tail Whip', description: 'Dragon tail strike. Generates MP.' },
                skill1:   { name: 'Ember Burst',  description: 'Fiery blast. 50% chance to burn for 2 turns.',
                            effect: { type: 'burn', turns: 2, percent: 0.04, chance: 0.5 } },
                skill2:   { name: 'Inferno Breath', description: 'Torrent of dragon fire. Burns for 3 turns.',
                            effect: { type: 'burn', turns: 3, percent: 0.07, chance: 1 } },
                ultimate: { name: 'Skyfall Inferno', description: 'Soars, roars and engulfs the foe. Leaves it ablaze.',
                            effect: { type: 'burn', turns: 3, percent: 0.08, chance: 1 } }
            }
        },
        water: {
            name: 'Water', color: '#2f7fe0', accent: '#b3e5fc', dark: '#0a2a5c',
            beats: 'fire', monster: 'kraken',
            skills: {
                normal:   { name: 'Water Whip', description: 'A tentacle lashes like a water whip. Generates MP.' },
                skill1:   { name: 'Tide Splash',      description: 'Wave strike. Heals you for 50% of damage dealt.',
                            effect: { type: 'heal', percent: 0.5 } },
                skill2:   { name: 'Ink Riptide',      description: 'Tentacle wrap + ink cloud. Slows the foe: −40% damage for 2 turns.',
                            effect: { type: 'weaken', turns: 2, multiplier: 0.6 } },
                ultimate: { name: 'Maelstrom Deluge', description: 'Rises from a whirlpool with a tidal wave. Heals 30% of damage dealt.',
                            effect: { type: 'heal', percent: 0.3 } }
            }
        },
        wind: {
            name: 'Wind', color: '#2ec4a6', accent: '#f2fffb', dark: '#0b5a4c',
            beats: 'earth', monster: 'typhoeus',
            skills: {
                normal:   { name: 'Gale Slashes', description: 'Three rapid wind slashes. Generates MP.' },
                skill1:   { name: 'Razor Gale',      description: 'Razor wind. 35% chance of a 1.5× critical hit.',
                            effect: { type: 'crit', chance: 0.35, multiplier: 1.5 } },
                skill2:   { name: 'Twin Tornado',    description: 'Summons tornadoes. Foe takes +30% damage for 2 turns.',
                            effect: { type: 'vulnerable', turns: 2, multiplier: 1.3 } },
                ultimate: { name: 'Tempest Requiem', description: 'Tornado and lightning storm. Foe takes +30% damage for 2 turns.',
                            effect: { type: 'vulnerable', turns: 2, multiplier: 1.3 } }
            }
        },
        earth: {
            name: 'Earth', color: '#c8963e', accent: '#ffe08a', dark: '#5a3d12',
            beats: 'water', monster: 'titan',
            skills: {
                normal:   { name: 'Seismic Stomp', description: 'Stomp shockwave. Generates MP.' },
                skill1:   { name: 'Boulder Guard',     description: 'Hurls a boulder and raises rock plates: take −30% damage for 2 turns.',
                            effect: { type: 'shield', turns: 2, multiplier: 0.7 } },
                skill2:   { name: 'Fault Line',        description: 'Splits the ground beneath the foe. 60% chance to stun.',
                            effect: { type: 'stun', chance: 0.6 } },
                ultimate: { name: "Titan's Cataclysm", description: 'Plates charge, then a seismic energy beam and a world-cracking eruption. Always stuns.',
                            effect: { type: 'stun', chance: 1 } }
            }
        }
    },

    // ---- Presentation --------------------------------------------------------
    vfx: {
        intensity: { normal: 0.6, skill1: 1, skill2: 1.6, ultimate: 2.6 },
        slowMotionScale: 0.35,
        ultimateZoom: 1.28
    },

    // ---- 3D battle stage (js/battle-3d/) -------------------------------------
    stage3d: {
        enabled: true,            // false forces the 2D Phaser stage
        quality: 'auto',          // 'auto' | 'high' | 'medium' | 'low'
        autoDowngrade: true,      // drop a quality tier if the frame rate stays below minFps
        minFps: 48,
        maxFrameDt: 0.05,         // longest simulated step per frame (s); a hitch slows animation instead of skipping it
        maxPixelRatio: { high: 1.5, medium: 1.25, low: 1 },
        postFx: {
            high:   { bloom: true,  godRays: true,  ssao: true,  dof: true,  shadows: 2048 },
            medium: { bloom: true,  godRays: true,  ssao: false, dof: false, shadows: 1024 },
            low:    { bloom: false, godRays: false, ssao: false, dof: false, shadows: 0 }
        },
        particleScale: { high: 1, medium: 0.7, low: 0.4 }
    },

    sound: {
        enabled: true,
        timerTickSeconds: 3      // tick sound during the last N seconds
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonBattleConfig;
}
