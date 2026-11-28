--liquibase formatted sql

--changeset alisport:V15__staff_photo
-- V15 — optional photo of a staff member, like the members' (file name in the uploads directory).

ALTER TABLE staff ADD COLUMN photo VARCHAR(255);
