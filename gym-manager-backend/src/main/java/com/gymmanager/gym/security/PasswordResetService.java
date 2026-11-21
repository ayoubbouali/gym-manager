package com.gymmanager.gym.security;

import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.repository.AppUserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.task.TaskExecutor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Mot de passe oublié": emails a temporary password that works alongside the current one
 * until it is used (it then replaces it and forces a change) or expires.
 * The request thread only does the in-memory rate check, so the HTTP response never depends
 * on whether the account exists; lookup, hashing and sending run on the task executor.
 */
@Slf4j
@Service
public class PasswordResetService {
    static final Duration TEMP_VALIDITY = Duration.ofMinutes(30);
    static final Duration RATE_WINDOW = Duration.ofHours(1);
    static final int MAX_PER_USERNAME = 3;
    static final int MAX_PER_IP = 10;
    private static final int TEMP_LENGTH = 12;
    private static final String SUBJECT = "Gym Manager : votre mot de passe provisoire";
    // no look-alike characters (0/O, 1/l/I)
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final TaskExecutor executor;
    private final TransactionTemplate tx;
    private final EmailSender emailSender;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public PasswordResetService(AppUserRepository users, PasswordEncoder encoder, Clock clock, TaskExecutor executor,
                                PlatformTransactionManager txManager, EmailSender emailSender) {
        this.users = users;
        this.encoder = encoder;
        this.clock = clock;
        this.executor = executor;
        this.tx = new TransactionTemplate(txManager);
        this.emailSender = emailSender;
    }

    /** Never throws and never reveals anything: the caller always answers the same way. */
    public void requestReset(String username, String ip) {
        String name = username == null ? "" : username.trim();
        if (name.isEmpty() || name.length() > 50) return;
        if (!tryAcquire(name.toLowerCase(Locale.ROOT), ip)) {
            log.info("Password reset rate limit reached (ip {})", ip);
            return;
        }
        try {
            executor.execute(() -> process(name));
        } catch (RuntimeException e) {
            log.error("Password reset task rejected", e);
        }
    }

    private void process(String username) {
        try {
            if (!emailSender.isConfigured()) {
                log.warn("Password reset requested but mail is not configured (Paramètres › Brevo config, or BREVO_API_KEY / MAIL_FROM): nothing sent");
                return;
            }
            String temp = newTempPassword();
            Mail mail = tx.execute(status -> users.findByUsernameIgnoreCase(username)
                    .filter(AppUser::isActive)
                    .filter(u -> u.getEmail() != null && !u.getEmail().isBlank())
                    .map(u -> {
                        u.setTempPasswordHash(encoder.encode(temp));
                        u.setTempPasswordExpiresAt(now().plus(TEMP_VALIDITY));
                        return new Mail(u.getId(), u.getUsername(), u.getEmail());
                    })
                    .orElse(null));
            if (mail == null) return;
            emailSender.send(mail.email(), SUBJECT, text(mail, temp));
            log.info("Password reset email sent to user #{}", mail.userId());
        } catch (RuntimeException e) {
            log.error("Password reset email failed", e);
        }
    }

    private static String text(Mail mail, String temp) {
        return """
                Bonjour %s,

                Une demande de réinitialisation du mot de passe a été faite pour votre compte Gym Manager.

                Mot de passe provisoire : %s

                Il permet de vous connecter pendant 30 minutes. À la connexion, \
                vous devrez choisir un nouveau mot de passe.
                Votre mot de passe actuel reste valable tant que vous n'utilisez pas le mot de passe provisoire.

                Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
                """.formatted(mail.username(), temp);
    }

    /**
     * Login fallback when the current password did not match: a valid, unexpired temporary
     * password replaces it and forces a password change. Returns false otherwise.
     */
    public boolean consumeTemp(String username, String raw) {
        if (username == null || raw == null) return false;
        Boolean ok = tx.execute(status -> users.findByUsernameIgnoreCase(username.trim())
                .filter(u -> u.isActive() && u.getTempPasswordHash() != null && u.getTempPasswordExpiresAt() != null)
                .map(u -> {
                    if (!now().isBefore(u.getTempPasswordExpiresAt())) {
                        u.clearTempPassword();
                        return false;
                    }
                    if (!encoder.matches(raw, u.getTempPasswordHash())) return false;
                    u.setPasswordHash(u.getTempPasswordHash());
                    u.clearTempPassword();
                    u.setMustChangePassword(true);
                    return true;
                })
                .orElse(false));
        return Boolean.TRUE.equals(ok);
    }

    /** A successful login with the current password cancels any pending temporary password. */
    public void clearPending(String username) {
        tx.executeWithoutResult(status -> users.findByUsernameIgnoreCase(username)
                .filter(u -> u.getTempPasswordHash() != null || u.getTempPasswordExpiresAt() != null)
                .ifPresent(AppUser::clearTempPassword));
    }

    String newTempPassword() {
        String pw;
        do {
            StringBuilder sb = new StringBuilder(TEMP_LENGTH);
            for (int i = 0; i < TEMP_LENGTH; i++) sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            pw = sb.toString();
        } while (UserService.passwordError(pw) != null);
        return pw;
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock.withZone(ZoneOffset.UTC));
    }

    /** Sliding one-hour window, in memory (single instance). Every request counts, allowed or not. */
    private boolean tryAcquire(String username, String ip) {
        Instant now = clock.instant();
        if (attempts.size() > 10_000) {
            attempts.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    prune(e.getValue(), now);
                    return e.getValue().isEmpty();
                }
            });
        }
        int byUser = record("u:" + username, now);
        int byIp = record("ip:" + (ip == null ? "?" : ip), now);
        return byUser <= MAX_PER_USERNAME && byIp <= MAX_PER_IP;
    }

    private int record(String key, Instant now) {
        Deque<Instant> q = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q, now);
            q.addLast(now);
            return q.size();
        }
    }

    private static void prune(Deque<Instant> q, Instant now) {
        Instant limit = now.minus(RATE_WINDOW);
        while (!q.isEmpty() && !q.peekFirst().isAfter(limit)) q.pollFirst();
    }

    private record Mail(Long userId, String username, String email) {
    }
}
