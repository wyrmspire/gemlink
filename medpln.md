# Media Planner Improvement Suggestions

> Reviewed: 2026-03-15 | File: `src/pages/MediaPlan.tsx` | Route: `/plan`

---

## What's Good Already

- Multi-plan management with sidebar (create, rename, delete, switch)
- Per-item drag-to-reorder using Motion `Reorder.Group`
- Batch generation with polling (`/api/media/batch`)
- AI "Quick Plan" from natural language description (`/api/media/plan/suggest`)
- Boardroom handoff for strategic planning
- Auto-Compose grouping of completed items
- Per-item generation config (model, size, aspect ratio, count, negative prompt)
- Type-specific config panels (voice selector for voice; duration input for music)
- Batch action bar (select many → set aspect ratio / model / count / edit prompts)
- Status pills with error tooltip on rejected items
- Import from Research page and Boardroom via sessionStorage

---

## Improvements (Shipped in This PR)

### ✅ Generate Single Item
**Problem**: Users had to use "Preview & Generate" to test even a single item, which queued the whole plan.  
**Fix**: Added a `▶` play button on each item in `draft` or `rejected` state. Clicking it calls `/api/media/batch` with just that one item and tracks the single-item generating state separately from the batch spinner.

### ✅ Duplicate / Clone Item
**Problem**: No way to copy an item to create a variant with slightly different settings.  
**Fix**: Added a `Copy` icon button on every item row. `duplicateItem()` clones the source item (new ID, `"Copy of …"` label, reset status/batchId/error) and inserts the copy immediately below the original.

### ✅ Progress Overview Bar
**Problem**: No visual summary of how far through the plan you are. Users had to count status pills manually.  
**Fix**: A progress bar section shows above the AI suggest box whenever the plan has items. Displays a gradient fill bar (`indigo → emerald`) based on `(completed + approved) / total`, plus colour-coded status chips (draft, queued, generating, review, approved, rejected) showing counts for each non-zero status.

### ✅ Re-draft on Rejected Items
**Problem**: Rejecting an item with a bad prompt was a dead end — no recovery path other than deleting and re-adding.  
**Fix**: Added a `↺` (RefreshCw) button that appears only on `rejected` items. Clicking it resets `status → "draft"` and clears `error`, so the user can open the edit panel, fix the prompt, and re-queue with the single-item or batch generate.

### ✅ Collect Approved → New Collection
**Problem**: After approving generated outputs, there was no way to put them into a collection without going to Library and doing it manually item-by-item.  
**Fix**: Added a "Collect Approved (N)" button in the header (visible only when `approvedCount > 0`). Clicking it creates a new collection named `"<PlanName> — Approved"` via `POST /api/collections`, then bulk-adds all approved job IDs via `POST /api/collections/:id/items`. On success, navigates to `/collections`.

### ✅ Music Type in Item Type Selector
**Problem**: The type selector in the item edit panel only showed Image / Video / Voice — not Music, even though the `MediaPlanItem` type and config panel already supported it.  
**Fix**: Added `<option value="music">Music</option>` to the type `<select>` so users can change an item's type to music from within the edit panel.

### ✅ Mobile Plan Selector
**Problem**: The plans sidebar is `hidden lg:flex` so on mobile/tablet there was no way to switch between plans (only "New Plan" was shown via a mobile button).  
**Fix**: On small screens (`lg:hidden`), when there are multiple plans, a `<select>` dropdown appears in the header action row allowing plan switching without the sidebar.

---

## Remaining Quick Wins 🔴 (Not Yet Implemented)

