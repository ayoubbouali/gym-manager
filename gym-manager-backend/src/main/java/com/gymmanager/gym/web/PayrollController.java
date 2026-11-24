package com.gymmanager.gym.web;

import com.gymmanager.gym.common.ApiException;
import com.gymmanager.gym.service.*;
import com.gymmanager.gym.service.PayrollService.PayrollMonth;
import com.gymmanager.gym.service.PayrollService.PayrollRow;
import com.gymmanager.gym.service.Views.SalaryPaymentView;
import com.gymmanager.gym.web.dto.Requests.SalaryBonusRequest;
import com.gymmanager.gym.web.dto.Requests.SalaryPaymentRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping("/stats")
    public PayrollService.PayrollStats stats(@RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                             @RequestParam(required = false) Long staffId) {
        return payroll.stats(from, to, staffId);
    }

    @PostMapping("/payments")
    public SalaryPaymentView pay(@RequestBody SalaryPaymentRequest r, Principal user) {
        return payroll.one(payroll.pay(r, user.getName()).getId());
    }

    @PutMapping("/bonus")
    public PayrollRow bonus(@RequestBody SalaryBonusRequest r, Principal user) {
        return payroll.setBonus(r, user.getName());
    }

    /** Cancels the month of a staff member: its pay slips and bonus are deleted. */
    @DeleteMapping("/staff/{staffId}/months/{period}")
    public ResponseEntity<Void> reset(@PathVariable Long staffId, @PathVariable String period) {
        payroll.reset(staffId, period);
        return ResponseEntity.noContent().build();
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
        // built from the stored amount: the bonus is frozen once paid, the commission salary may have changed since
        var data = new PdfService.SalaryReceiptData(p, row.staff(), p.amount().subtract(row.bonus()), row.bonus(), row.bonusNote(), p.amount(), row.detail());
        byte[] bytes = pdf.salaryReceipt(data, state.load().cfg());
        return PaymentController.pdfResponse(bytes, "salaire-" + p.slipNumber() + ".pdf", download);
    }
}
