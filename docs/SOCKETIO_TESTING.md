# Socket.IO Testing Guide for Cloud Run

This guide explains how to test Socket.IO real-time features with Cloud Run deployment, including session affinity verification.

## Prerequisites

- Application deployed to Cloud Run
- Service configured with session affinity
- Access to Cloud Run logs

## Testing Socket.IO with Session Affinity

### 1. Verify Session Affinity is Enabled

```bash
# Check service configuration
gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format="value(spec.template.metadata.annotations.'run.googleapis.com/session-affinity')"

# Should output: "true"
```

### 2. Test Basic Socket.IO Connection

#### Using Browser Console

1. Open your deployed application in a browser
2. Open Developer Console (F12)
3. Run this test:

```javascript
// Connect to Socket.IO
const socket = io('https://your-service.run.app', {
  transports: ['websocket', 'polling']
});

// Test connection
socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
});
```

#### Using curl (for WebSocket testing)

```bash
# Test WebSocket upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://your-service.run.app/socket.io/?EIO=4&transport=websocket
```

### 3. Test Real-Time Collaboration

#### Test User Presence

1. Open application in **Tab 1**
2. Open application in **Tab 2** (same browser or different browser)
3. Both tabs should show each other's presence

**Expected behavior:**
- Both users appear in the presence indicator
- Each user sees the other's avatar/name

#### Test Initiative Updates

1. **Tab 1**: Create or edit an initiative
2. **Tab 2**: Should see the update appear automatically without refresh

**Expected behavior:**
- Changes appear in real-time in Tab 2
- No page refresh needed
- Changes are synchronized

#### Test Collaborative Editing Indicators

1. **Tab 1**: Open an initiative for editing
2. **Tab 2**: Should see that Tab 1 user is editing that initiative

**Expected behavior:**
- Tab 2 shows "User X is editing this initiative"
- Tab 2 cannot edit while Tab 1 is editing (if implemented)

### 4. Test Session Affinity with Multiple Instances

#### Verify Multiple Instances

```bash
# Check if multiple instances are running
gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format="value(status.conditions)"

# Or check logs for instance IDs
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --limit 100 | grep "instance"
```

#### Test Sticky Sessions

1. Open application in **Browser A**
2. Note the Socket.IO connection ID (check browser console)
3. Make a change that triggers a Socket.IO event
4. Check Cloud Run logs to see which instance handled the request
5. Make another change from the same browser
6. Verify it goes to the same instance (session affinity working)

**Expected behavior:**
- All requests from the same browser go to the same Cloud Run instance
- Socket.IO connections persist on the same instance

### 5. Test Connection Resilience

#### Test Reconnection

1. Open application
2. Disconnect network (or disable WiFi)
3. Wait 10 seconds
4. Reconnect network

**Expected behavior:**
- Socket.IO automatically reconnects
- User presence is restored
- No data loss

#### Test Instance Restart

```bash
# Force a new revision (simulates instance restart)
gcloud run services update-traffic portfolio-manager \
  --region us-central1 \
  --to-latest
```

**Expected behavior:**
- Existing connections reconnect automatically
- Users don't lose their session
- Data persists

### 6. Monitor Socket.IO Performance

#### Check Connection Counts

```bash
# View logs for connection events
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --filter="textPayload=~'User connected' OR textPayload=~'User disconnected'" \
  --limit 50
```

#### Check for Errors

```bash
# View error logs
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --filter="severity>=ERROR" \
  --limit 50
```

### 7. Load Testing

#### Using Artillery (if installed)

Create `artillery-socketio.yml`:

```yaml
config:
  target: 'https://your-service.run.app'
  phases:
    - duration: 60
      arrivalRate: 5
scenarios:
  - name: 'Socket.IO connection'
    engine: socketio
    flow:
      - emit:
          channel: 'user:join'
          data:
            id: 'test-user-{{ $uuid }}'
            name: 'Test User'
            email: 'test@example.com'
      - think: 10
      - emit:
          channel: 'user:viewChange'
          data: 'all'
      - think: 30
```

Run test:
```bash
artillery run artillery-socketio.yml
```

#### Manual Load Test

1. Open 10+ browser tabs
2. All connect to the same service
3. Monitor Cloud Run metrics:
   - CPU usage
   - Memory usage
   - Request count
   - Active instances

**Expected behavior:**
- Service scales appropriately
- All connections maintained
- No errors in logs

## Troubleshooting

### Issue: Socket.IO connections fail

**Check:**
1. Session affinity is enabled: `--session-affinity`
2. Timeout is sufficient: `--timeout 300`
3. CORS allows WebSocket connections
4. Firewall doesn't block WebSocket upgrade

**Debug:**
```bash
# Check logs for connection errors
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --filter="textPayload=~'connection error' OR textPayload=~'WebSocket'" \
  --limit 50
```

### Issue: Real-time updates not working

**Check:**
1. Socket.IO client is connecting (check browser console)
2. Events are being emitted (check server logs)
3. Events are being received (check browser console)

**Debug:**
```bash
# Check for Socket.IO events in logs
gcloud run services logs read portfolio-manager \
  --region us-central1 \
  --filter="textPayload=~'initiative:update' OR textPayload=~'initiative:created'" \
  --limit 50
```

### Issue: Session affinity not working

**Symptoms:**
- Connections drop when instances scale
- Real-time updates inconsistent
- Users appear/disappear randomly

**Solution:**
1. Verify `--session-affinity` is set in deployment
2. Check Cloud Run service configuration
3. Ensure all requests use same session cookie

**Verify:**
```bash
gcloud run services describe portfolio-manager \
  --region us-central1 \
  --format="yaml(spec.template.metadata.annotations)"
```

### Issue: High latency with Socket.IO

**Check:**
1. Instance location (should be close to users)
2. Network latency
3. Instance CPU/memory usage

**Optimize:**
- Use regional deployment closer to users
- Increase CPU allocation if needed
- Consider Redis adapter for better scaling

## Performance Benchmarks

Expected performance metrics:

- **Connection time**: < 500ms
- **Event latency**: < 100ms (same instance)
- **Reconnection time**: < 2s
- **Max concurrent connections**: 1000+ per instance

## Best Practices

1. **Always enable session affinity** for Socket.IO
2. **Set appropriate timeout** (300s for long connections)
3. **Monitor connection counts** to plan scaling
4. **Use Redis adapter** if scaling beyond single instance
5. **Implement reconnection logic** in client
6. **Handle connection errors gracefully**

## Next Steps

- Set up monitoring alerts for connection failures
- Configure Redis adapter for multi-instance scaling
- Implement connection health checks
- Add connection metrics to monitoring dashboard

