package com.gymmanager.gym.web;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.service.ClubState;
import com.gymmanager.gym.service.ClubStateService;
import com.gymmanager.gym.service.Views.ActivityView;
import com.gymmanager.gym.service.Views.PackView;
import com.gymmanager.gym.service.Views.SportView;
import com.gymmanager.gym.service.Views.StaffView;
import com.gymmanager.gym.settings.ClubConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Data of the public showcase site. Only what a visitor may see: active sports, packs and upcoming activities,
 * coaches shown as "First L.", never a member nor an amount paid. Built from the full club state, so the answer
 * is kept a minute to keep anonymous traffic from rebuilding it on every request.
 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicSiteController {
    private static final Duration TTL = Duration.ofMinutes(1);

    private final ClubStateService state;
    private final SettingRepository settingRepo;
    private final FileStorage files;
    private final StaffRepository staffRepo;

    private volatile Site cached;
    private volatile long cachedAt;

    public record Club(String name, String address, String phone, String dialCode, String city, String country, String currency,
                       boolean hasLogo, String today) {
    }

    public record Slot(int day, LocalTime start, LocalTime end) {
    }

    public record Sport(Long id, String name, String color, BigDecimal monthlyPrice, int capacity, int fillPercent,
                        List<String> coaches, List<Slot> schedules) {
    }

    public record Pack(Long id, String name, Long sportId, String sport, String sportColor, int months, String duration,
                       BigDecimal monthlyPrice, BigDecimal discountPercent, BigDecimal total) {
    }

    public record Coach(Long id, String name, String initials, String role, List<String> sports, boolean hasPhoto) {
    }

    public record Event(Long id, String name, String description, BigDecimal price, LocalDateTime startsAt, String location,
                        Integer maxPlaces, Integer remainingPlaces, boolean full) {
    }

    public record Site(Club club, List<Sport> sports, List<Pack> packs, List<Coach> coaches, List<Event> events) {
    }

    @GetMapping("/site")
    public ResponseEntity<Site> site() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(TTL).cachePublic()).body(current());
    }

    /** Photo of a coach shown on the site; any other staff member's photo stays private (404). */
    @GetMapping("/coaches/{id}/photo")
    public ResponseEntity<Resource> coachPhoto(@PathVariable Long id) {
        boolean shown = current().coaches().stream().anyMatch(c -> c.id().equals(id));
        String name = shown ? staffRepo.findById(id).map(Staff::getPhoto).orElse(null) : null;
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.maxAge(TTL).cachePublic()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    private Site current() {
        Site s = cached;
        if (s == null || System.currentTimeMillis() - cachedAt > TTL.toMillis()) {
            s = build(state.load());
            cached = s;
            cachedAt = System.currentTimeMillis();
        }
        return s;
    }

    /** The club logo, public on the showcase site (the admin route requires a session). */
    @GetMapping("/logo")
    public ResponseEntity<Resource> logo() {
        String name = logoFile();
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    private String logoFile() {
        return settingRepo.findById(ClubController.LOGO_KEY).map(AppSetting::getValue).filter(v -> !v.isBlank()).orElse(null);
    }

    Site build(ClubState st) {
        ClubConfig c = st.cfg();
        Map<Long, StaffView> staffById = ClubState.index(st.staff(), StaffView::id);
        Function<Long, String> coachName = id -> {
            StaffView sv = staffById.get(id);
            return sv == null || !sv.active() ? null : shortName(sv.firstName(), sv.lastName());
        };

        List<SportView> activeSports = st.sports().stream().filter(SportView::active).toList();
        Set<Long> activeSportIds = activeSports.stream().map(SportView::id).collect(Collectors.toSet());

        List<Sport> sports = activeSports.stream()
                .sorted(Comparator.comparing(SportView::name, String.CASE_INSENSITIVE_ORDER))
                .map(sv -> new Sport(sv.id(), sv.name(), sv.color(), sv.monthlyPrice(), sv.capacity(), sv.fillPercent(),
                        sv.coachIds().stream().map(coachName).filter(n -> n != null).toList(),
                        sv.schedules().stream().map(x -> new Slot(x.dayOfWeek(), x.start(), x.end()))
                                .sorted(Comparator.comparingInt(Slot::day).thenComparing(Slot::start)).toList()))
                .toList();

        List<Pack> packs = st.packs().stream()
                .filter(p -> p.active() && p.sport() != null && activeSportIds.contains(p.sportId()) && p.duration() != null)
                .sorted(Comparator.comparing((PackView p) -> p.sport().name(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparingInt(p -> p.duration().months()))
                .map(p -> new Pack(p.id(), p.name(), p.sportId(), p.sport().name(), p.sport().color(), p.duration().months(),
                        p.duration().label(), p.monthlyPrice(), p.discount() == null ? BigDecimal.ZERO : p.discount().percent(), p.total()))
                .toList();

        List<Coach> coaches = st.staff().stream()
                .filter(sv -> sv.active() && sv.sportIds() != null
                        && sv.sportIds().stream().anyMatch(activeSportIds::contains))
                .sorted(Comparator.comparing(StaffView::firstName, String.CASE_INSENSITIVE_ORDER))
                .map(sv -> new Coach(sv.id(), shortName(sv.firstName(), sv.lastName()), initials(sv.firstName(), sv.lastName()),
                        sv.function() == null ? "Coach" : sv.function().label(),
                        sv.sports().stream().filter(r -> activeSportIds.contains(r.id())).map(r -> r.name()).toList(), sv.hasPhoto()))
                .toList();

        List<Event> events = st.activities().stream()
                .filter(a -> a.active() && !a.past() && a.startsAt() != null)
                .sorted(Comparator.comparing(ActivityView::startsAt))
                .map(a -> new Event(a.id(), a.name(), a.description(), a.price(), a.startsAt(), a.location(),
                        a.maxPlaces(), a.remainingPlaces(), a.full()))
                .toList();

        Club club = new Club(c.clubName(), c.clubAddress(), c.clubPhone(), c.dialCode(), c.city(), c.country(), c.currency(),
                logoFile() != null, st.today().toString());
        return new Site(club, sports, packs, coaches, events);
    }

    static String shortName(String first, String last) {
        String f = capitalize(first == null ? "" : first.strip());
        String l = last == null ? "" : last.strip();
        if (l.isEmpty()) return f;
        return (f + " " + Character.toUpperCase(l.charAt(0)) + ".").strip();
    }

    private static String capitalize(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    static String initials(String first, String last) {
        String f = first == null || first.isBlank() ? "" : first.strip().substring(0, 1);
        String l = last == null || last.isBlank() ? "" : last.strip().substring(0, 1);
        return (f + l).toUpperCase();
    }
}
