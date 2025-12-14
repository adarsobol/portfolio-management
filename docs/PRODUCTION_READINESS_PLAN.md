---
name: Production Readiness Plan
overview: A phased approach to productionize the Portfolio Work Plan Manager, covering security, infrastructure, data migration to Google Cloud Storage, monitoring, and deployment.
todos:
  - id: p1-auth
    content: "Phase 1: Enable authentication (frontend AuthContext + backend JWT)"
    status: pending
  - id: p1-env
    content: "Phase 1: Configure production environment variables and secrets"
    status: pending
  - id: p1-cors
    content: "Phase 1: Update CORS for production domains"
    status: pending
  - id: p2-gcs-service
    content: "Phase 2: Create data service abstraction for GCS"
    status: pending
  - id: p2-gcs-backend
    content: "Phase 2: Add GCS client to backend"
    status: pending
  - id: p2-migrate
    content: "Phase 2: Migrate data from Google Sheets to GCS"
    status: pending
  - id: p3-docker
    content: "Phase 3: Create Dockerfile and containerize app"
    status: pending
  - id: p3-cloudrun
    content: "Phase 3: Deploy to Cloud Run"
    status: pending
  - id: p3-secrets
    content: "Phase 3: Set up Secret Manager"
    status: pending
  - id: p4-logging
    content: "Phase 4: Integrate Cloud Logging"
    status: pending
  - id: p4-monitoring
    content: "Phase 4: Set up Cloud Monitoring dashboard"
    status: pending
  - id: p5-tests
    content: "Phase 5: Add unit and E2E tests"
    status: pending
  - id: p5-cicd
    content: "Phase 5: Create CI/CD pipeline"
    status: pending
  - id: p6-ratelimit
    content: "Phase 6: Add rate limiting"
    status: pending
  - id: p6-validation
    content: "Phase 6: Add input validation"
    status: pending
---

# Production Readiness Action Plan

## Current State Assessment

**Tech Stack:**

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Backend: Express.js (Node.js), Socket.IO for real-time
- Data: Google Sheets (primary) + localStorage (fallback)
- Auth: Currently bypassed (hardcoded admin user)

**Critical Gaps:**

- Authentication bypassed on both frontend (`AuthContext.tsx:18-26`) and backend (`server/index.ts:191-198`)
- Default JWT secret in code (`server/index.ts:163`)
- CORS configured for localhost only (`server/index.ts:181-186`)
- No test coverage
- No CI/CD pipeline
- No cloud infrastructure

---

## Verification Protocol

**After completing each task, perform these verification steps:**

1. **Build Check**: Run `npm run build` - must complete without errors
2. **Type Check**: Run `npm run typecheck` - must pass
3. **Lint Check**: Run `npm run lint` - must pass (or only warnings)
4. **Server Start**: Run `npm run dev:all` - both frontend and backend must start
5. **Smoke Test**: Open http://localhost:3000 and verify:

   - App loads without white screen
   - Login works (or auto-login if still bypassed)
   - Dashboard renders with data
   - Can create/edit an initiative
   - Real-time sync indicator shows status

6. **Console Check**: Browser console should have no critical errors

If any verification fails, rollback the change and debug before proceeding.

---

## Phase 1: Security Fixes (Before Any Deployment)

### 1.1 Enable Authentication

**Frontend (`src/contexts/AuthContext.tsx`):**

- Remove hardcoded admin user (lines 18-26)
- Uncomment and enable the `useEffect` auth check (lines 37-55)
- Ensure `isLoading` state controls UI during auth check

**Backend (`server/index.ts`):**

- Remove auth bypass in `authenticateToken` (lines 191-199)
- Uncomment original JWT verification logic (lines 201-218)
- Generate secure JWT_SECRET and store in environment

### 1.2 Environment Variables

Create proper `.env.production`:

```
JWT_SECRET=<generate-secure-256-bit-key>
GOOGLE_CLIENT_ID=<production-oauth-client>
VITE_API_ENDPOINT=https://api.yourapp.com
VITE_GOOGLE_CLIENT_ID=<production-oauth-client>
```

### 1.3 CORS Configuration

Update `server/index.ts` line 181-186:

- Add production domain origins
- Remove localhost origins for production builds

### Phase 1 Verification Checkpoint

- [ ] Run full verification protocol (build, typecheck, lint, start)
- [ ] Test login flow with real credentials (not bypassed)
- [ ] Verify JWT token is stored and sent with requests
- [ ] Test logout clears session
- [ ] Verify protected routes redirect to login when unauthenticated

---

## Phase 2: Google Cloud Storage Migration

*Timeline: When GCS becomes available (in a few days)*

### 2.1 Create Data Service Abstraction

Create `src/services/dataService.ts`:

- Abstract interface for CRUD operations
- Implement GCS adapter using `@google-cloud/storage`
- Keep Google Sheets adapter as fallback/migration path

### 2.2 Backend GCS Integration

Update `server/index.ts`:

- Add GCS client initialization
- Create bucket for initiatives, changelog, snapshots
- JSON document storage (one file per initiative or batch files)

