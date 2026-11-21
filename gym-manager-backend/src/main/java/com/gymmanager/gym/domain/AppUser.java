package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "app_users")
@Getter @Setter @NoArgsConstructor
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String username;
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    private Role role;

    private boolean active = true;
    private boolean mustChangePassword = true;
    private String email;

    /** Pending emailed temporary password (BCrypt hash, UTC expiry); valid alongside passwordHash. */
    private String tempPasswordHash;
    private LocalDateTime tempPasswordExpiresAt;

    public void clearTempPassword() {
        tempPasswordHash = null;
        tempPasswordExpiresAt = null;
    }
}
