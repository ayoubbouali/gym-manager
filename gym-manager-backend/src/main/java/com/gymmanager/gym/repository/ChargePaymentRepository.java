package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.ChargePayment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChargePaymentRepository extends JpaRepository<ChargePayment, Long> {
    boolean existsByChargeId(Long chargeId);

    boolean existsByChargeIdAndPeriod(Long chargeId, String period);
}
