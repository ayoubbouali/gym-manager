package com.gymmanager.gym.web.dto;

import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.domain.PayMode;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.domain.Role;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

/** Request bodies. Validation is done in the services (French messages, field names). */
public final class Requests {
    private Requests() {
    }

    public record ActiveRequest(Boolean active) {
    }

    public record FunctionRequest(String label) {
    }

    public record DurationRequest(String label, Integer months) {
    }

    public record DiscountRequest(String name, BigDecimal percent) {
    }

    public record SlotRequest(Integer dayOfWeek, LocalTime start, LocalTime end) {
    }

    public record SportRequest(String name, String color, Integer capacity, BigDecimal monthlyPrice,
                               List<Long> coachIds, List<SlotRequest> schedules) {
    }

    public record StaffRequest(String lastName, String firstName, String phone, Long functionId, List<Long> sportIds,
                               PayMode payMode, BigDecimal fixedSalary) {
    }

    public record PackRequest(String name, Long sportId, Long durationId, BigDecimal monthlyPrice, Long discountId) {
    }

    public record PackPreviewRequest(BigDecimal monthlyPrice, Long durationId, Long discountId) {
    }

    public record GenerateItem(Long durationId, String name, Long discountId, BigDecimal monthlyPrice) {
    }

    public record GeneratePacksRequest(Long sportId, List<GenerateItem> items) {
    }

    public record MemberRequest(String lastName, String firstName, String phone, LocalDate birthDate, LocalDate registrationDate,
                                List<Long> sportIds, Long packId, Long discountId, Insurance insurance, String notes) {
    }

    public record MemberPreviewRequest(Long packId, Long discountId, LocalDate registrationDate) {
    }

    public record ActivityRequest(String name, String description, BigDecimal price, LocalDateTime startsAt, String location,
                                  Integer maxPlaces, Long managerId) {
    }

    public record RegistrationRequest(Long memberId, Long activityId) {
    }

    /** Payment of a member; without subscriptionId it goes to the oldest period with a balance. */
    public record PaymentRequest(Long memberId, Long subscriptionId, BigDecimal amount, PaymentMethod method, LocalDate paidOn, String note) {
    }

    public record PaymentUpdateRequest(BigDecimal amount, PaymentMethod method, LocalDate paidOn, String note) {
    }

    public record CancelRequest(String reason) {
    }

    /** Renewal: a new subscription period, optionally with a first payment. */
    public record RenewRequest(Long packId, Long discountId, LocalDate startDate,
                               BigDecimal paymentAmount, PaymentMethod paymentMethod, LocalDate paidOn, String note) {
    }

    public record SalaryPaymentRequest(Long staffId, String period, BigDecimal amount, PaymentMethod method, LocalDate paidOn, String note) {
    }

    public record LoginRequest(String username, String password) {
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }

    /** email: optional, blank = none. */
    public record UserCreateRequest(String username, String password, Role role, String email) {
    }

    /** Null fields are left unchanged; a blank email removes it. */
    public record UserUpdateRequest(Role role, Boolean active, String email) {
    }

    public record AccountUpdateRequest(String email) {
    }

    public record ForgotPasswordRequest(String username) {
    }

    public record ResetPasswordRequest(String password) {
    }

    public record SettingsUpdateRequest(Map<String, String> values) {
    }
}
