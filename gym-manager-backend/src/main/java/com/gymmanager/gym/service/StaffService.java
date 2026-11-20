package com.gymmanager.gym.service;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.PayMode;
import com.gymmanager.gym.domain.Sport;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.domain.StaffFunction;
import com.gymmanager.gym.repository.ActivityRepository;
import com.gymmanager.gym.repository.SportRepository;
import com.gymmanager.gym.repository.StaffFunctionRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.StaffRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class StaffService {
    private final StaffRepository staff;
    private final StaffFunctionRepository functions;
    private final SportRepository sports;
    private final ActivityRepository activities;
    private final com.gymmanager.gym.repository.SalaryPaymentRepository salaryPayments;
    private final SettingsService settings;
    private final CodeService codes;

    public Staff save(Long id, StaffRequest r) {
        Staff s = id == null ? new Staff() : staff.findById(id).orElseThrow(() -> ApiException.notFound("Membre du personnel introuvable."));
        String last = Check.text(r.lastName(), "lastName", "Nom", 80, true);
        String first = Check.text(r.firstName(), "firstName", "Prénom", 80, false);
        String phone = Check.phone(r.phone(), settings.config().phoneRegex(), "phone", false);
        Check.required(r.functionId(), "functionId", "Fonction");
        StaffFunction fn = functions.findById(r.functionId()).orElseThrow(() -> ApiException.invalid("functionId", "Fonction introuvable."));
        Check.activeOrUnchanged(fn.isActive(), fn.getId(), s.getFunctionId(), "functionId", "Cette fonction est inactive.");
        PayMode mode = Check.required(r.payMode(), "payMode", "Mode de rémunération");
        if (mode == PayMode.FIXED) {
            Check.amount(r.fixedSalary(), "fixedSalary", "Salaire fixe");
        }
        Set<Long> wanted = new HashSet<>(Objects.requireNonNullElse(r.sportIds(), List.of()));
        List<Sport> allSports = sports.findAll();
        for (Long sid : wanted) {
            Sport sp = allSports.stream().filter(x -> x.getId().equals(sid)).findFirst()
                    .orElseThrow(() -> ApiException.invalid("sportIds", "Sport introuvable."));
            boolean already = s.getId() != null && sp.getCoachIds().contains(s.getId());
            if (!sp.isActive() && !already) throw ApiException.invalid("sportIds", "Le sport « " + sp.getName() + " » est inactif.");
        }

        if (id == null) s.setCode(codes.next("staff"));
        s.setLastName(last);
        s.setFirstName(first);
        s.setPhone(phone);
        s.setFunctionId(fn.getId());
        s.setPayMode(mode);
        s.setFixedSalary(mode == PayMode.FIXED ? r.fixedSalary() : null);
        Staff saved = staff.save(s);
        // "Sports encadrés" are stored on the sports (coach relation).
        for (Sport sp : allSports) {
            boolean has = sp.getCoachIds().contains(saved.getId());
            if (wanted.contains(sp.getId()) && !has) sp.getCoachIds().add(saved.getId());
            if (!wanted.contains(sp.getId()) && has) sp.getCoachIds().remove(saved.getId());
        }
        return saved;
    }

    public void setActive(Long id, boolean active) {
        staff.findById(id).orElseThrow(() -> ApiException.notFound("Membre du personnel introuvable.")).setActive(active);
    }

    public void delete(Long id) {
        Staff s = staff.findById(id).orElseThrow(() -> ApiException.notFound("Membre du personnel introuvable."));
        if (sports.existsByCoach(id) || activities.existsByManagerId(id) || salaryPayments.existsByStaffId(id)) {
            throw ApiException.inUse("« " + ClubStateService.staffName(s) + " »");
        }
        staff.delete(s);
    }
}
