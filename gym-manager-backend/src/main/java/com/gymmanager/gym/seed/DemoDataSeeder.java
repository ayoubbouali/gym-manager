package com.gymmanager.gym.seed;

import com.gymmanager.gym.common.CodeService;
import com.gymmanager.gym.domain.*;
import com.gymmanager.gym.repository.*;
import com.gymmanager.gym.service.*;
import com.gymmanager.gym.web.dto.Requests.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Loads the demonstration data of the specification (section 11) into an empty database.
 * Everything goes through the services, so codes and validations are the real ones.
 */
@Component
public class DemoDataSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);
    private static final DateTimeFormatter FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter FR_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final boolean enabled;
    private final TransactionTemplate tx;
    private final AppUserRepository users;
    private final StaffFunctionRepository functionRepo;
    private final DurationRepository durationRepo;
    private final DiscountRepository discountRepo;
    private final ReferenceService refs;
    private final StaffService staff;
    private final SportService sports;
    private final PackService packs;
    private final MemberService members;
    private final ActivityService activities;
    private final PasswordEncoder encoder;
    private final CodeService codes;
    private final PaymentService payments;
    private final PayrollService payroll;

    public DemoDataSeeder(@Value("${app.seed.enabled:true}") boolean enabled, TransactionTemplate tx, AppUserRepository users,
                          StaffFunctionRepository functionRepo, DurationRepository durationRepo, DiscountRepository discountRepo,
                          ReferenceService refs, StaffService staff, SportService sports, PackService packs,
                          MemberService members, ActivityService activities, PasswordEncoder encoder, CodeService codes,
                          PaymentService payments, PayrollService payroll) {
        this.enabled = enabled;
        this.tx = tx;
        this.users = users;
        this.functionRepo = functionRepo;
        this.durationRepo = durationRepo;
        this.discountRepo = discountRepo;
        this.refs = refs;
        this.staff = staff;
        this.sports = sports;
        this.packs = packs;
        this.members = members;
        this.activities = activities;
        this.encoder = encoder;
        this.codes = codes;
        this.payments = payments;
        this.payroll = payroll;
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.gymmanager.gym.importer.ImportService importer;

    @Override
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            // existing installation: make sure the base referentials exist (e.g. after a reset)
            if (importer.ensureBase()) log.info("Données de base recréées (fonctions, durées, remises).");
            return;
        }
        if (!enabled) return;
        tx.executeWithoutResult(s -> seed());
        log.info("Données de démonstration chargées (comptes : admin / admin123, accueil / accueil123).");
    }

    private static LocalDate d(String fr) {
        return LocalDate.parse(fr, FR);
    }

    private void seed() {
        // 11.1 Functions
        Map<String, Long> fn = new HashMap<>();
        for (String f : List.of("Coach", "Accueil", "Entretien")) fn.put(f, refs.saveFunction(null, new FunctionRequest(f)).getId());

        // 11.2 Durations
        Map<String, Long> dur = new LinkedHashMap<>();
        for (Object[] r : new Object[][]{{"Mensuel", 1}, {"Trimestriel", 3}, {"Annuel", 12}}) {
            dur.put((String) r[0], refs.saveDuration(null, new DurationRequest((String) r[0], (Integer) r[1])).getId());
        }

        // 11.3 Discounts ("Aucune" is the system entry)
        Map<String, Long> disc = new HashMap<>();
        Object[][] discounts = {{"Aucune", 0}, {"Remise 5%", 5}, {"Remise 10%", 10}, {"Remise 15%", 15}, {"Remise 20%", 20},
                {"Remise étudiant 25%", 25}, {"Remise famille 30%", 30}};
        for (Object[] r : discounts) {
            Discount saved = refs.saveDiscount(null, new DiscountRequest((String) r[0], BigDecimal.valueOf((Integer) r[1])));
            if ("Aucune".equals(r[0])) saved.setSystem(true);
            disc.put((String) r[0], saved.getId());
        }
        discountRepo.flush();

        // 11.4 Staff
        Map<String, Long> st = new HashMap<>();
        String[][] people = {
                {"Hamza", "", "0661112201", "Coach", "COMMISSION", null}, {"Oumaima", "", "0661112202", "Coach", "COMMISSION", null},
                {"Ahmed", "", "0661112203", "Coach", "COMMISSION", null}, {"Aziz", "", "0661112204", "Coach", "COMMISSION", null},
                {"Karim", "", "0661112205", "Coach", "COMMISSION", null},
                {"Bouzid", "Yassir", "0661112208", "Accueil", "FIXED", "4500"}, {"Moujahid", "Khadija", "0661112209", "Accueil", "FIXED", "4300"},
                {"Errami", "Mustapha", "0661112210", "Entretien", "FIXED", "3200"}, {"Tahiri", "Soukaina", "0661112211", "Accueil", "FIXED", "4000"},
                {"Fadili", "Anas", "0661112212", "Entretien", "FIXED", "3000"}};
        for (String[] p : people) {
            st.put(p[0], staff.save(null, new StaffRequest(p[0], p[1], p[2], fn.get(p[3]), List.of(), PayMode.valueOf(p[4]),
                    p[5] == null ? null : new BigDecimal(p[5]))).getId());
        }

        // 11.5 Sports
        Map<String, Long> sp = new LinkedHashMap<>();
        Map<String, BigDecimal> price = new HashMap<>();
        Object[][] sportRows = {
                {"Karaté", "#E53935", "Hamza", new int[]{1, 3, 5}, "19:00", "20:00", 100, "300"},
                {"Aérobic", "#8E24AA", "Oumaima", new int[]{1, 2, 3, 4, 5, 6}, "08:00", "21:00", 60, "250"},
                {"Boxe", "#1E88E5", "Ahmed", new int[]{1, 2, 3, 4, 5}, "18:00", "20:00", 30, "400"},
                {"Kickboxing", "#FB8C00", "Aziz", new int[]{2, 4}, "09:00", "10:30", 25, "350"},
                {"Musculation", "#43A047", "Karim", new int[]{1, 2, 3, 4, 5}, "19:00", "21:00", 25, "450"}};
        for (Object[] r : sportRows) {
            List<SlotRequest> slots = Arrays.stream((int[]) r[3])
                    .mapToObj(day -> new SlotRequest(day, LocalTime.parse((String) r[4]), LocalTime.parse((String) r[5]))).toList();
            String name = (String) r[0];
            sp.put(name, sports.save(null, new SportRequest(name, (String) r[1], (Integer) r[6], new BigDecimal((String) r[7]),
                    List.of(st.get((String) r[2])), slots)).getId());
            price.put(name, new BigDecimal((String) r[7]));
        }

        // 11.6 Packs: one per sport × duration
        Map<String, Long> pk = new HashMap<>();
        Map<String, String> packDiscount = Map.of("Mensuel", "Aucune", "Trimestriel", "Remise 10%", "Annuel", "Remise 15%");
        for (String sport : sp.keySet()) {
            for (String du : dur.keySet()) {
                String name = sport + " - " + du;
                pk.put(name, packs.save(null, new PackRequest(name, sp.get(sport), dur.get(du), price.get(sport), disc.get(packDiscount.get(du)))).getId());
            }
        }

        // 11.7 Members
        String[][] memberRows = {
                {"Alaoui", "Youssef", "0695822412", "01/01/1985", "Musculation", "22/07/2026", "Musculation - Mensuel", "Aucune", "IMPAYE"},
                {"Bennani", "Sara", "0646913810", "02/02/1986", "Aérobic", "08/05/2026", "Aérobic - Trimestriel", "Aucune", "PAYE"},
                {"Idrissi", "Omar", "0623756669", "03/03/1987", "Kickboxing", "22/07/2026", "Kickboxing - Annuel", "Remise 10%", "PAYE"},
                {"Fassi", "Nadia", "0613999315", "04/04/1988", "Aérobic", "22/07/2026", "Aérobic - Trimestriel", "Aucune", "IMPAYE"},
                {"Tazi", "Karim", "0677827638", "05/05/1989", "Boxe", "16/08/2026", "Boxe - Trimestriel", "Remise 15%", "PAYE"},
                {"Chraibi", "Imane", "0697226012", "06/06/1990", "Karaté", "26/08/2026", "Karaté - Trimestriel", "Aucune", "PAYE"},
                {"Amrani", "Hamza", "0689089901", "07/07/1991", "Aérobic", "17/02/2026", "Aérobic - Mensuel", "Remise étudiant 25%", "IMPAYE"},
                {"Berrada", "Salma", "0631429110", "08/08/1992", "Musculation", "26/08/2026", "Musculation - Annuel", "Remise 5%", "PAYE"},
                {"Lahlou", "Anas", "0630868105", "09/09/1993", "Kickboxing", "08/05/2026", "Kickboxing - Annuel", "Remise 15%", "PAYE"},
                {"Zahra", "Fatima", "0622448136", "10/10/1994", "Kickboxing", "26/08/2026", "Kickboxing - Mensuel", "Aucune", "IMPAYE"},
                {"Mansouri", "Rachid", "0656164955", "11/11/1995", "Aérobic", "17/02/2026", "Aérobic - Mensuel", "Aucune", "PAYE"},
                {"Kettani", "Leila", "0671662963", "12/12/1996", "Boxe", "22/07/2026", "Boxe - Annuel", "Remise famille 30%", "PAYE"},
                {"Benjelloun", "Yassine", "0684093639", "13/01/1997", "Karaté", "17/02/2026", "Karaté - Annuel", "Aucune", "IMPAYE"},
                {"Saidi", "Meryem", "0635808537", "14/02/1998", "Aérobic", "22/07/2026", "Aérobic - Mensuel", "Remise étudiant 25%", "PAYE"},
                {"Cherkaoui", "Adil", "0640587988", "15/03/1999", "Aérobic", "17/02/2026", "Aérobic - Mensuel", "Aucune", "PAYE"},
                {"Bouali", "Ayoub", "0662491799", "07/06/1995", "Karaté", "05/09/2026", "Karaté - Mensuel", "Aucune", "IMPAYE"}};
        Map<String, Long> mb = new HashMap<>();
        for (String[] m : memberRows) {
            Long id = members.save(null, new MemberRequest(m[0], m[1], m[2], d(m[3]), d(m[5]), List.of(sp.get(m[4])),
                    pk.get(m[6]), disc.get(m[7]), Insurance.valueOf(m[8]), ""), "admin").getId();
            mb.put(m[1] + " " + m[0], id);
        }

        // 11.8 Activities
        Map<String, Long> ac = new HashMap<>();
        Object[][] acts = {
                {"Stage intensif karaté", "250", "12/09/2026 18:00", "Dojo", 20, "Hamza"},
                {"Cours collectif aérobic", "80", "13/09/2026 10:00", "Salle 1", null, "Oumaima"},
                {"Compétition interne boxe", "150", "19/09/2026 19:00", "Ring", null, "Ahmed"},
                {"Sparring kickboxing", "120", "20/09/2026 18:30", "Ring", null, "Aziz"},
                {"Challenge musculation", "200", "26/09/2026 17:00", "Plateau muscu", null, "Karim"},
                {"Portes ouvertes du club", "0", "03/10/2026 10:00", "Tout le club", null, "Hamza"}};
        for (Object[] a : acts) {
            ac.put((String) a[0], activities.save(null, new ActivityRequest((String) a[0], "", new BigDecimal((String) a[1]),
                    LocalDateTime.parse((String) a[2], FR_TIME), (String) a[3], (Integer) a[4], st.get((String) a[5]))).getId());
        }

        // 11.9 Registrations
        Map<String, List<String>> regs = new LinkedHashMap<>();
        regs.put("Stage intensif karaté", List.of("Youssef Alaoui", "Yassine Benjelloun", "Ayoub Bouali"));
        regs.put("Cours collectif aérobic", List.of("Sara Bennani", "Adil Cherkaoui", "Nadia Fassi"));
        regs.put("Compétition interne boxe", List.of("Karim Tazi", "Leila Kettani"));
        regs.put("Sparring kickboxing", List.of("Omar Idrissi", "Anas Lahlou", "Fatima Zahra"));
        regs.put("Challenge musculation", List.of("Salma Berrada", "Rachid Mansouri", "Meryem Saidi"));
        regs.forEach((act, names) -> names.forEach(n -> activities.register(new RegistrationRequest(mb.get(n), ac.get(act)))));

        // Payments (demonstration): fully paid, partial payments, unpaid members, one renewal.
        Object[][] pays = {
                {"Omar Idrissi", "22/07/2026", "1500", "CARTE"}, {"Omar Idrissi", "22/09/2026", "1713", "ESPECES"},
                {"Nadia Fassi", "22/07/2026", "675", "ESPECES"},
                {"Karim Tazi", "16/08/2026", "918", "VIREMENT"},
                {"Imane Chraibi", "26/08/2026", "400", "ESPECES"},
                {"Salma Berrada", "26/08/2026", "4360.50", "VIREMENT"},
                {"Anas Lahlou", "08/05/2026", "1500", "CARTE"}, {"Anas Lahlou", "08/07/2026", "1000", "CARTE"},
                {"Rachid Mansouri", "17/02/2026", "250", "ESPECES"},
                {"Leila Kettani", "22/07/2026", "2856", "CARTE"},
                {"Yassine Benjelloun", "17/02/2026", "1060", "ESPECES"}, {"Yassine Benjelloun", "17/05/2026", "1000", "ESPECES"},
                {"Meryem Saidi", "22/07/2026", "187.50", "ESPECES"},
                {"Adil Cherkaoui", "17/02/2026", "250", "ESPECES"},
                {"Ayoub Bouali", "05/09/2026", "300", "ESPECES"}};
        for (Object[] p : pays) {
            payments.pay(new PaymentRequest(mb.get((String) p[0]), null, new BigDecimal((String) p[2]),
                    PaymentMethod.valueOf((String) p[3]), d((String) p[1]), ""), "accueil");
        }
        // Adil Cherkaoui renewed his monthly aerobics pack on 10/11/2026 and paid it.
        payments.renew(mb.get("Adil Cherkaoui"), new RenewRequest(pk.get("Aérobic - Mensuel"), disc.get("Aucune"), d("10/11/2026"),
                new BigDecimal("250"), PaymentMethod.ESPECES, d("10/11/2026"), "Renouvellement"), "accueil");

        // October 2026 payroll already paid to the fixed-salary staff.
        for (String n : List.of("Bouzid", "Moujahid", "Errami", "Tahiri", "Fadili")) {
            BigDecimal amount = new BigDecimal(Arrays.stream(people).filter(p -> p[0].equals(n)).findFirst().orElseThrow()[5]);
            payroll.pay(new SalaryPaymentRequest(st.get(n), "2026-10", amount, PaymentMethod.VIREMENT, d("31/10/2026"), ""), "admin");
        }

        // Users (password change forced at first login)
        for (String[] u : new String[][]{{"admin", "admin123", "ADMIN"}, {"accueil", "accueil123", "ACCUEIL"}}) {
            AppUser user = new AppUser();
            user.setUsername(u[0]);
            user.setPasswordHash(encoder.encode(u[1]));
            user.setRole(Role.valueOf(u[2]));
            user.setMustChangePassword(true);
            users.save(user);
        }
    }
}
