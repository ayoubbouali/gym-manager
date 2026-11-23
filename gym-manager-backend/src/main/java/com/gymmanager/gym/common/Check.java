package com.gymmanager.gym.common;

import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.RegionalCatalog;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Objects;
import java.util.function.Function;

/** Server-side validation helpers producing French messages. */
public final class Check {
    private Check() {
    }

    public static String text(String value, String field, String label, int max, boolean required) {
        String v = value == null ? "" : value.trim();
        if (required && v.isEmpty()) throw ApiException.invalid(field, "Le champ « " + label + " » est obligatoire.");
        if (v.length() > max) throw ApiException.invalid(field, "Le champ « " + label + " » ne doit pas dépasser " + max + " caractères.");
        return v;
    }

    public static <T> T required(T value, String field, String label) {
        if (value == null) throw ApiException.invalid(field, "Le champ « " + label + " » est obligatoire.");
        return value;
    }

    public static BigDecimal amount(BigDecimal value, String field, String label) {
        required(value, field, label);
        if (value.signum() < 0) throw ApiException.invalid(field, "« " + label + " » doit être positif ou nul.");
        if (value.scale() > 2 && value.stripTrailingZeros().scale() > 2) {
            throw ApiException.invalid(field, "« " + label + " » : 2 décimales maximum.");
        }
        if (value.compareTo(new BigDecimal("9999999999")) > 0) throw ApiException.invalid(field, "« " + label + " » est trop élevé.");
        return value;
    }

    public static int range(Integer value, String field, String label, int min, int max) {
        required(value, field, label);
        if (value < min || value > max) throw ApiException.invalid(field, "« " + label + " » doit être entre " + min + " et " + max + ".");
        return value;
    }

    /**
     * Valid fixed or mobile number for {@code country} (the field's country, null = the club's one). Stored in national
     * format, digits only, for the club's country; in E.164 ("+33612345678") for any other. An unchanged stored number
     * is kept as is, never revalidated.
     */
    public static String phone(String value, String current, String country, String clubCountry, String field, boolean required) {
        String c = country == null || country.isBlank() ? clubCountry : country;
        String typed = value == null ? "" : value.replaceAll("[\\s.-]", "");
        String stored = current == null ? "" : current.replaceAll("[\\s.-]", "");
        // a national number is read with the club's country: keeping it while another country is chosen would ignore that choice
        boolean sameCountry = stored.startsWith("+") || c.equals(clubCountry);
        if (!stored.isEmpty() && typed.equals(stored) && sameCountry) return current;
        if (typed.isEmpty()) {
            if (required) throw ApiException.invalid(field, "Le champ « Téléphone » est obligatoire.");
            return "";
        }
        if (!RegionalCatalog.isCountry(c)) throw ApiException.invalid(field, "Pays du téléphone inconnu (" + c + ").");
        String normalized = RegionalCatalog.phoneForStorage(value, c, clubCountry);
        if (normalized == null) {
            String example = RegionalCatalog.phoneExample(c);
            throw ApiException.invalid(field, "Numéro de téléphone invalide pour " + RegionalCatalog.phoneCountryLabel(c)
                    + (example.isEmpty() ? "" : " (ex. : " + example + ")") + ".");
        }
        return normalized;
    }

    /** Case- and accent-insensitive uniqueness of a name among other rows. */
    public static <T> void unique(Collection<T> rows, Function<T, Long> id, Function<T, String> name, Long selfId,
                                  String value, String field, String message) {
        String key = Rules.normalize(value);
        boolean clash = rows.stream().anyMatch(r -> !Objects.equals(id.apply(r), selfId) && Rules.normalize(name.apply(r)).equals(key));
        if (clash) throw ApiException.invalid(field, message);
    }

    /** A reference must be active, unless it is already the current value (an inactive item stays on existing records). */
    public static void activeOrUnchanged(boolean active, Long newId, Long currentId, String field, String message) {
        if (!active && !Objects.equals(newId, currentId)) throw ApiException.invalid(field, message);
    }
}
