package com.gymmanager.gym.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

/** Stores photos and logo on disk (outside the database), served by protected routes. */
@Component
public class FileStorage {
    public static final long MAX_BYTES = 2L * 1024 * 1024;
    private final Path root;

    public FileStorage(@Value("${app.data-dir}") String dataDir) {
        this.root = Path.of(dataDir, "uploads").toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Validates a JPG/PNG image (by its content) of at most 2 MB and stores it. Returns the stored file name. */
    public String saveImage(MultipartFile file, String prefix) {
        if (file == null || file.isEmpty()) throw ApiException.invalid("file", "Aucun fichier reçu.");
        if (file.getSize() > MAX_BYTES) throw ApiException.invalid("file", "Fichier trop volumineux (2 Mo maximum).");
        try {
            byte[] bytes = file.getBytes();
            String ext = detect(bytes).orElseThrow(() -> ApiException.invalid("file", "Format non accepté : JPG ou PNG uniquement."));
            String name = prefix + "-" + UUID.randomUUID() + "." + ext;
            Files.write(root.resolve(name), bytes);
            return name;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public Optional<Path> find(String name) {
        if (name == null || name.contains("/") || name.contains("\\") || name.contains("..")) return Optional.empty();
        Path p = root.resolve(name);
        return Files.isRegularFile(p) ? Optional.of(p) : Optional.empty();
    }

    public void delete(String name) {
        find(name).ifPresent(p -> {
            try {
                Files.deleteIfExists(p);
            } catch (IOException ignored) {
                // best effort
            }
        });
    }

    public static MediaType mediaType(String name) {
        return name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
    }

    private static Optional<String> detect(byte[] b) {
        if (b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return Optional.of("jpg");
        if (b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return Optional.of("png");
        return Optional.empty();
    }
}
