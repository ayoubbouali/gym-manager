package com.gymmanager.gym.security;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.domain.Role;
import com.gymmanager.gym.repository.AppUserRepository;
import com.gymmanager.gym.web.dto.Requests.UserCreateRequest;
import com.gymmanager.gym.web.dto.Requests.UserUpdateRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Transactional
public class UserService {
    private final AppUserRepository users;
    private final PasswordEncoder encoder;

    public record UserView(Long id, String username, Role role, boolean active, boolean mustChangePassword, String email) {
        static UserView of(AppUser u) {
            return new UserView(u.getId(), u.getUsername(), u.getRole(), u.isActive(), u.isMustChangePassword(), u.getEmail());
        }
    }

    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");

    /** Optional email: blank becomes null, otherwise a basic format check. */
    public static String email(String value) {
        String v = Check.text(value, "email", "Adresse e-mail", 254, false);
        if (v.isEmpty()) return null;
        if (!EMAIL.matcher(v).matches()) throw ApiException.invalid("email", "Adresse e-mail invalide (exemple : prenom.nom@exemple.fr).");
        return v;
    }

    public static String passwordError(String pw) {
        if (pw == null || pw.length() < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
        if (!pw.matches(".*[A-Za-z].*") || !pw.matches(".*\\d.*")) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
        return null;
    }

    @Transactional(readOnly = true)
    public List<UserView> list() {
        return users.findAll().stream().sorted(Comparator.comparing(AppUser::getUsername)).map(UserView::of).toList();
    }

    public UserView create(UserCreateRequest r) {
        String username = Check.text(r.username(), "username", "Identifiant", 50, true);
        if (!username.matches("[A-Za-z0-9._-]{3,50}")) throw ApiException.invalid("username", "Identifiant : 3 à 50 caractères (lettres, chiffres, . _ -).");
        if (users.findByUsernameIgnoreCase(username).isPresent()) throw ApiException.invalid("username", "Cet identifiant existe déjà.");
        String err = passwordError(r.password());
        if (err != null) throw ApiException.invalid("password", err);
        AppUser u = new AppUser();
        u.setUsername(username);
        u.setPasswordHash(encoder.encode(r.password()));
        u.setRole(Check.required(r.role(), "role", "Rôle"));
        u.setEmail(email(r.email()));
        u.setMustChangePassword(true);
        return UserView.of(users.save(u));
    }

    public UserView update(Long id, UserUpdateRequest r, String currentUsername) {
        AppUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
        Role role = r.role() == null ? u.getRole() : r.role();
        boolean active = r.active() == null ? u.isActive() : r.active();
        boolean self = u.getUsername().equalsIgnoreCase(currentUsername);
        if (self && (!active || role != Role.ADMIN)) throw ApiException.badRequest("Vous ne pouvez pas désactiver ni rétrograder votre propre compte.");
        boolean losesAdmin = u.getRole() == Role.ADMIN && u.isActive() && (role != Role.ADMIN || !active);
        if (losesAdmin && users.countByRoleAndActiveTrue(Role.ADMIN) <= 1) throw ApiException.badRequest("Il doit rester au moins un administrateur actif.");
        String email = r.email() == null ? u.getEmail() : email(r.email());
        u.setRole(role);
        u.setActive(active);
        u.setEmail(email);
        return UserView.of(u);
    }

    public UserView updateOwnEmail(String username, String value) {
        AppUser u = users.findByUsernameIgnoreCase(username).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
        u.setEmail(email(value));
        return UserView.of(u);
    }

    /** Sets a temporary password; the user must change it at next login. */
    public void resetPassword(Long id, String password) {
        AppUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
        String err = passwordError(password);
        if (err != null) throw ApiException.invalid("password", err);
        u.setPasswordHash(encoder.encode(password));
        u.clearTempPassword();
        u.setMustChangePassword(true);
    }

    public void changeOwnPassword(String username, String current, String next) {
        AppUser u = users.findByUsernameIgnoreCase(username).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
        if (current == null || !encoder.matches(current, u.getPasswordHash())) {
            throw ApiException.invalid("currentPassword", "Mot de passe actuel incorrect.");
        }
        String err = passwordError(next);
        if (err != null) throw ApiException.invalid("newPassword", err);
        if (encoder.matches(next, u.getPasswordHash())) throw ApiException.invalid("newPassword", "Le nouveau mot de passe doit être différent de l'actuel.");
        u.setPasswordHash(encoder.encode(next));
        u.clearTempPassword();
        u.setMustChangePassword(false);
    }

    @Transactional(readOnly = true)
    public UserView byUsername(String username) {
        return users.findByUsernameIgnoreCase(username).map(UserView::of).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
    }
}
