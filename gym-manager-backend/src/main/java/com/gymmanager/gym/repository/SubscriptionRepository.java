package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Subscription;

import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
    List<Subscription> findByMemberIdOrderByStartDateAscIdAsc(Long memberId);

    boolean existsByPackId(Long packId);

    boolean existsByDiscountId(Long discountId);
}
