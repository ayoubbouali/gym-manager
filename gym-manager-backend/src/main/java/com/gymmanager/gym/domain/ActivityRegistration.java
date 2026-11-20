package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "activity_registrations")
@Getter @Setter @NoArgsConstructor
public class ActivityRegistration {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long memberId;
    private Long activityId;
    private LocalDateTime createdAt;

    public ActivityRegistration(Long memberId, Long activityId, LocalDateTime createdAt) {
        this.memberId = memberId;
        this.activityId = activityId;
        this.createdAt = createdAt;
    }
}
