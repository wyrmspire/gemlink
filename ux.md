# Gemlink UX Audit — Comprehensive Interaction Review

> Audited: 2026-03-15 | All 16 pages, 11+ shared components, 50+ API endpoints

---

## How to Read This Document

Each section covers a page or component. Within each:
- **What exists** — every button, input, drag target, and interaction available today
- **What's missing** — gaps that limit the user's ability to do what they'd naturally want
- **Priority** — 🔴 Quick win (could exist now) | 🟡 Medium effort | 🔵 Major addition

---

## 1. Dashboard (`/`)

### What You Can Do
- Click any of 12 tool cards to navigate to that page
- Cards animate on hover (scale 1.02) and tap (scale 0.98)
- Two sections: "Create & Generate" and "Strategy & Organize"

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No recent activity feed | 🔴 | User lands on dashboard with no sense of what happened last. Show last 3-5 generated items or pending jobs |
| No quick-generate from dashboard | 🔴 | A "Quick Image" prompt box right on the dashboard would save a click for the most common action |
| No job queue indicator | 🔴 | If 3 videos are rendering, there's no badge or indicator on the dashboard. A small "2 pending" count on the Video card would help |
| No project context shown | 🔴 | Dashboard doesn't remind you which project/brand is active — user has to check sidebar |
| No onboarding or getting started | 🟡 | New users see 12 cards with no guidance on where to start. A "Getting Started" banner or first-time flow would help |
| No favorites/pinned tools | 🟡 | Power users may only use 4-5 tools regularly; let them pin favorites to top |
| No keyboard shortcuts | 🟡 | No way to jump to a page via keyboard (e.g., `G` then `S` for Social) |

---

## 2. Brand Setup (`/setup`)

### What You Can Do
- Create a new project (button → modal → name input → Enter/Escape)
- Switch between projects (sidebar dropdown)
- Edit 6 brand fields: name, brand name, description, audience, voice, style keywords
- Save project settings (button)
- Delete project (button, blocked if only 1 project)

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No "unsaved changes" indicator | 🔴 | User can navigate away and lose edits. No dirty state warning |
| No auto-save or debounced save | 🔴 | Every change requires manually clicking Save |
| No brand preview/summary card | 🔴 | After filling fields, show a preview of how brand context will be injected into prompts |
| No import/export project | 🟡 | Can't share project settings between instances or backup a project |
| No brand logo/color upload | 🟡 | Brand identity has no visual assets — just text fields |
| No "duplicate project" button | 🔴 | To create a variant, user must manually recreate all fields |
| Style keywords are plain text | 🔴 | Should be tag chips (add/remove individually) instead of comma-separated text |
| No field validation | 🔴 | All fields accept empty strings. No character limits or format guidance |
| No project archive (only delete) | 🟡 | Deleting is permanent. An archive option would be safer |

---

## 3. Social Media Generation (`/social`)

### What You Can Do
- Select platform preset (Instagram, Twitter, LinkedIn, YouTube, Custom)
- Write image prompt (textarea)
- Choose number of images (1-4, button group)
- Select model (5 options)
- Select image size (512px, 1K, 2K, 4K)
- Click "Generate X Images"
- View results in 2-column grid
- Images animate in with fade

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| Can't click image to enlarge/fullscreen | 🔴 | No lightbox or detail view — images are small in the grid |
| No download button per image | 🔴 | User must right-click → Save As. Should have explicit download |
| No "Add to Collection" from results | 🔴 | Generated images can't be directly added to a collection without going to Library |
| No image editing (crop, filter, text overlay) | 🟡 | After generating, user can't make quick adjustments |
| Can't select/deselect individual images from a batch | 🔴 | If you generate 4 and like 2, there's no way to keep only those |
| No prompt history/recent prompts | 🔴 | Every session starts blank. No "Recent Prompts" dropdown |
| No prompt templates or suggestions | 🟡 | User stares at blank textarea with no inspiration |
| No negative prompt field | 🔴 | MediaPlanItem has `negativePrompt` in config but Social page doesn't expose it |
| No "try variations" on a result | 🟡 | Can't say "like this one but darker" — have to rewrite entire prompt |
| No style/mood presets | 🟡 | Quick buttons like "Professional", "Playful", "Minimalist" to prefix prompts |
| No image history on the page | 🔴 | Previous generations vanish when you navigate away and come back |
| Can't drag generated images into Compose | 🟡 | No cross-page drag-and-drop |
| No aspect ratio visual preview | 🔴 | Selecting "9:16" doesn't show what that looks like before generating |
| Platform preset doesn't add context to prompt | 🟡 | Selecting "Instagram" changes ratio but doesn't help with content style |
| No multi-select for batch operations | 🔴 | Can't select 3 images and "Add all to collection" |

