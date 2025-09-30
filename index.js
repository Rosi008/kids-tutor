```js
// index.js (bez build stepu)
// --------------------------
// Napojení na API: /api/profile, /api/progress, /api/lists
// Opatrně a defenzivně: pokud backend vrátí jiný tvar, UI nespadne.

const userId = ensureUserId();
const state = {
  profile: null,
  progress: null,
  lists: { vyjmenovana: [], english: [] },
  recommended: null,
  mode: 'math',
  subtab: 'recommended',
  runningQuiz: null,
};

// --- Boot ---
window.addEventListener('DOMContentLoaded', async () => {
  wireTabs();
  wirePractice();
  wireProfile();
  wireChat();
  await loadAll();
  renderHome();
  renderPracticeTiles();
});

async function loadAll(){
  const [profile, progress, lists] = await Promise.all([
    getProfile(),
    getProgress(),
    getLists(),
  ]);
  state.profile = profile;
  state.progress = progress;
  state.lists = lists;
  computeRecommended();
}

// --- API helpers ---
async function fetchJSON(url, opts={}){
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  if(!res.ok) throw new Error(`${url} ${res.status}`);
  return await res.json().catch(()=>({}));
}

async function getProfile(){
  try{ return await fetchJSON(`/api/profile?userId=${userId}`); }
  catch{ return { user_id: userId, goals: { xpDaily: 100 }, likes: ['dinosauři','fotbal'], persona: 'kamarád' }; }
}

async function saveProfile(patch){
  const body = JSON.stringify({ userId, ...patch });
  try{ return await fetchJSON(`/api/profile`, { method:'POST', body }); } catch{}
}

async function getProgress(){
  try{ return await fetchJSON(`/api/progress?userId=${userId}&limit=200`); }
  catch{ return { streak:0, xpToday:0, summary:{ per_mode:{} }, recentEvents:[] }; }
}

async function postEvent({ mode, item, correct, ms }){
  const body = JSON.stringify({ userId, mode, item, correct, ms, ts: Date.now() });
  try{ await fetchJSON(`/api/progress`, { method:'POST', body }); }
  catch(e){ console.warn('POST /api/progress failed, will continue offline'); }
}

async function getLists(){
  try{
    const data = await fetchJSON(`/api/lists`);
    return {
      vyjmenovana: Array.isArray(data.vyjmenovana) ? data.vyjmenovana : [],
      english: Array.isArray(data.english) ? data.english : [],
    };
  }catch{
    return { vyjmenovana: ['být','bydlet','myslivec','obyvatel'], english: [{ en:'cat', cs:'kočka' }, { en:'dog', cs:'pes' }] };
  }
}

// --- Recommended logic ---
function computeRecommended(){
  const ev = (state.progress?.recentEvents)||[];
  // map item -> stats
  const byItem = new Map();
  for(const e of ev){
    const key = `${e.mode}:${e.item}`;
    const m = byItem.get(key) || { seen:0, ok:0, last:0 };
    m.seen++; if(e.correct) m.ok++; m.last = Math.max(m.last, e.ts||0);
    byItem.set(key,m);
  }
  const weak = []; const reinforce = []; const novel = [];
  const now = Date.now();
  for(const [key, s] of byItem){
    const [mode,item] = key.split(':');
    const acc = s.ok / s.seen;
    const days = (now - s.last) / (1000*60*60*24);
    if(s.seen >= 3 && acc < 0.6) weak.push({mode,item,score:acc});
    else if(acc >= 0.7 && days >= 2 && days <= 5) reinforce.push({mode,item,days});
  }
  // candidate pool per mode
  const pool = candidatesForMode(state.mode);
  for(const c of pool){
    const key = `${state.mode}:${c}`;
    if(!byItem.has(key)) novel.push({mode:state.mode,item:c});
  }
  // assemble 5 items: 2 weak, 2 reinforce, 1 novel (fallbacks as needed)
  const pick = (arr,n)=>arr.sort(()=>Math.random()-0.5).slice(0,n).map(x=>x.item);
  let items = [];
  items.push(...pick(weak,2));
  items.push(...pick(reinforce,2));
  if(novel.length) items.push(...pick(novel,1));
  // Fill if short
  while(items.length<5){
    const extra = pool[Math.floor(Math.random()*pool.length)];
    if(!items.includes(extra)) items.push(extra);
  }
  state.recommended = { mode: state.mode, items: items.slice(0,5), why: explainWhy(weak,reinforce,novel) };
}

function explainWhy(weak,reinforce,novel){
  const parts=[];
  if(weak.length) parts.push(`protože se ti naposledy nedařilo u: ${weak.slice(0,2).map(w=>prettyItem(w.item)).join(', ')}`);
  if(reinforce.length) parts.push(`upevníme: ${reinforce.slice(0,2).map(r=>prettyItem(r.item)).join(', ')}`);
  if(novel.length) parts.push(`zkusíme novinku: ${prettyItem(novel[0].item)}`);
  return parts.join('; ');
}

function candidatesForMode(mode){
  if(mode==='math') return ['mult-2','mult-3','mult-4','mult-5','mult-6','mult-7','mult-8','mult-9'];
  if(mode==='czech') return (state.lists.vyjmenovana||[]).slice(0,30).map(w=>`vyj-${w}`);
  if(mode==='english') return (state.lists.english||[]).slice(0,30).map(w=>`en-${w.en}`);
  return [];
}

// --- Render Home ---
function renderHome(){
  // Streak & XP
  document.getElementById('streak').textContent = state.progress?.streak ?? 0;
  const goal = state.profile?.goals?.xpDaily ?? 100;
  const xp = state.progress?.xpToday ?? 0;
  document.getElementById('xp-goal').textContent = goal;
  document.getElementById('xp-today').textContent = xp;
  document.getElementById('xp-progress').max = goal;
  document.getElementById('xp-progress').value = Math.min(xp, goal);

  // Tracks (dummy from per_mode accuracy)
  const pm = state.progress?.summary?.per_mode || {};
  updTrack('math', pm.math);
  updTrack('czech', pm.czech);
  updTrack('english', pm.english);

  // Mission
  const m = state.recommended;
  document.getElementById('mission-text').textContent = m ? missionText(m) : 'Připravuji misi…';
  document.getElementById('mission-why').textContent = m?.why ? `Proč: ${m.why}` : '';
}

function updTrack(mode, data){
  const v = Math.round((data?.mastery ?? 0.3) * 100);
  document.getElementById(`prog-${mode}`).value = v;
  document.getElementById(`label-${mode}`).textContent = data?.label || (v<40? 'Začínáme' : v<75? 'Upevňujeme' : 'Letí ti to!');
}

function missionText(m){
  const human = m.items.map(prettyItem).slice(0,2).join(' a ');
  const modeCs = m.mode==='math'? 'násobilku' : m.mode==='czech'? 'vyjmenovaná slova' : 'slovíčka';
  return `Dnes 5 úloh: ${modeCs} – ${human}.`;
}

function prettyItem(item){
  if(item.startsWith('mult-')) return `×${item.split('-')[1]}`;
  if(item.startsWith('vyj-')) return item.slice(4);
  if(item.startsWith('en-')) return item.slice(3);
  return item;
}

// --- Practice wiring ---
function wirePractice(){
  document.getElementById('start-recommended').addEventListener('click', ()=> startQuiz(state.recommended));
  document.getElementById('start-quick').addEventListener('click', ()=>{
    computeRecommended(); renderHome(); startQuiz(state.recommended);
  });
  // Mode switch
  for(const btn of document.querySelectorAll('.mode-switch button')){
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.mode-switch button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      computeRecommended();
      document.getElementById('rec-title').textContent = `Rychlá sada (${state.mode==='math'?'× násobilka': state.mode==='czech'?'vyjmenovaná':'slovíčka'})`;
      document.getElementById('rec-desc').textContent = 'Mix 5 úloh podle tvých posledních výsledků.';
      renderPracticeTiles();
      renderHome();
    });
  }
  // Subtabs
  for(const btn of document.querySelectorAll('.subtabs button')){
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.subtab = btn.dataset.sub;
      document.getElementById('practice-recommended').classList.toggle('active', state.subtab==='recommended');
      document.getElementById('practice-all').classList.toggle('active', state.subtab==='all');
    });
  }
}

function renderPracticeTiles(){
  const grid = document.getElementById('all-tiles');
  grid.innerHTML = '';
  const items = candidatesForMode(state.mode).slice(0,8);
  for(const it of items){
    const b = document.createElement('button');
    b.className = 'tile';
    b.textContent = prettyItem(it);
    b.addEventListener('click', ()=> startQuiz({ mode: state.mode, items: [it, ...shuffle(items.filter(x=>x!==it)).slice(0,4)] }));
    grid.appendChild(b);
  }
}

// --- Quiz engine ---
function startQuiz(payload){
  if(!payload || !payload.items || !payload.items.length){
    alert('Nemám připravené úlohy. Zkus to znova.');
    return;
  }
  const items = payload.items.slice(0,5);
  const session = {
    mode: payload.mode,
    idx: 0, total: items.length,
    items,
    correct: 0,
    started: performance.now(),
    difficulty: 'Akorát',
  };
  state.runningQuiz = session;
  document.getElementById('quiz').classList.remove('hidden');
  document.getElementById('practice-recommended').classList.remove('active');
  document.getElementById('practice-all').classList.remove('active');
  renderQuestion();
}

function renderQuestion(){
  const s = state.runningQuiz; if(!s) return;
  document.getElementById('diff-chip').textContent = s.difficulty;
  document.getElementById('quiz-progress').textContent = `${s.idx+1} / ${s.total}`;
  document.getElementById('feedback').textContent='';
  const item = s.items[s.idx];
  const q = buildQuestion(s.mode, item, s.difficulty);
  const qEl = document.getElementById('question-text');
  const ansEl = document.getElementById('answers');
  qEl.textContent = q.text;
  ansEl.innerHTML = '';

  if(q.type==='mcq'){
    q.options.forEach(opt=>{
      const div = document.createElement('div');
      div.className = 'option';
      div.textContent = opt;
      div.tabIndex = 0;
      div.addEventListener('click', ()=> selectOption(div, ansEl));
      ansEl.appendChild(div);
    });
  } else if(q.type==='input'){
    const inp = document.createElement('input');
    inp.type='text'; inp.placeholder='Sem napiš odpověď';
    ansEl.appendChild(inp);
  }

  const submit = document.getElementById('btn-submit');
  submit.onclick = ()=> checkAnswer(q, ansEl);
  const hint = document.getElementById('btn-hint');
  hint.onclick = ()=> showHint(q);
}

function selectOption(div, container){
  container.querySelectorAll('.option').forEach(o=>o.classList.remove('selected'));
  div.classList.add('selected');
}

function checkAnswer(q, ansEl){
  let val = '';
  if(q.type==='mcq'){
    const sel = ansEl.querySelector('.selected');
    if(!sel) return; val = sel.textContent;
  } else {
    const inp = ansEl.querySelector('input');
    val = (inp?.value||'').trim();
    if(!val) return;
  }
  const ok = q.check(val);
  const fb = document.getElementById('feedback');
  fb.textContent = ok ? 'Správně! ✅' : `Zkus to příště. Správně je: ${q.solution}`;
  fb.className = 'feedback ' + (ok?'ok':'no');

  // event log
  postEvent({ mode: state.runningQuiz.mode, item: q.itemId, correct: ok, ms: 0 });

  if(ok) state.runningQuiz.correct++;
  // adapt diff: po každé 2. odpovědi
  if(state.runningQuiz.idx%2===1){
    state.runningQuiz.difficulty = adaptDifficulty(state.runningQuiz);
    document.getElementById('diff-chip').textContent = state.runningQuiz.difficulty;
  }

  setTimeout(()=>{
    state.runningQuiz.idx++;
    if(state.runningQuiz.idx >= state.runningQuiz.total){
      endQuiz();
    } else {
      renderQuestion();
    }
  }, 600);
}

function adaptDifficulty(s){
  const ratio = s.correct/(s.idx+1);
  if(ratio>0.8) return 'Těžší';
  if(ratio<0.5) return 'Lehčí';
  return 'Akorát';
}

function endQuiz(){
  const s = state.runningQuiz; if(!s) return;
  const gained = 10 + s.correct*6; // jednoduché XP
  document.getElementById('quiz').classList.add('hidden');
  alert(`Skvělé! Získal(a) jsi ${gained} XP. Správně ${s.correct}/${s.total}.`);
  // Refresh progress z backendu
  getProgress().then(p=>{ state.progress=p; renderHome(); });
}

// --- Question builders ---
function buildQuestion(mode, itemId, difficulty){
  if(mode==='math') return buildMath(itemId, difficulty);
  if(mode==='czech') return buildVyj(itemId, difficulty);
  if(mode==='english') return buildEnglish(itemId, difficulty);
  return {type:'input', text:'?', solution:'', check:()=>false, itemId};
}

function buildMath(itemId, difficulty){
  const n = parseInt(itemId.split('-')[1],10) || 2;
  const a = n; const b = rand(2,9);
  const sol = a*b;
  if(difficulty==='Lehčí'){
    const opts = shuffle([sol, sol+1, sol-1, sol+2]).slice(0,4);
    return { type:'mcq', text:`Kolik je ${a} × ${b}?`, options:opts, solution:String(sol), check:(v)=> String(v)==String(sol), itemId };
  }
  if(difficulty==='Těžší'){
    return { type:'input', text:`Vypočítej ${a} × ${b}`, solution:String(sol), check:(v)=> String(v)==String(sol), itemId };
  }
  const opts = shuffle([sol, sol+2, sol-2, sol+3]);
  return { type:'mcq', text:`Kolik je ${a} × ${b}?`, options:opts, solution:String(sol), check:(v)=> String(v)==String(sol), itemId };
}

function buildVyj(itemId, difficulty){
  const word = itemId.slice(4);
  const hole = word.replace('y','_').replace('ý','_').replace('i','_').replace('í','_');
  const sol = word;
  if(difficulty==='Těžší'){
    return { type:'input', text:`Doplň: ${hole}`, solution:sol, check:(v)=> normalize(v)===normalize(sol), itemId };
  }
  const options = shuffle([sol, sol.replace('y','i'), sol.replace('i','y'), sol.toUpperCase().slice(0,1)+sol.slice(1)]);
  return { type:'mcq', text:`Vyber správné slovo:`, options, solution:sol, check:(v)=> normalize(v)===normalize(sol), itemId };
}

function buildEnglish(itemId, difficulty){
  const en = itemId.slice(3);
  const rec = (state.lists.english||[]).find(x=>x.en===en) || { en, cs:'?' };
  if(difficulty==='Lehčí'){
    const options = shuffle([rec.cs, '???', (rec.cs||'').slice(0,2)+'…', '—']).map(x=>String(x));
    return { type:'mcq', text:`Co znamená '${rec.en}' česky?`, options, solution:String(rec.cs), check:(v)=> String(v)===String(rec.cs), itemId };
  }
  if(difficulty==='Těžší'){
    return { type:'input', text:`Přelož do češtiny: '${rec.en}'`, solution:String(rec.cs), check:(v)=> normalize(v)===normalize(rec.cs), itemId };
  }
  const options = shuffle([rec.cs, ...sampleOtherCs(rec.cs, 3)]);
  return { type:'mcq', text:`Vyber správný překlad: '${rec.en}'`, options, solution:String(rec.cs), check:(v)=> String(v)===String(rec.cs), itemId };
}

function sampleOtherCs(except, n){
  const pool = (state.lists.english||[]).map(x=>x.cs).filter(Boolean).filter(cs=>cs!==except);
  return shuffle(pool).slice(0,n);
}

// --- Chat (stub – napojení na /api/agent je snadné) ---
function wireChat(){
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  document.querySelectorAll('[data-open-chat]').forEach(b=> b.addEventListener('click',()=> switchTab('chat')));
  document.querySelectorAll('[data-qp]').forEach(b=> b.addEventListener('click',()=>{
    input.value = quickPrompt(b.dataset.qp);
    input.focus();
  }));
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = input.value.trim(); if(!text) return;
    pushMsg('me', text);
    input.value='';
    pushMsg('bot', 'Přemýšlím…');
    try{
      const body = JSON.stringify({ userId, message:text, context: state.recommended });
      const res = await fetch('/api/agent', { method:'POST', headers:{'content-type':'application/json'}, body });
      const data = await res.json();
      replaceLastBot(data.reply || 'Hotovo!');
    }catch{
      replaceLastBot('Jsem offline – zkus to později.');
    }
  });
  function pushMsg(who, text){
    const div = document.createElement('div');
    div.className = `msg ${who}`; div.textContent = text; log.appendChild(div); log.scrollTop = log.scrollHeight;
  }
  function replaceLastBot(text){
    const last = [...log.querySelectorAll('.msg.bot')].pop();
    if(last) last.textContent = text; else pushMsg('bot', text);
  }
}

function quickPrompt(kind){
  const m = state.recommended?.mode || 'math';
  if(kind==='vysvetli') return m==='math'? 'Vysvětli mi násobilku dnes doporučené řady.' : m==='czech'? 'Vysvětli použití i/y u vyjmenovaných slov, prosím.' : 'Vysvětli mi dnešní slovíčka a dej příklad věty.';
  if(kind==='priklady') return m==='math'? 'Dej mi 3 příklady na procvičení.' : m==='czech'? 'Dej 3 věty s dnešním slovem.' : 'Dej 3 věty s dnešním slovíčkem.';
  if(kind==='slovicka') return 'Procvič se mnou dnešní anglická slovíčka.';
  return 'Pomoz mi s dnešní misí.';
}

// --- Profile wiring ---
function wireProfile(){
  const goal = document.getElementById('goal-xp');
  const goalVal = document.getElementById('goal-xp-value');
  const harder = document.getElementById('harder-toggle');
  const likesWrap = document.getElementById('likes');
  const bigFont = document.getElementById('big-font');
  const reduceMotion = document.getElementById('reduce-motion');

  // initial values
  goal.value = state.profile?.goals?.xpDaily ?? 100;
  goalVal.textContent = goal.value;
  harder.checked = !!state.profile?.goals?.harder;
  ;(state.profile?.likes||['dinosauři','kočky','lego']).forEach(addLikeChip);

  goal.addEventListener('input', ()=> goalVal.textContent = goal.value);
  goal.addEventListener('change', ()=> saveProfile({ goals:{ ...(state.profile?.goals||{}), xpDaily: Number(goal.value) } }));
  harder.addEventListener('change', ()=> saveProfile({ goals:{ ...(state.profile?.goals||{}), harder: harder.checked } }));

  function addLikeChip(label){
    const b = document.createElement('button'); b.type='button'; b.className='chip-btn'; b.textContent=label;
    b.addEventListener('click', async ()=>{
      const likes = toggleInArray(state.profile?.likes||[], label);
      state.profile.likes = likes;
      await saveProfile({ likes });
      b.classList.toggle('active');
    });
    likesWrap.appendChild(b);
  }

  bigFont.addEventListener('change', ()=> document.body.classList.toggle('big-font', bigFont.checked));
  reduceMotion.addEventListener('change', ()=> document.documentElement.style.setProperty('scroll-behavior', reduceMotion.checked? 'auto':'smooth'));
}

// --- Tabs ---
function wireTabs(){
  document.querySelectorAll('.tabbar button').forEach(btn=>{
    btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
  });
}
function switchTab(id){
  document.querySelectorAll('.tabbar button').forEach(b=> b.classList.toggle('active', b.dataset.tab===id));
  document.querySelectorAll('.tab').forEach(s=> s.classList.remove('active'));
  document.getElementById(`tab-${id}`).classList.add('active');
}

// --- Utils ---
function ensureUserId(){
  let id = localStorage.getItem('userId');
  if(!id){ id = crypto.randomUUID ? crypto.randomUUID() : 'u_'+Math.random().toString(36).slice(2); localStorage.setItem('userId', id); }
  return id;
}
function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }
function normalize(s){ return String(s).toLowerCase().trim(); }
function toggleInArray(arr, val){ return arr.includes(val) ? arr.filter(x=>x!==val) : [...arr, val]; }
```

