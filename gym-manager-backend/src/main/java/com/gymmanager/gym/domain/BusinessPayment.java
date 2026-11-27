package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Amount collected for a business item and month ("YYYY-MM"). */
@Entity
@Table(name = "business_payments")
@Getter @Setter @NoArgsConstructor
public class BusinessPayment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long businessId;
    private String period;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private PaymentMethod method;

    private LocalDate paidOn;
    private String note = "";
    private LocalDateTime createdAt;
    private String createdBy;
    private LocalDateTime updatedAt;
    private String updatedBy;
}
