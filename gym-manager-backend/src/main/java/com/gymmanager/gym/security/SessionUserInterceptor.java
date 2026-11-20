package com.gymmanager.gym.security;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.repository.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * On each API call: re-checks the account (still active, same role) and blocks everything
 * except /api/auth/** while the password change required at first login is pending.
 */
@Component
public class SessionUserInterceptor implements HandlerInterceptor {
    private final AppUserRepository users;

    public SessionUserInterceptor(AppUserRepository users) {
        this.users = users;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) return true;
        AppUser u = users.findByUsernameIgnoreCase(auth.getName()).orElse(null);
        boolean roleChanged = u != null && auth.getAuthorities().stream().noneMatch(a -> a.getAuthority().equals("ROLE_" + u.getRole().name()));
        if (u == null || !u.isActive() || roleChanged) {
            HttpSession s = req.getSession(false);
            if (s != null) s.invalidate();
            SecurityContextHolder.clearContext();
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Votre session a expiré, veuillez vous reconnecter.", null, "UNAUTHENTICATED");
        }
        String path = req.getRequestURI();
        if (u.isMustChangePassword() && !path.startsWith("/api/auth/")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Vous devez changer votre mot de passe avant de continuer.", null, "MUST_CHANGE_PASSWORD");
        }
        return true;
    }
}
