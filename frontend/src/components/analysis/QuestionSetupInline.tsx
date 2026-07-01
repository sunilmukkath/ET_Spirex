import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
  type VariableSetupConfig,
  type VariableSetupEntry,
} from '../../api/client'
import { QuestionSetupRow } from './QuestionSetupRow'

interface Props {
  surveyId: number
  variable: SurveyVariable
  customVariables: CustomVariable[]
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
  onChanged?: () => void
}

export function QuestionSetupInline({
  surveyId,
  variable,
  customVariables,
  onCreateVariable,
  onEditVariable,
  onChanged,
}: Props) {
  const [setupConfig, setSetupConfig] = useState<VariableSetupConfig>({ variables: {} })
  const [setupLoading, setSetupLoading] = useState(true)

  const loadSetup = useCallback(async () => {
    setSetupLoading(true)
    try {
      const config = await api.getVariableSetup(surveyId)
      setSetupConfig(config)
    } catch {
      setSetupConfig({ variables: {} })
    } finally {
      setSetupLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void loadSetup()
  }, [loadSetup])

  const derivedCount = useMemo(
    () =>
      customVariables.filter(
        (cv) =>
          cv.source_variable_id === variable.id ||
          (cv.source_variable_ids ?? []).includes(variable.id),
      ).length,
    [customVariables, variable.id],
  )

  function handleSaved(variableId: string, entry: VariableSetupEntry | null) {
    setSetupConfig((prev) => {
      const next = { ...prev.variables }
      if (entry) next[variableId] = entry
      else delete next[variableId]
      return { variables: next }
    })
    onChanged?.()
  }

  return (
    <QuestionSetupRow
      variable={variable}
      isOpen
      onToggle={() => {}}
      setupEntry={setupConfig.variables[variable.id]}
      setupLoading={setupLoading}
      surveyId={surveyId}
      customVariables={customVariables}
      derivedCount={derivedCount}
      onCreateVariable={onCreateVariable}
      onEditVariable={onEditVariable}
      onSaved={handleSaved}
      embedded
    />
  )
}
