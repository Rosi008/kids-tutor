
// index.js (bez build stepu) – verze 2 (opravy: Safari kompatibilita, uzavřené závorky, žádné optional chaining)
// -----------------------------------------------------------------------------
// Napojení na API: /api/profile, /api/progress, /api/lists, /api/agent

var userId = ensureUserId();
var state = {
  profile: null,
  progress: null,
  lists: { vyjmenovana: [], english: [] },
  recommended: null,
  mode: 'math',
  subtab: 'recommended',
  runningQuiz: null
};

// --- Boot ---
window.addEventListener('DOMContentLoaded', function(){
  wireTabs();
  wirePractice();
  wireProfile();
  wireChat();
  loadAll().then(function(){
    renderHome();
    if(!state.recommended){ computeRecommended(); renderHome(); }
    renderPracticeTiles();
  });
});

function loadAll(){
  return Promise.all([
    getProfile(),
    getProgress(),
    getLists()
  ]).then(function(res){
    state.profile = res[0];
    state.progress = res[1];
    state.lists = res[2];
    computeRecommended();
  }).catch(function(){
    computeRecommended();
  });
}

// --- API helpers ---
function fetchJSON(url, opts){
  opts = opts || {};
  var headers = opts.headers || { 'content-type': 'application/json' };
  var merged = { method: opts.method || 'GET', headers: headers };
  if(opts.body){ merged.body = opts.body; }
  return fetch(url, merged).then(function(res){
    if(!res.ok){ throw new Error(url+' '+res.status); }
    return res.json().catch(function(){ return {}; });
  });
}

function getProfile(){
  return fetchJSON('/api/profile?userId='+encodeURIComponent(userId))
    .catch(function(){
      return { user_id: userId, goals: { xpDaily: 100 }, likes: ['dinosauři','fotbal'], persona: 'kamarád' };
    });
}

function saveProfile(patch){
  var body = JSON.stringify(Object.assign({ userId: userId }, patch));
  return fetchJSON('/api/profile', { method:'POST', body: body }).catch(function(){});
}

function getProgress(){
  return fetchJSON('/api/progress?userId='+encodeURIComponent(userId)+'&limit=200')
    .catch(function(){ return { streak:0, xpToday:0, summary:{ per_mode:{} }, recentEvents:[] }; });
}

function postEvent(payload){
  var body = JSON.stringify(Object.assign({ userId: userId, ts: Date.now() }, payload));
  return fetchJSON('/api/progress', { method:'POST', body: body }).catch(function(){ console.warn('POST /api/progress failed'); });
}

function getLists(){
  return fetchJSON('/api/lists').then(function(data){
    return {
      vyjmenovana: Array.isArray(data.vyjmenovana) ? data.vyjmenovana : [],
      english: Array.isArray(data.english) ? data.english : []
    };
  }).catch(function(){
    return { vyjmenovana: ['být','bydlet','myslivec','obyvatel'], english: [{ en:'cat', cs:'kočka' }, { en:'dog', cs:'pes' }] };
  });
}

// --- Recommended logic ---
function computeRecommended(){
  var ev = (state.progress && state.progress.recentEvents) ? state.progress.recentEvents : [];
  var byItem = new Map();
  for(var i=0;i<ev.length;i++){
    var e = ev[i];
    var key = (e.mode||'')+':'+(e.item||'');
    var m = byItem.get(key) || { seen:0, ok:0, last:0 };
    m.seen++; if(e.correct) m.ok++; m.last = Math.max(m.last, e.ts||0);
    byItem.set(key,m);
  }
  var weak = []; var reinforce = []; var novel = [];
  var now = Date.now();
  byItem.forEach(function(s, key){
    var parts = key.split(':');
    var mode = parts[0]; var item = parts.slice(1).join(':');
    var acc = s.seen ? (s.ok / s.seen) : 0;
    var days = (now - s.last) / (1000*60*60*24);
    if(s.seen >= 3 && acc < 0.6) weak.push({mode:mode,item:item,score:acc});
    else if(acc >= 0.7 && days >= 2 && days <= 5) reinforce.push({mode:mode,item:item,days:days});
  });
  var pool = candidatesForMode(state.mode);
  for(var j=0;j<pool.length;j++){
    var c = pool[j];
    var k = state.mode+':'+c;
    if(!byItem.has(k)) novel.push({mode:state.mode,item:c});
  }
  function pick(arr,n){ return shuffle(arr.slice()).slice(0,n).map(function(x){ return x.item; }); }
  var items = [];
  items = items.concat(pick(weak,2));
  items = items.concat(pick(reinforce,2));
  if(novel.length) items = items.concat(pick(novel,1));
  while(items.length<5 && pool.length){
    var extra = pool[Math.floor(Math.random()*pool.length)];
    if(items.indexOf(extra)===-1) items.push(extra);
  }
  state.recommended = { mode: state.mode, items: items.slice(0,5), why: explainWhy(weak,reinforce,novel) };
}

