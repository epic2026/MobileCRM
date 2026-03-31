# Play Store Assets & Submission Guide

## Generated Assets

The following assets have been created for Play Store submission:

### App Icons
- `public/app-icon-512.png` - 512x512 high-res icon (required)
- `public/pwa-192x192.png` - 192x192 icon
- `public/pwa-512x512.png` - 512x512 PWA icon

### Feature Graphic
- `public/feature-graphic.png` - 1024x500 feature graphic for Play Store listing

## Required Store Listing Information

### App Details
- **App Name**: CallFlow CRM
- **Short Description** (80 chars max): Mobile CRM for managing leads and tracking calls on the go.
- **Full Description**:
```
CallFlow CRM is a powerful mobile CRM designed for sales professionals who need to manage leads and track customer interactions on the go.

KEY FEATURES:
• Lead Management - Create, organize, and track leads through your sales pipeline
• Call Log Integration - Automatically sync your phone calls with lead activities
• Voice Notes - Record post-call notes and memos
• Activity Timeline - View complete interaction history for each lead
• Task Management - Create follow-up tasks and reminders
• Quick Dial Pad - Make calls directly from the app

PERMISSIONS EXPLAINED:
• Call Log Access: Syncs your call history with CRM leads for automatic activity logging
• Microphone: Allows you to record voice notes after calls (recording only when you initiate)

Perfect for:
- Sales representatives
- Account managers
- Business development professionals
- Real estate agents
- Insurance agents
- Anyone who needs to track customer calls

Download CallFlow CRM today and never miss a follow-up again!
```

### Category
- **Primary**: Business
- **Secondary**: Productivity

### Content Rating
- Suitable for all ages (no violent or adult content)

### Privacy Policy URL
- Use your published app URL: `https://mobilecrmwithsimcalls.lovable.app/privacy`

## Sensitive Permissions Declaration

Since this app uses READ_CALL_LOG and RECORD_AUDIO permissions, you'll need to submit a Permissions Declaration Form.

### Call Log Permission Justification:
```
CallFlow CRM requires call log access to provide its core CRM functionality. 
The app matches incoming and outgoing calls with existing leads in the user's database, 
automatically logging call activities without manual data entry. This is essential for 
sales professionals who need accurate records of customer interactions.

Call log data is:
- Used only to display calls and match with leads
- Stored securely with encryption
- Never shared with third parties
- Deletable by the user at any time
```

### Microphone Permission Justification:
```
The microphone permission enables users to record voice notes and memos after phone calls.
This feature helps users capture important details and action items while conversations 
are still fresh. All recordings are initiated manually by the user - the app does NOT 
automatically record phone calls.

Audio recordings are:
- Stored locally on the user's device
- Only created when the user explicitly starts a recording
- Deletable by the user at any time
```

## Screenshots Needed

You'll need to capture screenshots from your running app:
1. Home/Dashboard screen
2. Leads list view
3. Lead detail view
4. Call activity/recent calls
5. Voice recording in action
6. Settings page

**Screenshot Requirements:**
- Phone: 1080x1920 or 1440x2560 pixels
- 7-inch tablet: 1200x1920 pixels
- 10-inch tablet: 1600x2560 pixels

## Build & Upload

### Configure signing once

1. Create your upload keystore (one-time):
```bash
keytool -genkeypair -v -keystore android/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

2. Create signing config file:
```bash
cp android/keystore.properties.example android/keystore.properties
```

3. Edit `android/keystore.properties` with real passwords and alias.

1. Generate a signed release APK or AAB:
```bash
npm run release:aab
```

2. The AAB file will be at: `android/app/build/outputs/bundle/release/app-release.aab`

3. Upload to Google Play Console

## Checklist Before Submission

- [ ] App icon uploaded (512x512)
- [ ] Feature graphic uploaded (1024x500)
- [ ] At least 2 phone screenshots
- [ ] Short description written
- [ ] Full description written
- [ ] Privacy policy URL added
- [ ] Permissions declaration form completed
- [ ] Content rating questionnaire completed
- [ ] Target audience selected
- [ ] Pricing set (free or paid)
- [ ] Release signed with upload key
