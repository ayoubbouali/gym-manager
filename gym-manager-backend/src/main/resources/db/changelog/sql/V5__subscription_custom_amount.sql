--liquibase formatted sql

--changeset alisport:V5__subscription_custom_amount
-- Price typed by hand in the member form: it replaces the pack price and any discount for that period.
ALTER TABLE subscriptions ADD COLUMN custom_amount NUMERIC(12, 2) NULL CHECK (custom_amount >= 0);
