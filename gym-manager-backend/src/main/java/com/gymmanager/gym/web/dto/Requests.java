package com.gymmanager.gym.web.dto;

import com.gymmanager.gym.domain.BusinessCategory;
import com.gymmanager.gym.domain.ChargeCategory;
import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.domain.PayMode;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.domain.Permission;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Request bodies. Validation is done in the services (French messages, field names). */
public final class Requests {
    private Requests() {
    }

    public record ActiveRequest(Boolean active) {
    }

    public record NotesRequest(String notes) {
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

    /** {@code phoneCountry}: ISO country chosen in the phone field, null = the club's country. */
    /** {@code internal}: one of the club's owners, without pay mode (never in the payroll). */
    public record StaffRequest(String lastName, String firstName, String phone, Long functionId, List<Long> sportIds,
                               PayMode payMode, BigDecimal fixedSalary, String phoneCountry, Boolean internal) {
    }

    public record PackRequest(String name, Long sportId, Long durationId, BigDecimal monthlyPrice, Long discountId) {
    }

    public record PackPreviewRequest(BigDecimal monthlyPrice, Long durationId, Long discountId) {
    }

    public record GenerateItem(Long durationId, String name, Long discountId, BigDecimal monthlyPrice) {
    }

    public record GeneratePacksRequest(Long sportId, List<GenerateItem> items) {
    }

    /**
     * {@code phoneCountry}: ISO country chosen in the phone field, null = the club's country.
     * {@code customAmount}: price typed by hand for the period, null = pack price with {@code discountId}.
     */
    /** {@code paymentAmount}, {@code paymentMethod}, {@code paidOn}: optional first payment, at creation only (may be partial). */
    public record MemberRequest(String lastName, String firstName, String phone, LocalDate birthDate, LocalDate registrationDate,
                                List<Long> sportIds, Long packId, Long discountId, Insurance insurance, String notes,
                                String phoneCountry, BigDecimal customAmount,
                                BigDecimal paymentAmount, PaymentMethod paymentMethod, LocalDate paidOn) {
    }

    public record MemberPreviewRequest(Long packId, Long discountId, LocalDate registrationDate, BigDecimal customAmount) {
    }

    /** {@code paid}: a paying activity has a price; a free one (false or null) costs 0. */
    public record ActivityRequest(String name, String description, BigDecimal price, LocalDateTime startsAt, String location,
                                  Integer maxPlaces, Long managerId, Boolean paid) {
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

    /** The amount is not sent: the month is paid in one go, salary + bonus, computed by the server. */
    public record SalaryPaymentRequest(Long staffId, String period, PaymentMethod method, LocalDate paidOn, String note) {
    }

    /**
     * Creates or edits a charge; {@code permanent} is ignored on edit. One-off: {@code period}, {@code amount} (null while
     * unknown) and, at creation, {@code payNow}. Permanent with an {@code amount}: settled every month if {@code autoPay},
     * else the current month only, at creation. Payments use {@code method} / {@code paidOn}.
     */
    public record ChargeRequest(String label, ChargeCategory category, Boolean permanent, String period, BigDecimal amount,
                                String note, Boolean payNow, Boolean autoPay, PaymentMethod method, LocalDate paidOn) {
    }

    /** Pays a charge for a month (the month of a one-off charge is its own). */
    public record ChargePaymentRequest(Long chargeId, String period, BigDecimal amount, PaymentMethod method, LocalDate paidOn, String note) {
    }

    /**
     * Creates or edits a business item, like {@link ChargeRequest}; a permanent item keeps its {@code amount} as the expected
     * monthly amount. {@code memberId}: member the item is sold to, null when none.
     */
    public record BusinessRequest(String label, BusinessCategory category, Boolean permanent, String period, BigDecimal amount,
                                  String note, Boolean payNow, Boolean autoPay, PaymentMethod method, LocalDate paidOn, Long memberId,
                                  List<Long> memberIds) {
    }

    /** Collects a business item for a month (the month of a one-off item is its own). */
    public record BusinessPaymentRequest(Long businessId, String period, BigDecimal amount, PaymentMethod method, LocalDate paidOn, String note) {
    }

    /** {@code amount} null removes the bonus of the month. */
    public record SalaryBonusRequest(Long staffId, String period, BigDecimal amount, String note) {
    }

    public record LoginRequest(String username, String password) {
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }

    /**
     * email, phone: optional, blank = none. {@code roleId} wins over {@code role}, a role name.
     * {@code phoneCountry}: ISO country chosen in the phone field, null = the club's country.
     */
    public record UserCreateRequest(String username, String password, String role, String email, Long roleId,
                                    String phone, String phoneCountry) {
    }

    /** Null fields are left unchanged; a blank email or phone removes it. {@code roleId} wins over {@code role}. */
    public record UserUpdateRequest(String role, Boolean active, String email, Long roleId, String phone, String phoneCountry) {
    }

    /** Null fields are left unchanged; a blank email or phone removes it. */
    public record AccountUpdateRequest(String email, String phone, String phoneCountry) {
    }

    public record UserRoleRequest(String name, Set<Permission> permissions) {
    }

    public record ForgotPasswordRequest(String username) {
    }

    public record ResetPasswordRequest(String password) {
    }

    /** {@code phoneCountries}: per phone setting (club.phone), the ISO country chosen in the field; absent = the club's country. */
    public record SettingsUpdateRequest(Map<String, String> values, Map<String, String> phoneCountries) {
    }
}
