package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.CodeCounter;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface CodeCounterRepository extends JpaRepository<CodeCounter, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from CodeCounter c where c.entity = :entity")
    Optional<CodeCounter> lockByEntity(String entity);
}
