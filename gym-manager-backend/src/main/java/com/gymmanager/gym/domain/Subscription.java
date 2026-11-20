package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** A subscription period of a member (first registration or renewal). The amount due is frozen at creation. */
@Entity
@Table(name = "subscriptions")
@Getter @Setter @NoArgsConstructor
public class Subscription {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long memberId;
    private Long packId;
    private Long discountId;
    private LocalDate startDate;
    private int months;
    private BigDecimal amount;
    private LocalDateTime createdAt;
    private String createdBy = "";
}
