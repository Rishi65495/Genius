/* Leafline AI Guide — Gemini through Supabase Edge Function, never exposes the Gemini key. */
(function(){
  'use strict';
  const SUPABASE_URL='https://hnrxozghykcmfoozbeii.supabase.co';
  let panel,history=[],contextCache=new Map(),selectedBookId=null;
  function books(){try{return JSON.parse(localStorage.getItem('ll-books')||'[]').filter(b=>!b.isDemo)}catch(e){return[]}}
  function activeBook(){
    const s=window.S;
    const readerId=window.R?.bookId;
    if(readerId){const b=books().find(x=>String(x.id)===String(readerId));if(b)return b}
    const candidates=[s?.currentBook,s?.activeBook,s?.readingBook,s?.openBook,s?.book];
    for(const x of candidates)if(x?.id)return x;
    const el=document.querySelector('[data-book-id],[data-current-book-id]');const id=el?.dataset.bookId||el?.dataset.currentBookId;
    return id?books().find(b=>String(b.id)===String(id)):null;
  }
  async function getPdfBytes(id){
    if(typeof window.idbGet!=='function')return null;
    try{const rec=await window.idbGet('pdfs',id);if(rec?.data instanceof ArrayBuffer)return new Uint8Array(rec.data);if(rec?.data?.buffer instanceof ArrayBuffer)return new Uint8Array(rec.data.buffer);if(rec?.data instanceof Blob)return new Uint8Array(await rec.data.arrayBuffer());}catch(e){console.warn('AI PDF read',e)}
    return null;
  }
  async function extractBook(book){
    if(!book)return '';
    if(contextCache.has(book.id))return contextCache.get(book.id);
    if(!window.pdfjsLib)throw new Error('PDF engine is still loading. Try again in a moment.');
    const bytes=await getPdfBytes(book.id);if(!bytes)throw new Error('This book PDF is not available in the local reader store.');
    const pdf=await pdfjsLib.getDocument({data:bytes}).promise;let out='',pages=Math.min(pdf.numPages,80);
    for(let i=1;i<=pages&&out.length<85000;i++){const p=await pdf.getPage(i),tc=await p.getTextContent();const text=tc.items.map(x=>x.str||'').join(' ');out+=`\n[Page ${i}] ${text}`;if(i%8===0)await new Promise(r=>setTimeout(r,0));}
    out=out.slice(0,90000);contextCache.set(book.id,out);return out;
  }
  async function ask(question){
    const client=window.llSupabase;if(!client)throw new Error('Supabase is not ready yet.');
    const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Sign in to use the AI Guide.');
    const book=selectedBookId?books().find(b=>String(b.id)===String(selectedBookId)):activeBook();if(!book)throw new Error('Open a book or select a book first.');
    selectedBookId=book.id;const context=await extractBook(book);history.push({role:'user',content:question});
    const r=await fetch(SUPABASE_URL+'/functions/v1/ai-guide',{method:'POST',headers:{'content-type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({question,context,history})});
    const data=await r.json();if(!r.ok)throw new Error(data?.error||'AI Guide request failed.');history.push({role:'assistant',content:data.text});return data.text;
  }
  function render(){
    if(panel)return;panel=document.createElement('div');panel.id='ll-ai-panel';panel.innerHTML=`<div class="ll-ai-card"><div class="ll-ai-head"><div><strong>Leafline AI Guide</strong><small>Gemini · grounded in your PDF</small></div><button data-ai-close>×</button></div><div class="ll-ai-book"><label>Book</label><select data-ai-book></select></div><div class="ll-ai-messages" data-ai-messages><div class="ll-ai-empty">Ask about the book, explain a passage, summarize a chapter, make revision questions, or compare concepts.</div></div><form class="ll-ai-form" data-ai-form><textarea data-ai-input rows="2" placeholder="Ask anything about this book…"></textarea><button>Ask Gemini</button></form></div>`;
    document.body.appendChild(panel);const sel=panel.querySelector('[data-ai-book]');books().forEach(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=b.title||'Untitled book';sel.appendChild(o)});const a=activeBook();if(a)selectedBookId=a.id;sel.value=selectedBookId||'';panel.querySelector('[data-ai-close]').onclick=()=>{panel.remove();panel=null};panel.querySelector('[data-ai-form]').onsubmit=async e=>{e.preventDefault();const input=panel.querySelector('[data-ai-input]'),q=input.value.trim();if(!q)return;input.value='';append('You',q);append('Gemini','Thinking…','thinking');try{const text=await ask(q);const el=panel.querySelector('.thinking');if(el){el.classList.remove('thinking');el.innerHTML=format(text)}}catch(err){const el=panel.querySelector('.thinking');if(el){el.classList.remove('thinking');el.textContent=err.message||'Something went wrong.'}}};sel.onchange=()=>{selectedBookId=sel.value};
  }
  function format(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
  function append(who,text,cls=''){const box=panel.querySelector('[data-ai-messages]');const empty=box.querySelector('.ll-ai-empty');if(empty)empty.remove();const d=document.createElement('div');d.className='ll-ai-msg '+(who==='You'?'user':'bot')+' '+cls;d.innerHTML=`<b>${who}</b><div>${format(text)}</div>`;box.appendChild(d);box.scrollTop=box.scrollHeight}
  function boot(){
    const style=document.createElement('style');style.textContent=`#ll-ai-panel{position:fixed;inset:0;z-index:10001;background:rgba(14,29,20,.35);backdrop-filter:blur(5px);display:grid;place-items:end;padding:18px}.ll-ai-card{width:min(560px,100%);height:min(760px,calc(100vh - 36px));display:flex;flex-direction:column;border:1px solid #dfe7dd;border-radius:24px;background:#fffdf8;box-shadow:0 30px 100px rgba(24,51,35,.25);overflow:hidden}.ll-ai-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e4eae1;background:#f7f8f2}.ll-ai-head strong{display:block;font:400 23px "DM Serif Display",serif;color:#15231b}.ll-ai-head small{display:block;color:#7a887e;font-size:10px;margin-top:3px}.ll-ai-head button{font-size:25px;color:#7a887e}.ll-ai-book{padding:12px 16px;border-bottom:1px solid #e4eae1}.ll-ai-book label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#7a887e;margin-bottom:5px}.ll-ai-book select{width:100%;padding:9px;border:1px solid #e4eae1;border-radius:10px;background:#fff}.ll-ai-messages{flex:1;overflow:auto;padding:16px}.ll-ai-empty{text-align:center;color:#7a887e;font-size:12px;line-height:1.6;padding:50px 24px}.ll-ai-msg{max-width:90%;margin:0 0 12px;padding:10px 12px;border-radius:14px;font-size:12px;line-height:1.6}.ll-ai-msg b{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}.ll-ai-msg.user{margin-left:auto;background:#244f3a;color:#fff}.ll-ai-msg.bot{background:#edf5e9;color:#15231b}.ll-ai-msg.thinking{opacity:.7}.ll-ai-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e4eae1}.ll-ai-form textarea{flex:1;resize:none;border:1px solid #e4eae1;border-radius:12px;padding:10px;outline:0}.ll-ai-form button{padding:0 15px;border-radius:11px;background:#244f3a;color:#fff;font-weight:800;font-size:11px}`;document.head.appendChild(style);
    document.addEventListener('click',e=>{const t=e.target.closest('button,a,[role="button"]');if(!t)return;const text=(t.textContent||'').trim().toLowerCase();if(/^(ai guide|ask ai|ai tutor|ai assistant)$/.test(text)){e.preventDefault();render()}});
    window.llAIGuide={open:render,ask};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();