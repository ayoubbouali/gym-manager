package com.gymmanager.gym.web;

import com.gymmanager.gym.service.BusinessService;
import com.gymmanager.gym.service.BusinessService.BusinessMonth;
import com.gymmanager.gym.service.BusinessService.BusinessPaymentView;
import com.gymmanager.gym.service.BusinessService.BusinessView;
import com.gymmanager.gym.web.dto.Requests.ActiveRequest;
import com.gymmanager.gym.web.dto.Requests.BusinessPaymentRequest;
import com.gymmanager.gym.web.dto.Requests.BusinessRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

/** Club business (BUSINESS; correcting or deleting a collection needs MANAGE_BUSINESS, see SecurityConfig). */
@RestController
@RequestMapping("/api/business")
@RequiredArgsConstructor
public class BusinessController {
    private final BusinessService business;

    @GetMapping("/month")
    public BusinessMonth month(@RequestParam(required = false) String period) {
        return business.month(period);
    }

    @GetMapping("/member/{memberId}")
    public List<BusinessView> forMember(@PathVariable Long memberId) {
        return business.forMember(memberId);
    }

    @PostMapping
    public BusinessView create(@RequestBody BusinessRequest r, Principal user) {
        return business.create(r, user.getName());
    }

    /** One item per member of {@code memberIds}, all or none. */
    @PostMapping("/batch")
    public List<BusinessView> createForMembers(@RequestBody BusinessRequest r, Principal user) {
        return business.createForMembers(r, user.getName());
    }

    @PutMapping("/{id}")
    public BusinessView update(@PathVariable Long id, @RequestBody BusinessRequest r, Principal user) {
        return business.update(id, r, user.getName());
    }

    @PatchMapping("/{id}/active")
    public BusinessView active(@PathVariable Long id, @RequestBody ActiveRequest r, Principal user) {
        return business.setActive(id, Boolean.TRUE.equals(r.active()), user.getName());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        business.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/payments")
    public BusinessPaymentView pay(@RequestBody BusinessPaymentRequest r, Principal user) {
        return business.pay(r, user.getName());
    }

    @PutMapping("/payments/{id}")
    public BusinessPaymentView updatePayment(@PathVariable Long id, @RequestBody BusinessPaymentRequest r, Principal user) {
        return business.updatePayment(id, r, user.getName());
    }

    @DeleteMapping("/payments/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        business.deletePayment(id);
        return ResponseEntity.noContent().build();
    }
}
