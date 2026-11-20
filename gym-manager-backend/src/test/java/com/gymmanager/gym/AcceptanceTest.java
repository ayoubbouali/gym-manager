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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-11-18T10:00:00Z"), ZoneOffset.UTC);
        }
    }

    @Autowired
    MockMvc mvc;

    MockHttpSession admin;

    @BeforeEach
    void loginAdmin() throws Exception {
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

        // pack generator, then a member registered within the salary window (1 → 23 of the current month)
        long monthly = id("/api/durations", "$[?(@.label=='Mensuel')].id");
        send(admin, "POST", "/api/packs/generate", Map.of("sportId", sport, "items", List.of(
                Map.of("durationId", monthly, "name", "Natation - Mensuel")))).andExpect(status().isOk());
        long pack = id("/api/packs", "$[?(@.name=='Natation - Mensuel')].id");

        assertThat((List<Object>) read(get(admin, "/api/staff"), "$.rows[?(@.name=='Nadia Coach')].salary")).containsExactly(0.0);
        send(admin, "POST", "/api/members", member("Bennis", "Lina", "0612000001", sport, pack, null, "2026-11-10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A017")).andExpect(jsonPath("$.price").value(500.0));

        assertThat((List<Object>) read(get(admin, "/api/members"), "$[?(@.code=='A017')].sports[0].name")).containsExactly("Natation");
        assertThat((List<Object>) read(get(admin, "/api/staff"), "$.rows[?(@.name=='Nadia Coach')].sports[0].name")).containsExactly("Natation");
        assertThat((List<Object>) read(get(admin, "/api/dashboard"), "$.bySport[?(@.name=='Natation')].count")).containsExactly(1);
        // CA per sport = cashed amounts: nothing until the member pays
        assertThat((List<Object>) read(get(admin, "/api/stats"), "$.bySport[?(@.name=='Natation')].amount")).containsExactly(0.0);
        long a017 = id("/api/members", "$[?(@.code=='A017')].id");
        send(admin, "POST", "/api/payments", Map.of("memberId", a017, "amount", 500, "method", "CARTE", "paidOn", "2026-11-10")).andExpect(status().isOk());
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
        String hamza = "$.rows[?(@.code=='E001')].salary";
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(100.0);   // 1/3 × 300
        setting("salary.share", "40");
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(120.0);   // 40 % × 300
        setting("salary.endDay", "25");
        assertThat((List<Object>) read(get(admin, "/api/staff"), hamza)).containsExactly(240.0);   // 40 % × 600

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
                .andExpect(jsonPath("$.price").value(729.0)).andExpect(jsonPath("$.endDate").value("2027-02-18"));
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
    @DisplayName("Critère 9 : ACCUEIL n'accède ni au Personnel, ni aux Statistiques, ni aux Paramètres")
    void accueilRole() throws Exception {
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        for (String url : List.of("/api/staff", "/api/stats", "/api/settings", "/api/users", "/api/functions", "/api/payroll")) {
            get(accueil, url).andExpect(status().isForbidden());
        }
        send(accueil, "PUT", "/api/settings", Map.of("values", Map.of("club.name", "X"))).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/discounts", Map.of("name", "X", "percent", 5)).andExpect(status().isForbidden());
        get(accueil, "/api/members").andExpect(status().isOk());
        get(accueil, "/api/alerts").andExpect(status().isOk());
        long karate = id("/api/sports", "$[?(@.name=='Karaté')].id");
        long pack = id("/api/packs", "$[?(@.name=='Karaté - Mensuel')].id");
        send(accueil, "POST", "/api/members", member("Accueil", "Ajout", "0612000007", karate, pack, null, "2026-11-18"))
                .andExpect(status().isOk());
        assertThat(body(get(accueil, "/api/sports"))).doesNotContain("salary");
        // ACCUEIL records payments but cannot correct or cancel them
        long a001 = id("/api/members", "$[?(@.code=='A001')].id");
        long pay = ((Number) read(send(accueil, "POST", "/api/payments", Map.of("memberId", a001, "amount", 100, "method", "ESPECES")), "$.id")).longValue();
        get(accueil, "/api/payments/" + pay + "/receipt.pdf").andExpect(status().isOk());
        send(accueil, "PUT", "/api/payments/" + pay, Map.of("amount", 50, "method", "ESPECES", "paidOn", "2026-11-18")).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/payments/" + pay + "/cancel", Map.of("reason", "x")).andExpect(status().isForbidden());
        send(accueil, "POST", "/api/payroll/payments", Map.of("staffId", 1, "period", "2026-11", "amount", 10, "method", "ESPECES")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Paiements partiels, reçus numérotés, modification et annulation")
    void payments() throws Exception {
        String a001 = "$[?(@.code=='A001')]";
        long id = id("/api/members", a001 + ".id");
        assertThat((List<Object>) read(get(admin, "/api/members"), a001 + ".paymentStatus")).containsExactly("IMPAYE");
        String receipt = read(send(admin, "POST", "/api/payments", Map.of("memberId", id, "amount", 200, "method", "ESPECES", "paidOn", "2026-11-15")), "$.receiptNumber");
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

        // a member with payments is kept for accounting
        send(admin, "DELETE", "/api/members/" + id, null).andExpect(status().isConflict());
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
        long current = id("/api/members", "$[?(@.code=='A001')].subscriptionId");
        send(admin, "DELETE", "/api/subscriptions/" + current, null).andExpect(status().isConflict());

        // a renewal without payment can be removed
        long a002 = id("/api/members", "$[?(@.code=='A002')].id");
        long pack = id("/api/packs", "$[?(@.name=='Aérobic - Mensuel')].id");
        long sub = ((Number) read(send(admin, "POST", "/api/members/" + a002 + "/renew", Map.of("packId", pack)), "$.id")).longValue();
        send(admin, "DELETE", "/api/subscriptions/" + sub, null).andExpect(status().isNoContent());
        get(admin, "/api/members/by-code/A002").andExpect(jsonPath("$.subscriptions.length()").value(1));
        // a pack of another sport is refused
        long boxe = id("/api/packs", "$[?(@.name=='Boxe - Mensuel')].id");
        send(admin, "POST", "/api/members/" + a002 + "/renew", Map.of("packId", boxe)).andExpect(status().isBadRequest());
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
    @DisplayName("Import Excel : analyse sans écriture, puis remplacement de toutes les données")
    void excelImport() throws Exception {
        byte[] xlsx;
        try (var in = getClass().getResourceAsStream("/import/Gym_Manager.xlsx")) {
            xlsx = in.readAllBytes();
        }
        var file = new org.springframework.mock.web.MockMultipartFile("file", "Gym_Manager.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx);

        // ACCUEIL cannot import
        MockHttpSession accueil = login("accueil", "accueil123", "Accueil2026");
        mvc.perform(multipart("/api/data/import/analyze").file(file).session(accueil)).andExpect(status().isForbidden());

        var analysis = mvc.perform(multipart("/api/data/import/analyze").file(file).session(admin)).andExpect(status().isOk());
        analysis.andExpect(jsonPath("$.executed").value(false))
                .andExpect(jsonPath("$.counts.sports").value(7)).andExpect(jsonPath("$.counts.members").value(15))
                .andExpect(jsonPath("$.counts.staff").value(7)).andExpect(jsonPath("$.errors.length()").value(0))
                .andExpect(jsonPath("$.existing.members").value(16));
        // nothing written by the analysis
        assertThat((List<Object>) read(get(admin, "/api/members"), "$[*].code")).hasSize(16);

        mvc.perform(multipart("/api/data/import/execute").file(file).param("confirm", "non").session(admin)).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/data/import/execute").file(file).param("confirm", "SUPPRIMER").param("paymentMethod", "CARTE").session(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.executed").value(true));

        get(admin, "/api/data/summary").andExpect(jsonPath("$.members").value(15)).andExpect(jsonPath("$.sports").value(7))
                .andExpect(jsonPath("$.activities").value(0)).andExpect(jsonPath("$.salaryPayments").value(0));
        get(admin, "/api/members/by-code/A003").andExpect(jsonPath("$.member.firstName").value("Omar"))
                .andExpect(jsonPath("$.member.sports[0].name").value("Cross-Training"))
                .andExpect(jsonPath("$.member.pack.name").value("Cross-Training - Annuel"));
        assertThat((List<Object>) read(get(admin, "/api/sports"), "$[*].code")).containsExactly("SP01", "SP02", "SP03", "SP04", "SP05", "SP06", "SP07");
        assertThat((List<Object>) read(get(admin, "/api/sports"), "$[?(@.name=='Yoga')].coaches[0].name")).containsExactly("Imane");
        // receipts are numbered in date order and use the chosen payment method
        List<String> numbers = read(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"), "$[*].receiptNumber");
        List<String> dates = read(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"), "$[*].paidOn");
        assertThat(numbers).isNotEmpty();
        assertThat(dates).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(numbers).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat((List<Object>) read(get(admin, "/api/payments?from=2020-01-01&to=2026-11-18"), "$[*].method")).containsOnly("CARTE");
        // users are kept: the admin session still works; a new member continues the numbering
        long sport = id("/api/sports", "$[?(@.name=='Yoga')].id");
        long pack = id("/api/packs", "$[?(@.name=='Yoga - Mensuel')].id");
        send(admin, "POST", "/api/members", member("Nouveau", "Membre", "0612000009", sport, pack, null, "2026-11-18"))
                .andExpect(jsonPath("$.code").value("A016"));

        // full reset
        send(admin, "POST", "/api/data/wipe", Map.of("confirm", "oui")).andExpect(status().isBadRequest());
        send(admin, "POST", "/api/data/wipe", Map.of("confirm", "SUPPRIMER")).andExpect(status().isOk());
        get(admin, "/api/data/summary").andExpect(jsonPath("$.members").value(0)).andExpect(jsonPath("$.payments").value(0));
        // base referentials are recreated: the club stays usable
        assertThat((List<Object>) read(get(admin, "/api/discounts"), "$[?(@.system == true)].name")).containsExactly("Aucune");
        assertThat((List<Object>) read(get(admin, "/api/durations"), "$[*].label")).containsExactly("Mensuel", "Trimestriel", "Annuel");
        assertThat((List<Object>) read(get(admin, "/api/functions"), "$[*].label")).containsExactlyInAnyOrder("Coach", "Accueil", "Entretien");
        assertThat((List<Object>) read(get(admin, "/api/users"), "$[*].username")).contains("admin", "accueil");
    }

    @Test
    @DisplayName("Paie : salaire dû, acomptes, reçus de salaire, mois précédents")
    void payroll() throws Exception {
        get(admin, "/api/payroll?month=2026-10").andExpect(jsonPath("$.rows[?(@.staff.code=='E006')].status").value("PAYE"));
        String e006 = "$.rows[?(@.staff.code=='E006')]";
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".due").value(4500.0)).andExpect(jsonPath(e006 + ".status").value("IMPAYE"))
                .andExpect(jsonPath("$.rows[?(@.staff.code=='E002')].due").value(83.33))  // Oumaima: 1/3 × 250 (renewal on 10/11)
                .andExpect(jsonPath("$.currentMonth").value(true));
        long bouzid = id("/api/staff", "$.rows[?(@.code=='E006')].id");
        var r = send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "amount", 2000, "method", "ESPECES", "note", "Acompte"))
                .andExpect(status().isOk());
        assertThat((String) read(r, "$.slipNumber")).isEqualTo("SAL-2026-0006");
        long slip = ((Number) read(r, "$.id")).longValue();
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".status").value("PARTIEL")).andExpect(jsonPath(e006 + ".balance").value(2500.0));
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-11", "amount", 3000, "method", "ESPECES"))
                .andExpect(status().isBadRequest());
        send(admin, "POST", "/api/payroll/payments", Map.of("staffId", bouzid, "period", "2026-12", "amount", 10, "method", "ESPECES"))
                .andExpect(status().isBadRequest());
        var pdf = get(admin, "/api/payroll/payments/" + slip + "/receipt.pdf").andExpect(status().isOk()).andReturn().getResponse();
        assertThat(new String(pdf.getContentAsByteArray(), 0, 5)).isEqualTo("%PDF-");
        assertThat((List<Object>) read(get(admin, "/api/payroll/staff/" + bouzid + "/history"), "$[*].period")).containsExactly("2026-11", "2026-10");
        send(admin, "POST", "/api/payroll/payments/" + slip + "/cancel", Map.of("reason", "Erreur")).andExpect(status().isOk());
        get(admin, "/api/payroll?month=2026-11").andExpect(jsonPath(e006 + ".status").value("IMPAYE"));
        send(admin, "DELETE", "/api/staff/" + bouzid, null).andExpect(status().isConflict());
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
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Un adhérent avec ce nom, ce prénom et ce téléphone existe déjà."));

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
}
