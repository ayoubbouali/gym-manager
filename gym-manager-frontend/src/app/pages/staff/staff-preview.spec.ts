import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../core/config.service';
import { StaffView } from '../../core/models';
import { StaffPreview } from './staff-preview';

function staff(over: Partial<StaffView> = {}): StaffView {
  return {
    id: 6, code: 'E006', lastName: 'Bouzid', firstName: 'yassir', name: 'Yassir Bouzid', phone: '0661112208',
    function: { id: 2, label: 'Accueil' }, sports: [], payMode: 'FIXED', fixedSalary: 4500, active: true, salary: 4500,
    salaryDetail: { month: '2026-11' },
    ...over,
  } as unknown as StaffView;
}

describe('carte d’aperçu personnel', () => {
  function render(s: StaffView, salary: number | null = null, month: string | null = null) {
    const f = TestBed.createComponent(StaffPreview);
    f.componentRef.setInput('staff', s);
    f.componentRef.setInput('salary', salary);
    f.componentRef.setInput('month', month);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StaffPreview],
      providers: [{ provide: ConfigService, useValue: { currency: signal('DH') } }],
    });
  });

  it('sans photo, affiche les initiales, avec le style de l’aperçu adhérent', () => {
    const el = render(staff({ hasPhoto: false }));
    expect(el.classList).toContain('member-preview');
    expect(el.getAttribute('role')).toBe('tooltip');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mp-initials')!.textContent!.trim()).toBe('YB');
  });

  it('affiche la photo quand il en a une, et revient aux initiales si elle ne se charge pas', () => {
    const f = TestBed.createComponent(StaffPreview);
    f.componentRef.setInput('staff', staff({ hasPhoto: true }));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const img = el.querySelector('img.mp-photo') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/staff/6/photo');
    expect(el.querySelector('.mp-initials')).toBeNull();

    img.dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mp-initials')!.textContent!.trim()).toBe('YB');
  });

  it('résume fonction, mode de paie et salaire du mois', () => {
    const text = render(staff()).textContent!;
    expect(text).toContain('E006');
    expect(text).toContain('Accueil');
    expect(text).toContain('Fixe');
    expect(text).toContain('novembre 2026');
    expect(render(staff(), 1200, '2026-10').textContent).toContain('octobre 2026');
  });

  it('signale un membre inactif', () => {
    expect(render(staff()).querySelector('.mp-inactive')).toBeNull();
    expect(render(staff({ active: false })).querySelector('.mp-inactive')!.textContent!.trim()).toBe('Inactif');
  });
});
