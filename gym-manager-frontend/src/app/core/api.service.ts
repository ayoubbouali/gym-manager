import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as M from './models';

type Id = number;

/** Thin typed client of the REST API. All methods return promises. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  get<T>(url: string, params?: Record<string, string>): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api${url}`, { params: params ? new HttpParams({ fromObject: params }) : undefined }));
  }
  post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api${url}`, body));
  }
  put<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`/api${url}`, body));
  }
  patch<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`/api${url}`, body));
  }
  delete<T = void>(url: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`/api${url}`));
  }
  upload<T>(url: string, file: File): Promise<T> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(this.http.post<T>(`/api${url}`, fd));
  }

  postForm<T>(url: string, form: FormData): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api${url}`, form));
  }

  /** Binary download. A JSON error body (received as a Blob) is parsed back so that errorMessage() can read it. */
  async download(url: string): Promise<Blob> {
    try {
      return await firstValueFrom(this.http.get(`/api${url}`, { responseType: 'blob' }));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error instanceof Blob) {
        let error: unknown = null;
        try {
          error = JSON.parse(await e.error.text());
        } catch {
          // not JSON: keep the generic message
        }
        throw new HttpErrorResponse({ error, headers: e.headers, status: e.status, statusText: e.statusText, url: e.url ?? undefined });
      }
      throw e;
    }
  }

  /** Create or update depending on the id. */
  save<T>(resource: string, id: Id | null | undefined, body: unknown): Promise<T> {
    return id ? this.put<T>(`/${resource}/${id}`, body) : this.post<T>(`/${resource}`, body);
  }
  setActive(resource: string, id: Id, active: boolean): Promise<void> {
    return this.patch<void>(`/${resource}/${id}/active`, { active });
  }
  remove(resource: string, id: Id): Promise<void> {
    return this.delete(`/${resource}/${id}`);
  }

  members = () => this.get<M.MemberView[]>('/members');
  memberCard = (code: string) => this.get<M.MemberCard>(`/members/by-code/${encodeURIComponent(code)}`);
  memberNotes = (id: Id, notes: string) => this.patch<M.MemberView>(`/members/${id}/notes`, { notes });
  memberPreview = (body: { packId: Id | null; discountId: Id | null; registrationDate: string | null; customAmount?: number | null }) =>
    this.post<M.MemberPreview | null>('/members/preview', body);
  packs = () => this.get<M.PackView[]>('/packs');
  discounts = () => this.get<M.DiscountView[]>('/discounts');
  durations = () => this.get<M.DurationView[]>('/durations');
  functions = () => this.get<M.FunctionView[]>('/functions');
  sports = () => this.get<M.SportView[]>('/sports');
  staff = () => this.get<M.StaffList>('/staff');
  staffOptions = () => this.get<M.StaffRef[]>('/staff-options');
  activities = () => this.get<M.ActivityView[]>('/activities');
  registrations = () => this.get<M.RegistrationView[]>('/registrations');
  dashboard = () => this.get<M.Dashboard>('/dashboard');
  alerts = () => this.get<M.Alerts>('/alerts');
  stats = (from?: string, to?: string) => this.get<M.Stats>('/stats', from && to ? { from, to } : undefined);
  settings = () => this.get<M.SettingsPayload>('/settings');
  registrationStats = (from?: string, to?: string) => this.get<M.RegistrationStats>('/stats/registrations', from && to ? { from, to } : undefined);
  chargeStats = (from?: string, to?: string) => this.get<M.ChargeStats>('/stats/charges', from && to ? { from, to } : undefined);
  charges = () => this.get<M.ChargeView[]>('/charges');
  chargeMonth = (period: string) => this.get<M.ChargeMonth>('/charges/month', { period });
  payments = (from?: string, to?: string) => this.get<M.PaymentView[]>('/payments', from && to ? { from, to } : undefined);
  payroll = (month?: string) => this.get<M.PayrollMonth>('/payroll', month ? { month } : undefined);
  payrollStats = (from?: string, to?: string, staffId?: number | null) =>
    this.get<M.PayrollStats>('/payroll/stats', { ...(from && to ? { from, to } : {}), ...(staffId ? { staffId: String(staffId) } : {}) });
  salaryHistory = (staffId: number) => this.get<M.SalaryPaymentView[]>(`/payroll/staff/${staffId}/history`);
  /** {@code amount} null removes the bonus of the month. */
  salaryBonus = (staffId: number, period: string, amount: number | null, note = '') =>
    this.put<M.PayrollRow>('/payroll/bonus', { staffId, period, amount, note });
  /** Cancels a paid month: its pay slips and bonus are deleted. */
  resetPayrollMonth = (staffId: number, period: string) => this.delete(`/payroll/staff/${staffId}/months/${period}`);
  users = () => this.get<M.User[]>('/users');
  roles = () => this.get<M.UserRoleView[]>('/roles');
}
