# GabAI-Basa (Reading Guide)
### Filipino Reading Companion & Open-Source Speech Infrastructure

**Team:** Muralla  
**Members:**
- John Cris Antor
- Dwyane Heckle Geda
- Kevin John Adan
- Xyience Salangsang

We will build **GabAI-Basa**, an accessibility-first Filipino reading companion engineered for students across different linguistic regions in the Philippines. Our primary focus will be on accommodating reading difficulties such as dyslexia. 

We have chosen **Accenture Case 2** (AI-Powered Study Companion), but our comprehensive approach ensures that the project also covers **Case 1**.

The project will address two critical challenges simultaneously:
1. **Linguistic Underrepresentation (GitHub Education Track):** We will provide open-source datasets and text-to-speech models for underrepresented regional dialects (Cebuano, Ilocano, and Hiligaynon).
2. **Cognitive Accessibility (Accenture Track):** We will deliver a lightweight, browser-native AI study companion that will simplify, explain, read, and rate pronunciation in regional mother tongues.

---

## What We Will Build (Core Features)

### 1. Basahin Mo (TTS Reader) — `/basahin`
We will develop an optimized Text-to-Speech audio reader enabling students to paste or upload text and listen to it read in various regional dialects.
* **Key Capabilities:** We will implement sentence-level chunked playback, adjustable reading rate and pitch, support for five dialects, session caching to minimize API hits, and Opus OGG audio compression for low bandwidths.
* **Engine:** Google Cloud TTS API (Filipino native voice fallback with phonetic mapping).

### 2. Samahan Mo Ako (Co-Reader + Pronunciation Rater) — `/samahan`
We will create an interactive guided reader displaying text word-by-word with high-contrast highlighted pills.
* **Key Capabilities:** This feature will support touch swipe and keyboard-driven advancement, real-time on-device speech-to-text pronunciation scoring, visual feedback metrics (Correct/Close/Incorrect), OpenDyslexic font toggle, letter-spacing adjustments, and font-size controls.
* **Engine:** Web Speech API `SpeechRecognition` (local browser-native execution, zero bandwidth).

### 3. Ano ang Salita (Spelling & Dictionary) — `/salita`
We will integrate a clean dictionary lookup for word definitions, types, IPA phonetics, and example sentences.
* **Key Capabilities:** We will build offline caching using `localStorage` so repeat lookups of the same word will require zero network connectivity.
* **Engine:** Free Dictionary API (`dictionaryapi.dev`) and browser cache.

### 4. Ipaliwanag Mo (Dialect Summarizer) — `/ipaliwanag`
We will construct an AI simplification tool designed to translate and summarize textbook content or articles into student-friendly phrasing relative to grade levels (4-6, 7-9, 10-12) in selected regional dialects.
* **Key Capabilities:** Dialect-specific prompt engineering will ensure that summaries conform to cultural and regional vocabulary.
* **Engine:** Gemini 1.5 Flash via Google AI Studio.

---

## 🛠️ Technical Stack
We will utilize the following technologies:
* **Framework:** Next.js 14 (App Router)
* **Styling:** Tailwind CSS / Vanilla CSS
* **Hosting/CI:** Self-hosted (server ni jc)
* **Primary APIs:** Google Cloud TTS, Gemini 1.5 Flash, Web Speech API (browser-native)
* **Accessibility Fonts:** Atkinson Hyperlegible (default) & OpenDyslexic (toggleable)

---

## 📦 Open Source Deliverables
To support local speech infrastructure, our team will publish:
* **Curated PLD Datasets:** Pre-processed subsets of the Philippine Languages Database (PLD) for Cebuano, Ilocano, and Hiligaynon.
* **Fine-Tuned Checkpoints:** Customized VITS (Coqui TTS) checkpoints trained per dialect.
* **Training Pipelines:** Dockerized scripts that will enable researchers to train models on new regional languages.
* **HF Repository:** [huggingface.co/datasets/[team]/pld-ph-tts](https://huggingface.co/datasets/[team]/pld-ph-tts)
* **GitHub Repository:** [github.com/[team]/GabAI-Basa-corpus](https://github.com/[team]/GabAI-Basa-corpus)

---

## 🔋 Bandwidth & Offline Strategy
We will design this system specifically for the regional connectivity constraints of the Philippines:
* **Zero-Bandwidth Scoring:** The pronunciation scoring engine will run entirely locally on-device. No audio recordings will ever be uploaded.
* **Smart Caching:** Dictionary lookups and TTS audio chunks will be cached in `localStorage` and session states.
* **App Shell Architecture:** We will configure the project as a Progressive Web Application (PWA) cacheable by service workers for near-instant repeat loading.