---

## 4. Video Lab (`/video`)

### What You Can Do
- Select platform preset (YouTube Intro, Instagram Reel, TikTok, Twitter)
- Choose video model (Veo 3.1, 3.0, 2.0)
- Upload a starting image (optional, converted to base64)
- Write video prompt (textarea)
- Select aspect ratio (16:9, 9:16)
- Select resolution (1080p, 720p)
- Click "Generate Video"
- See job status card (pending → completed → failed)
- Watch completed video in embedded player
- Upload and analyze a video (Video Understanding)

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No download button for generated video | 🔴 | Must right-click the video player to download |
| Can't generate from existing image in Library | 🔴 | Must manually upload an image — can't pick from Library |
| No video duration control | 🔴 | User can't specify desired length (5s, 10s, 15s) |
| No "Add to Collection" button on result | 🔴 | Must go to Library to organize |
| No generation history on this page | 🔴 | Navigate away, come back, previous job is gone |
| Single job at a time | 🟡 | Can only have one active video job visible on the page |
| No video preview thumbnails during generation | 🟡 | Just a progress bar with no visual feedback during the wait |
| No "Send to Compose" button | 🔴 | Generated video can't be directly sent to the editor |
| Video Understanding result not saveable | 🔴 | Analysis text disappears on navigation. No "Save as Artifact" or copy button |
| No prompt from analysis | 🟡 | Can't take the analysis of an uploaded video and generate a similar one |
| No storyboard/multi-shot generation | 🔵 | Can't break a concept into multiple connected shots |

---

## 5. Voice Lab (`/voice`)

### What You Can Do
- Select voice (Puck, Charon, Kore, Fenrir, Zephyr)
- Write text for speech (textarea)
- Click "Generate Audio"
- Listen to generated audio in player
- See job status (pending/completed/failed)
- Start/stop live conversation (Gemini Live)
- Real-time bidirectional audio in conversation mode

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No download button for audio | 🔴 | Must use browser's audio element right-click |
| No audio preview/sample per voice | 🔴 | Choosing between 5 voices with no way to hear them first |
| No SSML or emphasis controls | 🟡 | Can't mark pauses, emphasis, or pronunciation |
| No speed/pitch controls | 🔴 | Can't adjust speaking rate or pitch |
| No "Send to Compose" for voiceover | 🔴 | Generated voice can't be directly used as slideshow voiceover without going through Library |
| No transcript for live conversation | 🔴 | Live conversation produces no text record — it's ephemeral |
| No conversation history | 🔴 | Previous conversations are completely lost |
| No multi-paragraph support | 🟡 | Long text has no way to set per-paragraph voice/pacing |
| No "Add to Collection" | 🔴 | Same gap as other generation pages |
| Voice comparison (generate same text in multiple voices) | 🟡 | Would help user pick the right voice |

---

## 6. Music Lab (`/music`)