| # | Gap | Detail | Effort |
|---|-----|--------|--------|
| 1 | **Item presets / templates** | One-click add "Hero Image", "Instagram Post", "YouTube Intro" etc. with pre-filled type, aspect ratio, and prompt template. Store 5-10 built-in presets. | S |
| 2 | **Plan templates** | Pre-built plans: "YouTube Launch Package" (hero, intro, 3 thumbnails, music), "Instagram Week" (7 posts), etc. Populate the whole plan in one click. | M |
| 3 | **Drag items between plans** | Currently items can only be reordered within one plan. A "Move to…" context menu or cross-plan drag would let users reorganize across plans. | M |
| 4 | **"Send All to Library" filter** | After generation, add a "View in Library" shortcut that links to `/library` pre-filtered to the batch IDs from this plan. | S |
| 5 | **Reject → re-prompt modal** | When clicking "Reject", open a small modal with the current prompt pre-filled so user can edit before rejecting, instead of a two-step reject-then-redraft flow. | S |
| 6 | **Clear Plan confirmation modal** | The "Clear plan" button at the bottom uses the raw browser `confirm()`. Replace with a styled modal like `Compose.tsx`'s "Start Fresh" modal. | S |
| 7 | **Plan export / import** | Export the full plan as JSON. Import a plan from JSON. Useful for sharing plans with team or backing up before a sprint. | S |
| 8 | **Per-item estimated time badge** | Show a small estimate next to each item: `~5s` for image, `~4 min` for video, `~3s` for voice. Uses the same logic as the Generation Preview modal. | S |
| 9 | **Search / filter items** | A filter bar above the item list: filter by type (image / video / voice / music) or by status. Useful when a plan has 20+ items. | S |
| 10 | **Keyboard shortcut to add item** | `Cmd/Ctrl + Enter` while focused on the natural input box should trigger Quick Plan. `N` key to add a blank item. | XS |
| 11 | **Inline prompt editing** | Click the truncated purpose/prompt text on the collapsed item row to edit it directly in-place, without opening the full expand panel. | S |
| 12 | **Collapse / expand all** | A "Collapse all / Expand all" toggle next to "Select all" for when many items are open. | XS |

---

## Medium-Effort Improvements 🟡

| # | Gap | Detail | Effort |
|---|-----|--------|--------|
| 1 | **Calendar / schedule view** | Toggle between list view and calendar view where items are placed on a content calendar. Drag items to a date. Shows publish schedule context. | L |
| 2 | **Item dependencies** | Allow "generate item B after item A completes". Useful for music-after-voiceover or image-before-video-intro workflows. | M |
| 3 | **AI-assisted prompt improvement** | Per-item "✨ Improve" button that rewrites the prompt with brand context + best practices injected. Calls a lightweight Gemini Flash endpoint. | M |
| 4 | **Rating / feedback on generated outputs** | After review, allow 1–5 star rating per generated output (not just approve/reject). Stars feed into auto-scoring. | M |
| 5 | **Multi-generate with A/B comparison** | When count > 1, show the variants side-by-side in a comparison modal so user can pick the best one rather than reviewing them all separately in Library. | M |
| 6 | **Plan analytics / cost estimate** | Show total estimated API cost or token spend before and after generation. "This plan used ~X image requests, Y video seconds." | M |
| 7 | **Notifications on batch complete** | Send a browser notification when a long-running batch (video items) completes, so users don't have to stay on the page. | S |
| 8 | **"Regenerate" action on review items** | When in `review` status, add a "Regenerate" button that keeps the prompt/config but creates a new generation alongside the existing one. | S |

---

## Large / Strategic Improvements 🔵

| # | Gap | Detail | Effort |
|---|-----|--------|--------|
| 1 | **Server-side plan persistence** | Plans are currently stored in `localStorage`, so they're tied to the browser/device. Migrate to server storage (`jobs/plans/`) via a `/api/media/plans` CRUD API. | L |
| 2 | **Collaborative review** | Share a read-only or comment-only plan link with team members. They can add comments per item (not full generation access). | XL |
| 3 | **Plan versioning** | Snapshot plan state before each batch run. Allow rolling back to "before last generation" if results were unsatisfactory. | L |
| 4 | **Integration with Briefs** | When creating a Brief, offer "Generate Media Plan from Brief" which calls the suggest endpoint with the brief's context. | M |
| 5 | **Plan completion wizard** | After all items are approved, a "Wrap Up" modal walks the user through: collect → compose → export → schedule. A guided post-production flow. | L |

---

## Code Quality Notes

| Issue | File | Detail |
|-------|------|--------|
| `batchRunning` state unused in UI | `MediaPlan.tsx` | The `batchRunning` flag is set but never used to disable buttons during batch start — the `Preview & Generate` button should be disabled while `batchRunning` is true. |
| `completedCount` includes `generating` | `MediaPlan.tsx` | Items in `"generating"` status with `generatedJobIds.length > 0` are counted in `completedCount` and thus shown in the Auto-Compose button count, which could be confusing — they haven't actually completed yet. Consider only counting `review` + `approved`. |
| Plans not backed up server-side | `MediaPlan.tsx` | All plan data lives in `localStorage`. A browser clear wipes all plans. The `jobs/` directory already exists for other artifacts; adding plan persistence there would be a straightforward improvement. |
| `clearPlan` uses direct `.filter([])` | `MediaPlan.tsx` | The "Clear plan" button at the bottom calls `saveItems(activePlan.id, [])` without any confirmation. This is a destructive action that should use a confirm modal. |
