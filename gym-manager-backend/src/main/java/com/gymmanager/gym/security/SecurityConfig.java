package com.gymmanager.gym.security;

import com.gymmanager.gym.common.ApiExceptionHandler;
import com.gymmanager.gym.repository.AppUserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;

/**
 * Roles are enforced on the server for every API route:
 * - ADMIN: everything;
 * - ACCUEIL: read everything except staff (salaries), payroll, statistics, settings and users;
 *   write members (list + card, renewals), payments and activity registrations; correcting or
 *   cancelling a payment is ADMIN only.
 * CSRF: the session cookie is SameSite=Strict and HttpOnly, and the API only accepts JSON/multipart.
 */
@Configuration
public class SecurityConfig {

    public static final String ADMIN = "ADMIN";

    @Bean
    SecurityFilterChain api(HttpSecurity http, SecurityContextRepository contextRepository) throws Exception {
        JsonMapper json = JsonMapper.builder().build();
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .securityContext(sc -> sc.securityContextRepository(contextRepository))
                .headers(h -> h.contentSecurityPolicy(csp -> csp.policyDirectives(
                        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'")))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/public/**", "/api/auth/login").permitAll()
                        .requestMatchers("/api/auth/**").authenticated()
                        // ADMIN only, including reads
                        .requestMatchers("/api/staff/**", "/api/stats/**", "/api/settings/**", "/api/users/**", "/api/functions/**", "/api/data/**").hasRole(ADMIN)
                        // payments: ACCUEIL records them; correcting / cancelling is ADMIN only
                        .requestMatchers(HttpMethod.PUT, "/api/payments/**").hasRole(ADMIN)
                        .requestMatchers("/api/payments/*/cancel", "/api/payroll/**").hasRole(ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/payments").authenticated()
                        // ACCUEIL may write members (incl. renewals) and registrations
                        .requestMatchers("/api/members/**", "/api/registrations/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                        // any other write on the API: ADMIN
                        .requestMatchers("/api/**").hasRole(ADMIN)
                        // Angular application (static files)
                        .anyRequest().permitAll())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> {
                            res.setStatus(401);
                            res.setContentType("application/json");
                            res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                            res.getWriter().write(json.writeValueAsString(ApiExceptionHandler.body("Veuillez vous connecter.", null, "UNAUTHENTICATED")));
                        })
                        .accessDeniedHandler((req, res, ex) -> {
                            res.setStatus(403);
                            res.setContentType("application/json");
                            res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                            res.getWriter().write(json.writeValueAsString(ApiExceptionHandler.body("Accès refusé : droits insuffisants.", null, "FORBIDDEN")));
                        }));
        return http.build();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(AppUserRepository users) {
        return username -> users.findByUsernameIgnoreCase(username)
                .map(u -> User.withUsername(u.getUsername()).password(u.getPasswordHash()).roles(u.getRole().name())
                        .disabled(!u.isActive()).build())
                .orElseThrow(() -> new UsernameNotFoundException(username));
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService uds, PasswordEncoder encoder) {
        DaoAuthenticationProvider p = new DaoAuthenticationProvider(uds);
        p.setPasswordEncoder(encoder);
        return new ProviderManager(p);
    }
}
