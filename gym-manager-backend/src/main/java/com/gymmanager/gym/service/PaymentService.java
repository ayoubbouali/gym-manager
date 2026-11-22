package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.*;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.PaymentRequest;
import com.gymmanager.gym.web.dto.Requests.PaymentUpdateRequest;
import com.gymmanager.gym.web.dto.Requests.RenewRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Member payments (numbered receipts) and renewals (new subscription periods). */
@Service
@RequiredArgsConstructor
@Transactional
public class PaymentService {
    private final PaymentRepository payments;
    private final SubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final PackRepository packs;
    private final DurationRepository durations;
    private final DiscountRepository discounts;
    private final MemberService memberService;
    private final SettingsService settings;
    private final CodeService codes;

    private BigDecimal paidOn(Subscription s) {
        return payments.findBySubscriptionId(s.getId()).stream().filter(p -> !p.isCancelled())
                .map(Payment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal balanceOf(Subscription s) {
        return Rules.balance(s.getAmount(), paidOn(s));
    }

    private static String fmt(BigDecimal v) {
        return v.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    private LocalDate validDate(LocalDate d, ClubConfig cfg) {
        LocalDate date = d == null ? cfg.today() : d;
        if (date.isAfter(cfg.today())) throw ApiException.invalid("paidOn", "La date de paiement ne peut pas être dans le futur.");
        return date;
    }

    private void checkAmount(BigDecimal amount, BigDecimal max) {
        Check.amount(amount, "amount", "Montant");
        if (amount.signum() <= 0) throw ApiException.invalid("amount", "Le montant doit être supérieur à 0.");
        if (amount.compareTo(max) > 0) {
            throw ApiException.invalid("amount", "Le montant dépasse le reste à payer de cette période (" + fmt(max) + " " + settings.config().currency() + ").");
        }
    }

    /** Records a payment and allocates its receipt number. */
    public Payment pay(PaymentRequest r, String username) {
        Long memberId = Check.required(r.memberId(), "memberId", "Adhérent");
        Member m = members.findById(memberId).orElseThrow(() -> ApiException.invalid("memberId", "Adhérent introuvable."));
        List<Subscription> periods = subscriptions.findByMemberIdOrderByStartDateAscIdAsc(m.getId());
        if (periods.isEmpty()) throw ApiException.badRequest("Aucun abonnement : créez d'abord un nouvel abonnement pour cet adhérent.");
        Subscription sub;
        if (r.subscriptionId() != null) {
            sub = periods.stream().filter(s -> s.getId().equals(r.subscriptionId())).findFirst()
                    .orElseThrow(() -> ApiException.invalid("subscriptionId", "Période d'abonnement introuvable pour cet adhérent."));
        } else {
            sub = periods.stream().filter(s -> balanceOf(s).signum() > 0).findFirst()
                    .orElseThrow(() -> ApiException.badRequest("Cet adhérent n'a rien à payer : toutes ses périodes sont réglées."));
        }
        ClubConfig cfg = settings.config();
        if (!payments.existsBySubscriptionId(sub.getId())) freeze(sub, cfg);
        checkAmount(r.amount(), balanceOf(sub));
        Payment p = new Payment();
        p.setMemberId(m.getId());
        p.setSubscriptionId(sub.getId());
        p.setAmount(r.amount());
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(validDate(r.paidOn(), cfg));
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
        p.setCreatedAt(cfg.now());
        p.setCreatedBy(username);
        p.setReceiptNumber(codes.nextDocument("receipt", cfg.receiptPrefix(), p.getPaidOn().getYear()));
        return payments.save(p);
    }

    /** First payment of a period: its price (until now following the rules) is frozen. */
    private void freeze(Subscription sub, ClubConfig cfg) {
        Pack pack = packs.findById(sub.getPackId()).orElseThrow();
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        Discount disc = discounts.findById(sub.getDiscountId()).orElseThrow();
        sub.setMonths(dur.getMonths());
        sub.setAmount(memberService.price(pack, dur, disc, cfg));
    }

    /** ADMIN: corrects a payment (same receipt number, regenerated). */
    public Payment update(Long id, PaymentUpdateRequest r, String username) {
        Payment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Paiement introuvable."));
        if (p.isCancelled()) throw ApiException.badRequest("Ce paiement est annulé : il ne peut plus être modifié.");
        Subscription sub = subscriptions.findById(p.getSubscriptionId()).orElseThrow();
        checkAmount(r.amount(), balanceOf(sub).add(p.getAmount()));
        ClubConfig cfg = settings.config();
        p.setAmount(r.amount());
        p.setMethod(Check.required(r.method(), "method", "Mode de paiement"));
        p.setPaidOn(validDate(r.paidOn(), cfg));
        p.setNote(Check.text(r.note(), "note", "Note", 500, false));
        p.setUpdatedAt(cfg.now());
        p.setUpdatedBy(username);
        return p;
    }

    /** ADMIN: cancels a payment. The receipt number stays used; the receipt shows "ANNULÉ". */
    public Payment cancel(Long id, String reason, String username) {
        Payment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Paiement introuvable."));
        if (p.isCancelled()) throw ApiException.badRequest("Ce paiement est déjà annulé.");
        p.setCancelled(true);
        p.setCancelledAt(settings.config().now());
        p.setCancelledBy(username);
        p.setCancelReason(Check.text(reason, "reason", "Motif d'annulation", 500, true));
        return p;
    }

    /**
     * ADMIN: removes a cancelled payment from the history. Its receipt number is never reused (the counter never goes back).
     * A renewal left without any payment goes with it; the member's first period is always kept.
     */
    public void delete(Long id) {
        Payment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Paiement introuvable."));
        if (!p.isCancelled()) throw ApiException.badRequest("Seul un paiement annulé peut être supprimé : annulez-le d'abord.");
        payments.delete(p);
        payments.flush();
        if (payments.existsBySubscriptionId(p.getSubscriptionId())) return;
        List<Subscription> periods = subscriptions.findByMemberIdOrderByStartDateAscIdAsc(p.getMemberId());
        if (!periods.getFirst().getId().equals(p.getSubscriptionId())) {
            subscriptions.deleteById(p.getSubscriptionId());
        }
    }

    /** Default start of a renewal (RG-RENOUV); today for a member without any subscription. */
    @Transactional(readOnly = true)
    public LocalDate renewalStart(Long memberId) {
        List<Subscription> periods = subscriptions.findByMemberIdOrderByStartDateAscIdAsc(memberId);
        if (periods.isEmpty()) return settings.config().today();
        Subscription last = periods.getLast();
        return Rules.renewalStart(Rules.subscriptionEnd(last.getStartDate(), last.getMonths()), settings.config().today());
    }

    /**
     * Creates a new subscription period (renewal, or new subscription for a member without any), with an optional
     * first payment. Returns the new period.
     */
    public Subscription renew(Long memberId, RenewRequest r, String username) {
        Member m = members.findById(memberId).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        ClubConfig cfg = settings.config();
        Pack pack = packs.findById(Check.required(r.packId(), "packId", "Type d'abonnement"))
                .orElseThrow(() -> ApiException.invalid("packId", "Pack introuvable."));
        if (!pack.isActive()) throw ApiException.invalid("packId", "Ce pack est inactif.");
        if (!m.getSportIds().contains(pack.getSportId())) {
            throw ApiException.invalid("packId", "Le pack choisi ne correspond à aucun des sports de l'adhérent.");
        }
        Discount disc = r.discountId() == null ? discounts.findFirstBySystemTrue().orElseThrow()
                : discounts.findById(r.discountId()).orElseThrow(() -> ApiException.invalid("discountId", "Remise introuvable."));
        if (!disc.isActive()) throw ApiException.invalid("discountId", "Cette remise est inactive.");
        List<Subscription> periods = subscriptions.findByMemberIdOrderByStartDateAscIdAsc(memberId);
        LocalDate start = r.startDate() != null ? r.startDate() : renewalStart(memberId);
        if (!periods.isEmpty() && !start.isAfter(periods.getLast().getStartDate())) {
            throw ApiException.invalid("startDate", "Le renouvellement doit commencer après le début de la période en cours.");
        }
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        Subscription sub = new Subscription();
        sub.setMemberId(memberId);
        sub.setPackId(pack.getId());
        sub.setDiscountId(disc.getId());
        sub.setStartDate(start);
        sub.setMonths(dur.getMonths());
        sub.setAmount(memberService.price(pack, dur, disc, cfg));
        sub.setCreatedAt(cfg.now());
        sub.setCreatedBy(username);
        sub = subscriptions.saveAndFlush(sub);
        if (r.paymentAmount() != null && r.paymentAmount().signum() > 0) {
            pay(new PaymentRequest(memberId, sub.getId(), r.paymentAmount(), r.paymentMethod(), r.paidOn(), r.note()), username);
        }
        return sub;
    }

    /**
     * ADMIN: removes any period without any payment, even cancelled, the last remaining one included:
     * the member is then left without subscription.
     */
    public void cancelRenewal(Long subscriptionId) {
        Subscription sub = subscriptions.findById(subscriptionId).orElseThrow(() -> ApiException.notFound("Période introuvable."));
        if (payments.existsBySubscriptionId(sub.getId())) {
            throw ApiException.conflict("Des paiements (même annulés) sont liés à cette période : supprimez-les d'abord "
                    + "(un paiement doit être annulé avant d'être supprimé).");
        }
        subscriptions.delete(sub);
    }
}
