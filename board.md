# Gemlink Board

## Current Status
- **App Shell**: React Router + Tailwind CSS + Lucide Icons + Motion.
- **Mobile-First**: Sidebar navigation collapses into a hamburger menu on mobile. Padding and layout are optimized for touch targets.
- **Server-Side Generation**: 
  - Image generation (`/api/media/image`) is fully implemented, saving base64 outputs to local `.png` files and creating a `manifest.json`.
  - Video generation (`/api/media/video`) is fully implemented. It starts an asynchronous polling loop on the server that downloads the `.mp4` file when the Gemini operation completes.
  - Voice generation (`/api/media/voice`) is fully implemented, saving the TTS output to local `.mp3` files.
- **Media Library**: The `/library` route fetches from `/api/media/history` to display saved jobs. It now renders actual `<video>` and `<audio>` tags for completed jobs.

## Assumptions & Technical Debt
- **Local Storage**: The `jobs/` directory is used for local storage. This is not suitable for a production environment like Cloud Run without a persistent volume. It's a stepping stone to cloud storage.
- **Base64 Uploads**: The server currently accepts base64 strings for image uploads (e.g., in video generation). For larger files, a multipart/form-data approach (e.g., using `multer`) would be more robust.
- **Polling UX**: Video generation is asynchronous and can take minutes. The server handles the polling, but the client currently just receives a 'pending' status. A real implementation would need a polling mechanism or WebSockets on the client to update the UI when the job finishes.
- **API Key Handling**: The client still passes the API key to the server if it was selected via the `ApiKeyGuard`. In a true production app, the key would be securely stored on the server or managed via OAuth/user accounts.

## Next Steps
- Implement a follow-up prompt for catalog/storage (e.g., Firebase Storage, AWS S3).
- Implement a database to replace the filesystem-based `manifest.json` history.
- Add user authentication to scope jobs to specific users.
