package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "members")
@Getter @Setter @NoArgsConstructor
public class Member {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String lastName;
    private String firstName;
    private String phone;
    private LocalDate birthDate;
    /** First registration at the club. Subscription periods (renewals) are in {@link Subscription}. */
    private LocalDate registrationDate;

    @Enumerated(EnumType.STRING)
    private Insurance insurance = Insurance.IMPAYE;

    /** File name of the photo in the uploads directory (never the image itself). */
    private String photo;
    private String notes = "";
    private boolean active = true;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "member_sports", joinColumns = @JoinColumn(name = "member_id"))
    @Column(name = "sport_id")
    private Set<Long> sportIds = new LinkedHashSet<>();
}
