package com.gymmanager.gym.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.EnumSet;
import java.util.Set;

/** Named role chosen by the club; its permissions are what the server actually enforces. */
@Entity
@Table(name = "user_roles")
@Getter @Setter @NoArgsConstructor
public class UserRole {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;

    // eager: read by the security filter, outside any transaction
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Column(name = "permission")
    @Enumerated(EnumType.STRING)
    private Set<Permission> permissions = EnumSet.noneOf(Permission.class);

    public boolean grants(Permission p) {
        return permissions.contains(p);
    }
}
