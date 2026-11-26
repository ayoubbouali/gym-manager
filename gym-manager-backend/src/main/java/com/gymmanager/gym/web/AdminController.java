package com.gymmanager.gym.web;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.security.UserService;
import com.gymmanager.gym.security.UserService.UserView;
import com.gymmanager.gym.service.ChargeService;
import com.gymmanager.gym.service.InsightService;
import com.gymmanager.gym.service.MemberPurgeService;
import com.gymmanager.gym.settings.RegionalCatalog;
import com.gymmanager.gym.settings.SettingDef;
import com.gymmanager.gym.settings.SettingsCatalog;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.web.dto.Requests.*;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Dashboard, alerts (all roles); statistics, settings and users (ADMIN, see SecurityConfig). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AdminController {
    private final InsightService insights;
    private final SettingsService settings;
    private final SettingRepository settingRepo;
    private final CodeService codes;
    private final UserService users;
    private final FileStorage files;
    private final MemberPurgeService purge;
    private final ChargeService chargeService;

    @GetMapping("/dashboard")
    public InsightService.Dashboard dashboard() {
        return insights.dashboard();
    }

    @GetMapping("/alerts")
    public InsightService.Alerts alerts() {
        return insights.alerts();
    }

    @GetMapping("/stats")
    public InsightService.Stats stats(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return insights.stats(from, to);
    }

    @GetMapping("/stats/registrations")
    public InsightService.RegistrationStats registrations(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return insights.registrations(from, to);
    }

    /** Months "YYYY-MM"; default: the current month. */
    @GetMapping("/stats/charges")
    public ChargeService.ChargeStats charges(@RequestParam(required = false) String from, @RequestParam(required = false) String to) {
        return chargeService.stats(from, to);
    }

    // ---------------------------------------------------------------- settings

    /**
     * Secret values (Brevo API key) are always "" in {@code values}; {@code secretsSet} tells whether one is stored.
     * {@code regional} holds the lists offered by the Régional tab (cities: {@code GET /api/admin/regional/cities}).
     */
    public record SettingsPayload(Map<String, String> groups, List<SettingDef> definitions, Map<String, String> values,
                                  Map<String, Boolean> secretsSet, Map<String, String> nextCodes, RegionalCatalog.Options regional) {
    }

    /** Paramètres › Suppression auto: members the next nightly run would delete, with the saved settings. */
    @GetMapping("/settings/purge-preview")
    public MemberPurgeService.Preview purgePreview() {
        return purge.preview();
    }

    @GetMapping("/settings")
    public SettingsPayload getSettings() {
        Map<String, String> next = new LinkedHashMap<>();
        SettingsCatalog.CODE_ENTITIES.forEach(e -> next.put(e, codes.peek(e)));
        return new SettingsPayload(SettingsCatalog.GROUPS, SettingsCatalog.ALL, settings.masked(), settings.secretsSet(), next, RegionalCatalog.OPTIONS);
    }

    /** Cities of a country for the Régional tab, most populous first; empty for an unknown country. */
    @GetMapping("/admin/regional/cities")
    public List<String> cities(@RequestParam String country) {
        return RegionalCatalog.cities(country);
    }

    @PutMapping("/settings")
    public SettingsPayload updateSettings(@RequestBody SettingsUpdateRequest r) {
        settings.update(r.values() == null ? Map.of() : r.values(), r.phoneCountries() == null ? Map.of() : r.phoneCountries());
        return getSettings();
    }

    @PostMapping("/settings/reset/{group}")
    @Transactional
    public SettingsPayload resetSettings(@PathVariable String group) {
        settings.reset(group);
        if ("club".equals(group)) {
            settingRepo.findById(ClubController.LOGO_KEY).map(AppSetting::getValue).ifPresent(files::delete);
            settingRepo.deleteById(ClubController.LOGO_KEY);
        }
        return getSettings();
    }

    // ---------------------------------------------------------------- users

    @GetMapping("/users")
    public List<UserView> listUsers() {
        return users.list();
    }

    @PostMapping("/users")
    public UserView createUser(@RequestBody UserCreateRequest r) {
        return users.create(r);
    }

    @PutMapping("/users/{id}")
    public UserView updateUser(@PathVariable Long id, @RequestBody UserUpdateRequest r, Principal p) {
        return users.update(id, r, p.getName());
    }

    @GetMapping("/users/{id}/photo")
    public ResponseEntity<Resource> userPhoto(@PathVariable Long id) {
        return image(files, users.photoName(id));
    }

    /** Uploaded image, never cached by shared caches; 404 when absent. */
    static ResponseEntity<Resource> image(FileStorage files, String name) {
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.noCache().cachePrivate()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/roles")
    public List<UserService.RoleView> listRoles() {
        return users.roles();
    }

    @PostMapping("/roles")
    public UserService.RoleView createRole(@RequestBody UserRoleRequest r, Principal p) {
        return users.saveRole(null, r, p.getName());
    }

    @PutMapping("/roles/{id}")
    public UserService.RoleView updateRole(@PathVariable Long id, @RequestBody UserRoleRequest r, Principal p) {
        return users.saveRole(id, r, p.getName());
    }

    @DeleteMapping("/roles/{id}")
    public ResponseEntity<Void> deleteRole(@PathVariable Long id) {
        users.deleteRole(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<Void> resetPassword(@PathVariable Long id, @RequestBody ResetPasswordRequest r) {
        users.resetPassword(id, r.password());
        return ResponseEntity.noContent().build();
    }
}
