import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../supabaseAdmin";
import { storagePromise } from "../storage";

export interface ArtistAuthRequest extends Request {
  artistUserId?: string;
  artistId?: string;
}

export async function requireSupabaseArtistAuth(
  req: ArtistAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const token = authHeader.slice(7);

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.artistUserId = user.id;

    const storage = await storagePromise;

    // Primary lookup: by Supabase UUID (most secure — immutable)
    let account = await storage.getArtistAccountBySupabaseUserId(user.id);

    // Secondary lookup: by email — used to auto-link on first login
    if (!account && user.email) {
      const accountByEmail = await storage.getArtistAccountByEmail(user.email);
      if (accountByEmail) {
        // Auto-link: store Supabase UUID on the artist record so future lookups are by UUID
        const updated = await storage.updateArtistAccount(accountByEmail.id, {
          supabaseUserId: user.id,
        });
        account = updated ?? accountByEmail;
        console.log(`[ArtistAuth] Auto-linked Supabase UUID ${user.id} to artist account ${accountByEmail.id} (${user.email})`);
      }
    }

    if (!account) {
      return res.status(403).json({
        error: "Artist account not found. Please contact the admin to link your account.",
      });
    }

    req.artistId = account.id;
    next();
  } catch (err) {
    console.error("[ArtistAuth] JWT verification error:", err);
    return res.status(401).json({ error: "Authentication failed" });
  }
}