function explainWhy(weak,reinforce,novel){
  var parts=[];
  if(weak.length){ parts.push('protože se ti naposledy nedařilo u: '+weak.slice(0,2).map(function(w){return prettyItem(w.item);}).join(', ')); }
  if(reinforce.length){ parts.push('upevníme: '+reinforce.slice(0,2).map(function(r){return prettyItem(r.item);}).join(', ')); }
  if(novel.length){ parts.push('zkusíme novinku: '+prettyItem(novel[0].item)); }
  return parts.join('; ');
}

function candidatesForMode(mode){
  if(mode==='math') return ['mult-2','mult-3','mult-4','mult-5','mult-6','mult-7','mult-8','mult-9'];
  if(mode==='czech') return (state.lists && state.lists.vyjmenovana ? state.lists.vyjmenovana : []).slice(0,30).map(function(w){ return 'vyj-'+w; });
  if(mode==='english') return (state.lists && state.lists.english ? state.lists.english : []).slice(0,30).map(function(w){ return 'en-'+w.en; });
  return [];
}

// --- Render Home ---
function renderHome(){
  var streak = (state.progress && typeof state.progress.streak==='number') ? state.progress.streak : 0;
  var goal = (state.profile && state.profile.goals && state.profile.goals.xpDaily) ? state.profile.goals.xpDaily : 100;
  var xp = (state.progress && typeof state.progress.xpToday==='number') ? state.progress.xpToday : 0;
  document.getElementById('streak').textContent = String(streak);
  document.getElementById('xp-goal').textContent = String(goal);
  document.getElementById('xp-today').textContent = String(xp);
  var xpp = document.getElementById('xp-progress'); xpp.max = goal; xpp.value = Math.min(xp, goal);

  var pm = (state.progress && state.progress.summary && state.progress.summary.per_mode) ? state.progress.summary.per_mode : {};
  updTrack('math', pm.math);
  updTrack('czech', pm.czech);
  updTrack('english', pm.english);

  var m = state.recommended;
  document.getElementById('mission-text').textContent = m ? missionText(m) : 'Připravuji misi…';
  document.getElementById('mission-why').textContent = (m && m.why) ? ('Proč: '+m.why) : '';
}

function updTrack(mode, data){
  var mastery = data && typeof data.mastery==='number' ? data.mastery : 0.3;
  var v = Math.round(mastery * 100);
  document.getElementById('prog-'+mode).value = v;
  var label = (data && data.label) ? data.label : (v<40? 'Začínáme' : v<75? 'Upevňujeme' : 'Letí ti to!');
  document.getElementById('label-'+mode).textContent = label;
}

function missionText(m){
  var human = m.items.map(prettyItem).slice(0,2).join(' a ');
  var modeCs = m.mode==='math'? 'násobilku' : (m.mode==='czech'? 'vyjmenovaná slova' : 'slovíčka');
  return 'Dnes 5 úloh: '+modeCs+' – '+human+'.';
}

function prettyItem(item){
  if(item.indexOf('mult-')===0) return '×'+item.split('-')[1];
  if(item.indexOf('vyj-')===0) return item.slice(4);
  if(item.indexOf('en-')===0) return item.slice(3);
  return item;
}

