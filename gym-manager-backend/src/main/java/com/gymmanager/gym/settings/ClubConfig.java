package com.gymmanager.gym.settings;

import com.gymmanager.gym.rules.Rules;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

/** Typed, immutable view of all settings at a given moment. */
public record ClubConfig(
        String clubName, String clubAddress, String clubPhone,
        String currency, ZoneId timezone, String dialCode, String phoneRegex,
        Map<String, CodeFormat> codes,
        boolean cumulative, Rules.Rounding rounding,
        int soonThreshold, int followThreshold, String expiredTemplate, String soonTemplate,
        String salaryShareRaw, Rules.Share salaryShare, int salaryStartDay, int salaryEndDay, Rules.MultiCoach multiCoach,
        String receiptPrefix, String payslipPrefix, String documentFooter,
        int pageSize, Clock clock) {

    public record CodeFormat(String prefix, int digits) {
    }

    public Rules.PricingSettings pricing() {
        return new Rules.PricingSettings(cumulative, rounding, soonThreshold, followThreshold);
    }

    public Rules.SalaryParams salaryParams() {
        return new Rules.SalaryParams(salaryShare, salaryStartDay, salaryEndDay, multiCoach, rounding);
    }

    public LocalDate today() {
        return LocalDate.now(clock.withZone(timezone));
    }

    public LocalDateTime now() {
        return LocalDateTime.now(clock.withZone(timezone)).withSecond(0).withNano(0);
    }
}
