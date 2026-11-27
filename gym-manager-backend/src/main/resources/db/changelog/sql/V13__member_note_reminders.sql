--liquibase formatted sql

--changeset alisport:V13__member_note_reminders
-- V13 — reminder of the members' notes left untreated: a note is recalled from the day after it was written,
-- until it is treated (cleared) or postponed (recalled again from notes_remind_on).
-- Notes written before this version have no date: they count as old.

ALTER TABLE members ADD COLUMN notes_updated_on DATE;
ALTER TABLE members ADD COLUMN notes_remind_on DATE;
