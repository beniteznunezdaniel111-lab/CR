import { ADMIN_ROLES, ALL_ROLES, HR_ROLES, type MemberRole } from "@/lib/auth/roles";

export type NavIcon =
  | "home"
  | "jobs"
  | "candidates"
  | "onboarding"
  | "faq"
  | "hrQueries"
  | "trainings"
  | "myTrainings"
  | "organization"
  | "members"
  | "aiUsage";

export type NavItem = {
  /** Clave en messages: nav.<key>. */
  key: NavIcon;
  /** Ruta relativa a /app/[org]. */
  path: string;
  roles: readonly MemberRole[];
  /** Fase del MVP en la que se construye (para los "Próximamente"). */
  phase: number;
};

/** Módulos de la app y quién los ve. Admin ve todo lo de RRHH. */
export const MAIN_NAV: readonly NavItem[] = [
  { key: "home", path: "", roles: ALL_ROLES, phase: 0 },
  { key: "jobs", path: "/jobs", roles: HR_ROLES, phase: 1 },
  { key: "candidates", path: "/candidates", roles: HR_ROLES, phase: 2 },
  { key: "onboarding", path: "/onboarding", roles: HR_ROLES, phase: 3 },
  { key: "faq", path: "/faq", roles: ALL_ROLES, phase: 4 },
  { key: "hrQueries", path: "/hr-queries", roles: HR_ROLES, phase: 4 },
  { key: "trainings", path: "/trainings", roles: HR_ROLES, phase: 5 },
  { key: "myTrainings", path: "/my-trainings", roles: ALL_ROLES, phase: 5 },
];

export const SETTINGS_NAV: readonly NavItem[] = [
  { key: "organization", path: "/settings/organization", roles: ADMIN_ROLES, phase: 0 },
  { key: "members", path: "/settings/members", roles: ADMIN_ROLES, phase: 0 },
  { key: "aiUsage", path: "/settings/ai-usage", roles: ADMIN_ROLES, phase: 6 },
];

export function navForRole(items: readonly NavItem[], role: MemberRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role));
}

export function findNavItem(key: NavIcon): NavItem {
  const item = [...MAIN_NAV, ...SETTINGS_NAV].find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Elemento de navegación desconocido: ${key}`);
  return item;
}

export function orgPath(slug: string, path = ""): string {
  return `/app/${slug}${path}`;
}

/** Fase del MVP ya construida: los módulos de fases posteriores se marcan "Próximamente". */
export const CURRENT_PHASE = 5;
