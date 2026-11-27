package com.gymmanager.gym.security;

import com.gymmanager.gym.common.ApiExceptionHandler;
import com.gymmanager.gym.domain.Permission;
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
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;

/**
 * The permissions of the user's role are enforced on the server for every API route:
 * - the APIs proper to a page (personnel, paie, statistiques, paramètres) need that page;
 * - the shared reads (members, packs, sports, payments…) and recording members, renewals, payments and
 *   registrations are open to any signed-in user, since several pages use them;
 * - editing the referentials needs EDIT_REFERENTIALS; correcting, cancelling or deleting a payment, or
 *   deleting a period, needs MANAGE_PAYMENTS; any other write needs SETTINGS.
 * CSRF: the session cookie is SameSite=Strict and HttpOnly, and the API only accepts JSON/multipart.
 */
@Configuration
public class SecurityConfig {

    private static String a(Permission p) {
        return p.authority();
    }

    @Bean
    SecurityFilterChain api(HttpSecurity http, SecurityContextRepository contextRepository, AppUserRepository users) throws Exception {
        JsonMapper json = JsonMapper.builder().build();
        http
                .addFilterBefore(new PermissionRefreshFilter(users, contextRepository), AuthorizationFilter.class)
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
                        // APIs proper to a page, including reads; the staff page lists the functions
                        .requestMatchers(HttpMethod.GET, "/api/functions/**").hasAnyAuthority(a(Permission.STAFF), a(Permission.SETTINGS))
                        .requestMatchers(HttpMethod.GET, "/api/payroll/stats").hasAnyAuthority(a(Permission.PAYROLL), a(Permission.STATS))
                        .requestMatchers("/api/staff/**").hasAuthority(a(Permission.STAFF))
                        .requestMatchers("/api/payroll/**").hasAuthority(a(Permission.PAYROLL))
                        .requestMatchers(HttpMethod.PUT, "/api/charges/payments/**").hasAuthority(a(Permission.MANAGE_CHARGES))
                        .requestMatchers(HttpMethod.DELETE, "/api/charges/payments/**").hasAuthority(a(Permission.MANAGE_CHARGES))
                        .requestMatchers("/api/charges/**").hasAuthority(a(Permission.CHARGES))
                        .requestMatchers(HttpMethod.GET, "/api/business/member/**").hasAnyAuthority(a(Permission.BUSINESS), a(Permission.MEMBER_CARD))
                        .requestMatchers(HttpMethod.PUT, "/api/business/payments/**").hasAuthority(a(Permission.MANAGE_BUSINESS))
                        .requestMatchers(HttpMethod.DELETE, "/api/business/payments/**").hasAuthority(a(Permission.MANAGE_BUSINESS))
                        .requestMatchers("/api/business/**").hasAuthority(a(Permission.BUSINESS))
                        .requestMatchers("/api/stats/**").hasAuthority(a(Permission.STATS))
                        // a function can be created from the staff form
                        .requestMatchers(HttpMethod.POST, "/api/functions").hasAnyAuthority(a(Permission.STAFF), a(Permission.SETTINGS))
                        .requestMatchers("/api/settings/**", "/api/users/**", "/api/roles/**", "/api/functions/**", "/api/data/**", "/api/admin/**")
                        .hasAuthority(a(Permission.SETTINGS))
                        // payments: recording one is open; correcting / cancelling / deleting is not
                        .requestMatchers(HttpMethod.PUT, "/api/payments/**").hasAuthority(a(Permission.MANAGE_PAYMENTS))
                        .requestMatchers(HttpMethod.DELETE, "/api/payments/**", "/api/subscriptions/**").hasAuthority(a(Permission.MANAGE_PAYMENTS))
                        .requestMatchers("/api/payments/*/cancel").hasAuthority(a(Permission.MANAGE_PAYMENTS))
                        .requestMatchers(HttpMethod.POST, "/api/payments").authenticated()
                        .requestMatchers("/api/members/**", "/api/registrations/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                        .requestMatchers("/api/packs/**", "/api/discounts/**", "/api/durations/**", "/api/sports/**", "/api/activities/**")
                        .hasAuthority(a(Permission.EDIT_REFERENTIALS))
                        // any other write on the API
                        .requestMatchers("/api/**").hasAuthority(a(Permission.SETTINGS))
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
                .map(u -> User.withUsername(u.getUsername()).password(u.getPasswordHash()).authorities(UserService.authorities(u).toArray(String[]::new))
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
