import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};

const MODEL=Deno.env.get("GEMINI_MODEL")||"gemini-3.8-flash";
const GEMINI_KEY=Deno.env.get("GEMINI_API_KEY")||"";
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";

const toolDefs=[
 {name:"get_learning_context",description:"Read the signed-in learner's current learning context: selected resource/page, catalogue, goals, mastery, annotations, recent practice and learning events.",parameters:{type:"object",properties:{resource_id:{type:"string"},page_number:{type:"integer"},catalogue_id:{type:"string"}},required:[]}},
 {name:"search_resource",description:"Search indexed pages of a user's learning resource for a phrase or concept.",parameters:{type:"object",properties:{resource_id:{type:"string",description:"Resource UUID"},query:{type:"string",description:"Phrase or concept to find"}},required:["resource_id","query"]}},
 {name:"get_due_reviews",description:"Get the learner's learning journeys whose spaced-review time is due or soon due.",parameters:{type:"object",properties:{limit:{type:"integer"}},required:[]}},
 {name:"get_goal_state",description:"Get active goals and deadlines for the learner.",parameters:{type:"object",properties:{limit:{type:"integer"}},required:[]}},
 {name:"get_room_state",description:"Get members, leaderboard and shared knowledge for a study room.",parameters:{type:"object",properties:{room_id:{type:"string"}},required:["room_id"]}},
 {name:"create_recommendation",description:"Persist an AI next-best-action recommendation. Use only when the learner asks to save a plan or recommendation.",parameters:{type:"object",properties:{catalogue_id:{type:"string"},resource_id:{type:"string"},action_type:{type:"string"},reason:{type:"string"},priority:{type:"number"}},required:["action_type","reason"]}},
 {name:"mark_goal_complete",description:"Mark one of the learner's own goals complete. Only use when the learner clearly asks to mark a goal completed.",parameters:{type:"object",properties:{goal_id:{type:"string"}},required:["goal_id"]}},
 {name:"save_learning_pattern",description:"Persist an observed learning pattern and adaptive response in the learner's profile.",parameters:{type:"object",properties:{pattern_key:{type:"string"},dimension:{type:"string"},summary:{type:"string"},confidence:{type:"number"},adaptive_response:{type:"string"}},required:["pattern_key","dimension","summary","confidence","adaptive_response"]}},
 {name:"create_room_knowledge",description:"Save a useful attributed point to a room's shared knowledge layer.",parameters:{type:"object",properties:{room_id:{type:"string"},title:{type:"string"},body:{type:"string"},concept_key:{type:"string"}},required:["room_id","body"]}}
];

function clean(s){return (s||"").replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();}
function safeParse(s){try{return JSON.parse(clean(s))}catch{return null}}

async function gemini(contents){
 const body={contents,generationConfig:{temperature:.25,maxOutputTokens:6000},tools:[{functionDeclarations:toolDefs}]};
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":GEMINI_KEY},body:JSON.stringify(body)
 });
 const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Gemini API error");return d;
}

