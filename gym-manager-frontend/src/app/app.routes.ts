import { Routes } from '@angular/router';
import { adminGuard, authGuard, passwordGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'connexion', loadComponent: () => import('./pages/auth/login').then((m) => m.LoginPage), title: 'Connexion' },
  { path: 'mot-de-passe-oublie', loadComponent: () => import('./pages/auth/forgot-password').then((m) => m.ForgotPasswordPage), title: 'Mot de passe oublié' },
  { path: 'mot-de-passe', canActivate: [passwordGuard], loadComponent: () => import('./pages/auth/change-password').then((m) => m.ChangePasswordPage), title: 'Changer le mot de passe' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage), data: { title: 'Tableau de bord' } },
      { path: 'adherents', loadComponent: () => import('./pages/members/members-page').then((m) => m.MembersPage), data: { title: 'Adhérents' } },
      { path: 'fiche', loadComponent: () => import('./pages/members/member-card-page').then((m) => m.MemberCardPage), data: { title: 'Fiche adhérent' } },
      { path: 'fiche/:code', loadComponent: () => import('./pages/members/member-card-page').then((m) => m.MemberCardPage), data: { title: 'Fiche adhérent' } },
      { path: 'packs', loadComponent: () => import('./pages/packs/packs-page').then((m) => m.PacksPage), data: { title: "Packs d'abonnement" } },
      { path: 'remises', loadComponent: () => import('./pages/referentials/discounts-durations-page').then((m) => m.DiscountsDurationsPage), data: { title: 'Remises & durées' } },
      { path: 'sports', loadComponent: () => import('./pages/sports/sports-page').then((m) => m.SportsPage), data: { title: 'Sports' } },
      { path: 'activites', loadComponent: () => import('./pages/activities/activities-page').then((m) => m.ActivitiesPage), data: { title: 'Activités' } },
      { path: 'personnel', canActivate: [adminGuard], loadComponent: () => import('./pages/staff/staff-page').then((m) => m.StaffPage), data: { title: 'Personnel & coachs' } },
      { path: 'paiements', loadComponent: () => import('./pages/payments/payments-page').then((m) => m.PaymentsPage), data: { title: 'Paiements' } },
      { path: 'paie', canActivate: [adminGuard], loadComponent: () => import('./pages/payroll/payroll-page').then((m) => m.PayrollPage), data: { title: 'Paie du personnel' } },
      { path: 'alertes', loadComponent: () => import('./pages/alerts/alerts-page').then((m) => m.AlertsPage), data: { title: 'Alertes paiements' } },
      { path: 'statistiques', canActivate: [adminGuard], loadComponent: () => import('./pages/stats/stats-page').then((m) => m.StatsPage), data: { title: 'Statistiques' } },
      { path: 'parametres', canActivate: [adminGuard], loadComponent: () => import('./pages/settings/settings-page').then((m) => m.SettingsPage), data: { title: 'Paramètres' } },
      { path: 'mon-compte', loadComponent: () => import('./pages/account/account-page').then((m) => m.AccountPage), data: { title: 'Mon compte' } },
      { path: 'acces-refuse', loadComponent: () => import('./pages/auth/forbidden').then((m) => m.ForbiddenPage), data: { title: 'Accès refusé' } },
    ],
  },
  { path: '**', redirectTo: '' },
];
