/**
 * The assistant's working parts: the context builder (with the lecture, vault,
 * app-catalog and planning data it reads), the action protocol and the writers.
 *
 * hooks/useAssistant.tsx sits in the App shell, but it needs these only once a
 * message is sent or an action applied, so it imports them through this one
 * module with a dynamic import() and they stay out of the first screen's code.
 */
export { gatherContext, SCOPE_MAP } from "@/lib/assistant-context";
export {
  ACTION_SCOPE,
  buildActionInstructions,
  describeAction,
  isAutoApply,
  parseActions,
  visibleReplyText,
} from "@/lib/assistant-actions";
export { ASSISTANT_FN_URL, assistantAuthHeaders, routeScopes } from "@/lib/assistant-api";
export { annotateHistory, keywordScopes } from "@/lib/scope-hints";
export { findMission, listTodayMissions } from "@/lib/mission-match";
export { revisePathPlan, findPathByName } from "@/lib/path-writes";
export { notifyPathsChanged } from "@/hooks/usePaths";
export {
  addCalendarEvent,
  addBooks,
  addFinanceTransaction,
  addPlanningNodes,
  completePlanningTask,
  createPath,
  createPresetFromMissions,
  logMetricEntry,
  logPathStepToday,
  patchPreferences,
  saveCurrentAsPreset,
  nodesLabel,
  resolveAttachTarget,
  resolvePlanningCompletion,
  setModuleEnabled,
} from "@/lib/assistant-writes";
