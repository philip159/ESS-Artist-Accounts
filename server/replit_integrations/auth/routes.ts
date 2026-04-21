import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get auth status (for frontend hook)
  app.get("/api/auth/status", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json({ loggedIn: false });
      }

      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json({
        loggedIn: true,
        user: user ? {
          sub: userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        } : undefined,
      });
    } catch (error) {
      console.error("Error checking auth status:", error);
      res.json({ loggedIn: false });
    }
  });
}
