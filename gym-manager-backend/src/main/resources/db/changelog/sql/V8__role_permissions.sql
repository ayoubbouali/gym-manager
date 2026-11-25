--liquibase formatted sql

--changeset alisport:V8__role_permissions
-- V8 — a role grants a set of permissions (menu pages + two write rights) instead of one of two access levels.
-- Existing roles keep exactly their rights: ADMIN gets everything, ACCUEIL the pages it could already open.

CREATE TABLE user_role_permissions (
    role_id    BIGINT NOT NULL REFERENCES user_roles (id) ON DELETE CASCADE,
    permission VARCHAR(30) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

INSERT INTO user_role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM user_roles r
CROSS JOIN (VALUES ('MEMBERS'), ('MEMBER_CARD'), ('PACKS'), ('DISCOUNTS'), ('SPORTS'), ('ACTIVITIES'), ('STAFF'),
                   ('PAYROLL'), ('PAYMENTS'), ('ALERTS'), ('STATS'), ('SETTINGS'), ('EDIT_REFERENTIALS'),
                   ('MANAGE_PAYMENTS')) AS p (permission)
WHERE r.access_level = 'ADMIN';

INSERT INTO user_role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM user_roles r
CROSS JOIN (VALUES ('MEMBERS'), ('MEMBER_CARD'), ('PACKS'), ('DISCOUNTS'), ('SPORTS'), ('ACTIVITIES'), ('PAYMENTS'),
                   ('ALERTS')) AS p (permission)
WHERE r.access_level = 'ACCUEIL';

ALTER TABLE user_roles DROP COLUMN access_level;
