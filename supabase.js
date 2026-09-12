/* Leafline Supabase integration */
(function(){
  'use strict';
  const SUPABASE_URL='https://hnrxozghykcmfoozbeii.supabase.co';
  const SUPABASE_KEY='sb_publishable_iJ_-Do2rNTaJf1bDL2y2DQ_7rEH4juU';
  function boot(){
    if(!window.supabase||typeof window.supabase.createClient!=='function'){console.error('Leafline: Supabase SDK failed to load.');return;}
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    window.llSupabase=client;
    const profileDefaults=u=>({id:u.id,display_name:u.user_metadata?.display_name||u.email?.split('@')[0]||'Reader',avatar:((u.user_metadata?.display_name||u.email?.split('@')[0]||'US').slice(0,2)).toUpperCase(),bio:'',level:1,xp:0,weekly_goal:200});
    async function applySession(session){
      if(!session?.user)return;
      S.authToken=session.access_token;localStorage.setItem('ll-jwt',session.access_token);
      const u=session.user;let p=null;
      try{p=(await client.from('profiles').select('*').eq('id',u.id).maybeSingle()).data;}catch(e){console.error(e);}
      p=p||profileDefaults(u);
      S.user={id:u.id,email:u.email||'',display_name:p.display_name||'Reader',avatar:p.avatar||'US',bio:p.bio||'',level:p.level||1,xp:p.xp||0};
      S.weeklyGoal=p.weekly_goal||200;localStorage.setItem('ll-user',JSON.stringify(S.user));updateUserUI();await syncCloudState();
    }
    async function syncCloudState(){
      const session=(await client.auth.getSession()).data.session;if(!session?.user)return;
      const uid=session.user.id;
      const localBooks=(S.books||[]).filter(b=>!b.isDemo).map(b=>({id:String(b.id),user_id:uid,title:b.title,author:b.author||null,pages:Number(b.pages)||0,progress:Number(b.progress)||0,color:b.color||'cv-green',tag:b.tag||'In library',added_at:b.addedAt?new Date(b.addedAt).toISOString():undefined}));
      if(localBooks.length)await client.from('books').upsert(localBooks,{onConflict:'id'});
      const localAnnotations=(S.annotations||[]).map(a=>({id:String(a.id),user_id:uid,book_id:a.bookId||null,text:a.text||'',note:a.note||null,color:a.color||'yellow',page:a.page||null,created_at:a.date||new Date().toISOString()}));
      if(localAnnotations.length)await client.from('annotations').upsert(localAnnotations,{onConflict:'id'});
      const [books,annotations,follows,profile]=await Promise.all([
        client.from('books').select('*').eq('user_id',uid).order('added_at',{ascending:false}),
        client.from('annotations').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
        client.from('follows').select('following_id').eq('follower_id',uid),
        client.from('profiles').select('*').eq('id',uid).maybeSingle()
      ]);
      S.books=(books.data||[]).map(b=>({id:b.id,title:b.title,author:b.author,pages:b.pages,progress:b.progress,color:b.color,tag:b.tag,isDemo:false,addedAt:b.added_at?Date.parse(b.added_at):Date.now()}));
      S.annotations=(annotations.data||[]).map(a=>({id:a.id,text:a.text||'',note:a.note||'',color:a.color||'yellow',page:a.page||null,bookId:a.book_id||null,date:a.created_at||new Date().toISOString()}));
      S.followedUsers=(follows.data||[]).map(f=>f.following_id);
      if(profile.data){Object.assign(S.user,{display_name:profile.data.display_name||S.user.display_name,avatar:profile.data.avatar||S.user.avatar,bio:profile.data.bio||'',level:profile.data.level||1,xp:profile.data.xp||0});S.weeklyGoal=profile.data.weekly_goal||200;localStorage.setItem('ll-user',JSON.stringify(S.user));}
      localStorage.setItem('ll-books',JSON.stringify(S.books));localStorage.setItem('ll-annotations',JSON.stringify(S.annotations));localStorage.setItem('ll-following',JSON.stringify(S.followedUsers));
      renderAllBooks();renderAnnotationsList();updateHighlightCount();updateDashStats();updateUserUI();
    }
    async function saveProfileCloud(){
      const u=(await client.auth.getUser()).data.user;if(!u)return;
      await client.from('profiles').update({display_name:S.user.display_name,avatar:S.user.avatar,bio:S.user.bio||'',weekly_goal:S.weeklyGoal||200}).eq('id',u.id);
      await client.auth.updateUser({data:{display_name:S.user.display_name}});
    }
    window.submitAuth=async function(){
      const email=document.getElementById('authEmail').value.trim(),pass=document.getElementById('authPass').value,name=document.getElementById('authName').value.trim();
      if(!email||!pass){toast('Please enter email and password.');return;}
      try{
        let data,error;
        if(authMode==='register')({data,error}=await client.auth.signUp({email,password:pass,options:{data:{display_name:name||email.split('@')[0]}}}));
        else ({data,error}=await client.auth.signInWithPassword({email,password:pass}));
        if(error)throw error;
        if(!data.session){toast('Account created. Check your email to confirm, then sign in.');return;}
        await applySession(data.session);closeModal('authModal');toast(`Welcome, ${S.user.display_name}! 👋`);
      }catch(e){console.error(e);toast(e.message||'Authentication failed.');}
    };
    window.signOut=async function(){try{await client.auth.signOut();}catch(e){}S.authToken=null;localStorage.removeItem('ll-jwt');S.user={id:null,email:'',display_name:'Alex Stone',avatar:'AS',level:1,xp:0,bio:''};updateUserUI();toast('Signed out ✓');};
    const oldSaveProfile=window.saveProfile;window.saveProfile=async function(){oldSaveProfile();if(S.authToken){try{await saveProfileCloud();toast('Profile saved to cloud ✓');}catch(e){toast('Saved locally; cloud sync failed.');}}};
    const oldSaveQuickProfile=window.saveQuickProfile;window.saveQuickProfile=async function(){oldSaveQuickProfile();if(S.authToken){try{await saveProfileCloud();toast('Profile synced ✓');}catch(e){toast('Saved locally; cloud sync failed.');}}};
    window.searchUsers=async function(){
      const q=document.getElementById('userSearchInput').value.trim(),box=document.getElementById('searchResults');if(!q){box.innerHTML='';return;}if(!S.authToken){box.innerHTML='<span class="muted small">Sign in to search readers.</span>';return;}
      box.innerHTML='<span class="muted small">Searching…</span>';try{const {data,error}=await client.from('profiles').select('id,display_name,avatar').ilike('display_name','%'+q+'%').limit(20);if(error)throw error;box.innerHTML='';if(!data?.length){box.innerHTML='<span class="muted small">No users found.</span>';return;}data.filter(u=>u.id!==S.user.id).forEach(u=>{const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:#fff';div.innerHTML=`<div class="mini-av">${esc(u.avatar||'US')}</div><span style="font-size:12px;font-weight:700">${esc(u.display_name||'Reader')}</span>`;const btn=document.createElement('button'),following=S.followedUsers.includes(u.id);btn.className='follow-btn'+(following?' following':'');btn.textContent=following?'Following':'Follow';btn.onclick=()=>toggleFollowUser(u.id,u.display_name||'Reader',btn);div.appendChild(btn);box.appendChild(div);});}catch(e){console.error(e);box.innerHTML='<span class="muted small">Unable to search right now.</span>';}
    };
    window.toggleFollowUser=async function(id,name,btn){if(!S.authToken){toast('Sign in to follow readers.');return;}try{if(S.followedUsers.includes(id)){const {error}=await client.from('follows').delete().eq('follower_id',S.user.id).eq('following_id',id);if(error)throw error;S.followedUsers=S.followedUsers.filter(x=>x!==id);btn.textContent='Follow';btn.classList.remove('following');toast(`Unfollowed ${name}`);}else{const {error}=await client.from('follows').insert({follower_id:S.user.id,following_id:id});if(error)throw error;S.followedUsers.push(id);btn.textContent='Following';btn.classList.add('following');toast(`Now following ${name} 🤝`);}localStorage.setItem('ll-following',JSON.stringify(S.followedUsers));}catch(e){console.error(e);toast(e.message||'Could not update follow.');}};
    window.createRoom=async function(){if(!S.authToken){toast('Sign in to create a study circle.');return;}const name=document.getElementById('roomName').value.trim()||'Quiet Study Room',code=name.toLowerCase().replace(/[^a-z0-9]/g,'-')+'-'+Math.random().toString(36).slice(2,6),session_length=parseInt(document.getElementById('roomLen').value)||25,visibility=document.getElementById('roomVis').value==='Invite only'?'private':'link',description=document.getElementById('roomDesc').value.trim()||null;try{const {data,error}=await client.from('rooms').insert({name,room_code:code,created_by:S.user.id,session_length,visibility,description}).select().single();if(error)throw error;document.getElementById('activeRoomTitle').textContent=data.name;const link=`${location.origin}${location.pathname}#join-${data.room_code}`;document.getElementById('inviteInput').value=link;closeModal('roomModal');openPage('rooms');navigator.clipboard?.writeText(link);toast(`${name} created! Link copied 🔗`);joinRealtimeRoom(data.room_code);}catch(e){console.error(e);toast(e.message||'Could not create room.');}};
    let roomChannel=null;async function joinRealtimeRoom(code){if(roomChannel)await client.removeChannel(roomChannel);roomChannel=client.channel('leafline-room-'+code,{config:{presence:{key:S.user?.id||crypto.randomUUID()}}});roomChannel.on('presence',{event:'sync'},()=>{const count=Object.keys(roomChannel.presenceState()).length,el=document.getElementById('activeRoomMembers');if(el)el.textContent=count+' online';});roomChannel.subscribe(async status=>{if(status==='SUBSCRIBED')await roomChannel.track({user_id:S.user.id,name:S.user.display_name,avatar:S.user.avatar});});window.llRoomChannel=roomChannel;}
    window.joinRoomByCode=async function(code){document.getElementById('activeRoomTitle').textContent=code.replace(/-[a-z0-9]{4}$/,'').replace(/-/g,' ');document.getElementById('inviteInput').value=`${location.origin}${location.pathname}#join-${code}`;openPage('rooms');if(S.authToken)joinRealtimeRoom(code);toast(`Joined study circle: ${code} 🌿`);};
    const oldUploadBook=window.uploadBook;window.uploadBook=async function(){await oldUploadBook();if(S.authToken)await syncCloudState();};
    const oldDeleteBook=window.deleteBook;window.deleteBook=async function(id,e){await oldDeleteBook(id,e);if(S.authToken)await syncCloudState();};
    const oldHighlightText=window.highlightText;window.highlightText=function(color){oldHighlightText(color);if(S.authToken)syncCloudState().catch(console.error);};
    const oldAddNoteSelected=window.addNoteSelected;window.addNoteSelected=function(){oldAddNoteSelected();if(S.authToken)syncCloudState().catch(console.error);};
    const oldDeleteAnnotation=window.deleteAnnotation;window.deleteAnnotation=function(idx){oldDeleteAnnotation(idx);if(S.authToken)syncCloudState().catch(console.error);};
    const oldIdbPut=window.idbPut;window.idbPut=async function(store,obj){const result=await oldIdbPut(store,obj);if(store==='progress'&&S.authToken&&obj?.id)client.from('reading_progress').upsert({id:String(obj.id),user_id:S.user.id,page:Number(obj.page)||1,total_pages:Number(obj.totalPages)||null,last_read:new Date().toISOString()},{onConflict:'id'}).then(({error})=>{if(error)console.error('progress sync',error)});return result;};
    client.auth.onAuthStateChange((event,session)=>{if(session)setTimeout(()=>applySession(session),0);else if(event==='SIGNED_OUT'){S.authToken=null;localStorage.removeItem('ll-jwt');}});
    setTimeout(async()=>{try{const {data}=await client.auth.getSession();if(data?.session)await applySession(data.session);console.log('%cLeafline · Supabase connected','color:#3b7957;font-weight:bold');}catch(e){console.error('Leafline Supabase bootstrap failed',e)}},0);
  }
  function loadSdk(){if(window.supabase?.createClient){boot();return;}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=boot;s.onerror=()=>console.error('Leafline: unable to load Supabase SDK');document.head.appendChild(s);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadSdk,{once:true});else loadSdk();
})();
