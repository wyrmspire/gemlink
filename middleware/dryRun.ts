import { Request, Response, NextFunction } from "express";
import * as config from "../config";

/**
 * dryRunMiddleware
 * 
 * Intercepts requests with 'X-Dry-Run: true' header.
 * Validates the request and returns an estimate without calling external AI providers.
 */
export function dryRunMiddleware(req: Request, res: Response, next: NextFunction) {
  const isDryRun = req.headers["x-dry-run"] === "true" || (req.body && req.body["dry-run"] === true);
  
  if (!isDryRun) {
    return next();
  }

  const path = req.path;
  let model = "unknown";
  let estimatedCredits = 0;

  if (path.includes("/media/image")) {
    model = config.models.image;
    estimatedCredits = 1;
  } else if (path.includes("/media/video")) {
    model = config.models.video;
    estimatedCredits = 5;
  } else if (path.includes("/media/voice")) {
    model = config.models.tts;
    estimatedCredits = 1;
  } else if (path.includes("/media/music")) {
    model = config.models.music;
    estimatedCredits = 10;
  } else if (path.includes("/boardroom")) {
    model = config.models.boardroom;
    estimatedCredits = 20;
  }

  console.log(`[dry-run] Intercepted request to ${path}`);

  return res.status(200).json({
    valid: true,
    dryRun: true,
    model,
    estimatedCredits,
    message: "Request is valid. This was a dry run and no content was generated."
  });
}
