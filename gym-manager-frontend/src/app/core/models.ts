/** API models (mirror of the Java views). Money values are numbers, dates ISO strings. */

export type Role = 'ADMIN' | 'ACCUEIL';
export type PaymentStatus = 'PAYE' | 'PARTIEL' | 'IMPAYE';
export type PaymentMethod = 'ESPECES' | 'CARTE' | 'VIREMENT';
export type Insurance = 'PAYE' | 'IMPAYE';
export type Situation = 'EXPIRED' | 'SOON' | 'FOLLOW' | 'OK';
export type PayMode = 'COMMISSION' | 'FIXED';

export interface User {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  email: string | null;
}

export interface AppConfig {
  clubName: string;
  clubAddress: string;
  clubPhone: string;
  logoVersion: string | null;
  currency: string;
  timezone: string;
  dialCode: string;
  phoneRegex: string;
  cumulative: boolean;
  rounding: string;
  soonThreshold: number;
  followThreshold: number;
  pageSize: number;
  today: string;
  now: string;
}

export interface SportRef { id: number; code: string; name: string; color: string; active: boolean; }
export interface StaffRef { id: number; code: string; name: string; active: boolean; }
export interface FunctionView { id: number; label: string; active: boolean; }
export interface DurationView { id: number; label: string; months: number; active: boolean; }
export interface DiscountView { id: number; code: string; name: string; percent: number; active: boolean; system: boolean; }
export interface PackRef { id: number; code: string; name: string; active: boolean; months: number; total: number; }

export interface PackView {
  id: number; code: string; name: string; active: boolean;
  sportId: number; sport: SportRef; durationId: number; duration: DurationView;
  monthlyPrice: number; discountId: number; discount: DiscountView; total: number;
}

export interface MemberView {
  id: number; code: string; lastName: string; firstName: string; phone: string;
  birthDate: string | null; registrationDate: string;
  sportIds: number[]; sports: SportRef[];
  subscriptionId: number; periodStart: string; periodCount: number;
  packId: number; pack: PackRef; discountId: number; discount: DiscountView;
  insurance: Insurance; hasPhoto: boolean; notes: string; active: boolean; activityIds: number[];
  price: number; endDate: string; remainingDays: number;
  paid: number; balance: number;
  paymentStatus: PaymentStatus; activeMember: boolean; situation: Situation;
}

export interface PaymentView {
  id: number; receiptNumber: string; memberId: number; memberCode: string; memberName: string;
  subscriptionId: number; packName: string; periodStart: string; periodEnd: string;
  amount: number; method: PaymentMethod; methodLabel: string; paidOn: string; note: string;
  createdAt: string; createdBy: string; updatedAt: string | null; updatedBy: string | null;
  cancelled: boolean; cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
}

export interface SubscriptionView {
  id: number; memberId: number; packId: number; packName: string; discountId: number; discountName: string;
  startDate: string; endDate: string; months: number; amount: number; paid: number; balance: number;
  paymentStatus: PaymentStatus; current: boolean; createdAt: string; createdBy: string; payments: PaymentView[];
}

export interface SalaryPaymentView {
  id: number; slipNumber: string; staffId: number; staffCode: string; staffName: string; period: string;
  amount: number; method: PaymentMethod; methodLabel: string; paidOn: string; note: string;
  createdAt: string; createdBy: string; cancelled: boolean; cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
}

export interface PayrollRow {
  staff: StaffView; due: number; paid: number; balance: number; status: PaymentStatus;
  detail: SalaryDetail; payments: SalaryPaymentView[];
}

export interface PayrollMonth {
  period: string; from: string; to: string; currentMonth: boolean; rows: PayrollRow[];
  totalDue: number; totalPaid: number; totalBalance: number;
}

export interface SlotView { dayOfWeek: number; start: string; end: string; }

export interface SportView {
  id: number; code: string; name: string; color: string; capacity: number; monthlyPrice: number; active: boolean;
  coachIds: number[]; coaches: StaffRef[]; schedules: SlotView[]; scheduleSummary: string;
  memberCount: number; fillPercent: number;
}

export interface SalaryLine {
  memberId: number; code: string; name: string; pack: string; registrationDate: string;
  price: number; factor: number; sports: string[];
}

export interface SalaryDetail {
  from: string; to: string; shareRaw: string; sharePercent: number; base: number;
  multiCoach: 'FULL' | 'SPLIT'; lines: SalaryLine[];
}

export interface StaffView {
  id: number; code: string; lastName: string; firstName: string; name: string; phone: string;
  functionId: number; function: FunctionView | null; sportIds: number[]; sports: SportRef[];
  payMode: PayMode; fixedSalary: number | null; active: boolean; salary: number; salaryDetail: SalaryDetail;
}

export interface StaffList { rows: StaffView[]; payroll: number; activeCount: number; }

export interface ActivityView {
  id: number; code: string; name: string; description: string; price: number;
  startsAt: string; location: string; maxPlaces: number | null; managerId: number; manager: StaffRef | null;
  active: boolean; past: boolean; registrationCount: number; remainingPlaces: number | null; full: boolean; revenue: number;
}

export interface RegistrationView {
  id: number; memberId: number; activityId: number; createdAt: string;
  memberCode: string; memberName: string; activityCode: string; activityName: string;
  activityStartsAt: string; activityLocation: string;
}

export interface MemberCard {
  member: MemberView; activities: ActivityView[]; alertMessage: string | null; whatsappLink: string | null;
  subscriptions: SubscriptionView[]; renewalStart: string;
}

export interface MemberPreview {
  price: number; endDate: string; remainingDays: number; situation: Situation;
}

export interface Dashboard {
  activeMembers: number; alertCount: number; upcomingActivityCount: number;
  cashedThisMonth: number; toCollect: number;
  bySport: { id: number; code: string; name: string; color: string; count: number; capacity: number }[];
  upcoming: ActivityView[];
}

export interface AlertRow {
  id: number; code: string; firstName: string; lastName: string; phone: string; pack: string;
  endDate: string; remainingDays: number; situation: Situation; balance: number; paymentStatus: PaymentStatus;
  message: string; whatsappLink: string | null;
}

export interface Alerts { alertCount: number; soonThreshold: number; followThreshold: number; rows: AlertRow[]; }

export interface Stats {
  from: string; to: string;
  kpis: { revenue: number; unpaidAmount: number; unpaidInsuranceCount: number; activeMembers: number };
  byMethod: { method: PaymentMethod; label: string; amount: number; count: number }[];
  monthly: { month: string; amount: number }[];
  quarterly: { year: number; quarter: number; amount: number }[];
  yearly: { year: number; amount: number }[];
  bySport: { id: number; name: string; color: string; active: boolean; amount: number }[];
  activities: { id: number; code: string; name: string; date: string; price: number; count: number; revenue: number }[];
}

export interface SettingDef {
  key: string; group: string; type: string; label: string; defaultValue: string;
  required: boolean; min: number | null; max: number | null; options: { value: string; label: string }[];
}

export interface SettingsPayload {
  groups: Record<string, string>;
  definitions: SettingDef[];
  /** Secret values are always '' in `values`; this tells whether one is stored on the server. */
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
  nextCodes: Record<string, string>;
}

export interface ApiError { message: string; field?: string; code?: string; }
