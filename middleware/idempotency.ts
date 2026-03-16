import { Request, Response, NextFunction } from "express";
import { idempotencyQueries } from "../src/db";

/**
 * idempotencyMiddleware
 * 
 * Middleware to deduplicate expensive POST requests based on the 'Idempotency-Key' header.
 * If a request with the same key was recently (24h) successful, returns the cached response.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to POST requests
  if (req.method !== "POST") {
    return next();
  }

  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key) {
    return next();
  }

  try {
    const cachedResponse = idempotencyQueries.get(key);
    if (cachedResponse) {
      console.log(`[idempotency] Cache hit for key: ${key}`);
      return res.status(200).json(cachedResponse);
    }

    // Capture the original res.json to store the response after it's sent
    const originalJson = res.json;
    res.json = function(body: any) {
      // Only cache successful or non-error responses (can be refined)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          idempotencyQueries.insert(key, body);
        } catch (dbErr) {
          console.error(`[idempotency] Failed to cache response for key ${key}:`, dbErr);
        }
      }
      return originalJson.call(this, body);
    };

    next();
  } catch (err) {
    console.error(`[idempotency] Middleware error:`, err);
    next();
  }
}
