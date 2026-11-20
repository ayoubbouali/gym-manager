package com.gymmanager.gym.importer;

import com.gymmanager.gym.rules.Rules;
import org.junit.jupiter.api.Test;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

class ImportParsingTest {

    private static String summary(String raw) {
        return Rules.summarizeSchedules(ImportService.parseSchedule(raw));
    }

    @Test
    void schedulesOfTheFormerExcelFile() {
        assertThat(summary("Lun-Sam 07h-22h")).isEqualTo("Lun→Sam 07:00–22:00");
        assertThat(summary("Mar-Jeu 09h-10h30")).isEqualTo("Mar→Jeu 09:00–10:30");
        assertThat(summary("Tous les jours 07h-20h")).isEqualTo("Lun→Dim 07:00–20:00");
        assertThat(summary("Mer-Sam 18h-19h")).isEqualTo("Mer→Sam 18:00–19:00");
    }

    @Test
    void schedulesInTheApplicationFormat() {
        assertThat(summary("Lun, Mer, Ven 19:00–20:00")).isEqualTo("Lun, Mer, Ven 19:00–20:00");
        assertThat(summary("Lun→Sam 08:00–21:00")).isEqualTo("Lun→Sam 08:00–21:00");
        assertThat(summary("Lun, Mer 18h-19h · Sam 10h-12h")).isEqualTo("Lun, Mer 18:00–19:00 · Sam 10:00–12:00");
        assertThat(ImportService.parseSchedule("selon planning")).isEmpty();
    }

    @Test
    void frenchMonths() {
        assertThat(ImportService.parseMonth("Septembre 2026")).isEqualTo(YearMonth.of(2026, 9));
        assertThat(ImportService.parseMonth("Août 2026")).isEqualTo(YearMonth.of(2026, 8));
        assertThat(ImportService.parseMonth("Décembre 2025")).isEqualTo(YearMonth.of(2025, 12));
        assertThat(ImportService.parseMonth("févr. 2026")).isEqualTo(YearMonth.of(2026, 2));
        assertThat(ImportService.parseMonth("03/2026")).isEqualTo(YearMonth.of(2026, 3));
        assertThat(ImportService.parseMonth("n'importe quoi")).isNull();
    }

    @Test
    void codesAndLabels() {
        assertThat(ImportService.codeNumber("A017")).isEqualTo(17L);
        assertThat(ImportService.codeNumber("SP06")).isEqualTo(6L);
        assertThat(ImportService.codeNumber("X-12")).isNull();
        assertThat(ImportService.durationLabel(6)).isEqualTo("Semestriel");
        assertThat(ImportService.durationLabel(4)).isEqualTo("4 mois");
    }
}
