package com.gymmanager.gym.settings;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.rules.Rules;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
        Map<String, String> map = new LinkedHashMap<>();
        SettingsCatalog.ALL.forEach(d -> map.put(d.key(), d.defaultValue()));
        repo.findAll().forEach(s -> {
            if (map.containsKey(s.getKey())) map.put(s.getKey(), s.getValue());
        });
        return map;
    }

    @Transactional(readOnly = true)
    public ClubConfig config() {
        Map<String, String> s = raw();
        Map<String, ClubConfig.CodeFormat> codes = new HashMap<>();
        for (String e : SettingsCatalog.CODE_ENTITIES) {
            codes.put(e, new ClubConfig.CodeFormat(s.get("codes." + e + ".prefix"), Integer.parseInt(s.get("codes." + e + ".digits"))));
        }
        Rules.Share share = Rules.parseShare(s.get("salary.share"));
        return new ClubConfig(
                s.get("club.name"), s.get("club.address"), s.get("club.phone"),
                s.get("regional.currency"), ZoneId.of(s.get("regional.timezone")), s.get("regional.dialCode"), s.get("regional.phoneRegex"),
                codes,
                Boolean.parseBoolean(s.get("subscription.cumulative")), Rules.Rounding.fromSetting(s.get("subscription.rounding")),
                Integer.parseInt(s.get("alerts.soonDays")), Integer.parseInt(s.get("alerts.followDays")),
                s.get("alerts.expiredTemplate"), s.get("alerts.soonTemplate"),
                s.get("salary.share"), share != null ? share : Rules.parseShare("1/3"),
                Integer.parseInt(s.get("salary.startDay")), Integer.parseInt(s.get("salary.endDay")),
                Rules.MultiCoach.valueOf(s.get("salary.multiCoach")),
                s.get("documents.receiptPrefix"), s.get("documents.payslipPrefix"), s.get("documents.footer"),
                Integer.parseInt(s.get("display.pageSize")), clock);
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

    /** Validates all values first, then saves them atomically. An empty secret keeps the stored one. */
    @Transactional
    public void update(Map<String, String> values) {
        Map<String, String> merged = raw();
        Map<String, String> toSave = new LinkedHashMap<>();
        for (var e : values.entrySet()) {
            SettingDef d = SettingsCatalog.find(e.getKey())
                    .orElseThrow(() -> ApiException.badRequest("Paramètre inconnu : " + e.getKey()));
            if (SettingsCatalog.isSecret(d) && (e.getValue() == null || e.getValue().isBlank())) continue;
            String err = SettingsCatalog.validate(d, e.getValue());
            if (err != null) throw ApiException.invalid(d.key(), err);
            merged.put(d.key(), SettingsCatalog.normalize(d, e.getValue()));
            toSave.put(d.key(), merged.get(d.key()));
        }
        if (Integer.parseInt(merged.get("salary.startDay")) > Integer.parseInt(merged.get("salary.endDay"))) {
            throw ApiException.invalid("salary.endDay", "Le jour de fin de la fenêtre doit être supérieur ou égal au jour de début.");
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
    }
}
