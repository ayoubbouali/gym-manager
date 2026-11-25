package com.gymmanager.gym.security;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.common.Check;
import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.domain.Permission;
import com.gymmanager.gym.domain.UserRole;
import com.gymmanager.gym.repository.AppUserRepository;
import com.gymmanager.gym.repository.UserRoleRepository;
import com.gymmanager.gym.settings.SettingsService;
import com.gymmanager.gym.web.dto.Requests.AccountUpdateRequest;
import com.gymmanager.gym.web.dto.Requests.UserCreateRequest;
import com.gymmanager.gym.web.dto.Requests.UserRoleRequest;
import com.gymmanager.gym.web.dto.Requests.UserUpdateRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class UserService {
    private final AppUserRepository users;
    private final UserRoleRepository roles;
    private final PasswordEncoder encoder;
    private final SettingsService settings;
    private final FileStorage files;

    /** {@code permissions}: what the user's role grants, enforced by SecurityConfig. */
    public record UserView(Long id, String username, Set<Permission> permissions, boolean active, boolean mustChangePassword,
                           String email, Long roleId, String roleName, String phone, boolean hasPhoto) {
        static UserView of(AppUser u) {
            return new UserView(u.getId(), u.getUsername(), sorted(u.getUserRole().getPermissions()), u.isActive(),
                    u.isMustChangePassword(), u.getEmail(), u.getUserRole().getId(), u.getUserRole().getName(), u.getPhone(),
                    u.getPhoto() != null);
        }
    }

    public record RoleView(Long id, String name, Set<Permission> permissions, long userCount) {
    }

    private static Set<Permission> sorted(Set<Permission> p) {
        return p.isEmpty() ? EnumSet.noneOf(Permission.class) : EnumSet.copyOf(p);
    }

    /** Spring Security authorities of an account: one per permission of its role. */
    public static Set<String> authorities(AppUser u) {
        return u.getUserRole().getPermissions().stream().map(Permission::authority).collect(Collectors.toSet());
    }

    private static final String LAST_SETTINGS = "Il doit rester au moins un utilisateur actif ayant accès aux Paramètres.";

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
        u.setUserRole(role(r.roleId(), r.role(), null));
        u.setEmail(uniqueEmail(email(r.email()), u));
        u.setPhone(phone(r.phone(), null, r.phoneCountry()));
        u.setMustChangePassword(true);
        return UserView.of(users.save(u));
    }

    public UserView update(Long id, UserUpdateRequest r, String currentUsername) {
        AppUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
        UserRole userRole = role(r.roleId(), r.role(), u.getUserRole());
        boolean settings = userRole.grants(Permission.SETTINGS);
        boolean active = r.active() == null ? u.isActive() : r.active();
        boolean self = u.getUsername().equalsIgnoreCase(currentUsername);
        if (self && (!active || !settings)) {
            throw ApiException.badRequest("Vous ne pouvez pas désactiver votre propre compte ni lui retirer l'accès aux Paramètres.");
        }
        boolean losesSettings = u.can(Permission.SETTINGS) && u.isActive() && (!settings || !active);
        if (losesSettings && users.countActiveWith(Permission.SETTINGS) <= 1) throw ApiException.badRequest(LAST_SETTINGS);
        String email = r.email() == null ? u.getEmail() : uniqueEmail(email(r.email()), u);
        String phone = r.phone() == null ? u.getPhone() : phone(r.phone(), u.getPhone(), r.phoneCountry());
        u.setUserRole(userRole);
        u.setActive(active);
        u.setEmail(email);
        u.setPhone(phone);
        return UserView.of(u);
    }

    public UserView updateOwnAccount(String username, AccountUpdateRequest r) {
        AppUser u = own(username);
        if (r.email() != null) u.setEmail(uniqueEmail(email(r.email()), u));
        if (r.phone() != null) u.setPhone(phone(r.phone(), u.getPhone(), r.phoneCountry()));
        return UserView.of(u);
    }

    /** Explicit role id, else the role of that name, else {@code current}. */
    private UserRole role(Long roleId, String name, UserRole current) {
        if (roleId != null) return roles.findById(roleId).orElseThrow(() -> ApiException.invalid("roleId", "Rôle introuvable."));
        if (name != null && !name.isBlank()) {
            return roles.findByNameIgnoreCase(name.trim()).orElseThrow(() -> ApiException.invalid("roleId", "Rôle introuvable."));
        }
        if (current == null) throw ApiException.invalid("roleId", "Le champ « Rôle » est obligatoire.");
        return current;
    }

    /** An email already held by another account is refused (case-insensitive); an unchanged one is kept. */
    private String uniqueEmail(String email, AppUser self) {
        if (email == null || email.equalsIgnoreCase(Objects.requireNonNullElse(self.getEmail(), ""))) return email;
        users.findAll().stream()
                .filter(o -> !Objects.equals(o.getId(), self.getId()) && email.equalsIgnoreCase(o.getEmail()))
                .findFirst()
                .ifPresent(o -> {
                    throw ApiException.invalid("email", "Cette adresse e-mail est déjà utilisée par l'utilisateur « " + o.getUsername() + " ».");
                });
        return email;
    }

    private String phone(String value, String current, String country) {
        String phone = Check.phone(value, current, country, settings.config().country(), "phone", false);
        return phone.isEmpty() ? null : phone;
    }

    // ---------------------------------------------------------------- photo

    public UserView setOwnPhoto(String username, MultipartFile file) {
        AppUser u = own(username);
        String stored = files.saveImage(file, "user-" + u.getId());
        String old = u.getPhoto();
        u.setPhoto(stored);
        files.delete(old);
        return UserView.of(u);
    }

    public UserView deleteOwnPhoto(String username) {
        AppUser u = own(username);
        files.delete(u.getPhoto());
        u.setPhoto(null);
        return UserView.of(u);
    }

    @Transactional(readOnly = true)
    public String photoName(String username) {
        return users.findByUsernameIgnoreCase(username).map(AppUser::getPhoto).orElse(null);
    }

    @Transactional(readOnly = true)
    public String photoName(Long id) {
        return users.findById(id).map(AppUser::getPhoto).orElse(null);
    }

    // ---------------------------------------------------------------- roles

    @Transactional(readOnly = true)
    public List<RoleView> roles() {
        List<AppUser> all = users.findAll();
        return roles.findAll().stream()
                .sorted(Comparator.comparing(UserRole::getName, String.CASE_INSENSITIVE_ORDER))
                .map(r -> new RoleView(r.getId(), r.getName(), sorted(r.getPermissions()),
                        all.stream().filter(u -> u.getUserRole().getId().equals(r.getId())).count()))
                .toList();
    }

    public RoleView saveRole(Long id, UserRoleRequest r, String currentUsername) {
        UserRole role = id == null ? new UserRole() : roles.findById(id).orElseThrow(() -> ApiException.notFound("Rôle introuvable."));
        String name = Check.text(r.name(), "name", "Nom", 50, true);
        Check.unique(roles.findAll(), UserRole::getId, UserRole::getName, id, name, "name", "Ce rôle existe déjà.");
        Set<Permission> permissions = Check.required(r.permissions(), "permissions", "Pages et droits");
        if (permissions.contains(null)) throw ApiException.invalid("permissions", "Droit inconnu.");
        if (id != null && role.grants(Permission.SETTINGS) && !permissions.contains(Permission.SETTINGS)) {
            List<AppUser> holders = users.findAll().stream().filter(u -> u.getUserRole().getId().equals(id)).toList();
            if (holders.stream().anyMatch(u -> u.getUsername().equalsIgnoreCase(currentUsername))) {
                throw ApiException.invalid("permissions", "Vous ne pouvez pas retirer l'accès aux Paramètres à votre propre rôle.");
            }
            long activeHolders = holders.stream().filter(AppUser::isActive).count();
            if (activeHolders > 0 && users.countActiveWith(Permission.SETTINGS) <= activeHolders) {
                throw ApiException.invalid("permissions", LAST_SETTINGS);
            }
        }
        role.setName(name);
        role.getPermissions().clear();
        role.getPermissions().addAll(permissions);
        UserRole saved = roles.save(role);
        long count = id == null ? 0 : users.findAll().stream().filter(u -> u.getUserRole().getId().equals(id)).count();
        return new RoleView(saved.getId(), saved.getName(), sorted(saved.getPermissions()), count);
    }

    public void deleteRole(Long id) {
        UserRole role = roles.findById(id).orElseThrow(() -> ApiException.notFound("Rôle introuvable."));
        if (users.existsByUserRoleId(id)) {
            throw ApiException.conflict("Le rôle « " + role.getName() + " » est attribué à des utilisateurs : changez-leur de rôle avant de le supprimer.");
        }
        roles.delete(role);
    }

    // ---------------------------------------------------------------- password

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
        AppUser u = own(username);
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
        return UserView.of(own(username));
    }

    private AppUser own(String username) {
        return users.findByUsernameIgnoreCase(username).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable."));
    }
}
