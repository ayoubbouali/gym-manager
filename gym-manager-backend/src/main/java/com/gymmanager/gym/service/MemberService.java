package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.*;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.MemberPreviewRequest;
import com.gymmanager.gym.web.dto.Requests.MemberRequest;
import com.gymmanager.gym.web.dto.Requests.NoteReminderAction;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class MemberService {
    private final MemberRepository members;
    private final SportRepository sports;
    private final PackRepository packs;
    private final DurationRepository durations;
    private final DiscountRepository discounts;
    private final ActivityRegistrationRepository registrations;
    private final SubscriptionRepository subscriptions;
    private final PaymentRepository payments;
    private final SettingsService settings;
    private final CodeService codes;
    private final FileStorage files;

    public Member save(Long id, MemberRequest r, String username) {
        Member m = id == null ? new Member() : members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        List<Subscription> periods = id == null ? List.of() : subscriptions.findByMemberIdOrderByStartDateAscIdAsc(id);
        Subscription current = periods.isEmpty() ? null : periods.getLast();
        Long currentPack = current == null ? null : current.getPackId();
        Long currentDiscount = current == null ? null : current.getDiscountId();
        // An existing member without subscription keeps none: the form never creates a period (use "Nouvel abonnement").
        boolean withoutSubscription = id != null && current == null;
        ClubConfig cfg = settings.config();
        String last = Check.text(r.lastName(), "lastName", "Nom", 80, true);
        String first = Check.text(r.firstName(), "firstName", "Prénom", 80, true);
        String phone = Check.phone(r.phone(), m.getPhone(), r.phoneCountry(), cfg.country(), "phone", true);
        LocalDate reg = Check.required(r.registrationDate(), "registrationDate", "Date d'inscription");
        if (r.birthDate() != null && r.birthDate().isAfter(cfg.today())) {
            throw ApiException.invalid("birthDate", "La date de naissance ne peut pas être dans le futur.");
        }

        Set<Long> sportIds = new LinkedHashSet<>(Objects.requireNonNullElse(r.sportIds(), List.of()));
        if (sportIds.isEmpty()) throw ApiException.invalid("sportIds", "Choisissez au moins un sport.");
        for (Long sid : sportIds) {
            Sport s = sports.findById(sid).orElseThrow(() -> ApiException.invalid("sportIds", "Sport introuvable."));
            if (!s.isActive() && !m.getSportIds().contains(sid)) {
                throw ApiException.invalid("sportIds", "Le sport « " + s.getName() + " » est inactif.");
            }
        }
        Pack pack = null;
        Discount disc = null;
        BigDecimal custom = null;
        if (!withoutSubscription) {
            pack = packs.findById(Check.required(r.packId(), "packId", "Type d'abonnement"))
                    .orElseThrow(() -> ApiException.invalid("packId", "Pack introuvable."));
            Check.activeOrUnchanged(pack.isActive(), pack.getId(), currentPack, "packId", "Ce pack est inactif.");
            if (!sportIds.contains(pack.getSportId())) {
                throw ApiException.invalid("packId", "Le pack choisi ne correspond à aucun des sports sélectionnés.");
            }
            custom = customAmount(r.customAmount(), pack, cfg);
            if (custom != null) {
                // a typed price replaces any discount: the period keeps the neutral one
                disc = discounts.findFirstBySystemTrue().orElseThrow();
            } else {
                disc = r.discountId() == null
                        ? discounts.findFirstBySystemTrue().orElseThrow()
                        : discounts.findById(r.discountId()).orElseThrow(() -> ApiException.invalid("discountId", "Remise introuvable."));
                Check.activeOrUnchanged(disc.isActive(), disc.getId(), currentDiscount, "discountId", "Cette remise est inactive.");
            }
        }

        // an unchanged number is tolerated so that duplicates predating this rule do not block other edits
        if (!phone.equals(m.getPhone())) {
            String digits = phone.replaceAll("[\\s.-]", "");
            members.findAll().stream()
                    .filter(o -> !Objects.equals(o.getId(), id) && o.getPhone() != null && o.getPhone().replaceAll("[\\s.-]", "").equals(digits))
                    .findFirst()
                    .ifPresent(o -> {
                        throw ApiException.invalid("phone", "Ce numéro de téléphone est déjà utilisé par l'adhérent "
                                + o.getCode() + " (" + o.getFirstName() + " " + o.getLastName() + ").");
                    });
        }

        if (id == null) m.setCode(codes.next("member"));
        m.setLastName(last);
        m.setFirstName(first);
        m.setPhone(phone);
        m.setBirthDate(r.birthDate());
        LocalDate previousReg = m.getRegistrationDate();
        m.setRegistrationDate(reg);
        m.getSportIds().clear();
        m.getSportIds().addAll(sportIds);
        m.setInsurance(r.insurance() == null ? Insurance.IMPAYE : r.insurance());
        writeNotes(m, r.notes(), cfg);
        Member saved = members.save(m);
        if (withoutSubscription) return saved;

        // The form edits the current (latest) period; a single period still starting on the registration date follows it
        // (not one left after deleting the first period, nor a later "Nouvel abonnement").
        Subscription sub = current == null ? new Subscription() : current;
        if (current == null) {
            sub.setMemberId(saved.getId());
            sub.setCreatedAt(cfg.now());
            sub.setCreatedBy(username == null ? "" : username);
        }
        if (current == null || (periods.size() == 1 && current.getStartDate().equals(previousReg))) sub.setStartDate(reg);
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        sub.setPackId(pack.getId());
        sub.setDiscountId(disc.getId());
        sub.setMonths(dur.getMonths());
        sub.setCustomAmount(custom);
        sub.setAmount(price(pack, dur, disc, custom, cfg));
        subscriptions.save(sub);
        return saved;
    }

    /** RG-PRIX for a pack and a member discount (frozen in the period), unless a price was typed by hand. */
    BigDecimal price(Pack pack, Duration dur, Discount memberDiscount, BigDecimal customAmount, ClubConfig cfg) {
        if (customAmount != null) return customAmount;
        BigDecimal packPct = discounts.findById(pack.getDiscountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        return Rules.memberPrice(pack.getMonthlyPrice(), dur.getMonths(), packPct, memberDiscount.getPercent(), cfg.cumulative(), cfg.rounding());
    }

    /** Validates a price typed by hand: a discount, so between 0 and the pack price. Null = none typed. */
    private BigDecimal customAmount(BigDecimal amount, Pack pack, ClubConfig cfg) {
        if (amount == null) return null;
        if (amount.signum() < 0) throw ApiException.invalid("customAmount", "Le montant ne peut pas être négatif.");
        if (amount.stripTrailingZeros().scale() > 2) {
            throw ApiException.invalid("customAmount", "Le montant ne peut pas avoir plus de deux décimales.");
        }
        BigDecimal total = packTotal(pack, cfg);
        if (amount.compareTo(total) > 0) {
            throw ApiException.invalid("customAmount", "Le montant ne peut pas dépasser le prix du type d'abonnement ("
                    + total.toPlainString() + ").");
        }
        return amount.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal packTotal(Pack pack, ClubConfig cfg) {
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        BigDecimal packPct = discounts.findById(pack.getDiscountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        return Rules.packTotal(pack.getMonthlyPrice(), dur.getMonths(), packPct, cfg.rounding());
    }

    public record Preview(BigDecimal price, LocalDate endDate, long remainingDays, Rules.Situation situation) {
    }

    /** Live price / end date while filling the form (computed by the same rules as everywhere else). */
    @Transactional(readOnly = true)
    public Preview preview(MemberPreviewRequest r) {
        if (r.packId() == null || r.registrationDate() == null) return null;
        Pack pack = packs.findById(r.packId()).orElseThrow(() -> ApiException.invalid("packId", "Pack introuvable."));
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        BigDecimal packPct = discounts.findById(pack.getDiscountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        BigDecimal memberPct = r.discountId() == null ? BigDecimal.ZERO
                : discounts.findById(r.discountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        ClubConfig cfg = settings.config();
        BigDecimal price = r.customAmount() != null ? customAmount(r.customAmount(), pack, cfg)
                : Rules.memberPrice(pack.getMonthlyPrice(), dur.getMonths(), packPct, memberPct, cfg.cumulative(), cfg.rounding());
        LocalDate end = Rules.subscriptionEnd(r.registrationDate(), dur.getMonths());
        long remaining = Rules.remainingDays(end, cfg.today());
        return new Preview(price, end, remaining, Rules.situation(remaining, cfg.soonThreshold(), cfg.followThreshold()));
    }

    /** Edits the note alone: unlike {@link #save}, the current period is neither re-priced nor re-validated. */
    public void setNotes(Long id, String notes) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        writeNotes(m, notes, settings.config());
    }

    /** A note written or changed starts a new reminder delay; an unchanged one keeps its date. */
    private static void writeNotes(Member m, String notes, ClubConfig cfg) {
        String text = Check.text(notes, "notes", "Notes", 2000, false);
        if (text.equals(m.getNotes())) return;
        m.setNotes(text);
        m.setNotesUpdatedOn(text.isBlank() ? null : cfg.today());
        m.setNotesRemindOn(null);
    }

    public record NoteReminder(Long memberId, String code, String name, String notes, LocalDate notesUpdatedOn) {
    }

    /**
     * Notes of active members to recall: written before today (a note of the day is not late yet) and not postponed
     * past today. Oldest first.
     */
    @Transactional(readOnly = true)
    public List<NoteReminder> noteReminders() {
        LocalDate today = settings.config().today();
        return members.findAll().stream()
                .filter(m -> m.isActive() && m.getNotes() != null && !m.getNotes().isBlank())
                .filter(m -> m.getNotesUpdatedOn() == null || m.getNotesUpdatedOn().isBefore(today))
                .filter(m -> m.getNotesRemindOn() == null || !m.getNotesRemindOn().isAfter(today))
                .sorted(Comparator.comparing(Member::getNotesUpdatedOn, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(Member::getCode))
                .map(m -> new NoteReminder(m.getId(), m.getCode(), (m.getLastName() + " " + m.getFirstName()).trim(), m.getNotes(),
                        m.getNotesUpdatedOn()))
                .toList();
    }

    /** DONE: the note is treated, so cleared. LATER: kept, and recalled again tomorrow. All or nothing. */
    public void treatNoteReminders(List<NoteReminderAction> actions) {
        LocalDate tomorrow = settings.config().today().plusDays(1);
        for (NoteReminderAction a : Objects.requireNonNullElse(actions, List.<NoteReminderAction>of())) {
            Member m = members.findById(Check.required(a.memberId(), "memberId", "Adhérent"))
                    .orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
            switch (Objects.requireNonNullElse(a.action(), "")) {
                case "DONE" -> {
                    m.setNotes("");
                    m.setNotesUpdatedOn(null);
                    m.setNotesRemindOn(null);
                }
                case "LATER" -> m.setNotesRemindOn(tomorrow);
                default -> throw ApiException.invalid("action", "Choisissez « Traité » ou « À relancer demain ».");
            }
        }
    }

    public void setActive(Long id, boolean active) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        if (active) m.setDeactivatedOn(null);
        else if (m.isActive()) m.setDeactivatedOn(settings.config().today());
        m.setActive(active);
    }

    /**
     * Deletes the member, their subscription periods, cancelled payments, activity registrations and photo.
     * The code is never reused. A member with a non-cancelled payment is kept for accounting: deactivate instead.
     */
    public void delete(Long id) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        if (payments.existsByMemberIdAndCancelledFalse(id)) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    "Cet adhérent a des paiements non annulés : annulez-les ou désactivez-le au lieu de le supprimer.", null, "IN_USE");
        }
        // payments reference members and subscriptions without ON DELETE CASCADE; a live payment
        // recorded meanwhile is left in place so the foreign key refuses the delete
        payments.deleteByMemberIdAndCancelledTrue(id);
        remove(m);
    }

    /** Automatic deletion (RG-PURGE): unlike {@link #delete}, every payment goes with the member, cancelled or not. */
    void purge(Member m) {
        payments.deleteByMemberId(m.getId());
        remove(m);
    }

    private void remove(Member m) {
        payments.flush();
        registrations.deleteByMemberId(m.getId());
        String photo = m.getPhoto();
        members.delete(m);
        members.flush();
        // after commit only: a rolled-back deletion (e.g. one member failing in the nightly purge) keeps its photo
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                files.delete(photo);
            }
        });
    }

    public void setPhoto(Long id, MultipartFile file) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        String stored = files.saveImage(file, "member-" + m.getId());
        String old = m.getPhoto();
        m.setPhoto(stored);
        files.delete(old);
    }

    public void deletePhoto(Long id) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        files.delete(m.getPhoto());
        m.setPhoto(null);
    }

    @Transactional(readOnly = true)
    public String photoName(Long id) {
        return members.findById(id).map(Member::getPhoto).orElse(null);
    }
}