// --- Practice wiring ---
function wirePractice(){
  var startRec = document.getElementById('start-recommended');
  if(startRec) startRec.addEventListener('click', function(){ startQuiz(state.recommended); });
  var startQuick = document.getElementById('start-quick');
  if(startQuick) startQuick.addEventListener('click', function(){ computeRecommended(); renderHome(); startQuiz(state.recommended); });

  var modeBtns = document.querySelectorAll('.mode-switch button');
  for(var i=0;i<modeBtns.length;i++){
    (function(btn){
      btn.addEventListener('click', function(){
        for(var k=0;k<modeBtns.length;k++){ modeBtns[k].classList.remove('active'); }
        btn.classList.add('active');
        state.mode = btn.getAttribute('data-mode');
        computeRecommended();
        var rt = document.getElementById('rec-title');
        if(rt){ rt.textContent = 'Rychlá sada ('+(state.mode==='math'?'× násobilka': state.mode==='czech'?'vyjmenovaná':'slovíčka')+')'; }
        var rd = document.getElementById('rec-desc');
        if(rd){ rd.textContent = 'Mix 5 úloh podle tvých posledních výsledků.'; }
        renderPracticeTiles();
        renderHome();
      });
    })(modeBtns[i]);
  }

  var subBtns = document.querySelectorAll('.subtabs button');
  for(var j=0;j<subBtns.length;j++){
    (function(btn){
      btn.addEventListener('click', function(){
        for(var k=0;k<subBtns.length;k++){ subBtns[k].classList.remove('active'); }
        btn.classList.add('active');
        state.subtab = btn.getAttribute('data-sub');
        document.getElementById('practice-recommended').classList.toggle('active', state.subtab==='recommended');
        document.getElementById('practice-all').classList.toggle('active', state.subtab==='all');
      });
    })(subBtns[j]);
  }
}

function renderPracticeTiles(){
  var grid = document.getElementById('all-tiles');
  if(!grid) return;
  grid.innerHTML = '';
  var items = candidatesForMode(state.mode).slice(0,8);
  for(var i=0;i<items.length;i++){
    (function(it){
      var b = document.createElement('button');
      b.className = 'tile';
      b.textContent = prettyItem(it);
      b.addEventListener('click', function(){
        var others = items.filter(function(x){ return x!==it; });
        startQuiz({ mode: state.mode, items: [it].concat(shuffle(others).slice(0,4)) });
      });
      grid.appendChild(b);
    })(items[i]);
  }
}

// --- Quiz engine ---
function startQuiz(payload){
  if(!payload || !payload.items || !payload.items.length){
    alert('Nemám připravené úlohy. Zkus to znova.');
    return;
  }
  var items = payload.items.slice(0,5);
  var session = {
    mode: payload.mode,
    idx: 0, total: items.length,
    items: items,
    correct: 0,
    started: performance.now(),
    difficulty: 'Akorát'
  };
  state.runningQuiz = session;
  var quiz = document.getElementById('quiz');
  if(quiz) quiz.classList.remove('hidden');
  document.getElementById('practice-recommended').classList.remove('active');
  document.getElementById('practice-all').classList.remove('active');
  renderQuestion();
}

function renderQuestion(){
  var s = state.runningQuiz; if(!s) return;
  document.getElementById('diff-chip').textContent = s.difficulty;
  document.getElementById('quiz-progress').textContent = (s.idx+1)+' / '+s.total;
  var fbEl = document.getElementById('feedback');
  fbEl.textContent=''; fbEl.className='feedback';
  var item = s.items[s.idx];
  var q = buildQuestion(s.mode, item, s.difficulty);
  var qEl = document.getElementById('question-text');
  var ansEl = document.getElementById('answers');
  qEl.textContent = q.text;
  ansEl.innerHTML = '';

  if(q.type==='mcq'){
    for(var i=0;i<q.options.length;i++){
      var div = document.createElement('div');
      div.className = 'option';
      div.textContent = q.options[i];
      div.tabIndex = 0;
      div.addEventListener('click', function(ev){ selectOption(ev.currentTarget, ansEl); });
      ansEl.appendChild(div);
    }
  } else if(q.type==='input'){
    var inp = document.createElement('input');
    inp.type='text'; inp.placeholder='Sem napiš odpověď';
    ansEl.appendChild(inp);
  }

  var submit = document.getElementById('btn-submit');
  submit.onclick = function(){ checkAnswer(q, ansEl); };
  var hint = document.getElementById('btn-hint');
  hint.onclick = function(){ showHint(q); };
}

