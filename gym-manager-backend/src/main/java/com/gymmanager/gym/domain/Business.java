package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A business item of the club (sale or service), the revenue mirror of {@link Charge}. Permanent: due every month from
 * {@code startPeriod} to {@code endPeriod}; one-off: concerns {@code period}. With {@code autoPay}, collected every month with
 * {@code amount} up to {@code autoPaidUntil}. Linked to a member ({@code memberId}): counted in the member's price and balance.
 */
@Entity
@Table(name = "businesses")
@Getter @Setter @NoArgsConstructor
public class Business {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String label;

    @Enumerated(EnumType.STRING)
    private BusinessCategory category;

    private boolean permanent;
    private String period;
    private BigDecimal amount;
    private String startPeriod;
    private String endPeriod;
    private boolean autoPay;

    @Enumerated(EnumType.STRING)
    private PaymentMethod autoMethod;

    private String autoPaidUntil;
    private Long memberId;
    private String note = "";
    private LocalDateTime createdAt;
    private String createdBy;
}
