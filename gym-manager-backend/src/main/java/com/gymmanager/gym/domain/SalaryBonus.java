package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Bonus of a staff member for a month, paid together with the salary of that month. */
@Entity
@Table(name = "salary_bonuses")
@Getter @Setter @NoArgsConstructor
public class SalaryBonus {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long staffId;
    /** Month of the bonus, "YYYY-MM". */
    private String period;
    private BigDecimal amount;
    private String note = "";
    private LocalDateTime createdAt;
    private String createdBy;
}