function selectOption(div, container){
  var opts = container.querySelectorAll('.option');
  for(var i=0;i<opts.length;i++){ opts[i].classList.remove('selected'); }
  div.classList.add('selected');
}

function checkAnswer(q, ansEl){
  var val = '';
  if(q.type==='mcq'){
    var sel = ansEl.querySelector('.selected');
    if(!sel) return; val = sel.textContent;
  } else {
    var inp = ansEl.querySelector('input');
    val = (inp && inp.value ? inp.value : '').trim();
    if(!val) return;
  }
  var ok = q.check(val);
  var fb = document.getElementById('feedback');
  fb.textContent = ok ? 'Správně! ✅' : ('Zkus to příště. Správně je: '+q.solution);
  fb.className = 'feedback ' + (ok?'ok':'no');

  postEvent({ mode: state.runningQuiz.mode, item: q.itemId, correct: ok, ms: 0 });

  if(ok) state.runningQuiz.correct++;
  if(state.runningQuiz.idx%2===1){
    state.runningQuiz.difficulty = adaptDifficulty(state.runningQuiz);
    document.getElementById('diff-chip').textContent = state.runningQuiz.difficulty;
  }

  setTimeout(function(){
    state.runningQuiz.idx++;
    if(state.runningQuiz.idx >= state.runningQuiz.total){
      endQuiz();
    } else {
      renderQuestion();
    }
  }, 600);
}

function adaptDifficulty(s){
  var ratio = s.correct/(s.idx+1);
  if(ratio>0.8) return 'Těžší';
  if(ratio<0.5) return 'Lehčí';
  return 'Akorát';
}

function endQuiz(){
  var s = state.runningQuiz; if(!s) return;
  var gained = 10 + s.correct*6;
  var quiz = document.getElementById('quiz');
  if(quiz) quiz.classList.add('hidden');
  alert('Skvělé! Získal(a) jsi '+gained+' XP. Správně '+s.correct+'/'+s.total+'.');
  getProgress().then(function(p){ state.progress=p; renderHome(); });
}

// --- Question builders ---
function buildQuestion(mode, itemId, difficulty){
  if(mode==='math') return buildMath(itemId, difficulty);
  if(mode==='czech') return buildVyj(itemId, difficulty);
  if(mode==='english') return buildEnglish(itemId, difficulty);
  return {type:'input', text:'?', solution:'', check:function(){ return false; }, itemId:itemId};
}

function buildMath(itemId, difficulty){
  var n = parseInt(itemId.split('-')[1],10) || 2;
  var a = n; var b = rand(2,9);
  var sol = a*b;
  if(difficulty==='Lehčí'){
    var opts1 = shuffle([sol, sol+1, sol-1, sol+2]).slice(0,4);
    return { type:'mcq', text:'Kolik je '+a+' × '+b+'?', options:opts1, solution:String(sol), check:function(v){ return String(v)==String(sol); }, itemId:itemId };
  }
  if(difficulty==='Těžší'){
    return { type:'input', text:'Vypočítej '+a+' × '+b, solution:String(sol), check:function(v){ return String(v)==String(sol); }, itemId:itemId };
  }
  var opts2 = shuffle([sol, sol+2, sol-2, sol+3]);
  return { type:'mcq', text:'Kolik je '+a+' × '+b+'?', options:opts2, solution:String(sol), check:function(v){ return String(v)==String(sol); }, itemId:itemId };
}

