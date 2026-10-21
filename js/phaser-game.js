    window.MathMonPhaser = (() => {
        'use strict';

    // Overworld map data (tiles, objects, NPCs, collision) lives in js/world/world-data.js.
    const WorldData = MathMonWorldData;
    const TILE = WorldData.TILE_PX;
    const MAP_W = WorldData.MAP_W;
    const MAP_H = WorldData.MAP_H;
    const SPEED = 160;

    // Battle modules (loaded before this file; see index.html)
    const BATTLE = MathMonBattleConfig;
    const BattleRules = MathMonBattleRules;
    const BattleHud = MathMonBattleHud;
    const QuestionDeck = MathMonQuestionDeck;

    // `element` drives type effectiveness (Fire > Wind > Earth > Water > Fire).
    const CREATURES = {
        embercub:  { name:'Embercub',  type:'addition',    element:'fire',  color:'#ff6b35', hp:35, atk:9, def:4, sprite:'🐻' },
        leafloo:   { name:'Leafloo',   type:'addition',    element:'wind',  color:'#66bb6a', hp:38, atk:8, def:6, sprite:'🌿' },
        aquabbit:  { name:'Aquabbit',  type:'subtraction', element:'water', color:'#42a5f5', hp:32, atk:10,def:5, sprite:'🐰' },
        mistFox:   { name:'Mist Fox',  type:'subtraction', element:'wind',  color:'#5c6bc0', hp:36, atk:9, def:5, sprite:'🦊' },
        rockite:   { name:'Rockite',   type:'multiplication', element:'earth', color:'#ffa726', hp:40, atk:11,def:7, sprite:'🪨' },
        bloomCat:  { name:'Bloom Cat', type:'multiplication', element:'fire',  color:'#ec407a', hp:37, atk:10,def:6, sprite:'🐱' },
        tideLing:  { name:'Tide Ling', type:'division',    element:'water', color:'#ab47bc', hp:34, atk:9, def:5, sprite:'🧜' },
        shellPup:  { name:'Shell Pup', type:'division',    element:'earth', color:'#26a69a', hp:42, atk:8, def:8, sprite:'🐚' }
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
    const WORLD_LOCATIONS = WorldData.locations;

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

    /** The player's chosen element is stored on the stats object so it travels with every scene and save. */
    function getPlayerElement(stats) {
        return stats && BATTLE.elements[stats.element] ? stats.element : 'fire';
    }

    /** Signature boss monster for an element (Fire → Dragon, Water → Kraken, Wind → Typhoeus, Earth → Titan). */
    function monsterFor(element) {
        const key = (BATTLE.elements[element] || BATTLE.elements.fire).monster;
        return { key, ...BATTLE.monsters[key] };
    }

    /** True when a key event comes from a text field (answer box, name entry). */
    function isTypingTarget(event) {
        const t = event && event.target;
        return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
    }

    /** Fade the DOM battle layers (3D canvas + HUD) in step with a Phaser camera fade. */
    function fadeDomLayers(container, ms) {
        container.querySelectorAll('.mm-stage3d, .mm-hud').forEach((node) => {
            node.style.transition = `opacity ${ms}ms ease`;
            node.style.opacity = '0';
        });
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

    /**
     * Title / cover screen.
     *   Background: 3D boss line-up on the storm peak (js/title-3d/title3d.js) when
     *               WebGL + ES modules are available, otherwise a painted 2D sunset
     *               line-up drawn here (also shown while the 3D module loads).
     *   Foreground: DOM logo + menu (js/title-screen.js) — Continue / New Game / Audio.
     */
    class TitleScene extends Phaser.Scene {
        constructor() { super('TitleScene'); }
        create() {
            this.cameras.main.setBackgroundColor('#140f22');
            this.titleClosed = false;
            this.starting = false;
            SoundManager.bindToggle(this);
            // Calm ambient menu track. Browsers block audio until the first click /
            // key press, so the manager queues it and starts on that interaction.
            SoundManager.startMusic('menu');
            if (window.MathMonMobile) window.MathMonMobile.hide();

            this.draw2DCover();

            const saved = loadProfile();
            const hasSave = Boolean(saved && saved.playerName && saved.stats);
            const container = this.game.canvas.parentElement;
            this.titleUi = MathMonTitleScreen.mount({
                container,
                elements: BATTLE.elements,
                monsters: BATTLE.monsters,
                save: hasSave ? {
                    playerName: saved.playerName,
                    level: saved.stats.level || 1,
                    elementName: saved.stats.element ? BATTLE.elements[saved.stats.element].name : 'No element yet'
                } : null,
                onContinue: () => this.startAdventure(saved),
                onNewGame: () => this.startAdventure(null),
                onAudio: () => { SoundManager.playSelect(); MathMonAudioUI.open(); },
                onHover: () => SoundManager.playHover(),
                onSelect: () => SoundManager.playSelect()
            });

            // Enter = the focused menu button, or the primary action.
            this.input.keyboard.on('keydown-ENTER', () => {
                if (this.titleUi.focused()) return;          // the focused <button> handles Enter itself
                this.titleUi.primary.click();
            });

            // Progressive enhancement: swap in the 3D backdrop as soon as its module is ready.
            this.onTitle3dReady = () => this.mount3D();
            this.mount3D();
            if (!this.title3d) window.addEventListener('mathmon-title3d-ready', this.onTitle3dReady);

            this.titleClosed = false;
            this.events.once('shutdown', () => {
                this.titleClosed = true;
                window.removeEventListener('mathmon-title3d-ready', this.onTitle3dReady);
                if (this.titleUi) this.titleUi.destroy();
                if (this.title3d) this.title3d.destroy();
                this.titleUi = null;
                this.title3d = null;
            });
        }

        mount3D() {
            const api = window.MathMonTitle3D;
            // (isActive() is false during create(), so use our own lifetime flag)
            if (this.title3d || this.titleClosed || !api || !BATTLE.stage3d.enabled || !api.isSupported()) return;
            try {
                this.title3d = api.mount(this.game.canvas.parentElement);
                // Let the 3D scene show through: clear the camera and fade out the 2D cover.
                this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
                this.tweens.add({ targets: this.coverLayer, alpha: 0, duration: 1200, ease: 'Sine.easeInOut' });
            } catch (error) {
                console.warn('[MathMon] 3D title failed; keeping the 2D cover.', error);
            }
        }

        /** Painted 2D cover: sunset sky, layered peaks and the four signature monsters. */
        draw2DCover() {
            const w = this.cameras.main.width, h = this.cameras.main.height;
            if (!this.textures.exists('title_cover_bg')) {
                const tex = this.textures.createCanvas('title_cover_bg', w, h);
                const ctx = tex.getContext();
                const sky = ctx.createLinearGradient(0, 0, 0, h);
                sky.addColorStop(0, '#1d1640');
                sky.addColorStop(0.45, '#7a3a5c');
                sky.addColorStop(0.7, '#ff9a4a');
                sky.addColorStop(1, '#2a1424');
                ctx.fillStyle = sky;
                ctx.fillRect(0, 0, w, h);
                const sun = ctx.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.62, h * 0.45);
                sun.addColorStop(0, 'rgba(255,240,200,0.95)');
                sun.addColorStop(0.15, 'rgba(255,190,110,0.6)');
                sun.addColorStop(1, 'rgba(255,150,80,0)');
                ctx.fillStyle = sun;
                ctx.fillRect(0, 0, w, h);
                const ridge = (base, amp, color, seed) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.moveTo(0, h);
                    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, base - Math.abs(Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.021 + seed * 2) * amp * 0.35));
                    ctx.lineTo(w, h);
                    ctx.closePath();
                    ctx.fill();
                };
                ridge(h * 0.7, 90, 'rgba(70,32,70,0.85)', 1);
                ridge(h * 0.8, 60, 'rgba(40,20,44,0.95)', 3);
                ridge(h * 0.9, 30, '#160c1c', 5);
                tex.refresh();
            }
            this.coverLayer = this.add.container(0, 0);
            this.coverLayer.add(this.add.image(w / 2, h / 2, 'title_cover_bg'));
            const lineup = [['earth', 0.5, 0.74, 3.4], ['fire', 0.26, 0.8, 2.8], ['wind', 0.74, 0.8, 2.8], ['water', 0.62, 0.88, 2.4]];
            lineup.forEach(([el, fx, fy, scale], i) => {
                const key = BATTLE.monsters[BATTLE.elements[el].monster].sprite2d;
                const glow = this.add.ellipse(w * fx, h * fy + 28 * scale / 3, 70 * scale / 2.4, 16, Phaser.Display.Color.HexStringToColor(BATTLE.elements[el].color).color, 0.45);
                const mon = this.add.image(w * fx, h * fy, key).setScale(scale).setFlipX(fx > 0.5);
                this.tweens.add({ targets: mon, y: mon.y - 8, duration: 1400 + i * 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                this.coverLayer.add([glow, mon]);
            });
        }

        /** Continue with `saved`, or start a new game (null) — a new game replaces the save. */
        startAdventure(saved) {
            if (this.starting) return;
            this.starting = true;
            if (window.MathMonMobile) window.MathMonMobile.requestLandscape();
            if (window.MathMonMobile) window.MathMonMobile.hide();
            SoundManager.playSelect();
            if (!saved) {
                try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
            }
            if (this.titleUi) this.titleUi.fadeOut();
            this.cameras.main.fadeOut(450, 0, 0, 0);
            this.time.delayedCall(450, () => {
                if (saved && !saved.stats.element) {
                    // Saves from before the elemental system pick an element first.
                    this.scene.start('ElementSelectScene', saved);
                } else if (saved) {
                    this.scene.start('OverworldScene', saved);
                } else {
                    this.scene.start('CharacterSelectScene');
                }
            });
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
                box.on('pointerover', () => { box.setFillStyle(0xffffff, 0.1); SoundManager.playHover(); });
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
                this.time.delayedCall(300, () => this.scene.start('ElementSelectScene', {
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

    /** Feature 3: pick a starting element (Fire / Water / Wind / Earth). */
    class ElementSelectScene extends Phaser.Scene {
        constructor() { super('ElementSelectScene'); }
        init(data) {
            this.profile = data;
        }
        create() {
            this.cameras.main.setBackgroundColor('#1a1424');
            this.cameras.main.fadeIn(300, 0, 0, 0);
            if (window.MathMonMobile) window.MathMonMobile.hide();

            const cw = this.cameras.main.width;
            const ch = this.cameras.main.height;
            this.add.text(cw / 2, 70, 'CHOOSE YOUR ELEMENT', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'28px', fontStyle:'bold', color:'#ffd740' }).setOrigin(0.5);
            this.add.text(cw / 2, 108, 'Fire > Wind > Earth > Water > Fire', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'15px', color:'#b39ddb' }).setOrigin(0.5);

            const keys = BATTLE.elementOrder;
            const cardW = 172;
            const gap = 16;
            const startX = cw / 2 - ((cardW + gap) * keys.length - gap) / 2 + cardW / 2;
            this.cards = keys.map((key, i) => {
                const el = BATTLE.elements[key];
                const weakTo = keys.find((k) => BATTLE.elements[k].beats === key);
                const color = Phaser.Display.Color.HexStringToColor(el.color).color;
                const x = startX + i * (cardW + gap);
                const y = ch / 2 + 20;
                const card = this.add.container(x, y);
                const bg = this.add.rectangle(0, 0, cardW, 280, 0x111827, 0.92).setStrokeStyle(3, color);
                const glow = this.add.ellipse(0, 10, 120, 30, color, 0.35);
                const signature = BATTLE.monsters[el.monster];
                const mon = this.add.image(0, -40, signature.sprite2d).setScale(1.8);
                const name = this.add.text(0, 36, el.name.toUpperCase(), { fontFamily:'"Atkinson Hyperlegible"', fontSize:'22px', fontStyle:'bold', color: el.color }).setOrigin(0.5);
                const monName = this.add.text(0, 62, `${signature.name}\n${signature.title}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#e2e8f0', align:'center' }).setOrigin(0.5);
                const strong = this.add.text(0, 94, `Strong vs ${BATTLE.elements[el.beats].name}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#a5f3c0' }).setOrigin(0.5);
                const weak = this.add.text(0, 114, `Weak vs ${BATTLE.elements[weakTo].name}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#fca5a5' }).setOrigin(0.5);
                const hint = this.add.text(0, -122, `${i + 1}`, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', fontStyle:'bold', color:'#ffffff', backgroundColor:'#00000088', padding:{ x:6, y:2 } }).setOrigin(0.5);
                card.add([bg, glow, mon, name, monName, strong, weak, hint]);
                this.tweens.add({ targets: mon, y: -38, duration: 800 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerover', () => { if (this.focused !== i) SoundManager.playHover(); this.focusCard(i); });
                bg.on('pointerdown', () => this.choose(key));
                return { card, key };
            });
            this.focused = 0;
            this.focusCard(0);

            this.add.text(cw / 2, ch - 50, 'CLICK / TAP A CARD  ·  1-4 or ←/→ + ENTER', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'13px', color:'#80cbc4' }).setOrigin(0.5);
            this.input.keyboard.on('keydown', (event) => {
                const n = Number(event.key);
                if (n >= 1 && n <= keys.length) this.choose(keys[n - 1]);
                else if (event.key === 'ArrowRight') this.focusCard((this.focused + 1) % keys.length);
                else if (event.key === 'ArrowLeft') this.focusCard((this.focused + keys.length - 1) % keys.length);
                else if (event.key === 'Enter') this.choose(keys[this.focused]);
            });
        }
        focusCard(index) {
            this.focused = index;
            this.cards.forEach((c, i) => {
                this.tweens.add({ targets: c.card, scale: i === index ? 1.07 : 0.95, y: this.cameras.main.height / 2 + (i === index ? 8 : 20), alpha: i === index ? 1 : 0.75, duration: 180, ease: 'Quad.easeOut' });
            });
        }
        choose(key) {
            if (this.chosen) return;
            this.chosen = true;
            SoundManager.playAttackCast(key, 'skill1');   // preview the element's sound
            const stats = this.profile.stats || createFreshStats();
            stats.element = key;
            persistProfile(this.profile.gender, this.profile.playerName, stats, this.profile.world);
            this.cameras.main.fadeOut(350, 0, 0, 0);
            this.time.delayedCall(350, () => this.scene.start('OverworldScene', { ...this.profile, stats }));
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
            this.cameras.main.fadeIn(300, 0, 0, 0);

            // Map data (deterministic, shared with both renderers): js/world/world-data.js
            this.map = WorldData.get(this.location.key);
            const savedX = Number.isFinite(this.world.playerX) ? this.world.playerX : 368;
            const savedY = Number.isFinite(this.world.playerY) ? this.world.playerY : 432;
            const spawn = this.map.nearestWalkablePx(savedX, savedY);   // old saves / random maps may point into a wall
            this.houseDoor = this.map.door;

            // Renderer: 3D (js/world-3d/overworld3d.js) when available, else the 2D tile renderer.
            this.world3d = this.mount3D(spawn);
            if (!this.world3d) {
                this.cameras.main.setBackgroundColor(this.location.tint);
                this.render2DMap();
            }
            this.events.once('shutdown', () => {
                if (this.world3d) this.world3d.unmount();
                this.world3d = null;
            });

            this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
            this.player = this.add.image(spawn.x, spawn.y, this.gender === 'female' ? 'player_f' : 'player_m').setScale(2).setDepth(10);
            this.player.setVisible(!this.world3d);
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
            this.greetedAt = {};

            const hudText = { fontFamily:'"Atkinson Hyperlegible"', color:'#ffffff', stroke:'#000000', strokeThickness:3 };
            const elementName = BATTLE.elements[getPlayerElement(this.stats)].name;
            this.add.text(8, 8, `${this.playerName}\nLv.${this.stats.level} · ${elementName}`, { ...hudText, fontSize:'14px' }).setScrollFactor(0).setDepth(20);
            this.add.text(this.cameras.main.width / 2, 14, `${this.location.name.toUpperCase()}  •  ${this.location.subtitle.toUpperCase()}`, { ...hudText, fontSize:'14px', color:'#ffd740' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
            const help = this.world3d
                ? 'MOVE: ARROWS / WASD   CAMERA: DRAG / Z X / WHEEL   HOUSE: E   TRAIN: T   GYM: G'
                : 'MOVE: ARROWS / WASD    ENTER HOUSE: E / H    TRAIN: T    GYM: G';
            this.add.text(92, this.cameras.main.height - 28, help, { ...hudText, fontSize:'12px' }).setScrollFactor(0).setDepth(20);

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
            if (this.world3d) this.bindCameraControls();

            this.time.delayedCall(1000, () => {
                const prompt = this.add.text(this.cameras.main.width/2, this.cameras.main.height - 40, 'Press G to challenge Gym', { fontFamily:'"Atkinson Hyperlegible"', fontSize:'14px', color:'#ffd740' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
                this.time.delayedCall(4000, () => prompt.destroy());
            });

            this.keyG = this.input.keyboard.addKey('G');
            this.keyT = this.input.keyboard.addKey('T');
            this.keyE = this.input.keyboard.addKey('E');
            this.keyH = this.input.keyboard.addKey('H');
            this.keyZ = this.input.keyboard.addKey('Z');
            this.keyX = this.input.keyboard.addKey('X');
            this.keyC = this.input.keyboard.addKey('C');
        }

        /** Try the 3D renderer; returns its controller, or null to use the 2D renderer. */
        mount3D(spawn) {
            const api = window.MathMonOverworld3D;
            if (!WorldData.render3d.enabled) return null;
            if (!api) {
                // The ES module may still be loading on a very fast "continue": switch to 3D once it is ready.
                if (document.querySelector('script[src*="world-3d/overworld3d.js"]')) {
                    window.addEventListener('mathmon-overworld3d-ready', () => {
                        if (this.scene.isActive() && !this.inEncounter) this.scene.restart({ ...this.sys.settings.data, world: this.getWorldState() });
                    }, { once: true });
                }
                return null;
            }
            if (!api.isSupported()) return null;
            try {
                return api.mount({ container: this.game.canvas.parentElement, mapKey: this.location.key, gender: this.gender, x: spawn.x, y: spawn.y });
            } catch (error) {
                console.warn('[MathMon] 3D overworld failed; using the 2D map.', error);
                const canvas = this.game.canvas.parentElement.querySelector('.mm-world3d');
                if (canvas) canvas.style.display = 'none';
                return null;
            }
        }

        /** 2D fallback renderer: draws the same map data with Phaser tile sprites. */
        render2DMap() {
            const map = this.map;
            for (let y = 0; y < MAP_H; y++) {
                for (let x = 0; x < MAP_W; x++) {
                    this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, map.tileInfo(x, y).tex2d);
                    if (map.tileAt(x, y) === WorldData.T.PALM) this.add.image(x * TILE + TILE / 2, y * TILE, 'prop_palm').setDepth(4);
                }
            }
            const textures = { house: 'building_house', apartment: 'building_apartment', market: 'building_market', cafe: 'building_cafe',
                gym: 'building_gym', barn: 'building_barn', palm: 'prop_palm' };
            map.objects.forEach((obj) => {
                const f = obj.footprint;
                const x = (f.x0 + f.w / 2) * TILE, y = (f.y0 + f.h / 2) * TILE;
                this.add.image(x, y, textures[obj.type] || 'building_house').setScale(obj.type === 'palm' ? 1.5 : 1.7).setDepth(4);
                if (obj.label) this.add.text(x, y + 40, obj.label, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'12px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(5);
            });
            map.npcs.forEach((n) => {
                const x = (n.tx + 0.5) * TILE, y = (n.ty + 0.5) * TILE;
                const npc = this.add.image(x, y, 'npc').setScale(1.35).setDepth(6);
                npc.setInteractive({ useHandCursor: true });
                npc.on('pointerdown', () => this.showWorldNotice(`${n.name}: ${n.line}`));
                this.add.text(x, y + 24, n.name, { fontFamily:'"Atkinson Hyperlegible"', fontSize:'10px', color:'#ffffff', stroke:'#000000', strokeThickness:3 }).setOrigin(0.5).setDepth(7);
                this.tweens.add({ targets: npc, y: y - 3, duration: 900 + n.tx * 30, yoyo: true, repeat: -1, ease:'Sine.easeInOut' });
            });
        }

        /** 3D camera: drag empty space to orbit, wheel / pinch to zoom, Z/X rotate, C resets. */
        bindCameraControls() {
            this.input.on('pointerdown', (pointer, over) => {
                if (over.length === 0) this.orbitDrag = { x: pointer.x };
            });
            this.input.on('pointermove', (pointer) => {
                const p1 = this.input.pointer1, p2 = this.input.pointer2;
                if (p1 && p2 && p1.isDown && p2.isDown) {
                    const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                    if (this.pinchDistance) this.world3d.zoom((this.pinchDistance - d) * 0.05);
                    this.pinchDistance = d;
                    this.orbitDrag = null;
                    return;
                }
                this.pinchDistance = null;
                if (!this.orbitDrag || !pointer.isDown) return;
                this.world3d.orbit(-(pointer.x - this.orbitDrag.x) * 0.008);
                this.orbitDrag.x = pointer.x;
            });
            this.input.on('pointerup', () => { this.orbitDrag = null; this.pinchDistance = null; });
            this.input.on('wheel', (pointer, over, dx, dy) => this.world3d.zoom(dy * 0.012));
        }

    update(time, delta) {
        if (this.inEncounter) return;
        const dt = delta / 1000;

        let vx = this.touchDirection.x, vy = this.touchDirection.y;
        if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
        if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

        if (this.world3d) {
            if (this.keyZ.isDown) this.world3d.orbit(1.6 * dt);
            if (this.keyX.isDown) this.world3d.orbit(-1.6 * dt);
            if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.world3d.resetView();
        }

        let moving = false;
        if (vx !== 0 || vy !== 0) {
            if (!this.wasMoving && !this.world3d) {
                this.tweens.add({ targets: this.player, scaleX: 2.16, duration: 100, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
            }
            this.wasMoving = true;
            const len = Math.sqrt(vx*vx + vy*vy);
            vx /= len; vy /= len;
            if (this.world3d) {
                // camera-relative: "up" always walks away from the camera
                const yaw = this.world3d.cameraYaw();
                const rx = vx * Math.cos(yaw) + vy * Math.sin(yaw);
                const ry = -vx * Math.sin(yaw) + vy * Math.cos(yaw);
                vx = rx; vy = ry;
            }
            const before = { x: this.player.x, y: this.player.y };
            this.moveWithCollision(vx * SPEED * dt, vy * SPEED * dt);
            moving = this.player.x !== before.x || this.player.y !== before.y;

            if (this.time.now - this.lastWorldSave > 800) {
                saveSceneProgress(this);
                this.lastWorldSave = this.time.now;
            }

            if (this.player.x >= MAP_W * TILE - TILE - 2) this.changeLocation(1);
            if (this.player.x <= TILE + 2) this.changeLocation(-1);

            if (moving && Math.random() < this.grassEncounterChance) {
                this.startWildEncounter();
            }
        } else {
            this.wasMoving = false;
        }
        if (this.world3d) this.world3d.setPlayer(this.player.x, this.player.y, moving, dt);
        this.greetNearbyNpc();

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

    /** Axis-separated movement against the map's blocked tiles (slides along walls). */
    moveWithCollision(dx, dy) {
        const probe = [[-9, -4], [9, -4], [-9, 10], [9, 10]];   // feet-sized box around the player
        const blocked = (x, y) => probe.some(([ox, oy]) => this.map.isBlockedPx(x + ox, y + oy));
        const minX = TILE, maxX = MAP_W * TILE - TILE, minY = TILE, maxY = MAP_H * TILE - TILE;
        const nx = Phaser.Math.Clamp(this.player.x + dx, minX, maxX);
        if (!blocked(nx, this.player.y)) this.player.x = nx;
        const ny = Phaser.Math.Clamp(this.player.y + dy, minY, maxY);
        if (!blocked(this.player.x, ny)) this.player.y = ny;
    }

    /** NPCs greet the player when they walk up (works in both renderers). */
    greetNearbyNpc() {
        const now = this.time.now;
        this.map.npcs.forEach((n) => {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, (n.tx + 0.5) * TILE, (n.ty + 0.5) * TILE);
            if (d < TILE * 1.4 && (!this.greetedAt[n.name] || now - this.greetedAt[n.name] > 8000)) {
                this.greetedAt[n.name] = now;
                this.showWorldNotice(`${n.name}: ${n.line}`);
            }
        });
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

    /*
     * BattleScene — turn loop:
     *   question (typed Question Gate) → command (Battle Command Menu) → animating → enemy → question …
     * Rules/numbers: js/battle-config.js + js/battle-rules.js + js/answer-checker.js
     * HUD (DOM overlay): js/battle-hud.js
     * Stage: 3D (js/battle-3d/stage3d.js) with an automatic 2D fallback (js/battle-stage-2d.js).
     *        Both expose the same promise-based API, so this scene never cares which one runs.
     */
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
            this.cameras.main.setBackgroundColor('#05070c');
            this.tweens.timeScale = 1;
            this.alive = true;
            SoundManager.startMusic('battle');
            SoundManager.setIntensity(0.15);
            MathMonAudioUI.setButtonVisible(false);   // the battle HUD has its own sound button
            SoundManager.bindToggle(this, (enabled) => this.hud && this.hud.setSoundEnabled(enabled));
            if (window.MathMonMobile) window.MathMonMobile.hide();
            // The answer box is a DOM input: stop Phaser from swallowing keys other
            // scenes captured (W/A/S/D, arrows, space…) while the player types.
            this.input.keyboard.disableGlobalCapture();

            // ---- Battle state ------------------------------------------------
            this.playerElement = getPlayerElement(this.stats);
            this.enemyElement = this.creatureData.element || 'fire';
            this.playerMonster = monsterFor(this.playerElement);
            this.enemyMonster = monsterFor(this.enemyElement);
            this.enemyName = this.enemyMonster.name;
            this.phase = 'intro';
            this.battleOver = false;
            this.turn = 0;
            this.streak = 0;
            this.mp = BATTLE.mp.start;
            this.turnMultiplier = 1;
            this.fastCrit = false;
            // Shown on the victory / defeat screen.
            this.battleStats = { questions: 0, correct: 0, damageDealt: 0, damageTaken: 0, crits: 0, bestCombo: 0, turns: 0 };
            this.status = { enemy: BattleRules.createStatusState(), player: BattleRules.createStatusState() };
            const eHp = BattleRules.getEnemyMaxHp(this.stats.level, this.mode);
            const pHp = BattleRules.getPlayerMaxHp(this.stats.level);
            this.enemyHp = { current: eHp, max: eHp };
            this.playerHp = { current: pHp, max: pHp };

            // ---- HUD ------------------------------------------------------------
            this.hud = BattleHud.create({
                container: this.game.canvas.parentElement,
                elements: BATTLE.elements,
                answers: BATTLE.answers,
                handlers: {
                    onSubmitAnswer: (text) => this.submitAnswer(text),
                    onHint: () => this.useHint(),
                    onCommand: (key) => this.chooseCommand(key),
                    onLockedCommand: (key) => this.chooseCommand(key),
                    onToggleSound: () => MathMonAudioUI.toggle(),      // opens the volume / mute panel
                    onHover: () => SoundManager.playHover()
                }
            });
            this.hud.setSoundEnabled(!SoundManager.muted);
            this.offAudioChange = MathMonAudio.onChange((s) => this.hud && this.hud.setSoundEnabled(!s.muted));
            this.hud.setCombatant('player', { name: this.playerName, title: `${this.playerMonster.name} · ${this.playerMonster.title}`,
                level: this.stats.level, element: this.playerElement, hp: pHp, maxHp: pHp, mp: this.mp, maxMp: BATTLE.mp.max });
            this.hud.setCombatant('enemy', { name: this.enemyName, title: this.enemyMonster.title,
                level: this.stats.level, element: this.enemyElement, hp: eHp, maxHp: eHp });
            this.hud.setTurn({ side: 'enemy', label: 'Battle start' });

            // ---- Stage (3D, or 2D fallback) ----------------------------------------
            this.stage = this.createStage();

            const intro = this.mode === 'gym'
                ? `Gym Leader ${this.leaderName} sends out ${this.enemyName}!`
                : this.mode === 'training'
                ? `Training: ${this.trainingCategory ? this.trainingCategory : 'mixed'} practice vs ${this.enemyName}`
                : `A wild ${this.enemyName} appeared!`;
            this.hud.log(intro, 'accent');
            const matchup = BattleRules.getMatchup(this.playerElement, this.enemyElement);
            const playerEl = BATTLE.elements[this.playerElement];
            const enemyEl = BATTLE.elements[this.enemyElement];

            this.input.keyboard.on('keydown', this.handleKey, this);
            this.events.once('shutdown', this.cleanup, this);

            this.lastMp = this.mp;
            // Preload any audio files before the battle starts (max 2 s; generated sounds need none).
            const audioReady = Promise.race([MathMonAudio.preload(), new Promise((r) => setTimeout(r, 2000))]);
            audioReady.then(() => {
                if (!this.alive) return null;
                if (this.stageKind === '2d') SoundManager.playMonster(this.enemyMonster.key, 'roar');   // 3D intros roar on their own
                return this.stage.introduce();
            }).then(() => {
                if (!this.alive) return;
                if (matchup !== 'neutral') {
                    this.hud.log(matchup === 'strong'
                        ? `${playerEl.name} beats ${enemyEl.name}: you have the advantage!`
                        : `${enemyEl.name} resists ${playerEl.name}: answer fast for bonus damage!`, matchup === 'strong' ? 'good' : 'warn');
                }
                this.startPlayerTurn();
            });
        }

        createStage() {
            const sound = {
                roar: (key) => SoundManager.playRoar(key),
                thunder: () => SoundManager.playThunder(),
                stomp: () => SoundManager.playStomp()
            };
            const container = this.game.canvas.parentElement;
            const want3d = BATTLE.stage3d.enabled && window.MathMonStage3D && window.MathMonStage3D.isSupported();
            if (want3d) {
                try {
                    const stage = window.MathMonStage3D.create({
                        container, config: BATTLE, hud: this.hud, sound,
                        playerMonster: this.playerMonster, enemyMonster: this.enemyMonster,
                        playerElement: this.playerElement, enemyElement: this.enemyElement
                    });
                    this.stageKind = '3d';
                    return stage;
                } catch (error) {
                    console.warn('[MathMon] 3D stage failed; falling back to 2D.', error);
                    const canvas = container.querySelector('.mm-stage3d');
                    if (canvas) canvas.style.display = 'none';
                }
            }
            this.stageKind = '2d';
            return new MathMonStage2D(this, {
                config: BATTLE,
                playerMonster: this.playerMonster, enemyMonster: this.enemyMonster,
                playerElement: this.playerElement, enemyElement: this.enemyElement,
                theme: locationFor(this.world.location).theme,
                trainerKey: this.gender === 'female' ? 'player_f' : 'player_m'
            });
        }

        cleanup() {
            this.alive = false;
            if (this.questionTimer) this.questionTimer.remove();
            this.tweens.timeScale = 1;
            this.input.keyboard.off('keydown', this.handleKey, this);
            this.input.keyboard.enableGlobalCapture();
            if (this.offAudioChange) this.offAudioChange();
            SoundManager.setIntensity(0);
            MathMonAudioUI.setButtonVisible(true);
            if (this.stage) this.stage.destroy();
            this.stage = null;
            if (this.hud) this.hud.destroy();
            this.hud = null;
        }

        handleKey(event) {
            if (event.repeat || this.battleOver || !this.hud) return;
            if (isTypingTarget(event)) return;   // Enter in the answer box is handled by its <form>
            const key = event.key.toLowerCase();
            if (key === 'l') { this.hud.toggleLog(); return; }
            if (this.phase === 'command') {
                const slot = Number(key);
                if (slot >= 1 && slot <= BATTLE.actionOrder.length) this.chooseCommand(BATTLE.actionOrder[slot - 1]);
            }
        }

        // ---- Player turn: 1) choose a move  2) answer its question  3) attack resolves ----
        startPlayerTurn() {
            if (this.battleOver || !this.alive) return;
            this.turn++;
            this.battleStats.turns = this.turn;
            this.pendingAction = null;
            this.phase = 'command';
            SoundManager.playTurn('player');
            this.hud.setTurn({ side: 'player', label: `Turn ${this.turn} · Choose a move (1-4)` });
            this.hud.showCommands(BattleRules.getActionMenu(this.playerElement, this.mp));
            if (this.turn === 1 && this.shouldShowTutorial()) {
                this.hud.showTutorial({
                    chain: ['water', 'fire', 'wind', 'earth'].map((key) => ({ key, name: BATTLE.elements[key].name, color: BATTLE.elements[key].color }))
                });
            }
        }

        shouldShowTutorial() {
            const t = BATTLE.tutorial;
            if (!t || !t.enabled) return false;
            if (t.everyBattle) return true;
            try {
                if (localStorage.getItem('mathmon_tutorial_seen')) return false;
                localStorage.setItem('mathmon_tutorial_seen', '1');
            } catch (e) { /* storage unavailable: show it */ }
            return true;
        }

        /** Step 1 — pick a move (MP is checked now, spent only when the attack lands). */
        chooseCommand(key) {
            if (this.phase !== 'command' || this.battleOver) return;
            const action = BattleRules.getAction(this.playerElement, key);
            const affordable = key === 'ultimate' ? this.mp >= BATTLE.mp.max : this.mp >= action.cost;
            if (!affordable) {
                SoundManager.playDenied();
                this.hud.flashLockedCommand(key, key === 'ultimate'
                    ? `${action.name} needs a full MP bar (${this.mp}/${BATTLE.mp.max}).`
                    : `${action.name} needs ${action.cost} MP (you have ${this.mp}).`);
                return;
            }
            SoundManager.playSelect();
            this.hud.hideTutorial();
            this.pendingAction = action;
            this.askQuestion(action);
        }

        /** Step 2 — a question whose difficulty matches the move (easy / medium / hard). */
        askQuestion(action) {
            const gate = BATTLE.questionGate;
            const tier = BattleRules.getActionTier(action.key);
            this.phase = 'question';
            this.hintUsed = false;
            this.currentQuestion = QuestionDeck.next({
                tier,
                category: this.mode === 'training' ? this.trainingCategory : null,
                config: BATTLE
            });
            this.questionSeconds = this.currentQuestion.timerSeconds;
            this.hud.setTurn({ side: 'player', label: `Turn ${this.turn} · Answer to attack` });
            this.hud.showQuestion(this.currentQuestion, {
                timerEnabled: gate.timerEnabled, timerSeconds: this.questionSeconds, hint: this.hintButtonState(),
                moveName: action.name, moveColor: BATTLE.elements[this.playerElement].color
            });
            this.questionStartTime = Date.now();
            this.lastTickSecond = null;
            if (this.questionTimer) this.questionTimer.remove();
            this.questionTimer = null;
            if (gate.timerEnabled) {
                this.questionTimer = this.time.addEvent({ delay: 100, loop: true, callback: this.updateQuestionTimer, callbackScope: this });
            }
        }

        hintButtonState() {
            const hint = BATTLE.hint;
            if (!hint.enabled || !this.currentQuestion.hint) return { visible: false };
            if (hint.penalty === 'mp') {
                return { visible: true, label: `Hint −${hint.mpCost} MP`, disabled: this.mp < hint.mpCost,
                    title: this.mp < hint.mpCost ? `Needs ${hint.mpCost} MP` : `Show a hint (costs ${hint.mpCost} MP)` };
            }
            const pct = Math.round(hint.damagePenalty * 100);
            return { visible: true, label: `Hint −${pct}% dmg`, title: `Show a hint (−${pct}% damage this turn)` };
        }

        useHint() {
            const hint = BATTLE.hint;
            if (this.phase !== 'question' || this.hintUsed || !hint.enabled) return;
            if (hint.penalty === 'mp') {
                if (this.mp < hint.mpCost) return;
                this.mp = BattleRules.clampMp(this.mp - hint.mpCost);
                this.refreshMp();
            }
            this.hintUsed = true;
            this.hud.showHint(this.currentQuestion.hint);
            this.hud.setHintButton({ visible: true, disabled: true, label: 'Hint used' });
            SoundManager.playSelect();
        }

        updateQuestionTimer() {
            if (this.phase !== 'question' || !this.hud) return;
            const total = this.questionSeconds;
            const left = Math.max(0, total - (Date.now() - this.questionStartTime) / 1000);
            this.hud.setTimer(left / total, left);
            const whole = Math.ceil(left);
            if (whole <= BATTLE.sound.timerTickSeconds && whole > 0 && whole !== this.lastTickSecond) {
                this.lastTickSecond = whole;
                SoundManager.playTick();
            }
            if (left <= 0) this.resolveAnswer(false, null);
        }

        submitAnswer(text) {
            if (this.phase !== 'question' || this.battleOver) return;
            const typed = String(text).trim();
            if (!/^\d+$/.test(typed)) {               // numbers only; empty input is rejected, not graded
                this.hud.rejectEmpty();
                return;
            }
            this.resolveAnswer(Number(typed) === this.currentQuestion.answer, typed);
        }

        /** Step 3 — grade the answer, then launch (or fail) the chosen attack. */
        resolveAnswer(correct, given) {
            if (this.phase !== 'question' || this.battleOver) return;
            this.phase = 'feedback';
            if (this.questionTimer) this.questionTimer.remove();
            this.questionTimer = null;

            const gate = BATTLE.questionGate;
            const q = this.currentQuestion;
            const action = this.pendingAction;
            const timedOut = given === null;
            const responseTime = (Date.now() - this.questionStartTime) / 1000;

            updateStatsAfterAnswer(this.stats, q.category, correct);
            this.battleStats.questions++;
            if (window.MathMonApi) window.MathMonApi.recordAttempt({
                category: q.category,
                correct,
                response_time: responseTime,
                difficulty: q.difficulty,
                answer_given: given === null ? null : Number(given),
                correct_answer: q.answer,
                level: this.stats.level
            });

            const hintPenalty = this.hintUsed && BATTLE.hint.penalty === 'damage' ? 1 - BATTLE.hint.damagePenalty : 1;

            if (correct) {
                this.streak++;
                this.battleStats.correct++;
                this.battleStats.bestCombo = Math.max(this.battleStats.bestCombo, this.streak);
                this.fastCrit = BattleRules.isFastAnswer(responseTime);
                this.turnMultiplier = BattleRules.getTurnMultiplier(true, this.streak) * hintPenalty;
                const comboPct = Math.round(BattleRules.getComboBonus(this.streak) * 100);
                let mpGain = gate.mpPerCorrectAnswer;
                const parts = ['Correct!'];
                if (this.fastCrit) parts.push(`Fast answer: CRITICAL hit (×${gate.fastCritMultiplier})!`);
                if (comboPct) parts.push(`Combo ×${this.streak}: +${comboPct}% damage.`);
                if (hintPenalty < 1) parts.push(`Hint: −${Math.round(BATTLE.hint.damagePenalty * 100)}% damage.`);
                if (this.streak % gate.streakLength === 0) {
                    mpGain += gate.streakMpBonus;
                    this.hud.showBanner(`Combo ×${this.streak}!`, { tone: 'good', sub: `+${gate.streakMpBonus} bonus MP` });
                }
                this.mp = BattleRules.clampMp(this.mp + mpGain);
                this.refreshMp();
                this.hud.setStreak(this.streak, comboPct);
                this.hud.revealAnswer({ correct: true, message: parts.join(' ') });
                SoundManager.playCorrect();
                this.time.delayedCall(gate.feedbackDelayMs, () => this.launchAttack(action));
                return;
            }

            this.streak = 0;
            this.fastCrit = false;
            this.hud.setStreak(0);
            SoundManager.playWrong();
            if (BATTLE.enemy.wrongAnswerHealPercent > 0) {
                const heal = Math.max(1, Math.round(this.enemyHp.max * BATTLE.enemy.wrongAnswerHealPercent));
                this.enemyHp.current = Math.min(this.enemyHp.max, this.enemyHp.current + heal);
                this.hud.setHp('enemy', this.enemyHp.current, this.enemyHp.max);
            }
            const lead = `${timedOut ? "Time's up! " : ''}Incorrect, the answer was ${q.displayAnswer}.`;
            if (gate.rule === 'lenient') {
                this.turnMultiplier = BattleRules.getTurnMultiplier(false) * hintPenalty;
                this.hud.revealAnswer({ correct: false, displayAnswer: q.displayAnswer,
                    message: `${lead} ${action.name} is weakened (×${gate.wrongAnswerDamageMultiplier}).` });
                this.time.delayedCall(gate.wrongRevealDelayMs, () => this.launchAttack(action));
            } else {
                this.hud.revealAnswer({ correct: false, displayAnswer: q.displayAnswer, message: `${lead} ${action.name} failed!` });
                if (!gate.refundMpOnMiss) {
                    this.mp = BattleRules.mpAfterAction(this.mp, { ...action, mpGain: 0 });
                    this.refreshMp();
                }
                this.time.delayedCall(gate.wrongRevealDelayMs, () => {
                    if (!this.alive) return;
                    this.hud.hidePanel();
                    this.stage.popup('player', 'MISS', { color: '#94a3b8' });
                    this.time.delayedCall(500, () => this.enemyTurn());
                });
            }
        }

        /** The chosen attack plays out (one action per turn; input stays locked until it ends). */
        launchAttack(action) {
            if (this.battleOver || !this.alive) return;
            this.phase = 'animating';
            this.hud.lockPanel();
            this.mp = BattleRules.mpAfterAction(this.mp, action);
            this.refreshMp();

            const element = BATTLE.elements[this.playerElement];
            const isUltimate = action.key === 'ultimate';
            if (isUltimate) {
                SoundManager.playUltimateCharge(this.playerElement);          // charge-up riser
                this.hud.setCinematic(true);
                this.hud.showBanner(action.name, { tone: 'ultimate', color: element.color, sub: `${element.name} Ultimate`, duration: 1250 });
            } else {
                SoundManager.playAttackCast(this.playerElement, action.key);  // swish / skill wind-up
                if (action.key !== 'normal') this.hud.showBanner(action.name, { tone: 'info', color: element.color, duration: 900 });
            }
            this.hud.hidePanel();
            Promise.resolve(this.stage.playerAction(action, { onImpact: () => this.resolvePlayerHit(action) })).then(() => {
                if (!this.alive) return;
                if (isUltimate) this.hud.setCinematic(false);
                this.afterPlayerAction();
            });
        }

        /** Apply player damage + secondary effect at the moment of impact. */
        resolvePlayerHit(action) {
            if (this.battleOver || !this.alive) return;
            const result = BattleRules.calcPlayerDamage({
                level: this.stats.level,
                action,
                attackerElement: this.playerElement,
                defenderElement: this.enemyElement,
                turnMultiplier: this.turnMultiplier,
                enemyStatus: this.status.enemy,
                fastCrit: this.fastCrit
            });
            const amount = Math.min(result.amount, this.enemyHp.current);
            this.battleStats.damageDealt += amount;
            if (result.crit) this.battleStats.crits++;
            this.enemyHp.current = Math.max(0, this.enemyHp.current - result.amount);
            this.hud.setHp('enemy', this.enemyHp.current, this.enemyHp.max);
            this.hud.pulseCard('enemy', 'hit');
            SoundManager.playImpact({ element: this.playerElement, action: action.key, matchup: result.effectiveness.matchup, crit: result.crit });
            SoundManager.playMonster(this.enemyMonster.key, 'hurt');
            this.stage.popup('enemy', `-${result.amount}`, { matchup: result.effectiveness.matchup, crit: result.crit });
            this.stage.hit('enemy', action.key === 'ultimate' ? 2 : result.effectiveness.matchup === 'strong' ? 1.5 : 1);
            if (amount / this.enemyHp.max >= BATTLE.damage.heavyHitShakeRatio && action.key !== 'ultimate') this.stage.shake(0.6);
            this.announceEffectiveness(result.effectiveness);

            let line = `${action.name} hit ${this.enemyName} for ${amount}`;
            if (result.crit) line += ' (critical!)';
            this.hud.log(`${line}.`, 'info');

            const effect = BattleRules.applyEffect(action.effect, {
                enemyStatus: this.status.enemy,
                playerStatus: this.status.player,
                damageDealt: amount
            });
            if (effect) {
                if (effect.type === 'heal') {
                    this.playerHp.current = Math.min(this.playerHp.max, this.playerHp.current + effect.amount);
                    this.hud.setHp('player', this.playerHp.current, this.playerHp.max);
                    this.hud.pulseCard('player', 'heal');
                    this.stage.popup('player', `+${effect.amount}`, { heal: true });
                    this.stage.statusFx('player', 'heal');
                    SoundManager.playHeal();
                }
                const who = effect.target === 'enemy' ? this.enemyName : this.playerName;
                this.time.delayedCall(350, () => this.hud && this.hud.log(`${who} ${effect.text}`, effect.target === 'enemy' ? 'good' : 'accent'));
            }
            this.refreshStatuses();
        }

        announceEffectiveness(eff) {
            if (eff.matchup === 'strong') {
                this.hud.showBanner(eff.label, { tone: 'super' });
                SoundManager.playSuperEffective();
            } else if (eff.matchup === 'weak') {
                this.hud.showBanner(eff.label, { tone: 'weak' });
            }
        }

        afterPlayerAction() {
            if (this.battleOver || !this.alive) return;
            if (this.enemyHp.current <= 0) {
                this.winBattle();
                return;
            }
            this.time.delayedCall(300, () => this.enemyTurn());
        }

        // ---- Enemy turn -------------------------------------------------------------
        enemyTurn() {
            if (this.battleOver || !this.alive) return;
            this.phase = 'enemy';
            this.hud.hidePanel();
            this.hud.setTurn({ side: 'enemy', label: `${this.enemyName}'s turn` });
            SoundManager.playTurn('enemy');
            const enemyStatus = this.status.enemy;

            // Burn damage ticks at the start of the enemy's turn.
            if (enemyStatus.burn) {
                const burn = Math.max(1, Math.round(this.enemyHp.max * enemyStatus.burn.percent));
                this.battleStats.damageDealt += Math.min(burn, this.enemyHp.current);
                this.enemyHp.current = Math.max(0, this.enemyHp.current - burn);
                this.hud.setHp('enemy', this.enemyHp.current, this.enemyHp.max);
                this.stage.statusFx('enemy', 'burn');
                SoundManager.playStatus('burn');
                this.updateIntensity();
                this.stage.popup('enemy', `-${burn}`, { color: '#ff8a50' });
                this.hud.log(`${this.enemyName} is hurt by its burn (${burn}).`, 'good');
                if (this.enemyHp.current <= 0) {
                    this.time.delayedCall(500, () => this.winBattle());
                    return;
                }
            }

            const delay = enemyStatus.burn ? 650 : 250;
            if (enemyStatus.stun) {
                enemyStatus.stun = null;
                this.time.delayedCall(delay, () => {
                    if (!this.alive) return;
                    this.stage.statusFx('enemy', 'stun');
                    SoundManager.playStatus('stun');
                    this.stage.popup('enemy', 'STUNNED', { color: '#ffe57f' });
                    this.hud.log(`${this.enemyName} is stunned and can't move!`, 'good');
                    this.time.delayedCall(1000, () => this.endRound());
                });
                return;
            }

            this.time.delayedCall(delay, () => {
                if (!this.alive) return;
                const result = BattleRules.calcEnemyDamage({
                    level: this.stats.level,
                    mode: this.mode,
                    attackerElement: this.enemyElement,
                    defenderElement: this.playerElement,
                    enemyStatus: this.status.enemy,
                    playerStatus: this.status.player
                });
                SoundManager.playMonster(this.enemyMonster.key, 'roar', { short: true });
                Promise.resolve(this.stage.enemyAttack({ onImpact: () => {
                    if (!this.alive) return;
                    this.battleStats.damageTaken += Math.min(result.amount, this.playerHp.current);
                    this.playerHp.current = Math.max(0, this.playerHp.current - result.amount);
                    this.hud.setHp('player', this.playerHp.current, this.playerHp.max);
                    this.hud.pulseCard('player', 'hit');
                    SoundManager.playImpact({ element: this.enemyElement, action: 'normal', matchup: result.effectiveness.matchup });
                    SoundManager.playMonster(this.playerMonster.key, 'hurt');
                    this.updateIntensity();
                    this.stage.popup('player', `-${result.amount}`, { matchup: result.effectiveness.matchup });
                    this.stage.hit('player', result.effectiveness.matchup === 'strong' ? 1.5 : 1);
                    this.announceEffectiveness(result.effectiveness);
                    const shielded = this.status.player.shield ? ' (shielded)' : '';
                    this.hud.log(`${this.enemyName} attacks for ${result.amount}${shielded}.`, 'bad');
                } })).then(() => this.endRound());
            });
        }

        endRound() {
            if (this.battleOver || !this.alive) return;
            BattleRules.tickStatuses(this.status.enemy);
            BattleRules.tickStatuses(this.status.player);
            this.refreshStatuses();
            if (this.playerHp.current <= 0) {
                this.battleOver = true;
                this.phase = 'over';
                this.hud.setTurn({ side: 'enemy', label: 'Defeated' });
                this.hud.log(`${this.playerMonster.name} fainted...`, 'bad');
                SoundManager.playMonster(this.playerMonster.key, 'defeat');
                Promise.resolve(this.stage.faint('player')).then(() => this.alive && this.endBattle(false));
                return;
            }
            this.time.delayedCall(300, () => this.startPlayerTurn());
        }

        refreshStatuses() {
            this.hud.setStatuses('enemy', BattleRules.describeStatuses(this.status.enemy));
            this.hud.setStatuses('player', BattleRules.describeStatuses(this.status.player));
            this.updateIntensity();
        }

        /** Sync the MP bar; charging plays a rising tick, a full bar plays the "Ultimate ready" cue. */
        refreshMp() {
            const max = BATTLE.mp.max;
            this.hud.setMp(this.mp, max);
            if (this.mp > this.lastMp) SoundManager.playMpCharge(this.mp / max);
            if (this.lastMp < max && this.mp >= max) {
                SoundManager.playUltimateReady();
                this.hud.showBanner('Ultimate ready!', { tone: 'good', sub: 'Press 4', duration: 1100 });
            }
            this.lastMp = this.mp;
            this.updateIntensity();
        }

        /** Music intensity: builds when either side's HP is low or the ultimate is ready. */
        updateIntensity() {
            const low = Math.min(this.playerHp.current / this.playerHp.max, this.enemyHp.current / this.enemyHp.max);
            const tension = low < 0.4 ? 0.45 + (0.4 - low) / 0.4 * 0.55 : 0;
            const ultReady = this.mp >= BATTLE.mp.max ? 0.85 : 0;
            SoundManager.setIntensity(Math.max(0.15, tension, ultReady));
        }

        winBattle() {
            if (this.battleOver || !this.alive) return;
            this.battleOver = true;
            this.phase = 'over';
            this.hud.hidePanel();
            this.hud.setTurn({ side: 'player', label: 'Victory' });
            this.hud.log(`${this.enemyName} fainted! You win!`, 'good');
            this.hud.showBanner('Victory!', { tone: 'good', duration: 1200 });
            SoundManager.playMonster(this.enemyMonster.key, 'defeat');
            Promise.resolve(this.stage.faint('enemy')).then(() => this.alive && this.time.delayedCall(500, () => this.endBattle(true)));
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
                opponent_name: this.enemyName,
                category: this.trainingCategory || this.creatureData.type || 'addition'
            });

            // The 3D canvas and HUD are DOM layers, so fade them alongside Phaser's camera fade.
            fadeDomLayers(this.game.canvas.parentElement, 400);
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.time.delayedCall(400, () => {
                this.scene.start('ResultsScene', {
                    won: won,
                    xp: xp,
                    score: score,
                    creatureName: this.enemyName,
                    battleStats: { ...this.battleStats, monster: this.playerMonster.name, element: this.playerElement },
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
            this.battleStats = data.battleStats;
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
            this.cameras.main.setBackgroundColor('#141020');
            // Fanfare / somber jingle, then the calm menu track.
            SoundManager.playJingle(this.won ? 'victory' : 'defeat');
            this.time.delayedCall(this.won ? 3000 : 3800, () => { if (!this.leaving) SoundManager.startMusic('menu'); });
            this.cameras.main.fadeIn(300, 0, 0, 0);

            const cw = this.cameras.main.width;
            const ch = this.cameras.main.height;
            const font = '"Atkinson Hyperlegible"';
            const bs = this.battleStats || { questions: 0, correct: 0, damageDealt: 0, damageTaken: 0, crits: 0, bestCombo: 0, turns: 0 };
            const accent = this.won ? '#6bff9b' : '#ff6b6b';

            // Title with a pop-in
            const title = this.add.text(cw / 2, 62, this.won ? 'VICTORY!' : 'DEFEAT...', { fontFamily: font, fontSize: '46px', fontStyle: 'bold', color: accent,
                stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5).setScale(0.4).setAlpha(0);
            this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
            const sub = this.won ? `${bs.monster || 'Your MathMon'} defeated ${this.creatureName}` : `${this.creatureName} won this time — train and try again!`;
            this.add.text(cw / 2, 104, sub, { fontFamily: font, fontSize: '15px', color: '#cbd5e1' }).setOrigin(0.5);

            // Battle stat tiles (count up)
            const accuracy = bs.questions ? Math.round((bs.correct / bs.questions) * 100) : 0;
            const tiles = [
                { label: 'Correct answers', value: bs.correct, suffix: ` / ${bs.questions}` },
                { label: 'Accuracy', value: accuracy, suffix: '%' },
                { label: 'Damage dealt', value: bs.damageDealt, suffix: '' },
                { label: 'Best combo', value: bs.bestCombo, prefix: '×' },
                { label: 'Critical hits', value: bs.crits, suffix: '' },
                { label: 'Damage taken', value: bs.damageTaken, suffix: '' }
            ];
            const tileW = 200, tileH = 74, gap = 14;
            const x0 = cw / 2 - (tileW * 3 + gap * 2) / 2 + tileW / 2;
            tiles.forEach((t, i) => {
                const x = x0 + (i % 3) * (tileW + gap);
                const y = 170 + Math.floor(i / 3) * (tileH + gap);
                const box = this.add.graphics();
                box.fillStyle(0x1e293b, 0.95).fillRoundedRect(x - tileW / 2, y - tileH / 2, tileW, tileH, 12);
                box.lineStyle(2, Phaser.Display.Color.HexStringToColor(i === 1 ? accent : '#334155').color, 1).strokeRoundedRect(x - tileW / 2, y - tileH / 2, tileW, tileH, 12);
                this.add.text(x, y - 16, t.label.toUpperCase(), { fontFamily: font, fontSize: '11px', color: '#94a3b8', fontStyle: 'bold' }).setOrigin(0.5);
                const value = this.add.text(x, y + 10, `${t.prefix || ''}0${t.suffix || ''}`, { fontFamily: font, fontSize: '26px', fontStyle: 'bold', color: '#f8fafc' }).setOrigin(0.5);
                this.tweens.addCounter({ from: 0, to: t.value, duration: 700, delay: 250 + i * 90, ease: 'Cubic.easeOut',
                    onUpdate: (tw) => value.setText(`${t.prefix || ''}${Math.round(tw.getValue())}${t.suffix || ''}`) });
            });

            // Rewards
            let y = 340;
            const rewards = [];
            if (this.mode !== 'training') rewards.push(`+${this.xp} XP`, `+${this.score} score`);
            rewards.push(`Overall accuracy ${this.stats.accuracy ?? 100}%`, `${bs.turns} turns`);
            this.add.text(cw / 2, y, rewards.join('   •   '), { fontFamily: font, fontSize: '16px', color: '#ffd740' }).setOrigin(0.5);
            if (this.leveledUp) {
                y += 30;
                this.add.text(cw / 2, y, `LEVEL UP! NOW LEVEL ${this.stats.level}`, { fontFamily: font, fontSize: '18px', fontStyle: 'bold', color: '#6bff9b' }).setOrigin(0.5);
                this.time.delayedCall(1300, () => SoundManager.playLevelUp());
            }
            if (this.mode === 'gym') {
                y += 28;
                this.add.text(cw / 2, y, this.won ? `Gym Badge earned: ${this.leaderName}` : 'Keep training for the gym badge!', { fontFamily: font, fontSize: '16px',
                    color: this.won ? '#ffd740' : '#ff8a80' }).setOrigin(0.5);
            }

            // Buttons
            const returnData = { gender: this.gender, playerName: this.playerName, stats: this.stats, world: this.world };
            const go = (sceneKey, data, ms) => {
                if (this.leaving) return;
                this.leaving = true;
                SoundManager.playSelect();
                this.cameras.main.fadeOut(ms || 300, 0, 0, 0);
                this.time.delayedCall(ms || 300, () => this.scene.start(sceneKey, data));
            };
            const button = (x, label, onClick, primary) => {
                const w = 220, h = 48;
                const g = this.add.graphics();
                const draw = (hover) => {
                    g.clear();
                    g.fillStyle(primary ? (hover ? 0xffe57f : 0xffd740) : (hover ? 0x334155 : 0x1e293b), 1).fillRoundedRect(x - w / 2, ch - 92 - h / 2, w, h, 12);
                    if (!primary) g.lineStyle(2, 0xffd740, 1).strokeRoundedRect(x - w / 2, ch - 92 - h / 2, w, h, 12);
                };
                draw(false);
                this.add.text(x, ch - 92, label, { fontFamily: font, fontSize: '17px', fontStyle: 'bold', color: primary ? '#1a1424' : '#ffd740' }).setOrigin(0.5);
                const zone = this.add.zone(x, ch - 92, w, h).setInteractive({ useHandCursor: true });
                zone.on('pointerover', () => { draw(true); SoundManager.playHover(); });
                zone.on('pointerout', () => draw(false));
                zone.on('pointerdown', onClick);
            };
            const continueToWorld = () => go('OverworldScene', returnData);
            if (this.mode === 'training') {
                const trainAgain = () => go('TrainingScene', { ...returnData, category: this.trainingCategory }, 200);
                button(cw / 2 - 125, 'CONTINUE  (Enter)', continueToWorld, true);
                button(cw / 2 + 125, 'TRAIN AGAIN  (T)', trainAgain, false);
                this.input.keyboard.once('keydown-T', trainAgain);
            } else {
                button(cw / 2, 'CONTINUE  (Enter)', continueToWorld, true);
            }
            this.input.keyboard.once('keydown-ENTER', continueToWorld);
        }
    }

    /**
     * Game-facing sound hooks. Every call routes to the audio system in
     * js/audio/ (MathMonAudio: buses, voice limiting, settings, music) — the
     * scenes keep calling these names, so adding real audio files later
     * (audio/README.md) needs no scene changes.
     */
    class SoundManager {
        static get muted() { return MathMonAudio.isMuted(); }

        /** Crossfade to a music track: 'menu' | 'overworld' | 'battle'. */
        static startMusic(track) { MathMonAudio.playMusic(track || 'overworld'); }
        static stopMusic(fade) { MathMonAudio.stopMusic(fade); }
        static setIntensity(v) { MathMonAudio.setIntensity(v); }
        static playJingle(kind) { MathMonAudio.playJingle(kind); }

        /** Toggle mute; returns true when sound is ON (kept for existing callers). */
        static toggleMusic() { return !MathMonAudio.toggleMute(); }

        static bindToggle(scene, onChange) {
            scene.input.keyboard.on('keydown-M', (event) => {
                if (isTypingTarget(event)) return;   // typing "m" in an answer must not mute
                const enabled = this.toggleMusic();
                this.playSelect();
                if (onChange) onChange(enabled);
            });
        }

        // UI
        static playSelect() { MathMonAudio.play('ui.select'); }
        static playClick() { MathMonAudio.play('ui.click'); }
        static playHover() { MathMonAudio.play('ui.hover'); }
        static playDenied() { MathMonAudio.play('ui.denied'); }
        static playDoor() { MathMonAudio.play('ui.door'); }
        static playTravel() { MathMonAudio.play('ui.travel'); }
        static playLevelUp() { MathMonAudio.play('ui.levelup'); }

        // Question gate
        static playCorrect() { MathMonAudio.play('quiz.correct'); }
        static playWrong() { MathMonAudio.play('quiz.wrong'); }
        static playTick() { MathMonAudio.play('quiz.tick'); }

        // MP, turns, health
        static playMpCharge(level) { MathMonAudio.play('mp.charge', { level }); }
        static playUltimateReady() { MathMonAudio.play('mp.ready', { reverb: 0.3, cooldown: 1 }); }
        static playTurn(side) { MathMonAudio.play(side === 'enemy' ? 'turn.enemy' : 'turn.player', { cooldown: 0.3 }); }
        static playHit() { MathMonAudio.play('hit.damage'); }
        static playHeal() { MathMonAudio.play('heal'); }
        static playStatus(type) { MathMonAudio.play(`status.${type}`); }

        // Attacks (cast at launch, impact at the animation's hit frame)
        static playAttackCast(element, action) { MathMonAudio.attackCast(element, action); }
        static playImpact(opts) { MathMonAudio.impact(opts); }
        static playUltimateCharge(element) { MathMonAudio.ultCharge(element); }

        // Monster voices: kind 'roar' | 'hurt' | 'defeat'
        static playMonster(key, kind, opts) { MathMonAudio.monster(key, kind, opts); }
        static playRoar(key) { this.playMonster(key, 'roar'); }
        static playThunder() { MathMonAudio.play('attack.impact', { element: 'earth', action: 'normal', matchup: 'weak', cooldown: 2, cooldownKey: 'thunder' }); }
        static playStomp() { MathMonAudio.play('attack.impact', { element: 'earth', action: 'normal', cooldown: 0.2, cooldownKey: 'stomp' }); }

        // Legacy names kept for older call sites
        static playAttack() { this.playClick(); }
        static playSkill() { this.playSelect(); }
        static playUltimate() { this.playSelect(); }
        static playSuperEffective() { /* covered by the heavier strong-matchup impact */ }
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
                box.on('pointerover', () => { box.setFillStyle(0xffffff, 0.1); text.setColor(lbl.color); SoundManager.playHover(); });
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
                    // Transparent canvas: the 3D overworld renders underneath Phaser's HUD.
                    // Every scene sets its own camera background, so 2D scenes look unchanged.
                    transparent: true,
                    pixelArt: false,
                    scene: [BootScene, TitleScene, CharacterSelectScene, NameEntryScene, ElementSelectScene, OverworldScene, BattleScene, ResultsScene, HouseInteriorScene, TrainingScene],
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