### What You Can Do
- Write music prompt (textarea)
- Set duration (10-120 seconds, number input)
- See inherited style from project keywords
- Click "Generate Music"
- See job status (pending/completed/failed)
- Listen to completed music in audio player
- Download link below player

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No genre/mood presets | 🔴 | Quick buttons like "Corporate", "Upbeat", "Cinematic", "Lo-Fi" |
| No BPM control | 🟡 | Can't specify tempo |
| No instrument preferences | 🟡 | Can't request "piano only" or "no vocals" |
| No "Send to Compose" button | 🔴 | Must go through Library → Compose to use as background music |
| No waveform visualization | 🟡 | Just a plain audio element. A waveform would add confidence in the output |
| No music history on the page | 🔴 | Previous generations vanish on navigation |
| Can't preview first 5 seconds before full generation | 🟡 | Have to wait for full generation to hear anything |
| No "loop" toggle for background music | 🔴 | Background music often needs to loop — no indication if output is loop-friendly |
| No fade-in/fade-out controls | 🔴 | When used as background, fades are essential |
| No "Try Similar" or variation button | 🔴 | If music is close but not right, no way to generate a variation |

---

## 7. Media Plan (`/plan`)

### What You Can Do
- Create/delete/switch between plans (dropdown + buttons)
- Add plan items via modal (type, label, purpose, prompt, generation config)
- Drag-to-reorder items (dnd-kit)
- Edit individual items (expand → modify)
- Set per-item generation config (model, size, aspect ratio, count, negative prompt)
- "Generate All" batch generation
- Poll for batch progress
- Review generated outputs (approve/reject per item)
- View scores and tags on generated items
- Navigate to Library from items

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No "Generate Single Item" button | 🔴 | Must use "Generate All" even to test one item |
| No duplicate/clone item | 🔴 | Can't copy an item to make a variation |
| No item templates or presets | 🟡 | Common patterns (hero image, thumbnail, intro video) should be one-click |
| No plan templates | 🟡 | "YouTube Launch Package", "Instagram Week Plan" etc. |
| No drag between plans | 🟡 | Can't move items from one plan to another |
| No inline prompt editing | 🔴 | Must open full modal to change a prompt — inline editing would be faster |
| No plan progress overview | 🔴 | No visual showing "3/8 items complete" with a progress bar |
| No estimated cost/time preview | 🟡 | Before batch generation, show estimated time or API cost |
| No "Send All Approved to Collection" | 🔴 | After approving items, no one-click way to create a collection from them |
| Can't reorder within review mode | 🔴 | Drag-to-reorder is only in the planning view |
| No item dependencies/grouping | 🟡 | Can't say "generate the music after the voiceover is done" |
| Reject doesn't allow re-prompt | 🔴 | Rejecting an item should let you modify the prompt and re-queue |
| No collaborative review (comments) | 🔵 | Single-user only — no way to share a plan for team feedback |
| No calendar/schedule view | 🔵 | Plans are lists, not scheduled. A calendar view would help content planning |

---

## 8. Compose / Media Editor (`/compose`)

### What You Can Do
- **Slideshow mode**:
  - Add images from MediaPickerPanel (left sidebar)
  - Reorder slides via drag (Reorder.Group)
  - Set per-slide duration (seconds)
  - Choose per-slide transition (fade/dissolve/slideright/etc.)
  - Toggle Ken Burns per slide
  - Delete individual slides
  - Add voiceover track (drop zone + volume slider 0-1)
  - Add background music track (drop zone + volume slider 0-1)
  - Add captions (text, style, font size, color, position, timing mode)
  - Set aspect ratio (1:1, 16:9, 9:16, 4:5)
  - Set resolution (720p, 1080p)
  - Add image watermark/overlay (drop zone + opacity slider)
  - Preview and Render

- **Merge mode**:
  - Add source video (drop zone)
  - Add voiceover + music (drop zones + volume)
  - Trim video (start/end time inputs)
  - Clear trim
  - Render

- **Captions Only mode**:
  - Add source video (drop zone)
  - Configure captions
  - Render

