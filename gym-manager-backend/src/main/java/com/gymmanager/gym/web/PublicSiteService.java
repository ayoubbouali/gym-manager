package com.gymmanager.gym.web;

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
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Data of the public showcase site. Only what a visitor may see: active sports, packs and upcoming activities,
 * coaches shown as "First L.", never a member nor an amount paid. Built from the full club state, so the answer
 * is cached; it is rebuilt after each admin write ({@link SiteChangeInterceptor}) and pushed to open pages.
 */
@Slf4j
@Service
public class PublicSiteService {
    static final Duration TTL = Duration.ofMinutes(1);
    /** Coalesces the writes of one admin action (e.g. a form saving several rows) into one rebuild. */
    private static final long DEBOUNCE_MS = 400;
    /** The browser's EventSource reconnects by itself when the stream ends. */
    private static final long STREAM_TIMEOUT_MS = Duration.ofMinutes(30).toMillis();
    private static final int MAX_SUBSCRIBERS = 1000;

    private final ClubStateService state;
    private final SettingRepository settingRepo;
    private final StaffRepository staffRepo;

    private final Set<SseEmitter> subscribers = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean refreshPending = new AtomicBoolean();
    private final ScheduledExecutorService debounce = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "public-site-refresh");
        t.setDaemon(true);
        return t;
    });

    private volatile Site cached;
    private volatile long cachedAt;

    public PublicSiteService(ClubStateService state, SettingRepository settingRepo, StaffRepository staffRepo) {
        this.state = state;
        this.settingRepo = settingRepo;
        this.staffRepo = staffRepo;
    }

    public record Club(String name, String address, String phone, String dialCode, String city, String country, String currency,
                       boolean hasLogo, String logoVersion, String today) {
    }

    public record Slot(int day, LocalTime start, LocalTime end) {
    }

    public record Sport(Long id, String name, String color, BigDecimal monthlyPrice, int capacity, int fillPercent,
                        List<String> coaches, List<Slot> schedules) {
    }

    public record Pack(Long id, String name, Long sportId, String sport, String sportColor, int months, String duration,
                       BigDecimal monthlyPrice, BigDecimal discountPercent, BigDecimal total) {
    }

    public record Coach(Long id, String name, String initials, String role, List<String> sports, boolean hasPhoto,
                        String photoVersion) {
    }

    public record Event(Long id, String name, String description, BigDecimal price, LocalDateTime startsAt, String location,
                        Integer maxPlaces, Integer remainingPlaces, boolean full) {
    }

    /** {@code version} changes with the content: the page compares it with the one pushed to know it is stale. */
    public record Site(Club club, List<Sport> sports, List<Pack> packs, List<Coach> coaches, List<Event> events, String version) {
    }

    public Site current() {
        Site s = cached;
        if (s == null || System.currentTimeMillis() - cachedAt > TTL.toMillis()) s = refresh();
        return s;
    }

    /** Opens a stream that sends the current version at once, then each new one. */
    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        if (subscribers.size() >= MAX_SUBSCRIBERS) {
            emitter.complete();
            return emitter;
        }
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> subscribers.remove(emitter));
        emitter.onError(e -> subscribers.remove(emitter));
        subscribers.add(emitter);
        send(emitter, SseEmitter.event().name("site").data(current().version()));
        return emitter;
    }

    /** Something may have changed: rebuilds shortly, and notifies the open pages if the site differs. */
    public void changed() {
        if (refreshPending.compareAndSet(false, true)) {
            debounce.schedule(() -> {
                refreshPending.set(false);
                try {
                    refresh();
                } catch (RuntimeException e) {
                    log.warn("Public site refresh failed", e);
                }
            }, DEBOUNCE_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** Catches what no admin request changes (date, past events, nightly purge) while someone is watching. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    void tick() {
        if (!subscribers.isEmpty()) changed();
    }

    /** Proxies (Cloudflare) close a silent connection after about 100 s. */
    @Scheduled(fixedDelay = 25_000, initialDelay = 25_000)
    void heartbeat() {
        for (SseEmitter e : subscribers) send(e, SseEmitter.event().comment("ping"));
    }

    synchronized Site refresh() {
        Site fresh = build(state.load());
        Site old = cached;
        cached = fresh;
        cachedAt = System.currentTimeMillis();
        if (old != null && !old.version().equals(fresh.version())) {
            for (SseEmitter e : subscribers) send(e, SseEmitter.event().name("site").data(fresh.version()));
        }
        return fresh;
    }

    private void send(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            subscribers.remove(emitter);
            emitter.completeWithError(e);
        }
    }

    int subscriberCount() {
        return subscribers.size();
    }

    @PreDestroy
    void stop() {
        debounce.shutdownNow();
        subscribers.forEach(SseEmitter::complete);
    }

    String logoFile() {
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
                        sv.coachIds().stream().map(coachName).filter(Objects::nonNull).toList(),
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

        // The file name changes on each upload, so it tells the page a replaced photo must be fetched again.
        Map<Long, String> photos = new HashMap<>();
        for (Staff s : staffRepo.findAll()) if (s.getPhoto() != null) photos.put(s.getId(), s.getPhoto());
        List<Coach> coaches = st.staff().stream()
                .filter(sv -> sv.active() && sv.sportIds() != null
                        && sv.sportIds().stream().anyMatch(activeSportIds::contains))
                .sorted(Comparator.comparing(StaffView::firstName, String.CASE_INSENSITIVE_ORDER))
                .map(sv -> new Coach(sv.id(), shortName(sv.firstName(), sv.lastName()), initials(sv.firstName(), sv.lastName()),
                        sv.function() == null ? "Coach" : sv.function().label(),
                        sv.sports().stream().filter(r -> activeSportIds.contains(r.id())).map(r -> r.name()).toList(), sv.hasPhoto(),
                        version(photos.get(sv.id()))))
                .toList();

        List<Event> events = st.activities().stream()
                .filter(a -> a.active() && !a.past() && a.startsAt() != null)
                .sorted(Comparator.comparing(ActivityView::startsAt))
                .map(a -> new Event(a.id(), a.name(), a.description(), a.price(), a.startsAt(), a.location(),
                        a.maxPlaces(), a.remainingPlaces(), a.full()))
                .toList();

        String logo = logoFile();
        Club club = new Club(c.clubName(), c.clubAddress(), c.clubPhone(), c.dialCode(), c.city(), c.country(), c.currency(),
                logo != null, version(logo), st.today().toString());
        Site content = new Site(club, sports, packs, coaches, events, null);
        return new Site(club, sports, packs, coaches, events, Integer.toHexString(content.hashCode()));
    }

    /** A short token that changes with the stored file name, without exposing it. */
    private static String version(String fileName) {
        return fileName == null ? null : Integer.toHexString(fileName.hashCode());
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
