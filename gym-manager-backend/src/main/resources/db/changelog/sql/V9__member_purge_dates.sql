--liquibase formatted sql

--changeset alisport:V9__member_purge_dates
-- V9 — start dates of the automatic deletion delay (RG-PURGE). Left empty here: the nightly purge sets them
-- to its own date for members already inactive or without subscription, so the delay starts at deployment.
ALTER TABLE members ADD COLUMN deactivated_on DATE;
ALTER TABLE members ADD COLUMN no_subscription_since DATE;
