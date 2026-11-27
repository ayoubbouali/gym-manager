package com.gymmanager.gym.domain;

public enum BusinessCategory {
    EQUIPEMENT("Équipement / kimonos"), VETEMENTS("Vêtements"), NUTRITION("Nutrition / compléments"), COACHING("Coaching"),
    SEANCE_PRIVEE("Séances privées"), PROGRAMME("Programmes"), AUTRE("Autre");

    private final String label;

    BusinessCategory(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
