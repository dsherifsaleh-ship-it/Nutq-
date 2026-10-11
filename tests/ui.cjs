const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{if(!localStorage.getItem('nutq:saved'))localStorage.setItem('nutq:saved',JSON.stringify([{word:'port',ipa:'',ar:'ميناء'}]));});
 const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8765');await page.waitForSelector('#t-scen button');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutq:saved'))[0].word),'port');
 for(const tab of ['sounds','pairs','shadow','mine','talk']){await page.click(`nav.tabs button[data-v="${tab}"]`);assert(await page.locator(`#v-${tab}`).evaluate(e=>e.classList.contains('on')));}
 await page.click('#t-mode button[data-m="local"]');await page.click('#t-start');await page.waitForSelector('.msg.them');
 await page.click('#t-back');
 await page.click('#ai-settings');await page.fill('#ai-endpoint','https://example.workers.dev');await page.fill('#ai-token','test-personal-access-token');
 await page.locator('#ai-form button[type="submit"]').click();await page.click('#ai-close');
 await page.route('https://example.workers.dev/**',route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({data:{reply:'Hello! How are you?',reply_ar:'كيف حالك؟',suggestions:['I am well.'],correction:{ok:false,better:'I am well.',notes_ar:['استخدم am مع I'],practice:[]}}})}));
 await page.click('#t-mode button[data-m="ai"]');await page.click('#t-start');await page.waitForSelector('.msg.them');
 await page.evaluate(()=>{document.querySelector('#t-in').value='I is well';});await page.click('#t-send');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nutq:learningCorrections')||'[]').length===1);
 await page.click('#ai-settings');assert(await page.locator('#ai-errors').innerText().then(s=>s.includes('I am well.')));await page.click('#ai-close');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutq:saved'))[0].word),'port');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>/token/i.test(k))),false);
 await context.setOffline(true);await page.reload();await page.waitForSelector('#t-scen button');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutq:saved'))[0].word),'port');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: tabs, existing data, local dialogue, mocked AI correction, session-only token, reload, offline, mobile width, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
