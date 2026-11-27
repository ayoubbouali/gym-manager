package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.SalaryBonus;
import com.gymmanager.gym.domain.SalaryPayment;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.SalaryBonusRepository;
import com.gymmanager.gym.repository.SalaryPaymentRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.SalaryDetail;
import com.gymmanager.gym.service.Views.SalaryPaymentView;
import com.gymmanager.gym.service.Views.StaffView;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.SalaryBonusRequest;
import com.gymmanager.gym.web.dto.Requests.SalaryPaymentRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Staff payroll: salary due per month (RG-SALAIRE) plus an optional bonus, paid in one go with a numbered pay slip.
 * Cancelling a month deletes its payments but keeps its bonus; slip numbers are never reused.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PayrollService {
    private final ClubStateService stateService;
    private final SalaryPaymentRepository salaryPayments;
    private final SalaryBonusRepository salaryBonuses;
    private final StaffRepository staffRepo;
    private final SettingsService settings;
    private final CodeService codes;

    /**
     * {@code due} = {@code salary} + {@code bonus}. {@code revenue}: cashed this month on the sports the staff member
     * coaches, null when they coach none. {@code paidOn}: date of the month's payment, null while unpaid.
     */
    public record PayrollRow(StaffView staff, BigDecimal salary, BigDecimal bonus, String bonusNote, BigDecimal revenue,
                             BigDecimal due, BigDecimal paid, BigDecimal balance, Rules.PaymentStatus status, LocalDate paidOn,
                             SalaryDetail detail, List<SalaryPaymentView> payments) {
    }

    public record PayrollMonth(String period, LocalDate from, LocalDate to, boolean currentMonth, List<PayrollRow> rows,
                               BigDecimal totalDue, BigDecimal totalPaid, BigDecimal totalBalance) {
    }

    public static YearMonth parsePeriod(String period) {
        try {
            return YearMonth.parse(period);
        } catch (DateTimeParseException | NullPointerException e) {
            throw ApiException.invalid("period", "Mois invalide (format attendu : AAAA-MM).");
        }
    }

    SalaryPaymentView view(SalaryPayment p, Map<Long, Staff> staffById) {
        Staff s = staffById.get(p.getStaffId());
        return new SalaryPaymentView(p.getId(), p.getSlipNumber(), s.getId(), s.getCode(), ClubStateService.staffName(s), p.getPeriod(),
                p.getAmount(), p.getMethod(), p.getMethod().label(), p.getPaidOn(), p.getNote(), p.getCreatedAt(), p.getCreatedBy(),
                p.isCancelled(), p.getCancelledAt(), p.getCancelledBy(), p.getCancelReason());
    }

    private Map<Long, Staff> staffById() {
        Map<Long, Staff> m = new HashMap<>();
        staffRepo.findAll().forEach(s -> m.put(s.getId(), s));
        return m;
    }

    /** Salary due for one staff member and month (with the verifiable detail). */
    ClubStateService.SalaryComputation due(ClubState st, StaffView s, YearMonth month) {
        Map<Long, String> sportNames = new HashMap<>();
        st.sports().forEach(x -> sportNames.put(x.id(), x.name()));
        Map<Long, String> packNames = new HashMap<>();
        st.packs().forEach(x -> packNames.put(x.id(), x.name()));
        return ClubStateService.salary(s.id(), s.payMode(), s.fixedSalary(), st.members(), st.subsByMember(), st.coachesBySport(),
                sportNames, packNames, st.cfg(), month.atDay(1));
    }

    /** Everything the payroll rows read, loaded once per request. */
    private record Ledger(List<SalaryPayment> payments, List<SalaryBonus> bonuses, Map<Long, Staff> staffById, List<Rules.Sale> sales) {
    }

    private Ledger ledger(ClubState st) {
        return new Ledger(salaryPayments.findAll(), salaryBonuses.findAll(), staffById(), InsightService.sales(st));
    }

    /** Payroll rows of a month: active non-internal staff plus any staff member with a payment for that month. */
    private List<PayrollRow> rows(ClubState st, YearMonth ym, Ledger l, Long staffId) {
        String period = ym.toString();
        Map<Long, List<SalaryPaymentView>> byStaff = new HashMap<>();
        l.payments().stream().filter(p -> p.getPeriod().equals(period))
                .sorted(Comparator.comparing(SalaryPayment::getPaidOn).thenComparing(SalaryPayment::getId))
                .forEach(p -> byStaff.computeIfAbsent(p.getStaffId(), k -> new ArrayList<>()).add(view(p, l.staffById())));
        Map<Long, SalaryBonus> bonuses = new HashMap<>();
        l.bonuses().stream().filter(b -> b.getPeriod().equals(period)).forEach(b -> bonuses.put(b.getStaffId(), b));
        return st.staff().stream().filter(s -> ((s.active() && !s.internal()) || byStaff.containsKey(s.id())) && (staffId == null || s.id().equals(staffId))).map(s -> {
            var c = due(st, s, ym);
            SalaryBonus b = bonuses.get(s.id());
            BigDecimal bonus = b == null ? BigDecimal.ZERO.setScale(2) : b.getAmount().setScale(2, RoundingMode.HALF_UP);
            BigDecimal due = c.amount().add(bonus).setScale(2, RoundingMode.HALF_UP);
            BigDecimal revenue = s.sportIds().isEmpty() ? null
                    : Rules.revenueForSports(l.sales(), new HashSet<>(s.sportIds()), ym.atDay(1), ym.atEndOfMonth());
            List<SalaryPaymentView> pays = byStaff.getOrDefault(s.id(), List.of());
            List<SalaryPaymentView> valid = pays.stream().filter(p -> !p.cancelled()).toList();
            BigDecimal paid = sum(valid.stream().map(SalaryPaymentView::amount).toList());
            LocalDate paidOn = valid.isEmpty() ? null : valid.getLast().paidOn();
            // a paid month stays settled even if the commission salary changes afterwards
            BigDecimal balance = valid.isEmpty() ? Rules.balance(due, paid) : BigDecimal.ZERO.setScale(2);
            Rules.PaymentStatus status = valid.isEmpty() ? Rules.paymentStatus(due, paid) : Rules.PaymentStatus.PAYE;
            return new PayrollRow(s, c.amount(), bonus, b == null ? null : b.getNote(), revenue, due, paid, balance, status, paidOn, c.detail(), pays);
        }).toList();
    }

    private static BigDecimal sum(List<BigDecimal> amounts) {
        return amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    @Transactional(readOnly = true)
    public PayrollMonth month(String period) {
        ClubState st = stateService.load();
        YearMonth ym = period == null || period.isBlank() ? YearMonth.from(st.today()) : parsePeriod(period);
        List<PayrollRow> rows = rows(st, ym, ledger(st), null);
        Rules.DateWindow w = Rules.newRegistrationWindow(ym, st.cfg().salaryCutoffDay());
        return new PayrollMonth(ym.toString(), w.from(), w.to(), ym.equals(YearMonth.from(st.today())), rows,
                sum(rows.stream().filter(r -> r.staff().active()).map(PayrollRow::due).toList()),
                sum(rows.stream().map(PayrollRow::paid).toList()),
                sum(rows.stream().filter(r -> r.staff().active()).map(PayrollRow::balance).toList()));
    }

    // ---------------------------------------------------------------- statistics

    public record MonthDuePaid(String month, BigDecimal due, BigDecimal paid, BigDecimal balance) {
    }

    public record StaffAmount(Long staffId, String code, String name, String function, String payMode, boolean active,
                              BigDecimal due, BigDecimal paid, BigDecimal balance, int paymentCount) {
    }

    public record PayrollStats(String from, String to, Long staffId, BigDecimal totalDue, BigDecimal totalPaid, BigDecimal totalBalance,
                               int paymentCount, List<MonthDuePaid> monthly, List<StaffAmount> byStaff,
                               List<SalaryPaymentView> payments) {
    }

    static final int MAX_STATS_MONTHS = 120;

    /**
     * Salary statistics over salary months [from, to] (default: the last 12 months), optionally for one staff member.
     * Same rules as the monthly payroll: due and balance only count active staff, paid counts every non-cancelled payment.
     */
    @Transactional(readOnly = true)
    public PayrollStats stats(String fromPeriod, String toPeriod, Long staffId) {
        ClubState st = stateService.load();
        YearMonth current = YearMonth.from(st.today());
        boolean defaults = fromPeriod == null || fromPeriod.isBlank() || toPeriod == null || toPeriod.isBlank();
        YearMonth from = defaults ? current.minusMonths(11) : parsePeriod(fromPeriod);
        YearMonth to = defaults ? current : parsePeriod(toPeriod);
        if (from.isAfter(to)) throw ApiException.badRequest("Le mois de début doit précéder le mois de fin.");
        if (to.isAfter(current)) to = current;
        if (from.isAfter(to)) throw ApiException.badRequest("La période ne peut pas être entièrement dans le futur.");
        if (from.plusMonths(MAX_STATS_MONTHS - 1).isBefore(to)) throw ApiException.badRequest("Période trop longue (" + MAX_STATS_MONTHS / 12 + " ans maximum).");
        Ledger ledger = ledger(st);
        if (staffId != null && !ledger.staffById().containsKey(staffId)) throw ApiException.notFound("Membre du personnel introuvable.");

        List<MonthDuePaid> monthly = new ArrayList<>();
        Map<Long, List<PayrollRow>> rowsByStaff = new LinkedHashMap<>();
        for (YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
            List<PayrollRow> rows = rows(st, ym, ledger, staffId);
            rows.forEach(r -> rowsByStaff.computeIfAbsent(r.staff().id(), k -> new ArrayList<>()).add(r));
            monthly.add(new MonthDuePaid(ym.toString(), sum(rows.stream().filter(r -> r.staff().active()).map(PayrollRow::due).toList()),
                    sum(rows.stream().map(PayrollRow::paid).toList()),
                    sum(rows.stream().filter(r -> r.staff().active()).map(PayrollRow::balance).toList())));
        }
        List<StaffAmount> byStaff = rowsByStaff.values().stream().map(rows -> {
            StaffView s = rows.getFirst().staff();
            List<PayrollRow> counted = s.active() ? rows : List.of();
            return new StaffAmount(s.id(), s.code(), s.name(), s.function() == null ? null : s.function().label(), s.payMode() == null ? "INTERNAL" : s.payMode().name(), s.active(),
                    sum(counted.stream().map(PayrollRow::due).toList()), sum(rows.stream().map(PayrollRow::paid).toList()),
                    sum(counted.stream().map(PayrollRow::balance).toList()),
                    (int) rows.stream().flatMap(r -> r.payments().stream()).filter(p -> !p.cancelled()).count());
        }).sorted(Comparator.comparing(StaffAmount::paid).reversed().thenComparing(StaffAmount::code)).toList();
        List<SalaryPaymentView> payments = rowsByStaff.values().stream().flatMap(List::stream).flatMap(r -> r.payments().stream())
                .sorted(Comparator.comparing(SalaryPaymentView::paidOn).reversed().thenComparing(SalaryPaymentView::id, Comparator.reverseOrder())).toList();
        List<SalaryPaymentView> valid = payments.stream().filter(p -> !p.cancelled()).toList();
        return new PayrollStats(from.toString(), to.toString(), staffId,
                sum(monthly.stream().map(MonthDuePaid::due).toList()), sum(monthly.stream().map(MonthDuePaid::paid).toList()),
                sum(monthly.stream().map(MonthDuePaid::balance).toList()), valid.size(), monthly, byStaff, payments);
    }

    private PayrollRow row(YearMonth ym, Long staffId) {
        return month(ym.toString()).rows().stream().filter(x -> x.staff().id().equals(staffId)).findFirst()
                .orElseThrow(() -> ApiException.invalid("staffId", "Membre du personnel introuvable ou inactif."));
    }

    private boolean isPaid(Long staffId, YearMonth ym) {
        return salaryPayments.findByStaffIdAndPeriod(staffId, ym.toString()).stream().anyMatch(p -> !p.isCancelled());
    }

    private YearMonth pastOrCurrent(String period, ClubConfig cfg) {
        YearMonth ym = parsePeriod(period);
        if (ym.isAfter(YearMonth.from(cfg.today()))) throw ApiException.invalid("period", "Le mois ne peut pas être dans le futur.");
        return ym;
    }

    /** Pays the month in one go (salary + bonus, computed here) and allocates its pay slip number. */
    public SalaryPayment pay(SalaryPaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        YearMonth ym = pastOrCurrent(r.period(), cfg);
        Long staffId = Check.required(r.staffId(), "staffId", "Membre du personnel");
        PayrollRow row = row(ym, staffId);
        if (isPaid(staffId, ym)) throw ApiException.badRequest("Ce mois est déjà payé : annulez le versement pour le refaire.");
        if (row.due().signum() <= 0) throw ApiException.badRequest("Rien à verser pour ce mois.");
        LocalDate paidOn = r.paidOn() == null ? cfg.today() : r.paidOn();
        if (paidOn.isAfter(cfg.today())) throw ApiException.invalid("paidOn", "La date de paiement ne peut pas être dans le futur.");
        SalaryPayment p = new SalaryPayment();
        p.setStaffId(staffId);
        p.setPeriod(ym.toString());
        p.setAmount(row.due());
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(paidOn);
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
        p.setCreatedAt(cfg.now());
        p.setCreatedBy(username);
        p.setSlipNumber(codes.nextDocument("payslip", cfg.payslipPrefix(), paidOn.getYear()));
        return salaryPayments.save(p);
    }

    /** Sets (or, with a null amount, removes) the bonus of a month that is not paid yet. */
    public PayrollRow setBonus(SalaryBonusRequest r, String username) {
        ClubConfig cfg = settings.config();
        YearMonth ym = pastOrCurrent(r.period(), cfg);
        Long staffId = Check.required(r.staffId(), "staffId", "Membre du personnel");
        row(ym, staffId);
        if (isPaid(staffId, ym)) throw ApiException.badRequest("Ce mois est déjà payé : annulez le versement pour modifier la prime.");
        if (r.amount() == null) {
            salaryBonuses.deleteByStaffIdAndPeriod(staffId, ym.toString());
        } else {
            Check.amount(r.amount(), "amount", "Prime");
            if (r.amount().signum() <= 0) throw ApiException.invalid("amount", "La prime doit être supérieure à 0.");
            SalaryBonus b = salaryBonuses.findByStaffIdAndPeriod(staffId, ym.toString()).orElseGet(() -> {
                SalaryBonus n = new SalaryBonus();
                n.setStaffId(staffId);
                n.setPeriod(ym.toString());
                n.setCreatedAt(cfg.now());
                n.setCreatedBy(username);
                return n;
            });
            b.setAmount(r.amount());
            b.setNote(Check.text(r.note(), "note", "Note", 500, false));
            salaryBonuses.save(b);
        }
        salaryBonuses.flush();
        return row(ym, staffId);
    }

    /** Cancels a month: its payments (cancelled legacy ones included) are deleted for good; its bonus stays pending. */
    public void reset(Long staffId, String period) {
        YearMonth ym = parsePeriod(period);
        if (!staffRepo.existsById(staffId)) throw ApiException.notFound("Membre du personnel introuvable.");
        List<SalaryPayment> pays = salaryPayments.findByStaffIdAndPeriod(staffId, ym.toString());
        if (pays.stream().allMatch(SalaryPayment::isCancelled)) throw ApiException.notFound("Aucun versement à annuler pour ce mois.");
        salaryPayments.deleteAll(pays);
    }

    @Transactional(readOnly = true)
    public List<SalaryPaymentView> history(Long staffId) {
        Map<Long, Staff> staffById = staffById();
        if (!staffById.containsKey(staffId)) throw ApiException.notFound("Membre du personnel introuvable.");
        return salaryPayments.findAll().stream().filter(p -> p.getStaffId().equals(staffId))
                .sorted(Comparator.comparing(SalaryPayment::getPeriod).reversed().thenComparing(SalaryPayment::getId))
                .map(p -> view(p, staffById)).toList();
    }

    @Transactional(readOnly = true)
    public SalaryPaymentView one(Long id) {
        SalaryPayment p = salaryPayments.findById(id).orElseThrow(() -> ApiException.notFound("Paiement de salaire introuvable."));
        return view(p, staffById());
    }
}
