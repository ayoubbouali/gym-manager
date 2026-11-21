package com.gymmanager.gym.importer;

import com.gymmanager.gym.domain.Discount;
import com.gymmanager.gym.repository.DiscountRepository;
import com.gymmanager.gym.service.ReferenceService;
import com.gymmanager.gym.web.dto.Requests.DiscountRequest;
import com.gymmanager.gym.web.dto.Requests.DurationRequest;
import com.gymmanager.gym.web.dto.Requests.FunctionRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Base referentials of an empty but usable club: functions, durations and standard discounts ("Aucune" = system). */
@Service
@RequiredArgsConstructor
public class BaseDataService {
    private final DataResetService reset;
    private final ReferenceService refs;
    private final DiscountRepository discountRepo;

    /** Full reset: deletes all the club data, then recreates the base referentials. */
    @Transactional
    public Map<String, Long> wipe() {
        Map<String, Long> before = reset.wipe();
        base();
        return before;
    }

    /** At startup: recreates the base referentials if they are all missing (e.g. after a manual reset). */
    @Transactional
    public boolean ensureBase() {
        if (discountRepo.count() > 0) return false;
        base();
        return true;
    }

    private void base() {
        for (String f : List.of("Coach", "Accueil", "Entretien")) refs.saveFunction(null, new FunctionRequest(f));
        for (Object[] d : new Object[][]{{"Mensuel", 1}, {"Trimestriel", 3}, {"Annuel", 12}}) {
            refs.saveDuration(null, new DurationRequest((String) d[0], (Integer) d[1]));
        }
        for (Object[] d : new Object[][]{{"Aucune", 0}, {"Remise 5%", 5}, {"Remise 10%", 10}, {"Remise 15%", 15}, {"Remise 20%", 20},
                {"Remise étudiant 25%", 25}, {"Remise famille 30%", 30}}) {
            Discount saved = refs.saveDiscount(null, new DiscountRequest((String) d[0], BigDecimal.valueOf((Integer) d[1])));
            if ("Aucune".equals(d[0])) saved.setSystem(true);
        }
        discountRepo.flush();
    }
}
