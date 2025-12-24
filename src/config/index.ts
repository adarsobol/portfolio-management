/**
 * Application configuration
 * Centralized config for environment-dependent values
 */

// Google OAuth Client ID
// Note: OAuth Client IDs are not secrets - they're visible in browser network requests.
// Security is enforced via authorized origins/redirects in Google Cloud Console.
const PROD_GOOGLE_CLIENT_ID = '1061531245530-an68apdgo6kmkvapvng0gc1g00nohc5v.apps.googleusercontent.com';

export const GOOGLE_CLIENT_ID = 
  import.meta.env.VITE_GOOGLE_CLIENT_ID || 
  (import.meta.env.PROD ? PROD_GOOGLE_CLIENT_ID : 'YOUR_GOOGLE_CLIENT_ID');

// Check if Google OAuth is properly configured
export const isGoogleOAuthConfigured = 
  GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' && 
  GOOGLE_CLIENT_ID.length > 0;

// API Endpoint - relative in production, configurable in dev
export const API_ENDPOINT = 
  import.meta.env.PROD ? '' : (import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3001');

