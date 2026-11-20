package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalTime;

@Embeddable
@Getter @Setter @NoArgsConstructor
public class ScheduleSlot {
    /** ISO day of week: 1 = Monday … 7 = Sunday. */
    @Column(name = "day_of_week")
    private int dayOfWeek;
    private LocalTime startTime;
    private LocalTime endTime;

    public ScheduleSlot(int dayOfWeek, LocalTime startTime, LocalTime endTime) {
        this.dayOfWeek = dayOfWeek;
        this.startTime = startTime;
        this.endTime = endTime;
    }
}
