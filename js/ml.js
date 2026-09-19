/**
 * MathMon ML Module - Client-side Machine Learning Classification
 *
 * This module mirrors the Python scikit-learn model. It classifies a player's
 * performance into one of three categories:
 *   - Needs Practice (class 0)
 *   - Developing (class 1)
 *   - Proficient (class 2)
 *
 * The classification uses the same features as the Python model:
 *   accuracy, correct_answers, incorrect_answers, response_time, topic, difficulty
 *
 * A lightweight decision-tree approximation is used for the browser, while the
 * full scikit-learn RandomForest model lives in python/ml_model.py.
 */

const ML_CATEGORIES = {
    NEEDS_PRACTICE: { label: "Needs Practice", color: "#FF4757", colorClass: "needs-practice" },
    DEVELOPING:      { label: "Developing",      color: "#FFD93D", colorClass: "developing" },
    PROFICIENT:       { label: "Proficient",     color: "#6BCF7F", colorClass: "proficient" }
};

const MATH_TOPICS = ['addition', 'subtraction', 'multiplication', 'division'];

/**
 * Extract features from player stats for ML classification.
 * Mirrors the feature vector used by the Python model.
 */
function extractFeatures(playerStats) {
    const accuracy = playerStats.totalAttempts > 0
        ? (playerStats.correctAnswers / playerStats.totalAttempts) * 100
        : 0;

    const avgResponseTime = playerStats.totalAttempts > 0
        ? playerStats.totalResponseTime / playerStats.totalAttempts
        : 10;

    const correctnessRatio = playerStats.totalAttempts > 0
        ? playerStats.correctAnswers / playerStats.totalAttempts
        : 0;

    const errorRate = playerStats.totalAttempts > 0
        ? playerStats.incorrectAnswers / playerStats.totalAttempts
        : 0;

    const attemptsPerTopic = {};
    const accuracyPerTopic = {};
    MATH_TOPICS.forEach(topic => {
        const ts = playerStats.topicStats[topic] || { attempts: 0, correct: 0, accuracy: 0 };
        attemptsPerTopic[topic] = ts.attempts;
        accuracyPerTopic[topic] = ts.attempts > 0 ? ts.correct / ts.attempts : 0;
    });

    const avgTopicAccuracy = MATH_TOPICS.reduce((sum, t) => sum + (accuracyPerTopic[t] || 0), 0) / MATH_TOPICS.length;

    const topicVariance = MATH_TOPICS.reduce((sum, t) => {
        const diff = (accuracyPerTopic[t] || 0) - avgTopicAccuracy;
        return sum + diff * diff;
    }, 0) / MATH_TOPICS.length;

    return {
        accuracy: round(accuracy, 2),
        correctAnswers: playerStats.correctAnswers,
        incorrectAnswers: playerStats.incorrectAnswers,
        totalAttempts: playerStats.totalAttempts,
        avgResponseTime: round(avgResponseTime, 2),
        correctnessRatio: round(correctnessRatio, 2),
        errorRate: round(errorRate, 2),
        avgTopicAccuracy: round(avgTopicAccuracy * 100, 2),
        topicVariance: round(topicVariance, 4),
        weakestTopic: getWeakestTopic(accuracyPerTopic),
        strongestTopic: getStrongestTopic(accuracyPerTopic),
        currentLevel: playerStats.level,
        difficulty: getDifficultyForLevel(playerStats.level)
    };
}

function getWeakestTopic(accuracyPerTopic) {
    let weakest = MATH_TOPICS[0];
    let minAccuracy = 1;
    MATH_TOPICS.forEach(topic => {
        const acc = accuracyPerTopic[topic] || 0;
        if (acc < minAccuracy) {
            minAccuracy = acc;
            weakest = topic;
        }
    });
    return weakest;
}

function getStrongestTopic(accuracyPerTopic) {
    let strongest = MATH_TOPICS[0];
    let maxAccuracy = -1;
    MATH_TOPICS.forEach(topic => {
        const acc = accuracyPerTopic[topic] || 0;
        if (acc > maxAccuracy) {
            maxAccuracy = acc;
            strongest = topic;
        }
    });
    return strongest;
}

function getDifficultyForLevel(level) {
    if (level <= 2) return 1;
    if (level <= 4) return 2;
    if (level <= 6) return 3;
    if (level <= 8) return 4;
    if (level <= 10) return 5;
    if (level <= 14) return 6;
    if (level <= 18) return 7;
    if (level <= 25) return 8;
    if (level <= 35) return 9;
    return 10;
}

