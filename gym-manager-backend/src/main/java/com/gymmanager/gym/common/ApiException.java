package com.gymmanager.gym.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/** Business error with a French message, rendered as JSON by {@link ApiExceptionHandler}. */
@Getter
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String field;
    private final String code;

    public ApiException(HttpStatus status, String message, String field, String code) {
        super(message);
        this.status = status;
        this.field = field;
        this.code = code;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message, null, null);
    }

    public static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message, field, null);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message, null, null);
    }

    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message, null, null);
    }

    /** Referenced element: it must be deactivated instead of deleted. */
    public static ApiException inUse(String what) {
        return new ApiException(HttpStatus.CONFLICT, what + " est utilisé(e) ailleurs : désactivez-le(la) au lieu de le(la) supprimer.", null, "IN_USE");
    }
}
