
/* ---------- storage ---------- */
const LS={get(k,d){try{const v=localStorage.getItem('nutq:'+k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem('nutq:'+k,JSON.stringify(v))}catch(e){}}};
const st={voice:LS.get('voice',''),accent:LS.get('accent','us'),speed:LS.get('speed',0.75),slowSyl:LS.get('slowSyl',true)};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- speech ---------- */
let voices=[];let runId=0;
const NOV=/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/i;
function loadVoices(){try{voices=speechSynthesis.getVoices()}catch(e){}}
if('speechSynthesis' in window){loadVoices();speechSynthesis.onvoiceschanged=()=>{loadVoices();const vs=document.getElementById('vsheet');if(vs&&!vs.hidden)renderVoices()}}
function pickVoice(){
  if(st.voice){const sv=voices.find(v=>v.name===st.voice);if(sv)return sv}
  const lang=st.accent==='uk'?'en-GB':'en-US';
  const c=voices.filter(v=>v.lang.replace('_','-').toLowerCase().startsWith(lang.toLowerCase())&&!NOV.test(v.name));
  const pref=c.find(v=>/Premium|Enhanced|Natural|Neural/i.test(v.name))||c.find(v=>/Samantha|Daniel|Google|Serena|Allison|Ava|Kate/i.test(v.name));
  return pref||c[0]||voices.find(v=>v.lang.startsWith('en'))||null;
}
function speak(text,rate,opts){
  return new Promise(res=>{
    if(!('speechSynthesis' in window)){res();return}
    const u=new SpeechSynthesisUtterance(text);
    const v=(opts&&opts.voice)||pickVoice();u.lang=v?v.lang:(st.accent==='uk'?'en-GB':'en-US');if(v)u.voice=v;
    u.rate=Math.max(0.3,Math.min(1.5,rate||st.speed));
    let done=false;const fin=()=>{if(!done){done=true;res()}};
    u.onend=fin;u.onerror=fin;if(opts&&opts.onb)u.onboundary=opts.onb;speechSynthesis.speak(u);
    setTimeout(fin,1500+text.length*260/u.rate);
  });
}
function stopAll(){runId++;try{speechSynthesis.cancel()}catch(e){};document.querySelectorAll('.live').forEach(e=>e.classList.remove('live'));$('#cue').textContent=''}

/* ---------- accent ---------- */
document.querySelectorAll('[data-accent]').forEach(b=>{
  b.setAttribute('aria-pressed',b.dataset.accent===st.accent);
  b.onclick=()=>{st.accent=b.dataset.accent;LS.set('accent',st.accent);st.voice='';LS.set('voice','');document.querySelectorAll('[data-accent]').forEach(x=>x.setAttribute('aria-pressed',x===b));if(cur)renderCard()};
});

/* ---------- speed panel ---------- */
function renderSpeed(){
  const p=$('#speed-panel');
  const pres=[[0.4,'أبطأ'],[0.55,'بطيء جدًا'],[0.75,'بطيء'],[1,'طبيعي'],[1.25,'سريع']];
  p.innerHTML=`<h3>سرعة النطق</h3><div class="presets">${pres.map(([v,l])=>`<button data-sp="${v}" aria-pressed="${Math.abs(st.speed-v)<.01}">${l}<br><span class="en" style="font-size:12px">${v}×</span></button>`).join('')}</div>
  <div class="slider-row"><input type="range" min="0.3" max="1.5" step="0.05" value="${st.speed}" id="sp-range" aria-label="السرعة"><output class="en" id="sp-out">${st.speed.toFixed(2)}×</output></div>
  <label class="toggle"><input type="checkbox" id="sp-syl" ${st.slowSyl?'checked':''}>المقاطع دائمًا ببطء، والكلمة الكاملة بالسرعة المختارة</label>
  <button class="btn small ghost" id="sp-voice" style="margin-top:10px;width:100%">🔊 اختيار صوت الناطق</button>`;
  p.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{setSpeed(+b.dataset.sp);renderSpeed()});
  $('#sp-range').oninput=e=>{setSpeed(+e.target.value);$('#sp-out').textContent=st.speed.toFixed(2)+'×';p.querySelectorAll('[data-sp]').forEach(b=>b.setAttribute('aria-pressed',Math.abs(st.speed-b.dataset.sp)<.01))};
  $('#sp-syl').onchange=e=>{st.slowSyl=e.target.checked;LS.set('slowSyl',st.slowSyl)};
  $('#sp-voice').onclick=openVoices;
}
function setSpeed(v){st.speed=Math.round(v*100)/100;LS.set('speed',st.speed)}
renderSpeed();

/* ---------- independent AI gateway ---------- */
async function ask(prompt){return NutqAI.ask(prompt)}

/* ---------- word trainer ---------- */
let cur=null;
const cache=LS.get('cache',{});
function heurSyl(w){
  const m=w.toLowerCase().match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/g);
  const parts=m&&m.join('')===w.toLowerCase()?m:[w.toLowerCase()];
  if(parts.length>1&&/^[^aeiouy]*e$/.test(parts[parts.length-1])){const l=parts.pop();parts[parts.length-1]+=l}
  return parts.map((t,i)=>({text:t,ipa:'',say:t,stressed:i===0}));
}

