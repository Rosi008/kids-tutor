// admin.js – zjednodušené: Konfigurace + Seznamy + Diagnostika
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_TOKEN = 'adminToken';
const LS_API_BASE = 'apiBase';

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(LS_TOKEN) || '';
  const base = localStorage.getItem(LS_API_BASE) || '';
  $('#token-input').value = saved;
  $('#api-base').value = base;
  $('#show-token').addEventListener('change', (e)=> $('#token-input').type = e.target.checked ? 'text':'password');
  $('#btn-login').addEventListener('click', onLogin);
  $('#btn-logout').addEventListener('click', onLogout);
  // Enter v token inputu spustí přihlášení
  $('#token-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ onLogin(); } });

  $$('.tabs button').forEach(btn => btn.addEventListener('click', ()=> switchTab(btn.dataset.tab)));

  // config actions
  $('#config-load').addEventListener('click', loadConfig);
  $('#config-save').addEventListener('click', saveConfig);
  $('#json-format').addEventListener('click', () => formatJsonArea('#agent-json'));
  $('#json-validate').addEventListener('click', () => validateJsonArea('#agent-json', '#config-status'));
  $('#json-download').addEventListener('click', () => download('agent.json', getAgentJsonString()));
  $('#json-upload').addEventListener('change', (e)=> uploadTextFile(e.target, '#agent-json'));
  $('#md-download').addEventListener('click', () => download('agent.md', $('#agent-md').value||''));
  $('#md-upload').addEventListener('change', (e)=> uploadTextFile(e.target, '#agent-md'));

  // lists actions
  $('#lists-load').addEventListener('click', loadLists);
  $('#lists-save').addEventListener('click', saveLists);
  $('#lists-download').addEventListener('click', downloadLists);
  $('#lists-upload').addEventListener('change', uploadLists);
  $('#en-format').addEventListener('click', () => formatJsonArea('#en-json'));
  $('#en-validate').addEventListener('click', () => validateJsonArea('#en-json', '#lists-status'));

  // diag
  $$('#tab-diag [data-ping]').forEach(b => b.addEventListener('click', ()=> ping(b.getAttribute('data-ping'))));
  $('#btn-clear-cache').addEventListener('click', ()=>{ localStorage.clear(); location.reload(); });
  $('#btn-copy-curl').addEventListener('click', copyCurl);

  // Globální zachytávání JS chyb do statusu
  window.addEventListener('error', (e)=>{ show('#gate-status', 'Chyba skriptu: '+e.message, 'err'); });

  if(saved){ doLogin(saved, base); }
});
  $('#btn-login').addEventListener('click', onLogin);
  $('#btn-logout').addEventListener('click', onLogout);

  $$('.tabs button').forEach(btn => btn.addEventListener('click', ()=> switchTab(btn.dataset.tab)));

  // config actions
  $('#config-load').addEventListener('click', loadConfig);
  $('#config-save').addEventListener('click', saveConfig);
  $('#json-format').addEventListener('click', () => formatJsonArea('#agent-json'));
  $('#json-validate').addEventListener('click', () => validateJsonArea('#agent-json', '#config-status'));
  $('#json-download').addEventListener('click', () => download('agent.json', getAgentJsonString()));
  $('#json-upload').addEventListener('change', (e)=> uploadTextFile(e.target, '#agent-json'));
  $('#md-download').addEventListener('click', () => download('agent.md', $('#agent-md').value||''));
  $('#md-upload').addEventListener('change', (e)=> uploadTextFile(e.target, '#agent-md'));

  // lists actions
  $('#lists-load').addEventListener('click', loadLists);
  $('#lists-save').addEventListener('click', saveLists);
  $('#lists-download').addEventListener('click', downloadLists);
  $('#lists-upload').addEventListener('change', uploadLists);
  $('#en-format').addEventListener('click', () => formatJsonArea('#en-json'));
  $('#en-validate').addEventListener('click', () => validateJsonArea('#en-json', '#lists-status'));

  // diag
  $$('#tab-diag [data-ping]').forEach(b => b.addEventListener('click', ()=> ping(b.getAttribute('data-ping'))));
  $('#btn-clear-cache').addEventListener('click', ()=>{ localStorage.clear(); location.reload(); });
  $('#btn-copy-curl').addEventListener('click', copyCurl);

  if(saved){ doLogin(saved, base); }
});

