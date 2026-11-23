--liquibase formatted sql

--changeset alisport:V6__salary_cutoff_day
-- RG-SALAIRE now counts every member in progress, with a registration cut-off day (salary.cutoffDay):
-- the former window settings no longer mean anything.
DELETE FROM app_settings WHERE setting_key IN ('salary.startDay', 'salary.endDay');