$('#go').onclick=suggest;
async function suggest(){
  const q=$('#q').value.trim();if(!q)return;
  if(/[\u0600-\u06FF]/.test(q))return translateAr(q);
  stopAll();$('#sugs').innerHTML='';$('#status').textContent='جارٍ التصحيح…';$('#go').disabled=true;
  let list=null;
  try{
    const r=await ask(`You help Arabic-speaking learners of English. The learner typed: "${q.replace(/"/g,'')}". It may be a correct word, a misspelling, or only the first letters of a word. Return ONLY JSON: {"correct": true or false, "suggestions":[{"word":"","ar":"short Arabic meaning (2-4 words)"}]}. Give up to 6 real English words, most likely first. If the typed text is itself a correctly spelled word, put it first.`);
    list=(r&&r.suggestions||[]).filter(s=>s&&s.word);
    $('#status').textContent=r&&r.correct?'الكلمة مكتوبة صحيحًا. اخترها للمتابعة:':'اختر الكلمة الصحيحة:';
  }catch(e){
    list=[{word:q.toLowerCase(),ar:''}];
    $('#status').textContent=e&&e.code==='none'?'التصحيح الذكي غير متاح في هذا العرض، سنتدرّب على الكلمة كما كتبتها.':'تعذّر التصحيح الآن، سنتدرّب على الكلمة كما كتبتها.';
  }
  $('#go').disabled=false;
  if(!list.length){$('#status').textContent='لم نجد كلمة قريبة. جرّب كتابة أول حرفين أو ثلاثة.';return}
  $('#sugs').innerHTML=list.map((s,i)=>`<button class="sug" data-i="${i}" aria-pressed="false"><b>${esc(s.word)}</b>${s.ar?`<small>${esc(s.ar)}</small>`:''}</button>`).join('');
  $('#sugs').querySelectorAll('.sug').forEach(b=>b.onclick=()=>{$('#sugs').querySelectorAll('.sug').forEach(x=>x.setAttribute('aria-pressed',x===b));choose(list[+b.dataset.i])});
}
async function translateAr(q){
  stopAll();hideAC();$('#sugs').innerHTML='';$('#status').textContent='جارٍ البحث عن المرادف الإنجليزي…';$('#go').disabled=true;
  try{
    const r=await askT(`An Arabic-speaking learner typed this Arabic word or phrase: "${q.replace(/"/g,'')}". Give its English equivalents. Prefer single words; use a short phrase only when no single word fits. Return ONLY JSON: {"options":[{"word":"english word, lowercase unless a proper noun","ar":"very short Arabic note on this sense or usage"}]} with up to 5 options, most common first.`,40000);
    const list=(r&&r.options||[]).filter(o=>o&&o.word);
    if(!list.length)throw{code:'empty'};
    $('#status').textContent=`المرادفات الإنجليزية لـ «${q}»: اختر واحدة لتسمع نطقها وتتدرّب عليها`;
    $('#sugs').innerHTML=list.map((s,i)=>`<button class="sug" data-i="${i}" aria-pressed="false"><b>${esc(s.word)}</b>${s.ar?`<small>${esc(s.ar)}</small>`:''}</button>`).join('');
    $('#sugs').querySelectorAll('.sug').forEach(b=>b.onclick=()=>{$('#sugs').querySelectorAll('.sug').forEach(x=>x.setAttribute('aria-pressed',x===b));const o=list[+b.dataset.i];choose({word:o.word,ar:o.ar||q})});
  }catch(e){$('#status').textContent=(e&&e.code==='empty')?'لم أجد مرادفًا. جرّب كلمة أخرى.':'الترجمة تحتاج اتصالًا بخدمة الذكاء الاصطناعي. '+(e&&e.code?`(${e.code})`:'')}
  $('#go').disabled=false;
}
async function choose(s){
  stopAll();const w=s.word.toLowerCase();
  if(cache[w]){cur=cache[w];renderCard();return}
  $('#status').textContent='جارٍ تقطيع الكلمة…';
  try{
    const r=await ask(`Analyze the English word "${w}" for an Arabic-speaking pronunciation learner. Return ONLY JSON:
{"word":"${w}","pos_ar":"part of speech in Arabic","meaning_ar":"short Arabic meaning","ipa_us":"/…/","ipa_uk":"/…/","syllables":[{"text":"spelling chunk","ipa":"IPA of this syllable","say":"a respelling a text-to-speech engine can read alone so it sounds like this syllable, lowercase letters only","stressed":true}],"tips_ar":["1-3 short practical tips in Arabic: tricky sounds for Arabic speakers, silent letters, stress"],"sentence":"short simple example sentence","sentence_ar":"Arabic translation"}
The syllable "text" values joined must equal the word exactly. Exactly one syllable has primary stress (for one-syllable words, it is stressed).`);
    if(!r||!Array.isArray(r.syllables)||!r.syllables.length)throw{};
    cur=r;cur.word=w;cache[w]=r;const keys=Object.keys(cache);if(keys.length>150)delete cache[keys[0]];LS.set('cache',cache);
  }catch(e){
    cur={word:w,meaning_ar:s.ar||'',syllables:heurSyl(w),tips_ar:[],fallback:true};
  }
  $('#status').textContent='';renderCard();
}
function renderCard(){
  if(!cur)return;$('#card').hidden=false;
  $('#w-word').textContent=cur.word;
  $('#w-ipa').textContent=(st.accent==='uk'?cur.ipa_uk:cur.ipa_us)||cur.ipa_us||'';
  $('#w-meta').textContent=[cur.pos_ar,cur.meaning_ar].filter(Boolean).join(' · ')||(cur.fallback?'تقسيم تقريبي للمقاطع':'');
  $('#w-syls').innerHTML=cur.syllables.map((s,i)=>`<button class="syl ${s.stressed?'stress':''}" data-i="${i}"><span class="t">${esc(s.text)}</span>${s.ipa?`<span class="p">${esc(s.ipa)}</span>`:''}</button>`).join('');
  $('#w-syls').querySelectorAll('.syl').forEach(b=>b.onclick=async()=>{stopAll();const s=cur.syllables[+b.dataset.i];b.classList.add('live');await speak(s.say||s.text,sylRate());b.classList.remove('live')});
  $('#w-tips').innerHTML=(cur.tips_ar||[]).map(t=>`<li>${esc(t)}</li>`).join('');
  $('#w-ex').innerHTML=cur.sentence?`<button class="iconbtn" id="ex-play" aria-label="استمع للجملة">${PLAY}</button><div><span class="en">${esc(cur.sentence)}</span><small>${esc(cur.sentence_ar||'')}</small></div>`:'';
  if(cur.sentence)$('#ex-play').onclick=()=>{stopAll();speak(cur.sentence,st.speed)};
  $('#check-out').textContent='';$('#check-out').className='check-out';
  $('#a-save').textContent=isSaved(cur.word)?'محفوظة ✓':'احفظ في قائمتي';
  $('#card').scrollIntoView({behavior:'smooth',block:'start'});
}
const PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const sylRate=()=>st.slowSyl?Math.min(st.speed,0.6):st.speed;
function chips(){return [...document.querySelectorAll('#w-syls .syl')]}
$('#a-seq').onclick=async()=>{
  stopAll();const id=runId;const cs=chips();
  for(let i=0;i<cur.syllables.length;i++){
    if(id!==runId)return;cs.forEach(c=>c.classList.remove('live'));cs[i].classList.add('live');
    $('#cue').textContent='استمع';await speak(cur.syllables[i].say||cur.syllables[i].text,sylRate());
    if(id!==runId)return;$('#cue').textContent='ردّد المقطع';await sleep(1100);
  }
  if(id!==runId)return;cs.forEach(c=>c.classList.add('live'));$('#cue').textContent='الكلمة كاملة';
  await speak(cur.word,st.speed);if(id!==runId)return;$('#cue').textContent='ردّد الكلمة';await sleep(1600);
  if(id!==runId)return;stopAll();logPractice(cur.word);
};
$('#a-word').onclick=async()=>{stopAll();const cs=chips();cs.forEach(c=>c.classList.add('live'));await speak(cur.word,st.speed);cs.forEach(c=>c.classList.remove('live'));logPractice(cur.word)};
$('#a-grad').onclick=async()=>{
  stopAll();const id=runId;const top=Math.max(st.speed,1);const steps=[0.5,0.75,top];const cs=chips();
  for(const r of steps){
    if(id!==runId)return;cs.forEach(c=>c.classList.add('live'));$('#cue').textContent=`السرعة ${r}×`;
    await speak(cur.word,r);cs.forEach(c=>c.classList.remove('live'));if(id!==runId)return;
    $('#cue').textContent='ردّد';await sleep(1400+cur.word.length*90);
  }
  if(id!==runId)return;$('#cue').textContent='أحسنت';logPractice(cur.word);setTimeout(()=>{if(id===runId)$('#cue').textContent=''},1500);
};
$('#a-check').onclick=()=>{
  stopAll();const out=$('#check-out');const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){out.className='check-out bad';out.textContent='التعرّف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome أو Safari الحديث.';return}
  let r;try{r=new SR()}catch(e){out.className='check-out bad';out.textContent='تعذّر تشغيل الميكروفون هنا.';return}
  r.lang=st.accent==='uk'?'en-GB':'en-US';r.maxAlternatives=5;r.interimResults=false;
  out.className='check-out';out.textContent='تحدّث الآن… قل الكلمة بوضوح';
  r.onresult=e=>{
    const alts=[...e.results[0]].map(a=>a.transcript.toLowerCase().trim());
    const ok=alts.some(a=>a.split(/\s+/).map(x=>x.replace(/[^a-z']/g,'')).includes(cur.word));
    if(ok){out.className='check-out good';out.textContent='تعرّف الجهاز على الكلمة ✓ هذا اختبار تعرّف على الكلام، وليس تقييمًا لدقة الأصوات.';logPractice(cur.word)}
    else{out.className='check-out bad';out.textContent=`سمعتُ: «${alts[0]||'—'}». استمع مرة أخرى وحاول ثانية.`}
  };
  r.onerror=e=>{out.className='check-out bad';out.textContent=e.error==='not-allowed'||e.error==='service-not-allowed'?'لم يُسمح باستخدام الميكروفون في هذا العرض.':'لم أسمع شيئًا واضحًا. حاول مرة أخرى.'};
  try{r.start()}catch(e){out.className='check-out bad';out.textContent='تعذّر تشغيل الميكروفون هنا.'}
};
$('#a-save').onclick=()=>{
  const s=LS.get('saved',[]);const i=s.findIndex(x=>x.word===cur.word);
  if(i>=0)s.splice(i,1);else s.unshift({word:cur.word,ipa:cur.ipa_us||'',ar:cur.meaning_ar||''});
  LS.set('saved',s);$('#a-save').textContent=isSaved(cur.word)?'محفوظة ✓':'احفظ في قائمتي';
};
function isSaved(w){return LS.get('saved',[]).some(x=>x.word===w)}
function today(){const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()}
function logPractice(w){const s=LS.get('stats',{days:[],words:{},pairs:0});if(!s.days.includes(today()))s.days.push(today());if(w)s.words[w]=(s.words[w]||0)+1;LS.set('stats',s)}

/* ---------- sound data ---------- */
const PL={bl:'الشفتان',ld:'الشفة السفلى والأسنان العليا',dn:'بين الأسنان',al:'اللثة خلف الأسنان العليا',pa:'خلف اللثة',rr:'خلف اللثة (بلا لمس)',pl:'الحنك الصلب',ve:'الحنك اللين',gl:'الحنجرة'};
const MN={st:'انفجاري',fr:'احتكاكي',af:'مركّب',na:'أنفي',ap:'انسيابي'};
const HT={hi:'عالٍ',nhi:'شبه عالٍ',mid:'متوسط',lmid:'شبه منخفض',low:'منخفض'};
const BK={f:'أمامي',c:'وسطي',b:'خلفي'};
const C=(i,pl,m,v,ex,sp,how,tip)=>({i,g:'c',pl,m,v,ex,sp,how,tip});
const V=(i,h,b,l,ex,sp,how,tip)=>({i,g:'v',h,b,l,ex,sp,how,tip});
const D=(i,d,ex,sp,how,tip)=>({i,g:'d',d,ex,sp,how,tip});
const S=[
C('p','bl','st',0,['[p]en','a[pp]le','cu[p]'],'p, pp','أغلق شفتيك تمامًا واحبس الهواء خلفهما، ثم افتحهما فجأة مع دفعة هواء واضحة. الأحبال الصوتية لا تهتز.','أشهر خطأ عند العرب نطقه باءً. ضع يدك أمام فمك: يجب أن تشعر بنفخة هواء لا تجدها مع b.'),
C('b','bl','st',1,['[b]all','ra[bb]it','jo[b]'],'b, bb','نفس وضع p تمامًا، لكن مع اهتزاز الأحبال الصوتية وبدون نفخة هواء قوية.','مثل الباء العربية.'),
C('t','al','st',0,['[t]ea','bu[tt]er','ca[t]'],'t, tt, ed','ضع طرف اللسان على اللثة خلف الأسنان العليا، احبس الهواء ثم أطلقه بنفخة.','التاء العربية تُنطق على الأسنان، أما الإنجليزية فعلى اللثة خلفها بقليل، مع نفخة هواء في أول الكلمة.'),
C('d','al','st',1,['[d]og','la[dd]er','be[d]'],'d, dd, ed','نفس وضع t مع اهتزاز الأحبال الصوتية.','طرف اللسان على اللثة لا على الأسنان، فتخرج أخف من الدال العربية.'),
C('k','ve','st',0,['[k]ey','[c]at','ba[ck]'],'k, c, ck, ch, q','ارفع مؤخرة اللسان لتلمس الحنك اللين في آخر سقف الفم، احبس الهواء ثم أطلقه بنفخة.','هي الكاف العربية مع نفخة هواء، وليست قافًا.'),
C('g','ve','st',1,['[g]o','bi[gg]er','do[g]'],'g, gg, gu','نفس وضع k مع اهتزاز الأحبال الصوتية.','مثل الجيم المصرية في «جمل».'),
C('f','ld','fr',0,['[f]ish','[ph]one','lau[gh]'],'f, ff, ph, gh','المس الأسنان العليا بباطن الشفة السفلى، وادفع الهواء بينهما باستمرار.','مثل الفاء العربية.'),
C('v','ld','fr',1,['[v]an','ri[v]er','lo[v]e'],'v','نفس وضع f لكن مع اهتزاز الأحبال الصوتية، ستشعر بالشفة السفلى تهتز.','من أشهر أخطاء العرب نطقها فاءً. قل ffff ثم شغّل صوتك دون تحريك الشفة: هذا هو v.'),
C('θ','dn','fr',0,['[th]ink','[th]ree','ba[th]'],'th','أخرج طرف اللسان قليلًا بين الأسنان العليا والسفلى وادفع الهواء بلطف.','هي الثاء العربية تمامًا. لا تنطقها سينًا (sink) ولا تاءً (tink).'),
C('ð','dn','fr',1,['[th]is','mo[th]er','brea[th]e'],'th','نفس وضع θ مع اهتزاز الأحبال الصوتية.','هي الذال العربية. لا تنطقها زايًا ولا دالًا.'),
C('s','al','fr',0,['[s]un','[c]ity','gla[ss]'],'s, ss, c, sc','قرّب طرف اللسان من اللثة دون أن يلمسها، واترك ممرًا ضيقًا يصفر منه الهواء.','مثل السين العربية.'),
C('z','al','fr',1,['[z]oo','ro[s]e','bu[zz]'],'z, zz, s','نفس وضع s مع اهتزاز الأحبال الصوتية، كطنين النحلة.','حرف s بين حرفين متحركين يُنطق غالبًا z كما في rose وmusic.'),
C('ʃ','pa','fr',0,['[sh]e','na[ti]on','wa[sh]'],'sh, ti, ci, ch','ارفع اللسان نحو المنطقة خلف اللثة، ودوّر شفتيك وادفعهما قليلًا للأمام.','مثل الشين العربية مع تدوير الشفتين.'),
C('ʒ','pa','fr',1,['mea[s]ure','vi[s]ion','gara[g]e'],'s, g','نفس وضع ʃ مع اهتزاز الأحبال الصوتية.','مثل الجيم الشامية المعطّشة في «جميل».'),
C('h','gl','fr',0,['[h]at','be[h]ind','[wh]o'],'h, wh','افتح فمك وأخرج الهواء بلطف من الحلق دون احتكاك داخل الفم.','هاء خفيفة جدًا. وانتبه: h صامتة في hour وhonest.'),
C('tʃ','pa','af',0,['[ch]air','wa[tch]','na[t]ure'],'ch, tch, t','ابدأ بلمس اللسان خلف اللثة كأنك ستقول t، ثم اتركه ينزلق مباشرة إلى ʃ.','صوت «تش». لا تخلطه بالشين: chip غير ship.'),
C('dʒ','pa','af',1,['[j]am','a[g]e','bri[dge]'],'j, g, dge','نفس وضع tʃ مع اهتزاز الأحبال الصوتية.','مثل الجيم الفصحى المعطّشة.'),
C('m','bl','na',1,['[m]an','su[mm]er','ho[m]e'],'m, mm','أغلق شفتيك واترك الصوت يخرج من الأنف.','مثل الميم العربية.'),
C('n','al','na',1,['[n]o','di[nn]er','su[n]'],'n, nn, kn','ضع طرف اللسان على اللثة واترك الصوت يخرج من الأنف.','مثل النون العربية. وانتبه: k صامتة في know وknife.'),
C('ŋ','ve','na',1,['si[ng]','thi[n]k','lo[ng]'],'ng, n','ارفع مؤخرة اللسان إلى الحنك اللين كما في k، واترك الصوت يخرج من الأنف.','لا تنطق g ظاهرة في آخر الكلمة: sing تنتهي بصوت أنفي، وليست «سينج».'),
C('l','al','ap',1,['[l]eg','ye[ll]ow','ba[ll]'],'l, ll','ضع طرف اللسان على اللثة واترك الهواء يمر من جانبيه.','في آخر الكلمة تصبح أثقل (dark L) كما في ball وfeel، فيرتفع مؤخر اللسان قليلًا.'),
C('r','rr','ap',1,['[r]ed','ca[rr]ot','[wr]ite'],'r, rr, wr','اثنِ طرف اللسان للخلف قليلًا دون أن يلمس سقف الفم، ودوّر الشفتين قليلًا.','ليست راءً عربية مكررة: اللسان لا يرفرف ولا يلمس شيئًا. وفي اللهجة البريطانية لا تُنطق r بعد الحرف المتحرك (car).'),
C('w','bl','ap',1,['[w]et','[o]ne','[wh]en'],'w, wh, o','دوّر شفتيك بقوة كأنك ستنطق u، ثم افتحهما بسرعة نحو الحرف التالي.','مثل الواو العربية. لا تنطقها v: wine غير vine.'),
C('j','pl','ap',1,['[y]es','[u]se','[y]ellow'],'y, u','ارفع وسط اللسان قريبًا من سقف الفم الصلب، ثم انزلق إلى الحرف التالي.','مثل الياء العربية، وكثيرًا ما تختبئ قبل u كما في use وmusic.'),
V('iː','hi','f','spread',['s[ee]','[ea]t','k[ey]'],'ee, ea, e, ey, ie','ارفع مقدمة اللسان عاليًا، ابتسم قليلًا، وأطل الصوت.','ياء ممدودة. علامة ː في الرمز تعني أن الصوت طويل.'),
V('ɪ','nhi','f','neutral',['s[i]t','g[y]m','b[u]sy'],'i, y','مثل iː لكن أقصر وأرخى، واللسان أقل ارتفاعًا والشفتان مرتاحتان.','الفرق بين ship وsheep في الطول والشد: ɪ قصيرة ومرتخية.'),
V('e','mid','f','spread',['b[e]d','h[ea]d','[a]ny'],'e, ea','افتح الفم قليلًا أكثر من ɪ، واللسان أمامي في المنتصف.','قريب من الإمالة في «بيت» بالعامية المصرية لكن أقصر.'),
V('æ','low','f','open',['c[a]t','bl[a]ck','h[a]nd'],'a','افتح الفك جيدًا وابسط اللسان في قاع الفم مع إبقائه أماميًا.','افتح فمك أكثر من e: bad غير bed. صوت بين الفتحة والإمالة.'),
V('ʌ','lmid','c','neutral',['c[u]p','l[o]ve','m[o]ney'],'u, o, ou','صوت قصير، الفم نصف مفتوح واللسان مرتاح في الوسط.','مثل الفتحة القصيرة في «أَ». حرف u هنا لا يُنطق ضمة.'),
V('ɑː','low','b','open',['c[a]r','f[a]ther','p[a]lm'],'ar, a','افتح فمك واسعًا وأنزل مؤخرة اللسان، وأطل الصوت.','ألف ممدودة مفخّمة قليلًا كما في «باب».'),
V('ɒ','low','b','round',['h[o]t','w[a]nt','d[o]g'],'o, a','صوت قصير، الفم مفتوح واسعًا مع تدوير خفيف للشفتين.','بريطاني. في الأمريكية يُنطق غالبًا ɑ، فتسمع hot قريبة من «هات».'),
V('ɔː','lmid','b','round',['s[aw]','d[oor]','t[a]lk'],'aw, or, al, au','دوّر شفتيك وارفع مؤخرة اللسان قليلًا، وأطل الصوت.','مثل «أوو» مفتوحة. وانتبه: l صامتة في talk وwalk.'),
V('ʊ','nhi','b','round',['b[oo]k','p[u]t','c[ou]ld'],'oo, u, ou','ضمة قصيرة مرتخية، والشفتان مدورتان قليلًا.','أقصر من uː: full غير fool.'),
V('uː','hi','b','round',['f[oo]d','bl[ue]','tw[o]'],'oo, ue, o, ew','دوّر شفتيك وادفعهما للأمام، وارفع مؤخرة اللسان عاليًا، وأطل الصوت.','واو ممدودة مثل «يوم».'),
V('ɜː','mid','c','neutral',['b[ir]d','w[or]k','l[ear]n'],'ir, er, ur, or, ear','اللسان مرتاح في منتصف الفم والشفتان محايدتان، وأطل الصوت.','لا مقابل له في العربية. لا تنطقه «إر» ولا «أُر».'),
V('ə','mid','c','neutral',['[a]bout','sof[a]','teach[er]'],'أي حرف متحرك','أكثر الأصوات استرخاءً: لا تحرّك شيئًا تقريبًا، صوت قصير جدًا كالهمهمة.','أكثر صوت شيوعًا في الإنجليزية، ويظهر في المقاطع غير المنبورة. إتقانه يجعل كلامك طبيعيًا.'),
D('eɪ',['e','ɪ'],['d[ay]','r[ai]n','m[a]ke'],'a, ai, ay, ey','ابدأ بـ e وانزلق نحو ɪ في حركة واحدة.','مثل «إي» مع انزلاق خفيف.'),
D('aɪ',['a','ɪ'],['m[y]','t[i]me','h[igh]'],'i, y, igh, ie','ابدأ بفم مفتوح «آ» وانزلق إلى ɪ.','مثل «آي».'),
D('ɔɪ',['ɔː','ɪ'],['b[oy]','c[oi]n','n[oi]se'],'oy, oi','ابدأ بشفتين مدورتين ثم انزلق إلى ɪ مع فرد الشفتين.','مثل «أوي».'),
D('aʊ',['a','ʊ'],['n[ow]','h[ou]se','[ou]t'],'ow, ou','ابدأ بفم مفتوح «آ» ثم دوّر شفتيك نحو ʊ.','مثل «آو».'),
D('əʊ',['ə','ʊ'],['g[o]','h[o]me','sh[ow]'],'o, oa, ow','ابدأ بـ ə المرتخية ثم دوّر شفتيك نحو ʊ.','في الأمريكية يُكتب oʊ ويبدأ أكثر استدارة. لا تنطقه «أو» ثابتة.'),
D('ɪə',['ɪ','ə'],['n[ear]','h[ere]','id[ea]'],'ear, eer, ere','ابدأ بـ ɪ ثم استرخِ نحو ə.','بريطاني غالبًا. في الأمريكية تظهر r واضحة.'),
D('eə',['e','ə'],['h[air]','c[are]','th[ere]'],'air, are, ere','ابدأ بـ e ثم استرخِ نحو ə.','بريطاني. في الأمريكية: e ثم r.'),
D('ʊə',['ʊ','ə'],['t[our]','p[ure]','c[ure]'],'our, ure','ابدأ بـ ʊ ثم استرخِ نحو ə.','أصبح نادرًا، وكثيرون ينطقونه ɔː.'),
];
const VMAP={};S.filter(s=>s.g==='v').forEach(s=>VMAP[s.i]=s);VMAP.a={h:'low',b:'c',l:'open'};
const exHtml=e=>esc(e).replace(/\[(.+?)\]/g,'<span class="hl">$1</span>');
const exText=e=>e.replace(/[\[\]]/g,'');

/* ---------- mouth diagram ---------- */
const REST={T:[70,178],D:[140,150],B:[218,175],UF:[38,104],LF:[38,128],vel:0};
function vowelState(v){
  const X={f:118,c:150,b:182}[v.b],Y={hi:106,nhi:115,mid:127,lmid:139,low:153}[v.h];
  const s={T:v.b==='f'?[66,164]:[72,178],D:[X,Y],B:v.b==='b'&&(v.h==='hi'||v.h==='nhi')?[222,160]:[218,175],vel:0};
  const open=v.h==='low'?140:v.h==='lmid'?134:128;
  s.UF=v.l==='spread'?[42,105]:v.l==='round'?[27,107]:[38,104];
  s.LF=v.l==='spread'?[42,Math.max(124,open-4)]:v.l==='round'?[28,Math.max(122,open-6)]:[39,open];
  return s;
}
function stateFor(p){
  if(p.g==='v')return vowelState(p);
  const s={...REST,T:[...REST.T],D:[...REST.D],B:[...REST.B],UF:[...REST.UF],LF:[...REST.LF],vel:p.m==='na'?1:0,contact:null};
  const fr=p.m==='fr';
  switch(p.pl){
    case 'bl': if(p.m==='ap'){s.UF=[26,109];s.LF=[26,121];s.D=[182,112];s.B=[222,160]}else{s.UF=[36,113];s.LF=[36,117];s.contact=[34,115]}break;
    case 'ld': s.LF=[54,111];s.contact=[56,110];break;
    case 'dn': s.T=[52,118];s.D=[128,142];s.contact=[56,117];break;
    case 'al': s.T=fr?[82,111]:[82,106];s.D=[132,140];s.contact=[82,101];break;
    case 'pa': s.T=fr?[95,104]:[95,99];s.D=[135,116];s.UF=[31,106];s.LF=[31,125];s.contact=[95,94];break;
    case 'rr': s.T=[102,114];s.D=[150,140];s.UF=[33,105];s.LF=[33,124];break;
    case 'pl': s.D=[128,100];s.T=[68,166];break;
    case 've': s.D=[186,100];s.T=[72,182];s.B=[222,168];s.contact=[186,96];break;
    case 'gl': s.LF=[38,134];s.contact=[228,244];break;
  }
  return s;
}
const L=(a,b,t)=>a+(b-a)*t;
function mix(a,b,t){const o={};for(const k of ['T','D','B','UF','LF'])o[k]=[L(a[k][0],b[k][0],t),L(a[k][1],b[k][1],t)];o.vel=L(a.vel,b.vel,t);return o}
function paths(s){
  const [Tx,Ty]=s.T,[Dx,Dy]=s.D,[Bx,By]=s.B,[ux,uy]=s.UF,[lx,ly]=s.LF;
  const f=n=>n.toFixed(1);
  const tongue=`M64 214 C56 204,${f(Tx-6)} ${f(Ty+12)},${f(Tx)} ${f(Ty)} C${f(Tx+14)} ${f(Ty-8)},${f(Dx-34)} ${f(Dy)},${f(Dx)} ${f(Dy)} C${f(Dx+30)} ${f(Dy)},${f(Bx-4)} ${f(By-18)},${f(Bx)} ${f(By)} C${f(Bx+6)} ${f(By+28)},226 228,226 248 L64 248 Z`;
  const ulip=`M56 86 C48 88,${f(ux-2)} ${f(uy-12)},${f(ux)} ${f(uy)} C${f(ux+6)} ${f(uy+3)},56 ${f(uy+2)},62 ${f(uy+1)} L62 98 Z`;
  const llip=`M62 ${f(ly-1)} C54 ${f(ly-2)},${f(lx+4)} ${f(ly-3)},${f(lx)} ${f(ly)} C${f(lx-1)} ${f(ly+10)},52 ${f(ly+16)},62 ${f(ly+14)} Z`;
  const chin=`M58 ${f(ly+14)} C40 ${f(ly+30)},42 ${f(ly+58)},74 ${f(ly+64)} C94 ${f(ly+80)},104 226,112 258`;
  const lt=ly-6;const lteeth=`M55 ${f(lt)} Q59 ${f(lt-3)} 62 ${f(lt)} L62 ${f(lt+13)} L56 ${f(lt+13)} Z`;
  const v=s.vel;const velum=`M172 90 Q${f(L(200,196,v))} ${f(L(98,114,v))} ${f(L(214,204,v))} ${f(L(120,146,v))}`;
  const my=(uy+ly)/2;
  const oral=`M224 240 C226 170,214 140,${f(Dx)} ${f(Math.min(Dy-14,132))} S90 ${f(my)} ${f(Math.min(ux,lx)-4)} ${f(my)} L2 ${f(my)}`;
  const nasal=`M224 240 C228 160,224 120,210 96 S150 70,100 70 S50 68,28 72 L4 74`;
  return {tongue,ulip,llip,chin,lteeth,velum,oral,nasal,uvula:[L(214,204,v),L(120,146,v)]};
}
function diagramSVG(){
  return `<svg viewBox="0 0 260 262" role="img" aria-label="رسم جانبي للفم واللسان">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--air)"/></marker></defs>
  <path d="M84 4 C70 30,40 50,26 62 C22 68,30 76,44 78 C50 80,54 82,56 86" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M62 70 Q140 50 222 64 L232 84" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M232 84 C238 140,236 200,236 260" fill="none" stroke="var(--ink)" stroke-width="2.2"/>
  <path id="g-air-o" fill="none" stroke="var(--air)" stroke-width="2.5" stroke-dasharray="6 6" marker-end="url(#arr)" opacity="0"/>
  <path id="g-air-n" fill="none" stroke="var(--air)" stroke-width="2.5" stroke-dasharray="6 6" marker-end="url(#arr)" opacity="0"/>
  <path id="g-tongue" fill="var(--tongue-soft)" stroke="var(--tongue)" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M62 98 Q74 96 80 102 Q88 90 120 86 Q160 84 172 90" fill="none" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round"/>
  <path id="g-velum" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
  <circle id="g-uvula" r="3.5" fill="var(--ink)"/>
  <path d="M54 97 L62 97 L62 110 Q58 114 54 111 Z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6"/>
  <path id="g-lteeth" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6"/>
  <path id="g-ulip" fill="var(--tongue-soft)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
  <path id="g-llip" fill="var(--tongue-soft)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
  <path id="g-chin" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>
  <g id="g-contact" opacity="0"><circle r="11" fill="var(--voice)" opacity=".25"><animate attributeName="r" values="7;13;7" dur="1.4s" repeatCount="indefinite"/></circle><circle r="4.5" fill="var(--voice)"/></g>
  <text x="140" y="80" font-size="10" fill="var(--muted)" text-anchor="middle" font-family="var(--f-body)">تجويف الأنف</text>
  <text x="122" y="232" font-size="10" fill="var(--tongue)" text-anchor="middle" font-family="var(--f-body)">اللسان</text>
  <text x="248" y="160" font-size="10" fill="var(--muted)" text-anchor="middle" font-family="var(--f-body)" transform="rotate(90 248 160)">الحلق</text>
  </svg>`;
}
let anim=0;
function draw(s,p){
  const P=paths(s);
  ['tongue','ulip','llip','chin','lteeth','velum'].forEach(k=>{const e=document.getElementById('g-'+k);if(e)e.setAttribute('d',P[k])});
  const u=document.getElementById('g-uvula');if(u){u.setAttribute('cx',P.uvula[0]);u.setAttribute('cy',P.uvula[1])}
  const ao=document.getElementById('g-air-o'),an=document.getElementById('g-air-n');
  if(ao){ao.setAttribute('d',P.oral);an.setAttribute('d',P.nasal)}
}
function showAir(p,on){
  const ao=document.getElementById('g-air-o'),an=document.getElementById('g-air-n'),ct=document.getElementById('g-contact');
  if(!ao)return;const nasal=p.m==='na';
  ao.setAttribute('opacity',on&&!nasal?1:0);an.setAttribute('opacity',on&&nasal?1:0);
  [ao,an].forEach(e=>e.style.animation=on?'dash 1s linear infinite':'none');
  const s=p.g==='d'?null:stateFor(p);
  if(s&&s.contact&&on){ct.setAttribute('transform',`translate(${s.contact[0]} ${s.contact[1]})`);ct.setAttribute('opacity',1)}else ct.setAttribute('opacity',0);
}
function tween(a,b,ms){return new Promise(res=>{const id=++anim;const t0=performance.now();const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduce){draw(b);res();return}
  const step=now=>{if(id!==anim)return res();const t=Math.min(1,(now-t0)/ms);draw(mix(a,b,ease(t)));if(t<1)requestAnimationFrame(step);else res()};requestAnimationFrame(step)})}
async function playMotion(p){
  showAir(p,false);
  if(p.g==='d'){const a=vowelState(VMAP[p.d[0]]),b=vowelState(VMAP[p.d[1]]);await tween(REST,a,600);showAir(p,true);await sleep(250);await tween(a,b,700)}
  else{await tween(REST,stateFor(p),700);showAir(p,true)}
}
const styleEl=document.createElement('style');styleEl.textContent='@keyframes dash{to{stroke-dashoffset:-24}}';document.head.appendChild(styleEl);

/* ---------- sounds view ---------- */
let sg='c';
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{sg=b.dataset.g;document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderGrid()});
function renderGrid(){
  const weak=LS.get('weak',{});
  $('#s-grid').innerHTML=S.filter(s=>s.g===sg).map(s=>`<button class="tile ${weak[s.i]?'weak':''}" data-i="${esc(s.i)}"><span class="ipa">${esc(s.i)}</span><span class="en">${exHtml(s.ex[0])}</span></button>`).join('');
  $('#s-grid').querySelectorAll('.tile').forEach(b=>b.onclick=()=>openSound(b.dataset.i));
}
function openSound(sym){
  stopAll();const p=S.find(s=>s.i===sym);if(!p)return;
  showView('sounds');
  $('#s-list').hidden=true;const d=$('#s-detail');d.hidden=false;
  let tags='';
  if(p.g==='c'){tags=`<span class="tag">${PL[p.pl]}</span><span class="tag">${MN[p.m]}</span><span class="tag ${p.v?'voiced':''}">${p.v?'مجهور: الأحبال تهتز':'مهموس: بلا اهتزاز'}</span><span class="tag ${p.m==='na'?'nasal':'oral'}">${p.m==='na'?'الهواء من الأنف':'الهواء من الفم'}</span>`}
  else if(p.g==='v'){tags=`<span class="tag">${HT[p.h]}</span><span class="tag">${BK[p.b]}</span><span class="tag">${p.i.includes('ː')?'طويل':'قصير'}</span><span class="tag">${{spread:'شفتان مفرودتان',round:'شفتان مدوّرتان',open:'فم مفتوح',neutral:'شفتان مرتاحتان'}[p.l]}</span><span class="tag voiced">مجهور</span>`}
  else{tags=`<span class="tag">صوت مزدوج: من <span class="ipa">${esc(p.d[0]==='a'?'a':p.d[0])}</span> إلى <span class="ipa">${esc(p.d[1])}</span></span><span class="tag voiced">مجهور</span>`}
  const voiced=p.g!=='c'||p.v;
  d.innerHTML=`<button class="back" id="s-back">‹ كل الأصوات</button>
  <div class="panel">
    <div class="sound-head"><div class="sound-sym">${esc(p.i)}</div><div class="tags">${tags}</div></div>
    <div class="diagram-wrap">${diagramSVG()}
      <div class="legend"><span><i style="background:var(--tongue)"></i>اللسان</span><span><i style="background:var(--air)"></i>مسار الهواء</span><span><i style="background:var(--voice)"></i>نقطة التلامس</span><span><svg class="folds ${voiced?'vib':''}" viewBox="0 0 34 12"><path d="${voiced?'M1 6 Q5 1 9 6 T17 6 T25 6 T33 6':'M1 6 H33'}"/></svg>${voiced?'الأحبال تهتز':'الأحبال ساكنة'}</span></div>
      <div class="diagram-ctrl"><button class="btn small" id="s-motion">شاهد الحركة</button><button class="btn small ghost" id="s-hear">استمع في كلمة</button></div>
    </div>
    <div class="how"><h3>كيف تنطقه</h3><p>${esc(p.how)}</p><h3>تنبيه للمتحدث العربي</h3><p>${esc(p.tip)}</p><h3>يُكتب غالبًا</h3><p class="en" style="text-align:right">${esc(p.sp)}</p></div>
    <h3 style="font-size:17px;color:var(--accent);margin-bottom:8px">أمثلة: اضغط لتسمع</h3>
    <div class="exrow" id="s-ex">${p.ex.map((e,i)=>`<button class="exbtn" data-i="${i}">${exHtml(e)}</button>`).join('')}</div>
    <button class="btn wide" id="s-repeat" style="width:100%;margin-top:12px">كرّر بعدي</button>
    <div class="cue" id="s-cue" aria-live="polite"></div>
  </div>`;
  $('#s-back').onclick=()=>{stopAll();anim++;d.hidden=true;$('#s-list').hidden=false;renderGrid()};
  const first=p.g==='d'?vowelState(VMAP[p.d[0]]):REST;draw(first);
  setTimeout(()=>playMotion(p),250);
  $('#s-motion').onclick=()=>{draw(REST);playMotion(p)};
  $('#s-hear').onclick=()=>{stopAll();speak(exText(p.ex[0]),Math.min(st.speed,0.75))};
  d.querySelectorAll('.exbtn').forEach(b=>b.onclick=async()=>{stopAll();b.classList.add('live');await speak(exText(p.ex[+b.dataset.i]),st.speed);b.classList.remove('live')});
  $('#s-repeat').onclick=async()=>{
    stopAll();const id=runId;const bs=[...d.querySelectorAll('.exbtn')];
    for(let i=0;i<p.ex.length;i++){if(id!==runId)return;bs.forEach(x=>x.classList.remove('live'));bs[i].classList.add('live');$('#s-cue').textContent='استمع';await speak(exText(p.ex[i]),Math.min(st.speed,0.75));if(id!==runId)return;$('#s-cue').textContent='ردّد';await sleep(1500)}
    if(id===runId){bs.forEach(x=>x.classList.remove('live'));$('#s-cue').textContent='أحسنت';logPractice()}
  };
  window.scrollTo({top:0,behavior:'smooth'});
}
renderGrid();

/* ---------- minimal pairs ---------- */
const PAIRS=[
 {a:'p',b:'b',w:[['pat','bat'],['pin','bin'],['pig','big'],['pear','bear'],['cap','cab'],['pack','back']]},
 {a:'f',b:'v',w:[['fan','van'],['fine','vine'],['few','view'],['safe','save'],['leaf','leave'],['fast','vast']]},
 {a:'ɪ',b:'iː',w:[['ship','sheep'],['sit','seat'],['live','leave'],['fill','feel'],['bit','beat'],['hit','heat']]},
 {a:'e',b:'æ',w:[['bed','bad'],['pen','pan'],['men','man'],['said','sad'],['set','sat'],['head','had']]},
 {a:'θ',b:'s',w:[['think','sink'],['thin','sin'],['path','pass'],['mouth','mouse'],['thank','sank'],['thick','sick']]},
 {a:'ð',b:'z',w:[['then','zen'],['breathe','breeze'],['clothing','closing'],['bathe','bays']]},
 {a:'ʃ',b:'tʃ',w:[['ship','chip'],['shoe','chew'],['wash','watch'],['share','chair'],['cash','catch'],['sheep','cheap']]},
 {a:'l',b:'r',w:[['light','right'],['lead','read'],['long','wrong'],['fly','fry'],['glass','grass'],['collect','correct']]},
 {a:'ʊ',b:'uː',w:[['full','fool'],['pull','pool'],['look','Luke'],['should','shoed']]},
 {a:'s',b:'z',w:[['price','prize'],['bus','buzz'],['sip','zip'],['peace','peas'],['loose','lose']]},
 {a:'w',b:'v',w:[['wine','vine'],['west','vest'],['wet','vet'],['while','vile']]},
];
let pg=-1,q=null,score={ok:0,no:0};
function renderGroups(){
  $('#p-groups').innerHTML=`<button data-g="-1" aria-pressed="${pg===-1}">الكل</button>`+PAIRS.map((p,i)=>`<button data-g="${i}" aria-pressed="${pg===i}"><span class="ipa">${esc(p.a)}</span> / <span class="ipa">${esc(p.b)}</span></button>`).join('');
  $('#p-groups').querySelectorAll('button').forEach(b=>b.onclick=()=>{pg=+b.dataset.g;renderGroups();newQ()});
}
function newQ(){
  stopAll();const gi=pg>=0?pg:Math.floor(Math.random()*PAIRS.length);const g=PAIRS[gi];
  const pair=g.w[Math.floor(Math.random()*g.w.length)];const k=Math.random()<.5?0:1;
  q={g,pair,k,done:false};
  $('#p-choices').innerHTML=pair.map((w,i)=>`<button class="choice" data-i="${i}"><span class="en">${esc(w)}</span><span class="ipa">${esc(i?g.b:g.a)}</span></button>`).join('');
  $('#p-choices').querySelectorAll('.choice').forEach(b=>b.onclick=()=>answer(+b.dataset.i,b));
  $('#p-fb').textContent='اضغط زر التشغيل للاستماع';$('#p-fb').style.color='var(--muted)';
}
function answer(i,btn){
  if(!q||q.done)return;q.done=true;const ok=i===q.k;const s=LS.get('stats',{days:[],words:{},pairs:0});
  const cs=$('#p-choices').querySelectorAll('.choice');cs[q.k].classList.add('right');if(!ok)btn.classList.add('wrong');
  if(ok){score.ok++;s.pairs=(s.pairs||0)+1;$('#p-fb').textContent='صحيح!';$('#p-fb').style.color='var(--good)'}
  else{score.no++;const sym=q.k?q.g.b:q.g.a;const w=LS.get('weak',{});w[sym]=(w[sym]||0)+1;LS.set('weak',w);$('#p-fb').textContent=`الصحيح: ${q.pair[q.k]}`;$('#p-fb').style.color='var(--bad)'}
  if(!s.days.includes(today()))s.days.push(today());LS.set('stats',s);
  $('#p-ok').textContent=score.ok;$('#p-no').textContent=score.no;
}
$('#p-play').onclick=()=>{if(!q)newQ();stopAll();speak(q.pair[q.k],st.speed)};
$('#p-slow').onclick=()=>{if(!q)newQ();stopAll();speak(q.pair[q.k],0.55)};
$('#p-next').onclick=()=>{newQ();speak(q.pair[q.k],st.speed)};
renderGroups();newQ();

/* ---------- mine ---------- */
function streak(days){let n=0;const d=new Date();for(;;){const k=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();if(days.includes(k)){n++;d.setDate(d.getDate()-1)}else if(n===0&&k===today()){d.setDate(d.getDate()-1);if(!days.includes(d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()))break}else break}return n}
function renderMine(){
  const s=LS.get('stats',{days:[],words:{},pairs:0});
  $('#st-streak').textContent=streak(s.days||[]);$('#st-words').textContent=Object.keys(s.words||{}).length;$('#st-pairs').textContent=s.pairs||0;$('#st-talks').textContent=s.talks||0;
  const sv=LS.get('saved',[]);
  $('#saved').innerHTML=sv.length?sv.map((x,i)=>`<li><button class="iconbtn" data-play="${i}" aria-label="استمع">${PLAY}</button><div class="w"><b>${esc(x.word)}</b><small><span class="ipa">${esc(x.ipa)}</span> ${esc(x.ar)}</small></div><button class="btn small ghost" data-open="${i}">تدرّب</button><button class="btn small ghost" data-del="${i}" aria-label="احذف">حذف</button></li>`).join(''):'<li class="empty">احفظ الكلمات الصعبة من شاشة الكلمات لتجدها هنا.</li>';
  $('#saved').querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>{stopAll();speak(sv[+b.dataset.play].word,st.speed)});
  $('#saved').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const x=sv[+b.dataset.open];showView('words');$('#q').value=x.word;choose({word:x.word,ar:x.ar})});
  $('#saved').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{sv.splice(+b.dataset.del,1);LS.set('saved',sv);renderMine()});
  const w=LS.get('weak',{});const ks=Object.keys(w).sort((a,b)=>w[b]-w[a]);
  $('#weak').innerHTML=ks.length?ks.map(k=>`<button class="exbtn ipa" data-s="${esc(k)}">${esc(k)} <small style="font-size:12px;color:var(--muted)">×${w[k]}</small></button>`).join(''):'<span class="hint">لا توجد أصوات ضعيفة بعد. جرّب تمرين الأزواج.</span>';
  $('#weak').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{sg=(S.find(s=>s.i===b.dataset.s)||{}).g||'c';document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.g===sg));openSound(b.dataset.s)});
}

