# Gemlink Agents Documentation

## Overview
Gemlink is designed as a multi-agent workspace where different AI personas collaborate to help build and market a brand. 

## Current Agents
1. **Marketing Director**: Focuses on audience engagement, virality, and maintaining the brand voice.
2. **Tech Lead**: Focuses on feasibility, automation, and technical innovation.
3. **Creative Director**: Focuses on aesthetics, storytelling, and emotional connection.
4. **Sales Agent**: A Twilio-integrated SMS bot that responds to customer inquiries using the brand's established voice.

## Architecture Assumptions
- **Server-Side Generation**: Media generation (images, video, voice) has been refactored to go through server endpoints (`/api/media/*`). This is to ensure API keys are kept secure and to allow for local job storage.
- **Job Storage**: Jobs are stored locally in the `jobs/` directory with a `manifest.json` containing metadata. This is a stub for a future cloud storage solution (e.g., S3, Cloud Storage) or database (e.g., Postgres, Firestore).
- **Mobile-First**: The UI is designed to be touch-friendly and responsive, with a mobile hamburger menu and appropriate padding for smaller screens.

## Future Plans
- **Catalog/Storage**: Move the local `jobs/` directory to a robust cloud storage solution.
- **Voice/Video File Saving**: Implement actual file saving for video and voice generations (currently stubbed).
- **Agent Memory**: Implement a database to store agent conversations and brand context persistently.
