const {JSDOM}=require('jsdom'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://example.test/Nutq-/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,ctx=dom.getInternalVMContext();
w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.localStorage.setItem('nutq:saved',JSON.stringify([{word:'port',ar:'ميناء',ipa:''}]));w.localStorage.setItem('nutq:voice',JSON.stringify('preserved'));
w.fetch=async()=>({ok:true,json:async()=>({data:{reply:'Hello!',reply_ar:'أهلا',suggestions:[],correction:{ok:false,better:'I am well.',notes_ar:['استخدم am'],practice:[]}}})});
for(const file of ['dictionary','ai-client','app'])vm.runInContext(fs.readFileSync(root+'/js/'+file+'.js','utf8'),ctx);
const click=s=>w.document.querySelector(s).click();
for(const tab of ['sounds','pairs','shadow','mine','talk']){click(`nav.tabs button[data-v="${tab}"]`);assert(w.document.querySelector('#v-'+tab).classList.contains('on'));}
assert(w.document.querySelector('#saved').textContent.includes('port'));
click('#t-mode button[data-m="local"]');click('#t-start');assert(w.document.querySelector('.msg.them'));
click('#t-back');click('#ai-settings');w.document.querySelector('#ai-endpoint').value='https://example.workers.dev';w.document.querySelector('#ai-token').value='personal-access-test-token';
w.document.querySelector('#ai-form').dispatchEvent(new w.Event('submit',{cancelable:true}));click('#ai-close');
click('#t-mode button[data-m="ai"]');await vm.runInContext('startTalk()',ctx);assert(w.document.querySelector('.msg.them').textContent.includes('Hello'));
w.document.querySelector('#t-in').value='I is well';await vm.runInContext('sendTurn()',ctx);
assert.equal(JSON.parse(w.localStorage.getItem('nutq:learningCorrections'))[0].better,'I am well.');
assert.equal(JSON.parse(w.localStorage.getItem('nutq:saved'))[0].word,'port');assert.equal(JSON.parse(w.localStorage.getItem('nutq:voice')),'preserved');assert(!Object.keys(w.localStorage).some(k=>/token/i.test(k)));
click('#ai-settings');assert(w.document.querySelector('#ai-errors').textContent.includes('I am well.'));
console.log('PASS DOM: all tabs, local conversation, mocked AI, corrections, existing saved words/settings, token not persisted');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1);});
