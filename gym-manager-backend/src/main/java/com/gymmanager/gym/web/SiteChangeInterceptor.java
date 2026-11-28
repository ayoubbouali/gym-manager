package com.gymmanager.gym.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;

/**
 * Any successful write on the admin API may change what the showcase site shows (a price, a schedule, a member
 * filling a class…): rather than tagging every service, the site is rebuilt and compared after each one.
 */
@Component
public class SiteChangeInterceptor implements HandlerInterceptor {
    private static final Set<String> READS = Set.of("GET", "HEAD", "OPTIONS");

    private final PublicSiteService site;

    public SiteChangeInterceptor(PublicSiteService site) {
        this.site = site;
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res, Object handler, Exception ex) {
        if (ex == null && res.getStatus() < 400 && !READS.contains(req.getMethod())) site.changed();
    }
}
