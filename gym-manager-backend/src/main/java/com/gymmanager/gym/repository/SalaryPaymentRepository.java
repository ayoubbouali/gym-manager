package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.SalaryPayment;

import java.util.List;

public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, Long> {
    List<SalaryPayment> findByStaffIdAndPeriod(Long staffId, String period);

    boolean existsByStaffId(Long staffId);
}
