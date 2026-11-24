package com.gymmanager.gym;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.MediaType;
import org.mockito.ArgumentCaptor;
import com.gymmanager.gym.security.BrevoEmailSender;
import com.gymmanager.gym.security.EmailSender;
import com.gymmanager.gym.settings.SettingsCatalog;
import com.gymmanager.gym.settings.SettingsService;
import com.sun.net.httpserver.HttpServer;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Acceptance criteria of the specification (section 12), checked through the real API
 * on the seeded demonstration data. "Today" is fixed to 18/11/2026.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AcceptanceTest {

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        MutableClock fixedClock() {
            return new MutableClock(new AtomicReference<>(Instant.parse("2026-11-18T10:00:00Z")), ZoneOffset.UTC);
        }

        /** Password reset emails are sent in the calling thread, so assertions need no waiting. */
        @Bean
        @Primary
        TaskExecutor syncTaskExecutor() {
            return new SyncTaskExecutor();
        }
    }

    /** Fixed clock that a test can move forward (temporary password expiry). */
    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> now;
        private final ZoneId zone;

        MutableClock(AtomicReference<Instant> now, ZoneId zone) {
            this.now = now;
            this.zone = zone;
        }

        void advance(Duration d) {
            now.updateAndGet(i -> i.plus(d));
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId z) {
            return new MutableClock(now, z);
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    MutableClock clock;

    @MockitoBean
    EmailSender mailSender;

    @Autowired
    SettingsService settingsService;

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    MockHttpSession admin;

    @BeforeEach
    void loginAdmin() throws Exception {
        when(mailSender.isConfigured()).thenReturn(true);
        admin = login("admin", "admin123", "Admin2026");
    }

    // ------------------------------------------------------------------ helpers

    MockHttpSession login(String user, String password, String newPassword) throws Exception {
        MockHttpSession session = (MockHttpSession) mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("username", user, "password", password))))
                .andExpect(status().isOk()).andReturn().getRequest().getSession();
        mvc.perform(post("/api/auth/change-password").session(session).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("currentPassword", password, "newPassword", newPassword))))
                .andExpect(status().isOk());
        return session;
    }

    static String json(Object o) {
        return tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(o);
    }

    ResultActions get(MockHttpSession s, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).session(s));
    }

    ResultActions send(MockHttpSession s, String method, String url, Object body) throws Exception {
        var b = switch (method) {
            case "POST" -> post(url);
            case "PUT" -> put(url);
            case "PATCH" -> patch(url);
            default -> delete(url);
        };
        return mvc.perform(b.session(s).contentType(MediaType.APPLICATION_JSON).content(body == null ? "{}" : json(body)));
    }

    String body(ResultActions r) throws Exception {
        return r.andReturn().getResponse().getContentAsString();
    }

    <T> T read(ResultActions r, String path) throws Exception {
        return JsonPath.read(body(r), path);
    }

    long id(String listUrl, String path) throws Exception {
        List<Number> ids = read(get(admin, listUrl), path);
        assertThat(ids).as(path).isNotEmpty();
        return ids.getFirst().longValue();
    }

    Map<String, Object> member(String last, String first, String phone, long sportId, long packId, Long discountId, String date) {
        var m = new java.util.HashMap<String, Object>(Map.of("lastName", last, "firstName", first, "phone", phone,
                "sportIds", List.of(sportId), "packId", packId, "registrationDate", date, "insurance", "PAYE"));
        if (discountId != null) m.put("discountId", discountId);
        return m;
    }

    void setting(String key, String value) throws Exception {
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of(key, value))).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ criteria

    @Test
    @DisplayName("Premier login : changement de mot de passe obligatoire")
    void passwordChangeIsForcedAtFirstLogin() throws Exception {
        MockHttpSession s = (MockHttpSession) mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", "accueil", "password", "accueil123")))).andReturn().getRequest().getSession();
        get(s, "/api/members").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("MUST_CHANGE_PASSWORD"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", "admin", "password", "mauvais")))).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/members")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Critère 2 : un sport « Natation » avec un nouveau coach apparaît partout")
    void newSportIsDynamic() throws Exception {
        long coachFn = id("/api/functions", "$[?(@.label=='Coach')].id");
        long coach = ((Number) read(send(admin, "POST", "/api/staff", Map.of("lastName", "Nadia", "firstName", "Coach",
                "phone", "0661112299", "functionId", coachFn, "payMode", "COMMISSION")), "$.id")).longValue();
        long sport = ((Number) read(send(admin, "POST", "/api/sports", Map.of("name", "Natation", "color", "#00ACC1",
                "capacity", 40, "monthlyPrice", 500, "coachIds", List.of(coach), "schedules", List.of())), "$.id")).longValue();

        // pack generator, then a member registered before the salary cut-off day (25)
        long monthly = id("/api/durations", "$[?(@.label=='Mensuel')].id");
        send(admin, "POST", "/api/packs/generate", Map.of("sportId", sport, "items", List.of(
                Map.of("durationId", monthly, "name", "Natation - Mensuel")))).andExpect(status().isOk());
        long pack = id("/api/packs", "$[?(@.name=='Natation - Mensuel')].id");

        assertThat((List<Object>) read(get(admin, "/api/staff"), "$.rows[?(@.name=='Nadia Coach')].salary")).containsExactly(0.0);
        send(admin, "POST", "/api/members", member("Bennis", "Lina", "0612000001", sport, pack, null, "2026-11-10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A017")).andExpect(jsonPath("$.price").value(500.0));

        assertThat((List<Object>) read(get(admin, "/api/members"), "$[?(@.code=='A017')].sports[0].name")).containsExactly("Natation");
        assertThat((List<Object>) read(get(admin, "/api/staff"), "$.rows[?(@.name=='Nadia Coach')].sports[0].name")).containsExactly("Natation");
        // RG-JOURS: unpaid days do not count, so the member is not active until the first payment
        assertThat((List<Object>) read(get(admin, "/api/dashboard"), "$.bySport[?(@.name=='Natation')].count")).containsExactly(0);
        // CA per sport = cashed amounts: nothing until the member pays
        assertThat((List<Object>) read(get(admin, "/api/stats"), "$.bySport[?(@.name=='Natation')].amount")).containsExactly(0.0);
        long a017 = id("/api/members", "$[?(@.code=='A017')].id");
        send(admin, "POST", "/api/payments", Map.of("memberId", a017, "amount", 500, "method", "CARTE", "paidOn", "2026-11-10")).andExpect(status().isOk());
        assertThat((List<Object>) read(get(admin, "/api/dashboard"), "$.bySport[?(@.name=='Natation')].count")).containsExactly(1);
        assertThat((List<Object>) read(get(admin, "/api/stats"), "$.bySport[?(@.name=='Natation')].amount")).containsExactly(500.0);
        // salary = 1/3 × 500
        assertThat((List<Object>) read(get(admin, "/api/staff"), "$.rows[?(@.name=='Nadia Coach')].salary")).containsExactly(166.67);
    }

    @Test
    @DisplayName("Critère 3 : seuils d'alerte, part et fenêtre de salaire, nom du club")
    void settingsApplyImmediately() throws Exception {
        // A006 Imane Chraibi ends on 26/11/2026: 8 days left
        assertThat((List<Object>) read(get(admin, "/api/alerts"), "$.rows[?(@.code=='A006')].situation")).containsExactly("FOLLOW");
        setting("alerts.soonDays", "10");
        assertThat((List<Object>) read(get(admin, "/api/alerts"), "$.rows[?(@.code=='A006')].situation")).containsExactly("SOON");

        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Test", "Un", "0612000002", karate, pack, null, "2026-11-05")).andExpect(status().isOk());
        send(admin, "POST", "/api/members", member("Test", "Deux", "0612000003", karate, pack, null, "2026-11-24")).andExpect(status().isOk());
        // Karaté in progress in November: A006 quarterly from 26/08 (810 / 3 = 270), annual A013 (3060 / 12 = 255), the two new ones
        String hamza = "$.rows[?(@.code=='E001')].salary";
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(375.0);   // 1/3 × 1125
        setting("salary.share", "40");
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(450.0);   // 40 % × 1125
        setting("salary.cutoffDay", "24");
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(330.0);   // 40 % × 825: the 24/11 one moves to December

        setting("club.name", "Gym Manager Center");
        get(admin, "/api/config").andExpect(jsonPath("$.clubName").value("Gym Manager Center"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("alerts.soonDays", "abc"))).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Critère 4 : A003 ouvre la fiche d'Omar Idrissi")
    void memberCardByCode() throws Exception {
        get(admin, "/api/members/by-code/A003").andExpect(status().isOk())
                .andExpect(jsonPath("$.member.firstName").value("Omar")).andExpect(jsonPath("$.member.lastName").value("Idrissi"))
                .andExpect(jsonPath("$.member.remainingDays").value(246)).andExpect(jsonPath("$.member.price").value(3213.0));
        get(admin, "/api/members/by-code/A999").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Critère 5 : après suppression de A002, les codes restent et le suivant est A017")
    void codesAreNeverReused() throws Exception {
        long a002 = id("/api/members", "$[?(@.code=='A002')].id");
        send(admin, "DELETE", "/api/members/" + a002, null).andExpect(status().isNoContent());
        assertThat((List<Object>) read(get(admin, "/api/members"), "$[*].code")).hasSize(15).doesNotContain("A002").contains("A001", "A003", "A016");
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Nouveau", "Membre", "0612000004", karate, pack, null, "2026-11-18"))
                .andExpect(jsonPath("$.code").value("A017"));
        // A002's activity registration was deleted with the member
        assertThat((List<Object>) read(get(admin, "/api/registrations"), "$[?(@.memberCode=='A002')]")).isEmpty();
    }

    @Test
    @DisplayName("Critère 6 : Karaté - Trimestriel = 810 ; avec Remise 10 % = 729 (cumul) ou 810 (sans cumul)")
    void pricing() throws Exception {
        assertThat((List<Object>) read(get(admin, "/api/packs"), "$[?(@.name=='Karaté - Trimestriel')].total")).containsExactly(810.0);
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Trimestriel')].id");
        long r10 = id("/api/discounts", "$[?(@.name=='Remise 10%')].id");
        send(admin, "POST", "/api/members", member("Prix", "Test", "0612000005", karate, pack, r10, "2026-11-18"))
                .andExpect(jsonPath("$.price").value(729.0))
                // RG-JOURS: nothing paid yet, so nothing is covered
                .andExpect(jsonPath("$.endDate").value("2026-11-18")).andExpect(jsonPath("$.remainingDays").value(0));
        setting("subscription.cumulative", "false");
        assertThat((List<Object>) read(get(admin, "/api/members"), "$[?(@.lastName=='Prix')].price")).containsExactly(810.0);
    }

    @Test
    @DisplayName("Critère 7 : une remise désactivée disparaît des choix sans modifier les adhérents")
    void deactivatedDiscount() throws Exception {
        long r10 = id("/api/discounts", "$[?(@.name=='Remise 10%')].id");
        send(admin, "PATCH", "/api/discounts/" + r10 + "/active", Map.of("active", false)).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/A003").andExpect(jsonPath("$.member.discount.name").value("Remise 10%"))
                .andExpect(jsonPath("$.member.price").value(3213.0));
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Remise", "Inactive", "0612000006", karate, pack, r10, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("discountId"));
        // a referenced element cannot be deleted
        send(admin, "DELETE", "/api/discounts/" + r10, null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IN_USE"));
        long none = id("/api/discounts", "$[?(@.name=='Aucune')].id");
        send(admin, "PATCH", "/api/discounts/" + none + "/active", Map.of("active", false)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Remise saisie à la main : le montant tapé devient le prix, la remise en % est déduite du prix du pack")
    void customAmount() throws Exception {
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long monthly = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        long r10 = id("/api/discounts", "$[?(@.name=='Remise 10%')].id");
        send(admin, "POST", "/api/members/preview", Map.of("packId", monthly, "registrationDate", "2026-11-18", "customAmount", 200))
                .andExpect(jsonPath("$.price").value(200.0));
        var body = member("Manuel", "Prix", "0612000007", karate, monthly, r10, "2026-11-18");
        body.put("customAmount", 200);
        String created = body(send(admin, "POST", "/api/members", body).andExpect(status().isOk())
                .andExpect(jsonPath("$.price").value(200.0)).andExpect(jsonPath("$.customAmount").value(200.0))
                .andExpect(jsonPath("$.discount.name").value("Montant saisi (−33,33 %)"))
                .andExpect(jsonPath("$.discount.percent").value(33.33)));
        long memberId = ((Number) JsonPath.read(created, "$.id")).longValue();
        // the typed price ignores the pricing rules
        setting("subscription.cumulative", "false");
        assertThat((List<Object>) read(get(admin, "/api/members"), "$[?(@.lastName=='Manuel')].price")).containsExactly(200.0);
        // more than the pack price is not a discount
        body.put("customAmount", 301);
        send(admin, "PUT", "/api/members/" + memberId, body)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("customAmount"));
        // back to a discount from the list
        body.remove("customAmount");
        send(admin, "PUT", "/api/members/" + memberId, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.price").value(270.0)).andExpect(jsonPath("$.customAmount").isEmpty())
                .andExpect(jsonPath("$.discount.name").value("Remise 10%"));
    }

    @Test
    @DisplayName("Critère 9 : ACCUEIL n'accède ni au Personnel, ni aux Statistiques, ni aux Paramètres")
    void accueilRole() throws Exception {
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        for (String url : List.of("/api/staff", "/api/stats", "/api/settings", "/api/users", "/api/functions", "/api/payroll")) {
            get(accueil, url).andExpect(status().isForbidden());
        }
        send(accueil, "PUT", "/api/settings", Map.of("values", Map.of("club.name", "X"))).andExpect(status().isForbidden());
        send(accueil, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "x@club.test", "mail.brevo.apiKey", "xkeysib-x")))
                .andExpect(status().isForbidden());
        send(accueil, "POST", "/api/settings/reset/mail", null).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/discounts", Map.of("name", "X", "percent", 5)).andExpect(status().isForbidden());
        get(accueil, "/api/members").andExpect(status().isOk());
        get(accueil, "/api/alerts").andExpect(status().isOk());
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(accueil, "POST", "/api/members", member("Accueil", "Ajout", "0612000007", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk());
        assertThat(body(get(accueil, "/api/sports"))).doesNotContain("salary");
        // ACCUEIL records payments but cannot correct, cancel or delete them
        long a001 = id("/api/members", "$[?(@.code=='A001')].id");
        long pay = ((Number) read(send(accueil, "POST", "/api/payments", Map.of("memberId", a001, "amount", 100, "method", "ESPECES")), "$.id")).longValue();
        get(accueil, "/api/payments/" + pay + "/receipt.pdf").andExpect(status().isOk());
        send(accueil, "PUT", "/api/payments/" + pay, Map.of("amount", 50, "method", "ESPECES", "paidOn", "2026-11-18")).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/payments/" + pay + "/cancel", Map.of("reason", "x")).andExpect(status().isForbidden());
        send(accueil, "DELETE", "/api/payments/" + pay, null).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/payroll/payments", Map.of("staffId", 1, "period", "2026-11", "method", "ESPECES")).andExpect(status().isForbidden());
        send(accueil, "PUT", "/api/payroll/bonus", Map.of("staffId", 1, "period", "2026-11", "amount", 10)).andExpect(status().isForbidden());
        send(accueil, "DELETE", "/api/payroll/staff/1/months/2026-10", null).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Paiements partiels, reçus numérotés, modification et annulation")
    void payments() throws Exception {
        String a001 = "$[?(@.code=='A001')]";
        long id = id("/api/members", a001 + ".id");
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".paymentStatus")).containsExactly("IMPAYE");
        String firstJson = body(send(admin, "POST", "/api/payments", Map.of("memberId", id, "amount", 200, "method", "ESPECES", "paidOn", "2026-11-15")));
        String receipt = JsonPath.read(firstJson, "$.receiptNumber");
        long first = ((Number) JsonPath.read(firstJson, "$.id")).longValue();
        assertThat(receipt).isEqualTo("REC-2026-0017"); // the seed used 0001 → 0016
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".paymentStatus")).containsExactly("PARTIEL");
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".balance")).containsExactly(250.0);

        send(admin, "POST", "/api/payments", Map.of("memberId", id, "amount", 300, "method", "CARTE"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("amount"));
        send(admin, "POST", "/api/payments", Map.of("memberId", id, "amount", 10, "method", "CARTE", "paidOn", "2026-12-01"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("paidOn"));
        long second = ((Number) read(send(admin, "POST", "/api/payments", Map.of("memberId", id, "amount", 250, "method", "CARTE")), "$.id")).longValue();
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".paymentStatus")).containsExactly("PAYE");

        var pdf = get(admin, "/api/payments/" + second + "/receipt.pdf").andExpect(status().isOk()).andReturn().getResponse();
        assertThat(pdf.getContentType()).isEqualTo("application/pdf");
        assertThat(new String(pdf.getContentAsByteArray(), 0, 5)).isEqualTo("%PDF-");

        send(admin, "PUT", "/api/payments/" + second, Map.of("amount", 200, "method", "VIREMENT", "paidOn", "2026-11-16"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.updatedBy").value("admin"));
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".balance")).containsExactly(50.0);
        send(admin, "POST", "/api/payments/" + second + "/cancel", Map.of("reason", "")).andExpect(status().isBadRequest());
        send(admin, "POST", "/api/payments/" + second + "/cancel", Map.of("reason", "Erreur de saisie"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancelled").value(true));
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".balance")).containsExactly(250.0);
        get(admin, "/api/payments/" + second + "/receipt.pdf").andExpect(status().isOk());

        // only a cancelled payment can be deleted
        send(admin, "DELETE", "/api/payments/" + first, null).andExpect(status().isBadRequest());
        send(admin, "DELETE", "/api/payments/" + second, null).andExpect(status().isNoContent());
        get(admin, "/api/payments/" + second + "/receipt.pdf").andExpect(status().isNotFound());

        // a member with a non-cancelled payment is kept for accounting
        send(admin, "DELETE", "/api/members/" + id, null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IN_USE"));
        send(admin, "POST", "/api/payments/" + first + "/cancel", Map.of("reason", "Erreur")).andExpect(status().isOk());
        send(admin, "DELETE", "/api/members/" + id, null).andExpect(status().isNoContent());
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".id")).isEmpty();

        // deleted receipt numbers are never reused
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        long other = ((Number) read(send(admin, "POST", "/api/members", member("Recu", "Suivant", "0612000008", karate, pack, null, "2026-11-18")), "$.id")).longValue();
        String next = read(send(admin, "POST", "/api/payments", Map.of("memberId", other, "amount", 10, "method", "ESPECES")), "$.receiptNumber");
        assertThat(next).isEqualTo("REC-2026-0019");
    }

    @Test
    @DisplayName("Renouvellement : nouvelle période, historique conservé, arriérés")
    void renewal() throws Exception {
        long a001 = id("/api/members", "$[?(@.code=='A001')].id");
        get(admin, "/api/members/by-code/A001").andExpect(jsonPath("$.renewalStart").value("2026-11-18"));
        long annual = id("/api/packs", "$[?(@.name=='Musculation - Annuel')].id");
        long none = id("/api/discounts", "$[?(@.name=='Aucune')].id");
        send(admin, "POST", "/api/members/" + a001 + "/renew", Map.of("packId", annual, "discountId", none,
                        "paymentAmount", 4590, "paymentMethod", "VIREMENT"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(4590.0))
                .andExpect(jsonPath("$.endDate").value("2027-11-18")).andExpect(jsonPath("$.paymentStatus").value("PAYE"));
        get(admin, "/api/members/by-code/A001")
                .andExpect(jsonPath("$.member.remainingDays").value(365))
                .andExpect(jsonPath("$.member.pack.name").value("Musculation - Annuel"))
                .andExpect(jsonPath("$.member.balance").value(450.0))            // first month still unpaid
                .andExpect(jsonPath("$.member.paymentStatus").value("PARTIEL"))
                .andExpect(jsonPath("$.subscriptions.length()").value(2));
        // an unpaid renewal does not extend the remaining days, but the next renewal starts after it
        long monthly = id("/api/packs", "$[?(@.name=='Musculation - Mensuel')].id");
        long unpaid = ((Number) read(send(admin, "POST", "/api/members/" + a001 + "/renew", Map.of("packId", monthly)), "$.id")).longValue();
        get(admin, "/api/members/by-code/A001").andExpect(jsonPath("$.member.remainingDays").value(365))
                .andExpect(jsonPath("$.member.endDate").value("2027-11-18"))
                .andExpect(jsonPath("$.renewalStart").value("2027-12-18"));
        send(admin, "DELETE", "/api/subscriptions/" + unpaid, null).andExpect(status().isNoContent());

        long current = id("/api/members", "$[?(@.code=='A001')].subscriptionId");
        send(admin, "DELETE", "/api/subscriptions/" + current, null).andExpect(status().isConflict());

        // deleting the last payment of a renewal removes the renewal
        List<Number> renewalPayments = read(get(admin, "/api/members/by-code/A001"), "$.subscriptions[?(@.id==" + current + ")].payments[*].id");
        assertThat(renewalPayments).hasSize(1);
        long renewalPayment = renewalPayments.getFirst().longValue();
        send(admin, "POST", "/api/payments/" + renewalPayment + "/cancel", Map.of("reason", "Erreur")).andExpect(status().isOk());
        send(admin, "DELETE", "/api/payments/" + renewalPayment, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/A001").andExpect(jsonPath("$.subscriptions.length()").value(1))
                .andExpect(jsonPath("$.subscriptions[0].id").value(org.hamcrest.Matchers.not((int) current)));

        // the first period is kept even without any payment left
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long karatePack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        long newcomer = ((Number) read(send(admin, "POST", "/api/members", member("Periode", "Premiere", "0612000009", karate, karatePack, null, "2026-11-18")), "$.id")).longValue();
        String newcomerCode = (String) ((List<Object>) read(get(admin, "/api/members"), "$[?(@.id==" + newcomer + ")].code")).getFirst();
        long onlyPayment = ((Number) read(send(admin, "POST", "/api/payments", Map.of("memberId", newcomer, "amount", 10, "method", "ESPECES")), "$.id")).longValue();
        send(admin, "POST", "/api/members/" + newcomer + "/renew", Map.of("packId", karatePack)).andExpect(status().isOk());
        send(admin, "POST", "/api/payments/" + onlyPayment + "/cancel", Map.of("reason", "Erreur")).andExpect(status().isOk());
        send(admin, "DELETE", "/api/payments/" + onlyPayment, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/" + newcomerCode).andExpect(jsonPath("$.subscriptions.length()").value(2));

        // a renewal without payment can be removed
        long a002 = id("/api/members", "$[?(@.code=='A002')].id");
        long pack = id("/api/packs", "$[?(@.name=='Aérobic - Mensuel')].id");
        long sub = ((Number) read(send(admin, "POST", "/api/members/" + a002 + "/renew", Map.of("packId", pack)), "$.id")).longValue();
        // A002 has no payment at all: no day counts, expired since the start of its first period, renewal included
        get(admin, "/api/members/by-code/A002").andExpect(jsonPath("$.member.remainingDays").value(-194))
                .andExpect(jsonPath("$.subscriptions[?(@.id==" + sub + ")].countedDays").value(org.hamcrest.Matchers.contains(0)))
                .andExpect(jsonPath("$.member.situation").value("EXPIRED"))
                .andExpect(jsonPath("$.member.state").value("EXPIRED"));
        send(admin, "DELETE", "/api/subscriptions/" + sub, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/A002").andExpect(jsonPath("$.subscriptions.length()").value(1));
        // a pack of another sport is refused
        long boxe = id("/api/packs", "$[?(@.name=='Boxe - Mensuel')].id");
        send(admin, "POST", "/api/members/" + a002 + "/renew", Map.of("packId", boxe)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Adhérent sans abonnement : suppression de toute période sans paiement, puis « Nouvel abonnement »")
    void memberWithoutSubscription() throws Exception {
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long karatePack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        long m = ((Number) read(send(admin, "POST", "/api/members", member("Sans", "Abonnement", "0612000010", karate, karatePack, null, "2026-11-01")), "$.id")).longValue();
        String code = (String) ((List<Object>) read(get(admin, "/api/members"), "$[?(@.id==" + m + ")].code")).getFirst();
        long first = id("/api/members", "$[?(@.id==" + m + ")].subscriptionId");
        long middle = ((Number) read(send(admin, "POST", "/api/members/" + m + "/renew", Map.of("packId", karatePack)), "$.id")).longValue();
        long last = ((Number) read(send(admin, "POST", "/api/members/" + m + "/renew", Map.of("packId", karatePack)), "$.id")).longValue();

        // ACCUEIL cannot remove a period
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        send(accueil, "DELETE", "/api/subscriptions/" + middle, null).andExpect(status().isForbidden());

        // an intermediate period, then the first one, can be removed: the others are unchanged
        send(admin, "DELETE", "/api/subscriptions/" + middle, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/" + code).andExpect(jsonPath("$.subscriptions.length()").value(2))
                .andExpect(jsonPath("$.subscriptions[0].id").value((int) last))
                .andExpect(jsonPath("$.subscriptions[0].startDate").value("2027-01-01"))
                .andExpect(jsonPath("$.subscriptions[1].startDate").value("2026-11-01"));
        send(admin, "DELETE", "/api/subscriptions/" + first, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/" + code).andExpect(jsonPath("$.subscriptions.length()").value(1))
                .andExpect(jsonPath("$.subscriptions[0].id").value((int) last))
                .andExpect(jsonPath("$.subscriptions[0].startDate").value("2027-01-01"));
        // the single period left is not the registration one: a form save keeps its start
        send(admin, "PUT", "/api/members/" + m, member("Sans", "Abonnement", "0612000010", karate, karatePack, null, "2026-11-01"))
                .andExpect(status().isOk());
        get(admin, "/api/members/by-code/" + code).andExpect(jsonPath("$.subscriptions[0].startDate").value("2027-01-01"));

        // the only period left can be removed too: the member is then without subscription
        send(admin, "DELETE", "/api/subscriptions/" + last, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/" + code).andExpect(status().isOk())
                .andExpect(jsonPath("$.subscriptions.length()").value(0))
                .andExpect(jsonPath("$.renewalStart").value("2026-11-18"))
                .andExpect(jsonPath("$.member.situation").value("NONE"))
                .andExpect(jsonPath("$.member.state").value("NONE"))
                .andExpect(jsonPath("$.member.periodCount").value(0))
                .andExpect(jsonPath("$.member.pack").doesNotExist())
                .andExpect(jsonPath("$.member.endDate").doesNotExist())
                .andExpect(jsonPath("$.member.remainingDays").doesNotExist())
                .andExpect(jsonPath("$.member.activeMember").value(false))
                .andExpect(jsonPath("$.member.paymentStatus").doesNotExist())
                .andExpect(jsonPath("$.alertMessage").doesNotExist());
        assertThat((List<Object>) read(get(admin, "/api/members"), "$[?(@.id==" + m + ")].situation")).containsExactly("NONE");

        // no page fails, and the member is neither alerted nor paid as commission
        assertThat((List<Object>) read(get(admin, "/api/alerts"), "$.rows[?(@.code=='" + code + "')]")).isEmpty();
        get(admin, "/api/dashboard").andExpect(status().isOk());
        get(admin, "/api/stats").andExpect(status().isOk());
        assertThat(body(get(admin, "/api/payroll?month=2026-11").andExpect(status().isOk()))).doesNotContain(code);

        // cashing is refused
        send(admin, "POST", "/api/payments", Map.of("memberId", m, "amount", 10, "method", "ESPECES"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Aucun abonnement")));

        // saving the form neither requires a pack nor recreates a period
        send(admin, "PUT", "/api/members/" + m, Map.of("lastName", "Sans", "firstName", "Abonnement", "phone", "0612000010",
                        "sportIds", List.of(karate), "registrationDate", "2026-11-01", "insurance", "PAYE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.situation").value("NONE"));
        send(admin, "PUT", "/api/members/" + m, member("Sans", "Abonnement", "0612000010", karate, karatePack, null, "2026-11-01"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.periodCount").value(0));

        // "Nouvel abonnement": a period starting today with the chosen pack and an optional payment
        send(admin, "POST", "/api/members/" + m + "/renew", Map.of("packId", karatePack, "paymentAmount", 10, "paymentMethod", "ESPECES"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.startDate").value("2026-11-18"))
                .andExpect(jsonPath("$.paymentStatus").value("PARTIEL"));
        get(admin, "/api/members/by-code/" + code).andExpect(jsonPath("$.subscriptions.length()").value(1))
                .andExpect(jsonPath("$.member.pack.name").value("Karaté - Mensuel"))
                .andExpect(jsonPath("$.member.situation").value(org.hamcrest.Matchers.not("NONE")))
                .andExpect(jsonPath("$.member.state").value("UP_TO_DATE"));
        // the new subscription starts today, not on the registration date: a form save keeps its start
        send(admin, "PUT", "/api/members/" + m, member("Sans", "Abonnement", "0612000010", karate, karatePack, null, "2026-11-01"))
                .andExpect(status().isOk());
        get(admin, "/api/members/by-code/" + code).andExpect(jsonPath("$.subscriptions[0].startDate").value("2026-11-18"));

        // a period holding a cancelled payment cannot be removed
        long paid = id("/api/members", "$[?(@.id==" + m + ")].subscriptionId");
        long payment = ((Number) read(get(admin, "/api/members/by-code/" + code), "$.subscriptions[0].payments[0].id")).longValue();
        send(admin, "POST", "/api/payments/" + payment + "/cancel", Map.of("reason", "Erreur")).andExpect(status().isOk());
        send(admin, "DELETE", "/api/subscriptions/" + paid, null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("supprimez-les d'abord")));
    }

    @Test
    @DisplayName("Statistiques et tableau de bord sur les encaissements")
    void cashedRevenue() throws Exception {
        get(admin, "/api/stats").andExpect(jsonPath("$.kpis.revenue").value(18220.0))
                .andExpect(jsonPath("$.kpis.unpaidAmount").value(3607.0))
                .andExpect(jsonPath("$.byMethod[?(@.method=='ESPECES')].amount").value(6085.5))
                .andExpect(jsonPath("$.byMethod[?(@.method=='CARTE')].amount").value(6856.0))
                .andExpect(jsonPath("$.byMethod[?(@.method=='VIREMENT')].amount").value(5278.5));
        get(admin, "/api/dashboard").andExpect(jsonPath("$.cashedThisMonth").value(250.0)).andExpect(jsonPath("$.toCollect").value(3607.0));
    }

    @Test
    @DisplayName("Sauvegarde : export, effacement puis restauration à l'identique (données, photos, logo, paramètres)")
    void backupRoundTrip() throws Exception {
        long a003 = id("/api/members", "$[?(@.code=='A003')].id");
        byte[] photo = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4};
        mvc.perform(multipart("/api/members/" + a003 + "/photo").file(new MockMultipartFile("file", "p.jpg", "image/jpeg", photo)).session(admin))
                .andExpect(status().isOk());
        byte[] logo = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 9, 9};
        mvc.perform(multipart("/api/club/logo").file(new MockMultipartFile("file", "logo.png", "image/png", logo)).session(admin))
                .andExpect(status().isOk());
        setting("club.name", "Club Sauvegardé");

        String summary = body(get(admin, "/api/data/summary"));
        String members = body(get(admin, "/api/members"));
        String payments = body(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"));
        String payroll = body(get(admin, "/api/payroll?month=2026-10"));
        long firstPayment = ((Number) read(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"), "$[0].id")).longValue();

        var export = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/data/export").session(admin))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("gym-manager-2026-11-18.zip")))
                .andReturn().getResponse();
        Map<String, byte[]> entries = unzip(export.getContentAsByteArray());
        assertThat(entries).containsKey("data.json");
        assertThat(entries.keySet().stream().filter(k -> k.startsWith("uploads/"))).hasSize(2);
        Map<String, Object> doc = JSON.readValue(entries.get("data.json"), Map.class);
        assertThat(doc).containsEntry("format", "gym-manager-backup").containsKey("schemaVersion");
        assertThat((Map<String, Object>) doc.get("tables")).doesNotContainKeys("app_users", "databasechangelog")
                .containsKeys("members", "payments", "app_settings", "code_counters", "sport_coaches");

        send(admin, "POST", "/api/data/wipe", Map.of("confirm", "oui")).andExpect(status().isBadRequest());
        send(admin, "POST", "/api/data/wipe", Map.of("confirm", "SUPPRIMER")).andExpect(status().isOk());
        get(admin, "/api/data/summary").andExpect(jsonPath("$.members").value(0)).andExpect(jsonPath("$.payments").value(0));
        // base referentials are recreated by the reset: the club stays usable
        assertThat((List<Object>) read(get(admin, "/api/discounts"), "$[?(@.system == true)].name")).containsExactly("Aucune");
        assertThat((List<Object>) read(get(admin, "/api/durations"), "$[*].label")).containsExactly("Mensuel", "Trimestriel", "Annuel");
        assertThat((List<Object>) read(get(admin, "/api/functions"), "$[*].label")).containsExactlyInAnyOrder("Coach", "Accueil", "Entretien");
        setting("club.name", "Autre club");
        // fresh installation: identity sequences start again at 1 (the restore must realign them)
        jdbc.queryForList("SELECT pg_get_serial_sequence(table_name, column_name) FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND is_identity = 'YES' AND table_name <> 'app_users'", String.class)
                .forEach(seq -> jdbc.execute("ALTER SEQUENCE " + seq + " RESTART WITH 1"));
        get(admin, "/api/members/" + a003 + "/photo").andExpect(status().isNotFound());

        mvc.perform(multipart("/api/data/restore").file(new MockMultipartFile("file", "sauvegarde.zip", "application/zip", export.getContentAsByteArray()))
                .param("confirm", "SUPPRIMER").session(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.restored.members").value(16));

        assertThat(body(get(admin, "/api/data/summary"))).isEqualTo(summary);
        assertThat(body(get(admin, "/api/members"))).isEqualTo(members);
        assertThat(body(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"))).isEqualTo(payments);
        assertThat(body(get(admin, "/api/payroll?month=2026-10"))).isEqualTo(payroll);
        get(admin, "/api/config").andExpect(jsonPath("$.clubName").value("Club Sauvegardé"));
        assertThat(get(admin, "/api/members/" + a003 + "/photo").andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).isEqualTo(photo);
        assertThat(get(admin, "/api/club/logo").andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).isEqualTo(logo);
        get(admin, "/api/payments/" + firstPayment + "/receipt.pdf").andExpect(status().isOk());
        // users are untouched; identities and codes continue after the restored data
        assertThat((List<Object>) read(get(admin, "/api/users"), "$[*].username")).contains("admin", "accueil");
        long sport = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Nouveau", "Membre", "0612000009", sport, pack, null, "2026-11-18"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A017"));
        long newMember = id("/api/members", "$[?(@.code=='A017')].id");
        send(admin, "POST", "/api/payments", Map.of("memberId", newMember, "amount", 100, "method", "ESPECES")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Sauvegarde : confirmation, fichier illisible, autre version du schéma, accès ACCUEIL — rien n'est modifié")
    void backupRejections() throws Exception {
        byte[] zip = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/data/export").session(admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        String summary = body(get(admin, "/api/data/summary"));

        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        get(accueil, "/api/data/export").andExpect(status().isForbidden());
        restore(accueil, zip, "SUPPRIMER").andExpect(status().isForbidden());

        restore(admin, zip, "non").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Tapez SUPPRIMER")));
        restore(admin, "pas une archive".getBytes(StandardCharsets.UTF_8), "SUPPRIMER").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Fichier de sauvegarde illisible")));
        byte[] json = unzip(zip).get("data.json");
        restore(admin, zip(Map.of("data.json", java.util.Arrays.copyOf(json, json.length / 2))), "SUPPRIMER").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Fichier de sauvegarde illisible")));

        Map<String, Object> doc = JSON.readValue(json, Map.class);
        String current = (String) doc.get("schemaVersion");
        doc.put("schemaVersion", "alisport:V0__old");
        restore(admin, zip(Map.of("data.json", JSON.writeValueAsBytes(doc))), "SUPPRIMER").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("alisport:V0__old"), org.hamcrest.Matchers.containsString(current))));

        // inconsistent data (payments without their members): the whole restore is rolled back
        doc.put("schemaVersion", current);
        ((Map<String, Object>) doc.get("tables")).put("members", List.of());
        restore(admin, zip(Map.of("data.json", JSON.writeValueAsBytes(doc))), "SUPPRIMER").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Fichier de sauvegarde illisible")));

        assertThat(body(get(admin, "/api/data/summary"))).isEqualTo(summary);
    }

    static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();

    ResultActions restore(MockHttpSession s, byte[] archive, String confirm) throws Exception {
        return mvc.perform(multipart("/api/data/restore").file(new MockMultipartFile("file", "sauvegarde.zip", "application/zip", archive))
                .param("confirm", confirm).session(s));
    }

    static Map<String, byte[]> unzip(byte[] archive) throws Exception {
        Map<String, byte[]> entries = new java.util.HashMap<>();
        try (var in = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(archive))) {
            for (var e = in.getNextEntry(); e != null; e = in.getNextEntry()) entries.put(e.getName(), in.readAllBytes());
        }
        return entries;
    }

    static byte[] zip(Map<String, byte[]> entries) throws Exception {
        var out = new java.io.ByteArrayOutputStream();
        try (var zip = new java.util.zip.ZipOutputStream(out)) {
            for (var e : entries.entrySet()) {
                zip.putNextEntry(new java.util.zip.ZipEntry(e.getKey()));
                zip.write(e.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    @Test
    @DisplayName("Paie : salaire + prime versés en une fois, une seule facture, annulation qui garde la prime")
    void payroll() throws Exception {
        get(admin, "/api/payroll?month=2026-10").andExpect(jsonPath("$.rows[?(@.staff.code=='E006')].status").value("PAYE"));
        String e006 = "$.rows[?(@.staff.code=='E006')]";
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".due").value(4500.0)).andExpect(jsonPath(e006 + ".status").value("IMPAYE"))
                .andExpect(jsonPath(e006 + ".salary").value(4500.0)).andExpect(jsonPath(e006 + ".bonus").value(0.0))
                .andExpect(jsonPath(e006 + ".paidOn").value(org.hamcrest.Matchers.contains(org.hamcrest.Matchers.nullValue())))
                .andExpect(jsonPath("$.rows[?(@.staff.code=='E002')].due").value(83.33))  // Oumaima: 1/3 × 250 (renewal on 10/11)
                .andExpect(jsonPath("$.currentMonth").value(true));
        long bouzid = id("/api/staff", "$.rows[?(@.code=='E006')].id");

        // bonus: added, changed, refused when not positive, removed
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 0))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("amount"));
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", -5)).andExpect(status().isBadRequest());
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 150, "note", "Ancienneté"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bonus").value(150.0)).andExpect(jsonPath("$.due").value(4650.0));
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 200)).andExpect(status().isOk());
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".bonus").value(200.0)).andExpect(jsonPath(e006 + ".due").value(4700.0))
                .andExpect(jsonPath(e006 + ".salary").value(4500.0));
        var noBonus = new java.util.HashMap<String, Object>(Map.of("staffId", bouzid, "period", "2026-11"));
        noBonus.put("amount", null);
        send(admin, "PUT", "/api/payroll/bonus", noBonus).andExpect(status().isOk()).andExpect(jsonPath("$.bonus").value(0.0));
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 200)).andExpect(status().isOk());

        // one payment = salary + bonus, amount computed by the server; a second one is refused
        var r = send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "amount", 1, "method", "ESPECES", "paidOn", "2026-11-17"))
                .andExpect(status().isOk());
        assertThat((String) read(r, "$.slipNumber")).isEqualTo("SAL-2026-0006");
        assertThat(((Number) read(r, "$.amount")).doubleValue()).isEqualTo(4700.0);
        long slip = ((Number) read(r, "$.id")).longValue();
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".status").value("PAYE")).andExpect(jsonPath(e006 + ".balance").value(0.0))
                .andExpect(jsonPath(e006 + ".paidOn").value("2026-11-17"));
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "method", "ESPECES")).andExpect(status().isBadRequest());
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-12", "method", "ESPECES")).andExpect(status().isBadRequest());
        // the bonus of a paid month is frozen
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 300)).andExpect(status().isBadRequest());
        send(admin, "PUT", "/api/payroll/bonus", noBonus).andExpect(status().isBadRequest());

        var pdf = get(admin, "/api/payroll/payments/" + slip + "/receipt.pdf").andExpect(status().isOk()).andReturn().getResponse();
        assertThat(new String(pdf.getContentAsByteArray(), 0, 5)).isEqualTo("%PDF-");
        assertThat((List<Object>) read(get(admin, "/api/payroll/staff/" + bouzid + "/history"), "$[*].period")).containsExactly("2026-11", "2026-10");

        // cancel = the slip is deleted, the bonus is kept, the month is unpaid again; the slip number is not reused
        send(admin, "DELETE", "/api/payroll/staff/" + bouzid + "/months/2026-11", null).andExpect(status().isNoContent());
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".status").value("IMPAYE")).andExpect(jsonPath(e006 + ".bonus").value(200.0))
                .andExpect(jsonPath(e006 + ".due").value(4700.0)).andExpect(jsonPath(e006 + ".payments.length()").value(0));
        get(admin, "/api/payroll/payments/" + slip + "/receipt.pdf").andExpect(status().isNotFound());
        assertThat((List<Object>) read(get(admin, "/api/payroll/staff/" + bouzid + "/history"), "$[*].period")).containsExactly("2026-10");
        assertThat(body(get(admin, "/api/payroll/stats?from=2026-11&to=2026-11"))).doesNotContain("SAL-2026-0006");
        send(admin, "DELETE", "/api/payroll/staff/" + bouzid + "/months/2026-11", null).andExpect(status().isNotFound());
        send(admin, "DELETE", "/api/payroll/staff/999999/months/2026-11", null).andExpect(status().isNotFound());
        assertThat((String) read(send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "method", "ESPECES"))
                .andExpect(status().isOk()), "$.slipNumber")).isEqualTo("SAL-2026-0007");
        // a month with only cancelled (legacy) payments is unpaid: cancelling it is refused and keeps its pending bonus
        jdbc.update("UPDATE salary_payments SET cancelled = TRUE WHERE staff_id = ? AND period = '2026-10'", bouzid);
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-10", "amount", 50)).andExpect(status().isOk());
        send(admin, "DELETE", "/api/payroll/staff/" + bouzid + "/months/2026-10", null).andExpect(status().isNotFound());
        get(admin, "/api/payroll?month=2026-10").andExpect(jsonPath(e006 + ".bonus").value(50.0));
        send(admin, "DELETE", "/api/staff/" + bouzid, null).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Paie : un mois hérité avec acomptes et versement annulé — factures actives listées, annulation qui supprime tout")
    void payrollLegacyAdvances() throws Exception {
        String e006 = "$.rows[?(@.staff.code=='E006')]";
        long bouzid = id("/api/staff", "$.rows[?(@.code=='E006')].id");
        // legacy data from before one-payment-per-month: two advances and a cancelled payment
        String insert = "INSERT INTO salary_payments (slip_number, staff_id, period, amount, method, paid_on, created_at, created_by, cancelled) "
                + "VALUES (?, ?, '2026-11', ?, 'ESPECES', ?, CURRENT_TIMESTAMP, 'admin', ?)";
        jdbc.update(insert, "OLD-1", bouzid, 1000, java.sql.Date.valueOf("2026-11-03"), false);
        jdbc.update(insert, "OLD-2", bouzid, 500, java.sql.Date.valueOf("2026-11-05"), true);
        jdbc.update(insert, "OLD-3", bouzid, 2000, java.sql.Date.valueOf("2026-11-10"), false);

        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".paid").value(3000.0))
                .andExpect(jsonPath(e006 + ".paidOn").value("2026-11-10")).andExpect(jsonPath(e006 + ".payments.length()").value(3));
        // still a paid month: no new payment, no bonus change until it is cancelled
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "method", "ESPECES")).andExpect(status().isBadRequest());
        send(admin, "PUT", "/api/payroll/bonus", Map.of("staffId", bouzid, "period", "2026-11", "amount", 50)).andExpect(status().isBadRequest());

        send(admin, "DELETE", "/api/payroll/staff/" + bouzid + "/months/2026-11", null).andExpect(status().isNoContent());
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".status").value("IMPAYE"))
                .andExpect(jsonPath(e006 + ".payments.length()").value(0));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM salary_payments WHERE slip_number LIKE 'OLD-%'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("Paie : recettes du sport encaissées dans le mois sur les sports coachés, « Rien à verser »")
    void payrollRevenue() throws Exception {
        String month = body(get(admin, "/api/payroll?month=2026-11"));
        // Oumaima coaches aerobics only: her revenue is the aerobics revenue of the month
        var stats = get(admin, "/api/stats?from=2026-11-01&to=2026-11-30");
        double aerobics = ((Number) ((List<Object>) read(stats, "$.bySport[?(@.name=='Aérobic')].amount")).getFirst()).doubleValue();
        assertThat(aerobics).isGreaterThanOrEqualTo(250.0);
        assertThat(((Number) ((List<Object>) JsonPath.read(month, "$.rows[?(@.staff.code=='E002')].revenue")).getFirst()).doubleValue()).isEqualTo(aerobics);
        // no coached sport: no revenue
        assertThat((List<Object>) JsonPath.read(month, "$.rows[?(@.staff.code=='E006')].revenue")).containsExactly((Object) null);
        // a payment counts once for a coach of several of the member's sports
        var sale = new com.gymmanager.gym.rules.Rules.Sale(java.time.LocalDate.of(2026, 11, 5), new java.math.BigDecimal("100"), java.util.Set.of(1L, 2L));
        assertThat(com.gymmanager.gym.rules.Rules.revenueForSports(List.of(sale), java.util.Set.of(1L, 2L, 3L),
                java.time.LocalDate.of(2026, 11, 1), java.time.LocalDate.of(2026, 11, 30))).isEqualByComparingTo("100");

        // nothing due (commission coach without sport): the payment is refused
        long coachFn = id("/api/functions", "$[?(@.label=='Coach')].id");
        long nadia = ((Number) read(send(admin, "POST", "/api/staff", Map.of("lastName", "Coach", "firstName", "Nadia", "functionId", coachFn,
                "payMode", "COMMISSION", "sportIds", List.of())).andExpect(status().isOk()), "$.id")).longValue();
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath("$.rows[?(@.staff.id==" + nadia + ")].due").value(0.0));
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", nadia, "period", "2026-11", "method", "ESPECES")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Statistiques de paie : dû, versé et reste par mois et par membre du personnel")
    void payrollStats() throws Exception {
        long bouzid = id("/api/staff", "$.rows[?(@.code=='E006')].id");
        get(admin, "/api/payroll/stats").andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2025-12")).andExpect(jsonPath("$.to").value("2026-11"))
                .andExpect(jsonPath("$.monthly.length()").value(12));
        String month = body(get(admin, "/api/payroll?month=2026-10"));
        var oct = get(admin, "/api/payroll/stats?from=2026-10&to=2026-10").andExpect(status().isOk());
        assertThat(((Number) read(oct, "$.totalPaid")).doubleValue()).isEqualTo(((Number) com.jayway.jsonpath.JsonPath.read(month, "$.totalPaid")).doubleValue());
        assertThat(((Number) read(oct, "$.totalDue")).doubleValue()).isEqualTo(((Number) com.jayway.jsonpath.JsonPath.read(month, "$.totalDue")).doubleValue());
        get(admin, "/api/payroll/stats?from=2026-10&to=2026-10&staffId=" + bouzid)
                .andExpect(jsonPath("$.byStaff.length()").value(1)).andExpect(jsonPath("$.byStaff[0].code").value("E006"))
                .andExpect(jsonPath("$.byStaff[0].balance").value(0.0)).andExpect(jsonPath("$.payments[*].staffCode").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("E006"))));
        get(admin, "/api/payroll/stats?from=2026-10&to=2027-03").andExpect(jsonPath("$.to").value("2026-11"));
        get(admin, "/api/payroll/stats?from=2026-11&to=2026-10").andExpect(status().isBadRequest());
        get(admin, "/api/payroll/stats?from=2010-01&to=2026-11").andExpect(status().isBadRequest());
        get(admin, "/api/payroll/stats?staffId=999999").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Critère 10 : bouton WhatsApp de 0695822412")
    void whatsappLink() throws Exception {
        List<String> links = read(get(admin, "/api/alerts"), "$.rows[?(@.code=='A001')].whatsappLink");
        assertThat(links.getFirst()).startsWith("https://wa.me/212695822412?text=Bonjour%20Youssef%20Alaoui%2C%20votre%20abonnement%20a%20expir");
        assertThat((Integer) read(get(admin, "/api/alerts"), "$.alertCount")).isEqualTo(9);
    }

    @Test
    @DisplayName("Validations et activités complètes")
    void validationsAndFullActivity() throws Exception {
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long boxePack = id("/api/packs", "$[?(@.name=='Boxe - Mensuel')].id");
        send(admin, "POST", "/api/members", member("X", "Y", "12345", karate, boxePack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        send(admin, "POST", "/api/members", member("X", "Y", "0612000008", karate, boxePack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("packId"));
        long karatePack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("idrissi", "OMAR", "0623756669", karate, karatePack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Ce numéro de téléphone est déjà utilisé par l'adhérent A")));
        // the same number under another name is refused as well, also when editing
        send(admin, "POST", "/api/members", member("Autre", "Personne", "06 23 75 66 69", karate, karatePack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        long other = ((Number) read(send(admin, "POST", "/api/members", member("Autre", "Personne", "0612000099", karate, karatePack, null, "2026-11-18"))
                .andExpect(status().isOk()), "$.id")).longValue();
        send(admin, "PUT", "/api/members/" + other, member("Autre", "Personne", "0623756669", karate, karatePack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        send(admin, "PUT", "/api/members/" + other, member("Autre", "Renommée", "0612000099", karate, karatePack, null, "2026-11-18"))
                .andExpect(status().isOk());

        long hamza = id("/api/staff-options", "$[?(@.code=='E001')].id");
        long act = ((Number) read(send(admin, "POST", "/api/activities", Map.of("name", "Atelier", "price", 50,
                "startsAt", "2026-12-01T18:00:00", "maxPlaces", 1, "managerId", hamza)), "$.id")).longValue();
        long a001 = id("/api/members", "$[?(@.code=='A001')].id");
        long a003 = id("/api/members", "$[?(@.code=='A003')].id");
        send(admin, "POST", "/api/registrations", Map.of("memberId", a001, "activityId", act)).andExpect(status().isOk());
        send(admin, "POST", "/api/registrations", Map.of("memberId", a001, "activityId", act)).andExpect(status().isConflict());
        send(admin, "POST", "/api/registrations", Map.of("memberId", a003, "activityId", act)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("L'activité « Atelier » est complète."));
        send(admin, "DELETE", "/api/sports/" + karate, null).andExpect(status().isConflict());
        get(admin, "/api/dashboard").andExpect(jsonPath("$.upcomingActivityCount").value(1));
    }

    @Test
    @DisplayName("Note d'un adhérent : modifiée et effacée seule, sans recalcul du prix ni de la période")
    void memberNotes() throws Exception {
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        long a003 = id("/api/members", "$[?(@.code=='A003')].id");
        // A003's period is paid, so its price is frozen; with cumulation off, a full save (PUT) would re-price it.
        setting("subscription.cumulative", "false");
        long sub = ((Number) read(get(admin, "/api/members/by-code/A003"), "$.member.subscriptionId")).longValue();
        java.math.BigDecimal amount = jdbc.queryForObject("SELECT amount FROM subscriptions WHERE id = ?", java.math.BigDecimal.class, sub);

        send(accueil, "PATCH", "/api/members/" + a003 + "/notes", Map.of("notes", "  Allergie\nau pollen  ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("Allergie\nau pollen")).andExpect(jsonPath("$.price").value(3213.0));
        get(admin, "/api/members/by-code/A003").andExpect(jsonPath("$.member.notes").value("Allergie\nau pollen"));
        assertThat(jdbc.queryForObject("SELECT amount FROM subscriptions WHERE id = ?", java.math.BigDecimal.class, sub))
                .as("montant de la période").isEqualByComparingTo(amount);

        send(admin, "PATCH", "/api/members/" + a003 + "/notes", Map.of("notes", "   ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("")).andExpect(jsonPath("$.price").value(3213.0));
        send(admin, "PATCH", "/api/members/" + a003 + "/notes", Map.of("notes", "x".repeat(2001))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("notes"))
                .andExpect(jsonPath("$.message").value("Le champ « Notes » ne doit pas dépasser 2000 caractères."));
        get(admin, "/api/members/by-code/A003").andExpect(jsonPath("$.member.notes").value(""));
        send(admin, "PATCH", "/api/members/999999/notes", Map.of("notes", "x")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Adhérent introuvable."));
        assertThat(jdbc.queryForObject("SELECT amount FROM subscriptions WHERE id = ?", java.math.BigDecimal.class, sub))
                .as("montant de la période").isEqualByComparingTo(amount);
    }

    // ------------------------------------------------------------------ regional settings

    @Test
    @DisplayName("Onglet Régional : pays et devises envoyés avec la page, villes par pays, valeur hors liste refusée")
    void regionalLists() throws Exception {
        get(admin, "/api/settings")
                .andExpect(jsonPath("$.values['regional.country']").value("MA"))
                .andExpect(jsonPath("$.values['regional.city']").value(""))
                .andExpect(jsonPath("$.values['regional.currencyCode']").value("MAD"))
                .andExpect(jsonPath("$.values['regional.currency']").value("DH"))
                .andExpect(jsonPath("$.values['regional.timezone']").doesNotExist())
                .andExpect(jsonPath("$.values['regional.dialCode']").doesNotExist())
                .andExpect(jsonPath("$.regional.countries[?(@.code=='MA')].label").value("Maroc"))
                .andExpect(jsonPath("$.regional.countries[?(@.code=='FR')].currencyCode").value("EUR"))
                .andExpect(jsonPath("$.regional.currencies[?(@.code=='EUR')].symbol").value("€"));
        get(admin, "/api/admin/regional/cities?country=MA").andExpect(status().isOk()).andExpect(jsonPath("$[0]").value("Casablanca"));
        get(admin, "/api/regional/countries").andExpect(jsonPath("$[?(@.code=='FR')].dialCode").value("33"));
        get(admin, "/api/config")
                .andExpect(jsonPath("$.currency").value("DH")).andExpect(jsonPath("$.currencyCode").value("MAD"))
                .andExpect(jsonPath("$.country").value("MA")).andExpect(jsonPath("$.dialCode").value("212"))
                .andExpect(jsonPath("$.timezone").value("Africa/Casablanca"))
                .andExpect(jsonPath("$.phoneExample").value("06 50 12 34 56")).andExpect(jsonPath("$.phoneRegex").doesNotExist());
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        get(accueil, "/api/regional/countries").andExpect(status().isOk());
        get(accueil, "/api/admin/regional/cities?country=MA").andExpect(status().isForbidden());

        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.currencyCode", "XYZ")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("regional.currencyCode"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("« Devise »")));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.country", "XX")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("regional.country"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("« Pays »")));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.country", "FR", "regional.city", "Casablanca")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("regional.city"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("« Ville »")));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.timezone", "Europe/Paris"))).andExpect(status().isBadRequest());
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.phoneRegex", "^0\\d{9}$")))
                .andExpect(status().isBadRequest());

        // the city gives the zone; without city, the country's official zone
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.country", "US", "regional.city", "Los Angeles")))
                .andExpect(status().isOk());
        get(admin, "/api/config").andExpect(jsonPath("$.timezone").value("America/Los_Angeles")).andExpect(jsonPath("$.dialCode").value("1"));
        // a new country alone drops the city of the former one
        setting("regional.country", "FR");
        get(admin, "/api/config").andExpect(jsonPath("$.city").value("")).andExpect(jsonPath("$.timezone").value("Europe/Paris"));
        setting("regional.country", "US");
        get(admin, "/api/config").andExpect(jsonPath("$.timezone").value("America/New_York"));
    }

    @Test
    @DisplayName("Symbole affiché : imposé par la devise, une valeur envoyée est ignorée, « DH » conservé tant que la devise ne change pas")
    void currencySymbolFollowsCurrency() throws Exception {
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.currencyCode", "MAD", "regional.currency", "XX")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values['regional.currency']").value("DH"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("regional.currencyCode", "EUR", "regional.currency", "DH")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values['regional.currency']").value("€"));
        get(admin, "/api/config").andExpect(jsonPath("$.currency").value("€")).andExpect(jsonPath("$.currencyCode").value("EUR"));
    }

    @Test
    @DisplayName("Base existante : pays déduit de l'ancien fuseau ou de l'ancien indicatif, sans perte du fuseau")
    void legacyRegionalRows() throws Exception {
        jdbc.update("INSERT INTO app_settings (setting_key, setting_value) VALUES ('regional.timezone', 'Europe/Paris'), ('regional.dialCode', '33')");
        get(admin, "/api/settings").andExpect(jsonPath("$.values['regional.country']").value("FR"));
        get(admin, "/api/config").andExpect(jsonPath("$.timezone").value("Europe/Paris")).andExpect(jsonPath("$.dialCode").value("33"));

        jdbc.update("UPDATE app_settings SET setting_value = 'America/Los_Angeles' WHERE setting_key = 'regional.timezone'");
        get(admin, "/api/config").andExpect(jsonPath("$.country").value("US")).andExpect(jsonPath("$.timezone").value("America/Los_Angeles"));

        jdbc.update("UPDATE app_settings SET setting_value = 'UTC' WHERE setting_key = 'regional.timezone'");
        get(admin, "/api/config").andExpect(jsonPath("$.country").value("FR"));

        // the Régional tab reset restores Morocco, not the country of the former rows
        send(admin, "POST", "/api/settings/reset/regional", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.values['regional.country']").value("MA"));
    }

    @Test
    @DisplayName("Téléphone validé par libphonenumber pour le pays du champ : national pour le pays du club, E.164 sinon")
    void phoneByCountry() throws Exception {
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        String invalid = "Numéro de téléphone invalide pour Maroc (+212) (ex. : 06 50 12 34 56).";
        send(admin, "POST", "/api/members", member("Tel", "Court", "0812", karate, pack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone")).andExpect(jsonPath("$.message").value(invalid));
        send(admin, "POST", "/api/members", member("Tel", "France", "+33612345678", karate, pack, null, "2026-11-18"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone")).andExpect(jsonPath("$.message").value(invalid));
        send(admin, "POST", "/api/members", member("Tel", "Ponctué", "06 12-34.56 78", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0612345678"));
        send(admin, "POST", "/api/members", member("Tel", "International", "+212 6 12 00 00 10", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0612000010"));

        // a foreign number: E.164, WhatsApp link without the club's dial code
        Map<String, Object> french = member("Dupont", "Jean", "06 12 34 56 78", karate, pack, null, "2026-10-01");
        french.put("phoneCountry", "FR");
        long frenchId = ((Number) read(send(admin, "POST", "/api/members", french).andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("+33612345678")), "$.id")).longValue();
        french.put("phone", "0812");
        send(admin, "PUT", "/api/members/" + frenchId, french).andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Numéro de téléphone invalide pour France (+33) (ex. : 06")));
        french.put("phoneCountry", "XX");
        french.put("phone", "0612345678");
        send(admin, "PUT", "/api/members/" + frenchId, french).andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        List<String> links = read(get(admin, "/api/alerts"), "$.rows[?(@.lastName=='Dupont')].whatsappLink");
        assertThat(links).singleElement().asString().startsWith("https://wa.me/33612345678?text=");

        // a stored number is never revalidated: an unchanged one passes even if libphonenumber rejects it
        long coachFn = id("/api/functions", "$[?(@.label=='Coach')].id");
        Map<String, Object> staff = new java.util.HashMap<>(Map.of("lastName", "Ancien", "firstName", "Numéro",
                "phone", "0661112299", "functionId", coachFn, "payMode", "COMMISSION"));
        long staffId = ((Number) read(send(admin, "POST", "/api/staff", staff), "$.id")).longValue();
        jdbc.update("UPDATE staff SET phone = '0800000000' WHERE id = ?", staffId);
        staff.put("phone", "0800000000");
        send(admin, "PUT", "/api/staff/" + staffId, staff).andExpect(status().isOk());
        staff.put("phone", "0800000001");
        send(admin, "PUT", "/api/staff/" + staffId, staff).andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        staff.put("phone", "+33 6 12 34 56 78");
        staff.put("phoneCountry", "FR");
        send(admin, "PUT", "/api/staff/" + staffId, staff).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT phone FROM staff WHERE id = ?", String.class, staffId)).isEqualTo("+33612345678");

        // another club country: French example, French numbers national
        setting("regional.country", "FR");
        get(admin, "/api/config").andExpect(jsonPath("$.phoneExample").value(org.hamcrest.Matchers.startsWith("06")));
        send(admin, "POST", "/api/members", member("Tel", "Paris", "06 98 76 54 32", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0698765432"));
    }

    @Test
    @DisplayName("Téléphone du club : même validation et même stockage, sauf valeur inchangée")
    void clubPhone() throws Exception {
        jdbc.update("INSERT INTO app_settings (setting_key, setting_value) VALUES ('club.phone', '05 22 libre')");
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("club.name", "Club", "club.phone", "05 22 libre"))).andExpect(status().isOk());
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("club.phone", "0812")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("club.phone"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("club.phone", "05 22 12 34 56")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values['club.phone']").value("0522123456"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("club.phone", "01 23 45 67 89"), "phoneCountries", Map.of("club.phone", "FR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values['club.phone']").value("+33123456789"));
        setting("club.phone", "");
    }

    @Test
    @DisplayName("Ancienne ligne regional.phoneRegex : ignorée, en base comme dans une sauvegarde réimportée")
    void legacyPhoneRegexRow() throws Exception {
        jdbc.update("INSERT INTO app_settings (setting_key, setting_value) VALUES ('regional.phoneRegex', '^9$')");
        // a backup still holding the row restores normally (no data-only migration bumps the schema version)
        byte[] backup = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/data/export").session(admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        mvc.perform(multipart("/api/data/restore").file(new MockMultipartFile("file", "sauvegarde.zip", "application/zip", backup))
                .param("confirm", "SUPPRIMER").session(admin)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'regional.phoneRegex'", Integer.class)).isOne();
        assertThat(settingsService.raw()).doesNotContainKey("regional.phoneRegex");
        get(admin, "/api/settings").andExpect(status().isOk()).andExpect(jsonPath("$.values['regional.phoneRegex']").doesNotExist());
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Regex", "Ignorée", "0612000011", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ forgotten password

    ResultActions rawLogin(String user, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", user, "password", password))));
    }

    ResultActions forgot(String user, String ip) throws Exception {
        return mvc.perform(post("/api/public/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", user))).with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                }));
    }

    long userId(String username) throws Exception {
        return id("/api/users", "$[?(@.username=='" + username + "')].id");
    }

    void setEmail(String username, String email) throws Exception {
        send(admin, "PUT", "/api/users/" + userId(username), Map.of("email", email)).andExpect(status().isOk());
    }

    /** Temporary password of the last email sent, after checking the recipient. */
    String sentTempPassword(String expectedTo, int expectedCount) {
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mailSender, times(expectedCount)).send(to.capture(), subject.capture(), text.capture());
        assertThat(to.getValue()).isEqualTo(expectedTo);
        assertThat(subject.getValue()).isEqualTo("Gym Manager : votre mot de passe provisoire");
        Matcher matcher = Pattern.compile("Mot de passe provisoire : (\\S+)").matcher(text.getValue());
        assertThat(matcher.find()).as("temporary password in the email").isTrue();
        return matcher.group(1);
    }

    @Test
    @DisplayName("Mot de passe oublié : le mot de passe provisoire connecte, force le changement puis ne sert plus")
    void forgotPasswordHappyPath() throws Exception {
        setEmail("accueil", "accueil@club.test");
        String generic = body(forgot("accueil", "10.0.0.1").andExpect(status().isAccepted()));
        assertThat(generic).contains("mot de passe provisoire");
        String temp = sentTempPassword("accueil@club.test", 1);
        assertThat(temp).hasSize(12).matches(".*[A-Za-z].*").matches(".*\\d.*");

        MockHttpSession s = (MockHttpSession) rawLogin("accueil", temp).andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true)).andReturn().getRequest().getSession();
        get(s, "/api/members").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("MUST_CHANGE_PASSWORD"));
        send(s, "POST", "/api/auth/change-password", Map.of("currentPassword", temp, "newPassword", "Nouveau2026"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword").value(false));

        // used once: neither the temporary nor the previous password works any more
        rawLogin("accueil", temp).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));
        rawLogin("accueil", "accueil123").andExpect(status().isUnauthorized());
        rawLogin("accueil", "Nouveau2026").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Mot de passe oublié : objet et message suivent le modèle de l'onglet Brevo config")
    void forgotPasswordUsesConfiguredTemplate() throws Exception {
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.reset.template", "Salut {identifiant}")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("mail.reset.template"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.reset.subject", "{club} : accès provisoire",
                "mail.reset.template", "Salut {identifiant}, code {mot_de_passe} valable {duree} min ({club}).")))
                .andExpect(status().isOk());
        setEmail("accueil", "accueil@club.test");
        forgot("accueil", "10.0.0.1").andExpect(status().isAccepted());

        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mailSender).send(eq("accueil@club.test"), subject.capture(), text.capture());
        String club = settingsService.config().clubName();
        assertThat(subject.getValue()).isEqualTo(club + " : accès provisoire");
        Matcher m = Pattern.compile("Salut accueil, code (\\S{12}) valable 30 min \\((.+)\\)\\.").matcher(text.getValue());
        assertThat(m.matches()).as(text.getValue()).isTrue();
        assertThat(m.group(2)).isEqualTo(club);
        rawLogin("accueil", m.group(1)).andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword").value(true));

        send(admin, "POST", "/api/settings/reset/mail", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.values['mail.reset.subject']").value("Gym Manager : votre mot de passe provisoire"))
                .andExpect(jsonPath("$.values['mail.reset.template']").value(SettingsCatalog.find("mail.reset.template").orElseThrow().defaultValue()));
    }

    @Test
    @DisplayName("Mot de passe oublié : même réponse pour un compte inconnu, inactif ou sans e-mail, et rien n'est envoyé")
    void forgotPasswordRevealsNothing() throws Exception {
        String reference = body(forgot("inconnu", "10.0.0.1").andExpect(status().isAccepted()));
        // accueil has no email yet
        assertThat(body(forgot("accueil", "10.0.0.1").andExpect(status().isAccepted()))).isEqualTo(reference);
        send(admin, "POST", "/api/users", Map.of("username", "ancien", "password", "Ancien2026", "role", "ACCUEIL",
                "email", "ancien@club.test")).andExpect(status().isOk());
        send(admin, "PUT", "/api/users/" + userId("ancien"), Map.of("active", false)).andExpect(status().isOk());
        assertThat(body(forgot("ancien", "10.0.0.1").andExpect(status().isAccepted()))).isEqualTo(reference);
        assertThat(body(forgot("", "10.0.0.1").andExpect(status().isAccepted()))).isEqualTo(reference);
        verify(mailSender, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("Mot de passe oublié : envoi non configuré, même réponse et rien n'est envoyé ni modifié")
    void forgotPasswordWithoutMailConfig() throws Exception {
        when(mailSender.isConfigured()).thenReturn(false);
        setEmail("accueil", "accueil@club.test");
        String reference = body(forgot("inconnu", "10.0.0.1").andExpect(status().isAccepted()));
        assertThat(body(forgot("accueil", "10.0.0.1").andExpect(status().isAccepted()))).isEqualTo(reference);
        verify(mailSender, never()).send(anyString(), anyString(), anyString());
        rawLogin("accueil", "accueil123").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Mot de passe oublié : échec de l'envoi Brevo, même réponse et l'ancien mot de passe reste valable")
    void forgotPasswordSendFailure() throws Exception {
        doThrow(new IllegalStateException("Brevo API returned HTTP 401")).when(mailSender).send(anyString(), anyString(), anyString());
        setEmail("accueil", "accueil@club.test");
        String reference = body(forgot("inconnu", "10.0.0.1").andExpect(status().isAccepted()));
        assertThat(body(forgot("accueil", "10.0.0.1").andExpect(status().isAccepted()))).isEqualTo(reference);
        verify(mailSender, times(1)).send(anyString(), anyString(), anyString());
        rawLogin("accueil", "accueil123").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Mot de passe oublié : provisoire utilisé sans changement, il reconnecte et force toujours le changement")
    void abandonedChangeKeepsTempUsable() throws Exception {
        setEmail("accueil", "accueil@club.test");
        forgot("accueil", "10.0.0.1").andExpect(status().isAccepted());
        String temp = sentTempPassword("accueil@club.test", 1);
        rawLogin("accueil", temp).andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword").value(true));
        // the user leaves without choosing a new password
        rawLogin("accueil", temp).andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword").value(true));
        rawLogin("accueil", "accueil123").andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Mot de passe oublié : l'ancien mot de passe reste valable et annule le provisoire")
    void oldPasswordCancelsPendingTemp() throws Exception {
        setEmail("accueil", "accueil@club.test");
        forgot("accueil", "10.0.0.1").andExpect(status().isAccepted());
        String temp = sentTempPassword("accueil@club.test", 1);
        rawLogin("accueil", "accueil123").andExpect(status().isOk());
        rawLogin("accueil", temp).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));
    }

    @Test
    @DisplayName("Mot de passe oublié : le mot de passe provisoire expire après 30 minutes")
    void tempPasswordExpires() throws Exception {
        setEmail("accueil", "accueil@club.test");
        forgot("accueil", "10.0.0.1").andExpect(status().isAccepted());
        String temp = sentTempPassword("accueil@club.test", 1);
        clock.advance(Duration.ofMinutes(31));
        rawLogin("accueil", temp).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));
        rawLogin("accueil", "accueil123").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Mot de passe oublié : 3 demandes par heure et par identifiant, 10 par heure et par adresse IP")
    void forgotPasswordIsRateLimited() throws Exception {
        setEmail("accueil", "accueil@club.test");
        for (int i = 0; i < 4; i++) forgot("accueil", "10.0.0." + (i + 1)).andExpect(status().isAccepted());
        verify(mailSender, times(3)).send(anyString(), anyString(), anyString());
        clock.advance(Duration.ofMinutes(61));
        forgot("accueil", "10.0.0.9").andExpect(status().isAccepted());
        verify(mailSender, times(4)).send(anyString(), anyString(), anyString());

        for (String u : List.of("alpha", "bravo", "charlie", "delta")) {
            send(admin, "POST", "/api/users", Map.of("username", u, "password", "Passe2026", "role", "ACCUEIL",
                    "email", u + "@club.test")).andExpect(status().isOk());
        }
        // 10 requests from the same IP are served, the 11th is not (delta itself is only at 2)
        for (String u : List.of("alpha", "bravo", "charlie")) {
            for (int i = 0; i < 3; i++) forgot(u, "192.168.1.50").andExpect(status().isAccepted());
        }
        forgot("delta", "192.168.1.50").andExpect(status().isAccepted());
        verify(mailSender, times(14)).send(anyString(), anyString(), anyString());
        String limited = body(forgot("delta", "192.168.1.50").andExpect(status().isAccepted()));
        assertThat(limited).isEqualTo(body(forgot("inconnu", "10.1.1.1")));
        verify(mailSender, times(14)).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("E-mail du compte : saisi par l'admin ou par l'utilisateur, format vérifié")
    void accountEmail() throws Exception {
        long accueilId = userId("accueil");
        send(admin, "PUT", "/api/users/" + accueilId, Map.of("email", "abc"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"));
        send(admin, "POST", "/api/users", Map.of("username", "nouveau", "password", "Nouveau2026", "role", "ACCUEIL", "email", "abc"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"));

        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        send(accueil, "PUT", "/api/auth/me", Map.of("email", "abc"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"))
                .andExpect(jsonPath("$.message").value("Adresse e-mail invalide (exemple : prenom.nom@exemple.fr)."));
        send(accueil, "PUT", "/api/auth/me", Map.of("email", " accueil@club.test "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("accueil@club.test"));
        List<String> emails = read(get(admin, "/api/users"), "$[?(@.username=='accueil')].email");
        assertThat(emails).containsExactly("accueil@club.test");

        // a role change leaves the email untouched; a blank email removes it
        send(admin, "PUT", "/api/users/" + accueilId, Map.of("role", "ACCUEIL")).andExpect(jsonPath("$.email").value("accueil@club.test"));
        send(admin, "PUT", "/api/users/" + accueilId, Map.of("email", "")).andExpect(status().isOk()).andExpect(jsonPath("$.email").isEmpty());
    }

    @Test
    @DisplayName("E-mail du compte : une adresse déjà utilisée par un autre utilisateur est refusée, sans tenir compte de la casse")
    void accountEmailIsUnique() throws Exception {
        setEmail("admin", "direction@club.test");
        send(admin, "POST", "/api/users", Map.of("username", "second", "password", "Second2026", "role", "ADMIN", "email", "Direction@Club.test"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"))
                .andExpect(jsonPath("$.message").value("Cette adresse e-mail est déjà utilisée par l'utilisateur « admin »."));
        send(admin, "PUT", "/api/users/" + userId("accueil"), Map.of("email", "direction@club.test"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"));
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        send(accueil, "PUT", "/api/auth/me", Map.of("email", "DIRECTION@club.test"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("email"));

        // the holder may save its own unchanged address
        send(admin, "PUT", "/api/auth/me", Map.of("email", "direction@club.test")).andExpect(status().isOk());
        send(admin, "POST", "/api/users", Map.of("username", "second", "password", "Second2026", "role", "ADMIN", "email", "second@club.test"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Téléphone du compte : facultatif, vérifié selon le pays, modifiable par l'admin et par l'utilisateur")
    void accountPhone() throws Exception {
        send(admin, "POST", "/api/users", Map.of("username", "sanstel", "password", "Sanstel2026", "role", "ACCUEIL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").isEmpty());
        send(admin, "POST", "/api/users", Map.of("username", "avectel", "password", "Avectel2026", "role", "ACCUEIL", "phone", "123"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("phone"));
        send(admin, "POST", "/api/users", Map.of("username", "avectel", "password", "Avectel2026", "role", "ACCUEIL", "phone", "06 61 11 22 33"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").value("0661112233"));

        long id = userId("avectel");
        send(admin, "PUT", "/api/users/" + id, Map.of("active", false)).andExpect(jsonPath("$.phone").value("0661112233"));
        send(admin, "PUT", "/api/users/" + id, Map.of("phone", "")).andExpect(status().isOk()).andExpect(jsonPath("$.phone").isEmpty());

        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        send(accueil, "PUT", "/api/auth/me", Map.of("phone", "0661445566")).andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("0661445566"));
        // updating only the phone leaves the email untouched, and vice versa
        send(accueil, "PUT", "/api/auth/me", Map.of("email", "accueil@club.test")).andExpect(jsonPath("$.phone").value("0661445566"));
    }

    @Test
    @DisplayName("Rôles : nom libre rattaché à un niveau d'accès qui fixe les droits réels")
    void customRoles() throws Exception {
        List<String> levels = read(get(admin, "/api/roles").andExpect(status().isOk()), "$[?(@.name in ['ADMIN', 'ACCUEIL'])].accessLevel");
        assertThat(levels).containsExactlyInAnyOrder("ADMIN", "ACCUEIL");
        long coach = ((Number) read(send(admin, "POST", "/api/roles", Map.of("name", "Coach", "accessLevel", "ACCUEIL")).andExpect(status().isOk()), "$.id")).longValue();
        send(admin, "POST", "/api/roles", Map.of("name", "coach", "accessLevel", "ADMIN"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("name"));
        send(admin, "POST", "/api/roles", Map.of("name", "Sans niveau")).andExpect(status().isBadRequest());

        send(admin, "POST", "/api/users", Map.of("username", "karim", "password", "Karim2026x", "roleId", coach))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ACCUEIL")).andExpect(jsonPath("$.roleName").value("Coach"));
        MockHttpSession karim = login("karim", "Karim2026x", "Karim2027x");
        get(karim, "/api/members").andExpect(status().isOk());
        get(karim, "/api/users").andExpect(status().isForbidden());
        get(karim, "/api/roles").andExpect(status().isForbidden());

        // raising the role's level takes effect on the next login (the current session is closed)
        send(admin, "PUT", "/api/roles/" + coach, Map.of("name", "Coach principal", "accessLevel", "ADMIN")).andExpect(status().isOk())
                .andExpect(jsonPath("$.userCount").value(1));
        get(karim, "/api/members").andExpect(status().isUnauthorized());
        MockHttpSession karim2 = (MockHttpSession) mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", "karim", "password", "Karim2027x")))).andExpect(status().isOk())
                .andExpect(jsonPath("$.roleName").value("Coach principal")).andReturn().getRequest().getSession();
        get(karim2, "/api/users").andExpect(status().isOk());

        // a role in use cannot be deleted; an unused one can
        send(admin, "DELETE", "/api/roles/" + coach, null).andExpect(status().isConflict());
        long compta = ((Number) read(send(admin, "POST", "/api/roles", Map.of("name", "Comptable", "accessLevel", "ADMIN")), "$.id")).longValue();
        send(admin, "DELETE", "/api/roles/" + compta, null).andExpect(status().isNoContent());
        send(accueilSession(), "POST", "/api/roles", Map.of("name", "Pirate", "accessLevel", "ADMIN")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Rôles : on ne peut pas retirer l'accès administrateur à son propre rôle ni au dernier administrateur actif")
    void customRolesKeepAnAdmin() throws Exception {
        long adminRole = id("/api/roles", "$[?(@.name=='ADMIN')].id");
        send(admin, "PUT", "/api/roles/" + adminRole, Map.of("name", "ADMIN", "accessLevel", "ACCUEIL"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("accessLevel"));

        long gerant = ((Number) read(send(admin, "POST", "/api/roles", Map.of("name", "Gérant", "accessLevel", "ADMIN")), "$.id")).longValue();
        send(admin, "PUT", "/api/users/" + userId("accueil"), Map.of("roleId", gerant)).andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"));
        send(admin, "PUT", "/api/users/" + userId("admin"), Map.of("roleId", gerant)).andExpect(status().isOk());
        // admin now holds "Gérant": the old ADMIN role may be renamed and downgraded
        send(admin, "PUT", "/api/roles/" + adminRole, Map.of("name", "Ancien admin", "accessLevel", "ACCUEIL")).andExpect(status().isOk());
        // own role: refused
        send(admin, "PUT", "/api/roles/" + gerant, Map.of("name", "Gérant", "accessLevel", "ACCUEIL"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Vous ne pouvez pas retirer l'accès administrateur à votre propre rôle."));
    }

    @Test
    @DisplayName("Photo du profil : JPG ou PNG de 2 Mo maximum, déposée et retirée par l'utilisateur lui-même")
    void accountPhoto() throws Exception {
        MockHttpSession accueil = accueilSession();
        get(accueil, "/api/auth/me/photo").andExpect(status().isNotFound());
        mvc.perform(multipart("/api/auth/me/photo").file(new MockMultipartFile("file", "p.gif", "image/gif", new byte[]{'G', 'I', 'F', '8', '9', 'a'})).session(accueil))
                .andExpect(status().isBadRequest());
        byte[] photo = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4};
        mvc.perform(multipart("/api/auth/me/photo").file(new MockMultipartFile("file", "p.jpg", "image/jpeg", photo)).session(accueil))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasPhoto").value(true));
        assertThat(get(accueil, "/api/auth/me/photo").andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).isEqualTo(photo);
        get(admin, "/api/users/" + userId("accueil") + "/photo").andExpect(status().isOk());
        get(accueil, "/api/users/" + userId("accueil") + "/photo").andExpect(status().isForbidden());

        send(accueil, "DELETE", "/api/auth/me/photo", null).andExpect(status().isOk()).andExpect(jsonPath("$.hasPhoto").value(false));
        get(accueil, "/api/auth/me/photo").andExpect(status().isNotFound());
    }

    MockHttpSession accueilSession() throws Exception {
        return login("accueil", "accueil123", "Accueil2026");
    }

    @Test
    @DisplayName("Paramètres › Brevo config : la clé Brevo n'est jamais renvoyée ; vide = conservée, saisie = remplacée")
    void mailSettingsSecret() throws Exception {
        get(admin, "/api/settings")
                .andExpect(jsonPath("$.groups.mail").value("Brevo config"))
                .andExpect(jsonPath("$.values['mail.brevo.apiKey']").value(""))
                .andExpect(jsonPath("$.secretsSet['mail.brevo.apiKey']").value(false))
                .andExpect(jsonPath("$.values['mail.smtp.host']").value("smtp-relay.brevo.com"))
                .andExpect(jsonPath("$.values['mail.smtp.port']").value("587"))
                .andExpect(jsonPath("$.values['mail.smtp.security']").value("STARTTLS"));

        String saved = body(send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "club@gym.test",
                "mail.brevo.apiKey", "xkeysib-first", "mail.smtp.host", "smtp.gym.test", "mail.smtp.port", "465", "mail.smtp.security", "SSL")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values['mail.brevo.apiKey']").value(""))
                .andExpect(jsonPath("$.secretsSet['mail.brevo.apiKey']").value(true)));
        assertThat(saved).doesNotContain("xkeysib-first");
        assertThat(body(get(admin, "/api/settings"))).doesNotContain("xkeysib-first");
        assertThat(settingsService.mail().apiKey()).isEqualTo("xkeysib-first");
        assertThat(settingsService.mail().smtpPort()).isEqualTo(465);

        // the form sends the whole tab with an empty key field: the stored key is kept
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "accueil@gym.test", "mail.brevo.apiKey", "")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.secretsSet['mail.brevo.apiKey']").value(true));
        assertThat(settingsService.mail().apiKey()).isEqualTo("xkeysib-first");
        assertThat(settingsService.mail().from()).isEqualTo("accueil@gym.test");

        setting("mail.brevo.apiKey", "xkeysib-second");
        assertThat(settingsService.mail().apiKey()).isEqualTo("xkeysib-second");

        // field-level validation
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "abc")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("mail.from"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.smtp.port", "70000")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("mail.smtp.port"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.smtp.host", "smtp gym")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("mail.smtp.host"));
        send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.smtp.security", "TLS13")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("mail.smtp.security"));
        assertThat(settingsService.mail().from()).isEqualTo("accueil@gym.test");

        // reset clears the key too
        send(admin, "POST", "/api/settings/reset/mail", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.secretsSet['mail.brevo.apiKey']").value(false))
                .andExpect(jsonPath("$.values['mail.from']").value(""))
                .andExpect(jsonPath("$.values['mail.smtp.port']").value("587"));
        assertThat(settingsService.mail().apiKey()).isEmpty();
    }

    @Test
    @DisplayName("Paramètres › Brevo config : l'envoi suivant utilise l'expéditeur et la clé enregistrés, sans redémarrage")
    void mailSettingsApplyAtNextSend() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<String> payload = new AtomicReference<>();
        server.createContext("/v3/smtp/email", exchange -> {
            key.set(exchange.getRequestHeaders().getFirst("api-key"));
            payload.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(201, -1);
            exchange.close();
        });
        server.start();
        try {
            // same constructor Spring uses, with blank environment values and a local URL (http: no proxy)
            BrevoEmailSender sender = new BrevoEmailSender("http://localhost:" + server.getAddress().getPort() + "/v3/smtp/email",
                    "", "", settingsService);
            assertThat(sender.isConfigured()).isFalse();

            send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "club@gym.test", "mail.brevo.apiKey", "xkeysib-one")))
                    .andExpect(status().isOk());
            assertThat(sender.isConfigured()).isTrue();
            sender.send("a@club.test", "s", "t");
            assertThat(key.get()).isEqualTo("xkeysib-one");
            assertThat(payload.get()).contains("club@gym.test");

            send(admin, "PUT", "/api/settings", Map.of("values", Map.of("mail.from", "autre@gym.test", "mail.brevo.apiKey", "xkeysib-two")))
                    .andExpect(status().isOk());
            sender.send("a@club.test", "s", "t");
            assertThat(key.get()).isEqualTo("xkeysib-two");
            assertThat(payload.get()).contains("autre@gym.test");
        } finally {
            server.stop(0);
        }
    }
}
