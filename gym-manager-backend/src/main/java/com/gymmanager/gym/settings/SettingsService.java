package com.gymmanager.gym.settings;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.rules.Rules;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reads settings (DB value or catalogue default) and updates them. Changes apply immediately. */
@Service
public class SettingsService {
    private final SettingRepository repo;
    private final Clock clock;

    public SettingsService(SettingRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Map<String, String> raw() {
        Map<String, String> stored = new HashMap<>();
        repo.findAll().forEach(s -> stored.put(s.getKey(), s.getValue()));
        Map<String, String> map = new LinkedHashMap<>();
        SettingsCatalog.ALL.forEach(d -> map.put(d.key(), stored.getOrDefault(d.key(), d.defaultValue())));
        if (!stored.containsKey(SettingsCatalog.COUNTRY)) migrateRegional(stored, map);
        return map;
    }

    /**
     * Database or backup from before the country setting: the country comes from the former time zone (zone.tab), else
     * the former dial code, else stays the default. A zone other than the country's official one is kept through a city.
     */
    private static void migrateRegional(Map<String, String> stored, Map<String, String> map) {
        String zone = stored.get(SettingsCatalog.LEGACY_TIMEZONE);
        String country = RegionalCatalog.countryOfTimezone(zone);
        if (country == null) country = RegionalCatalog.countryOfDialCode(stored.get(SettingsCatalog.LEGACY_DIAL_CODE));
        if (country == null) return;
        map.put(SettingsCatalog.COUNTRY, country);
        if (!stored.containsKey(SettingsCatalog.CITY) && !RegionalCatalog.timezone(country, null).getId().equals(zone)) {
            String city = RegionalCatalog.cityInZone(country, zone);
            if (city != null) map.put(SettingsCatalog.CITY, city);
        }
    }

    @Transactional(readOnly = true)
    public ClubConfig config() {
        Map<String, String> s = raw();
        String country = s.get(SettingsCatalog.COUNTRY);
        String city = s.get(SettingsCatalog.CITY);
        Map<String, ClubConfig.CodeFormat> codes = new HashMap<>();
        for (String e : SettingsCatalog.CODE_ENTITIES) {
            codes.put(e, new ClubConfig.CodeFormat(s.get("codes." + e + ".prefix"), Integer.parseInt(s.get("codes." + e + ".digits"))));
        }
        Rules.Share share = Rules.parseShare(s.get("salary.share"));
        return new ClubConfig(
                s.get("club.name"), s.get("club.address"), s.get("club.phone"),
                s.get(SettingsCatalog.CURRENCY_SYMBOL), s.get(SettingsCatalog.CURRENCY_CODE), country, city,
                RegionalCatalog.timezone(country, city), RegionalCatalog.dialCode(country),
                codes,
                Boolean.parseBoolean(s.get("subscription.cumulative")), Rules.Rounding.fromSetting(s.get("subscription.rounding")),
                Integer.parseInt(s.get("alerts.soonDays")), Integer.parseInt(s.get("alerts.followDays")),
                s.get("alerts.expiredTemplate"), s.get("alerts.soonTemplate"),
                s.get("salary.share"), share != null ? share : Rules.parseShare("1/3"),
                Integer.parseInt(s.get("salary.cutoffDay")),
                Rules.MultiCoach.valueOf(s.get("salary.multiCoach")),
                s.get("documents.receiptPrefix"), s.get("documents.payslipPrefix"), s.get("documents.footer"),
                Integer.parseInt(s.get("display.pageSize")), clock);
    }

    @Transactional(readOnly = true)
    public PurgeConfig purge() {
        Map<String, String> s = raw();
        return new PurgeConfig(Boolean.parseBoolean(s.get("purge.enabled")), new Rules.PurgeSettings(Integer.parseInt(s.get("purge.months")),
                Boolean.parseBoolean(s.get("purge.inactive")), Boolean.parseBoolean(s.get("purge.expired")),
                Boolean.parseBoolean(s.get("purge.noSubscription"))));
    }

    @Transactional(readOnly = true)
    public MailConfig mail() {
        Map<String, String> s = raw();
        return new MailConfig(s.get("mail.from"), s.get(SettingsCatalog.MAIL_API_KEY), s.get("mail.smtp.host"),
                Integer.parseInt(s.get("mail.smtp.port")), s.get("mail.smtp.security"));
    }

    /** For each secret setting, whether a value is stored. The values themselves are never exposed. */
    @Transactional(readOnly = true)
    public Map<String, Boolean> secretsSet() {
        Map<String, String> s = raw();
        Map<String, Boolean> set = new LinkedHashMap<>();
        SettingsCatalog.ALL.stream().filter(SettingsCatalog::isSecret)
                .forEach(d -> set.put(d.key(), !s.get(d.key()).isBlank()));
        return set;
    }

    /** {@link #raw()} with every secret replaced by an empty string, for the API. */
    @Transactional(readOnly = true)
    public Map<String, String> masked() {
        Map<String, String> s = raw();
        SettingsCatalog.ALL.stream().filter(SettingsCatalog::isSecret).forEach(d -> s.put(d.key(), ""));
        return s;
    }

    /**
     * Validates all values first, then saves them atomically. An empty secret keeps the stored one; a read-only value
     * is ignored. {@code phoneCountries}: country chosen in each phone field, absent = the club's country.
     */
    @Transactional
    public void update(Map<String, String> values, Map<String, String> phoneCountries) {
        Map<String, String> before = raw();
        Map<String, String> merged = new LinkedHashMap<>(before);
        Map<String, String> toSave = new LinkedHashMap<>();
        for (var e : values.entrySet()) {
            SettingDef d = SettingsCatalog.find(e.getKey())
                    .orElseThrow(() -> ApiException.badRequest("Paramètre inconnu : " + e.getKey()));
            if (SettingsCatalog.isSecret(d) && (e.getValue() == null || e.getValue().isBlank())) continue;
            if ("readonly".equals(d.type())) continue;
            String err = SettingsCatalog.validate(d, e.getValue());
            if (err != null) throw ApiException.invalid(d.key(), err);
            merged.put(d.key(), SettingsCatalog.normalize(d, e.getValue()));
            toSave.put(d.key(), merged.get(d.key()));
        }
        String country = merged.get(SettingsCatalog.COUNTRY);
        if (toSave.containsKey(SettingsCatalog.COUNTRY) || toSave.containsKey(SettingsCatalog.CITY)) {
            String city = merged.get(SettingsCatalog.CITY);
            if (!city.isEmpty() && !RegionalCatalog.isCity(country, city)) {
                if (toSave.containsKey(SettingsCatalog.CITY)) {
                    RegionalCatalog.CountryOption o = RegionalCatalog.country(country);
                    throw ApiException.invalid(SettingsCatalog.CITY, "« Ville » : ville inconnue pour "
                            + (o == null ? country : o.label()) + " (" + city + ").");
                }
                // the country changed alone: the stored city belongs to the former one
                toSave.put(SettingsCatalog.CITY, "");
            }
        }
        String code = merged.get(SettingsCatalog.CURRENCY_CODE);
        if (!code.equals(before.get(SettingsCatalog.CURRENCY_CODE))) {
            toSave.put(SettingsCatalog.CURRENCY_SYMBOL, RegionalCatalog.currencySymbol(code));
        }
        if (toSave.containsKey(SettingsCatalog.CLUB_PHONE)) {
            String field = SettingsCatalog.CLUB_PHONE;
            toSave.put(field, Check.phone(values.get(field), before.get(field), phoneCountries.get(field), country, field, false));
        }
        if (Integer.parseInt(merged.get("alerts.soonDays")) > Integer.parseInt(merged.get("alerts.followDays"))) {
            throw ApiException.invalid("alerts.followDays", "Le seuil « À suivre » doit être supérieur ou égal au seuil « Expire bientôt ».");
        }
        toSave.forEach((k, v) -> repo.save(new AppSetting(k, v)));
    }

    /** Restores the defaults of one group (tab). */
    @Transactional
    public void reset(String group) {
        if (!SettingsCatalog.GROUPS.containsKey(group)) throw ApiException.badRequest("Groupe de paramètres inconnu.");
        SettingsCatalog.ALL.stream().filter(d -> d.group().equals(group)).forEach(d -> repo.deleteById(d.key()));
        // otherwise the default country would be migrated from them again
        if ("regional".equals(group)) List.of(SettingsCatalog.LEGACY_TIMEZONE, SettingsCatalog.LEGACY_DIAL_CODE).forEach(repo::deleteById);
    }
}
