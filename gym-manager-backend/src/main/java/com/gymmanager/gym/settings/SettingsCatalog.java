package com.gymmanager.gym.settings;

import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.SettingDef.Option;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** Every business constant with its default value (specification, section 6). */
public final class SettingsCatalog {

    private SettingsCatalog() {
    }

    public static final Map<String, String> GROUPS = new LinkedHashMap<>();
    public static final List<String> CODE_ENTITIES = List.of("member", "sport", "pack", "discount", "activity", "staff");
    public static final List<SettingDef> ALL;
    public static final String MAIL_API_KEY = "mail.brevo.apiKey";
    public static final String RESET_SUBJECT = "mail.reset.subject";
    public static final String RESET_TEMPLATE = "mail.reset.template";
    public static final String RESET_PASSWORD_VARIABLE = "{mot_de_passe}";
    public static final String CLUB_PHONE = "club.phone";
    public static final String COUNTRY = "regional.country";
    public static final String CITY = "regional.city";
    public static final String CURRENCY_CODE = "regional.currencyCode";
    public static final String CURRENCY_SYMBOL = "regional.currency";
    /** Former settings, replaced by the country and city: only read to migrate an existing database or backup. */
    public static final String LEGACY_TIMEZONE = "regional.timezone";
    public static final String LEGACY_DIAL_CODE = "regional.dialCode";
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    private static final Pattern HOST = Pattern.compile("(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*");

    static {
        GROUPS.put("club", "Club");
        GROUPS.put("regional", "Régional");
        GROUPS.put("codes", "Codes");
        GROUPS.put("subscription", "Abonnement");
        GROUPS.put("alerts", "Alertes");
        GROUPS.put("purge", "Suppression auto");
        GROUPS.put("salary", "Salaire");
        GROUPS.put("documents", "Reçus");
        GROUPS.put("display", "Affichage");
        GROUPS.put("mail", "Brevo config");

        List<SettingDef> l = new ArrayList<>();
        l.add(SettingDef.required("club.name", "club", "string", "Nom du club", "Gym Manager"));
        l.add(SettingDef.of("club.address", "club", "string", "Adresse", ""));
        l.add(SettingDef.of(CLUB_PHONE, "club", "phone", "Téléphone", ""));

        l.add(SettingDef.required(COUNTRY, "regional", "country", "Pays", "MA"));
        l.add(SettingDef.of(CITY, "regional", "city", "Ville", ""));
        l.add(SettingDef.required(CURRENCY_CODE, "regional", "currency", "Devise", "MAD"));
        l.add(SettingDef.required(CURRENCY_SYMBOL, "regional", "readonly", "Symbole affiché", "DH"));

        String[][] codes = {{"member", "Adhérent", "A", "3"}, {"sport", "Sport", "SP", "2"}, {"pack", "Pack", "PK", "2"},
                {"discount", "Remise", "R", "2"}, {"activity", "Activité", "AC", "2"}, {"staff", "Personnel", "E", "3"}};
        for (String[] c : codes) {
            l.add(SettingDef.required("codes." + c[0] + ".prefix", "codes", "prefix", "Préfixe — " + c[1], c[2]));
            l.add(SettingDef.integer("codes." + c[0] + ".digits", "codes", "Chiffres — " + c[1], c[3], 1, 8));
        }

        l.add(new SettingDef("subscription.cumulative", "subscription", "bool", "Cumuler la remise du pack et celle de l'adhérent", "true", true, null, null, List.of()));
        l.add(SettingDef.choice("subscription.rounding", "subscription", "Arrondi des prix", "2",
                new Option("2", "2 décimales"), new Option("0", "Unité")));

        l.add(SettingDef.integer("alerts.soonDays", "alerts", "Seuil « Expire bientôt » (jours)", "7", 0, 365));
        l.add(SettingDef.integer("alerts.followDays", "alerts", "Seuil « À suivre » (jours)", "30", 0, 365));
        l.add(SettingDef.required("alerts.expiredTemplate", "alerts", "template", "Modèle de message « expiré »",
                "Bonjour {prenom} {nom}, votre abonnement a expiré il y a {jours} jour(s). Passez au club pour le renouveler."));
        l.add(SettingDef.required("alerts.soonTemplate", "alerts", "template", "Modèle de message « bientôt »",
                "Bonjour {prenom} {nom}, votre abonnement se termine dans {jours} jour(s). Pensez à le renouveler."));

        l.add(new SettingDef("purge.enabled", "purge", "bool", "Supprimer automatiquement les adhérents (chaque nuit)", "true", true, null, null, List.of()));
        l.add(SettingDef.integer("purge.months", "purge", "Délai avant suppression", "3", 1, 60));
        l.add(new SettingDef("purge.inactive", "purge", "bool", "Adhérents désactivés (depuis leur désactivation)", "true", true, null, null, List.of()));
        l.add(new SettingDef("purge.expired", "purge", "bool", "Adhérents expirés (depuis la fin de leur abonnement)", "true", true, null, null, List.of()));
        l.add(new SettingDef("purge.noSubscription", "purge", "bool", "Adhérents sans abonnement (depuis la suppression de leur dernière période)", "true", true, null, null, List.of()));

        l.add(SettingDef.required("salary.share", "salary", "share", "Part du CA reversée au coach (mode commission)", "1/3"));
        l.add(SettingDef.integer("salary.cutoffDay", "salary",
                "Jour limite d'inscription : inscrit ce jour ou après, l'adhérent compte à partir du mois suivant", "25", 1, 31));
        l.add(SettingDef.choice("salary.multiCoach", "salary", "Si plusieurs coachs encadrent un sport", "FULL",
                new Option("FULL", "Chacun touche la part entière"), new Option("SPLIT", "Partage à parts égales")));

        l.add(SettingDef.required("documents.receiptPrefix", "documents", "prefix", "Préfixe des reçus de paiement", "REC"));
        l.add(SettingDef.required("documents.payslipPrefix", "documents", "prefix", "Préfixe des reçus de salaire", "SAL"));
        l.add(SettingDef.of("documents.footer", "documents", "string", "Mention en pied de reçu", "Merci de votre confiance."));

        l.add(SettingDef.choice("display.pageSize", "display", "Lignes par page", "20",
                new Option("10", "10"), new Option("20", "20"), new Option("50", "50"), new Option("100", "100")));

        // Blank from/key fall back to MAIL_FROM / BREVO_API_KEY. SMTP values are stored only: sending uses the Brevo HTTP API.
        l.add(SettingDef.of("mail.from", "mail", "email", "Adresse de l'expéditeur", ""));
        l.add(SettingDef.of(MAIL_API_KEY, "mail", "secret", "Clé API Brevo", ""));
        l.add(SettingDef.required("mail.smtp.host", "mail", "host", "Serveur SMTP", "smtp-relay.brevo.com"));
        l.add(SettingDef.integer("mail.smtp.port", "mail", "Port SMTP", "587", 1, 65535));
        l.add(SettingDef.choice("mail.smtp.security", "mail", "Connexion", "STARTTLS",
                new Option("NONE", "Aucune"), new Option("STARTTLS", "STARTTLS"), new Option("SSL", "SSL/TLS")));
        l.add(SettingDef.required(RESET_SUBJECT, "mail", "string", "Objet de l'e-mail « mot de passe oublié »",
                "Gym Manager : votre mot de passe provisoire"));
        l.add(SettingDef.required(RESET_TEMPLATE, "mail", "template", "Modèle de l'e-mail « mot de passe oublié »", """
                Bonjour {identifiant},

                Une demande de réinitialisation du mot de passe a été faite pour votre compte Gym Manager.

                Mot de passe provisoire : {mot_de_passe}

                Il permet de vous connecter pendant {duree} minutes. À la connexion, \
                vous devrez choisir un nouveau mot de passe.
                Votre mot de passe actuel reste valable tant que vous n'utilisez pas le mot de passe provisoire.

                Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
                """));
        ALL = List.copyOf(l);
    }

