(() => {
'use strict';

/* ------------------------------------------------------------------ helpers */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Math.random().toString(16).slice(2) + Date.now().toString(16));
const deviceId = LS.get('cc_device') || (() => { const v = uid(); LS.set('cc_device', v); return v; })();

const SPEECH = { en: 'en-US', am: 'am-ET', om: 'om-ET', ti: 'ti-ET', so: 'so-SO' };

/* ------------------------------------------------------------------ translations (missing keys fall back to English) */
const T = {
  en: {
    newChat: 'New chat', chat: 'Assistant', history: 'My cases', dashboard: 'Dashboard', language: 'Language', answers: 'Answers',
    written: 'Written', spoken: 'Spoken', farm: 'Farm details', crop: 'Crop', part: 'Plant part', stage: 'Growth stage',
    region: 'Region or town', location: 'Use my location', ph: 'Ask about your crop, or add a photo…', send: 'Send',
    camera: 'Take photo', upload: 'Upload photo', mic: 'Speak', listening: 'Listening… tap the mic to stop',
    analyzing: 'Analyzing your crop…', thinking: 'Thinking…', transcribing: 'Understanding your voice…',
    welcome: 'How can I help your crop today?', welcomeSub: 'Take a photo of the sick plant or ask a question by typing or speaking.',
    sug1: 'Why are my tomato leaves turning yellow?', sug2: 'How can I prevent tomato blight?', sug3: 'When should I irrigate my maize?',
    symptoms: 'Symptoms', causes: 'Likely causes', conditions: 'Conditions that help it spread', treatment: 'Treatment',
    immediate: 'Act now', organic: 'Farm practices and natural options', chemical: 'Registered products (check the label and your local agriculture office)',
    prevention: 'Prevention', weatherAdvice: 'Weather advice', compared: 'Compared with earlier cases', followUp: 'Follow-up',
    expert: 'See an expert if', alternatives: 'Other possibilities', refs: 'Sources', conf: 'Confidence', sev: 'Severity',
    download: 'Download report', read: 'Read aloud', stop: 'Stop', del: 'Delete',
    noHist: 'No saved cases yet. Diagnose a crop and it will appear here.', total: 'Total cases', recurring: 'Recurring problems',
    topProblems: 'Most common problems', topCrops: 'Crops checked', months: 'Cases per month', severities: 'Severity of cases',
    cancel: 'Cancel', capture: 'Capture', notPlant: 'This does not look like a crop photo. Try a clearer photo of the plant.',
    rain7: 'Rain 7 days', humidity: 'Humidity', fungal: 'Fungal risk', risk_low: 'low', risk_moderate: 'moderate', risk_high: 'high',
    noVoice: 'Spoken answers are not available for this language on your device. The written answer is shown.',
    noMic: 'Microphone is not available. Allow microphone access in your browser.',
    offline: 'No internet connection. CropCare AI needs to be online.', noSpeech: 'I could not hear a question. Please try again.',
    photoTip: 'Photo added. Tap send to diagnose.', deleted: 'Case deleted.', located: 'Location found.', locFail: 'Could not get your location.',
    st_healthy: 'Healthy', st_disease: 'Disease', st_pest: 'Pest', st_deficiency: 'Nutrient deficiency', st_stress: 'Stress', st_unclear: 'Unclear',
    sv_none: 'None', sv_low: 'Low', sv_moderate: 'Moderate', sv_high: 'High', sv_critical: 'Critical',
    p_leaf: 'Leaf', p_fruit: 'Fruit', p_stem: 'Stem', p_flower: 'Flower', p_root: 'Root', p_whole: 'Whole plant', p_grain: 'Grain or seed',
    s_seedling: 'Seedling', s_vegetative: 'Vegetative growth', s_flowering: 'Flowering', s_fruiting: 'Fruiting', s_harvest: 'Harvest',
    reportTitle: 'CropCare AI report', unknownCrop: 'Crop',
  },
  am: {
    newChat: 'አዲስ ውይይት', chat: 'ረዳት', history: 'የእኔ ጉዳዮች', dashboard: 'ማጠቃለያ', language: 'ቋንቋ', answers: 'መልሶች',
    written: 'በጽሑፍ', spoken: 'በድምፅ', farm: 'የእርሻ ዝርዝር', crop: 'ሰብል', part: 'የተክሉ ክፍል', stage: 'የዕድገት ደረጃ',
    region: 'አካባቢ ወይም ከተማ', location: 'ያለሁበትን ተጠቀም', ph: 'ስለ ሰብልዎ ይጠይቁ ወይም ፎቶ ያክሉ…', send: 'ላክ',
    camera: 'ፎቶ አንሳ', upload: 'ፎቶ ጫን', mic: 'ተናገር', listening: 'እየሰማሁ ነው… ለማቆም ማይኩን ይንኩ',
    analyzing: 'ሰብልዎን በመመርመር ላይ…', thinking: 'እያሰብኩ ነው…', transcribing: 'ድምፅዎን በመረዳት ላይ…',
    welcome: 'ዛሬ ሰብልዎን እንዴት ልርዳ?', welcomeSub: 'የታመመውን ተክል ፎቶ ያንሱ ወይም በመጻፍ ወይም በመናገር ይጠይቁ።',
    sug1: 'የቲማቲም ቅጠሎቼ ለምን ቢጫ ሆኑ?', sug2: 'የቲማቲም ብላይትን እንዴት መከላከል እችላለሁ?', sug3: 'በቆሎዬን መቼ ማጠጣት አለብኝ?',
    symptoms: 'ምልክቶች', causes: 'ሊሆኑ የሚችሉ ምክንያቶች', conditions: 'እንዲስፋፋ የሚያደርጉ ሁኔታዎች', treatment: 'ሕክምና',
    immediate: 'አሁኑኑ ያድርጉ', organic: 'የእርሻ አሠራሮች እና ተፈጥሯዊ አማራጮች', chemical: 'የተመዘገቡ ምርቶች (መለያውን እና የአካባቢዎን ግብርና ጽ/ቤት ያረጋግጡ)',
    prevention: 'መከላከል', weatherAdvice: 'የአየር ሁኔታ ምክር', compared: 'ከቀድሞ ጉዳዮች ጋር ሲነጻጸር', followUp: 'ክትትል',
    expert: 'ባለሙያ ያማክሩ ከሆነ', alternatives: 'ሌሎች አማራጮች', refs: 'ምንጮች', conf: 'እርግጠኝነት', sev: 'ክብደት',
    download: 'ሪፖርት አውርድ', read: 'በድምፅ አንብብ', stop: 'አቁም', del: 'ሰርዝ',
    noHist: 'እስካሁን የተቀመጠ ጉዳይ የለም። ሰብል ሲመረምሩ እዚህ ይታያል።', total: 'ጠቅላላ ጉዳዮች', recurring: 'ተደጋጋሚ ችግሮች',
    topProblems: 'በብዛት የተገኙ ችግሮች', topCrops: 'የተመረመሩ ሰብሎች', cancel: 'ሰርዝ', capture: 'አንሳ',
    st_healthy: 'ጤናማ', st_disease: 'በሽታ', st_pest: 'ተባይ', st_deficiency: 'የንጥረ ነገር እጥረት', st_stress: 'ጭንቀት', st_unclear: 'ግልጽ አይደለም',
    sv_none: 'የለም', sv_low: 'ዝቅተኛ', sv_moderate: 'መካከለኛ', sv_high: 'ከፍተኛ', sv_critical: 'አደገኛ',
    p_leaf: 'ቅጠል', p_fruit: 'ፍሬ', p_stem: 'ግንድ', p_flower: 'አበባ', p_root: 'ሥር', p_whole: 'ሙሉ ተክል', p_grain: 'እህል',
    s_seedling: 'ችግኝ', s_vegetative: 'ዕድገት', s_flowering: 'አበባ', s_fruiting: 'ፍሬ ማፍራት', s_harvest: 'መሰብሰብ',
    risk_low: 'ዝቅተኛ', risk_moderate: 'መካከለኛ', risk_high: 'ከፍተኛ', humidity: 'እርጥበት', rain7: 'ዝናብ 7 ቀን', fungal: 'የፈንገስ አደጋ',
    reportTitle: 'የCropCare AI ሪፖርት',
  },
  om: {
    newChat: 'Haasaa haaraa', chat: 'Gargaaraa', history: 'Dhimmoota koo', dashboard: 'Cuunfaa', language: 'Afaan', answers: 'Deebii',
    written: 'Barreeffamaan', spoken: 'Sagaleen', farm: 'Odeeffannoo qonnaa', crop: 'Midhaan', part: 'Kutaa biqilaa', stage: 'Sadarkaa guddinaa',
    region: 'Naannoo ykn magaalaa', location: 'Bakka koo fayyadami', ph: "Waa'ee midhaan keetii gaafadhu ykn suuraa dabali…", send: 'Ergi',
    camera: 'Suuraa kaasi', upload: "Suuraa fe'i", mic: 'Dubbadhu', listening: 'Dhaggeeffachaa jira… dhaabuuf maayikii tuqi',
    analyzing: "Midhaan kee sakatta'aa jira…", thinking: 'Yaadaa jira…', transcribing: 'Sagalee kee hubachaa jira…',
    welcome: "Har'a midhaan kee akkamitti gargaaruu danda'a?", welcomeSub: 'Suuraa biqila dhukkubsate kaasi ykn barreessuun yookaan dubbachuun gaafadhu.',
    sug1: "Baalli timaatimaa koo maaliif keelloo ta'e?", sug2: "Dhukkuba timaatimaa (blight) akkamitti ittisuu danda'a?", sug3: 'Boqqolloo koo yoom obaasuu qaba?',
    symptoms: 'Mallattoolee', causes: "Sababoota ta'uu danda'an", conditions: "Haala babal'achuu gargaaru", treatment: 'Yaalii',
    immediate: 'Amma godhi', organic: 'Hojii qonnaa fi filannoo uumamaa', chemical: "Oomisha galmaa'e (maqaa fi ogeessa naannoo mirkaneessi)",
    prevention: 'Ittisa', weatherAdvice: 'Gorsa haala qilleensaa', compared: 'Dhimmoota duraa wajjin', followUp: 'Hordoffii',
    expert: 'Ogeessa ilaalchisi yoo', alternatives: 'Filannoo biroo', refs: 'Burqaawwan', conf: 'Amanamummaa', sev: 'Cimina',
    download: 'Gabaasa buusi', read: 'Sagaleen dubbisi', stop: 'Dhaabi', del: 'Haqi',
    noHist: 'Ammaaf dhimmi kuufame hin jiru.', total: 'Dhimmoota waliigala', recurring: "Rakkoolee irra deddeebi'an",
    topProblems: "Rakkoolee baay'ee mul'atan", topCrops: "Midhaan sakatta'aman", cancel: 'Haqi', capture: 'Kaasi',
    st_healthy: 'Fayyaa', st_disease: 'Dhukkuba', st_pest: 'Raammoo', st_deficiency: 'Hanqina soogidda', st_stress: 'Cinqama', st_unclear: 'Hin ifne',
    sv_none: 'Hin jiru', sv_low: 'Gadi aanaa', sv_moderate: 'Giddu galeessa', sv_high: 'Ol aanaa', sv_critical: "Baay'ee ulfaataa",
    p_leaf: 'Baala', p_fruit: 'Muduraa', p_stem: 'Muka', p_flower: 'Abaaboo', p_root: 'Hundee', p_whole: 'Biqila guutuu', p_grain: 'Midhaan',
    s_seedling: 'Dhaabbii xiqqaa', s_vegetative: 'Guddina baalaa', s_flowering: 'Abaaboo', s_fruiting: 'Ija baasuu', s_harvest: 'Haamaa',
    risk_low: 'gadi aanaa', risk_moderate: 'giddu galeessa', risk_high: 'ol aanaa', humidity: 'Jiidhina', rain7: 'Roobaa guyyaa 7', fungal: 'Balaa fungasii',
    reportTitle: 'Gabaasa CropCare AI',
  },
  ti: {
    newChat: 'ሓድሽ ዕላል', chat: 'ሓጋዚ', history: 'ጉዳያተይ', dashboard: 'ጠቕላላ', language: 'ቋንቋ', answers: 'መልስታት',
    written: 'ብጽሑፍ', spoken: 'ብድምጺ', farm: 'ዝርዝር ሕርሻ', crop: 'ሰብል', part: 'ክፋል ተኽሊ', stage: 'ደረጃ ዕቤት',
    region: 'ከባቢ ወይ ከተማ', location: 'ዘለኽዎ ቦታ ተጠቐም', ph: 'ብዛዕባ ሰብልካ ሕተት ወይ ስእሊ ወስኽ…', send: 'ስደድ',
    camera: 'ስእሊ ኣልዕል', upload: 'ስእሊ ጽዓን', mic: 'ዘርብ', listening: 'ይሰምዕ ኣለኹ… ንምቑም ማይክ ጠውቕ',
    analyzing: 'ሰብልካ ይምርምር ኣለኹ…', thinking: 'ይሓስብ ኣለኹ…', transcribing: 'ድምጽኻ ይርድእ ኣለኹ…',
    welcome: 'ሎሚ ንሰብልካ ከመይ ክሕግዞ?', welcomeSub: 'ስእሊ ናይቲ ዝሓመመ ተኽሊ ኣልዕል ወይ ብምጽሓፍ ወይ ብምዝራብ ሕተት።',
    sug1: 'ቆጽሊ ቲማቲመይ ስለምንታይ ቢጫ ኮነ?', sug2: 'ሕማም ቲማቲም (ብላይት) ከመይ ክከላኸል?', sug3: 'ሰብለይ መዓስ ከስትዮ ኣለኒ?',
    symptoms: 'ምልክታት', causes: 'ክኾኑ ዝኽእሉ ጠንቅታት', conditions: 'ንምዝርጋሕ ዝሕግዙ ኩነታት', treatment: 'ሕክምና',
    immediate: 'ሕጂ ግበር', organic: 'ናይ ሕርሻ ኣገባብን ተፈጥሮኣዊ ኣማራጺታትን', chemical: 'ዝተመዝገቡ ፍሉጣት (ሌብል ከምኡ ባለሙያ ከባቢ ኣረጋግጽ)',
    prevention: 'ምክልኻል', weatherAdvice: 'ምኽሪ ኩነታት ኣየር', compared: 'ምስ ቀደምቲ ጉዳያት ክነጻጸር', followUp: 'ክትትል',
    expert: 'ባለሙያ ርአ ከሎ', alternatives: 'ካልኦት ዕድላት', refs: 'ምንጭታት', conf: 'እርግጸኛነት', sev: 'ክብደት',
    download: 'ጸብጻብ ኣውርድ', read: 'ብድምጺ ኣንብብ', stop: 'ኣቋርጽ', del: 'ደምስስ',
    noHist: 'ክሳብ ሕጂ ዝተቐመጠ ጉዳይ የለን።', total: 'ጠቕላላ ጉዳያት', recurring: 'ተደጋጋሚ ጸገማት',
    topProblems: 'ብብዝሒ ዝረኣዩ ጸገማት', topCrops: 'ዝተመርመሩ ሰብልታት', cancel: 'ሰርዝ', capture: 'ኣልዕል',
    st_healthy: 'ጥዑይ', st_disease: 'ሕማም', st_pest: 'ተባይ', st_deficiency: 'ጉድለት ንጥረ ነገር', st_stress: 'ጸቕጢ', st_unclear: 'ዘይንጹር',
    sv_none: 'የለን', sv_low: 'ትሑት', sv_moderate: 'ማእከላይ', sv_high: 'ልዑል', sv_critical: 'ኣዝዩ ከቢድ',
    p_leaf: 'ቆጽሊ', p_fruit: 'ፍረ', p_stem: 'ጉንዲ', p_flower: 'ዕምባባ', p_root: 'ሱር', p_whole: 'ምሉእ ተኽሊ', p_grain: 'ፍረ እኽሊ',
    s_seedling: 'ጥንስስ', s_vegetative: 'ዕቤት', s_flowering: 'ምዕምባባ', s_fruiting: 'ፍረ ምሃብ', s_harvest: 'ምእካብ ሰብል',
    risk_low: 'ትሑት', risk_moderate: 'ማእከላይ', risk_high: 'ልዑል', humidity: 'ረጠበ', rain7: 'ክረምቲ 7 መዓልቲ', fungal: 'ሓደጋ ፈንገስ',
    reportTitle: 'ጸብጻብ CropCare AI',
  },
  so: {
    newChat: 'Wada hadal cusub', chat: 'Caawiye', history: 'Kiisaskayga', dashboard: 'Guudmar', language: 'Luqad', answers: 'Jawaabaha',
    written: 'Qoraal', spoken: 'Cod', farm: 'Faahfaahinta beerta', crop: 'Dalagga', part: 'Qaybta dhirta', stage: 'Marxaladda koritaanka',
    region: 'Gobol ama magaalo', location: 'Isticmaal goobtayda', ph: 'Weydii dalaggaaga ama ku dar sawir…', send: 'Dir',
    camera: 'Qaad sawir', upload: 'Soo rar sawir', mic: 'Hadal', listening: 'Waan dhegeysanayaa… taabo makarafoonka si aad u joojiso',
    analyzing: 'Dalaggaaga waan baarayaa…', thinking: 'Waan ka fikirayaa…', transcribing: 'Codkaaga waan fahmayaa…',
    welcome: 'Maanta sideen dalaggaaga ku caawin karaa?', welcomeSub: 'Sawir ka qaad dhirta cudurka qabta ama weydii adigoo qoraya ama hadlaya.',
    sug1: 'Maxay u tahay caleemaha yaanyadayda inay huruud noqdaan?', sug2: 'Sideen uga hortagi karaa cudurka yaanyada (blight)?', sug3: 'Goorma ayaan waraabiyaa galleyda?',
    symptoms: 'Calaamadaha', causes: 'Sababaha suurtagalka ah', conditions: 'Xaaladaha ka caawiya faafitaanka', treatment: 'Daaweyn',
    immediate: 'Hadda samee', organic: 'Hab-beereed iyo xulashooyin dabiici ah', chemical: 'Alaabta diiwaangashan (hubi xarafka iyo xafiiska beeraha deegaanka)',
    prevention: 'Ka hortag', weatherAdvice: 'Talo cimilo', compared: 'Marka lala barbardhigo kiisaskii hore', followUp: 'La-socod',
    expert: 'La xiriir khabiir haddii', alternatives: 'Suurtogalnimo kale', refs: 'Ilaha', conf: 'Hubnaan', sev: 'Darnaanta',
    download: 'Soo dejiso warbixin', read: 'Ku akhri cod', stop: 'Jooji', del: 'Tirtir',
    noHist: 'Weli kiis la keydiyay ma jiro.', total: 'Wadarta kiisaska', recurring: 'Dhibaatooyin soo noq-noqda',
    topProblems: 'Dhibaatooyinka ugu badan', topCrops: 'Dalagyada la baaray', cancel: 'Jooji', capture: 'Qaad',
    st_healthy: 'Caafimaad qabta', st_disease: 'Cudur', st_pest: 'Cayayaan', st_deficiency: 'Nuxur la’aan', st_stress: 'Cadaadis', st_unclear: 'Aan cadayn',
    sv_none: 'Ma jiro', sv_low: 'Hoose', sv_moderate: 'Dhexe', sv_high: 'Sare', sv_critical: 'Aad u daran',
    p_leaf: 'Caleen', p_fruit: 'Midho', p_stem: 'Jirid', p_flower: 'Ubax', p_root: 'Xidid', p_whole: 'Dhirta oo dhan', p_grain: 'Hadhuudh',
    s_seedling: 'Miro-bixin yar', s_vegetative: 'Koritaan caleen', s_flowering: 'Ubaxaysan', s_fruiting: 'Midhayn', s_harvest: 'Goosasho',
    risk_low: 'hooseeya', risk_moderate: 'dhexe', risk_high: 'sare', humidity: 'Qoyaan', rain7: 'Roob 7 maalmood', fungal: 'Khatarta fangas',
    reportTitle: 'Warbixinta CropCare AI',
  },
};

/* ------------------------------------------------------------------ state */
const state = {
  lang: LS.get('cc_lang', 'en'),
  mode: LS.get('cc_mode', 'text'),
  files: [], turns: [], weather: null, busy: false, rec: null, view: 'chat', audio: null,
};
if (!T[state.lang]) state.lang = 'en';
const t = k => (T[state.lang] && T[state.lang][k]) || T.en[k] || k;

/* ------------------------------------------------------------------ elements */
const el = {
  thread: $('#thread'), welcome: $('#welcome'), input: $('#input'), send: $('#sendBtn'), attach: $('#attach'),
  mic: $('#micBtn'), status: $('#status'), toast: $('#toast'), chatView: $('#view-chat'),
  fCrop: $('#fCrop'), fPart: $('#fPart'), fStage: $('#fStage'), fRegion: $('#fRegion'), weatherBox: $('#weatherBox'),
};

/* ------------------------------------------------------------------ utilities */
let toastTimer;
function toast(msg, ms = 4200) {
  el.toast.textContent = msg; el.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

async function api(path, { method = 'GET', json, body } = {}) {
  const opt = { method, headers: { 'X-Device-Id': deviceId } };
  if (json) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(json); }
  else if (body) opt.body = body;
  let r;
  try { r = await fetch(path, opt); } catch { throw new Error(t('offline')); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function md(src) {
  const lines = esc(src).split('\n');
  let html = '', list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  const inl = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of lines) {
    const l = raw.trim(); let m;
    if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inl(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inl(m[1])}</li>`; }
    else if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h4>${inl(m[1])}</h4>`; }
    else if (!l) close();
    else { close(); html += `<p>${inl(l)}</p>`; }
  }
  close();
  return html;
}
const plain = s => String(s || '').replace(/[*#_`>]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();

const ICON = {
  leaf: '<svg viewBox="0 0 64 64"><path d="M32 52V30M32 30c0-10 7-16 17-16 0 10-7 16-17 16zM32 38c0-8-6-13-15-13 0 8 6 13 15 13z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  speak: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  leafPh: '<svg viewBox="0 0 64 64" width="34" height="34"><path d="M32 52V30M32 30c0-10 7-16 17-16 0 10-7 16-17 16zM32 38c0-8-6-13-15-13 0 8 6 13 15 13z" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ------------------------------------------------------------------ language & selects */
const PARTS = [['', '—'], ['leaf', 'p_leaf'], ['fruit', 'p_fruit'], ['stem', 'p_stem'], ['flower', 'p_flower'], ['root', 'p_root'], ['whole plant', 'p_whole'], ['grain or seed', 'p_grain']];
const STAGES = [['', '—'], ['seedling', 's_seedling'], ['vegetative growth', 's_vegetative'], ['flowering', 's_flowering'], ['fruiting', 's_fruiting'], ['harvest', 's_harvest']];

function fillSelect(sel, opts) {
  const keep = sel.value;
  sel.innerHTML = opts.map(([v, k]) => `<option value="${esc(v)}">${k.startsWith('p_') || k.startsWith('s_') ? esc(t(k)) : k}</option>`).join('');
  sel.value = keep;
}

function applyLang() {
  document.documentElement.lang = state.lang;
  $('#lang').value = state.lang;
  $$('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); n.setAttribute('aria-label', t(n.dataset.i18nTitle)); });
  fillSelect(el.fPart, PARTS); fillSelect(el.fStage, STAGES);
  renderWeather(); setTitle();
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
}

/* ------------------------------------------------------------------ farm details & weather */
function saveFarm() {
  LS.set('cc_farm', JSON.stringify({ crop: el.fCrop.value, part: el.fPart.value, stage: el.fStage.value, region: el.fRegion.value }));
}
function loadFarm() {
  try {
    const f = JSON.parse(LS.get('cc_farm', '{}')) || {};
    el.fCrop.value = f.crop || ''; el.fPart.value = f.part || ''; el.fStage.value = f.stage || ''; el.fRegion.value = f.region || '';
  } catch { /* ignore */ }
}
const context = () => ({ crop: el.fCrop.value.trim(), part: el.fPart.value, stage: el.fStage.value, region: el.fRegion.value.trim(), weather: state.weather });

function renderWeather() {
  const w = state.weather;
  if (!w) { el.weatherBox.innerHTML = ''; return; }
  const pill = (a, b) => `<span class="pill">${a ? esc(a) + ' ' : ''}<b>${esc(b)}</b></span>`;
  el.weatherBox.innerHTML = pill('', w.location) + pill('', `${w.temp ?? '–'}°C`) + pill(t('humidity'), `${w.humidity ?? '–'}%`) +
    pill(t('rain7'), `${w.rain_7d} mm`) + pill(t('fungal'), t('risk_' + w.fungal_risk));
}
async function loadWeather(query) {
  try { state.weather = await api('/api/weather?' + query); }
  catch (e) { state.weather = null; toast(e.message); }
  renderWeather();
}
el.fRegion.addEventListener('change', () => { saveFarm(); const v = el.fRegion.value.trim(); if (v) loadWeather('place=' + encodeURIComponent(v)); else { state.weather = null; renderWeather(); } });
[el.fCrop, el.fPart, el.fStage].forEach(n => n.addEventListener('change', saveFarm));
$('#locBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return toast(t('locFail'));
  navigator.geolocation.getCurrentPosition(async pos => {
    await loadWeather(`lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
    if (state.weather) { el.fRegion.value = state.weather.location; saveFarm(); toast(t('located')); }
  }, () => toast(t('locFail')), { timeout: 12000 });
});
$('#farmToggle').addEventListener('click', e => {
  const p = $('#farmPanel'); p.hidden = !p.hidden; e.currentTarget.setAttribute('aria-expanded', String(!p.hidden));
});

/* ------------------------------------------------------------------ photos (camera + upload) */
function toJpeg(file, max = 1280, q = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const ts = 220 / Math.max(c.width, c.height); const tc = document.createElement('canvas');
      tc.width = Math.round(c.width * ts); tc.height = Math.round(c.height * ts);
      tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
      c.toBlob(blob => blob ? resolve({ blob, url: URL.createObjectURL(blob), thumb: tc.toDataURL('image/jpeg', 0.6) }) : reject(new Error('image')), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
async function addFiles(list) {
  for (const f of [...list]) {
    if (state.files.length >= 3) break;
    if (!f.type.startsWith('image/')) continue;
    try { state.files.push(await toJpeg(f)); } catch { toast('Could not read this image.'); }
  }
  renderAttach();
  if (state.files.length) toast(t('photoTip'), 2500);
}
function renderAttach() {
  el.attach.innerHTML = state.files.map((f, i) => `<div class="thumb"><img src="${f.url}" alt=""><button data-i="${i}" aria-label="Remove">×</button></div>`).join('');
}
el.attach.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.files.splice(+b.dataset.i, 1); renderAttach();
});
$('#upBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('#camInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

let camStream = null;
async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return $('#camInput').click();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
    $('#camVideo').srcObject = camStream; $('#camModal').hidden = false;
  } catch { $('#camInput').click(); }
}
function closeCamera() {
  if (camStream) camStream.getTracks().forEach(tr => tr.stop());
  camStream = null; $('#camVideo').srcObject = null; $('#camModal').hidden = true;
}
$('#camBtn').addEventListener('click', openCamera);
$('#camCancel').addEventListener('click', closeCamera);
$('#camShot').addEventListener('click', () => {
  const v = $('#camVideo'); if (!v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => { closeCamera(); if (b) addFiles([new File([b], 'camera.jpg', { type: 'image/jpeg' })]); }, 'image/jpeg', 0.92);
});

/* ------------------------------------------------------------------ voice: record -> WAV -> transcribe */
function writeWav(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2); const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
async function toWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close();
  const rate = 16000; const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  return writeWav((await off.startRendering()).getChannelData(0), rate);
}
function setStatus(msg) { el.status.hidden = !msg; el.status.textContent = msg || ''; }

async function toggleMic() {
  if (state.rec) { state.rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast(t('noMic'));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast(t('noMic')); }
  stopSpeak();
  const mr = new MediaRecorder(stream); const chunks = [];
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = async () => {
    clearTimeout(mr._t); stream.getTracks().forEach(tr => tr.stop());
    state.rec = null; el.mic.classList.remove('rec'); setStatus(t('transcribing'));
    try {
      const wav = await toWav(new Blob(chunks, { type: mr.mimeType }));
      const fd = new FormData(); fd.append('audio', wav, 'voice.wav'); fd.append('language', state.lang);
      const { text } = await api('/api/transcribe', { method: 'POST', body: fd });
      setStatus('');
      if (!text) return toast(t('noSpeech'));
      el.input.value = text; autosize();
      if (!state.files.length) send(); // voice question with no photo: ask right away
    } catch (e) { setStatus(''); toast(e.message); }
  };
  mr.start(); state.rec = mr; el.mic.classList.add('rec'); setStatus(t('listening'));
  mr._t = setTimeout(() => { if (state.rec) state.rec.stop(); }, 60000);
}
el.mic.addEventListener('click', toggleMic);

/* ------------------------------------------------------------------ spoken answers */
function stopSpeak() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (state.audio) { state.audio.pause(); state.audio = null; }
  $$('.tool.speak').forEach(b => { b.innerHTML = ICON.speak + esc(t('read')); });
}
async function speak(text, btn) {
  const speaking = btn && btn.dataset.on === '1';
  stopSpeak(); $$('.tool.speak').forEach(b => { b.dataset.on = '0'; });
  if (speaking) return;
  text = plain(text).slice(0, 1200); if (!text) return;
  if (btn) { btn.dataset.on = '1'; btn.innerHTML = ICON.stop + esc(t('stop')); }
  const done = () => { if (btn) { btn.dataset.on = '0'; btn.innerHTML = ICON.speak + esc(t('read')); } };
  try {
    const voice = window.speechSynthesis && speechSynthesis.getVoices().find(v => v.lang.toLowerCase().replace('_', '-').startsWith(state.lang));
    if (voice) {
      const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; u.onend = done; u.onerror = done;
      speechSynthesis.speak(u); return;
    }
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId }, body: JSON.stringify({ text, language: state.lang }) });
    if (!r.ok) throw new Error('tts');
    const a = new Audio(URL.createObjectURL(await r.blob())); state.audio = a; a.onended = done; await a.play();
  } catch { done(); toast(t('noVoice')); }
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

/* ------------------------------------------------------------------ chat rendering */
function scrollDown() { el.chatView.scrollTo({ top: el.chatView.scrollHeight, behavior: 'smooth' }); }
function hideWelcome() { el.welcome.hidden = true; }
function userMsg(text, urls = []) {
  const d = document.createElement('div'); d.className = 'msg user';
  d.innerHTML = `<div class="bubble">${urls.length ? `<div class="imgs">${urls.map(u => `<img src="${u}" alt="">`).join('')}</div>` : ''}${esc(text)}</div>`;
  el.thread.appendChild(d); scrollDown();
}
function assistantShell(inner) {
  const d = document.createElement('div'); d.className = 'msg bot';
  d.innerHTML = `<div class="avatar">${ICON.leaf}</div><div class="reply">${inner}</div>`;
  el.thread.appendChild(d); scrollDown(); return d;
}
const loader = text => assistantShell(`<div class="dots"><i></i><i></i><i></i></div><div class="loading-text">${esc(text)}</div>`);

function sourcesHtml(sources) {
  return sources && sources.length ? `<div class="sources">${sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${esc(s.title)}</a>`).join('')}</div>` : '';
}
function answerMsg(text, sources) {
  const m = assistantShell(`<div class="body">${md(text)}</div>${sourcesHtml(sources)}<div class="tools"><button class="tool speak" data-on="0">${ICON.speak}${esc(t('read'))}</button></div>`);
  m.querySelector('.speak').addEventListener('click', e => speak(text, e.currentTarget));
  return m;
}

function summaryText(r) {
  return [r.problem_name, r.summary, ...(r.treatment.immediate || []).slice(0, 3)].filter(Boolean).join('. ');
}

function diagnosisCard(r, { photos = [] } = {}) {
  const C = 2 * Math.PI * 32; const off = C * (1 - r.confidence / 100);
  const ul = a => (a && a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const sec = (title, inner, cls = '') => (inner ? `<div class="sec ${cls}"><h4>${esc(title)}</h4>${inner}</div>` : '');
  const sub = (title, arr) => (arr && arr.length ? `<div class="sub"><h5>${esc(title)}</h5>${ul(arr)}</div>` : '');
  const tr = r.treatment || {};
  const treat = sub(t('immediate'), tr.immediate) + sub(t('organic'), tr.organic_cultural) + sub(t('chemical'), tr.chemical);
  const alts = r.alternatives && r.alternatives.length ? `<div class="alts">${r.alternatives.map(a => `<span>${esc(a.name)}<b>${a.confidence}%</b></span>`).join('')}</div>` : '';
  const refs = (r.references || []).map(x => `<li>${esc(x.title)}${x.source ? ` — ${esc(x.source)}` : ''}</li>`).join('');
  const refHtml = (refs ? `<ul>${refs}</ul>` : '') + sourcesHtml(r.sources);
  const title = r.status === 'healthy' && !r.problem_name ? t('st_healthy') : (r.problem_name || t('st_unclear'));
  const d = document.createElement('div'); d.className = 'dx';
  d.innerHTML = `
    <div class="dx-head">
      <div class="ring"><svg viewBox="0 0 76 76"><circle class="trk" cx="38" cy="38" r="32"/><circle class="val" cx="38" cy="38" r="32" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${off}"/></svg><span>${r.confidence}%</span><small>${esc(t('conf'))}</small></div>
      <div class="dx-title">
        <div class="crop">${esc([r.crop, r.plant_part].filter(Boolean).join(' · '))}</div>
        <h3>${esc(title)}</h3>
        ${r.scientific_name ? `<div class="sci">${esc(r.scientific_name)}</div>` : ''}
        <div class="badges"><span class="badge st-${r.status}">${esc(t('st_' + r.status))}</span><span class="badge sv-${r.severity}">${esc(t('sev'))}: ${esc(t('sv_' + r.severity))}</span></div>
      </div>
    </div>
    <div class="dx-body">
      ${photos.length ? `<div class="dx-photos">${photos.map(u => `<img src="${u}" alt="">`).join('')}</div>` : ''}
      <div class="dx-sum">${esc(r.summary)}</div>
      ${sec(t('symptoms'), ul(r.symptoms))}${sec(t('causes'), ul(r.causes))}${sec(t('conditions'), ul(r.favourable_conditions))}
      ${sec(t('treatment'), treat)}${sec(t('prevention'), ul(r.prevention))}
      ${sec(t('weatherAdvice'), r.weather_advice ? `<p>${esc(r.weather_advice)}</p>` : '')}
      ${sec(t('compared'), r.compared_with_history ? `<p>${esc(r.compared_with_history)}</p>` : '')}
      ${sec(t('followUp'), r.follow_up ? `<p>${esc(r.follow_up)}</p>` : '')}
      ${sec(t('expert'), ul(r.see_expert_if), 'danger')}${sec(t('alternatives'), alts)}${sec(t('refs'), refHtml)}
      <div class="dx-actions">
        <button class="tool speak" data-on="0">${ICON.speak}${esc(t('read'))}</button>
        <button class="tool dl">${ICON.down}${esc(t('download'))}</button>
      </div>
    </div>`;
  d.querySelector('.speak').addEventListener('click', e => speak(summaryText(r) + '. ' + (r.prevention || []).slice(0, 2).join('. '), e.currentTarget));
  d.querySelector('.dl').addEventListener('click', () => downloadReport(r, photos[0]));
  setTimeout(() => { const c = d.querySelector('.val'); if (c) c.style.strokeDashoffset = c.dataset.off; }, 80);
  return d;
}

function downloadReport(r, photo) {
  const li = a => (a && a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const s = (h, c) => (c ? `<h2>${esc(h)}</h2>${c}` : '');
  const tr = r.treatment || {};
  const html = `<!DOCTYPE html><html lang="${state.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t('reportTitle'))}</title>
<style>body{font-family:"Noto Sans Ethiopic",system-ui,Arial,sans-serif;max-width:760px;margin:30px auto;padding:0 18px;color:#14201a;line-height:1.6}h1{font-size:26px;margin:0}h2{font-size:17px;border-bottom:2px solid #56d58a;padding-bottom:4px;margin-top:26px}.meta{color:#5b6b62}.tag{display:inline-block;padding:2px 10px;border:1px solid #888;border-radius:99px;margin-right:6px;font-size:13px}img{max-width:220px;border-radius:10px;margin:12px 0}footer{margin-top:34px;color:#7a8a81;font-size:12.5px}</style></head><body>
<p class="meta">${esc(t('reportTitle'))} · ${new Date().toLocaleDateString()}</p><h1>${esc(r.problem_name || t('st_' + r.status))}</h1>
<p class="meta">${esc([r.crop, r.plant_part].filter(Boolean).join(' · '))}</p>
<p><span class="tag">${esc(t('st_' + r.status))}</span><span class="tag">${esc(t('sev'))}: ${esc(t('sv_' + r.severity))}</span><span class="tag">${esc(t('conf'))}: ${r.confidence}%</span></p>
${photo ? `<img src="${photo}" alt="">` : ''}<p>${esc(r.summary)}</p>
${s(t('symptoms'), li(r.symptoms))}${s(t('causes'), li(r.causes))}${s(t('conditions'), li(r.favourable_conditions))}
${s(t('immediate'), li(tr.immediate))}${s(t('organic'), li(tr.organic_cultural))}${s(t('chemical'), li(tr.chemical))}
${s(t('prevention'), li(r.prevention))}${s(t('weatherAdvice'), r.weather_advice ? `<p>${esc(r.weather_advice)}</p>` : '')}
${s(t('followUp'), r.follow_up ? `<p>${esc(r.follow_up)}</p>` : '')}${s(t('expert'), li(r.see_expert_if))}
${s(t('refs'), li((r.references || []).map(x => x.title + (x.source ? ' — ' + x.source : ''))) + ((r.sources || []).length ? `<ul>${r.sources.map(x => `<li><a href="${esc(x.url)}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''))}
<footer>CropCare AI gives guidance only. Confirm chemical treatments with your local agriculture office.</footer></body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `cropcare-report-${new Date().toISOString().slice(0, 10)}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ sending */
function autosize() { el.input.style.height = 'auto'; el.input.style.height = Math.min(el.input.scrollHeight, 160) + 'px'; }
el.input.addEventListener('input', autosize);
el.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
el.send.addEventListener('click', () => send());

async function send(forced) {
  const text = (forced ?? el.input.value).trim();
  const imgs = [...state.files];
  if ((!text && !imgs.length) || state.busy) return;
  state.busy = true; el.send.disabled = true; stopSpeak(); hideWelcome();
  userMsg(text, imgs.map(i => i.url));
  el.input.value = ''; autosize(); state.files = []; renderAttach();
  const wait = loader(imgs.length ? t('analyzing') : t('thinking'));
  try {
    if (imgs.length) {
      const c = context(); const fd = new FormData();
      fd.append('language', state.lang); fd.append('symptoms', text); fd.append('crop', c.crop); fd.append('part', c.part);
      fd.append('stage', c.stage); fd.append('region', c.region); fd.append('weather', JSON.stringify(state.weather || null));
      fd.append('thumb', imgs[0].thumb); imgs.forEach((im, i) => fd.append('images', im.blob, `photo${i}.jpg`));
      const { result } = await api('/api/diagnose', { method: 'POST', body: fd });
      wait.remove();
      if (!result.is_plant) { assistantShell(`<div class="error">${esc(t('notPlant'))}</div>`); }
      else {
        assistantShell('').querySelector('.reply').appendChild(diagnosisCard(result, { photos: imgs.map(i => i.url) }));
        state.turns.push({ role: 'user', text: text || '[crop photo]' }, { role: 'model', text: summaryText(result) });
        if (state.mode === 'voice') speak(summaryText(result));
      }
    } else {
      const { answer, sources } = await api('/api/ask', { method: 'POST', json: { question: text, language: state.lang, history: state.turns, context: context() } });
      wait.remove(); answerMsg(answer, sources);
      state.turns.push({ role: 'user', text }, { role: 'model', text: answer });
      if (state.mode === 'voice') speak(answer);
    }
    state.turns = state.turns.slice(-12);
  } catch (e) {
    wait.remove(); assistantShell(`<div class="error">${esc(e.message)}</div>`);
  } finally { state.busy = false; el.send.disabled = false; scrollDown(); }
}

/* ------------------------------------------------------------------ views */
function setTitle() {
  $('#viewTitle').textContent = state.view === 'chat' ? 'CropCare AI' : t(state.view);
}
function setView(v) {
  state.view = v;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $('#composer').classList.toggle('off', v !== 'chat');
  if (v !== 'chat') $('#farmPanel').hidden = true;
  setTitle(); closeSidebar();
  if (v === 'history') loadHistory();
  if (v === 'dashboard') loadDashboard();
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

function newChat() {
  stopSpeak(); state.turns = []; state.files = []; renderAttach();
  [...el.thread.children].forEach(c => { if (c !== el.welcome) c.remove(); });
  el.welcome.hidden = false; setView('chat'); el.input.focus();
}
$('#newChat').addEventListener('click', newChat);
$$('.suggest button').forEach(b => b.addEventListener('click', () => send(t(b.dataset.sug))));

async function loadHistory() {
  const box = $('#historyBox'); box.innerHTML = '';
  try {
    const { items } = await api('/api/history');
    if (!items.length) { box.innerHTML = `<div class="empty">${esc(t('noHist'))}</div>`; return; }
    const grid = document.createElement('div'); grid.className = 'grid';
    grid.innerHTML = items.map(i => `
      <div class="case" tabindex="0" role="button" data-id="${i.id}">
        <div class="ph" style="${i.thumb ? `background-image:url('${i.thumb}')` : ''}">${i.thumb ? '' : ICON.leafPh}</div>
        <button class="del" data-del="${i.id}" title="${esc(t('del'))}" aria-label="${esc(t('del'))}">${ICON.trash}</button>
        <div class="info"><b>${esc(i.problem || t('st_' + i.status))}</b><small>${esc([i.crop, (i.created_at || '').slice(0, 10)].filter(Boolean).join(' · '))}</small>
        <div class="badges"><span class="badge st-${i.status}">${esc(t('st_' + i.status))}</span><span class="badge sv-${i.severity}">${esc(t('sv_' + i.severity))}</span></div></div>
      </div>`).join('');
    box.appendChild(grid);
    grid.addEventListener('click', async e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        try { await api('/api/history/' + del.dataset.del, { method: 'DELETE' }); toast(t('deleted'), 2000); loadHistory(); } catch (er) { toast(er.message); }
        return;
      }
      const c = e.target.closest('.case'); if (c) openCase(c.dataset.id);
    });
    grid.addEventListener('keydown', e => { if (e.key === 'Enter') { const c = e.target.closest('.case'); if (c) openCase(c.dataset.id); } });
  } catch (e) { box.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}
async function openCase(id) {
  try {
    const d = await api('/api/history/' + id);
    const body = $('#detailBody'); body.innerHTML = '';
    body.appendChild(diagnosisCard(d.result, { photos: d.thumb ? [d.thumb] : [] }));
    $('#detailModal').hidden = false;
  } catch (e) { toast(e.message); }
}
$('#detailClose').addEventListener('click', () => { stopSpeak(); $('#detailModal').hidden = true; });
$('#detailModal').addEventListener('click', e => { if (e.target.id === 'detailModal') { stopSpeak(); $('#detailModal').hidden = true; } });

function bars(list, cls = '') {
  if (!list.length) return `<div class="empty" style="padding:16px">—</div>`;
  const max = Math.max(...list.map(x => x.count));
  return list.map(x => `<div class="bar ${cls}"><span title="${esc(x.name)}">${esc(x.name)}</span><div class="t"><i style="width:${Math.round(x.count / max * 100)}%"></i></div><span>${x.count}</span></div>`).join('');
}
async function loadDashboard() {
  const box = $('#dashBox'); box.innerHTML = '';
  try {
    const d = await api('/api/dashboard');
    if (!d.total) { box.innerHTML = `<div class="empty">${esc(t('noHist'))}</div>`; return; }
    const sev = ['none', 'low', 'moderate', 'high', 'critical'].filter(k => d.severities[k]).map(k => ({ name: t('sv_' + k), count: d.severities[k] }));
    box.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="n">${d.total}</div><div class="l">${esc(t('total'))}</div></div>
        <div class="stat"><div class="n">${d.recurring.length}</div><div class="l">${esc(t('recurring'))}</div></div>
        <div class="stat"><div class="n">${d.crops.length}</div><div class="l">${esc(t('topCrops'))}</div></div>
      </div>
      ${d.recurring.length ? `<div class="card"><h3>${esc(t('recurring'))}</h3>${bars(d.recurring, 'amber')}</div>` : ''}
      <div class="cols">
        <div class="card"><h3>${esc(t('topProblems'))}</h3>${bars(d.problems)}</div>
        <div class="card"><h3>${esc(t('topCrops'))}</h3>${bars(d.crops)}</div>
        <div class="card"><h3>${esc(t('months'))}</h3>${bars(d.months)}</div>
        <div class="card"><h3>${esc(t('severities'))}</h3>${bars(sev)}</div>
      </div>`;
  } catch (e) { box.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ sidebar, language, mode */
const sidebar = $('#sidebar'), scrim = $('#scrim');
function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); }
$('#menuBtn').addEventListener('click', () => { sidebar.classList.add('open'); scrim.classList.add('show'); });
scrim.addEventListener('click', closeSidebar);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); closeCamera(); $('#detailModal').hidden = true; } });

$('#lang').addEventListener('change', e => { state.lang = e.target.value; LS.set('cc_lang', state.lang); stopSpeak(); applyLang(); if (state.view !== 'chat') setView(state.view); });
$('#modeSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.mode = b.dataset.mode; LS.set('cc_mode', state.mode); applyLang();
});

/* ------------------------------------------------------------------ start */
loadFarm(); applyLang();
if (el.fRegion.value.trim()) loadWeather('place=' + encodeURIComponent(el.fRegion.value.trim()));
fetch('/api/health').then(r => r.json()).then(h => { if (!h.has_key) toast('GEMINI_API_KEY is missing. Add it to your .env file and restart.', 9000); }).catch(() => {});
})();
