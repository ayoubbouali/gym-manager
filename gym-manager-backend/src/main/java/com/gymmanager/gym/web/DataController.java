package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.domain.Insurance;
import com.gymmanager.gym.domain.PaymentMethod;
import com.gymmanager.gym.importer.DataResetService;
import com.gymmanager.gym.importer.ImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.Principal;
import java.util.Map;

/** Data administration (ADMIN only): Excel import and full reset. */
@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {
    private final ImportService importer;
    private final DataResetService reset;

    @GetMapping("/summary")
    public Map<String, Long> summary() {
        return reset.summary();
    }

    /** Reads the workbook and returns what would be created — nothing is written. */
    @PostMapping("/import/analyze")
    public ImportService.Report analyze(@RequestParam("file") MultipartFile file,
                                        @RequestParam(required = false) PaymentMethod paymentMethod,
                                        @RequestParam(required = false) Insurance insurance) {
        return importer.analyze(bytes(file), file.getOriginalFilename(), new ImportService.Options(paymentMethod, insurance), reset.summary());
    }

    /** Deletes all the current data, then creates the data of the workbook (all or nothing). */
    @PostMapping("/import/execute")
    public ImportService.Report execute(@RequestParam("file") MultipartFile file,
                                        @RequestParam(required = false) PaymentMethod paymentMethod,
                                        @RequestParam(required = false) Insurance insurance,
                                        @RequestParam String confirm, Principal user) {
        requireConfirm(confirm);
        return importer.execute(bytes(file), file.getOriginalFilename(), new ImportService.Options(paymentMethod, insurance), user.getName());
    }

    public record WipeRequest(String confirm) {
    }

    /** Deletes all the club data. User accounts, settings and logo are kept. */
    @PostMapping("/wipe")
    public Map<String, Object> wipe(@RequestBody WipeRequest r) {
        requireConfirm(r.confirm());
        return Map.of("deleted", importer.wipe(), "remaining", reset.summary());
    }

    private static void requireConfirm(String confirm) {
        if (!"SUPPRIMER".equals(confirm == null ? null : confirm.trim().toUpperCase())) {
            throw ApiException.invalid("confirm", "Tapez SUPPRIMER pour confirmer la suppression de toutes les données actuelles.");
        }
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.invalid("file", "Aucun fichier reçu.");
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".xlsm")) {
            throw ApiException.invalid("file", "Format non accepté : choisissez un fichier Excel (.xlsx).");
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("Lecture du fichier impossible.");
        }
    }
}
