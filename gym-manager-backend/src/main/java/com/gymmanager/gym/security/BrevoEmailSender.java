package com.gymmanager.gym.security;

import com.gymmanager.gym.settings.MailConfig;
import com.gymmanager.gym.settings.SettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestClient;

import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.function.Supplier;

/**
 * Sends through Brevo's transactional HTTP API rather than SMTP, whose ports are blocked on some
 * networks and hosts; only HTTPS (possibly through a proxy) is needed.
 * Sender and key are read from the settings at each call (Paramètres › Brevo config), so changes apply
 * without a restart; a blank setting falls back to MAIL_FROM / BREVO_API_KEY.
 */
@Component
public class BrevoEmailSender implements EmailSender {
    static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final int MAX_ERROR_BODY = 300;

    private final RestClient rest;
    private final String url;
    private final Supplier<Credentials> credentials;

    @Autowired
    public BrevoEmailSender(@Value("${app.mail.brevo.url:https://api.brevo.com/v3/smtp/email}") String url,
                            @Value("${app.mail.brevo.api-key:}") String envApiKey,
                            @Value("${app.mail.from:}") String envFrom,
                            SettingsService settings) {
        this(url, () -> Credentials.resolve(settings.mail(), envApiKey, envFrom), new EnvProxySelector(System.getenv()));
    }

    BrevoEmailSender(String url, String apiKey, String from, ProxySelector proxySelector) {
        this(url, () -> new Credentials(apiKey, from), proxySelector);
    }

    BrevoEmailSender(String url, Supplier<Credentials> credentials, ProxySelector proxySelector) {
        this.url = url;
        this.credentials = credentials;
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .proxy(proxySelector)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(TIMEOUT);
        this.rest = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public boolean isConfigured() {
        return credentials.get().isComplete();
    }

    @Override
    public void send(String to, String subject, String text) {
        Credentials c = credentials.get();
        rest.post()
                .uri(url)
                .header("api-key", c.apiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(new BrevoEmail(new Address(c.from()), List.of(new Address(to)), subject, text))
                .retrieve()
                .onStatus(status -> !status.is2xxSuccessful(), (request, response) -> {
                    String body = StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
                    if (body.length() > MAX_ERROR_BODY) body = body.substring(0, MAX_ERROR_BODY) + "…";
                    throw new BrevoException(response.getStatusCode().value(), body);
                })
                .toBodilessEntity();
    }

    /** Key and sender used for one call; toString never prints the key. */
    record Credentials(String apiKey, String from) {
        Credentials {
            apiKey = apiKey == null ? "" : apiKey.trim();
            from = from == null ? "" : from.trim();
        }

        /** Per field, a non-blank setting wins over the environment value. */
        static Credentials resolve(MailConfig settings, String envApiKey, String envFrom) {
            return new Credentials(firstNonBlank(settings.apiKey(), envApiKey), firstNonBlank(settings.from(), envFrom));
        }

        private static String firstNonBlank(String value, String fallback) {
            return value != null && !value.isBlank() ? value : fallback;
        }

        boolean isComplete() {
            return !apiKey.isEmpty() && !from.isEmpty();
        }

        @Override
        public String toString() {
            return "Credentials[apiKey=" + (apiKey.isEmpty() ? "<unset>" : "<set>") + ", from=" + from + "]";
        }
    }

    record Address(String email) {
    }

    record BrevoEmail(Address sender, List<Address> to, String subject, String textContent) {
    }

    static class BrevoException extends RuntimeException {
        final int status;

        BrevoException(int status, String body) {
            super("Brevo API returned HTTP " + status + ": " + body);
            this.status = status;
        }
    }
}