function round(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Classify player performance using a decision-tree approximation
 * of the scikit-learn RandomForest model.
 *
 * Decision logic (mirroring python/ml_model.py):
 *   1. If totalAttempts < 5, default to "Needs Practice" (insufficient data)
 *   2. If accuracy >= 80 AND avgTopicAccuracy >= 75 AND errorRate <= 0.25 → "Proficient"
 *   3. Else if accuracy >= 50 → "Developing"
 *   4. Else → "Needs Practice"
 */
function classifyPerformance(playerStats) {
    const features = extractFeatures(playerStats);

    if (features.totalAttempts < 5) {
        return {
            category: ML_CATEGORIES.NEEDS_PRACTICE,
            confidence: 30,
            features: features,
            reason: "Insufficient data — keep playing to get a more accurate assessment!"
        };
    }

    const { accuracy, avgTopicAccuracy, errorRate, correctnessRatio } = features;

    if (accuracy >= 80 && avgTopicAccuracy >= 75 && errorRate <= 0.25) {
        return {
            category: ML_CATEGORIES.PROFICIENT,
            confidence: Math.round(85 + (accuracy - 80) * 1.2),
            features: features,
            reason: `Excellent work! Your accuracy of ${accuracy}% puts you in the proficient range.`
        };
    } else if (accuracy >= 50) {
        return {
            category: ML_CATEGORIES.DEVELOPING,
            confidence: Math.round(70 + (accuracy - 50) * 0.8),
            features: features,
            reason: `Good progress! Keep practicing to reach proficient levels.`
        };
    } else {
        return {
            category: ML_CATEGORIES.NEEDS_PRACTICE,
            confidence: Math.round(80 - accuracy),
            features: features,
            reason: `Accuracy is ${accuracy}%. Focus on targeted practice to improve.`
        };
    }
}

/**
 * Generate personalized recommendations based on the ML classification
 * and per-topic performance.
 */
function generateRecommendations(playerStats) {
    const classification = classifyPerformance(playerStats);
    const features = classification.features;
    const recommendations = [];

    const topicStats = playerStats.topicStats || {};
    const weakTopics = [];
    const strongTopics = [];

    MATH_TOPICS.forEach(topic => {
        const ts = topicStats[topic];
        if (ts && ts.attempts > 0) {
            // Derive accuracy from the raw counts so it stays correct even when
            // the stored ts.accuracy field has not been maintained.
            const topicAccuracy = (ts.correct / ts.attempts) * 100;
            if (topicAccuracy < 60) {
                weakTopics.push(topic);
            } else if (topicAccuracy >= 80) {
                strongTopics.push(topic);
            }
        }
    });

    switch (classification.category.label) {
        case "Needs Practice":
            recommendations.push("💡 Focus on additional practice with topics you're struggling in.");
            if (weakTopics.length > 0) {
                recommendations.push(`🔴 Target weak areas: ${weakTopics.map(t => capitalize(t)).join(', ')}.`);
            } else {
                recommendations.push(`🔴 Start with ${capitalize(features.weakestTopic)} problems.`);
            }
            recommendations.push("🔄 Review basic concepts before attempting harder questions.");
            recommendations.push("⏰ Slow down and double-check your calculations.");
            break;

        case "Developing":
            recommendations.push("📈 You're on the right track! Consistent practice will help you improve.");
            if (weakTopics.length > 0) {
                recommendations.push(`🟡 Work on: ${weakTopics.map(t => capitalize(t)).join(', ')}.`);
            }
            if (features.avgResponseTime > 15) {
                recommendations.push("⏱ Try to improve your response time with more practice.");
            }
            recommendations.push("🔧 Consider reviewing mixed-topic battles to build versatility.");
            break;

        case "Proficient":
            recommendations.push("🎉 Excellent performance! You've mastered the fundamentals.");
            recommendations.push("🚀 Take on more challenging difficulty levels.");
            recommendations.push("🏆 Try mixed-category battles for an extra challenge.");
            if (strongTopics.length > 0) {
                recommendations.push(`🌟 Your strong areas: ${strongTopics.map(t => capitalize(t)).join(', ')}.`);
            }
            break;
    }

    return {
        classification: classification,
        recommendations: recommendations,
        weakTopics: weakTopics,
        strongTopics: strongTopics
    };
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const MathML = {
    ML_CATEGORIES: ML_CATEGORIES,
    MATH_TOPICS: MATH_TOPICS,
    extractFeatures: extractFeatures,
    classifyPerformance: classifyPerformance,
    generateRecommendations: generateRecommendations,
    getDifficultyForLevel: getDifficultyForLevel
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathML;
}
