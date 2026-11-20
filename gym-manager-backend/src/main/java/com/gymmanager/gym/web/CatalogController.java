package com.gymmanager.gym.web;

import com.gymmanager.gym.service.*;
import com.gymmanager.gym.service.Views.*;
import com.gymmanager.gym.web.dto.Requests.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Packs, discounts, durations, functions, sports, staff and activities. Write access is restricted in SecurityConfig. */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CatalogController {
    private final ClubStateService state;
    private final ReferenceService refs;
    private final PackService packs;
    private final SportService sports;
    private final StaffService staff;
    private final ActivityService activities;

    private static ResponseEntity<Void> noContent() {
        return ResponseEntity.noContent().build();
    }

    private static boolean on(ActiveRequest r) {
        return Boolean.TRUE.equals(r.active());
    }

    // ---------------------------------------------------------------- packs

    @GetMapping("/packs")
    public List<PackView> packs() {
        return state.load().packs();
    }

    @PostMapping("/packs")
    public PackView createPack(@RequestBody PackRequest r) {
        Long id = packs.save(null, r).getId();
        return state.load().packs().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    @PutMapping("/packs/{id}")
    public PackView updatePack(@PathVariable Long id, @RequestBody PackRequest r) {
        packs.save(id, r);
        return state.load().packs().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    @PostMapping("/packs/generate")
    public Map<String, Object> generatePacks(@RequestBody GeneratePacksRequest r) {
        return Map.of("created", packs.generate(r).size());
    }

    @PostMapping("/packs/preview")
    public Map<String, BigDecimal> previewPack(@RequestBody PackPreviewRequest r) {
        return Map.of("total", packs.preview(r));
    }

    @PatchMapping("/packs/{id}/active")
    public ResponseEntity<Void> packActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        packs.setActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/packs/{id}")
    public ResponseEntity<Void> deletePack(@PathVariable Long id) {
        packs.delete(id);
        return noContent();
    }

    // ---------------------------------------------------------------- discounts

    @GetMapping("/discounts")
    public List<DiscountView> discounts() {
        return state.load().discounts();
    }

    @PostMapping("/discounts")
    public Map<String, Long> createDiscount(@RequestBody DiscountRequest r) {
        return Map.of("id", refs.saveDiscount(null, r).getId());
    }

    @PutMapping("/discounts/{id}")
    public Map<String, Long> updateDiscount(@PathVariable Long id, @RequestBody DiscountRequest r) {
        return Map.of("id", refs.saveDiscount(id, r).getId());
    }

    @PatchMapping("/discounts/{id}/active")
    public ResponseEntity<Void> discountActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        refs.setDiscountActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/discounts/{id}")
    public ResponseEntity<Void> deleteDiscount(@PathVariable Long id) {
        refs.deleteDiscount(id);
        return noContent();
    }

    // ---------------------------------------------------------------- durations

    @GetMapping("/durations")
    public List<DurationView> durations() {
        return state.load().durations();
    }

    @PostMapping("/durations")
    public Map<String, Long> createDuration(@RequestBody DurationRequest r) {
        return Map.of("id", refs.saveDuration(null, r).getId());
    }

    @PutMapping("/durations/{id}")
    public Map<String, Long> updateDuration(@PathVariable Long id, @RequestBody DurationRequest r) {
        return Map.of("id", refs.saveDuration(id, r).getId());
    }

    @PatchMapping("/durations/{id}/active")
    public ResponseEntity<Void> durationActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        refs.setDurationActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/durations/{id}")
    public ResponseEntity<Void> deleteDuration(@PathVariable Long id) {
        refs.deleteDuration(id);
        return noContent();
    }

    // ---------------------------------------------------------------- functions (ADMIN)

    @GetMapping("/functions")
    public List<FunctionView> functions() {
        return state.load().functions();
    }

    @PostMapping("/functions")
    public Map<String, Long> createFunction(@RequestBody FunctionRequest r) {
        return Map.of("id", refs.saveFunction(null, r).getId());
    }

    @PutMapping("/functions/{id}")
    public Map<String, Long> updateFunction(@PathVariable Long id, @RequestBody FunctionRequest r) {
        return Map.of("id", refs.saveFunction(id, r).getId());
    }

    @PatchMapping("/functions/{id}/active")
    public ResponseEntity<Void> functionActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        refs.setFunctionActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/functions/{id}")
    public ResponseEntity<Void> deleteFunction(@PathVariable Long id) {
        refs.deleteFunction(id);
        return noContent();
    }

    // ---------------------------------------------------------------- sports

    @GetMapping("/sports")
    public List<SportView> sports() {
        return state.load().sports();
    }

    @PostMapping("/sports")
    public Map<String, Long> createSport(@RequestBody SportRequest r) {
        return Map.of("id", sports.save(null, r).getId());
    }

    @PutMapping("/sports/{id}")
    public Map<String, Long> updateSport(@PathVariable Long id, @RequestBody SportRequest r) {
        return Map.of("id", sports.save(id, r).getId());
    }

    @PatchMapping("/sports/{id}/active")
    public ResponseEntity<Void> sportActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        sports.setActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/sports/{id}")
    public ResponseEntity<Void> deleteSport(@PathVariable Long id) {
        sports.delete(id);
        return noContent();
    }

    // ---------------------------------------------------------------- staff (ADMIN)

    public record StaffList(List<StaffView> rows, BigDecimal payroll, int activeCount) {
    }

    @GetMapping("/staff")
    public StaffList staff() {
        List<StaffView> rows = state.load().staff();
        List<StaffView> active = rows.stream().filter(StaffView::active).toList();
        return new StaffList(rows, com.gymmanager.gym.rules.Rules.payroll(active.stream().map(StaffView::salary).toList()), active.size());
    }

    @PostMapping("/staff")
    public Map<String, Long> createStaff(@RequestBody StaffRequest r) {
        return Map.of("id", staff.save(null, r).getId());
    }

    @PutMapping("/staff/{id}")
    public Map<String, Long> updateStaff(@PathVariable Long id, @RequestBody StaffRequest r) {
        return Map.of("id", staff.save(id, r).getId());
    }

    @PatchMapping("/staff/{id}/active")
    public ResponseEntity<Void> staffActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        staff.setActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/staff/{id}")
    public ResponseEntity<Void> deleteStaff(@PathVariable Long id) {
        staff.delete(id);
        return noContent();
    }

    /** Names of active staff, for the "Responsable" / "Coach(s)" pickers (no salary data). */
    @GetMapping("/staff-options")
    public List<StaffRef> staffOptions() {
        return state.load().staff().stream().map(s -> new StaffRef(s.id(), s.code(), s.name(), s.active())).toList();
    }

    // ---------------------------------------------------------------- activities

    @GetMapping("/activities")
    public List<ActivityView> activities() {
        return state.load().activities();
    }

    @PostMapping("/activities")
    public Map<String, Long> createActivity(@RequestBody ActivityRequest r) {
        return Map.of("id", activities.save(null, r).getId());
    }

    @PutMapping("/activities/{id}")
    public Map<String, Long> updateActivity(@PathVariable Long id, @RequestBody ActivityRequest r) {
        return Map.of("id", activities.save(id, r).getId());
    }

    @PatchMapping("/activities/{id}/active")
    public ResponseEntity<Void> activityActive(@PathVariable Long id, @RequestBody ActiveRequest r) {
        activities.setActive(id, on(r));
        return noContent();
    }

    @DeleteMapping("/activities/{id}")
    public ResponseEntity<Void> deleteActivity(@PathVariable Long id) {
        activities.delete(id);
        return noContent();
    }

    // ---------------------------------------------------------------- registrations (ADMIN + ACCUEIL)

    @GetMapping("/registrations")
    public List<RegistrationView> registrations() {
        return state.load().registrations();
    }

    @PostMapping("/registrations")
    public Map<String, Long> register(@RequestBody RegistrationRequest r) {
        return Map.of("id", activities.register(r).getId());
    }

    @DeleteMapping("/registrations/{id}")
    public ResponseEntity<Void> unregister(@PathVariable Long id) {
        activities.unregister(id);
        return noContent();
    }
}