### What's Missing — THIS IS THE BIG ONE
| Gap | Priority | Detail |
|-----|----------|--------|
| **No timeline/preview scrubber** | 🔴 | Can't see what the slideshow will look like before rendering. No visual timeline showing slides + audio alignment |
| **No undo/redo** | 🔴 | Remove a slide by accident? Start over. This is critical for an editor |
| **No "try different music" swap** | 🔴 | To change background music, must remove current and pick a new one. Should be a simple swap |
| **No audio preview** | 🔴 | Can't hear the voiceover or music before rendering — flying blind on audio |
| **No "Save as Template"** | 🔴 | User builds a great slideshow config, can't reuse the structure with different media |
| **No per-slide text overlay** | 🔴 | The caption system is global — can't have different text per slide |
| **No slide thumbnail preview** | 🔴 | Slides show as tiny 50px thumbs in the timeline — too small to tell what's what |
| **No Ken Burns direction control** | 🟡 | Can toggle it on/off but can't control zoom direction (in vs out, left vs right) |
| **No transition preview** | 🟡 | Selecting "dissolve" vs "fade" — no visual preview of what these look like |
| Can't duplicate a slide | 🔴 | If you want the same image twice (e.g., for a hold), must add it again from picker |
| Can't split/combine slides | 🟡 | No way to split a long slide into two or merge short ones |
| No video+video merge (multi-clip) | 🟡 | Merge mode only does 1 video + audio. Can't join 2 videos together |
| No music volume envelope | 🟡 | Volume is flat — can't duck music during voiceover automatically |
| Can't export/share compose config | 🔴 | Config is per-device (localStorage). Can't share a composition setup |
| No render progress indicator | 🔴 | After clicking Render, user gets a job ID but no progress bar or ETA |
| No render preview (low-res fast preview) | 🟡 | Must do full render to see any result. A quick 360p preview would save time |
| No caption per-slide timing | 🔴 | Captions have sentence/word timing but no way to align specific text to specific slides |
| Mobile compose is barely usable | 🟡 | Left panel hidden by default, drop zones are tiny, no touch-friendly drag |
| No "Start Fresh" / clear all button | 🔴 | Must delete items one by one. No "Clear Slideshow" button |
| Audio volume has no visual level indicator | 🔴 | Slider says 0.15 but user doesn't know if that's audible or silent |
| Overlay/watermark position not configurable | 🔴 | Description says overlay is positioned but there's no position control (corner, center, etc.) |

---

## 9. Media Library (`/library`)

### What You Can Do
- Browse all generated media (images, videos, voice, composed)
- Search by prompt text or tags
- Filter by type (All, Images, Videos, Voice, Composed)
- Sort by Newest or Highest Rated
- View score badges with hover reasoning
- View AI-generated tags
- Copy prompt to clipboard
- Regenerate (non-compose items)
- Re-edit (compose items → returns to Compose)
- Delete items (with browser confirm dialog)
- Save scoring insights as strategy artifact (in Highest Rated mode)
- Auto-refresh pending items every 10 seconds
- Manual Refresh button
- Skeleton loader during initial load

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| **No "Add to Collection" button on cards** | 🔴 | Must go to Collections page → open picker → find item. Should be one click from Library |
| **No bulk select / multi-select** | 🔴 | Can't select 5 images and delete/collect/export them all at once |
| **No image lightbox/detail view** | 🔴 | Clicking an image should open a large view with metadata, not just show it in the grid |
| **No download button** | 🔴 | Must right-click media to save. Explicit download button is expected |
| **No "Send to Compose" button** | 🔴 | Direct path from Library card to Compose editor |
| No pagination or infinite scroll | 🟡 | All items load at once — will slow down with 100+ items |
| No date range filter | 🟡 | Can't filter to "last week's generations" |
| No grid/list view toggle | 🔴 | Grid only — a list view would show more metadata at a glance |
| No "favorite" or "star" action | 🔴 | Can rate via score but can't manually favorite/bookmark items |
| No tag editing | 🔴 | Tags are AI-generated and read-only. User can't add/remove tags |
| No project-scoped filtering | 🟡 | Library shows ALL projects' media — no per-project filter |
| Delete uses browser `confirm()` | 🔴 | Should use in-app styled modal for consistency |
| No drag-to-compare | 🟡 | Can't place two images side-by-side to compare |
| No "similar to this" search | 🟡 | Can't find items visually similar to one you like |
| Score breakdown not visible without hover | 🔴 | 5 sub-scores (brand, purpose, quality, audience, uniqueness) hidden in tooltip |
| No export/share library items | 🟡 | Can't generate a shareable link or zip of selected items |
| Regenerate doesn't carry original config | 🔴 | Regenerate sends just the prompt — loses model, size, aspect ratio settings |

