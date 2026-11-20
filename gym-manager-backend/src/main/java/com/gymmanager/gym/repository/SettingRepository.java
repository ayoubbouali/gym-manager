package com.gymmanager.gym.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.gymmanager.gym.domain.AppSetting;

public interface SettingRepository extends JpaRepository<AppSetting, String> {
}