/* ---------- autocomplete ---------- */
let WL=null;function getWL(){if(WL)return WL;const s=DICT,n=s.length,out=[];let prev='',i=0;while(i<n){const k=parseInt(s[i],36);i++;let j=i;while(j<n&&s.charCodeAt(j)>=97)j++;const w=prev.slice(0,k)+s.slice(i,j);out.push(w);prev=w;i=j}WL=out;return WL}const CR=new Map(CORE.split(' ').map((w,i)=>[w,i]));
const rk=w=>CR.has(w)?CR.get(w):1e6;
const rankSort=(a,b)=>(rk(a)-rk(b))||(a.length-b.length)||(a<b?-1:1);
function lb(p){let lo=0,hi=WL.length;while(lo<hi){const m=(lo+hi)>>1;if(WL[m]<p)lo=m+1;else hi=m}return lo}
function osa(a,b){const m=a.length,n=b.length;const d=[];for(let i=0;i<=m;i++){d[i]=[i];for(let j=1;j<=n;j++)d[i][j]=i?0:j}
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)}return d[m][n]}
function subseq(q,w){let i=0;for(const c of w){if(c===q[i])i++;if(i===q.length)return true}return false}
function complete(raw){getWL();
  const q=raw.toLowerCase().replace(/[^a-z]/g,'');if(!q)return {q,list:[],fuzzy:false};
  const range=[];for(let j=lb(q);j<WL.length&&WL[j].startsWith(q);j++)range.push(WL[j]);
  let list=(q.length===1?range.filter(w=>CR.has(w)):range).sort(rankSort).slice(0,8);
  let fuzzy=false;
  if(list.length<4&&q.length>=3){
    const max=q.length>=6?2:1;const cand=[];
    for(let j=lb(q[0]);j<WL.length&&WL[j][0]===q[0];j++){const w=WL[j];if(w.length<q.length-1||list.includes(w))continue;
      const dd=Math.min(osa(q,w.slice(0,q.length)),osa(q,w));if(dd<=max)cand.push([dd,w,subseq(q,w)?0:1])}
    cand.sort((a,b)=>(a[0]-b[0])||(rk(a[1])<1e6||rk(b[1])<1e6?rankSort(a[1],b[1]):(a[2]-b[2])||rankSort(a[1],b[1])));
    const extra=cand.slice(0,8-list.length).map(c=>c[1]);if(extra.length)fuzzy=true;list=list.concat(extra);
  }
  return {q,list,fuzzy};
}
let acItems=[],acIdx=-1,acT=0;
function renderAC(){
  const r=complete($('#q').value);const ul=$('#ac');acItems=r.list;acIdx=-1;
  if(!r.q){ul.hidden=true;$('#q').setAttribute('aria-expanded','false');return}
  ul.innerHTML=r.list.map((w,i)=>{const pre=w.startsWith(r.q)?`<b>${esc(r.q)}</b>${esc(w.slice(r.q.length))}`:esc(w);
    return `<li><button role="option" data-i="${i}" tabindex="-1">${pre}${!w.startsWith(r.q)?'<small>تصحيح</small>':''}</button></li>`}).join('')+
    `<li class="more"><button data-more="1" tabindex="-1">${r.list.length?'لم تجد كلمتك؟ صحّح بالذكاء الاصطناعي':'لا توجد كلمات مطابقة. صحّح بالذكاء الاصطناعي'}</button></li>`;
  ul.hidden=false;$('#q').setAttribute('aria-expanded','true');
  ul.querySelectorAll('button').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>b.dataset.more?(hideAC(),suggest()):pickAC(acItems[+b.dataset.i])});
}
function hideAC(){$('#ac').hidden=true;$('#q').setAttribute('aria-expanded','false');acIdx=-1}
function pickAC(w){$('#q').value=w;hideAC();$('#sugs').innerHTML='';$('#status').textContent='';$('#q').blur();choose({word:w,ar:''})}
function moveAC(d){const bs=[...$('#ac').querySelectorAll('li:not(.more) button')];if(!bs.length)return;acIdx=(acIdx+d+bs.length)%bs.length;bs.forEach((b,i)=>b.classList.toggle('on',i===acIdx));bs[acIdx].scrollIntoView({block:'nearest'})}
$('#q').addEventListener('input',()=>{clearTimeout(acT);acT=setTimeout(renderAC,60)});
$('#q').addEventListener('input',()=>{$('#go').textContent=/[\u0600-\u06FF]/.test($('#q').value)?'ترجم':'صحّح'});
$('#q').addEventListener('focus',()=>{if($('#q').value)renderAC()});
$('#q').addEventListener('blur',()=>setTimeout(hideAC,150));
$('#q').addEventListener('keydown',e=>{
  const open=!$('#ac').hidden;
  if(e.key==='ArrowDown'&&open){e.preventDefault();moveAC(1)}
  else if(e.key==='ArrowUp'&&open){e.preventDefault();moveAC(-1)}
  else if(e.key==='Escape'){hideAC()}
  else if(e.key==='Enter'){e.preventDefault();if(open&&acIdx>=0)pickAC(acItems[acIdx]);else{hideAC();suggest()}}
});

