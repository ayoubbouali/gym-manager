package com.gymmanager.gym.domain;

public enum ChargeCategory {
    ELECTRICITE("Électricité"), EAU("Eau"), INTERNET("Internet / téléphone"), LOYER("Loyer"), MENAGE("Ménage"),
    ENTRETIEN("Entretien du matériel"), AUTRE("Autre");

    private final String label;

    ChargeCategory(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
