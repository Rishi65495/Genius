/* Leafline performance + reader interaction layer */
(function(){
  'use strict';
  const state={zoom:1,min:.65,max:3,gesture:null,lastWheel:0};
  const isReader=()=>document.querySelector('.pdf-reader,.reader-page,.pdf-viewer,canvas[data-page-number],#pdfContainer,#pdfViewer,[id*="pdf"]');
  const getCanvases=()=>Array.from(document.querySelectorAll('canvas')).filter(c=>c.width>100&&c.height>100);
  function applyZoom(){
    const canvases=getCanvases();
    if(!canvases.length)return;
    canvases.forEach(c=>{c.style.transformOrigin='top center';c.style.transform=`scale(${state.zoom})`;c.style.marginBottom=`${Math.max(0,(state.zoom-1)*100)}px`;});
    document.documentElement.style.setProperty('--ll-pdf-zoom',String(state.zoom));
    const label=document.querySelector('[data-ll-zoom-label]');if(label)label.textContent=Math.round(state.zoom*100)+'%';
  }
  function setZoom(v){state.zoom=Math.min(state.max,Math.max(state.min,v));applyZoom();}
  window.llReaderZoom={get:()=>state.zoom,set:setZoom,in:()=>setZoom(state.zoom+.1),out:()=>setZoom(state.zoom-.1),reset:()=>setZoom(1)};
  function addZoomControls(){
    if(document.getElementById('ll-reader-zoom'))return;
    const wrap=document.createElement('div');wrap.id='ll-reader-zoom';wrap.innerHTML='<button type="button" data-ll-zoom-out aria-label="Zoom out">−</button><span data-ll-zoom-label>100%</span><button type="button" data-ll-zoom-in aria-label="Zoom in">+</button><button type="button" data-ll-zoom-reset aria-label="Reset zoom">1:1</button>';
    wrap.addEventListener('click',e=>{if(e.target.closest('[data-ll-zoom-in]'))setZoom(state.zoom+.1);if(e.target.closest('[data-ll-zoom-out]'))setZoom(state.zoom-.1);if(e.target.closest('[data-ll-zoom-reset]'))setZoom(1);});
    document.body.appendChild(wrap);
  }
  function gesture(e){
    if(!isReader()||e.touches.length!==2)return;
    const a=e.touches[0],b=e.touches[1],d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    if(e.type==='touchstart'){state.gesture={distance:d,zoom:state.zoom};return;}
    if(!state.gesture)return;
    e.preventDefault();setZoom(state.gesture.zoom*(d/state.gesture.distance));
  }
  function install(){
    addZoomControls();
    document.addEventListener('touchstart',gesture,{passive:true});
    document.addEventListener('touchmove',gesture,{passive:false});
    document.addEventListener('touchend',()=>state.gesture=null,{passive:true});
    document.addEventListener('dblclick',e=>{if(isReader()&&e.target.closest('canvas'))setZoom(state.zoom===1?1.5:1);});
    // Avoid expensive browser smooth scrolling fighting PDF's own scroll container.
    document.documentElement.style.scrollBehavior='auto';
    const style=document.createElement('style');style.textContent=`
      #ll-reader-zoom{position:fixed;right:18px;bottom:22px;z-index:9999;display:flex;align-items:center;gap:4px;padding:5px;border:1px solid rgba(36,79,58,.14);border-radius:14px;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);box-shadow:0 10px 35px rgba(24,51,35,.15)}
      #ll-reader-zoom button{min-width:32px;height:32px;border-radius:9px;background:#fff;color:#244f3a;font-weight:800}#ll-reader-zoom button:hover{background:#edf5e9}
      #ll-reader-zoom span{min-width:48px;text-align:center;font:700 10px/32px "Space Mono",monospace;color:#304038}
      canvas{image-rendering:auto;backface-visibility:hidden;transform:translateZ(0)}
      .page,.card,.grid{contain:layout style}
    `;document.head.appendChild(style);
    let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;applyZoom();});});observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();