### 2.3 Data Migration

- Export current Google Sheets data
- Transform to GCS JSON format
- Import to GCS bucket
- Validate data integrity

### Phase 2 Verification Checkpoint

- [ ] Run full verification protocol
- [ ] Create a new initiative and verify it persists to GCS
- [ ] Edit an initiative and verify changes saved
- [ ] Refresh page and verify data loads from GCS
- [ ] Check localStorage fallback works when GCS unavailable
- [ ] Verify changelog entries are recorded

---

## Phase 3: Google Cloud Infrastructure

### 3.1 Cloud Run Deployment

**Backend Service:**

- Containerize with Dockerfile
- Deploy to Cloud Run
- Configure autoscaling (min: 1, max: 10)
- Set memory/CPU limits

**Frontend:**

- Build static assets with Vite
- Deploy to Cloud Storage + Cloud CDN
- Or deploy to Firebase Hosting

### 3.2 Networking

- Configure Cloud Load Balancer (if needed)
- Set up custom domain with SSL
- Configure Cloud Armor for DDoS protection

### 3.3 Secrets Management

- Migrate secrets to Google Secret Manager
- Reference secrets in Cloud Run configuration
- Remove all secrets from code and .env files

### Phase 3 Verification Checkpoint

- [ ] Access deployed app via production URL
- [ ] Verify HTTPS certificate is valid
- [ ] Test login with Google OAuth on production
- [ ] Create/edit initiative on production
- [ ] Verify real-time updates work between two browser tabs
- [ ] Check Cloud Run logs for any errors
- [ ] Verify secrets are not exposed in logs or responses

---

## Phase 4: Monitoring & Observability

### 4.1 Logging

- Integrate Cloud Logging
- Update `src/utils/logger.ts` to send logs to Cloud Logging
- Add request tracing with Cloud Trace

### 4.2 Error Tracking

- Integrate Error Reporting
- Update `ErrorBoundary.tsx` to report to cloud
- Set up alerting policies

### 4.3 Metrics

- Enable Cloud Monitoring
- Create dashboard for key metrics:
  - Request latency
  - Error rates
  - Active users
  - Data sync status

### Phase 4 Verification Checkpoint

- [ ] Trigger an intentional error and verify it appears in Error Reporting
- [ ] Check Cloud Logging shows structured logs from the app
- [ ] Verify monitoring dashboard displays real-time metrics
- [ ] Test alerting by triggering a threshold breach
- [ ] Run full verification protocol locally

---

## Phase 5: Testing & CI/CD

### 5.1 Testing

- Add Vitest for unit tests
- Add Playwright for E2E tests
- Minimum coverage targets: 60% unit, key flows E2E

### 5.2 CI/CD Pipeline

Create `.github/workflows/deploy.yml` or Cloud Build:

- Lint and type check
- Run tests
- Build Docker image
- Deploy to Cloud Run (staging first, then prod)

### Phase 5 Verification Checkpoint

- [ ] All unit tests pass locally (`npm test`)
- [ ] E2E tests pass locally
- [ ] Push a commit and verify CI pipeline runs
- [ ] Verify staging deployment succeeds automatically
- [ ] Run full verification protocol on staging environment

---

## Phase 6: Production Hardening

### 6.1 Rate Limiting

Add rate limiting middleware to Express:

- Login: 5 requests/minute
- API: 100 requests/minute per user

### 6.2 Input Validation

- Add Zod or Joi validation to API endpoints
- Sanitize all user inputs
- Add CSRF protection

### 6.3 Database Backup

- Configure GCS object versioning
- Set up automated backups
- Define retention policy (30 days)

### Phase 6 Verification Checkpoint

- [ ] Test rate limiting by exceeding limits (should get 429 response)
- [ ] Test input validation with malformed data (should be rejected)
- [ ] Verify backup is created and can be restored
- [ ] Run security scan (e.g., npm audit, OWASP ZAP)
- [ ] Final full verification protocol on production

---

## Recommended Priority Order

| Priority | Phase | Effort | Blocker |

|----------|-------|--------|---------|

| P0 | 1.1-1.3 (Auth/Security) | 1 day | Must do before deployment |

| P1 | 3.1-3.3 (Cloud Infrastructure) | 2-3 days | Requires GCP project setup |

| P2 | 2.1-2.3 (GCS Migration) | 2 days | Wait for GCS availability |

| P3 | 4.1-4.3 (Monitoring) | 1 day | After deployment |

| P4 | 5.1-5.2 (Testing/CI) | 3-5 days | Ongoing |

| P5 | 6.1-6.3 (Hardening) | 2 days | Before public release |

---

## Key Files to Modify

| File | Changes |

|------|---------|

| `server/index.ts` | Enable auth, CORS, add GCS |

| `src/contexts/AuthContext.tsx` | Remove auth bypass |

| `src/services/dataService.ts` | New: GCS abstraction |

| `src/utils/logger.ts` | Cloud Logging integration |

| `package.json` | Add GCS deps, test scripts |

| `Dockerfile` | New: Container config |

| `.github/workflows/*.yml` | New: CI/CD pipeline |