---

## 10. Collections (`/collections`)

### What You Can Do
- Create new collection (button)
- Select collection from sidebar list
- See item count per collection
- See sync status (server vs local mode)
- Add items from Library (picker modal with 3x3 grid)
- Remove items from collection (delete button per item)
- Drag-to-reorder items (Reorder.Group)
- Navigate to Presentation mode (`/present/:id`)
- Delete entire collection

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| **No collection rename** | 🔴 | Once created, collection name can't be changed |
| **No collection description/notes** | 🔴 | Can't add context about what the collection is for |
| **No drag from Library grid into collection** | 🟡 | Must use picker modal — direct drag would be more intuitive |
| **No "duplicate collection"** | 🔴 | Can't clone a collection to make a variant |
| No collection export (ZIP/PDF) | 🟡 | Can't download all items as a package |
| No collection sharing | 🔵 | Can't share a collection link with a collaborator |
| Picker modal shows no search/filter | 🔴 | Must scroll through all library items to find what you want |
| No bulk add (select multiple in picker) | 🔴 | Must click items one at a time in the picker |
| No collection cover image | 🟡 | Collections in sidebar are text-only — a thumbnail would aid recognition |
| Items show minimal info | 🔴 | Only 50px thumbnail + type + prompt. No score, tags, or status shown |
| No "move to another collection" | 🔴 | Must remove from one and add to another |
| No empty collection prompt suggests adding items | 🔴 | Empty state exists but could be more helpful (suggest items based on project) |
| No sorting within collection (only manual drag) | 🔴 | Can't sort by type, date, or score within a collection |

---

## 11. Presentation Mode (`/present/:collectionId`)

### What You Can Do
- Full-screen slideshow of collection items
- (Route mapped but implementation details limited)

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No presentation controls visible | 🔴 | Need next/previous/pause/play controls |
| No auto-advance with timing | 🔴 | Should support timed auto-play between slides |
| No transition effects | 🟡 | Slides should transition smoothly |
| No presenter notes | 🟡 | Can't add notes per slide for presenting |
| No embedded audio playback | 🟡 | If collection has voice/music items, they should play |
| No fullscreen toggle | 🔴 | Should use browser Fullscreen API |
| No keyboard navigation | 🔴 | Arrow keys, spacebar for next/previous should work |
| No "present from Compose" | 🟡 | Compose creates video but can't present a non-rendered slideshow live |

---

## 12. Boardroom (`/boardroom`)

### What You Can Do
- Set up a session (name, objective, constraints, participants)
- Start multi-agent discussion
- See conversation narrative with phases
- Manual or auto-advance between phases (opening → first pass → challenge → refinement → convergence)
- See emerging consensus and open questions
- Type instructions to guide the discussion
- Save session output as strategy artifact
- Export session
- End session

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No session history/list | 🔴 | Previous sessions are hard to find. Need a sessions list |
| No "resume session" | 🔴 | Once ended, can't continue where you left off |
| No participant customization | 🟡 | Can't modify agent personas or add custom agents |
| No inline artifact editing | 🔴 | Saved artifact goes to Briefs — can't edit it right in Boardroom |
| No "branch discussion" | 🟡 | Can't explore two directions simultaneously |
| No export as formatted doc | 🟡 | Export is raw — should offer formatted PDF/Doc |
| No media generation from outcomes | 🔴 | Session produces strategy but no "generate media from these ideas" button in context |
| No real-time token/cost indicator | 🟡 | Multi-agent sessions use a lot of tokens. No visibility into usage |
| No voting/rating on proposals | 🟡 | Agents propose ideas but user can't quickly rate them |
| No session templates | 🟡 | Common scenarios (product launch, rebrand, campaign) should be pre-built |

---

## 13. Research & Strategy Lab (`/research`)

