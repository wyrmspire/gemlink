import { Router } from "express";
import * as config from "../config";

const router = Router();

/**
 * GET /api/capabilities
 * Returns the current runtime capabilities of the Gemlink engine.
 * Useful for agents to decide which models and features to use.
 */
router.get("/", (req, res) => {
  res.json({
    models: config.models,
    rateLimits: config.rateLimits,
    features: config.features,
    lanes: ["media", "boardroom", "research", "compose", "twilio"],
    version: config.app.version,
    name: config.app.name,
  });
});

export default router;
