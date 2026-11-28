package com.gymmanager.gym.service;

import com.gymmanager.gym.domain.*;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.*;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Loads all data and computes every derived value with {@link Rules}.
 * Volumes of a gym are small (hundreds of members): computing the whole state per request
 * guarantees each page reflects the latest data and settings, with nothing stored.
 */
@Service
public class ClubStateService {
    private final SettingsService settings;
    private final StaffFunctionRepository functionRepo;
    private final DurationRepository durationRepo;
    private final DiscountRepository discountRepo;
    private final StaffRepository staffRepo;
    private final SportRepository sportRepo;
    private final PackRepository packRepo;
    private final MemberRepository memberRepo;
    private final ActivityRepository activityRepo;
    private final ActivityRegistrationRepository registrationRepo;
    private final SubscriptionRepository subscriptionRepo;
    private final PaymentRepository paymentRepo;
    private final BusinessRepository businessRepo;
    private final BusinessPaymentRepository businessPaymentRepo;

    public ClubStateService(SettingsService settings, StaffFunctionRepository functionRepo, DurationRepository durationRepo,
                            DiscountRepository discountRepo, StaffRepository staffRepo, SportRepository sportRepo,
                            PackRepository packRepo, MemberRepository memberRepo, ActivityRepository activityRepo,
                            ActivityRegistrationRepository registrationRepo, SubscriptionRepository subscriptionRepo,
                            PaymentRepository paymentRepo, BusinessRepository businessRepo, BusinessPaymentRepository businessPaymentRepo) {
        this.settings = settings;
        this.functionRepo = functionRepo;
        this.durationRepo = durationRepo;
        this.discountRepo = discountRepo;
        this.staffRepo = staffRepo;
        this.sportRepo = sportRepo;
        this.packRepo = packRepo;
        this.memberRepo = memberRepo;
        this.activityRepo = activityRepo;
        this.registrationRepo = registrationRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.paymentRepo = paymentRepo;
        this.businessRepo = businessRepo;
        this.businessPaymentRepo = businessPaymentRepo;
    }

