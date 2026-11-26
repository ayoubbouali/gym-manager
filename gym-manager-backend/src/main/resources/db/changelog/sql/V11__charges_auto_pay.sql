--liquibase formatted sql

--changeset alisport:V11__charges_auto_pay
-- V11 — a permanent charge may be settled automatically every month with a fixed amount (direct debit, rent…).
-- auto_paid_until: last month settled automatically, so a payment deleted by hand is never recreated.

ALTER TABLE charges ADD COLUMN auto_pay BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE charges ADD COLUMN auto_method VARCHAR(20);
ALTER TABLE charges ADD COLUMN auto_paid_until VARCHAR(7);

ALTER TABLE charges DROP CONSTRAINT ck_charges_type;
ALTER TABLE charges ADD CONSTRAINT ck_charges_type CHECK (
    (permanent AND period IS NULL AND start_period IS NOT NULL
        AND (NOT auto_pay OR (amount IS NOT NULL AND auto_method IS NOT NULL))
        AND (auto_pay OR amount IS NULL))
    OR (NOT permanent AND period IS NOT NULL AND start_period IS NULL AND end_period IS NULL AND NOT auto_pay));
