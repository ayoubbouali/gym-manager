--liquibase formatted sql

--changeset alisport:V3__user_email_temp_password
-- V3 — account email and emailed temporary password ("mot de passe oublié").
-- The temporary password is stored only as a BCrypt hash; it coexists with the current
-- password until it is used or expires.

ALTER TABLE app_users ADD COLUMN email VARCHAR(254);
ALTER TABLE app_users ADD COLUMN temp_password_hash VARCHAR(100);
ALTER TABLE app_users ADD COLUMN temp_password_expires_at TIMESTAMP;
