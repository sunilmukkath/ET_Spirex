import { api, type QualAsset, type QualAssetInput, type QualAskResult, type QualComparePreset, type QualReportSave, type QualSearchHit, type QualSummaryResult, type QualWorkspaceMeta } from '../api/client'

export type QualWorkspaceScope =
  | { type: 'survey'; surveyId: number }
  | { type: 'pm'; projectId: string }

export const qualWorkspaceApi = {
  getAssets(scope: QualWorkspaceScope) {
    return scope.type === 'pm'
      ? api.getPmQualAssets(scope.projectId)
      : api.getQualAssets(scope.surveyId)
  },
  createAsset(scope: QualWorkspaceScope, body: QualAssetInput) {
    return scope.type === 'pm'
      ? api.createPmQualAsset(scope.projectId, body)
      : api.createQualAsset(scope.surveyId, body)
  },
  updateAsset(scope: QualWorkspaceScope, assetId: string, body: Partial<QualAssetInput>) {
    return scope.type === 'pm'
      ? api.updatePmQualAsset(scope.projectId, assetId, body)
      : api.updateQualAsset(scope.surveyId, assetId, body)
  },
  deleteAsset(scope: QualWorkspaceScope, assetId: string) {
    return scope.type === 'pm'
      ? api.deletePmQualAsset(scope.projectId, assetId)
      : api.deleteQualAsset(scope.surveyId, assetId)
  },
  search(scope: QualWorkspaceScope, q: string): Promise<{ hits: QualSearchHit[]; query: string }> {
    return scope.type === 'pm'
      ? api.searchPmQualAssets(scope.projectId, q)
      : api.searchQualAssets(scope.surveyId, q)
  },
  summary(scope: QualWorkspaceScope, body?: { asset_ids?: string[]; focus?: string }): Promise<QualSummaryResult> {
    return scope.type === 'pm'
      ? api.generatePmQualSummary(scope.projectId, body)
      : api.generateQualSummary(scope.surveyId, body)
  },
  ask(scope: QualWorkspaceScope, body: { question: string; asset_ids?: string[] }): Promise<QualAskResult> {
    return scope.type === 'pm' ? api.askPmQual(scope.projectId, body) : api.askQual(scope.surveyId, body)
  },
  getMeta(scope: QualWorkspaceScope): Promise<QualWorkspaceMeta | null> {
    if (scope.type !== 'pm') return Promise.resolve(null)
    return api.getPmQualMeta(scope.projectId)
  },
  saveComparePreset(
    scope: QualWorkspaceScope,
    body: Omit<QualComparePreset, 'id' | 'created_at' | 'created_by'>,
  ) {
    if (scope.type !== 'pm') throw new Error('Compare presets require a PM project')
    return api.createPmQualComparePreset(scope.projectId, body)
  },
  deleteComparePreset(scope: QualWorkspaceScope, presetId: string) {
    if (scope.type !== 'pm') throw new Error('Compare presets require a PM project')
    return api.deletePmQualComparePreset(scope.projectId, presetId)
  },
  setReportTemplate(scope: QualWorkspaceScope, sections: QualWorkspaceMeta['report_template']['sections']) {
    if (scope.type !== 'pm') throw new Error('Report templates require a PM project')
    return api.setPmQualReportTemplate(scope.projectId, sections)
  },
  saveReport(scope: QualWorkspaceScope, body: QualReportSave) {
    if (scope.type !== 'pm') throw new Error('Saved reports require a PM project')
    return api.savePmQualReport(scope.projectId, body)
  },
  deleteReport(scope: QualWorkspaceScope, reportId: string) {
    if (scope.type !== 'pm') throw new Error('Saved reports require a PM project')
    return api.deletePmQualReport(scope.projectId, reportId)
  },
}

export type { QualAsset }
