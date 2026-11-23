package com.gymmanager.gym.settings;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberFormat;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberType;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.text.Normalizer;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Currency;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Official regional lists (ISO 4217 currencies, ISO 3166 countries, GeoNames cities with their IANA time zone) and
 * phone validation by country (libphonenumber).
 */
public final class RegionalCatalog {

    private RegionalCatalog() {
    }

    public record CurrencyOption(String code, String label, String symbol) {
    }

    /**
     * Only countries with a dial code. {@code currencyCode} and {@code example} are null or "" when unknown.
     * {@code timezone} is the official one: that of the capital. {@code primary}: main country of its dial code
     * (US for +1), used to pick a country for a stored "+1…" number.
     */
    public record CountryOption(String code, String label, String dialCode, String currencyCode, String timezone,
                                String example, boolean primary) {
    }

    /** What a phone field needs: no currency nor time zone. */
    public record PhoneCountry(String code, String label, String dialCode, String example, boolean primary) {
    }

    public record Options(List<CurrencyOption> currencies, List<CountryOption> countries) {
    }

    private record City(String name, String timezone) {
    }

    private static final PhoneNumberUtil PHONES = PhoneNumberUtil.getInstance();
    private static final Set<PhoneNumberType> ACCEPTED_TYPES = Set.of(PhoneNumberType.FIXED_LINE, PhoneNumberType.MOBILE,
            PhoneNumberType.FIXED_LINE_OR_MOBILE);
    /** Morocco: every 10-digit 05/06/07 number is accepted as is, since libphonenumber misses allocated ranges (074, 079…). */
    private static final int MOROCCO = 212;
    private static final Pattern MOROCCO_NATIONAL = Pattern.compile("0[5-7]\\d{8}");

    private static final Map<String, String> ZONE_COUNTRIES = zoneCountries();
    /** Per country, most populous first. */
    private static final Map<String, List<City>> CITIES = cities();
    public static final Options OPTIONS = new Options(currencies(), countries());
    public static final List<PhoneCountry> PHONE_COUNTRIES = OPTIONS.countries().stream()
            .map(c -> new PhoneCountry(c.code(), c.label(), c.dialCode(), c.example(), c.primary()))
            .toList();
    private static final Map<String, CurrencyOption> CURRENCIES = index(OPTIONS.currencies(), CurrencyOption::code);
    private static final Map<String, CountryOption> COUNTRIES = index(OPTIONS.countries(), CountryOption::code);

    public static boolean isCurrency(String code) {
        return code != null && CURRENCIES.containsKey(code);
    }

    /** Symbol of a currency ("€" for EUR), or null when unknown. */
    public static String currencySymbol(String code) {
        CurrencyOption c = code == null ? null : CURRENCIES.get(code);
        return c == null ? null : c.symbol();
    }

    public static boolean isCountry(String code) {
        return code != null && COUNTRIES.containsKey(code);
    }

    /** Country of the list, or null. */
    public static CountryOption country(String code) {
        return code == null ? null : COUNTRIES.get(code);
    }

    /** City names of a country, most populous first; empty for an unknown country. */
    public static List<String> cities(String country) {
        return country == null ? List.of() : CITIES.getOrDefault(country, List.of()).stream().map(City::name).toList();
    }

    public static boolean isCity(String country, String city) {
        return findCity(country, city) != null;
    }

    /** The city's zone when it belongs to the country, otherwise the country's official zone; UTC for an unknown country. */
    public static ZoneId timezone(String country, String city) {
        City c = findCity(country, city);
        if (c != null) return ZoneId.of(c.timezone());
        CountryOption o = country(country);
        return ZoneId.of(o == null ? "UTC" : o.timezone());
    }

    /** International dial code of a country ("212" for MA), or null. */
    public static String dialCode(String country) {
        CountryOption o = country(country);
        return o == null ? null : o.dialCode();
    }

