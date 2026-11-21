package com.gymmanager.gym.settings;

import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.SettingDef.Option;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/** Every business constant with its default value (specification, section 6). */
public final class SettingsCatalog {

    private SettingsCatalog() {
    }

    public static final Map<String, String> GROUPS = new LinkedHashMap<>();
    public static final List<String> CODE_ENTITIES = List.of("member", "sport", "pack", "discount", "activity", "staff");
    public static final List<SettingDef> ALL;
    public static final String MAIL_API_KEY = "mail.brevo.apiKey";
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    private static final Pattern HOST = Pattern.compile("(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*");

    static {
        GROUPS.put("club", "Club");
        GROUPS.put("regional", "Régional");
        GROUPS.put("codes", "Codes");
        GROUPS.put("subscription", "Abonnement");
        GROUPS.put("alerts", "Alertes");
        GROUPS.put("salary", "Salaire");
        GROUPS.put("documents", "Reçus");
        GROUPS.put("display", "Affichage");
        GROUPS.put("mail", "Brevo config");

        List<SettingDef> l = new ArrayList<>();
        l.add(SettingDef.required("club.name", "club", "string", "Nom du club", "Gym Manager"));
        l.add(SettingDef.of("club.address", "club", "string", "Adresse", ""));
        l.add(SettingDef.of("club.phone", "club", "string", "Téléphone", ""));

        l.add(SettingDef.required("regional.currency", "regional", "string", "Devise (symbole affiché)", "DH"));
        l.add(SettingDef.required("regional.timezone", "regional", "timezone", "Fuseau horaire", "Africa/Casablanca"));
        l.add(SettingDef.required("regional.dialCode", "regional", "digits", "Indicatif téléphonique international", "212"));
        l.add(SettingDef.required("regional.phoneRegex", "regional", "regex", "Format de téléphone local (expression régulière)", "^0[5-7]\\d{8}$"));

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

        l.add(SettingDef.required("salary.share", "salary", "share", "Part du CA reversée au coach (mode commission)", "1/3"));
        l.add(SettingDef.integer("salary.startDay", "salary", "Jour de début de la fenêtre de calcul", "1", 1, 31));
        l.add(SettingDef.integer("salary.endDay", "salary", "Jour de fin de la fenêtre de calcul", "23", 1, 31));
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
        ALL = List.copyOf(l);
    }

    public static boolean isSecret(SettingDef d) {
        return "secret".equals(d.type());
    }

    public static Optional<SettingDef> find(String key) {
        return ALL.stream().filter(d -> d.key().equals(key)).findFirst();
    }

    /** Returns null when valid, otherwise a French error message. Also used by the UI. */
    public static String validate(SettingDef d, String raw) {
        String v = raw == null ? "" : raw.trim();
        String name = "« " + d.label() + " »";
        if (d.required() && v.isEmpty()) return name + " est obligatoire.";
        if (v.length() > 1000) return name + " est trop long.";
        switch (d.type()) {
            case "digits":
                return v.matches("\\d{1,4}") ? null : name + " doit contenir de 1 à 4 chiffres.";
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
            case "regex":
                try {
                    Pattern.compile(v);
                    return null;
                } catch (PatternSyntaxException e) {
                    return name + " n'est pas une expression régulière valide.";
                }
            case "timezone":
                try {
                    ZoneId.of(v);
                    return null;
                } catch (Exception e) {
                    return "Fuseau horaire inconnu : " + v;
                }
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
