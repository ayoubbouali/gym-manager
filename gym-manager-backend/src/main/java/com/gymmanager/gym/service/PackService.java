package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.Discount;
import com.gymmanager.gym.domain.Duration;
import com.gymmanager.gym.domain.Pack;
import com.gymmanager.gym.domain.Sport;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.GenerateItem;
import com.gymmanager.gym.web.dto.Requests.GeneratePacksRequest;
import com.gymmanager.gym.web.dto.Requests.PackPreviewRequest;
import com.gymmanager.gym.web.dto.Requests.PackRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class PackService {
    private final PackRepository packs;
    private final SportRepository sports;
    private final DurationRepository durations;
    private final DiscountRepository discounts;
    private final SubscriptionRepository subscriptions;
    private final SettingsService settings;
    private final CodeService codes;

    public Pack save(Long id, PackRequest r) {
        Pack p = id == null ? new Pack() : packs.findById(id).orElseThrow(() -> ApiException.notFound("Pack introuvable."));
        String name = Check.text(r.name(), "name", "Nom du pack", 120, true);
        Sport sport = sports.findById(Check.required(r.sportId(), "sportId", "Sport"))
                .orElseThrow(() -> ApiException.invalid("sportId", "Sport introuvable."));
        Check.activeOrUnchanged(sport.isActive(), sport.getId(), p.getSportId(), "sportId", "Ce sport est inactif.");
        Duration dur = durations.findById(Check.required(r.durationId(), "durationId", "Durée"))
                .orElseThrow(() -> ApiException.invalid("durationId", "Durée introuvable."));
        Check.activeOrUnchanged(dur.isActive(), dur.getId(), p.getDurationId(), "durationId", "Cette durée est inactive.");
        Discount disc = resolveDiscount(r.discountId(), p.getDiscountId());
        BigDecimal price = Check.amount(r.monthlyPrice(), "monthlyPrice", "Prix / mois");

        if (id == null) p.setCode(codes.next("pack"));
        p.setName(name);
        p.setSportId(sport.getId());
        p.setDurationId(dur.getId());
        p.setDiscountId(disc.getId());
        p.setMonthlyPrice(price);
        return packs.save(p);
    }

    private Discount resolveDiscount(Long discountId, Long current) {
        if (discountId == null) {
            return discounts.findFirstBySystemTrue().orElseThrow(() -> ApiException.badRequest("Remise « Aucune » manquante."));
        }
        Discount d = discounts.findById(discountId).orElseThrow(() -> ApiException.invalid("discountId", "Remise introuvable."));
        Check.activeOrUnchanged(d.isActive(), d.getId(), current, "discountId", "Cette remise est inactive.");
        return d;
    }

    /** "Générer les packs d'un sport": one pack per item (normally one per active duration). */
    public List<Pack> generate(GeneratePacksRequest r) {
        Sport sport = sports.findById(Check.required(r.sportId(), "sportId", "Sport"))
                .orElseThrow(() -> ApiException.invalid("sportId", "Sport introuvable."));
        if (r.items() == null || r.items().isEmpty()) throw ApiException.badRequest("Aucun pack à générer.");
        List<Pack> created = new ArrayList<>();
        for (GenerateItem it : r.items()) {
            created.add(save(null, new PackRequest(it.name(), sport.getId(), it.durationId(),
                    it.monthlyPrice() != null ? it.monthlyPrice() : sport.getMonthlyPrice(), it.discountId())));
        }
        return created;
    }

    @Transactional(readOnly = true)
    public BigDecimal preview(PackPreviewRequest r) {
        Duration dur = durations.findById(Check.required(r.durationId(), "durationId", "Durée"))
                .orElseThrow(() -> ApiException.invalid("durationId", "Durée introuvable."));
        BigDecimal pct = r.discountId() == null ? BigDecimal.ZERO
                : discounts.findById(r.discountId()).map(Discount::getPercent).orElse(BigDecimal.ZERO);
        BigDecimal price = r.monthlyPrice() == null ? BigDecimal.ZERO : r.monthlyPrice();
        return Rules.packTotal(price, dur.getMonths(), pct, settings.config().rounding());
    }

    public void setActive(Long id, boolean active) {
        packs.findById(id).orElseThrow(() -> ApiException.notFound("Pack introuvable.")).setActive(active);
    }

    public void delete(Long id) {
        Pack p = packs.findById(id).orElseThrow(() -> ApiException.notFound("Pack introuvable."));
        if (subscriptions.existsByPackId(id)) throw ApiException.inUse("Le pack « " + p.getName() + " »");
        packs.delete(p);
    }
}
