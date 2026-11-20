package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Discount;

import java.util.Optional;

public interface DiscountRepository extends JpaRepository<Discount, Long> {
    Optional<Discount> findFirstBySystemTrue();
}
