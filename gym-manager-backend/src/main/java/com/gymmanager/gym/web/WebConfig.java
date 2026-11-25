package com.gymmanager.gym.web;

import com.gymmanager.gym.security.SessionUserInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.time.Duration;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    /**
     * Angular output name with its 8-character content hash, e.g. chunk-OWER5MK3.js. The hash is spelled out
     * because PathPattern cannot parse braces or "/" inside a capture regex.
     */
    private static final String HASHED_FILES =
            "/{file:.+-" + "[A-Z0-9]".repeat(8) + "\\.(?:js|css|woff2?|ttf|svg|png|jpe?g|gif|webp|avif)}";
    private static final List<String> IMAGE_EXTENSIONS =
            List.of("png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "tif", "tiff", "apng", "jxl");

    private final SessionUserInterceptor sessionUserInterceptor;

    public WebConfig(SessionUserInterceptor sessionUserInterceptor) {
        this.sessionUserInterceptor = sessionUserInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessionUserInterceptor).addPathPatterns("/api/**").excludePathPatterns("/api/public/**", "/api/auth/login");
    }

    /** MIME type of the web app manifest (application icon on phones / tablets). */
    @org.springframework.context.annotation.Bean
    org.springframework.boot.web.server.WebServerFactoryCustomizer<org.springframework.boot.web.server.servlet.ConfigurableServletWebServerFactory> manifestMime() {
        return f -> {
            org.springframework.boot.web.server.MimeMappings m = new org.springframework.boot.web.server.MimeMappings(org.springframework.boot.web.server.MimeMappings.DEFAULT);
            m.add("webmanifest", "application/manifest+json");
            f.setMimeMappings(m);
        };
    }

    /**
     * Serves the Angular build; unknown non-API paths fall back to index.html (client-side routing).
     * Cache-Control is set here because Spring Security otherwise sends no-store on every response, which
     * stops Cloudflare and browsers from caching anything. Only public files get a public cache: member photos
     * and the club logo are API endpoints and keep their private headers.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // The file name changes with the content (outputHashing: all), so it can be cached forever.
        registry.addResourceHandler(HASHED_FILES, "/media/**")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
        // Unhashed public images (icons, brand/): a day, so a replaced image shows up the next day at worst.
        registry.addResourceHandler(IMAGE_EXTENSIONS.stream().map(ext -> "/**/*." + ext).toArray(String[]::new))
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic());
        // index.html and the other unhashed files must be revalidated, or a deployment would not reach clients.
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.noCache())
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String path, Resource location) throws IOException {
                        Resource r = location.createRelative(path);
                        if (r.exists() && r.isReadable()) return r;
                        if (path.startsWith("api/") || path.contains(".")) return null;
                        Resource index = new ClassPathResource("/static/index.html");
                        return index.exists() ? index : null;
                    }
                });
    }
}
