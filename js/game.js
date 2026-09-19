/**
 * MathMon - Main Game Engine
 *
 * Handles:
 * - Game state management (screens, transitions)
 * - Character selection
 * - World exploration and encounters
 * - Battle system (question → attack → XP → level up)
 * - Performance tracking (correct/incorrect, accuracy, response time)
 * - Score, XP, and level progression
 * - localStorage persistence
 * - ML classification & recommendations integration
 *
 * Mirrors the logic from the Python backend (ml_model.py, data_processor.py)
 * for a seamless client-side experience.
 */

const MathMonGame = (function() {
    'use strict';

    const STATE = {
        status: 'landing',
        player: null,
        stats: null,
        currentMonster: null,
        playerMaxHp: 0,
        playerCurrentHp: 0,
        currentQuestion: null,
        battleLog: [],
        gameTimer: null,
        questionTimer: null,
        questionStartTime: 0,
        isQuestionActive: false,
        pendingDamage: 0,
        pendingHealing: 0,
        battleResult: null,
        mlResult: null,
        dialogueTimer: null,
        dialogueActionTaken: false
    };

    const XP_PER_LEVEL = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 4900, 6000, 7200, 8500, 10000];
    const MAX_LEVEL = 15;

    const SCREENS = {
        landing: 'screen-landing',
        character: 'screen-character',
        game: 'screen-game',
        battleSetup: 'screen-battle-setup',
        battle: 'screen-battle',
        question: 'screen-question',
        results: 'screen-results',
        stats: 'screen-stats',
        howto: 'screen-howto'
    };

    let DOMElements = {};

    function init() {
        cacheDOMElements();
        loadSavedGame();
        bindEvents();
        if (STATE.player) {
            updateUI();
        } else {
            showScreen('landing');
        }
    }

    function cacheDOMElements() {
        DOMElements = {
            gameContainer: document.getElementById('game-container'),
            gameHeader: document.getElementById('game-header'),
            gameMain: document.getElementById('game-main'),
            gameFooter: document.querySelector('.game-footer'),
            btnStart: document.getElementById('btn-start'),
            btnHowto: document.getElementById('btn-howto'),
            btnStats: document.getElementById('btn-stats'),
            btnReset: document.getElementById('btn-reset'),
            btnStartGame: document.getElementById('btn-start')
        };
    }

    function showScreen(screenName, options) {
        options = options || {};
        STATE.status = screenName;

        const screenId = SCREENS[screenName] || SCREENS.landing;

        document.querySelectorAll('.game-screen').forEach(screen => {
            screen.classList.remove('active');
            screen.style.display = 'none';
        });

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'flex';
            targetScreen.classList.add('active', 'fade-in');
        }

        if (screenName === 'battle' || screenName === 'battleSetup') {
            document.getElementById('battle-bg').classList.add('battle-active');
            if (STATE.currentMonster) {
                const sprite = document.getElementById('monster-sprite');
                if (sprite) sprite.textContent = STATE.currentMonster.sprite;
            }
        } else {
            document.getElementById('battle-bg').classList.remove('battle-active');
        }

        if (['battleSetup', 'game', 'battle', 'question'].includes(screenName)) {
            DOMElements.gameHeader.classList.remove('hidden');
        } else {
            DOMElements.gameHeader.classList.add('hidden');
        }

        if (['landing', 'character', 'stats', 'howto'].includes(screenName)) {
            DOMElements.gameFooter.classList.add('hidden');
        } else {
            DOMElements.gameFooter.classList.remove('hidden');
        }

        if (options.animate) {
            if (targetScreen) {
                targetScreen.classList.add('fade-in');
            }
        }

        updateUI();
    }

    function bindEvents() {
        const btnStart = document.getElementById('btn-start');
        if (btnStart) btnStart.addEventListener('click', () => startNewGame());

        const btnHowto = document.getElementById('btn-howto');
        if (btnHowto) btnHowto.addEventListener('click', () => showScreen('howto'));

        const btnStats = document.getElementById('btn-stats');
        if (btnStats) btnStats.addEventListener('click', () => showStats());

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) btnReset.addEventListener('click', () => resetGame());

        document.querySelectorAll('.character-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            opt.querySelector('.btn-select').addEventListener('click', () => selectCharacter(opt));
        });

        const btnBackCharacter = document.getElementById('btn-back-character');
        if (btnBackCharacter) btnBackCharacter.addEventListener('click', () => showScreen('landing'));

        const btnEncounter = document.getElementById('btn-encounter');
        if (btnEncounter) btnEncounter.addEventListener('click', () => startEncounter());

        const btnStartBattle = document.getElementById('btn-start-battle');
        if (btnStartBattle) btnStartBattle.addEventListener('click', () => startBattle());

        const btnBackWorld = document.getElementById('btn-back-world');
        if (btnBackWorld) btnBackWorld.addEventListener('click', () => showScreen('game'));

        const btnAttack = document.getElementById('btn-attack');
        if (btnAttack) btnAttack.addEventListener('click', () => startQuestionSequence());

        const btnItem = document.getElementById('btn-item');
        if (btnItem) btnItem.addEventListener('click', () => showToast('Items not yet implemented. Use Attack to solve math!', 'error'));

        const btnRun = document.getElementById('btn-run');
        if (btnRun) btnRun.addEventListener('click', () => attemptRun());

        const btnSubmitAnswer = document.getElementById('btn-submit-answer');
        if (btnSubmitAnswer) btnSubmitAnswer.addEventListener('click', () => submitAnswer());

        const answerInput = document.getElementById('answer-input');
        if (answerInput) {
            answerInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitAnswer();
                }
            });
        }

        const btnHint = document.getElementById('btn-hint');
        if (btnHint) btnHint.addEventListener('click', () => showHint());

        const btnContinue = document.getElementById('btn-continue');
        if (btnContinue) btnContinue.addEventListener('click', () => continueAfterDialogue());

        const btnNextBattle = document.getElementById('btn-next-battle');
        if (btnNextBattle) btnNextBattle.addEventListener('click', () => nextBattle());

         const btnViewStats = document.getElementById('btn-view-stats');
         if (btnViewStats) btnViewStats.addEventListener('click', () => showStats());

        const btnSaveQuit = document.getElementById('btn-save-quit');
        if (btnSaveQuit) btnSaveQuit.addEventListener('click', () => saveAndQuit());

        const btnBackStats = document.getElementById('btn-back-stats');
        if (btnBackStats) btnBackStats.addEventListener('click', () => showScreen('game'));

        const btnBackHowto = document.getElementById('btn-back-howto');
        if (btnBackHowto) btnBackHowto.addEventListener('click', () => showScreen('landing'));

        const btnBackWorld2 = document.getElementById('btn-back-world');
        if (btnBackWorld2) btnBackWorld2.addEventListener('click', () => showScreen('game'));
    }

    function startNewGame() {
        STATE.stats = null;
        STATE.player = null;
        STATE.currentMonster = null;
        STATE.battleLog = [];
        clearAllTimers();
        showScreen('character');
    }

    function selectCharacter(element) {
        document.querySelectorAll('.character-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        element.classList.add('selected');

        const gender = element.getAttribute('data-gender');
        const isMale = gender === 'male';

        STATE.player = {
            name: isMale ? 'Trainer Red' : 'Trainer Blue',
            gender: gender,
            sprite: isMale ? '🧑' : '🧑‍🎨',
            avatar: isMale ? '👨' : '👩'
        };

        createPlayerProfile();
    }

    function createPlayerProfile() {
        STATE.stats = initializeStats();
        saveGame();
        showScreen('game');
        updateUI();
        showWorldMessage("Welcome, " + STATE.player.name + "! Enter the grass to find MathMon!");
    }

    function initializeStats() {
        return {
            playerName: STATE.player.name,
            gender: STATE.player.gender,
            level: 1,
            xp: 0,
            xpToNextLevel: XP_PER_LEVEL[1],
            score: 0,
            totalBattles: 0,
            battlesWon: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            totalAttempts: 0,
            accuracy: 100,
            totalResponseTime: 0,
            topicStats: {
                addition: { attempts: 0, correct: 0, accuracy: 0, totalTime: 0 },
                subtraction: { attempts: 0, correct: 0, accuracy: 0, totalTime: 0 },
                multiplication: { attempts: 0, correct: 0, accuracy: 0, totalTime: 0 },
                division: { attempts: 0, correct: 0, accuracy: 0, totalTime: 0 }
            },
            mlHistory: [],
            currentSessionCorrect: 0,
            currentSessionIncorrect: 0,
            currentSessionAttempts: 0,
            currentSessionTime: 0
        };
    }

    function startEncounter() {
        const category = QuestionGenerator.pickBalancedCategory(STATE.stats, STATE.stats.level);
        const difficulty = QuestionGenerator.getDifficultyForLevel(STATE.stats.level);
        const monster = pickRandomMonster(category, difficulty);

        STATE.currentMonster = createMonsterInstance(monster);

        showMonsterBattleSetup(monster);
        showScreen('battleSetup');

        const worldMsg = document.getElementById('world-message');
        if (worldMsg) {
            worldMsg.textContent = "A Wild " + monster.name + " appeared!";
            worldMsg.style.display = 'block';
        }
    }

    function pickRandomMonster(category, difficulty) {
        const maxLevel = Math.max(1, 1 + Math.floor(difficulty / 3));
        const candidates = MONSTER_DATA
            .filter(m => m.type === category && m.level <= maxLevel)
            .sort(() => 0.5 - Math.random());
        if (candidates.length === 0) {
            return MONSTER_DATA.filter(m => m.type === category)[0];
        }
        return candidates[0];
    }

    function createMonsterInstance(baseMonster) {
        return {
            ...baseMonster,
            maxHp: baseMonster.hp + (STATE.stats.level - 1) * 5,
            currentHp: baseMonster.hp + (STATE.stats.level - 1) * 5,
            attack: baseMonster.attack + Math.floor(STATE.stats.level * 0.5),
            defense: baseMonster.defense + Math.floor(STATE.stats.level * 0.3)
        };
    }

    function showMonsterBattleSetup(monster) {
        const preview = document.getElementById('opponent-preview');
        if (preview) {
            preview.innerHTML = `
                <div class="monster-sprite-large" style="font-size: 64px;">${monster.sprite}</div>
                <h3>${monster.name} (Lv. ${STATE.stats.level})</h3>
                <div class="opponent-type">${monster.type.toUpperCase()} Type • HP: ${monster.hp + (STATE.stats.level - 1) * 5}</div>
            `;
        }

        const battleLog = document.getElementById('battle-log');
        if (battleLog) {
            battleLog.innerHTML = `<div class="battle-log-entry info">⚔️ A wild ${monster.name} appeared! Get ready to battle!</div>`;
        }
    }

    function startBattle() {
        STATE.battleLog = [];
        STATE.isQuestionActive = false;
        STATE.playerMaxHp = 80 + STATE.stats.level * 10;
        STATE.playerCurrentHp = STATE.playerMaxHp;
        addBattleLog(`⚔️ Battle started! Defeat ${STATE.currentMonster.name}!`, 'info');
        updateBattleLog();
        updatePlayerHPBar();
        updateMonsterHPBar();
        showScreen('battle');
    }

    function startQuestionSequence() {
        if (STATE.isQuestionActive) return;

        const difficulty = QuestionGenerator.getDifficultyForLevel(STATE.stats.level);
        const question = QuestionGenerator.generateQuestion(STATE.currentMonster.type, difficulty);

        STATE.currentQuestion = question;
        STATE.isQuestionActive = true;
        STATE.questionStartTime = Date.now();

        showQuestion(question);
        startQuestionTimer(30);
    }

    function TIMEOUT_QUESTION() {
        STATE.isQuestionActive = false;
        addBattleLog(`⏰ Time's up! You failed to answer in time.`, 'wrong');

        const questionScreen = document.getElementById('screen-question');
        if (questionScreen) {
            questionScreen.style.display = 'none';
            questionScreen.classList.remove('active');
        }

        if (STATE.currentMonster && STATE.currentMonster.currentHp > 0) {
            monsterAttackSuccess();
        }
    }

    function showQuestion(question) {
        const questionScreen = document.getElementById('screen-question');
        if (questionScreen) {
            questionScreen.style.display = 'flex';
            questionScreen.classList.add('active');
        }

        const catEl = document.getElementById('question-category');
        if (catEl) {
            catEl.textContent = question.categoryIcon + ' ' + question.categoryLabel;
        }

        const qEl = document.getElementById('question-text');
        if (qEl) {
            qEl.textContent = question.question + ' = ?';
        }

        const input = document.getElementById('answer-input');
        if (input) {
            input.value = '';
            input.focus();
        }

        const feedback = document.getElementById('feedback-area');
        if (feedback) {
            feedback.textContent = '';
            feedback.className = 'feedback-area';
        }

        const btnContinue = document.getElementById('btn-continue');
        if (btnContinue) {
            btnContinue.style.display = 'none';
        }

        const battleActions = document.getElementById('battle-actions');
        if (battleActions) {
            battleActions.style.display = 'none';
        }

        const dialogueEl = document.getElementById('battle-dialogue');
        if (dialogueEl) dialogueEl.style.display = 'none';
    }

    function showHint() {
        if (!STATE.currentQuestion) return;
        const feedback = document.getElementById('feedback-area');
        if (feedback) {
            feedback.textContent = '💡 ' + STATE.currentQuestion.hint;
            feedback.className = 'feedback-area feedback-correct';
        }
    }

    function submitAnswer() {
        if (!STATE.isQuestionActive || !STATE.currentQuestion) return;

        const input = document.getElementById('answer-input');
        if (!input) return;

        const userAnswer = parseFloat(input.value.trim());
        const correctAnswer = STATE.currentQuestion.answer;

        clearInterval(STATE.questionTimer);
        resetQuestionTimer();

        const responseTime = (Date.now() - STATE.questionStartTime) / 1000;
        STATE.isQuestionActive = false;

        const questionScreen = document.getElementById('screen-question');
        if (questionScreen) {
            questionScreen.style.display = 'none';
            questionScreen.classList.remove('active');
        }

        const battleActions = document.getElementById('battle-actions');
        if (battleActions) {
            battleActions.style.display = 'flex';
        }

        if (isNaN(userAnswer)) {
            addBattleLog('Please enter a valid number!', 'wrong');
            return;
        }

        STATE.stats.totalAttempts++;
        STATE.stats.currentSessionAttempts++;
        STATE.stats.totalResponseTime += responseTime;
        STATE.stats.currentSessionTime += responseTime;

        const topic = STATE.currentQuestion.category;
        if (STATE.stats.topicStats[topic]) {
            STATE.stats.topicStats[topic].attempts++;
            STATE.stats.topicStats[topic].totalTime += responseTime;
        }

        const isCorrect = userAnswer === correctAnswer;

        if (isCorrect) {
            handleCorrectAnswer(correctAnswer, responseTime, topic);
        } else {
            handleWrongAnswer(userAnswer, correctAnswer, responseTime, topic);
        }

        updateUI();
    }

    function handleCorrectAnswer(correctAnswer, responseTime, topic) {
        addBattleLog(`✅ Correct! ${STATE.currentQuestion.question} = ${correctAnswer}`, 'correct');
        STATE.stats.correctAnswers++;
        STATE.stats.currentSessionCorrect++;

        if (STATE.stats.topicStats[topic]) {
            STATE.stats.topicStats[topic].correct++;
        }

        const baseDamage = Math.max(8, 25 - (STATE.stats.level * 0.3));
        const damage = Math.round(baseDamage - STATE.currentMonster.defense * 0.4) + randInt(3, 8);
        const actualDamage = Math.max(5, damage);

        STATE.pendingDamage = actualDamage;
        STATE.currentMonster.currentHp = Math.max(0, STATE.currentMonster.currentHp - actualDamage);

        showDialogue(`Your math skills are strong! You dealt ${actualDamage} damage to ${STATE.currentMonster.name}!`, true);
        animateDamage(actualDamage);

        scheduleDialogueAction(() => {
            hideDialogue();
            checkBattleState();
        }, 1200);
    }

    function handleWrongAnswer(userAnswer, correctAnswer, responseTime, topic) {
        addBattleLog(`❌ Wrong! You said ${userAnswer}. Correct: ${correctAnswer}`, 'wrong');
        STATE.stats.incorrectAnswers++;
        STATE.stats.currentSessionIncorrect++;

        const healAmount = Math.max(3, Math.round(STATE.currentMonster.maxHp * 0.1));
        STATE.pendingHealing = healAmount;
        STATE.currentMonster.currentHp = Math.min(STATE.currentMonster.maxHp, STATE.currentMonster.currentHp + healAmount);

        showDialogue(`Incorrect! The answer was ${correctAnswer}. ${STATE.currentMonster.name} recovered ${healAmount} HP!`, false);
        animateHealing(healAmount);

        showFeedbackMessage('correct', `The answer was ${correctAnswer}. Try the next question!`);

        scheduleDialogueAction(() => {
            if (STATE.currentMonster && STATE.currentMonster.currentHp > 0) {
                hideDialogue();
                startQuestionSequence();
            }
        }, 1500);
    }

    function animateDamage(damage) {
        const monsterSprite = document.getElementById('monster-sprite');
        if (monsterSprite) {
            monsterSprite.classList.add('monster-shake');
            setTimeout(() => monsterSprite.classList.remove('monster-shake'), 500);
        }

        showFeedbackMessage('damage', `-${damage} DMG to ${STATE.currentMonster.name}!`);

        setTimeout(() => {
            updateMonsterHPBar();
        }, 500);
    }

    function animateHealing(amount) {
        const monsterSprite = document.getElementById('monster-sprite');
        if (monsterSprite) {
            monsterSprite.classList.add('monster-heal');
            setTimeout(() => monsterSprite.classList.remove('monster-heal'), 500);
        }

        showFeedbackMessage('healing', `${amount} HP restored to ${STATE.currentMonster.name}!`);

        setTimeout(() => {
            updateMonsterHPBar();
        }, 500);
    }

    function showDialogue(text, isCorrect) {
        const dialogueEl = document.getElementById('battle-dialogue');
        const textEl = document.getElementById('dialogue-text');
        const continueBtn = document.getElementById('btn-continue');
        const battleActions = document.getElementById('battle-actions');

        if (dialogueEl) dialogueEl.style.display = 'block';
        if (textEl) textEl.textContent = text;
        if (continueBtn) continueBtn.style.display = 'none';
        if (battleActions) battleActions.style.display = 'none';

        addBattleLog(text, isCorrect ? 'damage' : 'wrong');
    }

    function hideDialogue() {
        const dialogueEl = document.getElementById('battle-dialogue');
        const continueBtn = document.getElementById('btn-continue');
        const battleActions = document.getElementById('battle-actions');
        if (dialogueEl) dialogueEl.style.display = 'none';
        if (continueBtn) continueBtn.style.display = 'none';
        if (battleActions) battleActions.style.display = 'flex';
    }

    /**
     * Schedule the action that advances the battle after a dialogue, and
     * record that it is still pending so a manual Continue click can take
     * over instead of running the action a second time.
     */
    function scheduleDialogueAction(action, delay) {
        STATE.dialogueActionTaken = false;
        clearTimeout(STATE.dialogueTimer);
        STATE.dialogueTimer = setTimeout(() => {
            STATE.dialogueTimer = null;
            if (STATE.dialogueActionTaken) return;
            STATE.dialogueActionTaken = true;
            action();
        }, delay);
    }

    /**
     * Claim the pending dialogue action. Returns true for the first caller
     * (manual Continue or the timeout) and false for any duplicate call.
     */
    function claimDialogueAction() {
        if (STATE.dialogueActionTaken) return false;
        STATE.dialogueActionTaken = true;
        return true;
    }

    function continueAfterDialogue() {
        if (!claimDialogueAction()) return;
        clearTimeout(STATE.dialogueTimer);
        STATE.dialogueTimer = null;
        hideDialogue();
        checkBattleState();
    }

    function checkBattleState() {
        if (!STATE.currentMonster) return;
        if (STATE.currentMonster.currentHp <= 0) {
            endBattle(true);
        } else {
            monsterAttack();
        }
    }

    function monsterAttack() {
        addBattleLog(`${STATE.currentMonster.name} attacks!`, 'info');

        setTimeout(() => {
            hideDialogue();
            const question = QuestionGenerator.generateQuestion(
                pickRandomCategory(),
                QuestionGenerator.getDifficultyForLevel(STATE.stats.level)
            );
            STATE.currentQuestion = question;
            STATE.isQuestionActive = true;
            STATE.questionStartTime = Date.now();

            showDialogue(`A wild ${STATE.currentMonster.name} attacks you with a math question!`, false);

            setTimeout(() => {
                hideDialogue();
                showQuestion(question);
                startQuestionTimer(30);
            }, 1500);
        }, 500);
    }

    function startQuestionTimer(timeLimit) {
        let timeRemaining = timeLimit;
        const timerFill = document.getElementById('timer-fill');

        STATE.questionTimer = setInterval(() => {
            timeRemaining--;
            if (timerFill) {
                timerFill.style.width = (timeRemaining / timeLimit) * 100 + '%';
                if (timeRemaining <= 10) {
                    timerFill.classList.add('timer-warning');
                } else {
                    timerFill.classList.remove('timer-warning');
                }
            }
            if (timeRemaining <= 0) {
                clearInterval(STATE.questionTimer);
                TIMEOUT_QUESTION();
            }
        }, 1000);
    }

    function monsterAttackSuccess() {
        addBattleLog(`${STATE.currentMonster.name} landed a critical math attack! You lost 15 HP.`, 'wrong');
        const damage = 15;
        STATE.playerCurrentHp = Math.max(0, STATE.playerCurrentHp - damage);
        STATE.stats.score = Math.max(0, STATE.stats.score - 10);
        updatePlayerHPBar();
        showDialogue(`${STATE.currentMonster.name}'s attack hit! You lost ${damage} HP and 10 points.`, false);

        if (STATE.playerCurrentHp <= 0) {
            addBattleLog(`💀 You have been defeated in battle!`, 'wrong');
            setTimeout(() => {
                hideDialogue();
                endBattle(false);
            }, 1500);
        } else {
            clearInterval(STATE.questionTimer);
            resetQuestionTimer();

            setTimeout(() => {
                hideDialogue();
            }, 1500);
        }
    }

    function pickRandomCategory() {
        const categories = ['addition', 'subtraction', 'multiplication', 'division'];
        return categories[Math.floor(Math.random() * categories.length)];
    }

    function attemptRun() {
        const runChance = Math.random();
        if (runChance > 0.3) {
            addBattleLog('You successfully ran away!', 'info');
            showDialogue('You ran away safely!', false);
            setTimeout(() => {
                STATE.currentMonster = null;
                STATE.battleLog = [];
                clearInterval(STATE.questionTimer);
                resetQuestionTimer();
                const battleActions = document.getElementById('battle-actions');
                if (battleActions) battleActions.style.display = 'flex';
                showScreen('game');
                showWorldMessage('You escaped from battle.');
            }, 800);
        } else {
            addBattleLog('You failed to run away!', 'info');
            showDialogue('You couldn\'t escape! The battle continues!', false);
            setTimeout(() => {
                continueAfterDialogue();
                monsterAttack();
            }, 800);
        }
    }

    function endBattle(victory) {
        clearInterval(STATE.questionTimer);
        resetQuestionTimer();

        STATE.stats.totalBattles++;
        addBattleLog(`--- Battle vs ${STATE.currentMonster.name} ended ---`, 'info');

        let xpEarned = 0;
        let scoreEarned = 0;

        if (victory) {
            STATE.stats.battlesWon++;
            xpEarned = Math.round(50 * (1 + STATE.stats.level * 0.1));
            scoreEarned = Math.round(30 + STATE.stats.level * 3);
            STATE.stats.xp += xpEarned;
            STATE.stats.score += scoreEarned;

            addBattleLog(`✅ Victory! ${STATE.currentMonster.name} was defeated!`, 'correct');
            addBattleLog(`+${xpEarned} XP | +${scoreEarned} Score`, 'xp');
        } else {
            xpEarned = Math.round(20 * (1 + STATE.stats.level * 0.1));
            scoreEarned = 5;
            STATE.stats.xp += xpEarned;
            STATE.stats.score += scoreEarned;

            addBattleLog(`💀 You were defeated by ${STATE.currentMonster.name}!`, 'wrong');
            addBattleLog(`+${xpEarned} XP (participation) | +${scoreEarned} Score`, 'xp');
        }

        while (STATE.stats.xp >= XP_PER_LEVEL[STATE.stats.level] && STATE.stats.level < MAX_LEVEL) {
            STATE.stats.level++;
            addBattleLog(`🎉 LEVEL UP! Now Level ${STATE.stats.level}!`, 'xp');
            xpEarned += 10;
        }

        addBattleLog(`Accuracy: ${calculateAccuracy()}%`, 'info');

        STATE.stats.accuracy = calculateAccuracy();

        const mlResult = MathML.generateRecommendations(STATE.stats);
        STATE.mlResult = mlResult;

        showResultsScreen(xpEarned, scoreEarned, victory, mlResult);

        saveGame();
    }

    function showResultsScreen(xpEarned, scoreEarned, victory, mlResult) {
        const resultsEl = document.getElementById('result-summary');
        if (resultsEl) {
            const category = STATE.currentMonster.type;
            const catLabel = MATH_CATEGORIES.find(c => c.key === category).label;
            resultsEl.innerHTML = `
                <div class="result-summary-row"><span>Battle Result</span><span style="color: ${victory ? '#6BCF7F' : '#FF6B6B'}">${victory ? 'Victory' : 'Defeat'}</span></div>
                <div class="result-summary-row"><span>Opponent</span><span>${STATE.currentMonster.name} (${catLabel})</span></div>
                <div class="result-summary-row"><span>XP Earned</span><span style="color: #FFD93D">+${xpEarned}</span></div>
                <div class="result-summary-row"><span>Score Gain</span><span style="color: #FF6B35">+${scoreEarned}</span></div>
                <div class="result-summary-row"><span>Questions Answered</span><span>${STATE.stats.currentSessionAttempts}</span></div>
                <div class="result-summary-row"><span>Session Correct</span><span style="color: #6BCF7F">${STATE.stats.currentSessionCorrect}</span></div>
                <div class="result-summary-row"><span>Session Incorrect</span><span style="color: #FF6B6B">${STATE.stats.currentSessionIncorrect}</span></div>
                <div class="result-summary-row"><span>Overall Accuracy</span><span style="color: #FFD93D">${calculateAccuracy()}%</span></div>
            `;
        }

        const xpGainEl = document.getElementById('xp-gain-display');
        if (xpGainEl) {
            xpGainEl.innerHTML = `Total XP Gain: +${xpEarned}`;
        }

        const mlEl = document.getElementById('ml-result-text');
        if (mlEl) {
            const cat = mlResult.classification.category;
            mlEl.textContent = cat.label;
            mlEl.className = 'ml-result ' + cat.colorClass;
        }

        const mlRecEl = document.getElementById('ml-recommendation-text');
        if (mlRecEl) {
            mlRecEl.innerHTML = mlResult.recommendations.join('<br>') || 'Keep up the good work!';
        }

        STATE.stats.currentSessionCorrect = 0;
        STATE.stats.currentSessionIncorrect = 0;
        STATE.stats.currentSessionAttempts = 0;
        STATE.stats.currentSessionTime = 0;

        STATE.mlResult.mlHistory = true;
        STATE.stats.mlHistory.push({
            timestamp: Date.now(),
            classification: mlResult.classification.category.label,
            accuracy: STATE.stats.accuracy,
            features: mlResult.classification.features
        });

        showScreen('results');
    }

    function calculateAccuracy() {
        if (STATE.stats.totalAttempts === 0) return 100;
        const acc = (STATE.stats.correctAnswers / STATE.stats.totalAttempts) * 100;
        return Math.round(acc * 10) / 10;
    }

    function nextBattle() {
        STATE.currentMonster = null;
        STATE.battleLog = [];
        STATE.playerMaxHp = 0;
        STATE.playerCurrentHp = 0;
        clearInterval(STATE.questionTimer);
        resetQuestionTimer();

        const dialogueEl = document.getElementById('battle-dialogue');
        if (dialogueEl) dialogueEl.style.display = 'none';

        const battleActions = document.getElementById('battle-actions');
        if (battleActions) battleActions.style.display = 'flex';

        showWorldMessage('What will you do next?');
        showScreen('game');
    }

    function showStats() {
        const content = document.getElementById('stats-content');
        if (!content) return;

        const acc = calculateAccuracy();
        const xpPercent = STATE.stats.xp >= XP_PER_LEVEL[STATE.stats.level]
            ? 100
            : (STATE.stats.xp / XP_PER_LEVEL[STATE.stats.level]) * 100;

        let topicHTML = '';
        const topics = ['addition', 'subtraction', 'multiplication', 'division'];
        topics.forEach(topic => {
            const ts = STATE.stats.topicStats[topic];
            const topicAcc = ts.attempts > 0 ? Math.round((ts.correct / ts.attempts) * 100) : 0;
            topicHTML += `
                <div class="topic-item">
                    <span class="topic-name">${topic.charAt(0).toUpperCase() + topic.slice(1)}</span>
                    <div class="topic-bar-container">
                        <div class="topic-bar-fill" style="width: ${topicAcc}%"></div>
                    </div>
                    <span class="topic-stat">${ts.correct}/${ts.attempts} (${topicAcc}%)</span>
                </div>
            `;
        });

        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-value">${STATE.stats.level}</div>
                    <div class="stat-label">Trainer Level</div>
                </div>
                <div class="stat-card secondary">
                    <div class="stat-value">${STATE.stats.score}</div>
                    <div class="stat-label">Total Score</div>
                </div>
                <div class="stat-card tertiary">
                    <div class="stat-value">${STATE.stats.battlesWon}/${STATE.stats.totalBattles}</div>
                    <div class="stat-label">Battles Won</div>
                </div>
                <div class="stat-card quaternary">
                    <div class="stat-value">${acc}%</div>
                    <div class="stat-label">Accuracy</div>
                </div>
                <div class="stat-card" style="grid-column: span 2;">
                    <div class="stat-value" style="font-size: 20px; color: #FFD93D">${STATE.stats.xp}/${XP_PER_LEVEL[STATE.stats.level]}</div>
                    <div class="stat-label">XP Progress</div>
                    <div class="xp-bar" style="margin-top: 8px; width: 100%; max-width: 300px; margin-left: auto; margin-right: auto;">
                        <div class="xp-fill" style="width: ${xpPercent}%"></div>
                    </div>
                </div>
            </div>
            <div class="topic-progress">
                <h3>Topic Performance</h3>
                ${topicHTML}
            </div>
            <div style="margin-top: 20px; text-align: center;">
                <p style="color: #FFD93D; font-size: 13px;">Latest ML Assessment: <strong>${
                    STATE.stats.mlHistory.length > 0
                        ? STATE.stats.mlHistory[STATE.stats.mlHistory.length - 1].classification
                        : 'None yet'
                }</strong></p>
            </div>
        `;

        showScreen('stats');
    }

    function saveAndQuit() {
        saveGame();
        showScreen('landing');
    }

    function resetGame() {
        if (confirm('Reset all progress? This cannot be undone.')) {
            STATE.player = null;
            STATE.stats = null;
            STATE.currentMonster = null;
            STATE.battleLog = [];
            STATE.mlResult = null;
            localStorage.removeItem('mathmon_save');
            showScreen('landing');
        }
    }

    function saveGame() {
        if (!STATE.stats) return;
        const saveData = {
            player: STATE.player,
            stats: STATE.stats,
            timestamp: Date.now()
        };
        localStorage.setItem('mathmon_save', JSON.stringify(saveData));
    }

    function loadSavedGame() {
        const saved = localStorage.getItem('mathmon_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                STATE.player = data.player;
                STATE.stats = data.stats;
            } catch (e) {
                STATE.player = null;
                STATE.stats = null;
            }
        }
    }

    function updateUI() {
        if (!STATE.stats || !STATE.player) return;

        const levelBadge = document.getElementById('player-level-badge');
        if (levelBadge) levelBadge.textContent = 'Lv. ' + STATE.stats.level;

        const xpFill = document.getElementById('xp-fill');
        if (xpFill) {
            const xpPercent = (STATE.stats.xp / XP_PER_LEVEL[STATE.stats.level]) * 100;
            xpFill.style.width = Math.min(100, xpPercent) + '%';
        }

        const xpText = document.getElementById('xp-text');
        if (xpText) {
            xpText.textContent = STATE.stats.xp + '/' + XP_PER_LEVEL[STATE.stats.level];
        }

        const scoreDisplay = document.getElementById('score-display');
        if (scoreDisplay) scoreDisplay.textContent = STATE.stats.score;

        const battleCount = document.getElementById('battle-count');
        if (battleCount) battleCount.textContent = STATE.stats.totalBattles;

        const playerName = document.getElementById('player-display-name');
        if (playerName) playerName.textContent = STATE.player.name;

        const footerLevel = document.getElementById('footer-level');
        if (footerLevel) footerLevel.textContent = STATE.stats.level;

        const footerXp = document.getElementById('footer-xp');
        if (footerXp) footerXp.textContent = STATE.stats.xp;

        const footerXpNext = document.getElementById('footer-xp-next');
        if (footerXpNext) footerXpNext.textContent = XP_PER_LEVEL[STATE.stats.level];

        const footerScore = document.getElementById('footer-score');
        if (footerScore) footerScore.textContent = STATE.stats.score;

        const footerAccuracy = document.getElementById('footer-accuracy');
        if (footerAccuracy) footerAccuracy.textContent = calculateAccuracy() + '%';

        const footerBattles = document.getElementById('footer-battles');
        if (footerBattles) footerBattles.textContent = STATE.stats.totalBattles;

        if (STATE.status === 'battle' && STATE.playerMaxHp > 0) {
            updatePlayerHPBar();
        }
    }

    function updatePlayerHPBar() {
        const hpFill = document.getElementById('player-hp-fill');
        const hpText = document.getElementById('player-hp-text');
        if (hpFill && hpText && STATE.playerMaxHp) {
            const hpPercent = (STATE.playerCurrentHp / STATE.playerMaxHp) * 100;
            hpFill.style.width = Math.max(0, hpPercent) + '%';
            hpText.textContent = STATE.playerCurrentHp + '/' + STATE.playerMaxHp;
        }
    }

    function updateMonsterHPBar() {
        const hpFill = document.getElementById('monster-hp-fill-battle');
        const hpText = document.getElementById('monster-hp-text-battle');
        if (STATE.currentMonster) {
            const hpPercent = (STATE.currentMonster.currentHp / STATE.currentMonster.maxHp) * 100;
            if (hpFill) hpFill.style.width = Math.max(0, hpPercent) + '%';
            if (hpText) hpText.textContent = STATE.currentMonster.currentHp + '/' + STATE.currentMonster.maxHp;
        }
    }

    function addBattleLog(message, type) {
        STATE.battleLog.push({ text: message, type: type });
        if (STATE.battleLog.length > 50) STATE.battleLog.shift();
        updateBattleLog();
    }

    function updateBattleLog() {
        const logEl = document.getElementById('battle-log');
        if (!logEl) return;
        logEl.innerHTML = STATE.battleLog
            .map(entry => `<div class="battle-log-entry ${entry.type || 'info'}">${entry.text}</div>`)
            .join('');
        logEl.scrollTop = logEl.scrollHeight;
    }

    function showFeedbackMessage(type, text) {
        const feedback = document.getElementById('feedback-area');
        if (!feedback) return;

        if (type === 'damage') {
            feedback.innerHTML = `<span style="color: var(--btn-primary); font-weight: bold;">${text}</span>`;
        } else if (type === 'healing') {
            feedback.innerHTML = `<span style="color: #4CAF50; font-weight: bold;">${text}</span>`;
        } else {
            feedback.innerHTML = `<span style="color: var(--text-correct);">${text}</span>`;
        }

        setTimeout(() => {
            if (feedback) feedback.innerHTML = '';
        }, 2000);
    }

    function showWorldMessage(message) {
        const el = document.getElementById('world-message');
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
        }
    }

    function showToast(message, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'success');
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    function resetQuestionTimer() {
        const timerFill = document.getElementById('timer-fill');
        if (timerFill) {
            timerFill.style.width = '100%';
            timerFill.classList.remove('timer-warning');
        }
    }

    function clearAllTimers() {
        if (STATE.gameTimer) clearInterval(STATE.gameTimer);
        if (STATE.questionTimer) clearInterval(STATE.questionTimer);
        STATE.gameTimer = null;
        STATE.questionTimer = null;
    }

    function randInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    window.addEventListener('beforeunload', () => {
        saveGame();
    });

    return {
        init: init,
        showScreen: showScreen,
        startEncounter: startEncounter,
        endBattle: endBattle,
        saveGame: saveGame,
        loadSavedGame: loadSavedGame,
        showStats: showStats,
        calculateAccuracy: calculateAccuracy,
        STATE: STATE
    };
})();
