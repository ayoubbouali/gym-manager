package com.gymmanager.gym.service;

import com.gymmanager.gym.service.Views.*;
import com.gymmanager.gym.settings.ClubConfig;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Snapshot of the club with every computed value, built per request. */
public record ClubState(ClubConfig cfg, LocalDate today, LocalDateTime now,
                        List<FunctionView> functions, List<DurationView> durations, List<DiscountView> discounts,
                        List<PackView> packs, List<MemberView> members, List<SportView> sports, List<StaffView> staff,
                        List<ActivityView> activities, List<RegistrationView> registrations,
                        List<SubscriptionView> subscriptions, List<PaymentView> payments,
                        Map<Long, List<Long>> coachesBySport, Map<Long, List<com.gymmanager.gym.domain.Subscription>> subsByMember) {

    public Optional<MemberView> member(Long id) {
        return members.stream().filter(m -> m.id().equals(id)).findFirst();
    }

    public Optional<StaffView> staffMember(Long id) {
        return staff.stream().filter(s -> s.id().equals(id)).findFirst();
    }

    public Optional<ActivityView> activity(Long id) {
        return activities.stream().filter(a -> a.id().equals(id)).findFirst();
    }

    public static <T> Map<Long, T> index(List<T> list, Function<T, Long> id) {
        return list.stream().collect(Collectors.toMap(id, Function.identity()));
    }
}
