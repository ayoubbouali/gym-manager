package com.gymmanager.gym.security;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Against a local HTTP server: no network access. */
class BrevoEmailSenderTest {
    private HttpServer server;
    private final AtomicReference<String> method = new AtomicReference<>();
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> apiKey = new AtomicReference<>();
    private final AtomicReference<String> contentType = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private volatile int responseStatus = 201;
    private volatile String responseBody = "{\"messageId\":\"<1@smtp-relay.mailin.fr>\"}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/v3/smtp/email", exchange -> {
            method.set(exchange.getRequestMethod());
            path.set(exchange.getRequestURI().getPath());
            apiKey.set(exchange.getRequestHeaders().getFirst("api-key"));
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private BrevoEmailSender sender(String key, String from) {
        String url = "http://localhost:" + server.getAddress().getPort() + "/v3/smtp/email";
        return new BrevoEmailSender(url, key, from, ProxySelector.of(null));
    }

    @Test
    @DisplayName("Envoi : POST JSON avec la clé api-key, l'expéditeur, le destinataire, l'objet et le texte")
    void sendsRequest() {
        sender("xkeysib-test", "no-reply@gym.test").send("accueil@club.test", "Objet é", "Bonjour\nMot de passe provisoire : abc");

        assertThat(method.get()).isEqualTo("POST");
        assertThat(path.get()).isEqualTo("/v3/smtp/email");
        assertThat(apiKey.get()).isEqualTo("xkeysib-test");
        assertThat(contentType.get()).startsWith("application/json");
        JsonNode json = JsonMapper.builder().build().readTree(body.get());
        assertThat(json.get("sender").get("email").asString()).isEqualTo("no-reply@gym.test");
        assertThat(json.get("to")).hasSize(1);
        assertThat(json.get("to").get(0).get("email").asString()).isEqualTo("accueil@club.test");
        assertThat(json.get("subject").asString()).isEqualTo("Objet é");
        assertThat(json.get("textContent").asString()).isEqualTo("Bonjour\nMot de passe provisoire : abc");
    }

    @Test
    @DisplayName("Réponse d'erreur Brevo : exception avec le statut et le message, sans la clé")
    void errorRaises() {
        responseStatus = 401;
        responseBody = "{\"code\":\"unauthorized\",\"message\":\"Key not found\"}";
        assertThatThrownBy(() -> sender("xkeysib-secret", "no-reply@gym.test").send("a@club.test", "s", "t"))
                .isInstanceOf(BrevoEmailSender.BrevoException.class)
                .hasMessageContaining("401")
                .hasMessageContaining("Key not found")
                .hasMessageNotContaining("xkeysib-secret");

        responseStatus = 500;
        responseBody = "x".repeat(1000);
        assertThatThrownBy(() -> sender("k", "f@gym.test").send("a@club.test", "s", "t"))
                .isInstanceOf(BrevoEmailSender.BrevoException.class)
                .hasMessageContaining("500")
                .satisfies(e -> assertThat(e.getMessage()).hasSizeLessThan(400));
    }

    @Test
    @DisplayName("Configuration : clé et expéditeur obligatoires")
    void isConfigured() {
        assertThat(sender("k", "f@gym.test").isConfigured()).isTrue();
        assertThat(sender(" ", "f@gym.test").isConfigured()).isFalse();
        assertThat(sender("k", "").isConfigured()).isFalse();
        assertThat(sender(null, null).isConfigured()).isFalse();
    }

    @Test
    @DisplayName("Clé et expéditeur relus à chaque envoi : un changement s'applique sans recréer l'émetteur")
    void readsCredentialsAtEachSend() {
        String url = "http://localhost:" + server.getAddress().getPort() + "/v3/smtp/email";
        AtomicReference<BrevoEmailSender.Credentials> current = new AtomicReference<>(new BrevoEmailSender.Credentials("k1", "one@gym.test"));
        BrevoEmailSender sender = new BrevoEmailSender(url, current::get, ProxySelector.of(null));
        sender.send("a@club.test", "s", "t");
        assertThat(apiKey.get()).isEqualTo("k1");
        assertThat(body.get()).contains("one@gym.test");

        current.set(new BrevoEmailSender.Credentials("k2", "two@gym.test"));
        sender.send("a@club.test", "s", "t");
        assertThat(apiKey.get()).isEqualTo("k2");
        assertThat(body.get()).contains("two@gym.test");
        assertThat(current.get().toString()).doesNotContain("k2");
    }

    @Test
    @DisplayName("Repli : une valeur non vide des paramètres l'emporte, sinon la variable d'environnement")
    void resolveFallsBackPerField() {
        var none = new com.gymmanager.gym.settings.MailConfig("", "", "smtp-relay.brevo.com", 587, "STARTTLS");
        var both = new com.gymmanager.gym.settings.MailConfig("db@gym.test", "db-key", "smtp-relay.brevo.com", 587, "STARTTLS");
        assertThat(BrevoEmailSender.Credentials.resolve(none, "env-key", "env@gym.test"))
                .isEqualTo(new BrevoEmailSender.Credentials("env-key", "env@gym.test"));
        assertThat(BrevoEmailSender.Credentials.resolve(both, "env-key", "env@gym.test"))
                .isEqualTo(new BrevoEmailSender.Credentials("db-key", "db@gym.test"));
        assertThat(BrevoEmailSender.Credentials.resolve(none, "", "").isComplete()).isFalse();
    }

    @Test
    @DisplayName("Proxy : le sélecteur fourni est consulté pour la requête")
    void usesProxySelector() {
        AtomicReference<URI> asked = new AtomicReference<>();
        ProxySelector spy = new ProxySelector() {
            @Override
            public List<Proxy> select(URI uri) {
                asked.set(uri);
                return List.of(Proxy.NO_PROXY);
            }

            @Override
            public void connectFailed(URI uri, SocketAddress sa, IOException ioe) {
            }
        };
        String url = "http://localhost:" + server.getAddress().getPort() + "/v3/smtp/email";
        new BrevoEmailSender(url, "k", "f@gym.test", spy).send("a@club.test", "s", "t");
        assertThat(asked.get()).isNotNull();
        assertThat(asked.get().getPort()).isEqualTo(server.getAddress().getPort());
    }
}
