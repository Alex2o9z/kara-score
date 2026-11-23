# Functional & Technical Specification: KaraScore (MVP v1)

## 1. Product Overview & Core Objective
**KaraScore** is a 100% client-side web application enabling users to sing along to any YouTube karaoke backing track with real-time vocal pitch detection, visual pitch tracking, and automated 2-tier scoring with zero recurring infrastructure costs, zero backend servers, and zero YouTube Data API keys.

---

## 2. YouTube Search & Entry Flows

### 2.1. Desktop Primary: Companion Chrome Extension (`extension/`, MV3)
- **Architecture:** Lightweight Manifest V3 content script injecting a `"🎤 Hát chấm điểm"` button directly onto `youtube.com` search results and watch pages.
- **Workflow:**
  1. User searches YouTube for any karaoke backing track (e.g., *"Rolling in the Deep karaoke"*).
  2. Clicking `"🎤 Hát chấm điểm"` on a video thumbnail or watch page pauses the current YouTube player tab.
  3. The extension opens KaraScore in a new tab with query parameters:
     ```
     https://karascore.pages.dev/?v=<VIDEO_ID>&title=<ENCODED_TITLE>
     ```
  4. KaraScore immediately initializes the YouTube IFrame player and readies the microphone.
- **Isolation Boundary:** Zero audio processing, Web Audio nodes, or scoring computations occur on the YouTube tab. The extension is purely an ergonomic launchpad.

### 2.2. Mobile & Fallback Entry Flow
- **URL / ID Parser:** Users can paste any YouTube URL (`youtube.com/watch?v=...`, `youtu.be/...`) or raw 11-character Video ID directly into the KaraScore search bar.
- **YouTube Search Shortcut:** A quick-action button opens YouTube search in a new window with a pre-filled query (`https://www.youtube.com/results?search_query=karaoke`), allowing mobile users to copy video links easily.

### 2.3. YouTube Embed Error Recovery
When the YouTube IFrame API emits error events via `onError`:
- **Code `100`:** Video removed, marked private, or not found.
- **Code `101` / `150`:** Video owner prohibits embedded playback.
- **Recovery UI:** Instantly halts audio processing and presents a user-friendly modal:
  *"This video cannot be played in embedded mode due to copyright or owner settings."*
  Includes actions: *"Search another video on YouTube"* or *"Paste different video URL"*.

---

## 3. 2-Tier Real-Time Scoring Engine

KaraScore automatically determines the scoring mode upon loading a video based on `youtubeVideoId`.

### 3.1. Common Audio Gatekeeper Conditions
Pitch evaluation ticks run at approximately **50ms intervals** (~20 Hz) or on `requestAnimationFrame`. Audio data is evaluated strictly when all four conditions hold:
1. **Playback Active:** YouTube Player state is strictly `PLAYING` (`YT.PlayerState.PLAYING === 1`).
2. **Volume / RMS Gate:** Audio RMS amplitude exceeds the silence threshold (`RMS >= 0.01`).
3. **Clarity Gate:** Pitchy clarity metric meets threshold (`clarity >= 0.85`).
4. **Vocal Frequency Range:** Detected pitch is within human vocal frequency limits: `80 Hz <= frequency <= 1100 Hz` (approx. `E2` to `C6`).

---

### 3.2. Tier 1 — Exact Melody Mode (Cache Hit)
- **Condition:** The `youtubeVideoId` matches a pre-authored song chart in `public/songs/`.
- **Timing & Calibration:**
  $$\text{effectiveTimeMs} = \text{interpolatedPlayerTimeMs} - \text{latencyOffsetMs} + \text{songOffsetMs}$$
- **Target Note Lookup:**
  $$\text{targetNote} = \text{notes.find}(n \implies n.\text{startMs} \le \text{effectiveTimeMs} \le n.\text{endMs})$$
- **Cents Deviation:**
  $$\text{detectedMidi} = 69 + 12 \times \log_2\left(\frac{\text{detectedFrequency}}{440}\right)$$
  $$\Delta \text{cents} = |\text{detectedMidi} - \text{targetMidi}| \times 100$$
