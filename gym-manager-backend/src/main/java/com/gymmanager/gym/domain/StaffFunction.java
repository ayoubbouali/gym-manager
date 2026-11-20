package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Staff function (Coach, Accueil, Entretien…). */
@Entity
@Table(name = "staff_functions")
@Getter @Setter @NoArgsConstructor
public class StaffFunction {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String label;
    private boolean active = true;
}