/* ---------- talk ---------- */
const SCEN=[
 {id:'restaurant',g:'الحياة اليومية',ar:'في المطعم',en:'The learner is a customer ordering food at a restaurant. You are the friendly waiter.'},
 {id:'shop',g:'الحياة اليومية',ar:'التسوّق',en:'The learner is shopping for clothes. You are the shop assistant.'},
 {id:'doctor',g:'الحياة اليومية',ar:'عند الطبيب',en:'The learner is a patient visiting a doctor. You are the doctor asking about how they feel.'},
 {id:'hotel',g:'الحياة اليومية',ar:'في الفندق',en:'The learner is a guest checking in at a hotel. You are the receptionist.'},
 {id:'airport',g:'الحياة اليومية',ar:'في المطار',en:'The learner is a passenger checking in for a flight. You are the airline check-in agent.'},
 {id:'interview',g:'العمل',ar:'مقابلة عمل',en:'The learner is a candidate in a job interview. You are the interviewer.'},
 {id:'meeting',g:'العمل',ar:'اجتماع عمل',en:'The learner is in a work meeting planning a new project. You are a colleague.'},
 {id:'client',g:'العمل',ar:'مكالمة مع عميل',en:'The learner works for a company and receives a phone call. You are a client with a polite complaint.'},
 {id:'customs',g:'الجمارك واللوجستيات',ar:'تخليص جمركي',en:'The learner is a customs officer at a seaport. You are a customs broker asking about clearing an import shipment (documents, inspection, duties).'},
 {id:'shipping',g:'الجمارك واللوجستيات',ar:'تفاوض مع شركة شحن',en:'The learner is an importer negotiating freight rates and transit times. You are the sales manager of a shipping line.'},
 {id:'delay',g:'الجمارك واللوجستيات',ar:'شحنة متأخرة',en:'The learner is a customer asking about a delayed shipment. You are the logistics company customer service agent.'},
 {id:'free',g:'حر',ar:'حديث حر',en:null},
];
const LV=[['A1','مبتدئ','Use only very simple, very common words and the present tense. Sentences of 3-8 words.'],['A2','أساسي','Use simple everyday words and short sentences.'],['B1','متوسط','Use everyday vocabulary with some variety and moderate sentence length.'],['B2','فوق المتوسط','Use natural, varied language, including common phrasal verbs and idioms.'],['C1','متقدم','Use rich, natural, native-like language.']];
const SCRIPTS={"restaurant": [["Good evening! Welcome to our restaurant. A table for how many?", "مساء الخير! أهلًا بك في مطعمنا. طاولة لكم شخص؟", ["A table for two, please.", "Just one, please.", "Do you have a table by the window?"]], ["Here is the menu. Can I get you something to drink first?", "تفضل قائمة الطعام. هل أحضر لك مشروبًا أولًا؟", ["Water, please.", "I'd like an orange juice.", "Just a coffee, thank you."]], ["Are you ready to order?", "هل أنت مستعد للطلب؟", ["Yes, I'd like the grilled fish, please.", "What do you recommend?", "Can I have a few more minutes?"]], ["Would you like anything else? Maybe a dessert?", "هل تريد شيئًا آخر؟ ربما حلوى؟", ["No, thank you. Can I have the bill, please?", "Yes, a piece of chocolate cake.", "Just the bill, please."]]], "shop": [["Hi there! Can I help you find something?", "مرحبًا! هل أساعدك في إيجاد شيء؟", ["I'm looking for a shirt.", "I'm just looking, thanks.", "Do you have this in blue?"]], ["What size are you looking for?", "ما المقاس الذي تبحث عنه؟", ["Medium, please.", "I think I'm a large.", "I'm not sure. Can I try it on?"]], ["The fitting rooms are over there. How does it fit?", "غرف القياس هناك. كيف المقاس عليك؟", ["It fits perfectly.", "It's a bit too small.", "Do you have a bigger size?"]], ["Great! Will you pay by cash or card?", "رائع! هل ستدفع نقدًا أم بالبطاقة؟", ["By card, please.", "Cash.", "Can I get a receipt, please?"]]], "doctor": [["Good morning. Please have a seat. What seems to be the problem?", "صباح الخير. تفضل بالجلوس. ما المشكلة؟", ["I have a headache.", "I've had a sore throat for three days.", "I don't feel well."]], ["I see. When did it start?", "فهمت. متى بدأ ذلك؟", ["It started yesterday.", "About three days ago.", "Last week."]], ["Do you have a fever or any other symptoms?", "هل عندك حرارة أو أعراض أخرى؟", ["Yes, I have a slight fever.", "No, just the pain.", "I also feel very tired."]], ["I'll give you a prescription. Take one tablet twice a day after meals.", "سأكتب لك وصفة. تناول قرصًا مرتين يوميًا بعد الأكل.", ["Thank you, doctor.", "For how many days?", "Should I come back for a check-up?"]]], "hotel": [["Good afternoon and welcome! Do you have a reservation?", "مساء الخير وأهلًا بك! هل لديك حجز؟", ["Yes, under the name Ahmed.", "No. Do you have any rooms available?", "I booked online last week."]], ["May I see your passport, please?", "هل يمكنني رؤية جواز سفرك من فضلك؟", ["Sure, here you are.", "Of course.", "Is an ID card OK?"]], ["Your room is on the fifth floor. Breakfast is from seven to ten.", "غرفتك في الطابق الخامس. الإفطار من السابعة إلى العاشرة.", ["What time is check-out?", "Is there Wi-Fi in the room?", "Thank you very much."]], ["Check-out is at twelve. Is there anything else I can help you with?", "موعد المغادرة الساعة الثانية عشرة. هل أساعدك في شيء آخر؟", ["Could I have a wake-up call at seven?", "No, that's all. Thank you.", "Where is the nearest pharmacy?"]]], "airport": [["Good morning. Where are you flying today?", "صباح الخير. إلى أين تسافر اليوم؟", ["I'm flying to London.", "To Dubai, please.", "Here is my ticket."]], ["Can I see your passport and ticket, please?", "هل يمكنني رؤية جواز السفر والتذكرة من فضلك؟", ["Here you are.", "Sure. Here's my booking reference.", "Of course."]], ["How many bags are you checking in?", "كم حقيبة ستشحن؟", ["Just one bag.", "Two bags, please.", "Only hand luggage."]], ["Would you like a window seat or an aisle seat?", "هل تفضل مقعدًا بجوار النافذة أم بجوار الممر؟", ["A window seat, please.", "An aisle seat, please.", "It doesn't matter."]]], "interview": [["Thank you for coming. Could you tell me a little about yourself?", "شكرًا لحضورك. هل تحدثني قليلًا عن نفسك؟", ["I have ten years of experience in logistics.", "I graduated in business administration.", "I'm a team leader who enjoys solving problems."]], ["Why do you want to work for our company?", "لماذا تريد العمل في شركتنا؟", ["Your company is a leader in this field.", "I want to develop my skills.", "I believe I can add value to your team."]], ["What is your greatest strength?", "ما أكبر نقاط قوتك؟", ["I'm very organized.", "I work well under pressure.", "I communicate clearly with people."]], ["Do you have any questions for us?", "هل لديك أي أسئلة لنا؟", ["What does a typical day look like?", "When can I expect to hear from you?", "What are the next steps?"]]], "meeting": [["Thanks for joining. Shall we start with the project timeline?", "شكرًا لانضمامك. هل نبدأ بالجدول الزمني للمشروع؟", ["Sure, let's start.", "I think we need two months.", "Can we review the budget first?"]], ["What do you think is the biggest risk?", "ما أكبر خطر في رأيك؟", ["The deadline is very tight.", "We don't have enough staff.", "Supplier delays could be a problem."]], ["Who should be responsible for the first phase?", "من يجب أن يكون مسؤولًا عن المرحلة الأولى؟", ["I can take responsibility for it.", "I suggest the operations team.", "Let's discuss it with the manager."]], ["Great. Let's meet again next week to check our progress.", "رائع. لنجتمع مرة أخرى الأسبوع القادم لمتابعة التقدم.", ["Sounds good.", "Can we make it Tuesday?", "I'll send a summary by email."]]], "client": [["Hello, I'm calling about my order. It hasn't arrived yet.", "مرحبًا، أتصل بخصوص طلبي. لم يصل بعد.", ["I'm sorry to hear that. May I have your order number?", "Let me check that for you.", "When did you place the order?"]], ["The order number is 4521. I ordered it two weeks ago.", "رقم الطلب 4521. طلبته منذ أسبوعين.", ["Thank you. Please hold for a moment.", "I can see your order here.", "Let me check the delivery status."]], ["This is the second time this has happened. I'm not happy.", "هذه ثاني مرة يحدث فيها ذلك. لست راضيًا.", ["I completely understand, and I apologize.", "I'll make sure it's delivered tomorrow.", "We'll give you a discount on your next order."]], ["OK. Can you send me a confirmation by email?", "حسنًا. هل ترسل لي تأكيدًا بالبريد الإلكتروني؟", ["Of course. I'll send it right away.", "Yes. What's your email address?", "Is there anything else I can help you with?"]]], "customs": [["Good morning, officer. I'm here to clear a shipment of electronics.", "صباح الخير يا حضرة المأمور. جئت لتخليص شحنة إلكترونيات.", ["Good morning. Do you have the bill of lading?", "Please show me the documents.", "What's the container number?"]], ["Yes. Here are the bill of lading, the commercial invoice and the packing list.", "نعم. هذه بوليصة الشحن والفاتورة التجارية وقائمة التعبئة.", ["Thank you. Where is the certificate of origin?", "The invoice value seems low.", "Everything looks fine."]], ["Will the container need a physical inspection?", "هل ستحتاج الحاوية إلى معاينة فعلية؟", ["Yes, it was selected for inspection.", "No, it's on the green lane.", "We'll decide after reviewing the documents."]], ["How much are the duties, and when can we pay?", "كم الرسوم الجمركية ومتى يمكننا الدفع؟", ["The duties are calculated on the customs value.", "You can pay online today.", "After payment, the goods will be released."]]], "shipping": [["Thank you for your interest. Where do you need to ship from and to?", "شكرًا لاهتمامك. من أين وإلى أين تريد الشحن؟", ["From Shanghai to Port Said.", "From Rotterdam to Alexandria.", "I need a regular weekly service."]], ["Our rate for a forty-foot container is two thousand dollars.", "سعرنا للحاوية الأربعين قدمًا ألفا دولار.", ["That's too high. Can you do better?", "What does the rate include?", "Other lines offer a lower price."]], ["If you commit to ten containers a month, we can offer a discount.", "إذا التزمت بعشر حاويات شهريًا يمكننا تقديم خصم.", ["That sounds reasonable.", "What would the new rate be?", "Can we start with five containers?"]], ["The transit time is about twenty-five days. Is that acceptable?", "مدة الرحلة حوالي خمسة وعشرين يومًا. هل هذا مقبول؟", ["Yes, that works for us.", "Is there a faster service?", "Please send me the offer in writing."]]], "delay": [["Good afternoon, customer service. How can I help you?", "مساء الخير، خدمة العملاء. كيف أساعدك؟", ["My shipment is late.", "I'm calling about a delayed container.", "I need an update on my delivery."]], ["I'm sorry about that. Could you give me the tracking number?", "آسف لذلك. هل تعطيني رقم التتبع؟", ["Yes, it's MSCU one two three four five six.", "Just a moment, please.", "I sent it by email yesterday."]], ["I see the vessel was delayed at the previous port because of bad weather.", "أرى أن السفينة تأخرت في الميناء السابق بسبب سوء الأحوال الجوية.", ["When will it arrive?", "Is the cargo safe?", "Will there be any extra charges?"]], ["The new arrival date is next Monday. We'll keep you updated.", "موعد الوصول الجديد يوم الإثنين القادم. سنبقيك على اطلاع.", ["Thank you for the update.", "Please call me if anything changes.", "Can you confirm that by email?"]]]};
const tc={mode:LS.get('tMode','ai'),aiAvail:true,step:0,scen:LS.get('tScen','restaurant'),lvl:LS.get('tLvl','B1'),auto:LS.get('tAuto',true),hist:[],last:[],busy:false,topic:''};
function syncComposer(){document.body.classList.toggle('talking',$('#v-talk').classList.contains('on')&&!$('#t-chat').hidden);document.body.classList.toggle('shadowing',$('#v-shadow').classList.contains('on')&&!$('#sh-player').hidden);if(!document.body.classList.contains('shadowing')){const w=$('#wpop');if(w)w.hidden=true}}
function renderTalkSetup(){
  if(tc.mode==='local'&&!SCRIPTS[tc.scen])tc.scen='restaurant';
  let g='';let html='';
  SCEN.filter(s=>tc.mode!=='local'||SCRIPTS[s.id]).forEach(s=>{if(s.g!==g){g=s.g;html+=`<div class="grp">${esc(g)}</div>`}html+=`<button data-s="${s.id}" aria-pressed="${tc.scen===s.id}">${esc(s.ar)}</button>`});
  $('#t-scen').innerHTML=html;
  $('#t-scen').querySelectorAll('button').forEach(b=>b.onclick=()=>{tc.scen=b.dataset.s;LS.set('tScen',tc.scen);renderTalkSetup()});
  $('#t-topic').hidden=tc.scen!=='free';
  $('#t-level').innerHTML=LV.map(([k,a])=>`<button data-l="${k}" aria-pressed="${tc.lvl===k}">${a}<br><span class="en" style="font-size:12px">${k}</span></button>`).join('');
  $('#t-level').querySelectorAll('button').forEach(b=>b.onclick=()=>{tc.lvl=b.dataset.l;LS.set('tLvl',tc.lvl);renderTalkSetup()});
  $('#t-speed').innerHTML=[[0.45,'بطيء جدًا'],[0.6,'بطيء'],[0.8,'هادئ'],[1,'طبيعي']].map(([v,l])=>`<button data-sp="${v}" aria-pressed="${Math.abs(st.speed-v)<.01}">${l}</button>`).join('');
  $('#t-speed').querySelectorAll('button').forEach(b=>b.onclick=()=>{setSpeed(+b.dataset.sp);renderSpeed();renderTalkSetup()});
  $('#t-auto').checked=tc.auto;
  $('#t-mode').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.m===tc.mode);b.onclick=()=>{tc.mode=b.dataset.m;LS.set('tMode',tc.mode);renderTalkSetup()}});
  $('#t-lvlbox').hidden=tc.mode==='local';
  $('#t-mode-note').textContent=tc.mode==='local'?'حوارات جاهزة تعمل دون خدمة ذكاء اصطناعي.':(tc.aiAvail?'محادثة وتصحيح لغوي عبر الخادم الخاص بك. الصوت الحالي من جهازك؛ تقييم الأصوات المتخصص سيضاف لاحقًا.':'افتح ⚙ الإعدادات لربط الخدمة، أو اختر التدريب الجاهز.');
}
function refreshAI(){tc.aiAvail=NutqAI.configured();renderTalkSetup()}
window.addEventListener('nutq-ai-settings',refreshAI);
refreshAI();
function startLocal(){
  stopAll();if(!SCRIPTS[tc.scen])tc.scen='restaurant';tc.hist=[];tc.step=0;tc.busy=false;
  $('#t-msgs').innerHTML='';$('#t-setup').hidden=true;$('#t-report').hidden=true;$('#t-chat').hidden=false;
  const s=SCEN.find(x=>x.id===tc.scen);$('#t-title').textContent=s.ar+' · تدريب جاهز';syncComposer();window.scrollTo({top:0});
  addEl('<div class="corr" style="align-self:center;border-inline-start-color:var(--accent);color:var(--muted)">ردّ على الشريك بصوتك أو بالكتابة، أو اضغط 💡 لترى ردودًا مقترحة.</div>');
  localPartner();
}
function localPartner(){const x=SCRIPTS[tc.scen][tc.step];const m={r:'p',t:x[0],ar:x[1]};tc.hist.push(m);tc.last=x[2];addPartner(m)}
function localTurn(text){
  const L=SCRIPTS[tc.scen];if(tc.step>=L.length)return;
  $('#t-in').value='';$('#t-helps').hidden=true;stopAll();
  addEl(`<div class="msg me"><p class="en">${esc(text)}</p></div>`);tc.hist.push({r:'l',t:text});logPractice();
  const sug=L[tc.step][2];
  const el=addEl(`<div class="corr" style="border-inline-start-color:var(--accent)"><div>ردود نموذجية مناسبة هنا:</div>${sug.map((s,i)=>`<div class="better"><button class="iconbtn" data-i="${i}" aria-label="استمع">${PLAY}</button><span class="en">${esc(s)}</span></div>`).join('')}</div>`);
  el.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{stopAll();speak(sug[+b.dataset.i],st.speed)});
  tc.step++;
  if(tc.step<L.length){setTimeout(localPartner,600);return}
  tc.last=[];
  const e2=addEl('<div class="corr ok" style="align-self:center">أحسنت! انتهى الحوار.<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn small" data-a="again">أعد الحوار</button><button class="btn small ghost" data-a="new">موقف آخر</button></div></div>');
  e2.querySelector('[data-a=again]').onclick=startLocal;e2.querySelector('[data-a=new]').onclick=backToSetup;
  const s=LS.get('stats',{days:[],words:{},pairs:0});s.talks=(s.talks||0)+1;if(!s.days.includes(today()))s.days.push(today());LS.set('stats',s);
}
$('#t-auto').onchange=e=>{tc.auto=e.target.checked;LS.set('tAuto',tc.auto)};
function scenText(){const s=SCEN.find(x=>x.id===tc.scen)||SCEN[0];return s.en||`A free, friendly conversation about this topic chosen by the learner: "${tc.topic.replace(/"/g,'')}". You are a curious conversation partner.`}
function baseRules(){const lv=LV.find(l=>l[0]===tc.lvl)||LV[2];
  return `You are an English conversation partner inside a pronunciation and speaking app for Arabic speakers.\nRole-play: ${scenText()}\nLearner level: CEFR ${lv[0]}. ${lv[2]}\nKeep each of your lines to 1-3 short sentences, stay in role, and usually end with a question so the learner keeps talking. No emojis. The learner may be using speech-to-text, so ignore missing capital letters and punctuation.`}
