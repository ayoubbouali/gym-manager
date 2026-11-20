package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "code_counters")
@Getter @Setter @NoArgsConstructor
public class CodeCounter {
    @Id
    private String entity;

    @Column(name = "next_value", nullable = false)
    private long nextValue;

    public CodeCounter(String entity, long nextValue) {
        this.entity = entity;
        this.nextValue = nextValue;
    }
}