function buildVyj(itemId, difficulty){
  var word = itemId.slice(4);
  var hole = word.replace('y','_').replace('ý','_').replace('i','_').replace('í','_');
  var sol = word;
  if(difficulty==='Těžší'){
    return { type:'input', text:'Doplň: '+hole, solution:sol, check:function(v){ return normalize(v)===normalize(sol); }, itemId:itemId };
  }
  var options = shuffle([sol, sol.replace('y','i'), sol.replace('i','y'), sol.charAt(0).toUpperCase()+sol.slice(1)]);
  return { type:'mcq', text:'Vyber správné slovo:', options:options, solution:sol, check:function(v){ return normalize(v)===normalize(sol); }, itemId:itemId };
}

function buildEnglish(itemId, difficulty){
  var en = itemId.slice(3);
  var rec = null;
  var list = (state.lists && state.lists.english) ? state.lists.english : [];
  for(var i=0;i<list.length;i++){ if(list[i].en===en){ rec=list[i]; break; } }
  if(!rec) rec = { en: en, cs: '?' };
  if(difficulty==='Lehčí'){
    var options1 = shuffle([rec.cs, '??', (rec.cs||'').slice(0,2)+'…', '-']).map(function(x){ return String(x); });
    return { type:'mcq', text:"Co znamená '"+rec.en+"' česky?", options:options1, solution:String(rec.cs), check:function(v){ return String(v)===String(rec.cs); }, itemId:itemId };
  }
  if(difficulty==='Těžší'){
    return { type:'input', text:"Přelož do češtiny: '"+rec.en+"'", solution:String(rec.cs), check:function(v){ return normalize(v)===normalize(rec.cs); }, itemId:itemId };
  }
  var options2 = shuffle([rec.cs].concat(sampleOtherCs(rec.cs, 3)));
  return { type:'mcq', text:"Vyber správný překlad: '"+rec.en+"'", options:options2, solution:String(rec.cs), check:function(v){ return String(v)===String(rec.cs); }, itemId:itemId };
}

function sampleOtherCs(except, n){
  var pool = ((state.lists && state.lists.english)? state.lists.english : []).map(function(x){ return x.cs; }).filter(function(cs){ return !!cs && cs!==except; });
  return shuffle(pool).slice(0,n);
}

// --- Chat (stub) ---
function wireChat(){
  var log = document.getElementById('chat-log');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var openBtns = document.querySelectorAll('[data-open-chat]');
  for(var i=0;i<openBtns.length;i++){ openBtns[i].addEventListener('click', function(){ switchTab('chat'); }); }
  var qps = document.querySelectorAll('[data-qp]');
  for(var j=0;j<qps.length;j++){
    (function(b){ b.addEventListener('click', function(){ input.value = quickPrompt(b.getAttribute('data-qp')); input.focus(); }); })(qps[j]);
  }
  if(form){ form.addEventListener('submit', function(e){
    e.preventDefault();
    var text = input.value.trim(); if(!text) return;
    pushMsg('me', text);
    input.value='';
    pushMsg('bot', 'Přemýšlím…');
    var body = JSON.stringify({ userId: userId, message:text, context: state.recommended });
    fetch('/api/agent', { method:'POST', headers:{'content-type':'application/json'}, body: body })
      .then(function(res){ return res.json(); })
      .then(function(data){ replaceLastBot((data && data.reply) ? data.reply : 'Hotovo!'); })
      .catch(function(){ replaceLastBot('Jsem offline – zkus to později.'); });
  }); }

  function pushMsg(who, text){
    var div = document.createElement('div');
    div.className = 'msg '+who; div.textContent = text; log.appendChild(div); log.scrollTop = log.scrollHeight;
  }
  function replaceLastBot(text){
    var bots = log.querySelectorAll('.msg.bot');
    var last = bots.length ? bots[bots.length-1] : null;
    if(last) last.textContent = text; else pushMsg('bot', text);
  }
}

function quickPrompt(kind){
  var m = (state.recommended && state.recommended.mode) ? state.recommended.mode : 'math';
  if(kind==='vysvetli') return m==='math'? 'Vysvětli mi násobilku dnes doporučené řady.' : (m==='czech'? 'Vysvětli použití i/y u vyjmenovaných slov, prosím.' : 'Vysvětli mi dnešní slovíčka a dej příklad věty.');
  if(kind==='priklady') return m==='math'? 'Dej mi 3 příklady na procvičení.' : (m==='czech'? 'Dej 3 věty s dnešním slovem.' : 'Dej 3 věty s dnešním slovíčkem.');
  if(kind==='slovicka') return 'Procvič se mnou dnešní anglická slovíčka.';
  return 'Pomoz mi s dnešní misí.';
}