function transcript(){return tc.hist.slice(-16).map(m=>(m.r==='p'?'Partner: ':'Learner: ')+m.t).join('\n')}
function errText(e){return errText0(e)+(e&&e.code?` (${e.code})`:'')}
function errText0(e){return NutqAI.errorText(e)}
function addEl(html){const d=document.createElement('div');d.innerHTML=html.trim();const el=d.firstChild;$('#t-msgs').appendChild(el);window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return el}
function typing(on){const t=$('#t-typing');if(on&&!t)addEl('<div class="typing" id="t-typing" aria-label="يكتب"><i></i><i></i><i></i></div>');if(!on){if(t)t.remove();const w=$('#t-wait');if(w)w.remove()}}
function askT(p,ms=60000){return Promise.race([ask(p),new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms))])}
function addPartner(m){
  const el=addEl(`<div class="msg them"><p class="en">${esc(m.t)}</p>${m.ar?`<p class="ar" hidden>${esc(m.ar)}</p>`:''}<div class="mact"><button data-a="play">▶ استمع</button><button data-a="slow">ببطء</button>${m.ar?'<button data-a="tr">ترجم</button>':''}</div></div>`);
  el.querySelector('[data-a=play]').onclick=()=>{stopAll();speak(m.t,st.speed)};
  el.querySelector('[data-a=slow]').onclick=()=>{stopAll();speak(m.t,0.6)};
  const tr=el.querySelector('[data-a=tr]');if(tr)tr.onclick=()=>{const a=el.querySelector('.ar');a.hidden=!a.hidden;tr.textContent=a.hidden?'ترجم':'إخفاء الترجمة'};
  if(tc.auto){stopAll();speak(m.t,st.speed)}
}
function addCorrection(c){
  if(!c)return;
  if(c.ok&&!c.better){addEl('<div class="corr ok">✓ جملة سليمة</div>');return}
  const el=addEl(`<div class="corr">${c.better?`<div>الأفضل أن تقول:</div><div class="better"><button class="iconbtn" aria-label="استمع">${PLAY}</button><span class="en">${esc(c.better)}</span></div>`:''}
    ${(c.notes_ar||[]).length?`<ul>${c.notes_ar.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
    ${(c.practice||[]).length?`<div class="pchips"><span>تدرّب على نطق:</span>${c.practice.map(w=>`<button data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>`:''}</div>`);
  const pb=el.querySelector('.better .iconbtn');if(pb)pb.onclick=()=>{stopAll();speak(c.better,st.speed)};
  el.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{const w=b.dataset.w.toLowerCase().replace(/[^a-z'-]/g,'');if(!w)return;showView('words');$('#q').value=w;choose({word:w,ar:''});window.scrollTo({top:0})});
}
function renderHelps(){
  const h=$('#t-helps');
  h.innerHTML=(tc.last||[]).length?'<small>ردود مقترحة: اضغط لتسمعها وتضعها في خانة الكتابة</small>'+tc.last.map((s,i)=>`<button data-i="${i}">${esc(s)}</button>`).join(''):'<small>لا توجد اقتراحات الآن.</small>';
  h.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const s=tc.last[+b.dataset.i];$('#t-in').value=s;stopAll();speak(s,st.speed);h.hidden=true});
}
$('#t-help').onclick=()=>{const h=$('#t-helps');if(h.hidden){renderHelps();h.hidden=false}else h.hidden=true};
async function startTalk(){
  if(tc.mode==='local')return startLocal();
  if(tc.scen==='free'){tc.topic=$('#t-topic').value.trim();if(!tc.topic){$('#t-status').textContent='اكتب موضوع الحديث أولًا.';return}}
  stopAll();tc.hist=[];tc.last=[];$('#t-status').textContent='';
  $('#t-msgs').innerHTML='';$('#t-setup').hidden=true;$('#t-report').hidden=true;$('#t-chat').hidden=false;
  const s=SCEN.find(x=>x.id===tc.scen);$('#t-title').textContent=(s.id==='free'?tc.topic:s.ar)+' · '+tc.lvl;
  syncComposer();window.scrollTo({top:0});
  tc.busy=true;addEl(`<div class="corr" id="t-wait" style="align-self:center;border-inline-start-color:var(--accent);color:var(--muted)">جارٍ تجهيز المحادثة…</div>`);typing(true);
  try{
    const r=await askT(baseRules()+`\n\nStart the conversation with your first line in role. Return ONLY JSON: {"reply":"your opening line","reply_ar":"Arabic translation","suggestions":["3 short possible learner replies at their level"]}`);
    typing(false);if(!r||!r.reply)throw{};
    const m={r:'p',t:r.reply,ar:r.reply_ar||''};tc.hist.push(m);tc.last=r.suggestions||[];addPartner(m);
  }catch(e){typing(false);const el=addEl(`<div class="sysmsg">${esc(errText(e))}<div style="display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap"><button class="btn small" data-a="retry">إعادة المحاولة</button><button class="btn small ghost" data-a="local">استخدم التدريب الجاهز</button></div></div>`);el.querySelector('[data-a=retry]').onclick=()=>{tc.busy=false;startTalk()};el.querySelector('[data-a=local]').onclick=()=>{tc.busy=false;tc.mode='local';LS.set('tMode','local');renderTalkSetup();startLocal()}}
  tc.busy=false;
}
async function sendTurn(){
  const inp=$('#t-in');const text=inp.value.trim();if(!text||tc.busy)return;
  if(tc.mode==='local'){localTurn(text);return}
  if(!tc.hist.length){addEl('<div class="sysmsg">ابدأ محادثة جديدة أولًا.</div>');return}
  tc.busy=true;inp.value='';$('#t-helps').hidden=true;stopAll();
  const ub=addEl(`<div class="msg me"><p class="en">${esc(text)}</p></div>`);
  tc.hist.push({r:'l',t:text});typing(true);
  try{
    const r=await askT(baseRules()+`\n\nConversation so far:\n${transcript()}\n\nThe learner's last line is: "${text.replace(/"/g,"'")}"\nReturn ONLY JSON:\n{"correction":{"ok":true or false (true if the learner's line is correct and natural for their level),"better":"a more natural, correct version with the same meaning, or empty string if ok","notes_ar":["0-2 short explanations in Arabic of the grammar or word-choice mistakes"],"practice":["0-3 single English words from the learner's line or the better version that Arabic speakers often mispronounce"]},"reply":"your next line in role","reply_ar":"Arabic translation of your reply","suggestions":["3 short possible next learner replies at their level"]}`);
    typing(false);if(!r||!r.reply)throw{};
    addCorrection(r.correction);
    NutqAI.rememberCorrection(text,r.correction);
    const m={r:'p',t:r.reply,ar:r.reply_ar||''};tc.hist.push(m);tc.last=r.suggestions||[];addPartner(m);
    logPractice();
  }catch(e){typing(false);tc.hist.pop();ub.remove();inp.value=text;addEl(`<div class="sysmsg">${esc(errText(e))}</div>`)}
  tc.busy=false;
}
$('#t-start').onclick=startTalk;
$('#t-send').onclick=sendTurn;
$('#t-in').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendTurn()}});
let rec=null,recText='';
function setMic(on){const b=$('#t-mic');b.classList.toggle('rec',on);b.querySelector('span').textContent=on?'توقّف':'تحدّث';$('#t-live').hidden=!on}
function showWrite(on,focus){$('#t-writerow').hidden=!on;$('#t-kb').setAttribute('aria-pressed',on);if(on&&focus)setTimeout(()=>$('#t-in').focus(),50)}
function micFail(code){
  if(code!=='no-speech')tc.micBlocked=true;
  const m=code==='not-allowed'||code==='service-not-allowed'?'لم يُسمح باستخدام الميكروفون داخل هذه الصفحة.':code==='unsupported'?'هذا المتصفح لا يدعم التعرّف على الكلام.':code==='no-speech'?'لم يصل أي صوت.':'الميكروفون لم يبدأ.';
  const el=addEl(`<div class="corr" style="align-self:center;border-inline-start-color:var(--bad);color:var(--ink)"><div>${m}</div><div style="margin-top:6px">البديل: اضغط «افتح خانة الكتابة»، ثم اضغط 🎤 في لوحة المفاتيح وتكلّم بالإنجليزية.</div><button class="btn small" style="margin-top:8px">افتح خانة الكتابة</button> <span class="en" style="font-size:12px;opacity:.6">(${esc(code)})</span></div>`);
  el.querySelector('button').onclick=()=>showWrite(true,true);
  showWrite(true,false);
}
$('#t-kb').onclick=()=>showWrite($('#t-writerow').hidden,true);
$('#t-mic').onclick=()=>{
  if(rec){try{rec.stop()}catch(e){rec=null;setMic(false)}return}
  if(tc.micBlocked){showWrite(true,true);return}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){micFail('unsupported');return}
  stopAll();try{rec=new SR()}catch(e){rec=null;micFail('init');return}
  rec.lang=st.accent==='uk'?'en-GB':'en-US';rec.interimResults=true;rec.continuous=true;
  recText='';let got=false,errd=false,started=false;const r0=rec;
  $('#t-live').textContent='أسمعك… تكلّم الآن، ثم اضغط «توقّف»';setMic(true);
  rec.onresult=e=>{got=true;let t='';for(const r of e.results)t+=r[0].transcript;recText=t.trim();$('#t-live').textContent=recText||'…'};
  rec.onerror=e=>{errd=true;if(e.error!=='aborted')micFail(e.error)};
  rec.onend=()=>{rec=null;setMic(false);
    if(recText){const i=$('#t-in');i.value=(i.value.trim()?i.value.trim()+' ':'')+recText;showWrite(true,false)}
    else if(!got&&!errd)micFail('no-speech')};
  try{rec.start();rec.onstart=()=>{started=true};setTimeout(()=>{if(!started&&!got&&!errd&&rec===r0){errd=true;try{r0.abort()}catch(e){}rec=null;setMic(false);micFail('no-start')}},3500)}catch(e){rec=null;setMic(false);micFail('start')}
};
function backToSetup(){stopAll();$('#t-chat').hidden=true;$('#t-report').hidden=true;$('#t-setup').hidden=false;$('#t-helps').hidden=true;renderTalkSetup();syncComposer();window.scrollTo({top:0})}
$('#t-back').onclick=backToSetup;
$('#t-end').onclick=async()=>{
  if(tc.mode==='local'){backToSetup();return}
  const turns=tc.hist.filter(m=>m.r==='l').length;
  if(turns<2){addEl('<div class="sysmsg">تكلّم جملتين على الأقل قبل طلب التقرير.</div>');return}
  if(tc.busy)return;tc.busy=true;stopAll();
  $('#t-chat').hidden=true;syncComposer();const rp=$('#t-report');rp.hidden=false;
  rp.innerHTML='<div class="panel" style="text-align:center"><div class="typing" style="margin:0 auto;width:max-content"><i></i><i></i><i></i></div><p class="hint">جارٍ إعداد تقرير المحادثة…</p></div>';
  window.scrollTo({top:0});
  const s=LS.get('stats',{days:[],words:{},pairs:0});s.talks=(s.talks||0)+1;if(!s.days.includes(today()))s.days.push(today());LS.set('stats',s);
  try{
    const r=await askT(`You are an English teacher reviewing a speaking practice conversation by an Arabic-speaking learner (target level CEFR ${tc.lvl}). Only text is available: fluency here means clarity of written expression, not spoken rhythm, timing, or pronunciation.\nScenario: ${scenText()}\nConversation:\n${tc.hist.map(m=>(m.r==='p'?'Partner: ':'Learner: ')+m.t).join('\n')}\n\nReturn ONLY JSON: {"fluency":1-5,"grammar":1-5,"vocabulary":1-5,"summary_ar":"2-3 sentences of honest, encouraging feedback in Arabic","mistakes_ar":["up to 4 of the learner's most important mistakes, in Arabic, each including the correct English form"],"new_words":[{"word":"useful English word or short phrase from or for this conversation","ar":"Arabic meaning"}]} with up to 6 new_words.`);
    renderReport(r);
  }catch(e){rp.innerHTML=`<div class="panel"><p class="sysmsg">${esc(errText(e))}</p><button class="btn" id="t-again" style="width:100%">محادثة جديدة</button></div>`;$('#t-again').onclick=backToSetup}
  tc.busy=false;
};
function renderReport(r){
  const row=(l,v)=>{v=Math.max(1,Math.min(5,+v||1));return `<div class="r"><span>${l}</span><div class="bar"><i style="width:${v*20}%"></i></div><b>${v}/5</b></div>`};
  const sv=LS.get('saved',[]);
  const rp=$('#t-report');
  rp.innerHTML=`<div class="panel"><h2 style="font-size:20px">تقرير المحادثة</h2>
    <p class="hint">تقدير تعليمي للنص؛ لا يقيس النطق أو سرعة الكلام، ولا يعد شهادة مستوى.</p>
    <div class="scores">${row('وضوح التعبير النصي',r.fluency)}${row('القواعد',r.grammar)}${row('المفردات',r.vocabulary)}</div>
    <p style="margin-top:14px">${esc(r.summary_ar||'')}</p>
    ${(r.mistakes_ar||[]).length?`<h3 class="sub">أهم الأخطاء</h3><ul class="tips">${r.mistakes_ar.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:''}
    ${(r.new_words||[]).length?`<h3 class="sub">كلمات جديدة</h3><div>${r.new_words.map((w,i)=>`<div class="nw"><button class="iconbtn" data-p="${i}" aria-label="استمع">${PLAY}</button><div><b>${esc(w.word)}</b><small>${esc(w.ar||'')}</small></div><button class="btn small ghost" data-sv="${i}">${sv.some(x=>x.word===String(w.word).toLowerCase())?'محفوظة ✓':'احفظ'}</button></div>`).join('')}</div>`:''}
    <button class="btn" id="t-again" style="width:100%;margin-top:16px">محادثة جديدة</button></div>`;
  rp.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{stopAll();speak(r.new_words[+b.dataset.p].word,st.speed)});
  rp.querySelectorAll('[data-sv]').forEach(b=>b.onclick=()=>{const w=r.new_words[+b.dataset.sv];const k=String(w.word).toLowerCase();const s=LS.get('saved',[]);if(!s.some(x=>x.word===k)){s.unshift({word:k,ipa:'',ar:w.ar||''});LS.set('saved',s)}b.textContent='محفوظة ✓'});
  $('#t-again').onclick=backToSetup;
}
renderTalkSetup();

/* ---------- shadowing ---------- */
const COMMON={"the": "الـ (أداة تعريف)", "a": "أداة تنكير (واحد)", "an": "أداة تنكير (واحد)", "is": "يكون / هو", "are": "يكونون / هم", "was": "كان", "were": "كانوا", "be": "يكون", "been": "كان (تصريف)", "am": "أكون", "i": "أنا", "you": "أنت / أنتم", "he": "هو", "she": "هي", "it": "هو / هي (لغير العاقل)", "we": "نحن", "they": "هم", "my": "ـي (ملكي)", "your": "ـك (ملكك)", "his": "ـه (ملكه)", "her": "ـها", "its": "ـه / ـها", "our": "ـنا", "their": "ـهم", "me": "ني / لي", "us": "نا", "them": "هم", "and": "و", "or": "أو", "but": "لكن", "so": "لذلك", "because": "لأن", "if": "إذا", "when": "عندما", "then": "ثم", "than": "من (للمقارنة)", "to": "إلى / لـ", "of": "من / الخاص بـ", "in": "في", "on": "على / في", "at": "عند / في", "for": "لـ / من أجل", "with": "مع", "from": "من", "by": "بواسطة / عن طريق", "about": "عن / حوالي", "into": "إلى داخل", "through": "عبر / خلال", "after": "بعد", "before": "قبل", "every": "كل", "all": "كل / جميع", "some": "بعض", "many": "كثير", "more": "أكثر", "most": "الأكثر / معظم", "very": "جدًا", "also": "أيضًا", "not": "لا / ليس", "no": "لا", "this": "هذا / هذه", "that": "ذلك / أنّ", "these": "هذه / هؤلاء", "those": "تلك / أولئك", "there": "هناك", "here": "هنا", "what": "ما / ماذا", "which": "الذي / أيّ", "who": "الذي / مَن", "how": "كيف", "can": "يستطيع", "will": "سوف", "would": "سوف (للشرط والتهذيب)", "should": "ينبغي", "must": "يجب", "have": "يملك / لديه", "has": "لديه", "had": "كان لديه", "do": "يفعل", "does": "يفعل", "did": "فعل", "each": "كل", "one": "واحد", "two": "اثنان", "first": "أولًا / أول", "usually": "عادةً", "often": "غالبًا", "always": "دائمًا", "never": "أبدًا", "now": "الآن", "today": "اليوم", "up": "لأعلى", "out": "خارج", "as": "كـ / بينما", "while": "بينما", "only": "فقط", "just": "فقط / للتو", "other": "آخر", "new": "جديد", "good": "جيد", "people": "الناس", "day": "يوم", "time": "وقت / مرة", "year": "سنة", "years": "سنوات", "world": "العالم", "make": "يصنع / يُعِدّ", "take": "يأخذ", "get": "يحصل على", "go": "يذهب", "use": "يستخدم", "help": "يساعد", "need": "يحتاج", "it's": "إنه / إنها", "don't": "لا (نفي)", "i'm": "أنا", "can't": "لا يستطيع", "there's": "يوجد", "they're": "إنهم", "we're": "نحن", "you're": "أنت", "where": "أين", "why": "لماذا", "any": "أي", "much": "كثير", "well": "جيدًا", "like": "يحب / مثل", "over": "فوق / أكثر من", "under": "تحت", "between": "بين", "around": "حول", "yes": "نعم"};
const PASSAGES0=[{"t": "My Morning Routine", "ta": "روتيني الصباحي", "lv": "A2", "s": [{"en": "I usually wake up at six o'clock.", "ar": "عادةً أستيقظ في الساعة السادسة."}, {"en": "First, I wash my face and brush my teeth.", "ar": "أولًا، أغسل وجهي وأنظّف أسناني."}, {"en": "Then I make a cup of tea and eat a simple breakfast.", "ar": "ثم أُعِدّ كوبًا من الشاي وأتناول فطورًا بسيطًا."}, {"en": "I like to read the news on my phone while I eat.", "ar": "أحب أن أقرأ الأخبار على هاتفي بينما آكل."}, {"en": "At seven thirty, I leave the house and drive to work.", "ar": "في السابعة والنصف أغادر المنزل وأقود السيارة إلى العمل."}, {"en": "The traffic is sometimes heavy, so I listen to English podcasts in the car.", "ar": "أحيانًا يكون المرور مزدحمًا، لذلك أستمع إلى بودكاست إنجليزي في السيارة."}], "g": {"wake": "يستيقظ (wake up)", "six": "ستة", "o'clock": "الساعة (لذكر الوقت)", "wash": "يغسل", "face": "وجه", "brush": "ينظّف بالفرشاة", "teeth": "أسنان", "cup": "كوب", "tea": "شاي", "eat": "يأكل", "simple": "بسيط", "breakfast": "إفطار", "read": "يقرأ", "news": "أخبار", "phone": "هاتف", "seven": "سبعة", "thirty": "ثلاثون (هنا: والنصف)", "leave": "يغادر", "house": "منزل", "drive": "يقود (سيارة)", "work": "العمل", "traffic": "حركة المرور", "sometimes": "أحيانًا", "heavy": "ثقيل / مزدحم", "listen": "يستمع", "english": "الإنجليزية", "podcasts": "برامج صوتية (بودكاست)", "car": "سيارة"}}, {"t": "A Busy Port", "ta": "ميناء مزدحم", "lv": "B1", "s": [{"en": "Port Said is one of the busiest ports in the Mediterranean.", "ar": "بورسعيد من أكثر الموانئ ازدحامًا في البحر المتوسط."}, {"en": "Every day, huge container ships arrive from Asia and Europe.", "ar": "كل يوم تصل سفن حاويات ضخمة من آسيا وأوروبا."}, {"en": "Cranes lift the containers and place them on trucks or in the yard.", "ar": "ترفع الرافعات الحاويات وتضعها على الشاحنات أو في الساحة."}, {"en": "Each container has a number that helps workers track it.", "ar": "لكل حاوية رقم يساعد العمال على تتبّعها."}, {"en": "Before the goods can leave the port, they must be cleared by customs.", "ar": "قبل أن تغادر البضائع الميناء، يجب أن تُخلَّص جمركيًا."}, {"en": "Good planning keeps the port moving smoothly, day and night.", "ar": "التخطيط الجيد يُبقي العمل في الميناء يسير بسلاسة ليلًا ونهارًا."}], "g": {"port": "ميناء", "said": "سعيد (من اسم بورسعيد)", "busiest": "الأكثر ازدحامًا", "ports": "موانئ", "mediterranean": "البحر المتوسط", "huge": "ضخم", "container": "حاوية", "containers": "حاويات", "ships": "سفن", "arrive": "يصل", "asia": "آسيا", "europe": "أوروبا", "cranes": "رافعات", "lift": "يرفع", "place": "يضع", "trucks": "شاحنات", "yard": "ساحة", "number": "رقم", "helps": "يساعد", "workers": "عمال", "track": "يتتبّع", "goods": "بضائع", "leave": "يغادر", "cleared": "مُخلَّص (جمركيًا)", "customs": "الجمارك", "planning": "تخطيط", "keeps": "يُبقي / يحافظ على", "moving": "متحرك / يسير", "smoothly": "بسلاسة", "night": "ليل"}}, {"t": "Learning a New Language", "ta": "تعلّم لغة جديدة", "lv": "B1", "s": [{"en": "Learning a new language takes time and patience.", "ar": "تعلّم لغة جديدة يحتاج إلى وقت وصبر."}, {"en": "Many learners can read well, but they feel shy when they speak.", "ar": "كثير من المتعلمين يقرؤون جيدًا، لكنهم يشعرون بالخجل عندما يتحدثون."}, {"en": "The best way to improve is to practice a little every day.", "ar": "أفضل طريقة للتحسّن هي التدرّب قليلًا كل يوم."}, {"en": "Listen carefully, repeat what you hear, and don't be afraid of mistakes.", "ar": "استمع بانتباه، وكرّر ما تسمعه، ولا تخف من الأخطاء."}, {"en": "Mistakes are a natural part of learning.", "ar": "الأخطاء جزء طبيعي من التعلّم."}, {"en": "With time, your pronunciation will become clearer and more confident.", "ar": "مع الوقت سيصبح نطقك أوضح وأكثر ثقة."}], "g": {"learning": "تعلّم", "language": "لغة", "takes": "يستغرق / يحتاج", "patience": "صبر", "learners": "متعلمون", "read": "يقرأ", "feel": "يشعر", "shy": "خجول", "speak": "يتحدث", "best": "أفضل", "way": "طريقة", "improve": "يتحسّن", "practice": "يتدرّب", "little": "قليلًا", "listen": "استمع", "carefully": "بعناية", "repeat": "كرّر", "hear": "تسمع", "afraid": "خائف", "mistakes": "أخطاء", "natural": "طبيعي", "part": "جزء", "pronunciation": "النطق", "become": "يصبح", "clearer": "أوضح", "confident": "واثق"}}, {"t": "How Customs Clearance Works", "ta": "كيف يتم التخليص الجمركي", "lv": "B2", "s": [{"en": "When goods arrive at a port, the importer or a customs broker submits a declaration.", "ar": "عندما تصل البضائع إلى الميناء، يقدّم المستورد أو المستخلص الجمركي بيانًا جمركيًا."}, {"en": "The declaration describes the goods, their value, and their country of origin.", "ar": "يصف البيان البضائع وقيمتها وبلد منشئها."}, {"en": "Customs officers review the documents and classify the goods under the correct tariff code.", "ar": "يراجع موظفو الجمارك المستندات ويصنّفون البضائع تحت البند التعريفي الصحيح."}, {"en": "A risk management system decides whether the shipment needs a physical inspection.", "ar": "يحدد نظام إدارة المخاطر ما إذا كانت الشحنة تحتاج إلى معاينة فعلية."}, {"en": "Once the duties and taxes are paid, the goods are released to the importer.", "ar": "بمجرد سداد الرسوم والضرائب يُفرَج عن البضائع للمستورد."}, {"en": "Fast and accurate clearance reduces costs and supports international trade.", "ar": "التخليص السريع والدقيق يقلل التكاليف ويدعم التجارة الدولية."}], "g": {"goods": "بضائع", "arrive": "يصل", "port": "ميناء", "importer": "المستورد", "customs": "الجمارك", "broker": "مستخلص / وسيط", "submits": "يقدّم", "declaration": "بيان جمركي / إقرار", "describes": "يصف", "value": "قيمة", "country": "بلد", "origin": "منشأ", "officers": "موظفون / مأمورون", "review": "يراجع", "documents": "مستندات", "classify": "يصنّف", "correct": "صحيح", "tariff": "تعريفة جمركية", "code": "رمز / بند", "risk": "مخاطر", "management": "إدارة", "system": "نظام", "decides": "يقرر", "whether": "ما إذا", "shipment": "شحنة", "needs": "يحتاج", "physical": "فعلي / مادي", "inspection": "معاينة / فحص", "once": "بمجرد", "duties": "رسوم جمركية", "taxes": "ضرائب", "paid": "مدفوع / سُدِّد", "released": "مُفرَج عنه", "fast": "سريع", "accurate": "دقيق", "clearance": "تخليص", "reduces": "يقلل", "costs": "تكاليف", "supports": "يدعم", "international": "دولي", "trade": "تجارة"}}, {"t": "The Suez Canal", "ta": "قناة السويس", "lv": "B2", "s": [{"en": "The Suez Canal connects the Mediterranean Sea with the Red Sea.", "ar": "تربط قناة السويس البحر المتوسط بالبحر الأحمر."}, {"en": "It opened in 1869 and quickly changed the routes of world trade.", "ar": "افتُتحت عام 1869 وسرعان ما غيّرت طرق التجارة العالمية."}, {"en": "Ships no longer had to sail around Africa to travel between Europe and Asia.", "ar": "لم تعد السفن مضطرة للإبحار حول أفريقيا للسفر بين أوروبا وآسيا."}, {"en": "Port Said stands at the northern entrance of the canal.", "ar": "تقع بورسعيد عند المدخل الشمالي للقناة."}, {"en": "Today, the canal is one of the most important waterways on the planet.", "ar": "اليوم تُعد القناة من أهم الممرات المائية على الكوكب."}, {"en": "A large share of global shipping passes through it every year.", "ar": "تمر عبرها نسبة كبيرة من الشحن العالمي كل عام."}], "g": {"suez": "السويس", "canal": "قناة", "connects": "يربط", "mediterranean": "المتوسط", "sea": "بحر", "red": "أحمر", "opened": "افتُتح", "quickly": "بسرعة", "changed": "غيّر", "routes": "طرق / مسارات", "trade": "تجارة", "ships": "سفن", "longer": "(no longer: لم يعد)", "sail": "يبحر", "africa": "أفريقيا", "travel": "يسافر", "europe": "أوروبا", "asia": "آسيا", "port": "ميناء", "said": "سعيد (من اسم بورسعيد)", "stands": "يقع", "northern": "شمالي", "entrance": "مدخل", "important": "مهم", "waterways": "ممرات مائية", "planet": "كوكب", "large": "كبير", "share": "نسبة / حصة", "global": "عالمي", "shipping": "الشحن", "passes": "يمر"}}];
const WISDOM=[{"cat": "w", "t": "The Farmer's Horse", "ta": "حصان المزارع", "lv": "B2", "s": [{"en": "There is an old story about a farmer whose only horse ran away one morning.", "ar": "هناك قصة قديمة عن مزارع هرب حصانه الوحيد ذات صباح."}, {"en": "His neighbors came to visit and said, \"What terrible luck!\"", "ar": "جاء جيرانه لزيارته وقالوا: «يا له من حظ سيئ!»"}, {"en": "The farmer simply replied, \"Maybe.\"", "ar": "فأجاب المزارع ببساطة: «ربما.»"}, {"en": "A few days later, the horse returned, bringing three wild horses with it.", "ar": "بعد أيام قليلة عاد الحصان ومعه ثلاثة خيول برية."}, {"en": "\"What wonderful luck!\" the neighbors said, but the farmer only answered, \"Maybe.\"", "ar": "قال الجيران: «يا له من حظ رائع!» لكن المزارع أجاب فقط: «ربما.»"}, {"en": "The next week, his son tried to ride one of the wild horses, fell, and broke his leg.", "ar": "في الأسبوع التالي حاول ابنه ركوب أحد الخيول البرية فسقط وكُسرت ساقه."}, {"en": "Soon after, soldiers arrived in the village to take young men to war, but they left the injured son behind.", "ar": "بعد ذلك بقليل وصل جنود إلى القرية ليأخذوا الشبان إلى الحرب، لكنهم تركوا الابن المصاب."}, {"en": "The lesson is clear: we rarely know whether an event is truly good or bad while it is happening.", "ar": "العبرة واضحة: نادرًا ما نعرف إن كان الحدث خيرًا أم شرًا أثناء وقوعه."}, {"en": "Patience and calm judgment often reveal a bigger picture than our first reaction.", "ar": "الصبر والحكم الهادئ كثيرًا ما يكشفان صورة أكبر من رد فعلنا الأول."}], "g": {"old": "قديم", "story": "قصة", "farmer": "مزارع", "whose": "الذي (له)", "only": "الوحيد / فقط", "horse": "حصان", "ran": "جرى (ran away: هرب)", "away": "بعيدًا", "morning": "صباح", "neighbors": "جيران", "came": "جاؤوا", "visit": "يزور", "said": "قالوا", "terrible": "فظيع / سيئ جدًا", "luck": "حظ", "simply": "ببساطة", "replied": "أجاب", "maybe": "ربما", "few": "قليل", "days": "أيام", "later": "لاحقًا", "returned": "عاد", "bringing": "جالبًا / ومعه", "three": "ثلاثة", "wild": "بري", "horses": "خيول", "wonderful": "رائع", "answered": "أجاب", "next": "التالي", "week": "أسبوع", "son": "ابن", "tried": "حاول", "ride": "يركب", "fell": "سقط", "broke": "كسر", "leg": "ساق", "soon": "قريبًا (soon after: بعد قليل)", "soldiers": "جنود", "arrived": "وصلوا", "village": "قرية", "young": "شاب / صغير", "men": "رجال", "war": "حرب", "left": "تركوا (left behind: تركوه خلفهم)", "injured": "مصاب", "behind": "خلف", "lesson": "عبرة / درس", "clear": "واضح", "rarely": "نادرًا", "know": "نعرف", "whether": "ما إذا", "event": "حدث", "truly": "حقًا", "bad": "سيئ", "happening": "يحدث", "patience": "صبر", "calm": "هادئ", "judgment": "حُكم / تقدير", "reveal": "يكشف", "bigger": "أكبر", "picture": "صورة", "reaction": "رد فعل"}}, {"cat": "w", "t": "Two Wolves", "ta": "الذئبان", "lv": "B2", "s": [{"en": "An old man once told his grandson that a constant battle was taking place inside every person.", "ar": "أخبر رجل عجوز حفيده ذات مرة أن معركة دائمة تدور داخل كل إنسان."}, {"en": "It is like a fight between two wolves.", "ar": "إنها تشبه صراعًا بين ذئبين."}, {"en": "One wolf is full of anger, envy, pride, and fear.", "ar": "ذئب مليء بالغضب والحسد والكِبر والخوف."}, {"en": "The other is full of kindness, hope, honesty, and peace.", "ar": "والآخر مليء باللطف والأمل والصدق والسلام."}, {"en": "The boy thought about this for a moment and then asked, \"Which wolf wins?\"", "ar": "فكّر الصبي في ذلك لحظة ثم سأل: «أي الذئبين ينتصر؟»"}, {"en": "The old man smiled and answered, \"The one you feed.\"", "ar": "ابتسم العجوز وأجاب: «الذي تُطعمه.»"}, {"en": "Our thoughts and habits are the food we give to one side or the other.", "ar": "أفكارنا وعاداتنا هي الطعام الذي نقدمه لأحد الجانبين."}, {"en": "Every time we choose patience over anger, we make the better wolf stronger.", "ar": "في كل مرة نختار فيها الصبر بدل الغضب، نجعل الذئب الأفضل أقوى."}, {"en": "Character is not decided in one great moment; it is built quietly, one choice at a time.", "ar": "الشخصية لا تُحسم في لحظة عظيمة واحدة، بل تُبنى بهدوء، اختيارًا بعد اختيار."}], "g": {"old": "عجوز / قديم", "man": "رجل", "once": "ذات مرة", "told": "أخبر", "grandson": "حفيد", "constant": "دائم / مستمر", "battle": "معركة", "taking": "(taking place: تحدث)", "place": "(take place: يحدث)", "inside": "داخل", "person": "إنسان / شخص", "fight": "صراع / قتال", "wolves": "ذئاب", "wolf": "ذئب", "full": "مليء", "anger": "غضب", "envy": "حسد", "pride": "كِبر / غرور", "fear": "خوف", "kindness": "لطف", "hope": "أمل", "honesty": "صدق", "peace": "سلام", "boy": "صبي", "thought": "فكّر", "moment": "لحظة", "asked": "سأل", "wins": "ينتصر", "smiled": "ابتسم", "answered": "أجاب", "feed": "تُطعم", "thoughts": "أفكار", "habits": "عادات", "food": "طعام", "give": "نعطي", "side": "جانب", "choose": "نختار", "patience": "صبر", "better": "أفضل", "stronger": "أقوى", "character": "الشخصية / الخُلق", "decided": "يُحسم / يُقرَّر", "great": "عظيم", "built": "يُبنى", "quietly": "بهدوء", "choice": "اختيار"}}, {"cat": "w", "t": "The Elephant and the Rope", "ta": "الفيل والحبل", "lv": "B2", "s": [{"en": "A man was walking past a camp when he noticed several large elephants standing quietly.", "ar": "كان رجل يمر بجانب مخيم حين لاحظ عدة أفيال كبيرة تقف بهدوء."}, {"en": "Each elephant was held only by a thin rope tied to its front leg.", "ar": "كان كل فيل مقيّدًا فقط بحبل رفيع مربوط في قدمه الأمامية."}, {"en": "There were no chains and no cages, and clearly the animals could break free at any moment.", "ar": "لم تكن هناك سلاسل ولا أقفاص، وكان واضحًا أن الحيوانات تستطيع التحرر في أي لحظة."}, {"en": "Confused, he asked the trainer why they never tried to escape.", "ar": "سأل المدرّب في حيرة: لماذا لا تحاول الهروب أبدًا؟"}, {"en": "The trainer explained that when the elephants were very young, the same rope was strong enough to hold them.", "ar": "أوضح المدرّب أن الأفيال حين كانت صغيرة جدًا كان الحبل نفسه قويًا بما يكفي لتقييدها."}, {"en": "They pulled and failed many times, until they finally believed that escape was impossible.", "ar": "شدّت وفشلت مرات كثيرة حتى اقتنعت أخيرًا بأن الهروب مستحيل."}, {"en": "Now, even as powerful adults, they still accept that old belief without testing it.", "ar": "والآن، حتى وهي بالغة وقوية، ما زالت تقبل ذلك الاعتقاد القديم دون أن تختبره."}, {"en": "Many of us carry similar ropes: ideas about our limits that were true long ago but are no longer true today.", "ar": "كثير منا يحمل حبالًا مشابهة: أفكارًا عن حدودنا كانت صحيحة منذ زمن بعيد لكنها لم تعد صحيحة اليوم."}, {"en": "Sometimes the only thing holding us back is a memory.", "ar": "أحيانًا يكون الشيء الوحيد الذي يعيقنا مجرد ذكرى."}], "g": {"man": "رجل", "walking": "يمشي", "past": "مارًّا بجانب", "camp": "مخيم", "noticed": "لاحظ", "several": "عدة", "large": "كبير", "elephants": "أفيال", "elephant": "فيل", "standing": "واقفة", "quietly": "بهدوء", "held": "مقيّد / مُمسَك", "thin": "رفيع", "rope": "حبل", "ropes": "حبال", "tied": "مربوط", "front": "أمامي", "leg": "ساق / قدم", "chains": "سلاسل", "cages": "أقفاص", "clearly": "بوضوح", "animals": "حيوانات", "break": "يكسر (break free: يتحرر)", "free": "حر", "moment": "لحظة", "confused": "محتار", "asked": "سأل", "trainer": "مدرّب", "tried": "حاولوا", "escape": "يهرب / الهروب", "explained": "أوضح", "young": "صغير", "same": "نفس", "strong": "قوي", "enough": "بما يكفي", "hold": "يقيّد / يمسك", "pulled": "شدّت", "failed": "فشلت", "times": "مرات", "until": "حتى", "finally": "أخيرًا", "believed": "اعتقدت", "impossible": "مستحيل", "even": "حتى", "powerful": "قوي", "adults": "بالغون", "still": "ما زال", "accept": "يقبل", "old": "قديم", "belief": "اعتقاد", "without": "دون", "testing": "اختبار", "carry": "يحمل", "similar": "مشابه", "ideas": "أفكار", "limits": "حدود", "true": "صحيح", "long": "(long ago: منذ زمن بعيد)", "ago": "منذ", "longer": "(no longer: لم يعد)", "sometimes": "أحيانًا", "thing": "شيء", "holding": "(holding back: يعيق)", "back": "للخلف", "memory": "ذكرى"}}, {"cat": "w", "t": "The Value of Time", "ta": "قيمة الوقت", "lv": "C1", "s": [{"en": "Time is the only resource that we can never earn back once it is spent.", "ar": "الوقت هو المورد الوحيد الذي لا يمكننا استعادته أبدًا بعد إنفاقه."}, {"en": "Money that is lost can be recovered, and broken friendships can sometimes be repaired, but yesterday will not return.", "ar": "المال الضائع يمكن استرداده، والصداقات المكسورة يمكن إصلاحها أحيانًا، لكن الأمس لن يعود."}, {"en": "Many people say they are waiting for the right moment to begin something important.", "ar": "كثير من الناس يقولون إنهم ينتظرون اللحظة المناسبة للبدء في شيء مهم."}, {"en": "In reality, the perfect moment rarely arrives on its own.", "ar": "في الحقيقة، نادرًا ما تأتي اللحظة المثالية من تلقاء نفسها."}, {"en": "Those who achieve their goals usually started before they felt completely ready.", "ar": "الذين يحققون أهدافهم بدؤوا عادةً قبل أن يشعروا بالاستعداد الكامل."}, {"en": "Even fifteen minutes a day, used wisely, can add up to more than ninety hours in a year.", "ar": "حتى خمس عشرة دقيقة يوميًا، إذا استُخدمت بحكمة، يمكن أن يصل مجموعها إلى أكثر من تسعين ساعة في العام."}, {"en": "An Arab proverb warns that time is like a sword: if you do not cut it, it will cut you.", "ar": "يحذّر مثل عربي من أن الوقت كالسيف، إن لم تقطعه قطعك."}, {"en": "The wise person, therefore, does not ask how much time is left, but how well it is being used.", "ar": "لذلك لا يسأل الحكيم كم بقي من الوقت، بل كيف يُستخدم."}], "g": {"value": "قيمة", "resource": "مورد", "earn": "يكسب (earn back: يستعيد)", "back": "مجددًا", "once": "بمجرد", "spent": "أُنفِق", "money": "مال", "lost": "ضائع", "recovered": "يُسترَد", "broken": "مكسور", "friendships": "صداقات", "sometimes": "أحيانًا", "repaired": "يُصلَح", "yesterday": "الأمس", "return": "يعود", "say": "يقولون", "waiting": "ينتظرون", "right": "مناسب / صحيح", "moment": "لحظة", "begin": "يبدأ", "something": "شيء", "important": "مهم", "reality": "الحقيقة / الواقع", "perfect": "مثالي", "rarely": "نادرًا", "arrives": "يصل / يأتي", "own": "(on its own: من تلقاء نفسه)", "achieve": "يحقق", "goals": "أهداف", "started": "بدؤوا", "felt": "شعروا", "completely": "تمامًا", "ready": "مستعد", "even": "حتى", "fifteen": "خمس عشرة", "minutes": "دقائق", "used": "مُستخدَم", "wisely": "بحكمة", "add": "يضيف (add up to: يصل مجموعه إلى)", "ninety": "تسعون", "hours": "ساعات", "arab": "عربي", "proverb": "مثل / حكمة", "warns": "يحذّر", "sword": "سيف", "cut": "يقطع", "wise": "حكيم", "person": "شخص", "therefore": "لذلك", "ask": "يسأل", "left": "متبقٍّ", "being": "(is being used: يُستخدم)"}}, {"cat": "w", "t": "Failure Is a Teacher", "ta": "الفشل معلّم", "lv": "C1", "s": [{"en": "Nobody enjoys failing, yet failure is often the most honest teacher we will ever have.", "ar": "لا أحد يستمتع بالفشل، ومع ذلك فالفشل غالبًا أصدق معلّم سنحظى به."}, {"en": "Success can make us comfortable and careless, while failure forces us to stop and think.", "ar": "النجاح قد يجعلنا مرتاحين ومهملين، بينما يجبرنا الفشل على التوقف والتفكير."}, {"en": "When a plan does not work, it shows us exactly where our knowledge or effort was weak.", "ar": "عندما لا تنجح خطة، فإنها تُرينا بالضبط أين كانت معرفتنا أو جهودنا ضعيفة."}, {"en": "Thomas Edison reportedly tested thousands of materials before he found one that worked well in his light bulb.", "ar": "يُروى أن توماس إديسون جرّب آلاف المواد قبل أن يجد مادة تعمل جيدًا في مصباحه الكهربائي."}, {"en": "He did not see those attempts as wasted; each one taught him what would not work.", "ar": "لم يرَ تلك المحاولات ضائعة، فكل واحدة علّمته ما لا ينجح."}, {"en": "The real danger is not falling down, but refusing to get up again.", "ar": "الخطر الحقيقي ليس السقوط، بل رفض النهوض من جديد."}, {"en": "People who grow the most are those who examine their mistakes calmly instead of hiding them.", "ar": "أكثر الناس نموًّا هم من يفحصون أخطاءهم بهدوء بدلًا من إخفائها."}, {"en": "So the next time something goes wrong, ask yourself a simple question: what is this trying to teach me?", "ar": "لذلك في المرة القادمة التي يسوء فيها أمر ما، اسأل نفسك سؤالًا بسيطًا: ماذا يحاول هذا أن يعلّمني؟"}], "g": {"nobody": "لا أحد", "enjoys": "يستمتع", "failing": "الفشل / الإخفاق", "yet": "ومع ذلك", "failure": "فشل", "honest": "صادق", "teacher": "معلّم", "ever": "يومًا / على الإطلاق", "success": "نجاح", "comfortable": "مرتاح", "careless": "مهمل / غير مبالٍ", "forces": "يُجبر", "stop": "يتوقف", "think": "يفكر", "plan": "خطة", "work": "ينجح / يعمل", "shows": "يُري / يُظهر", "exactly": "بالضبط", "knowledge": "معرفة", "effort": "جهد", "weak": "ضعيف", "thomas": "توماس", "edison": "إديسون", "reportedly": "يُروى أن / حسب الروايات", "tested": "اختبر / جرّب", "thousands": "آلاف", "materials": "مواد", "found": "وجد", "worked": "نجح / عمل", "light": "ضوء", "bulb": "مصباح (light bulb: مصباح كهربائي)", "see": "يرى", "attempts": "محاولات", "wasted": "ضائع / مُهدَر", "taught": "علّم", "real": "حقيقي", "danger": "خطر", "falling": "السقوط", "down": "لأسفل", "refusing": "رفض", "again": "مرة أخرى", "grow": "ينمو", "examine": "يفحص", "mistakes": "أخطاء", "calmly": "بهدوء", "instead": "بدلًا من", "hiding": "إخفاء", "next": "القادم", "something": "شيء", "goes": "(goes wrong: يسوء)", "wrong": "خطأ", "ask": "اسأل", "yourself": "نفسك", "simple": "بسيط", "question": "سؤال", "trying": "يحاول", "teach": "يعلّم"}}];
const PASSAGES=WISDOM.concat(PASSAGES0);
const ICON_PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',ICON_PAUSE='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const sh={p:null,i:0,playing:false,mode:LS.get('shMode','after'),showAr:LS.get('shAr',false),lvl:LS.get('shLvl','B1'),cache:{}};
function renderShList(){
  const card=(p,i)=>`<button class="pcard" data-i="${i}"><b>${esc(p.t)}</b><span>${esc(p.ta)} · المستوى ${p.lv} · ${p.s.length} جمل</span></button>`;
  $('#sh-items').innerHTML='<h3 class="sub">حِكم وعِبر</h3>'+PASSAGES.map((p,i)=>p.cat==='w'?card(p,i):'').join('')+'<h3 class="sub">فقرات قصيرة</h3>'+PASSAGES.map((p,i)=>p.cat!=='w'?card(p,i):'').join('');
  $('#sh-items').querySelectorAll('.pcard').forEach(b=>b.onclick=()=>openPassage(PASSAGES[+b.dataset.i]));
  $('#sh-lvl').innerHTML=['B1','B2','C1'].map(l=>`<button data-l="${l}" aria-pressed="${sh.lvl===l}">${{B1:'متوسط',B2:'فوق المتوسط',C1:'متقدم'}[l]}<br><span class="en" style="font-size:12px">${l}</span></button>`).join('');
  $('#sh-lvl').querySelectorAll('button').forEach(b=>b.onclick=()=>{sh.lvl=b.dataset.l;LS.set('shLvl',sh.lvl);renderShList()});
}
function tok(s){let out='';const re=/[A-Za-z]+(?:['’][A-Za-z]+)?|[^A-Za-z]+/g;let m;while((m=re.exec(s))){out+=/^[A-Za-z]/.test(m[0])?`<span class="w" data-k="${m.index}">${esc(m[0])}</span>`:esc(m[0])}return out}
function openPassage(p){
  stopAll();sh.p=p;sh.i=0;sh.playing=false;
  $('#sh-list').hidden=true;$('#sh-player').hidden=false;
  $('#sh-title').textContent=p.t;$('#sh-sub').textContent=[p.ta,p.lv?('المستوى '+p.lv):''].filter(Boolean).join(' · ');
  $('#sh-text').innerHTML=p.s.map((s,i)=>`<span class="sent" data-s="${i}">${tok(s.en)}</span> `).join('');
  $('#sh-text').querySelectorAll('.w').forEach(w=>w.onclick=()=>onWord(w));
  renderShBar();setCur(0,false);syncComposer();window.scrollTo({top:0});
}
function sentEl(i){return $('#sh-text').querySelector(`.sent[data-s="${i}"]`)}
function setCur(i,scroll=true){
  sh.i=Math.max(0,Math.min(sh.p.s.length-1,i));
  $('#sh-text').querySelectorAll('.sent').forEach(e=>e.classList.toggle('cur',+e.dataset.s===sh.i));
  const el=sentEl(sh.i);if(scroll&&el)el.scrollIntoView({block:'center',behavior:'smooth'});
  renderAr();
}
function renderAr(){
  const box=$('#sh-ar');box.hidden=!sh.showAr;if(!sh.showAr||!sh.p)return;
  const s=sh.p.s[sh.i];
  if(s.ar){box.textContent=s.ar;return}
  box.innerHTML='<button class="btn small ghost" id="sh-trs">ترجم هذه الجملة</button>';
  $('#sh-trs').onclick=async()=>{box.textContent='جارٍ الترجمة…';try{const r=await askT(`Translate this English sentence into natural Arabic: "${s.en.replace(/"/g,"'")}". Return ONLY JSON: {"ar":"..."}`,30000);s.ar=r&&r.ar||'';box.textContent=s.ar||'—'}catch(e){box.textContent=errText(e)}};
}
function renderShBar(){
  $('#sh-play').innerHTML=sh.playing?ICON_PAUSE:ICON_PLAY;$('#sh-play').setAttribute('aria-label',sh.playing?'إيقاف':'تشغيل');
  $('#sh-mode').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.m===sh.mode);b.onclick=()=>{sh.mode=b.dataset.m;LS.set('shMode',sh.mode);renderShBar()}});
  $('#sh-tr').textContent=sh.showAr?'إخفاء الترجمة':'الترجمة';
  $('#sh-speed').innerHTML=[[0.4,'أبطأ'],[0.55,'بطيء جدًا'],[0.7,'بطيء'],[0.85,'هادئ'],[1,'طبيعي']].map(([v,l])=>`<button data-sp="${v}" aria-pressed="${Math.abs(st.speed-v)<.01}">${l}</button>`).join('');
  $('#sh-speed').querySelectorAll('button').forEach(b=>b.onclick=()=>{setSpeed(+b.dataset.sp);renderSpeed();renderShBar()});
}
async function playFrom(i,single){
  stopAll();const id=runId;sh.playing=true;renderShBar();
  for(let k=i;k<sh.p.s.length;k++){
    if(id!==runId)return;setCur(k);
    const el=sentEl(k);const spans=[...el.querySelectorAll('.w')];
    $('#sh-cue').textContent=sh.mode==='sync'?'ردّد مع الناطق':'استمع';
    await speak(sh.p.s[k].en,st.speed,{onb:e=>{if(id!==runId)return;const ci=e.charIndex;let best=null;for(const sp of spans){if(+sp.dataset.k<=ci)best=sp;else break}spans.forEach(x=>x.classList.remove('wlive'));if(best)best.classList.add('wlive')}});
    spans.forEach(x=>x.classList.remove('wlive'));
    if(id!==runId)return;
    if(sh.mode==='after'){$('#sh-cue').textContent='دورك: ردّد الجملة';await sleep(1000+spans.length*480/st.speed)}else await sleep(350);
    if(id!==runId)return;
    if(single)break;
  }
  if(id===runId){sh.playing=false;$('#sh-cue').textContent=single?'':'أحسنت! انتهت الفقرة.';renderShBar();logPractice()}
}
function haltSh(){stopAll();sh.playing=false;renderShBar()}
$('#sh-play').onclick=()=>{if(sh.playing){haltSh();return}playFrom(sh.i,false)};
$('#sh-rep').onclick=()=>playFrom(sh.i,true);
$('#sh-prev').onclick=()=>{haltSh();setCur(sh.i-1)};
$('#sh-next').onclick=()=>{haltSh();setCur(sh.i+1)};
$('#sh-voice').onclick=()=>{haltSh();openVoices()};
$('#sh-tr').onclick=()=>{sh.showAr=!sh.showAr;LS.set('shAr',sh.showAr);renderShBar();renderAr()};
$('#sh-back').onclick=()=>{haltSh();$('#wpop').hidden=true;$('#sh-player').hidden=true;$('#sh-list').hidden=false;syncComposer();window.scrollTo({top:0})};
function gloss(word){
  const w=word.toLowerCase().replace(/’/g,"'");const g=(sh.p&&sh.p.g)||{};
  const tries=[w,w.replace(/'s$/,''),w.replace(/ies$/,'y'),w.replace(/es$/,''),w.replace(/s$/,''),w.replace(/ed$/,''),w.replace(/d$/,''),w.replace(/ing$/,''),w.replace(/ly$/,'')];
  for(const t of tries){if(g[t])return g[t]}for(const t of tries){if(COMMON[t])return COMMON[t]}return null;
}
function onWord(span){
  haltSh();$('#sh-text').querySelectorAll('.tapped').forEach(x=>x.classList.remove('tapped'));span.classList.add('tapped');
  const word=span.textContent;const si=+span.closest('.sent').dataset.s;const key=word.toLowerCase()+'|'+si;
  let ar=gloss(word)||sh.cache[key]||null;
  const pop=$('#wpop');pop.hidden=false;pop.dataset.key=key;
  pop.innerHTML=`<div class="top"><button class="iconbtn" id="wp-say" aria-label="استمع">${PLAY}</button><b>${esc(word)}</b><button class="x" id="wp-x" aria-label="إغلاق">×</button></div>
   <div class="war" id="wp-ar">${ar?esc(ar):'جارٍ الترجمة…'}</div>
   <div class="acts"><button class="btn small ghost" id="wp-slow">ببطء</button><button class="btn small ghost" id="wp-from">شغّل من هذه الجملة</button><button class="btn small ghost" id="wp-train">تدرّب على نطقها</button><button class="btn small ghost" id="wp-save">احفظ</button></div>`;
  speak(word,Math.min(st.speed,0.8));
  $('#wp-x').onclick=()=>{pop.hidden=true;span.classList.remove('tapped')};
  $('#wp-say').onclick=()=>{stopAll();speak(word,st.speed)};
  $('#wp-slow').onclick=()=>{stopAll();speak(word,0.55)};
  $('#wp-from').onclick=()=>{pop.hidden=true;playFrom(si,false)};
  $('#wp-train').onclick=()=>{pop.hidden=true;const w=word.toLowerCase().replace(/[^a-z'-]/g,'');showView('words');$('#q').value=w;choose({word:w,ar:ar||''});window.scrollTo({top:0})};
  $('#wp-save').onclick=()=>{const w=word.toLowerCase();const s=LS.get('saved',[]);if(!s.some(x=>x.word===w)){s.unshift({word:w,ipa:'',ar:ar||''});LS.set('saved',s)}$('#wp-save').textContent='محفوظة ✓'};
  if(!ar){
    askT(`In the sentence "${sh.p.s[si].en.replace(/"/g,"'")}", what does the English word "${word}" mean? Return ONLY JSON: {"ar":"short Arabic meaning in this context"}`,30000)
      .then(r=>{ar=(r&&r.ar)||'—';sh.cache[key]=ar;if(pop.dataset.key===key)$('#wp-ar').textContent=ar})
      .catch(e=>{if(pop.dataset.key===key)$('#wp-ar').textContent='الترجمة غير متاحة الآن. '+(e&&e.code?`(${e.code})`:'')});
  }
}
$('#sh-use').onclick=()=>{
  const t=$('#sh-paste').value.replace(/\s+/g,' ').trim().slice(0,3000);
  if(!/[A-Za-z]/.test(t)){$('#sh-status').textContent='الصق فقرة إنجليزية أولًا.';return}
  const sents=(t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)||[t]).map(x=>x.trim()).filter(Boolean);
  $('#sh-status').textContent='';openPassage({t:'نص من عندك',ta:'',lv:'',s:sents.map(en=>({en})),g:{}});
};
$('#sh-gen').onclick=async()=>{
  const topic=$('#sh-topic').value.trim();if(!topic){$('#sh-status').textContent='اكتب الموضوع أولًا.';return}
  const btn=$('#sh-gen');btn.disabled=true;$('#sh-status').textContent='جارٍ إنشاء الفقرة…';
  try{
    const r=await askT(`Write a short English paragraph for shadowing practice (pronunciation and fluency) for an Arabic-speaking learner. Topic: "${topic.replace(/"/g,'')}". Level: CEFR ${sh.lvl}. 8-10 sentences (about 150 words) in a natural spoken style. If the topic allows, make it a short story or reflection that ends with a clear life lesson. Write original text; do not quote copyrighted works. Return ONLY JSON: {"title":"short English title","title_ar":"Arabic title","sentences":[{"en":"sentence","ar":"Arabic translation"}],"glossary":{"word in lowercase exactly as it appears":"short Arabic meaning in context"}}. The glossary must cover every noun, verb, adjective and adverb in the paragraph.`,90000);
    if(!r||!Array.isArray(r.sentences)||!r.sentences.length)throw{code:'empty'};
    const g={};Object.entries(r.glossary||{}).forEach(([k,v])=>g[String(k).toLowerCase()]=v);
    $('#sh-status').textContent='';openPassage({t:r.title||topic,ta:r.title_ar||'',lv:sh.lvl,s:r.sentences.filter(s=>s&&s.en),g});
  }catch(e){$('#sh-status').textContent='تعذّر إنشاء الفقرة. '+errText(e)}
  btn.disabled=false;
};
renderShList();

/* ---------- voice picker ---------- */
const ACC={US:'أمريكي',GB:'بريطاني',AU:'أسترالي',IE:'أيرلندي',IN:'هندي',ZA:'جنوب أفريقي',NZ:'نيوزيلندي',CA:'كندي',SG:'سنغافوري',SC:'اسكتلندي'};
function engVoices(){
  loadVoices();const seen=new Set();const want=st.accent==='uk'?'GB':'US';
  const q=v=>/Premium|Enhanced|Natural|Neural|Google/i.test(v.name)?0:1;
  return voices.filter(v=>/^en[-_]/i.test(v.lang)&&!NOV.test(v.name)&&!seen.has(v.name+v.lang)&&seen.add(v.name+v.lang))
    .sort((a,b)=>{const ra=a.lang.toUpperCase().endsWith(want)?0:1,rb=b.lang.toUpperCase().endsWith(want)?0:1;return ra-rb||q(a)-q(b)||a.name.localeCompare(b.name)});
}
function openVoices(){renderVoices();$('#vsheet').hidden=false}
function renderVoices(){
  const list=engVoices();const box=$('#vsheet');
  const auto=!st.voice||!voices.some(v=>v.name===st.voice);
  box.innerHTML=`<div class="vhead"><h3>اختر صوت الناطق</h3><button class="btn small ghost" id="v-close">تم</button></div>
  <p class="hint">اضغط ▶ لتسمع كل صوت، ثم «اختر» للصوت الأوضح لك. الاختيار يُطبَّق على التطبيق كله.</p>
  <div class="vrow"><div class="n"><b style="font-family:var(--f-body);direction:rtl;text-align:right">تلقائي</b><small>أفضل صوت ${st.accent==='uk'?'بريطاني':'أمريكي'} متاح على جهازك</small></div><button class="sel" data-auto="1" aria-pressed="${auto}">${auto?'مختار ✓':'اختر'}</button></div>
  ${list.length?list.map((v,i)=>{const cc=(v.lang.split(/[-_]/)[1]||'').toUpperCase();const hq=/Premium|Enhanced|Natural|Neural|Google/i.test(v.name);const on=!auto&&v.name===st.voice;
    return `<div class="vrow"><button class="iconbtn" data-p="${i}" aria-label="استمع">${PLAY}</button><div class="n"><b>${esc(v.name)}</b><small>${ACC[cc]||esc(v.lang)}${hq?' · <span class="vq">جودة عالية</span>':''}</small></div><button class="sel" data-i="${i}" aria-pressed="${on}">${on?'مختار ✓':'اختر'}</button></div>`}).join('')
   :'<p class="hint">جارٍ تحميل الأصوات… إن لم تظهر، أغلق هذه النافذة وافتحها مرة أخرى.</p>'}
  <p class="hint" style="margin-top:12px">💡 لأصوات أوضح على الآيفون: الإعدادات ← تسهيلات الاستخدام ← المحتوى المنطوق ← الأصوات ← الإنجليزية، ونزّل صوتًا مكتوبًا بجانبه «محسّن» أو «Premium»، ثم ارجع هنا واختره.</p>`;
  $('#v-close').onclick=()=>{stopAll();box.hidden=true;if(sh&&sh.p)renderShBar()};
  box.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{stopAll();speak('Hello! This is how I sound. Let us practice together.',st.speed,{voice:list[+b.dataset.p]})});
  box.querySelectorAll('.sel').forEach(b=>b.onclick=()=>{if(b.dataset.auto){st.voice=''}else{st.voice=list[+b.dataset.i].name;stopAll();speak('Great choice.',st.speed)}LS.set('voice',st.voice);renderVoices()});
}

/* ---------- tabs ---------- */
function showView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===v));
  if(v==='mine')renderMine();
  syncComposer();
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{stopAll();anim++;if(typeof sh!=='undefined'){sh.playing=false;if(sh.p)renderShBar()}showView(b.dataset.v);if(b.dataset.v==='sounds'){$('#s-detail').hidden=true;$('#s-list').hidden=false;renderGrid()}window.scrollTo({top:0})});
