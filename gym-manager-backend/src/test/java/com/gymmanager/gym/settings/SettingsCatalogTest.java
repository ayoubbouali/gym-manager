package com.gymmanager.gym.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsCatalogTest {

    private static SettingDef def(String key) {
        return SettingsCatalog.find(key).orElseThrow();
    }

    private static String error(String key, String value) {
        return SettingsCatalog.validate(def(key), value);
    }

    @Test
    @DisplayName("Onglet Brevo config : groupe, clés et valeurs par défaut")
    void mailGroup() {
        assertThat(SettingsCatalog.GROUPS).containsEntry("mail", "Brevo config");
        assertThat(SettingsCatalog.ALL.stream().filter(d -> d.group().equals("mail")).map(SettingDef::key))
                .containsExactly("mail.from", "mail.brevo.apiKey", "mail.smtp.host", "mail.smtp.port", "mail.smtp.security",
                        "mail.reset.subject", "mail.reset.template");
        assertThat(def("mail.from").defaultValue()).isEmpty();
        assertThat(def("mail.brevo.apiKey").defaultValue()).isEmpty();
        assertThat(def("mail.brevo.apiKey").type()).isEqualTo("secret");
        assertThat(def("mail.smtp.host").defaultValue()).isEqualTo("smtp-relay.brevo.com");
        assertThat(def("mail.smtp.port").defaultValue()).isEqualTo("587");
        assertThat(def("mail.smtp.security").defaultValue()).isEqualTo("STARTTLS");
        assertThat(def("mail.smtp.security").options()).extracting(SettingDef.Option::value).containsExactly("NONE", "STARTTLS", "SSL");
    }

    @Test
    @DisplayName("Modèle « mot de passe oublié » : texte d'origine par défaut, {mot_de_passe} obligatoire")
    void resetTemplate() {
        assertThat(def("mail.reset.subject").defaultValue()).isEqualTo("Gym Manager : votre mot de passe provisoire");
        assertThat(def("mail.reset.template").type()).isEqualTo("template");
        assertThat(def("mail.reset.template").defaultValue())
                .startsWith("Bonjour {identifiant},\n\nUne demande de réinitialisation du mot de passe a été faite pour votre compte Gym Manager.")
                .contains("Mot de passe provisoire : {mot_de_passe}")
                .contains("pendant {duree} minutes. À la connexion, vous devrez choisir");
        assertThat(error("mail.reset.template", def("mail.reset.template").defaultValue())).isNull();
        assertThat(error("mail.reset.template", "Bonjour {identifiant}")).contains("{mot_de_passe}");
        assertThat(error("mail.reset.template", "")).contains("obligatoire");
        assertThat(error("mail.reset.subject", " ")).contains("obligatoire");
        assertThat(error("mail.reset.subject", "{club} : {mot_de_passe}")).contains("ne doit pas contenir");
        assertThat(error("mail.reset.subject", "{club} : accès provisoire")).isNull();
    }

    @Test
    @DisplayName("Expéditeur : facultatif, format e-mail vérifié")
    void email() {
        assertThat(error("mail.from", "")).isNull();
        assertThat(error("mail.from", " club@gym.test ")).isNull();
        assertThat(error("mail.from", "abc")).contains("adresse e-mail valide");
        assertThat(error("mail.from", "a b@gym.test")).isNotNull();
    }

    @Test
    @DisplayName("Serveur SMTP : obligatoire, nom d'hôte valide")
    void host() {
        assertThat(error("mail.smtp.host", "smtp-relay.brevo.com")).isNull();
        assertThat(error("mail.smtp.host", "localhost")).isNull();
        assertThat(error("mail.smtp.host", "")).contains("obligatoire");
        assertThat(error("mail.smtp.host", "smtp gym")).contains("nom de serveur valide");
        assertThat(error("mail.smtp.host", "-smtp.gym")).isNotNull();
        assertThat(error("mail.smtp.host", "smtp..gym")).isNotNull();
        assertThat(error("mail.smtp.host", "smtp://gym")).isNotNull();
    }

    @Test
    @DisplayName("Port SMTP : entier entre 1 et 65535")
    void port() {
        assertThat(error("mail.smtp.port", "1")).isNull();
        assertThat(error("mail.smtp.port", "65535")).isNull();
        assertThat(error("mail.smtp.port", "0")).contains("entre 1 et 65535");
        assertThat(error("mail.smtp.port", "70000")).contains("entre 1 et 65535");
        assertThat(error("mail.smtp.port", "abc")).contains("nombre entier");
    }

    @Test
    @DisplayName("Clé API : sans espace, et le message d'erreur ne reprend jamais la valeur")
    void secret() {
        assertThat(error("mail.brevo.apiKey", "xkeysib-abc")).isNull();
        assertThat(error("mail.brevo.apiKey", "xkeysib abc")).isNotNull().doesNotContain("xkeysib");
    }
}
