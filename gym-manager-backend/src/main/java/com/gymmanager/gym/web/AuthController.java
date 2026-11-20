package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.security.UserService;
import com.gymmanager.gym.security.UserService.UserView;
import com.gymmanager.gym.web.dto.Requests.ChangePasswordRequest;
import com.gymmanager.gym.web.dto.Requests.LoginRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthenticationManager authManager;
    private final SecurityContextRepository contextRepository;
    private final UserService users;

    @PostMapping("/login")
    public UserView login(@RequestBody LoginRequest r, HttpServletRequest req, HttpServletResponse res) {
        if (r.username() == null || r.username().isBlank() || r.password() == null) {
            throw ApiException.badRequest("Saisissez votre identifiant et votre mot de passe.");
        }
        Authentication auth;
        try {
            auth = authManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(r.username().trim(), r.password()));
        } catch (AuthenticationException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Identifiant ou mot de passe incorrect, ou compte désactivé.", null, "BAD_CREDENTIALS");
        }
        HttpSession old = req.getSession(false);
        if (old != null) old.invalidate();
        req.getSession(true); // new session id (protection against session fixation)
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        contextRepository.saveContext(ctx, req, res);
        return users.byUsername(auth.getName());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        if (s != null) s.invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserView me(Principal principal) {
        return users.byUsername(principal.getName());
    }

    @PostMapping("/change-password")
    public UserView changePassword(@RequestBody ChangePasswordRequest r, Principal principal) {
        users.changeOwnPassword(principal.getName(), r.currentPassword(), r.newPassword());
        return users.byUsername(principal.getName());
    }
}
