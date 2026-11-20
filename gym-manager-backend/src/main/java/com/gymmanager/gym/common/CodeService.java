package com.gymmanager.gym.common;

import com.gymmanager.gym.domain.CodeCounter;
import com.gymmanager.gym.repository.CodeCounterRepository;
import com.gymmanager.gym.rules.Rules;
import com.gymmanager.gym.settings.ClubConfig;
import com.gymmanager.gym.settings.SettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Allocates display codes (A001, SP01…). Counters only move forward:
 * a code is never reused nor renumbered, even after a deletion.
 */
@Service
public class CodeService {
    private final CodeCounterRepository repo;
    private final SettingsService settings;

    public CodeService(CodeCounterRepository repo, SettingsService settings) {
        this.repo = repo;
        this.settings = settings;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public synchronized String next(String entity) {
        CodeCounter c = repo.lockByEntity(entity).orElseGet(() -> repo.saveAndFlush(new CodeCounter(entity, 1)));
        long n = c.getNextValue();
        c.setNextValue(n + 1);
        repo.save(c);
        ClubConfig.CodeFormat f = settings.config().codes().get(entity);
        return Rules.formatCode(f.prefix(), f.digits(), n);
    }

    /**
     * Import: makes the next code at least {@code n} (to keep the codes of an imported file).
     * Never moves a counter backwards.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public synchronized void reserveFrom(String entity, long n) {
        CodeCounter c = repo.lockByEntity(entity).orElseGet(() -> repo.saveAndFlush(new CodeCounter(entity, 1)));
        if (n > c.getNextValue()) {
            c.setNextValue(n);
            repo.save(c);
        }
    }

    /** Receipt / pay slip number PREFIX-YYYY-NNNN; the counter restarts every year and never goes back. */
    @Transactional(propagation = Propagation.MANDATORY)
    public synchronized String nextDocument(String kind, String prefix, int year) {
        String entity = kind + "-" + year;
        CodeCounter c = repo.lockByEntity(entity).orElseGet(() -> repo.saveAndFlush(new CodeCounter(entity, 1)));
        long n = c.getNextValue();
        c.setNextValue(n + 1);
        repo.save(c);
        return Rules.documentNumber(prefix, year, n);
    }

    @Transactional(readOnly = true)
    public String peek(String entity) {
        long n = repo.findById(entity).map(CodeCounter::getNextValue).orElse(1L);
        ClubConfig.CodeFormat f = settings.config().codes().get(entity);
        return Rules.formatCode(f.prefix(), f.digits(), n);
    }
}
