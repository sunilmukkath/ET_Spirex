import type { CustomVariable } from '../api/client'

const PREFIX = 'et_scout_cv_backup'
const LEGACY_PREFIX = 'et_spirex_cv_backup'

export function customVariableBackupKey(username: string, surveyId: number): string {
  return `${PREFIX}:${username}:${surveyId}`
}

export function saveCustomVariableBackup(
  username: string,
  surveyId: number,
  variables: CustomVariable[],
): void {
  try {
    localStorage.setItem(customVariableBackupKey(username, surveyId), JSON.stringify(variables))
  } catch {
    /* ignore quota errors */
  }
}

export function loadCustomVariableBackup(
  username: string,
  surveyId: number,
): CustomVariable[] | null {
  try {
    let raw = localStorage.getItem(customVariableBackupKey(username, surveyId))
    if (!raw) {
      raw = localStorage.getItem(`${LEGACY_PREFIX}:${username}:${surveyId}`)
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as CustomVariable[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearCustomVariableBackup(username: string, surveyId: number): void {
  localStorage.removeItem(customVariableBackupKey(username, surveyId))
}
