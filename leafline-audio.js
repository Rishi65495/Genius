/* Leafline reading ambience — generated locally for instant playback and zero asset latency. */
(function(){
  'use strict';
  let ctx=null,master=null,source=null,filter=null,current='rain';
  const presets={
    rain:{label:'Rain',kind:'noise',cutoff:3200,q:.2,gain:.045},
    forest:{label:'Forest',kind:'tone',freq:180,gain:.018},
    brown:{label:'Brown noise',kind:'noise',cutoff:900,q:.15,gain:.055},
    cafe:{label:'Café',kind:'noise',cutoff:1800,q:.5,gain:.025}
  };
  function ensure(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.7;master.connect(ctx.destination);}
  function stop(){if(source){try{source.stop()}catch(e){}try{source.disconnect()}catch(e){}source=null}if(filter){try{filter.disconnect()}catch(e){}filter=null}}
  function noiseBuffer(type){const len=ctx.sampleRate*2,b=ctx.createBuffer(1,len,ctx.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<len;i++){const white=Math.random()*2-1;if(type==='brown'){last=(last+.02*white)/1.02;d[i]=last*3.2}else d[i]=white}return b}
  function play(name){ensure();current=name;stop();const p=presets[name]||presets.rain;if(ctx.state==='suspended')ctx.resume();source=ctx.createBufferSource();source.loop=true;if(p.kind==='noise'){source.buffer=noiseBuffer(name==='brown'?'brown':'white');filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=p.q;source.connect(filter);filter.connect(master)}else{const osc=ctx.createOscillator();const lfo=ctx.createOscillator(),lg=ctx.createGain();osc.type='sine';osc.frequency.value=p.freq;lfo.frequency.value=.09;lg.gain.value=18;lfo.connect(lg).connect(osc.frequency);osc.connect(master);osc.start();source=osc;lfo.start()}master.gain.value=p.gain;source.start();updateButtons(true)}
  function updateButtons(on){document.querySelectorAll('[data-ll-amb]').forEach(b=>b.classList.toggle('playing',on&&b.dataset.llAmb===current));const status=document.querySelector('[data-ll-amb-status]');if(status)status.textContent=on?(presets[current]?.label||'Ambience'):'Off'}
  function off(){stop();if(master)master.gain.value=0;updateButtons(false)}
  function build(){
    if(document.getElementById('ll-ambience'))return;
    const panel=document.createElement('div');panel.id='ll-ambience';panel.innerHTML='<span class="ll-amb-title">Reading ambience</span><span class="ll-amb-status" data-ll-amb-status>Off</span><div class="ll-amb-row"></div><button class="ll-amb-close" aria-label="Close">×</button>';
    const row=panel.querySelector('.ll-amb-row');Object.entries(presets).forEach(([k,p])=>{const b=document.createElement('button');b.type='button';b.dataset.llAmb=k;b.textContent=p.label;b.onclick=()=>{if(current===k&&source)off();else play(k)};row.appendChild(b)});panel.querySelector('.ll-amb-close').onclick=()=>panel.remove();document.body.appendChild(panel);
    const style=document.createElement('style');style.textContent=`#ll-ambience{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9998;display:flex;align-items:center;gap:7px;flex-wrap:wrap;max-width:calc(100vw - 32px);padding:8px 10px;border:1px solid rgba(36,79,58,.14);border-radius:16px;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(24,51,35,.14);font-size:10px}#ll-ambience .ll-amb-title{font-weight:800;color:#244f3a}.ll-amb-status{color:#7a887e}.ll-amb-row{display:flex;gap:4px}.ll-amb-row button{padding:6px 8px;border-radius:9px;background:#f7f8f2;color:#304038;font-size:9px;font-weight:700}.ll-amb-row button.playing{background:#244f3a;color:#fff}.ll-amb-close{width:24px;height:24px;border-radius:50%;color:#7a887e}`;document.head.appendChild(style);
  }
  window.llAmbience={play,off,build};
  const boot=()=>{build();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();