package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A club charge. Permanent: due every month from {@code startPeriod} to {@code endPeriod} (null while running).
 * One-off: concerns {@code period}; {@code amount} is null while unknown.
 * A permanent charge with {@code autoPay} is settled every month with {@code amount}, up to {@code autoPaidUntil}.
 */
@Entity
@Table(name = "charges")
@Getter @Setter @NoArgsConstructor
public class Charge {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String label;

    @Enumerated(EnumType.STRING)
    private ChargeCategory category;

    private boolean permanent;
    private String period;
    private BigDecimal amount;
    private String startPeriod;
    private String endPeriod;
    private boolean autoPay;

    @Enumerated(EnumType.STRING)
    private PaymentMethod autoMethod;

    private String autoPaidUntil;
    private String note = "";
    private LocalDateTime createdAt;
    private String createdBy;
}
