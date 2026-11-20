package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.service.*;
import com.gymmanager.gym.service.PayrollService.PayrollMonth;
import com.gymmanager.gym.service.PayrollService.PayrollRow;
import com.gymmanager.gym.service.Views.SalaryPaymentView;
import com.gymmanager.gym.web.dto.Requests.CancelRequest;
import com.gymmanager.gym.web.dto.Requests.SalaryPaymentRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.Principal;
import java.util.List;

/** Staff payroll (ADMIN only, see SecurityConfig). */
@RestController
@RequestMapping("/api/payroll")
@RequiredArgsConstructor
public class PayrollController {
    private final PayrollService payroll;
    private final ClubStateService state;
    private final PdfService pdf;

    @GetMapping
    public PayrollMonth month(@RequestParam(required = false) String month) {
        return payroll.month(month);
    }

    @PostMapping("/payments")
    public SalaryPaymentView pay(@RequestBody SalaryPaymentRequest r, Principal user) {
        return payroll.one(payroll.pay(r, user.getName()).getId());
    }

    @PostMapping("/payments/{id}/cancel")
    public SalaryPaymentView cancel(@PathVariable Long id, @RequestBody CancelRequest r, Principal user) {
        payroll.cancel(id, r.reason(), user.getName());
        return payroll.one(id);
    }

    @GetMapping("/staff/{staffId}/history")
    public List<SalaryPaymentView> history(@PathVariable Long staffId) {
        return payroll.history(staffId);
    }

    @GetMapping("/payments/{id}/receipt.pdf")
    public ResponseEntity<byte[]> receipt(@PathVariable Long id, @RequestParam(defaultValue = "false") boolean download) {
        SalaryPaymentView p = payroll.one(id);
        PayrollMonth m = payroll.month(p.period());
        PayrollRow row = m.rows().stream().filter(r -> r.staff().id().equals(p.staffId())).findFirst()
                .orElseThrow(() -> ApiException.notFound("Membre du personnel introuvable."));
        BigDecimal upTo = row.payments().stream().filter(x -> !x.cancelled() && x.id() <= p.id())
                .map(SalaryPaymentView::amount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        byte[] bytes = pdf.salaryReceipt(new PdfService.SalaryReceiptData(p, row.staff(), row.due(), upTo, row.detail()), state.load().cfg());
        return PaymentController.pdfResponse(bytes, "salaire-" + p.slipNumber() + ".pdf", download);
    }
}
