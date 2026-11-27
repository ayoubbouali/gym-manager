package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.Business;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessRepository extends JpaRepository<Business, Long> {
}
