package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "discounts")
@Getter @Setter @NoArgsConstructor
public class Discount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String name;

    @Column(name = "discount_percent")
    private BigDecimal percent;

    private boolean active = true;

    /** "Aucune" (0 %): always present, can be neither deleted nor deactivated. */
    @Column(name = "system_entry")
    private boolean system;
}
