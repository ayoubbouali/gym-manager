package com.gymmanager.gym.security;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The JDK HttpClient ignores the HTTPS_PROXY / NO_PROXY environment variables that curl and most
 * tools honour; this selector applies them to https requests (credentials in the proxy URL are ignored).
 */
@Slf4j
class EnvProxySelector extends ProxySelector {
    private static final List<Proxy> DIRECT = List.of(Proxy.NO_PROXY);

    private final Proxy proxy;
    private final List<String> noProxy;

    EnvProxySelector(Map<String, String> env) {
        this.proxy = parseProxy(first(env, "HTTPS_PROXY", "https_proxy"));
        this.noProxy = parseNoProxy(first(env, "NO_PROXY", "no_proxy"));
    }

    @Override
    public List<Proxy> select(URI uri) {
        if (proxy == null || uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            return DIRECT;
        }
        return bypassed(uri.getHost()) ? DIRECT : List.of(proxy);
    }

    @Override
    public void connectFailed(URI uri, SocketAddress sa, IOException ioe) {
        // nothing to fall back to: the request fails and the caller logs it
    }

    private boolean bypassed(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length() - 1);
        for (String entry : noProxy) {
            if (entry.equals("*") || h.equals(entry) || h.endsWith("." + entry)) return true;
        }
        return false;
    }

    private static String first(Map<String, String> env, String... names) {
        for (String name : names) {
            String v = env.get(name);
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }

    private static Proxy parseProxy(String value) {
        if (value == null) return null;
        try {
            URI uri = URI.create(value.contains("://") ? value : "http://" + value);
            String host = uri.getHost();
            if (host == null) throw new IllegalArgumentException("no host");
            int port = uri.getPort() != -1 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
            return new Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(host, port));
        } catch (IllegalArgumentException e) {
            // the value may embed credentials: never log it
            log.warn("Ignoring invalid HTTPS_PROXY value");
            return null;
        }
    }

    private static List<String> parseNoProxy(String value) {
        if (value == null) return List.of();
        return Arrays.stream(value.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .map(s -> s.startsWith("*.") ? s.substring(2) : s.startsWith(".") ? s.substring(1) : s)
                .map(s -> s.indexOf(':') == s.lastIndexOf(':') && s.indexOf(':') > 0 ? s.substring(0, s.indexOf(':')) : s)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
