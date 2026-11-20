package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Sport;
import org.springframework.data.jpa.repository.Query;

public interface SportRepository extends JpaRepository<Sport, Long> {
    @Query("select count(s) > 0 from Sport s join s.coachIds c where c = :staffId")
    boolean existsByCoach(Long staffId);
}
