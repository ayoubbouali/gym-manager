package com.gymmanager.gym.web;

import com.gymmanager.gym.domain.Member;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.MemberRepository;
import com.gymmanager.gym.repository.StaffRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
        assertThat(PublicSiteController.shortName("hamza", "Benali")).isEqualTo("Hamza B.");
        assertThat(PublicSiteController.shortName("Aziz", "")).isEqualTo("Aziz");
        assertThat(PublicSiteController.initials("oumaima", "alaoui")).isEqualTo("OA");
    }
}
