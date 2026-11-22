import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../core/config.service';
import { MemberView } from '../../core/models';
import { MemberPreview } from './member-preview';

function member(over: Partial<MemberView> = {}): MemberView {
  return {
    id: 7, code: 'A007', lastName: 'Bennis', firstName: 'lina', phone: '0611223344', sports: [], pack: { id: 1, name: 'Mensuel' },
    insurance: 'PAYE', hasPhoto: false, notes: '', active: true, endDate: '2026-12-01', remainingDays: 9, balance: 0,
    paymentStatus: 'PAYE', situation: 'OK',
    ...over,
  } as unknown as MemberView;
}

describe('carte d’aperçu adhérent', () => {
  function render(m: MemberView) {
    const f = TestBed.createComponent(MemberPreview);
    f.componentRef.setInput('member', m);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MemberPreview],
      providers: [{ provide: ConfigService, useValue: { currency: signal('DH') } }],
    });
  });

  it('affiche les initiales sans aucune image quand l’adhérent n’a pas de photo', () => {
    const { el } = render(member());
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mp-initials')!.textContent!.trim()).toBe('LB');
  });

  it('charge la photo depuis l’URL de l’adhérent', () => {
    const { el } = render(member({ hasPhoto: true }));
    expect(el.querySelector('img')!.getAttribute('src')).toBe('/api/members/7/photo');
    expect(el.querySelector('.mp-initials')).toBeNull();
  });

  it('se replie sur les initiales si l’image échoue', () => {
    const { f, el } = render(member({ hasPhoto: true }));
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mp-initials')!.textContent!.trim()).toBe('LB');
  });

  it('signale un adhérent inactif', () => {
    expect(render(member()).el.querySelector('.mp-inactive')).toBeNull();
    expect(render(member({ active: false })).el.querySelector('.mp-inactive')!.textContent!.trim()).toBe('Inactif');
  });

  it('résume l’abonnement, le paiement et masque les sections vides', () => {
    const { el } = render(member());
    const text = el.textContent!;
    expect(el.getAttribute('role')).toBe('tooltip');
    expect(text).toContain('Bennis lina');
    expect(text).toContain('A007');
    expect(text).toContain('Mensuel');
    expect(text).toContain('01/12/2026');
    expect(text).toContain('9 j');
    expect(text).toContain('0611223344');
    expect(text).not.toContain('Reste à payer');
    expect(el.querySelector('.mp-sports')).toBeNull();
    expect(el.querySelector('.mp-note')).toBeNull();
  });

  it('affiche le reste à payer, les sports et la note quand ils existent', () => {
    const { el } = render(member({
      balance: 150, paymentStatus: 'PARTIEL', notes: 'Allergie\nau pollen',
      sports: [{ id: 1, code: 'BOX', name: 'Boxe', color: '#f00', active: true }],
    }));
    expect(el.textContent).toContain('Reste à payer');
    expect(el.querySelector('.mp-grid .red')!.textContent).toContain('150,00 DH');
    expect(el.querySelector('.mp-sports')!.textContent).toContain('Boxe');
    expect(el.querySelector('.mp-note')!.textContent).toBe('Allergie\nau pollen');
  });

  it('affiche « Sans abonnement » et des tirets quand l’adhérent n’a aucune période', () => {
    const { el } = render(member({ pack: null, endDate: null, remainingDays: null, paymentStatus: null, situation: 'NONE' }));
    expect(el.querySelector('app-situation-badge')!.textContent!.trim()).toBe('Sans abonnement');
    const grid = el.querySelector('.mp-grid')!.textContent!;
    expect(grid).toContain('Abonnement—');
    expect(grid).toContain('Fin—');
    expect(grid).not.toMatch(/\d j/);
    expect(grid).toContain('Paiement—');
  });
});