### What You Can Do
- Choose mode: Live Market Search or Deep Strategic Thinking
- Enter research query
- Click "Analyze"
- View results with markdown formatting
- See source URLs (in search mode)
- Click "Save as Artifact"
- Click "Create media from this" → shows AI-suggested media items → add to plan

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No research history | 🔴 | Previous queries and results are lost on navigation |
| No follow-up questions | 🔴 | Can't ask "tell me more about X" based on results |
| No comparison mode | 🟡 | Can't compare two research results side by side |
| No export results | 🔴 | Can't copy or download the research output easily |
| No source reliability indicators | 🟡 | Sources shown but no credibility scoring |
| No "research into prompt" workflow | 🔴 | Should be able to highlight text in results and turn it into a generation prompt |
| No competitive analysis template | 🟡 | Common use case but no structured format for it |
| No image/visual research | 🔵 | Search is text-only — can't search for visual references or mood boards |

---

## 14. Strategy Briefs (`/briefs`)

### What You Can Do
- View all artifacts in a grid
- Filter by type (All, Boardroom, Research, Strategy, Style, Scoring, Custom)
- Search artifacts
- Create new artifact (Manual, or from Boardroom/Research)
- View artifact detail (modal with full content)
- Edit artifact (title, type, summary, content, tags, pin status)
- Pin/unpin artifacts (pinned ones inject into generation context)
- Send artifact to Media Plan
- Delete artifact

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No artifact versioning | 🟡 | Edits overwrite — can't see previous versions |
| No rich text editor | 🟡 | Content is plain text/markdown — a WYSIWYG editor would be friendlier |
| No artifact linking | 🔴 | Can't link related artifacts together (e.g., research → strategy → plan) |
| No "generate from artifact" directly | 🔴 | "Send to Plan" exists but should also have "Generate Image from This" |
| No artifact templates | 🟡 | Common formats (brand guidelines, content calendar, competitive analysis) |
| No drag-to-reorder artifacts | 🔴 | Grid has no ordering control |
| No bulk tag management | 🔴 | Can't tag multiple artifacts at once |
| No artifact preview on hover | 🔴 | Must click to see content — hover preview would speed browsing |
| Pin limit unclear | 🔴 | User doesn't know how many pins are optimal or if there's a limit |

---

## 15. Sales Agent (`/sales`)

### What You Can Do
- Twilio SMS integration (configuration UI exists)
- Backend may be incomplete

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| Feature completeness unclear | 🟡 | This page needs a full implementation audit |
| No connection status | 🔴 | Should show if Twilio is configured and connected |
| No conversation history | 🔴 | SMS conversations should be viewable |
| No template messages | 🔴 | Common responses should be templated |

---

## 16. Settings (`/settings`)

### What You Can Do
- **AI Models tab**: Configure 8 model slots, use custom model IDs, test model connectivity
- **Generation Defaults tab**: Set default aspect ratios, sizes, counts, voices, caption styles
- **Features tab**: Toggle auto-score, auto-tag, auto-save, confirm-before-generate, Ken Burns
- **API tab**: View API key (masked), check FFmpeg status, test server health
- **Usage tab**: See app version, export/import settings JSON, refresh from server
- Save all settings (server + localStorage fallback)

### What's Missing
| Gap | Priority | Detail |
|-----|----------|--------|
| No "reset to defaults" per section | 🔴 | If user misconfigures models, no easy way to restore defaults |
| No model health dashboard | 🟡 | Test is per-model click. Should show at-a-glance status of all models |
| No usage/quota tracking | 🟡 | No visibility into API usage, costs, or remaining quota |
| No notification preferences | 🟡 | Can't configure toast behavior, email alerts for completed jobs, etc. |
| No theme/appearance settings | 🟡 | Dark mode only — no light mode, font size, or density options |
| No keyboard shortcut customization | 🟡 | Can't set custom hotkeys |
| No data management (clear cache, purge old jobs) | 🔴 | No way to clean up localStorage or old server data |
| Settings don't explain impacts | 🔴 | Toggling "Auto-Score" — user doesn't know what scoring does or costs |
| Import settings has no preview | 🔴 | Imports and merges blindly — should show diff before applying |

