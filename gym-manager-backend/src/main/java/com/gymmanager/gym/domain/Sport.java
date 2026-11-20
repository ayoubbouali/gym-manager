package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "sports")
@Getter @Setter @NoArgsConstructor
public class Sport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String name;
    private String color;
    private int capacity;
    private BigDecimal monthlyPrice;
    private boolean active = true;

    /** Coaches = staff members attached to this sport. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "sport_coaches", joinColumns = @JoinColumn(name = "sport_id"))
    @Column(name = "staff_id")
    private Set<Long> coachIds = new LinkedHashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "sport_schedules", joinColumns = @JoinColumn(name = "sport_id"))
    private List<ScheduleSlot> schedules = new ArrayList<>();
}
