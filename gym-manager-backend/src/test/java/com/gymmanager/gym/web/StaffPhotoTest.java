package com.gymmanager.gym.web;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.PayMode;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.service.ClubStateService;
import com.gymmanager.gym.service.StaffService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Runs on the demo data seeded at startup. */
@SpringBootTest
@AutoConfigureMockMvc
class StaffPhotoTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    StaffService service;
    @Autowired
    StaffRepository staff;
    @Autowired
    ClubStateService state;
    @Autowired
    FileStorage files;

    private static MockMultipartFile png() throws Exception {
        return new MockMultipartFile("file", "photo.png", "image/png",
                new ClassPathResource("static/test-cache/pixel.png").getContentAsByteArray());
    }

    private Long coachId() {
        return state.load().staff().stream()
                .filter(s -> s.active() && !s.sportIds().isEmpty())
                .findFirst().orElseThrow().id();
    }

    @Test
    @DisplayName("La photo d'un coach s'ajoute, se lit sur le site vitrine, puis se retire")
    void coachPhotoLifecycle() throws Exception {
        Long id = coachId();
        service.setPhoto(id, png());
        String stored = service.photoName(id);
        assertThat(stored).startsWith("staff-" + id + "-").endsWith(".png");
        assertThat(state.load().staffMember(id).orElseThrow().hasPhoto()).isTrue();

        mvc.perform(get("/api/public/coaches/" + id + "/photo"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"));

        service.deletePhoto(id);
        assertThat(service.photoName(id)).isNull();
        assertThat(files.find(stored)).isEmpty();
        mvc.perform(get("/api/public/coaches/" + id + "/photo")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("La photo d'un membre du personnel qui n'est pas coach reste privée")
    void nonCoachPhotoStaysPrivate() throws Exception {
        Staff s = new Staff();
        s.setCode("TPHOTO");
        s.setLastName("Accueil");
        s.setFirstName("Photo");
        s.setPayMode(PayMode.FIXED);
        s.setFixedSalary(BigDecimal.ZERO);
        s.setFunctionId(state.load().functions().getFirst().id());
        Long id = staff.save(s).getId();
        service.setPhoto(id, png());

        mvc.perform(get("/api/public/coaches/" + id + "/photo")).andExpect(status().isNotFound());
        mvc.perform(get("/api/staff/" + id + "/photo")).andExpect(status().isUnauthorized());

        String stored = service.photoName(id);
        service.delete(id);
        assertThat(files.find(stored)).as("la photo part avec la fiche").isEmpty();
    }
}
