package com.gymmanager.gym.web;

import com.gymmanager.gym.security.SessionUserInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

@Configuration
public class WebConfig implements WebMvcConfigurer {
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

    /** Serves the Angular build; unknown non-API paths fall back to index.html (client-side routing). */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
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
