package com.gymmanager.gym.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fixtures live in src/test/resources/static/. */
@SpringBootTest
@AutoConfigureMockMvc
class StaticCacheTest {

    @Autowired
    MockMvc mvc;

    @Test
    @DisplayName("Un fichier Angular haché est mis en cache un an, de façon publique et immuable")
    void hashedFileIsImmutable() throws Exception {
        mvc.perform(get("/chunk-TESTHASH.js"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"));
    }

    @Test
    @DisplayName("Une image publique non hachée est mise en cache un jour, quel que soit son format")
    void unhashedImageIsCachedForADay() throws Exception {
        for (String path : new String[]{"/test-cache/pixel.png", "/test-cache/pixel.jpeg"}) {
            mvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "max-age=86400, public"));
        }
    }

    @Test
    @DisplayName("Un fichier non haché qui n'est pas une image doit être revalidé")
    void otherStaticFileIsRevalidated() throws Exception {
        mvc.perform(get("/test-cache/plain.js"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-cache"));
    }

    @Test
    @DisplayName("Une route Angular renvoie index.html, toujours revalidé pour qu'un déploiement soit vu")
    void spaRouteIsRevalidated() throws Exception {
        mvc.perform(get("/membres"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-cache"));
    }

    @Test
    @DisplayName("Un fichier haché absent n'est jamais mis en cache public")
    void missingHashedFileIsNotCached() throws Exception {
        String cacheControl = mvc.perform(get("/chunk-MISSING1.js"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getHeader("Cache-Control");
        assertThat(cacheControl).as("Cache-Control d'un 404").doesNotContain("public");
    }

    @Test
    @DisplayName("Une photo de membre, servie par l'API, n'est jamais mise en cache public")
    void memberPhotoIsNeverPublic() throws Exception {
        for (String path : new String[]{"/api/members/1/photo", "/api/club/logo", "/api/members/1/photo.png"}) {
            String cacheControl = mvc.perform(get(path))
                    .andReturn().getResponse().getHeader("Cache-Control");
            assertThat(cacheControl).as("Cache-Control de %s", path).isNotNull().doesNotContain("public");
        }
    }
}
