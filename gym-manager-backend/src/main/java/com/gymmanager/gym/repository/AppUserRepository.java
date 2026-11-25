package com.gymmanager.gym.repository;

import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.domain.Permission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByUsernameIgnoreCase(String username);

    @Query("select count(u) from AppUser u where u.active = true and :permission member of u.userRole.permissions")
    long countActiveWith(Permission permission);

    boolean existsByUserRoleId(Long roleId);
}
