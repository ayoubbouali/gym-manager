package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.domain.Business;
import com.gymmanager.gym.domain.BusinessCategory;
import com.gymmanager.gym.domain.BusinessPayment;
import com.gymmanager.gym.domain.Member;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.repository.BusinessPaymentRepository;
import com.gymmanager.gym.repository.BusinessRepository;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.BusinessPaymentRequest;
import com.gymmanager.gym.web.dto.Requests.BusinessRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Club business (RG-BUSINESS), the revenue mirror of the charges: a permanent item (monthly coaching, a program…) is due every
 * month from its creation month until stopped, collected automatically each month or by hand; a one-off item (a kimono sold)
 * concerns one month. An item may be linked to a member: it then counts in their price and balance (ClubStateService).
 * Revenue counts at the collection date, like the members' payments.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class BusinessService {
    private final BusinessRepository items;
    private final BusinessPaymentRepository payments;
    private final MemberRepository members;
    private final SettingsService settings;

    static final String AUTO_NOTE = "Encaissement automatique";
    static final String AUTO_USER = "automatique";

    public record BusinessPaymentView(Long id, Long businessId, String period, BigDecimal amount, PaymentMethod method, String methodLabel,
                                      LocalDate paidOn, String note, LocalDateTime createdAt, String createdBy,
                                      LocalDateTime updatedAt, String updatedBy) {
    }

    public record MemberRef(Long id, String code, String name) {
    }

    /** {@code active}: a permanent item not stopped, or any one-off item. */
    public record BusinessView(Long id, String label, BusinessCategory category, String categoryLabel, boolean permanent, String period,
                               BigDecimal amount, String startPeriod, String endPeriod, boolean active, boolean autoPay,
                               PaymentMethod autoMethod, Long memberId, MemberRef member, String note, int paymentCount, BigDecimal totalPaid) {
    }

    /**
     * An item due for a month: collected ({@code payment} set) or to collect ({@code expected}: known amount, else null).
     * {@code scheduled}: a future month of an automatic item, collected when it comes.
     */
    public record BusinessDue(BusinessView item, String period, BigDecimal expected, BusinessPaymentView payment, boolean scheduled) {
    }

    public record BusinessMonth(String period, boolean currentMonth, List<BusinessDue> rows, BigDecimal totalPaid,
                                int toCollectCount, BigDecimal toCollectKnown) {
    }

    // ------------------------------------------------------------------ items

    public BusinessView create(BusinessRequest r, String username) {
        ClubConfig cfg = settings.config();
        Business b = new Business();
        b.setPermanent(Boolean.TRUE.equals(Check.required(r.permanent(), "permanent", "Type")));
        apply(b, r, cfg);
        b.setCreatedAt(cfg.now());
        b.setCreatedBy(username);
        YearMonth current = YearMonth.from(cfg.today());
        if (b.isPermanent()) b.setStartPeriod(current.toString());
        b = items.saveAndFlush(b);
        if (b.isAutoPay()) {
            startAutoPay(b, r, current, username);
        } else if (Boolean.TRUE.equals(r.payNow())) {
            // collected now: the current month of a permanent item, the month of a one-off item
            if (b.getAmount() == null) throw ApiException.invalid("amount", "Saisissez le montant pour l'encaisser.");
            String period = b.isPermanent() ? current.toString() : b.getPeriod();
            pay(new BusinessPaymentRequest(b.getId(), period, b.getAmount(), r.method(), r.paidOn(), ""), username);
        }
        return one(b.getId());
    }

    /** Creates the same item for each member of {@code memberIds}: each one owes and is collected separately. */
    public List<BusinessView> createForMembers(BusinessRequest r, String username) {
        List<Long> ids = r.memberIds() == null ? List.of() : r.memberIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) throw ApiException.invalid("memberIds", "Choisissez au moins un adhérent.");
        return ids.stream().map(id -> create(new BusinessRequest(r.label(), r.category(), r.permanent(), r.period(), r.amount(), r.note(),
                r.payNow(), r.autoPay(), r.method(), r.paidOn(), id, null), username)).toList();
    }

    public BusinessView update(Long id, BusinessRequest r, String username) {
        ClubConfig cfg = settings.config();
        Business b = find(id);
        String before = b.getPeriod();
        boolean wasAuto = b.isAutoPay();
        apply(b, r, cfg);
        if (b.isAutoPay() && !wasAuto) startAutoPay(b, r, YearMonth.from(cfg.today()), username);
        if (!b.isPermanent() && !Objects.equals(before, b.getPeriod()) && payments.existsByBusinessId(id)) {
            throw ApiException.invalid("period", "Ce business est déjà encaissé : supprimez l'encaissement pour changer son mois.");
        }
        return one(id);
    }

    private void apply(Business b, BusinessRequest r, ClubConfig cfg) {
        b.setLabel(Check.text(r.label(), "label", "Libellé", 120, true));
        b.setCategory(Check.required(r.category(), "category", "Catégorie"));
        b.setNote(Check.text(r.note(), "note", "Note", 500, false));
        if (r.memberId() != null) {
            Member m = members.findById(r.memberId()).orElseThrow(() -> ApiException.invalid("memberId", "Adhérent introuvable."));
            Check.activeOrUnchanged(m.isActive(), m.getId(), b.getMemberId(), "memberId", "Cet adhérent est désactivé.");
        }
        b.setMemberId(r.memberId());
        if (r.amount() != null && Check.amount(r.amount(), "amount", "Montant").signum() == 0) {
            throw ApiException.invalid("amount", "Le montant doit être supérieur à 0 (laissez vide s'il n'est pas connu).");
        }
        b.setAmount(r.amount() == null ? null : r.amount().setScale(2, RoundingMode.HALF_UP));
        if (b.isPermanent()) {
            boolean auto = Boolean.TRUE.equals(r.autoPay());
            if (auto && b.getAmount() == null) throw ApiException.invalid("amount", "Saisissez le montant encaissé chaque mois.");
            b.setAutoPay(auto);
            b.setAutoMethod(auto ? Check.required(r.method(), "method", "Mode de paiement") : null);
            if (!auto) b.setAutoPaidUntil(null);
            return;
        }
        b.setPeriod(PayrollService.parsePeriod(Check.required(r.period(), "period", "Mois")).toString());
    }

    /** Automatic collection switched on (creation, edit, resume): the current month now, the next ones as they come. */
    private void startAutoPay(Business b, BusinessRequest r, YearMonth current, String username) {
        if (!payments.existsByBusinessIdAndPeriod(b.getId(), current.toString())) {
            pay(new BusinessPaymentRequest(b.getId(), current.toString(), b.getAmount(), b.getAutoMethod(), r == null ? null : r.paidOn(),
                    AUTO_NOTE), username);
        }
        b.setAutoPaidUntil(current.toString());
    }

    /** Stops a permanent item after the current month, or makes it due again. Its collections are kept. */
    public BusinessView setActive(Long id, boolean active, String username) {
        Business b = find(id);
        if (!b.isPermanent()) throw ApiException.badRequest("Seul un business permanent peut être arrêté.");
        YearMonth current = YearMonth.from(settings.config().today());
        if (!active) settle();
        b.setEndPeriod(active ? null : current.toString());
        if (active && b.isAutoPay()) startAutoPay(b, null, current, username);
        return one(id);
    }

    /**
     * Collects the automatic items for every month since their last one, up to the current month, dated the 1st of the month.
     * Run before reading; a collection deleted by hand is not recreated ({@code autoPaidUntil}).
     */
    public void settle() {
        ClubConfig cfg = settings.config();
        YearMonth current = YearMonth.from(cfg.today());
        for (Business b : items.findAll()) {
            if (!b.isAutoPay() || b.getAutoPaidUntil() == null) continue;
            YearMonth end = BusinessDues.end(b);
            YearMonth last = end == null || end.isAfter(current) ? current : end;
            YearMonth ym = YearMonth.parse(b.getAutoPaidUntil()).plusMonths(1);
            if (ym.isAfter(last)) continue;
            for (; !ym.isAfter(last); ym = ym.plusMonths(1)) {
                if (payments.existsByBusinessIdAndPeriod(b.getId(), ym.toString())) continue;
                BusinessPayment p = new BusinessPayment();
                p.setBusinessId(b.getId());
                p.setPeriod(ym.toString());
                p.setAmount(b.getAmount());
                p.setMethod(b.getAutoMethod());
                p.setPaidOn(ym.atDay(1));
                p.setNote(AUTO_NOTE);
                p.setCreatedAt(cfg.now());
                p.setCreatedBy(AUTO_USER);
                payments.save(p);
            }
            b.setAutoPaidUntil(last.toString());
        }
        payments.flush();
    }

    public void delete(Long id) {
        Business b = find(id);
        if (payments.existsByBusinessId(id)) {
            throw ApiException.conflict(b.isPermanent()
                    ? "Ce business a des encaissements : arrêtez-le plutôt, ou supprimez d'abord ses encaissements."
                    : "Ce business est encaissé : supprimez d'abord son encaissement.");
        }
        items.delete(b);
    }

    // ------------------------------------------------------------------ collections

    public BusinessPaymentView pay(BusinessPaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        Business b = find(Check.required(r.businessId(), "businessId", "Business"));
        YearMonth ym = b.isPermanent() ? PayrollService.parsePeriod(r.period()) : YearMonth.parse(b.getPeriod());
        // a coming month may be collected in advance
        if (b.isPermanent() && !BusinessDues.isDue(b, ym, ym)) throw ApiException.invalid("period", "Ce business n'est pas dû ce mois-là.");
        if (payments.existsByBusinessIdAndPeriod(b.getId(), ym.toString())) {
            throw ApiException.badRequest("Ce business est déjà encaissé pour ce mois.");
        }
        BusinessPayment p = new BusinessPayment();
        p.setBusinessId(b.getId());
        p.setPeriod(ym.toString());
        fill(p, r, cfg);
        p.setCreatedAt(cfg.now());
        p.setCreatedBy(username);
        return view(payments.save(p));
    }

    /** Corrects a collection (MANAGE_BUSINESS): amount, method, date and note; the month never changes. */
    public BusinessPaymentView updatePayment(Long id, BusinessPaymentRequest r, String username) {
        ClubConfig cfg = settings.config();
        BusinessPayment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Encaissement introuvable."));
        fill(p, r, cfg);
        p.setUpdatedAt(cfg.now());
        p.setUpdatedBy(username);
        return view(p);
    }

    /** Deletes a collection (MANAGE_BUSINESS): the month is to collect again. */
    public void deletePayment(Long id) {
        payments.delete(payments.findById(id).orElseThrow(() -> ApiException.notFound("Encaissement introuvable.")));
    }

    private static void fill(BusinessPayment p, BusinessPaymentRequest r, ClubConfig cfg) {
        BigDecimal amount = Check.amount(r.amount(), "amount", "Montant");
        if (amount.signum() == 0) throw ApiException.invalid("amount", "Le montant doit être supérieur à 0.");
        LocalDate paidOn = r.paidOn() == null ? cfg.today() : r.paidOn();
        if (paidOn.isAfter(cfg.today())) throw ApiException.invalid("paidOn", "La date d'encaissement ne peut pas être dans le futur.");
        p.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(paidOn);
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
    }

    // ------------------------------------------------------------------ month

    /** Items of a month, past or coming: permanent ones due that month and one-off ones of that month, collected or not. */
    public BusinessMonth month(String period) {
        settle();
        YearMonth current = YearMonth.from(settings.config().today());
        YearMonth ym = period == null || period.isBlank() ? current : PayrollService.parsePeriod(period);
        Map<Long, List<BusinessPayment>> byItem = paymentsByItem();
        Map<Long, MemberRef> memberRefs = memberRefs();
        List<BusinessDue> rows = new ArrayList<>();
        for (Business b : items.findAll()) {
            if (!BusinessDues.isDue(b, ym, ym)) continue;
            List<BusinessPayment> list = byItem.getOrDefault(b.getId(), List.of());
            BusinessPayment p = list.stream().filter(x -> x.getPeriod().equals(ym.toString())).findFirst().orElse(null);
            rows.add(new BusinessDue(view(b, list, memberRefs), ym.toString(), b.getAmount(), p == null ? null : view(p),
                    p == null && b.isAutoPay() && ym.isAfter(current)));
        }
        rows.sort(Comparator.comparing((BusinessDue d) -> !d.item().permanent())
                .thenComparing(d -> d.item().label(), String.CASE_INSENSITIVE_ORDER));
        List<BusinessDue> toCollect = rows.stream().filter(d -> d.payment() == null && !d.scheduled()).toList();
        return new BusinessMonth(ym.toString(), ym.equals(current), rows, sum(rows.stream().filter(d -> d.payment() != null).map(d -> d.payment().amount())),
                toCollect.size(), sum(toCollect.stream().map(BusinessDue::expected).filter(Objects::nonNull)));
    }

    /** Items linked to a member, for their card. */
    @Transactional(readOnly = true)
    public List<BusinessView> forMember(Long memberId) {
        Map<Long, List<BusinessPayment>> byItem = paymentsByItem();
        Map<Long, MemberRef> memberRefs = memberRefs();
        return items.findAll().stream().filter(b -> memberId.equals(b.getMemberId()))
                .map(b -> view(b, byItem.getOrDefault(b.getId(), List.of()), memberRefs))
                .sorted(Comparator.comparing(BusinessView::active).reversed().thenComparing(BusinessView::label, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    // ------------------------------------------------------------------ helpers

    private Business find(Long id) {
        return items.findById(id).orElseThrow(() -> ApiException.notFound("Business introuvable."));
    }

    private BusinessView one(Long id) {
        return view(find(id), paymentsByItem().getOrDefault(id, List.of()), memberRefs());
    }

    private Map<Long, List<BusinessPayment>> paymentsByItem() {
        return payments.findAll().stream().collect(Collectors.groupingBy(BusinessPayment::getBusinessId));
    }

    private Map<Long, MemberRef> memberRefs() {
        return members.findAll().stream().collect(Collectors.toMap(Member::getId,
                m -> new MemberRef(m.getId(), m.getCode(), (m.getFirstName() + " " + m.getLastName()).trim()), (a, b) -> a, HashMap::new));
    }

    private static BusinessView view(Business b, List<BusinessPayment> list, Map<Long, MemberRef> memberRefs) {
        return new BusinessView(b.getId(), b.getLabel(), b.getCategory(), b.getCategory().label(), b.isPermanent(), b.getPeriod(),
                b.getAmount(), b.getStartPeriod(), b.getEndPeriod(), !b.isPermanent() || b.getEndPeriod() == null, b.isAutoPay(),
                b.getAutoMethod(), b.getMemberId(), b.getMemberId() == null ? null : memberRefs.get(b.getMemberId()), b.getNote(),
                list.size(), sum(list.stream().map(BusinessPayment::getAmount)));
    }

    static BusinessPaymentView view(BusinessPayment p) {
        return new BusinessPaymentView(p.getId(), p.getBusinessId(), p.getPeriod(), p.getAmount(), p.getMethod(), p.getMethod().label(),
                p.getPaidOn(), p.getNote(), p.getCreatedAt(), p.getCreatedBy(), p.getUpdatedAt(), p.getUpdatedBy());
    }

    private static BigDecimal sum(Stream<BigDecimal> s) {
        return s.reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }
}
