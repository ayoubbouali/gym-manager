package com.gymmanager.gym.security;

/** Outgoing plain-text email; the sender address is part of the implementation's configuration. */
public interface EmailSender {

    /** Throws on any delivery failure. */
    void send(String to, String subject, String text);

    /** False when credentials or sender are missing: callers skip sending instead of failing. */
    boolean isConfigured();
}
