# Gemlink Board

## Current Status
- **App Shell**: React Router + Tailwind CSS + Lucide Icons + Motion.
- **Mobile-First**: Sidebar navigation refactored to a hamburger menu on mobile. Padding adjusted for touch targets.
- **Server-Side Generation**: 
  - Image generation (`/api/media/image`) is fully implemented, saving base64 outputs to local files and creating a `manifest.json`.
  - Video generation (`/api/media/video`) is stubbed.
  - Voice generation (`/api/media/voice`) is stubbed.
- **Media Library**: A new `/library` route fetches from `/api/media/history` to display saved jobs.

## Assumptions & Technical Debt
- **Local Storage**: The `jobs/` directory is used for local storage. This is not suitable for a production environment like Cloud Run without a persistent volume. It's a stepping stone to cloud storage.
- **Base64 Uploads**: The server currently accepts base64 strings for image uploads (e.g., in video generation). For larger files, a multipart/form-data approach (e.g., using `multer`) would be more robust.
- **Polling**: Video generation is asynchronous and can take minutes. The current stub just returns a 'pending' status. A real implementation would need a polling mechanism or WebSockets to update the client when the job finishes.
- **API Key Handling**: The client still passes the API key to the server if it was selected via the `ApiKeyGuard`. In a true production app, the key would be securely stored on the server or managed via OAuth/user accounts.

## Next Steps
- Implement a follow-up prompt for catalog/storage (e.g., Firebase Storage, AWS S3).
- Implement a follow-up prompt for voice/video file saving (handling the actual binary streams from Gemini).
- Add user authentication to scope jobs to specific users.
