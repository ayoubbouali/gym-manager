package com.gymmanager.gym.security;

import com.gymmanager.gym.settings.MailConfig;
import com.gymmanager.gym.settings.SettingsService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Wiring of the Spring-built sender: settings first, then properties; nothing is sent. */
class BrevoEmailSenderWiringTest {
    private final SettingsService settings = mock(SettingsService.class);
    private final AtomicReference<MailConfig> stored = new AtomicReference<>(mail("", ""));
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(SettingsService.class, () -> settings)
            .withBean(BrevoEmailSender.class);

    {
        when(settings.mail()).thenAnswer(inv -> stored.get());
    }

    private static MailConfig mail(String from, String apiKey) {
        return new MailConfig(from, apiKey, "smtp-relay.brevo.com", 587, "STARTTLS");
    }

    @Test
    @DisplayName("Paramètres vides : repli sur app.mail.brevo.api-key et app.mail.from")
    void fallsBackToProperties() {
        runner.withPropertyValues("app.mail.brevo.api-key=xkeysib-env", "app.mail.from=env@gym.test")
                .run(ctx -> assertThat(ctx.getBean(BrevoEmailSender.class).isConfigured()).isTrue());
    }

    @Test
    @DisplayName("Ni paramètres ni propriétés : non configuré")
    void nothingConfigured() {
        runner.withPropertyValues("app.mail.brevo.api-key=", "app.mail.from=")
                .run(ctx -> assertThat(ctx.getBean(BrevoEmailSender.class).isConfigured()).isFalse());
    }

    @Test
    @DisplayName("Paramètres en base : configuré sans aucune propriété, lus à chaque appel")
    void readsSettingsAtCallTime() {
        runner.withPropertyValues("app.mail.brevo.api-key=", "app.mail.from=").run(ctx -> {
            BrevoEmailSender sender = ctx.getBean(BrevoEmailSender.class);
            assertThat(sender.isConfigured()).isFalse();
            stored.set(mail("db@gym.test", "xkeysib-db"));
            assertThat(sender.isConfigured()).isTrue();
            stored.set(mail("db@gym.test", ""));
            assertThat(sender.isConfigured()).isFalse();
        });
    }

    @Test
    @DisplayName("Repli champ par champ : clé en base, expéditeur depuis la propriété")
    void perFieldFallback() {
        stored.set(mail("", "xkeysib-db"));
        runner.withPropertyValues("app.mail.brevo.api-key=", "app.mail.from=env@gym.test")
                .run(ctx -> assertThat(ctx.getBean(BrevoEmailSender.class).isConfigured()).isTrue());
    }
}
