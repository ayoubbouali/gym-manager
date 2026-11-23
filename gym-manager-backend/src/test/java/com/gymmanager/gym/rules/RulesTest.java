package com.gymmanager.gym.rules;

import com.gymmanager.gym.rules.Rules.MemberFacts;
import com.gymmanager.gym.rules.Rules.MemberState;
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
import java.util.ArrayList;
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
        void discountPercentOfATypedPrice() {
            assertThat(Rules.discountPercent(bd("150"), bd("100"))).isEqualByComparingTo("33.33");
            assertThat(Rules.discountPercent(bd("150"), bd("150"))).isEqualByComparingTo("0");
            assertThat(Rules.discountPercent(BigDecimal.ZERO, bd("0"))).isEqualByComparingTo("0");
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
        @DisplayName("RG-JOURS : la période de référence est la dernière atteinte par les paiements cumulés")
        void referencePeriodFollowsPooledPayments() {
            var today = d("2026-11-18");
            var periods = List.of(new Rules.PeriodSpan(d("2026-10-25"), 1, bd("300")), new Rules.PeriodSpan(d("2026-11-25"), 1, bd("300")));
            assertThat(Rules.referencePeriod(periods, bd("300"), today)).as("renouvellement impayé").isZero();
            assertThat(Rules.referencePeriod(periods, bd("100"), today)).as("1re période partiellement payée").isZero();
            assertThat(Rules.referencePeriod(periods, bd("350"), today)).as("paiement imputé sur l'arriéré qui entame le renouvellement").isEqualTo(1);
            var freeRenewal = List.of(new Rules.PeriodSpan(d("2026-10-25"), 1, bd("300")), new Rules.PeriodSpan(d("2026-11-25"), 1, bd("0")));
            assertThat(Rules.referencePeriod(freeRenewal, bd("300"), today)).as("renouvellement gratuit après une période soldée").isEqualTo(1);
            assertThat(Rules.referencePeriod(freeRenewal, bd("200"), today)).as("renouvellement gratuit après un arriéré").isZero();
            // without any payment: the latest period already started, else the first one
            var nonePaid = List.of(new Rules.PeriodSpan(d("2026-10-01"), 1, bd("300")), new Rules.PeriodSpan(d("2026-11-01"), 1, bd("300")),
                    new Rules.PeriodSpan(d("2026-12-01"), 1, bd("300")));
            assertThat(Rules.referencePeriod(nonePaid, bd("0"), today)).isEqualTo(1);
            assertThat(Rules.referencePeriod(List.of(new Rules.PeriodSpan(d("2026-12-01"), 1, bd("300"))), bd("0"), today)).isZero();
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
            assertThat(c.state()).isEqualTo(MemberState.UP_TO_DATE);
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
    @DisplayName("RG-ETAT")
    class StateRule {
        @ParameterizedTest(name = "{0} jours, {1} → {2}")
        @CsvSource({
                "-1, PAYE, EXPIRED", "-1, PARTIEL, EXPIRED", "-1, IMPAYE, EXPIRED",
                "20, IMPAYE, UNPAID", "3, IMPAYE, UNPAID",
                "0, PAYE, SOON", "6, PAYE, SOON", "6, PARTIEL, SOON",
                "7, PAYE, UP_TO_DATE", "7, PARTIEL, UP_TO_DATE", "300, PAYE, UP_TO_DATE"})
        void sevenDayThreshold(long days, PaymentStatus status, MemberState expected) {
            assertThat(Rules.memberState(days, status, 7)).isEqualTo(expected);
        }

        @Test
        void thresholdIsTheClubSetting() {
            assertThat(Rules.memberState(8, PaymentStatus.PAYE, 10)).isEqualTo(MemberState.SOON);
            assertThat(Rules.memberState(10, PaymentStatus.PAYE, 10)).isEqualTo(MemberState.UP_TO_DATE);
        }
    }

    @Nested
    @DisplayName("RG-SALAIRE")
    class Salary {
        static final long HAMZA = 1L, OTHER = 2L;
        static final long KARATE = 10L, BOXE = 20L;
        static final LocalDate TODAY = d("2026-09-18");
        static final SalaryParams THIRD = new SalaryParams(Rules.parseShare("1/3"), 25, MultiCoach.FULL, R2);

        /** A monthly period. */
        static MemberFacts member(long id, String date, String price, Long... sports) {
            return period(id, date, 1, price, sports);
        }

        static MemberFacts period(long id, String date, int months, String price, Long... sports) {
            return new MemberFacts(id, Set.of(sports), d(date), months, bd(price), true);
        }

        @Test
        void fixedModeReturnsTheEnteredAmount() {
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.FIXED, bd("4500"), List.of(), Map.of(), THIRD, TODAY);
            assertThat(r.amount()).isEqualByComparingTo("4500.00");
            assertThat(r.lines()).isEmpty();
        }

        @Test
        void commissionIsAThirdOfTheMonthlyPricesInProgress() {
            var members = List.of(member(16, "2026-09-05", "300", KARATE));
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, Map.of(KARATE, List.of(HAMZA)), THIRD, TODAY);
            assertThat(r.amount()).isEqualByComparingTo("100.00");
            // new registrations counted from September: 25/08 → 24/09
            assertThat(r.window().from()).isEqualTo(d("2026-08-25"));
            assertThat(r.window().to()).isEqualTo(d("2026-09-24"));
        }

        @Test
        void registrationsFromTheCutoffDayCountFromTheNextMonth() {
            // 10 members already in progress, one new on the 10th, one new on the 25th
            var members = new ArrayList<MemberFacts>();
            for (long i = 1; i <= 10; i++) members.add(period(i, "2026-08-10", 3, "450", KARATE));
            members.add(member(11, "2026-09-10", "150", KARATE));
            members.add(member(12, "2026-09-25", "150", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA));
            SalaryResult sept = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY);
            assertThat(sept.lines()).hasSize(11).extracting(Rules.SalaryLine::memberId).doesNotContain(12L);
            assertThat(sept.amount()).isEqualByComparingTo("550.00"); // 11 × 150 / 3
            SalaryResult oct = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, d("2026-10-01"));
            // the quarterly ones and the one of the 25th; the one of the 10th (monthly) has ended
            assertThat(oct.lines()).extracting(Rules.SalaryLine::memberId).contains(12L).doesNotContain(11L).hasSize(11);
        }

        @Test
        void cutoffDayBoundaries() {
            var members = List.of(
                    member(1, "2026-09-24", "300", KARATE),   // day before the cut-off: this month
                    member(2, "2026-09-25", "600", KARATE),   // cut-off day: next month
                    member(3, "2026-08-25", "900", KARATE),   // previous month's cut-off day: this month
                    member(4, "2026-08-24", "900", KARATE));  // previous month before the cut-off: ended
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, Map.of(KARATE, List.of(HAMZA)), THIRD, TODAY);
            assertThat(r.lines()).extracting(Rules.SalaryLine::memberId).containsExactlyInAnyOrder(1L, 3L);
            assertThat(r.amount()).isEqualByComparingTo("400.00");
        }

        @Test
        void aPeriodCountsItsNumberOfMonthsAtItsMonthlyPrice() {
            var annual = List.of(period(1, "2026-01-10", 12, "3060", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA));
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, annual, coaches, THIRD, TODAY).lines())
                    .singleElement().satisfies(l -> assertThat(l.price()).isEqualByComparingTo("255"));
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, annual, coaches, THIRD, d("2026-12-01")).amount()).isEqualByComparingTo("85.00");
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, annual, coaches, THIRD, d("2027-01-01")).lines()).isEmpty();
        }

        @Test
        void overlappingPeriodsOfAMemberCountOnceWithTheLatest() {
            var members = List.of(member(1, "2026-09-01", "300", KARATE), member(1, "2026-09-15", "150", KARATE));
            SalaryResult r = Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, Map.of(KARATE, List.of(HAMZA)), THIRD, TODAY);
            assertThat(r.lines()).singleElement().satisfies(l -> assertThat(l.price()).isEqualByComparingTo("150"));
        }

        @Test
        void shareAndCutoffAreParameters() {
            var members = List.of(member(1, "2026-09-05", "300", KARATE), member(2, "2026-09-25", "200", KARATE));
            var coaches = Map.of(KARATE, List.of(HAMZA));
            var p40 = new SalaryParams(Rules.parseShare("40"), 26, MultiCoach.FULL, R2);
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
            var split = new SalaryParams(Rules.parseShare("1/3"), 25, MultiCoach.SPLIT, R2);
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, split, TODAY).amount()).isEqualByComparingTo("50.00");
            assertThat(Rules.computeSalary(OTHER, PayMode.COMMISSION, null, members, coaches, split, TODAY).amount()).isEqualByComparingTo("50.00");
        }

        @Test
        void membersOfOtherSportsOrDisabledAreIgnored() {
            var disabled = new MemberFacts(2, Set.of(KARATE), d("2026-09-05"), 1, bd("300"), false);
            var members = List.of(member(1, "2026-09-05", "400", BOXE), disabled);
            var coaches = Map.of(KARATE, List.of(HAMZA), BOXE, List.of(OTHER));
            assertThat(Rules.computeSalary(HAMZA, PayMode.COMMISSION, null, members, coaches, THIRD, TODAY).amount()).isEqualByComparingTo("0.00");
        }

        @Test
        void windowFollowsShortMonths() {
            // February has no 31st: the March window starts on 01/03; a registration on 31/03 counts from April
            var w = Rules.newRegistrationWindow(java.time.YearMonth.of(2026, 3), 31);
            assertThat(w.from()).isEqualTo(d("2026-03-01"));
            assertThat(w.to()).isEqualTo(d("2026-03-30"));
            var first = Rules.newRegistrationWindow(java.time.YearMonth.of(2026, 3), 1);
            assertThat(first.from()).isEqualTo(d("2026-02-01"));
            assertThat(first.to()).isEqualTo(d("2026-02-28"));
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
        @DisplayName("Lien WhatsApp : préfixe national retiré selon le pays (212 : 0, 7 : 8, 36 : 06)")
        void whatsappLinkStripsCountryTrunkPrefix() {
            assertThat(Rules.whatsappLink("212", "0695822412", "Bonjour")).isEqualTo("https://wa.me/212695822412?text=Bonjour");
            assertThat(Rules.whatsappLink("7", "89123456789", "Bonjour")).isEqualTo("https://wa.me/79123456789?text=Bonjour");
            assertThat(Rules.whatsappLink("36", "06201234567", "Bonjour")).isEqualTo("https://wa.me/36201234567?text=Bonjour");
        }

        @Test
        @DisplayName("Lien WhatsApp : un numéro étranger stocké en E.164 est déjà international")
        void whatsappLinkForE164() {
            assertThat(Rules.whatsappLink("212", "+33612345678", "Bonjour")).isEqualTo("https://wa.me/33612345678?text=Bonjour");
            assertThat(Rules.whatsappLink("212", "0612345678", "Bonjour")).isEqualTo("https://wa.me/212612345678?text=Bonjour");
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
