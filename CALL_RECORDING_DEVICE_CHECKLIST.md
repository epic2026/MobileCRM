# Call Recording Device Checklist

Use this checklist on a physical Android device. Emulator results are not enough for phone-state and audio-capture validation.

## Setup

- Install the debug APK from `android/app/build/outputs/apk/debug/app-debug.apk`.
- Sign in with a sales user account.
- Open Settings and enable `Auto Call Recording`.
- Grant `Microphone`, `Phone`, and `Call Log` permissions when prompted.
- Confirm the toggle stays enabled after closing and reopening the app.

## Core Call Flows

- Make one outgoing call that lasts at least 10 seconds.
- Verify the app creates a call log entry after the call ends.
- Verify a recording appears in the recordings list or Supabase `call_recordings`.
- Verify the uploaded file plays back and note whether both sides of the conversation are audible.
- Receive one incoming call that lasts at least 10 seconds.
- Verify the app creates a call log entry and recording for the incoming call.
- Reject one incoming call.
- Confirm the app does not upload a broken recording for a missed call.

## Data Integrity

- Make a call to a phone number that matches an existing lead.
- Confirm the call log links to the correct lead.
- Confirm a lead activity entry is created for the recorded call.
- Confirm the recording row stores `file_path`, `duration`, `user_id`, and `call_log_id`.
- Confirm AI analysis starts only after the upload succeeds.

## Toggle Behavior

- Turn `Auto Call Recording` off.
- Make another test call.
- Confirm no new recording is created while the toggle is off.
- Turn the toggle back on and repeat one outgoing call.
- Confirm recording resumes without reinstalling the app.

## Failure Cases

- Revoke microphone permission in Android settings and make a call.
- Confirm the app surfaces a recording error instead of silently pretending success.
- Revoke call log permission and make a call.
- Confirm the app still records audio but may have weaker number/type matching.
- Force close the app, place a call, then reopen the app.
- Confirm whether the broadcast/service flow still records as expected.

## Device Notes

- Record the device brand, model, Android version, and default dialer app.
- Record whether both call sides were captured, mic-only was captured, or recording failed.
- Record any OEM-specific battery or background restrictions that affected the service.

## Release Gate

Do not claim production-ready call recording until this passes on each target device family you plan to support.
