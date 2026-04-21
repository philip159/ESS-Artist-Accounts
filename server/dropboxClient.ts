import { Dropbox } from 'dropbox';
import { IntegrationDisconnectedError } from './errors';

// Custom Dropbox App Integration
// Uses DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN secrets

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  // Check if we have a cached token that's still valid (with 5 min buffer)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }
  
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  
  if (!appKey || !appSecret || !refreshToken) {
    throw new IntegrationDisconnectedError(
      'Dropbox',
      'Dropbox app credentials not configured. Please add DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN secrets.'
    );
  }
  
  try {
    // Exchange refresh token for access token
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Dropbox] Token refresh failed:', response.status, errorText);
      throw new IntegrationDisconnectedError(
        'Dropbox',
        `Failed to refresh Dropbox token: ${response.status} - ${errorText}`
      );
    }
    
    const data = await response.json();
    
    if (!data.access_token) {
      throw new IntegrationDisconnectedError(
        'Dropbox',
        'No access token received from Dropbox'
      );
    }
    
    // Cache the token (expires_in is in seconds, default to 4 hours if not provided)
    const expiresIn = data.expires_in || 14400;
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    
    console.log('[Dropbox] Successfully refreshed access token');
    return data.access_token;
    
  } catch (error: any) {
    if (error instanceof IntegrationDisconnectedError) {
      throw error;
    }
    console.error('[Dropbox] Error refreshing token:', error);
    throw new IntegrationDisconnectedError(
      'Dropbox',
      `Failed to connect to Dropbox: ${error.message || 'Unknown error'}`
    );
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableDropboxClient() {
  const accessToken = await getAccessToken();
  return new Dropbox({ accessToken });
}

// Health check to verify Dropbox connection is active
export async function checkDropboxHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    const dbx = await getUncachableDropboxClient();
    await dbx.usersGetCurrentAccount();
    console.log('[Dropbox] Health check passed - connection active');
    return { connected: true };
  } catch (error: any) {
    if (error instanceof IntegrationDisconnectedError) {
      console.error('[Dropbox] Health check failed:', error.message);
      return { 
        connected: false, 
        error: error.message
      };
    }
    console.error('[Dropbox] Health check failed:', error?.message || error);
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Dropbox connection failed'
    };
  }
}
