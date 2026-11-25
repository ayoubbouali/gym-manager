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

    @ManyToOne(optional = false)
    @JoinColumn(name = "role_id")
    private UserRole userRole;

    private boolean active = true;
    private boolean mustChangePassword = true;
    private String email;
    private String phone;

    /** File name of the profile photo in the uploads directory (never the image itself). */
    private String photo;

    /** Pending emailed temporary password (BCrypt hash, UTC expiry); valid alongside passwordHash. */
    private String tempPasswordHash;
    private LocalDateTime tempPasswordExpiresAt;

    public boolean can(Permission p) {
        return userRole.grants(p);
    }

    public void clearTempPassword() {
        tempPasswordHash = null;
        tempPasswordExpiresAt = null;
    }
}
