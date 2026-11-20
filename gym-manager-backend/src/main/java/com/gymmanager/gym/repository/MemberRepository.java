package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.Member;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    Optional<Member> findByCodeIgnoreCase(String code);

    @Query("select count(m) > 0 from Member m join m.sportIds s where s = :sportId")
    boolean existsBySport(Long sportId);
}
