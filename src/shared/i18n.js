/**
 * Lightweight UI string table shared by every tool.
 *
 * The active language comes from the shared a11y state (the EN/FIL toggle in
 * the app bar). Tools call `t(key, params)` to read a string, and re-apply
 * their labels on `onLangChange`. Tool *titles* are Filipino brand names and
 * stay identical in both languages, so only descriptive copy is translated.
 *
 * `{name}` placeholders in a string are filled from the `params` object.
 */
import { getLang } from './a11y.js';

const strings = {
  en: {
    // ── shared ────────────────────────────────────────────────
    upload_btn: 'Upload',

    // ── Basahin Mo ────────────────────────────────────────────
    basahin_sub: 'Paste any text, then listen to it read sentence by sentence. Tap a sentence to jump there.',
    basahin_yourText: 'Your text',
    basahin_placeholder: 'Paste your text here…',
    basahin_loadBtn: 'Load text',
    basahin_speed: 'Speed',
    basahin_addText: 'Add some text first.',
    basahin_finished: 'Finished reading.',
    basahin_playError: 'Could not play audio for this language on your device.',
    basahin_ready: 'Your text is ready — press play to listen.',
    basahin_sentenceOf: 'Sentence {n} of {total}',

    // ── Samahan Mo Ako ────────────────────────────────────────
    samahan_sub: 'Read along word by word. Tap any word to hear it, or use back / next to move through the text. Turn on the mic to check your pronunciation.',
    samahan_yourText: 'Your text',
    samahan_placeholder: 'Paste the text to practice…',
    samahan_startBtn: 'Start reading',
    samahan_micLabel: 'Pronunciation check (mic)',
    samahan_micUnsupported: 'Pronunciation check — needs Chrome/Edge',

    // ── Ano ang Salita ────────────────────────────────────────
    salita_sub: 'Not sure how a word is spelled? Type your best guess — we’ll show the closest real words and what they mean.',
    salita_yourSpelling: 'Your spelling',
    salita_placeholder: 'Type a word (even if unsure)…',
    salita_findBtn: 'Find words',
    salita_typeWord: 'Type a word to look up.',
    salita_searching: 'Searching…',
    salita_noMatch: 'No close words found for “{q}”.',

    // ── Ipaliwanag Mo ─────────────────────────────────────────
    ipaliwanag_sub: 'Paste a textbook passage or article. Get a simpler version at the right grade level.',
    ipaliwanag_originalText: 'Original text',
    ipaliwanag_placeholder: 'Paste the text you want explained…',
    ipaliwanag_grade: 'Grade level',
    ipaliwanag_outputLang: 'Output language',
    ipaliwanag_runBtn: 'Explain it simply',
    ipaliwanag_working: 'Working…',
    ipaliwanag_outTitle: 'Simplified version',
    ipaliwanag_readAloud: '🔊 Read aloud',
    ipaliwanag_stop: '■ Stop',
    ipaliwanag_paste: 'Paste some text first.',
    ipaliwanag_demo: 'Demo output (no AI key set).',
    ipaliwanag_done: 'Done.',
  },

  fil: {
    // ── shared ────────────────────────────────────────────────
    upload_btn: 'Mag-upload',

    // ── Basahin Mo ────────────────────────────────────────────
    basahin_sub: 'I-paste ang anumang teksto, pagkatapos ay pakinggan ito na binabasa pangungusap-pangungusap. I-tap ang pangungusap upang lumukso doon.',
    basahin_yourText: 'Iyong teksto',
    basahin_placeholder: 'I-paste ang iyong teksto rito…',
    basahin_loadBtn: 'I-load ang teksto',
    basahin_speed: 'Bilis',
    basahin_addText: 'Maglagay muna ng teksto.',
    basahin_finished: 'Tapos na ang pagbasa.',
    basahin_playError: 'Hindi ma-play ang audio para sa wikang ito sa iyong device.',
    basahin_ready: 'Handa na ang iyong teksto — pindutin ang play upang makinig.',
    basahin_sentenceOf: 'Pangungusap {n} ng {total}',

    // ── Samahan Mo Ako ────────────────────────────────────────
    samahan_sub: 'Magbasa nang sabay salita-salita. I-tap ang anumang salita upang marinig ito, o gamitin ang likod / susunod upang umusad sa teksto. Buksan ang mic upang suriin ang iyong bigkas.',
    samahan_yourText: 'Iyong teksto',
    samahan_placeholder: 'I-paste ang tekstong sasanayin…',
    samahan_startBtn: 'Simulan ang pagbasa',
    samahan_micLabel: 'Pagsusuri ng bigkas (mic)',
    samahan_micUnsupported: 'Pagsusuri ng bigkas — kailangan ng Chrome/Edge',

    // ── Ano ang Salita ────────────────────────────────────────
    salita_sub: 'Hindi sigurado sa baybay ng salita? I-type ang iyong hula — ipapakita namin ang pinakamalapit na totoong salita at ang kahulugan ng mga ito.',
    salita_yourSpelling: 'Iyong baybay',
    salita_placeholder: 'Mag-type ng salita (kahit hindi sigurado)…',
    salita_findBtn: 'Maghanap ng salita',
    salita_typeWord: 'Mag-type ng salitang hahanapin.',
    salita_searching: 'Naghahanap…',
    salita_noMatch: 'Walang malapit na salita para sa “{q}”.',

    // ── Ipaliwanag Mo ─────────────────────────────────────────
    ipaliwanag_sub: 'I-paste ang isang talata mula sa aklat o artikulo. Makakuha ng mas simpleng bersyon sa tamang antas ng baitang.',
    ipaliwanag_originalText: 'Orihinal na teksto',
    ipaliwanag_placeholder: 'I-paste ang tekstong gusto mong ipaliwanag…',
    ipaliwanag_grade: 'Antas ng baitang',
    ipaliwanag_outputLang: 'Wika ng resulta',
    ipaliwanag_runBtn: 'Ipaliwanag nang simple',
    ipaliwanag_working: 'Ginagawa…',
    ipaliwanag_outTitle: 'Pinasimpleng bersyon',
    ipaliwanag_readAloud: '🔊 Basahin nang malakas',
    ipaliwanag_stop: '■ Itigil',
    ipaliwanag_paste: 'Maglagay muna ng teksto.',
    ipaliwanag_demo: 'Demo na resulta (walang naka-set na AI key).',
    ipaliwanag_done: 'Tapos na.',
  },
};

/**
 * Translate a key for the active language.
 * @param {string} key
 * @param {Record<string, string|number>} [params] values for `{name}` slots
 */
export function t(key, params) {
  const lang = getLang();
  let s = (strings[lang] && strings[lang][key]) ?? strings.en[key] ?? key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  }
  return s;
}
