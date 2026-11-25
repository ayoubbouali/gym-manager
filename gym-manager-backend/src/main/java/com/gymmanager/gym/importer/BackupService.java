package com.gymmanager.gym.importer;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.FileStorage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Full backup of the club data as a zip archive: {@code data.json} (every table of the scope) and
 * {@code uploads/} (member photos and club logo referenced by the data).
 *
 * <p>The scope is the club data and {@code app_settings}; {@code app_users} is never exported nor touched,
 * so the administrator who restores keeps their access. Tables and columns are read from
 * {@code information_schema}: only known columns are inserted, with bound parameters.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BackupService {
    static final String FORMAT = "gym-manager-backup";
    static final String DATA_ENTRY = "data.json";
    static final String UPLOADS_PREFIX = "uploads/";
    static final String LOGO_KEY = "club.logoFile";
    private static final String UNREADABLE = "Fichier de sauvegarde illisible";
    /** Guard against zip bombs: total uncompressed size accepted at restore. */
    private static final long MAX_UNCOMPRESSED = 200L * 1024 * 1024;

    private final JdbcTemplate jdbc;
    private final FileStorage files;
    private final DataResetService reset;
    private final JsonMapper json;
    private final Clock clock;

    /** Tables of the scope, children first (deletion order); reversed for insertion. */
    static List<String> deletionOrder() {
        List<String> t = new ArrayList<>(DataResetService.TABLES);
        t.add("app_settings");
        return t;
    }

    record Column(String name, String type, boolean identity) {
    }

    // ------------------------------------------------------------------ export

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public byte[] export() {
        Map<String, List<Column>> schema = schema();
        Map<String, Object> tables = new LinkedHashMap<>();
        for (String table : insertionOrder()) {
            List<Column> cols = schema.get(table);
            String order = cols.stream().anyMatch(c -> c.name().equals("id")) ? "id" : "1";
            tables.put(table, jdbc.query("SELECT * FROM " + table + " ORDER BY " + order, (rs, i) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                for (Column c : cols) row.put(c.name(), exportValue(rs.getObject(c.name())));
                return row;
            }));
        }
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("format", FORMAT);
        doc.put("schemaVersion", schemaVersion());
        doc.put("exportedAt", LocalDateTime.now(clock).toString());
        doc.put("tables", tables);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry(DATA_ENTRY));
            zip.write(json.writeValueAsBytes(doc));
            zip.closeEntry();
            for (String name : referencedFiles()) {
                var path = files.find(name);
                if (path.isEmpty()) continue;
                zip.putNextEntry(new ZipEntry(UPLOADS_PREFIX + name));
                zip.write(Files.readAllBytes(path.get()));
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static Object exportValue(Object v) {
        if (v == null) return null;
        return switch (v) {
            case java.sql.Date d -> d.toLocalDate().toString();
            case java.sql.Time t -> t.toLocalTime().toString();
            case java.sql.Timestamp ts -> ts.toLocalDateTime().toString();
            case BigDecimal b -> b.toPlainString();
            case Number n -> n;
            case Boolean b -> b;
            default -> v.toString();
        };
    }

    // ------------------------------------------------------------------ restore

    /** Replaces all the data of the scope by the archive's, in one transaction (all or nothing). */
    @Transactional
    public Map<String, Long> restore(byte[] archive) {
        // 1. read and validate everything before writing anything
        Map<String, byte[]> entries = unzip(archive);
        byte[] data = entries.get(DATA_ENTRY);
        if (data == null) throw unreadable("data.json absent de l'archive");
        Map<?, ?> doc;
        try {
            doc = json.readValue(data, Map.class);
        } catch (JacksonException e) {
            throw unreadable("JSON invalide");
        }
        if (doc == null || !FORMAT.equals(doc.get("format"))) throw unreadable("format inconnu");
        String current = schemaVersion();
        Object version = doc.get("schemaVersion");
        boolean older = !Objects.equals(current, version) && isOlderChangeset(version);
        if (!Objects.equals(current, version) && !older) {
            throw ApiException.invalid("file", "Cette sauvegarde a été produite par une autre version du schéma (« " + version
                    + " ») que celle de la base (« " + current + " ») : elle ne peut pas être importée.");
        }
        if (!(doc.get("tables") instanceof Map<?, ?> tables)) throw unreadable("tables absentes");

        Map<String, List<Column>> schema = schema();
        for (Object t : tables.keySet()) {
            if (!schema.containsKey(String.valueOf(t))) throw unreadable("table inconnue « " + t + " »");
        }
        if (older) requireSameColumns(tables, schema, version, current);
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        for (String table : insertionOrder()) rows.put(table, convert(table, tables.get(table), schema.get(table)));

        Set<String> newFiles = new LinkedHashSet<>();
        rows.get("members").forEach(r -> addIfPresent(newFiles, r.get("photo")));
        rows.get("app_settings").stream().filter(r -> LOGO_KEY.equals(r.get("setting_key")))
                .forEach(r -> addIfPresent(newFiles, r.get("setting_value")));
        Set<String> oldFiles = referencedFiles();

        // 2. files: written now, removed again if the transaction rolls back; old ones removed after commit
        Map<String, byte[]> written = new LinkedHashMap<>();   // name -> previous content (null = created)
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    oldFiles.stream().filter(f -> !newFiles.contains(f)).forEach(files::delete);
                } else {
                    written.forEach((name, previous) -> {
                        if (previous == null) files.delete(name);
                        else files.rewrite(name, previous);
                    });
                }
            }
        });
        for (String name : newFiles) {
            byte[] content = entries.get(UPLOADS_PREFIX + name);
            if (content != null && FileStorage.isValidName(name)) written.put(name, files.restore(name, content));
        }

        // 3. database: delete children → parents, insert parents → children, then realign the identities
        try {
            for (String table : deletionOrder()) jdbc.update("DELETE FROM " + table);
            for (var e : rows.entrySet()) {
                for (Map<String, Object> row : e.getValue()) insert(e.getKey(), row, schema.get(e.getKey()));
            }
            for (String table : insertionOrder()) {
                for (Column c : schema.get(table)) {
                    if (!c.identity()) continue;
                    jdbc.queryForObject("SELECT setval(pg_get_serial_sequence(?, ?), COALESCE((SELECT MAX(" + c.name() + ") FROM "
                            + table + "), 0) + 1, false)", Long.class, table, c.name());
                }
            }
        } catch (DataAccessException e) {
            log.warn("Backup restore rejected: {}", e.getMostSpecificCause().getMessage());
            throw unreadable("données incohérentes");
        }
        return reset.summary();
    }

    private List<Map<String, Object>> convert(String table, Object raw, List<Column> cols) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw unreadable("table « " + table + " » mal formée");
        Map<String, Column> byName = new HashMap<>();
        cols.forEach(c -> byName.put(c.name(), c));
        List<Map<String, Object>> out = new ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) throw unreadable("ligne mal formée dans « " + table + " »");
            Map<String, Object> row = new LinkedHashMap<>();
            for (var e : m.entrySet()) {
                Column c = byName.get(String.valueOf(e.getKey()));
                if (c == null) throw unreadable("colonne inconnue « " + table + "." + e.getKey() + " »");
                try {
                    row.put(c.name(), importValue(e.getValue(), c.type()));
                } catch (IllegalArgumentException | DateTimeParseException | ArithmeticException ex) {
                    throw unreadable("valeur invalide pour « " + table + "." + c.name() + " »");
                }
            }
            if (row.isEmpty()) throw unreadable("ligne mal formée dans « " + table + " »");
            out.add(row);
        }
        return out;
    }

    /** Converts a JSON value to the Java type of the column; throws IllegalArgumentException if it does not fit. */
    private static Object importValue(Object v, String type) {
        if (v == null) return null;
        return switch (type) {
            case "bigint" -> integral(v).longValueExact();
            case "integer", "smallint" -> integral(v).intValueExact();
            case "numeric", "real", "double precision" -> {
                if (!(v instanceof Number) && !(v instanceof String)) throw new IllegalArgumentException();
                yield new BigDecimal(v.toString());
            }
            case "boolean" -> {
                if (v instanceof Boolean b) yield b;
                if ("true".equals(v) || "false".equals(v)) yield Boolean.valueOf((String) v);
                throw new IllegalArgumentException();
            }
            case "date" -> LocalDate.parse(text(v));
            case "time without time zone" -> LocalTime.parse(text(v));
            case "timestamp without time zone" -> LocalDateTime.parse(text(v));
            default -> text(v);
        };
    }

    private static BigInteger integral(Object v) {
        if (v instanceof Integer || v instanceof Long || v instanceof Short) return BigInteger.valueOf(((Number) v).longValue());
        if (v instanceof BigInteger b) return b;
        if (v instanceof String s) return new BigInteger(s);
        throw new IllegalArgumentException();
    }

    private static String text(Object v) {
        if (v instanceof String s) return s;
        throw new IllegalArgumentException();
    }

    private void insert(String table, Map<String, Object> row, List<Column> cols) {
        List<String> names = new ArrayList<>();
        List<String> marks = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (Column c : cols) {   // column names come from the schema, never from the file
            if (!row.containsKey(c.name())) continue;
            names.add(c.name());
            marks.add(isNativeType(c.type()) ? "?" : "CAST(? AS " + c.type() + ")");
            args.add(row.get(c.name()));
        }
        jdbc.update("INSERT INTO " + table + " (" + String.join(", ", names) + ") VALUES (" + String.join(", ", marks) + ")", args.toArray());
    }

    private static boolean isNativeType(String type) {
        return switch (type) {
            case "bigint", "integer", "smallint", "numeric", "real", "double precision", "boolean", "date",
                 "time without time zone", "timestamp without time zone", "character varying", "text", "character" -> true;
            default -> false;
        };
    }

    // ------------------------------------------------------------------ helpers

    private static List<String> insertionOrder() {
        List<String> t = new ArrayList<>(deletionOrder());
        Collections.reverse(t);
        return t;
    }

    private Map<String, List<Column>> schema() {
        List<String> scope = deletionOrder();
        Map<String, List<Column>> schema = new LinkedHashMap<>();
        String in = String.join(", ", Collections.nCopies(scope.size(), "?"));
        jdbc.query("SELECT table_name, column_name, data_type, is_identity FROM information_schema.columns "
                        + "WHERE table_schema = current_schema() AND table_name IN (" + in + ") ORDER BY table_name, ordinal_position",
                (java.sql.ResultSet rs) -> {
                    schema.computeIfAbsent(rs.getString(1), k -> new ArrayList<>())
                            .add(new Column(rs.getString(2), rs.getString(3), "YES".equals(rs.getString(4))));
                }, scope.toArray());
        for (String t : scope) {
            if (!schema.containsKey(t)) throw new IllegalStateException("Table missing from the schema: " + t);
        }
        return schema;
    }

    /** Last Liquibase changeset applied: two backups are compatible only if they share it. */
    String schemaVersion() {
        return jdbc.queryForObject("SELECT id FROM databasechangelog ORDER BY orderexecuted DESC LIMIT 1", String.class);
    }

    /** True if the version is a changeset already applied to this database before its latest one. */
    private boolean isOlderChangeset(Object version) {
        if (!(version instanceof String id)) return false;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM databasechangelog WHERE id = ? AND orderexecuted < "
                + "(SELECT MAX(orderexecuted) FROM databasechangelog)", Integer.class, id);
        return count != null && count > 0;
    }

    /**
     * An older backup is accepted only if the later migrations left the backed-up tables unchanged:
     * every exported row must carry exactly the current columns, otherwise data would be lost or defaulted silently.
     */
    private static void requireSameColumns(Map<?, ?> tables, Map<String, List<Column>> schema, Object version, String current) {
        for (var e : tables.entrySet()) {
            if (!(e.getValue() instanceof List<?> rows)) continue;
            Set<String> expected = new HashSet<>();
            schema.get(String.valueOf(e.getKey())).forEach(c -> expected.add(c.name()));
            for (Object row : rows) {
                if (row instanceof Map<?, ?> m && !expected.equals(m.keySet())) {
                    throw ApiException.invalid("file", "Cette sauvegarde a été produite par une version plus ancienne du schéma (« "
                            + version + " ») et la table « " + e.getKey() + " » a changé depuis (« " + current
                            + " ») : elle ne peut pas être importée.");
                }
            }
        }
    }

    /** Files of the uploads folder referenced by the current data: member photos and club logo. */
    private Set<String> referencedFiles() {
        Set<String> names = new LinkedHashSet<>(jdbc.queryForList("SELECT photo FROM members WHERE photo IS NOT NULL ORDER BY id", String.class));
        names.addAll(jdbc.queryForList("SELECT setting_value FROM app_settings WHERE setting_key = ?", String.class, LOGO_KEY));
        names.removeIf(String::isBlank);
        return names;
    }

    private static void addIfPresent(Set<String> names, Object name) {
        if (name instanceof String s && !s.isBlank()) names.add(s);
    }

    private static Map<String, byte[]> unzip(byte[] archive) {
        Map<String, byte[]> entries = new HashMap<>();
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                if (e.isDirectory()) continue;
                String name = e.getName();
                if (name.startsWith(UPLOADS_PREFIX) && !FileStorage.isValidName(name.substring(UPLOADS_PREFIX.length()))) {
                    throw unreadable("nom de fichier non accepté « " + name + " »");
                }
                byte[] content = readLimited(zip, MAX_UNCOMPRESSED - total);
                total += content.length;
                entries.put(name, content);
            }
        } catch (IOException | IllegalArgumentException e) {
            throw unreadable("archive zip invalide");
        }
        return entries;
    }

    private static byte[] readLimited(InputStream in, long limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[64 * 1024];
        int n;
        long read = 0;
        while ((n = in.read(buf)) > 0) {
            read += n;
            if (read > limit) throw unreadable("archive trop volumineuse une fois décompressée");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private static ApiException unreadable(String detail) {
        return ApiException.invalid("file", UNREADABLE + " : " + detail + ".");
    }
}
