# Gemlink UI/UX Audit & Annoyances Inventory

This document outlines structural UI/UX flow annoyances, functional miswirings, and general consumer pain points found in the current application state.

## 1. Fatal UI Crashes & Broken Interactions
- **Global Command Palette (Cmd+K) Crash**: The new global search feature (Lane 5) crashes the entire application when navigating through search results with the keyboard. The error `active?.scrollIntoView is not a function` is thrown because the navigation logic attempts to call `scrollIntoView` on an invalid DOM node.
- **Lost Context on Refresh**: Brand context and Project context are stored entirely in React state. If a user carefully writes out their brand colors and audience, and then accidentally hits F5 (refresh), all their context is instantly lost, and subsequent generation jobs will be generic. 

## 2. Compose Flow & Media Picker Annoyances
- **Slideshow Mode Hijacks the Picker**: In Compose, if the mode is set to "Slideshow", the media picker aggressively assumes *anything* you click should be added as a slide. If a user clicks the "Add Voiceover" button and selects an audio file, the composer incorrectly adds the audio file as a visual slide (with a broken thumbnail) instead of adding it to the audio track.
- **Merge Mode Without Content**: The user can select "Merge" mode, pick a video, and accidentally hit Render without selecting any background music or voice track. While there is a toast warning, the UI doesn't visually communicate that an audio track is *required* until the user attempts to render.
- **Render Job Cancellation**: Once a user clicks "Render" in Compose, there is no way to cancel the job. If they notice a typo in their captions a split second later, they have to wait for the entire FFmpeg render process to finish before they can try again.

## 3. Media Planner (Batch Generation) Pain Points
- **Scary Time Estimates**: The "Generation Preview" modal calculates expected wait times serially (e.g., 10 videos * 240s = 40 minutes). Since the backend has a `GenerationQueue` that processes jobs in parallel up to a concurrency limit, this time estimate is wildly inaccurate and might needlessly scare users away from generating large batches.
- **No Undo for AI Suggestions**: Clicking "Quick Plan" auto-appends 4-8 generated items to the Media Plan. If the user doesn't like the AI's suggestions, there is no "Undo" button—they must manually click the "Delete" icon on every single unwanted item.
- **Invisible "Silent" Errors on Polling**: When a batch is generating, the client polls `/api/media/batch/:id` every 5 seconds. If the backend restarts or has a transient network failure, the frontend does not show a "Reconnecting..." state to the user; it just silently waits or drops the batch entirely.

## 4. Performance Bottlenecks
- **Massive Payload on Audio Picker**: In the Compose component, the `resolveAudioUrl` function blindly fetches the *entire* media history (`/api/media/history`) just to find the playback URL for a single audio job. For a power user with hundreds of past generations, this causes massive network lag to play a 3-second audio preview.

## 5. Visual Disconnects
- **Model Selector Overwhelm**: The model selection dropdown in `MediaPlan.tsx` combines Image, Video, and TTS models into one giant list. A consumer can freely select "Veo 3.1" (a video model) for an Image generation task. It makes the platform feel disorganized.
- **Generic Transition Dropdown**: In Compose (Slideshow mode), the "Apply to All" transitions dropdown lacks visual previews and just presents technical names like "fadeblack" or "smoothleft". A consumer won't intuitively know how "smoothleft" behaves without trial and error.

## Recommendations for Immediate Polish
1. Fix the `CommandPalette.tsx` scroll reference bug immediately to unbreak global navigation.
2. Filter the Media Picker explicitly by `pickerTarget` rather than falling back to "Slideshow" blanket logic.
3. Save `BrandContext` state to `localStorage` (matching the `gemlink-feature-projectId` pattern) so user effort isn't destroyed by page refreshes.
4. Refactor `resolveAudioUrl` to hit a targeted `/api/media/job/:id` endpoint rather than pulling the whole database.
