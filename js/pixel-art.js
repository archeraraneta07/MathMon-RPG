/**
 * MathMon pixel art — sprites defined as character grids and baked into
 * Phaser canvas textures (each grid cell = `px` × `px` screen pixels, so the
 * art stays crisp without relying on texture filtering).
 *
 *   Trainers   16 × 20 walk sprites (down / up / side × 3 frames) + card portraits
 *   Monsters   20 × 20 partner portraits (Dragon, Kraken, Typhoeus, Godzilla),
 *              written as the left half and mirrored
 *   Props      monster egg (recolored per element)
 *
 * Palette keys: '.' = transparent, every other character maps to a color.
 */
const MathMonPixelArt = (function createPixelArt() {
    'use strict';

    const OUTLINE = '#1b1226';

    /** Bake a grid into a texture. Re-baking an existing key replaces it. */
    function paint(scene, key, rows, palette, px) {
        const width = rows[0].length;
        rows.forEach((row, i) => {
            if (row.length !== width) console.warn(`[MathMon] pixel art "${key}" row ${i} is ${row.length} wide, expected ${width}`);
        });
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const tex = scene.textures.createCanvas(key, width * px, rows.length * px);
        const ctx = tex.getContext();
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const c = palette[row[x]];
                if (!c) continue;
                ctx.fillStyle = c;
                ctx.fillRect(x * px, y * px, px, px);
            }
        });
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);   // stay crisp when a scene scales the sprite
        return key;
    }

    /** Left half → full symmetric grid. */
    function mirror(half) {
        return half.map((row) => row + row.split('').reverse().join(''));
    }

    // ---- Trainers ---------------------------------------------------------------
    const HEADS = {
        male: {
            down: [
                '....KKKKKKKK....',
                '...KHHhHHhHHK...',
                '..KHHHHHHHHHHK..',
                '..KAAAAAAAAAAK..',
                '..KHSSSSSSSSHK..',
                '..KSSESSSSESSK..',
                '..KSSESSSSESSK..',
                '..KsSSSSSSSSsK..',
                '...KsSSMMSSsK...',
                '....KKSSSSKK....'
            ],
            up: [
                '....KKKKKKKK....',
                '...KHHhHHhHHK...',
                '..KHHHHHHHHHHK..',
                '..KAAAAAAAAAAK..',
                '..KHHHHHHHHHHK..',
                '..KHHHhHHhHHHK..',
                '..KHHHHHHHHHHK..',
                '..KsHHHHHHHHsK..',
                '...KsSSSSSSsK...',
                '....KKSSSSKK....'
            ],
            side: [
                '.....KKKKKKK....',
                '....KHHhHHHHK...',
                '...KHHHHHHHHHK..',
                '...KAAAAAAAAAK..',
                '...KSSSSHHHHHK..',
                '...KSESSSHHHK...',
                '...KSESSSSHHK...',
                '..KSSSSSSSsHK...',
                '...KSMSSSssK....',
                '....KKSSSKK.....'
            ]
        },
        female: {
            down: [
                '...KKKKKKKKKK...',
                '..KHHhHHHHhHHK..',
                '.KHHHHHHHHHHHHK.',
                '.KHAAHHHHHHHHHK.',
                '.KHHSSSSSSSSHHK.',
                '.KHSSESSSSESSHK.',
                '.KHSSESSSSESSHK.',
                '.KHsSSSSSSSSsHK.',
                '.KHHsSSMMSSsHHK.',
                '.KHHKKSSSSKKHHK.'
            ],
            up: [
                '...KKKKKKKKKK...',
                '..KHHhHHHHhHHK..',
                '.KHHHHHHHHHHHHK.',
                '.KHAAHHHHHHHHHK.',
                '.KHHHHHHHHHHHHK.',
                '.KHHhHHHHHHhHHK.',
                '.KHHHHHHHHHHHHK.',
                '.KHHHHHHHHHHHHK.',
                '.KHHHhHHHHhHHHK.',
                '.KHHHHHHHHHHHHK.'
            ],
            side: [
                '....KKKKKKKK....',
                '...KHHhHHHHHK...',
                '..KHHHHHHHHHHK..',
                '..KHHHHHHHAAHK..',
                '...KSSSSHHHHHHK.',
                '...KSESSSHHHHHK.',
                '...KSESSSSHHHHK.',
                '..KSSSSSSSsHHHK.',
                '...KSMSSSsHHHHK.',
                '....KKSSSKHHHK..'
            ]
        }
    };

    const BODIES = {
        down: [
            '...KOOOTTOOOK...',
            '..KOOOOTTOOOOK..',
            '.KSKOOOTTOOOKSK.',
            '.KSKoOOTTOOoKSK.',
            '..KKooooooooKK..',
            '...KPPPPPPPPK...'
        ],
        up: [
            '...KOOOOOOOOK...',
            '..KOOOOOOOOOOK..',
            '.KSKOOOOOOOOKSK.',
            '.KSKoOOOOOOoKSK.',
            '..KKooooooooKK..',
            '...KPPPPPPPPK...'
        ],
        side: [
            '....KOOTOOOK....',
            '....KOOTOOOK....',
            '....KOSSOOOK....',
            '....KoSSoooK....',
            '....KKooooKK....',
            '.....KPPPPK.....'
        ]
    };

    // Walk cycle frames: 0 = standing, 1 / 2 = steps
    const LEGS = {
        down: [
            ['...KPPPKKPPPK...', '...KPPK..KPPK...', '...KBBK..KBBK...', '...KKKK..KKKK...'],
            ['...KPPPKKPPPK...', '...KBBK..KPPK...', '...KKKK..KBBK...', '.........KKKK...'],
            ['...KPPPKKPPPK...', '...KPPK..KBBK...', '...KBBK..KKKK...', '...KKKK.........']
        ],
        side: [
            ['.....KPPPPK.....', '.....KPKKPK.....', '.....KBKKBK.....', '....KKKKKKKK....'],
            ['....KPPKKPPK....', '...KPPK..KPPK...', '...KBBK..KBBK...', '...KKKK..KKKK...'],
            ['.....KPPPPK.....', '.....KPKKPK.....', '.....KBKKBK.....', '....KKKKKKKK....']
        ]
    };
    LEGS.up = LEGS.down;

    const TRAINER_PALETTES = {
        male: { K: OUTLINE, S: '#f2c09b', s: '#d39a74', H: '#4a2a1a', h: '#6b3d24', A: '#e53935', E: OUTLINE, M: '#8a4b3a',
            O: '#8d5a3b', o: '#6d4128', T: '#ef5350', P: '#2f3b66', B: '#3b2419' },
        female: { K: OUTLINE, S: '#f2c09b', s: '#d39a74', H: '#5a3028', h: '#7a4436', A: '#ff5c9a', E: OUTLINE, M: '#a3485a',
            O: '#d95786', o: '#a83e66', T: '#5ee0c0', P: '#3a2f6b', B: '#2a1d3d' }
    };

    function trainerRows(gender, dir, frame) {
        const g = HEADS[gender] ? gender : 'male';
        return [...HEADS[g][dir], ...BODIES[dir], ...LEGS[dir][frame]];
    }

    /**
     * Walk textures: `trainer_<gender>_<dir>_<frame>` (dir: down | up | side, side faces left).
     * Also bakes `portrait_<gender>`: head and shoulders at a large pixel size for cards.
     */
    function makeTrainers(scene, px) {
        ['male', 'female'].forEach((gender) => {
            const palette = TRAINER_PALETTES[gender];
            ['down', 'up', 'side'].forEach((dir) => {
                for (let f = 0; f < 3; f++) paint(scene, `trainer_${gender}_${dir}_${f}`, trainerRows(gender, dir, f), palette, px);
            });
            paint(scene, `portrait_${gender}`, trainerRows(gender, 'down', 0).slice(0, 15), palette, 6);
        });
    }

    // ---- Partner monsters (left halves; mirrored) --------------------------------------
    const MONSTERS = {
        fire: {      // Dragon: horns, spread wings, golden belly
            palette: { K: OUTLINE, R: '#e8492a', r: '#a32a17', Y: '#ffd166', W: '#ff8a3d', w: '#c2551f', E: '#fff3b0' },
            half: [
                '..K.......',
                '..rK......',
                '...rK.KKKK',
                'K...KKRRRR',
                'WK..KRRRRR',
                'WWK.KRREKR',
                'WWWKKRRRRR',
                'WWwWKRRRRR',
                'WwWWKKRRKK',
                'wWWWWKRYKY',
                'rWWwKRRKKK',
                '.rWKRRRYYY',
                '..KRRRRYYY',
                '..KRRrRYYY',
                '..KRRrRRYY',
                '...KRRRRRR',
                '...KRRKRRR',
                '...KRRKKRR',
                '...KYYK.KR',
                '....KK...K'
            ]
        },
        water: {     // Kraken: dome head, huge eyes, curling tentacles
            palette: { K: OUTLINE, B: '#2f7fe0', b: '#1b4f9c', L: '#8fd3ff', E: '#ffffff', S: '#b3e5fc' },
            half: [
                '......KKKK',
                '....KKBBBB',
                '...KBBBLLB',
                '..KBBBLLBB',
                '..KBBBBBBB',
                '.KBBBBBBBB',
                '.KBBEEEBBB',
                '.KBEEKKEBB',
                '.KBEEKKEBB',
                '.KBBEEEBBB',
                '..KBBBBBBB',
                '..KbBBBBKK',
                '.KBKbBBBBb',
                'KBBKKbBbBB',
                'KBK.KBBKBB',
                'KSK.KBSKBS',
                '.KBKKBBKBB',
                '..KBKKBK.K',
                '...KK.KBK.',
                '........K.'
            ]
        },
        wind: {      // Typhoeus: storm giant with cloud wings, lightning and serpent tails
            palette: { K: OUTLINE, G: '#2ec4a6', g: '#137a66', C: '#e8fffa', Y: '#ffe066', E: '#ffffff' },
            half: [
                '....Y.....',
                '...YY.....',
                '..YY..KKKK',
                'C.Y..KGGGG',
                'CC..KGGGGG',
                'CCC.KGEKGG',
                'CCCCKGGGGG',
                '.CCCKGGgGG',
                '..CCKKGGGG',
                '...KGGGGGG',
                '..KGGgGGCC',
                '.KGGKGGCCC',
                '.KGK.KGGCC',
                '..K..KGGGG',
                '....KGGgGG',
                '...KGGKKGG',
                '..KGGK.KGG',
                '.KGGK..KgG',
                '.KGK...KGK',
                '..K.....K.'
            ]
        },
        earth: {     // Godzilla: amber dorsal plates, heavy jaw, glowing chest
            palette: { K: OUTLINE, D: '#7a6340', d: '#4f3f26', A: '#ffb74d', G: '#ffe08a', E: '#ffd54f', T: '#ffffff' },
            half: [
                '...A......',
                '..AA...A..',
                '..AAA.AA.K',
                '...AAKKKKD',
                '...KKDDDDD',
                '...KDDDDDD',
                '...KDEKDDD',
                '...KDDDDDD',
                '....KDDDKK',
                '....KDDKTT',
                '...KDDDKKK',
                '..KDDDDDDD',
                '.KDDKDDGGD',
                '.KDK.KDGGD',
                '.KTK.KDDGD',
                '..K..KDDDD',
                '....KDDdDD',
                '...KDDdKDD',
                '...KTTK.KD',
                '....KK...K'
            ]
        }
    };

    /** Partner portrait textures `<prefix><element>` (20 × 20 grid), default prefix `monster_`. */
    function makeMonsters(scene, px, prefix) {
        Object.keys(MONSTERS).forEach((el) => paint(scene, `${prefix || 'monster_'}${el}`, mirror(MONSTERS[el].half), MONSTERS[el].palette, px));
    }

    // ---- Props ---------------------------------------------------------------------------
    const EGG = [
        '...KK',
        '..KWW',
        '.KWWW',
        '.KWAW',
        'KWWWW',
        'KWAAW',
        'KWWWW',
        'KWWWA',
        'KwWWW',
        '.KwWW',
        '..KKK'
    ];

    /** Monster egg with spots in an accent color; one texture per color (`egg_<rrggbb>`). */
    function makeEgg(scene, accent, px) {
        const key = `egg_${accent.replace('#', '')}`;
        if (scene.textures.exists(key)) return key;
        return paint(scene, key, mirror(EGG), { K: OUTLINE, W: '#f5efe0', w: '#cfc6b0', A: accent }, px);
    }

    return { paint, mirror, makeTrainers, makeMonsters, makeEgg, trainerRows, MONSTERS, TRAINER_PALETTES };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonPixelArt;
}
