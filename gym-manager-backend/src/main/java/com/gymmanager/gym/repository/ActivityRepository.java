package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Activity;

public interface ActivityRepository extends JpaRepository<Activity, Long> {
    boolean existsByManagerId(Long staffId);
}