async function toolExec(sb,userId,name,args){
 if(name==="get_learning_context"){
  const rid=args.resource_id||null,cid=args.catalogue_id||null,page=args.page_number||null;
  const [p,m,g,j,a,e,r,secs]=await Promise.all([
   sb.from("profiles").select("display_name,coaching_mode,weekly_goal,visibility,theme,reduced_motion,availability,energy_default").eq("id",userId).maybeSingle(),
   sb.from("concept_mastery").select("mastery,exposure,understanding,recall,application,concepts(title,normalized_key)").eq("user_id",userId).order("mastery",{ascending:true}).limit(25),
   sb.from("learning_goals").select("*").eq("owner_id",userId).eq("status","active").order("deadline",{ascending:true}).limit(12),
   sb.from("learning_journeys").select("*,lucid_resources(title,type,source_url)").eq("owner_id",userId).order("last_activity_at",{ascending:false}).limit(12),
   sb.from("learning_annotations").select("annotation_type,color,body,timestamp_seconds,resource_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(40),
   sb.from("learning_events").select("event_type,occurred_at,payload,resource_id,catalogue_id").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(60),
   sb.from("quiz_attempts").select("quiz_id,score,max_score,completed_at,skipped,quizzes(title,quiz_type)").eq("user_id",userId).order("completed_at",{ascending:false}).limit(20),
   rid?sb.from("resource_sections").select("title,order_index,start_page,end_page").eq("resource_id",rid).order("order_index").limit(50):Promise.resolve({data:[]})
  ]);
  let resource=null,pages=[];
  if(rid){
   const rr=await sb.from("lucid_resources").select("id,type,title,author,source_url,metadata,processing_status").eq("id",rid).eq("owner_id",userId).maybeSingle();resource=rr.data||null;
   if(page){const pg=await sb.from("resource_pages").select("page_number,text_content,metadata").eq("resource_id",rid).eq("page_number",page).maybeSingle();if(pg.data)pages=[pg.data]}
  }
  return {profile:p.data||{},resource,catalogue_id:cid,page_number:page,nearby_sections:secs.data||[],selected_page:pages,mastery:m.data||[],goals:g.data||[],journeys:j.data||[],annotations:a.data||[],quiz_history:r.data||[],recent_events:e.data||[]};
 }
 if(name==="search_resource"){
  const needle=String(args.query||"").slice(0,120);
  const {data,error}=await sb.from("resource_pages").select("page_number,text_content").eq("resource_id",args.resource_id).ilike("text_content","%"+needle+"%").limit(15);
  if(error)throw error;return {query:needle,results:data||[]};
 }
 if(name==="get_due_reviews"){
  const lim=Math.min(50,Math.max(1,Number(args.limit||20)));
  const {data,error}=await sb.from("learning_journeys").select("id,resource_id,catalogue_id,completion,recall,next_review_at,last_activity_at,lucid_resources(title,type)").eq("owner_id",userId).not("next_review_at","is",null).lte("next_review_at",new Date(Date.now()+86400000).toISOString()).order("next_review_at").limit(lim);
  if(error)throw error;return {reviews:data||[]};
 }
 if(name==="get_goal_state"){
  const lim=Math.min(50,Math.max(1,Number(args.limit||20)));
  const {data,error}=await sb.from("learning_goals").select("*").eq("owner_id",userId).eq("status","active").order("deadline",{ascending:true}).limit(lim);
  if(error)throw error;return {goals:data||[]};
 }
 if(name==="get_room_state"){
  const rid=args.room_id;
  const member=await sb.from("room_members").select("role,status,current_mode,commitment_minutes").eq("room_id",rid).eq("user_id",userId).eq("status","active").maybeSingle();
  if(!member.data)throw new Error("You are not an active member of this room.");
  const [room,members,board,knowledge]=await Promise.all([
   sb.from("rooms").select("*").eq("id",rid).maybeSingle(),
   sb.from("room_members").select("user_id,role,status,current_mode,commitment_minutes,joined_at,profiles(display_name,avatar)").eq("room_id",rid).eq("status","active"),
   sb.rpc("get_room_leaderboard",{p_room_id:rid}),
   sb.from("room_knowledge").select("title,body,concept_key,created_at,profiles(display_name,avatar)").eq("room_id",rid).order("created_at",{ascending:false}).limit(30)
  ]);
  return {room:room.data||null,members:members.data||[],leaderboard:board.data||[],knowledge:knowledge.data||[]};
 }
 if(name==="create_recommendation"){
  const {data,error}=await sb.from("recommendations").insert({user_id:userId,catalogue_id:args.catalogue_id||null,resource_id:args.resource_id||null,action_type:String(args.action_type),reason:String(args.reason),priority:Number(args.priority||1)}).select().single();
  if(error)throw error;return {created:true,recommendation:data};
 }
 if(name==="mark_goal_complete"){
  const g=await sb.from("learning_goals").select("*").eq("id",args.goal_id).eq("owner_id",userId).maybeSingle();
  if(!g.data)throw new Error("Goal not found or not owned by the learner.");
  const {data,error}=await sb.from("learning_goals").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",args.goal_id).eq("owner_id",userId).select().single();
  if(error)throw error;return {completed:true,goal:data};
 }
 if(name==="save_learning_pattern"){
  const {data,error}=await sb.from("learning_patterns").upsert({user_id:userId,pattern_key:String(args.pattern_key),dimension:String(args.dimension),evidence:{summary:String(args.summary),adaptive_response:String(args.adaptive_response)},confidence:Number(args.confidence||0),detected_at:new Date().toISOString(),active:true},{onConflict:"user_id,pattern_key"}).select().single();
  if(error)throw error;return {saved:true,pattern:data};
 }
 if(name==="create_room_knowledge"){
  const ok=await sb.from("room_members").select("id").eq("room_id",args.room_id).eq("user_id",userId).eq("status","active").maybeSingle();
  if(!ok.data)throw new Error("Not an active room member.");
  const {data,error}=await sb.from("room_knowledge").insert({room_id:args.room_id,created_by:userId,source_type:"explanation",title:args.title||null,body:String(args.body),concept_key:args.concept_key||null,attribution:{author_id:userId}}).select().single();
  if(error)throw error;return {saved:true,knowledge:data};
 }
 throw new Error("Unknown agent tool: "+name);
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"POST only"}),{status:405,headers:CORS});
 try{
  if(!GEMINI_KEY)return new Response(JSON.stringify({error:"GEMINI_API_KEY is not configured"}),{status:503,headers:CORS});
  const auth=req.headers.get("Authorization")||"",token=auth.replace(/^Bearer\s+/i,"");
  const sb=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const me=await sb.auth.getUser(token);
  if(me.error||!me.data.user)return new Response(JSON.stringify({error:"Not authenticated"}),{status:401,headers:CORS});
  const body=await req.json(),action=String(body.action||"chat"),request=String(body.request||"");
  const resourceId=body.resource_id||null,page=body.page_number||null,catalogueId=body.catalogue_id||null,roomId=body.room_id||null;
  let typeInstruction="Return a normal helpful answer.";
  if(action==="quiz")typeInstruction='Return ONLY JSON: {"questions":[{"prompt":"","options":["","","",""],"answer_index":0,"explanation":"","concept_key":""}]}';
  if(action==="flashcards")typeInstruction='Return ONLY JSON: {"cards":[{"front":"","back":"","concept_key":""}]}';
  if(action==="evaluate_recall")typeInstruction='Return ONLY JSON: {"score":0,"coverage":0,"accuracy":0,"clarity":0,"missing":[],"feedback":""}';
  if(action==="analyze_pattern")typeInstruction='Return ONLY JSON: {"patterns":[{"pattern_key":"","dimension":"","summary":"","confidence":0,"adaptive_response":""}]}';
  if(action==="plan")typeInstruction='Return ONLY JSON: {"actions":[{"action_type":"","reason":"","minutes":0,"resource_id":null}]}';
  if(action==="teach")typeInstruction='Return ONLY JSON: {"lesson":"","checkpoints":[{"question":"","expected_points":[]}]}';

  const userPrompt =
    "You are Lucid Agent, an AI learning operating system — not a generic chatbot.\n"+
    "Learner request: "+request+"\n"+
    "Action: "+action+"\n"+
    "Resource ID: "+(resourceId||"none")+" | page: "+(page||"none")+" | catalogue: "+(catalogueId||"none")+" | room: "+(roomId||"none")+"\n\n"+
    "Rules:\n"+
    "- Ground explanations, quizzes and teaching in indexed source material whenever available.\n"+
    "- Never fabricate source facts, progress measurements, page details or citations.\n"+
    "- Completion, exposure, understanding, recall and application are distinct evidence signals.\n"+
    "- Learners control pace. Optional checks may be skipped unless a clear milestone requires them.\n"+
    "- XP is authoritative server state; do not claim XP was awarded unless the client/server event did so.\n"+
    "- Use tools to inspect live learner data before making personalized decisions.\n"+
    "- Write recommendations/patterns/goal state only when the request clearly calls for that action.\n"+
    "- For smart switching and re-entry, recommend the smallest useful next step.\n"+
    "- Never expose private data from another user.\n\n"+
    typeInstruction;

  let contents=[{role:"user",parts:[{text:userPrompt}]}];
  const trace=[];
  for(let round=0;round<6;round++){
   const d=await gemini(contents),candidate=d.candidates?.[0],parts=candidate?.content?.parts||[];
   const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
   if(!calls.length){
    const raw=parts.filter(p=>p.text).map(p=>p.text).join("\n").trim(),parsed=safeParse(raw);
    return new Response(JSON.stringify({ok:true,action,text:parsed?null:raw,result:parsed||{text:raw},toolTrace:trace,model:MODEL}),{headers:CORS});
   }
   contents.push(candidate.content);
   const functionParts=[];
   for(const call of calls){
    try{
     const result=await toolExec(sb,me.data.user.id,call.name,call.args||{});
     trace.push({name:call.name,args:call.args||{},ok:true});
     functionParts.push({functionResponse:{name:call.name,id:call.id,response:{result}}});
    }catch(e){
     const msg=e instanceof Error?e.message:"Tool failed";
     trace.push({name:call.name,args:call.args||{},ok:false,error:msg});
     functionParts.push({functionResponse:{name:call.name,id:call.id,response:{error:msg}}});
    }
   }
   contents.push({role:"user",parts:functionParts});
  }
  throw new Error("Agent reached its tool-call limit.");
 }catch(e){
  return new Response(JSON.stringify({error:e instanceof Error?e.message:"Lucid Agent error"}),{status:500,headers:CORS});
 }
});