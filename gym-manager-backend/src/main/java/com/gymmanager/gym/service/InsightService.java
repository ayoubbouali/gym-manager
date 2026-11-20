package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.ActivityView;
import com.gymmanager.gym.service.Views.MemberView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

/** Dashboard, alerts and statistics (read only). */
@Service
@RequiredArgsConstructor
public class InsightService {
    private final ClubStateService stateService;

    // ---------------------------------------------------------------- dashboard

    public record SportCount(Long id, String code, String name, String color, int count, int capacity) {
    }

    public record Dashboard(int activeMembers, int alertCount, int upcomingActivityCount,
                            BigDecimal cashedThisMonth, BigDecimal toCollect,
                            List<SportCount> bySport, List<ActivityView> upcoming) {
    }

    private static BigDecimal toCollect(ClubState st) {
        return st.members().stream().filter(MemberView::active).map(MemberView::balance)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /** Cashed amounts (non-cancelled payments) as revenue entries. */
    private static List<Rules.Sale> sales(ClubState st) {
        java.util.Map<Long, MemberView> byId = new java.util.HashMap<>();
        st.members().forEach(m -> byId.put(m.id(), m));
        return st.payments().stream().filter(p -> !p.cancelled())
                .map(p -> new Rules.Sale(p.paidOn(), p.amount(), new HashSet<>(byId.get(p.memberId()).sportIds()))).toList();
    }

    public Dashboard dashboard() {
        ClubState st = stateService.load();
        List<ActivityView> upcoming = st.activities().stream().filter(a -> a.active() && !a.past())
                .sorted(Comparator.comparing(ActivityView::startsAt)).toList();
        return new Dashboard(
                (int) st.members().stream().filter(MemberView::activeMember).count(),
                (int) alertMembers(st).stream().filter(m -> m.remainingDays() < 0).count(),
                upcoming.size(),
                Rules.revenue(sales(st), YearMonth.from(st.today()).atDay(1), st.today()),
                toCollect(st),
                st.sports().stream().filter(Views.SportView::active)
                        .map(s -> new SportCount(s.id(), s.code(), s.name(), s.color(), s.memberCount(), s.capacity())).toList(),
                upcoming.stream().limit(5).toList());
    }

    // ---------------------------------------------------------------- alerts

    public record AlertRow(Long id, String code, String firstName, String lastName, String phone, String pack,
                           LocalDate endDate, long remainingDays, Rules.Situation situation, BigDecimal balance,
                           Rules.PaymentStatus paymentStatus, String message, String whatsappLink) {
    }

    public record Alerts(int alertCount, int soonThreshold, int followThreshold, List<AlertRow> rows) {
    }

    /** Members that are not deactivated (expired ones included), sorted by remaining days ascending. */
    private static List<MemberView> alertMembers(ClubState st) {
        return st.members().stream().filter(MemberView::active)
                .sorted(Comparator.comparingLong(MemberView::remainingDays).thenComparing(MemberView::code)).toList();
    }

    public Alerts alerts() {
        ClubState st = stateService.load();
        List<AlertRow> rows = alertMembers(st).stream().map(m -> {
            var a = ClubStateService.alertFor(m, st.cfg());
            return new AlertRow(m.id(), m.code(), m.firstName(), m.lastName(), m.phone(), m.pack().name(), m.endDate(),
                    m.remainingDays(), m.situation(), m.balance(), m.paymentStatus(), a.message(), a.link());
        }).toList();
        return new Alerts((int) rows.stream().filter(r -> r.remainingDays() < 0).count(),
                st.cfg().soonThreshold(), st.cfg().followThreshold(), rows);
    }

    // ---------------------------------------------------------------- statistics

    public record Kpis(BigDecimal revenue, BigDecimal unpaidAmount, int unpaidInsuranceCount, int activeMembers) {
    }

    public record SportAmount(Long id, String name, String color, boolean active, BigDecimal amount) {
    }

    public record ActivityAmount(Long id, String code, String name, LocalDate date, BigDecimal price, int count, BigDecimal revenue) {
    }

    public record MethodAmount(String method, String label, BigDecimal amount, int count) {
    }

    public record Stats(LocalDate from, LocalDate to, Kpis kpis, List<MethodAmount> byMethod, List<Rules.MonthAmount> monthly,
                        List<Rules.QuarterAmount> quarterly, List<Rules.YearAmount> yearly,
                        List<SportAmount> bySport, List<ActivityAmount> activities) {
    }

    /**
     * Revenue = cashed amounts (non-cancelled payments) by payment date.
     * Period-bound: CA total, per payment method, monthly, CA per sport, activities (by date).
     * Snapshot (current state): amount still to collect (Σ balances), unpaid insurances, active members.
     * Quarterly/annual tables cover every year from the first registration to the current year.
     */
    public Stats stats(LocalDate from, LocalDate to) {
        ClubState st = stateService.load();
        LocalDate today = st.today();
        if (from == null || to == null) {
            to = today;
            from = YearMonth.from(today).minusMonths(11).atDay(1);
        }
        if (from.isAfter(to)) throw ApiException.badRequest("La date de début doit précéder la date de fin.");
        if (from.plusYears(20).isBefore(to)) throw ApiException.badRequest("Période trop longue (20 ans maximum).");

        List<Rules.Sale> sales = sales(st);
        int firstYear = java.util.stream.Stream.concat(st.members().stream().map(MemberView::registrationDate),
                        st.payments().stream().map(Views.PaymentView::paidOn))
                .min(LocalDate::compareTo).orElse(today).getYear();
        int lastYear = Math.max(today.getYear(), firstYear);

        BigDecimal unpaid = toCollect(st);
        int unpaidInsurance = (int) st.members().stream().filter(m -> m.active() && m.insurance() == Insurance.IMPAYE).count();
        int active = (int) st.members().stream().filter(MemberView::activeMember).count();

        final LocalDate f = from, t = to;
        Rules.DateWindow w = new Rules.DateWindow(from, to);
        return new Stats(from, to,
                new Kpis(Rules.revenue(sales, from, to), unpaid, unpaidInsurance, active),
                java.util.Arrays.stream(com.gymmanager.gym.domain.PaymentMethod.values()).map(pm -> {
                    var list = st.payments().stream().filter(p -> !p.cancelled() && p.method() == pm && w.contains(p.paidOn())).toList();
                    return new MethodAmount(pm.name(), pm.label(), list.stream().map(Views.PaymentView::amount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, java.math.RoundingMode.HALF_UP), list.size());
                }).toList(),
                Rules.revenueByMonth(sales, from, to),
                Rules.revenueByQuarter(sales, firstYear, lastYear),
                Rules.revenueByYear(sales, firstYear, lastYear),
                st.sports().stream().map(s -> new SportAmount(s.id(), s.name(), s.color(), s.active(),
                        Rules.revenueForSport(sales, s.id(), f, t))).toList(),
                st.activities().stream().filter(a -> w.contains(a.startsAt().toLocalDate()))
                        .map(a -> new ActivityAmount(a.id(), a.code(), a.name(), a.startsAt().toLocalDate(), a.price(),
                                a.registrationCount(), a.revenue())).toList());
    }
}
