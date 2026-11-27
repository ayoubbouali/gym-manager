package com.gymmanager.gym.service;

import com.gymmanager.gym.domain.Business;
import com.gymmanager.gym.rules.Rules;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/** Months a business item is due, with the same rule as the charges (RG-CHARGE). */
final class BusinessDues {
    private BusinessDues() {
    }

    static YearMonth end(Business b) {
        return b.getEndPeriod() == null ? null : YearMonth.parse(b.getEndPeriod());
    }

    /** Permanent: from its start month to its end month, never after {@code lastDue}; one-off: its own month. */
    static boolean isDue(Business b, YearMonth month, YearMonth lastDue) {
        return b.isPermanent() ? Rules.isChargeDue(YearMonth.parse(b.getStartPeriod()), end(b), month, lastDue)
                : b.getPeriod().equals(month.toString()) && !month.isAfter(lastDue);
    }

    /** Every month due up to {@code current} included. */
    static List<YearMonth> monthsDue(Business b, YearMonth current) {
        if (!b.isPermanent()) {
            YearMonth ym = YearMonth.parse(b.getPeriod());
            return ym.isAfter(current) ? List.of() : List.of(ym);
        }
        List<YearMonth> out = new ArrayList<>();
        for (YearMonth ym = YearMonth.parse(b.getStartPeriod()); isDue(b, ym, current); ym = ym.plusMonths(1)) out.add(ym);
        return out;
    }
}
