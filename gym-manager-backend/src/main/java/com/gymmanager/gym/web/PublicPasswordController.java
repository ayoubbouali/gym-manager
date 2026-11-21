package com.gymmanager.gym.web;

import com.gymmanager.gym.security.PasswordResetService;
import com.gymmanager.gym.web.dto.Requests.ForgotPasswordRequest;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Public (unauthenticated) password recovery. */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicPasswordController {
    static final String MESSAGE = "Si cet identifiant correspond à un compte actif disposant d'une adresse e-mail, "
            + "un mot de passe provisoire valable 30 minutes vient d'y être envoyé.";

    private final PasswordResetService passwordReset;

    /** Same 202 and body whatever the account state, so the answer reveals nothing. */
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@RequestBody(required = false) ForgotPasswordRequest r, HttpServletRequest req) {
        passwordReset.requestReset(r == null ? null : r.username(), req.getRemoteAddr());
        return ResponseEntity.accepted().body(Map.of("message", MESSAGE));
    }
}
