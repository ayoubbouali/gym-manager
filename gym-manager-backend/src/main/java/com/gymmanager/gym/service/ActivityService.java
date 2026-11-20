package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.Activity;
import com.gymmanager.gym.domain.ActivityRegistration;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.ActivityRegistrationRepository;
import com.gymmanager.gym.repository.ActivityRepository;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.ActivityRequest;
import com.gymmanager.gym.web.dto.Requests.RegistrationRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
@Transactional
public class ActivityService {
    private final ActivityRepository activities;
    private final ActivityRegistrationRepository registrations;
    private final MemberRepository members;
    private final StaffRepository staff;
    private final SettingsService settings;
    private final CodeService codes;

    public Activity save(Long id, ActivityRequest r) {
        Activity a = id == null ? new Activity() : activities.findById(id).orElseThrow(() -> ApiException.notFound("Activité introuvable."));
        String name = Check.text(r.name(), "name", "Nom", 120, true);
        BigDecimal price = Check.amount(r.price() == null ? BigDecimal.ZERO : r.price(), "price", "Prix");
        var startsAt = Check.required(r.startsAt(), "startsAt", "Date et heure");
        if (r.maxPlaces() != null) {
            Check.range(r.maxPlaces(), "maxPlaces", "Places max", 1, 100000);
            if (id != null && registrations.countByActivityId(id) > r.maxPlaces()) {
                throw ApiException.invalid("maxPlaces", "Il y a déjà plus d'inscrits que ce nombre de places.");
            }
        }
        Staff manager = staff.findById(Check.required(r.managerId(), "managerId", "Responsable"))
                .orElseThrow(() -> ApiException.invalid("managerId", "Responsable introuvable."));
        Check.activeOrUnchanged(manager.isActive(), manager.getId(), a.getManagerId(), "managerId", "Ce membre du personnel est inactif.");

        if (id == null) a.setCode(codes.next("activity"));
        a.setName(name);
        a.setDescription(Check.text(r.description(), "description", "Description", 2000, false));
        a.setPrice(price);
        a.setStartsAt(startsAt.withSecond(0).withNano(0));
        a.setLocation(Check.text(r.location(), "location", "Lieu", 120, false));
        a.setMaxPlaces(r.maxPlaces());
        a.setManagerId(manager.getId());
        return activities.save(a);
    }

    public void setActive(Long id, boolean active) {
        activities.findById(id).orElseThrow(() -> ApiException.notFound("Activité introuvable.")).setActive(active);
    }

    public void delete(Long id) {
        Activity a = activities.findById(id).orElseThrow(() -> ApiException.notFound("Activité introuvable."));
        if (registrations.existsByActivityId(id)) throw ApiException.inUse("L'activité « " + a.getName() + " »");
        activities.delete(a);
    }

    /** RG-NB-ACT: refused when the activity is full; a member registers once per activity. */
    public ActivityRegistration register(RegistrationRequest r) {
        Long memberId = Check.required(r.memberId(), "memberId", "Adhérent");
        Long activityId = Check.required(r.activityId(), "activityId", "Activité");
        if (!members.existsById(memberId)) throw ApiException.invalid("memberId", "Adhérent introuvable.");
        Activity a = activities.findById(activityId).orElseThrow(() -> ApiException.invalid("activityId", "Activité introuvable."));
        if (!a.isActive()) throw ApiException.invalid("activityId", "Cette activité est inactive.");
        if (registrations.existsByMemberIdAndActivityId(memberId, activityId)) {
            throw ApiException.conflict("Cet adhérent est déjà inscrit à cette activité.");
        }
        Rules.ActivityStats st = Rules.activityStats(a.getMaxPlaces(), (int) registrations.countByActivityId(activityId));
        if (st.full()) throw ApiException.conflict("L'activité « " + a.getName() + " » est complète.");
        return registrations.save(new ActivityRegistration(memberId, activityId, settings.config().now()));
    }

    public void unregister(Long id) {
        ActivityRegistration r = registrations.findById(id).orElseThrow(() -> ApiException.notFound("Inscription introuvable."));
        registrations.delete(r);
    }
}
