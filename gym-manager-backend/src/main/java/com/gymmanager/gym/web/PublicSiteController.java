package com.gymmanager.gym.web;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.Staff;
import com.gymmanager.gym.repository.StaffRepository;
import com.gymmanager.gym.web.PublicSiteService.Site;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;

/** Public showcase site: its data, the stream announcing each change, and the images it shows. */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicSiteController {
    private final PublicSiteService site;
    private final FileStorage files;
    private final StaffRepository staffRepo;

    /** The page asks again with {@code ?v=<version>} when told of a change, so the browser cache never serves the old one. */
    @GetMapping("/site")
    public ResponseEntity<Site> site() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(PublicSiteService.TTL).cachePublic()).body(site.current());
    }

    @GetMapping(path = "/site/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> events() {
        // Tells a buffering reverse proxy to forward each event as soon as it is written.
        return ResponseEntity.ok().header("X-Accel-Buffering", "no").cacheControl(CacheControl.noStore()).body(site.subscribe());
    }

    /** Photo of a coach shown on the site; any other staff member's photo stays private (404). */
    @GetMapping("/coaches/{id}/photo")
    public ResponseEntity<Resource> coachPhoto(@PathVariable Long id) {
        boolean shown = site.current().coaches().stream().anyMatch(c -> c.id().equals(id));
        String name = shown ? staffRepo.findById(id).map(Staff::getPhoto).orElse(null) : null;
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.maxAge(PublicSiteService.TTL).cachePublic()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** The club logo, public on the showcase site (the admin route requires a session). */
    @GetMapping("/logo")
    public ResponseEntity<Resource> logo() {
        String name = site.logoFile();
        return files.find(name)
                .<ResponseEntity<Resource>>map(p -> ResponseEntity.ok().contentType(FileStorage.mediaType(name))
                        .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(new FileSystemResource(p)))
                .orElse(ResponseEntity.notFound().build());
    }
}
