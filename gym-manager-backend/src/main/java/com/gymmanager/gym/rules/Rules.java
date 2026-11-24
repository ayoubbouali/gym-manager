package com.gymmanager.gym.rules;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Business rules (RG-*). Pure functions: no I/O, no clock, no Spring.
 * "Today" and every setting are passed as arguments, so each rule is unit-testable.
 */
public final class Rules {

    private Rules() {
    }

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final MathContext MC = MathContext.DECIMAL64;

    // ------------------------------------------------------------------ enums

    /** Payment status of a subscription period: fully paid, partly paid, nothing paid. */
    public enum PaymentStatus { PAYE, PARTIEL, IMPAYE }

    public enum PaymentMethod { ESPECES, CARTE, VIREMENT }

    /** NONE: the member has no subscription period at all. */
    public enum Situation { EXPIRED, SOON, FOLLOW, OK, NONE }

    /** Member state shown to the admin: remaining days of the paid period combined with the payment status. */
    public enum MemberState { EXPIRED, UNPAID, SOON, UP_TO_DATE, NONE }

    public enum MultiCoach { FULL, SPLIT }

    /** P(arrondi): 2 decimals or whole unit. */
    public enum Rounding {
        TWO_DECIMALS(2), UNIT(0);

        private final int scale;

        Rounding(int scale) {
            this.scale = scale;
        }

        public BigDecimal apply(BigDecimal v) {
            return v.setScale(scale, RoundingMode.HALF_UP);
        }

        public static Rounding fromSetting(String v) {
            return "0".equals(v) ? UNIT : TWO_DECIMALS;
        }
    }

    // ------------------------------------------------------------------ money

    private static BigDecimal clampPercent(BigDecimal p) {
        if (p == null) return BigDecimal.ZERO;
        return p.max(BigDecimal.ZERO).min(HUNDRED);
    }

    /** Factor (1 − p/100). */
    private static BigDecimal keep(BigDecimal percent) {
        return HUNDRED.subtract(clampPercent(percent)).divide(HUNDRED, MC);
    }

    /** RG-PACK: price/month × months × (1 − pack discount). */
    public static BigDecimal packTotal(BigDecimal monthlyPrice, int months, BigDecimal packDiscountPercent, Rounding rounding) {
        return rounding.apply(monthlyPrice.multiply(BigDecimal.valueOf(months)).multiply(keep(packDiscountPercent), MC));
    }

    /**
     * RG-PRIX. Cumulative: pack total × (1 − member discount).
     * Otherwise: price/month × months × (1 − max(pack discount, member discount)).
     */
    public static BigDecimal memberPrice(BigDecimal monthlyPrice, int months, BigDecimal packDiscountPercent,
                                         BigDecimal memberDiscountPercent, boolean cumulative, Rounding rounding) {
        BigDecimal base = monthlyPrice.multiply(BigDecimal.valueOf(months));
        BigDecimal raw = cumulative
                ? base.multiply(keep(packDiscountPercent), MC).multiply(keep(memberDiscountPercent), MC)
                : base.multiply(keep(clampPercent(packDiscountPercent).max(clampPercent(memberDiscountPercent))), MC);
        return rounding.apply(raw);
    }

