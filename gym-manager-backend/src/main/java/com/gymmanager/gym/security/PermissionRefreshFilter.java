package com.gymmanager.gym.security;

import com.gymmanager.gym.domain.AppUser;
import com.gymmanager.gym.repository.AppUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Replaces the session's authorities with the current permissions of the user's role before authorization runs,
 * so a role edited in Paramètres applies to the very next request of its holders, without a new login.
 * Disabled or deleted accounts are left to {@link SessionUserInterceptor}, which closes the session.
 */
class PermissionRefreshFilter extends OncePerRequestFilter {
    private final AppUserRepository users;
    private final SecurityContextRepository contextRepository;

    PermissionRefreshFilter(AppUserRepository users, SecurityContextRepository contextRepository) {
        this.users = users;
        this.contextRepository = contextRepository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !req.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof UsernamePasswordAuthenticationToken && auth.isAuthenticated()) {
            AppUser u = users.findByUsernameIgnoreCase(auth.getName()).filter(AppUser::isActive).orElse(null);
            Set<String> current = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
            if (u != null && !current.equals(UserService.authorities(u))) {
                SecurityContext ctx = SecurityContextHolder.createEmptyContext();
                ctx.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(auth.getPrincipal(), null,
                        UserService.authorities(u).stream().map(SimpleGrantedAuthority::new).toList()));
                SecurityContextHolder.setContext(ctx);
                contextRepository.saveContext(ctx, req, res);
            }
        }
        chain.doFilter(req, res);
    }
}
