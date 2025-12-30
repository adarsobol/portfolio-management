# Feature Verification Checklist

Run these checks in your browser console (F12) at http://localhost:3000:

## 1. Check if Code is Loaded

```javascript
// Check if weekly validation service exists
console.log('Weekly Validation:', typeof validateWeeklyTeamEffort);

// Check if effort converter exists  
console.log('Effort Converter:', typeof weeksToDays);

// Check if canDeleteInitiative exists
console.log('Can Delete:', typeof canDeleteInitiative);
```

## 2. Check Configuration

```javascript
// Check weekly validation config
const config = JSON.parse(localStorage.getItem('portfolio-config'));
console.log('Weekly Validation Config:', config.weeklyEffortValidation);

// Check Team Lead permissions
console.log('Team Lead Delete Permission:', config.rolePermissions['Team Lead']?.deleteTasks);
```

## 3. Check State

```javascript
// Check effort display unit
console.log('Effort Unit:', localStorage.getItem('effort-display-unit'));

// Check if weekly flags exist
// (This requires React DevTools or checking component state)
```

## 4. Visual Checks

### Effort Toggle Buttons
1. Click "New" button to create initiative
2. Scroll to "Planned Effort" field
3. Look BELOW the input field for two small buttons: "D" and "W"
4. If you don't see them, check browser console for errors

### Quarterly Labels
1. Click Admin/Settings icon in top nav
2. Scroll to "Team Capacity Planning (Per Quarter)" section
3. Check table header says "Total Capacity (wks/quarter)"

### Delete Button (Team Lead)
1. Log in as Team Lead
2. Open an initiative you own
3. Look for delete/trash icon button
4. Try clicking it

### Weekly Validation Warning
1. Log in as Team Lead  
2. Check top nav next to your name for amber alert icon
3. Check notification bell for "Weekly Effort Exceeded" notification

## 5. Force Feature Visibility (For Testing)

### Force Effort Toggle to Show
```javascript
// Set effort unit to days
localStorage.setItem('effort-display-unit', 'days');
window.location.reload();
// Then open initiative modal - should show days
```

### Force Weekly Validation Warning
```javascript
// Lower threshold to 1%
const config = JSON.parse(localStorage.getItem('portfolio-config'));
config.weeklyEffortValidation.thresholdPercent = 1;
localStorage.setItem('portfolio-config', JSON.stringify(config));

// Update an initiative with high effort
const initiatives = JSON.parse(localStorage.getItem('portfolio-initiatives-cache') || '[]');
const updated = initiatives.map(i => {
  if (i.ownerId === 'YOUR_TEAM_LEAD_ID') {
    return {
      ...i,
      actualEffort: 10,
      lastWeeklyUpdate: new Date().toISOString()
    };
  }
  return i;
});
localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(updated));
window.location.reload();
```

## Common Issues

### Issue: Features not showing after deployment
**Solution**: 
- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)
- Clear browser cache
- Check if build completed successfully

### Issue: Effort toggle buttons not visible
**Solution**:
- Make sure you're editing (not just viewing) an initiative
- Check that `setEffortDisplayUnit` prop is passed to InitiativeModal
- Verify no JavaScript errors in console

### Issue: Weekly validation never triggers
**Solution**:
- Must be logged in as Team Lead (not Admin)
- Need initiatives with `actualEffort > 0`
- Need initiatives with recent `lastWeeklyUpdate` timestamp
- Threshold might be too high (try lowering to 1% for testing)

### Issue: Delete button not working
**Solution**:
- Check you're logged in as Team Lead
- Verify initiative is owned by you
- Check browser console for permission errors
- Verify `deleteTasks: 'own'` in Team Lead permissions

