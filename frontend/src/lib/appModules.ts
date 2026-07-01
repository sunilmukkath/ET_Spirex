export type AppModule =
  | 'home'
  | 'quantitative'
  | 'qualitative'
  | 'my_work'
  | 'operations'
  | 'crm_marketing'
  | 'accounting'
  | 'team'
  | 'settings'

export const APP_MODULES: AppModule[] = [
  'home',
  'my_work',
  'operations',
  'crm_marketing',
  'quantitative',
  'qualitative',
  'accounting',
  'team',
  'settings',
]

export const APP_MODULE_LABELS: Record<AppModule, string> = {
  home: 'Home',
  quantitative: 'Quantitative',
  qualitative: 'Qualitative',
  my_work: 'My work',
  operations: 'Operations',
  crm_marketing: 'CRM & marketing',
  accounting: 'Accounting',
  team: 'Team',
  settings: 'Settings',
}

export const APP_MODULE_HINTS: Record<AppModule, string> = {
  home: 'Hub overview — tasks, pipeline spotlight, quick links',
  quantitative: 'LimeSurvey studies, Survey Studio, programming & links',
  qualitative: 'Transcript upload, qual library, search, and thematic reporting',
  my_work: 'Assigned tasks, new queue, and Gmail inbox',
  operations: 'PM pipeline, proposals, finance, data collection & survey links',
  crm_marketing: 'Client CRM, nurture follow-ups, and marketing activities',
  accounting: 'Chart of accounts, AR/AP, and Zoho migration',
  team: 'Staff directory, contact details, and workload',
  settings: 'Preferences, connections, and team configuration',
}

/** Route prefix or exact path guarded by each module. */
export const APP_MODULE_PATHS: Record<AppModule, string> = {
  home: '/home',
  quantitative: '/quantitative',
  qualitative: '/qualitative',
  my_work: '/my-work',
  operations: '/operations',
  crm_marketing: '/crm-marketing',
  accounting: '/accounting',
  team: '/team',
  settings: '/settings',
}

export type GlobalRole = 'admin' | 'manager' | 'member'

export const DEFAULT_MODULES_BY_ROLE: Record<GlobalRole, AppModule[]> = {
  admin: [...APP_MODULES],
  manager: [
    'home',
    'my_work',
    'operations',
    'crm_marketing',
    'quantitative',
    'qualitative',
    'team',
    'settings',
  ],
  member: ['home', 'my_work', 'quantitative', 'qualitative', 'settings'],
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
  if (pathname === '/crm-marketing' || pathname.startsWith('/crm-marketing/')) return 'crm_marketing'
  if (pathname === '/qualitative' || pathname.startsWith('/qualitative/')) return 'qualitative'
  if (pathname === '/accounting' || pathname.startsWith('/accounting/')) return 'accounting'
  if (pathname === '/team' || pathname.startsWith('/team/')) return 'team'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
  return null
}