    private static <T> Map<Long, T> byId(List<T> list, Function<T, Long> id) {
        return list.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    static String staffName(Staff s) {
        return (s.getLastName() + " " + Objects.requireNonNullElse(s.getFirstName(), "")).trim();
    }

    @Transactional(readOnly = true)
    public ClubState load() {
        ClubConfig cfg = settings.config();
        var today = cfg.today();
        var now = cfg.now();

        List<FunctionView> functions = functionRepo.findAll().stream()
                .map(f -> new FunctionView(f.getId(), f.getLabel(), f.isActive()))
                .sorted(Comparator.comparing(FunctionView::label, String.CASE_INSENSITIVE_ORDER)).toList();
        Map<Long, FunctionView> fnById = byId(functions, FunctionView::id);

        List<DurationView> durations = durationRepo.findAll().stream()
                .map(d -> new DurationView(d.getId(), d.getLabel(), d.getMonths(), d.isActive()))
                .sorted(Comparator.comparingInt(DurationView::months).thenComparing(DurationView::label)).toList();
        Map<Long, DurationView> durById = byId(durations, DurationView::id);

        List<DiscountView> discounts = discountRepo.findAll().stream()
                .map(d -> new DiscountView(d.getId(), d.getCode(), d.getName(), d.getPercent().stripTrailingZeros(), d.isActive(), d.isSystem()))
                .sorted(Comparator.comparing(DiscountView::code)).toList();
        Map<Long, DiscountView> discById = byId(discounts, DiscountView::id);

        List<Staff> staffRows = staffRepo.findAll().stream().sorted(Comparator.comparing(Staff::getCode)).toList();
        Map<Long, Staff> staffById = byId(staffRows, Staff::getId);
        Function<Long, StaffRef> staffRef = id -> {
            Staff s = staffById.get(id);
            return s == null ? null : new StaffRef(s.getId(), s.getCode(), staffName(s), s.isActive());
        };

        List<Sport> sportRows = sportRepo.findAll().stream().sorted(Comparator.comparing(Sport::getCode)).toList();
        Map<Long, Sport> sportById = byId(sportRows, Sport::getId);
        Function<Long, SportRef> sportRef = id -> {
            Sport s = sportById.get(id);
            return s == null ? null : new SportRef(s.getId(), s.getCode(), s.getName(), s.getColor(), s.isActive());
        };
        Map<Long, List<Long>> coachesBySport = new HashMap<>();
        Map<Long, List<Long>> sportsByStaff = new HashMap<>();
        for (Sport s : sportRows) {
            List<Long> ids = s.getCoachIds().stream().sorted().toList();
            coachesBySport.put(s.getId(), ids);
            ids.forEach(st -> sportsByStaff.computeIfAbsent(st, k -> new ArrayList<>()).add(s.getId()));
        }

        List<PackView> packs = packRepo.findAll().stream().sorted(Comparator.comparing(Pack::getCode)).map(p -> {
            DurationView dur = durById.get(p.getDurationId());
            DiscountView disc = discById.get(p.getDiscountId());
            BigDecimal total = Rules.packTotal(p.getMonthlyPrice(), dur.months(), disc.percent(), cfg.rounding());
            return new PackView(p.getId(), p.getCode(), p.getName(), p.isActive(), p.getSportId(), sportRef.apply(p.getSportId()),
                    p.getDurationId(), dur, p.getMonthlyPrice(), p.getDiscountId(), disc, total);
        }).toList();
        Map<Long, PackView> packById = byId(packs, PackView::id);

        List<ActivityRegistration> regRows = registrationRepo.findAll().stream()
                .sorted(Comparator.comparing(ActivityRegistration::getId)).toList();
        Map<Long, List<Long>> activitiesByMember = new HashMap<>();
        Map<Long, Integer> regCount = new HashMap<>();
        for (ActivityRegistration r : regRows) {
            activitiesByMember.computeIfAbsent(r.getMemberId(), k -> new ArrayList<>()).add(r.getActivityId());
            regCount.merge(r.getActivityId(), 1, Integer::sum);
        }

        // Subscription periods and payments
        List<Payment> allPayments = paymentRepo.findAll();
        Set<Long> subsWithPayments = new HashSet<>();
        allPayments.forEach(x -> subsWithPayments.add(x.getSubscriptionId()));
        // The price of a period follows the rules and settings until its first payment, then it is frozen.
        List<Subscription> subRows = subscriptionRepo.findAll().stream()
                .map(x -> subsWithPayments.contains(x.getId()) ? x : livePriced(x, packById, discById, cfg))
                .sorted(Comparator.comparing(Subscription::getStartDate).thenComparing(Subscription::getId)).toList();
        Map<Long, List<Subscription>> subsByMember = new HashMap<>();
        subRows.forEach(x -> subsByMember.computeIfAbsent(x.getMemberId(), k -> new ArrayList<>()).add(x));
        List<Payment> payRows = allPayments.stream()
                .sorted(Comparator.comparing(Payment::getPaidOn).thenComparing(Payment::getId)).toList();
        Map<Long, BigDecimal> paidBySub = new HashMap<>();
        payRows.stream().filter(x -> !x.isCancelled()).forEach(x -> paidBySub.merge(x.getSubscriptionId(), x.getAmount(), BigDecimal::add));

        List<Business> businessRows = businessRepo.findAll();
        List<BusinessPayment> businessPayments = businessPaymentRepo.findAll();
        Map<Long, MemberServices> servicesByMember = memberServices(businessRows, businessPayments, YearMonth.from(today));
        MemberServices noServices = new MemberServices(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);

        List<MemberView> members = memberRepo.findAll().stream().sorted(Comparator.comparing(Member::getCode)).map(m -> {
            List<Subscription> periods = subsByMember.getOrDefault(m.getId(), List.of());
            List<Long> sportIds = m.getSportIds().stream().sorted().toList();
            MemberServices services = servicesByMember.getOrDefault(m.getId(), noServices);
            if (periods.isEmpty()) return withoutSubscription(m, sportIds, sportRef, activitiesByMember, services);
            Subscription cur = periods.getLast();
            PackView pack = packById.get(cur.getPackId());
            DiscountView disc = shownDiscount(cur, pack, discById);
            // linked business items count in the amounts due and paid, never in the subscription days
            BigDecimal totalDue = periods.stream().map(Subscription::getAmount).reduce(services.due(), BigDecimal::add);
            BigDecimal totalPaid = periods.stream().map(x -> paidBySub.getOrDefault(x.getId(), BigDecimal.ZERO)).reduce(services.paid(), BigDecimal::add);
            Rules.Coverage coverage = Rules.coverage(periods.stream().map(x -> span(x, paidBySub)).toList(), today);
            Rules.MemberComputed c = Rules.computeMember(coverage, cur.getAmount(), totalDue, totalPaid, m.isActive(), cfg.pricing());
            return new MemberView(m.getId(), m.getCode(), m.getLastName(), m.getFirstName(), m.getPhone(),
                    m.getBirthDate(), m.getRegistrationDate(), sportIds,
                    sportIds.stream().map(sportRef).filter(Objects::nonNull).toList(),
                    cur.getId(), cur.getStartDate(), periods.size(),
                    pack.id(), new PackRef(pack.id(), pack.code(), pack.name(), pack.active(), cur.getMonths(), pack.total()),
                    disc.id(), disc, cur.getCustomAmount(), m.getInsurance(), m.getPhoto() != null, m.getNotes(), m.isActive(),
                    activitiesByMember.getOrDefault(m.getId(), List.of()),
                    c.price(), services.monthly().setScale(2, RoundingMode.HALF_UP), c.endDate(), c.remainingDays(), c.paid(), c.balance(), c.paymentStatus(), c.active(), c.situation(), c.state());
        }).toList();
        Map<Long, MemberView> memberById = byId(members, MemberView::id);
        Map<Long, Subscription> subById = byId(subRows, Subscription::getId);

        List<PaymentView> payments = payRows.stream().map(x -> {
            MemberView m = memberById.get(x.getMemberId());
            Subscription sub = subById.get(x.getSubscriptionId());
            return new PaymentView(x.getId(), x.getReceiptNumber(), m.id(), m.code(), m.fullName(), sub.getId(),
                    packById.get(sub.getPackId()).name(), sub.getStartDate(), Rules.subscriptionEnd(sub.getStartDate(), sub.getMonths()),
                    x.getAmount(), x.getMethod(), x.getMethod().label(), x.getPaidOn(), x.getNote(), x.getCreatedAt(), x.getCreatedBy(),
                    x.getUpdatedAt(), x.getUpdatedBy(), x.isCancelled(), x.getCancelledAt(), x.getCancelledBy(), x.getCancelReason());
        }).toList();
        Map<Long, List<PaymentView>> paymentsBySub = new HashMap<>();
        payments.forEach(x -> paymentsBySub.computeIfAbsent(x.subscriptionId(), k -> new ArrayList<>()).add(x));
        List<SubscriptionView> subscriptions = subRows.stream().map(x -> {
            BigDecimal paid = paidBySub.getOrDefault(x.getId(), BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            List<Subscription> periods = subsByMember.get(x.getMemberId());
            DiscountView d = shownDiscount(x, packById.get(x.getPackId()), discById);
            return new SubscriptionView(x.getId(), x.getMemberId(), x.getPackId(), packById.get(x.getPackId()).name(),
                    d.id(), d.name(), x.getStartDate(), Rules.subscriptionEnd(x.getStartDate(), x.getMonths()), x.getMonths(),
                    x.getAmount(), paid, Rules.balance(x.getAmount(), paid), Rules.paymentStatus(x.getAmount(), paid),
                    periods.getLast().getId().equals(x.getId()), Rules.countedDays(span(x, paidBySub), today), x.getCreatedAt(), x.getCreatedBy(),
                    paymentsBySub.getOrDefault(x.getId(), List.of()));
        }).toList();

        List<SportView> sports = sportRows.stream().map(s -> {
            int active = (int) members.stream().filter(m -> m.activeMember() && m.sportIds().contains(s.getId())).count();
            Rules.FillStats fs = Rules.sportStats(s.getCapacity(), active);
            List<ScheduleSlot> slots = s.getSchedules().stream()
                    .sorted(Comparator.comparingInt(ScheduleSlot::getDayOfWeek).thenComparing(ScheduleSlot::getStartTime)).toList();
            return new SportView(s.getId(), s.getCode(), s.getName(), s.getColor(), s.getCapacity(), s.getMonthlyPrice(), s.isActive(),
                    coachesBySport.get(s.getId()), coachesBySport.get(s.getId()).stream().map(staffRef).filter(Objects::nonNull).toList(),
                    slots.stream().map(x -> new SlotView(x.getDayOfWeek(), x.getStartTime(), x.getEndTime())).toList(),
                    Rules.summarizeSchedules(slots.stream().map(x -> new Rules.Slot(DayOfWeek.of(x.getDayOfWeek()), x.getStartTime(), x.getEndTime())).toList()),
                    fs.count(), fs.fillPercent());
        }).toList();

        Map<Long, String> sportNames = new HashMap<>();
        sportRows.forEach(x -> sportNames.put(x.getId(), x.getName()));
        Map<Long, String> packNames = new HashMap<>();
        packs.forEach(x -> packNames.put(x.id(), x.name()));
        List<ActivityView> activities = activityRepo.findAll().stream()
                .sorted(Comparator.comparing(Activity::getStartsAt).thenComparing(Activity::getCode)).map(a -> {
                    Rules.ActivityStats st = Rules.activityStats(a.getMaxPlaces(), regCount.getOrDefault(a.getId(), 0));
                    BigDecimal revenue = a.getPrice().multiply(BigDecimal.valueOf(st.count())).setScale(2, RoundingMode.HALF_UP);
                    Staff manager = staffById.get(a.getManagerId());
                    // internal staff (club owners) earn nothing, even with a percent saved before they became internal
                    BigDecimal percent = a.getPrice().signum() > 0 && manager != null && !manager.isInternal() ? a.getManagerPercent() : null;
                    BigDecimal share = percent == null || !a.isActive() ? null : Rules.activityManagerShare(revenue, percent);
                    return new ActivityView(a.getId(), a.getCode(), a.getName(), a.getDescription(), a.getPrice(), a.getStartsAt(),
                            a.getLocation(), a.getMaxPlaces(), a.getManagerId(), staffRef.apply(a.getManagerId()), a.isActive(),
                            a.getPrice().signum() > 0, a.getStartsAt().isBefore(now), st.count(), st.remaining(), st.full(),
                            revenue, percent == null ? null : percent.stripTrailingZeros(), share);
                }).toList();
        YearMonth currentMonth = YearMonth.from(today);
        List<StaffView> staff = staffRows.stream().map(s -> {
            SalaryComputation sc = salary(s.getId(), s.getPayMode(), s.isInternal() ? null : s.getFixedSalary(), members, subsByMember,
                    coachesBySport, sportNames, packNames, cfg, today);
            List<Long> coached = sportsByStaff.getOrDefault(s.getId(), List.of());
            // distinct members: one enrolled in two coached sports counts once; null when the staff member coaches nothing
            Integer enrolled = coached.isEmpty() ? null : (int) members.stream()
                    .filter(m -> m.activeMember() && m.paymentStatus() != Rules.PaymentStatus.IMPAYE)
                    .filter(m -> m.sportIds().stream().anyMatch(coached::contains)).count();
            return new StaffView(s.getId(), s.getCode(), s.getLastName(), s.getFirstName(), staffName(s), s.getPhone(),
                    s.getFunctionId(), fnById.get(s.getFunctionId()), coached, coached.stream().map(sportRef).toList(),
                    s.isInternal(), s.getPayMode(), s.getFixedSalary(), s.isActive(), sc.amount(), sc.detail(), enrolled,
                    activityShareTotal(activityShares(activities, s.getId(), currentMonth)), s.getPhoto() != null);
        }).toList();

        Map<Long, ActivityView> actById = byId(activities, ActivityView::id);

        List<RegistrationView> registrations = regRows.stream().map(r -> {
            MemberView m = memberById.get(r.getMemberId());
            ActivityView a = actById.get(r.getActivityId());
            return new RegistrationView(r.getId(), m.id(), a.id(), r.getCreatedAt(), m.code(), m.fullName(),
                    a.code(), a.name(), a.startsAt(), a.location());
        }).toList();

        return new ClubState(cfg, today, now, functions, durations, discounts, packs, members, sports, staff, activities, registrations,
                subscriptions, payments, coachesBySport, subsByMember, businessRows, businessPayments);
    }

    /**
     * Business items linked to a member: {@code monthly} = amounts due this month (added to the shown price), {@code due} =
     * Σ collected + Σ known amounts of the months due up to now and not collected, {@code paid} = Σ collected.
     */
    record MemberServices(BigDecimal monthly, BigDecimal due, BigDecimal paid) {
    }

    static Map<Long, MemberServices> memberServices(List<Business> items, List<BusinessPayment> payments, YearMonth current) {
        Map<Long, List<BusinessPayment>> byItem = payments.stream().collect(Collectors.groupingBy(BusinessPayment::getBusinessId));
        Map<Long, MemberServices> out = new HashMap<>();
        for (Business b : items) {
            if (b.getMemberId() == null) continue;
            List<BusinessPayment> pays = byItem.getOrDefault(b.getId(), List.of());
            Set<String> collected = pays.stream().map(BusinessPayment::getPeriod).collect(Collectors.toSet());
            BigDecimal paid = pays.stream().map(BusinessPayment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal monthly = BigDecimal.ZERO;
            BigDecimal unpaid = BigDecimal.ZERO;
            if (b.getAmount() != null) {
                // months of an automatic item not settled yet are collected when read by the business page: not owed
                YearMonth autoUntil = b.isAutoPay() && b.getAutoPaidUntil() != null ? YearMonth.parse(b.getAutoPaidUntil()) : null;
                for (YearMonth ym : BusinessDues.monthsDue(b, current)) {
                    if (!collected.contains(ym.toString()) && (autoUntil == null || !ym.isAfter(autoUntil))) unpaid = unpaid.add(b.getAmount());
                }
                if (BusinessDues.isDue(b, current, current)) monthly = b.getAmount();
            }
            MemberServices add = new MemberServices(monthly, paid.add(unpaid), paid);
            out.merge(b.getMemberId(), add, (x, y) -> new MemberServices(x.monthly().add(y.monthly()), x.due().add(y.due()), x.paid().add(y.paid())));
        }
        return out;
    }

    private static Rules.PeriodSpan span(Subscription x, Map<Long, BigDecimal> paidBySub) {
        return new Rules.PeriodSpan(x.getStartDate(), x.getMonths(), x.getAmount(), paidBySub.getOrDefault(x.getId(), BigDecimal.ZERO));
    }

    private static MemberView withoutSubscription(Member m, List<Long> sportIds, Function<Long, SportRef> sportRef,
                                                  Map<Long, List<Long>> activitiesByMember, MemberServices services) {
        BigDecimal paid = services.paid().setScale(2, RoundingMode.HALF_UP);
        return new MemberView(m.getId(), m.getCode(), m.getLastName(), m.getFirstName(), m.getPhone(),
                m.getBirthDate(), m.getRegistrationDate(), sportIds,
                sportIds.stream().map(sportRef).filter(Objects::nonNull).toList(),
                null, null, 0, null, null, null, null, null, m.getInsurance(), m.getPhoto() != null, m.getNotes(), m.isActive(),
                activitiesByMember.getOrDefault(m.getId(), List.of()),
                null, services.monthly().setScale(2, RoundingMode.HALF_UP), null, null, paid, Rules.balance(services.due(), paid),
                null, false, Rules.Situation.NONE, Rules.MemberState.NONE);
    }

    /** The period's discount; a typed price shows as a "manual" discount whose percentage is measured against the pack price. */
    private static DiscountView shownDiscount(Subscription x, PackView pack, Map<Long, DiscountView> discById) {
        DiscountView d = discById.get(x.getDiscountId());
        if (x.getCustomAmount() == null) return d;
        BigDecimal pct = Rules.discountPercent(pack.total(), x.getCustomAmount());
        return new DiscountView(d.id(), "", "Montant saisi (−" + pct.toPlainString().replace('.', ',') + " %)", pct, true, false);
    }

    /** Detached copy of a period priced with the current rules (RG-PRIX) — used while nothing has been paid. */
    static Subscription livePriced(Subscription x, Map<Long, PackView> packById, Map<Long, DiscountView> discById, ClubConfig cfg) {
        PackView pack = packById.get(x.getPackId());
        DiscountView disc = discById.get(x.getDiscountId());
        Subscription c = new Subscription();
        c.setId(x.getId());
        c.setMemberId(x.getMemberId());
        c.setPackId(x.getPackId());
        c.setDiscountId(x.getDiscountId());
        c.setStartDate(x.getStartDate());
        c.setMonths(pack.duration().months());
        c.setCustomAmount(x.getCustomAmount());
        c.setAmount(x.getCustomAmount() != null ? x.getCustomAmount()
                : Rules.memberPrice(pack.monthlyPrice(), pack.duration().months(), pack.discount().percent(), disc.percent(),
                cfg.cumulative(), cfg.rounding()));
        c.setCreatedAt(x.getCreatedAt());
        c.setCreatedBy(x.getCreatedBy());
        return c;
    }

    /** Paying activities of {@code month} managed by {@code staffId} that earn them a share, by date. */
    public static List<ActivityShareView> activityShares(List<ActivityView> activities, Long staffId, YearMonth month) {
        return activities.stream()
                .filter(a -> a.managerShare() != null && staffId.equals(a.managerId()) && YearMonth.from(a.startsAt()).equals(month))
                .map(a -> new ActivityShareView(a.id(), a.code(), a.name(), a.startsAt().toLocalDate(), a.registrationCount(), a.price(),
                        a.revenue(), a.managerPercent(), a.managerShare()))
                .toList();
    }

    /** Sum of the shares, null when there is no activity (shown as nothing rather than 0). */
    public static BigDecimal activityShareTotal(List<ActivityShareView> shares) {
        return shares.isEmpty() ? null
                : shares.stream().map(ActivityShareView::amount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    public record SalaryComputation(BigDecimal amount, SalaryDetail detail) {
    }

    /** RG-SALAIRE of one staff member for the month containing {@code day}, with its verifiable detail. */
    public static SalaryComputation salary(Long staffId, PayMode mode, BigDecimal fixed, List<MemberView> members,
                                           Map<Long, List<Subscription>> subsByMember, Map<Long, List<Long>> coachesBySport,
                                           Map<Long, String> sportNames, Map<Long, String> packNames, ClubConfig cfg, java.time.LocalDate day) {
        List<Rules.MemberFacts> facts = salaryFacts(members, subsByMember);
        Map<Long, MemberView> memberById = new HashMap<>();
        members.forEach(m -> memberById.put(m.id(), m));
        // internal staff (no pay mode) earn nothing: a fixed salary of 0
        Rules.PayMode payMode = mode == null ? Rules.PayMode.FIXED : Rules.PayMode.valueOf(mode.name());
        Rules.SalaryResult r = Rules.computeSalary(staffId, payMode, mode == null ? BigDecimal.ZERO : fixed, facts, coachesBySport, cfg.salaryParams(), day);
        List<SalaryLineView> lines = r.lines().stream().map(l -> {
            MemberView m = memberById.get(l.memberId());
            Rules.MemberFacts f = l.period();
            String pack = subsByMember.get(m.id()).stream().filter(x -> x.getStartDate().equals(f.start()))
                    .reduce((a, b) -> b).map(x -> packNames.get(x.getPackId())).orElse(m.pack() == null ? null : m.pack().name());
            return new SalaryLineView(m.id(), m.code(), m.fullName(), pack, f.start(), f.months(), f.amount(),
                    l.price().setScale(2, RoundingMode.HALF_UP),
                    l.factor().setScale(4, RoundingMode.HALF_UP).stripTrailingZeros(),
                    l.sportIds().stream().map(sportNames::get).toList());
        }).toList();
        return new SalaryComputation(r.amount(), new SalaryDetail(YearMonth.from(day).toString(), r.window().from(), r.window().to(),
                cfg.salaryCutoffDay(), cfg.salaryShareRaw(),
                cfg.salaryShare().asPercent(), r.base(), cfg.multiCoach(), lines));
    }

    /**
     * Facts for RG-SALAIRE for the month of {@code day}: for each member, the latest subscription period
     * (first registration or renewal) starting inside the calculation window, with its price.
     */
    /** Every subscription period of every member: RG-SALAIRE picks those covering the month. */
    static List<Rules.MemberFacts> salaryFacts(List<MemberView> members, Map<Long, List<Subscription>> subsByMember) {
        List<Rules.MemberFacts> facts = new ArrayList<>();
        for (MemberView m : members) {
            for (Subscription x : subsByMember.getOrDefault(m.id(), List.of())) {
                facts.add(new Rules.MemberFacts(m.id(), new HashSet<>(m.sportIds()), x.getStartDate(), x.getMonths(), x.getAmount(), m.active()));
            }
        }
        return facts;
    }

    /** Message and WhatsApp link proposed for a member, according to their situation. */
    public static Alert alertFor(MemberView m, ClubConfig cfg) {
        String template = switch (m.situation()) {
            case EXPIRED -> cfg.expiredTemplate();
            case SOON, FOLLOW -> cfg.soonTemplate();
            case OK, NONE -> null;
        };
        if (template == null) return new Alert("", null);
        long days = m.situation() == Rules.Situation.EXPIRED ? -m.remainingDays() : m.remainingDays();
        Map<String, Object> vars = new HashMap<>();
        vars.put("prenom", m.firstName());
        vars.put("nom", m.lastName());
        vars.put("jours", days);
        vars.put("date_fin", String.format("%02d/%02d/%d", m.endDate().getDayOfMonth(), m.endDate().getMonthValue(), m.endDate().getYear()));
        vars.put("club", cfg.clubName());
        vars.put("pack", m.pack().name());
        String message = Rules.renderTemplate(template, vars);
        return new Alert(message, Rules.whatsappLink(cfg.dialCode(), m.phone(), message));
    }

    public record Alert(String message, String link) {
    }
}
