# Gemlink Agents Documentation

## Overview
Gemlink is designed as a multi-agent workspace where different AI personas collaborate to help build and market a brand. 

## Current Agents
1. **Marketing Director**: Focuses on audience engagement, virality, and maintaining the brand voice.
2. **Tech Lead**: Focuses on feasibility, automation, and technical innovation.
3. **Creative Director**: Focuses on aesthetics, storytelling, and emotional connection.
4. **Sales Agent**: A Twilio-integrated SMS bot that responds to customer inquiries using the brand's established voice.

## Architecture & Job Model
- **Server-Side Generation**: All media generation (images, video, voice) goes through server endpoints (`/api/media/*`). This ensures API keys are kept secure and allows for consistent background job processing.
- **Consistent Job Model**: All media generations (image, video, voice) create a job directory with a `manifest.json` containing metadata (prompt, model, status, outputs).
- **Local File Persistence**: 
  - **Images**: Saved locally as `.png` files.
  - **Voice**: Saved locally as `.mp3` files.
  - **Video**: Handled via an asynchronous polling mechanism on the server that downloads the final `.mp4` file once the Gemini operation completes.
- **Mobile-First**: The UI is designed to be touch-friendly and responsive, with a mobile hamburger menu and appropriate padding for smaller screens. The Media Library provides a unified view of all generated assets across devices.

## Future Plans
- **Cloud Storage**: Move the local `jobs/` directory to a robust cloud storage solution (e.g., S3, Cloud Storage) for production deployments.
- **Database**: Implement a database (e.g., Postgres, Firestore) to store agent conversations, brand context, and job metadata persistently instead of relying on the filesystem.
- **User Authentication**: Scope jobs and brand context to specific users.
