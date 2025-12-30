# Testing Weekly Effort Validation

## Quick Test Checklist

1. **Check Your Role**
   - Open browser console
   - Type: `JSON.parse(localStorage.getItem('portfolio-config')).rolePermissions`
   - Make sure you're logged in as a Team Lead

2. **Check Feature is Enabled**
   - In console: `JSON.parse(localStorage.getItem('portfolio-config')).weeklyEffortValidation`
   - Should show: `{ enabled: true, thresholdPercent: 15 }`

3. **Check Console Logs**
   - Open browser DevTools Console
   - Look for: `[Weekly Validation] Result:`
   - This shows the calculation details

4. **Check if You Have Initiatives**
   - In console: `JSON.parse(localStorage.getItem('portfolio-initiatives-cache') || '[]').filter(i => i.ownerId === 'YOUR_USER_ID')`
   - Replace `YOUR_USER_ID` with your actual user ID

## Force a Test Flag

Run this in browser console (while logged in as Team Lead):

```javascript
// 1. Get your user ID
const users = JSON.parse(localStorage.getItem('portfolio-users-cache') || '[]');
const currentUser = users.find(u => u.role === 'Team Lead');
console.log('Team Lead ID:', currentUser?.id);

// 2. Update an initiative with high actualEffort and recent update
const initiatives = JSON.parse(localStorage.getItem('portfolio-initiatives-cache') || '[]');
const updated = initiatives.map(i => {
  if (i.ownerId === currentUser?.id) {
    return {
      ...i,
      actualEffort: 10, // High effort
      lastWeeklyUpdate: new Date().toISOString(), // Recent update
      lastUpdated: new Date().toISOString()
    };
  }
  return i;
});
localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(updated));

// 3. Lower threshold to 1% to force flag
const config = JSON.parse(localStorage.getItem('portfolio-config'));
config.weeklyEffortValidation.thresholdPercent = 1;
localStorage.setItem('portfolio-config', JSON.stringify(config));

// 4. Reload page
window.location.reload();
```

## What to Look For

After reloading, you should see:

1. **Console Log**: `[Weekly Validation] Result:` with `flagged: true`
2. **Warning Badge**: Amber alert icon next to your name in TopNav
3. **Modal Popup**: WeeklyEffortWarningModal should appear
4. **Notification**: Notification bell should show a new notification

## If Still Not Working

Check these common issues:

1. **No initiatives owned by Team Lead**: Create an initiative assigned to yourself
2. **No actualEffort values**: Set `actualEffort` on your initiatives
3. **Feature disabled**: Check `config.weeklyEffortValidation.enabled`
4. **Already shown this week**: Clear localStorage: `localStorage.removeItem('effort-warning-shown-YOUR_ID-2024-WXX')`
5. **Wrong role**: Make sure you're logged in as Team Lead, not Admin

## Debug Output

The validation logs show:
- `flagged`: Whether threshold was exceeded
- `deviationPercent`: How much over/under average
- `averageWeeklyEffort`: Calculated average
- `currentWeekEffort`: Current week's effort
- `threshold`: The threshold percentage (default 15%)

If `deviationPercent >= threshold`, it should flag.