// --- Profile wiring ---
function wireProfile(){
  var goal = document.getElementById('goal-xp');
  var goalVal = document.getElementById('goal-xp-value');
  var harder = document.getElementById('harder-toggle');
  var likesWrap = document.getElementById('likes');
  var bigFont = document.getElementById('big-font');
  var reduceMotion = document.getElementById('reduce-motion');

  if(goal){ goal.value = (state.profile && state.profile.goals && state.profile.goals.xpDaily) ? state.profile.goals.xpDaily : 100; }
  if(goalVal){ goalVal.textContent = goal ? goal.value : '100'; }
  if(harder){ harder.checked = !!(state.profile && state.profile.goals && state.profile.goals.harder); }
  var likesInit = (state.profile && state.profile.likes) ? state.profile.likes : ['dinosauři','kočky','lego'];
  for(var i=0;i<likesInit.length;i++){ addLikeChip(likesInit[i]); }

  if(goal){
    goal.addEventListener('input', function(){ goalVal.textContent = goal.value; });
    goal.addEventListener('change', function(){
      var current = (state.profile && state.profile.goals) ? state.profile.goals : {};
      current.xpDaily = Number(goal.value);
      saveProfile({ goals: current });
    });
  }
  if(harder){
    harder.addEventListener('change', function(){
      var current = (state.profile && state.profile.goals) ? state.profile.goals : {};
      current.harder = harder.checked;
      saveProfile({ goals: current });
    });
  }

  function addLikeChip(label){
    var b = document.createElement('button'); b.type='button'; b.className='chip-btn'; b.textContent=label;
    b.addEventListener('click', function(){
      var likes = (state.profile && state.profile.likes) ? state.profile.likes.slice() : [];
      var idx = likes.indexOf(label);
      if(idx===-1) likes.push(label); else likes.splice(idx,1);
      if(!state.profile) state.profile = {};
      state.profile.likes = likes;
      saveProfile({ likes: likes });
      b.classList.toggle('active');
    });
    if(likesWrap) likesWrap.appendChild(b);
  }

  if(bigFont){ bigFont.addEventListener('change', function(){ document.body.classList.toggle('big-font', bigFont.checked); }); }
  if(reduceMotion){ reduceMotion.addEventListener('change', function(){ document.documentElement.style.setProperty('scroll-behavior', reduceMotion.checked? 'auto':'smooth'); }); }
}

// --- Tabs ---
function wireTabs(){
  var btns = document.querySelectorAll('.tabbar button');
  for(var i=0;i<btns.length;i++){
    (function(btn){ btn.addEventListener('click', function(){ switchTab(btn.getAttribute('data-tab')); }); })(btns[i]);
  }
}
function switchTab(id){
  var btns = document.querySelectorAll('.tabbar button');
  for(var i=0;i<btns.length;i++){ btns[i].classList.toggle('active', btns[i].getAttribute('data-tab')===id); }
  var tabs = document.querySelectorAll('.tab');
  for(var j=0;j<tabs.length;j++){ tabs[j].classList.remove('active'); }
  var active = document.getElementById('tab-'+id);
  if(active) active.classList.add('active');
}

// --- Utils ---
function ensureUserId(){
  try{
    var id = localStorage.getItem('userId');
    if(!id){
      if(window.crypto && window.crypto.randomUUID){ id = window.crypto.randomUUID(); }
      else { id = 'u_'+Math.random().toString(36).slice(2); }
      localStorage.setItem('userId', id);
    }
    return id;
  }catch(e){ return 'u_'+Math.random().toString(36).slice(2); }
}
function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function shuffle(arr){ return arr.slice().sort(function(){ return Math.random()-0.5; }); }
function normalize(s){ return String(s).toLowerCase().trim(); }
