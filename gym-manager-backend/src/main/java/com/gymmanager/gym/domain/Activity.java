package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "activities")
@Getter @Setter @NoArgsConstructor
public class Activity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String name;
    private String description = "";
    private BigDecimal price = BigDecimal.ZERO;
    private LocalDateTime startsAt;
    private String location = "";
    private Integer maxPlaces;
    private Long managerId;
    private boolean active = true;
}