- **Per-Tick Accuracy Allocation:**
  - $\Delta \text{cents} \le 25 \text{ cents}$: **100%** (1.0) — Perfect
  - $25 \text{ cents} < \Delta \text{cents} \le 50 \text{ cents}$: **50%** (0.5) — Good
  - $\Delta \text{cents} > 50 \text{ cents}$ or silence during note: **0%** (0.0) — Miss

---

### 3.3. Tier 2 — Smart Vocal Score (Zero-Wait Fallback for 100% of YouTube Videos)
- **Condition:** No pre-authored song JSON chart exists for the loaded `youtubeVideoId`.
- **Mechanism:** Computes a real-time vocal performance score (0–100) based on 4 anti-cheat vocal quality metrics accumulated strictly during `PLAYING`:

| Metric | Weight | Anti-Cheat Purpose | Evaluation Logic |
| :--- | :---: | :--- | :--- |
| **1. In-Tune Accuracy** | **40%** | Rewards hitting musical scale notes. | Cents deviation from nearest 12-TET semitone: $\le 25\text{ cents} \to 1.0$, $\le 50\text{ cents} \to 0.5$, else $0.0$. |
| **2. Stability & Clarity** | **25%** | Penalizes wavering, shrieking, or crackling. | Rolling Pitchy clarity score + pitch variance over sustained notes ($\ge 200\text{ms}$). |
| **3. Active Vocal Coverage** | **20%** | Prevents silence / humming cheat. | $\frac{\text{Valid Vocal Ticks}}{\text{Total Playback Duration Ticks}}$. Rewards singing along throughout the song. |
| **4. Melodic Variety** | **15%** | Prevents single-note drone cheating. | Count of distinct MIDI semitones sung. $\ge 8\text{ unique semitones} \to 100\%$, scaled linearly below. |

$$\text{Smart Vocal Score} = (0.40 \times \text{InTune}) + (0.25 \times \text{Stability}) + (0.20 \times \text{Coverage}) + (0.15 \times \text{Variety})$$

---

### 3.4. Final Results & Rating Tiers (On `ENDED`)
When video playback finishes, a comprehensive results modal displays:
- Final Score (0–100).
- Performance Tier:
  - **S Tier:** $\ge 90$ (Outstanding Mastery)
  - **A Tier:** $80 - 89.9$ (Great Vocal Performance)
  - **B Tier:** $65 - 79.9$ (Solid Effort)
  - **C Tier:** $< 65$ (Needs More Practice)
- Detailed 4-metric vocal breakdown (In-Tune, Stability, Vocal Coverage, Note Variety), plus Melody Accuracy % when in Tier 1.

---

## 4. Song JSON Schema (`public/songs/<songId>.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KaraScore Song Chart Definition",
  "type": "object",
  "required": ["songId", "title", "artist", "youtubeVideoId", "offsetMs", "notes"],
  "properties": {
    "songId": { "type": "string", "pattern": "^[a-z0-9_-]+$" },
    "title": { "type": "string" },
    "artist": { "type": "string" },
    "youtubeVideoId": { "type": "string", "minLength": 11, "maxLength": 11 },
    "offsetMs": {
      "type": "number",
      "description": "Global audio-to-lyrics offset in milliseconds"
    },
    "notes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["startMs", "endMs", "midiNote"],
        "properties": {
          "startMs": { "type": "number", "minimum": 0 },
          "endMs": { "type": "number", "minimum": 0 },
          "midiNote": { "type": "integer", "minimum": 21, "maximum": 108 }
        }
      }
    }
  }
}
```

---

## 5. Latency Calibration
- **Latency Offset Range:** Adjustable via manual slider from **`-300ms` to `+300ms`** (default `0ms`, step `10ms`).
- **Persistence:** Stored in browser `localStorage` (`karascore_latency_offset_ms`) to preserve user hardware calibration across songs.

---

## 6. Explicit v2 Roadmap (Out of Scope for MVP v1)
The following capabilities are reserved for KaraScore v2 and strictly deferred:
1. **Shared Supabase Free Community Cache:** Crowdsourced JSON charts indexed by `youtubeVideoId`.
2. **Ghost Track Scoring:** Capturing anonymized high-scoring vocal pitch contours as reusable reference charts without storing or transmitting raw audio.
3. **Automated AI Stem Separation:** Offline conversion of audio tracks into UltraStar `.txt` / KaraScore JSON using Demucs and Basic Pitch pipelines.
