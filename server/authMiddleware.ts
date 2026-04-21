import type { Request, Response, NextFunction } from "express";

declare module 'express-session' {
  interface SessionData {
    isAuthenticated?: boolean;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAuthenticated) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized - Please log in" });
}

export function checkAuth(req: Request, res: Response) {
  res.json({ isAuthenticated: !!req.session?.isAuthenticated });
}
