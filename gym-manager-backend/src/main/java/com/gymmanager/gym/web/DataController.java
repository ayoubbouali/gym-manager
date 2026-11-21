package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.importer.BackupService;
import com.gymmanager.gym.importer.BaseDataService;
import com.gymmanager.gym.importer.DataResetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;

/** Data administration (ADMIN only): backup, restore and full reset. */
@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {
    private final BaseDataService baseData;
    private final BackupService backup;
    private final DataResetService reset;
    private final Clock clock;

    @GetMapping("/summary")
    public Map<String, Long> summary() {
        return reset.summary();
    }

    /** Downloads the full backup archive (data.json + uploaded photos and logo). */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export() {
        String name = "gym-manager-" + LocalDate.now(clock) + ".zip";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
                .body(backup.export());
    }

    /** Replaces all the current data by the backup's (all or nothing). User accounts are kept. */
    @PostMapping("/restore")
    public Map<String, Object> restore(@RequestParam(value = "file", required = false) MultipartFile file,
                                       @RequestParam(required = false) String confirm) {
        requireConfirm(confirm);
        return Map.of("restored", backup.restore(bytes(file)));
    }

    public record WipeRequest(String confirm) {
    }

    /** Deletes all the club data. User accounts, settings and logo are kept. */
    @PostMapping("/wipe")
    public Map<String, Object> wipe(@RequestBody WipeRequest r) {
        requireConfirm(r.confirm());
        return Map.of("deleted", baseData.wipe(), "remaining", reset.summary());
    }

    private static void requireConfirm(String confirm) {
        if (!"SUPPRIMER".equals(confirm == null ? null : confirm.trim().toUpperCase())) {
            throw ApiException.invalid("confirm", "Tapez SUPPRIMER pour confirmer la suppression de toutes les données actuelles.");
        }
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.invalid("file", "Aucun fichier reçu.");
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("Lecture du fichier impossible.");
        }
    }
}
