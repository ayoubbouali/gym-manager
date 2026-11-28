import { Routes } from '@angular/router';
import { authGuard, passwordGuard, permissionGuard as can } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'club', loadComponent: () => import('./site/site-page').then((m) => m.SitePage), title: 'Notre club' },
  { path: 'club2', loadComponent: () => import('./site/variants/club2/club2').then((m) => m.Club2Page), title: 'Notre club' },
  { path: 'club3', loadComponent: () => import('./site/variants/club3/club3').then((m) => m.Club3Page), title: 'Notre club' },
  { path: 'club4', loadComponent: () => import('./site/variants/club4/club4').then((m) => m.Club4Page), title: 'Notre club' },
  { path: 'club5', loadComponent: () => import('./site/variants/club5/club5').then((m) => m.Club5Page), title: 'Notre club' },
  { path: 'connexion', loadComponent: () => import('./pages/auth/login').then((m) => m.LoginPage), title: 'Connexion' },
  { path: 'mot-de-passe-oublie', loadComponent: () => import('./pages/auth/forgot-password').then((m) => m.ForgotPasswordPage), title: 'Mot de passe oublié' },
  { path: 'mot-de-passe', canActivate: [passwordGuard], loadComponent: () => import('./pages/auth/change-password').then((m) => m.ChangePasswordPage), title: 'Changer le mot de passe' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage), data: { title: 'Tableau de bord' } },
      { path: 'adherents', canActivate: [can('MEMBERS')], loadComponent: () => import('./pages/members/members-page').then((m) => m.MembersPage), data: { title: 'Adhérents' } },
      { path: 'fiche', canActivate: [can('MEMBER_CARD')], loadComponent: () => import('./pages/members/member-card-page').then((m) => m.MemberCardPage), data: { title: 'Fiche adhérent' } },
      { path: 'fiche/:code', canActivate: [can('MEMBER_CARD')], loadComponent: () => import('./pages/members/member-card-page').then((m) => m.MemberCardPage), data: { title: 'Fiche adhérent' } },
      { path: 'packs', canActivate: [can('PACKS')], loadComponent: () => import('./pages/packs/packs-page').then((m) => m.PacksPage), data: { title: "Packs d'abonnement" } },
      { path: 'remises', canActivate: [can('DISCOUNTS')], loadComponent: () => import('./pages/referentials/discounts-durations-page').then((m) => m.DiscountsDurationsPage), data: { title: 'Remises & durées' } },
      { path: 'sports', canActivate: [can('SPORTS')], loadComponent: () => import('./pages/sports/sports-page').then((m) => m.SportsPage), data: { title: 'Sports' } },
      { path: 'activites', canActivate: [can('ACTIVITIES')], loadComponent: () => import('./pages/activities/activities-page').then((m) => m.ActivitiesPage), data: { title: 'Activités' } },
      { path: 'personnel', canActivate: [can('STAFF')], loadComponent: () => import('./pages/staff/staff-page').then((m) => m.StaffPage), data: { title: 'Personnel & coachs' } },
      { path: 'personnel/fiche/:code', canActivate: [can('STAFF')], loadComponent: () => import('./pages/staff/staff-card-page').then((m) => m.StaffCardPage), data: { title: 'Fiche personnel' } },
      { path: 'paiements', canActivate: [can('PAYMENTS')], loadComponent: () => import('./pages/payments/payments-page').then((m) => m.PaymentsPage), data: { title: 'Paiements' } },
      { path: 'paie', canActivate: [can('PAYROLL')], loadComponent: () => import('./pages/payroll/payroll-page').then((m) => m.PayrollPage), data: { title: 'Paie du personnel' } },
      { path: 'charges', canActivate: [can('CHARGES')], loadComponent: () => import('./pages/charges/charges-page').then((m) => m.ChargesPage), data: { title: 'Charges' } },
      { path: 'business', canActivate: [can('BUSINESS')], loadComponent: () => import('./pages/business/business-page').then((m) => m.BusinessPage), data: { title: 'Business' } },
      { path: 'alertes', canActivate: [can('ALERTS')], loadComponent: () => import('./pages/alerts/alerts-page').then((m) => m.AlertsPage), data: { title: 'Alertes paiements' } },
      { path: 'statistiques', canActivate: [can('STATS')], loadComponent: () => import('./pages/stats/stats-page').then((m) => m.StatsPage), data: { title: 'Statistiques' } },
      { path: 'parametres', canActivate: [can('SETTINGS')], loadComponent: () => import('./pages/settings/settings-page').then((m) => m.SettingsPage), data: { title: 'Paramètres' } },
      { path: 'mon-compte', loadComponent: () => import('./pages/account/account-page').then((m) => m.AccountPage), data: { title: 'Mon compte' } },
      { path: 'acces-refuse', loadComponent: () => import('./pages/auth/forbidden').then((m) => m.ForbiddenPage), data: { title: 'Accès refusé' } },
    ],
  },
  { path: '**', redirectTo: '' },
];
