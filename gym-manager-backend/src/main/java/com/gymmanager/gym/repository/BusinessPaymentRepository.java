package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.BusinessPayment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessPaymentRepository extends JpaRepository<BusinessPayment, Long> {
    boolean existsByBusinessId(Long businessId);

    boolean existsByBusinessIdAndPeriod(Long businessId, String period);
}
