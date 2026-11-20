package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** A salary payment (or advance) of a staff member for a month, with its numbered pay slip. */
@Entity
@Table(name = "salary_payments")
@Getter @Setter @NoArgsConstructor
public class SalaryPayment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String slipNumber;
    private Long staffId;
    /** Month paid, "YYYY-MM". */
    private String period;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private PaymentMethod method;

    private LocalDate paidOn;
    private String note = "";
    private LocalDateTime createdAt;
    private String createdBy;
    private boolean cancelled;
    private LocalDateTime cancelledAt;
    private String cancelledBy;
    private String cancelReason;
}
