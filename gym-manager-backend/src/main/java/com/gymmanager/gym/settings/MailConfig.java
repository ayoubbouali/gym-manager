package com.gymmanager.gym.settings;

/** Mail settings as stored; blank from/apiKey mean "use the environment value". SMTP fields are stored only. */
public record MailConfig(String from, String apiKey, String smtpHost, int smtpPort, String smtpSecurity) {

    @Override
    public String toString() {
        return "MailConfig[from=" + from + ", apiKey=" + (apiKey == null || apiKey.isBlank() ? "<unset>" : "<set>")
                + ", smtpHost=" + smtpHost + ", smtpPort=" + smtpPort + ", smtpSecurity=" + smtpSecurity + "]";
    }
}
