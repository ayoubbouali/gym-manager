package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.service.*;
import com.gymmanager.gym.service.Views.PaymentView;
import com.gymmanager.gym.service.Views.SubscriptionView;
import com.gymmanager.gym.web.dto.Requests.*;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Member payments and renewals. Recording a payment / renewing: ADMIN and ACCUEIL.
 * Correcting or cancelling a payment, removing a renewal: ADMIN (see SecurityConfig).
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PaymentController {
    private final ClubStateService state;
    private final PaymentService service;
    private final PdfService pdf;

    /** Cash journal, optionally limited to a period (payment dates). */
    @GetMapping("/payments")
    public List<PaymentView> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return state.load().payments().stream()
                .filter(p -> (from == null || !p.paidOn().isBefore(from)) && (to == null || !p.paidOn().isAfter(to)))
                .sorted((a, b) -> b.paidOn().equals(a.paidOn()) ? b.id().compareTo(a.id()) : b.paidOn().compareTo(a.paidOn()))
                .toList();
    }

    @PostMapping("/payments")
    public PaymentView pay(@RequestBody PaymentRequest r, Principal user) {
        Long id = service.pay(r, user.getName()).getId();
        return find(id);
    }

    @PutMapping("/payments/{id}")
    public PaymentView update(@PathVariable Long id, @RequestBody PaymentUpdateRequest r, Principal user) {
        service.update(id, r, user.getName());
        return find(id);
    }

    @PostMapping("/payments/{id}/cancel")
    public PaymentView cancel(@PathVariable Long id, @RequestBody CancelRequest r, Principal user) {
        service.cancel(id, r.reason(), user.getName());
        return find(id);
    }

    @GetMapping("/payments/{id}/receipt.pdf")
    public ResponseEntity<byte[]> receipt(@PathVariable Long id, @RequestParam(defaultValue = "false") boolean download) {
        ClubState st = state.load();
        PaymentView p = st.payments().stream().filter(x -> x.id().equals(id)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Paiement introuvable."));
        SubscriptionView period = st.subscriptions().stream().filter(s -> s.id().equals(p.subscriptionId())).findFirst().orElseThrow();
        var data = new PdfService.ReceiptData(p, st.member(p.memberId()).orElseThrow(), period, PdfService.paidUpTo(period.payments(), p));
        return pdfResponse(pdf.receipt(data, st.cfg()), "recu-" + p.receiptNumber() + ".pdf", download);
    }

    @PostMapping("/members/{id}/renew")
    public SubscriptionView renew(@PathVariable Long id, @RequestBody RenewRequest r, Principal user) {
        Long subId = service.renew(id, r, user.getName()).getId();
        return state.load().subscriptions().stream().filter(s -> s.id().equals(subId)).findFirst().orElseThrow();
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<Void> cancelRenewal(@PathVariable Long id) {
        service.cancelRenewal(id);
        return ResponseEntity.noContent().build();
    }

    private PaymentView find(Long id) {
        return state.load().payments().stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
    }

    static ResponseEntity<byte[]> pdfResponse(byte[] bytes, String filename, boolean download) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, (download ? ContentDisposition.attachment() : ContentDisposition.inline())
                        .filename(filename).build().toString())
                .body(bytes);
    }

    public static Map<String, Object> methods() {
        return Map.of("ESPECES", "Espèces", "CARTE", "Carte bancaire", "VIREMENT", "Virement");
    }
}