---

## 17. Cross-Page & Global UX Issues

### Navigation & Wayfinding
| Gap | Priority | Detail |
|-----|----------|--------|
| **No breadcrumbs** | 🔴 | Deep pages have no way to see where you are in the app hierarchy |
| **No "back" navigation in workflows** | 🔴 | Going from Library → Compose loses context. No way to return to where you were |
| **14-item nav is overwhelming** | 🟡 | Sidebar has 14 items. Should group or collapse sections |
| No global search (Cmd+K) | 🟡 | Can't search across pages, media, artifacts, and settings from one place |
| No page-level loading indicator | 🔴 | Lazy-loaded pages show a spinner but no indication of what's loading |

### Cross-Page Workflows That Should Be Seamless
| Workflow | Current State | Should Be |
|----------|--------------|-----------|
| Generate image → Use in slideshow | Generate → Go to Library → Go to Compose → Open picker → Find image → Add | Generate → Click "Use in Compose" → Opens Compose with image added |
| Generate music → Try it over slideshow | Generate → Go to Library → Go to Compose → Open picker → Find music → Drop in music zone | Generate → Click "Preview in Compose" → Swaps into active composition |
| Research → Generate media | Research → Save artifact → Go to Plan → Create items manually | Research → Click highlighted text → "Generate image of this" → Done |
| Boardroom outcome → Media plan | Session → Save artifact → Go to Briefs → Send to Plan → Go to Plan → Add items | Session → "Create Plan from This" → Auto-generates plan items |
| Compare two compositions | Render #1 → Go to Library → Remember settings → Go back to Compose → Change music → Render #2 → Go to Library → Compare | Side-by-side compare mode in Library or Compose |
| Swap music on a slideshow | Go to Compose → Remove current music → Open picker → Find new music → Add → Re-render | Click "Swap" on music track → Picker opens inline → Select → Auto-re-render |

### Data & State Management
| Gap | Priority | Detail |
|-----|----------|--------|
| **No per-page generation history** | 🔴 | Social, Video, Voice, Music pages all lose history on navigation. Each should show recent generations |
| **No global job queue view** | 🔴 | If 5 things are rendering across pages, no single place to see all pending jobs |
| **No offline indicator** | 🔴 | When server is down, user discovers it only when something fails |
| localStorage not scoped to project | 🟡 | Some localStorage keys are global, some per-project — inconsistent |
| No data export for the whole project | 🟡 | Can't export "everything about this project" as a package |

### Interaction Polish
| Gap | Priority | Detail |
|-----|----------|--------|
| **No keyboard shortcuts anywhere** | 🔴 | No Cmd+S to save, no Cmd+Z to undo, no arrow keys in presentations |
| **Confirm dialogs use native `confirm()`** | 🔴 | Library delete uses browser dialog — should be styled modal |
| **No drag-and-drop between pages** | 🟡 | Can't drag from Library into Compose directly |
| No loading progress (just spinners) | 🔴 | Generation shows spinner but no "3 of 4 images done" |
| No empty state calls-to-action | 🔴 | Most empty states say "Nothing here" but don't suggest what to do |
| No toast action buttons | 🟡 | Toasts are informational only — "Generation complete" should have "View" button |
| No animation for state transitions | 🟡 | Items going from "draft" to "generating" should visually transition |

### Accessibility
| Gap | Priority | Detail |
|-----|----------|--------|
| No skip-to-content link | 🔴 | Screen reader users can't skip the sidebar |
| Limited ARIA labels | 🔴 | Custom buttons, dropdowns, and modals need proper ARIA labeling |
| Color-only status indicators | 🔴 | Status pills use color alone (green/amber/red). Need icon+text (which some have, but not all) |
| No focus trap in modals | 🔴 | Tab key can escape modals to background content |
| No high-contrast mode | 🟡 | Dark theme has low-contrast elements (zinc-500 on zinc-950) |
| Images lack meaningful alt text | 🔴 | Generated images use prompt as alt text (good) but some fallbacks are empty |
| No reduced-motion support | 🟡 | Animations can't be disabled for users with motion sensitivity |

