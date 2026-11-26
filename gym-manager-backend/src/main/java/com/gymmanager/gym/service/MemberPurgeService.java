package com.gymmanager.gym.service;

import com.gymmanager.gym.domain.Member;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.Views.MemberView;
import com.gymmanager.gym.settings.PurgeConfig;
import com.gymmanager.gym.settings.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Nightly automatic deletion of the members selected by RG-PURGE (Paramètres › Suppression auto). */
@Slf4j
@Service
@RequiredArgsConstructor
public class MemberPurgeService {
    private final ClubStateService state;
    private final MemberRepository members;
    private final MemberService memberService;
    private final SettingsService settings;

    public record Candidate(Long id, String code, String name, Rules.PurgeReason reason, LocalDate since) {
    }

    public record Preview(boolean enabled, int months, List<Candidate> members) {
    }

    /** Deletes the purgeable members in one transaction, unless disabled in the settings, and returns their codes. */
    @Scheduled(cron = "${app.member-purge.cron}")
    @Transactional
    public List<String> purge() {
        PurgeConfig cfg = settings.purge();
        if (!cfg.enabled()) return List.of();
        List<String> deleted = new ArrayList<>();
        for (Candidate c : candidates(cfg, true)) {
            memberService.purge(members.findById(c.id()).orElseThrow());
            deleted.add(c.code());
        }
        if (!deleted.isEmpty()) log.info("Automatic purge: {} member(s) deleted {}", deleted.size(), deleted);
        return deleted;
    }

    /** Members the next run would delete with the saved settings (listed even when the purge is disabled). */
    @Transactional(readOnly = true)
    public Preview preview() {
        PurgeConfig cfg = settings.purge();
        return new Preview(cfg.enabled(), cfg.rule().months(), candidates(cfg, false));
    }

    /** @param startMissing store today as the start of a state lacking its date (data predating RG-PURGE, restored backup) */
    private List<Candidate> candidates(PurgeConfig cfg, boolean startMissing) {
        ClubState st = state.load();
        LocalDate today = st.today();
        Map<Long, Member> byId = members.findAll().stream().collect(Collectors.toMap(Member::getId, Function.identity()));
        List<Candidate> out = new ArrayList<>();
        for (MemberView v : st.members()) {
            Member m = byId.get(v.id());
            boolean noSubscription = v.periodCount() == 0;
            if (startMissing && !m.isActive() && m.getDeactivatedOn() == null) m.setDeactivatedOn(today);
            if (startMissing && noSubscription && m.getNoSubscriptionSince() == null) m.setNoSubscriptionSince(today);
            LocalDate deactivatedOn = m.isActive() ? null : orToday(m.getDeactivatedOn(), today);
            LocalDate expiredOn = v.state() == Rules.MemberState.EXPIRED ? v.endDate() : null;
            LocalDate noSubscriptionSince = noSubscription ? orToday(m.getNoSubscriptionSince(), today) : null;
            Rules.PurgeReason reason = Rules.purgeReason(v.balance(), deactivatedOn, expiredOn, noSubscriptionSince, cfg.rule(), today);
            if (reason == null) continue;
            LocalDate since = switch (reason) {
                case INACTIVE -> deactivatedOn;
                case EXPIRED -> expiredOn;
                case NO_SUBSCRIPTION -> noSubscriptionSince;
            };
            out.add(new Candidate(v.id(), v.code(), v.fullName(), reason, since));
        }
        return out;
    }

    private static LocalDate orToday(LocalDate d, LocalDate today) {
        return d == null ? today : d;
    }
}
