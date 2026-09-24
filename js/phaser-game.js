    window.MathMonPhaser = (() => {
        'use strict';

        const TILE = 32;
    const MAP_W = 40;
    const MAP_H = 30;
    const SPEED = 160;

    const CREATURES = {
        embercub:  { name:'Embercub',  type:'addition',    color:'#ff6b35', hp:35, atk:9, def:4, sprite:'🐻' },
        leafloo:   { name:'Leafloo',   type:'addition',    color:'#66bb6a', hp:38, atk:8, def:6, sprite:'🌿' },
        aquabbit:  { name:'Aquabbit',  type:'subtraction', color:'#42a5f5', hp:32, atk:10,def:5, sprite:'🐰' },
        mistFox:   { name:'Mist Fox',  type:'subtraction', color:'#5c6bc0', hp:36, atk:9, def:5, sprite:'🦊' },
        rockite:   { name:'Rockite',   type:'multiplication', color:'#ffa726', hp:40, atk:11,def:7, sprite:'🪨' },
        bloomCat:  { name:'Bloom Cat', type:'multiplication', color:'#ec407a', hp:37, atk:10,def:6, sprite:'🐱' },
        tideLing:  { name:'Tide Ling', type:'division',    color:'#ab47bc', hp:34, atk:9, def:5, sprite:'🧜' },
        shellPup:  { name:'Shell Pup', type:'division',    color:'#26a69a', hp:42, atk:8, def:8, sprite:'🐚' }
    };

    const GYM_LEADERS = {
        addition:    { name:'Addison',  title:'Addition Adept',  reqAccuracy:0.65, creature:'embercub' },
        subtraction: { name:'Subtria',  title:'Subtraction Sage', reqAccuracy:0.65, creature:'aquabbit' },
        multiplication: { name:'Multia', title:'Multiplication Master', reqAccuracy:0.70, creature:'rockite' },
        division:    { name:'Divinia',  title:'Division Master',  reqAccuracy:0.75, creature:'tideLing' }
    };

    const TYPE_ORDER = ['addition','subtraction','multiplication','division'];
    const TYPE_COLORS = { addition:'#ff6b35', subtraction:'#42a5f5', multiplication:'#ffa726', division:'#ab47bc' };
    const ALLY_BY_TYPE = { addition:'embercub', subtraction:'aquabbit', multiplication:'rockite', division:'tideLing' };
    const SAVE_KEY = 'mathmon_profile_v2';
    const WORLD_LOCATIONS = [
        { key: 'sunmeadow', name: 'Meadow Town', subtitle: 'Sumwood Trail', theme: 'grass', tint: '#1b5e20', next: 'crystalcaves' },
        { key: 'crystalcaves', name: 'Difference Cave', subtitle: 'Minus Marsh', theme: 'cave', tint: '#311b92', next: 'tidecoast' },
        { key: 'tidecoast', name: 'Quotient Coast', subtitle: 'Division Dojo', theme: 'water', tint: '#01579b', next: 'sunmeadow' }
    ];

    function createFreshStats() {
        const topicStats = {};
        TYPE_ORDER.forEach((type) => {
            topicStats[type] = { attempts: 0, correct: 0 };
        });
        return {
            level: 1,
            xp: 0,
            score: 0,
            totalBattles: 0,
            battlesWon: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            totalAttempts: 0,
            accuracy: 100,
            topicStats: topicStats,
            badges: []
        };
    }

    function persistProfile(gender, playerName, stats, world) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({ gender, playerName, stats, world }));
        } catch (error) {
            console.warn('[MathMon] Could not save progress:', error);
        }
    }

    function loadProfile() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('[MathMon] Could not load progress:', error);
            return null;
        }
    }

    function saveSceneProgress(scene) {
        const savedProfile = loadProfile();
        const world = scene.getWorldState ? scene.getWorldState() : savedProfile && savedProfile.world;
        persistProfile(scene.gender, scene.playerName, scene.stats, world);
    }

    function locationFor(key) {
        return WORLD_LOCATIONS.find((location) => location.key === key) || WORLD_LOCATIONS[0];
    }

    function updateStatsAfterAnswer(stats, category, isCorrect) {
        stats.totalAttempts++;
        if (isCorrect) stats.correctAnswers++;
        else stats.incorrectAnswers++;
        stats.accuracy = Math.round((stats.correctAnswers / stats.totalAttempts) * 100);
        const topic = stats.topicStats[category] || (stats.topicStats[category] = { attempts: 0, correct: 0 });
        topic.attempts++;
        if (isCorrect) topic.correct++;
        topic.accuracy = Math.round((topic.correct / topic.attempts) * 100);
    }

    function applyLevelProgression(stats) {
        let leveledUp = false;
        while (stats.level < 15 && stats.xp >= stats.level * 100) {
            stats.xp -= stats.level * 100;
            stats.level++;
            leveledUp = true;
        }
        return leveledUp;
    }

    class BootScene extends Phaser.Scene {
        constructor() { super('BootScene'); }
        create() {
            this.createTextures();
            this.scene.start('TitleScene');
        }
        createTextures() {
            const g = this.make.graphics({ x:0, y:0, add:false });

            g.fillStyle(0x000000, 1);
            g.fillRect(0,0,TILE,TILE);
            g.generateTexture('pixel', TILE, TILE);
            g.clear();

            const makeCreature = (key, color, body) => {
                const colorNum = typeof color === 'number' ? color : Phaser.Display.Color.HexStringToColor(color).color;
                g.fillStyle(colorNum, 1);
                g.fillCircle(16,16,14);
                g.fillStyle(0xffffff, 0.3);
                g.fillCircle(12,12,4);
                g.fillCircle(20,20,3);
                if (body) body(g);
                g.generateTexture(key, TILE, TILE);
                g.clear();
            };

            makeCreature('player_m', 0x42a5f5, (g) => {
                g.fillStyle(0xffffff, 1); g.fillCircle(16,10,4);
                g.fillStyle(0x000000, 1); g.fillCircle(14,10,1); g.fillCircle(18,10,1);
            });
            makeCreature('player_f', 0xec407a, (g) => {
                g.fillStyle(0xffffff, 1); g.fillCircle(16,10,4);
                g.fillStyle(0x000000, 1); g.fillCircle(14,10,1); g.fillCircle(18,10,1);
                g.fillRect(12,18,8,2);
            });

            makeCreature('npc', 0xffb74d, (g) => {
                g.fillStyle(0xffffff, 1); g.fillCircle(16,10,4);
                g.fillStyle(0x000000, 1); g.fillCircle(14,10,1); g.fillCircle(18,10,1);
                g.fillRect(10,18,12,2);
            });

            const makeTrainer = (key, skin, hair, outfit, accent, isGirl) => {
                const skinColor = Phaser.Display.Color.HexStringToColor(skin).color;
                const hairColor = Phaser.Display.Color.HexStringToColor(hair).color;
                const outfitColor = Phaser.Display.Color.HexStringToColor(outfit).color;
                const accentColor = Phaser.Display.Color.HexStringToColor(accent).color;
                g.fillStyle(0x000000, 0.2); g.fillEllipse(24, 45, 24, 5);
                g.fillStyle(outfitColor, 1); g.fillRoundedRect(12, 25, 24, 17, 5);
                g.fillStyle(accentColor, 1); g.fillRect(20, 27, 8, 15);
                g.fillStyle(skinColor, 1); g.fillCircle(24, 18, 10);
                g.fillStyle(hairColor, 1);
                if (isGirl) {
                    g.fillCircle(15, 17, 7); g.fillCircle(33, 17, 7); g.fillTriangle(14, 15, 24, 5, 36, 15);
                } else {
                    g.fillTriangle(12, 14, 18, 4, 34, 7); g.fillRect(14, 8, 20, 7);
                    g.fillStyle(accentColor, 1); g.fillRect(11, 7, 26, 4);
                }
                g.fillStyle(0xfafafa, 1); g.fillCircle(21, 18, 2); g.fillCircle(27, 18, 2);
                g.fillStyle(0x17202a, 1); g.fillCircle(21, 18, 1); g.fillCircle(27, 18, 1);
                g.lineStyle(2, 0x17202a, 0.8); g.lineBetween(21, 23, 27, 23);
                g.fillStyle(outfitColor, 1); g.fillRect(5, 28, 8, 14); g.fillRect(35, 28, 8, 14);
                g.fillStyle(0x263238, 1); g.fillRect(14, 40, 8, 6); g.fillRect(26, 40, 8, 6);
                g.generateTexture(key, 48, 48); g.clear();
            };
            makeTrainer('player_m', '#f2c09b', '#3b2419', '#8d5a3b', '#ef5350', false);
            makeTrainer('player_f', '#f2c09b', '#5a3028', '#d95786', '#5ee0c0', true);

            const makeMonster = (key, bodyColor, accentColor, drawBody) => {
                const body = Phaser.Display.Color.HexStringToColor(bodyColor).color;
                const accent = Phaser.Display.Color.HexStringToColor(accentColor).color;
                g.fillStyle(0x000000, 0.22);
                g.fillEllipse(32, 57, 38, 8);
                drawBody(g, body, accent);
                g.lineStyle(2, 0x17202a, 0.75);
                g.strokeCircle(32, 32, 26);
                g.generateTexture(key, 64, 64);
                g.clear();
            };

            const drawFace = (g, eyeY, eyeColor = 0x17202a) => {
                g.fillStyle(0xfff8e1, 1);
                g.fillCircle(24, eyeY, 5);
                g.fillCircle(40, eyeY, 5);
                g.fillStyle(eyeColor, 1);
                g.fillCircle(25, eyeY + 1, 2);
                g.fillCircle(39, eyeY + 1, 2);
                g.lineStyle(2, 0x17202a, 0.9);
                g.lineBetween(28, eyeY + 12, 36, eyeY + 12);
            };

            makeMonster('embercub', '#ef6c3b', '#ffd166', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 34, 24);
                g.fillStyle(body, 1); g.fillTriangle(12, 22, 17, 5, 27, 19); g.fillTriangle(37, 19, 47, 5, 52, 22);
                g.fillStyle(accent, 1); g.fillTriangle(47, 42, 62, 34, 53, 50); g.fillCircle(32, 39, 13);
                drawFace(g, 29); g.fillStyle(0xffb74d, 1); g.fillCircle(32, 51, 4);
            });
            makeMonster('leafloo', '#58a85c', '#b7e36b', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 36, 24);
                g.fillStyle(accent, 1); g.fillTriangle(32, 4, 20, 25, 32, 20); g.fillTriangle(32, 4, 44, 25, 32, 20);
                g.fillStyle(0x2e6b42, 1); g.fillRect(9, 40, 12, 5); g.fillRect(43, 40, 12, 5);
                drawFace(g, 31); g.fillStyle(0xdcedc8, 1); g.fillCircle(32, 48, 8);
            });
            makeMonster('aquabbit', '#388fd1', '#d8f3ff', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 38, 22);
                g.fillStyle(body, 1); g.fillTriangle(15, 24, 12, 2, 27, 19); g.fillTriangle(37, 19, 52, 2, 49, 24);
                g.fillStyle(accent, 1); g.fillCircle(32, 43, 13); drawFace(g, 31);
                g.lineStyle(2, 0xd8f3ff, 0.9); g.lineBetween(14, 42, 5, 39); g.lineBetween(50, 42, 59, 39);
            });
            makeMonster('mistFox', '#6575c5', '#d7d9ff', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 36, 23);
                g.fillStyle(body, 1); g.fillTriangle(12, 26, 17, 2, 29, 19); g.fillTriangle(35, 19, 48, 2, 53, 26);
                g.fillStyle(accent, 1); g.fillTriangle(8, 46, 1, 31, 25, 44); g.fillCircle(32, 43, 11); drawFace(g, 29);
            });
            makeMonster('rockite', '#d8892f', '#ffe0a3', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillTriangle(32, 5, 56, 25, 47, 53); g.fillTriangle(32, 5, 8, 25, 17, 53);
                g.fillStyle(accent, 1); g.fillTriangle(32, 15, 42, 31, 32, 44); g.fillTriangle(32, 15, 22, 31, 32, 44);
                drawFace(g, 30); g.fillStyle(0x704214, 1); g.fillRect(27, 48, 10, 5);
            });
            makeMonster('bloomCat', '#d95786', '#ffb3c6', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 37, 23);
                g.fillStyle(body, 1); g.fillTriangle(12, 25, 16, 4, 28, 20); g.fillTriangle(36, 20, 48, 4, 52, 25);
                g.fillStyle(accent, 1); g.fillCircle(32, 17, 8); g.fillCircle(22, 12, 5); g.fillCircle(42, 12, 5);
                drawFace(g, 31); g.fillStyle(0x6d2b4c, 1); g.fillTriangle(29, 42, 35, 42, 32, 46);
            });
            makeMonster('tideLing', '#8d57b8', '#8ee7e0', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 35, 23);
                g.fillStyle(accent, 1); g.fillTriangle(12, 45, 2, 57, 29, 48); g.fillTriangle(52, 45, 62, 57, 35, 48);
                g.fillStyle(0xe1bee7, 1); g.fillCircle(32, 42, 11); drawFace(g, 29);
                g.lineStyle(3, 0x8ee7e0, 0.9); g.lineBetween(10, 24, 4, 15); g.lineBetween(54, 24, 60, 15);
            });
            makeMonster('shellPup', '#239e98', '#f5d99b', (g, body, accent) => {
                g.fillStyle(body, 1); g.fillCircle(32, 38, 23);
                g.fillStyle(accent, 1); g.fillCircle(42, 31, 17); g.lineStyle(2, 0x8c6239, 0.8); g.strokeCircle(42, 31, 13);
                g.fillStyle(0xf5ffff, 1); g.fillCircle(25, 39, 13); drawFace(g, 34); g.fillStyle(0xf5d99b, 1); g.fillCircle(17, 24, 6);
            });

            const tiles = [
                { key:'tile_grass',  color:'#4caf50', body:(g)=>{ g.fillStyle(0x66bb6a,0.6); g.fillRect(4,4,4,4); g.fillRect(20,20,4,4); }},
                { key:'tile_path',   color:'#795548', body:(g)=>{ g.fillStyle(0xa1887f,0.4); g.fillRect(8,8,4,4); g.fillRect(20,20,4,4); }},
                { key:'tile_tree',   color:'#2e7d32', body:(g)=>{ g.fillStyle(0x1b5e20,1); g.fillCircle(16,16,12); g.fillStyle(0x4e342e,1); g.fillRect(14,22,4,6); }},
                { key:'tile_water',  color:'#1976d2', body:(g)=>{ g.fillStyle(0x64b5f6,0.5); g.fillRect(8,12,16,4); g.fillRect(8,20,16,4); }},
                { key:'tile_flower', color:'#4caf50', body:(g)=>{ g.fillStyle(0xff4081,1); g.fillCircle(16,12,3); g.fillStyle(0xffff00,1); g.fillCircle(16,12,1); }},
                { key:'tile_crystal', color:'#4527a0', body:(g)=>{ g.fillStyle(0x80deea,1); g.fillTriangle(16,3,9,24,23,24); g.fillStyle(0xffffff,0.55); g.fillTriangle(16,7,13,20,18,20); }},
                { key:'tile_wall',   color:'#424242', body:(g)=>{ g.fillStyle(0x757575,0.5); g.fillRect(4,4,24,24); }},
                { key:'tile_door',   color:'#795548', body:(g)=>{ g.fillStyle(0x8d6e63,1); g.fillRect(10,12,12,16); g.fillStyle(0xffd54f,1); g.fillCircle(20,20,1); }},
                { key:'tile_sign',   color:'#4caf50', body:(g)=>{ g.fillStyle(0x8d6e63,1); g.fillRect(14,10,4,18); g.fillStyle(0xffffff,0.9); g.fillRect(6,8,20,8); }},
            ];

            tiles.forEach(t => {
                const tColor = typeof t.color === 'number' ? t.color : Phaser.Display.Color.HexStringToColor(t.color).color;
                g.fillStyle(tColor, 1);
                g.fillRect(0,0,TILE,TILE);
                if (t.body) t.body(g);
                g.generateTexture(t.key, TILE, TILE);
                g.clear();
            });

            const makeBuilding = (key, wall, roof, sign) => {
                const wallColor = Phaser.Display.Color.HexStringToColor(wall).color;
                const roofColor = Phaser.Display.Color.HexStringToColor(roof).color;
                g.fillStyle(wallColor, 1);
                g.fillRect(4, 12, 24, 16);
                g.fillStyle(roofColor, 1);
                g.fillTriangle(2, 13, 16, 2, 30, 13);
                g.fillStyle(0x5d4037, 1);
                g.fillRect(13, 19, 6, 9);
                g.fillStyle(0x90caf9, 1);
                g.fillRect(7, 17, 4, 4);
                g.fillRect(21, 17, 4, 4);
                g.fillStyle(0xffffff, 0.9);
                g.fillRect(8, 5, 16, 3);
                g.fillStyle(Phaser.Display.Color.HexStringToColor(sign).color, 1);
                g.fillRect(10, 8, 12, 3);
                g.generateTexture(key, TILE * 2, TILE * 2);
                g.clear();
            };
            makeBuilding('building_house', '#d7a86e', '#c0392b', '#ffe082');
            makeBuilding('building_gym', '#78909c', '#263238', '#ffd740');
            makeBuilding('building_shop', '#80cbc4', '#00695c', '#ffcc80');

            const makeWideBuilding = (key, wall, roof, accent) => {
                const wallColor = Phaser.Display.Color.HexStringToColor(wall).color;
                const roofColor = Phaser.Display.Color.HexStringToColor(roof).color;
                const accentColor = Phaser.Display.Color.HexStringToColor(accent).color;
                g.fillStyle(0x000000, 0.18); g.fillEllipse(32, 57, 48, 7);
                g.fillStyle(wallColor, 1); g.fillRect(5, 22, 54, 30);
                g.fillStyle(roofColor, 1); g.fillRect(3, 13, 58, 12);
                g.fillStyle(accentColor, 1); g.fillRect(11, 29, 12, 12); g.fillRect(28, 29, 12, 12); g.fillRect(45, 29, 8, 12);
                g.fillStyle(0x3e2723, 1); g.fillRect(27, 39, 10, 13);
                g.fillStyle(0xffffff, 0.85); g.fillRect(15, 17, 34, 3);
                g.generateTexture(key, 64, 64);
                g.clear();
            };
            makeWideBuilding('building_market', '#efb366', '#d35438', '#fff0c2');
            makeWideBuilding('building_apartment', '#9aa7b8', '#425466', '#b9e3f2');
            makeWideBuilding('building_barn', '#b85c38', '#6d2b2b', '#ffe082');
            makeWideBuilding('building_cafe', '#d9a066', '#5d4037', '#fff8e1');

            const makePalm = (key) => {
                g.fillStyle(0x6d4c41, 1); g.fillRect(14, 20, 4, 42);
                g.fillStyle(0x2e7d32, 1);
                g.fillTriangle(16, 21, 2, 7, 16, 14); g.fillTriangle(16, 21, 30, 7, 16, 14);
                g.fillTriangle(16, 21, 5, 23, 16, 16); g.fillTriangle(16, 21, 27, 23, 16, 16);
                g.generateTexture(key, TILE, TILE * 2); g.clear();
            };
            makePalm('prop_palm');

            const makeField = (key, cropColor) => {
                const crop = Phaser.Display.Color.HexStringToColor(cropColor).color;
                g.fillStyle(0xb88954, 1); g.fillRect(0, 0, TILE, TILE);
                g.lineStyle(2, 0x8d633c, 0.7); g.lineBetween(0, 8, TILE, 8); g.lineBetween(0, 24, TILE, 24);
                g.fillStyle(crop, 1); g.fillRect(5, 11, 3, 10); g.fillRect(14, 10, 3, 11); g.fillRect(23, 11, 3, 10);
                g.generateTexture(key, TILE, TILE); g.clear();
            };
            makeField('tile_field', '#76b852');
            makeField('tile_sand', '#e8c27a');

            const makeBattleBg = (key, c1, c2) => {
                const c1Color = typeof c1 === 'number' ? c1 : Phaser.Display.Color.HexStringToColor(c1).color;
                const c2Color = typeof c2 === 'number' ? c2 : Phaser.Display.Color.HexStringToColor(c2).color;
                g.fillStyle(c1Color, 1);
                g.fillRect(0,0,320,180);
                g.fillStyle(c2Color, 1);
                g.fillRect(0,140,320,40);
                g.generateTexture(key, 320, 180);
                g.clear();
            };
            makeBattleBg('bg_grass', '#87ceeb', '#2e7d32');
            makeBattleBg('bg_water', '#4fc3f7', '#1565c0');
            makeBattleBg('bg_cave',  '#5c6bc0', '#311b92');

            g.destroy();
        }
    }

    class TitleScene extends Phaser.Scene {
        constructor() { super('TitleScene'); }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            SoundManager.bindToggle(this);
            if (window.MathMonMobile) window.MathMonMobile.hide();

            const cx = this.cameras.main.width / 2;
            const cy = this.cameras.main.height / 2;

            this.add.text(cx, cy - 80, 'MATHMON', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'48px', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(cx, cy - 30, 'QUEST', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'32px', color:'#ff6b35' }).setOrigin(0.5);
            this.add.text(cx, cy + 20, 'A Math RPG Adventure', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#b39ddb' }).setOrigin(0.5);
            this.add.text(cx, cy + 112, 'M: MUSIC ON / OFF', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'10px', color:'#80cbc4' }).setOrigin(0.5);

            const saved = loadProfile();
            const prompt = this.add.text(cx, cy + 70, saved ? 'PRESS ENTER TO CONTINUE' : 'PRESS ENTER TO START', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color:'#ffffff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            const startAdventure = () => {
                if (this.starting) return;
                this.starting = true;
                if (window.MathMonMobile) window.MathMonMobile.requestLandscape();
                if (window.MathMonMobile) window.MathMonMobile.hide();
                SoundManager.playSelect();
                SoundManager.startMusic();
                this.cameras.main.fadeOut(400, 0, 0, 0);
                this.time.delayedCall(400, () => {
                    if (saved && saved.playerName && saved.stats) {
                        this.scene.start('OverworldScene', saved);
                    } else {
                        this.scene.start('CharacterSelectScene');
                    }
                });
            };
            prompt.on('pointerdown', startAdventure);
            prompt.on('pointerover', () => prompt.setColor('#ffd740'));
            prompt.on('pointerout', () => prompt.setColor('#ffffff'));

            this.tweens.add({
                targets: prompt, alpha: 0.2, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            for (let i = 0; i < 4; i++) {
                const x = Phaser.Math.Between(40, this.cameras.main.width - 40);
                const y = Phaser.Math.Between(40, this.cameras.main.height - 40);
                const keys = Object.keys(CREATURES);
                const k = keys[i % keys.length];
                const sprite = this.add.image(x, y, k).setScale(2);
                this.tweens.add({ targets: sprite, y: y - 20, duration: 2000 + i * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                this.tweens.add({ targets: sprite, alpha: 0.6, duration: 1500 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            }

            this.input.keyboard.once('keydown-ENTER', startAdventure);
        }
    }

    class CharacterSelectScene extends Phaser.Scene {
        constructor() { super('CharacterSelectScene'); }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const cw = this.cameras.main.width;
            const cy = this.cameras.main.height / 2;

            this.add.text(cw/2, cy - 120, 'CHOOSE YOUR TRAINER', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color:'#ffd740' }).setOrigin(0.5);

            const options = [
                { key:'male', label:'BOY', color:'#42a5f5', x: cw/2 - 120 },
                { key:'female', label:'GIRL', color:'#ec407a', x: cw/2 + 120 }
            ];

            options.forEach(opt => {
                const y = cy - 20;
                const box = this.add.rectangle(opt.x, y, 160, 160, 0x000000, 0.7).setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(opt.color).color);
                const sprite = this.add.image(opt.x, y - 30, opt.key === 'male' ? 'player_m' : 'player_f').setScale(4);
                const label = this.add.text(opt.x, y + 50, opt.label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffffff' }).setOrigin(0.5);

                box.setInteractive({ useHandCursor: true });
                box.on('pointerover', () => { box.setFillStyle(0xffffff, 0.1); });
                box.on('pointerout', () => { box.setFillStyle(0x000000, 0.7); });
                box.on('pointerdown', () => {
                    SoundManager.playSelect();
                    this.cameras.main.fadeOut(200, 0, 0, 0);
                    this.time.delayedCall(200, () => this.scene.start('NameEntryScene', { gender: opt.key }));
                });
            });
        }
    }

    class NameEntryScene extends Phaser.Scene {
        constructor() { super('NameEntryScene'); }
        init(data) {
            this.gender = data.gender || 'male';
        }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const cw = this.cameras.main.width;
            const cy = this.cameras.main.height / 2;

            this.add.text(cw/2, cy - 120, 'WHO ARE YOU?', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'24px', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(cw/2, cy - 70, 'ENTER YOUR NAME', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'10px', color:'#b39ddb' }).setOrigin(0.5);

            this.nameText = this.add.text(cw/2, cy - 20, '', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'20px', color:'#ffffff' }).setOrigin(0.5);

            this.nameInput = '';
            this.input.keyboard.on('keydown', (event) => {
                if (event.repeat) return;
                if (event.key === 'Backspace') {
                    this.nameInput = this.nameInput.slice(0, -1);
                } else if (event.key.length === 1 && this.nameInput.length < 12) {
                    this.nameInput += event.key;
                }
                this.nameText.setText(this.nameInput || '_');
            });

            const startGame = () => {
                SoundManager.playSelect();
                const name = this.nameInput.trim() || (this.gender === 'female' ? 'Maya' : 'Leo');
                if (window.MathMonMobile) window.MathMonMobile.hide();
                const stats = createFreshStats();
                persistProfile(this.gender, name, stats);
                if (window.MathMonApi) window.MathMonApi.registerPlayer(name, this.gender);
                this.cameras.main.fadeOut(300, 0, 0, 0);
                this.time.delayedCall(300, () => this.scene.start('OverworldScene', {
                    gender: this.gender,
                    playerName: name,
                    stats: stats
                }));
            };
            this.input.keyboard.once('keydown-ENTER', startGame);

            if (window.MathMonMobile) window.MathMonMobile.show({
                placeholder: 'Enter trainer name',
                submitLabel: 'Start',
                onSubmit: (value) => {
                    this.nameInput = value.trim().slice(0, 12);
                    startGame();
                }
            });
        }
    }

    class OverworldScene extends Phaser.Scene {
        constructor() { super('OverworldScene'); }
        init(data) {
            this.gender = data.gender || 'male';
            this.playerName = data.playerName || 'Trainer';
            this.stats = data.stats || { level:1, xp:0, score:0, totalBattles:0, correctAnswers:0, incorrectAnswers:0, totalAttempts:0, accuracy:100, topicStats:{addition:{attempts:0,correct:0},subtraction:{attempts:0,correct:0},multiplication:{attempts:0,correct:0},division:{attempts:0,correct:0}} };
            this.world = data.world || { location: 'sunmeadow', playerX: 368, playerY: 432 };
            this.location = locationFor(this.world.location);
        }
        create() {
            SoundManager.startMusic();
            SoundManager.bindToggle(this);
            this.cameras.main.setBackgroundColor(this.location.tint);
            this.cameras.main.fadeIn(300, 0, 0, 0);

            this.tileGroup = this.add.group();

            for (let y = 0; y < MAP_H; y++) {
                for (let x = 0; x < MAP_W; x++) {
                    let tex = 'tile_grass';
                    const r = Phaser.Math.Between(0, 100);
                    if ((x > 8 && x < 14 && y > 10 && y < 16) || (x > 22 && x < 28 && y > 8 && y < 14)) tex = 'tile_path';
                    if (this.location.theme === 'grass') {
                        if ((x > 2 && x < 12 && y > 20 && y < 27) || (x > 14 && x < 23 && y > 20 && y < 27)) tex = 'tile_field';
                        else if (r < 2) tex = 'tile_flower';
                        else if (r === 3 && x > 15 && y > 5) tex = 'tile_tree';
                    }
                    if (this.location.theme === 'cave') tex = r < 5 ? 'tile_crystal' : (r < 22 ? 'tile_wall' : 'tile_path');
                    if (this.location.theme === 'water') {
                        if (x > 27) tex = r < 55 ? 'tile_water' : 'tile_sand';
                        else if (r < 14) tex = 'tile_water';
                        else if (r < 26) tex = 'tile_sand';
                        else if (r < 30) tex = 'tile_flower';
                        else if (r === 3) tex = 'tile_tree';
                    }
                    const img = this.add.image(x * TILE + TILE/2, y * TILE + TILE/2, tex);
                    this.tileGroup.add(img);
                }
            }

            const placeBuilding = (texture, x, y, label) => {
                this.add.image(x * TILE, y * TILE, texture).setScale(1.7).setDepth(4);
                this.add.text(x * TILE, y * TILE + 38, label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(5);
            };
            const placeHouse = (x, y, label) => {
                placeBuilding('building_house', x, y, label);
                this.houseDoor = { x: x * TILE, y: y * TILE + 44 };
            };
            const placeNpc = (x, y, label, tint) => {
                const npc = this.add.image(x * TILE, y * TILE, 'npc').setScale(1.35).setDepth(6);
                if (tint) npc.setTint(Phaser.Display.Color.HexStringToColor(tint).color);
                npc.setInteractive({ useHandCursor: true });
                npc.on('pointerdown', () => this.showWorldNotice(`${label}: Keep exploring and answer carefully!`));
                npc.on('pointerover', () => npc.setScale(1.5));
                npc.on('pointerout', () => npc.setScale(1.35));
                this.add.text(x * TILE, y * TILE + 24, label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'10px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(7);
                this.tweens.add({ targets: npc, y: npc.y - 3, duration: 900 + (x * 30), yoyo: true, repeat: -1, ease:'Sine.easeInOut' });
            };
            const placeLandmark = (texture, x, y, label) => {
                this.add.image(x * TILE, y * TILE, texture).setScale(1.5).setDepth(4);
                this.add.text(x * TILE, y * TILE + 42, label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'11px', color:'#fff3c4', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(5);
            };
            if (this.location.key === 'sunmeadow') {
                placeHouse(7, 7, 'YOUR HOUSE');
                placeBuilding('building_house', 13, 7, 'VILLAGE HOME');
                placeBuilding('building_apartment', 18, 7, 'RESIDENCES');
                placeBuilding('building_market', 28, 8, 'MARKET SQUARE');
                placeBuilding('building_cafe', 34, 14, 'SUN CAFE');
                placeBuilding('building_gym', 22, 16, 'SUM GYM');
                placeLandmark('building_barn', 9, 23, 'HARVEST BARN');
                placeNpc(17, 14, 'Mira', '#ef9a9a');
                placeNpc(25, 12, 'Tomas', '#90caf9');
                placeNpc(31, 18, 'Lina', '#a5d6a7');
            } else if (this.location.key === 'crystalcaves') {
                placeBuilding('building_gym', 20, 8, 'DIFFERENCE GYM');
                placeHouse(8, 21, 'CAVE CAMP');
                placeBuilding('building_market', 31, 12, 'TRADE HALL');
                placeBuilding('building_apartment', 11, 8, 'MINER HOMES');
                placeBuilding('building_cafe', 29, 21, 'CAVE CAFE');
                placeNpc(17, 18, 'Oren', '#ffcc80');
                placeNpc(26, 8, 'Nia', '#ce93d8');
            } else {
                placeBuilding('building_gym', 21, 7, 'DOJO');
                placeHouse(8, 20, 'COAST HOUSE');
                placeBuilding('building_market', 29, 18, 'FISH MARKET');
                placeBuilding('building_cafe', 18, 22, 'BEACH CAFE');
                placeLandmark('prop_palm', 32, 8, 'PALM COVE');
                placeLandmark('prop_palm', 36, 12, 'PALM COVE');
                placeNpc(14, 15, 'Kai', '#80cbc4');
                placeNpc(24, 19, 'Sela', '#ffab91');
                placeNpc(34, 22, 'Bo', '#90caf9');
            }

            this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);

            const playerX = Number.isFinite(this.world.playerX) ? this.world.playerX : 368;
            const playerY = Number.isFinite(this.world.playerY) ? this.world.playerY : 432;
            this.player = this.add.image(playerX, playerY, this.gender === 'female' ? 'player_f' : 'player_m').setScale(2).setDepth(10);
            this.playerBaseScale = 2;
            this.tweens.add({ targets: this.player, scaleY: 2.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = {
                up: this.input.keyboard.addKey('W'),
                down: this.input.keyboard.addKey('S'),
                left: this.input.keyboard.addKey('A'),
                right: this.input.keyboard.addKey('D')
            };

            this.inEncounter = false;
            this.wasMoving = false;
            this.grassEncounterChance = 0.012;
            this.lastWorldSave = 0;

            this.add.text(8, 8, `${this.playerName}\nLv.${this.stats.level}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setScrollFactor(0).setDepth(20);
            this.add.text(this.cameras.main.width / 2, 14, `${this.location.name.toUpperCase()}  •  ${this.location.subtitle.toUpperCase()}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffd740', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);

            this.add.text(8, this.cameras.main.height - 28, 'MOVE: ARROWS / WASD    ENTER HOUSE: E / H    TRAIN: T    GYM: G', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setScrollFactor(0).setDepth(20);

            this.touchDirection = { x: 0, y: 0 };
            const touchButton = (label, x, y, direction, action) => {
                const button = this.add.rectangle(x, y, 52, 44, 0x111827, 0.86).setStrokeStyle(2, 0xffffff).setScrollFactor(0).setDepth(20);
                this.add.text(x, y, label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
                button.setInteractive({ useHandCursor: true, draggable: false });
                button.on('pointerdown', () => {
                    if (action) action();
                    if (direction) this.touchDirection = direction;
                });
                const release = () => { this.touchDirection = { x: 0, y: 0 }; };
                button.on('pointerup', release);
                button.on('pointerout', release);
                button.on('pointerupoutside', release);
                button.on('pointercancel', release);
            };
            const padX = this.cameras.main.width - 82;
            const padY = this.cameras.main.height - 76;
            touchButton('^', padX, padY - 34, { x: 0, y: -1 });
            touchButton('v', padX, padY + 34, { x: 0, y: 1 });
            touchButton('<', padX - 46, padY, { x: -1, y: 0 });
            touchButton('>', padX + 46, padY, { x: 1, y: 0 });
            touchButton('T', 54, this.cameras.main.height - 68, null, () => this.startTraining());
            touchButton('G', 54, this.cameras.main.height - 30, null, () => this.startGymBattle());
            touchButton('H', 126, this.cameras.main.height - 68, null, () => this.tryEnterHouse());
            this.input.on('pointerup', () => { this.touchDirection = { x: 0, y: 0 }; });

            this.time.delayedCall(1000, () => {
                const prompt = this.add.text(this.cameras.main.width/2, this.cameras.main.height - 40, 'Press G to challenge Gym', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffd740' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
                this.time.delayedCall(4000, () => prompt.destroy());
            });

            this.keyG = this.input.keyboard.addKey('G');
            this.keyT = this.input.keyboard.addKey('T');
            this.keyE = this.input.keyboard.addKey('E');
            this.keyH = this.input.keyboard.addKey('H');
        }

    update() {
        if (this.inEncounter) return;

        let vx = this.touchDirection.x, vy = this.touchDirection.y;
        if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
        if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

        if (vx !== 0 || vy !== 0) {
            if (!this.wasMoving) {
                this.tweens.add({ targets: this.player, scaleX: 2.16, duration: 100, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
            }
            this.wasMoving = true;
            const len = Math.sqrt(vx*vx + vy*vy);
            vx /= len; vy /= len;
            this.player.x += vx * SPEED * (this.sys.game.loop.delta / 1000);
            this.player.y += vy * SPEED * (this.sys.game.loop.delta / 1000);
            this.player.x = Phaser.Math.Clamp(this.player.x, TILE, MAP_W * TILE - TILE);
            this.player.y = Phaser.Math.Clamp(this.player.y, TILE, MAP_H * TILE - TILE);

            if (this.time.now - this.lastWorldSave > 800) {
                saveSceneProgress(this);
                this.lastWorldSave = this.time.now;
            }

            if (this.player.x >= MAP_W * TILE - TILE - 2) this.changeLocation(1);
            if (this.player.x <= TILE + 2) this.changeLocation(-1);

            if (Math.random() < this.grassEncounterChance) {
                this.startWildEncounter();
            }
        } else {
            this.wasMoving = false;
        }

        if (Phaser.Input.Keyboard.JustDown(this.keyG)) {
            this.startGymBattle();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keyT)) {
            this.startTraining();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keyE) || Phaser.Input.Keyboard.JustDown(this.keyH)) {
            this.tryEnterHouse();
        }
    }

    tryEnterHouse() {
        if (this.inEncounter || !this.houseDoor) return;
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.houseDoor.x, this.houseDoor.y);
        if (distance > 72) {
            this.showWorldNotice('Walk to the house door first.');
            return;
        }
        this.inEncounter = true;
        const world = this.getWorldState();
        saveSceneProgress({ gender: this.gender, playerName: this.playerName, stats: this.stats, getWorldState: () => world });
        SoundManager.playDoor();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => this.scene.start('HouseInteriorScene', {
            gender: this.gender,
            playerName: this.playerName,
            stats: this.stats,
            world: world
        }));
    }

    showWorldNotice(message) {
        if (this.worldNotice) this.worldNotice.destroy();
        this.worldNotice = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 62, message, {
            fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#ffd740', stroke:'#000000', strokeThickness:3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30);
        this.time.delayedCall(1800, () => {
            if (this.worldNotice) this.worldNotice.destroy();
        });
    }

    getWorldState() {
        return { location: this.location.key, playerX: this.player.x, playerY: this.player.y };
    }

    changeLocation(direction) {
        if (this.locationChanging) return;
        this.locationChanging = true;
        const currentIndex = WORLD_LOCATIONS.findIndex((location) => location.key === this.location.key);
        const nextIndex = (currentIndex + direction + WORLD_LOCATIONS.length) % WORLD_LOCATIONS.length;
        const nextLocation = WORLD_LOCATIONS[nextIndex];
        const world = { location: nextLocation.key, playerX: direction > 0 ? TILE * 2 : MAP_W * TILE - TILE * 2, playerY: this.player.y };
        saveSceneProgress({ gender: this.gender, playerName: this.playerName, stats: this.stats, getWorldState: () => world });
        SoundManager.playTravel();
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.time.delayedCall(350, () => this.scene.start('OverworldScene', { gender: this.gender, playerName: this.playerName, stats: this.stats, world }));
    }

    startTraining() {
        if (this.inEncounter) return;
        this.inEncounter = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
            this.scene.start('TrainingScene', {
                gender: this.gender,
                playerName: this.playerName,
                stats: this.stats,
                world: this.getWorldState()
            });
        });
    }

        startWildEncounter() {
            if (this.inEncounter) return;
            this.inEncounter = true;

            const typeKeys = Object.keys(CREATURES);
            const randomType = typeKeys[Phaser.Math.Between(0, typeKeys.length - 1)];
            const creature = CREATURES[randomType];
            const difficulty = 1 + Math.floor(this.stats.level / 3);

            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => {
                this.scene.start('BattleScene', {
                    mode: 'wild',
                    creatureKey: randomType,
                    creature: creature,
                    difficulty: difficulty,
                    gender: this.gender,
                    playerName: this.playerName,
                    stats: this.stats,
                    world: this.getWorldState()
                });
            });
        }

        startGymBattle() {
            if (this.inEncounter) return;
            this.inEncounter = true;

            const acc = this.stats.totalAttempts > 0 ? (this.stats.correctAnswers / this.stats.totalAttempts) : 0;
            const leaderKey = TYPE_ORDER[Math.min(Math.floor(this.stats.level / 3), TYPE_ORDER.length - 1)];
            const leader = GYM_LEADERS[leaderKey];
            const creature = CREATURES[leader.creature];

            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => {
                this.scene.start('BattleScene', {
                    mode: 'gym',
                    creatureKey: leader.creature,
                    creature: creature,
                    difficulty: 2 + Math.floor(this.stats.level / 2),
                    leaderName: leader.name,
                    leaderTitle: leader.title,
                    reqAccuracy: leader.reqAccuracy,
                    gender: this.gender,
                    playerName: this.playerName,
                    stats: this.stats,
                    world: this.getWorldState()
                });
            });
        }
    }

    class BattleScene extends Phaser.Scene {
        constructor() { super('BattleScene'); }
        init(data) {
            this.mode = data.mode || 'wild';
            this.creatureKey = data.creatureKey;
            this.creatureData = data.creature;
            this.difficulty = data.difficulty || 1;
            this.trainingCategory = data.category;
            this.leaderName = data.leaderName;
            this.leaderTitle = data.leaderTitle;
            this.reqAccuracy = data.reqAccuracy || 0;
            this.gender = data.gender || 'male';
            this.playerName = data.playerName || 'Trainer';
            this.stats = data.stats || { level:1, xp:0, score:0, correctAnswers:0, incorrectAnswers:0, totalAttempts:0, accuracy:100 };
            this.world = data.world || { location: 'sunmeadow', playerX: 368, playerY: 432 };
        }
        create() {
            this.cameras.main.fadeIn(300, 0, 0, 0);
            this.cameras.main.setBackgroundColor('#1a1424');
            SoundManager.startMusic();
            SoundManager.bindToggle(this);

            const cw = this.cameras.main.width;
            const ch = this.cameras.main.height;

            this.add.image(cw/2, ch/2, 'bg_grass').setDisplaySize(cw, ch).setAlpha(0.3);

            const pKey = this.gender === 'female' ? 'player_f' : 'player_m';
            const allyType = this.trainingCategory || TYPE_ORDER[this.stats.level % TYPE_ORDER.length];
            const allyKey = this.gender === 'male' && allyType === 'subtraction'
                ? 'rockite'
                : (ALLY_BY_TYPE[allyType] || 'embercub');
            this.trainerSprite = this.add.image(cw * 0.14, ch * 0.62, pKey).setScale(2.05).setDepth(4);
            this.add.text(cw * 0.14, ch * 0.72, this.playerName, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(4);
            this.playerCreature = this.add.image(cw * 0.25, ch * 0.55, allyKey).setScale(0.35).setAlpha(0).setDepth(5);
            this.enemyBaseX = cw * 0.72;
            this.enemyBaseY = ch * 0.45;
            this.enemyCreature = this.add.image(this.enemyBaseX + 90, this.enemyBaseY, this.creatureKey).setScale(0.7).setAlpha(0);
            this.enemyCreature.setFlipX(true);
            this.enemyShadow = this.add.ellipse(this.enemyBaseX, this.enemyBaseY + 45, 130, 22, 0x101820, 0.32).setScale(0.3);
            this.playerBall = this.add.circle(cw * 0.25, ch * 0.66, 17, 0xe8eef2, 1).setStrokeStyle(3, 0x17202a).setDepth(6);
            this.add.rectangle(cw * 0.25, ch * 0.66, 34, 4, 0xc0392b).setDepth(7);
            this.add.circle(cw * 0.25, ch * 0.66, 5, 0xffffff).setStrokeStyle(2, 0x17202a).setDepth(8);
            this.add.text(cw * 0.25, ch * 0.73, 'YOUR MATHMON', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#80cbc4', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(8);
            this.tweens.add({ targets: this.playerBall, y: ch * 0.64, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: this.trainerSprite, y: this.trainerSprite.y - 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: this.enemyShadow, scaleX: 1, scaleY: 1, alpha: 0.55, duration: 500, ease: 'Back.easeOut' });
            this.tweens.add({
                targets: this.enemyCreature,
                x: this.enemyBaseX,
                alpha: 1,
                scaleX: 2.6,
                scaleY: 2.6,
                duration: 600,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: this.enemyCreature, y: this.enemyBaseY - 8, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                }
            });
            this.tweens.add({
                targets: this.playerCreature,
                alpha: 1,
                scaleX: 2.6,
                scaleY: 2.6,
                y: ch * 0.55 - 12,
                duration: 550,
                delay: 250,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: this.playerCreature, y: ch * 0.55 - 20, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                }
            });
            this.tweens.add({ targets: this.playerBall, scale: 0.1, alpha: 0, duration: 220, delay: 260, ease: 'Back.easeIn' });
            this.tweens.add({ targets: this.playerCreature, y: this.playerCreature.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.playerShadow = this.add.ellipse(cw * 0.25, ch * 0.67, 110, 18, 0x101820, 0.32);
            this.tweens.add({ targets: this.playerShadow, scaleX: 0.9, scaleY: 0.8, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });

            const eHp = 30 + (this.stats.level - 1) * 5;
            const pHp = 50 + this.stats.level * 10;

            this.enemyHp = { current: eHp, max: eHp };
            this.playerHp = { current: pHp, max: pHp };

            const ex = cw * 0.72 - 40;
            const ey = ch * 0.12;
            const px = cw * 0.25 - 40;
            const py = ch * 0.75;

            this.enemyBarBg = this.add.rectangle(ex, ey, 80, 10, 0x000000, 0.7).setOrigin(0.5);
            this.enemyBarFill = this.add.rectangle(ex - 38, ey, 76, 8, 0xff5252).setOrigin(0, 0.5);
            this.enemyBarLabel = this.add.text(ex - 38, ey - 6, `${this.creatureData.name} ${eHp}/${eHp}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff' });

            this.playerBarBg = this.add.rectangle(px, py, 80, 10, 0x000000, 0.7).setOrigin(0.5);
            this.playerBarFill = this.add.rectangle(px - 38, py, 76, 8, 0xffd740).setOrigin(0, 0.5);
            this.playerBarLabel = this.add.text(px - 38, py - 6, `${this.playerName} ${pHp}/${pHp}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff' });

            const titleText = this.mode === 'gym'
                ? `GYM LEADER ${this.leaderName}\n${this.leaderTitle}`
                : this.mode === 'training'
                ? `TRAINING MODE\n${this.trainingCategory ? this.trainingCategory.toUpperCase() : 'MIXED'}`
                : `A wild ${this.creatureData.name} appeared!`;
            const titleColor = this.mode === 'training' ? '#ffd740' : '#ff5252';
            this.add.text(cw/2, ch * 0.02, titleText, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color: titleColor, align:'center' }).setOrigin(0.5);

            this.questionPanel = this.add.rectangle(cw/2, ch * 0.85, cw - 40, 120, 0x000000, 0.88).setStrokeStyle(3, 0xffffff);
            this.questionText = this.add.text(cw/2, ch * 0.78, '', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'24px', color:'#ffffff' }).setOrigin(0.5);
            this.add.text(cw/2 - (cw - 100) / 2, ch * 0.86, 'ANSWER', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#80cbc4' }).setOrigin(0, 0.5);
            this.answerBox = this.add.rectangle(cw/2, ch * 0.93, cw - 100, 34, 0x18202b, 1).setStrokeStyle(2, 0xffd740);
            this.answerText = this.add.text(cw/2, ch * 0.93, 'Type your answer  |', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'20px', color:'#ffd740' }).setOrigin(0.5);
            if (window.MathMonMobile && window.MathMonMobile.isTouchDevice()) {
                this.answerBox.setVisible(false);
                this.answerText.setVisible(false);
            }

            this.inputText = '';
            this.isPlayerTurn = true;
            this.battleOver = false;

            this.input.keyboard.on('keydown', (event) => {
                if (this.battleOver) return;
                if (event.key === 'Backspace') {
                    this.inputText = this.inputText.slice(0, -1);
                } else if (event.key >= '0' && event.key <= '9') {
                    if (this.inputText.length < 6) this.inputText += event.key;
                } else if (event.key === '-' && this.inputText.length === 0) {
                    this.inputText = '-';
                } else if (event.key === 'Enter') {
                    this.submitAnswer();
                }
                this.answerText.setText(this.inputText ? `${this.inputText} |` : 'Type your answer  |');
            });

            if (window.MathMonMobile) window.MathMonMobile.show({
                type: 'text',
                inputMode: 'decimal',
                placeholder: 'Type your answer',
                submitLabel: 'Answer',
                onSubmit: (value) => {
                    this.inputText = value.trim();
                    this.answerText.setText(this.inputText ? `${this.inputText} |` : 'Type your answer  |');
                    this.submitAnswer();
                }
            });

            this.nextQuestion();
        }

        nextQuestion() {
            if (this.battleOver) return;
            const diff = Math.min(10, this.difficulty);
            let cat;
            if (this.mode === 'training' && this.trainingCategory) {
                cat = this.trainingCategory;
            } else {
                const cats = ['addition','subtraction','multiplication','division'];
                cat = cats[Phaser.Math.Between(0, cats.length - 1)];
            }
            const q = QuestionGenerator.generateQuestion(cat, diff);
            this.currentQuestionCategory = cat;
            this.currentAnswer = q.answer;
            this.questionText.setText(q.question);
            this.inputText = '';
            this.answerText.setText('Type your answer  |');
            this.isPlayerTurn = true;
            this.questionStartTime = Date.now();
        }

        submitAnswer() {
            if (!this.isPlayerTurn || this.battleOver) return;
            const val = parseFloat(this.inputText);
            if (isNaN(val)) return;

            this.isPlayerTurn = false;
            const responseTime = (Date.now() - this.questionStartTime) / 1000;
            const speedBonus = Math.max(0, Math.floor((5 - responseTime) * 2));

            if (val === this.currentAnswer) {
                updateStatsAfterAnswer(this.stats, this.currentQuestionCategory, true);
                if (window.MathMonApi) window.MathMonApi.recordAttempt({
                    category: this.currentQuestionCategory,
                    correct: true,
                    response_time: responseTime,
                    difficulty: this.difficulty,
                    answer_given: val,
                    correct_answer: this.currentAnswer,
                    level: this.stats.level
                });
                const baseDmg = Math.max(8, 25 - this.stats.level * 0.3);
                const dmg = Math.round(baseDmg - 5) + Phaser.Math.Between(3, 8) + speedBonus;
                const actual = Math.max(5, dmg);
                this.enemyHp.current = Math.max(0, this.enemyHp.current - actual);
                this.updateEnemyBar();
                this.shake(this.enemyCreature, 300);
                this.flashMonster(this.enemyCreature, 0xffffff, 180);
                this.tweens.add({ targets: this.playerCreature, x: this.playerCreature.x + 34, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
                this.tweens.add({ targets: this.playerCreature, angle: -10, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
                this.flashText(this.questionText, '#6bff6b', 200);
                SoundManager.playCorrect();
                ParticleEmitter.emit(this, this.enemyCreature.x, this.enemyCreature.y, '#ff6b35', 12);
                ParticleEmitter.emitRing(this, this.enemyCreature.x, this.enemyCreature.y, '#ffd740');

                if (speedBonus > 0) {
                    this.answerText.setText(`+${actual} dmg (speed +${speedBonus})`);
                }

                if (this.enemyHp.current <= 0) {
                    this.battleOver = true;
                    this.faintMonster();
                    this.time.delayedCall(900, () => this.endBattle(true));
                } else {
                    this.time.delayedCall(700, () => this.enemyTurn());
                }
            } else {
                updateStatsAfterAnswer(this.stats, this.currentQuestionCategory, false);
                if (window.MathMonApi) window.MathMonApi.recordAttempt({
                    category: this.currentQuestionCategory,
                    correct: false,
                    response_time: responseTime,
                    difficulty: this.difficulty,
                    answer_given: val,
                    correct_answer: this.currentAnswer,
                    level: this.stats.level
                });
                const heal = Math.max(3, Math.round(this.enemyHp.max * 0.1));
                this.enemyHp.current = Math.min(this.enemyHp.max, this.enemyHp.current + heal);
                this.updateEnemyBar();
                this.flashText(this.questionText, '#ff6b6b', 200);
                SoundManager.playWrong();
                this.time.delayedCall(700, () => this.enemyTurn());
            }
        }

        enemyTurn() {
            if (this.battleOver) return;
            const dmg = 8 + Math.floor(this.stats.level * 0.4);
            this.playerHp.current = Math.max(0, this.playerHp.current - dmg);
            this.updatePlayerBar();
            this.animateMonsterAttack();
            this.shake(this.playerCreature, 300);
            this.flashMonster(this.playerCreature, 0xff5252, 180);
            this.tweens.add({ targets: this.playerCreature, angle: 10, duration: 100, yoyo: true, ease: 'Quad.easeOut' });
            this.tweens.add({ targets: this.enemyCreature, x: this.enemyCreature.x - 28, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
            this.flashText(this.questionText, '#ff5252', 200);
            SoundManager.playHit();
            ParticleEmitter.emit(this, this.playerCreature.x, this.playerCreature.y, '#42a5f5', 10);

            if (this.playerHp.current <= 0) {
                this.battleOver = true;
                this.time.delayedCall(600, () => this.endBattle(false));
            } else {
                this.time.delayedCall(600, () => this.nextQuestion());
            }
        }

        updateEnemyBar() {
            const pct = Math.max(0, this.enemyHp.current / this.enemyHp.max);
            this.enemyBarFill.width = Math.max(4, 76 * pct);
            this.enemyBarLabel.setText(`${this.creatureData.name} ${this.enemyHp.current}/${this.enemyHp.max}`);
        }

        updatePlayerBar() {
            const pct = Math.max(0, this.playerHp.current / this.playerHp.max);
            this.playerBarFill.width = Math.max(4, 76 * pct);
            this.playerBarLabel.setText(`${this.playerName} ${this.playerHp.current}/${this.playerHp.max}`);
        }

        shake(target, dur) {
            this.tweens.add({ targets: target, x: target.x + 6, duration: 50, yoyo: true, repeat: 3, onComplete: () => {} });
        }

        animateMonsterAttack() {
            this.tweens.add({
                targets: this.enemyCreature,
                x: this.enemyBaseX - 48,
                scaleX: 3.05,
                scaleY: 2.4,
                duration: 150,
                ease: 'Quad.easeOut',
                yoyo: true,
                hold: 90,
                onComplete: () => {
                    this.enemyCreature.x = this.enemyBaseX;
                    this.enemyCreature.scaleX = 2.6;
                    this.enemyCreature.scaleY = 2.6;
                }
            });
            this.tweens.add({ targets: this.enemyShadow, scaleX: 1.25, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
        }

        flashMonster(target, color, duration) {
            target.setTint(color);
            this.time.delayedCall(duration, () => target.clearTint());
        }

        faintMonster() {
            this.tweens.killTweensOf(this.enemyCreature);
            this.tweens.add({
                targets: this.enemyCreature,
                y: this.enemyBaseY + 34,
                angle: 18,
                alpha: 0,
                scaleX: 0.35,
                scaleY: 0.35,
                duration: 700,
                ease: 'Back.easeIn'
            });
            this.tweens.add({ targets: this.enemyShadow, scaleX: 0.2, alpha: 0, duration: 650, ease: 'Quad.easeIn' });
        }

        flashText(textObj, color, dur) {
            textObj.setColor(color);
            this.time.delayedCall(dur, () => textObj.setColor('#ffffff'));
        }

        endBattle(won) {
            let xp = 0, score = 0;
            if (window.MathMonMobile) window.MathMonMobile.hide();
            if (this.mode !== 'training') {
                if (won) {
                    xp = Math.round(50 * (1 + this.stats.level * 0.1));
                    score = Math.round(30 + this.stats.level * 3);
                } else {
                    xp = Math.round(20 * (1 + this.stats.level * 0.1));
                    score = 5;
                }
                this.stats.xp += xp;
                this.stats.score += score;
                this.stats.totalBattles++;
                if (won) this.stats.battlesWon++;
            }
            const leveledUp = applyLevelProgression(this.stats);
            saveSceneProgress(this);
            if (window.MathMonApi && this.mode !== 'training') window.MathMonApi.recordBattle({
                battle_id: `${window.MathMonApi.getPlayerId()}-${Date.now()}`,
                won,
                xp_earned: xp,
                score_earned: score,
                opponent_name: this.creatureData.name,
                category: this.trainingCategory || this.creatureData.type || 'addition'
            });

            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.time.delayedCall(400, () => {
                this.scene.start('ResultsScene', {
                    won: won,
                    xp: xp,
                    score: score,
                    creatureName: this.creatureData.name,
                    mode: this.mode,
                    leaderName: this.leaderName,
                    trainingCategory: this.trainingCategory,
                    stats: this.stats,
                    leveledUp: leveledUp,
                    world: this.world,
                    gender: this.gender,
                    playerName: this.playerName
                });
            });
        }
    }

    class ResultsScene extends Phaser.Scene {
        constructor() { super('ResultsScene'); }
        init(data) {
            this.won = data.won;
            this.xp = data.xp;
            this.score = data.score;
            this.creatureName = data.creatureName;
            this.mode = data.mode || 'wild';
            this.leaderName = data.leaderName;
            this.trainingCategory = data.trainingCategory;
            this.leveledUp = Boolean(data.leveledUp);
            this.world = data.world || { location: 'sunmeadow', playerX: 368, playerY: 432 };
            this.gender = data.gender || 'male';
            this.playerName = data.playerName || 'Trainer';
            this.stats = data.stats || { level:1, xp:0, score:0, correctAnswers:0, incorrectAnswers:0, totalAttempts:0, accuracy:100 };
        }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const cw = this.cameras.main.width;
            const cy = this.cameras.main.height / 2;

            const title = this.won ? 'VICTORY!' : 'DEFEAT...';
            const color = this.won ? '#6bff6b' : '#ff5252';

            this.add.text(cw/2, cy - 80, title, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'42px', color: color }).setOrigin(0.5);
            this.add.text(cw/2, cy - 30, `+${this.xp} XP`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'20px', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(cw/2, cy + 10, `+${this.score} Score`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'20px', color:'#ffffff' }).setOrigin(0.5);

            const acc = this.stats.totalAttempts > 0 ? Math.round((this.stats.correctAnswers / this.stats.totalAttempts) * 100) : 100;
            this.add.text(cw/2, cy + 50, `Accuracy: ${acc}%`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color:'#b39ddb' }).setOrigin(0.5);

            if (this.leveledUp) {
                this.add.text(cw/2, cy + 78, `LEVEL UP! NOW LEVEL ${this.stats.level}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color:'#6bff6b' }).setOrigin(0.5);
                SoundManager.playLevelUp();
            }

            if (this.mode === 'gym') {
                const badgeText = this.won ? `Gym Badge: ${this.leaderName}` : 'Keep training!';
                const badgeColor = this.won ? '#ffd740' : '#ff5252';
                this.add.text(cw/2, cy + 80, badgeText, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color: badgeColor }).setOrigin(0.5);
            }

            const cont = this.add.text(cw/2, cy + 120, 'PRESS ENTER TO CONTINUE', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'18px', color:'#ffffff' }).setOrigin(0.5);
            this.tweens.add({ targets: cont, alpha: 0.2, duration: 700, yoyo: true, repeat: -1, ease:'Sine.easeInOut' });

            let returnScene = 'OverworldScene';
            let returnData = { gender: this.gender, playerName: this.playerName, stats: this.stats, world: this.world };

            if (this.mode === 'training') {
                const retrain = this.add.text(cw/2, cy + 160, 'Press T to Train Again', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'16px', color:'#ffd740' }).setOrigin(0.5);
                this.input.keyboard.once('keydown-T', () => {
                    this.cameras.main.fadeOut(200, 0, 0, 0);
                    this.time.delayedCall(200, () => this.scene.start('TrainingScene', {
                        gender: this.gender,
                        playerName: this.playerName,
                        stats: this.stats,
                        category: this.trainingCategory,
                        world: this.world
                    }));
                });
            }

            this.input.keyboard.once('keydown-ENTER', () => {
                this.cameras.main.fadeOut(300, 0, 0, 0);
                this.time.delayedCall(300, () => this.scene.start(returnScene, returnData));
            });
        }
    }

    class SoundManager {
        static getContext() {
            if (!this.context) {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.context.state === 'suspended') this.context.resume();
            return this.context;
        }

        static playTone(freq, duration, type, volume) {
            if (this.muted) return;
            try {
                const ctx = this.getContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type || 'square';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(volume || 0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + duration);
            } catch (e) {
                // Audio not supported
            }
        }

        static startMusic() {
            if (this.musicTimer || this.muted) return;
            const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
            let step = 0;
            this.musicTimer = setInterval(() => {
                this.playTone(melody[step % melody.length], 0.28, 'triangle', 0.025);
                step++;
            }, 420);
        }

        static stopMusic() {
            if (this.musicTimer) {
                clearInterval(this.musicTimer);
                this.musicTimer = null;
            }
        }

        static toggleMusic() {
            this.muted = !this.muted;
            if (this.muted) this.stopMusic();
            else this.startMusic();
            return !this.muted;
        }

        static bindToggle(scene) {
            scene.input.keyboard.on('keydown-M', () => {
                const enabled = this.toggleMusic();
                this.playSelect();
                console.log(`[MathMon] Music ${enabled ? 'on' : 'off'}`);
            });
        }

        static playHit() { this.playTone(220, 0.1, 'square', 0.08); }
        static playCorrect() { this.playTone(660, 0.15, 'square', 0.08); this.playTone(880, 0.15, 'square', 0.06); }
        static playWrong() { this.playTone(150, 0.25, 'sawtooth', 0.08); }
        static playSelect() { this.playTone(520, 0.08, 'square', 0.05); }
        static playTravel() { this.playTone(392, 0.12, 'triangle', 0.07); this.playTone(523, 0.18, 'triangle', 0.05); }
        static playDoor() { this.playTone(260, 0.1, 'square', 0.06); this.playTone(390, 0.16, 'triangle', 0.05); }
        static playLevelUp() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.playTone(f, 0.15, 'square', 0.1), i * 80)); }
    }

    class ParticleEmitter {
        static emit(scene, x, y, color, count) {
            const particles = [];
            for (let i = 0; i < count; i++) {
                const p = scene.add.image(x, y, 'pixel').setTint(Phaser.Display.Color.HexStringToColor(color).color).setScale(Phaser.Math.FloatBetween(0.5, 1.5)).setDepth(50);
                const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const speed = Phaser.Math.FloatBetween(40, 120);
                const tx = x + Math.cos(angle) * speed;
                const ty = y + Math.sin(angle) * speed;
                scene.tweens.add({ targets: p, x: tx, y: ty, alpha: 0, scale: 0, duration: 400, ease: 'Power2', onComplete: () => p.destroy() });
                particles.push(p);
            }
            return particles;
        }

        static emitRing(scene, x, y, color) {
            const ring = scene.add.circle(x, y, 8, Phaser.Display.Color.HexStringToColor(color).color).setDepth(50).setAlpha(0.8);
            scene.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 350, ease: 'Power2', onComplete: () => ring.destroy() });
        }
    }

    class HouseInteriorScene extends Phaser.Scene {
        constructor() { super('HouseInteriorScene'); }

        init(data) {
            this.gender = data.gender || 'male';
            this.playerName = data.playerName || 'Trainer';
            this.stats = data.stats || createFreshStats();
            this.world = data.world || { location: 'sunmeadow', playerX: 368, playerY: 432 };
        }

        create() {
            SoundManager.startMusic();
            SoundManager.bindToggle(this);
            this.cameras.main.setBackgroundColor('#241b2f');
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const width = this.cameras.main.width;
            const height = this.cameras.main.height;
            const roomLeft = 72;
            const roomTop = 70;
            const roomWidth = width - 144;
            const roomHeight = height - 150;

            this.add.rectangle(width / 2, height / 2, roomWidth, roomHeight, 0xc58f67).setStrokeStyle(8, 0x5d4037);
            this.add.rectangle(width / 2, roomTop + 22, roomWidth - 16, 44, 0x795548).setStrokeStyle(4, 0x3e2723);
            for (let x = roomLeft + 12; x < roomLeft + roomWidth - 12; x += 42) {
                this.add.rectangle(x, roomTop + 84, 34, roomHeight - 104, 0xd9a06f, 0.65);
            }

            this.add.text(width / 2, 34, 'YOUR HOUSE', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'28px', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(width / 2, 58, 'A quiet place to rest between adventures', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#d7ccc8' }).setOrigin(0.5);

            const furniture = (x, y, w, h, color, label) => {
                this.add.rectangle(x, y, w, h, color).setStrokeStyle(3, 0x3e2723);
                if (label) this.add.text(x, y, label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff' }).setOrigin(0.5);
            };
            furniture(170, 205, 150, 76, 0x8d4e3b, 'BED');
            furniture(600, 205, 120, 54, 0x4e6b75, 'DESK');
            furniture(600, 345, 110, 100, 0x6d4c41, 'SHELF');
            furniture(300, 390, 240, 54, 0xb85c38, 'RUG');
            this.add.rectangle(600, 182, 72, 34, 0x90caf9).setStrokeStyle(3, 0xffffff);
            this.add.image(350, 315, 'leafloo').setScale(1.2).setDepth(4);
            this.tweens.add({ targets: this.children.list[this.children.list.length - 1], y: 307, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

            this.player = this.add.image(width / 2, height - 120, this.gender === 'female' ? 'player_f' : 'player_m').setScale(2.4).setDepth(5);
            this.add.text(width / 2, height - 78, `${this.playerName}'s room`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#ffffff' }).setOrigin(0.5);

            const exit = this.add.rectangle(width / 2, height - 32, 180, 30, 0x263238).setStrokeStyle(2, 0xffd740).setInteractive({ useHandCursor: true });
            this.add.text(width / 2, height - 32, 'EXIT HOUSE  [E]', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffd740' }).setOrigin(0.5);
            exit.on('pointerdown', () => this.exitHouse());
            this.input.keyboard.on('keydown-E', () => this.exitHouse());
            this.input.keyboard.on('keydown-ESC', () => this.exitHouse());
        }

        exitHouse() {
            if (this.exiting) return;
            this.exiting = true;
            SoundManager.playDoor();
            this.cameras.main.fadeOut(250, 0, 0, 0);
            this.time.delayedCall(250, () => this.scene.start('OverworldScene', {
                gender: this.gender,
                playerName: this.playerName,
                stats: this.stats,
                world: this.world
            }));
        }
    }

    class TrainingScene extends Phaser.Scene {
        constructor() { super('TrainingScene'); }
        init(data) {
            this.gender = data.gender || 'male';
            this.playerName = data.playerName || 'Trainer';
            this.stats = data.stats || { level:1, xp:0, score:0, correctAnswers:0, incorrectAnswers:0, totalAttempts:0, accuracy:100 };
            this.category = data.category || 'addition';
            this.world = data.world || { location: 'sunmeadow', playerX: 368, playerY: 432 };
        }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const cw = this.cameras.main.width;
            const cy = this.cameras.main.height / 2;

            const labels = [
                { key:'addition', label:'+ Addition', color:'#ff6b35', x: cw/2 },
                { key:'subtraction', label:'- Subtraction', color:'#42a5f5', x: cw/2 },
                { key:'multiplication', label:'× Multiplication', color:'#ffa726', x: cw/2 },
                { key:'division', label:'÷ Division', color:'#ab47bc', x: cw/2 }
            ];

            this.add.text(cw/2, cy - 120, 'TRAINING', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'30px', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(cw/2, cy - 70, 'Choose a topic to practice:', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'15px', color:'#b39ddb' }).setOrigin(0.5);

            labels.forEach((lbl, i) => {
                const y = cy - 20 + i * 40;
                const strokeColor = Phaser.Display.Color.HexStringToColor(lbl.color).color;
                const box = this.add.rectangle(cw/2, y, 280, 32, 0x000000, 0.7).setStrokeStyle(2, strokeColor);
                const text = this.add.text(cw/2, y, lbl.label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'19px', color:'#ffffff' }).setOrigin(0.5);

                box.setInteractive({ useHandCursor: true });
                box.on('pointerover', () => { box.setFillStyle(0xffffff, 0.1); text.setColor(lbl.color); });
                box.on('pointerout', () => { box.setFillStyle(0x000000, 0.7); text.setColor('#ffffff'); });
                box.on('pointerdown', () => {
                    this.cameras.main.fadeOut(200, 0, 0, 0);
                    this.time.delayedCall(200, () => this.scene.start('BattleScene', {
                        mode: 'training',
                        category: lbl.key,
                        creatureKey: 'embercub',
                        creature: CREATURES.embercub,
                        difficulty: Math.min(10, Math.max(1, this.stats.level)),
                        gender: this.gender,
                        playerName: this.playerName,
                        stats: this.stats,
                        world: this.world
                    }));
                });
            });

            this.add.text(cw/2, cy + 160, 'Press ESC to return', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'15px', color:'#ff5252' }).setOrigin(0.5);

            this.input.keyboard.once('keydown-ESC', () => {
                this.cameras.main.fadeOut(200, 0, 0, 0);
                this.time.delayedCall(200, () => this.scene.start('OverworldScene', {
                    gender: this.gender,
                    playerName: this.playerName,
                    stats: this.stats
                }));
            });
        }
    }

    return {
        createGame: (containerId) => {
            try {
                console.log('[MathMon] Phaser version:', Phaser.VERSION);
                const rendererType = (typeof Phaser !== 'undefined' && Phaser.CANVAS) ? Phaser.CANVAS : 1;
                const config = {
                    type: rendererType,
                    parent: containerId || 'game',
                    width: 800,
                    height: 600,
                    backgroundColor: '#1a1424',
                    pixelArt: false,
                    scene: [BootScene, TitleScene, CharacterSelectScene, NameEntryScene, OverworldScene, BattleScene, ResultsScene, HouseInteriorScene, TrainingScene],
                    scale: {
                        mode: Phaser.Scale.FIT,
                        autoCenter: Phaser.Scale.CENTER_BOTH,
                        expandParent: true
                    },
                    input: { keyboard: true, activePointers: 3 },
                    render: {
                        antialias: true,
                        pixelArt: false,
                        roundPixels: false
                    }
                };
                console.log('[MathMon] Creating Phaser.Game with renderer:', rendererType, 'config:', config);
                const game = new Phaser.Game(config);
                console.log('[MathMon] Phaser.Game created successfully');
                return game;
            } catch (e) {
                console.error('[MathMon] Failed to create Phaser game:', e);
                const container = document.getElementById(containerId || 'game-container');
                if (container && window.showLoadError) {
                    window.showLoadError('Phaser failed to start: ' + (e.message || e));
                }
                throw e;
            }
        }
    };
})();
