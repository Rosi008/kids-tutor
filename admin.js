// admin.js – v3: konzervativní ES5 syntaxe, žádné moderní cukry, důsledně uzavřené bloky

var $ = function(sel){ return document.querySelector(sel); };
var $$ = function(sel){ return Array.from(document.querySelectorAll(sel)); };

var LS_TOKEN = 'adminToken';
var LS_API_BASE = 'apiBase';

window.addEventListener('DOMContentLoaded', function(){
  try {
    var saved = localStorage.getItem(LS_TOKEN) || '';
    var base = localStorage.getItem(LS_API_BASE) || '';
    var tokenInput = $('#token-input');
    var apiBaseInput = $('#api-base');
    if(tokenInput){ tokenInput.value = saved; }
    if(apiBaseInput){ apiBaseInput.value = base; }

    var showToggle = $('#show-token');
    if(showToggle){ showToggle.addEventListener('change', function(e){ if(tokenInput){ tokenInput.type = e.target.checked ? 'text':'password'; } }); }

    var btnLogin = $('#btn-login');
    if(btnLogin){ btnLogin.addEventListener('click', onLogin); }
    var btnLogout = $('#btn-logout');
    if(btnLogout){ btnLogout.addEventListener('click', onLogout); }
    if(tokenInput){ tokenInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){ onLogin(); } }); }

    var tabBtns = $$('.tabs button');
    for(var i=0;i<tabBtns.length;i++){
      (function(btn){ btn.addEventListener('click', function(){ switchTab(btn.getAttribute('data-tab')); }); })(tabBtns[i]);
    }

    // Config actions
    var btnCfgLoad = $('#config-load'); if(btnCfgLoad){ btnCfgLoad.addEventListener('click', loadConfig); }
    var btnCfgSave = $('#config-save'); if(btnCfgSave){ btnCfgSave.addEventListener('click', saveConfig); }
    var btnJsonFmt = $('#json-format'); if(btnJsonFmt){ btnJsonFmt.addEventListener('click', function(){ formatJsonArea('#agent-json'); }); }
    var btnJsonVal = $('#json-validate'); if(btnJsonVal){ btnJsonVal.addEventListener('click', function(){ validateJsonArea('#agent-json', '#config-status'); }); }
    var btnJsonDl = $('#json-download'); if(btnJsonDl){ btnJsonDl.addEventListener('click', function(){ download('agent.json', getAgentJsonString()); }); }
    var inpJsonUp = $('#json-upload'); if(inpJsonUp){ inpJsonUp.addEventListener('change', function(e){ uploadTextFile(e.target, '#agent-json'); }); }
    var btnMdDl = $('#md-download'); if(btnMdDl){ btnMdDl.addEventListener('click', function(){ var v=$('#agent-md').value||''; download('agent.md', v); }); }
    var inpMdUp = $('#md-upload'); if(inpMdUp){ inpMdUp.addEventListener('change', function(e){ uploadTextFile(e.target, '#agent-md'); }); }

    // Lists actions
    var btnLsLoad = $('#lists-load'); if(btnLsLoad){ btnLsLoad.addEventListener('click', loadLists); }
    var btnLsSave = $('#lists-save'); if(btnLsSave){ btnLsSave.addEventListener('click', saveLists); }
    var btnLsDl = $('#lists-download'); if(btnLsDl){ btnLsDl.addEventListener('click', downloadLists); }
    var inpLsUp = $('#lists-upload'); if(inpLsUp){ inpLsUp.addEventListener('change', uploadLists); }
    var btnEnFmt = $('#en-format'); if(btnEnFmt){ btnEnFmt.addEventListener('click', function(){ formatJsonArea('#en-json'); }); }
    var btnEnVal = $('#en-validate'); if(btnEnVal){ btnEnVal.addEventListener('click', function(){ validateJsonArea('#en-json', '#lists-status'); }); }

    // Diag
    var pingBtns = $$('#tab-diag [data-ping]');
    for(var j=0;j<pingBtns.length;j++){
      (function(b){ b.addEventListener('click', function(){ ping(b.getAttribute('data-ping')); }); })(pingBtns[j]);
    }
    var btnClear = $('#btn-clear-cache'); if(btnClear){ btnClear.addEventListener('click', function(){ localStorage.clear(); location.reload(); }); }
    var btnCurl = $('#btn-copy-curl'); if(btnCurl){ btnCurl.addEventListener('click', copyCurl); }

    window.addEventListener('error', function(e){ show('#gate-status', 'Chyba skriptu: '+e.message, 'err'); });

    if(saved){ doLogin(saved, base); }
  } catch(e) {
    show('#gate-status', 'Inicializace selhala: '+e.message, 'err');
  }
});

function onLogin(){
  var token = (($('#token-input') && $('#token-input').value) ? $('#token-input').value : '').trim();
  var base = (($('#api-base') && $('#api-base').value) ? $('#api-base').value : '').trim();
  if(!token){ show('#gate-status', 'Zadej token.', 'warn'); return; }
  doLogin(token, base);
}

