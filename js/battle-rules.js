/**
 * MathMon battle rules — pure functions (no Phaser / DOM access).
 *
 * Damage math, type effectiveness, MP bookkeeping and status effects are kept
 * here so they can be reasoned about (and tested) independently of the
 * animation code in phaser-game.js. All numbers come from MathMonBattleConfig.
 */
const MathMonBattleRules = (function createBattleRules(config) {
    'use strict';

    /** Return 'strong' | 'weak' | 'neutral' for an attacker → defender matchup. */
    function getMatchup(attackerElement, defenderElement) {
        const attacker = config.elements[attackerElement];
        const defender = config.elements[defenderElement];
        if (!attacker || !defender || attackerElement === defenderElement) return 'neutral';
        if (attacker.beats === defenderElement) return 'strong';
        if (defender.beats === attackerElement) return 'weak';
        return 'neutral';
    }

    function getEffectiveness(attackerElement, defenderElement) {
        const matchup = getMatchup(attackerElement, defenderElement);
        return { matchup, ...config.effectiveness[matchup] };
    }

    function randomSpread(rng) {
        const v = config.damage.variance;
        return 1 - v + rng() * v * 2;
    }

    function createStatusState() {
        return { burn: null, weaken: null, vulnerable: null, stun: null, shield: null };
    }

    /** Full action definition for an element, merging generic cost/power with element naming. */
    function getAction(element, actionKey) {
        const base = config.actions[actionKey];
        const skill = (config.elements[element] || config.elements.fire).skills[actionKey] || {};
        return { key: actionKey, ...base, ...skill, element };
    }

    /** Actions with affordability flags for the command menu. */
    function getActionMenu(element, mp) {
        return config.actionOrder.map((key) => {
            const action = getAction(element, key);
            const affordable = key === 'ultimate' ? mp >= config.mp.max : mp >= action.cost;
            return { ...action, affordable };
        });
    }

    function clampMp(mp) {
        return Math.max(0, Math.min(config.mp.max, Math.round(mp)));
    }

    /** MP after spending on an action (ultimate resets to 0; normal attack generates MP). */
    function mpAfterAction(mp, action) {
        if (action.resetsMp) return 0;
        return clampMp(mp - action.cost + (action.mpGain || 0));
    }

    /**
     * Player → enemy damage.
     * @param {object} p
     * @param {number} p.level             player level
     * @param {object} p.action            from getAction()
     * @param {string} p.attackerElement
     * @param {string} p.defenderElement
     * @param {number} p.turnMultiplier    question-gate modifier (fast bonus / lenient penalty)
     * @param {object} p.enemyStatus       status state of the defender
     * @param {function} [p.rng]
     */
    function calcPlayerDamage(p) {
        const rng = p.rng || Math.random;
        const eff = getEffectiveness(p.attackerElement, p.defenderElement);
        const base = config.damage.playerBase + p.level * config.damage.playerPerLevel;
        let multiplier = p.action.power * eff.multiplier * (p.turnMultiplier || 1);

        const vulnerable = p.enemyStatus && p.enemyStatus.vulnerable;
        if (vulnerable) multiplier *= vulnerable.multiplier;

        let crit = false;
        const effect = p.action.effect;
        if (p.fastCrit) {
            // a fast correct answer guarantees a critical hit
            crit = true;
            multiplier *= config.questionGate.fastCritMultiplier;
        } else if (effect && effect.type === 'crit' && rng() < effect.chance) {
            crit = true;
            multiplier *= effect.multiplier;
        }

        const amount = Math.max(config.damage.minimum, Math.round(base * multiplier * randomSpread(rng)));
        return { amount, effectiveness: eff, crit };
    }

    /** Enemy → player damage, honouring weaken (on enemy) and shield (on player). */
    function calcEnemyDamage(p) {
        const rng = p.rng || Math.random;
        const eff = config.enemy.usesElements
            ? getEffectiveness(p.attackerElement, p.defenderElement)
            : { matchup: 'neutral', ...config.effectiveness.neutral };
        let amount = config.enemy.damageBase + Math.floor(p.level * config.enemy.damagePerLevel);
        if (p.mode === 'gym') amount *= config.enemy.gymDamageMultiplier;
        amount *= eff.multiplier;
        if (p.enemyStatus && p.enemyStatus.weaken) amount *= p.enemyStatus.weaken.multiplier;
        if (p.playerStatus && p.playerStatus.shield) amount *= p.playerStatus.shield.multiplier;
        amount = Math.max(config.damage.minimum, Math.round(amount * randomSpread(rng)));
        return { amount, effectiveness: eff };
    }

    /**
     * Apply an action's secondary effect after it lands.
     * Returns a description of what happened for the battle log / VFX.
     */
    function applyEffect(effect, ctx) {
        if (!effect) return null;
        const rng = ctx.rng || Math.random;
        if (effect.chance !== undefined && effect.type !== 'crit' && rng() >= effect.chance) return null;
        switch (effect.type) {
            case 'burn':
                ctx.enemyStatus.burn = { turns: effect.turns, percent: effect.percent };
                return { type: 'burn', target: 'enemy', text: 'is burning!' };
            case 'weaken':
                ctx.enemyStatus.weaken = { turns: effect.turns, multiplier: effect.multiplier };
                return { type: 'weaken', target: 'enemy', text: 'is slowed!' };
            case 'vulnerable':
                ctx.enemyStatus.vulnerable = { turns: effect.turns, multiplier: effect.multiplier };
                return { type: 'vulnerable', target: 'enemy', text: 'is shredded!' };
            case 'stun':
                ctx.enemyStatus.stun = { turns: 1 };
                return { type: 'stun', target: 'enemy', text: 'is stunned!' };
            case 'shield':
                ctx.playerStatus.shield = { turns: effect.turns, multiplier: effect.multiplier };
                return { type: 'shield', target: 'player', text: 'raised a stone shield!' };
            case 'heal': {
                const heal = Math.max(1, Math.round(ctx.damageDealt * effect.percent));
                return { type: 'heal', target: 'player', amount: heal, text: `recovered ${heal} HP!` };
            }
            default:
                return null;
        }
    }

    /** Count down timed statuses; called once per full round. */
    function tickStatuses(status) {
        ['burn', 'weaken', 'vulnerable', 'shield'].forEach((key) => {
            if (status[key]) {
                status[key].turns--;
                if (status[key].turns <= 0) status[key] = null;
            }
        });
    }

    /** Short chip labels for the HUD. */
    function describeStatuses(status) {
        const chips = [];
        if (status.burn) chips.push({ key: 'burn', label: `Burn ${status.burn.turns}` });
        if (status.weaken) chips.push({ key: 'weaken', label: `Slow ${status.weaken.turns}` });
        if (status.vulnerable) chips.push({ key: 'vulnerable', label: `Shred ${status.vulnerable.turns}` });
        if (status.stun) chips.push({ key: 'stun', label: 'Stun' });
        if (status.shield) chips.push({ key: 'shield', label: `Shield ${status.shield.turns}` });
        return chips;
    }

    function getEnemyMaxHp(level, mode) {
        let hp = config.enemy.hpBase + (level - 1) * config.enemy.hpPerLevel;
        if (mode === 'gym') hp *= config.enemy.gymHpMultiplier;
        if (mode === 'training') hp *= config.enemy.trainingHpMultiplier;
        return Math.round(hp);
    }

    function getPlayerMaxHp(level) {
        return config.player.hpBase + level * config.player.hpPerLevel;
    }

    /**
     * Question-gate damage modifier for this attack.
     * Correct: 1 + combo bonus (comboStep per consecutive correct answer after the
     * first, capped). Wrong: lenient multiplier, or 0 (attack fails) in strict mode.
     */
    function getTurnMultiplier(correct, combo) {
        const gate = config.questionGate;
        if (!correct) return gate.rule === 'lenient' ? gate.wrongAnswerDamageMultiplier : 0;
        return 1 + getComboBonus(combo);
    }

    function getComboBonus(combo) {
        const gate = config.questionGate;
        return Math.min(gate.maxComboBonus, Math.max(0, (combo || 1) - 1) * gate.comboStep);
    }

    /** True when an answer was fast enough for a critical hit. */
    function isFastAnswer(responseSeconds) {
        return responseSeconds <= config.questionGate.fastAnswerSeconds;
    }

    /** Difficulty tier ('easy' | 'medium' | 'hard') a move asks for. */
    function getActionTier(actionKey) {
        return config.questionGate.actionTier[actionKey] || 'easy';
    }

    return {
        getMatchup,
        getEffectiveness,
        getAction,
        getActionMenu,
        mpAfterAction,
        clampMp,
        calcPlayerDamage,
        calcEnemyDamage,
        applyEffect,
        tickStatuses,
        describeStatuses,
        createStatusState,
        getEnemyMaxHp,
        getPlayerMaxHp,
        getTurnMultiplier,
        getComboBonus,
        isFastAnswer,
        getActionTier
    };
})(typeof MathMonBattleConfig !== 'undefined' ? MathMonBattleConfig : require('./battle-config.js'));

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonBattleRules;
}
