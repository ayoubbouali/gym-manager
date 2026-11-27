package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.domain.Charge;
import com.gymmanager.gym.domain.ChargeCategory;
import com.gymmanager.gym.domain.ChargePayment;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.repository.ChargePaymentRepository;
import com.gymmanager.gym.repository.ChargeRepository;
import com.gymmanager.gym.repository.SalaryPaymentRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.ChargePaymentRequest;
import com.gymmanager.gym.web.dto.Requests.ChargeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Club charges (RG-CHARGE): a permanent charge is due every month from its creation month until stopped, its amount typed
 * when paid, or settled automatically each month with a fixed amount; a one-off charge concerns one month, with an amount
 * known at creation or typed when paid.
 * A charge counts in the month it concerns, like salaries; revenue counts at its payment date.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ChargeService {
    private final ChargeRepository charges;
    private final ChargePaymentRepository payments;
    private final SalaryPaymentRepository salaryPayments;
    private final ClubStateService stateService;
    private final SettingsService settings;
    private final BusinessService business;

    static final String AUTO_NOTE = "Règlement automatique";
    static final String AUTO_USER = "automatique";

    public record ChargePaymentView(Long id, Long chargeId, String period, BigDecimal amount, PaymentMethod method, String methodLabel,
                                    LocalDate paidOn, String note, LocalDateTime createdAt, String createdBy,
                                    LocalDateTime updatedAt, String updatedBy) {
    }

    /** {@code active}: a permanent charge not stopped, or any one-off charge. */
    public record ChargeView(Long id, String label, ChargeCategory category, String categoryLabel, boolean permanent, String period,
                             BigDecimal amount, String startPeriod, String endPeriod, boolean active, boolean autoPay,
                             PaymentMethod autoMethod, String note, int paymentCount, BigDecimal totalPaid) {
    }

    /**
     * A charge due for a month: paid ({@code payment} set) or to pay ({@code expected}: known amount, else null).
     * {@code scheduled}: a future month of an automatic charge, settled when it comes, so not to pay.
     */
    public record ChargeDue(ChargeView charge, String period, BigDecimal expected, ChargePaymentView payment, boolean scheduled) {
    }

    public record ChargeMonth(String period, boolean currentMonth, List<ChargeDue> rows, BigDecimal totalPaid,
                              int toPayCount, BigDecimal toPayKnown) {
    }

    public record CategoryAmount(ChargeCategory category, String label, BigDecimal amount) {
    }

    public record MonthResult(String month, BigDecimal revenue, BigDecimal salaries, BigDecimal charges, BigDecimal profit) {
    }

    /**
     * Charges of the months {@code from}..{@code to} (never beyond the current month): paid and still to pay, and the
     * profit = revenue cashed − salaries paid − charges paid.
     */
    public record ChargeStats(String from, String to, BigDecimal totalCharges, int toPayCount, BigDecimal toPayKnown,
                              BigDecimal revenue, BigDecimal salaries, BigDecimal profit, List<MonthResult> monthly,
                              List<CategoryAmount> byCategory, List<ChargeDue> toPay, List<ChargeDue> paid) {
    }

    // ------------------------------------------------------------------ charges

    public List<ChargeView> list() {
        settle();
        Map<Long, List<ChargePayment>> byCharge = paymentsByCharge();
        return charges.findAll().stream().map(c -> view(c, byCharge.getOrDefault(c.getId(), List.of())))
                .sorted(Comparator.comparing(ChargeView::permanent).reversed().thenComparing(ChargeView::label, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public ChargeView create(ChargeRequest r, String username) {
        ClubConfig cfg = settings.config();
        Charge c = new Charge();
        c.setPermanent(Boolean.TRUE.equals(Check.required(r.permanent(), "permanent", "Type de charge")));
        apply(c, r, cfg);
        c.setCreatedAt(cfg.now());
        c.setCreatedBy(username);
        YearMonth current = YearMonth.from(cfg.today());
        if (c.isPermanent()) c.setStartPeriod(current.toString());
        c = charges.saveAndFlush(c);
        if (c.isAutoPay()) {
            startAutoPay(c, r, current, username);
        } else if (c.isPermanent() && r.amount() != null) {
            // amount typed for this month only: the current month is paid, the next ones are typed when paid
            pay(new ChargePaymentRequest(c.getId(), current.toString(), r.amount(), r.method(), r.paidOn(), ""), username);
        } else if (!c.isPermanent() && Boolean.TRUE.equals(r.payNow())) {
            if (c.getAmount() == null) throw ApiException.invalid("amount", "Saisissez le montant pour régler la charge.");
            pay(new ChargePaymentRequest(c.getId(), c.getPeriod(), c.getAmount(), r.method(), r.paidOn(), ""), username);
        }
        return one(c.getId());
    }

    public ChargeView update(Long id, ChargeRequest r, String username) {
        ClubConfig cfg = settings.config();
        Charge c = find(id);
        String before = c.getPeriod();
        boolean wasAuto = c.isAutoPay();
        apply(c, r, cfg);
        if (c.isAutoPay() && !wasAuto) startAutoPay(c, r, YearMonth.from(cfg.today()), username);
        if (!c.isPermanent() && !Objects.equals(before, c.getPeriod()) && payments.existsByChargeId(id)) {
            throw ApiException.invalid("period", "Cette charge est déjà réglée : supprimez le règlement pour changer son mois.");
        }
        return one(id);
    }

    private void apply(Charge c, ChargeRequest r, ClubConfig cfg) {
        c.setLabel(Check.text(r.label(), "label", "Libellé", 120, true));
        c.setCategory(Check.required(r.category(), "category", "Catégorie"));
        c.setNote(Check.text(r.note(), "note", "Note", 500, false));
        if (c.isPermanent()) {
            boolean auto = Boolean.TRUE.equals(r.autoPay());
            c.setAutoPay(auto);
            c.setAmount(auto ? positive(r.amount(), "Saisissez le montant réglé chaque mois.") : null);
            c.setAutoMethod(auto ? Check.required(r.method(), "method", "Mode de paiement") : null);
            if (!auto) c.setAutoPaidUntil(null);
            return;
        }
        c.setPeriod(PayrollService.parsePeriod(Check.required(r.period(), "period", "Mois")).toString());
        if (r.amount() != null && Check.amount(r.amount(), "amount", "Montant").signum() == 0) {
            throw ApiException.invalid("amount", "Le montant doit être supérieur à 0 (laissez vide s'il n'est pas connu).");
        }
        c.setAmount(r.amount() == null ? null : r.amount().setScale(2, RoundingMode.HALF_UP));
    }

    private static BigDecimal positive(BigDecimal amount, String missing) {
        if (amount == null) throw ApiException.invalid("amount", missing);
        if (Check.amount(amount, "amount", "Montant").signum() == 0) throw ApiException.invalid("amount", "Le montant doit être supérieur à 0.");
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    /** Automatic payment switched on (creation, edit, resume): the current month is paid now, the next ones as they come. */
    private void startAutoPay(Charge c, ChargeRequest r, YearMonth current, String username) {
        if (!payments.existsByChargeIdAndPeriod(c.getId(), current.toString())) {
            pay(new ChargePaymentRequest(c.getId(), current.toString(), c.getAmount(), c.getAutoMethod(), r == null ? null : r.paidOn(),
                    AUTO_NOTE), username);
        }
        c.setAutoPaidUntil(current.toString());
    }

    /** Stops a permanent charge after the current month, or makes it due again. Its payments are kept. */
    public ChargeView setActive(Long id, boolean active, String username) {
        Charge c = find(id);
        if (!c.isPermanent()) throw ApiException.badRequest("Seule une charge permanente peut être arrêtée.");
        YearMonth current = YearMonth.from(settings.config().today());
        if (!active) settle();
        c.setEndPeriod(active ? null : current.toString());
        // not settled for the months it was stopped: they stay to pay, like those of a charge paid by hand
        if (active && c.isAutoPay()) startAutoPay(c, null, current, username);
        return one(id);
    }

    /**
     * Pays the automatic charges for every month since their last one, up to the current month, dated the 1st of the month.
     * Run before reading charges; a payment deleted by hand is not recreated ({@code autoPaidUntil}).
     */
    public void settle() {
        ClubConfig cfg = settings.config();
        YearMonth current = YearMonth.from(cfg.today());
        for (Charge c : charges.findAll()) {
            if (!c.isAutoPay() || c.getAutoPaidUntil() == null) continue;
            YearMonth last = end(c) == null || end(c).isAfter(current) ? current : end(c);
            YearMonth ym = YearMonth.parse(c.getAutoPaidUntil()).plusMonths(1);
            if (ym.isAfter(last)) continue;
            for (; !ym.isAfter(last); ym = ym.plusMonths(1)) {
                if (payments.existsByChargeIdAndPeriod(c.getId(), ym.toString())) continue;
                ChargePayment p = new ChargePayment();
                p.setChargeId(c.getId());
                p.setPeriod(ym.toString());
                p.setAmount(c.getAmount());
                p.setMethod(c.getAutoMethod());
                p.setPaidOn(ym.atDay(1));
                p.setNote(AUTO_NOTE);
                p.setCreatedAt(cfg.now());
                p.setCreatedBy(AUTO_USER);
                payments.save(p);
            }
            c.setAutoPaidUntil(last.toString());
        }
    }

    public void delete(Long id) {
        Charge c = find(id);
        if (payments.existsByChargeId(id)) {
            throw ApiException.conflict(c.isPermanent()
                    ? "Cette charge a des règlements : arrêtez-la plutôt, ou supprimez d'abord ses règlements."
                    : "Cette charge est réglée : supprimez d'abord son règlement.");
        }
        charges.delete(c);
    }

    // ------------------------------------------------------------------ payments

    public ChargePaymentView pay(ChargePaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        Charge c = find(Check.required(r.chargeId(), "chargeId", "Charge"));
        YearMonth ym;
        if (c.isPermanent()) {
            ym = PayrollService.parsePeriod(r.period());
            // a coming month may be paid in advance
            if (!Rules.isChargeDue(YearMonth.parse(c.getStartPeriod()), end(c), ym, ym)) {
                throw ApiException.invalid("period", "Cette charge n'est pas due ce mois-là.");
            }
        } else {
            ym = YearMonth.parse(c.getPeriod());
        }
        if (payments.existsByChargeIdAndPeriod(c.getId(), ym.toString())) {
            throw ApiException.badRequest("Cette charge est déjà réglée pour ce mois.");
        }
        ChargePayment p = new ChargePayment();
        p.setChargeId(c.getId());
        p.setPeriod(ym.toString());
        fill(p, r, cfg);
        p.setCreatedAt(cfg.now());
        p.setCreatedBy(username);
        return view(payments.save(p));
    }

    /** Corrects a payment (MANAGE_CHARGES): amount, method, date and note; the month never changes. */
    public ChargePaymentView updatePayment(Long id, ChargePaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        ChargePayment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Règlement introuvable."));
        fill(p, r, cfg);
        p.setUpdatedAt(cfg.now());
        p.setUpdatedBy(username);
        return view(p);
    }

    /** Deletes a payment (MANAGE_CHARGES): the month is to pay again. */
    public void deletePayment(Long id) {
        payments.delete(payments.findById(id).orElseThrow(() -> ApiException.notFound("Règlement introuvable.")));
    }

    private static void fill(ChargePayment p, ChargePaymentRequest r, ClubConfig cfg) {
        BigDecimal amount = Check.amount(r.amount(), "amount", "Montant");
        if (amount.signum() == 0) throw ApiException.invalid("amount", "Le montant doit être supérieur à 0.");
        LocalDate paidOn = r.paidOn() == null ? cfg.today() : r.paidOn();
        if (paidOn.isAfter(cfg.today())) throw ApiException.invalid("paidOn", "La date de règlement ne peut pas être dans le futur.");
        p.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(paidOn);
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
    }

    // ------------------------------------------------------------------ month and statistics

    /** Charges of a month, past or coming: permanent ones due that month and one-off ones of that month, paid or not. */
    public ChargeMonth month(String period) {
        settle();
        YearMonth current = YearMonth.from(settings.config().today());
        YearMonth ym = period == null || period.isBlank() ? current : PayrollService.parsePeriod(period);
        List<ChargeDue> rows = dues(ym, ym, ym, current);
        List<ChargeDue> toPay = rows.stream().filter(d -> d.payment() == null && !d.scheduled()).toList();
        return new ChargeMonth(ym.toString(), ym.equals(current), rows, sum(rows.stream().filter(d -> d.payment() != null).map(d -> d.payment().amount())),
                toPay.size(), sum(toPay.stream().map(ChargeDue::expected).filter(Objects::nonNull)));
    }

    public ChargeStats stats(String fromPeriod, String toPeriod) {
        settle();
        business.settle();
        ClubState st = stateService.load();
        YearMonth current = YearMonth.from(st.today());
        boolean defaults = fromPeriod == null || fromPeriod.isBlank() || toPeriod == null || toPeriod.isBlank();
        YearMonth from = defaults ? current : PayrollService.parsePeriod(fromPeriod);
        YearMonth to = defaults ? current : PayrollService.parsePeriod(toPeriod);
        if (from.isAfter(to)) throw ApiException.badRequest("Le mois de début doit précéder le mois de fin.");
        if (to.isAfter(current)) to = current;
        if (from.isAfter(to)) throw ApiException.badRequest("La période ne peut pas être entièrement dans le futur.");
        if (from.plusMonths(PayrollService.MAX_STATS_MONTHS - 1).isBefore(to)) {
            throw ApiException.badRequest("Période trop longue (" + PayrollService.MAX_STATS_MONTHS / 12 + " ans maximum).");
        }
        List<ChargeDue> rows = dues(from, to, current, current);
        List<ChargeDue> paid = rows.stream().filter(d -> d.payment() != null).toList();
        List<ChargeDue> toPay = rows.stream().filter(d -> d.payment() == null).toList();

        Map<YearMonth, BigDecimal> revenue = new HashMap<>();
        Rules.revenueByMonth(InsightService.allSales(st), from.atDay(1), to.atEndOfMonth()).forEach(m -> revenue.put(m.month(), m.amount()));
        Map<String, BigDecimal> salaries = new HashMap<>();
        salaryPayments.findAll().stream().filter(p -> !p.isCancelled())
                .forEach(p -> salaries.merge(p.getPeriod(), p.getAmount(), BigDecimal::add));
        Map<String, BigDecimal> chargesByMonth = new HashMap<>();
        paid.forEach(d -> chargesByMonth.merge(d.period(), d.payment().amount(), BigDecimal::add));
        List<MonthResult> monthly = new ArrayList<>();
        for (YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
            BigDecimal rev = revenue.getOrDefault(ym, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal sal = salaries.getOrDefault(ym.toString(), BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal chg = chargesByMonth.getOrDefault(ym.toString(), BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            monthly.add(new MonthResult(ym.toString(), rev, sal, chg, rev.subtract(sal).subtract(chg)));
        }
        Map<ChargeCategory, BigDecimal> byCat = new EnumMap<>(ChargeCategory.class);
        paid.forEach(d -> byCat.merge(d.charge().category(), d.payment().amount(), BigDecimal::add));
        BigDecimal totalRevenue = sum(monthly.stream().map(MonthResult::revenue));
        BigDecimal totalSalaries = sum(monthly.stream().map(MonthResult::salaries));
        BigDecimal totalCharges = sum(monthly.stream().map(MonthResult::charges));
        return new ChargeStats(from.toString(), to.toString(), totalCharges, toPay.size(),
                sum(toPay.stream().map(ChargeDue::expected).filter(Objects::nonNull)),
                totalRevenue, totalSalaries, totalRevenue.subtract(totalSalaries).subtract(totalCharges), monthly,
                byCat.entrySet().stream().map(e -> new CategoryAmount(e.getKey(), e.getKey().label(), e.getValue().setScale(2, RoundingMode.HALF_UP)))
                        .sorted(Comparator.comparing(CategoryAmount::amount).reversed()).toList(),
                toPay, paid.reversed());
    }

    /** Every (charge, month) due in from..to; permanent charges are due up to {@code lastDue} at most. */
    private List<ChargeDue> dues(YearMonth from, YearMonth to, YearMonth lastDue, YearMonth current) {
        Map<Long, List<ChargePayment>> byCharge = paymentsByCharge();
        List<ChargeDue> out = new ArrayList<>();
        for (Charge c : charges.findAll()) {
            List<ChargePayment> list = byCharge.getOrDefault(c.getId(), List.of());
            ChargeView v = view(c, list);
            Map<String, ChargePayment> byPeriod = list.stream().collect(Collectors.toMap(ChargePayment::getPeriod, Function.identity()));
            for (YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
                boolean due = c.isPermanent() ? Rules.isChargeDue(YearMonth.parse(c.getStartPeriod()), end(c), ym, lastDue)
                        : c.getPeriod().equals(ym.toString());
                if (!due) continue;
                ChargePayment p = byPeriod.get(ym.toString());
                out.add(new ChargeDue(v, ym.toString(), c.getAmount(), p == null ? null : view(p), p == null && c.isAutoPay() && ym.isAfter(current)));
            }
        }
        out.sort(Comparator.comparing(ChargeDue::period).thenComparing(d -> !d.charge().permanent())
                .thenComparing(d -> d.charge().label(), String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    // ------------------------------------------------------------------ helpers

    private Charge find(Long id) {
        return charges.findById(id).orElseThrow(() -> ApiException.notFound("Charge introuvable."));
    }

    private static YearMonth end(Charge c) {
        return c.getEndPeriod() == null ? null : YearMonth.parse(c.getEndPeriod());
    }

    private ChargeView one(Long id) {
        Charge c = find(id);
        return view(c, paymentsByCharge().getOrDefault(id, List.of()));
    }

    private Map<Long, List<ChargePayment>> paymentsByCharge() {
        return payments.findAll().stream().collect(Collectors.groupingBy(ChargePayment::getChargeId));
    }

    private static ChargeView view(Charge c, List<ChargePayment> list) {
        return new ChargeView(c.getId(), c.getLabel(), c.getCategory(), c.getCategory().label(), c.isPermanent(), c.getPeriod(),
                c.getAmount(), c.getStartPeriod(), c.getEndPeriod(), !c.isPermanent() || c.getEndPeriod() == null, c.isAutoPay(),
                c.getAutoMethod(), c.getNote(),
                list.size(), sum(list.stream().map(ChargePayment::getAmount)));
    }

    private static ChargePaymentView view(ChargePayment p) {
        return new ChargePaymentView(p.getId(), p.getChargeId(), p.getPeriod(), p.getAmount(), p.getMethod(), p.getMethod().label(),
                p.getPaidOn(), p.getNote(), p.getCreatedAt(), p.getCreatedBy(), p.getUpdatedAt(), p.getUpdatedBy());
    }

    private static BigDecimal sum(Stream<BigDecimal> s) {
        return s.reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }
}