function doLogin(token, base){
  localStorage.setItem(LS_TOKEN, token);
  if(base){ localStorage.setItem(LS_API_BASE, base); } else { localStorage.removeItem(LS_API_BASE); }
  try { $('#env-badge').textContent = base ? (new URL(base)).hostname : 'local'; }
  catch(e){ $('#env-badge').textContent = base || 'local'; }
  testAuth().then(function(ok){
    if(ok){
      $('#gate').classList.add('hidden');
      $('#app').classList.remove('hidden');
      switchTab('config');
      loadConfig();
      loadLists();
    } else {
      show('#gate-status', 'Token odmítnut (401/403).', 'err');
    }
  }).catch(function(){ show('#gate-status', 'Nelze ověřit token (network).', 'err'); });
}

function onLogout(){ localStorage.removeItem(LS_TOKEN); show('#gate-status','Odhlášen.','ok'); location.reload(); }

function apiBase(){ var b = localStorage.getItem(LS_API_BASE) || ''; return b.replace(/\/$/, ''); }

function authFetch(path, opts){
  opts = opts || {};
  var token = localStorage.getItem(LS_TOKEN) || '';
  var url = (apiBase() || '') + path;
  var headers = Object.assign({ 'content-type':'application/json' }, (opts.headers||{}), { 'x-admin-token': token });
  return fetch(url, Object.assign({}, opts, { headers: headers }));
}

async function testAuth(){
  try {
    var r = await authFetch('/api/config');
    return r.status!==401 && r.status!==403;
  } catch(e){
    return false;
  }
}

function switchTab(id){
  var btns = $$('.tabs button');
  for(var i=0;i<btns.length;i++){ btns[i].classList.toggle('active', btns[i].getAttribute('data-tab')===id); }
  var tabs = $$('.tab');
  for(var j=0;j<tabs.length;j++){ tabs[j].classList.remove('active'); }
  var el = document.getElementById('tab-'+id); if(el){ el.classList.add('active'); }
}

function show(sel, msg, cls){ var el=$(sel); if(!el) return; el.textContent=msg||''; el.className='status'+(cls?' '+cls:''); }

function formatJsonArea(sel){
  try { var o = JSON.parse(($(sel).value||'{}')); $(sel).value = JSON.stringify(o, null, 2); }
  catch(e) { /* ignore */ }
}

function validateJsonArea(sel, statusSel){
  try { JSON.parse($(sel).value||'{}'); show(statusSel, 'JSON je v pořádku ✓', 'ok'); }
  catch(e){ show(statusSel, 'Chybný JSON: '+e.message, 'err'); }
}

function getAgentJsonString(){
  var s = ($('#agent-json') && $('#agent-json').value) ? $('#agent-json').value : '';
  s = (s||'').trim();
  return s || '{"model":"gpt-4o-mini","temperature":0.4}';
}

// CONFIG
async function loadConfig(){
  show('#config-status','Načítám…');
  try{
    var res = await authFetch('/api/config'); if(!res.ok) throw new Error('HTTP '+res.status);
    var data = await res.json();
    var parsed = parseConfigResponse(data);
    $('#agent-json').value = JSON.stringify(parsed.agentJson, null, 2);
    $('#agent-md').value = parsed.agentMd || '# Styl a pravidla agenta\n';
    show('#config-status','Načteno ✓','ok');
  }catch(e){ show('#config-status','Nepovedlo se načíst: '+e.message,'err'); }
}

function parseConfigResponse(data){
  var agentMd = '';
  var agentJson = {};
  if(data){
    if(data.agentMd || data.agentJson){ agentMd = data.agentMd||''; agentJson = data.agentJson||{}; }
    else if(data.md || data.json){ agentMd = data.md||''; agentJson = data.json||{}; }
    else if(data.files){
      var f = data.files;
      agentMd = f['config/agent.md'] || f['agent.md'] || '';
      try { agentJson = JSON.parse(f['config/agent.json'] || f['agent.json'] || '{}'); }
      catch(e){ agentJson = {}; }
    }
  }
  if(!agentJson.model){ agentJson.model='gpt-4o-mini'; }
  if(typeof agentJson.temperature!=='number'){ agentJson.temperature=0.4; }
  return { agentMd: agentMd, agentJson: agentJson };
}

async function saveConfig(){
  show('#config-status','Ukládám…');
  try{
    var json = JSON.parse(getAgentJsonString());
    var md = ($('#agent-md') && $('#agent-md').value) ? $('#agent-md').value : '';
    var res = await authFetch('/api/config', { method:'POST', body: JSON.stringify({ agentJson: json, agentMd: md }) });
    if(!res.ok) throw new Error('HTTP '+res.status);
    show('#config-status','Uloženo ✓','ok');
  }catch(e){ show('#config-status','Chyba ukládání: '+e.message,'err'); }
}

