# Android Keyboard Resize Fix

## Problem
On Android devices using the Tauri app, when clicking on the channel input box, the keyboard opens but covers the bottom of the screen (including the input box). The viewport only properly resizes after navigating away from the app and returning.

## Root Cause
The issue was caused by improper Android keyboard handling configuration:
1. Missing `android:windowSoftInputMode` in the AndroidManifest.xml
2. No viewport resize handling for keyboard events
3. Lack of proper mobile CSS for keyboard state transitions

## Solution Implemented

### 1. AndroidManifest.xml Configuration
**File:** `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Added `android:windowSoftInputMode="adjustResize"` to the MainActivity declaration
- This tells Android to resize the viewport when the keyboard appears instead of covering content

### 2. Enhanced HTML Viewport Settings
**File:** `index.html`
- Updated viewport meta tag to include `viewport-fit=cover, user-scalable=no`
- Provides better mobile viewport handling

### 3. Native Android Keyboard Detection
**File:** `src-tauri/gen/android/app/src/main/java/com/obsidianirc/dev/MainActivity.kt`
- Added `setupKeyboardDetection()` method that monitors layout changes
- Detects keyboard open/close events and dispatches JavaScript events
- Provides immediate feedback to the web view when keyboard state changes

### 4. JavaScript Keyboard Handling Hook
**File:** `src/hooks/useKeyboardResize.ts` (NEW)
- Created a React hook that handles keyboard visibility events
- Listens for both Visual Viewport API changes and native Android events
- Updates CSS custom properties to track keyboard height
- Triggers layout recalculations when keyboard state changes

### 5. Mobile-Optimized CSS
**File:** `src/index.css`
- Added `--keyboard-height` CSS custom property
- Added mobile-specific CSS rules for keyboard handling
- Ensures proper viewport adjustments with smooth transitions
- Fixed viewport on mobile devices to prevent layout shifts

### 6. App Integration
**File:** `src/App.tsx`
- Integrated the `useKeyboardResize` hook into the main App component
- Ensures keyboard handling is active throughout the application lifecycle

## Technical Details

### Android Window Soft Input Modes
- `adjustResize`: Resizes the window to make room for the keyboard
- This is preferred over `adjustPan` which just shifts content up

### Visual Viewport API
- Modern browsers provide this API to detect viewport changes
- Especially useful for keyboard events on mobile devices
- Fallback handling for older browsers included

### CSS Custom Properties
- `--keyboard-height` tracks the current keyboard height
- Allows responsive layout adjustments based on keyboard state
- Smooth transitions prevent jarring layout changes

## Expected Behavior After Fix
1. User taps on the channel input box
2. Keyboard opens immediately
3. Viewport resizes instantly to accommodate keyboard
4. Input box remains visible above the keyboard
5. No need to navigate away and back to see proper layout

## Testing Considerations
- Test on various Android devices and screen sizes
- Verify both portrait and landscape orientations
- Ensure keyboard animations are smooth
- Check that all input fields throughout the app behave consistently

## Browser Compatibility
- Modern Android browsers with Visual Viewport API support
- Fallback handling for older browsers
- iOS support included for future compatibility