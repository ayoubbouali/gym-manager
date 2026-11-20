package com.gymmanager.gym.web;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;

/** Club identity, logo and the configuration needed by the UI. */
@RestController
@RequiredArgsConstructor
public class ClubController {
    public static final String LOGO_KEY = "club.logoFile";
    private final SettingsService settings;
    private final SettingRepository settingRepo;
    private final FileStorage files;

    private String logoFile() {
        return settingRepo.findById(LOGO_KEY).map(AppSetting::getValue).filter(v -> !v.isBlank()).orElse(null);
    }

    /** Public: shown on the login page. */
    @GetMapping("/api/public/club")
    public Map<String, Object> publicClub() {
        return Map.of("name", settings.config().clubName());
    }

    /** UI configuration (any authenticated user). */
    @GetMapping("/api/config")
    public Map<String, Object> config() {
        ClubConfig c = settings.config();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("clubName", c.clubName());
        m.put("clubAddress", c.clubAddress());
        m.put("clubPhone", c.clubPhone());
        m.put("logoVersion", logoFile());
        m.put("currency", c.currency());
        m.put("timezone", c.timezone().getId());
        m.put("dialCode", c.dialCode());
        m.put("phoneRegex", c.phoneRegex());
        m.put("cumulative", c.cumulative());
        m.put("rounding", c.rounding() == Rules.Rounding.UNIT ? "0" : "2");
        m.put("soonThreshold", c.soonThreshold());
        m.put("followThreshold", c.followThreshold());
        m.put("pageSize", c.pageSize());
        m.put("today", c.today());
        m.put("now", c.now());
        return m;
    }

    @GetMapping("/api/club/logo")
    public ResponseEntity<Resource> logo() {
        String name = logoFile();
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.noCache().cachePrivate()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/club/logo")
    @Transactional
    public Map<String, Object> uploadLogo(@RequestParam("file") MultipartFile file) {
        String old = logoFile();
        String stored = files.saveImage(file, "logo");
        settingRepo.save(new AppSetting(LOGO_KEY, stored));
        files.delete(old);
        return Map.of("logoVersion", stored);
    }

    @DeleteMapping("/api/club/logo")
    @Transactional
    public ResponseEntity<Void> deleteLogo() {
        files.delete(logoFile());
        settingRepo.deleteById(LOGO_KEY);
        return ResponseEntity.noContent().build();
    }
}
