package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.domain.Business;
import com.gymmanager.gym.domain.BusinessCategory;
import com.gymmanager.gym.domain.BusinessPayment;
import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.ActivityView;
import com.gymmanager.gym.service.Views.MemberView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

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

    /** Members' cashed amounts (non-cancelled payments) as revenue entries: the base of the coaches' commissions. */
    public static List<Rules.Sale> sales(ClubState st) {
        Map<Long, MemberView> byId = new HashMap<>();
        st.members().forEach(m -> byId.put(m.id(), m));
        return st.payments().stream().filter(p -> !p.cancelled())
                .map(p -> new Rules.Sale(p.paidOn(), p.amount(), new HashSet<>(byId.get(p.memberId()).sportIds()))).toList();
    }

    /** Active paying activities: price × registered members, on the activity's date. */
    public static List<Rules.Sale> activitySales(ClubState st) {
        return st.activities().stream().filter(a -> a.active() && a.paid() && a.revenue().signum() > 0)
                .map(a -> new Rules.Sale(a.startsAt().toLocalDate(), a.revenue(), Set.of())).toList();
    }

    /** Business collections, on their collection date. */
    public static List<Rules.Sale> businessSales(ClubState st) {
        return st.businessPayments().stream().map(p -> new Rules.Sale(p.getPaidOn(), p.getAmount(), Set.of())).toList();
    }

    /** Every revenue of the club: subscriptions, paying activities and business. */
    public static List<Rules.Sale> allSales(ClubState st) {
        List<Rules.Sale> all = new ArrayList<>(sales(st));
        all.addAll(activitySales(st));
        all.addAll(businessSales(st));
        return all;
    }

    public Dashboard dashboard() {
        ClubState st = stateService.load();
        List<ActivityView> upcoming = st.activities().stream().filter(a -> a.active() && !a.past())
                .sorted(Comparator.comparing(ActivityView::startsAt)).toList();
        return new Dashboard(
                (int) st.members().stream().filter(MemberView::activeMember).count(),
                (int) alertMembers(st).stream().filter(InsightService::expired).count(),
                upcoming.size(),
                Rules.revenue(allSales(st), YearMonth.from(st.today()).atDay(1), st.today()),
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

    private static boolean expired(MemberView m) {
        return m.remainingDays() != null && m.remainingDays() < 0;
    }

    /** Members that are not deactivated and have a subscription (expired ones included), sorted by remaining days ascending. */
    private static List<MemberView> alertMembers(ClubState st) {
        return st.members().stream().filter(m -> m.active() && m.situation() != Rules.Situation.NONE)
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

    /** {@code managerShare}: part paid to the manager with their salary, null when none (free activity, internal manager). */
    public record ActivityAmount(Long id, String code, String name, LocalDate date, BigDecimal price, int count, BigDecimal revenue,
                                 BigDecimal managerShare) {
    }

    public record MethodAmount(String method, String label, BigDecimal amount, int count) {
    }

    /** Revenue of the period by source: {@code key} SUBSCRIPTIONS, ACTIVITIES or BUSINESS. */
    public record SourceAmount(String key, String label, BigDecimal amount) {
    }

    public record SourceMonth(String month, BigDecimal subscriptions, BigDecimal activities, BigDecimal business, BigDecimal total) {
    }

    public record CategoryAmount(String category, String label, BigDecimal amount) {
    }

    /** {@code monthly}, {@code quarterly}, {@code yearly} and {@code kpis.revenue} cover every source. */
    public record Stats(LocalDate from, LocalDate to, Kpis kpis, List<MethodAmount> byMethod, List<Rules.MonthAmount> monthly,
                        List<Rules.QuarterAmount> quarterly, List<Rules.YearAmount> yearly,
                        List<SportAmount> bySport, List<ActivityAmount> activities,
                        List<SourceAmount> bySource, List<SourceMonth> monthlyBySource, List<CategoryAmount> businessByCategory) {
    }

    /**
     * Revenue = members' cashed amounts (non-cancelled payments) by payment date + paying activities (price × registered
     * members) by activity date + business collections by collection date.
     * Period-bound: CA total, per source, per payment method (members and business), monthly, CA per sport (members), activities (by date).
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

        List<Rules.Sale> memberSales = sales(st);
        List<Rules.Sale> activitySales = activitySales(st);
        List<Rules.Sale> businessSales = businessSales(st);
        List<Rules.Sale> sales = allSales(st);
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
                    var list = st.payments().stream().filter(p -> !p.cancelled() && p.method() == pm && w.contains(p.paidOn()))
                            .map(Views.PaymentView::amount).toList();
                    var biz = st.businessPayments().stream().filter(p -> p.getMethod() == pm && w.contains(p.getPaidOn()))
                            .map(BusinessPayment::getAmount).toList();
                    return new MethodAmount(pm.name(), pm.label(), Stream.concat(list.stream(), biz.stream())
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, java.math.RoundingMode.HALF_UP), list.size() + biz.size());
                }).toList(),
                Rules.revenueByMonth(sales, from, to),
                Rules.revenueByQuarter(sales, firstYear, lastYear),
                Rules.revenueByYear(sales, firstYear, lastYear),
                st.sports().stream().map(s -> new SportAmount(s.id(), s.name(), s.color(), s.active(),
                        Rules.revenueForSport(memberSales, s.id(), f, t))).toList(),
                st.activities().stream().filter(a -> w.contains(a.startsAt().toLocalDate()))
                        .map(a -> new ActivityAmount(a.id(), a.code(), a.name(), a.startsAt().toLocalDate(), a.price(),
                                a.registrationCount(), a.revenue(), a.managerShare())).toList(),
                List.of(new SourceAmount("SUBSCRIPTIONS", "Abonnements", Rules.revenue(memberSales, from, to)),
                        new SourceAmount("ACTIVITIES", "Activités payantes", Rules.revenue(activitySales, from, to)),
                        new SourceAmount("BUSINESS", "Business", Rules.revenue(businessSales, from, to))),
                monthlyBySource(memberSales, activitySales, businessSales, from, to),
                businessByCategory(st, w));
    }

    private static List<SourceMonth> monthlyBySource(List<Rules.Sale> members, List<Rules.Sale> activities, List<Rules.Sale> business,
                                                     LocalDate from, LocalDate to) {
        List<Rules.MonthAmount> m = Rules.revenueByMonth(members, from, to);
        List<Rules.MonthAmount> a = Rules.revenueByMonth(activities, from, to);
        List<Rules.MonthAmount> b = Rules.revenueByMonth(business, from, to);
        List<SourceMonth> out = new ArrayList<>();
        for (int i = 0; i < m.size(); i++) {
            BigDecimal x = m.get(i).amount(), y = a.get(i).amount(), z = b.get(i).amount();
            out.add(new SourceMonth(m.get(i).month().toString(), x, y, z, x.add(y).add(z)));
        }
        return out;
    }

    /** Business collected in the window by category, largest first. */
    private static List<CategoryAmount> businessByCategory(ClubState st, Rules.DateWindow w) {
        Map<Long, Business> items = new HashMap<>();
        st.businesses().forEach(b -> items.put(b.getId(), b));
        Map<BusinessCategory, BigDecimal> byCat = new EnumMap<>(BusinessCategory.class);
        st.businessPayments().stream().filter(p -> w.contains(p.getPaidOn()))
                .forEach(p -> byCat.merge(items.get(p.getBusinessId()).getCategory(), p.getAmount(), BigDecimal::add));
        return byCat.entrySet().stream()
                .map(e -> new CategoryAmount(e.getKey().name(), e.getKey().label(), e.getValue().setScale(2, java.math.RoundingMode.HALF_UP)))
                .sorted(Comparator.comparing(CategoryAmount::amount).reversed()).toList();
    }

    // ---------------------------------------------------------------- registrations (RG-INSCR)

    public record LabelCount(String label, int count) {
    }

    public record SportRegistrations(Long id, String name, String color, int count) {
    }

    public record RegistrationMonth(String month, int newMembers, int renewals, int departures) {
    }

    public record NewMember(Long id, String code, String name, LocalDate registrationDate, List<Views.SportRef> sports, String packName) {
    }

    /**
     * {@code ended}: subscription periods that ended in the window (up to today); {@code renewed}: those followed by a later period;
     * {@code departures} = ended − renewed; {@code net} = new members − departures.
     */
    public record RegistrationStats(LocalDate from, LocalDate to, int newMembers, int renewals, int ended, int renewed, int departures,
                                    Integer renewalRate, int net, List<RegistrationMonth> monthly, List<SportRegistrations> bySport,
                                    List<LabelCount> byDuration, List<LabelCount> byAge, List<NewMember> newMemberRows) {
    }

    /**
     * RG-INSCR. New member: registration date in the window. Renewal: any period but a member's first, by start date.
     * Departure: a period ended in the window (end date reached) without a later period.
     */
    public RegistrationStats registrations(LocalDate from, LocalDate to) {
        ClubState st = stateService.load();
        LocalDate today = st.today();
        if (from == null || to == null) {
            from = YearMonth.from(today).atDay(1);
            to = today;
        }
        if (from.isAfter(to)) throw ApiException.badRequest("La date de début doit précéder la date de fin.");
        if (from.plusYears(20).isBefore(to)) throw ApiException.badRequest("Période trop longue (20 ans maximum).");
        Rules.DateWindow w = new Rules.DateWindow(from, to);
        LocalDate endedUntil = to.isAfter(today) ? today : to;

        Map<YearMonth, int[]> months = new LinkedHashMap<>();
        for (YearMonth ym = YearMonth.from(from); !ym.isAfter(YearMonth.from(to)); ym = ym.plusMonths(1)) months.put(ym, new int[3]);
        Map<Integer, String> durationLabel = new HashMap<>();
        st.durations().forEach(d -> durationLabel.putIfAbsent(d.months(), d.label()));
        Map<Long, String> packName = new HashMap<>();
        st.packs().forEach(p -> packName.put(p.id(), p.name()));

        List<MemberView> fresh = st.members().stream().filter(m -> w.contains(m.registrationDate()))
                .sorted(Comparator.comparing(MemberView::registrationDate).thenComparing(MemberView::code)).toList();
        fresh.forEach(m -> months.get(YearMonth.from(m.registrationDate()))[0]++);

        int renewals = 0, ended = 0, renewed = 0;
        for (var periods : st.subsByMember().values()) {
            for (int i = 0; i < periods.size(); i++) {
                var p = periods.get(i);
                if (i > 0 && w.contains(p.getStartDate())) {
                    renewals++;
                    months.get(YearMonth.from(p.getStartDate()))[1]++;
                }
                LocalDate end = Rules.subscriptionEnd(p.getStartDate(), p.getMonths());
                if (end.isBefore(from) || end.isAfter(endedUntil)) continue;
                ended++;
                if (i < periods.size() - 1) renewed++;
                else months.get(YearMonth.from(end))[2]++;
            }
        }

        Map<String, Integer> byDuration = new LinkedHashMap<>();
        Map<String, Integer> byAge = new LinkedHashMap<>();
        Rules.AGE_BUCKETS.forEach(b -> byAge.put(b, 0));
        List<NewMember> rows = new ArrayList<>();
        for (MemberView m : fresh) {
            var periods = st.subsByMember().getOrDefault(m.id(), List.of());
            var first = periods.isEmpty() ? null : periods.getFirst();
            String duration = first == null ? "Sans abonnement" : durationLabel.getOrDefault(first.getMonths(), first.getMonths() + " mois");
            byDuration.merge(duration, 1, Integer::sum);
            byAge.merge(Rules.ageBucket(m.birthDate(), m.registrationDate()), 1, Integer::sum);
            rows.add(new NewMember(m.id(), m.code(), m.fullName(), m.registrationDate(), m.sports(),
                    first == null ? null : packName.get(first.getPackId())));
        }
        List<SportRegistrations> bySport = st.sports().stream()
                .map(s -> new SportRegistrations(s.id(), s.name(), s.color(), (int) fresh.stream().filter(m -> m.sportIds().contains(s.id())).count()))
                .filter(s -> s.count() > 0).sorted(Comparator.comparingInt(SportRegistrations::count).reversed()).toList();
        int departures = ended - renewed;
        return new RegistrationStats(from, to, fresh.size(), renewals, ended, renewed, departures, Rules.renewalRate(ended, renewed),
                fresh.size() - departures,
                months.entrySet().stream().map(e -> new RegistrationMonth(e.getKey().toString(), e.getValue()[0], e.getValue()[1], e.getValue()[2])).toList(),
                bySport,
                byDuration.entrySet().stream().map(e -> new LabelCount(e.getKey(), e.getValue()))
                        .sorted(Comparator.comparingInt(LabelCount::count).reversed()).toList(),
                byAge.entrySet().stream().map(e -> new LabelCount(e.getKey(), e.getValue())).toList(),
                rows.reversed());
    }
}
