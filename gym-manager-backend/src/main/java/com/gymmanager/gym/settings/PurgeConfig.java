package com.gymmanager.gym.settings;

import com.gymmanager.gym.rules.Rules;

/** Paramètres › Suppression auto: whether the nightly purge runs, and its rule settings (RG-PURGE). */
public record PurgeConfig(boolean enabled, Rules.PurgeSettings rule) {
}
