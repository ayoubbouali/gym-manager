package com.gymmanager.gym.web;

import com.gymmanager.gym.domain.Member;
import com.gymmanager.gym.domain.Sport;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.repository.SportRepository;
import com.gymmanager.gym.repository.StaffRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Runs on the demo data seeded at startup. */
@SpringBootTest
@AutoConfigureMockMvc
class PublicSiteControllerTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    MemberRepository members;
    @Autowired
    StaffRepository staff;
    @Autowired
    SportRepository sports;
    @Autowired
    PublicSiteService site;

    @Test
    @DisplayName("Les données du site vitrine sont lisibles sans être connecté")
    void readableWithoutSession() throws Exception {
        mvc.perform(get("/api/public/site"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.club.name").isNotEmpty())
                .andExpect(jsonPath("$.sports").isNotEmpty())
                .andExpect(jsonPath("$.sports[0].schedules").isArray());
    }

    @Test
    @DisplayName("Le site vitrine n'expose ni adhérent ni nom complet du personnel")
    void exposesNoPrivateData() throws Exception {
        String body = mvc.perform(get("/api/public/site")).andReturn().getResponse().getContentAsString();

        List<Member> all = members.findAll();
        assertThat(all).as("le jeu de démonstration doit contenir des adhérents").isNotEmpty();
        for (Member m : all) {
            assertThat(body).as("adhérent %s", m.getCode()).doesNotContain(m.getCode());
            if (m.getPhone() != null && !m.getPhone().isBlank()) assertThat(body).doesNotContain(m.getPhone());
        }
        for (Staff s : staff.findAll()) {
            if (s.getLastName() != null && s.getLastName().length() > 1) {
                assertThat(body).as("nom du personnel %s", s.getCode()).doesNotContain("\"" + s.getFirstName() + " " + s.getLastName());
            }
            if (s.getPhone() != null && !s.getPhone().isBlank()) assertThat(body).doesNotContain(s.getPhone());
        }
        assertThat(body).doesNotContain("salary", "revenue", "payroll", "managerShare");
    }

    @Test
    @DisplayName("Un coach apparaît sous la forme « Prénom N. »")
    void coachShortName() {
        assertThat(PublicSiteService.shortName("hamza", "Benali")).isEqualTo("Hamza B.");
        assertThat(PublicSiteService.shortName("Aziz", "")).isEqualTo("Aziz");
        assertThat(PublicSiteService.initials("oumaima", "alaoui")).isEqualTo("OA");
    }

    @Test
    @DisplayName("Le flux du site envoie la version courante dès l'ouverture, puis chaque nouvelle version")
    void streamPushesNewVersions() throws Exception {
        String before = site.refresh().version();
        MvcResult stream = mvc.perform(get("/api/public/site/events")).andExpect(request().asyncStarted()).andReturn();
        assertThat(stream.getResponse().getContentType()).startsWith("text/event-stream");
        assertThat(stream.getResponse().getContentAsString()).contains("event:site", "data:" + before);

        Sport sport = sports.findAll().stream().filter(Sport::isActive).findFirst().orElseThrow();
        String name = sport.getName();
        try {
            sport.setName(name + " (renommé)");
            sports.save(sport);
            String after = site.refresh().version();

            assertThat(after).isNotEqualTo(before);
            assertThat(stream.getResponse().getContentAsString()).contains("data:" + after);
            mvc.perform(get("/api/public/site")).andExpect(jsonPath("$.version").value(after))
                    .andExpect(jsonPath("$.sports[?(@.name == '%s')]", name + " (renommé)").exists());
        } finally {
            sport.setName(name);
            sports.save(sport);
            site.refresh();
        }
    }

    @Test
    @DisplayName("Seule une écriture réussie de l'administration fait recalculer le site")
    void onlySuccessfulWritesRefresh() {
        PublicSiteService feed = mock(PublicSiteService.class);
        SiteChangeInterceptor interceptor = new SiteChangeInterceptor(feed);
        MockHttpServletResponse ok = new MockHttpServletResponse();
        MockHttpServletResponse rejected = new MockHttpServletResponse();
        rejected.setStatus(400);

        interceptor.afterCompletion(new MockHttpServletRequest("GET", "/api/sports"), ok, null, null);
        interceptor.afterCompletion(new MockHttpServletRequest("PUT", "/api/sports/1"), rejected, null, null);
        verify(feed, never()).changed();

        interceptor.afterCompletion(new MockHttpServletRequest("PUT", "/api/sports/1"), ok, null, null);
        verify(feed).changed();
    }
}
