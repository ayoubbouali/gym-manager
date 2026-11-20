package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.Discount;
import com.gymmanager.gym.domain.Duration;
import com.gymmanager.gym.domain.StaffFunction;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.web.dto.Requests.DiscountRequest;
import com.gymmanager.gym.web.dto.Requests.DurationRequest;
import com.gymmanager.gym.web.dto.Requests.FunctionRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/** Referentials: staff functions, durations, discounts. */
@Service
@RequiredArgsConstructor
@Transactional
public class ReferenceService {
    private final StaffFunctionRepository functions;
    private final DurationRepository durations;
    private final DiscountRepository discounts;
    private final StaffRepository staff;
    private final PackRepository packs;
    private final SubscriptionRepository subscriptions;
    private final CodeService codes;

    // ---------------------------------------------------------------- functions

    public StaffFunction saveFunction(Long id, FunctionRequest r) {
        StaffFunction f = id == null ? new StaffFunction() : functions.findById(id).orElseThrow(() -> ApiException.notFound("Fonction introuvable."));
        String label = Check.text(r.label(), "label", "Libellé", 80, true);
        Check.unique(functions.findAll(), StaffFunction::getId, StaffFunction::getLabel, id, label, "label", "Cette fonction existe déjà.");
        f.setLabel(label);
        return functions.save(f);
    }

    public void setFunctionActive(Long id, boolean active) {
        functions.findById(id).orElseThrow(() -> ApiException.notFound("Fonction introuvable.")).setActive(active);
    }

    public void deleteFunction(Long id) {
        StaffFunction f = functions.findById(id).orElseThrow(() -> ApiException.notFound("Fonction introuvable."));
        if (staff.existsByFunctionId(id)) throw ApiException.inUse("La fonction « " + f.getLabel() + " »");
        functions.delete(f);
    }

    // ---------------------------------------------------------------- durations

    public Duration saveDuration(Long id, DurationRequest r) {
        Duration d = id == null ? new Duration() : durations.findById(id).orElseThrow(() -> ApiException.notFound("Durée introuvable."));
        String label = Check.text(r.label(), "label", "Libellé", 80, true);
        int months = Check.range(r.months(), "months", "Nombre de mois", 1, 120);
        Check.unique(durations.findAll(), Duration::getId, Duration::getLabel, id, label, "label", "Cette durée existe déjà.");
        d.setLabel(label);
        d.setMonths(months);
        return durations.save(d);
    }

    public void setDurationActive(Long id, boolean active) {
        durations.findById(id).orElseThrow(() -> ApiException.notFound("Durée introuvable.")).setActive(active);
    }

    public void deleteDuration(Long id) {
        Duration d = durations.findById(id).orElseThrow(() -> ApiException.notFound("Durée introuvable."));
        if (packs.existsByDurationId(id)) throw ApiException.inUse("La durée « " + d.getLabel() + " »");
        durations.delete(d);
    }

    // ---------------------------------------------------------------- discounts

    public Discount saveDiscount(Long id, DiscountRequest r) {
        Discount d = id == null ? new Discount() : discounts.findById(id).orElseThrow(() -> ApiException.notFound("Remise introuvable."));
        String name = Check.text(r.name(), "name", "Nom", 80, true);
        BigDecimal pct = Check.amount(r.percent(), "percent", "Pourcentage");
        if (pct.compareTo(BigDecimal.valueOf(100)) > 0) throw ApiException.invalid("percent", "Le pourcentage doit être entre 0 et 100.");
        if (d.isSystem() && pct.signum() != 0) throw ApiException.invalid("percent", "La remise « Aucune » vaut toujours 0 %.");
        Check.unique(discounts.findAll(), Discount::getId, Discount::getName, id, name, "name", "Une remise porte déjà ce nom.");
        if (id == null) d.setCode(codes.next("discount"));
        d.setName(name);
        d.setPercent(pct);
        return discounts.save(d);
    }

    public void setDiscountActive(Long id, boolean active) {
        Discount d = discounts.findById(id).orElseThrow(() -> ApiException.notFound("Remise introuvable."));
        if (d.isSystem() && !active) throw ApiException.badRequest("La remise « Aucune » est toujours active.");
        d.setActive(active);
    }

    public void deleteDiscount(Long id) {
        Discount d = discounts.findById(id).orElseThrow(() -> ApiException.notFound("Remise introuvable."));
        if (d.isSystem()) throw ApiException.badRequest("La remise « Aucune » ne peut pas être supprimée.");
        if (packs.existsByDiscountId(id) || subscriptions.existsByDiscountId(id)) throw ApiException.inUse("La remise « " + d.getName() + " »");
        discounts.delete(d);
    }
}
