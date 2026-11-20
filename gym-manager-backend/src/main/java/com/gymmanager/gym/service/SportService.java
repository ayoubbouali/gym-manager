package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.ScheduleSlot;
import com.gymmanager.gym.domain.Sport;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.repository.PackRepository;
import com.gymmanager.gym.repository.SportRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.web.dto.Requests.SlotRequest;
import com.gymmanager.gym.web.dto.Requests.SportRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class SportService {
    private final SportRepository sports;
    private final StaffRepository staff;
    private final PackRepository packs;
    private final MemberRepository members;
    private final CodeService codes;

    public Sport save(Long id, SportRequest r) {
        Sport s = id == null ? new Sport() : sports.findById(id).orElseThrow(() -> ApiException.notFound("Sport introuvable."));
        String name = Check.text(r.name(), "name", "Nom", 80, true);
        Check.unique(sports.findAll(), Sport::getId, Sport::getName, id, name, "name", "Un sport porte déjà ce nom.");
        String color = Check.text(r.color(), "color", "Couleur", 7, true);
        if (!color.matches("#[0-9A-Fa-f]{6}")) throw ApiException.invalid("color", "Couleur invalide (format #RRGGBB).");
        int capacity = Check.range(r.capacity(), "capacity", "Capacité", 0, 100000);
        var price = Check.amount(r.monthlyPrice(), "monthlyPrice", "Prix mensuel");

        Set<Long> coachIds = new LinkedHashSet<>(Objects.requireNonNullElse(r.coachIds(), List.of()));
        for (Long cid : coachIds) {
            Staff st = staff.findById(cid).orElseThrow(() -> ApiException.invalid("coachIds", "Coach introuvable."));
            if (!st.isActive() && !s.getCoachIds().contains(cid)) {
                throw ApiException.invalid("coachIds", "Le membre du personnel « " + ClubStateService.staffName(st) + " » est inactif.");
            }
        }
        List<ScheduleSlot> slots = new ArrayList<>();
        for (SlotRequest sl : Objects.requireNonNullElse(r.schedules(), List.<SlotRequest>of())) {
            int day = Check.range(sl.dayOfWeek(), "schedules", "Jour", 1, 7);
            Check.required(sl.start(), "schedules", "Heure de début");
            Check.required(sl.end(), "schedules", "Heure de fin");
            if (!sl.end().isAfter(sl.start())) throw ApiException.invalid("schedules", "Créneau : l'heure de fin doit être après l'heure de début.");
            slots.add(new ScheduleSlot(day, sl.start(), sl.end()));
        }

        if (id == null) s.setCode(codes.next("sport"));
        s.setName(name);
        s.setColor(color.toUpperCase());
        s.setCapacity(capacity);
        s.setMonthlyPrice(price);
        s.getCoachIds().clear();
        s.getCoachIds().addAll(coachIds);
        s.getSchedules().clear();
        s.getSchedules().addAll(slots);
        return sports.save(s);
    }

    public void setActive(Long id, boolean active) {
        sports.findById(id).orElseThrow(() -> ApiException.notFound("Sport introuvable.")).setActive(active);
    }

    public void delete(Long id) {
        Sport s = sports.findById(id).orElseThrow(() -> ApiException.notFound("Sport introuvable."));
        if (packs.existsBySportId(id) || members.existsBySport(id)) throw ApiException.inUse("Le sport « " + s.getName() + " »");
        sports.delete(s);
    }
}
