package com.gymmanager.gym.settings;

import com.gymmanager.gym.settings.RegionalCatalog.CurrencyOption;
import com.gymmanager.gym.settings.RegionalCatalog.DialCodeOption;
import com.gymmanager.gym.settings.RegionalCatalog.TimezoneOption;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RegionalCatalogTest {

    private static String dialCodeOf(String zone) {
        return RegionalCatalog.OPTIONS.timezones().stream().filter(z -> z.id().equals(zone)).findFirst().orElseThrow().dialCode();
    }

    @Test
    @DisplayName("Fuseau → indicatif : Europe/Paris → 33, America/Toronto → 1, UTC et Etc/GMT+1 sans indicatif")
    void timezoneDialCode() {
        assertThat(dialCodeOf("Europe/Paris")).isEqualTo("33");
        assertThat(dialCodeOf("Africa/Casablanca")).isEqualTo("212");
        assertThat(dialCodeOf("America/Toronto")).isEqualTo("1");
        assertThat(dialCodeOf("America/New_York")).isEqualTo("1");
        assertThat(dialCodeOf("UTC")).isNull();
        assertThat(dialCodeOf("Etc/GMT+1")).isNull();
    }

    @Test
    @DisplayName("Fuseaux : forme Région/Ville plus UTC, sans alias hérités (US/…, SystemV/…)")
    void timezoneList() {
        assertThat(RegionalCatalog.OPTIONS.timezones()).extracting(TimezoneOption::id)
                .contains("UTC", "Europe/Paris", "Africa/Casablanca", "America/Argentina/Buenos_Aires", "Europe/Kyiv", "Etc/GMT+1")
                .doesNotContain("Europe/Kiev", "Asia/Calcutta")
                .noneMatch(id -> id.startsWith("US/") || id.startsWith("SystemV/") || id.startsWith("Canada/"))
                .doesNotHaveDuplicates();
        assertThat(RegionalCatalog.isTimezone("Mars/Base")).isFalse();
    }

    @Test
    @DisplayName("Devises ISO 4217 en circulation : libellé et symbole français, triées par code")
    void currencies() {
        assertThat(RegionalCatalog.OPTIONS.currencies()).extracting(CurrencyOption::code)
                .contains("MAD", "EUR", "USD", "XOF").doesNotContain("XYZ").isSorted().doesNotHaveDuplicates();
        assertThat(RegionalCatalog.OPTIONS.currencies()).filteredOn(c -> c.code().equals("EUR"))
                .singleElement().satisfies(c -> {
                    assertThat(c.symbol()).isEqualTo("€");
                    assertThat(c.label()).isEqualTo("euro");
                });
        assertThat(RegionalCatalog.isCurrency("XYZ")).isFalse();
    }

    @Test
    @DisplayName("Indicatifs : pays principal en français, sans code non géographique")
    void dialCodes() {
        assertThat(RegionalCatalog.OPTIONS.dialCodes()).filteredOn(d -> d.code().equals("212"))
                .singleElement().extracting(DialCodeOption::label).isEqualTo("Maroc");
        assertThat(RegionalCatalog.OPTIONS.dialCodes()).filteredOn(d -> d.code().equals("33"))
                .singleElement().extracting(DialCodeOption::label).isEqualTo("France");
        assertThat(RegionalCatalog.isDialCode("1")).isTrue();
        assertThat(RegionalCatalog.isDialCode("800")).isFalse();
        assertThat(RegionalCatalog.isDialCode("999")).isFalse();
    }

    @Test
    @DisplayName("Exemple de numéro mobile au format national")
    void phoneExample() {
        assertThat(RegionalCatalog.phoneExample("212")).isEqualTo("06 50 12 34 56");
        assertThat(RegionalCatalog.phoneExample("33")).startsWith("06");
        assertThat(RegionalCatalog.phoneExample("999")).isEmpty();
    }

    @Test
    @DisplayName("Téléphone : format national en chiffres seuls, international accepté seulement avec l'indicatif du club")
    void normalizePhone() {
        assertThat(RegionalCatalog.normalizePhone("06 12-34.56 78", "212")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("+212 6 12 34 56 78", "212")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("00212612345678", "212")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("0522123456", "212")).isEqualTo("0522123456");
        assertThat(RegionalCatalog.normalizePhone("0812", "212")).isNull();
        // ranges missing from libphonenumber's metadata are still Moroccan mobiles
        assertThat(RegionalCatalog.normalizePhone("07 40 12 34 56", "212")).isEqualTo("0740123456");
        assertThat(RegionalCatalog.normalizePhone("+212 790123456", "212")).isEqualTo("0790123456");
        assertThat(RegionalCatalog.normalizePhone("00212799999999", "212")).isEqualTo("0799999999");
        assertThat(RegionalCatalog.normalizePhone("0712345678", "212")).isEqualTo("0712345678");
        assertThat(RegionalCatalog.normalizePhone("074012345", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("+21274012345678", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("07401234567", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0840123456", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0700000000", "33")).isNull();
        assertThat(RegionalCatalog.normalizePhone("+33612345678", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("06CALLME", "212")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0612345678", "33")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("+33 6 12 34 56 78", "33")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("0612345678", "999")).isNull();
    }
}
