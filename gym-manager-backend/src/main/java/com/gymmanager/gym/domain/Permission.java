package com.gymmanager.gym.domain;

/**
 * What a role grants. Page permissions match the menu entries (Accueil and Mon compte are open to everyone);
 * the last two are write rights on pages that a role may only consult.
 */
public enum Permission {
    MEMBERS, MEMBER_CARD, PACKS, DISCOUNTS, SPORTS, ACTIVITIES, STAFF, PAYROLL, PAYMENTS, ALERTS, STATS, SETTINGS,
    /** Create, edit, (de)activate and delete packs, discounts, durations, sports and activities. */
    EDIT_REFERENTIALS,
    /** Correct, cancel or delete a payment, and delete a subscription period. */
    MANAGE_PAYMENTS;

    /** Spring Security authority carried by the session. */
    public String authority() {
        return "PERM_" + name();
    }
}
