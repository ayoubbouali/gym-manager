import { Permission } from '../core/models';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Absent: open to every user (Accueil). */
  permission?: Permission;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Menu groups (also used by the dashboard shortcuts). */
export const NAV: NavGroup[] = [
  { label: null, items: [{ path: '/', label: 'Accueil', icon: 'house' }] },
  {
    label: 'Adhérents',
    items: [
      { path: '/adherents', label: 'Adhérents', icon: 'users', permission: 'MEMBERS' },
      { path: '/fiche', label: 'Fiche adhérent', icon: 'id-card', permission: 'MEMBER_CARD' },
      { path: '/packs', label: 'Packs', icon: 'ticket', permission: 'PACKS' },
      { path: '/remises', label: 'Remises & durées', icon: 'badge-percent', permission: 'DISCOUNTS' },
    ],
  },
  {
    label: 'Club',
    items: [
      { path: '/sports', label: 'Sports', icon: 'dumbbell', permission: 'SPORTS' },
      { path: '/activites', label: 'Activités', icon: 'calendar-days', permission: 'ACTIVITIES' },
      { path: '/personnel', label: 'Personnel', icon: 'briefcase', permission: 'STAFF' },
      { path: '/paie', label: 'Paie du personnel', icon: 'hand-coins', permission: 'PAYROLL' },
    ],
  },
  {
    label: 'Suivi',
    items: [
      { path: '/paiements', label: 'Paiements', icon: 'wallet', permission: 'PAYMENTS' },
      { path: '/alertes', label: 'Alertes', icon: 'triangle-alert', permission: 'ALERTS' },
      { path: '/statistiques', label: 'Statistiques', icon: 'chart-column', permission: 'STATS' },
    ],
  },
  { label: null, items: [{ path: '/parametres', label: 'Paramètres', icon: 'settings', permission: 'SETTINGS' }] },
];

/** Write rights offered after the pages when editing a role. */
export const WRITE_RIGHTS: { permission: Permission; label: string }[] = [
  { permission: 'EDIT_REFERENTIALS', label: 'Modifier packs, remises, durées, sports et activités' },
  { permission: 'MANAGE_PAYMENTS', label: 'Corriger, annuler ou supprimer un paiement ou une période' },
];

/** Menu restricted to what the user may open; empty groups are dropped. */
export function visibleNav(can: (p: Permission) => boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(i.permission)) })).filter((g) => g.items.length);
}