    /** Discount (%, 2 decimals) that turns {@code reference} into {@code amount}: 150 → 100 gives 33.33. */
    public static BigDecimal discountPercent(BigDecimal reference, BigDecimal amount) {
        if (reference == null || reference.signum() <= 0) return BigDecimal.ZERO;
        return clampPercent(HUNDRED.subtract(amount.multiply(HUNDRED).divide(reference, MC)))
                .setScale(2, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    // ------------------------------------------------------------------ subscription

    /** RG-FIN: calendar month addition (31/01 + 1 month = 28/02 or 29/02). */
    public static LocalDate subscriptionEnd(LocalDate registrationDate, int months) {
        return registrationDate.plusMonths(months);
    }

    public record PeriodSpan(LocalDate start, int months, BigDecimal amount, BigDecimal paid) {
        public LocalDate end() {
            return subscriptionEnd(start, months);
        }
    }

    /** RG-JOURS: only a period paid at least in part gives days; a free period counts as paid. */
    public static boolean countsForDays(BigDecimal amount, BigDecimal paid) {
        return amount.signum() == 0 || (paid != null && paid.signum() > 0);
    }

    /** RG-JOURS: days of a period from today (included) to its end; past days and unpaid periods give nothing. */
    public static long countedDays(PeriodSpan p, LocalDate today) {
        if (!countsForDays(p.amount(), p.paid())) return 0;
        LocalDate from = p.start().isAfter(today) ? p.start() : today;
        return Math.max(0, ChronoUnit.DAYS.between(from, p.end()));
    }

    /**
     * @param endDate       end of the latest counted period; without any, the first start (nothing is covered)
     * @param remainingDays Σ counted days; when that is 0, min(0, endDate − today): expired since endDate
     */
    public record Coverage(LocalDate endDate, long remainingDays) {
    }

    /** RG-JOURS over all the periods of a member (non-empty list). */
    public static Coverage coverage(List<PeriodSpan> periods, LocalDate today) {
        long sum = periods.stream().mapToLong(p -> countedDays(p, today)).sum();
        LocalDate lastEnd = periods.stream().filter(p -> countsForDays(p.amount(), p.paid())).map(PeriodSpan::end)
                .max(Comparator.naturalOrder())
                .orElseGet(() -> periods.stream().map(PeriodSpan::start).min(Comparator.naturalOrder()).orElseThrow());
        return new Coverage(lastEnd, sum > 0 ? sum : Math.min(0, remainingDays(lastEnd, today)));
    }

    /** RG-JOURS: end − today in whole days, may be negative. */
    public static long remainingDays(LocalDate endDate, LocalDate today) {
        return ChronoUnit.DAYS.between(today, endDate);
    }

    /**
     * RG-STATUT (with payment history): PAYE when the amount paid covers the amount due,
     * PARTIEL when something was paid, IMPAYE when nothing was paid. A free period (0) is PAYE.
     */
    public static PaymentStatus paymentStatus(BigDecimal amountDue, BigDecimal paid) {
        BigDecimal p = paid == null ? BigDecimal.ZERO : paid;
        if (p.compareTo(amountDue) >= 0) return PaymentStatus.PAYE;
        return p.signum() > 0 ? PaymentStatus.PARTIEL : PaymentStatus.IMPAYE;
    }

    /** Remaining amount to pay (never negative). */
    public static BigDecimal balance(BigDecimal amountDue, BigDecimal paid) {
        return amountDue.subtract(paid == null ? BigDecimal.ZERO : paid).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * RG-RENOUV: a renewal starts at the end of the current period when it is still running
     * (continuity), otherwise today.
     */
    public static LocalDate renewalStart(LocalDate currentEnd, LocalDate today) {
        return currentEnd.isBefore(today) ? today : currentEnd;
    }

    /** Receipt / pay slip number: PREFIX-YYYY-NNNN (numbering restarts every year). */
    public static String documentNumber(String prefix, int year, long n) {
        return prefix + "-" + year + "-" + String.format("%04d", n);
    }

    /** RG-ACTIF */
    public static boolean isMemberActive(boolean enabled, long remainingDays) {
        return enabled && remainingDays >= 0;
    }

    /** RG-SITUATION */
    public static Situation situation(long remainingDays, int soonThreshold, int followThreshold) {
        if (remainingDays < 0) return Situation.EXPIRED;
        if (remainingDays <= soonThreshold) return Situation.SOON;
        if (remainingDays <= followThreshold) return Situation.FOLLOW;
        return Situation.OK;
    }

    /**
     * RG-ETAT: first matching case wins. "Soon" is strictly below the threshold (a 7-day threshold means 0 to 6 days),
     * unlike {@link #situation}, which keeps driving the alerts.
     */
    public static MemberState memberState(long remainingDays, PaymentStatus paymentStatus, int soonThreshold) {
        if (remainingDays < 0) return MemberState.EXPIRED;
        if (paymentStatus == PaymentStatus.IMPAYE) return MemberState.UNPAID;
        if (remainingDays < soonThreshold) return MemberState.SOON;
        return MemberState.UP_TO_DATE;
    }

    public record MemberComputed(BigDecimal price, LocalDate endDate, long remainingDays, BigDecimal paid, BigDecimal balance,
                                 PaymentStatus paymentStatus, boolean active, Situation situation,
                                 MemberState state) {
    }

    public record PricingSettings(boolean cumulative, Rounding rounding, int soonThreshold, int followThreshold) {
    }

    /**
     * All computed values of a member.
     * @param coverage    RG-JOURS result (see {@link #coverage})
     * @param periodPrice frozen price of the latest period (RG-PRIX when it was created)
     * @param totalDue    Σ prices of all the member's periods (arrears included)
     * @param totalPaid   Σ non-cancelled payments of the member
     */
    public static MemberComputed computeMember(Coverage coverage, BigDecimal periodPrice, BigDecimal totalDue,
                                               BigDecimal totalPaid, boolean enabled, PricingSettings s) {
        LocalDate end = coverage.endDate();
        long remaining = coverage.remainingDays();
        BigDecimal p = (totalPaid == null ? BigDecimal.ZERO : totalPaid).setScale(2, RoundingMode.HALF_UP);
        PaymentStatus status = paymentStatus(totalDue, p);
        return new MemberComputed(periodPrice, end, remaining, p, balance(totalDue, p), status,
                isMemberActive(enabled, remaining), situation(remaining, s.soonThreshold(), s.followThreshold()),
                memberState(remaining, status, s.soonThreshold()));
    }

    // ------------------------------------------------------------------ messages

    public static final List<String> MESSAGE_VARIABLES = List.of("prenom", "nom", "jours", "date_fin", "club", "pack");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\w+)}");

    /** Replaces {variable} placeholders; unknown placeholders are kept as-is. */
    public static String renderTemplate(String template, Map<String, ?> vars) {
        if (template == null) return "";
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            Object v = vars.get(m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement(v == null ? m.group(0) : String.valueOf(v)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * https://wa.me/{international number}?text={encoded message}. A number stored in E.164 (+33…, foreign country)
     * already is international. The trunk prefix of a stored national number is not always a single 0 (8 for 7, 06 for
     * 36): libphonenumber strips it; "dial code + number without the leading 0" is the fallback when it cannot be parsed.
     */
    public static String whatsappLink(String dialCode, String phone, String message) {
        String national = phone == null ? "" : phone.replaceAll("\\D", "");
        String code = dialCode == null ? "" : dialCode.replaceAll("\\D", "");
        String text = URLEncoder.encode(message == null ? "" : message, StandardCharsets.UTF_8).replace("+", "%20");
        String number = phone != null && phone.strip().startsWith("+") ? national : internationalDigits(code, national);
        return "https://wa.me/" + number + "?text=" + text;
    }

    private static String internationalDigits(String code, String national) {
        String fallback = code + national.replaceFirst("^0", "");
        if (code.isEmpty() || code.length() > 4 || national.isEmpty()) return fallback;
        PhoneNumberUtil util = PhoneNumberUtil.getInstance();
        try {
            Phonenumber.PhoneNumber n = util.parse(national, util.getRegionCodeForCountryCode(Integer.parseInt(code)));
            if (n.getCountryCode() != Integer.parseInt(code)) return fallback;
            return util.format(n, PhoneNumberUtil.PhoneNumberFormat.E164).substring(1);
        } catch (NumberParseException e) {
            return fallback;
        }
    }

    // ------------------------------------------------------------------ salary

    /** Commission share as an exact fraction (1/3 stays exact). */
    public record Share(BigDecimal numerator, BigDecimal denominator) {
        public BigDecimal of(BigDecimal amount) {
            return amount.multiply(numerator).divide(denominator, MC);
        }

        public BigDecimal asPercent() {
            return numerator.multiply(HUNDRED).divide(denominator, 2, RoundingMode.HALF_UP);
        }
    }

    private static final Pattern FRACTION = Pattern.compile("^(\\d+(?:\\.\\d+)?)\\s*/\\s*(\\d+(?:\\.\\d+)?)$");
    private static final Pattern NUMBER = Pattern.compile("^\\d+(?:\\.\\d+)?$");

    /**
     * Parses "1/3", "33,33", "40 %", "40" (percent) or "0.4" (≤ 1 = ratio).
     * Returns null if invalid or outside [0, 1].
     */
    public static Share parseShare(String value) {
        if (value == null) return null;
        String s = value.trim().replace(',', '.').replace("%", "").trim();
        Share share;
        Matcher f = FRACTION.matcher(s);
        if (f.matches()) {
            BigDecimal den = new BigDecimal(f.group(2));
            if (den.signum() == 0) return null;
            share = new Share(new BigDecimal(f.group(1)), den);
        } else if (NUMBER.matcher(s).matches()) {
            BigDecimal n = new BigDecimal(s);
            share = n.compareTo(BigDecimal.ONE) > 0 ? new Share(n, HUNDRED) : new Share(n, BigDecimal.ONE);
        } else {
            return null;
        }
        return share.numerator().compareTo(share.denominator()) > 0 ? null : share;
    }

    public record DateWindow(LocalDate from, LocalDate to) {
        public boolean contains(LocalDate d) {
            return !d.isBefore(from) && !d.isAfter(to);
        }
    }

    /** First month paid to the coach for a period: the start month, or the next one from the cut-off day on. */
    public static YearMonth firstSalaryMonth(LocalDate start, int cutoffDay) {
        YearMonth ym = YearMonth.from(start);
        return start.getDayOfMonth() >= cutoffDay ? ym.plusMonths(1) : ym;
    }

    /** A period of {@code months} months counts in exactly {@code months} salary months, from {@link #firstSalaryMonth}. */
    public static boolean coversSalaryMonth(LocalDate start, int months, int cutoffDay, YearMonth month) {
        YearMonth first = firstSalaryMonth(start, cutoffDay);
        return !month.isBefore(first) && month.isBefore(first.plusMonths(months));
    }

    /** Start dates whose first salary month is {@code month}: from the previous month's cut-off day to the day before this one's. */
    public static DateWindow newRegistrationWindow(YearMonth month, int cutoffDay) {
        YearMonth prev = month.minusMonths(1);
        LocalDate from = cutoffDay <= prev.lengthOfMonth() ? prev.atDay(cutoffDay) : month.atDay(1);
        LocalDate to = cutoffDay > 1 ? month.atDay(Math.min(cutoffDay - 1, month.lengthOfMonth())) : prev.atEndOfMonth();
        return new DateWindow(from, to);
    }

    public enum PayMode { COMMISSION, FIXED }

    /** One subscription period of a member: {@code amount} for {@code months} months from {@code start}. */
    public record MemberFacts(long id, Set<Long> sportIds, LocalDate start, int months, BigDecimal amount, boolean enabled) {
        public BigDecimal monthlyPrice() {
            return amount.divide(BigDecimal.valueOf(months), MC);
        }
    }

    public record SalaryParams(Share share, int cutoffDay, MultiCoach multiCoach, Rounding rounding) {
    }

    /** {@code price}: monthly price of {@code period}, the member's period counted this month. */
    public record SalaryLine(long memberId, List<Long> sportIds, BigDecimal price, BigDecimal factor, MemberFacts period) {
    }

    public record SalaryResult(BigDecimal amount, DateWindow window, List<SalaryLine> lines, BigDecimal base) {
    }

    /**
     * RG-SALAIRE.
     * FIXED: the fixed amount. COMMISSION: share × Σ monthly prices (period price ÷ months) of the members practising
     * at least one sport coached by this staff member whose subscription covers the month ({@link #coversSalaryMonth}):
     * a period starting on or after the cut-off day only counts from the next month.
     * A member counts once per staff member (latest covering period). With several coaches on one sport, SPLIT divides
     * that sport's part equally; if the member has several sports coached by this staff member, the most favourable
     * factor is used.
     */
    public static SalaryResult computeSalary(long staffId, PayMode payMode, BigDecimal fixedSalary,
                                             Collection<MemberFacts> periods, Map<Long, ? extends Collection<Long>> coachesBySport,
                                             SalaryParams p, LocalDate day) {
        YearMonth month = YearMonth.from(day);
        DateWindow window = newRegistrationWindow(month, p.cutoffDay());
        if (payMode == PayMode.FIXED) {
            BigDecimal amount = p.rounding().apply(fixedSalary == null ? BigDecimal.ZERO : fixedSalary);
            return new SalaryResult(amount, window, List.of(), BigDecimal.ZERO);
        }
        Map<Long, MemberFacts> covering = new LinkedHashMap<>();
        for (MemberFacts f : periods) {
            if (!coversSalaryMonth(f.start(), f.months(), p.cutoffDay(), month)) continue;
            covering.merge(f.id(), f, (a, b) -> b.start().isAfter(a.start()) ? b : a);
        }
        List<SalaryLine> lines = new ArrayList<>();
        BigDecimal base = BigDecimal.ZERO;
        for (MemberFacts m : covering.values()) {
            if (!m.enabled()) continue;
            List<Long> coached = m.sportIds().stream().sorted()
                    .filter(sid -> coachesBySport.containsKey(sid) && coachesBySport.get(sid).contains(staffId)).toList();
            if (coached.isEmpty()) continue;
            BigDecimal factor = BigDecimal.ONE;
            if (p.multiCoach() == MultiCoach.SPLIT) {
                int fewest = coached.stream().mapToInt(sid -> coachesBySport.get(sid).size()).min().orElse(1);
                factor = BigDecimal.ONE.divide(BigDecimal.valueOf(fewest), MC);
            }
            lines.add(new SalaryLine(m.id(), coached, m.monthlyPrice(), factor, m));
            base = base.add(m.monthlyPrice().multiply(factor, MC));
        }
        return new SalaryResult(p.rounding().apply(p.share().of(base)), window, lines, base.setScale(2, RoundingMode.HALF_UP));
    }

    /** RG-MASSE: sum of salaries of active staff. */
    public static BigDecimal payroll(Collection<BigDecimal> activeSalaries) {
        return activeSalaries.stream().reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------ counts & revenue

    public record FillStats(int count, int fillPercent) {
    }

    /** RG-NB-SPORT: active members practising the sport, and count / capacity. */
    public static FillStats sportStats(int capacity, int activeMemberCount) {
        int pct = capacity > 0 ? (int) Math.round(activeMemberCount * 100.0 / capacity) : 0;
        return new FillStats(activeMemberCount, pct);
    }

    public record ActivityStats(int count, Integer remaining, boolean full) {
    }

    /** RG-NB-ACT */
    public static ActivityStats activityStats(Integer maxPlaces, int registrations) {
        if (maxPlaces == null) return new ActivityStats(registrations, null, false);
        return new ActivityStats(registrations, Math.max(0, maxPlaces - registrations), registrations >= maxPlaces);
    }

    /** A cashed amount: payment date, amount, sports of the member. */
    public record Sale(LocalDate date, BigDecimal amount, Set<Long> sportIds) {
    }

    /** RG-CA: Σ amounts cashed (non-cancelled payments) whose payment date is in [from, to]. */
    public static BigDecimal revenue(Collection<Sale> sales, LocalDate from, LocalDate to) {
        return revenue(sales, from, to, s -> true);
    }

    private static BigDecimal revenue(Collection<Sale> sales, LocalDate from, LocalDate to, Predicate<Sale> filter) {
        DateWindow w = new DateWindow(from, to);
        return sales.stream().filter(filter).filter(s -> w.contains(s.date()))
                .map(Sale::amount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    public record MonthAmount(YearMonth month, BigDecimal amount) {
    }

    /** Revenue for each month of [from, to] (partial first/last months are clipped). */
    public static List<MonthAmount> revenueByMonth(Collection<Sale> sales, LocalDate from, LocalDate to) {
        List<MonthAmount> out = new ArrayList<>();
        for (YearMonth ym = YearMonth.from(from); !ym.isAfter(YearMonth.from(to)); ym = ym.plusMonths(1)) {
            LocalDate a = ym.atDay(1).isBefore(from) ? from : ym.atDay(1);
            LocalDate b = ym.atEndOfMonth().isAfter(to) ? to : ym.atEndOfMonth();
            out.add(new MonthAmount(ym, revenue(sales, a, b)));
        }
        return out;
    }

    public record QuarterAmount(int year, int quarter, BigDecimal amount) {
    }

    public static List<QuarterAmount> revenueByQuarter(Collection<Sale> sales, int firstYear, int lastYear) {
        List<QuarterAmount> out = new ArrayList<>();
        for (int y = firstYear; y <= lastYear; y++) {
            for (int q = 1; q <= 4; q++) {
                LocalDate from = LocalDate.of(y, q * 3 - 2, 1);
                out.add(new QuarterAmount(y, q, revenue(sales, from, YearMonth.of(y, q * 3).atEndOfMonth())));
            }
        }
        return out;
    }

    public record YearAmount(int year, BigDecimal amount) {
    }

    public static List<YearAmount> revenueByYear(Collection<Sale> sales, int firstYear, int lastYear) {
        List<YearAmount> out = new ArrayList<>();
        for (int y = firstYear; y <= lastYear; y++) {
            out.add(new YearAmount(y, revenue(sales, LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31))));
        }
        return out;
    }

    /** CA per sport: a multi-sport member counts fully in each of their sports. */
    public static BigDecimal revenueForSport(Collection<Sale> sales, long sportId, LocalDate from, LocalDate to) {
        return revenue(sales, from, to, s -> s.sportIds().contains(sportId));
    }

    /** CA of a set of sports (a coach's): a member practising several of them counts once. */
    public static BigDecimal revenueForSports(Collection<Sale> sales, Set<Long> sportIds, LocalDate from, LocalDate to) {
        return revenue(sales, from, to, s -> !Collections.disjoint(s.sportIds(), sportIds));
    }

    // ------------------------------------------------------------------ misc

    public static String formatCode(String prefix, int digits, long n) {
        return prefix + String.format("%0" + digits + "d", n);
    }

    /** Lower-case, accents removed, trimmed: used for search and uniqueness. */
    public static String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase().trim();
    }

    public record Slot(DayOfWeek day, LocalTime start, LocalTime end) {
    }

    private static final String[] DAY_LABELS = {"Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"};

    /** "Lun, Mer, Ven 19:00–20:00" or "Lun→Sam 08:00–21:00" (groups by identical hours). */
    public static String summarizeSchedules(Collection<Slot> slots) {
        Map<String, List<Integer>> groups = new LinkedHashMap<>();
        slots.stream().sorted((a, b) -> a.day() != b.day() ? a.day().compareTo(b.day()) : a.start().compareTo(b.start()))
                .forEach(s -> {
                    List<Integer> days = groups.computeIfAbsent(s.start() + "–" + s.end(), k -> new ArrayList<>());
                    if (!days.contains(s.day().getValue())) days.add(s.day().getValue());
                });
        List<String> parts = new ArrayList<>();
        groups.forEach((time, days) -> {
            boolean contiguous = days.size() >= 3;
            for (int i = 1; i < days.size() && contiguous; i++) contiguous = days.get(i) == days.get(i - 1) + 1;
            String label = contiguous
                    ? DAY_LABELS[days.getFirst() - 1] + "→" + DAY_LABELS[days.getLast() - 1]
                    : String.join(", ", days.stream().map(d -> DAY_LABELS[d - 1]).toList());
            parts.add(label + " " + time);
        });
        return String.join(" · ", parts);
    }
}
