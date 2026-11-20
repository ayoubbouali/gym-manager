package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Staff;

public interface StaffRepository extends JpaRepository<Staff, Long> {
    boolean existsByFunctionId(Long functionId);
}
