import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createAssistantPilot } from '../public/assistant-pilot.js';
import { storageKey } from '../public/assistant-pilot-state.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;
function memoryStorage(values = new Map()) { return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}; }
const realContext = {wallet:{balance:307},contactCount:45,tasks:[{id:'t1',title:'聯繫王小姐',dueAt:'2026-09-08T06:00:00.000Z',status:'pending'},{id:'t2',title:'已完成的事',status:'completed'}],member:{userId:'owner',displayName:'Tony'}};
function setup(options={}) {
  const { document, Event } = parseHTML('<!doctype html><html><body><main id="app"></main></body></html>');
  const timers = new Set();
  const voiceCalls = [];
  const speech = {cancelCount:0,getVoices:()=>[{lang:'zh-TW',name:'中文',voiceURI:'test-zh'}],addEventListener(){},removeEventListener(){},cancel(){this.cancelCount+=1;},speak(utterance){voiceCalls.push(utterance);utterance.onstart?.();}};
  class Utterance { constructor(text){this.text=text;} }
  class Picture { set src(value){this._src=value;queueMicrotask(()=>this.onload?.());} }
  const localStorage=options.localStorage||memoryStorage();
  const sessionStorage=options.sessionStorage||memoryStorage();
  const win={Image:Picture,SpeechSynthesisUtterance:Utterance,speechSynthesis:speech,AbortController,localStorage,sessionStorage,
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    setTimeout(fn,ms){const id=realSetTimeout(fn,ms);id.unref();timers.add(id);return id;},clearTimeout(id){clearTimeout(id);timers.delete(id);},
    setInterval(fn,ms){const id=realSetInterval(fn,ms);id.unref();timers.add(id);return id;},clearInterval(id){clearInterval(id);timers.delete(id);}};
  Object.defineProperty(document,'defaultView',{value:win});
  // LinkeDOM exposes select.value as getter-only; real browsers have a setter.
  const createElement=document.createElement.bind(document);
  document.createElement=(tag,...args)=>{const node=createElement(tag,...args);if(tag==='select'){let chosen='';Object.defineProperty(node,'value',{get:()=>chosen,set:value=>{chosen=String(value);}});}return node;};
  Object.defineProperty(document,'hidden',{value:false,writable:true});
  const root=document.querySelector('#app');
  const member={userId:'owner',displayName:'Tony'};
  const calls=[]; const denied=[]; const navigations=[];
  const api=async(path,config={})=>{calls.push({path,config});if(options.api)return options.api(path,config);if(path.endsWith('context'))return realContext;if(path.endsWith('reply'))return {reply:'已收到你的需求',action:null};return {task:{id:'created'},replayed:false};};
  const controller=createAssistantPilot({root,api,member,onNavigate:d=>navigations.push(d),onOverview:()=>navigations.push('original'),onAccessDenied:error=>{denied.push(error);controller.dispose();}});
  function click(selector){const button=typeof selector==='string'?root.querySelector(selector):selector;assert.ok(button,`button exists ${selector}`);button.dispatchEvent(new Event('click',{bubbles:true}));}
  function send(value){const input=root.querySelector('textarea');input.value=value;input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
  function dispose(){controller.dispose();for(const timer of timers){clearTimeout(timer);clearInterval(timer);} }
  controller.render();
  return {root,document,Event,controller,click,send,calls,denied,navigations,voiceCalls,speech,localStorage,sessionStorage,dispose};
}

test('render actual member data; send JSON with exactly 8 bounded history entries, literal model text stays inert',async()=>{
  const session=memoryStorage();session.setItem(storageKey({userId:'owner'},'conversation'),JSON.stringify({history:Array.from({length:14},(_,i)=>({role:i%2?'assistant':'user',content:`${i}:`+'x'.repeat(1900)}))}));
  const env=setup({sessionStorage:session,api:async(path)=>path.endsWith('context')?realContext:{reply:'<img src=x onerror="alert(1)">',action:{type:'navigate',destination:'javascript:alert(1)',label:'危險'}}});
  try{await tick();env.send('安排下一步');await tick();const call=env.calls.find(c=>c.path.endsWith('reply'));assert.equal(typeof call.config.body,'string');const body=JSON.parse(call.config.body);assert.equal(body.message,'安排下一步');assert.equal(body.history.length,8);assert.ok(body.history.every(x=>x.content.length<=1200));assert.ok(env.root.textContent.includes('<img src=x onerror="alert(1)">'));assert.equal(env.root.querySelectorAll('.vap-messages img').length,0);assert.equal(env.root.querySelectorAll('.vap-action-area button').length,0);env.click('[data-pilot-action="overview"]');assert.ok(env.root.textContent.includes('307'));assert.ok(env.root.textContent.includes('45'));assert.ok(env.root.textContent.includes('聯繫王小姐'));assert.ok(!env.root.textContent.includes('已完成的事'));}finally{env.dispose();}
});

test('switch persona retains chat and draft, stores no token and never starts voice automatically',async()=>{
  const draft={type:'task',draft:{title:'回訪王小姐',dueAt:'2026-09-08T06:00:00.000Z'},confirmationToken:'private-confirm-token'};
  const env=setup({api:async(path)=>path.endsWith('context')?realContext:{reply:'請確認草稿',action:draft}});
  try{await tick();env.send('建立明天下午回訪任務');await tick();assert.ok(env.root.textContent.includes('請確認草稿'));env.click('[data-pilot-action="personas"]');env.click(env.root.querySelectorAll('.vap-persona-choice')[1]);assert.ok(env.root.textContent.includes('以安'));assert.ok(env.root.textContent.includes('請確認草稿'));assert.ok(env.root.textContent.includes('回訪王小姐'));assert.equal(env.voiceCalls.length,0);const stored=env.sessionStorage.getItem(storageKey({userId:'owner'},'conversation'));assert.ok(!stored.includes('private-confirm-token'));assert.ok(!stored.includes('confirmationToken'));assert.equal(JSON.parse(env.localStorage.getItem(storageKey({userId:'owner'},'preferences'))).persona,'professional');}finally{env.dispose();}
});

test('sound needs explicit click; switching overview and hidden document stop the owned utterance',async()=>{
  const env=setup();try{await tick();assert.equal(env.voiceCalls.length,0);env.click('[data-pilot-action="sound"]');assert.equal(env.voiceCalls.length,1);assert.equal(env.root.querySelector('.vap-stop').hidden,false);const before=env.speech.cancelCount;env.click('[data-pilot-action="overview"]');assert.ok(env.speech.cancelCount>before);env.click('[data-pilot-action="assistant"]');assert.equal(env.voiceCalls.length,1);env.click('[data-pilot-action="sound"]');env.click('[data-pilot-action="sound"]');const playing=env.speech.cancelCount;env.document.hidden=true;env.document.dispatchEvent(new env.Event('visibilitychange'));assert.ok(env.speech.cancelCount>playing);}finally{env.dispose();}
});

test('failed confirmation retains draft; in-flight duplicate click cannot create twice; success only after server task',async()=>{
  let attempt=0,resolveConfirm;
  const draft={type:'task',draft:{title:'安排合作討論',dueAt:'2026-09-08T06:00:00.000Z'},confirmationToken:'same-token'};
  const env=setup({api:async(path)=>{if(path.endsWith('context'))return realContext;if(path.endsWith('reply'))return {reply:'請確認這件事',action:draft};attempt++;if(attempt===1)throw new Error('network');if(attempt===2)return {ok:true,replayed:true};return new Promise(resolve=>resolveConfirm=resolve);}});
  try{await tick();env.send('安排合作討論');await tick();env.click('[data-pilot-action="confirm"]');await tick();assert.ok(env.root.querySelector('.vap-draft'));assert.ok(env.root.textContent.includes('草稿已保留'));assert.ok(!env.root.textContent.includes('已建立測試任務'));env.click('[data-pilot-action="confirm"]');await tick();assert.ok(env.root.querySelector('.vap-draft'));assert.ok(!env.root.textContent.includes('已建立測試任務'));env.click('[data-pilot-action="confirm"]');env.click('[data-pilot-action="confirm"]');assert.equal(attempt,3);assert.equal(env.root.querySelector('[data-pilot-action="confirm"]').disabled,true);resolveConfirm({task:{id:'task-real'}});await tick();await tick();assert.equal(env.root.querySelector('.vap-draft'),null);assert.ok(env.root.textContent.includes('已建立測試任務'));assert.ok(env.root.textContent.includes('不發送 LINE／Telegram 通知'));const tokens=env.calls.filter(c=>c.path.endsWith('confirm')).map(c=>JSON.parse(c.config.body).confirmationToken);assert.deepEqual(tokens,['same-token','same-token','same-token']);}finally{env.dispose();}
});

for(const status of [401,403])test(`${status} revokes interaction and clears only current member state`,async()=>{
  const session=memoryStorage();session.setItem(storageKey({userId:'someone-else'},'conversation'),'keep-other-account');
  const local=memoryStorage();local.setItem(storageKey({userId:'owner'},'preferences'),JSON.stringify({persona:'energetic'}));
  let deny=false;
  const env=setup({sessionStorage:session,localStorage:local,api:async(path)=>{if(deny)throw Object.assign(new Error('denied'),{status});return path.endsWith('context')?realContext:{reply:'正常回覆',action:null};}});
  try{await tick();env.send('你好');await tick();assert.ok(session.getItem(storageKey({userId:'owner'},'conversation')));deny=true;env.send('再次詢問');await tick();assert.equal(env.denied.length,1);assert.equal(env.denied[0].status,status);assert.equal(env.root.children.length,0);assert.equal(session.getItem(storageKey({userId:'owner'},'conversation')),null);assert.equal(local.getItem(storageKey({userId:'owner'},'preferences')),null);assert.equal(session.getItem(storageKey({userId:'someone-else'},'conversation')),'keep-other-account');}finally{env.dispose();}
});
