# Environment Variables Documentation

This document describes all environment variables used by the Portfolio Manager application.

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required values in `.env`

3. For production, ensure all variables are set in your deployment platform (Cloud Run, etc.)

## Variable Categories

### Server Configuration

#### `PORT`
- **Type**: Number
- **Default**: `3001`
- **Description**: Port number for the Express backend server
- **Required**: No (has default)
- **Example**: `PORT=3001`

#### `NODE_ENV`
- **Type**: String
- **Default**: `development`
- **Description**: Node.js environment mode. Affects logging, error handling, and security features
- **Required**: No (has default)
- **Valid Values**: `development`, `production`, `test`
- **Example**: `NODE_ENV=production`

---

### Authentication & Security

#### `JWT_SECRET`
- **Type**: String
- **Default**: None (required in production)
- **Description**: Secret key used to sign and verify JWT tokens. Must be a secure random string
- **Required**: Yes (in production)
- **Security**: Use a strong random string. Generate with: `openssl rand -base64 32`
- **Example**: `JWT_SECRET=your-very-secure-random-string-here`

---

### Google Sheets Configuration (Legacy/Backup)

These are used when Google Cloud Storage is not configured or as a fallback.

#### `GOOGLE_SPREADSHEET_ID`
- **Type**: String
- **Default**: None
- **Description**: Google Spreadsheet ID (found in the spreadsheet URL)
- **Required**: Yes (if not using GCS)
- **Example**: `GOOGLE_SPREADSHEET_ID=1a2b3c4d5e6f7g8h9i0j`

#### `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- **Type**: String (email)
- **Default**: None
- **Description**: Email address of the Google Service Account used for server-to-server authentication
- **Required**: Yes (if using Google Sheets)
- **Example**: `GOOGLE_SERVICE_ACCOUNT_EMAIL=my-service@project.iam.gserviceaccount.com`

#### `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- **Type**: String (multiline)
- **Default**: None
- **Description**: Private key from the Google Service Account JSON file. Newlines must be escaped as `\n`
- **Required**: Yes (if using Google Sheets)
- **Example**: 
  ```
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----
  ```

---

### Google Cloud Storage Configuration (Primary Storage)

These are used when GCS is enabled. The app will automatically use GCS if these variables are set.

#### `GCS_BUCKET_NAME`
- **Type**: String
- **Default**: None
- **Description**: Name of the Google Cloud Storage bucket for storing application data
- **Required**: Yes (if using GCS)
- **Example**: `GCS_BUCKET_NAME=portfolio-manager-data`

#### `GCS_PROJECT_ID`
- **Type**: String
- **Default**: None
- **Description**: Google Cloud Project ID
- **Required**: Yes (if using GCS)
- **Example**: `GCS_PROJECT_ID=my-gcp-project`

#### `GOOGLE_APPLICATION_CREDENTIALS`
- **Type**: String (file path)
- **Default**: None
- **Description**: Path to the Google Service Account JSON key file (for local development)
- **Required**: No (uses default credentials in Cloud Run)
- **Note**: In Cloud Run, this is handled automatically via the service account
- **Example**: `GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json`

---

### CORS Configuration

#### `CORS_ALLOWED_ORIGINS`
- **Type**: String (comma-separated)
- **Default**: None
- **Description**: Comma-separated list of allowed origins for CORS in production
- **Required**: No (localhost allowed in development)
- **Note**: In development, localhost origins are automatically allowed
- **Example**: `CORS_ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com`

---

### Development Options

#### `SKIP_RATE_LIMIT`
- **Type**: String (`true` or `false`)
- **Default**: `false`
- **Description**: Set to `true` to disable rate limiting in development (for easier testing)
- **Required**: No
- **Security**: Never set to `true` in production
- **Example**: `SKIP_RATE_LIMIT=true`

---

### Frontend Environment Variables

All frontend variables must be prefixed with `VITE_` to be exposed to the browser.

#### `VITE_API_ENDPOINT`
- **Type**: String (URL)
- **Default**: `http://localhost:3001`
- **Description**: Backend API endpoint URL used by the frontend
- **Required**: No (has default)
- **Example**: `VITE_API_ENDPOINT=https://api.yourapp.com`

#### `VITE_GOOGLE_CLIENT_ID`
- **Type**: String
- **Default**: None
- **Description**: Google OAuth 2.0 Client ID for user authentication
- **Required**: Yes (for production authentication)
- **How to get**: Create OAuth credentials in Google Cloud Console
- **Example**: `VITE_GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com`

#### `GEMINI_API_KEY`
- **Type**: String
- **Default**: None
- **Description**: Google Gemini API key (optional, for AI features if implemented)
- **Required**: No
- **Example**: `GEMINI_API_KEY=your-gemini-api-key`

---

## Environment-Specific Configuration

### Development

For local development, you need at minimum:
```env
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-production
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=your-private-key
VITE_API_ENDPOINT=http://localhost:3001
```

### Production

For production deployment, ensure:
1. `NODE_ENV=production`
2. Strong `JWT_SECRET` (generate with `openssl rand -base64 32`)
3. `CORS_ALLOWED_ORIGINS` set to your production domains
4. `VITE_API_ENDPOINT` set to your production API URL
5. `VITE_GOOGLE_CLIENT_ID` set to your production OAuth client ID
6. Either Google Sheets OR GCS configuration (GCS recommended)

### Google Cloud Run

When deploying to Cloud Run:
- Set environment variables in Cloud Run service configuration
- Use Secret Manager for sensitive values (`JWT_SECRET`, private keys)
- `GOOGLE_APPLICATION_CREDENTIALS` is handled automatically via service account
- `PORT` is set automatically by Cloud Run (but can be overridden)

---

## Security Best Practices

1. **Never commit `.env` files** - They are in `.gitignore`
2. **Use Secret Manager** in production (Google Cloud Secret Manager)
3. **Rotate secrets regularly** - Especially `JWT_SECRET`
4. **Use different values** for development and production
5. **Limit CORS origins** - Only include your actual domains
6. **Use strong JWT secrets** - Minimum 32 characters, randomly generated

---

## Troubleshooting

### "JWT_SECRET not set" warning
- In development: This is okay, but set it for proper auth testing
- In production: This will cause the server to exit. Set `JWT_SECRET` immediately.

### CORS errors
- Check `CORS_ALLOWED_ORIGINS` includes your frontend domain
- In development, localhost is automatically allowed
- Ensure the frontend `VITE_API_ENDPOINT` matches the backend URL

### Google Sheets connection fails
- Verify `GOOGLE_SPREADSHEET_ID` is correct
- Check service account has access to the spreadsheet
- Ensure `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` has escaped newlines (`\n`)

### GCS not working
- Verify `GCS_BUCKET_NAME` and `GCS_PROJECT_ID` are set
- Check service account has Storage permissions
- Ensure bucket exists and is accessible

---

## Related Documentation

- [Google Sheets Setup Guide](../GOOGLE_SHEETS_SETUP.md)
- [Production Readiness Plan](./PRODUCTION_READINESS_PLAN.md)
- [Environment Setup Guide](./ENVIRONMENT_SETUP.md)