    /** Country of an IANA zone according to zone.tab ("FR" for Europe/Paris), or null (UTC, Etc/…, unknown). */
    public static String countryOfTimezone(String zone) {
        return zone == null ? null : ZONE_COUNTRIES.get(zone);
    }

    /** Main country of a dial code ("US" for 1), or null for an unknown or non-geographic code. */
    public static String countryOfDialCode(String dialCode) {
        if (dialCode == null || !dialCode.matches("\\d{1,4}")) return null;
        String r = PHONES.getRegionCodeForCountryCode(Integer.parseInt(dialCode));
        return isCountry(r) ? r : null;
    }

    /** Most populous city of the country in this zone, or null: keeps a non-official zone when migrating old settings. */
    public static String cityInZone(String country, String zone) {
        return CITIES.getOrDefault(country, List.of()).stream()
                .filter(c -> c.timezone().equals(zone)).map(City::name).findFirst().orElse(null);
    }

    /** Example mobile number in national format ("06 50 12 34 56" for MA), or "" when unknown. */
    public static String phoneExample(String country) {
        if (country == null || !PHONES.getSupportedRegions().contains(country)) return "";
        PhoneNumber n = PHONES.getExampleNumberForType(country, PhoneNumberType.MOBILE);
        if (n == null) n = PHONES.getExampleNumber(country);
        return n == null ? "" : PHONES.format(n, PhoneNumberFormat.NATIONAL);
    }

    /** "France (+33)", for messages. */
    public static String phoneCountryLabel(String country) {
        CountryOption o = country(country);
        if (o == null) return country;
        return o.label() + " (+" + o.dialCode() + ")";
    }

    /**
     * National format, digits only ("0612345678"), or null when the number is not a valid fixed or mobile number of
     * this country's dial code; for +212, any 05/06/07 number of 10 digits is accepted. An international number
     * (+33…, 0033…) is accepted only with the country's own dial code.
     */
    public static String normalizePhone(String raw, String country) {
        PhoneNumber n = parsePhone(raw, country);
        return n == null ? null : national(n);
    }

    /**
     * Storage format of a valid number typed for {@code country}: national digits for the club's own country (as
     * before), E.164 ("+33612345678") for any other; null when invalid.
     */
    public static String phoneForStorage(String raw, String country, String clubCountry) {
        PhoneNumber n = parsePhone(raw, country);
        if (n == null) return null;
        return country.equals(clubCountry) ? national(n) : PHONES.format(n, PhoneNumberFormat.E164);
    }

    private static PhoneNumber parsePhone(String raw, String country) {
        String v = raw == null ? "" : raw.replaceAll("[\\s.\\-()/]", "");
        // libphonenumber would turn letters into digits (vanity numbers)
        if (country == null || !PHONES.getSupportedRegions().contains(country) || !v.matches("\\+?\\d{1,20}")) return null;
        try {
            PhoneNumber n = PHONES.parse(v, country);
            if (n.getCountryCode() != PHONES.getCountryCodeForRegion(country)) return null;
            if (isMoroccanNational(n)) return n;
            return PHONES.isValidNumber(n) && ACCEPTED_TYPES.contains(PHONES.getNumberType(n)) ? n : null;
        } catch (NumberParseException e) {
            return null;
        }
    }

    private static boolean isMoroccanNational(PhoneNumber n) {
        return n.getCountryCode() == MOROCCO && MOROCCO_NATIONAL.matcher("0" + PHONES.getNationalSignificantNumber(n)).matches();
    }

    private static String national(PhoneNumber n) {
        if (isMoroccanNational(n)) return "0" + PHONES.getNationalSignificantNumber(n);
        return PHONES.format(n, PhoneNumberFormat.NATIONAL).replaceAll("\\D", "");
    }

    private static City findCity(String country, String name) {
        if (country == null || name == null || name.isBlank()) return null;
        return CITIES.getOrDefault(country, List.of()).stream().filter(c -> c.name().equals(name)).findFirst().orElse(null);
    }

