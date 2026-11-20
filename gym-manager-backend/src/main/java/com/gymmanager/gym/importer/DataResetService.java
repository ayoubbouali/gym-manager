package com.gymmanager.gym.importer;

import com.gymmanager.gym.common.FileStorage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Deletes all the club data (members, payments, sports, staff, packs, referentials, payroll, activities)
 * and resets the code counters. User accounts, settings and the club logo are kept.
 */
@Service
public class DataResetService {
    private static final List<String> TABLES = List.of(
            "payments", "salary_payments", "activity_registrations", "subscriptions", "member_sports", "members",
            "activities", "packs", "sport_schedules", "sport_coaches", "sports", "staff", "staff_functions",
            "durations", "discounts", "code_counters");

    private final JdbcTemplate jdbc;
    private final FileStorage files;

    public DataResetService(JdbcTemplate jdbc, FileStorage files) {
        this.jdbc = jdbc;
        this.files = files;
    }

    /** Current volume of data (shown before a reset or an import). */
    @Transactional(readOnly = true)
    public Map<String, Long> summary() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("members", count("members"));
        m.put("payments", count("payments"));
        m.put("sports", count("sports"));
        m.put("staff", count("staff"));
        m.put("packs", count("packs"));
        m.put("activities", count("activities"));
        m.put("salaryPayments", count("salary_payments"));
        return m;
    }

    private long count(String table) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return n == null ? 0 : n;
    }

    @Transactional
    public Map<String, Long> wipe() {
        Map<String, Long> before = summary();
        List<String> photos = jdbc.queryForList("SELECT photo FROM members WHERE photo IS NOT NULL", String.class);
        for (String t : TABLES) jdbc.update("DELETE FROM " + t);
        photos.forEach(files::delete);
        return before;
    }
}
