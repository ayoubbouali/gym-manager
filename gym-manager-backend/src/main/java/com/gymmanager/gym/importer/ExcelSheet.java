package com.gymmanager.gym.importer;

import com.gymmanager.gym.rules.Rules;
import org.apache.poi.ss.usermodel.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * A worksheet read as a table: the header row is detected automatically and columns are
 * found by their title (accents, case and units such as "(DH)" are ignored), not by position.
 */
final class ExcelSheet {
    final String name;
    final Sheet sheet;
    final int headerRow;
    private final Map<String, Integer> columns = new HashMap<>();
    private final DataFormatter formatter = new DataFormatter(Locale.FRANCE);
    private final FormulaEvaluator evaluator;

    private ExcelSheet(Sheet sheet, int headerRow, FormulaEvaluator evaluator) {
        this.name = sheet.getSheetName();
        this.sheet = sheet;
        this.headerRow = headerRow;
        this.evaluator = evaluator;
        Row h = sheet.getRow(headerRow);
        for (Cell c : h) {
            String key = normalizeHeader(formatter.formatCellValue(c));
            if (!key.isEmpty()) columns.putIfAbsent(key, c.getColumnIndex());
        }
    }

    static String normalizeHeader(String s) {
        return Rules.normalize(s).replaceAll("\\(.*?\\)", " ").replaceAll("[^a-z0-9' ]", " ").replaceAll("\\s+", " ").trim();
    }

    /** Finds the sheet whose normalized name matches one of the candidates. */
    static Optional<Sheet> find(Workbook wb, String... candidates) {
        for (Sheet s : wb) {
            String n = normalizeHeader(s.getSheetName());
            for (String c : candidates) if (n.equals(c)) return Optional.of(s);
        }
        for (Sheet s : wb) {
            String n = normalizeHeader(s.getSheetName());
            for (String c : candidates) if (n.contains(c)) return Optional.of(s);
        }
        return Optional.empty();
    }

    /** Header = first row (among the first 20) containing at least {@code minMatches} of the expected titles. */
    static Optional<ExcelSheet> open(Sheet sheet, FormulaEvaluator ev, int minMatches, String... expected) {
        DataFormatter f = new DataFormatter(Locale.FRANCE);
        Set<String> exp = new HashSet<>(Arrays.asList(expected));
        for (int r = sheet.getFirstRowNum(); r <= Math.min(sheet.getLastRowNum(), sheet.getFirstRowNum() + 20); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            int matches = 0;
            for (Cell c : row) if (exp.contains(normalizeHeader(f.formatCellValue(c)))) matches++;
            if (matches >= minMatches) return Optional.of(new ExcelSheet(sheet, r, ev));
        }
        return Optional.empty();
    }

    /** Column index of the first matching title, or -1. */
    int col(String... aliases) {
        for (String a : aliases) {
            Integer i = columns.get(a);
            if (i != null) return i;
        }
        return -1;
    }

    int lastRow() {
        return sheet.getLastRowNum();
    }

    private Cell cell(int row, int col) {
        if (col < 0) return null;
        Row r = sheet.getRow(row);
        return r == null ? null : r.getCell(col);
    }

    private CellType type(Cell c) {
        return c.getCellType() == CellType.FORMULA ? c.getCachedFormulaResultType() : c.getCellType();
    }

    String text(int row, int col) {
        Cell c = cell(row, col);
        if (c == null) return "";
        if (type(c) == CellType.NUMERIC && !DateUtil.isCellDateFormatted(c)) {
            BigDecimal v = BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros();
            return v.scale() <= 0 ? v.toBigInteger().toString() : v.toPlainString();
        }
        try {
            return formatter.formatCellValue(c, evaluator).trim();
        } catch (RuntimeException e) {
            return formatter.formatCellValue(c).trim();
        }
    }

    /** Phone numbers stored as numbers lose their leading 0: it is restored (9 digits → 0XXXXXXXXX). */
    String phone(int row, int col) {
        String t = text(row, col).replaceAll("[\\s.\\-]", "");
        if (t.matches("\\d{9}")) t = "0" + t;
        if (t.startsWith("+212")) t = "0" + t.substring(4);
        if (t.startsWith("00212")) t = "0" + t.substring(5);
        return t;
    }

    BigDecimal number(int row, int col) {
        Cell c = cell(row, col);
        if (c == null) return null;
        if (type(c) == CellType.NUMERIC) return BigDecimal.valueOf(c.getNumericCellValue()).setScale(2, RoundingMode.HALF_UP);
        String t = text(row, col).replaceAll("(?i)dh|mad|€|\\s", "").replace(',', '.');
        if (t.isEmpty()) return null;
        try {
            return new BigDecimal(t).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("d/M/uuuu"), DateTimeFormatter.ofPattern("d-M-uuuu"),
            DateTimeFormatter.ofPattern("uuuu-M-d"), DateTimeFormatter.ofPattern("d.M.uuuu"), DateTimeFormatter.ofPattern("d/M/uu")};

    /** Real Excel dates, Excel serial numbers or text dates (jj/mm/aaaa, aaaa-mm-jj…). */
    LocalDate date(int row, int col) {
        Cell c = cell(row, col);
        if (c == null) return null;
        if (type(c) == CellType.NUMERIC) {
            double v = c.getNumericCellValue();
            if (v < 1 || v > 2958465) return null;
            return DateUtil.getLocalDateTime(v).toLocalDate();
        }
        String t = text(row, col);
        if (t.isEmpty()) return null;
        String d = t.length() > 10 ? t.substring(0, 10).trim() : t;
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                return LocalDate.parse(d, f);
            } catch (Exception ignored) {
                // next format
            }
        }
        return null;
    }

    boolean blank(int row, int... cols) {
        for (int c : cols) if (!text(row, c).isEmpty()) return false;
        return true;
    }
}