function onLogin(){
  const token = $('#token-input').value.trim();
  const base = $('#api-base').value.trim();
  if(!token) { show('#gate-status', 'Zadej token.', 'warn'); return; }
  doLogin(token, base);
}
function doLogin(token, base){
  localStorage.setItem(LS_TOKEN, token);
  if(base) localStorage.setItem(LS_API_BASE, base); else localStorage.removeItem(LS_API_BASE);
  $('#env-badge').textContent = base ? new URL(base).hostname : 'local';
  testAuth().then(ok => {
    if(ok){
      $('#gate').classList.add('hidden');
      $('#app').classList.remove('hidden');
      switchTab('config');
      loadConfig();
      loadLists();
    } else { show('#gate-status', 'Token odmítnut (401/403).', 'err'); }
  }).catch(()=> show('#gate-status', 'Nelze ověřit token (network).', 'err'));
}
function onLogout(){ localStorage.removeItem(LS_TOKEN); show('#gate-status', 'Odhlášen.', 'ok'); location.reload(); }
function apiBase(){ const b = localStorage.getItem(LS_API_BASE) || ''; return b.replace(/\/$/, ''); }
function authFetch(path, opts={}){
  const token = localStorage.getItem(LS_TOKEN) || '';
  const url = (apiBase() || '') + path;
  const headers = Object.assign({ 'content-type':'application/json' }, opts.headers||{}, { 'x-admin-token': token });
  return fetch(url, Object.assign({}, opts, { headers }));
}
async function testAuth(){ try{ const r=await authFetch('/api/config'); return r.status!==401 && r.status!==403; }catch{ return false; } }
function switchTab(id){ $$('.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===id)); $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-'+id).classList.add('active'); }
function show(sel, msg, cls){ const el=$(sel); if(!el) return; el.textContent=msg||''; el.className='status'+(cls?' '+cls:''); }
function formatJsonArea(sel){ try{ const o=JSON.parse($(sel).value||'{}'); $(sel).value=JSON.stringify(o,null,2);}catch{} }
function validateJsonArea(sel, statusSel){ try{ JSON.parse($(sel).value||'{}'); show(statusSel,'JSON je v pořádku ✓','ok'); }catch(e){ show(statusSel,'Chybný JSON: '+e.message,'err'); } }
function getAgentJsonString(){ return ($('#agent-json').value||'').trim() || '{"model":"gpt-4o-mini","temperature":0.4}'; }

// CONFIG
async function loadConfig(){
  show('#config-status','Načítám…');
  try{
    const res = await authFetch('/api/config'); if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const parsed = parseConfigResponse(data);
    $('#agent-json').value = JSON.stringify(parsed.agentJson, null, 2);
    $('#agent-md').value = parsed.agentMd || '# Styl a pravidla agenta\n';
    show('#config-status','Načteno ✓','ok');
  }catch(e){ show('#config-status','Nepovedlo se načíst: '+e.message,'err'); }
}
function parseConfigResponse(data){
  let agentMd = '', agentJson = {};
  if(data){
    if(data.agentMd || data.agentJson){ agentMd=data.agentMd||''; agentJson=data.agentJson||{}; }
    else if(data.md || data.json){ agentMd=data.md||''; agentJson=data.json||{}; }
    else if(data.files){ const f=data.files; agentMd=f['config/agent.md']||f['agent.md']||''; try{agentJson=JSON.parse(f['config/agent.json']||f['agent.json']||'{}');}catch{agentJson={};} }
  }
  if(!agentJson.model) agentJson.model='gpt-4o-mini';
  if(typeof agentJson.temperature!=='number') agentJson.temperature=0.4;
  return { agentMd, agentJson };
}
async function saveConfig(){
  show('#config-status','Ukládám…');
  try{
    const json = JSON.parse(getAgentJsonString());
    const md = $('#agent-md').value || '';
    const res = await authFetch('/api/config', { method:'POST', body: JSON.stringify({ agentJson: json, agentMd: md }) });
    if(!res.ok) throw new Error('HTTP '+res.status);
    show('#config-status','Uloženo ✓','ok');
  }catch(e){ show('#config-status','Chyba ukládání: '+e.message,'err'); }
}

