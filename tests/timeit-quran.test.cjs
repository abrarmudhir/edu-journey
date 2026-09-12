const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../timeit/index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../timeit/quran.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(surah){return {data:['ar.alafasy','en.itani'].map(identifier=>({number:surah,edition:{identifier},ayahs:[0,1,2].map(i=>({number:surah*10+i,numberInSurah:i+1,text:`${identifier} verse ${i+1}`}))}))};}
function harness(fetcher=async url=>({ok:true,json:async()=>fixture(Number(url.match(/surah\/(\d+)/)[1]))})){
 const elements={};
 function element(){return {value:'1',checked:true,paused:true,hidden:false,disabled:false,handlers:{},children:[],attributes:{},offsetTop:0,offsetHeight:100,clientHeight:300,
  classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';},
  addEventListener(e,f){this.handlers[e]=f;},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},scrollTo(options){this.scroll=options;},load(){},
  pause(){this.paused=true;},play(){if(this.fail)return Promise.reject(Error('Blocked'));this.paused=false;return Promise.resolve();}};}
 const get=id=>elements[id]??=element();
 vm.runInNewContext(html.match(/<script id="quran-player-script">([\s\S]*?)<\/script>/)[1]+script,{document:{querySelector:get,createElement:element},fetch:fetcher,AbortController,setTimeout,clearTimeout,matchMedia:()=>({matches:false})});
 return {get,audio:get('#quran-audio'),select:get('#quran-surah'),list:get('#quran-ayahs'),status:get('#quran-status'),continuous:get('#quran-continuous'),adhan:get('#adhan-audio')};
}
test('all 114 surahs, aligned text and first ayah load without autoplay',async()=>{
 const h=harness();await flush();assert.equal(h.select.children.length,114);assert.equal(h.select.children[113].textContent,'114. An-Nas');assert.equal(h.list.children.length,3);assert.match(h.audio.src,/\/10.mp3$/);assert.equal(h.audio.paused,true);assert.equal(h.list.children[0].attributes['aria-current'],'true');
 assert.equal(h.list.children[0].children[0].children[1].textContent,'ar.alafasy verse 1');
 assert.equal(h.list.children[0].children[0].children[2].textContent,'en.itani verse 1');
});
test('ended moves audio and highlight together even with next-surah playback off',async()=>{
 const h=harness();await flush();h.continuous.checked=false;h.audio.handlers.ended();assert.match(h.audio.src,/\/11.mp3$/);assert.equal(h.audio.paused,false);assert.equal(h.list.children[1].attributes['aria-current'],'true');assert.equal(h.list.children[0].attributes['aria-current'],undefined);
 h.audio.handlers.ended();h.audio.handlers.ended();assert.match(h.status.textContent,/Surah finished/);assert.equal(h.select.value,'1');
});
test('continuous playback wraps from An-Nas to Al-Fatihah',async()=>{
 const h=harness();await flush();h.select.value='114';h.select.handlers.change();await flush();for(let i=0;i<3;i++)h.audio.handlers.ended();await flush();assert.equal(h.select.value,'1');assert.match(h.audio.src,/\/10.mp3$/);assert.equal(h.audio.paused,false);
});
test('clicking a verse plays it; navigation preserves paused state',async()=>{
 const h=harness();await flush();h.list.children[2].children[0].handlers.click();assert.match(h.audio.src,/\/12.mp3$/);assert.equal(h.get('#quran-next').disabled,true);h.audio.pause();h.get('#quran-previous').handlers.click();assert.match(h.audio.src,/\/11.mp3$/);assert.equal(h.audio.paused,true);
});
test('rapid surah selection ignores stale responses',async()=>{
 const pending=[];const h=harness(url=>new Promise(resolve=>pending.push({url,resolve})));
 h.select.value='36';h.select.handlers.change();pending[1].resolve({ok:true,json:async()=>fixture(36)});await flush();pending[0].resolve({ok:true,json:async()=>fixture(1)});await flush();assert.match(h.audio.src,/\/360.mp3$/);assert.match(h.status.textContent,/Ya-Sin/);
});
test('failed requests can retry and mismatched translations cannot play',async()=>{
 let fail=true;const h=harness(async()=>{if(fail)throw Error('Offline');return {ok:true,json:async()=>fixture(1)};});await flush();assert.match(h.status.textContent,/Could not load/);assert.equal(h.get('#quran-retry').hidden,false);fail=false;h.get('#quran-retry').handlers.click();await flush();assert.equal(h.list.children.length,3);
 const bad=fixture(1);bad.data[1].ayahs[0].number=99;const b=harness(async()=>({ok:true,json:async()=>bad}));await flush();assert.equal(b.list.children.length,0);assert.match(b.status.textContent,/Could not load/);
});
test('adhan pauses playback and cancels pending autoplay',async()=>{
 const h=harness();await flush();h.audio.paused=false;h.adhan.handlers.play();assert.equal(h.audio.paused,true);
 const pending=[];const b=harness(()=>new Promise(resolve=>pending.push(resolve)));b.audio.paused=false;b.select.value='2';b.select.handlers.change();b.adhan.handlers.play();pending[1]({ok:true,json:async()=>fixture(2)});pending[0]({ok:true,json:async()=>fixture(1)});await flush();assert.equal(b.audio.paused,true);assert.equal(b.list.children.length,0);
});
test('audio errors and blocked play show recovery guidance',async()=>{
 const h=harness();await flush();h.audio.fail=true;h.audio.handlers.ended();await flush();assert.match(h.status.textContent,/Press play to retry/);h.audio.handlers.error();assert.match(h.status.textContent,/Recitation unavailable/);
});
