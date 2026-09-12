// Per-ayah audio keeps the text aligned with the recitation without estimated timings.
const quranAudio=document.querySelector('#quran-audio'),quranSurah=document.querySelector('#quran-surah'),quranContinuous=document.querySelector('#quran-continuous'),quranStatus=document.querySelector('#quran-status');
const ayahList=document.querySelector('#quran-ayahs'),ayahSelect=document.querySelector('#quran-ayah'),retry=document.querySelector('#quran-retry'),previous=document.querySelector('#quran-previous'),next=document.querySelector('#quran-next'),follow=document.querySelector('#quran-follow');
let requestId=0,playbackId=0,controller,ayahs=[],activeAyah=0,loadedSurah=0;
const cache=new Map();
surahNames.forEach((name,index)=>{const option=document.createElement('option');option.value=String(index+1);option.textContent=`${index+1}. ${name}`;quranSurah.append(option)});
function setControls(){previous.disabled=!ayahs.length||activeAyah===0;next.disabled=!ayahs.length||activeAyah===ayahs.length-1;ayahSelect.disabled=!ayahs.length;}
function followAyah(){
  const row=ayahList.children[activeAyah];
  if(row&&follow.checked){const top=row.offsetTop-ayahList.offsetTop-(ayahList.clientHeight-row.offsetHeight)/2;ayahList.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
}
function highlight(){
  Array.from(ayahList.children).forEach((row,index)=>{row.classList.toggle('active',index===activeAyah);if(index===activeAyah)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});
  ayahSelect.value=String(activeAyah);setControls();followAyah();
}
function description(){return `${surahNames[loadedSurah-1]} · Ayah ${activeAyah+1} of ${ayahs.length}`;}
function playCurrent(){
  const token=++playbackId;
  quranAudio.play().catch(()=>{if(token===playbackId){quranStatus.textContent='Unable to play. Press play to retry, or reload the surah.';retry.hidden=false;}});
}
function selectAyah(index,autoplay=false){
  if(index<0||index>=ayahs.length)return;
  playbackId++;quranAudio.pause();activeAyah=index;
  quranAudio.src=`https://cdn.islamic.network/quran/audio/128/ar.alafasy/${ayahs[index].number}.mp3`;
  highlight();quranStatus.textContent=`${description()} — press play.`;
  if(autoplay)playCurrent();
}
function renderAyahs(){
  ayahList.replaceChildren();ayahSelect.replaceChildren();
  ayahs.forEach((ayah,index)=>{
    const row=document.createElement('li'),button=document.createElement('button'),arabic=document.createElement('span'),translation=document.createElement('span'),number=document.createElement('span'),option=document.createElement('option');
    button.type='button';button.className='quran-verse';button.setAttribute('aria-label',`Play ayah ${index+1}`);
    number.className='quran-verse-number';number.textContent=String(index+1);
    arabic.className='quran-arabic';arabic.lang='ar';arabic.dir='rtl';arabic.textContent=ayah.text;
    translation.className='quran-translation';translation.textContent=ayah.translation;
    button.append(number,arabic,translation);button.addEventListener('click',()=>selectAyah(index,true));row.append(button);ayahList.append(row);
    option.value=String(index);option.textContent=`Ayah ${index+1}`;ayahSelect.append(option);
  });
}
async function selectQuranSurah(autoplay=false){
  const token=++requestId,surah=Number(quranSurah.value);playbackId++;controller?.abort();controller=new AbortController();
  quranAudio.pause();quranAudio.removeAttribute('src');quranAudio.load();ayahs=[];ayahList.replaceChildren();ayahSelect.replaceChildren();setControls();retry.hidden=true;
  ayahList.setAttribute('aria-busy','true');quranStatus.textContent=`Loading ${surahNames[surah-1]}…`;
  const currentController=controller,timeout=setTimeout(()=>currentController.abort(),20000);
  try{
    let data=cache.get(surah);
    if(!data){
      const response=await fetch(`https://api.alquran.cloud/v1/surah/${surah}/editions/ar.alafasy,en.itani`,{signal:currentController.signal});
      if(!response.ok)throw Error('Request failed');
      const body=await response.json();
      const arabic=body.data?.find(edition=>edition.edition.identifier==='ar.alafasy'),english=body.data?.find(edition=>edition.edition.identifier==='en.itani');
      if(!arabic?.ayahs?.length||arabic.number!==surah||english?.ayahs?.length!==arabic.ayahs.length)throw Error('Incomplete surah');
      data=arabic.ayahs.map((ayah,index)=>{
        const translation=english.ayahs[index];
        if(ayah.number!==translation.number||ayah.numberInSurah!==index+1||!Number.isInteger(ayah.number)||typeof ayah.text!=='string'||typeof translation.text!=='string')throw Error('Mismatched ayahs');
        return {number:ayah.number,text:ayah.text,translation:translation.text};
      });cache.set(surah,data);
    }
    if(token!==requestId)return;
    loadedSurah=surah;ayahs=data;renderAyahs();selectAyah(0,autoplay);
  }catch(error){if(token===requestId){quranStatus.textContent='Could not load this surah. Check your connection and select Retry.';retry.hidden=false;}}
  finally{clearTimeout(timeout);if(token===requestId)ayahList.setAttribute('aria-busy','false');}
}
quranSurah.addEventListener('change',()=>selectQuranSurah(!quranAudio.paused));
ayahSelect.addEventListener('change',()=>selectAyah(Number(ayahSelect.value),!quranAudio.paused));
previous.addEventListener('click',()=>selectAyah(activeAyah-1,!quranAudio.paused));next.addEventListener('click',()=>selectAyah(activeAyah+1,!quranAudio.paused));
retry.addEventListener('click',()=>selectQuranSurah(false));follow.addEventListener('change',followAyah);
quranAudio.addEventListener('play',()=>{document.querySelector('#adhan-audio').pause();});
quranAudio.addEventListener('playing',()=>{if(!ayahs.length)return;quranStatus.textContent=`Playing ${description()}`;retry.hidden=true;followAyah();});
quranAudio.addEventListener('pause',()=>{if(ayahs.length&&!quranAudio.ended)quranStatus.textContent=`Paused · ${description()}`;});
quranAudio.addEventListener('waiting',()=>{if(ayahs.length)quranStatus.textContent=`Loading audio · ${description()}`;});
quranAudio.addEventListener('error',()=>{if(ayahs.length){quranStatus.textContent='Recitation unavailable. Press play to retry, or reload the surah.';retry.hidden=false;}});
quranAudio.addEventListener('ended',()=>{
  if(!ayahs.length)return;
  if(activeAyah<ayahs.length-1){selectAyah(activeAyah+1,true);return;}
  if(quranContinuous.checked){quranSurah.value=String(loadedSurah%114+1);selectQuranSurah(true);}
  else quranStatus.textContent='Surah finished. Select an ayah to listen again.';
});
document.querySelector('#adhan-audio').addEventListener('play',()=>{requestId++;playbackId++;controller?.abort();quranAudio.pause();ayahList.setAttribute('aria-busy','false');if(!ayahs.length){retry.hidden=false;quranStatus.textContent='Loading paused for adhan. Select Retry when ready.';}});
selectQuranSurah();
