package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.SalaryPayment;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.SalaryPaymentRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.SalaryDetail;
import com.gymmanager.gym.service.Views.SalaryPaymentView;
import com.gymmanager.gym.service.Views.StaffView;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
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

/** Staff payroll: salary due per month (RG-SALAIRE), payments / advances with numbered pay slips. */
@Service
@RequiredArgsConstructor
@Transactional
public class PayrollService {
    private final ClubStateService stateService;
    private final SalaryPaymentRepository salaryPayments;
    private final StaffRepository staffRepo;
    private final SettingsService settings;
    private final CodeService codes;

    public record PayrollRow(StaffView staff, BigDecimal due, BigDecimal paid, BigDecimal balance,
                             Rules.PaymentStatus status, SalaryDetail detail, List<SalaryPaymentView> payments) {
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

    @Transactional(readOnly = true)
    public PayrollMonth month(String period) {
        ClubState st = stateService.load();
        YearMonth ym = period == null || period.isBlank() ? YearMonth.from(st.today()) : parsePeriod(period);
        Map<Long, Staff> staffById = staffById();
        Map<Long, List<SalaryPaymentView>> byStaff = new HashMap<>();
        salaryPayments.findAll().stream().filter(p -> p.getPeriod().equals(ym.toString()))
                .sorted(Comparator.comparing(SalaryPayment::getPaidOn).thenComparing(SalaryPayment::getId))
                .forEach(p -> byStaff.computeIfAbsent(p.getStaffId(), k -> new ArrayList<>()).add(view(p, staffById)));
        List<PayrollRow> rows = st.staff().stream().filter(s -> s.active() || byStaff.containsKey(s.id())).map(s -> {
            var c = due(st, s, ym);
            List<SalaryPaymentView> pays = byStaff.getOrDefault(s.id(), List.of());
            BigDecimal paid = pays.stream().filter(p -> !p.cancelled()).map(SalaryPaymentView::amount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
            return new PayrollRow(s, c.amount(), paid, Rules.balance(c.amount(), paid), Rules.paymentStatus(c.amount(), paid), c.detail(), pays);
        }).toList();
        Rules.DateWindow w = Rules.salaryWindow(ym.atDay(1), st.cfg().salaryStartDay(), st.cfg().salaryEndDay());
        return new PayrollMonth(ym.toString(), w.from(), w.to(), ym.equals(YearMonth.from(st.today())), rows,
                rows.stream().filter(r -> r.staff().active()).map(PayrollRow::due).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP),
                rows.stream().map(PayrollRow::paid).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP),
                rows.stream().filter(r -> r.staff().active()).map(PayrollRow::balance).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP));
    }

    /** Records a salary payment or an advance (≤ remaining amount of the month) and allocates its pay slip number. */
    public SalaryPayment pay(SalaryPaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        YearMonth ym = parsePeriod(r.period());
        if (ym.isAfter(YearMonth.from(cfg.today()))) throw ApiException.invalid("period", "On ne peut pas payer un mois futur.");
        Long staffId = Check.required(r.staffId(), "staffId", "Membre du personnel");
        PayrollRow row = month(ym.toString()).rows().stream().filter(x -> x.staff().id().equals(staffId)).findFirst()
                .orElseThrow(() -> ApiException.invalid("staffId", "Membre du personnel introuvable ou inactif."));
        Check.amount(r.amount(), "amount", "Montant");
        if (r.amount().signum() <= 0) throw ApiException.invalid("amount", "Le montant doit être supérieur à 0.");
        if (r.amount().compareTo(row.balance()) > 0) {
            throw ApiException.invalid("amount", "Le montant dépasse le reste à payer du mois (" + row.balance().toPlainString().replace('.', ',') + " " + cfg.currency() + ").");
        }
        LocalDate paidOn = r.paidOn() == null ? cfg.today() : r.paidOn();
        if (paidOn.isAfter(cfg.today())) throw ApiException.invalid("paidOn", "La date de paiement ne peut pas être dans le futur.");
        SalaryPayment p = new SalaryPayment();
        p.setStaffId(staffId);
        p.setPeriod(ym.toString());
        p.setAmount(r.amount());
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(paidOn);
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
        p.setCreatedAt(cfg.now());
        p.setCreatedBy(username);
        p.setSlipNumber(codes.nextDocument("payslip", cfg.payslipPrefix(), paidOn.getYear()));
        return salaryPayments.save(p);
    }

    public SalaryPayment cancel(Long id, String reason, String username) {
        SalaryPayment p = salaryPayments.findById(id).orElseThrow(() -> ApiException.notFound("Paiement de salaire introuvable."));
        if (p.isCancelled()) throw ApiException.badRequest("Ce paiement est déjà annulé.");
        p.setCancelled(true);
        p.setCancelledAt(settings.config().now());
        p.setCancelledBy(username);
        p.setCancelReason(Check.text(reason, "reason", "Motif d'annulation", 500, true));
        return p;
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