// LISTS
async function loadLists(){
  show('#lists-status','Načítám…');
  try{
    var res = await authFetch('/api/lists'); if(!res.ok) throw new Error('HTTP '+res.status);
    var data = await res.json();
    var vyj = Array.isArray(data.vyjmenovana) ? data.vyjmenovana : [];
    var en  = Array.isArray(data.english) ? data.english : [];
    $('#vyj-text').value = vyj.join('');
    $('#en-json').value  = JSON.stringify(en, null, 2);
    show('#lists-status','Načteno ✓','ok');
  }catch(e){ show('#lists-status','Nepovedlo se načíst: '+e.message,'err'); }
}

function parseVyjInput(){
  var rawEl = $('#vyj-text');
  var raw = rawEl ? (rawEl.value||'').trim() : '';
  if(!raw) return [];
  try { var arr = JSON.parse(raw); if(Array.isArray(arr)) return arr.map(String); }
  catch(e){}
  var lines = raw.split(/?/);
  var out = [];
  for(var i=0;i<lines.length;i++){ var s = (lines[i]||'').trim(); if(s){ out.push(s); } }
  return out;
}

function parseEnInput(){
  var rawEl = $('#en-json');
  var raw = rawEl ? (rawEl.value||'').trim() : '';
  if(!raw) return [];
  var arr = JSON.parse(raw);
  return arr;
}

async function saveLists(){
  show('#lists-status','Ukládám… (backend automaticky doplní cs a Chroma)');
  try{
    var vyj = parseVyjInput();
    var en  = parseEnInput();
    var res = await authFetch('/api/lists', { method:'POST', body: JSON.stringify({ vyjmenovana: vyj, english: en }) });
    var txt = await res.text();
    var data = {};
    try { data = JSON.parse(txt); } catch(e){}
    if(!res.ok) throw new Error('HTTP '+res.status+' '+txt);
    var vyjCount = (data && data.counts && typeof data.counts.vyjmenovana==='number') ? data.counts.vyjmenovana : vyj.length;
    var enCount  = (data && data.counts && typeof data.counts.english==='number') ? data.counts.english : en.length;
    var msg = 'Uloženo ✓ vyj: '+vyjCount+', en: '+enCount;
    if(data && data.enriched){ msg += ' (doplněny překlady)'; }
    if(data && typeof data.chromaUpserted==='number'){ msg += ', Chroma: '+data.chromaUpserted; }
    show('#lists-status', msg, 'ok');
  }catch(e){ show('#lists-status','Chyba ukládání: '+e.message,'err'); }
}

function downloadLists(){
  try{
    var vyj = parseVyjInput();
    var en  = parseEnInput();
    var obj = { vyjmenovana: vyj, english: en };
    download('lists.json', JSON.stringify(obj, null, 2));
  }catch(e){ show('#lists-status','Nelze stáhnout: '+e.message,'err'); }
}

function uploadLists(e){
  uploadTextFile(e.target, null, function(text){
    try {
      var data = JSON.parse(text);
      if(data && Array.isArray(data.vyjmenovana)){ $('#vyj-text').value = data.vyjmenovana.join('
'); }
      if(data && Array.isArray(data.english)){ $('#en-json').value = JSON.stringify(data.english, null, 2); }
    } catch(err){ show('#lists-status','Chybný JSON: '+err.message,'err'); }
  });
}

// DIAGNOSTICS
async function ping(path){
  show('#diag-output', '→ GET '+path+'
');
  try {
    var res = await authFetch(path);
    var text = await res.text();
    var el = $('#diag-output');
    if(el){ el.textContent += 'HTTP '+res.status+'
'+text+'

'; }
  } catch(e){
    var el2 = $('#diag-output'); if(el2){ el2.textContent += 'ERR '+e.message+'

'; }
  }
}

function copyCurl(){
  var token = localStorage.getItem(LS_TOKEN) || '';
  var base = apiBase() || '';
  var curl = 'curl -X POST "'+base+'/api/lists" \
-H "content-type: application/json" \
-H "x-admin-token: '+token+'" \
-d '{
  "vyjmenovana": ["být","bydlet","myslivec"],
  "english": [{"en":"cat"},{"en":"dog"}]
}'';
  navigator.clipboard.writeText(curl).then(function(){ show('#diag-output','cURL zkopírováno ✓','ok'); }).catch(function(e){});
}

// HELPERS
function download(filename, text){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  a.download = filename;
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}

function uploadTextFile(input, targetSel, onText){
  var file = input && input.files ? input.files[0] : null;
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    var txt = String(reader.result || '');
    if(typeof onText === 'function'){ onText(txt); }
    else if(targetSel){ var t=$(targetSel); if(t){ t.value = txt; } }
  };
  reader.readAsText(file);
}
