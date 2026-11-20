package com.gymmanager.gym.rules;

import com.gymmanager.gym.rules.Rules.MemberFacts;
import com.gymmanager.gym.rules.Rules.MultiCoach;
import com.gymmanager.gym.rules.Rules.PayMode;
import com.gymmanager.gym.rules.Rules.PaymentStatus;
import com.gymmanager.gym.rules.Rules.Rounding;
import com.gymmanager.gym.rules.Rules.Sale;
import com.gymmanager.gym.rules.Rules.SalaryParams;
import com.gymmanager.gym.rules.Rules.SalaryResult;
import com.gymmanager.gym.rules.Rules.Situation;
import com.gymmanager.gym.rules.Rules.Slot;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class RulesTest {

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private static final Rounding R2 = Rounding.TWO_DECIMALS;

    @Nested
    @DisplayName("RG-PACK")
    class PackTotal {
        @Test
        void karateQuarterlyWith10PercentIs810() {
            assertThat(Rules.packTotal(bd("300"), 3, bd("10"), R2)).isEqualByComparingTo("810.00");
        }

        @Test
        void monthlyWithoutDiscount() {
            assertThat(Rules.packTotal(bd("450"), 1, BigDecimal.ZERO, R2)).isEqualByComparingTo("450.00");
        }

        @Test
        void annualWith15Percent() {
            assertThat(Rules.packTotal(bd("350"), 12, bd("15"), R2)).isEqualByComparingTo("3570.00");
        }

        @Test
        void unitRounding() {
            assertThat(Rules.packTotal(bd("333.33"), 1, BigDecimal.ZERO, Rounding.UNIT)).isEqualByComparingTo("333");
        }
    }

    @Nested
    @DisplayName("RG-PRIX")
    class MemberPrice {
        @Test
        void cumulativeAppliesBothDiscounts() {
            // Karaté - Trimestriel (810) + Remise 10% = 729 (criterion 6)
            assertThat(Rules.memberPrice(bd("300"), 3, bd("10"), bd("10"), true, R2)).isEqualByComparingTo("729.00");
        }

        @Test
        void nonCumulativeKeepsTheStrongestDiscount() {
            assertThat(Rules.memberPrice(bd("300"), 3, bd("10"), bd("10"), false, R2)).isEqualByComparingTo("810.00");
            assertThat(Rules.memberPrice(bd("300"), 3, bd("10"), bd("25"), false, R2)).isEqualByComparingTo("675.00");
            assertThat(Rules.memberPrice(bd("300"), 3, bd("15"), bd("5"), false, R2)).isEqualByComparingTo("765.00");
        }

        @Test
        void kickboxingAnnualWithMember10Percent() {
            // 350 × 12 × 0.85 × 0.90 = 3 213 (mock-up, A003)
            assertThat(Rules.memberPrice(bd("350"), 12, bd("15"), bd("10"), true, R2)).isEqualByComparingTo("3213.00");
        }

        @Test
        void roundingToTwoDecimals() {
            // 450 × 12 × 0.85 × 0.95 = 4 360.50
            assertThat(Rules.memberPrice(bd("450"), 12, bd("15"), bd("5"), true, R2)).isEqualByComparingTo("4360.50");
            assertThat(Rules.memberPrice(bd("450"), 12, bd("15"), bd("5"), true, Rounding.UNIT)).isEqualByComparingTo("4361");
        }
    }

    @Nested
    @DisplayName("RG-FIN")
    class EndDate {
        @ParameterizedTest(name = "{0} + {1} mois = {2}")
        @CsvSource({
                "2026-01-31, 1, 2026-02-28",
                "2028-01-31, 1, 2028-02-29",   // leap year
                "2028-02-29, 12, 2029-02-28",  // from Feb 29 to a non-leap year
                "2026-03-31, 3, 2026-06-30",
                "2026-11-30, 3, 2027-02-28",
                "2026-07-22, 12, 2027-07-22",
                "2026-12-15, 1, 2027-01-15",
        })
        void calendarAddition(String from, int months, String expected) {
            assertThat(Rules.subscriptionEnd(d(from), months)).isEqualTo(d(expected));
        }
    }

    @Nested
    @DisplayName("RG-JOURS / RG-STATUT / RG-ACTIF")
    class Remaining {
        @Test
        void positiveZeroAndNegative() {
            LocalDate today = d("2026-11-18");
            assertThat(Rules.remainingDays(d("2027-07-22"), today)).isEqualTo(246);
            assertThat(Rules.remainingDays(today, today)).isZero();
            assertThat(Rules.remainingDays(d("2026-08-21"), today)).isEqualTo(-89);
        }

        @Test
        void statusDependsOnTheAmountPaid() {
            assertThat(Rules.paymentStatus(bd("3213"), bd("3213"))).isEqualTo(PaymentStatus.PAYE);
            assertThat(Rules.paymentStatus(bd("3213"), bd("1500"))).isEqualTo(PaymentStatus.PARTIEL);
            assertThat(Rules.paymentStatus(bd("3213"), BigDecimal.ZERO)).isEqualTo(PaymentStatus.IMPAYE);
            assertThat(Rules.paymentStatus(bd("3213"), null)).isEqualTo(PaymentStatus.IMPAYE);
            assertThat(Rules.paymentStatus(BigDecimal.ZERO, BigDecimal.ZERO)).isEqualTo(PaymentStatus.PAYE);
        }

        @Test
        void balanceIsNeverNegative() {
            assertThat(Rules.balance(bd("3213"), bd("1500"))).isEqualByComparingTo("1713.00");
            assertThat(Rules.balance(bd("300"), bd("400"))).isEqualByComparingTo("0.00");
        }

        @Test
        void memberTotalsCoverAllPeriods() {
            // current period 250 (renewal), arrears 187.50 unpaid, 250 paid
            var c = Rules.computeMember(d("2026-11-10"), 1, bd("250"), bd("437.50"), bd("250"), true,
                    new Rules.PricingSettings(true, R2, 7, 30), d("2026-11-18"));
            assertThat(c.price()).isEqualByComparingTo("250");
            assertThat(c.endDate()).isEqualTo(d("2026-12-10"));
            assertThat(c.remainingDays()).isEqualTo(22);
            assertThat(c.balance()).isEqualByComparingTo("187.50");
            assertThat(c.paymentStatus()).isEqualTo(PaymentStatus.PARTIEL);
            assertThat(c.situation()).isEqualTo(Situation.FOLLOW);
        }

        @Test
        void activeNeedsEnabledAndNotExpired() {
            assertThat(Rules.isMemberActive(true, 0)).isTrue();
            assertThat(Rules.isMemberActive(true, -1)).isFalse();
            assertThat(Rules.isMemberActive(false, 100)).isFalse();
        }
    }

    @Nested
    @DisplayName("RG-RENOUV et numérotation")
    class Renewal {
        @Test
        void renewalContinuesARunningPeriod() {
            assertThat(Rules.renewalStart(d("2027-07-22"), d("2026-11-18"))).isEqualTo(d("2027-07-22"));
            assertThat(Rules.renewalStart(d("2026-11-18"), d("2026-11-18"))).isEqualTo(d("2026-11-18"));
        }

        @Test
        void renewalOfAnExpiredPeriodStartsToday() {
            assertThat(Rules.renewalStart(d("2026-08-22"), d("2026-11-18"))).isEqualTo(d("2026-11-18"));
        }

        @Test
        void documentNumbers() {
            assertThat(Rules.documentNumber("REC", 2026, 1)).isEqualTo("REC-2026-0001");
            assertThat(Rules.documentNumber("SAL", 2027, 123)).isEqualTo("SAL-2027-0123");
        }
    }

    @Nested
    @DisplayName("RG-SITUATION")
    class SituationRule {
        @ParameterizedTest(name = "{0} jours → {1}")
        @CsvSource({"-1, EXPIRED", "0, SOON", "7, SOON", "8, FOLLOW", "30, FOLLOW", "31, OK"})
        void defaultThresholds(long days, Situation expected) {
            assertThat(Rules.situation(days, 7, 30)).isEqualTo(expected);
        }

        @Test
        void thresholdsAreParameters() {
            // criterion 3: moving "soon" from 7 to 10 days changes the situation
            assertThat(Rules.situation(8, 7, 30)).isEqualTo(Situation.FOLLOW);
            assertThat(Rules.situation(8, 10, 30)).isEqualTo(Situation.SOON);
            assertThat(Rules.situation(40, 10, 45)).isEqualTo(Situation.FOLLOW);
        }
    }

    @Nested
    @DisplayName("RG-SALAIRE")
    class Salary {
        static final long HAMZA = 1L, OTHER = 2L;
        static final long KARATE = 10L, BOXE = 20L;
        static final LocalDate TODAY = d("2026-09-18");
        static final SalaryParams THIRD = new SalaryParams(Rules.parseShare("1/3"), 1, 23, MultiCoach.FULL, R2);

        static MemberFacts member(long id, String date, String price, Long... sports) {
            return new MemberFacts(id, Set.of(sports), d(date), bd(price), true);
        }

        @Test
        void fixedModeReturnsTheEnteredAmount() {
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.FIXED, bd("4500"), List.of(), Map.of(), THIRD, TODAY);
            assertThat(r.amount()).isEqualByComparingTo("4500.00");
            assertThat(r.lines()).isEmpty();
        }

        @Test
        void commissionIsAThirdOfThePricesInTheWindow() {
            var members = List.of(member(16, "2026-09-05", "300", KARATE));
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, Map.of(KARATE, List.of(HAMZA)), THIRD, TODAY);
            assertThat(r.amount()).isEqualByComparingTo("100.00");
            assertThat(r.window().from()).isEqualTo(d("2026-09-01"));
            assertThat(r.window().to()).isEqualTo(d("2026-09-23"));
        }

        @Test
        void windowBoundsAreIncludedAndTheNextDayExcluded() {
            var members = List.of(
                    member(1, "2026-09-01", "300", KARATE),   // first day: included
                    member(2, "2026-09-23", "600", KARATE),   // last day: included
                    member(3, "2026-09-24", "900", KARATE),   // day after: excluded
                    member(4, "2026-08-31", "900", KARATE));  // day before: excluded
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, Map.of(KARATE, List.of(HAMZA)), THIRD, TODAY);
            assertThat(r.lines()).extracting(Rules.SalaryLine::memberId).containsExactly(1L, 2L);
            assertThat(r.amount()).isEqualByComparingTo("300.00");
        }

        @Test
        void shareAndWindowAreParameters() {
            var members = List.of(member(1, "2026-09-05", "300", KARATE), member(2, "2026-09-25", "200", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA));
            var p40 = new SalaryParams(Rules.parseShare("40"), 1, 25, MultiCoach.FULL, R2);
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, p40, TODAY);
            assertThat(r.amount()).isEqualByComparingTo("200.00"); // 40 % × 500
        }

        @Test
        void aMemberCountsOncePerStaffEvenWithSeveralCoachedSports() {
            var members = List.of(member(1, "2026-09-05", "600", KARATE, BOXE));
            var coaches = Map.of(KARATE, List.of(HAMZA), BOXE, List.of(HAMZA));
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY);
            assertThat(r.lines()).hasSize(1);
            assertThat(r.amount()).isEqualByComparingTo("200.00");
        }

        @Test
        void severalCoachesFullModeEachGetsTheWholeShare() {
            var members = List.of(member(1, "2026-09-05", "300", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA, OTHER));
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY).amount()).isEqualByComparingTo("100.00");
            assertThat(Rules.computeSalary(OTHER, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY).amount()).isEqualByComparingTo("100.00");
        }

        @Test
        void severalCoachesSplitModeShareEqually() {
            var members = List.of(member(1, "2026-09-05", "300", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA, OTHER));
            var split = new SalaryParams(Rules.parseShare("1/3"), 1, 23, MultiCoach.SPLIT, R2);
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, split, TODAY).amount()).isEqualByComparingTo("50.00");
            assertThat(Rules.computeSalary(OTHER, PayMode.COMMISSION, null, members, coaches, split, TODAY).amount()).isEqualByComparingTo("50.00");
        }

        @Test
        void membersOfOtherSportsOrDisabledAreIgnored() {
            var disabled = new MemberFacts(2, Set.of(KARATE), d("2026-09-05"), bd("300"), false);
            var members = List.of(member(1, "2026-09-05", "400", BOXE), disabled);
            var coaches = Map.of(KARATE, List.of(HAMZA), BOXE, List.of(OTHER));
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY).amount()).isEqualByComparingTo("0.00");
        }

        @Test
        void windowIsClampedToTheMonthLength() {
            var w = Rules.salaryWindow(d("2026-02-10"), 1, 31);
            assertThat(w.to()).isEqualTo(d("2026-02-28"));
        }

        @ParameterizedTest
        @CsvSource(value = {"1/3; 33.33", "33,33; 33.33", "40 %; 40.00", "0.4; 40.00", "100; 100.00"}, delimiter = ';')
        void shareParsing(String raw, String percent) {
            assertThat(Rules.parseShare(raw).asPercent()).isEqualByComparingTo(percent);
        }

        @Test
        void invalidShares() {
            assertThat(Rules.parseShare("abc")).isNull();
            assertThat(Rules.parseShare("150")).isNull();
            assertThat(Rules.parseShare("1/0")).isNull();
        }

        @Test
        void payrollSumsActiveSalaries() {
            assertThat(Rules.payroll(List.of(bd("100"), bd("4500"), bd("4300")))).isEqualByComparingTo("8900.00");
        }
    }

    @Nested
    @DisplayName("RG-CA")
    class Revenue {
        final List<Sale> sales = List.of(
                new Sale(d("2026-02-17"), bd("187.50"), Set.of(1L)),
                new Sale(d("2026-05-08"), bd("675"), Set.of(2L)),
                new Sale(d("2026-05-31"), bd("100"), Set.of(1L, 2L)),
                new Sale(d("2026-06-01"), bd("50"), Set.of(2L)),
                new Sale(d("2025-12-31"), bd("20"), Set.of(1L)));

        @Test
        void periodBoundsAreIncluded() {
            assertThat(Rules.revenue(sales, d("2026-05-08"), d("2026-05-31"))).isEqualByComparingTo("775.00");
            assertThat(Rules.revenue(sales, d("2026-01-01"), d("2026-12-31"))).isEqualByComparingTo("1012.50");
        }

        @Test
        void byMonthQuarterYear() {
            var months = Rules.revenueByMonth(sales, d("2026-01-01"), d("2026-06-30"));
            assertThat(months).hasSize(6);
            assertThat(months.get(4).month()).isEqualTo(YearMonth.of(2026, 5));
            assertThat(months.get(4).amount()).isEqualByComparingTo("775.00");
            var quarters = Rules.revenueByQuarter(sales, 2026, 2026);
            assertThat(quarters.get(0).amount()).isEqualByComparingTo("187.50");
            assertThat(quarters.get(1).amount()).isEqualByComparingTo("825.00");
            var years = Rules.revenueByYear(sales, 2025, 2026);
            assertThat(years.get(0).amount()).isEqualByComparingTo("20.00");
            assertThat(years.get(1).amount()).isEqualByComparingTo("1012.50");
        }

        @Test
        void multiSportMembersCountInEachSport() {
            assertThat(Rules.revenueForSport(sales, 1L, d("2026-01-01"), d("2026-12-31"))).isEqualByComparingTo("287.50");
            assertThat(Rules.revenueForSport(sales, 2L, d("2026-01-01"), d("2026-12-31"))).isEqualByComparingTo("825.00");
        }
    }

    @Nested
    @DisplayName("Divers")
    class Misc {
        @Test
        void whatsappLinkUsesDialCodeAndDropsLeadingZero() {
            assertThat(Rules.whatsappLink("212", "0695822412", "Bonjour Youssef"))
                    .isEqualTo("https://wa.me/212695822412?text=Bonjour%20Youssef");
        }

        @Test
        void templateVariablesAreReplaced() {
            String msg = Rules.renderTemplate("Bonjour {prenom} {nom}, {jours} jour(s) — {inconnu}",
                    Map.of("prenom", "Hamza", "nom", "Amrani", "jours", 246));
            assertThat(msg).isEqualTo("Bonjour Hamza Amrani, 246 jour(s) — {inconnu}");
        }

        @Test
        void schedulesSummary() {
            var t = LocalTime.of(19, 0);
            var e = LocalTime.of(20, 0);
            assertThat(Rules.summarizeSchedules(List.of(new Slot(DayOfWeek.FRIDAY, t, e), new Slot(DayOfWeek.MONDAY, t, e), new Slot(DayOfWeek.WEDNESDAY, t, e))))
                    .isEqualTo("Lun, Mer, Ven 19:00–20:00");
            var s = LocalTime.of(8, 0);
            var f = LocalTime.of(21, 0);
            var week = java.util.stream.IntStream.rangeClosed(1, 6).mapToObj(i -> new Slot(DayOfWeek.of(i), s, f)).toList();
            assertThat(Rules.summarizeSchedules(week)).isEqualTo("Lun→Sam 08:00–21:00");
        }

        @Test
        void normalizeRemovesAccentsAndCase() {
            assertThat(Rules.normalize("  Aérobic ÉTÉ ")).isEqualTo("aerobic ete");
        }

        @Test
        void codesAreZeroPadded() {
            assertThat(Rules.formatCode("A", 3, 17)).isEqualTo("A017");
            assertThat(Rules.formatCode("SP", 2, 6)).isEqualTo("SP06");
        }
    }
}
