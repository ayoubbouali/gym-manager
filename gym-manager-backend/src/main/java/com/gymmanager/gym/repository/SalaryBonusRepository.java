package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.SalaryBonus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SalaryBonusRepository extends JpaRepository<SalaryBonus, Long> {
    Optional<SalaryBonus> findByStaffIdAndPeriod(Long staffId, String period);

    long deleteByStaffIdAndPeriod(Long staffId, String period);
}
