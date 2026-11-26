package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.Charge;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChargeRepository extends JpaRepository<Charge, Long> {
}
