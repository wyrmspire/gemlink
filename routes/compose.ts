import { Router } from "express";

export function createComposeRouter(deps: any) {
  const api = Router();
  const {
    getMergedModels,
    getMergedDefaults,
    getMergedFeatures,
    requireApiKey,
    createJobId,
    writeManifest,
    patchManifest,
    autoTagMedia,
    jobTypeDirs,
    getJobDir,
    appendLog,
    collectHistory,
    saveBatchState,
    loadBatchStates,
    readManifest,
    mediaJobQueries,
    collectionQueries,
    collectionItemQueries,
    strategyArtifactQueries,
    getActiveArtifacts,
    composeJobQueries,
    startBoardroomSessionAsync,
    listBoardroomSessions,
    readBoardroomSession,
    extractMediaBriefs,
    STRATEGY_ANALYSIS_TEMPLATE,
    extractStrategyAnalysisOutput,
    loadTemplates,
    getTemplate,
    loadStyleDatabase
  } = deps;

  // TODO: Add endpoints here

  return api;
}
