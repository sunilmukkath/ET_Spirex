export type AppModule =
  | 'home'
  | 'quantitative'
  | 'my_work'
  | 'operations'
  | 'accounting'
  | 'team'
  | 'settings'

export const APP_MODULES: AppModule[] = [
  'home',
  'my_work',
  'operations',
  'quantitative',
  'accounting',
  'team',
  'settings',
]

export const APP_MODULE_LABELS: Record<AppModule, string> = {
  home: 'Home',
  quantitative: 'Quantitative',
  my_work: 'My work',
  operations: 'Operations',
  accounting: 'Accounting',
  team: 'Team',
  settings: 'Settings',
}

export const APP_MODULE_HINTS: Record<AppModule, string> = {
  home: 'Hub overview — tasks, pipeline spotlight, quick links',
  quantitative: 'LimeSurvey studies, Survey Studio, programming & links',
  my_work: 'Assigned tasks, new queue, and Gmail inbox',
  operations: 'PM pipeline, CRM, proposals, data collection & survey links',
  accounting: 'Chart of accounts, AR/AP, and Zoho migration',
  team: 'Staff directory, contact details, and workload',
  settings: 'Preferences, connections, and team configuration',
}

/** Route prefix or exact path guarded by each module. */
export const APP_MODULE_PATHS: Record<AppModule, string> = {
  home: '/home',
  quantitative: '/quantitative',
  my_work: '/my-work',
  operations: '/operations',
  accounting: '/accounting',
  team: '/team',
  settings: '/settings',
}

export type GlobalRole = 'admin' | 'manager' | 'member'

export const DEFAULT_MODULES_BY_ROLE: Record<GlobalRole, AppModule[]> = {
  admin: [...APP_MODULES],
  manager: ['home', 'my_work', 'operations', 'quantitative', 'team', 'settings'],
  member: ['home', 'my_work', 'quantitative', 'settings'],
}

export function defaultModulesForRole(role: GlobalRole | undefined | null): AppModule[] {
  if (!role || !(role in DEFAULT_MODULES_BY_ROLE)) {
    return [...DEFAULT_MODULES_BY_ROLE.member]
  }
  return [...DEFAULT_MODULES_BY_ROLE[role]]
}

export function resolveUserModules(
  explicit: AppModule[] | undefined | null,
  role: GlobalRole | undefined | null,
): AppModule[] {
  if (explicit?.length) return explicit
  return defaultModulesForRole(role)
}

export function canAccessModule(
  modules: AppModule[] | undefined | null,
  module: AppModule,
  opts?: { isSuperAdmin?: boolean },
): boolean {
  if (opts?.isSuperAdmin) return true
  return Boolean(modules?.includes(module))
}

export function firstAccessiblePath(modules: AppModule[] | undefined | null): string {
  for (const mod of APP_MODULES) {
    if (modules?.includes(mod)) return APP_MODULE_PATHS[mod]
  }
  return '/home'
}

export function pathToModule(pathname: string): AppModule | null {
  if (pathname === '/home' || pathname.startsWith('/home/')) return 'home'
  if (pathname === '/quantitative' || pathname.startsWith('/quantitative/')) return 'quantitative'
  if (pathname === '/studio' || pathname.startsWith('/studio/')) return 'quantitative'
  if (pathname.startsWith('/projects/')) return 'quantitative'
  if (pathname === '/my-work' || pathname.startsWith('/my-work/')) return 'my_work'
  if (pathname === '/operations' || pathname.startsWith('/operations/')) return 'operations'
  if (pathname === '/accounting' || pathname.startsWith('/accounting/')) return 'accounting'
  if (pathname === '/team' || pathname.startsWith('/team/')) return 'team'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
  return null
}