---

## 18. Priority Summary — Top 20 Quick Wins

These could be implemented with relatively small changes and would have outsized UX impact:

| # | Fix | Page(s) | Why It Matters |
|---|-----|---------|----------------|
| 1 | Add download buttons to all media cards | Library, Social, Video, Voice, Music | Users can't easily save their own generated content |
| 2 | Add "Add to Collection" button on Library cards | Library | Most common action after generating — currently takes 5+ clicks |
| 3 | Show recent generations on each generation page | Social, Video, Voice, Music | Losing history on navigation destroys context |
| 4 | Add image lightbox/detail view in Library | Library | Images are tiny in grid — users need to see them large |
| 5 | Add undo/redo to Compose | Compose | Editor without undo is anxiety-inducing |
| 6 | Add "Send to Compose" button on media cards | Library, Social, Video | The generate-to-compose workflow is the core use case |
| 7 | Add bulk select/multi-select to Library | Library | Can't operate on multiple items at once |
| 8 | Add timeline preview to Compose | Compose | Users are rendering blind — can't see slideshow before committing |
| 9 | Add unsaved changes warning to Brand Setup | Setup | Users lose edits without knowing |
| 10 | Add prompt history/recent prompts | Social, Video, Voice, Music | Blank textarea every time wastes time |
| 11 | Replace native `confirm()` with styled modals | Library | Breaks the visual consistency of the app |
| 12 | Add global job queue indicator | Layout/Nav | No visibility into what's processing across the app |
| 13 | Add collection rename | Collections | Basic CRUD gap |
| 14 | Add audio preview before render in Compose | Compose | Can't hear voiceover or music before committing to a render |
| 15 | Add negative prompt to Social page | Social | Config supports it but UI doesn't expose it |
| 16 | Add "duplicate item" to Media Plan | Plan | Common operation when making variations |
| 17 | Add search/filter to Collection picker modal | Collections | Scrolling through all library items is painful |
| 18 | Add keyboard shortcuts (save, undo, navigate) | Global | Power users are bottlenecked by mouse-only interaction |
| 19 | Show active project name on Dashboard | Dashboard | Users forget which project is active |
| 20 | Add "Start Fresh" / clear all to Compose | Compose | Must delete items one by one to start over |

---

## 19. Medium-Term Enhancements

| # | Enhancement | Effort | Impact |
|---|-------------|--------|--------|
| 1 | Global Cmd+K search (pages, media, artifacts) | Medium | High — makes the whole app navigable |
| 2 | Library pagination / infinite scroll + virtualization | Medium | High — prevents performance degradation |
| 3 | Side-by-side comparison view in Library | Medium | High — critical for evaluating variations |
| 4 | Cross-page drag-and-drop | Medium | High — makes workflows feel connected |
| 5 | Compose template system (save & load configs) | Medium | High — reusable slideshow structures |
| 6 | Voice sample previews | Low | Medium — removes guessing from voice selection |
| 7 | Research follow-up questions | Medium | High — research is currently one-shot |
| 8 | Rich text editor for artifacts | Medium | Medium — better content editing |
| 9 | Mobile-optimized Compose (sheet modals, touch drag) | High | Medium — mobile users exist |
| 10 | Auto-duck music during voiceover | Medium | High — critical audio mixing feature |

---

## 20. Major Additions (Future)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Real-time collaboration (multi-user) | Very High | Transforms from solo tool to team platform |
| 2 | Calendar-based content scheduling | High | Turns plans into publishable schedules |
| 3 | Direct social media publishing | High | Closes the loop from creation to distribution |
| 4 | Visual moodboard / reference board | High | Creative workflows need visual inspiration |
| 5 | Video multi-track editor (cut, trim, join) | Very High | Replaces need for external video editors |
| 6 | AI style transfer / consistent character | High | Generated content currently lacks visual consistency |
| 7 | Analytics dashboard (what content performs) | High | Closes feedback loop from publish to optimize |
| 8 | Plugin/extension system | Very High | Let users add custom models, tools, workflows |
