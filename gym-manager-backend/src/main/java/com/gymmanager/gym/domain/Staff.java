package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "staff")
@Getter @Setter @NoArgsConstructor
public class Staff {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String lastName;
    private String firstName = "";
    private String phone = "";
    private Long functionId;

    @Enumerated(EnumType.STRING)
    private PayMode payMode;

    private BigDecimal fixedSalary;
    private boolean active = true;
}
