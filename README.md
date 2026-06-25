# GabAI-Basa (Reading Guide)
### Filipino Reading Companion

**Live MVP:** [muralla.didthat.lol](https://muralla.didthat.lol)

**Team:** Muralla  
**Members:**
- John Cris Antor
- Dwyane Heckle Geda
- Kevin John Adan
- Xyience Salangsang

We built **GabAI-Basa**, an accessibility-first Filipino reading companion engineered for students across different linguistic regions in the Philippines. Our primary focus is accommodating reading difficulties such as dyslexia. 

We chose **Accenture Case 2** (AI-Powered Study Companion).

The project addresses a critical challenge:
**Cognitive Accessibility:** We delivered a lightweight, browser-native AI study companion that simplifies, explains, reads, and rates pronunciation in English and Filipino.

## 🎯 Alignment with UN Sustainable Development Goal #4: Quality Education
GabAI-Basa is directly engineered to advance SDG #4, which aims to ensure inclusive and equitable quality education and promote lifelong learning opportunities for all. The project targets specific indicators under this goal by addressing foundational literacy gaps in the Philippine public education sector:
•	**Target 4.1 (Free, Equitable, and Quality Primary/Secondary Education):** In the Philippines, regional students frequently fall behind due to a lack of learning materials. By introducing bilingual text-to-speech and AI-driven content simplification in English and Filipino, we democratize access to quality study tools regardless of a student's geographic or socioeconomic background.
•	**Target 4.5 (Eliminate Gender and Literacy Disparities & Ensure Equal Access for the Vulnerable):** Traditional educational software widely overlooks neurodivergent learners. Our application places cognitive accessibility at the forefront—incorporating OpenDyslexic fonts, high-contrast visual pacing, and localized speech scoring to provide an equitable learning landscape for students dealing with dyslexia and reading difficulties.
•	**Target 4.a (Build and Upgrade Inclusive and Safe Schools):** We extend the concept of an inclusive "learning environment" into the digital realm. By building a Progressive Web App (PWA) with zero-bandwidth scoring and extreme data optimization, we ensure that the software is fully functional in remote, low-connectivity public schools across rural regions.

---

## Core Features

### 1. Basahin Mo (TTS Reader) — `/basahin`
An optimized Text-to-Speech audio reader enabling students to paste or upload text and listen to it read in English and Filipino.
* **Key Capabilities:** Sentence-level chunked playback, adjustable reading rate and pitch, support for English and Filipino, session caching to minimize API hits, and Opus OGG audio compression for low bandwidths.
* **Engine:** Google Cloud TTS API (Filipino native voice fallback with phonetic mapping).

### 2. Samahan Mo Ako (Co-Reader + Pronunciation Rater) — `/samahan`
An interactive guided reader displaying text word-by-word with high-contrast highlighted pills.
* **Key Capabilities:** Supports touch swipe and keyboard-driven advancement, real-time on-device speech-to-text pronunciation scoring, visual feedback metrics (Correct/Close/Incorrect), OpenDyslexic font toggle, letter-spacing adjustments, and font-size controls.
* **Engine:** Web Speech API `SpeechRecognition` (local browser-native execution, zero bandwidth).

### 3. Ano ang Salita (Spelling & Dictionary) — `/salita`
A clean dictionary lookup for word definitions, types, IPA phonetics, and example sentences.
* **Key Capabilities:** Offline caching using `localStorage` so repeat lookups of the same word require zero network connectivity.
* **Engine:** Free Dictionary API (`dictionaryapi.dev`) and browser cache.

### 4. Ipaliwanag Mo (Summarizer) — `/ipaliwanag`
An AI simplification tool designed to translate and summarize textbook content or articles into student-friendly phrasing relative to grade levels (4-6, 7-9, 10-12) in English and Filipino.
* **Key Capabilities:** Bilingual prompt engineering ensures that summaries conform to appropriate English and Filipino vocabulary.
* **Engine:** Gemini 2.5 Flash via Google AI Studio.

---

## 🛠️ Technical Stack
We utilize the following technologies:
* **Framework:** Vite (Vanilla JS + ES Modules)
* **Styling:** Tailwind CSS / Vanilla CSS
* **Hosting/CI:** Self-hosted (server ni jc)
* **Primary APIs:** Google Cloud TTS, Gemini 2.5 Flash, Web Speech API (browser-native)
* **Accessibility Fonts:** Atkinson Hyperlegible (default) & OpenDyslexic (toggleable)

---

## 📦 Source Code
* **GitHub Repository:** [github.com/jc-gt3rs/muralla](https://github.com/jc-gt3rs/muralla)

---

## 🔋 Bandwidth & Offline Strategy
We designed this system specifically for the regional connectivity constraints of the Philippines:
* **Zero-Bandwidth Scoring:** The pronunciation scoring engine runs entirely locally on-device. No audio recordings are ever uploaded.
* **Smart Caching:** Dictionary lookups and TTS audio chunks are cached in `localStorage` and session states.
* **App Shell Architecture:** Configured as a Progressive Web Application (PWA) cacheable by service workers for near-instant repeat loading.

---

## 🤖 AI Usage
To accelerate our development and ensure high-quality implementation during the hackathon, we utilized AI tools in a clean, structured workflow:
* **Claude:** Utilized for conceptual ideation, refining accessibility features, and structuring the initial project documentation and UI/UX design plans.
* **Antigravity AI:** Integrated as an agentic coding assistant to rapidly scaffold the application, implement styling, and manage project architecture. This allowed us to iterate quickly on components and seamlessly draft our documentation.
