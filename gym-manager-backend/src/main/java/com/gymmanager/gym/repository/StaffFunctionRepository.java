package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.StaffFunction;

public interface StaffFunctionRepository extends JpaRepository<StaffFunction, Long> {
}
