/* AI assistant sheet — shared by the apps.
   A floating button opens a chat sheet where you can type a question or a command, and attach a photo/PDF.
   Claude's answers come back as text; anything that would change your data comes back as a proposal card
   that only takes effect when you tap Save.

   Each app calls AIBar.init({...}) with its own data, tools and apply() functions (see medical.html).
   The API key is stored only in this browser (localStorage) and requests go straight from the browser to
   api.anthropic.com. */
(function(){
  "use strict";

  var KEY_STORE = "ai-api-key";
  var MODEL_STORE = "ai-model";
  var API_URL = "https://api.anthropic.com/v1/messages";
  var API_VERSION = "2026-10-21";
  var MODELS = [
    ["claude-opus-5-5", "Opus 5.5 — most capable"],
    ["claude-sonnet-5-5", "Sonnet 5.5 — cheaper"],
    ["claude-haiku-5-5", "Haiku 5.5 — cheapest"]
  ];
  var CONFIRM_RE = /^(yes|yep|yeah|ok|okay|save|save it|save all|file|file it|file them|do it|confirm|looks good|add it|add them)[.! ]*$/i;
  var AUTO_FILE_RE = /\b(file|save)\s+(it|this|that|them)\b/i;
  var MAX_HISTORY = 8;

  var cfg = null;
  var els = {};
  var state = { view: "chat", busy: false, history: [], pending: [], attachments: [] };

  /* ---------- storage helpers ---------- */
  function getKey(){ try{ return localStorage.getItem(KEY_STORE) || ""; }catch(e){ return ""; } }
  function setKey(v){ try{ if(v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); }catch(e){} }
  function getModel(){
    try{ var m = localStorage.getItem(MODEL_STORE); if(m && MODELS.some(function(x){ return x[0] === m; })) return m; }catch(e){}
    return MODELS[0][0];
  }
  function setModel(v){ try{ localStorage.setItem(MODEL_STORE, v); }catch(e){} }

  function todayStr(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, cls, text){
    var el = document.createElement(tag);
    if(cls) el.className = cls;
    if(text != null) el.textContent = text;
    return el;
  }

  /* ---------- styles ---------- */
  var CSS =
    ".aib-fab{position:fixed;z-index:900;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:52px;height:52px;" +
      "border-radius:50%;background:#E3792F;color:#1D1D1B;border:1.6px solid #1D1D1B;display:none;align-items:center;justify-content:center;" +
      "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);padding:0}" +
    ".aib-fab.on{display:flex}.aib-fab:active{transform:scale(.96)}" +
    ".aib-fab svg{width:24px;height:24px}" +
    ".aib-back{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.35);display:none}" +
    ".aib-back.open{display:block}" +
    ".aib-sheet{position:fixed;z-index:960;left:0;right:0;bottom:0;max-width:640px;margin:0 auto;height:min(82vh,720px);display:none;flex-direction:column;" +
      "background:#FAFAF8;color:#141414;border:1.6px solid #141414;border-bottom:none;border-radius:16px 16px 0 0;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.18)}" +
    ".aib-sheet.open{display:flex}" +
    ".aib-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:3px solid #E3792F}" +
    ".aib-title{flex:1;font-size:15px;font-weight:800;letter-spacing:.04em}" +
    ".aib-title small{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a8a86}" +
    ".aib-ibtn{flex:0 0 auto;width:34px;height:34px;border:none;background:none;color:#141414;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0}" +
    ".aib-ibtn:active{background:#f0f0ec}.aib-ibtn svg{width:20px;height:20px}" +
    ".aib-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px;-webkit-overflow-scrolling:touch}" +
    ".aib-hint{font-size:13px;color:#8a8a86;line-height:1.45;margin-bottom:12px}" +
    ".aib-ex{display:block;width:100%;text-align:left;margin-bottom:8px;border:1.3px dashed #141414;border-radius:8px;background:none;" +
      "padding:10px 12px;font-size:13px;font-weight:600;color:#141414;cursor:pointer;font-family:inherit}" +
    ".aib-ex:active{background:#f0f0ec}" +
    ".aib-msg{margin-bottom:10px;display:flex;flex-direction:column}" +
    ".aib-msg.user{align-items:flex-end}" +
    ".aib-bub{max-width:88%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".aib-msg.user .aib-bub{background:#141414;color:#FAFAF8;border-bottom-right-radius:4px}" +
    ".aib-msg.bot .aib-bub{background:#f0f0ec;border-bottom-left-radius:4px}" +
    ".aib-msg.err .aib-bub{background:#fff;border:1.3px solid #141414;color:#141414;font-weight:600}" +
    ".aib-thumbs{display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;justify-content:flex-end}" +
    ".aib-thumbs img{width:54px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #e3e3df}" +
    ".aib-pdf{height:54px;min-width:54px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid #e3e3df;border-radius:6px;font-size:11px;font-weight:800;color:#8a8a86}" +
    ".aib-card{border:1.6px solid #141414;border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff}" +
    ".aib-card .t{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a8a86;margin-bottom:6px}" +
    ".aib-card .l{font-size:13px;line-height:1.4;padding:2px 0;overflow-wrap:anywhere}" +
    ".aib-card .l b{font-weight:800}" +
    ".aib-card .row{display:flex;gap:8px;margin-top:10px}" +
    ".aib-card .btn{flex:1;padding:9px;border-radius:7px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;font-family:inherit}" +
    ".aib-card .go{background:#E3792F;color:#1D1D1B;border:1.4px solid #1D1D1B}" +
    ".aib-card .no{background:none;color:#8a8a86;border:1.3px solid #e3e3df}" +
    ".aib-card .done{margin-top:8px;font-size:12px;font-weight:800;color:#141414}" +
    ".aib-card.dim{opacity:.55}" +
    ".aib-all{display:block;width:100%;margin-bottom:10px;padding:10px;border-radius:8px;background:#141414;color:#FAFAF8;border:none;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:inherit}" +
    ".aib-typing{font-size:13px;color:#8a8a86;font-style:italic;padding:2px 4px 8px}" +
    ".aib-inwrap{flex:0 0 auto;border-top:1px solid #e3e3df;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 8px);background:#FAFAF8}" +
    ".aib-att{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}" +
    ".aib-att .chip{position:relative}" +
    ".aib-att img{width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #e3e3df;display:block}" +
    ".aib-att .x{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#141414;color:#FAFAF8;border:none;font-size:11px;line-height:18px;padding:0;cursor:pointer}" +
    ".aib-inrow{display:flex;align-items:flex-end;gap:8px}" +
    ".aib-inrow textarea{flex:1;min-width:0;font-family:inherit;font-size:16px;line-height:1.35;border:1.3px solid #e3e3df;border-radius:10px;padding:9px 11px;background:#fff;color:#141414;resize:none;outline:none;max-height:120px}" +
    ".aib-inrow textarea:focus{border-color:#141414}" +
    ".aib-cam{position:relative;flex:0 0 auto;width:40px;height:40px;border:1.3px solid #141414;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#141414;background:none}" +
    ".aib-cam input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}" +
    ".aib-cam svg{width:20px;height:20px}" +
    ".aib-send{flex:0 0 auto;width:40px;height:40px;border:1.4px solid #1D1D1B;border-radius:10px;background:#E3792F;color:#1D1D1B;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}" +
    ".aib-send:disabled{opacity:.4}.aib-send svg{width:20px;height:20px}" +
    ".aib-set label{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a8a86;margin:14px 0 5px}" +
    ".aib-set input,.aib-set select{width:100%;font-family:inherit;font-size:16px;border:1.3px solid #e3e3df;border-radius:6px;padding:9px 10px;background:#fff;color:#141414;outline:none}" +
    ".aib-set input:focus,.aib-set select:focus{border-color:#141414}" +
    ".aib-set .p{font-size:12px;color:#8a8a86;line-height:1.5;margin-top:12px}" +
    ".aib-set .p a{color:#141414}" +
    ".aib-set .b{width:100%;margin-top:14px;padding:12px;border-radius:7px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;font-family:inherit}" +
    ".aib-set .b.pri{background:#E3792F;color:#1D1D1B;border:1.4px solid #1D1D1B}" +
    ".aib-set .b.sec{background:none;color:#8a8a86;border:1.3px solid #e3e3df}" +
    "@media print{.aib-fab,.aib-back,.aib-sheet{display:none!important}}";

  var ICON_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
  var ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  var ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /* ---------- build UI ---------- */
  function build(){
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    els.fab = h("button", "aib-fab");
    els.fab.type = "button";
    els.fab.setAttribute("aria-label", "Ask or tell the assistant");
    els.fab.innerHTML = ICON_SPARK;
    els.fab.addEventListener("click", openSheet);

    els.back = h("div", "aib-back");
    els.back.addEventListener("click", closeSheet);

    els.sheet = h("div", "aib-sheet");
    els.sheet.setAttribute("role", "dialog");
    els.sheet.setAttribute("aria-label", "Assistant");

    var head = h("div", "aib-head");
    els.title = h("div", "aib-title");
    var gear = h("button", "aib-ibtn"); gear.type = "button"; gear.innerHTML = ICON_GEAR; gear.setAttribute("aria-label", "Settings");
    gear.addEventListener("click", function(){ if(state.view === "settings") showView("chat"); else showView("settings"); });
    var close = h("button", "aib-ibtn"); close.type = "button"; close.innerHTML = ICON_X; close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeSheet);
    head.appendChild(els.title); head.appendChild(gear); head.appendChild(close);

    els.body = h("div", "aib-body");

    els.inwrap = h("div", "aib-inwrap");
    els.att = h("div", "aib-att");
    var row = h("div", "aib-inrow");
    var cam = h("label", "aib-cam"); cam.innerHTML = ICON_CAM; cam.setAttribute("aria-label", "Add photo or file");
    els.file = document.createElement("input");
    els.file.type = "file"; els.file.accept = "image/*,application/pdf"; els.file.multiple = true;
    els.file.addEventListener("change", onFiles);
    cam.appendChild(els.file);
    els.input = document.createElement("textarea");
    els.input.rows = 1;
    els.input.addEventListener("input", growInput);
    els.input.addEventListener("keydown", function(e){
      // Enter sends; Shift+Enter adds a line
      if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); submit(); }
    });
    els.send = h("button", "aib-send"); els.send.type = "button"; els.send.innerHTML = ICON_SEND; els.send.setAttribute("aria-label", "Send");
    els.send.addEventListener("click", submit);
    row.appendChild(cam); row.appendChild(els.input); row.appendChild(els.send);
    els.inwrap.appendChild(els.att); els.inwrap.appendChild(row);

    els.sheet.appendChild(head); els.sheet.appendChild(els.body); els.sheet.appendChild(els.inwrap);
    document.body.appendChild(els.fab);
    document.body.appendChild(els.back);
    document.body.appendChild(els.sheet);

    // keep the sheet above the on-screen keyboard (iOS Safari doesn't resize the layout viewport)
    if(window.visualViewport){
      var fit = function(){
        var vv = window.visualViewport;
        var covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        els.sheet.style.bottom = covered + "px";
        els.sheet.style.height = Math.min(vv.height * 0.92, Math.max(320, vv.height - 24), 720) + "px";
      };
      window.visualViewport.addEventListener("resize", fit);
      window.visualViewport.addEventListener("scroll", fit);
      fit();
    }
    document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeSheet(); });
  }

  function growInput(){
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";
  }

  /* ---------- views ---------- */
  function openSheet(){
    if(cfg.isReady && !cfg.isReady()){ return; }
    els.back.classList.add("open"); els.sheet.classList.add("open");
    showView(getKey() ? "chat" : "settings");
    if(state.view === "chat") setTimeout(function(){ els.input.focus(); }, 50);
  }
  function closeSheet(){
    els.back.classList.remove("open"); els.sheet.classList.remove("open");
    els.input.blur();
  }

  function showView(v){
    state.view = v;
    els.title.innerHTML = "";
    els.title.appendChild(document.createTextNode(v === "settings" ? "Assistant settings" : "Ask or tell"));
    els.title.appendChild(h("small", "", cfg.appName));
    els.inwrap.style.display = v === "chat" ? "" : "none";
    if(v === "settings") renderSettings(); else renderChat();
  }

  function renderSettings(){
    els.body.innerHTML = "";
    var wrap = h("div", "aib-set");
    wrap.appendChild(h("div", "aib-hint", "The assistant uses Claude through your own Anthropic API key. The key stays in this browser only; requests go straight from here to Anthropic."));

    var l1 = h("label", "", "Anthropic API key");
    var key = document.createElement("input");
    key.type = "password"; key.placeholder = getKey() ? "Key saved — paste to replace" : "sk-ant-…";
    key.autocomplete = "off"; key.setAttribute("autocapitalize", "off"); key.setAttribute("autocorrect", "off");
    var l2 = h("label", "", "Model");
    var sel = document.createElement("select");
    MODELS.forEach(function(m){ var o = document.createElement("option"); o.value = m[0]; o.textContent = m[1]; if(m[0] === getModel()) o.selected = true; sel.appendChild(o); });

    var save = h("button", "b pri", "Save"); save.type = "button";
    save.addEventListener("click", function(){
      var v = key.value.trim();
      if(v){
        if(v.indexOf("sk-ant-") !== 0){ toast("That doesn't look like an Anthropic key (starts with sk-ant-)"); return; }
        setKey(v);
      }
      setModel(sel.value);
      if(!getKey()){ toast("Paste your API key first"); return; }
      toast("Saved");
      showView("chat");
    });
    wrap.appendChild(l1); wrap.appendChild(key); wrap.appendChild(l2); wrap.appendChild(sel); wrap.appendChild(save);
    if(getKey()){
      var rm = h("button", "b sec", "Remove key from this device"); rm.type = "button";
      rm.addEventListener("click", function(){ setKey(""); toast("Key removed"); renderSettings(); });
      wrap.appendChild(rm);
    }
    if(state.history.length){
      var nc = h("button", "b sec", "Start a new conversation"); nc.type = "button";
      nc.addEventListener("click", function(){ state.history = []; state.pending = []; toast("Cleared"); showView("chat"); });
      wrap.appendChild(nc);
    }
    var p = h("div", "p");
    p.innerHTML = 'Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. ' +
      'Set a monthly spending limit there — anyone with access to this browser could use the key. ' +
      'Typing a question or attaching a photo sends that text, the photo and your app\'s data to Anthropic to answer it. ' +
      'Nothing is changed in your data until you tap Save on a proposal.';
    wrap.appendChild(p);
    els.body.appendChild(wrap);
  }

  function renderChat(){
    els.body.innerHTML = "";
    if(!state.log.length){
      els.body.appendChild(h("div", "aib-hint", cfg.intro || ""));
      (cfg.examples || []).forEach(function(t){
        var b = h("button", "aib-ex", t); b.type = "button";
        b.addEventListener("click", function(){ els.input.value = t; growInput(); els.input.focus(); });
        els.body.appendChild(b);
      });
    }
    els.input.placeholder = cfg.placeholder || "Ask or tell…";
    // re-render conversation
    (state.log || []).forEach(function(node){ els.body.appendChild(node); });
    scrollEnd();
  }

  function scrollEnd(){ els.body.scrollTop = els.body.scrollHeight; }

  /* ---------- conversation DOM (kept in state.log so reopening the sheet restores it) ---------- */
  state.log = [];
  function addNode(node){
    state.log.push(node);
    if(state.view === "chat"){
      // drop the intro/examples the first time something is added
      if(state.log.length === 1) els.body.innerHTML = "";
      els.body.appendChild(node);
      scrollEnd();
    }
  }
  function addMsg(kind, text, atts){
    var m = h("div", "aib-msg " + kind);
    if(atts && atts.length){
      var th = h("div", "aib-thumbs");
      atts.forEach(function(a){
        if(a.kind === "image"){ var im = document.createElement("img"); im.src = a.thumb; th.appendChild(im); }
        else th.appendChild(h("div", "aib-pdf", "PDF"));
      });
      m.appendChild(th);
    }
    if(text) m.appendChild(h("div", "aib-bub", text));
    addNode(m);
    return m;
  }

  /* ---------- attachments ---------- */
  function blobToB64(blob){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ res(String(r.result).split(",")[1]); };
      r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  function loadImage(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(url); res(img); };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("decode")); };
      img.src = url;
    });
  }
  async function prepImage(file){
    var img = await loadImage(file);
    var w = img.naturalWidth, hgt = img.naturalHeight, s = Math.min(1, 2000 / Math.max(w, hgt));
    var c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(hgt * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    var blob = await new Promise(function(r){ c.toBlob(r, "image/jpeg", 0.85); });
    var name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return { kind: "image", mediaType: "image/jpeg", b64: await blobToB64(blob),
      file: new File([blob], name, { type: "image/jpeg" }), thumb: URL.createObjectURL(blob) };
  }
  async function prepPdf(file){
    if(file.size > 20 * 1024 * 1024) throw new Error("big");
    return { kind: "pdf", mediaType: "application/pdf", b64: await blobToB64(file), file: file, thumb: "" };
  }
  async function onFiles(){
    var files = Array.prototype.slice.call(els.file.files || []);
    els.file.value = "";
    for(var i = 0; i < files.length; i++){
      if(state.attachments.length >= 5){ toast("Up to 5 files per message"); break; }
      var f = files[i];
      try{
        var a = f.type === "application/pdf" ? await prepPdf(f) : await prepImage(f);
        state.attachments.push(a);
      }catch(e){ toast("Couldn't read " + (f.name || "that file")); }
    }
    renderAtt();
  }
  function renderAtt(){
    els.att.innerHTML = "";
    state.attachments.forEach(function(a, i){
      var chip = h("div", "chip");
      if(a.kind === "image"){ var im = document.createElement("img"); im.src = a.thumb; chip.appendChild(im); }
      else chip.appendChild(h("div", "aib-pdf", "PDF"));
      var x = h("button", "x", "×"); x.type = "button";
      x.addEventListener("click", function(){ state.attachments.splice(i, 1); renderAtt(); });
      chip.appendChild(x);
      els.att.appendChild(chip);
    });
  }

  /* ---------- toast (uses the app's own if present) ---------- */
  var toastTimer = null;
  function toast(msg){
    var t = document.getElementById("aibToast");
    if(!t){
      t = h("div", "");
      t.id = "aibToast";
      t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#141414;color:#FAFAF8;padding:10px 16px;border-radius:20px;font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;z-index:1000;max-width:86vw;text-align:center;display:none";
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.style.display = "none"; }, 2600);
  }

  /* ---------- talking to Claude ---------- */
  async function callClaude(text, atts){
    var content = [];
    atts.forEach(function(a){
      content.push(a.kind === "image"
        ? { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.b64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.b64 } });
    });
    content.push({ type: "text", text: text || "Please read what I attached and propose what to file." });

    var messages = state.history.slice();
    messages.push({ role: "user", content: content });

    var body = {
      model: getModel(),
      max_tokens: 12000,
      system: cfg.systemPrompt(),
      messages: messages,
      output_config: { effort: "medium" }
    };
    if(cfg.tools && cfg.tools.length) body.tools = cfg.tools;

    var res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": getKey(),
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });
    var data = null;
    try{ data = await res.json(); }catch(e){}
    if(!res.ok){
      var err = new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function friendlyError(e){
    if(e && e.status === 401) return "Anthropic rejected the API key. Check it in settings (gear icon).";
    if(e && e.status === 403) return "That key isn't allowed to do this: " + e.message;
    if(e && e.status === 429) return "Too many requests right now — wait a moment and try again.";
    if(e && (e.status === 529 || e.status >= 500)) return "Claude is busy or having trouble — try again in a minute.";
    if(e && e.status === 400) return "Anthropic said: " + e.message;
    if(e && e.status) return "Something went wrong (" + e.status + "): " + e.message;
    return "Couldn't reach Anthropic. Check your connection, then try again.";
  }

  function isEmpty(v){ return v == null || v === ""; }

  /* ---------- proposals ---------- */
  function renderCard(p){
    var d = cfg.describe(p.name, p.input) || { title: p.name, lines: [] };
    var card = p.el || (p.el = h("div", "aib-card"));
    card.innerHTML = "";
    card.classList.toggle("dim", p.status === "discarded");
    card.appendChild(h("div", "t", d.title));
    (d.lines || []).forEach(function(l){
      var row = h("div", "l");
      row.appendChild(h("b", "", l[0] + ": "));
      row.appendChild(document.createTextNode(l[1]));
      card.appendChild(row);
    });
    if(p.status === "pending"){
      var r = h("div", "row");
      var go = h("button", "btn go", "Save"); go.type = "button";
      go.addEventListener("click", function(){ applyOne(p); });
      var no = h("button", "btn no", "Discard"); no.type = "button";
      no.addEventListener("click", function(){ p.status = "discarded"; renderCard(p); });
      r.appendChild(go); r.appendChild(no); card.appendChild(r);
    } else if(p.status === "saving"){
      card.appendChild(h("div", "done", "Saving…"));
    } else if(p.status === "saved"){
      card.appendChild(h("div", "done", "✓ " + (p.result || "Saved")));
    } else if(p.status === "error"){
      card.appendChild(h("div", "done", "Couldn't save: " + (p.result || "unknown error")));
      var rt = h("button", "btn go", "Try again"); rt.type = "button"; rt.style.marginTop = "8px";
      rt.addEventListener("click", function(){ applyOne(p); });
      card.appendChild(rt);
    } else if(p.status === "discarded"){
      card.appendChild(h("div", "done", "Discarded"));
    }
    return card;
  }

  async function applyOne(p){
    if(p.status === "saving" || p.status === "saved") return;
    p.status = "saving"; renderCard(p);
    try{
      p.result = await cfg.apply(p.name, p.input, { files: p.files || [] });
      p.status = "saved";
    }catch(e){
      p.status = "error"; p.result = (e && e.message) || "error";
    }
    renderCard(p);
  }
  async function applyAll(){
    var todo = state.pending.filter(function(p){ return p.status === "pending" || p.status === "error"; });
    for(var i = 0; i < todo.length; i++) await applyOne(todo[i]);
  }

  /* ---------- sending ---------- */
  async function submit(){
    if(state.busy) return;
    var text = els.input.value.trim();
    var atts = state.attachments.slice();
    if(!text && !atts.length) return;
    if(!getKey()){ showView("settings"); toast("Add your API key first"); return; }

    // "file it" / "save" with nothing new attached → save what's already proposed
    if(!atts.length && CONFIRM_RE.test(text) && state.pending.some(function(p){ return p.status === "pending"; })){
      els.input.value = ""; growInput();
      addMsg("user", text);
      await applyAll();
      return;
    }

    els.input.value = ""; growInput();
    state.attachments = []; renderAtt();
    addMsg("user", text, atts);
    var typing = h("div", "aib-typing", "Thinking…");
    addNode(typing);
    state.busy = true; els.send.disabled = true;
    var autoSave = atts.length > 0 && AUTO_FILE_RE.test(text);

    try{
      var data = await callClaude(text, atts);
      removeNode(typing);

      if(data.stop_reason === "refusal"){
        addMsg("err", "Claude declined to help with that request. Try rephrasing, or enter it by hand.");
        return;
      }
      var replyText = "", proposals = [];
      (data.content || []).forEach(function(b){
        if(b.type === "text") replyText += (replyText ? "\n" : "") + b.text;
        else if(b.type === "tool_use") proposals.push({ name: b.name, input: b.input || {} });
      });
      if(replyText) addMsg("bot", replyText);
      if(data.stop_reason === "max_tokens") addMsg("err", "The reply was cut off. Try asking for less at once.");

      var newPending = proposals.map(function(p){
        return { name: p.name, input: p.input, files: atts.map(function(a){ return a.file; }), status: "pending", result: "", el: null };
      });
      newPending.forEach(function(p){ state.pending.push(p); addNode(renderCard(p)); });
      if(newPending.length > 1){
        var all = h("button", "aib-all", "Save all " + newPending.length); all.type = "button";
        all.addEventListener("click", applyAll);
        addNode(all);
      }
      if(newPending.length){
        if(autoSave) await applyAll();
      }

      // remember this exchange (text only) so follow-ups make sense
      var userNote = (text || "(attachment)") + (atts.length ? " [attached " + atts.length + " file(s)]" : "");
      var botNote = (replyText || "") + proposals.map(function(p){ return "\n[Proposed " + p.name + ": " + JSON.stringify(p.input) + "]"; }).join("");
      state.history.push({ role: "user", content: userNote });
      state.history.push({ role: "assistant", content: botNote || "(no reply)" });
      if(state.history.length > MAX_HISTORY) state.history = state.history.slice(state.history.length - MAX_HISTORY);
      if(!replyText && !proposals.length) addMsg("bot", "I didn't have anything to say to that.");
    }catch(e){
      removeNode(typing);
      addMsg("err", friendlyError(e));
    }finally{
      state.busy = false; els.send.disabled = false;
    }
  }

  function removeNode(node){
    var i = state.log.indexOf(node);
    if(i >= 0) state.log.splice(i, 1);
    if(node.parentNode) node.parentNode.removeChild(node);
  }

  /* ---------- public API ---------- */
  window.AIBar = {
    init: function(config){
      cfg = config;
      if(!els.fab) build();
    },
    show: function(){ if(els.fab) els.fab.classList.add("on"); },
    hide: function(){ if(els.fab) els.fab.classList.remove("on"); closeSheet(); },
    todayStr: todayStr
  };
})();
