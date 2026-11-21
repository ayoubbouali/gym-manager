package com.gymmanager.gym.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class EnvProxySelectorTest {
    private static final URI BREVO = URI.create("https://api.brevo.com/v3/smtp/email");

    private static List<Proxy> select(Map<String, String> env, URI uri) {
        return new EnvProxySelector(env).select(uri);
    }

    private static void assertProxy(List<Proxy> proxies, String host, int port) {
        assertThat(proxies).hasSize(1);
        Proxy p = proxies.get(0);
        assertThat(p.type()).isEqualTo(Proxy.Type.HTTP);
        InetSocketAddress a = (InetSocketAddress) p.address();
        assertThat(a.getHostString()).isEqualTo(host);
        assertThat(a.getPort()).isEqualTo(port);
    }

    @Test
    @DisplayName("Sans variable de proxy : connexion directe")
    void noProxyVariable() {
        assertThat(select(Map.of(), BREVO)).containsExactly(Proxy.NO_PROXY);
    }

    @Test
    @DisplayName("HTTPS_PROXY ou https_proxy : la requête passe par le proxy, identifiants ignorés")
    void proxyFromEnv() {
        assertProxy(select(Map.of("HTTPS_PROXY", "http://localhost:3128"), BREVO), "localhost", 3128);
        assertProxy(select(Map.of("https_proxy", "http://user:secret@proxy.corp:8080/"), BREVO), "proxy.corp", 8080);
        assertProxy(select(Map.of("HTTPS_PROXY", "proxy.corp:3128"), BREVO), "proxy.corp", 3128);
        assertProxy(select(Map.of("HTTPS_PROXY", "http://proxy.corp"), BREVO), "proxy.corp", 80);
    }

    @Test
    @DisplayName("NO_PROXY : hôte exact, suffixe de domaine (avec ou sans point) et * contournent le proxy")
    void noProxyMatches() {
        String proxy = "http://localhost:3128";
        assertThat(select(Map.of("HTTPS_PROXY", proxy, "NO_PROXY", "localhost, api.brevo.com"), BREVO)).containsExactly(Proxy.NO_PROXY);
        assertThat(select(Map.of("HTTPS_PROXY", proxy, "no_proxy", ".brevo.com"), BREVO)).containsExactly(Proxy.NO_PROXY);
        assertThat(select(Map.of("HTTPS_PROXY", proxy, "no_proxy", "brevo.com"), BREVO)).containsExactly(Proxy.NO_PROXY);
        assertThat(select(Map.of("HTTPS_PROXY", proxy, "NO_PROXY", "*"), BREVO)).containsExactly(Proxy.NO_PROXY);
        assertThat(select(Map.of("HTTPS_PROXY", proxy, "NO_PROXY", "API.Brevo.COM"), BREVO)).containsExactly(Proxy.NO_PROXY);
    }

    @Test
    @DisplayName("NO_PROXY sans correspondance : le proxy reste utilisé (pas de correspondance partielle)")
    void noProxyMisses() {
        String proxy = "http://localhost:3128";
        assertProxy(select(Map.of("HTTPS_PROXY", proxy, "NO_PROXY", "localhost,127.0.0.1,.corp.lan"), BREVO), "localhost", 3128);
        assertProxy(select(Map.of("HTTPS_PROXY", proxy, "NO_PROXY", "vo.com"), BREVO), "localhost", 3128);
    }

    @Test
    @DisplayName("Valeur de proxy invalide : ignorée, connexion directe")
    void invalidProxy() {
        assertThat(select(Map.of("HTTPS_PROXY", "http://"), BREVO)).containsExactly(Proxy.NO_PROXY);
    }
}