    private static List<CurrencyOption> currencies() {
        Map<String, CurrencyOption> byCode = new TreeMap<>();
        for (String country : Locale.getISOCountries()) {
            Currency c = Currency.getInstance(Locale.of("", country));
            if (c == null) continue;
            byCode.putIfAbsent(c.getCurrencyCode(),
                    new CurrencyOption(c.getCurrencyCode(), c.getDisplayName(Locale.FRENCH), c.getSymbol(Locale.FRANCE)));
        }
        return List.copyOf(byCode.values());
    }

    private static List<CountryOption> countries() {
        Map<String, String> capitals = new HashMap<>();
        read("capitals.tsv", f -> capitals.put(f[0], fold(f[1])));
        Collator collator = Collator.getInstance(Locale.FRENCH);
        List<CountryOption> list = new ArrayList<>();
        for (String code : Locale.getISOCountries()) {
            // without a dial code, no phone of the club's country could be validated (AQ, BV, GS, HM, PN, TF, UM)
            if (!PHONES.getSupportedRegions().contains(code)) continue;
            int dial = PHONES.getCountryCodeForRegion(code);
            Currency currency = Currency.getInstance(Locale.of("", code));
            String currencyCode = currency == null ? null : currency.getCurrencyCode();
            String example = phoneExample(code);
            list.add(new CountryOption(code, Locale.of("", code).getDisplayCountry(Locale.FRENCH),
                    String.valueOf(dial),
                    currencyCode, officialTimezone(code, capitals.get(code)), example,
                    code.equals(PHONES.getRegionCodeForCountryCode(dial))));
        }
        list.sort((a, b) -> collator.compare(a.label(), b.label()));
        return List.copyOf(list);
    }

    /** Zone of the capital (most populous city of that name), else of the most populous city, else zone.tab, else UTC. */
    private static String officialTimezone(String country, String capital) {
        List<City> cities = CITIES.getOrDefault(country, List.of());
        return cities.stream().filter(c -> fold(c.name()).equals(capital)).findFirst()
                .or(() -> cities.stream().findFirst())
                .map(City::timezone)
                .orElseGet(() -> ZONE_COUNTRIES.entrySet().stream().filter(e -> e.getValue().equals(country))
                        .map(Map.Entry::getKey).sorted().findFirst().orElse("UTC"));
    }

    private static Map<String, List<City>> cities() {
        Set<String> zones = ZoneId.getAvailableZoneIds();
        Map<String, List<City>> map = new LinkedHashMap<>();
        read("cities.tsv", f -> {
            if (f.length >= 3 && zones.contains(f[2])) map.computeIfAbsent(f[0], k -> new ArrayList<>()).add(new City(f[1], f[2]));
        });
        map.replaceAll((k, v) -> List.copyOf(v));
        return map;
    }

    /** IANA zone.tab (public domain): one country per zone, unlike zone1970.tab. */
    private static Map<String, String> zoneCountries() {
        Map<String, String> map = new HashMap<>();
        read("zone.tab", f -> {
            if (f.length >= 3) map.put(f[2], f[0]);
        });
        return map;
    }

    private static void read(String file, Consumer<String[]> row) {
        try (InputStream in = RegionalCatalog.class.getResourceAsStream("/regional/" + file)) {
            if (in == null) throw new IllegalStateException("regional/" + file + " is missing from the classpath");
            new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines()
                    .filter(l -> !l.isBlank() && !l.startsWith("#"))
                    .map(l -> l.split("\t"))
                    .forEach(row);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Case- and accent-insensitive: "Brasília" matches the capital "Brasilia". */
    private static String fold(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    private static <T> Map<String, T> index(List<T> list, Function<T, String> key) {
        return list.stream().collect(Collectors.toUnmodifiableMap(key, Function.identity()));
    }
}
