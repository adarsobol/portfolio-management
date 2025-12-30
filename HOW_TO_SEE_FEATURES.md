# How to See the New Features

## Feature Visibility Guide

### 1. **Effort Toggle (Days/Weeks)** - ✅ Always Visible

**Where to find it:**
- Open any initiative modal (click on an initiative or create new one)
- Look for the "Planned Effort" or "Actual Effort" input fields
- Below the input, you should see two buttons: **"D"** and **"W"**
- Click "D" to switch to days, "W" to switch to weeks

**If you don't see it:**
- Make sure you're editing an initiative (not just viewing)
- Check that the effort input fields are visible
- The toggle buttons are right below the effort input fields

### 2. **Team Lead Delete Permissions** - ✅ Visible When Conditions Met

**Where to find it:**
- As a Team Lead, open an initiative that you own
- Look for a delete button (usually in the modal footer or actions)
- You should be able to delete initiatives you own
- You should NOT be able to delete initiatives owned by others

**To test:**
1. Log in as a Team Lead
2. Create or find an initiative where you are the owner
3. Try to delete it - should work
4. Try to delete someone else's initiative - should show error

### 3. **Quarterly Capacity Labels** - ✅ Always Visible

**Where to find it:**
- Go to Admin Panel (Settings icon in top nav)
- Scroll to "Team Capacity Planning" section
- You should see labels saying "Total Capacity (wks/quarter)"
- Description should mention "per quarter"

**Also visible in:**
- Metrics Dashboard - capacity tooltips mention "Quarterly"
- Resources Dashboard - capacity displays show quarterly context

### 4. **Weekly Effort Validation** - ⚠️ Only Visible When Triggered

**This feature only shows when:**
- You are logged in as a **Team Lead**
- Your weekly effort exceeds the threshold (15% deviation)
- You have initiatives with `actualEffort` values
- You have initiatives updated since last Thursday

**Where to see it:**
1. **Warning Badge**: Next to your name in the top navigation (amber alert icon)
2. **Modal Popup**: Automatically appears when threshold exceeded (once per week)
3. **Notification**: In the notification bell menu

**To test manually:**
1. Log in as Team Lead
2. Open browser console (F12)
3. Run this to force a flag:
```javascript
// Lower threshold temporarily
const config = JSON.parse(localStorage.getItem('portfolio-config'));
config.weeklyEffortValidation.thresholdPercent = 1;
localStorage.setItem('portfolio-config', JSON.stringify(config));
window.location.reload();
```

### 5. **URL Routing (Deep Linking)** - ⚠️ Partially Implemented

**Current Status:**
- BrowserRouter is set up ✅
- Routes are defined in AppRoutes.tsx ✅
- BUT: AppRoutes component is NOT being used in App.tsx ❌
- Manual routing with useNavigate works ✅

**What works:**
- Navigation between views updates URL
- Direct navigation to `/admin`, `/timeline`, etc. works
- Initiative links can use `/item/:id` format

**What's missing:**
- AppRoutes component needs to wrap the main content
- Deep linking to initiatives might not work perfectly

## Quick Test Checklist

### ✅ Easy to Test (Always Visible):
- [ ] **Effort Toggle**: Open initiative modal → See D/W buttons below effort inputs
- [ ] **Quarterly Labels**: Admin Panel → Team Capacity section → See "per quarter" labels

### ⚠️ Requires Specific Conditions:
- [ ] **Delete Permissions**: Log in as Team Lead → Try deleting own vs others' initiatives
- [ ] **Weekly Validation**: Log in as Team Lead → Need to exceed threshold OR manually trigger
- [ ] **URL Routing**: Check if URLs change when navigating (should work)

## Troubleshooting

### If you don't see effort toggle:
1. Make sure you're in edit mode (not just viewing)
2. Check browser console for errors
3. Verify `effortDisplayUnit` state exists (check localStorage: `effort-display-unit`)

### If weekly validation doesn't show:
1. Check you're logged in as Team Lead (not Admin)
2. Check console for `[Weekly Validation] Result:` logs
3. Verify `weeklyEffortValidation.enabled` is `true` in config
4. You need initiatives with `actualEffort` values and recent `lastWeeklyUpdate`

### If delete doesn't work:
1. Check your role (must be Team Lead)
2. Check if initiative is owned by you
3. Check browser console for permission errors
4. Verify `deleteTasks: 'own'` in Team Lead permissions

## Next Steps to Fully Enable Features

1. **Integrate AppRoutes component** - Wrap main content with `<AppRoutes>` for proper routing
2. **Test weekly validation** - Create test data that triggers the validation
3. **Verify all features** - Test each feature with appropriate user roles

