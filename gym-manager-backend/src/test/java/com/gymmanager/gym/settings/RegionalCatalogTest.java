package com.gymmanager.gym.settings;

import com.gymmanager.gym.settings.RegionalCatalog.CountryOption;
import com.gymmanager.gym.settings.RegionalCatalog.CurrencyOption;
import com.gymmanager.gym.settings.RegionalCatalog.PhoneCountry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class RegionalCatalogTest {

    @Test
    @DisplayName("Pays : tous les codes ISO 3166, nom français, indicatif, devise et fuseau officiel")
    void countries() {
        assertThat(RegionalCatalog.OPTIONS.countries()).extracting(CountryOption::code)
                .contains("MA", "FR", "US").doesNotHaveDuplicates().hasSizeGreaterThan(230);
        // without a dial code, the club's phones could not be validated
        assertThat(RegionalCatalog.OPTIONS.countries()).extracting(CountryOption::code).doesNotContain("AQ", "BV", "GS", "HM", "PN", "TF", "UM");
        assertThat(RegionalCatalog.isCountry("AQ")).isFalse();
        CountryOption ma = RegionalCatalog.country("MA");
        assertThat(ma.label()).isEqualTo("Maroc");
        assertThat(ma.dialCode()).isEqualTo("212");
        assertThat(ma.currencyCode()).isEqualTo("MAD");
        assertThat(ma.timezone()).isEqualTo("Africa/Casablanca");
        assertThat(ma.example()).isEqualTo("06 50 12 34 56");
        assertThat(RegionalCatalog.country("FR").currencyCode()).isEqualTo("EUR");
        // multi-zone countries: the capital's zone, not the first one of zone.tab
        assertThat(RegionalCatalog.country("US").timezone()).isEqualTo("America/New_York");
        assertThat(RegionalCatalog.country("CA").timezone()).isEqualTo("America/Toronto");
        assertThat(RegionalCatalog.country("RU").timezone()).isEqualTo("Europe/Moscow");
        assertThat(RegionalCatalog.country("BR").timezone()).isEqualTo("America/Sao_Paulo");
        assertThat(RegionalCatalog.country("AU").timezone()).isEqualTo("Australia/Sydney");
        assertThat(RegionalCatalog.OPTIONS.countries()).allSatisfy(c -> assertThat(ZoneId.of(c.timezone())).isNotNull());
        assertThat(RegionalCatalog.isCountry("XX")).isFalse();
        assertThat(RegionalCatalog.isCountry(null)).isFalse();
    }

    @Test
    @DisplayName("Pays principal d'un indicatif partagé : US pour +1, MA pour +212")
    void primaryCountry() {
        assertThat(RegionalCatalog.country("US").primary()).isTrue();
        assertThat(RegionalCatalog.country("CA").primary()).isFalse();
        assertThat(RegionalCatalog.country("MA").primary()).isTrue();
        assertThat(RegionalCatalog.country("EH").primary()).isFalse();
        assertThat(RegionalCatalog.PHONE_COUNTRIES).extracting(PhoneCountry::code).contains("MA", "FR").doesNotContain("AQ");
    }

    @Test
    @DisplayName("Villes : par pays, la plus peuplée d'abord, avec leur fuseau")
    void cities() {
        assertThat(RegionalCatalog.cities("MA")).startsWith("Casablanca").contains("Rabat", "Marrakesh").doesNotHaveDuplicates();
        assertThat(RegionalCatalog.cities("XX")).isEmpty();
        assertThat(RegionalCatalog.isCity("MA", "Casablanca")).isTrue();
        assertThat(RegionalCatalog.isCity("FR", "Casablanca")).isFalse();
        assertThat(RegionalCatalog.isCity("MA", "")).isFalse();
    }

    @Test
    @DisplayName("Fuseau : celui de la ville si choisie, sinon le fuseau officiel du pays")
    void timezone() {
        assertThat(RegionalCatalog.timezone("MA", "")).isEqualTo(ZoneId.of("Africa/Casablanca"));
        assertThat(RegionalCatalog.timezone("US", "Los Angeles")).isEqualTo(ZoneId.of("America/Los_Angeles"));
        assertThat(RegionalCatalog.timezone("US", null)).isEqualTo(ZoneId.of("America/New_York"));
        // a city of another country is ignored
        assertThat(RegionalCatalog.timezone("US", "Casablanca")).isEqualTo(ZoneId.of("America/New_York"));
        assertThat(RegionalCatalog.timezone("XX", null)).isEqualTo(ZoneId.of("UTC"));
        assertThat(RegionalCatalog.dialCode("MA")).isEqualTo("212");
        assertThat(RegionalCatalog.dialCode("US")).isEqualTo("1");
    }

    @Test
    @DisplayName("Migration : pays déduit de l'ancien fuseau (zone.tab) ou de l'ancien indicatif")
    void migration() {
        assertThat(RegionalCatalog.countryOfTimezone("Europe/Paris")).isEqualTo("FR");
        assertThat(RegionalCatalog.countryOfTimezone("America/Toronto")).isEqualTo("CA");
        assertThat(RegionalCatalog.countryOfTimezone("UTC")).isNull();
        assertThat(RegionalCatalog.countryOfDialCode("33")).isEqualTo("FR");
        assertThat(RegionalCatalog.countryOfDialCode("1")).isEqualTo("US");
        assertThat(RegionalCatalog.countryOfDialCode("999")).isNull();
        assertThat(RegionalCatalog.cityInZone("US", "America/Los_Angeles")).isEqualTo("Los Angeles");
        assertThat(RegionalCatalog.cityInZone("FR", "Mars/Base")).isNull();
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
        assertThat(RegionalCatalog.currencySymbol("EUR")).isEqualTo("€");
    }

    @Test
    @DisplayName("Exemple de numéro mobile au format national")
    void phoneExample() {
        assertThat(RegionalCatalog.phoneExample("MA")).isEqualTo("06 50 12 34 56");
        assertThat(RegionalCatalog.phoneExample("FR")).startsWith("06");
        assertThat(RegionalCatalog.phoneExample("XX")).isEmpty();
        assertThat(RegionalCatalog.phoneCountryLabel("FR")).isEqualTo("France (+33)");
    }

    @Test
    @DisplayName("Téléphone : format national en chiffres seuls, international accepté seulement avec l'indicatif du pays")
    void normalizePhone() {
        assertThat(RegionalCatalog.normalizePhone("06 12-34.56 78", "MA")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("+212 6 12 34 56 78", "MA")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("00212612345678", "MA")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("0522123456", "MA")).isEqualTo("0522123456");
        assertThat(RegionalCatalog.normalizePhone("0812", "MA")).isNull();
        // ranges missing from libphonenumber's metadata are still Moroccan mobiles
        assertThat(RegionalCatalog.normalizePhone("07 40 12 34 56", "MA")).isEqualTo("0740123456");
        assertThat(RegionalCatalog.normalizePhone("+212 790123456", "MA")).isEqualTo("0790123456");
        assertThat(RegionalCatalog.normalizePhone("00212799999999", "MA")).isEqualTo("0799999999");
        assertThat(RegionalCatalog.normalizePhone("0712345678", "MA")).isEqualTo("0712345678");
        assertThat(RegionalCatalog.normalizePhone("074012345", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("+21274012345678", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("07401234567", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0840123456", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0700000000", "FR")).isNull();
        assertThat(RegionalCatalog.normalizePhone("+33612345678", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("06CALLME", "MA")).isNull();
        assertThat(RegionalCatalog.normalizePhone("0612345678", "FR")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("+33 6 12 34 56 78", "FR")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.normalizePhone("0612345678", "XX")).isNull();
    }

    @Test
    @DisplayName("Stockage : national pour le pays du club, E.164 pour un autre pays")
    void phoneForStorage() {
        assertThat(RegionalCatalog.phoneForStorage("06 12 34 56 78", "MA", "MA")).isEqualTo("0612345678");
        assertThat(RegionalCatalog.phoneForStorage("06 12 34 56 78", "FR", "MA")).isEqualTo("+33612345678");
        assertThat(RegionalCatalog.phoneForStorage("07 40 12 34 56", "MA", "FR")).isEqualTo("+212740123456");
        assertThat(RegionalCatalog.phoneForStorage("0812", "FR", "MA")).isNull();
    }
}
