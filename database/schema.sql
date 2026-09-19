-- ============================================================
-- MathMon Database Schema
-- MySQL 8.0+
-- ============================================================
--
-- This schema stores all player data, game progress, performance
-- records, and ML classification results for the MathMon RPG.
--
-- Tables:
--   players          -> Player profiles and trainer information
--   player_sessions  -> Login/session tracking
--   battles          -> Battle records (encounters and outcomes)
--   attempts         -> Individual question attempts
--   question_bank    -> All available math questions
--   monster_roster   -> Game monsters (bosses and encounters)
--   ml_classifications -> ML model predictions and recommendations
--   performance_summary -> Cached aggregated stats per player
--
-- ============================================================

-- ------------------------------------------------------------
-- Database creation
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS mathmon CHARACTER SET utf8mb6 COLLATE utf8mb4_unicode_ci;
USE mathmon;

-- ------------------------------------------------------------
-- TABLE: players
-- Stores player profiles and overall progress
-- ------------------------------------------------------------
CREATE TABLE players (
    player_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid           VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
    username       VARCHAR(50)  NOT NULL,
    display_name   VARCHAR(100) NOT NULL,
    gender         ENUM('male', 'female') DEFAULT 'male',
    avatar         VARCHAR(50)  DEFAULT '🧑',
    email          VARCHAR(255) UNIQUE,
    password_hash  VARCHAR(255),
    level          INT          NOT NULL DEFAULT 1,
    xp             INT          NOT NULL DEFAULT 0,
    score          INT          NOT NULL DEFAULT 0,
    total_battles  INT          NOT NULL DEFAULT 0,
    battles_won    INT          NOT NULL DEFAULT 0,
    battles_lost   INT          NOT NULL DEFAULT 0,
    accuracy       DECIMAL(5,2) DEFAULT 100.00,
    total_attempts INT          NOT NULL DEFAULT 0,
    correct_answers INT         NOT NULL DEFAULT 0,
    incorrect_answers INT       NOT NULL DEFAULT 0,
    total_response_time DECIMAL(10,2) DEFAULT 0.00,
    current_streak  INT NOT NULL DEFAULT 0,
    longest_streak  INT NOT NULL DEFAULT 0,
    ml_classification VARCHAR(50),
    last_active    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id),
    INDEX idx_username (username),
    INDEX idx_level (level),
    INDEX idx_score (score),
    INDEX idx_ml_class (ml_classification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: player_sessions
-- Tracks login activity and session duration
-- ------------------------------------------------------------
CREATE TABLE player_sessions (
    session_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id     INT UNSIGNED NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    login_time    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time   TIMESTAMP NULL,
    ip_address    VARCHAR(45),
    user_agent    TEXT,
    is_mobile     BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (session_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    INDEX idx_player_session (player_id, login_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: levels
-- XP thresholds for each trainer level
-- ------------------------------------------------------------
CREATE TABLE levels (
    level_num   INT UNSIGNED NOT NULL,
    xp_required INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (level_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb6;

-- Seed level data (mirrors the XP_PER_LEVEL array from the JS/Python code)
INSERT INTO levels (level_num, xp_required) VALUES
(1,    0),
(2,    100),
(3,    250),
(4,    450),
(5,    700),
(6,    1000),
(7,    1400),
(8,    1900),
(9,    2500),
(10,   3200),
(11,   4000),
(12,   4900),
(13,   6000),
(14,   7200),
(15,   8500),
(16,   10000);

-- ------------------------------------------------------------
-- TABLE: monster_roster
-- Stores all monster/enemy data used in battles
-- ------------------------------------------------------------
CREATE TABLE monster_roster (
    monster_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(100) NOT NULL,
    type          ENUM('addition', 'subtraction', 'multiplication', 'division') NOT NULL,
    level         INT NOT NULL DEFAULT 1,
    max_hp        INT NOT NULL DEFAULT 30,
    attack        INT NOT NULL DEFAULT 8,
    defense       INT NOT NULL DEFAULT 5,
    sprite        VARCHAR(50),
    color         VARCHAR(7) DEFAULT '#FFFFFF',
    description   TEXT,
    rarity        ENUM('common', 'uncommon', 'rare', 'epic', 'legendary') DEFAULT 'common',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (monster_id),
    UNIQUE KEY uk_name_type (name, type),
    INDEX idx_type_level (type, level),
    INDEX idx_rarity (rarity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: battles
-- Records each battle encounter and its outcome
-- ------------------------------------------------------------
CREATE TABLE battles (
    battle_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id       INT UNSIGNED NOT NULL,
    monster_id      INT UNSIGNED,
    monster_name    VARCHAR(100),
    opponent_level  INT DEFAULT 1,
    opponent_max_hp INT DEFAULT 30,
    opponent_category ENUM('addition', 'subtraction', 'multiplication', 'division'),
    player_won      BOOLEAN NOT NULL DEFAULT FALSE,
    player_hp_start INT DEFAULT 0,
    player_hp_end   INT DEFAULT 0,
    turns_taken     INT DEFAULT 0,
    questions_answered INT DEFAULT 0,
    questions_correct INT DEFAULT 0,
    questions_wrong   INT DEFAULT 0,
    xp_earned       INT DEFAULT 0,
    score_earned    INT DEFAULT 0,
    battle_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT DEFAULT 0,
    PRIMARY KEY (battle_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    FOREIGN KEY (monster_id) REFERENCES monster_roster(monster_id) ON DELETE SET NULL,
    INDEX idx_battle_player (player_id, battle_timestamp),
    INDEX idx_battle_won (player_won),
    INDEX idx_battle_category (opponent_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: question_bank
-- Stores all math questions (pre-generated pool)
-- ------------------------------------------------------------
CREATE TABLE question_bank (
    question_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    category        ENUM('addition', 'subtraction', 'multiplication', 'division') NOT NULL,
    difficulty      INT NOT NULL DEFAULT 1,
    question_text   TEXT NOT NULL,
    answer          DECIMAL(10,4) NOT NULL,
    hint            TEXT,
    operand_count   INT DEFAULT 2,
    operands_json   JSON,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id),
    INDEX idx_cat_diff (category, difficulty),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: attempts
-- Stores every individual question attempt by every player
-- ------------------------------------------------------------
CREATE TABLE attempts (
    attempt_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id         INT UNSIGNED NOT NULL,
    battle_id         INT UNSIGNED,
    question_id       INT UNSIGNED,
    category          ENUM('addition', 'subtraction', 'multiplication', 'division') NOT NULL,
    difficulty        INT NOT NULL DEFAULT 1,
    question_text     TEXT,
    answer_given      DECIMAL(10,4),
    correct_answer    DECIMAL(10,4),
    is_correct        BOOLEAN NOT NULL,
    response_time     DECIMAL(8,3) NOT NULL DEFAULT 0.000,
    attempt_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_level     INT DEFAULT 1,
    PRIMARY KEY (attempt_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    FOREIGN KEY (battle_id) REFERENCES battles(battle_id) ON DELETE SET NULL,
    FOREIGN KEY (question_id) REFERENCES question_bank(question_id) ON DELETE SET NULL,
    INDEX idx_player_category (player_id, category),
    INDEX idx_attempts_correct (is_correct),
    INDEX idx_response_time (response_time),
    INDEX idx_attempt_timestamp (attempt_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: ml_classifications
-- Stores ML model predictions and recommendations
-- ------------------------------------------------------------
CREATE TABLE ml_classifications (
    classification_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id         INT UNSIGNED NOT NULL,
    battle_id         INT UNSIGNED,
    classification    ENUM('Needs Practice', 'Developing', 'Proficient') NOT NULL,
    confidence        DECIMAL(5,2) NOT NULL,
    features_json     JSON,
    recommendation_text TEXT,
    model_version     VARCHAR(50) DEFAULT '1.0.0',
    classified_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (classification_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    FOREIGN KEY (battle_id) REFERENCES battles(battle_id) ON DELETE SET NULL,
    INDEX idx_player_classified (player_id, classified_at),
    INDEX idx_classification (classification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- TABLE: performance_summary
-- Cached aggregated stats per player per topic (for fast queries)
-- ------------------------------------------------------------
CREATE TABLE performance_summary (
    summary_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id        INT UNSIGNED NOT NULL,
    topic            ENUM('addition', 'subtraction', 'multiplication', 'division') NOT NULL,
    total_attempts   INT NOT NULL DEFAULT 0,
    correct_count    INT NOT NULL DEFAULT 0,
    incorrect_count  INT NOT NULL DEFAULT 0,
    accuracy         DECIMAL(5,2) DEFAULT 100.00,
    avg_response_time DECIMAL(8,3),
    total_time_spent DECIMAL(10,2) DEFAULT 0.00,
    last_updated     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (summary_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    UNIQUE KEY uk_player_topic (player_id, topic),
    INDEX idx_player_topic (player_id, topic)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb6_unicode_ci;

-- ------------------------------------------------------------
-- VIEWS
-- ------------------------------------------------------------

-- View: player_leaderboard
-- Top players by score
CREATE VIEW player_leaderboard
AS
SELECT
    p.player_id,
    p.username,
    p.display_name,
    p.level,
    p.score,
    p.accuracy,
    p.total_battles,
    p.battles_won,
    CASE
        WHEN p.total_battles > 0 THEN
            ROUND(p.battles_won / p.total_battles * 100, 2)
        ELSE 100
    END AS win_rate,
    p.ml_classification
FROM players p
WHERE p.total_battles > 0
ORDER BY p.score DESC
LIMIT 100;

-- View: topic_performance
-- Aggregated performance by math topic across all players
CREATE VIEW topic_performance AS
SELECT
    ps.topic,
    COUNT(DISTINCT ps.player_id) AS players_attempted,
    SUM(ps.total_attempts) AS total_attempts,
    SUM(ps.correct_count) AS total_correct,
    SUM(ps.incorrect_count) AS total_incorrect,
    ROUND(SUM(ps.correct_count) / SUM(ps.total_attempts) * 100, 2) AS overall_accuracy,
    ROUND(AVG(ps.avg_response_time), 2) AS avg_response_time
FROM performance_summary ps
GROUP BY ps.topic;

-- View: recent_battles
-- Last 50 battles across all players
CREATE VIEW recent_battles AS
SELECT
    b.battle_id,
    p.username,
    b.monster_name,
    b.opponent_category,
    b.player_won,
    b.xp_earned,
    b.score_earned,
    b.battle_timestamp,
    TIMESTAMPDIFF(SECOND, b.battle_timestamp, NOW()) AS seconds_ago
FROM battles b
JOIN players p ON b.player_id = p.player_id
ORDER BY b.battle_timestamp DESC
LIMIT 50;

-- ------------------------------------------------------------
-- STORED PROCEDURES
-- ------------------------------------------------------------

-- Procedure: GetPlayerDashboard
-- Returns a comprehensive player dashboard with stats, recent battles, and ML status
DELIMITER //

CREATE PROCEDURE GetPlayerDashboard(IN p_player_id INT UNSIGNED)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_ml_class VARCHAR(50);
    DECLARE v_total_attempts INT;
    DECLARE v_accuracy DECIMAL(5,2);

    SELECT ml_classification, total_attempts, accuracy
    INTO v_ml_class, v_total_attempts, v_accuracy
    FROM players
    WHERE player_id = p_player_id;

    SELECT
        p.player_id,
        p.username,
        p.display_name,
        p.gender,
        p.level,
        p.xp,
        (SELECT l.xp_required FROM levels l WHERE l.level_num = p.level + 1) AS xp_next_level,
        p.score,
        p.accuracy,
        p.total_battles,
        p.battles_won,
        p.battles_lost,
        p.ml_classification
    FROM players p
    WHERE p.player_id = p_player_id;

    SELECT
        ps.topic,
        ps.total_attempts,
        ps.correct_count,
        ps.incorrect_count,
        ps.accuracy,
        ps.avg_response_time
    FROM performance_summary ps
    WHERE ps.player_id = p_player_id
    ORDER BY ps.topic;

    SELECT
        b.battle_id,
        b.monster_name,
        b.opponent_category,
        b.player_won,
        b.xp_earned,
        b.score_earned,
        b.battle_timestamp,
        b.questions_correct,
        b.questions_wrong
    FROM battles b
    WHERE b.player_id = p_player_id
    ORDER BY b.battle_timestamp DESC
    LIMIT 10;

    SELECT
        mc.classification,
        mc.confidence,
        mc.recommendation_text,
        mc.classified_at
    FROM ml_classifications mc
    WHERE mc.player_id = p_player_id
    ORDER BY mc.classified_at DESC
    LIMIT 1;
END //

-- Procedure: RecordBattleAndAttempts
-- Helper to record a complete battle with its attempts in one transaction
CREATE PROCEDURE RecordBattleAndAttempts(
    IN p_player_id       INT UNSIGNED,
    IN p_monster_name    VARCHAR(100),
    IN p_opponent_category ENUM('addition', 'subtraction', 'multiplication', 'division'),
    IN p_opponent_level  INT,
    IN p_player_won      BOOLEAN,
    IN p_xp_earned       INT,
    IN p_score_earned    INT,
    IN p_turns           INT
)
MODIFIES SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_battle_id INT UNSIGNED;

    INSERT INTO battles (
        player_id, monster_name, opponent_category, opponent_level,
        player_won, xp_earned, score_earned, turns_taken
    ) VALUES (
        p_player_id, p_monster_name, p_opponent_category, p_opponent_level,
        p_player_won, p_xp_earned, p_score_earned, p_turns
    );

    SET v_battle_id = LAST_INSERT_ID();

    -- Update player aggregate stats
    UPDATE players
    SET
        total_battles = total_battles + 1,
        battles_won = battles_won + IF(p_player_won, 1, 0),
        battles_lost = battles_lost + IF(p_player_won, 0, 1),
        xp = xp + p_xp_earned,
        score = score + p_score_earned
    WHERE player_id = p_player_id;

    SELECT v_battle_id AS battle_id;
END //

DELIMITER ;

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

-- Trigger: update_player_accuracy
-- Updates the player's overall accuracy after each attempt
DELIMITER //

CREATE TRIGGER update_player_accuracy
AFTER INSERT ON attempts
FOR EACH ROW
BEGIN
    DECLARE v_correct INT DEFAULT 0;
    DECLARE v_total INT DEFAULT 0;

    SELECT
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),
        COUNT(*)
    INTO v_correct, v_total
    FROM attempts
    WHERE player_id = NEW.player_id;

    UPDATE players
    SET
        total_attempts = v_total,
        correct_answers = v_correct,
        incorrect_answers = v_total - v_correct,
        accuracy = CASE
            WHEN v_total > 0 THEN ROUND(v_correct / v_total * 100, 2)
            ELSE 100.00
        END,
        total_response_time = (
            SELECT COALESCE(SUM(response_time), 0)
            FROM attempts
            WHERE player_id = NEW.player_id
        )
    WHERE player_id = NEW.player_id;
END //

-- Trigger: update_performance_summary_on_attempt
-- Updates the cached per-topic performance summary
CREATE TRIGGER update_performance_summary_on_attempt
AFTER INSERT ON attempts
FOR EACH ROW
BEGIN
    DECLARE v_correct INT DEFAULT 0;
    DECLARE v_total INT DEFAULT 0;
    DECLARE v_avg_rt DECIMAL(8,3);

    SELECT
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),
        COUNT(*),
        AVG(response_time)
    INTO v_correct, v_total, v_avg_rt
    FROM attempts
    WHERE player_id = NEW.player_id
      AND category = NEW.category;

    INSERT INTO performance_summary (
        player_id, topic, total_attempts, correct_count, incorrect_count,
        accuracy, avg_response_time, total_time_spent
    ) VALUES (
        NEW.player_id, NEW.category, v_total, v_correct,
        v_total - v_correct,
        CASE WHEN v_total > 0 THEN ROUND(v_correct / v_total * 100, 2) ELSE 100.00 END,
        v_avg_rt,
        (SELECT COALESCE(SUM(response_time), 0)
         FROM attempts
         WHERE player_id = NEW.player_id AND category = NEW.category)
    )
    ON DUPLICATE KEY UPDATE
        total_attempts = v_total,
        correct_count = v_correct,
        incorrect_count = v_total - v_correct,
        accuracy = CASE WHEN v_total > 0 THEN ROUND(v_correct / v_total * 100, 2) ELSE 100.00 END,
        avg_response_time = v_avg_rt,
        total_time_spent = (SELECT COALESCE(SUM(response_time), 0)
                           FROM attempts
                           WHERE player_id = NEW.player_id AND category = NEW.category),
        last_updated = CURRENT_TIMESTAMP;
END //

DELIMITER ;
