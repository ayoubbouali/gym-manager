package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Payment;

import java.util.List;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findBySubscriptionId(Long subscriptionId);

    boolean existsByMemberIdAndCancelledFalse(Long memberId);

    void deleteByMemberIdAndCancelledTrue(Long memberId);

    void deleteByMemberId(Long memberId);

    boolean existsBySubscriptionId(Long subscriptionId);
}
