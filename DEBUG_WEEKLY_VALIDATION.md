# Debugging Weekly Effort Validation

## Why You Might Not See the Warning

The weekly effort validation has several requirements that must be met:

### 1. **User Must Be a Team Lead**
- Check your current role in the app
- The validation only runs for users with `role === 'Team Lead'`
- Check browser console for: `[Weekly Validation] Feature disabled or user not Team Lead`

### 2. **Feature Must Be Enabled**
- Check `config.weeklyEffortValidation.enabled` is `true`
- Default is `true` in `INITIAL_CONFIG`, but check localStorage: `portfolio-config`

### 3. **Initiatives Must Have `lastWeeklyUpdate` Field**
- The validation calculates "current week effort" by looking at initiatives updated since last Thursday
- If initiatives don't have `lastWeeklyUpdate` set, `currentWeekEffort` will be 0
- **This is likely the main issue!**

### 4. **Initiatives Must Have `actualEffort` Values**
- Need actual effort values to calculate totals
- Check that your initiatives have `actualEffort > 0`

### 5. **Deviation Must Exceed Threshold**
- Default threshold is 15%
- The calculation: `|currentWeekEffort - averageWeeklyEffort| / averageWeeklyEffort * 100`
- If average is 0 or very small, deviation might not trigger

## Quick Test Steps

### Option 1: Force a Flag (For Testing)

Add this to browser console while logged in as Team Lead:

```javascript
// Get current config
const config = JSON.parse(localStorage.getItem('portfolio-config'));

// Temporarily lower threshold to 1% to force a flag
config.weeklyEffortValidation.thresholdPercent = 1;
localStorage.setItem('portfolio-config', JSON.stringify(config));

// Reload page
window.location.reload();
```

### Option 2: Set `lastWeeklyUpdate` on Initiatives

The validation needs initiatives with recent `lastWeeklyUpdate` timestamps:

```javascript
// In browser console - update your initiatives
const initiatives = JSON.parse(localStorage.getItem('portfolio-initiatives-cache') || '[]');
const updated = initiatives.map(i => {
  if (i.ownerId === 'YOUR_TEAM_LEAD_ID') {
    return { ...i, lastWeeklyUpdate: new Date().toISOString() };
  }
  return i;
});
localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(updated));
window.location.reload();
```

### Option 3: Check Console Logs

Open browser console and look for:
- `[Weekly Validation] Result:` - Shows the validation calculation
- Check if `flagged: true` and `deviationPercent >= threshold`

## Common Issues

1. **No `lastWeeklyUpdate` fields**: Initiatives need this field set when effort is updated
2. **No actualEffort values**: Need effort data to calculate
3. **User not Team Lead**: Check role in user menu
4. **Feature disabled**: Check config in localStorage
5. **Already shown this week**: Modal only shows once per week (check localStorage key)

## Manual Trigger (For Testing)

To manually trigger the validation check:

```javascript
// In browser console
const { validateWeeklyTeamEffort } = await import('./src/services/weeklyEffortValidation.ts');
const config = JSON.parse(localStorage.getItem('portfolio-config'));
const initiatives = JSON.parse(localStorage.getItem('portfolio-initiatives-cache') || '[]');
const currentUser = { id: 'YOUR_TEAM_LEAD_ID', role: 'Team Lead' };

const result = validateWeeklyTeamEffort(initiatives, config, currentUser.id);
console.log('Validation Result:', result);
```

## Fix: Update Initiative Modal to Set `lastWeeklyUpdate`

The `lastWeeklyUpdate` field should be set automatically when effort is updated. Check if `InitiativeModal.tsx` sets this field when `actualEffort` changes.

