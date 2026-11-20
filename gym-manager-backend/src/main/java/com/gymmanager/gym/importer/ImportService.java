package com.gymmanager.gym.importer;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.*;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.service.*;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.*;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Initialises the club from an Excel workbook (format of the club's former "Gym_Manager.xlsx").
 *
 * <p>Sheets used (found by name, columns found by title):
 * <ul>
 *   <li><b>Sports</b>: ID, nom, coach(s), horaires, capacité, prix mensuel — coaches become staff members;</li>
 *   <li><b>Adhérents</b>: ID, nom, prénom, téléphone, date de naissance, sport(s), date d'inscription,
 *       date de fin, prix mensuel (e-mail, statut, dernier paiement and photo are ignored);</li>
 *   <li><b>Factures</b> (optional): n°, ID adhérent, date, mois concerné, montant, statut;</li>
 *   <li><b>Personnel</b> (optional): nom, prénom, téléphone, fonction, salaire.</li>
 * </ul>
 * Computed sheets (Accueil, Fiche, Alertes, Statistiques, Guide) are ignored.
 *
 * <p>{@link #analyze} never writes; {@link #execute} deletes all the current data then creates
 * everything in one transaction (all or nothing).
 */
@Service
@RequiredArgsConstructor
public class ImportService {
    private final DataResetService reset;
    private final ReferenceService refs;
    private final StaffService staffService;
    private final SportService sportService;
    private final PackService packService;
    private final MemberService memberService;
    private final PaymentService paymentService;
    private final SubscriptionRepository subscriptions;
    private final DiscountRepository discountRepo;
    private final SettingsService settings;
    private final CodeService codes;

    // ------------------------------------------------------------------ report

    public record Issue(String sheet, Integer row, String message) {
    }

    public record SheetInfo(String name, String role, int rows) {
    }

    public record SportPreview(String code, String name, List<String> coaches, String scheduleRaw, String schedule,
                               Integer capacity, BigDecimal monthlyPrice) {
    }

    public record MemberPreview(String code, String name, String phone, List<String> sports, String pack,
                                LocalDate start, LocalDate end, BigDecimal price, int historyPeriods,
                                BigDecimal paid, BigDecimal balance) {
    }

    public record Counts(int functions, int durations, int discounts, int staff, int sports, int packs, int members,
                         int periods, int historyPeriods, int payments, BigDecimal paidAmount, int unpaidInvoices,
                         BigDecimal outstanding) {
    }

    public record Report(boolean executed, String fileName, List<SheetInfo> sheets, Counts counts,
                         List<SportPreview> sports, List<String> staff, List<MemberPreview> members,
                         List<Issue> warnings, List<Issue> errors, Map<String, Long> existing) {
    }

    public record Options(PaymentMethod paymentMethod, Insurance insurance) {
        Options normalized() {
            return new Options(paymentMethod == null ? PaymentMethod.ESPECES : paymentMethod, insurance == null ? Insurance.IMPAYE : insurance);
        }
    }

    // ------------------------------------------------------------------ plan

    record SportPlan(int row, String code, String name, List<String> coaches, String scheduleRaw, List<Rules.Slot> slots,
                     int capacity, BigDecimal price) {
    }

    record StaffPlan(String lastName, String firstName, String phone, String function, PayMode mode, BigDecimal fixed) {
        String key() {
            return Rules.normalize(lastName + " " + firstName);
        }
    }

    /** A monthly period built from an invoice: before the current subscription (history) or after it (renewal). */
    record HistoryPeriod(YearMonth month, LocalDate start, String sport, BigDecimal amount, boolean paid, LocalDate paidOn, String invoice) {
    }

    record CurrentPayment(BigDecimal amount, LocalDate paidOn, String invoice) {
    }

    static final class MemberPlan {
        int row;
        String code, last, first, phone;
        LocalDate birth, start, end;
        List<String> sports = new ArrayList<>();
        int months;
        BigDecimal monthly;
        BigDecimal price;
        List<HistoryPeriod> history = new ArrayList<>();
        List<HistoryPeriod> renewals = new ArrayList<>();
        List<CurrentPayment> payments = new ArrayList<>();

        LocalDate currentEnd() {
            return Rules.subscriptionEnd(start, months);
        }

        LocalDate lastEnd() {
            return renewals.isEmpty() ? currentEnd() : Rules.subscriptionEnd(renewals.getLast().start(), 1);
        }

        List<HistoryPeriod> extraPeriods() {
            List<HistoryPeriod> all = new ArrayList<>(history);
            all.addAll(renewals);
            return all;
        }

        BigDecimal paidCurrent() {
            return payments.stream().map(CurrentPayment::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    record PackKey(String sport, int months, BigDecimal monthly) {
    }

    static final class Plan {
        String fileName;
        List<SheetInfo> sheets = new ArrayList<>();
        List<SportPlan> sports = new ArrayList<>();
        List<StaffPlan> staff = new ArrayList<>();
        Map<String, String> coachKeyBySportAndName = new HashMap<>();
        TreeSet<Integer> durations = new TreeSet<>(List.of(1, 3, 12));
        LinkedHashSet<PackKey> packs = new LinkedHashSet<>();
        List<MemberPlan> members = new ArrayList<>();
        List<Issue> warnings = new ArrayList<>();
        List<Issue> errors = new ArrayList<>();
        int unpaidInvoices;

        void warn(String sheet, Integer row, String m) {
            warnings.add(new Issue(sheet, row, m));
        }

        void error(String sheet, Integer row, String m) {
            errors.add(new Issue(sheet, row, m));
        }
    }

    static final Map<Integer, String> DURATION_LABELS = Map.of(1, "Mensuel", 2, "Bimestriel", 3, "Trimestriel", 6, "Semestriel", 12, "Annuel");

    static String durationLabel(int months) {
        return DURATION_LABELS.getOrDefault(months, months + " mois");
    }

    static String packName(String sport, int months, BigDecimal monthly, BigDecimal sportPrice) {
        String base = sport + " - " + durationLabel(months);
        return monthly.compareTo(sportPrice) == 0 ? base : base + " (" + monthly.stripTrailingZeros().toPlainString() + "/mois)";
    }

    // ------------------------------------------------------------------ API

    public Report analyze(byte[] file, String fileName, Options options, Map<String, Long> existing) {
        Plan plan = parse(file, fileName, options.normalized());
        return report(plan, false, existing);
    }

    @Transactional
    public Report execute(byte[] file, String fileName, Options options, String username) {
        Options o = options.normalized();
        Plan plan = parse(file, fileName, o);
        if (plan.members.isEmpty() && plan.sports.isEmpty()) {
            throw ApiException.badRequest("Rien à importer : aucun sport ni adhérent valide dans ce fichier.");
        }
        Map<String, Long> before = reset.wipe();
        create(plan, o, username);
        return report(plan, true, before);
    }

    // ------------------------------------------------------------------ parsing

    private static final String[] SPORT_HEADERS = {"id sport", "nom du sport", "coach", "coachs", "horaires", "capacite", "prix mensuel"};
    private static final String[] MEMBER_HEADERS = {"id", "nom", "prenom", "telephone", "date naissance", "sport inscrit", "sports", "date inscription", "date fin abonnement", "prix mensuel"};
    private static final String[] INVOICE_HEADERS = {"n facture", "n° facture", "numero facture", "id adherent", "date facture", "mois concerne", "montant", "statut"};
    private static final String[] STAFF_HEADERS = {"id", "nom", "prenom", "telephone", "fonction", "role", "salaire", "salaire mensuel", "salaire fixe"};

    Plan parse(byte[] file, String fileName, Options o) {
        Plan plan = new Plan();
        plan.fileName = fileName;
        Workbook wb;
        try {
            wb = WorkbookFactory.create(new ByteArrayInputStream(file));
        } catch (Exception e) {
            throw ApiException.invalid("file", "Fichier illisible : choisissez un classeur Excel .xlsx (ou .xls).");
        }
        try (wb) {
            var ev = wb.getCreationHelper().createFormulaEvaluator();
            ClubConfig cfg = settings.config();
            Set<String> used = new HashSet<>();

            Optional<ExcelSheet> sportSheet = ExcelSheet.find(wb, "sports", "sport").flatMap(s -> ExcelSheet.open(s, ev, 3, SPORT_HEADERS));
            Optional<ExcelSheet> memberSheet = ExcelSheet.find(wb, "adherents", "adherent", "membres").flatMap(s -> ExcelSheet.open(s, ev, 4, MEMBER_HEADERS));
            Optional<ExcelSheet> invoiceSheet = ExcelSheet.find(wb, "factures", "facture", "paiements").flatMap(s -> ExcelSheet.open(s, ev, 3, INVOICE_HEADERS));
            Optional<ExcelSheet> staffSheet = ExcelSheet.find(wb, "personnel", "personnel coachs", "staff").flatMap(s -> ExcelSheet.open(s, ev, 3, STAFF_HEADERS));

            if (sportSheet.isEmpty()) plan.error(null, null, "Feuille « Sports » introuvable (colonnes attendues : ID Sport, Nom du sport, Coach, Horaires, Capacité, Prix mensuel).");
            if (memberSheet.isEmpty()) plan.error(null, null, "Feuille « Adhérents » introuvable (colonnes attendues : ID, Nom, Prénom, Téléphone, Sport(s), Date inscription…).");

            staffSheet.ifPresent(s -> {
                used.add(s.name);
                parseStaff(s, plan, cfg);
            });
            sportSheet.ifPresent(s -> {
                used.add(s.name);
                parseSports(s, plan);
            });
            memberSheet.ifPresent(s -> {
                used.add(s.name);
                parseMembers(s, plan, cfg);
            });
            invoiceSheet.ifPresent(s -> {
                used.add(s.name);
                parseInvoices(s, plan, cfg);
            });

            for (Sheet s : wb) {
                String role = used.contains(s.getSheetName()) ? roleOf(s.getSheetName(), sportSheet, memberSheet, invoiceSheet, staffSheet) : "Ignorée (calculée par l'application)";
                int rows = 0;
                if (sportSheet.filter(x -> x.name.equals(s.getSheetName())).isPresent()) rows = plan.sports.size();
                else if (memberSheet.filter(x -> x.name.equals(s.getSheetName())).isPresent()) rows = plan.members.size();
                else if (invoiceSheet.filter(x -> x.name.equals(s.getSheetName())).isPresent())
                    rows = (int) plan.members.stream().mapToLong(m -> m.history.size() + m.payments.size()).sum();
                else if (staffSheet.filter(x -> x.name.equals(s.getSheetName())).isPresent()) rows = plan.staff.size();
                plan.sheets.add(new SheetInfo(s.getSheetName(), role, rows));
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.invalid("file", "Lecture du fichier impossible : " + e.getMessage());
        }
        // packs: every sport × base durations + the combinations used by the members
        for (SportPlan s : plan.sports) {
            for (int m : List.of(1, 3, 12)) plan.packs.add(new PackKey(s.name(), m, s.price()));
        }
        for (MemberPlan m : plan.members) {
            plan.packs.add(new PackKey(m.sports.getFirst(), m.months, m.monthly));
            plan.durations.add(m.months);
        }
        return plan;
    }

    private static String roleOf(String name, Optional<ExcelSheet> sp, Optional<ExcelSheet> me, Optional<ExcelSheet> in, Optional<ExcelSheet> st) {
        if (sp.filter(x -> x.name.equals(name)).isPresent()) return "Sports et coachs";
        if (me.filter(x -> x.name.equals(name)).isPresent()) return "Adhérents et abonnements";
        if (in.filter(x -> x.name.equals(name)).isPresent()) return "Factures → paiements";
        if (st.filter(x -> x.name.equals(name)).isPresent()) return "Personnel";
        return "Ignorée";
    }

    private static final Pattern CODE = Pattern.compile("^[A-Za-z]{1,5}(\\d{1,8})$");

    static Long codeNumber(String code) {
        Matcher m = CODE.matcher(code == null ? "" : code.trim());
        return m.matches() ? Long.parseLong(m.group(1)) : null;
    }

    private void parseStaff(ExcelSheet s, Plan plan, ClubConfig cfg) {
        int cLast = s.col("nom"), cFirst = s.col("prenom"), cPhone = s.col("telephone", "tel"),
                cFn = s.col("fonction", "role", "poste"), cSal = s.col("salaire mensuel", "salaire fixe", "salaire");
        for (int r = s.headerRow + 1; r <= s.lastRow(); r++) {
            if (s.blank(r, cLast, cFirst)) continue;
            String last = s.text(r, cLast), first = s.text(r, cFirst);
            if (last.isEmpty()) {
                plan.error(s.name, r + 1, "Nom manquant : ligne ignorée.");
                continue;
            }
            String phone = s.phone(r, cPhone);
            if (!phone.isEmpty() && !phone.matches(cfg.phoneRegex())) {
                plan.warn(s.name, r + 1, "Téléphone « " + phone + " » invalide : non repris.");
                phone = "";
            }
            String fn = s.text(r, cFn).isEmpty() ? "Coach" : capitalize(s.text(r, cFn));
            BigDecimal sal = s.number(r, cSal);
            boolean coach = Rules.normalize(fn).startsWith("coach");
            PayMode mode = sal != null && sal.signum() > 0 && !coach ? PayMode.FIXED : (coach ? PayMode.COMMISSION : PayMode.FIXED);
            if (mode == PayMode.FIXED && (sal == null || sal.signum() <= 0)) {
                plan.warn(s.name, r + 1, "Salaire manquant pour « " + last + " » : 0 DH (à compléter).");
                sal = BigDecimal.ZERO;
            }
            StaffPlan sp = new StaffPlan(last, first, phone, fn, mode, mode == PayMode.FIXED ? sal : null);
            if (plan.staff.stream().noneMatch(x -> x.key().equals(sp.key()))) plan.staff.add(sp);
        }
    }

    private void parseSports(ExcelSheet s, Plan plan) {
        int cId = s.col("id sport", "id", "code"), cName = s.col("nom du sport", "sport", "nom"),
                cCoach = s.col("coach", "coachs", "coach s", "entraineur"), cSched = s.col("horaires", "horaire", "creneaux"),
                cCap = s.col("capacite"), cPrice = s.col("prix mensuel", "prix");
        Set<String> names = new HashSet<>();
        for (int r = s.headerRow + 1; r <= s.lastRow(); r++) {
            if (s.blank(r, cId, cName)) continue;
            String name = s.text(r, cName);
            if (name.isEmpty()) {
                plan.error(s.name, r + 1, "Nom du sport manquant : ligne ignorée.");
                continue;
            }
            if (!names.add(Rules.normalize(name))) {
                plan.error(s.name, r + 1, "Sport « " + name + " » en double : ligne ignorée.");
                continue;
            }
            BigDecimal price = s.number(r, cPrice);
            if (price == null) {
                plan.warn(s.name, r + 1, "Prix mensuel manquant pour « " + name + " » : 0 DH (à compléter).");
                price = BigDecimal.ZERO;
            }
            BigDecimal cap = s.number(r, cCap);
            int capacity = cap == null ? 0 : cap.intValue();
            if (cap == null) plan.warn(s.name, r + 1, "Capacité manquante pour « " + name + " » : 0.");
            String raw = s.text(r, cSched);
            List<Rules.Slot> slots = parseSchedule(raw);
            if (!raw.isEmpty() && slots.isEmpty()) plan.warn(s.name, r + 1, "Horaires « " + raw + " » non reconnus : créneaux à saisir dans la page Sports.");
            List<String> coaches = new ArrayList<>();
            for (String c : s.text(r, cCoach).split("\\s*(?:,|/|&|;|\\+|\\bet\\b)\\s*")) {
                String n = c.replaceFirst("(?i)^\\s*coach\\s+", "").trim();
                if (!n.isEmpty()) coaches.add(capitalize(n));
            }
            for (String c : coaches) {
                String key = Rules.normalize(c);
                if (plan.staff.stream().noneMatch(x -> x.key().equals(key) || Rules.normalize(x.lastName()).equals(key))) {
                    plan.staff.add(new StaffPlan(c, "", "", "Coach", PayMode.COMMISSION, null));
                }
            }
            plan.sports.add(new SportPlan(r + 1, s.text(r, cId), name, coaches, raw, slots, capacity, price));
        }
    }

    private SportPlan sportByName(Plan plan, String raw) {
        String n = Rules.normalize(raw);
        return plan.sports.stream().filter(s -> Rules.normalize(s.name()).equals(n)).findFirst().orElse(null);
    }

    private void parseMembers(ExcelSheet s, Plan plan, ClubConfig cfg) {
        int cId = s.col("id", "code"), cLast = s.col("nom"), cFirst = s.col("prenom"), cPhone = s.col("telephone", "tel"),
                cBirth = s.col("date naissance", "date de naissance", "naissance"),
                cSports = s.col("sport inscrit", "sports inscrits", "sport s inscrit", "sports", "sport"),
                cStart = s.col("date inscription", "date d'inscription", "inscription", "debut abonnement"),
                cEnd = s.col("date fin abonnement", "date fin", "fin abonnement", "date de fin"),
                cMonthly = s.col("prix mensuel", "prix");
        Set<String> seen = new HashSet<>();
        Set<String> codesSeen = new HashSet<>();
        LocalDate today = cfg.today();
        for (int r = s.headerRow + 1; r <= s.lastRow(); r++) {
            if (s.blank(r, cId, cLast, cFirst)) continue;
            int line = r + 1;
            MemberPlan m = new MemberPlan();
            m.row = line;
            m.code = s.text(r, cId);
            m.last = s.text(r, cLast);
            m.first = s.text(r, cFirst);
            m.phone = s.phone(r, cPhone);
            String who = (m.code.isEmpty() ? "" : m.code + " ") + m.first + " " + m.last;
            if (m.last.isEmpty() || m.first.isEmpty()) {
                plan.error(s.name, line, who.trim() + " : nom ou prénom manquant, ligne ignorée.");
                continue;
            }
            if (!m.phone.matches(cfg.phoneRegex())) {
                plan.error(s.name, line, who + " : téléphone « " + m.phone + " » invalide (format " + cfg.phoneRegex() + "), ligne ignorée.");
                continue;
            }
            String key = Rules.normalize(m.last) + "|" + Rules.normalize(m.first) + "|" + m.phone;
            if (!seen.add(key)) {
                plan.error(s.name, line, who + " : adhérent en double (même nom, prénom et téléphone), ligne ignorée.");
                continue;
            }
            m.start = s.date(r, cStart);
            if (m.start == null) {
                plan.error(s.name, line, who + " : date d'inscription manquante ou invalide, ligne ignorée.");
                continue;
            }
            m.birth = s.date(r, cBirth);
            if (m.birth != null && m.birth.isAfter(today)) {
                plan.warn(s.name, line, who + " : date de naissance dans le futur, non reprise.");
                m.birth = null;
            }
            // sports: the whole cell first ("Cardio / Fitness" contains a slash), then a list
            String rawSports = s.text(r, cSports);
            SportPlan whole = sportByName(plan, rawSports);
            if (whole != null) m.sports.add(whole.name());
            else {
                for (String part : rawSports.split("\\s*(?:,|;|\\+|\\bet\\b)\\s*")) {
                    if (part.isBlank()) continue;
                    SportPlan sp = sportByName(plan, part);
                    if (sp != null && !m.sports.contains(sp.name())) m.sports.add(sp.name());
                    else if (sp == null) plan.warn(s.name, line, who + " : sport « " + part + " » inconnu (absent de la feuille Sports), ignoré.");
                }
            }
            if (m.sports.isEmpty()) {
                plan.error(s.name, line, who + " : aucun sport reconnu (« " + rawSports + " »), ligne ignorée.");
                continue;
            }
            SportPlan main = sportByName(plan, m.sports.getFirst());
            m.end = s.date(r, cEnd);
            if (m.end == null || !m.end.isAfter(m.start)) {
                plan.warn(s.name, line, who + " : date de fin absente ou incohérente → abonnement mensuel.");
                m.months = 1;
            } else {
                m.months = (int) Math.max(1, Math.round(ChronoUnit.DAYS.between(m.start, m.end) / 30.4375));
            }
            BigDecimal monthly = s.number(r, cMonthly);
            m.monthly = monthly == null || monthly.signum() <= 0 ? main.price() : monthly;
            if (monthly != null && monthly.compareTo(main.price()) != 0) {
                plan.warn(s.name, line, who + " : prix mensuel " + fmt(monthly) + " différent du tarif du sport (" + fmt(main.price()) + ") → pack dédié.");
            }
            m.price = Rules.memberPrice(m.monthly, m.months, BigDecimal.ZERO, BigDecimal.ZERO, cfg.cumulative(), cfg.rounding());
            Long n = codeNumber(m.code);
            if (n == null || !codesSeen.add(m.code.toUpperCase())) {
                if (!m.code.isEmpty()) plan.warn(s.name, line, who + " : code « " + m.code + " » " + (n == null ? "non standard" : "en double") + " → nouveau code attribué.");
                m.code = null;
            }
            plan.members.add(m);
        }
        plan.members.sort(Comparator.comparing((MemberPlan x) -> x.code == null ? Long.MAX_VALUE : codeNumber(x.code)).thenComparingInt(x -> x.row));
    }

    private static final Map<String, Integer> MONTHS = new HashMap<>();

    static {
        String[] names = {"janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"};
        for (int i = 0; i < 12; i++) MONTHS.put(names[i], i + 1);
        MONTHS.put("janv", 1);
        MONTHS.put("fevr", 2);
        MONTHS.put("fev", 2);
        MONTHS.put("avr", 4);
        MONTHS.put("juil", 7);
        MONTHS.put("sept", 9);
        MONTHS.put("oct", 10);
        MONTHS.put("nov", 11);
        MONTHS.put("dec", 12);
    }

    static YearMonth parseMonth(String raw) {
        String t = Rules.normalize(raw).replace(".", " ").replaceAll("\\s+", " ").trim();
        Matcher m = Pattern.compile("^([a-z]+) (\\d{4})$").matcher(t);
        if (m.matches() && MONTHS.containsKey(m.group(1))) return YearMonth.of(Integer.parseInt(m.group(2)), MONTHS.get(m.group(1)));
        m = Pattern.compile("^(\\d{1,2})[/-](\\d{4})$").matcher(t);
        if (m.matches()) return YearMonth.of(Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
        m = Pattern.compile("^(\\d{4})-(\\d{1,2})$").matcher(t);
        if (m.matches()) return YearMonth.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
        return null;
    }

    /**
     * Invoices → payments. For each member, invoices of months before the start of their current subscription
     * become past monthly periods (paid or unpaid = arrears); paid invoices from the start month onwards are
     * payments of the current period, up to its price.
     */
    private void parseInvoices(ExcelSheet s, Plan plan, ClubConfig cfg) {
        int cNum = s.col("n facture", "n° facture", "numero facture", "facture", "n"), cMember = s.col("id adherent", "code adherent", "adherent id", "id"),
                cDate = s.col("date facture", "date paiement", "date"), cMonth = s.col("mois concerne", "mois"), cSport = s.col("sport"),
                cAmount = s.col("montant", "montant paye"), cStatus = s.col("statut");
        Map<String, MemberPlan> byCode = new HashMap<>();
        plan.members.stream().filter(m -> m.code != null).forEach(m -> byCode.put(m.code.toUpperCase(), m));
        record Inv(int line, String num, MemberPlan m, YearMonth month, LocalDate date, String sport, BigDecimal amount, boolean paid) {
        }
        List<Inv> invoices = new ArrayList<>();
        LocalDate today = cfg.today();
        for (int r = s.headerRow + 1; r <= s.lastRow(); r++) {
            if (s.blank(r, cNum, cMember, cAmount)) continue;
            int line = r + 1;
            String num = s.text(r, cNum);
            String code = s.text(r, cMember).toUpperCase();
            MemberPlan m = byCode.get(code);
            if (m == null) {
                plan.warn(s.name, line, "Facture " + num + " : adhérent « " + code + " » introuvable ou ignoré, facture non reprise.");
                continue;
            }
            BigDecimal amount = s.number(r, cAmount);
            if (amount == null || amount.signum() <= 0) {
                plan.warn(s.name, line, "Facture " + num + " : montant manquant, non reprise.");
                continue;
            }
            LocalDate date = s.date(r, cDate);
            YearMonth month = parseMonth(s.text(r, cMonth));
            if (month == null && date != null) month = YearMonth.from(date);
            if (month == null) {
                plan.warn(s.name, line, "Facture " + num + " : mois concerné non reconnu, non reprise.");
                continue;
            }
            if (date == null) date = month.atDay(1);
            if (date.isAfter(today)) {
                plan.warn(s.name, line, "Facture " + num + " : datée dans le futur (" + date + "), non reprise.");
                continue;
            }
            String status = Rules.normalize(s.text(r, cStatus));
            boolean paid = status.startsWith("paye") || status.equals("reglee") || status.equals("regle");
            if (!paid) plan.unpaidInvoices++;
            SportPlan sp = sportByName(plan, s.text(r, cSport));
            invoices.add(new Inv(line, num, m, month, date, sp != null && m.sports.contains(sp.name()) ? sp.name() : m.sports.getFirst(), amount, paid));
        }
        invoices.sort(Comparator.comparing(Inv::month).thenComparing(Inv::line));
        for (Inv inv : invoices) {
            MemberPlan m = inv.m();
            String ref = inv.num().isEmpty() ? "Facture" : "Facture " + inv.num();
            String note = ref + " — " + monthLabel(inv.month());
            SportPlan sp = sportByName(plan, inv.sport());
            if (inv.month().isBefore(YearMonth.from(m.start))) {
                // month before the current subscription → past monthly period (paid, or unpaid = arrears)
                if (m.history.stream().anyMatch(h -> h.month().equals(inv.month()))) {
                    plan.warn(s.name, inv.line(), ref + " : deuxième facture pour " + monthLabel(inv.month()) + " (" + m.code + "), non reprise.");
                    continue;
                }
                m.history.add(new HistoryPeriod(inv.month(), inv.month().atDay(1), inv.sport(), inv.amount(), inv.paid(), inv.date(), note));
                plan.packs.add(new PackKey(inv.sport(), 1, sp.price()));
                continue;
            }
            if (!inv.paid()) {
                if (!inv.month().isBefore(YearMonth.from(m.currentEnd()))) {
                    plan.warn(s.name, inv.line(), ref + " (" + m.code + ") : facture impayée après la fin de l'abonnement, non reprise (aucune période créée).");
                }
                continue; // an unpaid month inside the current subscription simply leaves its balance
            }
            BigDecimal left = m.price.subtract(m.paidCurrent());
            if (left.signum() > 0) {
                // paid invoice → payment of the current subscription (oldest debt first)
                BigDecimal amount = inv.amount().min(left);
                m.payments.add(new CurrentPayment(amount, inv.date(), note));
                if (amount.compareTo(inv.amount()) < 0) {
                    BigDecimal rest = inv.amount().subtract(amount);
                    LocalDate start = m.lastEnd();
                    m.renewals.add(new HistoryPeriod(YearMonth.from(start), start, inv.sport(), rest, true, inv.date(), note + " (complément)"));
                    plan.packs.add(new PackKey(inv.sport(), 1, sp.price()));
                }
            } else if (!inv.month().isBefore(YearMonth.from(m.currentEnd()))) {
                // current subscription already paid and over → monthly renewal right after it
                LocalDate start = m.lastEnd();
                m.renewals.add(new HistoryPeriod(YearMonth.from(start), start, inv.sport(), inv.amount(), true, inv.date(), note));
                plan.packs.add(new PackKey(inv.sport(), 1, sp.price()));
            } else {
                plan.warn(s.name, inv.line(), ref + " (" + m.code + ", " + fmt(inv.amount()) + ") : l'abonnement en cours (" + fmt(m.price)
                        + ") est déjà réglé, paiement excédentaire non repris.");
            }
        }
    }

    // ------------------------------------------------------------------ creation

    private void create(Plan plan, Options o, String username) {
        ClubConfig cfg = settings.config();
        Base base = base(plan.durations, plan.staff.stream().map(StaffPlan::function).toList());
        Map<String, Long> fn = base.functions();
        Map<Integer, Long> dur = base.durations();
        Long none = base.noDiscount();

        // staff
        Map<String, Long> staffId = new HashMap<>();
        for (StaffPlan s : plan.staff) {
            Long id = staffService.save(null, new StaffRequest(s.lastName(), s.firstName(), s.phone(), fn.get(Rules.normalize(s.function())),
                    List.of(), s.mode(), s.fixed())).getId();
            staffId.put(s.key(), id);
            staffId.putIfAbsent(Rules.normalize(s.lastName()), id);
        }

        // sports (codes of the file are kept when possible)
        Map<String, Long> sportId = new HashMap<>();
        Map<String, BigDecimal> sportPrice = new HashMap<>();
        List<SportPlan> sports = new ArrayList<>(plan.sports);
        sports.sort(Comparator.comparing((SportPlan s) -> Optional.ofNullable(codeNumber(s.code())).orElse(Long.MAX_VALUE)));
        for (SportPlan s : sports) {
            Long n = codeNumber(s.code());
            if (n != null) codes.reserveFrom("sport", n);
            List<Long> coachIds = s.coaches().stream().map(c -> staffId.get(Rules.normalize(c))).filter(Objects::nonNull).distinct().toList();
            List<SlotRequest> slots = s.slots().stream().map(x -> new SlotRequest(x.day().getValue(), x.start(), x.end())).toList();
            sportId.put(s.name(), sportService.save(null, new SportRequest(s.name(), color(sportId.size()), s.capacity(), s.price(), coachIds, slots)).getId());
            sportPrice.put(s.name(), s.price());
        }

        // packs
        Map<PackKey, Long> packId = new HashMap<>();
        for (PackKey k : plan.packs) {
            String name = packName(k.sport(), k.months(), k.monthly(), sportPrice.get(k.sport()));
            packId.put(k, packService.save(null, new PackRequest(name, sportId.get(k.sport()), dur.get(k.months()), k.monthly(), none)).getId());
        }

        // members and their periods; payments are created afterwards in date order (chronological receipt numbers)
        record PendingPayment(Long memberId, Long subscriptionId, BigDecimal amount, LocalDate paidOn, String note) {
        }
        List<PendingPayment> pending = new ArrayList<>();
        for (MemberPlan m : plan.members) {
            if (m.code != null) codes.reserveFrom("member", codeNumber(m.code));
            Long pack = packId.get(new PackKey(m.sports.getFirst(), m.months, m.monthly));
            Member saved = memberService.save(null, new MemberRequest(m.last, m.first, m.phone, m.birth, m.start,
                    m.sports.stream().map(sportId::get).toList(), pack, none, o.insurance(), ""), username);
            Subscription current = subscriptions.findByMemberIdOrderByStartDateAscIdAsc(saved.getId()).getLast();
            for (HistoryPeriod h : m.extraPeriods()) {
                Subscription sub = new Subscription();
                sub.setMemberId(saved.getId());
                sub.setPackId(packId.get(new PackKey(h.sport(), 1, sportPrice.get(h.sport()))));
                sub.setDiscountId(none);
                sub.setStartDate(h.start());
                sub.setMonths(1);
                sub.setAmount(h.amount());
                sub.setCreatedAt(cfg.now());
                sub.setCreatedBy(username);
                sub = subscriptions.save(sub);
                if (h.paid()) pending.add(new PendingPayment(saved.getId(), sub.getId(), h.amount(), h.paidOn(), h.invoice()));
            }
            for (CurrentPayment p : m.payments) {
                pending.add(new PendingPayment(saved.getId(), current.getId(), p.amount(), p.paidOn(), p.invoice()));
            }
        }
        pending.sort(Comparator.comparing(PendingPayment::paidOn));
        for (PendingPayment p : pending) {
            paymentService.importPayment(p.memberId(), p.subscriptionId(), p.amount(), o.paymentMethod(), p.paidOn(), p.note(), username);
        }
    }

    public record Base(Map<String, Long> functions, Map<Integer, Long> durations, Long noDiscount) {
    }

    /** Base referentials: functions Coach / Accueil / Entretien, durations, the standard discounts ("Aucune" = system). */
    Base base(Collection<Integer> months, Collection<String> extraFunctions) {
        Map<String, Long> fn = new HashMap<>();
        for (String f : List.of("Coach", "Accueil", "Entretien")) fn.put(Rules.normalize(f), refs.saveFunction(null, new FunctionRequest(f)).getId());
        for (String f : extraFunctions) {
            fn.computeIfAbsent(Rules.normalize(f), k -> refs.saveFunction(null, new FunctionRequest(f)).getId());
        }
        Map<Integer, Long> dur = new HashMap<>();
        for (int m : new TreeSet<>(months)) dur.put(m, refs.saveDuration(null, new DurationRequest(durationLabel(m), m)).getId());
        Long none = null;
        for (Object[] d : new Object[][]{{"Aucune", 0}, {"Remise 5%", 5}, {"Remise 10%", 10}, {"Remise 15%", 15}, {"Remise 20%", 20},
                {"Remise étudiant 25%", 25}, {"Remise famille 30%", 30}}) {
            Discount saved = refs.saveDiscount(null, new DiscountRequest((String) d[0], BigDecimal.valueOf((Integer) d[1])));
            if ("Aucune".equals(d[0])) {
                saved.setSystem(true);
                none = saved.getId();
            }
        }
        discountRepo.flush();
        return new Base(fn, dur, none);
    }

    /** Full reset: deletes all the club data, then recreates the base referentials (an empty but usable club). */
    @Transactional
    public Map<String, Long> wipe() {
        Map<String, Long> before = reset.wipe();
        base(List.of(1, 3, 12), List.of());
        return before;
    }

    /** At startup: recreates the base referentials if they are all missing (e.g. after a manual reset). */
    @Transactional
    public boolean ensureBase() {
        if (discountRepo.count() > 0) return false;
        base(List.of(1, 3, 12), List.of());
        return true;
    }

    private static final String[] PALETTE = {"#E53935", "#8E24AA", "#1E88E5", "#FB8C00", "#43A047", "#00ACC1", "#D81B60", "#3949AB", "#7CB342", "#6D4C41"};

    static String color(int i) {
        return PALETTE[i % PALETTE.length];
    }

    // ------------------------------------------------------------------ schedules

    private static final Map<String, Integer> DAYS = Map.ofEntries(
            Map.entry("lun", 1), Map.entry("lundi", 1), Map.entry("mar", 2), Map.entry("mardi", 2), Map.entry("mer", 3), Map.entry("mercredi", 3),
            Map.entry("jeu", 4), Map.entry("jeudi", 4), Map.entry("ven", 5), Map.entry("vendredi", 5), Map.entry("sam", 6), Map.entry("samedi", 6),
            Map.entry("dim", 7), Map.entry("dimanche", 7));
    private static final Pattern TIME_RANGE = Pattern.compile("(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?\\s*(?:-|–|—|à|a)\\s*(\\d{1,2})\\s*(?:h|:)?\\s*(\\d{2})?");

    /**
     * "Lun-Sam 07h-22h", "Mar-Jeu 09h-10h30", "Tous les jours 07h-20h", "Lun, Mer, Ven 19:00–20:00", "Lun→Sam 08:00–21:00".
     * A hyphen or arrow between two days is a range; commas list days. Several groups may be separated by " · " or ";".
     */
    static List<Rules.Slot> parseSchedule(String raw) {
        List<Rules.Slot> out = new ArrayList<>();
        if (raw == null || raw.isBlank()) return out;
        for (String group : raw.split("\\s*(?:·|;|\\|)\\s*")) {
            String g = Rules.normalize(group);
            Matcher t = TIME_RANGE.matcher(g);
            if (!t.find()) continue;
            LocalTime start, end;
            try {
                start = LocalTime.of(Integer.parseInt(t.group(1)), t.group(2) == null ? 0 : Integer.parseInt(t.group(2)));
                end = LocalTime.of(Integer.parseInt(t.group(3)) % 24, t.group(4) == null ? 0 : Integer.parseInt(t.group(4)));
            } catch (Exception e) {
                continue;
            }
            if (!end.isAfter(start)) continue;
            String dayPart = g.substring(0, t.start()).trim();
            Set<Integer> days = new TreeSet<>();
            if (dayPart.contains("tous les jours") || dayPart.contains("7j") || dayPart.isEmpty()) {
                for (int d = 1; d <= 7; d++) days.add(d);
            } else {
                for (String token : dayPart.split("\\s*,\\s*|\\s+et\\s+")) {
                    String[] range = token.trim().split("\\s*(?:-|–|→|>)\\s*|\\s+(?:a|au)\\s+");
                    Integer a = DAYS.get(range[0].trim()), b = range.length > 1 ? DAYS.get(range[range.length - 1].trim()) : null;
                    if (a == null) continue;
                    if (b == null) days.add(a);
                    else for (int d = a; ; d = d % 7 + 1) {
                        days.add(d);
                        if (d == b) break;
                    }
                }
            }
            for (int d : days) out.add(new Rules.Slot(DayOfWeek.of(d), start, end));
        }
        return out;
    }

    // ------------------------------------------------------------------ report helpers

    private static final String[] MONTH_NAMES = {"janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"};

    static String monthLabel(YearMonth ym) {
        return MONTH_NAMES[ym.getMonthValue() - 1] + " " + ym.getYear();
    }

    static String fmt(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',') + " DH";
    }

    static String capitalize(String s) {
        String t = s.trim();
        return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    private Report report(Plan plan, boolean executed, Map<String, Long> existing) {
        int periods = plan.members.size() + plan.members.stream().mapToInt(m -> m.extraPeriods().size()).sum();
        int history = plan.members.stream().mapToInt(m -> m.extraPeriods().size()).sum();
        int payments = plan.members.stream().mapToInt(m -> m.payments.size() + (int) m.extraPeriods().stream().filter(HistoryPeriod::paid).count()).sum();
        BigDecimal paid = plan.members.stream().map(m -> m.paidCurrent().add(m.extraPeriods().stream().filter(HistoryPeriod::paid)
                .map(HistoryPeriod::amount).reduce(BigDecimal.ZERO, BigDecimal::add))).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outstanding = plan.members.stream().map(m -> m.price.subtract(m.paidCurrent()).max(BigDecimal.ZERO)
                .add(m.extraPeriods().stream().filter(h -> !h.paid()).map(HistoryPeriod::amount).reduce(BigDecimal.ZERO, BigDecimal::add)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Counts counts = new Counts(3 + (int) plan.staff.stream().map(s -> Rules.normalize(s.function())).filter(f -> !Set.of("coach", "accueil", "entretien").contains(f)).distinct().count(),
                plan.durations.size(), 7, plan.staff.size(), plan.sports.size(), plan.packs.size(), plan.members.size(),
                periods, history, payments, paid.setScale(2, RoundingMode.HALF_UP), plan.unpaidInvoices, outstanding.setScale(2, RoundingMode.HALF_UP));
        Map<String, BigDecimal> sportPrice = plan.sports.stream().collect(Collectors.toMap(SportPlan::name, SportPlan::price));
        List<SportPreview> sports = plan.sports.stream().map(s -> new SportPreview(s.code(), s.name(), s.coaches(), s.scheduleRaw(),
                Rules.summarizeSchedules(s.slots()), s.capacity(), s.price())).toList();
        List<String> staff = plan.staff.stream().map(s -> (s.lastName() + " " + s.firstName()).trim() + " · " + s.function()
                + (s.mode() == PayMode.FIXED ? " · fixe " + fmt(s.fixed()) : " · commission")).toList();
        List<MemberPreview> members = plan.members.stream().map(m -> {
            BigDecimal mPaid = m.paidCurrent().add(m.extraPeriods().stream().filter(HistoryPeriod::paid).map(HistoryPeriod::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
            BigDecimal due = m.price.add(m.extraPeriods().stream().map(HistoryPeriod::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
            String pack = packName(m.sports.getFirst(), m.months, m.monthly, sportPrice.get(m.sports.getFirst()))
                    + (m.renewals.isEmpty() ? "" : " + " + m.renewals.size() + " renouvellement(s) mensuel(s)");
            return new MemberPreview(m.code == null ? "(nouveau)" : m.code.toUpperCase(), m.first + " " + m.last, m.phone, m.sports, pack,
                    m.start, m.lastEnd(), m.price, m.extraPeriods().size(),
                    mPaid.setScale(2, RoundingMode.HALF_UP), due.subtract(mPaid).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
        }).toList();
        return new Report(executed, plan.fileName, plan.sheets, counts, sports, staff, members, plan.warnings, plan.errors, existing);
    }
}
