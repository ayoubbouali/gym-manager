package com.gymmanager.gym.service;

import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.domain.PayMode;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.rules.Rules;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/** Read models returned by the API. Computed fields come from {@link Rules}. */
public final class Views {
    private Views() {
    }

    public record SportRef(Long id, String code, String name, String color, boolean active) {
    }

    public record StaffRef(Long id, String code, String name, boolean active) {
    }

    public record FunctionView(Long id, String label, boolean active) {
    }

    public record DurationView(Long id, String label, int months, boolean active) {
    }

    public record DiscountView(Long id, String code, String name, BigDecimal percent, boolean active, boolean system) {
    }

    public record PackRef(Long id, String code, String name, boolean active, int months, BigDecimal total) {
    }

    public record PackView(Long id, String code, String name, boolean active,
                           Long sportId, SportRef sport, Long durationId, DurationView duration,
                           BigDecimal monthlyPrice, Long discountId, DiscountView discount, BigDecimal total) {
    }

    /**
     * A member with their current (latest) subscription period. {@code price} is the price of that period;
     * {@code paid}, {@code balance} and {@code paymentStatus} cover all periods (arrears included).
     */
    public record MemberView(Long id, String code, String lastName, String firstName, String phone,
                             LocalDate birthDate, LocalDate registrationDate,
                             List<Long> sportIds, List<SportRef> sports,
                             Long subscriptionId, LocalDate periodStart, int periodCount,
                             Long packId, PackRef pack, Long discountId, DiscountView discount,
                             Insurance insurance, boolean hasPhoto, String notes, boolean active, List<Long> activityIds,
                             BigDecimal price, LocalDate endDate, long remainingDays,
                             BigDecimal paid, BigDecimal balance,
                             Rules.PaymentStatus paymentStatus, boolean activeMember, Rules.Situation situation) {
        public String fullName() {
            return firstName + " " + lastName;
        }
    }

    public record PaymentView(Long id, String receiptNumber, Long memberId, String memberCode, String memberName,
                              Long subscriptionId, String packName, LocalDate periodStart, LocalDate periodEnd,
                              BigDecimal amount, PaymentMethod method, String methodLabel, LocalDate paidOn, String note,
                              LocalDateTime createdAt, String createdBy, LocalDateTime updatedAt, String updatedBy,
                              boolean cancelled, LocalDateTime cancelledAt, String cancelledBy, String cancelReason) {
    }

    public record SubscriptionView(Long id, Long memberId, Long packId, String packName, Long discountId, String discountName,
                                   LocalDate startDate, LocalDate endDate, int months, BigDecimal amount,
                                   BigDecimal paid, BigDecimal balance, Rules.PaymentStatus paymentStatus, boolean current,
                                   LocalDateTime createdAt, String createdBy, List<PaymentView> payments) {
    }

    public record SalaryPaymentView(Long id, String slipNumber, Long staffId, String staffCode, String staffName, String period,
                                    BigDecimal amount, PaymentMethod method, String methodLabel, LocalDate paidOn, String note,
                                    LocalDateTime createdAt, String createdBy,
                                    boolean cancelled, LocalDateTime cancelledAt, String cancelledBy, String cancelReason) {
    }

    public record SlotView(int dayOfWeek, LocalTime start, LocalTime end) {
    }

    public record SportView(Long id, String code, String name, String color, int capacity, BigDecimal monthlyPrice, boolean active,
                            List<Long> coachIds, List<StaffRef> coaches, List<SlotView> schedules, String scheduleSummary,
                            int memberCount, int fillPercent) {
    }

    public record SalaryLineView(Long memberId, String code, String name, String pack, LocalDate registrationDate,
                                 BigDecimal price, BigDecimal factor, List<String> sports) {
    }

    public record SalaryDetail(LocalDate from, LocalDate to, String shareRaw, BigDecimal sharePercent, BigDecimal base,
                               Rules.MultiCoach multiCoach, List<SalaryLineView> lines) {
    }

    public record StaffView(Long id, String code, String lastName, String firstName, String name, String phone,
                            Long functionId, FunctionView function, List<Long> sportIds, List<SportRef> sports,
                            PayMode payMode, BigDecimal fixedSalary, boolean active, BigDecimal salary, SalaryDetail salaryDetail) {
    }

    public record ActivityView(Long id, String code, String name, String description, BigDecimal price,
                               LocalDateTime startsAt, String location, Integer maxPlaces, Long managerId, StaffRef manager,
                               boolean active, boolean past, int registrationCount, Integer remainingPlaces, boolean full,
                               BigDecimal revenue) {
    }

    public record RegistrationView(Long id, Long memberId, Long activityId, LocalDateTime createdAt,
                                   String memberCode, String memberName, String activityCode, String activityName,
                                   LocalDateTime activityStartsAt, String activityLocation) {
    }
}
