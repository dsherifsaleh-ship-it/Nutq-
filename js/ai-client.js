/* Personal gateway: provider API keys belong exclusively on the backend. */
window.NutqAI = (() => {
  const get = (key, fallback) => { try { return JSON.parse(localStorage.getItem('nutq:'+key)) ?? fallback; } catch { return fallback; } };
  const set = (key, value) => localStorage.setItem('nutq:'+key, JSON.stringify(value));
  let accessToken = '';
  const configured = () => !!get('aiEndpoint', '');
  function errorText(e) {
    return ({none:'افتح الإعدادات وأضف رابط الخادم أولًا.', auth:'أدخل رمز الدخول الشخصي الصحيح في الإعدادات.', quota:'وصلت إلى حد الاستخدام المحدد للخدمة. راجع إعدادات الخادم.', timeout:'انتهت مهلة الاتصال. حاول مرة أخرى.', offline:'لا يوجد اتصال بالإنترنت. التدريبات الجاهزة متاحة.', network:'تعذّر الاتصال بالخادم. تحقق من الرابط واتصال الإنترنت.', invalid:'وصل رد غير صالح من الخدمة. حاول مرة أخرى.', provider:'الخدمة غير متاحة الآن؛ راجع إعداد الخادم وحساب الخدمة.', configuration:'الخادم لم يكتمل إعداده بعد.'})[e?.code] || 'تعذّر الحصول على رد. حاول مرة أخرى.';
  }
  async function request(path, body) {
    if (!navigator.onLine) throw {code:'offline'};
    const endpoint = get('aiEndpoint', '');
    if (!endpoint) throw {code:'none'};
    if (!accessToken) throw {code:'auth'};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const r = await fetch(endpoint+path, {method:body?'POST':'GET', cache:'no-store', credentials:'omit', headers:{'Authorization':'Bearer '+accessToken, ...(body?{'Content-Type':'application/json'}:{})}, ...(body?{body:JSON.stringify(body)}:{}), signal:controller.signal});
      const data = await r.json().catch(() => {throw {code:'invalid'};});
      if (!r.ok) throw {code:data.code || (r.status===401?'auth':r.status===429?'quota':'provider')};
      return data;
    } catch(e) { if(e.name==='AbortError') throw {code:'timeout'}; if(e.code) throw e; throw {code:'network'}; }
    finally {clearTimeout(timer);}
  }
  async function ask(prompt) {
    const result = await request('/ai', {prompt});
    if(!result.data || typeof result.data!=='object' || Array.isArray(result.data)) throw {code:'invalid'};
    return result.data;
  }
  function rememberCorrection(original, correction) {
    if(!correction || correction.ok || typeof correction.better!=='string' || !correction.better) return;
    const items=get('learningCorrections',[]);
    items.unshift({original:String(original).slice(0,2000), better:correction.better.slice(0,2000), notes:Array.isArray(correction.notes_ar)?correction.notes_ar.filter(n=>typeof n==='string').slice(0,2):[], date:new Date().toISOString()});
    try{set('learningCorrections',items.slice(0,100));}catch{}
  }
  function openSettings() {
    const d=document.getElementById('settings-dialog');
    d.innerHTML=`<h2 id="settings-title">إعدادات نُطق · 1.1</h2>
      <p>التدريبات تعمل الآن. لتمكين المحادثة والتصحيح والترجمة، اربط خادمك الشخصي.</p>
      <form id="ai-form"><label for="ai-endpoint">رابط الخدمة</label><input id="ai-endpoint" type="url" placeholder="https://nutq-api.example.workers.dev" dir="ltr" required>
      <label for="ai-token">رمز الدخول الشخصي للخادم</label><input id="ai-token" type="password" autocomplete="off" dir="ltr" placeholder="رمز الدخول، وليس مفتاح OpenAI">
      <p class="hint">رمز الدخول يبقى في هذه الجلسة فقط؛ أدخله مجددًا عند إعادة فتح التطبيق. أرسل نص المحادثة إلى خادمك فقط عند استعمال ميزات الذكاء الاصطناعي. هذه النسخة لا ترفع تسجيلات صوتية.</p>
      <div class="settings-actions"><button type="submit" class="btn">حفظ الإعدادات</button><button type="button" id="ai-test" class="btn ghost">اختبار الاتصال</button></div></form>
      <p id="ai-result" role="status" aria-live="polite"></p>
      <details><summary>الأخطاء المحفوظة للمراجعة</summary><div id="ai-errors"></div></details>
      <div class="settings-actions"><button id="ai-disconnect" class="btn ghost">فصل الخدمة</button><button id="ai-close" class="btn">تم</button></div>`;
    d.querySelector('#ai-endpoint').value=get('aiEndpoint','');
    d.querySelector('#ai-token').value=accessToken;
    const msg=d.querySelector('#ai-result');
    function save() {
      const u=new URL(d.querySelector('#ai-endpoint').value);
      if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || /(^|\.)api\.openai\.com$/i.test(u.hostname)) throw Error();
      const token=d.querySelector('#ai-token').value.trim();
      if(/^sk-/.test(token)) throw Error();
      set('aiEndpoint',u.href.replace(/\/$/,''));accessToken=token;
      window.dispatchEvent(new Event('nutq-ai-settings'));
    }
    d.querySelector('#ai-form').onsubmit=e=>{e.preventDefault();try{save();msg.textContent='تم الحفظ. اختر الشريك الذكي من تبويب المحادثة.';}catch{msg.textContent='أدخل رابط خادم HTTPS ورمز دخوله، وليس مفتاح خدمة الذكاء الاصطناعي.';}};
    d.querySelector('#ai-test').onclick=async e=>{try{save();e.target.disabled=true;msg.textContent='جارٍ اختبار الاتصال…';const r=await request('/health');msg.textContent=r.ready?'الخادم جاهز. اختبار الاتصال لا يستهلك طلب ذكاء اصطناعي.':'الخادم متصل ويحتاج استكمال الإعدادات.';}catch(err){msg.textContent=errorText(err);}finally{e.target.disabled=false;}};
    d.querySelector('#ai-disconnect').onclick=()=>{localStorage.removeItem('nutq:aiEndpoint');accessToken='';d.querySelector('#ai-token').value='';d.querySelector('#ai-endpoint').value='';msg.textContent='تم فصل الخدمة.';window.dispatchEvent(new Event('nutq-ai-settings'));};
    d.querySelector('#ai-close').onclick=()=>d.close();
    const items=get('learningCorrections',[]), box=d.querySelector('#ai-errors');
    if(!items.length)box.textContent='ستظهر هنا تصحيحات المحادثة الذكية، حتى 100 تصحيح.';
    items.slice(0,20).forEach(item=>{const row=document.createElement('div');row.className='learning-error';for(const text of [item.original,'← '+item.better,...item.notes]){const p=document.createElement('p');p.textContent=text;row.append(p);}box.append(row);});
    d.showModal();
  }
  document.getElementById('ai-settings').onclick=openSettings;
  return {configured,ask,errorText,rememberCorrection};
})();
