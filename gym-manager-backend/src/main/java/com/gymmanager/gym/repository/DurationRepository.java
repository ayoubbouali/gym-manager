package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Duration;

public interface DurationRepository extends JpaRepository<Duration, Long> {
}
