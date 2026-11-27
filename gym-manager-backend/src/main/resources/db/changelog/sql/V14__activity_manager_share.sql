--liquibase formatted sql

--changeset alisport:V14__activity_manager_share
-- V14 — the manager of a paying activity earns a percentage of its revenue (price × registered members), paid with
-- the salary of the activity's month. Internal staff (club owners) earn none: their percentage stays null.
-- salary_payments.activity_share freezes that part once the month is paid (null = none, older payments).

ALTER TABLE activities ADD COLUMN manager_percent NUMERIC(5, 2) CHECK (manager_percent BETWEEN 0 AND 100);
ALTER TABLE salary_payments ADD COLUMN activity_share NUMERIC(12, 2);

UPDATE activities a SET manager_percent = 50
WHERE a.price > 0 AND EXISTS (SELECT 1 FROM staff s WHERE s.id = a.manager_id AND NOT s.internal);