// LISTS
async function loadLists(){
  show('#lists-status','Načítám…');
  try{
    const res = await authFetch('/api/lists'); if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const vyj = Array.isArray(data.vyjmenovana) ? data.vyjmenovana : [];
    const en  = Array.isArray(data.english) ? data.english : [];
    $('#vyj-text').value = vyj.join('\n');
    $('#en-json').value  = JSON.stringify(en, null, 2);
    show('#lists-status','Načteno ✓','ok');
  }catch(e){ show('#lists-status','Nepovedlo se načíst: '+e.message,'err'); }
}
function parseVyjInput(){
  const raw = $('#vyj-text').value.trim();
  if(!raw) return [];
  try{ const arr = JSON.parse(raw); if(Array.isArray(arr)) return arr.map(String); }catch{}
  return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
function parseEnInput(){
  const raw = $('#en-json').value.trim(); if(!raw) return [];
  const arr = JSON.parse(raw); return arr; // nech případný error vyletět
}
async function saveLists(){
  show('#lists-status','Ukládám… (backend automaticky doplní cs a Chroma)');
  try{
    const vyj = parseVyjInput();
    const en  = parseEnInput();
    const res = await authFetch('/api/lists', { method:'POST', body: JSON.stringify({ vyjmenovana: vyj, english: en }) });
    const txt = await res.text();
    let data = {}; try{ data = JSON.parse(txt); }catch{}
    if(!res.ok) throw new Error('HTTP '+res.status+' '+txt);
    const msg = `Uloženo ✓ vyj: ${data.counts?.vyjmenovana ?? vyj.length}, en: ${data.counts?.english ?? en.length}` + (data.enriched? ' (doplněny překlady)':'') + (typeof data.chromaUpserted==='number'? `, Chroma: ${data.chromaUpserted}`:'');
    show('#lists-status', msg, 'ok');
  }catch(e){ show('#lists-status','Chyba ukládání: '+e.message,'err'); }
}
function downloadLists(){
  try{
    const vyj = parseVyjInput();
    const en  = parseEnInput();
    download('lists.json', JSON.stringify({ vyjmenovana: vyj, english: en }, null, 2));
  }catch(e){ show('#lists-status','Nelze stáhnout: '+e.message,'err'); }
}
function uploadLists(e){
  uploadTextFile(e.target, null, (text)=>{
    try{ const data = JSON.parse(text); if(Array.isArray(data.vyjmenovana)) $('#vyj-text').value = data.vyjmenovana.join('\n'); if(Array.isArray(data.english)) $('#en-json').value = JSON.stringify(data.english, null, 2); }
    catch(err){ show('#lists-status','Chybný JSON: '+err.message,'err'); }
  });
}

// DIAG
async function ping(path){
  show('#diag-output', '→ GET '+path+'\n');
  try{ const res=await authFetch(path); const text=await res.text(); $('#diag-output').textContent += 'HTTP '+res.status+'\n'+text+'\n\n'; }
  catch(e){ $('#diag-output').textContent += 'ERR '+e.message+'\n\n'; }
}
function copyCurl(){
  const token = localStorage.getItem(LS_TOKEN)||''; const base = apiBase()||'';
  const curl = [
    'curl -X POST "'+base+'/api/lists"',
    '-H "content-type: application/json"',
    '-H "x-admin-token: '+token+'"',
    "-d '{\n  \"vyjmenovana\": [\"být\",\"bydlet\",\"myslivec\"],\n  \"english\": [{\"en\":\"cat\"},{\"en\":\"dog\"}]\n}'"
  ].join(' \\\n');
  navigator.clipboard.writeText(curl).then(()=> show('#diag-output','cURL zkopírováno ✓','ok'));
}

// helpers
function download(filename, text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/json'})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
function uploadTextFile(input, targetSel, onText){ const file=input.files&&input.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ const txt=String(reader.result||''); if(onText) onText(txt); else if(targetSel) $(targetSel).value=txt; }; reader.readAsText(file); }
