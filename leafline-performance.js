/* Leafline performance + reader interaction layer */
(function(){
  'use strict';
  const state={gesture:null};
  const reader=()=>document.getElementById('rdScroll');
  const currentZoom=()=>{try{return window.R?.zoomMode==='numeric'?(Number(window.R.zoomPercent)||100):100}catch(e){return 100}};
  function applyPinch(v){
    const n=Math.max(30,Math.min(500,Math.round(v)));
    if(typeof window.setZoom==='function'){window.setZoom(n);return}
    if(window.llReaderZoom)window.llReaderZoom.set(n/100);
  }
  function pinch(e){
    const el=reader();if(!el||!el.contains(e.target)||e.touches.length!==2)return;
    const a=e.touches[0],b=e.touches[1],d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    if(e.type==='touchstart'){state.gesture={distance:d,zoom:currentZoom()};return}
    if(!state.gesture)return;
    e.preventDefault();applyPinch(state.gesture.zoom*(d/state.gesture.distance));
  }
  function install(){
    const style=document.createElement('style');style.textContent=`
      html{scroll-behavior:auto!important}
      #rdScroll{-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scroll-behavior:auto;touch-action:pan-x pan-y}
      .pdf-page{contain:layout paint;content-visibility:auto;contain-intrinsic-size:900px 1200px}
      .pdf-page canvas{backface-visibility:hidden}
    `;document.head.appendChild(style);
    document.addEventListener('touchstart',pinch,{passive:true});
    document.addEventListener('touchmove',pinch,{passive:false});
    document.addEventListener('touchend',()=>state.gesture=null,{passive:true});
    document.addEventListener('touchcancel',()=>state.gesture=null,{passive:true});
    // Double tap toggles a comfortable reading zoom using the app's real renderer.
    document.addEventListener('dblclick',e=>{if(!reader()?.contains(e.target)||typeof window.setZoom!=='function')return;applyPinch(currentZoom()===100?150:100)});
    window.llReaderZoom={get:()=>currentZoom()/100,set:v=>applyPinch(Number(v)*100),in:()=>applyPinch(currentZoom()+15),out:()=>applyPinch(currentZoom()-15),reset:()=>applyPinch(100)};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();