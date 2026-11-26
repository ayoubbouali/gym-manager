package com.gymmanager.gym.web;

import com.gymmanager.gym.service.ChargeService;
import com.gymmanager.gym.service.ChargeService.ChargeMonth;
import com.gymmanager.gym.service.ChargeService.ChargePaymentView;
import com.gymmanager.gym.service.ChargeService.ChargeView;
import com.gymmanager.gym.web.dto.Requests.ActiveRequest;
import com.gymmanager.gym.web.dto.Requests.ChargePaymentRequest;
import com.gymmanager.gym.web.dto.Requests.ChargeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

/** Club charges (CHARGES; correcting or deleting a payment needs MANAGE_CHARGES, see SecurityConfig). */
@RestController
@RequestMapping("/api/charges")
@RequiredArgsConstructor
public class ChargeController {
    private final ChargeService charges;

    @GetMapping
    public List<ChargeView> list() {
        return charges.list();
    }

    @GetMapping("/month")
    public ChargeMonth month(@RequestParam(required = false) String period) {
        return charges.month(period);
    }

    @PostMapping
    public ChargeView create(@RequestBody ChargeRequest r, Principal user) {
        return charges.create(r, user.getName());
    }

    @PutMapping("/{id}")
    public ChargeView update(@PathVariable Long id, @RequestBody ChargeRequest r) {
        return charges.update(id, r);
    }

    @PatchMapping("/{id}/active")
    public ChargeView active(@PathVariable Long id, @RequestBody ActiveRequest r) {
        return charges.setActive(id, Boolean.TRUE.equals(r.active()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        charges.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/payments")
    public ChargePaymentView pay(@RequestBody ChargePaymentRequest r, Principal user) {
        return charges.pay(r, user.getName());
    }

    @PutMapping("/payments/{id}")
    public ChargePaymentView updatePayment(@PathVariable Long id, @RequestBody ChargePaymentRequest r, Principal user) {
        return charges.updatePayment(id, r, user.getName());
    }

    @DeleteMapping("/payments/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        charges.deletePayment(id);
        return ResponseEntity.noContent().build();
    }
}
