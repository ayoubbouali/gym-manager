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
import java.time.ZoneId;
import java.util.Currency;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Official regional lists (ISO 4217 currencies, IANA time zones, libphonenumber dial codes) and phone validation. */
public final class RegionalCatalog {

    private RegionalCatalog() {
    }

    public record CurrencyOption(String code, String label, String symbol) {
    }

    /** {@code dialCode} is null when the zone has no country (UTC, Etc/GMT+1, legacy aliases). */
    public record TimezoneOption(String id, String dialCode) {
    }

    public record DialCodeOption(String code, String label) {
    }

    public record Options(List<CurrencyOption> currencies, List<TimezoneOption> timezones, List<DialCodeOption> dialCodes) {
    }

    private static final PhoneNumberUtil PHONES = PhoneNumberUtil.getInstance();
    private static final Set<PhoneNumberType> ACCEPTED_TYPES = Set.of(PhoneNumberType.FIXED_LINE, PhoneNumberType.MOBILE,
            PhoneNumberType.FIXED_LINE_OR_MOBILE);

    public static final Options OPTIONS = new Options(currencies(), timezones(), dialCodes());
    private static final Map<String, CurrencyOption> CURRENCIES = index(OPTIONS.currencies(), CurrencyOption::code);
    private static final Map<String, TimezoneOption> TIMEZONES = index(OPTIONS.timezones(), TimezoneOption::id);
    private static final Map<String, DialCodeOption> DIAL_CODES = index(OPTIONS.dialCodes(), DialCodeOption::code);

    public static boolean isCurrency(String code) {
        return CURRENCIES.containsKey(code);
    }

    public static boolean isTimezone(String id) {
        return TIMEZONES.containsKey(id);
    }

    public static boolean isDialCode(String code) {
        return DIAL_CODES.containsKey(code);
    }

    /** Example mobile number in national format ("06 50 12 34 56" for 212), or "" when unknown. */
    public static String phoneExample(String dialCode) {
        String region = region(dialCode);
        if (region == null) return "";
        PhoneNumber n = PHONES.getExampleNumberForType(region, PhoneNumberType.MOBILE);
        if (n == null) n = PHONES.getExampleNumber(region);
        return n == null ? "" : PHONES.format(n, PhoneNumberFormat.NATIONAL);
    }

    /**
     * National format, digits only ("0612345678"), or null when the number is not a valid fixed or mobile number
     * for this dial code. An international number (+33…, 0033…) is accepted only with the club's own dial code.
     */
    public static String normalizePhone(String raw, String dialCode) {
        String region = region(dialCode);
        String v = raw == null ? "" : raw.replaceAll("[\\s.\\-()/]", "");
        // libphonenumber would turn letters into digits (vanity numbers)
        if (region == null || !v.matches("\\+?\\d{1,20}")) return null;
        try {
            PhoneNumber n = PHONES.parse(v, region);
            if (n.getCountryCode() != Integer.parseInt(dialCode) || !PHONES.isValidNumber(n)
                    || !ACCEPTED_TYPES.contains(PHONES.getNumberType(n))) return null;
            return PHONES.format(n, PhoneNumberFormat.NATIONAL).replaceAll("\\D", "");
        } catch (NumberParseException e) {
            return null;
        }
    }

    /** Main region of a dial code ("MA" for 212, "US" for 1), or null for an unknown or non-geographic code. */
    private static String region(String dialCode) {
        if (dialCode == null || !dialCode.matches("\\d{1,4}")) return null;
        String r = PHONES.getRegionCodeForCountryCode(Integer.parseInt(dialCode));
        return PHONES.getSupportedRegions().contains(r) ? r : null;
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

    private static List<TimezoneOption> timezones() {
        Map<String, String> countries = zoneCountries();
        return Stream.concat(Stream.of("UTC"), ZoneId.getAvailableZoneIds().stream()
                        // zone.tab lists canonical names only: legacy aliases (Europe/Kiev, Asia/Calcutta…) are left out
                        .filter(id -> countries.containsKey(id) || id.startsWith("Etc/"))
                        .sorted())
                .map(id -> {
                    String country = countries.get(id);
                    // regions unknown to libphonenumber (AQ, TF, UM…) have no dial code
                    int code = PHONES.getSupportedRegions().contains(country) ? PHONES.getCountryCodeForRegion(country) : 0;
                    return new TimezoneOption(id, code == 0 ? null : String.valueOf(code));
                })
                .toList();
    }

    private static List<DialCodeOption> dialCodes() {
        return PHONES.getSupportedCallingCodes().stream().sorted()
                .map(String::valueOf)
                .filter(c -> region(c) != null)
                .map(c -> new DialCodeOption(c, Locale.of("", region(c)).getDisplayCountry(Locale.FRENCH)))
                .toList();
    }

    /** IANA zone.tab (public domain): one country per zone, unlike zone1970.tab which would make prefilling ambiguous. */
    private static Map<String, String> zoneCountries() {
        Map<String, String> map = new HashMap<>();
        try (InputStream in = RegionalCatalog.class.getResourceAsStream("/regional/zone.tab")) {
            if (in == null) throw new IllegalStateException("regional/zone.tab is missing from the classpath");
            new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines()
                    .filter(l -> !l.isBlank() && !l.startsWith("#"))
                    .map(l -> l.split("\t"))
                    .filter(f -> f.length >= 3)
                    .forEach(f -> map.put(f[2], f[0]));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return map;
    }

    private static <T> Map<String, T> index(List<T> list, Function<T, String> key) {
        return list.stream().collect(Collectors.toUnmodifiableMap(key, Function.identity()));
    }
}