    public static boolean isSecret(SettingDef d) {
        return "secret".equals(d.type());
    }

    public static Optional<SettingDef> find(String key) {
        return ALL.stream().filter(d -> d.key().equals(key)).findFirst();
    }

    /**
     * Returns null when valid, otherwise a French error message. Also used by the UI. A city depends on the country
     * and a phone on its field's country: both are checked by {@link SettingsService#update}.
     */
    public static String validate(SettingDef d, String raw) {
        String v = raw == null ? "" : raw.trim();
        String name = "« " + d.label() + " »";
        if (d.required() && v.isEmpty()) return name + " est obligatoire.";
        if (v.length() > 1000) return name + " est trop long.";
        // without the temporary password the reset email is useless
        if (d.key().equals(RESET_TEMPLATE) && !v.contains(RESET_PASSWORD_VARIABLE))
            return name + " doit contenir la variable " + RESET_PASSWORD_VARIABLE + ".";
        // subjects show up in notification previews and mail logs
        if (d.key().equals(RESET_SUBJECT) && v.contains(RESET_PASSWORD_VARIABLE))
            return name + " ne doit pas contenir le mot de passe provisoire " + RESET_PASSWORD_VARIABLE + ".";
        switch (d.type()) {
            case "currency":
                return RegionalCatalog.isCurrency(v) ? null : name + " : code de devise ISO 4217 inconnu (" + v + ").";
            case "country":
                return RegionalCatalog.isCountry(v) ? null : name + " : pays inconnu (" + v + ").";
            case "prefix":
                return v.matches("[A-Za-z]{1,5}") ? null : name + " : 1 à 5 lettres.";
            case "int": {
                if (!v.matches("-?\\d{1,6}")) return name + " doit être un nombre entier.";
                int n = Integer.parseInt(v);
                return n < d.min() || n > d.max() ? name + " doit être entre " + d.min() + " et " + d.max() + "." : null;
            }
            case "bool":
                return v.equals("true") || v.equals("false") ? null : name + " : valeur invalide.";
            case "enum":
                return d.options().stream().anyMatch(o -> o.value().equals(v)) ? null : name + " : valeur invalide.";
            case "email":
                return v.isEmpty() || EMAIL.matcher(v).matches() ? null : name + " n'est pas une adresse e-mail valide.";
            case "host":
                return HOST.matcher(v).matches() ? null : name + " n'est pas un nom de serveur valide.";
            case "secret":
                return v.isEmpty() || v.matches("\\S+") ? null : name + " ne doit pas contenir d'espace.";
            case "share":
                return Rules.parseShare(v) == null ? name + " : saisir une fraction (1/3) ou un pourcentage entre 0 et 100." : null;
            default:
                return null;
        }
    }

    /** Normalizes a valid value before storage. */
    public static String normalize(SettingDef d, String raw) {
        String v = raw == null ? "" : raw;
        return switch (d.type()) {
            case "template" -> v;
            case "prefix" -> v.trim().toUpperCase();
            case "int" -> String.valueOf(Integer.parseInt(v.trim()));
            default -> v.trim();
        };
    }
}
