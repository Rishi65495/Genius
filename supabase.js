/* Lucid Supabase bridge — production auth redirect + persistent session */
(function(){
  'use strict';
  const CONFIG={
    SUPABASE_URL:'https://hnrxozghykcmfoozbeii.supabase.co',
    SUPABASE_KEY:'sb_publishable_iJ_-Do2rNTaJf1bDL2y2DQ_7rEH4juU',
    PRODUCTION_URL:'https://rishi65495.github.io/Genius/'
  };
  window.LucidConfig=CONFIG;

  function load(){
    if(!window.supabase||typeof window.supabase.createClient!=='function'){
      setTimeout(load,120); return;
    }
    if(window.llSupabase)return;
    const client=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
    });
    window.llSupabase=client;
    window.LucidAuth={
      productionUrl:CONFIG.PRODUCTION_URL,
      redirectUrl(){return CONFIG.PRODUCTION_URL},
      async signUp(email,password,name){
        return client.auth.signUp({
          email,password,
          options:{data:{display_name:name||email.split('@')[0]},emailRedirectTo:CONFIG.PRODUCTION_URL}
        });
      },
      async signIn(email,password){return client.auth.signInWithPassword({email,password})},
      async resend(email){return client.auth.resend({type:'signup',email,options:{emailRedirectTo:CONFIG.PRODUCTION_URL})},
      async reset(email){return client.auth.resetPasswordForEmail(email,{redirectTo:CONFIG.PRODUCTION_URL})},
      async signOut(){return client.auth.signOut()}
    };

    async function ensureProfile(user){
      const fallback={id:user.id,display_name:user.user_metadata?.display_name||user.email?.split('@')[0]||'Learner',avatar:(user.user_metadata?.display_name||'LR').slice(0,2).toUpperCase(),bio:'',weekly_goal:200};
      let p=(await client.from('profiles').select('*').eq('id',user.id).maybeSingle()).data;
      if(!p){
        await client.from('profiles').insert(fallback);
        p=fallback;
      }
      return p;
    }
    async function hydrate(session){
      if(!session?.user)return;
      const p=await ensureProfile(session.user);
      const u={
        id:session.user.id,email:session.user.email||'',
        display_name:p.display_name||session.user.email?.split('@')[0]||'Learner',
        avatar:p.avatar||'LR',bio:p.bio||'',
        weekly_goal:p.weekly_goal||200,level:p.level||1,xp:p.xp||0,
        streak:p.streak_days||0
      };
      window.LucidUser=u;
      window.S=window.S||{};
      S.user=u;
      S.authToken=session.access_token;
      S.weeklyGoal=u.weekly_goal;
      localStorage.setItem('ll-user',JSON.stringify(u));
      localStorage.setItem('ll-jwt',session.access_token);
      window.dispatchEvent(new CustomEvent('lucid-auth-ready',{detail:{session,user:u}}));
    }

    client.auth.onAuthStateChange((event,session)=>{
      if(session) setTimeout(()=>hydrate(session),0);
      else{
        window.LucidUser=null;
        window.S=window.S||{};
        S.user={id:null,email:'',display_name:'Learner',avatar:'LR',level:1,xp:0,streak:0};
        S.authToken=null;
        localStorage.removeItem('ll-jwt');
        window.dispatchEvent(new CustomEvent('lucid-auth-signed-out',{detail:{event}}));
      }
    });

    async function boot(){
      const {data,error}=await client.auth.getSession();
      if(error)console.warn('Lucid auth bootstrap',error);
      if(data?.session)await hydrate(data.session);
      const hash=location.hash||'';
      if(hash.includes('error=')){
        const params=new URLSearchParams(hash.slice(1));
        const msg=params.get('error_description')||params.get('error')||'Authentication failed.';
        window.dispatchEvent(new CustomEvent('lucid-auth-error',{detail:{message:msg}}));
      }
      if(hash.includes('confirmed') || new URLSearchParams(location.search).get('confirmed')==='1'){
        history.replaceState({},'',CONFIG.PRODUCTION_URL);
        window.dispatchEvent(new Event('lucid-email-confirmed'));
      }
    }
    boot();
    console.log('%cLucid · Supabase connected','color:#2f7153;font-weight:800');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();