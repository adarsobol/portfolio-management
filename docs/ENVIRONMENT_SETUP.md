# Environment Variables Setup

This document describes all environment variables needed for the Portfolio Manager application.

## Development Setup

Create a `.env` file in the project root with the following variables:

```bash
# JWT Configuration
# Generate a secure secret: openssl rand -base64 32
JWT_SECRET=your-secure-jwt-secret-here-change-in-production

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-oauth-client-id
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id

# Google Sheets Configuration
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"

# API Configuration
PORT=3001
VITE_API_ENDPOINT=http://localhost:3001

# Slack Integration (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## Production Setup

For production deployment on Google Cloud, use these variables:

```bash
# JWT Configuration (REQUIRED)
# Generate: openssl rand -base64 32
JWT_SECRET=<generate-secure-256-bit-key>

# Google OAuth (REQUIRED)
GOOGLE_CLIENT_ID=<production-oauth-client-id>
VITE_GOOGLE_CLIENT_ID=<production-oauth-client-id>

# Google Cloud Storage (when available)
GCS_BUCKET_NAME=portfolio-manager-data
GCS_PROJECT_ID=your-gcp-project-id

# API Configuration
PORT=8080
VITE_API_ENDPOINT=https://api.yourapp.com
NODE_ENV=production

# Slack Integration (Optional)
SLACK_WEBHOOK_URL=<your-production-slack-webhook>
```

## Secret Management

For production, store secrets in Google Secret Manager:

1. **JWT_SECRET**: Create secret named `portfolio-jwt-secret`
2. **GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY**: Use workload identity instead
3. **SLACK_WEBHOOK_URL**: Create secret named `portfolio-slack-webhook`

Reference secrets in Cloud Run:
```yaml
env:
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: portfolio-jwt-secret
        key: latest
```

## Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| JWT_SECRET | Yes | Secret key for JWT token signing |
| GOOGLE_CLIENT_ID | Yes | OAuth 2.0 client ID for Google login |
| VITE_GOOGLE_CLIENT_ID | Yes | Same as above, for frontend |
| GOOGLE_SPREADSHEET_ID | Dev only | ID of Google Sheet for data storage |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Dev only | Service account email |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Dev only | Service account private key |
| GCS_BUCKET_NAME | Prod | Google Cloud Storage bucket name |
| GCS_PROJECT_ID | Prod | Google Cloud project ID |
| PORT | Yes | Server port (3001 dev, 8080 prod) |
| VITE_API_ENDPOINT | Yes | Full URL to API server |
| NODE_ENV | Prod | Set to "production" |
| SLACK_WEBHOOK_URL | No | Slack webhook for notifications |
