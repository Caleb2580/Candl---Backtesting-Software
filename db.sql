CREATE DATABASE TRADE;

USE TRADE;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    balance DECIMAL(10, 2) NOT NULL DEFAULT 1000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resets INT NOT NULL DEFAULT 0,
    hidden BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE checkpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    buy_sell INT NOT NULL DEFAULT 1,
    buy_or_sell INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(ID) ON DELETE CASCADE
);

CREATE TABLE last_ticker_days (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticker VARCHAR(255) NOT NULL,
    day INT NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

----

ALTER TABLE checkpoints ADD COLUMN buy_sell INT NOT NULL DEFAULT 1;
UPDATE checkpoints SET buy_sell=1;

----

ALTER TABLE users ADD COLUMN resets INT NOT NULL DEFAULT 0;


ALTER TABLE checkpoints DROP FOREIGN KEY checkpoints_ibfk_1; -- Drop the existing foreign key constraint
ALTER TABLE checkpoints ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; -- Add the foreign key with ON DELETE CASCADE


ALTER TABLE users ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT 0;
UPDATE users SET hidden=0;


------------------------
DROP TRIGGER IF EXISTS enforce_last_ticker_days_limit;



DELIMITER //

CREATE PROCEDURE insert_last_ticker_days(
    IN p_ticker VARCHAR(10),
    IN p_day INT,
    IN p_month INT,
    IN p_year INT,
    IN p_user_id INT
)
BEGIN
    -- Insert the new record
    INSERT INTO last_ticker_days (ticker, day, month, year, user_id)
    VALUES (p_ticker, p_day, p_month, p_year, p_user_id);

    -- Delete the oldest record if the user has more than 200 records
    DELETE FROM last_ticker_days
    WHERE id IN (
        SELECT id FROM (
            SELECT id FROM last_ticker_days
            WHERE user_id = p_user_id
            ORDER BY id ASC
            LIMIT 1 OFFSET 199
        ) AS subquery
    );
END;
//

DELIMITER ;

