package com.gymmanager.gym.domain;

public enum PaymentMethod {
    ESPECES("Espèces"), CARTE("Carte bancaire"), VIREMENT("Virement");

    private final String label;

    PaymentMethod(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
