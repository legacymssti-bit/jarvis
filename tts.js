/* =========================================================
   ジャービス：読み上げエンジン（VOICEVOX ＋ ブラウザ標準の予備）
   ---------------------------------------------------------
   TTS.splitBySpeaker(text, defaultName) … 「【名前】本文」を [{name,text}] に分ける
   TTS.speakAll([{name,text}, ...])      … 順番に読み上げる（次の声は先読み）
   TTS.stop()                            … 再生・待ち行列・先読みをすべて止める
   TTS.checkEngine(force)                … VOICEVOXにつながるか確かめる
   TTS.getSpeakers()                     … VOICEVOXの声の一覧
   ========================================================= */
(function(){
  const VC = window.VOICE_CONFIG || { engineUrl: "http://localhost:50021", members: {} };
  const LS_KEY = "jarvis_voiceSettings";

  /* ---------- 設定（voices.js の初期値 ＋ 端末に保存した変更） ---------- */
  function loadSaved(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }catch(e){ return {}; }
  }
  let saved = loadSaved();
  function settings(){
    const members = {};
    for(const n of Object.keys(VC.members)){
      members[n] = Object.assign({}, VC.members[n], (saved.members || {})[n] || {});
    }
    return {
      engineUrl: (saved.engineUrl || VC.engineUrl || "http://localhost:50021").replace(/\/+$/, ""),
      useVoicevox: saved.useVoicevox !== false,
      members
    };
  }
  function saveSettings(s){
    saved = { engineUrl: s.engineUrl, useVoicevox: s.useVoicevox, members: s.members };
    try{ localStorage.setItem(LS_KEY, JSON.stringify(saved)); }catch(e){}
    engineState = "unknown"; lastCheck = 0;
  }
  function resetSettings(){
    saved = {};
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    engineState = "unknown"; lastCheck = 0;
  }
  function voiceFor(name){
    const s = settings();
    return s.members[name] || s.members["ジャービス"] || { speaker: 3, speedScale: 1, pitchScale: 0 };
  }

  /* ---------- 「【名前】本文」の分割 ---------- */
  let knownNames = Object.keys(VC.members);
  function splitBySpeaker(text, defaultName){
    defaultName = defaultName || "ジャービス";
    const out = [];
    const re = /【\s*([^】]+?)\s*】/g;
    let current = defaultName, last = 0, m;
    const push = (name, t) => {
      t = String(t).replace(/^[\s:：、,]+/, "").trim();
      if(!t) return;
      const prev = out[out.length - 1];
      if(prev && prev.name === name) prev.text += "\n" + t; else out.push({ name, text: t });
    };
    while((m = re.exec(text))){
      const name = m[1].replace(/（.*?）|\(.*?\)/g, "").trim(); // 【トニー（マーケティング）】にも対応
      if(!knownNames.includes(name)) continue;                 // 知らない名前は本文の一部として扱う
      push(current, text.slice(last, m.index));
      current = name; last = re.lastIndex;
    }
    push(current, text.slice(last));
    return out;
  }

  /* ---------- 読み上げ用に文を区切る ---------- */
  function chunkText(text){
    const parts = String(text).replace(/\s*\n+\s*/g, "。").split(/(?<=[。！？!?])/);
    const out = []; let buf = "";
    for(const p of parts){
      const t = p.replace(/^[。\s]+/, "").trim();
      if(!t) continue;
      // 短すぎる文はまとめる（細かすぎると間が空くため）
      if((buf + t).length < 40) buf += t;
      else { if(buf) out.push(buf); buf = t; }
    }
    if(buf) out.push(buf);
    return out;
  }

  /* ---------- VOICEVOX 接続確認 ---------- */
  let engineState = "unknown";   // "ok" | "ng" | "unknown"
  let lastCheck = 0;
  let speakersCache = null;
  const listeners = [];
  function onStatus(fn){ listeners.push(fn); fn(status()); }
  function status(){
    const s = settings();
    if(!s.useVoicevox) return "off";
    return engineState;
  }
  function emit(){ const st = status(); listeners.forEach(fn => { try{ fn(st); }catch(e){} }); }

  function fetchTimeout(url, opts, ms){
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    if(opts && opts.signal){
      if(opts.signal.aborted) ac.abort();
      else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
    return fetch(url, Object.assign({}, opts, { signal: ac.signal })).finally(() => clearTimeout(t));
  }

  async function checkEngine(force){
    const s = settings();
    if(!s.useVoicevox){ emit(); return false; }
    // 未接続のときは30秒に1回だけ確かめ直す（スマホで毎回待たされないように）
    if(!force && engineState === "ng" && Date.now() - lastCheck < 30000) return false;
    if(!force && engineState === "ok" && Date.now() - lastCheck < 60000) return true;
    lastCheck = Date.now();
    try{
      const r = await fetchTimeout(s.engineUrl + "/version", {}, 1500);
      engineState = r.ok ? "ok" : "ng";
    }catch(e){
      engineState = "ng";
    }
    emit();
    return engineState === "ok";
  }

  async function getSpeakers(force){
    if(speakersCache && !force) return speakersCache;
    const s = settings();
    const r = await fetchTimeout(s.engineUrl + "/speakers", {}, 5000);
    if(!r.ok) throw new Error("speakers " + r.status);
    const list = await r.json();
    const flat = [];
    for(const sp of list){
      for(const st of (sp.styles || [])){
        if(st.type && st.type !== "talk") continue;   // 歌声用の声は除く
        flat.push({ id: st.id, speakerName: sp.name, styleName: st.name, label: `${sp.name}（${st.name}）` });
      }
    }
    speakersCache = flat;
    return flat;
  }

  /* ---------- VOICEVOX で音声を作る ---------- */
  async function synthesize(name, text, signal){
    const s = settings();
    const v = voiceFor(name);
    const sp = encodeURIComponent(v.speaker);
    const q = await fetchTimeout(
      `${s.engineUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${sp}`,
      { method: "POST", signal }, 15000);
    if(!q.ok) throw Object.assign(new Error("audio_query " + q.status), { status: q.status });
    const query = await q.json();
    if(typeof v.speedScale === "number") query.speedScale = v.speedScale;
    if(typeof v.pitchScale === "number") query.pitchScale = v.pitchScale;
    const w = await fetchTimeout(`${s.engineUrl}/synthesis?speaker=${sp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "audio/wav" },
      body: JSON.stringify(query),
      signal
    }, 30000);
    if(!w.ok) throw Object.assign(new Error("synthesis " + w.status), { status: w.status });
    return await w.blob();
  }

  /* ---------- 再生 ---------- */
  const audio = new Audio();
  let finishCurrent = null;
  function playBlob(blob){
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const done = () => {
        audio.onended = audio.onerror = null;
        finishCurrent = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      finishCurrent = done;
      audio.onended = done;
      audio.onerror = done;
      audio.src = url;
      const p = audio.play();
      if(p && p.catch) p.catch(done);
    });
  }

  /* ---------- ブラウザ標準の読み上げ（予備） ---------- */
  let browserVoices = [];
  const MALE = /otoya|ichiro|keita|daichi|kenji|hattori|naoki|male|男性/i;
  const FEMALE = /kyoko|haruka|nanami|ayumi|sayaka|mizuki|o-ren|female|女性|google 日本語/i;
  function loadVoices(){
    try{ browserVoices = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang)); }catch(e){ browserVoices = []; }
  }
  if("speechSynthesis" in window){ loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  let browserParams = () => ({ gender: "m", pitch: 1, rate: 1 });
  function browserSpeak(name, text, isCancelled){
    return new Promise(resolve => {
      if(!("speechSynthesis" in window)) return resolve();
      const p = browserParams(name);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      const re = p.gender === "f" ? FEMALE : MALE;
      const v = browserVoices.find(x => re.test(x.name)) || browserVoices[0];
      if(v) u.voice = v;
      u.pitch = p.pitch; u.rate = p.rate;
      u.onend = u.onerror = () => resolve();
      if(isCancelled()) return resolve();
      speechSynthesis.speak(u);
    });
  }

  /* ---------- 順番に読み上げる（先読みつき） ---------- */
  let generation = 0;
  let abortCtl = null;

  async function speakAll(items, hooks){
    stop();                                   // 前の読み上げが残っていたら止める
    const gen = ++generation;
    const ac = abortCtl = new AbortController();
    const cancelled = () => gen !== generation;
    hooks = hooks || {};

    const segs = [];
    for(const it of items) for(const t of chunkText(it.text)) segs.push({ name: it.name, text: t });
    if(!segs.length) return;

    let useVV = await checkEngine(false);
    if(cancelled()) return;

    if(useVV){
      const start = seg => { const p = synthesize(seg.name, seg.text, ac.signal); p.catch(() => {}); return p; };
      let next = start(segs[0]);
      for(let i = 0; i < segs.length; i++){
        if(cancelled()) return;
        const cur = next;
        next = null;
        let blob = null;
        try{
          blob = await cur;
        }catch(e){
          if(cancelled()) return;
          // 声のIDが違う(422など)ときはこの文だけ予備の声。つながらないときは以降すべて予備の声。
          if(!e.status){ engineState = "ng"; lastCheck = Date.now(); emit(); useVV = false; }
          console.warn("VOICEVOX:", e);
        }
        // 今の文を再生している間に、次の文（次の人）の音声を先に作っておく
        if(useVV && i + 1 < segs.length) next = start(segs[i + 1]);
        if(hooks.onSegment) hooks.onSegment(segs[i]);
        if(blob) await playBlob(blob);
        else await browserSpeak(segs[i].name, segs[i].text, cancelled);
        if(!useVV){
          // 残りはブラウザ標準で
          for(let j = i + 1; j < segs.length; j++){
            if(cancelled()) return;
            if(hooks.onSegment) hooks.onSegment(segs[j]);
            await browserSpeak(segs[j].name, segs[j].text, cancelled);
          }
          return;
        }
      }
    }else{
      for(const seg of segs){
        if(cancelled()) return;
        if(hooks.onSegment) hooks.onSegment(seg);
        await browserSpeak(seg.name, seg.text, cancelled);
      }
    }
  }

  function stop(){
    generation++;
    if(abortCtl){ try{ abortCtl.abort(); }catch(e){} abortCtl = null; }
    try{ audio.pause(); }catch(e){}
    if(finishCurrent) finishCurrent();
    try{ speechSynthesis.cancel(); }catch(e){}
  }

  // スマホ等で最初のタップ時に呼ぶと、あとで音を鳴らせるようになる
  function unlock(){
    try{ speechSynthesis.speak(new SpeechSynthesisUtterance("")); }catch(e){}
  }

  window.TTS = {
    splitBySpeaker, speakAll, stop, unlock, checkEngine, getSpeakers, onStatus, status,
    settings, saveSettings, resetSettings, voiceFor,
    setNames(names){ knownNames = names.slice(); },
    setBrowserParams(fn){ browserParams = fn; },
    _chunkText: chunkText
  };
})();
