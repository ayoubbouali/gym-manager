package com.gymmanager.gym.settings;

import java.util.List;

/**
 * Definition of a setting: key, group (tab), type, label, default value.
 * Types: string, template, digits, prefix, int, bool, enum, regex, timezone, share, email, host,
 * secret (write-only: never returned by the API, an empty value keeps the stored one).
 */
public record SettingDef(String key, String group, String type, String label, String defaultValue,
                         boolean required, Integer min, Integer max, List<Option> options) {

    public record Option(String value, String label) {
    }

    static SettingDef of(String key, String group, String type, String label, String def) {
        return new SettingDef(key, group, type, label, def, false, null, null, List.of());
    }

    static SettingDef required(String key, String group, String type, String label, String def) {
        return new SettingDef(key, group, type, label, def, true, null, null, List.of());
    }

    static SettingDef integer(String key, String group, String label, String def, int min, int max) {
        return new SettingDef(key, group, "int", label, def, true, min, max, List.of());
    }

    static SettingDef choice(String key, String group, String label, String def, Option... options) {
        return new SettingDef(key, group, "enum", label, def, true, null, null, List.of(options));
    }
}
