/* Leafline authentication hardening: email confirmation + clean redirect. */
(function(){
  'use strict';
  // Supabase email confirmation is intentionally handled server-side; no credential is stored in this repo.
  const REDIRECT=()=>location.origin+location.pathname;
  function toastSafe(m){if(typeof window.toast==='function')window.toast(m);else alert(m)}
  function install(){
    if(!window.llSupabase)return setTimeout(install,300);
    window.submitAuth=async function(){
      const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();
      const pass=document.getElementById('authPass')?.value||'';
      const name=(document.getElementById('authName')?.value||'').trim();
      if(!email||!pass){toastSafe('Enter your email and password.');return}
      if(pass.length<6){toastSafe('Password must be at least 6 characters.');return}
      const btn=document.querySelector('#authModal button[type="submit"],#authModal .btn-primary');if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent=authMode==='register'?'Creating account…':'Signing in…'}
      try{
        if(authMode==='register'){
          const {data,error}=await llSupabase.auth.signUp({email,password:pass,options:{data:{display_name:name||email.split('@')[0]},emailRedirectTo:REDIRECT()}});
          if(error)throw error;
          if(data.session){if(typeof window.closeModal==='function')closeModal('authModal');toastSafe('Account created. Welcome!');}
          else{
            localStorage.setItem('ll-pending-email',email);
            const box=document.getElementById('authModal');
            const msg=document.createElement('div');msg.className='ll-confirm-msg';msg.innerHTML=`<b>Check your email</b><span>We sent a confirmation link to <strong>${email.replace(/[&<>]/g,'')}</strong>. Open it to verify your account; Leafline will bring you back here automatically.</span><button type="button" data-resend>Resend confirmation</button>`;
            box?.querySelector('.modal-body')?.appendChild(msg)||box?.appendChild(msg);
            msg.querySelector('[data-resend]').onclick=async()=>{const {error}=await llSupabase.auth.resend({type:'signup',email,options:{emailRedirectTo:REDIRECT()}});toastSafe(error?error.message:'Confirmation email resent ✓')};
          }
        }else{
          const {data,error}=await llSupabase.auth.signInWithPassword({email,password:pass});if(error)throw error;
          if(data.session){if(typeof window.applySession==='function')await applySession(data.session);if(typeof window.closeModal==='function')closeModal('authModal');toastSafe('Signed in ✓');}
        }
      }catch(e){console.error(e);toastSafe(e.message||'Authentication failed.')}finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||btn.textContent}}
    };
    const style=document.createElement('style');style.textContent='.ll-confirm-msg{margin-top:12px;padding:12px 14px;border-radius:12px;background:#edf5e9;border:1px solid #d9eadb;color:#244f3a;font-size:11px;line-height:1.5}.ll-confirm-msg b{display:block;font-size:13px;margin-bottom:4px}.ll-confirm-msg span{display:block}.ll-confirm-msg button{margin-top:8px;padding:6px 9px;border-radius:8px;background:#244f3a;color:#fff;font-size:10px;font-weight:800}';document.head.appendChild(style);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();