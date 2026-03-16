import { Request, Response, NextFunction } from "express";
import * as config from "../config";

interface RateTracker {
  count: number;
  resetAt: number;
}

const rateTrackers = new Map<string, RateTracker>();

/**
 * rateLimitMiddleware
 * 
 * Standard rate limiting middleware that adds X-RateLimit headers.
 * @param type The category of rate limit to apply (e.g., 'image', 'video', 'text').
 */
export function rateLimitMiddleware(type: keyof typeof config.rateLimits) {
  return (req: Request, res: Response, next: NextFunction) => {
    const limit = config.rateLimits[type] || 60;
    const now = Date.now();
    
    let tracker = rateTrackers.get(type);
    if (!tracker || tracker.resetAt <= now) {
      tracker = { count: 0, resetAt: now + 60000 };
      rateTrackers.set(type, tracker);
    }

    // Add unique request ID for traceability
    const reqId = req.headers["x-request-id"] || `req_${Date.now()}`;
    res.setHeader("X-Request-Id", reqId as string);

    // Check if limit exceeded
    if (tracker.count >= limit) {
      res.setHeader("X-RateLimit-Limit", limit.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", Math.floor(tracker.resetAt / 1000).toString());
      res.setHeader("Retry-After", Math.ceil((tracker.resetAt - now) / 1000).toString());
      
      return res.status(429).json({ 
        error: `Rate limit exceeded for ${type}.`,
        limit,
        resetAt: new Date(tracker.resetAt).toISOString()
      });
    }

    // Increment count and set headers
    tracker.count++;
    res.setHeader("X-RateLimit-Limit", limit.toString());
    res.setHeader("X-RateLimit-Remaining", (limit - tracker.count).toString());
    res.setHeader("X-RateLimit-Reset", Math.floor(tracker.resetAt / 1000).toString());
    
    next();
  };
}
