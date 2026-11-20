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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
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
        ClubConfig cfg = settings.config();
        String last = Check.text(r.lastName(), "lastName", "Nom", 80, true);
        String first = Check.text(r.firstName(), "firstName", "Prénom", 80, true);
        String phone = Check.phone(r.phone(), cfg.phoneRegex(), "phone", true);
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
        Pack pack = packs.findById(Check.required(r.packId(), "packId", "Type d'abonnement"))
                .orElseThrow(() -> ApiException.invalid("packId", "Pack introuvable."));
        Check.activeOrUnchanged(pack.isActive(), pack.getId(), currentPack, "packId", "Ce pack est inactif.");
        if (!sportIds.contains(pack.getSportId())) {
            throw ApiException.invalid("packId", "Le pack choisi ne correspond à aucun des sports sélectionnés.");
        }
        Discount disc = r.discountId() == null
                ? discounts.findFirstBySystemTrue().orElseThrow()
                : discounts.findById(r.discountId()).orElseThrow(() -> ApiException.invalid("discountId", "Remise introuvable."));
        Check.activeOrUnchanged(disc.isActive(), disc.getId(), currentDiscount, "discountId", "Cette remise est inactive.");

        String key = Rules.normalize(last) + "|" + Rules.normalize(first) + "|" + phone;
        boolean duplicate = members.findAll().stream().anyMatch(o -> !Objects.equals(o.getId(), id)
                && (Rules.normalize(o.getLastName()) + "|" + Rules.normalize(o.getFirstName()) + "|" + o.getPhone()).equals(key));
        if (duplicate) throw ApiException.invalid("lastName", "Un adhérent avec ce nom, ce prénom et ce téléphone existe déjà.");

        if (id == null) m.setCode(codes.next("member"));
        m.setLastName(last);
        m.setFirstName(first);
        m.setPhone(phone);
        m.setBirthDate(r.birthDate());
        m.setRegistrationDate(reg);
        m.getSportIds().clear();
        m.getSportIds().addAll(sportIds);
        m.setInsurance(r.insurance() == null ? Insurance.IMPAYE : r.insurance());
        m.setNotes(Check.text(r.notes(), "notes", "Notes", 2000, false));
        Member saved = members.save(m);

        // The form edits the current (latest) period; with a single period, its start follows the registration date.
        Subscription sub = current == null ? new Subscription() : current;
        if (current == null) {
            sub.setMemberId(saved.getId());
            sub.setCreatedAt(cfg.now());
            sub.setCreatedBy(username == null ? "" : username);
        }
        if (current == null || periods.size() == 1) sub.setStartDate(reg);
        Duration dur = durations.findById(pack.getDurationId()).orElseThrow();
        sub.setPackId(pack.getId());
        sub.setDiscountId(disc.getId());
        sub.setMonths(dur.getMonths());
        sub.setAmount(price(pack, dur, disc, cfg));
        subscriptions.save(sub);
        return saved;
    }

    /** RG-PRIX for a pack and a member discount (frozen in the period). */
    BigDecimal price(Pack pack, Duration dur, Discount memberDiscount, ClubConfig cfg) {
        BigDecimal packPct = discounts.findById(pack.getDiscountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        return Rules.memberPrice(pack.getMonthlyPrice(), dur.getMonths(), packPct, memberDiscount.getPercent(), cfg.cumulative(), cfg.rounding());
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
        BigDecimal price = Rules.memberPrice(pack.getMonthlyPrice(), dur.getMonths(), packPct, memberPct, cfg.cumulative(), cfg.rounding());
        LocalDate end = Rules.subscriptionEnd(r.registrationDate(), dur.getMonths());
        long remaining = Rules.remainingDays(end, cfg.today());
        return new Preview(price, end, remaining, Rules.situation(remaining, cfg.soonThreshold(), cfg.followThreshold()));
    }

    public void setActive(Long id, boolean active) {
        members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable.")).setActive(active);
    }

    /**
     * Deletes the member, their subscription periods, activity registrations and photo. The code is never reused.
     * A member with recorded payments is kept for accounting: deactivate instead.
     */
    public void delete(Long id) {
        Member m = members.findById(id).orElseThrow(() -> ApiException.notFound("Adhérent introuvable."));
        if (payments.existsByMemberId(id)) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    "Cet adhérent a des paiements enregistrés : désactivez-le au lieu de le supprimer (l'historique des reçus est conservé).", null, "IN_USE");
        }
        registrations.deleteByMemberId(id);
        String photo = m.getPhoto();
        members.delete(m);
        members.flush();
        files.delete(photo);
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
