function communityMemberLevel(points){return Math.min(99,Math.max(1,Math.floor(Math.max(0,Number(points)||0)/100)+1));}
const COMMUNITY_RANKS=[
 {min:1,name:'Beginner',symbol:'●',tier:'newblood'},
 {min:5,name:'Novice',symbol:'●',tier:'initiate'},
 {min:10,name:'Decaffeinated',symbol:'◆',tier:'nightwalker'},
 {min:20,name:'Regular',symbol:'◆',tier:'phantom'},
 {min:30,name:'Contributor',symbol:'★',tier:'sentinel'},
 {min:45,name:'Experienced',symbol:'★',tier:'warden'},
 {min:60,name:'Veteran',symbol:'★',tier:'ascendant'},
 {min:75,name:'Expert',symbol:'✦',tier:'legend'},
 {min:90,name:'Elite',symbol:'✦',tier:'monarch'},
 {min:99,name:'Master',symbol:'✦',tier:'sovereign'}
];
function communityLevelTitle(level){
 const base=[...COMMUNITY_RANKS].reverse().find(rank=>level>=rank.min)||COMMUNITY_RANKS[0];
 return {...base,name:state.communityRankTitles?.[base.min]||base.name};
}
async function loadCommunityRankTitles(communityId){
 state.communityRankTitles={};
 const {data,error}=await sb.from('community_rank_titles').select('min_level,title').eq('community_id',communityId);
 if(error){console.warn('Community rank titles unavailable',error);return;}
 state.communityRankTitles=Object.fromEntries((data||[]).map(row=>[row.min_level,row.title]));
}
async function saveCommunityRankTitles(event){
 event.preventDefault();
 if(!['owner','mod'].includes(state.activeCommunityRole))return toast('Only community managers can edit rank titles.');
 const communityId=state.activeCommunity?.id;
 if(!communityId)return;
 const changes=[];
 for(const rank of COMMUNITY_RANKS){
  const field=document.getElementById('communityRankTitle'+rank.min);
  const value=(field?.value||'').trim();
  if(!value||value.length>32){toast('Rank titles must be 1–32 characters.');return;}
  changes.push({community_id:communityId,min_level:rank.min,title:value});
 }
 const button=document.querySelector('#communityRankForm button[type="submit"]');
 if(button)button.disabled=true;
 try{
  const {error}=await sb.from('community_rank_titles').upsert(changes,{onConflict:'community_id,min_level'});
  if(error)throw error;
  await loadCommunityRankTitles(communityId);
  renderCommunity();toast('Community rank titles saved.');
 }catch(error){toast(errorText(error));if(button)button.disabled=false;}
}
async function resetCommunityRankTitles(){
 if(!['owner','mod'].includes(state.activeCommunityRole))return;
 const {error}=await sb.from('community_rank_titles').delete().eq('community_id',state.activeCommunity.id);
 if(error){toast(errorText(error));return;}
 await loadCommunityRankTitles(state.activeCommunity.id);renderCommunity();toast('Default rank titles restored.');
}
function communityLevelBadge(member){
 const points=Math.max(0,Number(member.communityPoints)||0);
 const level=communityMemberLevel(points),rank=communityLevelTitle(level);
 const progress=level===99?'Maximum level':(100-points%100)+' XP until next level';
 return '<span class="community-level-badge community-level-'+rank.tier+'" title="'+points+' community XP · '+progress+'"><span aria-hidden="true">'+rank.symbol+'</span> Lv. '+level+' · '+rank.name+'</span>';
}
function communityAvatarLevelBadge(member){
 const points=Math.max(0,Number(member.communityPoints)||0),level=communityMemberLevel(points),rank=communityLevelTitle(level);
 return '<span class="community-avatar-level community-avatar-level-'+rank.tier+'" title="Level '+level+' · '+escapeHTML(rank.name)+' · '+points+' XP" aria-label="Level '+level+', '+escapeHTML(rank.name)+'"><span class="community-avatar-level-symbol" aria-hidden="true">'+rank.symbol+'</span><span class="community-avatar-level-number">'+level+'</span></span>';
}
function communityAvatarWithBadge(url,member,extraClass=''){
 return '<span class="community-avatar-wrap '+extraClass+'">'+(url?'<img class="member-avatar" src="'+escapeHTML(url)+'" alt="">':'<span class="member-avatar member-avatar-fallback">W</span>')+communityAvatarLevelBadge(member)+'</span>';
}
async function loadCommunityMemberLevels(communityId){
 try{const result=await api('/communities/'+encodeURIComponent(communityId)+'/leaderboard');
 const byId=new Map((result.items||[]).map(item=>[String(item.user_id||item.id),Number(item.points)||0]));
 state.moderationMembers=state.moderationMembers.map(m=>({...m,communityPoints:byId.get(String(m.user_id))||0}));
 }catch(error){console.warn('Community levels unavailable',error);}
}
// Accessible WIRED-themed replacement for native browser confirmation and input popups.
function wiredDialog(message,{input=false,defaultValue='',danger=true}={}){
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='wired-dialog-overlay';
  const dialog=document.createElement('section');dialog.className='wired-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','wiredDialogTitle');
  const title=document.createElement('h2');title.id='wiredDialogTitle';title.textContent=input?'WIRED · Member Management':danger?'Confirm Action':'WIRED';
  const body=document.createElement('p');body.textContent=message;
  const actions=document.createElement('div');actions.className='wired-dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='wired-dialog-cancel';cancel.textContent='Cancel';
  const accept=document.createElement('button');accept.type='button';accept.className=danger?'wired-dialog-danger':'wired-dialog-accept';accept.textContent=input?'Submit':/recycl/i.test(message)?'Recycle':/release/i.test(message)?'Release':'Confirm';
  dialog.append(title,body);
  let field=null;if(input){field=document.createElement('input');field.className='wired-dialog-input';field.value=defaultValue;field.setAttribute('aria-label',message);dialog.append(field);}
  actions.append(cancel,accept);dialog.append(actions);overlay.append(dialog);document.body.append(overlay);
  const previous=document.activeElement;
  const close=value=>{document.removeEventListener('keydown',keyHandler,true);overlay.remove();previous?.focus?.();resolve(value);};
  const keyHandler=e=>{if(e.key==='Escape'){e.preventDefault();close(input?null:false);}else if(e.key==='Tab'){const focusables=[cancel,...(field?[field]:[]),accept];const index=focusables.indexOf(document.activeElement);if(e.shiftKey&&index===0){e.preventDefault();accept.focus();}else if(!e.shiftKey&&index===focusables.length-1){e.preventDefault();cancel.focus();}}else if(e.key==='Enter'&&input){e.preventDefault();close(field.value);}};
  document.addEventListener('keydown',keyHandler,true);
  cancel.addEventListener('click',()=>close(input?null:false));accept.addEventListener('click',()=>close(input?field.value:true));
  overlay.addEventListener('click',e=>{if(e.target===overlay)close(input?null:false);});
  (field||cancel).focus();
 });
}
/* WIRED website — connected to the existing Supabase project and wired-api Edge Function. */
// Fresh main-branch deployment: gothic yokai portrait syntax was corrected.
const SUPABASE_URL = "https://kovvnvvkopqkgjmcvvdw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ptGg0nN4LZbi3Au4jVnB_Q_zaWr1N2X";
const API_BASE = `${SUPABASE_URL}/functions/v1/wired-api`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
const state = {page:"home", user:null, profile:null, communities:[], activeCommunity:null, activeThread:null, threads:[], messages:[], editAccountOpen:false,activeCommunityRole:null,joinRequests:[],discoveryQuery:"",discoveryCategory:"all",discoverySort:"newest",realtimeChannel:null,globalChatSection:(()=>{try{return ['home','direct','groups'].includes(sessionStorage.getItem('wired:globalChatSection'))?sessionStorage.getItem('wired:globalChatSection'):'home'}catch(e){return 'home'}})(),managerOpen:false,moderationMembers:[],moderationReports:[],moderationWarnings:[],moderationActions:[],profileImages:[],profileComments:[],profilePosts:[],viewingProfile:null,profileReturnPage:null,people:[],peopleSearchResults:null,discoverPeopleResults:null,peopleSearchRequest:0,discoverPeopleSearchRequest:0,peopleQuery:"",discoverPeopleQuery:"",incomingRequests:[],outgoingRequests:[],friends:[],profileSocial:{following:[],followers:[],friends:[]},profileSocialTab:"following",relationshipRequests:[],activeRelationship:null,communityCheckinState:{checked_in_today:false,points:0,streak:0},communityLeaderboard:[],communityRankTitles:{},leaderboardOpen:false,globalStoreItems:[],globalStorePurchases:[],globalStoreBalance:0,globalStoreEquipped:{},notifications:[],notificationUnread:0,notificationChannel:null,relationshipEndChannel:null,relationshipEndPopup:null,quizResults:{},petSpecies:[],userPets:[]};
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function errorText(e){return e?.message||"Something went wrong. Please try again."}
async function api(path,method="GET",body=null){
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token) throw new Error("Please log in first.");
  const res=await fetch(API_BASE+path,{method,cache:"no-store",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+session.access_token},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status}).`);
  return data;
}
async function loadProfile(){
  if(!state.user){state.profile=null;return;}
  const [profileResult,companionResult]=await Promise.all([
    sb.from("profiles").select("username,id_verified,bio,avatar_url,cover_url,equipped_frame_item_id,equipped_nameplate_item_id,equipped_theme_item_id").eq("id",state.user.id).maybeSingle(),
    sb.rpc("my_bonded_companion")
  ]);
  if(profileResult.error)throw profileResult.error;
  if(companionResult.error)throw companionResult.error;
  state.profile={...profileResult.data,companion:companionResult.data||null};
  // Read cosmetic slots directly through an authenticated server-side function.
  // This avoids stale or inconsistent profile SELECT results in the store UI.
  const {data:cosmetics,error:cosmeticError}=await sb.rpc('my_profile_cosmetic_state');
  if(cosmeticError)throw cosmeticError;
  if(cosmetics){
   state.profile.equipped_frame_item_id=cosmetics.frame||null;
   state.profile.equipped_nameplate_item_id=cosmetics.nameplate||null;
   state.profile.equipped_theme_item_id=cosmetics.theme||null;
  }
  if(!state.globalStoreItems.length)await loadGlobalStore().catch(e=>console.warn('Cosmetic catalog unavailable',e));
  state.profileComments=await loadProfileComments(state.user.id).catch(e=>{console.warn("Profile comments unavailable",e);return [];});
}
async function loadProfileComments(profileId){
 if(!profileId)return [];
 const {data,error}=await sb.from("profile_comments").select("id,profile_id,author_id,body,created_at,parent_comment_id").eq("profile_id",profileId).order("created_at",{ascending:true}).limit(300);
 if(error)throw error;const rows=data||[],ids=[...new Set(rows.map(x=>x.author_id))];
 const {data:authors,error:authorError}=ids.length?await sb.from("profiles").select("id,username,avatar_url").in("id",ids):{data:[],error:null};
 if(authorError)throw authorError;const byId=new Map((authors||[]).map(x=>[x.id,x]));
 return rows.map(x=>({...x,author:byId.get(x.author_id)||{username:"WIRED member"}}));
}
function profileCommentsMarkup(profileId,comments){
 const rows=comments||[],roots=rows.filter(x=>!x.parent_comment_id),replyCount=rows.filter(x=>x.parent_comment_id).length;
 const byParent=new Map(),byId=new Map(rows.map(x=>[String(x.id),x]));
 for(const item of rows){const parent=item.parent_comment_id?String(item.parent_comment_id):null;if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(item);}
 const ordered=[],seen=new Set();
 function walk(item,depth){
  const key=String(item.id);if(seen.has(key))return;seen.add(key);
  ordered.push({item,depth:Math.min(depth,8)});
  for(const child of byParent.get(key)||[])walk(child,depth+1);
 }
 for(const root of roots)walk(root,0);
 for(const item of rows)if(!seen.has(String(item.id)))walk(item,0);
 const renderOne=(x,depth)=>{
  const id=escapeHTML(x.id),canDelete=state.user&&(state.user.id===x.author_id||state.user.id===profileId);
  const parent=depth&&x.parent_comment_id?byId.get(String(x.parent_comment_id)):null;
  const replyLabel=depth?'<div class="profile-reply-context">↳ Reply to '+escapeHTML(parent?.author?.username||'comment')+'</div>':'';
  return '<article class="profile-comment'+(depth?' profile-comment-reply-item':'')+'" style="'+(depth?'margin-left:'+Math.min(depth*14,56)+'px;border-left:3px solid #a25bdf;':'')+'" id="profile-comment-'+id+'">'+replyLabel+'<div class="profile-comment-top"><strong>'+escapeHTML(x.author?.username||"WIRED member")+'</strong><time>'+escapeHTML(new Date(x.created_at).toLocaleString())+'</time>'+(canDelete?'<button type="button" class="profile-comment-delete" data-delete-profile-comment="'+id+'" aria-label="Delete comment">Delete</button>':'')+'</div><p>'+escapeHTML(x.body)+'</p>'+(state.user?'<button type="button" class="profile-comment-reply" data-show-reply="'+id+'">Reply</button><form class="profile-reply-form" data-reply-form="'+id+'" hidden><textarea name="body" maxlength="1000" rows="2" required placeholder="Write a reply…"></textarea><div class="profile-comment-footer"><span class="hint">Up to 1,000 characters.</span><button class="primary small" type="submit">Send reply</button></div></form>':'')+'</article>';
 };
 return '<section class="profile-comments" aria-label="Profile comments"><div class="section-head"><h3>Comments</h3><span class="hint">'+roots.length+' '+(roots.length===1?'comment':'comments')+' · '+replyCount+' '+(replyCount===1?'reply':'replies')+'</span></div>'+(state.user?'<form id="profileCommentForm" class="profile-comment-form"><label class="field"><span class="sr-only">Write a comment</span><textarea id="profileCommentBody" maxlength="1000" rows="3" required placeholder="Write a comment on this profile…"></textarea></label><div class="profile-comment-footer"><span class="hint">Be respectful. Up to 1,000 characters.</span><button class="primary" type="submit">Post comment</button></div></form>':'<p class="hint">Log in to leave a comment.</p>')+'<div class="profile-comment-list">'+(ordered.length?ordered.map(({item,depth})=>renderOne(item,depth)).join(''):'<p class="empty">No comments yet. Start the conversation.</p>')+'</div></section>';
}
function attachProfileCommentHandlers(profileId){
 $("profileCommentForm")?.addEventListener("submit",e=>postProfileComment(e,profileId));
 document.querySelectorAll("[data-show-reply]").forEach(b=>b.addEventListener("click",()=>{const f=document.querySelector('[data-reply-form="'+CSS.escape(b.dataset.showReply)+'"]');if(f){f.hidden=!f.hidden;if(!f.hidden)f.querySelector("textarea")?.focus();}}));
 document.querySelectorAll("[data-reply-form]").forEach(f=>f.addEventListener("submit",e=>postProfileCommentReply(e,profileId)));
 document.querySelectorAll("[data-delete-profile-comment]").forEach(b=>b.addEventListener("click",()=>deleteProfileComment(b.dataset.deleteProfileComment,profileId)));
}
async function postProfileComment(e,profileId){
 e.preventDefault();if(!state.user)return;const body=$("profileCommentBody")?.value.trim();if(!body)return;
 const button=$("profileCommentForm")?.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent="Posting…";}
 try{const {error}=await sb.from("profile_comments").insert({profile_id:profileId,author_id:state.user.id,body});if(error)throw error;
 const comments=await loadProfileComments(profileId);
 if(state.page==="member-profile"&&state.viewingProfile?.id===profileId){state.viewingProfile.comments=comments;renderMemberProfile();}
 else if(state.page==="profile"&&state.user.id===profileId){state.profileComments=comments;render();}
 toast("Comment posted.");
 }catch(err){toast(errorText(err));if(button){button.disabled=false;button.textContent="Post comment";}}
}
async function postProfileCommentReply(e,profileId){
 e.preventDefault();
 if(!state.user){toast("Log in to reply.");return;}
 const form=e.currentTarget;
 const body=form.querySelector('textarea[name="body"]')?.value.trim();
 const parentId=form.getAttribute("data-reply-form");
 if(!body||!parentId){toast("Enter a reply before sending.");return;}
 const button=form.querySelector('button[type="submit"]');
 if(button?.disabled)return;
 if(button){button.disabled=true;button.textContent="Sending…";}
 try{
  // Resolve the immediate parent, including when it is itself a reply.
  const {data:parent,error:parentError}=await sb.from("profile_comments").select("id,profile_id").eq("id",parentId).eq("profile_id",profileId).single();
  if(parentError)throw parentError;
  if(!parent)throw new Error("The comment you are replying to no longer exists.");
  const {data:posted,error}=await sb.from("profile_comments").insert({profile_id:profileId,author_id:state.user.id,body,parent_comment_id:parent.id}).select("id,parent_comment_id").single();
  if(error)throw error;
  if(String(posted.parent_comment_id)!==String(parent.id))throw new Error("Reply parent could not be verified.");
  const comments=await loadProfileComments(profileId);
  if(state.viewingProfile?.id===profileId&&state.page==="member-profile"){state.viewingProfile.comments=comments;renderMemberProfile();}
  else if(state.user.id===profileId){state.profileComments=comments;render();}
  toast("Reply posted.");
  requestAnimationFrame(()=>document.getElementById("profile-comment-"+posted.id)?.scrollIntoView({behavior:"smooth",block:"nearest"}));
 }catch(err){
  console.error("Profile nested reply failed",err);
  toast("Reply failed: "+errorText(err));
  if(button){button.disabled=false;button.textContent="Send reply";}
 }
}
async function deleteProfileComment(commentId,profileId){
 if(!commentId||!await wiredDialog("Delete this profile comment?"))return;
 try{const {error}=await sb.from("profile_comments").delete().eq("id",commentId);if(error)throw error;const comments=await loadProfileComments(profileId);
 if(state.page==="member-profile"&&state.viewingProfile?.id===profileId){state.viewingProfile.comments=comments;renderMemberProfile();}
 else if(state.page==="profile"&&state.user?.id===profileId){state.profileComments=comments;render();}
 toast("Comment deleted.");
 }catch(err){toast(errorText(err));}
}

async function loadCommunityProfileComments(cid,profileId){
 const {data,error}=await sb.from('community_profile_comments').select('id,community_id,profile_id,author_id,body,created_at,parent_comment_id').eq('community_id',cid).eq('profile_id',profileId).order('created_at',{ascending:true}).limit(300);
 if(error)throw error;
 const ids=[...new Set((data||[]).map(x=>x.author_id))];
 const {data:authors,error:authorError}=ids.length?await sb.from('profiles').select('id,username,avatar_url').in('id',ids):{data:[],error:null};
 if(authorError)throw authorError;
 const byId=new Map((authors||[]).map(x=>[x.id,x]));
 return (data||[]).map(x=>({...x,author:byId.get(x.author_id)||{username:'WIRED member'}}));
}
async function renderCommunityProfileComments(panel,cid,profileId){
 const slot=panel.querySelector('#communityProfileComments');
 if(!slot)return;
 try{
  const comments=await loadCommunityProfileComments(cid,profileId);
  if(!slot.isConnected)return;
  // Reuse the global profile comment tree, reply indentation and controls.
  slot.innerHTML=profileCommentsMarkup(profileId,comments).replace('id="profileCommentForm"','id="communityProfileCommentForm"').replace('id="profileCommentBody"','id="communityProfileCommentBody"');
  slot.querySelector('#communityProfileCommentForm')?.addEventListener('submit',async e=>{
   e.preventDefault();
   const form=e.currentTarget,body=form.querySelector('textarea')?.value.trim();if(!body)return;
   const button=form.querySelector('button[type="submit"]');button.disabled=true;
   try{
    const {error}=await sb.from('community_profile_comments').insert({community_id:cid,profile_id:profileId,author_id:state.user.id,body});
    if(error)throw error;
    await renderCommunityProfileComments(panel,cid,profileId);toast('Comment posted.');
   }catch(err){toast('Could not post comment: '+errorText(err));button.disabled=false;}
  });
  slot.querySelectorAll('[data-show-reply]').forEach(b=>b.addEventListener('click',()=>{
   const form=slot.querySelector('[data-reply-form="'+CSS.escape(b.dataset.showReply)+'"]');
   if(form){form.hidden=!form.hidden;if(!form.hidden)form.querySelector('textarea')?.focus();}
  }));
  slot.querySelectorAll('[data-reply-form]').forEach(form=>form.addEventListener('submit',async e=>{
   e.preventDefault();const body=form.querySelector('textarea')?.value.trim(),parentId=form.dataset.replyForm;
   if(!body||!parentId)return;
   const button=form.querySelector('button[type="submit"]');button.disabled=true;
   try{
    const {data:parent,error:parentError}=await sb.from('community_profile_comments').select('id').eq('id',parentId).eq('community_id',cid).eq('profile_id',profileId).single();
    if(parentError)throw parentError;
    const {error}=await sb.from('community_profile_comments').insert({community_id:cid,profile_id:profileId,author_id:state.user.id,body,parent_comment_id:parent.id});
    if(error)throw error;
    await renderCommunityProfileComments(panel,cid,profileId);toast('Reply posted.');
   }catch(err){toast('Could not post reply: '+errorText(err));button.disabled=false;}
  }));
  slot.querySelectorAll('[data-delete-profile-comment]').forEach(b=>b.addEventListener('click',async()=>{
   if(!await wiredDialog('Delete this community profile comment?'))return;
   try{
    const {error}=await sb.from('community_profile_comments').delete().eq('id',b.dataset.deleteProfileComment).eq('community_id',cid).eq('profile_id',profileId);
    if(error)throw error;
    await renderCommunityProfileComments(panel,cid,profileId);toast('Comment deleted.');
   }catch(err){toast('Could not delete comment: '+errorText(err));}
  }));
 }catch(err){slot.innerHTML='<p class="hint">Comments unavailable: '+escapeHTML(errorText(err))+'</p>';}
}
function unreadCommunityNotifications(communityId){
 return (state.notifications||[]).filter(row=>row.isCommunity&&row.community_id===communityId&&!row.read_at);
}
async function loadGlobalNotifications(){
 if(!state.user){state.notifications=[];state.notificationUnread=0;updateNotificationBell();return;}
 const {data,error}=await sb.from("global_notifications").select("id,recipient_id,actor_id,notification_type,profile_comment_id,thread_id,request_status,created_at,read_at").eq("recipient_id",state.user.id).order("created_at",{ascending:false}).limit(100);
 if(error)throw error;
 const {data:communityRows,error:communityError}=await sb.from('community_notifications').select('id,community_id,recipient_id,actor_id,post_id,thread_id,comment_id,details,notification_type,created_at,read_at').eq('recipient_id',state.user.id).order('created_at',{ascending:false}).limit(100);
 if(communityError)throw communityError;
 const combined=[...(data||[]),...(communityRows||[]).map(n=>({...n,isCommunity:true}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,150);
 const communityIds=[...new Set(combined.filter(n=>n.isCommunity).map(n=>n.community_id))];
 const {data:communityNames,error:communityNameError}=communityIds.length?await sb.from('communities').select('id,name').in('id',communityIds):{data:[],error:null};
 if(communityNameError)throw communityNameError;
 const communityMap=new Map((communityNames||[]).map(c=>[c.id,c.name]));
 const rows=combined,actorIds=[...new Set(rows.map(x=>x.actor_id))],commentIds=[...new Set(rows.map(x=>x.profile_comment_id).filter(Boolean))];
 const [actors,comments]=await Promise.all([
  actorIds.length?sb.from("profiles").select("id,username,avatar_url").in("id",actorIds):{data:[],error:null},
  commentIds.length?sb.from("profile_comments").select("id,body").in("id",commentIds):{data:[],error:null}
 ]);
 if(actors.error)throw actors.error;if(comments.error)throw comments.error;
 const actorMap=new Map((actors.data||[]).map(x=>[x.id,x])),commentMap=new Map((comments.data||[]).map(x=>[x.id,x]));
 state.notifications=rows.map(n=>({...n,actor:actorMap.get(n.actor_id)||{username:"WIRED member"},comment:commentMap.get(n.profile_comment_id),communityName:communityMap.get(n.community_id)||"Community"}));
 state.notificationUnread=rows.filter(n=>!n.read_at).length;updateNotificationBell();
}
async function openPointsHistory(){
 if(!state.user)return;
 document.getElementById('wiredPointsHistoryOverlay')?.remove();
 const overlay=document.createElement('div');overlay.id='wiredPointsHistoryOverlay';overlay.className='wired-points-overlay';
 overlay.innerHTML='<section class="wired-points-dialog" role="dialog" aria-modal="true" aria-labelledby="wiredPointsTitle"><div class="wired-points-dialog-head"><div><span class="pet-kicker">THE LEDGER OF FORTUNES</span><h2 id="wiredPointsTitle">Points history</h2></div><button type="button" class="ghost" data-close-points aria-label="Close points history">✕</button></div><p class="wired-points-current">Current balance: <strong>'+Number(state.globalStoreBalance||0).toLocaleString()+' points</strong></p><div id="wiredPointsHistoryBody"><p class="hint">Loading transactions…</p></div></section>';
 document.body.appendChild(overlay);
 const close=()=>overlay.remove();overlay.querySelector('[data-close-points]').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 const host=overlay.querySelector('#wiredPointsHistoryBody');
 try{
  const rows=[];let offset=0;const batchSize=500;
  while(true){
   const {data,error}=await sb.from('global_wallet_transactions').select('id,amount,transaction_type,description,created_at').eq('user_id',state.user.id).order('created_at',{ascending:false}).range(offset,offset+batchSize-1);
   if(error)throw error;rows.push(...(data||[]));
   if(!data||data.length<batchSize)break;
   offset+=batchSize;
   if(offset>=10000)break;
  }
  if(!host.isConnected)return;
  // Use the same freshly fetched ledger for both balance and transaction totals.
  state.globalStoreBalance=rows.reduce((sum,row)=>sum+(Number(row.amount)||0),0);
  const balanceLabel=overlay.querySelector('.wired-points-current strong');
  if(balanceLabel)balanceLabel.textContent=state.globalStoreBalance.toLocaleString()+' points';
  updateNotificationBell();
  const earned=rows.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);
  const spent=rows.reduce((n,x)=>n+Math.abs(Math.min(0,Number(x.amount)||0)),0);
  host.innerHTML='<div class="wired-points-totals"><div><span>Earned</span><strong class="points-earned">+'+earned.toLocaleString()+'</strong></div><div><span>Spent</span><strong class="points-spent">−'+spent.toLocaleString()+'</strong></div></div><h3>Transaction history</h3>'+(rows.length?'<div class="wired-points-transactions">'+rows.map(x=>{const amount=Number(x.amount)||0;return '<article class="wired-points-transaction"><div><strong>'+escapeHTML(x.description||x.transaction_type||'Points activity')+'</strong><small>'+escapeHTML(new Date(x.created_at).toLocaleString())+'</small></div><b class="'+(amount>=0?'points-earned':'points-spent')+'">'+(amount>=0?'+':'−')+Math.abs(amount).toLocaleString()+'</b></article>';}).join('')+'</div>':'<p class="hint">No recorded points transactions yet.</p>')+(offset>=10000?'<p class="hint">Showing the latest 10,000 transactions.</p>':'');
 }catch(err){if(host.isConnected)host.innerHTML='<p class="hint">Could not load points history: '+escapeHTML(errorText(err))+'</p>';}
}
document.addEventListener('click',e=>{if(e.target.closest('#headerPoints'))openPointsHistory();});
function updateNotificationBell(){
 const b=$("notificationsBtn"),count=$("notificationCount");if(!b)return;
 const communityCount=unreadCommunityNotifications(state.activeCommunity?.id).length;
 document.querySelectorAll('[data-community-unread]').forEach(badge=>{
  badge.hidden=!communityCount;
  badge.textContent=communityCount>99?'99+':String(communityCount);
 });
 b.hidden=!state.user;
 const points=$("headerPoints");if(points){points.hidden=!state.user;points.textContent="◉ "+Number(state.globalStoreBalance||0).toLocaleString()+" points";}
 if(count){count.textContent=state.notificationUnread>99?"99+":String(state.notificationUnread);count.hidden=!state.notificationUnread;}
}
function subscribeGlobalNotifications(){
 if(state.notificationChannel){sb.removeChannel(state.notificationChannel);state.notificationChannel=null;}
 if(!state.user)return;
 const recipient="recipient_id=eq."+state.user.id;
 const refresh=()=>loadGlobalNotifications().then(()=>{
  if(state.page==='notifications')renderNotifications();
  else if(isCommunitySection(state.activeCommunity?.id,'notifications'))renderCommunityNotifications();
 }).catch(error=>console.warn('Notifications refresh failed',error));
 state.notificationChannel=sb.channel("global-notifications-"+state.user.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"global_notifications",filter:recipient},refresh)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"community_notifications",filter:recipient},refresh)
  .subscribe();
}
async function openNotifications(){
 state.notificationUnread=0;updateNotificationBell();
 state.page="notifications";updateCommunityNavigation();try{sessionStorage.setItem("wired:lastPage","notifications");}catch(e){}document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
 try{await loadGlobalNotifications();renderNotifications();}catch(e){toast(errorText(e));}
}
function renderNotifications(communityId=null,host=$("view")){
 const v=host,rows=communityId?unreadCommunityNotifications(communityId):(state.notifications||[]).filter(n=>!n.read_at);
 v.innerHTML='<div class="section-head"><h2>'+(communityId?'Community notifications':'Notifications')+'</h2><button class="ghost" id="markAllNotificationsRead" '+(rows.length?'':'disabled')+'>Mark all read</button></div><div class="notification-list">'+(rows.length?rows.map(n=>{
  const who=escapeHTML(n.actor?.username||"WIRED member"),isComment=n.notification_type==="profile_comment";
  const isChat=n.notification_type==="global_chat_request",isCommunity=!!n.isCommunity;
  const detail=isCommunity?'<p class="notification-excerpt">From '+escapeHTML(n.communityName)+(n.details?' · '+escapeHTML(n.details):'')+'</p>':isComment&&n.comment?.body?'<p class="notification-excerpt">'+escapeHTML(n.comment.body)+'</p>':'';
  return '<div class="notification-item '+(n.read_at?'':'unread')+'"><button type="button" class="notification-open" data-notification-id="'+escapeHTML(n.id)+'" data-notification-actor="'+escapeHTML(n.actor_id)+'" data-notification-type="'+escapeHTML(n.notification_type)+'" data-notification-comment="'+escapeHTML(n.profile_comment_id||'')+'" data-notification-community="'+escapeHTML(n.community_id||'')+'"><span class="notification-avatar">'+(n.actor?.avatar_url?'<img src="'+escapeHTML(n.actor.avatar_url)+'" alt="">':'W')+'</span><span class="notification-copy"><strong>'+who+'</strong> '+(isCommunity?({'community_chat':'sent a community chat message in ','community_reply':'replied to you in ','community_mention':'mentioned you in ','community_relationship':'sent a relationship update from ','community_moderation':'sent a moderation notice from ','community_post':'posted in '}[n.notification_type]||'updated ')+escapeHTML(n.communityName):isChat?'invited you to a global chat':isComment?'commented on your profile':'started following you')+detail+'<time>'+escapeHTML(new Date(n.created_at).toLocaleString())+'</time></span><span class="notification-kind">'+(isCommunity?({'community_chat':'CHAT','community_reply':'REPLY','community_mention':'MENTION','community_relationship':'RELATIONSHIP','community_moderation':'MODERATION','community_post':'COMMUNITY'}[n.notification_type]||'COMMUNITY'):isChat?'CHAT REQUEST':isComment?'COMMENT':'FOLLOW')+'</span>'+(n.read_at?'':'<i class="notification-unread-dot"></i>')+'</button>'+(isChat&&n.request_status==='pending'?'<div class="chat-request-actions"><button type="button" class="primary" data-chat-request="'+escapeHTML(n.id)+'" data-thread="'+escapeHTML(n.thread_id)+'" data-status="accepted">Accept</button><button type="button" class="ghost" data-chat-request="'+escapeHTML(n.id)+'" data-thread="'+escapeHTML(n.thread_id)+'" data-status="declined">Decline</button></div>':isChat?'<span class="chat-request-status">'+escapeHTML(n.request_status||'closed')+'</span>':'')+'</div>';
 }).join(''):'<div class="empty">'+(communityId?'No unread notifications in this community.':'You’re all caught up.')+'</div>')+'</div>';
 v.querySelector("#markAllNotificationsRead")?.addEventListener("click",()=>communityId?markCommunityNotificationsRead(communityId):markAllNotificationsRead());
 v.querySelectorAll(".notification-open[data-notification-id]").forEach(b=>b.addEventListener("click",()=>openNotification(b.dataset.notificationId,b.dataset.notificationActor,b.dataset.notificationType,b.dataset.notificationComment,b.dataset.notificationCommunity)));
 v.querySelectorAll("[data-chat-request]").forEach(b=>b.addEventListener("click",()=>respondToGlobalChatRequest(b.dataset.chatRequest,b.dataset.thread,b.dataset.status,b)));
}
async function respondToGlobalChatRequest(notificationId,threadId,status,button){
 if(!notificationId||!threadId||!['accepted','declined'].includes(status))return;
 if(button){button.disabled=true;button.textContent=status==='accepted'?'Accepting…':'Declining…';}
 try{await api('/threads/'+encodeURIComponent(threadId)+'/request','POST',{notification_id:notificationId,status});await loadGlobalNotifications();renderNotifications();if(status==='accepted'){await loadThreads();state.page='chats';await openThread(threadId);toast('You joined the global chat.');}else toast('Chat request declined.');}
 catch(e){if(button){button.disabled=false;button.textContent=status==='accepted'?'Accept':'Decline';}toast(errorText(e));}
}

async function markAllNotificationsRead(){
 if(!state.user)return;
 const {error}=await sb.from("global_notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",state.user.id).is("read_at",null);
 if(error){toast(errorText(error));return;}
 const {error:communityError}=await sb.from("community_notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",state.user.id).is("read_at",null);
 if(communityError){toast(errorText(communityError));return;}state.notifications=state.notifications.map(n=>({...n,read_at:n.read_at||new Date().toISOString()}));state.notificationUnread=0;updateNotificationBell();await loadGlobalNotifications();renderNotifications();
}
async function openNotification(id,actorId,type,commentId,communityId){
 const row=state.notifications.find(n=>n.id===id&&(!communityId||n.community_id===communityId));
 if(row&&!row.read_at){const {error}=await sb.from(row.isCommunity?"community_notifications":"global_notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(error){toast(errorText(error));return;}await loadGlobalNotifications();}
 if(communityId){
  await openCommunity(communityId,row?.thread_id?'chats':'latest');
  if(state.activeCommunity?.id!==communityId||!state.activeCommunityRole)return;
  if(row?.thread_id){
   await loadThreads();
   if(state.page==='community'&&state.activeCommunity?.id===communityId)await openThread(row.thread_id);
  }else if(row?.post_id){
   document.querySelector('[data-community-post="'+CSS.escape(String(row.post_id))+'"]')?.scrollIntoView({block:'center'});
  }
  return;
 }
 if(type==="profile_comment"&&commentId){
  state.page="profile";await Promise.all([loadProfile(),loadProfileSocial(),loadRelationshipData()]).catch(()=>{});render();
  setTimeout(()=>document.getElementById("profile-comment-"+commentId)?.scrollIntoView({behavior:"smooth",block:"center"}),120);
 }else await openMemberProfile(actorId);
}

function showRelationshipEndedPopup(row){
 if(!state.user||!row||row.status!=="ended"||!row.ended_by||row.ended_by===state.user.id||![row.requester_id,row.recipient_id].includes(state.user.id))return;
 const key="wired-relationship-end-ack:"+state.user.id+":"+row.id;
 try{if(localStorage.getItem(key))return;}catch(e){}
 if(state.relationshipEndPopup?.id===row.id)return;
 state.relationshipEndPopup={id:row.id,key};
 const messages=["You've been dumped. 💔","Your subscription to this relationship has expired.","BREAKING NEWS: You've been dumped. Please remain calm."];
 const message=messages[Math.floor(Math.random()*messages.length)];
 document.getElementById("relationshipEndOverlay")?.remove();
 document.body.insertAdjacentHTML("beforeend",'<div class="relationship-end-overlay" id="relationshipEndOverlay"><section class="relationship-end-dialog" role="alertdialog" aria-modal="true" aria-labelledby="relationshipEndTitle" aria-describedby="relationshipEndMessage"><div class="relationship-end-icon" aria-hidden="true">💔</div><p class="relationship-end-kicker">WIRED RELATIONSHIP UPDATE</p><h2 id="relationshipEndTitle">Relationship ended</h2><p id="relationshipEndMessage">'+escapeHTML(message)+'</p><button type="button" class="primary" id="relationshipEndAccept">Accept</button></section></div>');
 document.getElementById("relationshipEndAccept")?.addEventListener("click",()=>{
  try{localStorage.setItem(key,new Date().toISOString());}catch(e){}
  state.relationshipEndPopup=null;
  document.getElementById("relationshipEndOverlay")?.remove();
 });
}
async function showCommunityRelationshipEndedPopup(row){
 if(!state.user||row?.status!=='ended'||!row.ended_by||row.ended_by===state.user.id||![row.requester_id,row.recipient_id].includes(state.user.id))return;
 const key='wired-community-relationship-end-ack:'+state.user.id+':'+row.id;
 try{if(localStorage.getItem(key))return;}catch(e){}
 if(state.relationshipEndPopup?.id===row.id)return;
 const {data:community,error}=await sb.from('communities').select('name').eq('id',row.community_id).maybeSingle();
 if(error){console.warn('Community relationship popup lookup failed',error);return;}
 const communityName=community?.name||'Unknown community';
 state.relationshipEndPopup={id:row.id,key};
 const messages=["You've been dumped. 💔","Your subscription to this relationship has expired.","BREAKING NEWS: You've been dumped. Please remain calm."];
 const message=messages[Math.floor(Math.random()*messages.length)];
 document.getElementById('relationshipEndOverlay')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="relationship-end-overlay" id="relationshipEndOverlay"><section class="relationship-end-dialog" role="alertdialog" aria-modal="true" aria-labelledby="relationshipEndTitle" aria-describedby="relationshipEndMessage"><div class="relationship-end-icon" aria-hidden="true">💔</div><p class="relationship-end-kicker">WIRED COMMUNITY RELATIONSHIP UPDATE</p><h2 id="relationshipEndTitle">Relationship ended</h2><p class="hint">Community: '+escapeHTML(communityName)+'</p><p id="relationshipEndMessage">'+escapeHTML(message)+'</p><button type="button" class="primary" id="relationshipEndAccept">Accept</button></section></div>');
 document.getElementById('relationshipEndAccept')?.addEventListener('click',()=>{
  try{localStorage.setItem(key,new Date().toISOString());}catch(e){}
  state.relationshipEndPopup=null;document.getElementById('relationshipEndOverlay')?.remove();
 });
}
async function checkCommunityRelationshipEnds(){
 if(!state.user)return;
 const uid=state.user.id;
 const {data,error}=await sb.from('community_relationships').select('id,community_id,requester_id,recipient_id,status,ended_by,updated_at').eq('status','ended').or('requester_id.eq.'+uid+',recipient_id.eq.'+uid).order('updated_at',{ascending:false}).limit(15);
 if(error){console.warn('Community breakup lookup failed',error);return;}
 for(const row of data||[]){
  if(row.ended_by===uid)continue;
  const key='wired-community-relationship-end-ack:'+uid+':'+row.id;
  try{if(localStorage.getItem(key))continue;}catch(e){}
  await showCommunityRelationshipEndedPopup(row);break;
 }
}
function subscribeCommunityRelationshipEnds(){
 if(state.communityRelationshipEndChannel){sb.removeChannel(state.communityRelationshipEndChannel);state.communityRelationshipEndChannel=null;}
 if(!state.user)return;
 state.communityRelationshipEndChannel=sb.channel('community-relationship-ends-'+state.user.id)
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'community_relationships'},payload=>{
   const row=payload.new;
   if(row?.status==='ended')showCommunityRelationshipEndedPopup(row).catch(e=>console.warn(e));
  }).subscribe();
 checkCommunityRelationshipEnds().catch(e=>console.warn(e));
}
function subscribeRelationshipEnds(){
 if(state.relationshipEndChannel){sb.removeChannel(state.relationshipEndChannel);state.relationshipEndChannel=null;}
 if(!state.user)return;
 state.relationshipEndChannel=sb.channel("relationship-ends-"+state.user.id)
  .on("postgres_changes",{event:"UPDATE",schema:"public",table:"relationship_requests"},payload=>{
   const row=payload.new;
   if(row?.status==="ended"&&row.ended_by&&row.ended_by!==state.user?.id&&[row.requester_id,row.recipient_id].includes(state.user?.id))showRelationshipEndedPopup(row);
  }).subscribe();
}
async function loadRelationshipData(){
 if(!state.user){state.relationshipRequests=[];state.activeRelationship=null;return;}
 const q=await sb.from("relationship_requests").select("id,requester_id,recipient_id,status,ended_by,created_at,updated_at").or("requester_id.eq."+state.user.id+",recipient_id.eq."+state.user.id).order("created_at",{ascending:false});
 if(q.error)throw q.error;const rows=q.data||[],ids=[...new Set(rows.map(r=>r.requester_id===state.user.id?r.recipient_id:r.requester_id))];
 const p=ids.length?await sb.from("profiles").select("id,username,avatar_url").in("id",ids):{data:[],error:null};if(p.error)throw p.error;
 const byId=new Map((p.data||[]).map(x=>[x.id,x]));state.relationshipRequests=rows.map(r=>({...r,person:byId.get(r.requester_id===state.user.id?r.recipient_id:r.requester_id)}));
 state.activeRelationship=state.relationshipRequests.find(r=>r.status==="accepted")||null;
 const ended=state.relationshipRequests.find(r=>r.status==="ended"&&r.ended_by&&r.ended_by!==state.user.id);if(ended)showRelationshipEndedPopup(ended);
}
async function requestRelationship(id){try{
 await loadRelationshipData();
 if(state.activeRelationship)throw new Error("End your current relationship first.");
 const f=await sb.from("friend_requests").select("id").eq("status","accepted").or("and(sender_id.eq."+state.user.id+",recipient_id.eq."+id+"),and(sender_id.eq."+id+",recipient_id.eq."+state.user.id+")").limit(1).maybeSingle();
 if(f.error)throw f.error;if(!f.data)throw new Error("You must be friends first.");
 const q=await sb.from("relationship_requests").insert({requester_id:state.user.id,recipient_id:id,status:"pending"});if(q.error)throw q.error;
 toast("Relationship request sent.");await openMemberProfile(id);
}catch(e){toast(errorText(e));}}
async function relationshipAction(id,status){try{
 const q=await sb.from("relationship_requests").update({status:status,ended_by:status==="ended"?state.user.id:null,updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;
 toast(status==="accepted"?"Relationship confirmed on both profiles.":"Relationship status updated.");
 if(status==="ended"){const ended=await sb.from("relationship_requests").select("id,requester_id,recipient_id,status,ended_by").eq("id",id).maybeSingle();if(!ended.error)showRelationshipEndedPopup(ended.data);}
 if(state.page==="member-profile"&&state.viewingProfile)await openMemberProfile(state.viewingProfile.id);else{await loadRelationshipData();render();}
}catch(e){toast(errorText(e));}}
function myRelationshipMarkup(){
 const rows=state.relationshipRequests||[];
 const incoming=rows.filter(r=>r.status==="pending"&&r.recipient_id===state.user.id);
 const outgoing=rows.filter(r=>r.status==="pending"&&r.requester_id===state.user.id);
 if(!incoming.length&&!outgoing.length)return "";
 let h='<section class="profile-relationship"><h2>Relationship requests</h2>';
 if(incoming.length)h+='<h3>Incoming requests</h3>'+incoming.map(r=>'<div class="relationship-request"><span>'+escapeHTML(r.person?.username||"WIRED member")+'</span><button class="primary" data-rel-accept="'+r.id+'">Accept</button><button class="ghost" data-rel-decline="'+r.id+'">Decline</button></div>').join("");
 if(outgoing.length)h+='<h3>Sent requests</h3>'+outgoing.map(r=>'<div class="relationship-request"><span>'+escapeHTML(r.person?.username||"WIRED member")+'</span><button class="ghost" data-rel-cancel="'+r.id+'">Cancel</button></div>').join("");
 return h+'</section>';
}
function relationshipSubtitleMarkup(r, own=false){
 if(!r||r.status!=="accepted")return "";
 const partner=r.person?.username||(own?"WIRED member":"WIRED member");
 const partnerId=r.person?.id;
 const avatarUrl=r.person?.avatar_url;
 const avatar=avatarUrl?'<img src="'+escapeHTML(avatarUrl)+'" alt="'+escapeHTML(partner)+' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':'<span aria-hidden="true">'+escapeHTML(partner.slice(0,1).toUpperCase())+'</span>';
 const portrait='<span class="relationship-partner-avatar" style="display:inline-flex;flex:none;width:30px;height:30px;border-radius:50%;overflow:hidden;align-items:center;justify-content:center;background:#321b48;border:1px solid #a66bdd;color:#fff;vertical-align:middle">'+avatar+'</span>';
 const partnerLink=partnerId?'<button type="button" class="profile-relationship-partner-link" data-relationship-partner="'+escapeHTML(partnerId)+'" style="display:inline-flex;align-items:center;gap:8px;vertical-align:middle">'+portrait+'<span>'+escapeHTML(partner)+'</span></button>':portrait+' '+escapeHTML(partner);
 return '<div class="profile-relationship-subtitle-row"><p class="profile-relationship-subtitle">In a relationship with '+partnerLink+'</p>'+(own?'<button type="button" class="ghost small" id="relationshipEndOwnBtn">End relationship</button>':'')+'</div>';
}
function relationshipMarkup(p){
 const r=p.relationshipRequest;
 if(r&&r.status==="accepted")return '<section class="profile-relationship"><h3>In a relationship</h3><p>Mutually confirmed with this member.</p>'+(p.currentRelationship&&p.currentRelationship.id===r.id?'<button class="ghost" id="relationshipEndBtn">End relationship</button>':'')+'</section>';
 if(r&&r.status==="pending"&&r.recipient_id===state.user.id)return '<section class="profile-relationship"><h3>Relationship request</h3><button class="primary" id="relationshipAcceptBtn">Accept</button><button class="ghost" id="relationshipDeclineBtn">Decline</button></section>';
 if(r&&r.status==="pending")return '<section class="profile-relationship"><h3>Relationship request sent</h3><button class="ghost" id="relationshipCancelBtn">Cancel</button></section>';
 if(p.friendRequest&&p.friendRequest.status==="accepted"&&!p.currentRelationship)return '<section class="profile-relationship"><h3>Relationship status</h3><button class="ghost" id="relationshipRequestBtn">Request relationship</button></section>';
 return "";
}
async function loadProfileGallery(){
 if(!state.user){state.profileImages=[];return;}
 const {data,error}=await sb.from("profile_images").select("id,user_id,image_url,storage_path,created_at").eq("user_id",state.user.id).order("created_at",{ascending:false});
 if(error)throw error;state.profileImages=data||[];
}
async function loadProfileSocial(){
 if(!state.user){state.profileSocial={following:[],followers:[],friends:[]};return;}
 const [followingResult,followersResult,friendsResult]=await Promise.all([
  sb.from("profile_follows").select("following_id").eq("follower_id",state.user.id),
  sb.from("profile_follows").select("follower_id").eq("following_id",state.user.id),
  sb.from("friend_requests").select("sender_id,recipient_id").eq("status","accepted").or("sender_id.eq."+state.user.id+",recipient_id.eq."+state.user.id)
 ]);
 if(followingResult.error)throw followingResult.error;
 if(followersResult.error)throw followersResult.error;
 if(friendsResult.error)throw friendsResult.error;
 const followingIds=(followingResult.data||[]).map(x=>x.following_id);
 const followerIds=(followersResult.data||[]).map(x=>x.follower_id);
 const friendIds=followingIds.filter(id=>followerIds.includes(id));
 const ids=[...new Set([...followingIds,...followerIds,...friendIds])];
 const {data:profiles,error}=ids.length?await sb.from("profiles").select("id,username,avatar_url").in("id",ids):{data:[],error:null};
 if(error)throw error;
 const byId=new Map((profiles||[]).map(p=>[p.id,p]));
 state.profileSocial={
  following:followingIds.map(id=>byId.get(id)).filter(Boolean),
  followers:followerIds.map(id=>byId.get(id)).filter(Boolean),
  friends:[...new Set(friendIds)].map(id=>byId.get(id)).filter(Boolean)
 };
}
function profileSocialMarkup(){
 const social=state.profileSocial||{following:[],followers:[],friends:[]};
 const tabs=[["following","Following"],["followers","Followers"],["friends","Friends"]];
 return '<section class="profile-social-section" aria-label="Social connections"><div class="profile-social-counts">'+tabs.map(([key,label])=>'<button type="button" class="profile-social-count" data-social-open="'+key+'"><strong>'+social[key].length+'</strong><span>'+label+'</span><small>View list →</small></button>').join("")+'</div></section>';
}
function renderProfileSocialPage(){
 const social=state.profileSocial||{following:[],followers:[],friends:[]};
 const tabs=[["following","Following"],["followers","Followers"],["friends","Friends"]];
 const active=state.profileSocialTab||"following";
 const rows=social[active]||[];
 const v=$("view");
 v.innerHTML='<button type="button" class="link" id="backToMyProfile">← Back to profile</button><div class="section-head"><h2>'+tabs.find(x=>x[0]===active)[1]+'</h2><p>'+rows.length+' '+(rows.length===1?'member':'members')+'</p></div><div class="profile-social-list">'+(rows.length?rows.map(p=>'<button type="button" class="profile-social-person" data-social-person="'+escapeHTML(p.id)+'"><span class="profile-social-avatar">'+(p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="">':'W')+'</span><b>'+escapeHTML(p.username||"WIRED member")+'</b><span>View profile →</span></button>').join(""):'<p class="empty">No '+active+' yet.</p>')+'</div>';
 v.querySelector("#backToMyProfile")?.addEventListener("click",()=>nav("profile"));
 v.querySelectorAll("[data-social-person]").forEach(b=>b.addEventListener("click",()=>openMemberProfile(b.dataset.socialPerson)));
}

async function openMemberProfile(userId){
 if(!userId)return;
 if(state.user?.id===userId){state.profileReturnPage=state.page;state.page='profile';render();return;}
 try{const block=await wiredBlockState(userId);if(block.blockedBy){toast('This profile is unavailable.');return;}if(block.blocked){state.viewingProfile={id:userId,username:'Blocked member',wiredBlocked:true};state.page='member-profile';renderMemberProfile();return;}}catch(e){toast(errorText(e));return;}
 try{
  state.profileReturnPage=state.page;
  const [profileResult,companionResult]=await Promise.all([
   sb.from('profiles').select('id,username,bio,avatar_url,cover_url,id_verified,equipped_frame_item_id,equipped_nameplate_item_id,equipped_theme_item_id').eq('id',userId).maybeSingle(),
   sb.rpc('profile_bonded_companion',{p_profile_id:userId})
  ]);
  const {data,error}=profileResult;
  if(error)throw error;
  if(!data)throw new Error('This profile is unavailable.');
  if(companionResult.error)throw companionResult.error;
  data.companion=companionResult.data||null;
  const [{data:comments,error:commentError},{data:follow},{data:friend},{data:relationship},{data:currentRelationship},{data:reverseFollow}] = await Promise.all([
   sb.from('profile_comments') .select('id,profile_id,author_id,body,created_at,parent_comment_id').eq('profile_id',userId).order('created_at',{ascending:false}).limit(100),
   sb.from('profile_follows').select('follower_id').eq('follower_id',state.user.id).eq('following_id',userId).maybeSingle(),
   sb.from('friend_requests').select('id,sender_id,recipient_id,status').or('and(sender_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(sender_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').order('created_at',{ascending:false}).limit(1).maybeSingle(),
   sb.from('relationship_requests').select('id,requester_id,recipient_id,status').or('and(requester_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(requester_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').in('status',['pending','accepted']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   sb.from('relationship_requests').select('id,requester_id,recipient_id,status').or('and(requester_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(requester_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').eq('status','accepted').limit(1).maybeSingle(),
   sb.from('profile_follows').select('follower_id').eq('follower_id',userId).eq('following_id',state.user.id).maybeSingle()
  ]);
  if(commentError)throw commentError;
  const commentIds=[...new Set((comments||[]).map(x=>x.author_id))];const {data:commentAuthors,error:authorsError}=commentIds.length?await sb.from('profiles').select('id,username,avatar_url').in('id',commentIds):{data:[],error:null};if(authorsError)throw authorsError;const authorMap=new Map((commentAuthors||[]).map(x=>[x.id,x]));
  // A public profile displays its owner's confirmed relationship, not only a relationship with the viewer.
  const {data:publicRelationship,error:publicRelationshipError}=await sb.from('relationship_requests')
    .select('id,requester_id,recipient_id,status')
    .or('requester_id.eq.'+userId+',recipient_id.eq.'+userId)
    .eq('status','accepted').limit(1).maybeSingle();
  if(publicRelationshipError)throw publicRelationshipError;
  let displayRelationship=null;
  if(publicRelationship){
    const partnerId=publicRelationship.requester_id===userId?publicRelationship.recipient_id:publicRelationship.requester_id;
    const {data:partner,error:partnerError}=await sb.from('profiles').select('id,username,avatar_url').eq('id',partnerId).maybeSingle();
    if(partnerError)throw partnerError;
    displayRelationship={...publicRelationship,person:partner||{id:partnerId,username:'WIRED member'}};
  }
  state.viewingProfile={...data,comments:(comments||[]).map(x=>({...x,author:authorMap.get(x.author_id)||{username:'WIRED member'}})),isFollowing:!!follow,followsMe:!!reverseFollow,friendRequest:friend||null,relationshipRequest:relationship||null,currentRelationship:currentRelationship||null,displayRelationship};state.page='member-profile';try{sessionStorage.setItem('wired:openedMember',userId);sessionStorage.setItem('wired:lastPage','member-profile');}catch(e){}renderMemberProfile();
 }catch(e){toast(errorText(e));}
}
function profileYokaiMarkup(companion){
 if(!companion)return "";
 const species=companion.display_name||"Yokai";
 const name=companion.nickname||species;
 const portrait=yokaiPortraitUrl(species,companion.pet_key,false);
 const speciesClass=String(companion.pet_key||species).toLowerCase().replace(/[^a-z0-9-]/g,"");
 return '<section class="profile-yokai-card yokai-motion yokai-'+escapeHTML(speciesClass)+'"><div class="profile-yokai-art'+yokaiBackgroundClass(companion.background_sku)+'"'+yokaiBackgroundStyle(companion.background_sku)+'><img class="yokai-portrait-image" src="'+portrait+'" alt="'+escapeHTML(species)+' companion">'+yokaiAccessoryOverlay((state.petEquipment||[]).filter(x=>String(x.pet_id)===String(companion.id)),companion)+'</div><div class="profile-yokai-info"><span class="profile-yokai-kicker">✦ BONDED COMPANION</span><h3>'+escapeHTML(name)+'</h3><p>'+escapeHTML(species)+' · Level '+Number(companion.level||1)+'</p><span class="profile-yokai-rarity">'+escapeHTML(companion.rarity||"Common")+'</span></div></section>';
}
async function openViewedMemberSocial(userId,type){
 try{
  const [a,b]=await Promise.all([sb.from('profile_follows').select('following_id').eq('follower_id',userId),sb.from('profile_follows').select('follower_id').eq('following_id',userId)]);
  if(a.error||b.error)throw a.error||b.error;
  const following=(a.data||[]).map(x=>x.following_id),followers=(b.data||[]).map(x=>x.follower_id);
  const ids=type==='following'?following:type==='followers'?followers:following.filter(id=>followers.includes(id));
  const {data,error}=ids.length?await sb.from('profiles').select('id,username,avatar_url').in('id',ids):{data:[],error:null};
  if(error)throw error;
  const v=$('view');v.innerHTML='<button type="button" class="link" id="backViewedSocial">← Back to profile</button><h2>'+escapeHTML(type[0].toUpperCase()+type.slice(1))+'</h2><div class="profile-social-list">'+((data||[]).map(p=>'<button type="button" class="profile-social-person" data-social-person="'+escapeHTML(p.id)+'"><b>'+escapeHTML(p.username||'WIRED member')+'</b></button>').join('')||'<p class="hint">No members.</p>')+'</div>';
  v.querySelector('#backViewedSocial')?.addEventListener('click',()=>openMemberProfile(userId));
  v.querySelectorAll('[data-social-person]').forEach(el=>el.addEventListener('click',()=>openMemberProfile(el.dataset.socialPerson)));
 }catch(e){toast(errorText(e));}
}
function renderMemberProfile(){
 const p=state.viewingProfile;if(!p)return;
 const v=$('view');
 if(p.wiredBlocked){v.innerHTML='<section class="card"><h2>Blocked</h2><p>You blocked this member across WIRED.</p><button type="button" class="ghost" id="profileBlockBtn">Blocked</button></section>';v.querySelector('#profileBlockBtn')?.addEventListener('click',()=>toggleWiredBlock(p.id));return;}const cover=p.cover_url?'url("'+escapeHTML(p.cover_url)+'")':'linear-gradient(120deg,#49246b,#171020 60%,#29133b)';
 const avatar=p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="Profile photo">':'W';
 const fr=p.friendRequest;const isMutualFriend=!!(p.isFollowing&&p.followsMe);const friendLabel=isMutualFriend?'Friends':'Follow each other to become friends';
 v.innerHTML='<button class="link" id="backMemberProfile">← Back</button><div class="profile-cover member-profile-cover" style="background-image:'+cover+'"></div><section class="card profile-custom-card '+(p.equipped_theme_item_id?'equipped-profile-theme ':'')+equippedCosmeticClass(p.equipped_theme_item_id,'theme')+' '+(p.equipped_theme_item_id==='d703a32c-2257-4bb6-b18c-9f87d0fdc3a6'?'black-rose-theme':'')+'"><div class="profile-person"><div class="profile-avatar '+(p.equipped_frame_item_id?'equipped-neon-frame':'')+' '+equippedCosmeticClass(p.equipped_frame_item_id,'frame')+' '+(p.equipped_frame_item_id==='1a48d530-1e6b-4bde-9c99-c242bda3990c'?'orange-fruit-frame':'')+'">'+avatar+'</div><div><h2 class="'+(p.equipped_nameplate_item_id?'equipped-nameplate':'')+' '+equippedCosmeticClass(p.equipped_nameplate_item_id,'nameplate')+' '+(p.equipped_nameplate_item_id==='8028d5a4-d964-45e8-8241-fb00c652a42a'?'orange-fruit-nameplate':'')+' '+(p.equipped_theme_item_id?'equipped-violet-theme':'')+'">'+escapeHTML(p.username||'WIRED member')+(p.id_verified?' <span class="pill">✓ Verified</span>':'')+'</h2>'+relationshipSubtitleMarkup(p.displayRelationship,false)+(isMutualFriend?'<button type="button" class="ghost profile-name-chat" id="profileChatBtn">Chat</button>':'')+'</div></div>'+relationshipMarkup(p)+profileYokaiMarkup(p.companion)+'<section class="profile-about"><h3>About me</h3><p>'+escapeHTML(p.bio||'This member hasn’t added a biography yet.')+'</p></section><div class="profile-social-actions"><button class="primary" id="profileFollowBtn">'+(p.isFollowing?'Following':'＋ Follow')+'</button><span class="profile-friend-status">'+friendLabel+'</span>' +'<button type="button" class="ghost" id="profileSendGiftBtn">🎁 Send Gift</button><button type="button" class="ghost" id="profileBlockBtn" style="color:#ff525f;border-color:#b42b42;font-size:.75rem;padding:.3rem .55rem">Block</button></div>'+profileCommentsMarkup(p.id,p.comments)+'</section>';
 attachProfileCommentHandlers(p.id);
 const quick=document.createElement('div');quick.className='profile-social-actions';quick.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
 quick.innerHTML=['Followers','Following','Friends'].map((label,i)=>'<button type="button" class="ghost small" data-member-social="'+['followers','following','friends'][i]+'">'+label+'</button>').join('');
 const actions=v.querySelector('.profile-social-actions');if(actions){for(const id of ['profileBlockBtn','profileSendGiftBtn']){const btn=actions.querySelector('#'+id);if(btn)quick.appendChild(btn);}}
 const companionSection=v.querySelector('.profile-yokai-card, .profile-companion, .profile-yokai, .bonded-companion, .profile-yokai-section, .profile-companion-section');
 if(companionSection)companionSection.before(quick);else (v.querySelector('.profile-about')||v.querySelector('.profile-person'))?.before(quick);
 quick.querySelectorAll('[data-member-social]').forEach(el=>el.addEventListener('click',()=>openViewedMemberSocial(p.id,el.dataset.memberSocial)));
 $('backMemberProfile')?.addEventListener('click',()=>{if(state.profileReturnPage==='community'&&state.activeCommunity){state.page='community';renderCommunity()}else nav('people')});
 $('profileFollowBtn')?.addEventListener('click',()=>toggleFollow(p.id));

 $('profileChatBtn')?.addEventListener('click',()=>startDMByUsername(p.username));
 $('profileSendGiftBtn')?.addEventListener('click',()=>openGiftShopForProfile(p.id,p.username));
 $('profileBlockBtn')?.addEventListener('click',()=>toggleWiredBlock(p.id));
 $('relationshipRequestBtn')?.addEventListener('click',()=>requestRelationship(p.id));
 $('relationshipAcceptBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'accepted'));
 $('relationshipDeclineBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'declined'));
 $('relationshipCancelBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'ended'));
 $('relationshipEndBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'ended'));
}
async function toggleFollow(userId){
 try{const {data:existing,error}=await sb.from('profile_follows').select('follower_id').eq('follower_id',state.user.id).eq('following_id',userId).maybeSingle();if(error)throw error;
 if(existing){const {error:e}=await sb.from('profile_follows').delete().eq('follower_id',state.user.id).eq('following_id',userId);if(e)throw e;}else{const {error:e}=await sb.from('profile_follows').insert({follower_id:state.user.id,following_id:userId});if(e)throw e;}
 if(state.viewingProfile?.id===userId){state.viewingProfile.isFollowing=!existing;renderMemberProfile();await loadProfileSocial();}else{toast(existing?'Unfollowed profile.':'Following profile.');await loadPeople();}
 }catch(e){toast(errorText(e));}
}
async function handleProfileFriend(p){
 try{const fr=p.friendRequest;if(fr?.status==='accepted'){await startDMByUsername(p.username);return;}
 if(fr?.status==='pending'&&fr.recipient_id===state.user.id){const {error}=await sb.from('friend_requests').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',fr.id);if(error)throw error;toast('Friend request accepted.');}
 else if(fr?.status==='pending'){toast('Friend request already sent.');return;}
 else{const {error}=await sb.from('friend_requests').insert({sender_id:state.user.id,recipient_id:p.id,status:'pending'});if(error)throw error;toast('Friend request sent.');}
 await openMemberProfile(p.id);
 }catch(e){toast(errorText(e));}
}
async function startDMByUsername(username){try{
 const {data:target,error:targetError}=await sb.from('profiles').select('id').eq('username',username).maybeSingle();
 if(targetError)throw targetError;
 if(!target?.id)throw new Error('Profile not found.');
 const {data:follows,error:friendError}=await sb.from('profile_follows').select('follower_id,following_id').or('and(follower_id.eq.'+state.user.id+',following_id.eq.'+target.id+'),and(follower_id.eq.'+target.id+',following_id.eq.'+state.user.id+')');
 if(friendError)throw friendError;
 const {data:friendships,error:friendshipError}=await sb.from('friend_requests').select('id').eq('status','accepted').or('and(sender_id.eq.'+state.user.id+',recipient_id.eq.'+target.id+'),and(sender_id.eq.'+target.id+',recipient_id.eq.'+state.user.id+')').limit(1);
 if(friendshipError)throw friendshipError;
 if(!follows?.some(f=>f.follower_id===target.id&&f.following_id===state.user.id)&&!friendships?.length)throw new Error('You can only start a global chat with someone who follows you or is your friend.');
 const d=await api('/threads/dm','POST',{username});
 state.page='chats';await loadThreads();await openThread(d.id);}catch(e){toast(errorText(e));}}
async function searchGlobalPeople(query,scope="people"){
 const key=scope==="discover"?"discoverPeopleSearchRequest":"peopleSearchRequest";
 const token=(state[key]||0)+1;state[key]=token;
 const term=String(query||"").trim();
 if(scope==="discover"&&!term){state.discoverPeopleResults=[];renderDiscoverPeople();return;}
 try{
  const {data,error}=await sb.from("profiles").select("id,username,bio,avatar_url,id_verified").neq("id",state.user.id).ilike("username","%"+term+"%").order("username").limit(50);
  if(error)throw error;
  if(state[key]!==token)return;
  if(scope==="discover"){state.discoverPeopleResults=data||[];renderDiscoverPeople();}
  else{state.peopleSearchResults=data||[];renderPeople();}
  const input=$(scope==="discover"?"discoverPeopleSearch":"peopleSearch");
  if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}
 }catch(e){toast(errorText(e));}
}
async function loadPeople(){
 if(!state.user)return;
 try{const [profiles,requests]=await Promise.all([
  sb.from('profiles').select('id,username,bio,avatar_url,id_verified').neq('id',state.user.id).order('username').limit(100),
  sb.from('friend_requests').select('id,sender_id,recipient_id,status,created_at').or('sender_id.eq.'+state.user.id+',recipient_id.eq.'+state.user.id).order('created_at',{ascending:false}).limit(100)
 ]);
 if(profiles.error)throw profiles.error;if(requests.error)throw requests.error;
 state.people=profiles.data||[];
 const {data:following,error:followError}=await sb.from('profile_follows').select('following_id').eq('follower_id',state.user.id);if(followError)throw followError;state.peopleFollowing=new Set((following||[]).map(x=>x.following_id));
 const rows=requests.data||[];
 const accepted=rows.filter(x=>x.status==='accepted');const incoming=rows.filter(x=>x.status==='pending'&&x.recipient_id===state.user.id);const outgoing=rows.filter(x=>x.status==='pending'&&x.sender_id===state.user.id);
 const ids=[...new Set([...accepted.map(x=>x.sender_id===state.user.id?x.recipient_id:x.sender_id),...incoming.map(x=>x.sender_id),...outgoing.map(x=>x.recipient_id)])];
 const {data:names,error:nameError}=ids.length?await sb.from('profiles').select('id,username,avatar_url').in('id',ids):{data:[],error:null};if(nameError)throw nameError;
 const map=new Map((names||[]).map(x=>[x.id,x]));
 state.friends=accepted.map(x=>({...x,person:map.get(x.sender_id===state.user.id?x.recipient_id:x.sender_id)}));
 state.incomingRequests=incoming.map(x=>({...x,person:map.get(x.sender_id)}));
 state.outgoingRequests=outgoing.map(x=>({...x,person:map.get(x.recipient_id)}));
 if(state.page==='people')render();
 }catch(e){toast(errorText(e));}
}
async function respondFriendRequest(id,status){try{const {error}=await sb.from('friend_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;toast(status==='accepted'?'Friend added.':'Request declined.');await loadPeople();}catch(e){toast(errorText(e));}}
function renderPeople(){
 if(!state.user){$('view').innerHTML='<div class="empty">Log in to discover global WIRED profiles and connect with members.</div>';return;}
 const q=state.peopleQuery.trim().toLowerCase();const results=(state.peopleSearchResults||state.people).filter(p=>String(p.username||'').toLowerCase().includes(q));
 const personCard=p=>{const fr=[...state.incomingRequests,...state.outgoingRequests,...state.friends].find(x=>x.sender_id===p.id||x.recipient_id===p.id);const isFollowing=state.peopleFollowing?.has(p.id);const avatar=p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="">':'W';return '<article class="card people-card"><button class="people-person" data-person="'+escapeHTML(p.id)+'"><span class="profile-avatar">'+avatar+'</span><span><b>'+escapeHTML(p.username||'WIRED member')+'</b><small>'+escapeHTML(p.bio||'WIRED member')+'</small></span></button><div class="people-actions"><button class="ghost" data-follow="'+escapeHTML(p.id)+'">'+(isFollowing?'Following':'＋ Follow')+'</button><button class="ghost" data-friend="'+escapeHTML(p.id)+'">'+(fr?.status==='accepted'?'Friends':fr?.status==='pending'?(fr.sender_id===state.user.id?'Requested':'Accept request'):'Add friend')+'</button></div></article>';};
 const list=(rows,empty,allowResponse=false)=>rows.length?rows.map(x=>'<div class="people-request"><span>'+escapeHTML(x.person?.username||'WIRED member')+'</span>'+(allowResponse&&x.status==='pending'?'<button class="ghost" data-accept="'+x.id+'">Accept</button><button class="ghost" data-decline="'+x.id+'">Decline</button>':'')+'</div>').join(''):'<div class="empty">'+empty+'</div>';
 const v=$('view');v.innerHTML='<div class="section-head"><h2>Global members</h2><p>Find and connect with WIRED members everywhere.</p></div><label class="field">Search profiles<input id="peopleSearch" type="search" value="'+escapeHTML(state.peopleQuery)+'" placeholder="Search usernames"></label><div class="people-grid">'+results.map(personCard).join('')+'</div><div class="section-head"><h2>Friend requests</h2></div><div class="card"><h3>Incoming</h3>'+list(state.incomingRequests,'No incoming requests.',true)+'<h3>Sent</h3>'+list(state.outgoingRequests,'No pending requests sent.')+'</div><div class="section-head"><h2>Your friends</h2></div><div class="card">'+(state.friends.length?state.friends.map(x=>'<div class="people-request"><span>'+escapeHTML(x.person?.username||'WIRED member')+'</span><button class="ghost" data-chat="'+escapeHTML(x.person?.username||'')+'">Message</button></div>').join(''):'<div class="empty">Your accepted friends will appear here.</div>')+'</div>';
 $('peopleSearch')?.addEventListener('input',e=>{state.peopleQuery=e.target.value;renderPeople();const el=$('peopleSearch');el?.focus();el?.setSelectionRange(state.peopleQuery.length,state.peopleQuery.length);});
 v.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>openMemberProfile(b.dataset.person)));
 v.querySelectorAll('[data-follow]').forEach(b=>b.addEventListener('click',()=>toggleFollow(b.dataset.follow)));
 v.querySelectorAll('[data-friend]').forEach(b=>b.addEventListener('click',()=>{const p=state.people.find(x=>x.id===b.dataset.friend);if(p)openMemberProfile(p.id).then(()=>handleProfileFriend(state.viewingProfile));}));
 v.querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click',()=>respondFriendRequest(b.dataset.accept,'accepted')));
 v.querySelectorAll('[data-decline]').forEach(b=>b.addEventListener('click',()=>respondFriendRequest(b.dataset.decline,'declined')));
 v.querySelectorAll('[data-chat]').forEach(b=>b.addEventListener('click',()=>startDMByUsername(b.dataset.chat)));
}
function checkProfileImage(file){
 if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type))throw new Error("Choose a JPG, PNG, WEBP, or GIF image.");
 if(file.size>10*1024*1024)throw new Error("Images must be under 10 MB each.");
}
async function uploadProfileImage(event,kind){
 const file=event.target.files?.[0];if(!file)return;
 try{checkProfileImage(file);const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"})[file.type];
 const path=state.user.id+"/"+kind+"-"+crypto.randomUUID()+"."+ext;
 const {error:upErr}=await sb.storage.from("profile-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});if(upErr)throw upErr;
 const url=sb.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
 const field=kind==="avatar"?"avatar_url":"cover_url";const {error}=await sb.from("profiles").update({[field]:url}).eq("id",state.user.id);if(error)throw error;
 state.profile={...(state.profile||{}),[field]:url};toast(kind==="avatar"?"Profile photo saved!":"Cover image saved!");render();
 }catch(err){toast(errorText(err));}finally{event.target.value="";}
}
async function uploadGalleryImages(event){
 const files=Array.from(event.target.files||[]);if(!files.length)return;
 try{if((state.profileImages||[]).length+files.length>30)throw new Error("Your gallery can contain up to 30 photos.");
 for(const file of files){checkProfileImage(file);const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"})[file.type];
 const path=state.user.id+"/gallery-"+crypto.randomUUID()+"."+ext;
 const {error:upErr}=await sb.storage.from("profile-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});if(upErr)throw upErr;
 const url=sb.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
 const {error}=await sb.from("profile_images").insert({user_id:state.user.id,image_url:url,storage_path:path});if(error)throw error;
 } await loadProfileGallery();toast("Photos added to your gallery!");render();
 }catch(err){toast(errorText(err));}finally{event.target.value="";}
}
async function deleteGalleryImage(id){
 const item=(state.profileImages||[]).find(x=>x.id===id);if(!item)return;if(!await wiredDialog("Remove this photo from your profile?"))return;
 try{const {error}=await sb.from("profile_images").delete().eq("id",id);if(error)throw error;
 const {error:storageError}=await sb.storage.from("profile-media").remove([item.storage_path]);if(storageError)console.warn(storageError);
 state.profileImages=state.profileImages.filter(x=>x.id!==id);toast("Photo removed.");render();}catch(err){toast(errorText(err));}
}
async function loadCommunities(){
  if(!state.user){state.communities=[];return;}
  const data=await api("/communities");state.communities=data.items||[];
}
let wiredStaffAccess=false;
async function refreshWiredStaffAccess(){
 wiredStaffAccess=false;
 if(state.user){const {data,error}=await sb.rpc("is_wired_staff");wiredStaffAccess=!error&&data===true;}
 document.querySelectorAll('.tab[data-page="bugs"],.tab[data-page="features"]').forEach(tab=>tab.hidden=!wiredStaffAccess);
 if(!wiredStaffAccess&&(state.page==="bugs"||state.page==="features"))state.page="home";
}
async function refreshUser(){
  const {data:{session}}=await sb.auth.getSession();
  state.user=session?.user||null;
  if(state.user){await loadGlobalStore().catch(e=>console.warn('Wallet refresh unavailable',e));await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});await loadProfileSocial().catch(e=>console.warn("Profile social data unavailable",e));await loadGlobalNotifications().catch(e=>console.warn("Notifications unavailable",e));subscribeGlobalNotifications();subscribeFriendGifts();subscribeRelationshipEnds();subscribeCommunityRelationshipEnds();await loadRelationshipData().catch(e=>console.warn("Relationship data unavailable",e));}
  else {if(wiredGiftChannel){sb.removeChannel(wiredGiftChannel);wiredGiftChannel=null;}document.getElementById('wiredFriendGiftPopup')?.remove();wiredGiftPopupActive=false;if(state.relationshipEndChannel){sb.removeChannel(state.relationshipEndChannel);state.relationshipEndChannel=null;}state.relationshipEndPopup=null;document.getElementById("relationshipEndOverlay")?.remove();state.profile=null;state.communities=[];}
  await refreshWiredStaffAccess();
  render();
}
function updateCommunityNavigation(){
 const inside=state.page==='community'&&!!state.activeCommunity;
 updateCommunitySidebar();
 const labels={home:inside?'Community Home':'Home',chats:inside?'Community Chats':'Chats',profile:inside?'Community Profile':'Me'};
 for(const [page,label] of Object.entries(labels)){
  const button=document.querySelector('.tab[data-page="'+page+'"]');if(!button)continue;
  const textNode=Array.from(button.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
  if(page==='profile'){const span=button.querySelector('.community-nav-label');if(span)span.textContent=label;else{button.innerHTML='<span class="me-tab-symbol" aria-hidden="true">✌︎</span><span class="community-nav-label">'+label+'</span>';}}
  else if(textNode)textNode.textContent=label;
  else button.textContent=label;
 }
}
function handleCommunityNavigation(page){
 if(state.page!=='community'||!state.activeCommunity||!['home','chats','profile'].includes(page))return false;
 if(page==='home'){openCommunitySection('latest');return true;}
 if(page==='profile'){
  if(!state.activeCommunityRole){toast('Join this community to create your community profile.');return true;}
  openCommunitySection('profile');
  return true;
 }
 if(page==='chats'){
  if(!state.activeCommunityRole){toast('Join this community to use Community Chats.');return true;}
  openCommunitySection('chats');
  return true;
 }
 return false;
}
function goGlobalHome(){if(state.page==='community'){state.page='home';try{sessionStorage.removeItem('wired:lastCommunityProfile');}catch{}}nav('home');window.scrollTo({top:0,behavior:'smooth'});}
document.querySelector('.brand')?.addEventListener('click',event=>{event.preventDefault();goGlobalHome();});
function nav(page){try{sessionStorage.removeItem("wired:openedMember");sessionStorage.removeItem("wired:sanctuaryView");}catch(e){}if(page==="discover")state.discoveryMode="";if(page==="chats"){state.globalChatSection="home";try{sessionStorage.setItem("wired:globalChatSection","home");}catch(e){}}if(page==="pets")state.yokaiSanctuaryView="home";if(page==="store"){wiredGiftTarget=null;wiredStoreSection="home";try{sessionStorage.setItem("wired:storeSection","home");}catch(e){}}if(handleCommunityNavigation(page))return;if((page==="bugs"||page==="features")&&!wiredStaffAccess)return;if(page==="notifications"){openNotifications();return;}state.page=page;state.activeCommunity=null;state.activeThread=null;updateCommunityNavigation();try{sessionStorage.setItem("wired:lastPage",page);sessionStorage.removeItem("wired:lastCommunity");sessionStorage.removeItem('wired:lastCommunityProfile');}catch(e){}document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));render();if(page==="discover"||page==="communities"||page==="all-communities")loadCommunities().then(render).catch(e=>toast(errorText(e)));if(page==="profile")loadProfileComments(state.user.id).then(comments=>{if(state.page==="profile"){state.profileComments=comments;render();}}).catch(e=>toast(errorText(e)));if(page==="chats")loadThreads();if(page==="pets")loadPetParadise().then(render).catch(e=>toast(errorText(e)));if(page==="store")Promise.all([loadProfile(),loadGlobalStore(),loadPetParadise()]).then(()=>{if(state.page==="store")render();}).catch(e=>toast(errorText(e)));if(page==="people"||page==="discover")loadPeople().then(()=>{if(state.page==="discover")renderDiscoverPeople();});if(page==="profile"&&state.user)Promise.all([loadProfile(),loadProfileSocial(),loadRelationshipData(),loadPetParadise()]).then(render).catch(e=>toast(errorText(e)));}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
$("notificationsBtn")?.addEventListener("click",openNotifications);
function communityCards(items){
  if(!items.length)return `<div class="empty">No communities to show yet. Create the first one!</div>`;
  return '<div class="amino-community-grid">'+items.map(c=>{
   const cover=c.cover_url||c.icon_url||'';
   const status=c.joined?(c.owner_id===state.user?.id?'Owner':'Joined'):c.join_request_status==='pending'?'Request pending':c.join_request_status==='declined'?'Request declined':'';
   return '<article class="amino-community-card" style="'+(cover?'--community-cover:url(&quot;'+escapeHTML(cover)+'&quot;)':'')+'"><div class="amino-card-shade"></div><div class="amino-community-icon">'+(cover?'<img src="'+escapeHTML(cover)+'" alt="">':'<span>W</span>')+'</div><span class="amino-category">'+escapeHTML(c.category||'Community')+'</span><div class="amino-card-content"><h3>'+escapeHTML(c.name)+'</h3><p>'+escapeHTML(c.description||'')+'</p><div class="amino-card-actions"><button class="amino-enter" data-open-community="'+escapeHTML(c.id)+'">Enter community</button>'+(status?'<span class="amino-status">'+escapeHTML(status)+'</span>':c.visibility==='private'?'<button class="amino-join" data-join-community="'+escapeHTML(c.id)+'">Request</button>':'<button class="amino-join" data-join-community="'+escapeHTML(c.id)+'">Join</button>')+'</div></div></article>';
  }).join('')+'</div>';
}
async function loadGlobalMemberDirectory(reset=false){
 if(!state.user)return;
 if(reset){state.globalMemberDirectory=[];state.globalMemberOffset=0;state.globalMemberHasMore=true;}
 if(state.globalMemberLoading||state.globalMemberHasMore===false)return;
 state.globalMemberLoading=true;
 if(state.page==="global-members")renderGlobalMemberDirectory();
 try{
  const offset=state.globalMemberOffset||0;
  const {data,error}=await sb.from("profiles").select("id,username,bio,avatar_url,id_verified").order("username",{ascending:true}).range(offset,offset+49);
  if(error)throw error;
  state.globalMemberDirectory=[...(state.globalMemberDirectory||[]),...(data||[])];
  state.globalMemberOffset=offset+(data||[]).length;
  state.globalMemberHasMore=(data||[]).length===50;
  await refreshGlobalMemberConnections();
 }catch(e){toast(errorText(e));}
 finally{state.globalMemberLoading=false;if(state.page==="global-members")renderGlobalMemberDirectory();}
}
async function refreshGlobalMemberConnections(){
 if(!state.user)return;
 const id=state.user.id;
 const [outgoing,incoming,accepted]=await Promise.all([
  sb.from("profile_follows").select("following_id").eq("follower_id",id),
  sb.from("profile_follows").select("follower_id").eq("following_id",id),
  sb.from("friend_requests").select("sender_id,recipient_id").eq("status","accepted").or("sender_id.eq."+id+",recipient_id.eq."+id)
 ]);
 if(outgoing.error)throw outgoing.error;
 if(incoming.error)throw incoming.error;
 // Friend-request records are optional; they must not corrupt follow status.
 state.globalMemberFollowing=new Set((outgoing.data||[]).map(x=>String(x.following_id)));
 state.globalMemberFollowers=new Set((incoming.data||[]).map(x=>String(x.follower_id)));
 state.globalMemberFriends=new Set((accepted.error?[]:accepted.data||[]).map(x=>String(x.sender_id===id?x.recipient_id:x.sender_id)));
}
const directoryFollowPending=new Set();
async function toggleDirectoryFollow(userId){
 if(!state.user||String(userId)===String(state.user.id))return;
 const target=String(userId),uid=state.user.id;
 if(directoryFollowPending.has(target))return;
 // The rendered button represents the user's requested action. Do not reinterpret
 // an Unfollow click as Follow based on a potentially stale follow query.
 const button=[...document.querySelectorAll("[data-directory-follow]")].find(x=>x.dataset.directoryFollow===target);
 const shouldUnfollow=button?.textContent?.trim()==="Unfollow";
 directoryFollowPending.add(target);
 if(button)button.disabled=true;
 try{
  if(shouldUnfollow){
   const {error}=await sb.from("profile_follows").delete().eq("follower_id",uid).eq("following_id",target);
   if(error)throw error;
  }else{
   // Concurrent clicks, other devices, and stale lists must never cause a
   // duplicate-primary-key error when following someone already followed.
   const {error}=await sb.from("profile_follows").upsert(
    {follower_id:uid,following_id:target},
    {onConflict:"follower_id,following_id",ignoreDuplicates:true}
   );
   if(error)throw error;
  }
  await refreshGlobalMemberConnections();
  if(state.page==="global-members")renderGlobalMemberDirectory();
  const isFollowing=state.globalMemberFollowing?.has(target);
  if(isFollowing===shouldUnfollow)toast("Follow status did not update. Please try again.");
 }catch(e){
  toast("Could not change follow status: "+errorText(e));
  try{await refreshGlobalMemberConnections();if(state.page==="global-members")renderGlobalMemberDirectory();}
  catch(refreshError){console.warn("Could not refresh follow status",refreshError);}
 }finally{
  directoryFollowPending.delete(target);
  const latest=[...document.querySelectorAll("[data-directory-follow]")].find(x=>x.dataset.directoryFollow===target);
  if(latest)latest.disabled=false;
 }
}
function renderGlobalMemberDirectory(){
 const v=$("view");if(!v)return;
 const members=state.globalMemberDirectory||[];
 v.innerHTML='<div class="section-head"><div><h2>All Global Members</h2><p>Explore WIRED-wide profiles.</p></div></div><button class="ghost" id="globalMembersBack">← Back to Discover</button><div class="people-grid">'+members.map(p=>{
 const self=p.id===state.user?.id;
 const following=state.globalMemberFollowing?.has(String(p.id));
 const followsMe=state.globalMemberFollowers?.has(String(p.id));
 const friend=state.globalMemberFriends?.has(String(p.id))||(following&&followsMe);
 const canChat=!self&&(followsMe||friend);
 return '<article class="card global-member-card"><button class="discover-person-result global-member-profile" type="button" data-global-member="'+escapeHTML(p.id)+'"><span class="profile-avatar">'+(p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="">':'W')+'</span><span><b>'+escapeHTML(p.username||"WIRED member")+'</b><small>'+escapeHTML(p.bio||"WIRED member")+'</small></span><span class="discover-person-open">View profile →</span></button><div class="global-member-actions">'+(self?'<span class="hint">Your profile</span>':'<button class="ghost" type="button" data-directory-follow="'+escapeHTML(p.id)+'">'+(following?'Unfollow':'Follow')+'</button><button class="ghost" type="button" data-directory-chat="'+escapeHTML(p.id)+'" '+(canChat?'':'disabled title="Only followers or friends can chat"')+'>Chat</button>')+'</div></article>';
 }).join("")+'</div>'+(state.globalMemberLoading?'<div class="empty">Loading members…</div>':state.globalMemberHasMore?'<button class="ghost" id="globalMembersMore">Load more members</button>':members.length?'':'<div class="empty">No global profiles found.</div>');
 $("globalMembersBack")?.addEventListener("click",()=>nav("discover"));
 $("globalMembersMore")?.addEventListener("click",()=>loadGlobalMemberDirectory());
 v.querySelectorAll("[data-global-member]").forEach(b=>b.addEventListener("click",()=>openMemberProfile(b.dataset.globalMember)));
 v.querySelectorAll("[data-directory-follow]").forEach(b=>b.addEventListener("click",()=>toggleDirectoryFollow(b.dataset.directoryFollow)));
 v.querySelectorAll("[data-directory-chat]").forEach(b=>b.addEventListener("click",()=>{
  const p=members.find(x=>x.id===b.dataset.directoryChat);
  if(p?.username)startDMByUsername(p.username);
 }));
}
function renderDiscoverPeople(){
 const host=$("discoverPeopleResults");if(!host)return;
 if(!state.user){host.innerHTML='<div class="empty">Log in to search WIRED profiles.</div>';return;}
 const q=state.discoverPeopleQuery.trim().toLowerCase();
 const matches=q?(state.discoverPeopleResults||[]).filter(p=>String(p.username||"").toLowerCase().includes(q)):[];
 host.innerHTML=q?(matches.slice(0,24).map(p=>'<button class="card discover-person-result" type="button" data-discover-person="'+escapeHTML(p.id)+'"><span class="profile-avatar">'+(p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="">':'W')+'</span><span><b>'+escapeHTML(p.username||"WIRED member")+'</b><small>'+escapeHTML(p.bio||"WIRED member")+'</small></span><span class="discover-person-open">View profile →</span></button>').join("")||'<div class="empty">No profiles found for that username.</div>'):'<div class="empty">Search for a username to find WIRED members.</div>';
 host.querySelectorAll("[data-discover-person]").forEach(b=>b.addEventListener("click",()=>openMemberProfile(b.dataset.discoverPerson)));
}
function renderDiscoveryResults(){
 const q=state.discoveryQuery.trim().toLowerCase();
 const matches=c=>(state.discoveryCategory==="all"||c.category===state.discoveryCategory)&&(!q||[c.name,c.description,c.category].some(v=>String(v||"").toLowerCase().includes(q)));
 const publicItems=state.communities.filter(c=>c.visibility!=="private"&&matches(c));
 const newest=[...publicItems].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const mine=state.communities.filter(c=>(c.joined||c.owner_id===state.user?.id||c.role)&&matches(c));
 const featured=[...publicItems].sort((a,b)=>Number(String(b.name||"").trim().toLowerCase()==="wired")-Number(String(a.name||"").trim().toLowerCase()==="wired")).filter(c=>String(c.name||"").trim().toLowerCase()==="wired"||!mine.some(m=>m.id===c.id)).slice(0,6);
 const fill=(id,items,empty)=>{const host=$(id);if(!host)return;host.innerHTML=items.length?communityCards(items):'<div class="empty">'+empty+'</div>';host.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));host.querySelectorAll("[data-join-community]").forEach(b=>b.addEventListener("click",()=>joinCommunity(b.dataset.joinCommunity)));};
 fill("featuredCommunities",featured,"No featured communities yet. Check back soon.");
 fill("newCommunities",newest.slice(0,8),"No new communities yet.");
 fill("myCommunities",mine,"You haven't joined any communities yet. Explore above and join one!");
 let items=[...state.communities].filter(matches);
 if(state.discoverySort==="name")items.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));else items.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const count=$("discoveryCount");if(count)count.textContent=`${items.length} ${items.length===1?"community":"communities"} found`;
 const host=$("discoveryResults");if(host){host.innerHTML=communityCards(items);host.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));host.querySelectorAll("[data-join-community]").forEach(b=>b.addEventListener("click",()=>joinCommunity(b.dataset.joinCommunity)));}
}
async function loadGlobalStore(){
 if(!state.user){state.globalStoreItems=[];state.globalStorePurchases=[];state.globalStoreBalance=0;return;}
 const [data,inventoryResult,backgroundCatalog]=await Promise.all([
  api('/store'),
  sb.rpc('my_store_inventory'),
  sb.from('global_store_items').select('id,sku,name,description,category,price_points,sort_order')
   .eq('category','Yokai Backgrounds').eq('active',true).order('sort_order')
 ]);
 if(inventoryResult.error)throw inventoryResult.error;
 const items=data.items||[];
 state.globalStoreItems=backgroundCatalog.error?items:[
  ...items.filter(item=>item.category!=='Yokai Backgrounds'),
  ...(backgroundCatalog.data||[])
 ];
 state.globalStorePurchases=inventoryResult.data||[];
 state.globalStoreEquipped=data.equipped||{};
 // The transaction ledger is authoritative; /store can return a stale zero balance.
 const {data:ledger,error:ledgerError}=await sb.from('global_wallet_transactions').select('amount').eq('user_id',state.user.id);
 state.globalStoreBalance=ledgerError?Number(data.balance||0):(ledger||[]).reduce((sum,row)=>sum+Number(row.amount||0),0);
 if(ledgerError)console.warn('Wallet ledger unavailable; using store balance',ledgerError);
 updateNotificationBell();
}
async function equipGlobalStoreItem(id){
 try{
  const {data:slot,error}=await sb.rpc('equip_my_profile_cosmetic',{p_item_id:id});
  if(error)throw error;
  await Promise.all([loadProfile(),loadGlobalStore()]);
  const field={frame:'equipped_frame_item_id',nameplate:'equipped_nameplate_item_id',theme:'equipped_theme_item_id'}[slot];
  if(!field||String(state.profile?.[field])!==String(id))throw new Error('Cosmetic selection could not be verified. Please reload.');
  toast('New '+slot+' equipped. Previous '+slot+' replaced.');
  render();
 }catch(e){toast(errorText(e));}
}
async function toggleGlobalStoreCosmetic(id,button){
 const wasUnequip=button?.textContent?.trim()==='Unequip';
 if(button){button.disabled=true;button.textContent='Updating…';}
 try{
  const {data,error}=await sb.rpc('set_my_profile_cosmetic',{p_item_id:id,p_equip:!wasUnequip});
  if(error)throw error;
  if(!data||!data.slot||!data.username)throw new Error('Cosmetic update returned no account state.');
  if(!state.profile)state.profile={};
  state.profile.equipped_frame_item_id=data.frame||null;
  state.profile.equipped_nameplate_item_id=data.nameplate||null;
  state.profile.equipped_theme_item_id=data.theme||null;
  // Never overwrite the transaction result with an older asynchronous profile read.
  render();
  toast('Profile '+data.slot+' '+data.action+'.');
  // Keep the result visible; the next navigation reloads the server state.
 }catch(e){toast(errorText(e));if(button){button.disabled=false;button.textContent=wasUnequip?'Unequip':'Equip';}}
}
async function unequipGlobalStoreItem(id){
 try{
  const item=(state.globalStoreItems||[]).find(x=>String(x.id)===String(id));
  if(!item)throw new Error('Cosmetic not found. Reload the store.');
  const key=String(item.sku||'')+' '+String(item.name||'');
  const slot=/frame/i.test(key)?'frame':/nameplate/i.test(key)?'nameplate':/theme/i.test(key)?'theme':null;
  if(!slot)throw new Error('This item has no profile cosmetic slot.');
  const {data,error}=await sb.rpc('unequip_my_profile_cosmetic_slot',{p_slot:slot});
  if(error)throw error;
  const field={frame:'equipped_frame_item_id',nameplate:'equipped_nameplate_item_id',theme:'equipped_theme_item_id'}[slot];
  // The authenticated RPC is the authoritative mutation. Keep the local profile
  // in sync immediately; a cached profile SELECT must not report false failure.
  if(state.profile)state.profile[field]=null;
  render();
  toast('Profile '+slot+' unequipped.');
  // Refresh inventory without overwriting the just-confirmed profile mutation.
  await Promise.all([loadGlobalStore(),loadProfile()]).catch(e=>console.warn('Cosmetic refresh failed',e));
  if(state.page==="store"||state.page==="profile")render();
 }catch(e){toast(errorText(e));}
}
async function purchaseGlobalStoreItem(id){
 try{
  const item=(state.globalStoreItems||[]).find(x=>String(x.id)===String(id));
  if(!item)throw new Error('Store item not found. Refresh the store and try again.');
  if(item.category==='Yokai Backgrounds'){
   const {error}=await sb.rpc('purchase_my_yokai_background',{p_item_id:id});
   if(error)throw error;
  }else{
   const itemKey=item.item_key||item.sku;
   if(!itemKey)throw new Error('This store item has no purchase key.');
   await api('/store/purchase','POST',{itemKey});
  }
  await loadGlobalStore();toast('Purchase complete. Your item is now in My purchases.');render();
 }catch(e){toast(errorText(e));}
}
function storeCosmeticType(item){
 const key=String([item?.sku,item?.name].filter(Boolean).join(' ')).toLowerCase();
 const families=[
 ['black-rose',/black[ -]?rose/],['orange',/orange[ -]?fruit/],
 ['frostbound',/frostbound/],['inferno',/inferno/],
 ['moonlit',/moonlit/],['shinobi',/shinobi|shadow[ -]?ninja/],
 ['kitsune',/kitsune/],['violet',/violet/],['cyberpunk',/cyberpunk/],['neon',/neon/]
 ];
 const family=(families.find(([,re])=>re.test(key))||[])[0]||'custom';
 const kind=/hoodie|apparel|outfit|clothing/.test(key)?'apparel':/frame/.test(key)?'frame':/nameplate/.test(key)?'nameplate':/theme/.test(key)?'theme':'generic';
 if(family==='orange')return kind==='frame'?'orange-frame':kind==='nameplate'?'orange-nameplate':'orange-fruit';
 if(family==='black-rose')return kind==='frame'?'black-rose-frame':kind==='nameplate'?'black-rose-nameplate':'black-rose-theme';
 if(family==='shinobi')return kind==='theme'?'shadow-ninja-theme':'shinobi-'+kind;
 if(family==='kitsune'&&kind==='apparel')return 'kitsune-hoodie';
 if(family==='custom')return kind;
 return family+'-'+kind;
}
function storeItemArt(item){
 const type=storeCosmeticType(item), kind=/frame$/.test(type)?'frame':/nameplate$/.test(type)?'nameplate':/theme$|orange-fruit$/.test(type)?'theme':/hoodie$|apparel$/.test(type)?'apparel':'generic';
 const known=['black-rose-frame','black-rose-nameplate','black-rose-theme','orange-frame','orange-nameplate','orange-fruit','frostbound-frame','frostbound-nameplate','frostbound-theme','inferno-frame','inferno-nameplate','inferno-theme','moonlit-frame','shinobi-frame','shinobi-nameplate','shadow-ninja-theme','kitsune-hoodie'].includes(type);
 if(known)return storeCosmeticArt(type);
 const title=escapeHTML(item?.name||'WIRED cosmetic');
 const symbol=kind==='frame'?'✦':kind==='nameplate'?'◆':kind==='theme'?'◈':'✧';
 if(kind==='frame')return '<div class="store-preview-avatar store-generated-art" aria-label="Empty decorative profile photo frame"></div>';
 if(kind==='nameplate')return '<div class="store-preview-nameplate store-generated-art">'+symbol+' '+title+'</div>';
 if(kind==='theme')return '<div class="store-preview-profile store-generated-art"><div class="store-preview-cover">'+symbol+'</div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">W</span><div><b>'+title+'</b><small>Global profile</small></div></div></div>';
 return '<div class="store-preview-generic-art">'+symbol+'<small>'+title+'</small></div>';
}
function equippedCosmeticClass(itemId,kind){
 if(!itemId)return '';
 const item=(state.globalStoreItems||[]).find(x=>String(x.id)===String(itemId));
 const type=item?storeCosmeticType(item):'';
 if(type==='moonlit-'+kind||type==='shinobi-'+kind||type==='shadow-ninja-'+kind||type==='frostbound-'+kind||type==='inferno-'+kind||type==='kitsune-'+kind)return 'equipped-'+type;
 if(type==='black-rose-'+kind)return 'black-rose-'+kind;
 if(type==='orange-'+kind)return 'orange-fruit-'+kind;
 return '';
}
function storeCosmeticArt(type){
 if(type==='frostbound-frame'||type==='inferno-frame')return '<div class="store-preview-avatar '+type+'"></div>';
 if(type==='frostbound-nameplate'||type==='inferno-nameplate')return '<div class="store-preview-nameplate '+type+'">'+(type==='frostbound-nameplate'?'❄ FROSTBOUND':'🔥 INFERNO')+' <small>WIRED</small></div>';
 if(type==='frostbound-theme'||type==='inferno-theme')return '<div class="store-preview-profile '+type+'"><div class="store-preview-cover"></div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">A</span><div><b>anthrax</b><small>'+ (type==='frostbound-theme'?'Frostbound':'Inferno')+' profile</small></div></div></div>';
 if(type==='moonlit-frame')return '<div class="store-preview-avatar moonlit-frame"></div>';
 if(type==='shinobi-frame')return '<div class="store-preview-avatar shinobi-frame"></div>';
 if(type==='shinobi-nameplate')return '<div class="store-preview-nameplate shinobi-nameplate">⛩ SHINOBI <small>WIRED</small></div>';
 if(type==='shadow-ninja-theme')return '<div class="store-preview-profile shadow-ninja-theme"><div class="store-preview-cover">☾</div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">忍</span><div><b>SHADOW NINJA</b><small>Global profile</small></div></div></div>';
 if(type==='kitsune-hoodie')return '<div class="store-preview-hoodie"><div class="hoodie-ears">▲　▲</div><div class="hoodie-body">🦊</div><small>KITSUNE</small></div>';
 if(type==='black-rose-frame')return '<div class="store-preview-avatar black-rose-frame"></div>';
 if(type==='black-rose-nameplate')return '<div class="store-preview-nameplate black-rose-nameplate">🥀 BLACK ROSE <small>WIRED</small></div>';
 if(type==='black-rose-theme')return '<div class="store-preview-profile black-rose-theme"><div class="store-preview-cover">🥀</div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">🥀</span><div><b>BLACK ROSE</b><small>Gothic profile</small></div></div></div>';
 if(type==='orange-frame')return '<div class="store-preview-avatar orange-fruit-frame"></div>';
 if(type==='frame')return '<div class="store-preview-avatar equipped-neon-frame"></div>';
 if(type==='orange-nameplate')return '<div class="store-preview-nameplate orange-fruit-nameplate"><span>🍃</span> WIRED <small>@anthrax</small><span>🍊</span></div>';
 if(type==='nameplate')return '<div class="store-preview-nameplate equipped-nameplate">WIRED <small>@anthrax</small></div>';
 if(type==='orange-fruit')return '<div class="store-preview-profile equipped-profile-theme orange-fruit-preview"><div class="store-preview-cover"><span>🍊</span><span>🍃</span><span>🍊</span></div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">🍊</span><div><b>WIRED MEMBER</b><small>Global profile · Citrus edition</small></div></div><div class="store-preview-bio"><i></i><i></i></div><div class="orange-fruit-preview-stamp">FRESH • BRIGHT • BOLD</div></div>';
  if(type==='theme')return '<div class="store-preview-profile equipped-profile-theme"><div class="store-preview-cover"></div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">A</span><div><b class="equipped-violet-theme">anthrax</b><small>Global profile</small></div></div><div class="store-preview-bio"><i></i><i></i></div></div>';
 return '<span class="cosmetic-preview-generic">✦</span>';
}
function yokaiAccessoryOverlay(items,pet){
 const skus=new Set((items||[]).map(x=>String(x.global_store_items?.sku||x.sku||'')));
 const piece=(sku,art,style)=>skus.has(sku)?'<span title="'+escapeHTML(sku.replace(/pet-/g,'').replace(/-/g,' '))+'" style="position:absolute;'+style+';font-size:clamp(20px,5vw,34px);line-height:1;filter:drop-shadow(0 2px 6px #000);pointer-events:none">'+art+'</span>':'';
 const species=String(pet?.pet_species?.slug||pet?.pet_key||pet?.species?.slug||'').toLowerCase();
 const eclipse=''; // Eclipse Halo visual effect disabled at user's request.
 return '<span class="yokai-accessory-layer" style="position:absolute;inset:0;pointer-events:none;z-index:3">'+
 eclipse+
 piece('pet-ear-crown','🔔','top:3%;left:50%;transform:translateX(-50%)')+
 piece('pet-bunny-ears','🦊','top:0;right:17%')+
 piece('pet-bow-collar','⛓️','bottom:28%;left:50%;transform:translateX(-50%)')+
 piece('pet-star-collar','🧿','bottom:26%;left:52%')+
 piece('pet-rubber-duck','🪆','bottom:5%;right:10%')+
 piece('pet-crystal-ball','🔮','bottom:5%;left:8%')+
 piece('pet-cloud-bed','⚰️','bottom:0;left:35%')+
 piece('pet-mushroom-house','⛩️','bottom:2%;right:2%')+'</span>';
}
function yokaiBackgroundUrl(sku){
 const match=/^yokai-bg-([a-z0-9-]+)$/.exec(sku||'');
 return match?'assets/yokai-backgrounds/'+match[1]+'.webp':'';
}
function yokaiBackgroundClass(sku){
 return yokaiBackgroundUrl(sku)?' yokai-background-equipped':'';
}
function yokaiBackgroundStyle(sku){
 const url=yokaiBackgroundUrl(sku);
 return url?' style="--yokai-background:url('+url+')"':'';
}
function yokaiBackgroundCard(item,owned){
 const art=yokaiBackgroundUrl(item.sku);
 const image='<img src="'+art+'" alt="'+escapeHTML(item.name)+'" loading="lazy">';
 return '<article class="card store-item"><a class="yokai-background-preview" href="'+art+'" target="_blank" rel="noopener" aria-label="Preview '+escapeHTML(item.name)+'">'+image+'</a><h3>'+escapeHTML(item.name)+'</h3><p>'+escapeHTML(item.description||'')+'</p><div class="store-item-buy"><b>◉ '+Number(item.price_points).toLocaleString()+' points</b><button class="primary" data-store-buy="'+escapeHTML(item.id)+'" '+(owned||Number(state.globalStoreBalance)<Number(item.price_points)?'disabled':'')+'>'+(owned?'Owned':'Purchase')+'</button></div></article>';
}
let yokaiBackgroundTarget='';
async function setYokaiBackground(petId,itemId,expectedItemId=null){
 try{
  const {error}=await sb.rpc('set_my_yokai_background',{p_pet_id:petId,p_item_id:itemId,p_expected_item_id:expectedItemId});
  if(error)throw error;
  await loadYokaiBackgrounds();
  if(state.page==='store'&&wiredStoreSection==='yokai')renderGlobalStore();
  toast(itemId?'Background equipped.':'Background removed.');
 }catch(e){toast(errorText(e));}
}
async function loadYokaiBackgrounds(){
 const owner=state.user?.id;
 if(!owner){state.yokaiBackgrounds={};return;}
 const {data,error}=await sb.rpc('my_yokai_backgrounds');
 if(error)throw error;
 if(state.user?.id===owner)state.yokaiBackgrounds=Object.fromEntries((data||[]).map(row=>[row.pet_id,row]));
}
function yokaiBackgroundInventory(purchases){
 const pets=state.userPets||[];
 if(!pets.some(pet=>String(pet.id)===yokaiBackgroundTarget))yokaiBackgroundTarget=String(pets[0]?.id||'');
 const equipped=state.yokaiBackgrounds?.[yokaiBackgroundTarget];
 const picker=pets.length?'<label class="field">Companion<select data-yokai-background-target>'+pets.map(pet=>'<option value="'+escapeHTML(pet.id)+'" '+(String(pet.id)===yokaiBackgroundTarget?'selected':'')+'>'+escapeHTML(pet.nickname)+'</option>').join('')+'</select></label><button type="button" class="ghost" data-yokai-background-clear '+(equipped?'':'disabled')+'>No background</button>':'<p class="hint">Summon a yokai to equip a background.</p>';
 const rows=purchases.map(purchase=>{
  const item=purchase.global_store_items;
  const itemId=escapeHTML(purchase.item_id);
  const isEquipped=equipped?.item_id===purchase.item_id;
  const refund=Math.floor(Math.max(0,Number(purchase.price_points)||0)*.25);
  return '<article class="store-purchase-row pet-merch-inventory"><img class="yokai-background-thumb" src="'+yokaiBackgroundUrl(item.sku)+'" alt="" loading="lazy"><div><b>'+escapeHTML(item.name)+'</b><small>'+(isEquipped?'Equipped':'Owned')+'</small></div><div class="yokai-wardrobe-actions"><button type="button" class="ghost" data-yokai-background-item="'+itemId+'" '+(isEquipped?'data-unequip ':(!yokaiBackgroundTarget?'disabled':''))+'>'+(isEquipped?'Unequip':'Equip to yokai')+'</button><button type="button" class="ghost" data-store-recycle="'+escapeHTML(purchase.id)+'">Recycle · +'+refund.toLocaleString()+' points</button></div></article>';
 }).join('');
 return '<section class="store-purchases" id="myYokaiBackgrounds" tabindex="-1"><div class="section-head"><h2>My backgrounds</h2></div>'+picker+(rows||'<p class="empty">You haven’t purchased a background yet.</p>')+'</section>';
}
function petStoreEmoji(item){
 const sku=String(item?.sku||"");
 return ({'pet-ear-crown':'🔔','pet-bunny-ears':'🦊','pet-rainbow-halo':'🌑','pet-bow-collar':'⛓️','pet-star-collar':'🧿','pet-rubber-duck':'🪆','pet-crystal-ball':'🔮','pet-cloud-bed':'⚰️','pet-mushroom-house':'⛩️' ,'sanctuary-bundle':'🪦','yokai-plushie':'👻'})[sku]||'🕯️';
}
async function recycleStorePurchase(purchaseId){
 const purchase=(state.globalStorePurchases||[]).find(p=>String(p.id)===String(purchaseId));
 if(!purchase)return toast('Purchase not found. Reload the store.');
 const refund=Math.floor(Math.max(0,Number(purchase.price_points)||0)*0.25);
 const name=purchase.global_store_items?.name||'this item';
 if(!await wiredDialog('Recycle '+name+' for '+refund.toLocaleString()+' points (25% of its original purchase price)? This permanently removes the item.'))return;
 try{
  const {data,error}=await sb.rpc('recycle_my_store_item',{p_purchase_id:purchaseId});
  if(error)throw error;
  await Promise.all([loadGlobalStore(),loadProfile(),loadPetParadise()]);
  render();
  toast('Recycled '+name+'. +'+Number(data?.refund||0).toLocaleString()+' points.');
 }catch(e){toast(errorText(e));}
}
async function equipPetStoreItem(itemId,petId,button){
 if(!itemId||!petId){toast("Choose one of your yokai first.");return;}
 if(button){button.disabled=true;button.textContent="Equipping…";}
 try{const {error}=await sb.rpc("equip_pet_store_item",{p_pet_id:petId,p_item_id:itemId});if(error)throw error;await loadPetParadise();toast("Yokai merchandise equipped! ✨");render();}
 catch(e){toast(errorText(e));if(button){button.disabled=false;button.textContent="Equip to yokai";}}
}
let wiredStoreSection='home';
try{const savedStoreSection=sessionStorage.getItem('wired:storeSection');if(['home','profile','yokai','gifts'].includes(savedStoreSection))wiredStoreSection=savedStoreSection;}catch(e){}
const WIRED_FRIEND_GIFTS=[
 ['coffee','☕','Coffee',15],['cookie','🍪','Cookie',15],['cake','🍰','Cake',20],
 ['pizza','🍕','Pizza',20],['burger','🍔','Burger',25],['sushi','🍣','Sushi',25],
 ['cocktail','🍹','Cocktail',25],['mocktail','🍸','Mocktail',25],['dinner','🍽️','Dinner',30],
 ['flowers','💐','Flower Bouquet',90],['roses','🌹','Roses',90],['chocolates','🍫','Chocolate Box',90],
 ['teddy','🧸','Teddy Bear',90],['heart','💝','Heart Gift',90],['champagne','🍾','Champagne',150]
];
let wiredGiftFriends=[],wiredGiftInventory=[],wiredGiftChannel=null,wiredGiftPopupActive=false,wiredGiftTarget=null;
async function wiredBlockState(userId){
 if(!state.user||!userId||userId===state.user.id)return {blocked:false,blockedBy:false};
 const {data:mine,error}=await sb.from('wired_user_blocks').select('blocked_id').eq('blocker_id',state.user.id).eq('blocked_id',userId).maybeSingle();
 if(error)throw error;
 const {data:allowed,error:accessError}=await sb.rpc('wired_can_interact_with',{p_other:userId});
 if(accessError)throw accessError;
 return {blocked:!!mine,blockedBy:allowed===false&&!mine};
}
async function toggleWiredBlock(userId){
 if(!state.user||userId===state.user.id)return;
 const {data:existing,error:readError}=await sb.from('wired_user_blocks').select('blocked_id').eq('blocker_id',state.user.id).eq('blocked_id',userId).maybeSingle();
 if(readError)return toast(errorText(readError));
 const blocking=!existing;
 if(!await wiredDialog(blocking?'Block this member across WIRED, including all communities and gifts?':'Unblock this member across WIRED?',{danger:blocking}))return;
 const result=blocking?await sb.from('wired_user_blocks').insert({blocker_id:state.user.id,blocked_id:userId}):await sb.from('wired_user_blocks').delete().eq('blocker_id',state.user.id).eq('blocked_id',userId);
 if(result.error)return toast(errorText(result.error));
 toast(blocking?'Member blocked across WIRED.':'Member unblocked.');
 if(state.page==='member-profile')await openMemberProfile(userId);
 else if(state.activeCommunity?.id)await openCommunityMemberProfile(userId);
}
async function openGiftShopForProfile(userId,name,communityId=null){
 if(!state.user||userId===state.user.id)return;
 wiredGiftTarget={id:userId,username:name||'WIRED member',communityId};
 wiredStoreSection='gifts';state.page='store';state.activeCommunity=null;
 try{sessionStorage.setItem('wired:lastPage','store');sessionStorage.setItem('wired:storeSection','gifts');}catch(e){}
 document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.page==='store'));
 await Promise.all([loadGlobalStore(),loadGiftFriends(),loadReturnedGiftInventory()]).catch(e=>toast(errorText(e)));
 renderGlobalStore();saveWiredRoute();window.scrollTo({top:0,behavior:'smooth'});
}

async function loadGiftFriends(){
 if(!state.user)return;
 const [{data,error},{data:blocks,error:blockError}]=await Promise.all([sb.from('profiles').select('id,username,avatar_url').neq('id',state.user.id).order('username'),sb.from('wired_user_blocks').select('blocked_id').eq('blocker_id',state.user.id)]);
 if(error||blockError)throw error||blockError;const excluded=new Set((blocks||[]).map(b=>b.blocked_id));wiredGiftFriends=(data||[]).filter(p=>!excluded.has(p.id));
}
async function loadReturnedGiftInventory(){
 if(!state.user)return;
 const {data,error}=await sb.from('global_friend_gifts').select('id,gift_name,gift_emoji,base_points').eq('sender_id',state.user.id) .in('status',['rejected','inventory']).order('created_at',{ascending:false});
 if(error)throw error;wiredGiftInventory=data||[];
}
async function resendReturnedGift(giftId){
 const recipient=document.getElementById('giftFriendRecipient')?.value;
 if(!recipient)return toast('Choose a WIRED member to receive this gift.');
 const friend=wiredGiftFriends.find(x=>x.id===recipient)||(wiredGiftTarget?.id===recipient?wiredGiftTarget:null);
 if(!friend)return toast('Choose a recipient.');
 const {data:allowed,error:allowedError}=await sb.rpc('wired_gift_sender_allowed',{p_sender:recipient});
 if(allowedError||!allowed)return toast('Gifts are unavailable between blocked accounts.');
 const confirmed=await wiredDialog('Send this gift to '+friend.username+'? No additional points will be charged.',{danger:false});
 if(!confirmed)return;
 const {error}=await sb.rpc('resend_global_friend_gift',{p_gift_id:giftId,p_recipient_id:recipient,p_sender_community_id:(wiredGiftTarget?.id===recipient?wiredGiftTarget.communityId:null)});
 if(error)return toast(errorText(error));
 await loadReturnedGiftInventory();renderGlobalStore();toast('Gift sent to '+friend.username+'.');
}
async function purchaseFriendGift(event){
 event.preventDefault();
 const giftKey=document.getElementById('giftTypeSelect')?.value;
 const gift=WIRED_FRIEND_GIFTS.find(x=>x[0]===giftKey);
 if(!gift)return toast('Choose a gift.');
 if(gift[3]>state.globalStoreBalance)return toast('Not enough points.');
 const confirmed=await wiredDialog('Purchase '+gift[1]+' '+gift[2]+' for '+gift[3]+' points? It will be added to your gift inventory, ready to send later.',{danger:false});
 if(!confirmed)return;
 const button=document.querySelector('#purchaseFriendGiftForm button[type="submit"]');if(button)button.disabled=true;
 try{
  const {data,error}=await sb.rpc('purchase_global_friend_gift',{p_gift_key:giftKey});
  if(error)throw error;
  if(!data?.gift_id)throw new Error('Purchase could not be confirmed. Please check your points history.');
  await Promise.all([loadGlobalStore(),loadReturnedGiftInventory()]);
  if(!wiredGiftInventory.some(item=>item.id===data.gift_id)){
   const {data:verified,error:verifyError}=await sb.from('global_friend_gifts').select('id,gift_name,gift_emoji,base_points').eq('id',data.gift_id).eq('sender_id',state.user.id).eq('status','inventory').maybeSingle();
   if(verifyError||!verified)throw new Error('Gift purchased, but inventory has not refreshed. Reload this page before purchasing again.');
   wiredGiftInventory.unshift(verified);
  }
  renderGlobalStore();toast(gift[2]+' saved to My Gift Inventory.');
 }catch(error){toast(errorText(error));if(button)button.disabled=false;}
}
function updateGiftPrice(){
 const gift=WIRED_FRIEND_GIFTS.find(x=>x[0]===document.getElementById('giftTypeSelect')?.value);
 const target=document.getElementById('friendGiftPrice');if(!target||!gift)return;
 target.textContent='Purchase for '+gift[3]+' points. Send later from your inventory. Your friend receives '+(gift[3]+Math.ceil(gift[3]*.1))+' points when accepted, including the 10% gift bonus.';
}
function showFriendGiftPopup(gift,sender){
 if(wiredGiftPopupActive||wiredHandledGiftIds.has(gift.id))return;
 wiredGiftPopupActive=true;
 document.getElementById('wiredFriendGiftPopup')?.remove();
 const overlay=document.createElement('div');overlay.id='wiredFriendGiftPopup';overlay.className='wired-dialog-overlay';
 overlay.innerHTML='<section class="wired-dialog wired-gift-dialog" role="dialog" aria-modal="true" aria-labelledby="wiredGiftTitle"><div class="wired-gift-big-emoji">'+escapeHTML(gift.gift_emoji)+'</div><h2 id="wiredGiftTitle">You received a gift!</h2><p><strong>'+escapeHTML(sender||'A WIRED friend')+'</strong> sent you '+escapeHTML(gift.gift_name)+' '+escapeHTML(gift.gift_emoji)+'</p><p class="wired-gift-points">+'+Number(gift.total_points)+' points will be added to your account if accepted, including the 10% gift bonus.</p><div class="wired-gift-response-actions"><button type="button" class="primary" id="acceptWiredGift">Accept gift</button><button type="button" class="ghost" id="rejectWiredGift">Reject gift</button></div></section>';
 document.body.appendChild(overlay);
 const closeGiftPopup=()=>{wiredHandledGiftIds.add(gift.id);overlay.remove();if(!document.getElementById('wiredFriendGiftPopup'))wiredGiftPopupActive=false;};
 const respond=async accept=>{
  const acceptButton=overlay.querySelector('#acceptWiredGift'),rejectButton=overlay.querySelector('#rejectWiredGift');
  acceptButton.disabled=true;rejectButton.disabled=true;
  try{
   const {error}=await sb.rpc('respond_global_friend_gift',{p_gift_id:gift.id,p_accept:accept});
   if(error){
    // An earlier request may have succeeded even when its response was lost.
    const {data:current, error:statusError}=await sb.from('global_friend_gifts').select('status').eq('id',gift.id).maybeSingle();
    if(!statusError&&current&&current.status!=='pending'){
     closeGiftPopup();toast(current.status==='accepted'?'Gift already accepted!':'Gift already handled.');
     await loadGlobalStore().catch(()=>{});checkIncomingFriendGifts();return;
    }
    throw error;
   }
   closeGiftPopup();
   toast(accept?'Gift accepted! Points added to your account.':'Gift rejected. Returned to sender’s gift inventory.');
   await loadGlobalStore().catch(()=>{});
   if(state.page==='store')renderGlobalStore();
   checkIncomingFriendGifts();
  }catch(error){toast(errorText(error));acceptButton.disabled=false;rejectButton.disabled=false;}
 };
 // Verify status before presenting actions: stale tabs must not trap members in an old popup.
 sb.from('global_friend_gifts').select('status').eq('id',gift.id).maybeSingle().then(({data})=>{
  if(data&&data.status!=='pending'&&overlay.isConnected){closeGiftPopup();checkIncomingFriendGifts();}
 }).catch(()=>{});
 overlay.querySelector('#acceptWiredGift').addEventListener('click',()=>respond(true));
 overlay.querySelector('#rejectWiredGift').addEventListener('click',()=>respond(false));
}
let wiredGiftCheckRunning=false;
const wiredHandledGiftIds=new Set();
async function checkIncomingFriendGifts(){
 if(!state.user||wiredGiftPopupActive||wiredGiftCheckRunning)return;
 wiredGiftCheckRunning=true;
 const recipient=state.user.id;
 try{
 const {data,error}=await sb.from('global_friend_gifts').select('id,sender_id,gift_name,gift_emoji,total_points,sender_profile_scope,sender_community_id').eq('recipient_id',state.user.id) .eq('status','pending').order('created_at',{ascending:true}).limit(1);
 if(error||!data?.length){if(error)console.warn('Gift inbox unavailable',error);return;}
 const gift=data[0];
 if(wiredHandledGiftIds.has(gift.id))return;
 const {data:allowed,error:allowedError}=await sb.rpc('wired_gift_sender_allowed',{p_sender:gift.sender_id});
 if(allowedError||!allowed){if(allowedError)console.warn('Gift block check failed',allowedError);return;}
 let senderName=null;
 if(gift.sender_profile_scope==='community'&&gift.sender_community_id){
  const {data:communitySender}=await sb.from('community_profiles').select('nickname').eq('community_id',gift.sender_community_id).eq('user_id',gift.sender_id).maybeSingle();
  senderName=communitySender?.nickname||null;
 }
 if(!senderName){const {data:sender}=await sb.from('profiles').select('username').eq('id',gift.sender_id).maybeSingle();senderName=sender?.username;}
 const {data:current,error:verifyError}=await sb.from('global_friend_gifts').select('status').eq('id',gift.id).eq('recipient_id',recipient).maybeSingle();
 if(verifyError||current?.status!=='pending'||state.user?.id!==recipient||wiredGiftPopupActive||wiredHandledGiftIds.has(gift.id))return;
 showFriendGiftPopup(gift,senderName);
 }finally{wiredGiftCheckRunning=false;}
}
function subscribeFriendGifts(){
 if(wiredGiftChannel){sb.removeChannel(wiredGiftChannel);wiredGiftChannel=null;}
 if(!state.user)return;
 wiredGiftChannel=sb.channel('wired-gifts-'+state.user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'global_friend_gifts',filter:'recipient_id=eq.'+state.user.id},()=>checkIncomingFriendGifts()).subscribe();
 checkIncomingFriendGifts();
}
function renderGlobalStore(){
 const v=$('view');
 if(!state.user){v.innerHTML='<div class="section-head"><h2>Global Store</h2></div><div class="card"><p>Log in to browse the WIRED-wide store and use your points.</p><button class="primary" id="storeLoginBtn">Log in</button></div>';v.querySelector('#storeLoginBtn')?.addEventListener('click',openAuth);return;}
 const petItems=state.globalStoreItems.filter(x=>x.category==="Yokai Backgrounds")
  .sort((a,b)=>Number(a.price_points)-Number(b.price_points)||Number(a.sort_order||0)-Number(b.sort_order||0));
 const profileItems=state.globalStoreItems.filter(x=>!String(x.category||"").startsWith("Yokai "));
 const purchases=state.globalStorePurchases||[];
 const ownedItemIds=new Set(purchases.map(p=>String(p.item_id)));
 const petPurchases=purchases.filter(p=>String(p.global_store_items?.category||"").startsWith("Yokai ")&&p.global_store_items.category!=="Yokai Backgrounds");
 const backgroundPurchases=purchases.filter(p=>p.global_store_items?.category==="Yokai Backgrounds");
 const profilePurchases=purchases.filter(p=>!String(p.global_store_items?.category||"").startsWith("Yokai "));
 const petShop=petItems.length?'<section class="store-category-section"><div class="section-head"><h2>Yokai Backgrounds</h2><button type="button" class="ghost" data-open-yokai-backgrounds>My backgrounds ↓</button></div><div class="store-grid">'+petItems.map(item=>yokaiBackgroundCard(item,ownedItemIds.has(String(item.id)))).join('')+'</div></section>':'';
 const profileShop=profileItems.length?'<section class="store-category-section"><div class="section-head"><div><h2>✨ Profile cosmetics</h2><p class="hint">Customize your global profile.</p></div></div><div class="store-grid">'+profileItems.map(item=>'<article class="card store-item"><div class="store-item-art store-art-'+storeCosmeticType(item)+'">'+storeItemArt(item)+'<span class="store-preview-caption">PROFILE PREVIEW</span></div><span class="pill">'+escapeHTML(item.category||'Digital item')+'</span><h3>'+escapeHTML(item.name)+'</h3><p>'+escapeHTML(item.description||'')+'</p><div class="store-item-buy"><b>◉ '+Number(item.price_points)+' points</b><button class="primary" data-store-buy="'+escapeHTML(item.id)+'" '+(ownedItemIds.has(String(item.id))||Number(state.globalStoreBalance)<Number(item.price_points)?'disabled':'')+'>'+(ownedItemIds.has(String(item.id))?'Owned':'Purchase')+'</button></div></article>').join('')+'</div></section>':'';
 const isYokaiItemEquipped=(itemId,petId)=>{const sku=(state.globalStoreItems||[]).find(i=>String(i.id)===String(itemId))?.sku;return (state.petEquipment||[]).some(e=>String(e.pet_id)===String(petId)&&(String(e.item_id||'')===String(itemId)||!!sku&&String(e.global_store_items?.sku||e.sku||'')===String(sku)));};
 const petInventory=petPurchases.length?petPurchases.map(p=>'<article class="store-purchase-row pet-merch-inventory"><span class="store-purchase-icon pet-inventory-emoji">'+petStoreEmoji({sku:p.global_store_items?.sku})+'</span><div><b>'+escapeHTML(p.global_store_items?.name||'Yokai merchandise')+'</b><small>'+escapeHTML(p.global_store_items?.description||'')+'</small><label class="pet-equip-picker">Equip to <select data-yokai-target="'+escapeHTML(p.item_id)+'">'+(state.userPets||[]).map(pet=>'<option value="'+escapeHTML(pet.id)+'">'+escapeHTML(pet.nickname)+'</option>').join('')+'</select></label></div><div class="yokai-wardrobe-actions"><button class="ghost" data-pet-equip-item="'+escapeHTML(p.item_id)+'" '+(!(state.userPets||[]).length||isYokaiItemEquipped(p.item_id,state.userPets[0]?.id)?'disabled':'')+'>'+(isYokaiItemEquipped(p.item_id,state.userPets[0]?.id)?'Equipped':'Equip to yokai')+'</button>'+('<button class="ghost" data-store-recycle="'+escapeHTML(p.id)+'">Recycle · +'+Math.floor(Math.max(0,Number(p.price_points)||0)*.25)+' points</button>')+'</div></article>').join(''):'<div class="empty">Your yokai wardrobe is empty. Choose a charm or relic above!</div>';
 const equippedProfileIds=new Set([state.profile?.equipped_frame_item_id,state.profile?.equipped_nameplate_item_id,state.profile?.equipped_theme_item_id].filter(Boolean).map(String));
 const profileInventory=profilePurchases.length?profilePurchases.map(p=>'<article class="store-purchase-row purchase-'+storeCosmeticType(p.global_store_items||p)+'"><span class="store-purchase-icon">'+storeItemArt(p.global_store_items||p)+'</span><div><b>'+escapeHTML(p.global_store_items?.name||'WIRED store item')+'</b><small>'+escapeHTML(p.global_store_items?.description||'')+'</small></div><button class="ghost" data-store-equip="'+escapeHTML(p.item_id)+'" '+(equippedProfileIds.has(String(p.item_id))?'aria-label="Unequip item"':'')+'>'+(equippedProfileIds.has(String(p.item_id))?'Unequip':'Equip')+'</button>'+('<button class="ghost" data-store-recycle="'+escapeHTML(p.id)+'">Recycle · +'+Math.floor(Math.max(0,Number(p.price_points)||0)*.25)+' points</button>')+'</article>').join(''):'<div class="empty">No profile cosmetics purchased yet.</div>';
 const storeHome='<div class="wired-store-choices"><button type="button" class="wired-store-choice" data-store-section="profile"><span class="wired-store-choice-icon">✦</span><strong>Profile Cosmetics</strong><small>Themes, frames &amp; nameplates</small><span>Browse →</span></button><button type="button" class="wired-store-choice" data-store-section="yokai"><span class="wired-store-choice-icon">☯</span><strong>Yokai Backgrounds</strong><small>Spooky scenes for your companions</small><span>Browse →</span></button><button type="button" class="wired-store-choice" data-store-section="gifts"><span class="wired-store-choice-icon">🎁</span><strong>Gifts</strong><small>Send gifts to any WIRED member</small><span>Browse →</span></button></div>';
 const back='<button type="button" class="ghost wired-store-back" data-store-section="home">← All shop categories</button>';
 const inventoryProfile='<section class="store-purchases"><div class="section-head"><h2>✨ My profile purchases</h2><span>Your account inventory</span></div>'+profileInventory+'</section>';
 const inventoryYokai='<section class="store-purchases"><div class="section-head"><div><h2>🐾 Yokai wardrobe</h2><span>Choose a companion to equip each item to.</span></div></div>'+petInventory+'</section>';
 const giftShop='<section class="card wired-gift-shop"><div class="section-head"><h2>🎁 Gifts</h2></div><p>Purchase gifts first and save them in your gift inventory. Send gifts to any WIRED member, without following or friendship requirements. Recipients receive the gift value plus a 10% bonus when accepted.</p><form id="purchaseFriendGiftForm"><label class="field">Choose a gift<select id="giftTypeSelect" required>'+WIRED_FRIEND_GIFTS.map(g=>'<option value="'+g[0]+'">'+g[1]+' '+g[2]+' · '+g[3]+' points</option>').join('')+'</select></label><div class="wired-gift-grid">'+WIRED_FRIEND_GIFTS.map(g=>'<button type="button" class="wired-gift-tile" data-select-gift="'+g[0]+'"><span>'+g[1]+'</span><strong>'+g[2]+'</strong><small>'+g[3]+' points</small></button>').join('')+'</div><p class="hint" id="friendGiftPrice"></p><button type="submit" class="primary">Purchase gift</button></form><section class="wired-returned-gifts"><h3>🎁 My Gift Inventory</h3><p class="hint">Purchased and rejected gifts are stored here. Sending a gift costs no additional points.</p><label class="field">Send inventory gift to member<select id="giftFriendRecipient"><option value="">Choose a recipient</option>'+(wiredGiftTarget&&!wiredGiftFriends.some(f=>f.id===wiredGiftTarget.id)?'<option value="'+escapeHTML(wiredGiftTarget.id)+'">'+escapeHTML(wiredGiftTarget.username)+' (selected profile)</option>':'')+wiredGiftFriends.map(f=>'<option value="'+escapeHTML(f.id)+'">'+escapeHTML(f.username)+'</option>').join('')+'</select></label><div class="wired-gift-grid">'+(wiredGiftInventory.map(g=>'<article class="wired-gift-tile"><span>'+escapeHTML(g.gift_emoji)+'</span><strong>'+escapeHTML(g.gift_name)+'</strong><small>Purchased for '+Number(g.base_points)+' points</small><button type="button" class="ghost" data-resend-gift="'+escapeHTML(g.id)+'">Send gift</button></article>').join('')||'<p class="hint">Your gift inventory is empty.</p>')+'</div></section></section>';
 const contents=wiredStoreSection==='profile'?back+(profileShop||'<div class="empty">No profile cosmetics available yet.</div>')+inventoryProfile:wiredStoreSection==='yokai'?back+(petShop||'<div class="empty">No yokai backgrounds available yet.</div>')+yokaiBackgroundInventory(backgroundPurchases)+(petPurchases.length?inventoryYokai:''):wiredStoreSection==='gifts'?back+giftShop:storeHome;
 v.innerHTML='<div class="store-heading"><div class="section-head"><div><span class="pill">APP-WIDE STORE</span><h2>WIRED Global Store</h2><p>Choose a shop category to browse its products.</p></div><button type="button" class="store-wallet store-wallet-history" aria-label="View points transaction history" title="View points earned and spent"><span>Your points</span><b>◉ '+Number(state.globalStoreBalance||0)+'</b></button></div></div>'+contents;
 v.querySelector('#purchaseFriendGiftForm')?.addEventListener('submit',purchaseFriendGift);
 if(wiredGiftTarget){const recipient=v.querySelector('#giftFriendRecipient');if(recipient)recipient.value=wiredGiftTarget.id;}
 v.querySelectorAll('[data-resend-gift]').forEach(button=>button.addEventListener('click',()=>resendReturnedGift(button.dataset.resendGift)));
 v.querySelector('#giftTypeSelect')?.addEventListener('change',updateGiftPrice);
 v.querySelectorAll('[data-select-gift]').forEach(button=>button.addEventListener('click',()=>{const select=v.querySelector('#giftTypeSelect');if(select){select.value=button.dataset.selectGift;updateGiftPrice();}v.querySelectorAll('[data-select-gift]').forEach(tile=>tile.classList.toggle('selected',tile===button));}));
 if(wiredStoreSection==='gifts')updateGiftPrice();
 v.querySelector('.store-wallet-history')?.addEventListener('click',openPointsHistory);
 v.querySelectorAll('[data-store-section]').forEach(b=>b.addEventListener('click',()=>{wiredStoreSection=b.dataset.storeSection;if(wiredStoreSection!=='gifts')wiredGiftTarget=null;try{sessionStorage.setItem('wired:storeSection',wiredStoreSection);}catch(e){}saveWiredRoute();if(wiredStoreSection==='gifts')Promise.all([loadGiftFriends(),loadReturnedGiftInventory()]).then(()=>{if(state.page==='store'&&wiredStoreSection==='gifts')renderGlobalStore()}).catch(e=>toast(errorText(e)));renderGlobalStore();}));


 v.querySelectorAll('[data-store-buy]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  await purchaseGlobalStoreItem(button.dataset.storeBuy);
  if(button.isConnected)button.disabled=false;
 }));
 v.querySelector('[data-open-yokai-backgrounds]')?.addEventListener('click',()=>{
  const inventory=v.querySelector('#myYokaiBackgrounds');
  inventory?.focus({preventScroll:true});
  inventory?.scrollIntoView();
 });
 v.querySelector('[data-yokai-background-target]')?.addEventListener('change',event=>{
  yokaiBackgroundTarget=event.target.value;
  renderGlobalStore();
  v.querySelector('[data-yokai-background-target]')?.focus();
 });
 v.querySelectorAll('[data-yokai-background-item],[data-yokai-background-clear]').forEach(button=>button.addEventListener('click',async()=>{
  const itemId=button.dataset.yokaiBackgroundItem;
  const clear=button.hasAttribute('data-unequip')||button.hasAttribute('data-yokai-background-clear');
  button.disabled=true;
  await setYokaiBackground(yokaiBackgroundTarget,clear?null:itemId,clear?state.yokaiBackgrounds?.[yokaiBackgroundTarget]?.item_id:null);
  if(button.isConnected)button.disabled=false;
 }));
 v.querySelectorAll('[data-store-equip]').forEach(b=>b.addEventListener('click',()=>toggleGlobalStoreCosmetic(b.dataset.storeEquip,b)));
 v.querySelectorAll('[data-store-recycle]').forEach(b=>b.addEventListener('click',()=>recycleStorePurchase(b.dataset.storeRecycle)));
 v.querySelectorAll('[data-pet-equip-item]').forEach(b=>{const id=b.dataset.petEquipItem,select=v.querySelector('[data-yokai-target="'+CSS.escape(id)+'"]');const update=()=>{const equipped=isYokaiItemEquipped(id,select?.value);b.textContent=equipped?'Equipped':'Equip to yokai';b.disabled=equipped||!select?.value;};select?.addEventListener('change',update);update();b.addEventListener('click',()=>equipPetStoreItem(id,select?.value,b));});
}
function isGlobalGroupThread(thread){return thread.type==="group"||thread.kind==="group"||thread.thread_type==="group"||thread.is_group===true||thread.is_group_chat===true||Number(thread.member_count||thread.participant_count||0)>2;}
function isGlobalThread(thread){return !thread.community_id&&!thread.communityId&&thread.type!=="community"&&thread.kind!=="community";}

async function loadPetParadise(){
  if(!state.user){state.petSpecies=[];state.userPets=[];state.petEquipment=[];state.yokaiBackgrounds={};return;}
  // Use the authenticated server endpoint so the account's own collection is
  // read by the verified user id, independent of browser-side table RLS.
  const [data]=await Promise.all([
   api("/pets?fresh="+Date.now()),
   loadYokaiBackgrounds().catch(error=>console.warn("Yokai background refresh unavailable",error))
  ]);
  state.petSpecies=data.species||[];
  state.userPets=data.owned||[];
  state.petEquipment=data.equipment||[];
  const {data:careRecharges,error:careRechargeError}=await sb.rpc("my_yokai_care_recharges");
  if(!careRechargeError)state.yokaiCareRecharges=Object.fromEntries((careRecharges||[]).map(x=>[String(x.pet_id)+":"+x.action_type,x.ready_at]));
  const {data:recharges,error:rechargeError}=await sb.rpc("my_yokai_skill_recharges");
  if(!rechargeError)state.yokaiSkillRecharges=Object.fromEntries((recharges||[]).map(x=>[String(x.pet_id),x.ready_at]));
  const {data:evolvedRecharges,error:evolvedRechargeError}=await sb.rpc("my_evolved_yokai_skill_recharges");
  if(!evolvedRechargeError)state.evolvedYokaiSkillRecharges=Object.fromEntries((evolvedRecharges||[]).map(x=>[String(x.pet_id),x.ready_at]));
  const {data:ascendantRecharges,error:ascendantRechargeError}=await sb.rpc("my_ascendant_yokai_skill_recharges");
  if(!ascendantRechargeError)state.ascendantYokaiSkillRecharges=Object.fromEntries((ascendantRecharges||[]).map(x=>[String(x.pet_id),x.ready_at]));
  const {data:eternalRecharges,error:eternalRechargeError}=await sb.rpc("my_eternal_yokai_skill_recharges");
  if(!eternalRechargeError)state.eternalYokaiSkillRecharges=Object.fromEntries((eternalRecharges||[]).map(x=>[String(x.pet_id),x.ready_at]));
  const {data:pastAdoptions,error:adoptionHistoryError}=await sb.from("global_wallet_transactions").select("id").eq("user_id",state.user.id).eq("transaction_type","purchase").like("source_id","pet:%").limit(1);
  state.freeFirstCommonAvailable=!state.userPets.length&&!adoptionHistoryError&&!(pastAdoptions||[]).length;
}
function yokaiAcquisitionDialog(species,petId){
 document.getElementById("yokaiAcquisitionOverlay")?.remove();
 const overlay=document.createElement("div");overlay.id="yokaiAcquisitionOverlay";overlay.className="yokai-acquisition-overlay";
 const title=escapeHTML(species.name||"Yokai");
 const close=()=>overlay.remove();
 const showName=()=>{
  overlay.querySelector(".yokai-acquisition-box").innerHTML='<h2>Name your new companion</h2><p>What would you like to call your '+title+'?</p><form id="yokaiNewNameForm"><input id="yokaiNewNameInput" maxlength="24" required placeholder="Companion name" autocomplete="off"><div class="yokai-acquisition-actions"><button type="button" class="ghost" id="yokaiSkipName">Maybe later</button><button class="primary" type="submit">Save name</button></div></form>';
  overlay.querySelector("#yokaiSkipName").onclick=close;
  overlay.querySelector("#yokaiNewNameForm").onsubmit=async e=>{
   e.preventDefault();const name=overlay.querySelector("#yokaiNewNameInput").value.trim();if(!name||!petId)return;
   const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;btn.textContent="Saving…";
   const {data,error}=await sb.from("user_pets").update({nickname:name}).eq("id",petId).eq("owner_id",state.user.id).select("id");
   if(error||!data?.length){toast(errorText(error||new Error("Could not save companion name.")));btn.disabled=false;btn.textContent="Save name";return;}
   close();await loadPetParadise();render();toast("Your companion is now named "+name+"!");
  };
  overlay.querySelector("#yokaiNewNameInput").focus();
 };
 overlay.innerHTML='<div class="yokai-acquisition-box" role="dialog" aria-modal="true" aria-label="New Yokai companion"><h2>Congratulations!</h2><p>You’ve befriended a '+title+'. Would you like to name your new companion?</p><div class="yokai-acquisition-actions"><button type="button" class="ghost" id="yokaiNameLater">Not now</button><button type="button" class="primary" id="yokaiNameNow">Yes, name them</button></div></div>';
 document.body.appendChild(overlay);
 overlay.querySelector("#yokaiNameLater").onclick=close;
 overlay.querySelector("#yokaiNameNow").onclick=showName;
}
async function adoptPet(slug){
 const species=state.petSpecies.find(p=>p.slug===slug);if(!species)return;
 const button=document.querySelector('[data-pet-adopt="'+CSS.escape(slug)+'"]');
 if(button){button.disabled=true;button.textContent="Adopting…";}
 try{
  const before=new Set((state.userPets||[]).map(p=>String(p.id)));
  const {error}=await sb.rpc("adopt_pet",{p_species_slug:slug,p_nickname:species.name});
  if(error)throw error;
  await loadPetParadise();render();
  const pet=(state.userPets||[]).find(p=>!before.has(String(p.id))&&(p.species_id===species.id||p.species?.slug===slug||p.slug===slug))||(state.userPets||[]).find(p=>!before.has(String(p.id)));
  yokaiAcquisitionDialog(species,pet?.id);
 }catch(e){toast(errorText(e));if(button){button.disabled=false;button.textContent=species.adoption_cost?"Adopt · "+species.adoption_cost+" pts":"Adopt for free";}}
}
// Companion dialogue is cosmetic: the server remains authoritative for care rewards.
const YOKAI_WHISPERS={"Kodama":["The roots remember every footstep.","The forest has been listening.","Do not wake what sleeps beneath the bark."],"Zashiki-warashi":["I heard someone breathing in the empty room.","Will you stay? The others never do.","The house remembers those who leave."],"Kappa":["The river is deeper than it looks.","Come closer. The water is lovely.","I know what waits beneath the surface."],"Kitsune":["You believe everything I tell you? How delightful.","One of my faces is telling the truth.","A secret for a secret, little mortal."],"Bakeneko":["The shadows obey me better than you do.","Did you hear the voice behind you?","I have worn many faces before this one."],"Oni":["Do not mistake patience for mercy.","I hunger for a worthy challenge.","Even mountains tremble when I wake."],"Yatagarasu":["Three paths lie ahead. Two end in darkness.","I have seen the omen already.","The sky remembers what you have forgotten."],"Tengu":["Pride is a blade. Yours is dull.","The mountain has judged you.","Earn my respect, or face the wind."],"Yuki-onna":["The snow will keep your secrets forever.","Your breath is so wonderfully fragile.","Silence is prettiest beneath the ice."],"Nurikabe":["There is no way around me.","The road behind you has vanished.","I can wait longer than you can."],"Rokurokubi":["I saw what you hid after midnight.","Your window was open last night.","There is nowhere my gaze cannot reach."],"Jorogumo":["Every thread leads back to me.","Struggle if you wish. It amuses me.","My web has room for one more secret."],"Nekomata":["The dead have excellent stories.","My second tail knows your secrets.","The candles flicker when I am pleased."],"Kasa-obake":["Did that shadow just blink?","Rain hides the loveliest screams.","Peekaboo. I was behind you all along."],"Shinigami":["Your time is borrowed.","I can hear the silence between your heartbeats.","Every name finds its way into my ledger."],"Amabie":["The tide brings a warning tonight.","Some futures should remain beneath the waves.","I have seen what the sea will claim."],"Gashadokuro":["The bones beneath the earth are restless.","I hear the living from miles away.","My hunger outlives empires."],"Ushi-oni":["The shore is no place for the careless.","The black tide rises for me.","I do not forgive trespassers."],"Onryō":["Betrayal echoes beyond the grave.","I have not forgotten a single face.","Revenge is patient. So am I."],"Komainu":["The shrine is watching through my eyes.","One step closer, and be judged.","My oath was carved in stone."],"Futakuchi-onna":["One mouth smiles. The other hungers.","Did you hear my hair whisper?","There is never enough to satisfy me."],"Kamaitachi":["Too slow. The wind already cut you.","I dance where blades cannot be seen.","Hear that? The storm is laughing."],"Nurarihyon":["You seem surprised to find me here.","This house has always been mine.","Do sit. I insist."],"Sasquatch":["I have watched you from the tree line.","The wilderness keeps its own laws.","You are not alone among these trees."],"Yeti":["The mountain has no mercy.","I can smell fear through the snow.","Even the blizzard knows my name."]};
const yokaiSpeech=new Map();
function yokaiReaction(pet,action){
  const species=pet.pet_species||{};
  const lines=YOKAI_WHISPERS[species.name]||["The veil stirs around us.","Something unseen is watching.","The shadows know your name."];
  const mood=Number(pet.hunger)<25?"hungry":Number(pet.energy)<25?"tired":Number(pet.happiness)<25?"lonely":"steady";
  const moods={hungry:"My hunger grows stronger.",tired:"Even spirits must retreat into darkness.",lonely:"Have you forgotten the one who watches you?"};
  const prefix=action==="feed"?"An offering. How interesting.":action==="play"?"You dare to summon my attention?":"The shadows grow quiet.";
  const quote=mood!=="steady"&&Math.random()<0.45?moods[mood]:lines[Math.floor(Math.random()*lines.length)];
  return prefix+" "+quote;
}
async function careForPet(id,action,button){
  if(button){button.disabled=true;button.textContent=action==="feed"?"Feeding…":action==="play"?"Training…":"Resting…";}
  try{
    const {error}=await sb.rpc("care_for_pet",{p_pet_id:id,p_action:action});
    if(error)throw error;
    await Promise.all([loadPetParadise(),loadGlobalStore()]);
    const caredPet=(state.userPets||[]).find(p=>String(p.id)===String(id));
    if(caredPet)yokaiSpeech.set(String(id),yokaiReaction(caredPet,action));
    render();
    // Read the actual server-awarded reward rather than displaying a stale fixed amount.
    // Each care action is recorded by the care_for_pet RPC in pet_actions.
    const {data:careHistory,error:careHistoryError}=await sb.from("pet_actions")
      .select("points_awarded").eq("pet_id",id).eq("action_type",action)
      .order("created_at",{ascending:false}).limit(1);
    const reward=careHistoryError?null:careHistory?.[0]?.points_awarded;
    const message=action==="feed"?"Yum! Your pet enjoyed its snack.":action==="play"?"Training complete!":"Your pet is feeling refreshed.";
    toast(message+(Number.isFinite(Number(reward))&&reward!==null?" +"+Number(reward)+" WIRED points! ✨":" Points awarded to your wallet."));
  }catch(e){toast(errorText(e));if(button)button.disabled=false;}
}
async function invokeEternalYokaiSkill(id,button){
 if(button){button.disabled=true;button.textContent="Invoking eternal skill…";}
 try{
  const {data,error}=await sb.rpc("invoke_eternal_yokai_skill",{p_pet_id:id});
  if(error)throw error;
  yokaiSpeech.set(String(id),"✦ "+data.skill+" unleashed! +"+Number(data.xp||0)+" XP · +"+Number(data.points||0)+" points");
  await Promise.all([loadPetParadise(),loadGlobalStore()]);render();
  toast(data.skill+" activated! +"+Number(data.points||0)+" points. Skill recharges in 7 hours.");
 }catch(e){await loadPetParadise().catch(()=>{});render();toast(errorText(e));}
}
async function invokeAscendantYokaiSkill(id,button){
 if(button){button.disabled=true;button.textContent="Invoking ascendant skill…";}
 try{
  const {data,error}=await sb.rpc("invoke_ascendant_yokai_skill",{p_pet_id:id});
  if(error)throw error;
  yokaiSpeech.set(String(id),"✦ "+data.skill+" unleashed! +"+Number(data.xp||0)+" XP · +"+Number(data.points||0)+" points");
  await Promise.all([loadPetParadise(),loadGlobalStore()]);render();
  toast(data.skill+" activated! +"+Number(data.points||0)+" points. Skill recharges in 5 hours.");
 }catch(e){await loadPetParadise().catch(()=>{});render();toast(errorText(e));}
}
async function invokeEvolvedYokaiSkill(id,button){
 if(button){button.disabled=true;button.textContent="Invoking awakened skill…";}
 try{
  const {data,error}=await sb.rpc("invoke_evolved_yokai_skill",{p_pet_id:id});
  if(error)throw error;
  yokaiSpeech.set(String(id),"✦ "+data.skill+" unleashed! +"+Number(data.xp||0)+" XP · +"+Number(data.points||0)+" points");
  await Promise.all([loadPetParadise(),loadGlobalStore()]);
  render();toast(data.skill+" activated! +"+Number(data.points||0)+" points. Skill recharges in 3 hours.");
 }catch(e){await loadPetParadise().catch(()=>{});render();toast(errorText(e));}
}
async function invokeYokaiSkill(id,button){
 if(button){button.disabled=true;button.textContent="Invoking…";}
 try{
  const {data,error}=await sb.rpc("invoke_yokai_skill",{p_pet_id:id});
  if(error)throw error;
  const pet=(state.userPets||[]).find(p=>String(p.id)===String(id));
  const skill=data?.skill||pet?.pet_species?.ability_name||"Yokai skill";
  yokaiSpeech.set(String(id),"✦ "+skill+" unleashed! "+(data?.critical?"A rare omen magnifies its power. ":"")+"+"+Number(data?.xp||0)+" XP · +"+Number(data?.points||0)+" points"+(data?.energy?" · +"+data.energy+" energy":"")+(data?.happiness?" · +"+data.happiness+" happiness":"")+(data?.fullness?" · +"+data.fullness+" fullness":""));
  await Promise.all([loadPetParadise(),loadGlobalStore()]);render();toast(skill+" activated! +"+Number(data?.points||0)+" points. Skill recharges in 1 hour.");
 }catch(e){
  await loadPetParadise().catch(()=>{});
  render();
  if(!Object.keys(state.yokaiSkillRecharges||{}).some(k=>k===String(id)))toast(errorText(e));
 }
}
async function releasePet(id,button){
  const pet=(state.userPets||[]).find(x=>String(x.id)===String(id));
  const species=pet?.pet_species||{};
  const label=pet?.nickname||species.name||"this yokai";
  if(!await wiredDialog("Release "+label+"? This permanently removes the companion from your collection. No WIRED points will be refunded."))return;
  if(button){button.disabled=true;button.textContent="Releasing…";}
  try{
    // Use the authenticated database RPC and require its success response.
    const {data,error}=await sb.rpc("release_pet",{p_pet_id:id});
    if(error)throw error;
    if(data!==true)throw new Error("The release was not confirmed by the server.");
    await Promise.all([loadPetParadise(),loadProfile()]);
    if(state.profile?.companion?.id===id)state.profile.companion=null;
    if((state.userPets||[]).some(x=>String(x.id)===String(id))){
      throw new Error("The yokai still appears in your collection. Please refresh and try again.");
    }
    render();
    toast(label+" has been released.");
  }catch(e){
    const message=errorText(e);
    if(/only release a companion you own/i.test(message)){
      try{
        await loadPetParadise();
        render();
        if(!(state.userPets||[]).some(x=>String(x.id)===String(id))){
          toast(label+" was already released. Your collection has been refreshed.");
          return;
        }
      }catch(refreshError){console.warn("Yokai refresh failed",refreshError);}
    }
    toast(message);
    if(button){button.disabled=false;button.textContent="↗ Release Companion";}
  }
}
function yokaiPortraitUrl(name,slug,evolved){
  const keys=[slug,name].filter(Boolean).map(value=>String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""));
  const base="./assets/yokai/";
  const gifs={
    "betobetosan":"betobeto-san.GIF",
    "dodomeki":"dodomeki.GIF",
    "nureonna":"nure-onna.GIF",
    "kejoro":"kejōrō.GIF",
    "kejorō":"kejōrō.GIF",
    "keukegen":"keukegen.GIF",
    "nuppeppo":"nuppeppō.GIF",
    "yanari":"yanari.GIF",
    "sasquatch":"Sasquatch.GIF",
    "amabie":"amabie.GIF",
    "bakeneko":"bakeneko.GIF",
    "futakuchionna":"futakuchi-onna .GIF",
    "gashadokuro":"gashadokuro.GIF",
    "jurogumo":"jurogumo.GIF",
    "kamaitachi":"kamaitachi.GIF",
    "kappa":"kappa.GIF",
    "kasaobake":"kasa-obake.GIF",
    "kitsune":"kitsune.GIF",
    "kodama":"kodama.GIF",
    "komainu":"komainu.GIF",
    "nekomata":"nekomata.GIF",
    "nurarihyon":"nurarihyon.GIF",
    "nurikabe":"nurikabe.GIF",
    "oni":"oni.GIF",
    "onryo":"onryō.GIF",
    "rokurokubi":"rokurokubi.GIF",
    "shinigami":"shinigami.GIF",
    "tengu":"tengu.GIF",
    "ushioni":"ushi-oni.gif",
    "yatagarasu":"yatagarasu.GIF",
    "yeti":"yeti.GIF",
    "yukionna":"yuki-onna.GIF",
    "zashikiwarashi":"zashiki-warashi.GIF",
    "bigfoot":"Sasquatch.GIF",
    "jorogumo":"jurogumo.GIF"
  };
  const aliases={mythicalyeti:"yeti",yokaiyeti:"yeti",snowyeti:"yeti",mythicalsasquatch:"sasquatch"};
  for(const key of keys){
    const match=gifs[key]||gifs[aliases[key]];
    if(match) return base+encodeURIComponent(match)+"?v=105";
  }
  return "";
}
function petStat(label,value,icon){
  const n=Math.max(0,Math.min(100,Number(value)||0));
  return '<div class="pet-stat"><div><span>'+icon+' '+label+'</span><b>'+n+'%</b></div><div class="pet-stat-track"><i style="width:'+n+'%"></i></div></div>';
}
function yokaiRechargeLabel(readyAt){
 const remaining=Math.max(0,Math.ceil((Date.parse(readyAt)-Date.now())/1000));
 if(!remaining)return null;
 return String(Math.floor(remaining/3600)).padStart(2,"0")+":"+String(Math.floor(remaining%3600/60)).padStart(2,"0")+":"+String(remaining%60).padStart(2,"0");
}
setInterval(()=>{
 if(state.page!=="pets")return;
 document.querySelectorAll("[data-pet-care]").forEach(button=>{
  const action=button.dataset.action,id=button.dataset.petCare;
  const key=String(id)+":"+action;
  const until=state.yokaiCareRecharges?.[key];
  const remaining=until?yokaiRechargeLabel(until):null;
  const label=action==="feed"?"🥩 Feed":action==="play"?"⚔️ Train":"🌙 Rest";
  if(remaining){button.disabled=true;button.textContent=label+" · "+remaining;}
  else if(until){delete state.yokaiCareRecharges[key];button.disabled=false;button.textContent=label;}
 });
 document.querySelectorAll("[data-yokai-eternal-skill]").forEach(button=>{
  const id=button.dataset.yokaiEternalSkill;
  const until=state.eternalYokaiSkillRecharges?.[id];
  const remaining=until?yokaiRechargeLabel(until):null;
  if(remaining){button.disabled=true;button.textContent="✵ Recharging "+remaining;}
  else if(until){delete state.eternalYokaiSkillRecharges[id];button.disabled=false;button.textContent="✵ Invoke Eternal Skill · 7h cooldown";}
 });
 document.querySelectorAll("[data-yokai-ascendant-skill]").forEach(button=>{
  const id=button.dataset.yokaiAscendantSkill;
  const until=state.ascendantYokaiSkillRecharges?.[id];
  const remaining=until?yokaiRechargeLabel(until):null;
  if(remaining){button.disabled=true;button.textContent="✺ Recharging "+remaining;}
  else if(until){delete state.ascendantYokaiSkillRecharges[id];button.disabled=false;button.textContent="✺ Invoke Ascendant Skill · 5h cooldown";}
 });
 document.querySelectorAll("[data-yokai-evolved-skill]").forEach(button=>{
  const id=button.dataset.yokaiEvolvedSkill;
  const until=state.evolvedYokaiSkillRecharges?.[id];
  const remaining=until?yokaiRechargeLabel(until):null;
  if(remaining){button.disabled=true;button.textContent="☾ Recharging "+remaining;}
  else if(until){delete state.evolvedYokaiSkillRecharges[id];button.disabled=false;button.textContent="☾ Invoke Awakened Skill · 3h cooldown";}
 });
 document.querySelectorAll("[data-yokai-skill]").forEach(button=>{
  const id=button.dataset.yokaiSkill;
  const until=state.yokaiSkillRecharges?.[id];
  const remaining=until?yokaiRechargeLabel(until):null;
  if(remaining){button.disabled=true;button.textContent="✦ Recharging "+remaining;}
  else if(until){delete state.yokaiSkillRecharges[id];button.disabled=false;button.textContent="✦ Invoke Skill · 1h cooldown";}
 });
},1000);
function renderPetParadise(){
  const v=$("view");
  if(!state.user){
    v.innerHTML='<section class="pet-hero"><span class="pet-kicker">DARK FOLKLORE · GOTHIC SPIRITS</span><h2>Yokai Hollow</h2><p>Meet Japanese yokai, build bonds, and collect magical spirits.</p><button class="primary" id="petLoginBtn">Log in to meet a yokai</button></section>';
    $("petLoginBtn")?.addEventListener("click",openAuth);return;
  }
  const pets=state.userPets||[],first=state.freeFirstCommonAvailable===true;
  const rarityLevels=["common","uncommon","rare","epic","legendary","mythical"];
  const rarityLabel=r=>({common:"Common",uncommon:"Uncommon",rare:"Rare",epic:"Epic",legendary:"Legendary",mythical:"Mythical"}[String(r||"").toLowerCase()]||r);
  const rarityGroup=(items,renderCard,gridClass)=>rarityLevels.map(rarity=>{const group=items.filter(item=>String((item.pet_species||item).rarity||"common").toLowerCase()===rarity);return group.length?'<section class="yokai-rarity-group"><h3 class="yokai-rarity-heading">'+rarityLabel(rarity)+' <span>('+group.length+')</span></h3><div class="'+gridClass+'">'+group.map(renderCard).join("")+'</div></section>':"";}).join("");
  const petCards=rarityGroup(pets,p=>{
    const species=p.pet_species||{},xp=Number(p.xp)||0,level=Number(p.level)||1,progress=xp%100,evolved=level>=Number(species.evolution_level||15),ascendant=level>=45,eternal=level>=90;
    const displayName=eternal?(species.fourth_evolved_name||("Eternal "+(species.third_evolved_name||species.name||"Yokai"))):ascendant?(species.third_evolved_name||("Ascendant "+(species.evolved_name||species.name||"Yokai"))):evolved?(species.evolved_name||("Awakened "+(species.name||"Yokai"))):(species.name||"WIRED spirit");
    const portraitUrl=yokaiPortraitUrl(species.name,species.slug,evolved);
    const backgroundSku=state.yokaiBackgrounds?.[p.id]?.sku;
    return '<article class="pet-card pet-rarity-'+escapeHTML(species.rarity||"common")+'"><div class="pet-card-top"><span class="pet-rarity">'+rarityLabel(species.rarity||"common")+'</span><span class="pet-level">LVL '+level+'</span></div><div class="pet-creature yokai-owned-art yokai-motion yokai-'+escapeHTML(species.slug||"spirit")+(evolved?" yokai-awakened":"")+yokaiBackgroundClass(backgroundSku)+'"'+yokaiBackgroundStyle(backgroundSku)+'><img class="yokai-portrait-image" src="'+portraitUrl+'" alt="'+escapeHTML(displayName)+' gothic anime portrait">' + yokaiAccessoryOverlay((state.petEquipment||[]).filter(x=>x.pet_id===p.id),p) + '</div><h3>'+escapeHTML(p.nickname)+'</h3><p class="pet-species">'+escapeHTML(displayName)+(eternal?' <span class="yokai-evolved-tag">✵ ETERNAL</span>':ascendant?' <span class="yokai-evolved-tag">✺ ASCENDANT</span>':evolved?' <span class="yokai-evolved-tag">✦ AWAKENED</span>':'')+'</p><div class="pet-xp"><div><span>Experience</span><b>'+progress+'/100 XP</b></div><i><span style="width:'+progress+'%"></span></i></div><div class="yokai-ability"><b>✧ '+escapeHTML(species.ability_name||"Spirit Bond")+'</b><span>'+escapeHTML(species.ability_description||"A unique gift that grows with your bond.")+'</span></div>'+(eternal?'<p class="yokai-evolution-note">✵ '+escapeHTML(species.fourth_evolution_description||"Your yokai has transcended!")+'</p>':ascendant?'<p class="yokai-evolution-note">✺ '+escapeHTML(species.third_evolution_description||"Your yokai has ascended!")+' Next transcendence: level 90.</p>':evolved?'<p class="yokai-evolution-note">✦ '+escapeHTML(species.evolution_description||"Your yokai has awakened!")+' Next ascension: level 45. Transcendence at level 90.</p>':'<p class="yokai-evolution-note">Next awakening: '+escapeHTML(species.evolved_name||"Awakened form")+' at level '+Number(species.evolution_level||15)+'. Ascension at level 45, transcendence at level 90.</p>')+'<p class="yokai-evolution-note">As your yokai grows, each awakening unlocks one additional skill.</p>'+petStat("Happiness",p.happiness,"🖤")+petStat("Fullness",p.hunger,"🥩")+petStat("Energy",p.energy,"⚡")+'<div class="yokai-whisper" aria-live="polite"><b>☾ Spirit whisper</b><p>'+escapeHTML(yokaiSpeech.get(String(p.id))||((YOKAI_WHISPERS[species.name]||[])[0]||"The veil stirs around us."))+'</p></div><button class="pet-action yokai-skill-action" type="button" data-yokai-skill="'+escapeHTML(p.id)+'">✦ Invoke Skill · 1h cooldown</button>'+(evolved?'<div class="yokai-ability"><b>☾ '+escapeHTML(species.evolved_name||displayName)+' — Awakened Dominion</b><span>Unleash your evolved yokai’s greater power. Earn extra XP and points, and restore happiness and energy.</span></div><button class="pet-action yokai-skill-action" type="button" data-yokai-evolved-skill="'+escapeHTML(p.id)+'">☾ Invoke Awakened Skill · 3h cooldown</button>':'')+(ascendant?'<div class="yokai-ability"><b>✺ '+escapeHTML(species.third_evolved_name||displayName)+' — Sovereign Eclipse</b><span>Ascendant power: extra XP, points, happiness, fullness and energy.</span></div><button class="pet-action yokai-skill-action" type="button" data-yokai-ascendant-skill="'+escapeHTML(p.id)+'">✺ Invoke Ascendant Skill · 5h cooldown</button>':'')+(eternal?'<div class="yokai-ability"><b>✵ '+escapeHTML(species.fourth_evolved_name||displayName)+' — Veilbreaker</b><span>Eternal power: earn greater XP and points, restoring happiness, fullness and energy.</span></div><button class="pet-action yokai-skill-action" type="button" data-yokai-eternal-skill="'+escapeHTML(p.id)+'">✵ Invoke Eternal Skill · 7h cooldown</button>':'')+'<div class="pet-actions"><button class="pet-action" data-pet-care="'+escapeHTML(p.id)+'" data-action="feed">🥩 Feed</button><button class="pet-action" data-pet-care="'+escapeHTML(p.id)+'" data-action="play">⚔️ Train</button><button class="pet-action" data-pet-care="'+escapeHTML(p.id)+'" data-action="rest">🌙 Rest</button></div><button class="pet-action pet-release-action" type="button" data-pet-release="'+escapeHTML(p.id)+'">↗ Release Companion</button><p class="pet-footnote">Your yokai never gets sick or loses progress while you are away.</p></article>';
  },"pet-collection");
  const shop=rarityGroup(state.petSpecies,p=>{
    const freeCommon=first&&p.rarity==="common";
    return '<article class="pet-adopt-card pet-rarity-'+escapeHTML(p.rarity)+'"><div class="pet-adopt-art yokai-motion yokai-'+escapeHTML(p.slug||"spirit")+'"><img class="yokai-portrait-image" src="'+yokaiPortraitUrl(p.name,p.slug,false)+'" alt="'+escapeHTML(p.name)+' gothic anime portrait"></div><span class="pet-rarity">'+rarityLabel(p.rarity)+'</span><h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(p.description)+'</p><div class="yokai-personality">☠ '+escapeHTML(p.personality||"A one-of-a-kind spirit.")+'</div><div class="yokai-ability"><b>✧ '+escapeHTML(p.ability_name||"Spirit Bond")+'</b><span>'+escapeHTML(p.ability_description||"A unique yokai gift.")+'</span></div><small class="yokai-evolution-note">Awakens into '+escapeHTML(p.evolved_name||"an elder spirit")+' at level '+Number(p.evolution_level||5)+'.</small><button class="primary" data-pet-adopt="'+escapeHTML(p.slug)+'" '+'>'+(freeCommon?"Adopt for free":Number(p.adoption_cost)?"Adopt · "+Number(p.adoption_cost)+" pts":"Adopt for free")+'</button></article>';
  },"pet-adoption-grid");
  const sanctuaryView=state.yokaiSanctuaryView||'home';
  const hero='<section class="pet-hero"><div><span class="pet-kicker">WHERE MORTALS DARE NOT TREAD</span><h2>Yokai Hollow <span>☾</span></h2><p>Beyond the veil, unnatural creatures gather. Enter their domain and bind your fate to theirs.</p></div><div class="pet-hero-count"><b>'+pets.length+'</b><span>'+(pets.length===1?'companion':'companions')+'</span></div></section>';
  const footer='<p class="pet-kindness">☾ The spirits do not perish, flee, or forget their power while you are gone. Beyond the veil, they wait in silence for your return.</p>';
  const owned='<section class="pet-section"><div class="section-head"><div><h2>My yokai</h2><p class="hint">Feed their hunger. Sharpen their power. Awaken what lurks within.</p></div></div>'+(pets.length?petCards:'<div class="pet-empty"><div>☾</div><h3>No spirits bound to you</h3><p>Enter the summoning chamber to adopt your first yokai.</p></div>')+'</section>';
  const summon='<section class="pet-section"><div class="section-head"><div><h2>Summon a yokai</h2><p class="hint">'+(first?'Your first Common yokai is on us.':'Collect new companions with your WIRED points.')+'</p></div></div><div class="pet-adoption-grid">'+shop+'</div></section>';
  const choices='<div class="yokai-sanctuary-choices"><button type="button" class="yokai-sanctuary-choice" data-yokai-view="owned"><span class="yokai-choice-symbol">☾</span><strong>My yokai</strong><span>Enter your collection of bound spirits</span><small>'+pets.length+' '+(pets.length===1?'companion':'companions')+'</small></button><button type="button" class="yokai-sanctuary-choice" data-yokai-view="summon"><span class="yokai-choice-symbol">✧</span><strong>Summon a yokai</strong><span>Explore the spirits awaiting adoption</span><small>Enter the summoning chamber</small></button></div>';
  const back='<button type="button" class="ghost yokai-sanctuary-back" data-yokai-view="home">← Back to Yokai Hollow</button>';
  v.innerHTML=hero+(sanctuaryView==='owned'?back+owned:sanctuaryView==='summon'?back+summon:choices)+footer;
  v.querySelectorAll('[data-yokai-view]').forEach(button=>button.addEventListener('click',()=>{state.yokaiSanctuaryView=button.dataset.yokaiView;try{sessionStorage.setItem('wired:sanctuaryView',state.yokaiSanctuaryView);}catch(e){}renderPetParadise();}));

  v.querySelectorAll("[data-pet-adopt]").forEach(b=>b.addEventListener("click",()=>adoptPet(b.dataset.petAdopt)));
  v.querySelectorAll("[data-pet-care]").forEach(b=>b.addEventListener("click",()=>careForPet(b.dataset.petCare,b.dataset.action,b)));
  v.querySelectorAll("[data-yokai-skill]").forEach(b=>b.addEventListener("click",()=>invokeYokaiSkill(b.dataset.yokaiSkill,b)));
  v.querySelectorAll("[data-yokai-evolved-skill]").forEach(b=>b.addEventListener("click",()=>invokeEvolvedYokaiSkill(b.dataset.yokaiEvolvedSkill,b)));
  v.querySelectorAll("[data-yokai-ascendant-skill]").forEach(b=>b.addEventListener("click",()=>invokeAscendantYokaiSkill(b.dataset.yokaiAscendantSkill,b)));
  v.querySelectorAll("[data-yokai-eternal-skill]").forEach(b=>b.addEventListener("click",()=>invokeEternalYokaiSkill(b.dataset.yokaiEternalSkill,b)));
  v.querySelectorAll("[data-pet-release]").forEach(b=>b.addEventListener("click",()=>releasePet(b.dataset.petRelease,b)));
}
async function renderBugReports(){
 const v=$("view");if(!v)return;
 if(!wiredStaffAccess){nav("home");return;}
 if(!state.user){v.innerHTML='<section class="card"><h2>Report a Bug</h2><p>Log in to submit and track issues with WIRED.</p></section>';return;}
 v.innerHTML='<section class="bug-report-page"><h2>Report a Bug</h2><p class="hint">Found something broken? Tell us what happened so we can investigate.</p><form id="wiredBugForm" class="bug-report-form"><label class="field">Area<select name="category" required><option value="Profiles">Profiles</option><option value="Yokai">Yokai</option><option value="Communities">Communities</option><option value="Chats">Chats</option><option value="Store">Store</option><option value="Notifications">Notifications</option><option value="Other">Other</option></select></label><label class="field">Short summary<input name="title" required minlength="3" maxlength="140" placeholder="What is not working?"></label><label class="field">Describe the problem<textarea name="description" required minlength="10" maxlength="4000" rows="5" placeholder="What happened? What did you expect?"></textarea></label><label class="field">Steps to reproduce (optional)<textarea name="steps" maxlength="2000" rows="3" placeholder="1. Open… 2. Tap… 3. Error appears…"></textarea></label><button type="submit" class="primary">Submit bug report</button><p id="wiredBugFeedback" role="status"></p></form><h3>My Reports</h3><div id="wiredBugHistory" class="bug-report-history"><p class="hint">Loading reports…</p></div></section>';
 const form=$("wiredBugForm");
 form.addEventListener("submit",async e=>{
  e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent="Submitting…";
  const data=new FormData(form);
  const {error}=await sb.from("bug_reports").insert({reporter_id:state.user.id,category:String(data.get("category")),title:String(data.get("title")).trim(),description:String(data.get("description")).trim(),steps_to_reproduce:String(data.get("steps")).trim(),page:"global"});
  if(error){$("wiredBugFeedback").textContent=errorText(error);button.disabled=false;button.textContent="Submit bug report";return;}
  form.reset();$("wiredBugFeedback").textContent="Bug report submitted. Thank you!";button.disabled=false;button.textContent="Submit bug report";await loadBugHistory();
 });
 await loadBugHistory();
}
async function loadBugHistory(){
 const host=$("wiredBugHistory");if(!host||!state.user)return;
 const {data,error}=await sb.from("bug_reports").select("id,title,category,status,created_at").eq("reporter_id",state.user.id).order("created_at",{ascending:false}).limit(30);
 if(error){host.textContent="Could not load reports: "+errorText(error);return;}
 host.innerHTML=(data||[]).length?data.map(r=>'<article class="bug-report-entry"><strong>'+escapeHTML(r.title)+'</strong><span>'+escapeHTML(r.category)+' · '+escapeHTML(r.status)+' · '+escapeHTML(new Date(r.created_at).toLocaleDateString())+'</span></article>').join(''):'<p class="hint">No bug reports submitted yet.</p>';
}
async function renderFeatureRequests(){
 const v=$("view");if(!v)return;
 if(!wiredStaffAccess){nav("home");return;}
 v.innerHTML='<section class="bug-report-page"><h2>❗ Add Features ❗</h2><p class="hint">Suggest new features, improvements, or updates for WIRED. Requests are visible only to global owners and administrators.</p><form id="wiredFeatureForm" class="bug-report-form"><label class="field">Request type<select name="request_type" required><option value="new_feature">New feature</option><option value="improvement">Improve existing feature</option><option value="update">App update</option></select></label><label class="field">Feature or update title<input name="title" required minlength="3" maxlength="140" placeholder="What should be added or changed?"></label><label class="field">Details<textarea name="description" required minlength="10" maxlength="4000" rows="5" placeholder="Describe how it should work and why it would help."></textarea></label><label class="field">Priority<select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option></select></label><button class="primary" type="submit">Submit feature request</button><p id="wiredFeatureFeedback" role="status"></p></form><h3>Staff Feature Requests</h3><div id="wiredFeatureHistory" class="bug-report-history"><p class="hint">Loading requests…</p></div></section>';
 const form=$("wiredFeatureForm");
 form.addEventListener("submit",async e=>{
  e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent="Submitting…";
  const data=new FormData(form);
  const {error}=await sb.from("feature_requests").insert({requester_id:state.user.id,request_type:String(data.get("request_type")),title:String(data.get("title")).trim(),description:String(data.get("description")).trim(),priority:String(data.get("priority"))});
  button.disabled=false;button.textContent="Submit feature request";
  if(error){$("wiredFeatureFeedback").textContent=errorText(error);return;}
  form.reset();$("wiredFeatureFeedback").textContent="Feature request submitted.";await loadFeatureRequests();
 });
 await loadFeatureRequests();
}
async function loadFeatureRequests(){
 const host=$("wiredFeatureHistory");if(!host||!wiredStaffAccess)return;
 const {data,error}=await sb.from("feature_requests").select("id,title,request_type,priority,status,created_at").order("created_at",{ascending:false}).limit(50);
 if(error){host.textContent="Could not load requests: "+errorText(error);return;}
 host.innerHTML=(data||[]).length?data.map(r=>'<article class="bug-report-entry"><strong>'+escapeHTML(r.title)+'</strong><span>'+escapeHTML(r.request_type.replaceAll("_"," "))+' · '+escapeHTML(r.priority)+' priority · '+escapeHTML(r.status)+' · '+escapeHTML(new Date(r.created_at).toLocaleDateString())+'</span></article>').join(''):'<p class="hint">No feature requests submitted yet.</p>';
}
function render(){
 updateCommunityNavigation();
 const accountButton=$("accountBtn");if(accountButton)accountButton.textContent=state.user?"My account":"Log in";const headerLogout=$("headerLogoutBtn");if(headerLogout)headerLogout.hidden=!state.user;updateNotificationBell();
 const hero=document.querySelector("#app > .hero");
 if(hero)hero.hidden=!(state.page==="home"||state.page==="discover");
 const v=$("view");
 if(state.page==="bugs"){renderBugReports();return;}
 if(state.page==="features"){renderFeatureRequests();return;}
 if(state.page==="home"){
  v.innerHTML=`<div class="section-head"><h2>Your WIRED community</h2><span class="pill">18+ only</span></div><div class="grid"><article class="card"><span class="pill">WELCOME</span><h3>${state.user?`Welcome, ${escapeHTML(state.profile?.username||state.user.email||"member")}`:"Stay connected."}</h3><p>Make new friends, discover interests, and find your members.</p></article><article class="card"><span class="pill">DISCOVER</span><h3>Explore something new</h3><p>Browse communities built around what you love.</p><button class="ghost" data-go="discover">Explore →</button></article><article class="card"><span class="pill">CREATE</span><h3>Start a community</h3><p>Bring members together around a shared interest.</p><button class="ghost" data-go="create">Create community →</button></article></div><div class="section-head"><h2>Communities</h2><button type="button" class="ghost" id="viewAllCommunities">View All Communities →</button></div>${state.user?`<div class="grid">${communityCards(state.communities.slice(0,3))}</div>`:`<div class="empty">Log in to discover and join WIRED communities.</div>`}`;
 }

 if(state.page==="home")v.querySelector('#viewAllCommunities')?.addEventListener('click',()=>nav('all-communities'));
 if(state.page==="all-communities"){
  const communities=[...state.communities].filter(c=>c.visibility!=="private"||c.joined||c.owner_id===state.user?.id||c.role).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base",numeric:true}));
  v.innerHTML='<section class="wired-all-communities"><div class="section-head"><h2>All Communities</h2><button class="ghost" id="backGlobalHome" type="button">← Global Home</button></div><p class="hint">Browse WIRED communities alphabetically (A–Z).</p><p class="hint">'+communities.length+' '+(communities.length===1?'community':'communities')+'</p>'+ (state.user?communityCards(communities):'<div class="empty">Log in to view WIRED communities.</div>')+'</section>';
  v.querySelector('#backGlobalHome')?.addEventListener('click',()=>nav('home'));
  v.querySelectorAll('[data-open-community]').forEach(b=>b.addEventListener('click',()=>openCommunity(b.dataset.openCommunity)));
  v.querySelectorAll('[data-join-community]').forEach(b=>b.addEventListener('click',()=>joinCommunity(b.dataset.joinCommunity)));
  return;
 }
 if(state.page==="communities"){
  const mine=state.communities.filter(c=>c.joined||c.owner_id===state.user?.id||c.role);
  const recommended=state.communities.filter(c=>!mine.some(m=>m.id===c.id));
  const card=(c,own=false)=>{const cover=c.cover_url||c.icon_url||'';return '<article class="wired-community-tile" style="'+(cover?'--tile-image:url(&quot;'+escapeHTML(cover)+'&quot;)':'')+'"><button class="wired-tile-open" data-open-community="'+escapeHTML(c.id)+'" aria-label="Open '+escapeHTML(c.name)+'"></button><div class="wired-tile-icon">'+(cover?'<img src="'+escapeHTML(cover)+'" alt="">':'<span>W</span>')+'</div><div class="wired-tile-bottom"><h3>'+escapeHTML(c.name)+'</h3><span>'+(own?'Joined':'Recommended')+'</span></div><button class="wired-tile-enter" data-open-community="'+escapeHTML(c.id)+'">Open</button></article>';};
  v.innerHTML='<div class="wired-community-top"><div class="wired-mini-avatar">'+(state.profile?.avatar_url?'<img src="'+escapeHTML(state.profile.avatar_url)+'" alt="">':'●')+'</div><input id="wiredCommunitySearch" type="search" placeholder="Search communities"><span class="wired-lang">EN⌄</span><button class="wired-notice" type="button" title="Notifications">♢</button></div><h2 class="wired-page-title">My Communities</h2><div class="wired-my-grid">'+mine.map(c=>card(c,true)).join('')+'<button class="wired-join-tile" data-go="discover"><span>＋</span><b>Join a<br>community</b></button></div><button class="wired-create-cta" data-go="create"><span>▣＋</span> Create Your Own</button><div class="wired-recommended-head"><span></span><h3>Recommended</h3><span></span></div><div class="wired-recommended-grid">'+(recommended.length?recommended.map(c=>card(c,false)).join(''):'<div class="empty">You have joined all available communities.</div>')+'</div>';
  const search=$("wiredCommunitySearch");search?.addEventListener("input",()=>{const q=search.value.trim().toLowerCase();v.querySelectorAll(".wired-community-tile").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});});
  v.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));
  v.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
 }
 if(state.page==="store"){renderGlobalStore();}
  if(state.page==="pets"){renderPetParadise();return;}
 if(state.page==="global-members"){renderGlobalMemberDirectory();return;}
 if(state.page==="discover"){
  const mode=state.discoveryMode||"";
  v.innerHTML=`<div class="discovery-topline"><div><h2>Discover</h2><p>Explore WIRED communities and members</p></div></div>${state.user?(mode? `<button class="discovery-back" id="discoveryBack" type="button">← Back to Discovery</button>${mode==="communities"?`<div class="discovery-topline"><h2>Communities</h2><button class="discovery-create" data-go="create">＋ Create Community</button></div><div class="discovery-tools"><label class="field">Search communities<input id="communitySearch" type="search" value="${escapeHTML(state.discoveryQuery)}" placeholder="Search names, topics, descriptions…"></label><label class="field">Category<select id="communityCategory"><option value="all">All categories</option>${[...new Set(state.communities.map(c=>c.category).filter(Boolean))].sort().map(x=>`<option value="${escapeHTML(x)}" ${state.discoveryCategory===x?"selected":""}>${escapeHTML(x)}</option>`).join("")}</select></label></div><section class="discovery-section"><div class="discovery-section-head"><h2>Featured Communities</h2><span>Handpicked spaces to explore</span></div><div class="discovery-shelf" id="featuredCommunities"></div></section><section class="discovery-section"><div class="discovery-section-head"><h2>New Communities</h2><span>Recently created</span></div><div class="discovery-shelf" id="newCommunities"></div></section><section class="discovery-section"><div class="discovery-section-head"><h2>My Communities</h2><span>Your joined spaces</span></div><div class="discovery-shelf" id="myCommunities"></div></section><div class="discovery-all"><div class="section-head"><h2>Explore All Communities</h2><label class="field">Sort<select id="communitySort"><option value="newest" ${state.discoverySort==="newest"?"selected":""}>Recently added</option><option value="name" ${state.discoverySort==="name"?"selected":""}>Name A–Z</option></select></label></div><p class="hint" id="discoveryCount"></p><div class="grid" id="discoveryResults"></div></div>`:`<h2>Global Members</h2><section class="discovery-people-search"><div class="section-head"><h2>Find Members</h2><span>Search WIRED profiles</span></div><label class="field">Search profiles<input id="discoverPeopleSearch" type="search" value="${escapeHTML(state.discoverPeopleQuery)}" placeholder="Search by username…"></label><div id="discoverPeopleResults" class="people-grid"></div><button class="primary" id="viewAllGlobalMembers" type="button">View All Global Members →</button></section>`}`:`<div class="discovery-hub"><button type="button" class="discovery-hub-panel" data-discovery-mode="communities"><span class="discovery-hub-icon">◈</span><strong>Communities</strong><span>Featured, new, joined and all communities</span></button><button type="button" class="discovery-hub-panel" data-discovery-mode="people"><span class="discovery-hub-icon">♙</span><strong>Global Members</strong><span>Find profiles and browse all WIRED members</span></button></div>`):`<div class="empty">Log in to discover communities and members.</div>`}`;
 }
 if(state.page==="create"){
  v.innerHTML=`<div class="section-head"><h2>Create a community</h2></div><div class="card form-card"><form id="communityForm"><label class="field">Community name<input id="cName" required maxlength="50" placeholder="e.g. Anime After Dark"></label><label class="field">Description<textarea id="cDesc" required maxlength="500" placeholder="What is your community about?"></textarea></label><label class="field">Community rules<textarea id="cRules" maxlength="3000" placeholder="Set expectations and guidelines for members"></textarea></label><label class="field">Welcome message<textarea id="cWelcome" maxlength="1000" placeholder="A message new members will see"></textarea></label><label class="field">Cover image<input id="cImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><img id="coverPreview" class="preview" alt="Cover preview"></label><label class="field">Category<select id="cCategory" required><option value="">Choose a category</option>${["Anime","Art","Books","Gaming","Lifestyle","Music","Technology","Other"].map(x=>`<option>${x}</option>`).join("")}</select></label><div class="field">Visibility<div class="radio-row"><label><input type="radio" name="visibility" value="public" checked> Public</label><label><input type="radio" name="visibility" value="private"> Private</label></div><p class="hint">Private communities appear in Discovery, but members must be approved before they can view posts.</p></div><button class="primary full">Create community</button><p class="hint">Community details and cover images are saved to your WIRED Supabase project.</p></form></div>`;
 }
 if(state.page==="chats"){
  const globalThreads=state.threads.filter(isGlobalThread);
  const groupThreads=globalThreads.filter(isGlobalGroupThread);
  const directThreads=globalThreads.filter(t=>!isGlobalGroupThread(t));
  const chatCards=items=>items.map(t=>`<article class="card"><h3>${escapeHTML(t.title||"Conversation")}</h3><p>${escapeHTML(t.last_body||"No messages yet")}</p><div class="chat-card-actions"><button class="primary" data-open-thread="${escapeHTML(t.id)}">Open chat</button><button class="chat-delete" type="button" data-delete-thread="${escapeHTML(t.id)}" aria-label="Delete chat">Delete</button></div></article>`).join("");
  const mode=state.globalChatSection||'home';
  const hub=`<div class="global-chat-hub"><button type="button" class="global-chat-hub-panel" data-global-chat-section="direct"><span class="global-chat-hub-icon" aria-hidden="true">☕</span><strong>Global Direct Chats</strong><span>Private conversations with WIRED members</span><small>${directThreads.length} conversation${directThreads.length===1?'':'s'}</small></button><button type="button" class="global-chat-hub-panel" data-global-chat-section="groups"><span class="global-chat-hub-icon" aria-hidden="true">♧</span><strong>Global Group Chats</strong><span>Conversations with multiple members</span><small>${groupThreads.length} group${groupThreads.length===1?'':'s'}</small></button></div>`;
  const back=`<button type="button" class="ghost small" data-global-chat-section="home">← Back to Global Chats</button>`;
  const direct=`<section class="global-chat-section"><div class="section-head"><h2>Global Direct Chats</h2>${back}</div><div class="grid">${chatCards(directThreads)||'<div class="empty">No direct chats yet.</div>'}</div><div class="card form-card"><form id="dmForm"><label class="field">Start a direct message<input id="dmUsername" required placeholder="WIRED username"></label><button class="primary">Start chat</button></form></div></section>`;
  const groups=`<section class="global-chat-section"><div class="section-head"><h2>Global Group Chats</h2>${back}</div><div class="grid">${chatCards(groupThreads)||'<div class="empty">No global group chats yet.</div>'}</div><div class="card form-card"><form id="groupForm"><label class="field">Create a group chat<input id="groupUsernames" required placeholder="Enter usernames separated by commas"></label><p class="hint">Add at least two other WIRED members. A group chat supports up to 999 occupants, including you.</p><button class="primary">Create group chat</button></form></div></section>`;
  v.innerHTML=`<div class="section-head"><h2>Global Chats</h2></div>${state.user?(mode==='direct'?direct:mode==='groups'?groups:hub):'<div class="empty">Log in to use WIRED messages.</div>'}`;
 }
 if(state.page==="member-profile"){renderMemberProfile();return;}
  if(state.page==="profile-social"){renderProfileSocialPage();return;}
 if(state.page==="notifications"){renderNotifications();return;}
 if(state.page==="people"){renderPeople();return;}
 if(state.page==="profile"){
  const cover=state.profile?.cover_url||""; const avatar=state.profile?.avatar_url||"";
  v.innerHTML=`<div class="section-head"><h2>My profile</h2></div><section class="card profile-summary-card profile-unified-card ${state.profile?.equipped_theme_item_id?"equipped-profile-theme":""} ${equippedCosmeticClass(state.profile?.equipped_theme_item_id,"theme")} ${state.profile?.equipped_theme_item_id==="d703a32c-2257-4bb6-b18c-9f87d0fdc3a6"?"black-rose-theme":""}">${state.user&&cover?`<div class="profile-cover" style="background-image:url(&quot;${escapeHTML(cover)}&quot;)"></div>`:state.user?`<div class="profile-cover"></div>`:""}<div class="profile-unified-content"><div class="profile-person"><div class="profile-summary-avatar ${state.profile?.equipped_frame_item_id?"equipped-neon-frame":""} ${equippedCosmeticClass(state.profile?.equipped_frame_item_id,"frame")} ${state.profile?.equipped_frame_item_id==="22c45a25-ffa2-4757-8ab7-501e0eec90c4"?"black-rose-frame":""} ${state.profile?.equipped_frame_item_id==="1a48d530-1e6b-4bde-9c99-c242bda3990c"?"orange-fruit-frame":""}">${avatar?`<img src="${escapeHTML(avatar)}" alt="Your profile photo">`:"W"}</div><div><h3 class="${state.profile?.equipped_nameplate_item_id?"equipped-nameplate":""} ${equippedCosmeticClass(state.profile?.equipped_nameplate_item_id,"nameplate")} ${state.profile?.equipped_nameplate_item_id==="706278b4-ad29-432c-8b91-1bfb713899bf"?"black-rose-nameplate":""} ${state.profile?.equipped_nameplate_item_id==="8028d5a4-d964-45e8-8241-fb00c652a42a"?"orange-fruit-nameplate":""} ${state.profile?.equipped_theme_item_id?"equipped-violet-theme":""}">${state.user?escapeHTML(state.profile?.username||state.user.email):"Welcome to WIRED"} ${state.profile?.id_verified?`<span class="pill">✓ Verified</span>`:""}</h3>${state.user?relationshipSubtitleMarkup(state.activeRelationship,true):""}${state.user?"":'<p class="muted">Log in or create an account to set up your profile.</p>'}</div></div>${state.user?profileSocialMarkup():""}${state.user?myRelationshipMarkup():""}${state.user?'<div class="profile-companion-grid">':""}${state.user?profileYokaiMarkup(state.profile?.companion):""}${state.user?`<section class="profile-companion-switch"><label for="profileCompanionSelect">Display companion on profile</label><div class="profile-companion-switch-row"><select id="profileCompanionSelect"><option value="">No companion</option>${(state.userPets||[]).map(p=>`<option value="${escapeHTML(p.id)}" ${state.profile?.companion?.id===p.id?"selected":""}>${escapeHTML(p.nickname||p.pet_species?.name||"Yokai")} (${escapeHTML(p.pet_species?.name||"Yokai")})</option>`).join("")}</select><button class="primary" id="saveProfileCompanion" type="button">Switch companion</button></div></section>`:""}${state.user?"</div>":""}${state.user?'<section class="profile-about profile-about-own"><h2>About me</h2><p class="profile-about-text">'+escapeHTML(state.profile?.bio||"Tell the WIRED community a little about yourself.")+'</p><form id="bioForm" class="profile-bio-form"><label class="field">Biography / About me<textarea id="profileBio" maxlength="1000" rows="4" placeholder="Share your interests, hobbies, and a little about yourself…">'+escapeHTML(state.profile?.bio||"")+'</textarea></label><div class="profile-bio-footer"><span class="hint">Up to 1,000 characters. Visible on your public profile.</span><button class="primary" type="submit">Save biography</button></div></form></section>':''}${state.user?'<button class="primary" id="profileAuth" type="button">Log out</button>':'<div class="profile-auth-actions"><button class="primary" id="profileLogin" type="button">Log in</button><button class="ghost" id="profileSignup" type="button">Sign up</button></div>'}<div class="profile-status-pills"><span class="pill">18+ COMMUNITY</span><span class="pill">OPTIONAL ID VERIFICATION</span></div><p class="hint">A verified badge only appears after a trusted identity provider confirms verification. That provider is not connected yet.</p>${state.user?`<div class="profile-upload-row"><label class="profile-upload">Change profile photo<input id="wiredAvatarUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label class="profile-upload">Change cover image<input id="wiredCoverUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label></div>${profileCommentsMarkup(state.user.id,state.profileComments)}<div class="profile-account-settings"><button class="primary" id="editAccountBtn" type="button" aria-expanded="${state.editAccountOpen?"true":"false"}">${state.editAccountOpen?"Close account settings":"Edit account"}</button><div id="accountSettingsPanel" ${state.editAccountOpen?"":"hidden"}><div class="section-head"><h2>Account settings</h2></div><form id="usernameForm" class="settings-form"><label class="field">Username<input id="settingsUsername" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${escapeHTML(state.profile?.username||"")}" autocomplete="username"></label><button class="primary">Save username</button></form><form id="emailForm" class="settings-form"><label class="field">Email address<input id="settingsEmail" type="email" required value="${escapeHTML(state.user.email||"")}" autocomplete="email"></label><button class="primary">Update email</button><p class="hint">Supabase will send a confirmation email before the new address takes effect.</p></form><form id="passwordForm" class="settings-form"><label class="field">New password<input id="settingsPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><label class="field">Confirm new password<input id="settingsPasswordConfirm" type="password" required minlength="8" autocomplete="new-password" placeholder="Re-enter new password"></label><button class="primary">Change password</button></form><p class="status" id="settingsStatus" aria-live="polite"></p></div></div>`:""}</div></section>`;
  $("saveProfileCompanion")?.addEventListener("click",async()=>{const btn=$("saveProfileCompanion"),petId=$("profileCompanionSelect")?.value||null;btn.disabled=true;try{const {error:switchError}=await sb.rpc("set_my_profile_companion",{p_pet_id:petId});if(switchError)throw switchError;await loadProfile();const actualId=state.profile?.companion?.id||null;if(actualId!==petId)throw new Error("Companion change did not persist. Please try again.");toast(petId?"Profile companion updated.":"Companion removed from profile.");render();}catch(e){toast(errorText(e));btn.disabled=false;}});
  $("bioForm")?.addEventListener("submit",saveBiography);
  $("relationshipEndOwnBtn")?.addEventListener("click",()=>{if(state.activeRelationship)relationshipAction(state.activeRelationship.id,"ended")});
  v.querySelectorAll("[data-relationship-partner]").forEach(b=>b.addEventListener("click",()=>openMemberProfile(b.dataset.relationshipPartner)));
  v.querySelectorAll("[data-rel-accept]").forEach(b=>b.addEventListener("click",()=>relationshipAction(b.dataset.relAccept,"accepted")));
  v.querySelectorAll("[data-rel-decline]").forEach(b=>b.addEventListener("click",()=>relationshipAction(b.dataset.relDecline,"declined")));
  v.querySelectorAll("[data-rel-cancel]").forEach(b=>b.addEventListener("click",()=>relationshipAction(b.dataset.relCancel,"ended")));

  v.querySelectorAll("[data-social-open]").forEach(b=>b.addEventListener("click",()=>{state.profileSocialTab=b.dataset.socialOpen;state.page="profile-social";render();}));
  v.querySelectorAll("[data-social-person]").forEach(b=>b.addEventListener("click",()=>openMemberProfile(b.dataset.socialPerson)));
  $("wiredAvatarUpload")?.addEventListener("change",e=>uploadProfileImage(e,"avatar"));
  $("wiredCoverUpload")?.addEventListener("change",e=>uploadProfileImage(e,"cover"));
  attachProfileCommentHandlers(state.user.id);
 }
 v.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
 v.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));
 v.querySelectorAll("[data-join-community]").forEach(b=>b.addEventListener("click",()=>joinCommunity(b.dataset.joinCommunity)));
 v.querySelectorAll("[data-open-thread]").forEach(b=>b.addEventListener("click",()=>openThread(b.dataset.openThread)));
 v.querySelectorAll("[data-delete-thread]").forEach(b=>b.addEventListener("click",()=>deleteThread(b.dataset.deleteThread)));
 v.querySelectorAll("[data-discovery-mode]").forEach(button=>button.addEventListener("click",()=>{state.discoveryMode=button.dataset.discoveryMode;render();}));
 $("discoveryBack")?.addEventListener("click",()=>{state.discoveryMode="";render();});
 $("discoverPeopleSearch")?.addEventListener("input",e=>{state.discoverPeopleQuery=e.target.value;searchGlobalPeople(state.discoverPeopleQuery,"discover");});
 $("viewAllGlobalMembers")?.addEventListener("click",()=>{state.page="global-members";try{sessionStorage.setItem("wired:lastPage","global-members");}catch(e){}renderGlobalMemberDirectory();loadGlobalMemberDirectory(true);});
 $("communitySearch")?.addEventListener("input",e=>{state.discoveryQuery=e.target.value;renderDiscoveryResults()});
 $("communityCategory")?.addEventListener("change",e=>{state.discoveryCategory=e.target.value;renderDiscoveryResults()});
 $("communitySort")?.addEventListener("change",e=>{state.discoverySort=e.target.value;renderDiscoveryResults()});
 if(state.page==="discover"){renderDiscoveryResults();renderDiscoverPeople();}
 document.querySelectorAll('[data-global-chat-section]').forEach(button=>button.addEventListener('click',()=>{
  state.globalChatSection=button.dataset.globalChatSection;
  try{sessionStorage.setItem('wired:globalChatSection',state.globalChatSection);}catch(e){}
  render();
 }));
 $("communityForm")?.addEventListener("submit",createCommunity);$("cImage")?.addEventListener("change",previewImage);
 $("dmForm")?.addEventListener("submit",startDM);$("groupForm")?.addEventListener("submit",startGroupChat);
 $("profileAuth")?.addEventListener("click",()=>state.user?logout():openAuth()); $("profileLogin")?.addEventListener("click",()=>openAuth("login")); $("profileSignup")?.addEventListener("click",()=>openAuth("register"));
 $("editAccountBtn")?.addEventListener("click",()=>{state.editAccountOpen=!state.editAccountOpen;render()});
 $("usernameForm")?.addEventListener("submit",saveUsername);
 $("emailForm")?.addEventListener("submit",saveEmail);
 $("passwordForm")?.addEventListener("submit",savePassword);
}
let coverFile=null;
function previewImage(e){coverFile=e.target.files[0]||null;const img=$("coverPreview");if(!coverFile){img.style.display="none";return;}if(coverFile.size>5*1024*1024){toast("Please choose an image under 5 MB.");e.target.value="";coverFile=null;return;}const r=new FileReader();r.onload=()=>{img.src=r.result;img.style.display="block"};r.readAsDataURL(coverFile)}
async function createCommunity(e){
 e.preventDefault();if(!state.user){toast("Please log in before creating a community.");openAuth();return;}
 const item={name:$("cName").value.trim(),description:$("cDesc").value.trim(),rules:$("cRules").value.trim(),welcome_message:$("cWelcome").value.trim(),category:$("cCategory").value,visibility:document.querySelector('input[name="visibility"]:checked').value};
 try{
  let coverUrl=null;
  if(coverFile){const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"})[coverFile.type];if(!ext)throw new Error("Choose a JPG, PNG, WEBP, or GIF image.");const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await sb.storage.from("community-covers").upload(path,coverFile,{cacheControl:"3600",upsert:false,contentType:coverFile.type});if(uploadError)throw uploadError;coverUrl=sb.storage.from("community-covers").getPublicUrl(path).data.publicUrl;}
  await api("/communities","POST",{...item,cover_url:coverUrl});toast("Your community has been created!");coverFile=null;await loadCommunities();nav("discover");
 }catch(err){toast(errorText(err));}
}
async function joinCommunity(id){try{const result=await api(`/communities/${encodeURIComponent(id)}/join`,"POST",{});toast(result.pending?"Your join request has been sent.":"You joined the community.");await loadCommunities();if(state.page==="community"&&state.activeCommunity?.id===id){await openCommunity(id)}else{render()}}catch(e){toast(errorText(e))}}
async function doCommunityCheckin(){
 if(!state.activeCommunity||!state.activeCommunityRole)return;
 const button=$('communityCheckinBtn');if(button)button.disabled=true;
 try{
  const result=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/checkin','POST',{});
  state.communityCheckinState=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/checkin');
  toast('Check-in complete! You earned '+Number(result.checkin?.points||10)+' points.');
  renderCommunity();
 }catch(e){toast(errorText(e));if(button)button.disabled=false;}
}
async function openCommunityLeaderboard(){
 try{
  state.communityLeaderboard=(await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/leaderboard')).items||[];
  state.leaderboardOpen=true;renderCommunity();
 }catch(e){toast(errorText(e));}
}
const COMMUNITY_SECTIONS={
 latest:['Latest','Latest posts','Be the first to share something.'],
 featured:['Featured','Featured posts','Community staff can feature posts here.'],
 wiki:['Wikis','Community wikis','No wiki entries yet.'],
 activities:['Polls & Quizzes','Polls & quizzes','No polls or quizzes yet.'],
 saved:['Saved','Saved posts','Save a post to find it here later.'],
 guidelines:['Guidelines','Community guidelines',''],
 members:['Members','Community members',''],
 compose:['New post','Create a post',''],
 chats:['Chats','Community chats',''],
 notifications:['Notifications','Community notifications',''],
 profile:['My profile','Community profile','']
};
function isCommunitySection(id,section){
 return !!id&&state.page==='community'&&state.activeCommunity?.id===id&&state.communityTab===section&&!$('backChats')&&!$('closeLocalProfile');
}
function communityAccent(community){
 const color=community?.theme_color;
 return /^#[a-f0-9]{6}$/i.test(color||'')?color:'#a85be5';
}
function communityHeaderMarkup(community,joined,fallbackCount){
 const name=escapeHTML(community.name||'Community');
 const cover=community.cover_url?'<img class="wired-community-cover-art" src="'+escapeHTML(community.cover_url)+'" alt="" decoding="async">':'';
 const icon=community.icon_url?'<img class="wired-community-header-icon" src="'+escapeHTML(community.icon_url)+'" alt="">':'<span class="wired-community-header-icon wired-community-header-fallback" aria-hidden="true">W</span>';
 const count=Number(community.member_count??fallbackCount);
 const memberLabel=Number.isSafeInteger(count)&&count>=0?count.toLocaleString()+' '+(count===1?'member':'members'):'';
 const details=[community.category,memberLabel,community.visibility==='private'?'Private community':''].filter(Boolean).map(value=>escapeHTML(value)).join(' · ');
 return '<header class="wired-community-header'+(cover?' has-community-cover':'')+'">'+cover+
  '<div class="wired-community-header-glow" aria-hidden="true"></div><div class="wired-community-header-main">'+
  '<button type="button" class="wired-community-back" id="backDiscover" aria-label="Back to Discover">←</button>'+
  '<div class="wired-community-header-identity">'+icon+'<div class="wired-community-header-copy"><h1>'+name+'</h1>'+
  (details?'<span class="wired-community-header-subtitle">'+details+'</span>':'')+'</div></div>'+
  (joined?'<span class="wired-community-header-status">Joined</span>':'')+'</div></header>';
}
function communitySidebarMarkup(community){
 const manager=['owner','mod'].includes(state.activeCommunityRole);
 const sectionButton=key=>'<button type="button" data-community-destination="'+key+'" '+
  (state.communityTab===key&&!state.managerOpen?'aria-current="page"':'')+'>'+COMMUNITY_SECTIONS[key][0]+
  (key==='notifications'?'<span class="notification-count" data-community-unread hidden></span>':'')+'</button>';
 return '<div class="community-side-identity">'+(community.icon_url?
  '<img src="'+escapeHTML(community.icon_url)+'" alt="">':'<span aria-hidden="true">W</span>')+
  '<strong>'+escapeHTML(community.name||'Community')+'</strong></div>'+
  '<nav class="community-side-links" aria-label="Community navigation">'+
  (state.activeCommunityRole?
   '<div class="community-side-group">'+['latest','featured','wiki','activities','saved'].map(sectionButton).join('')+'</div>'+
   '<div class="community-side-group">'+['chats','notifications','members','guidelines','profile'].map(sectionButton).join('')+'</div>'+
   '<div class="community-side-group">'+sectionButton('compose')+
    (manager?'<button type="button" data-community-destination="manager" '+(state.managerOpen?'aria-current="page"':'')+'>Community Manager</button>':'')+'</div>':'')+
  '<div class="community-side-group"><button type="button" data-community-destination="discover">Browse communities</button><button type="button" data-community-destination="global">Back to WIRED</button></div></nav>';
}
function updateCommunitySidebar(){
 const workspace=$('communityWorkspace'),sidebar=$('communitySidebar'),trigger=$('communityMenuButton'),drawer=$('communityDrawer');
 if(!workspace||!sidebar||!trigger||!drawer)return;
 const community=state.page==='community'?state.activeCommunity:null;
 workspace.classList.toggle('community-workspace-active',!!community);
 sidebar.hidden=trigger.hidden=!community;
 workspace.style.setProperty('--community-accent',communityAccent(community));
 drawer.style.setProperty('--community-accent',communityAccent(community));
 if(!community){
  if($('communityMenu')?.open)$('communityMenu').close();
  sidebar.textContent=drawer.textContent='';
  return;
 }
 const html=communitySidebarMarkup(community);
 if(sidebar.dataset.markup!==html||!sidebar.firstChild){
  sidebar.dataset.markup=html;
  sidebar.innerHTML=drawer.innerHTML=html;
 }
 updateNotificationBell();
}
async function openCommunitySection(section){
 const cid=state.activeCommunity?.id;
 if(!cid)return;
 if(!state.activeCommunityRole)return;
 if(section==='manager'&&!['owner','mod'].includes(state.activeCommunityRole))return;
 if(state.activeThread){
  state.activeThread=null;
  if(state.realtimeChannel){void sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}
 }
 try{sessionStorage.removeItem('wired:lastCommunityProfile');}catch{}
 state.communityTab=section==='manager'?'latest':section;
 state.managerOpen=section==='manager';
 if(section==='profile'){
  updateCommunitySidebar();
  $('view').innerHTML='<p class="empty" role="status">Loading your community profile…</p>';
  window.scrollTo({top:0});
  const opened=await openCommunityMemberProfile(state.user.id,cid,()=>state.communityTab==='profile');
  if(opened===false&&state.page==='community'&&state.activeCommunity?.id===cid&&state.communityTab==='profile'){
   $('view').innerHTML='<div class="empty"><p>Could not load your community profile.</p><button class="ghost" type="button" id="retryCommunityProfile">Retry</button></div>';
   $('retryCommunityProfile').addEventListener('click',()=>openCommunitySection('profile'));
  }
  return;
 }
 renderCommunity();
 window.scrollTo({top:0});
 if(section==='chats'){
  await loadThreads();
  if(isCommunitySection(cid,'chats'))renderCommunityChatList(cid);
 }else if(section==='notifications'){
  try{
   await loadGlobalNotifications();
   if(isCommunitySection(cid,'notifications'))renderCommunityNotifications();
  }catch(error){toast(errorText(error));}
 }
}
function renderCommunityChatList(communityId){
 const host=$('communityChatList');
 if(!host)return;
 const threads=(state.threads||[]).filter(thread=>String(thread.community_id||thread.communityId||'')===String(communityId));
 host.innerHTML='<div class="section-head"><h2>Community chats</h2></div><button type="button" class="primary" id="openPublicCommunityChat">Open public chat</button>'+
  (threads.length?'<div class="community-chat-rows">'+threads.map(thread=>'<button type="button" class="ghost" data-community-thread="'+escapeHTML(thread.id)+'">'+escapeHTML(thread.title||'Community conversation')+'</button>').join('')+'</div>':'');
 host.querySelector('#openPublicCommunityChat').addEventListener('click',()=>openCommunityChat(communityId));
 host.querySelectorAll('[data-community-thread]').forEach(button=>button.addEventListener('click',()=>openThread(button.dataset.communityThread)));
}
function renderCommunityNotifications(){
 const host=$('communityNotificationList');
 if(host)renderNotifications(state.activeCommunity.id,host);
}
async function markCommunityNotificationsRead(communityId){
 if(!state.user)return;
 try{
  const {error}=await sb.from('community_notifications').update({read_at:new Date().toISOString()})
   .eq('recipient_id',state.user.id).eq('community_id',communityId).is('read_at',null);
  if(error)throw error;
  await loadGlobalNotifications();
  if(isCommunitySection(communityId,'notifications'))renderCommunityNotifications();
 }catch(error){toast(errorText(error));}
}
$('communityMenuButton').addEventListener('click',()=>{
 const dialog=$('communityMenu');
 dialog.showModal();
 $('communityMenuButton').setAttribute('aria-expanded','true');
});
$('communityMenu').addEventListener('close',()=>$('communityMenuButton').setAttribute('aria-expanded','false'));
$('communityMenu').addEventListener('click',event=>{if(event.target===$('communityMenu'))$('communityMenu').close();});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-community-destination]');
 if(!button)return;
 if($('communityMenu')?.open)$('communityMenu').close();
 const destination=button.dataset.communityDestination;
 if(destination==='global'){goGlobalHome();return;}
 if(destination==='discover'){nav('discover');return;}
 openCommunitySection(destination).catch(error=>toast(errorText(error)));
});
function communityFeedPosts(tab,posts,collections){
 const sorted=posts.slice().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 if(tab==='featured'||tab==='saved'){
  const order=collections[tab];
  return sorted.filter(post=>order.has(post.id)).sort((a,b)=>Date.parse(order.get(b.id))-Date.parse(order.get(a.id)));
 }
 if(tab==='wiki')return sorted.filter(post=>(post.kind||post.post_type||post.type)==='wiki');
 if(tab==='activities')return sorted.filter(post=>['poll','quiz'].includes(post.kind));
 return sorted;
}
async function loadCommunityPostCollections(communityId){
 const [featured,saved]=await Promise.all([
  sb.from('community_featured_posts').select('post_id,featured_at,posts!inner(community_id)').eq('posts.community_id',communityId).order('featured_at',{ascending:false}),
  sb.from('community_saved_posts').select('post_id,saved_at,posts!inner(community_id)').eq('posts.community_id',communityId).order('saved_at',{ascending:false})
 ]);
 return {
  featured:new Map((featured.data||[]).map(row=>[row.post_id,row.featured_at])),
  saved:new Map((saved.data||[]).map(row=>[row.post_id,row.saved_at])),
  error:featured.error||saved.error
 };
}
async function toggleCommunityPostCollection(button){
 const type=button.dataset.postCollection,postId=button.dataset.postId;
 const communityId=state.activeCommunity?.id;
 const collection=state.communityPostCollections[type];
 const table=type==='featured'?'community_featured_posts':'community_saved_posts';
 button.disabled=true;
 try{
  const result=collection.has(postId)?await sb.from(table).delete().eq('post_id',postId):
   await sb.from(table).insert({post_id:postId});
  if(result.error&&result.error.code!=='23505')throw result.error;
  const updated=await loadCommunityPostCollections(communityId);
  if(updated.error)throw updated.error;
  if(state.page==='community'&&state.activeCommunity?.id===communityId){
   state.communityPostCollections=updated;
   if(state.communityTab!=='compose'&&!state.managerOpen&&!sessionStorage.getItem('wired:lastCommunityProfile'))renderCommunity();
  }
 }catch(error){toast(errorText(error));}
 finally{button.disabled=false;}
}
async function openCommunity(id,section='latest'){
 try{
  const c=state.communities.find(x=>x.id===id)||{id,name:'Community'};state.activeCommunity=c;state.page='community';updateCommunityNavigation();try{sessionStorage.setItem('wired:lastPage','community');sessionStorage.setItem('wired:lastCommunity',id);}catch(e){}state.activeCommunityRole=null;state.joinRequests=[];state.managerOpen=false;
  state.communityTab=section!=='profile'&&Object.prototype.hasOwnProperty.call(COMMUNITY_SECTIONS,section)?section:'latest';
  state.communityPostCollections={featured:new Map(),saved:new Map(),loading:true,error:null};
  state.communityFeedError=null;
  state.posts=[];
  state.moderationMembers=[];
  state.moderationWarnings=[];
  state.moderationReports=[];
  state.moderationActions=[];
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  const role=await api('/communities/'+encodeURIComponent(id)+'/role');state.activeCommunityRole=role.role||((c.owner_id&&state.user?.id===c.owner_id)?'owner':null);state.communityCheckinState={checked_in_today:false,points:0,streak:0};state.communityLeaderboard=[];state.leaderboardOpen=false;await loadCommunityRankTitles(id);if(state.activeCommunityRole){try{state.communityCheckinState=await api('/communities/'+encodeURIComponent(id)+'/checkin');}catch(checkinError){console.warn('Community check-in status unavailable',checkinError);}}
  const isCurrent=()=>state.page==='community'&&state.activeCommunity===c&&state.communityPostCollections===collections;
  const collections=state.communityPostCollections;
  if(state.activeCommunityRole){
   try{
    const result=await api('/communities/'+encodeURIComponent(id)+'/posts');
    if(!isCurrent())return;
    state.posts=result.items||[];
   }catch(error){
    if(!isCurrent())return;
    state.communityFeedError=error;
   }
  }
  renderCommunity();
  if(!state.activeCommunityRole)return;
  void loadCommunityPostCollections(id).catch(error=>({...collections,error})).then(result=>{
   if(!isCurrent())return;
   Object.assign(collections,result,{loading:false});
   if(!['compose','profile'].includes(state.communityTab)&&!state.managerOpen&&!$('closeLocalProfile')&&!$('backChats'))renderCommunity();
  });
  try{
  if(state.activeCommunityRole){if(['owner','mod'].includes(state.activeCommunityRole)){const q=await api('/communities/'+encodeURIComponent(id)+'/requests');state.joinRequests=q.items||[];await loadModerationData(id);}else{const {data:members,error:membersError}=await sb.from('community_members').select('user_id,role,banned,banned_until,profiles(username,avatar_url)').eq('community_id',id).order('joined_at',{ascending:true});if(membersError)throw membersError;state.moderationMembers=(members||[]).map(m=>({user_id:m.user_id,role:m.role,banned:!!m.banned&&(!m.banned_until||new Date(m.banned_until)>new Date()),username:m.profiles?.username||'WIRED member',avatar_url:m.profiles?.avatar_url||null}));const {data:warnings,error}=await sb.from('moderation_warnings').select('id,reason,created_at').eq('community_id',id).eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(20);if(error)throw error;state.moderationWarnings=warnings||[];}}
  }catch(error){console.warn('Community member tools unavailable',error);}
  if(!isCurrent())return;
  if(state.activeCommunityRole&&state.moderationMembers.length){
   try{
    const {data:locals,error:localError}=await sb.from('community_profiles').select('user_id,nickname,avatar_url').eq('community_id',id);
    if(localError)throw localError;
    const byId=new Map((locals||[]).map(p=>[p.user_id,p]));
    state.moderationMembers=state.moderationMembers.map(m=>{
     const local=byId.get(m.user_id);
     return {...m,username:local?.nickname||m.username,avatar_url:local?.avatar_url||m.avatar_url};
    });
   }catch(profileError){console.warn('Community identities unavailable',profileError);}
  }
  await loadCommunityMemberLevels(id);
  if(isCurrent()&&!['compose','profile'].includes(state.communityTab)&&!$('closeLocalProfile')&&!$('backChats'))renderCommunity();
 }catch(e){toast(errorText(e));}
}
function renderPostCard(p){
 const options=Array.isArray(p.metadata?.options)?p.metadata.options:[],votes=(p.vote_counts||[]),total=votes.reduce((a,n)=>a+n,0);
 const mediaUrls=Array.isArray(p.metadata?.media_urls)?p.metadata.media_urls:(p.metadata?.media_url?[p.metadata.media_url]:[]);
 const media=mediaUrls.map((url,i)=>'<img class="post-media" src="'+escapeHTML(url)+'" alt="Post image '+(i+1)+'" loading="lazy">').join('');
 let interactive='';
 if(p.kind==='poll'){
  interactive='<div class="poll-options">'+options.map((o,i)=>{const n=votes[i]||0,percent=total?Math.round(n/total*100):0;return '<button class="poll-option '+(p.my_vote===i?'selected':'')+'" data-vote-post="'+escapeHTML(p.id)+'" data-vote-option="'+i+'"><span>'+escapeHTML(o)+'</span><span class="poll-result">'+n+' · '+percent+'%</span><span class="poll-bar" style="width:'+percent+'%"></span></button>';}).join('')+'</div><p class="hint">'+(p.my_vote===null?'Vote to see community results':'Your vote is recorded · '+total+' vote(s)')+'</p>';
 }else if(p.kind==='quiz'&&Array.isArray(p.metadata?.questions)){
  const questions=p.metadata.questions,result=state.quizResults?.[p.id];
  if(result){
   const rows=questions.map((q,i)=>{const r=result.results?.[i]||{},correctText=q.options?.[r.correct_index]||'Unavailable';return '<article class="quiz-result-question"><b>'+(i+1)+'. '+escapeHTML(q.prompt)+'</b><p class="'+(r.correct?'quiz-answer-correct':'quiz-answer-wrong')+'">'+(r.correct?'✓ Correct':'✕ Incorrect')+' · Correct answer: '+escapeHTML(correctText)+'</p></article>';}).join('');
   interactive='<section class="quiz-results"><div class="quiz-score"><span>YOUR SCORE</span><strong>'+Number(result.score)+' / '+Number(result.total)+'</strong><small>'+Math.round(Number(result.score)/Math.max(1,Number(result.total))*100)+'% correct</small></div>'+rows+'<button type="button" class="ghost small" data-quiz-retake="'+escapeHTML(p.id)+'">Retake quiz</button></section>';
  }else{
   interactive='<form class="quiz-run-form" data-quiz-submit="'+escapeHTML(p.id)+'"><ol class="quiz-run-questions">'+questions.map((q,i)=>'<li class="quiz-run-question"><b>'+escapeHTML(q.prompt)+'</b><div class="quiz-run-options">'+(q.options||[]).map((option,j)=>'<label class="quiz-run-option"><input type="radio" name="quiz-answer-'+i+'" value="'+j+'" required><span>'+escapeHTML(option)+'</span></label>').join('')+'</div></li>').join('')+'</ol><button class="primary" type="submit">Submit quiz</button></form>';
  }
 }else if(p.kind==='quiz'){
  interactive='<div class="poll-options">'+options.map((o,i)=>'<button class="poll-option '+(p.my_vote===i?'selected':'')+'" data-vote-post="'+escapeHTML(p.id)+'" data-vote-option="'+i+'"><span>'+escapeHTML(o)+'</span></button>').join('')+'</div><p class="hint">Legacy quiz · choose an answer</p>';
 }
 const icons={like:'👍',love:'❤️',laugh:'😂',wow:'😮',support:'🤝'};
 const reactions=Object.keys(icons).map(r=>'<button type="button" aria-label="React '+r+'" class="reaction '+(p.my_reactions?.includes(r)?'selected':'')+'" data-react-post="'+escapeHTML(p.id)+'" data-reaction="'+r+'">'+icons[r]+' '+(p.reaction_counts?.[r]||0)+'</button>').join('');
 const comments=(p.comments||[]).map(z=>'<div class="comment"><b>'+escapeHTML(z.username||'WIRED member')+'</b><p>'+escapeHTML(z.body)+'</p></div>').join('');
 const collections=state.communityPostCollections;
 const actions=collections&&!collections.loading&&!collections.error?'<div class="community-post-actions">'+
  '<button type="button" class="ghost small" data-post-collection="saved" data-post-id="'+escapeHTML(p.id)+'" aria-pressed="'+collections.saved.has(p.id)+'">'+(collections.saved.has(p.id)?'Unsave':'Save post')+'</button>'+
  (['owner','mod'].includes(state.activeCommunityRole)?
   '<button type="button" class="ghost small" data-post-collection="featured" data-post-id="'+escapeHTML(p.id)+'" aria-pressed="'+collections.featured.has(p.id)+'">'+(collections.featured.has(p.id)?'Remove from Featured':'Feature post')+'</button>':'')+'</div>':'';
 return '<article class="card post" data-community-post="'+escapeHTML(p.id)+'"><div class="meta"><span class="pill">' +escapeHTML(p.kind||'blog')+'</span> '+escapeHTML(p.username||'WIRED member')+' '+(p.id_verified?'✓ Verified':'')+' · '+new Date(p.created_at).toLocaleString()+'</div><h3>'+escapeHTML(p.title||'Post')+'</h3>'+(p.body?'<p>'+escapeHTML(p.body)+'</p>':'')+media+interactive+'<div class="post-reactions">'+reactions+'</div>'+actions+'<div class="comments"><h4>Comments ('+(p.comments||[]).length+')</h4>'+comments+'<form class="comment-form" data-comment-form="'+escapeHTML(p.id)+'"><input name="comment" required maxlength="4000" placeholder="Write a comment…"><button class="primary small">Send</button></form></div></article>';
}
function renderCommunity(){
 updateCommunitySidebar();
 const globalHero=document.querySelector('#app > .hero');if(globalHero)globalHero.hidden=true;
 const c=state.activeCommunity,v=$('view'),joined=!!state.activeCommunityRole,manager=['owner','mod'].includes(state.activeCommunityRole);
 const activeTab=joined?state.communityTab||'latest':'latest';
 let html='';

 if(state.leaderboardOpen){html+='<section class="card community-leaderboard-panel"><div class="section-head"><h2>Community leaderboard</h2><button type="button" class="ghost small" id="closeCommunityLeaderboard">Close</button></div>'+(state.communityLeaderboard.length?state.communityLeaderboard.map((m,i)=>'<div class="moderation-row"><b>#'+(i+1)+' '+escapeHTML(m.username)+'</b><span>'+communityLevelBadge({communityPoints:m.points})+' · '+Number(m.points)+' XP · '+Number(m.checkins)+' check-ins</span></div>').join(''):'<p class="hint">No check-ins yet. Be the first on the leaderboard!</p>')+'</section>';}
 if(!joined&&c.rules)html+='<article class="card"><h3>Community rules</h3><p>'+escapeHTML(c.rules)+'</p></article>';
 if(joined&&!state.managerOpen&&activeTab==='latest'&&c.welcome_message)html+='<article class="card"><h3>Welcome</h3><p>'+escapeHTML(c.welcome_message)+'</p></article>';
 if(joined&&!state.managerOpen&&activeTab==='compose'){html+='<div class="card form-card"><div class="section-head"><h3>Create a post</h3><span class="pill">Share with members</span></div><form id="postForm"><label class="field">Post format<select id="postType"><option value="blog">Blog / text post</option><option value="image">Image post</option><option value="question">Question</option><option value="poll">Poll</option><option value="quiz">Quiz</option><option value="story">Story</option><option value="wiki">Wiki entry</option></select></label><label class="field">Title<input id="postTitle" required maxlength="120" placeholder="Give your post a title"></label><label class="field">Content<textarea id="postBody" maxlength="10000" placeholder="Share with your community"></textarea></label><div id="pollFields" hidden><label class="field">Poll options (one per line)<textarea id="pollOptions" rows="4" placeholder="Option one&#10;Option two&#10;Option three"></textarea></label></div><div id="quizFields" hidden><div class="quiz-builder-intro"><b>Build a multi-question quiz</b><p class="hint">Add up to 20 questions, each with 2–6 answers. Correct answers stay private until a member submits.</p></div><div id="quizQuestionBuilder"></div><button type="button" class="ghost small" id="addQuizQuestion">＋ Add question</button></div><div id="postImageWrap"><label class="field">Add images (optional)<input id="postImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><p class="hint">Attach up to 5 images · JPG, PNG, WEBP, or GIF · up to 10 MB each</p><div id="postImagePreview" class="post-image-preview"></div></div><button class="primary">Publish to community</button></form></div>';}
 else if(!joined&&c.join_request_status==='pending')html+='<div class="empty">Your request to join is waiting for approval.</div>';
 else if(!joined)html+='<button class="primary" id="joinFromCommunity">'+(c.visibility==='private'?'Request to join':'Join this community')+'</button>';
 if(manager){
  if(state.managerOpen){
   html+='<section class="manager-panel"><div class="manager-heading"><div><span class="eyebrow">WIRED COMMUNITY TOOLS</span><h2>Community Manager</h2><p class="muted">Manage the look, identity, and settings of your community.</p></div><button class="ghost" id="closeCommunityManager">Back to community</button></div><div class="manager-grid"><article class="manager-tile"><span class="manager-icon">✦</span><b>Appearance</b><small>Theme color and community identity</small></article><article class="manager-tile"><span class="manager-icon">☷</span><b>Community details</b><small>Description, category, rules and welcome</small></article><article class="manager-tile"><span class="manager-icon">⌖</span><b>Discovery</b><small>Visibility in WIRED Discovery</small></article><article class="manager-tile"><span class="manager-icon">♙</span><b>Moderation</b><small>Review member requests below</small></article></div><form id="managerSettingsForm" class="manager-settings"><div class="section-head"><h3>Community settings</h3><span class="pill">'+escapeHTML(state.activeCommunityRole)+'</span></div><label class="field">Community name<input value="'+escapeHTML(c.name||'')+'" disabled aria-describedby="managerNameHint"></label><p class="hint" id="managerNameHint">Community renaming will be added in a later manager update.</p><label class="field">Community icon<input id="managerIconFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label class="field">Community cover image<input id="managerCoverFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p class="hint">Upload a JPG, PNG, WEBP, or GIF (up to 10 MB). Leave blank to keep the current image.</p><label class="field">Description<textarea id="managerDescription" maxlength="500">'+escapeHTML(c.description||'')+'</textarea></label><label class="field">Category<input id="managerCategory" maxlength="40" value="'+escapeHTML(c.category||'')+'"></label><label class="field">Community rules<textarea id="managerRules" maxlength="3000">'+escapeHTML(c.rules||'')+'</textarea></label><label class="field">Welcome message<textarea id="managerWelcome" maxlength="1000">'+escapeHTML(c.welcome_message||'')+'</textarea></label><label class="field manager-color-field">Community accent color<input id="managerThemeColor" type="color" value="'+(/^#[0-9a-fA-F]{6}$/.test(c.theme_color||'')?c.theme_color:'#8b5cf6')+'"></label><label class="field">Community visibility<select id="managerVisibility"><option value="public" '+(c.visibility==='public'?'selected':'')+'>Public</option><option value="private" '+(c.visibility==='private'?'selected':'')+'>Private</option></select></label><label class="manager-check"><input id="managerDiscoverable" type="checkbox" '+(c.discoverable!==false?'checked':'')+'> Show this community in Discovery</label><button class="primary">Save community settings</button><p class="hint" id="managerSettingsStatus" aria-live="polite"></p></form></section>';
  }
  if(state.managerOpen){
   html+='<section class="card"><div class="section-head"><h3>Community rank titles</h3></div><p class="hint">Rename each level range to fit your community theme. Levels and XP requirements stay the same.</p><form id="communityRankForm" class="manager-settings">'+COMMUNITY_RANKS.map(rank=>'<label class="field">Levels '+rank.min+'–'+(COMMUNITY_RANKS.find(next=>next.min>rank.min)?.min-1||99)+'<input id="communityRankTitle'+rank.min+'" maxlength="32" required value="'+escapeHTML(state.communityRankTitles?.[rank.min]||rank.name)+'"></label>').join('')+'<div class="card-actions"><button type="submit" class="primary">Save rank titles</button><button type="button" class="ghost" id="resetCommunityRanks">Restore defaults</button></div></form></section>';
  }
  if(state.managerOpen){html+='<div class="section-head"><h2>Join requests ('+state.joinRequests.length+')</h2></div>';if(state.joinRequests.length){html+=state.joinRequests.map(r=>'<article class="card"><b>'+escapeHTML(r.username||'WIRED member')+'</b><p class="muted">Requested '+new Date(r.created_at).toLocaleDateString()+'</p><div class="card-actions"><button class="primary small" data-approve-request="'+escapeHTML(r.id)+'">Approve</button><button class="ghost" data-decline-request="'+escapeHTML(r.id)+'">Decline</button></div></article>').join('');}else html+='<div class="empty">No pending join requests.</div>';}
 }
 if(manager&&state.managerOpen){
  html+='<section class="manager-panel moderation-panel"><div class="manager-heading"><div><span class="eyebrow">COMMUNITY SAFETY</span><h2>Moderation tools</h2><p class="muted">Manage members, review reports, and remove posts that break your rules.</p></div></div>';
  html+='<div class="section-head"><h3>Members ('+state.moderationMembers.length+')</h3></div>';
  html+=state.moderationMembers.map(m=>'<article class="moderation-row"><div class="member-identity">'+communityAvatarWithBadge(m.avatar_url,m)+'<button class="profile-member-link" type="button" data-profile-id="'+escapeHTML(m.user_id)+'">'+escapeHTML(m.username||'WIRED member')+'</button>'+communityLevelBadge(m)+'<p class="hint">'+escapeHTML(m.role||'member')+(m.banned?' · Banned':'')+'</p></div><div class="card-actions">'+(m.role!=='owner'?'<button class="ghost small" data-member-role="'+escapeHTML(m.user_id)+'" data-next-role="'+(m.role==='mod'?'member':'mod')+'">'+(m.role==='mod'?'Remove moderator':'Make moderator')+'</button><button class="ghost small" data-member-ban="'+escapeHTML(m.user_id)+'" data-banned="'+(m.banned?'true':'false')+'">'+(m.banned?'Unban':'Temporary / permanent ban')+'</button><button class="ghost small" data-member-warning="'+escapeHTML(m.user_id)+'">Issue warning</button>':'<span class="pill">Owner</span>')+'</div></article>').join('')||'<div class="empty">No members found.</div>';
  html+='<div class="section-head"><h3>Open reports ('+state.moderationReports.length+')</h3></div>';
  html+=state.moderationReports.map(r=>'<article class="moderation-row"><div><b>'+escapeHTML(r.reason||'Reported content')+'</b><p class="hint">Post · '+escapeHTML(r.target_id)+'</p></div><div class="card-actions"><button class="ghost small" data-report-resolve="'+escapeHTML(r.id)+'">Resolve</button><button class="primary small" data-report-remove="'+escapeHTML(r.id)+'" data-report-post="'+escapeHTML(r.target_id)+'">Remove post</button></div></article>').join('')||'<div class="empty">No open reports for this community.</div>';
  html+='<div class="section-head"><h3>Community posts · moderation</h3></div>';
  html+=state.posts.map(p=>'<article class="moderation-row"><div><b>'+escapeHTML(p.title||'Post')+'</b><p class="hint">By '+escapeHTML(p.username||'WIRED member')+'</p></div><button class="ghost small" data-moderate-remove-post="'+escapeHTML(p.id)+'">Remove post</button></article>').join('')||'<div class="empty">No posts to moderate.</div>';
  html+='<div class="section-head"><h3>Moderator activity log</h3></div>';html+=state.moderationActions.map(a=>'<article class="moderation-row"><div><b>'+escapeHTML(a.action.replaceAll('_',' '))+'</b><p class="hint">'+new Date(a.created_at).toLocaleString()+'</p><p class="hint">'+escapeHTML(a.details||'')+'</p></div></article>').join('')||'<div class="empty">No moderation activity yet.</div>';html+='<div class="section-head"><h3>Member warnings</h3></div>';html+=state.moderationWarnings.map(w=>'<article class="moderation-row"><div><b>Warning</b><p class="hint">'+escapeHTML(w.reason)+' · '+new Date(w.created_at).toLocaleString()+'</p></div></article>').join('')||'<div class="empty">No warnings issued.</div>';html+='</section>';
 }
 if(joined&&activeTab==='latest'&&state.moderationWarnings.length&&!manager){html+='<div class="section-head"><h2>Your community warnings</h2></div>';html+=state.moderationWarnings.map(w=>'<article class="moderation-row"><div><b>Moderator warning</b><p class="hint">'+escapeHTML(w.reason)+' · '+new Date(w.created_at).toLocaleString()+'</p></div></article>').join('');}
 if(joined&&!state.managerOpen&&activeTab==='latest'){
  const checkedIn=state.communityCheckinState?.checked_in_today;
  html+='<div class="community-post-actions"><button type="button" class="ghost small" id="communityCheckinBtn" '+(checkedIn?'disabled':'')+'>'+(checkedIn?'Checked in today':'Daily check-in')+'</button><button type="button" class="ghost small" id="communityLeaderboardBtn">Leaderboard</button></div>';
 }
 if(joined&&!state.managerOpen&&['latest','featured','wiki','activities','saved'].includes(activeTab)){
  const [,title,empty]=COMMUNITY_SECTIONS[activeTab];
  const collections=state.communityPostCollections;
  const posts=communityFeedPosts(activeTab,state.posts,collections);
  html+='<div class="wired-feed-heading"><h2>'+title+'</h2></div>';
  const collectionFeed=['saved','featured'].includes(activeTab);
  if(state.communityFeedError||collectionFeed&&collections.error){
   html+='<div class="empty"><p>Could not load this feed.</p><button type="button" class="ghost" id="retryCommunityFeed">Retry</button></div>';
  }else if(collectionFeed&&collections.loading){
   html+='<p class="empty" role="status">Loading posts…</p>';
  }else{
   html+=posts.map(renderPostCard).join('')||'<div class="empty">'+empty+'</div>';
  }
 }
 if(joined&&!state.managerOpen&&activeTab==='guidelines'){
  html+='<section class="wired-guidelines"><h2>Community guidelines</h2><p>'+escapeHTML(c.rules||'Be respectful, stay on topic, and help keep this community welcoming for everyone.')+'</p></section>';
 }
 const memberDirectory=joined&&activeTab==='members'&&!state.managerOpen?'<section class="community-directory"><section class="member-sidebar-card"><div class="member-sidebar-heading"><h3>Members</h3><span class="pill">'+state.moderationMembers.length+'</span></div><div class="member-sidebar-list">'+(state.moderationMembers.map(m=>'<button class="member-sidebar-item" type="button" data-profile-id="'+escapeHTML(m.user_id)+'">'+communityAvatarWithBadge(m.avatar_url,m)+'<span class="member-sidebar-name">'+escapeHTML(m.username||'WIRED member')+communityLevelBadge(m)+'<small>'+escapeHTML(m.role==='mod'?'Moderator':m.role==='owner'?'Owner':'Member')+(m.banned?' · Banned':'')+'</small></span></button>').join('')||'<p class="hint">No members yet.</p>')+'</div></section></section>':'';
 const communityHeader=communityHeaderMarkup(c,joined,state.moderationMembers.length);
 if(joined&&!state.managerOpen&&activeTab==='chats')html+='<section id="communityChatList"></section>';
 if(joined&&!state.managerOpen&&activeTab==='notifications')html+='<section id="communityNotificationList"></section>';
 v.innerHTML=communityHeader+'<div class="community-main">'+html+memberDirectory+'</div>';
 if($('communityChatList'))renderCommunityChatList(c.id);
 if($('communityNotificationList'))renderCommunityNotifications();
 $('retryCommunityFeed')?.addEventListener('click',()=>openCommunity(c.id,state.communityTab));
 v.querySelectorAll('[data-post-collection]').forEach(button=>button.addEventListener('click',()=>toggleCommunityPostCollection(button)));
 $('communityTabChat')?.addEventListener('click',()=>openCommunityChat(c.id));
 $('communityCheckinBtn')?.addEventListener('click',doCommunityCheckin);
 $('communityLeaderboardBtn')?.addEventListener('click',openCommunityLeaderboard);
 $('closeCommunityLeaderboard')?.addEventListener('click',()=>{state.leaderboardOpen=false;renderCommunity()});
 $('backDiscover')?.addEventListener('click',()=>nav('discover'));$('closeCommunityManager')?.addEventListener('click',()=>{state.managerOpen=false;renderCommunity()});$('managerSettingsForm')?.addEventListener('submit',saveCommunitySettings);$('communityRankForm')?.addEventListener('submit',saveCommunityRankTitles);$('resetCommunityRanks')?.addEventListener('click',resetCommunityRankTitles);$('joinFromCommunity')?.addEventListener('click',()=>joinCommunity(c.id));$('communityChatBtn')?.addEventListener('click',()=>openCommunityChat(c.id));$('postForm')?.addEventListener('submit',createPost);
 $('postType')?.addEventListener('change',updatePostComposer);$('pollOptions')?.addEventListener('input',()=>{});$('addQuizQuestion')?.addEventListener('click',addQuizQuestion);$('quizQuestionBuilder')?.addEventListener('input',e=>{if(e.target.matches('[data-quiz-options]'))updateQuizQuestionOptions(e.target.closest('[data-quiz-question]'));});$('quizQuestionBuilder')?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-quiz-question]');if(!b)return;const host=$('quizQuestionBuilder');b.closest('[data-quiz-question]')?.remove();Array.from(host.querySelectorAll('[data-quiz-question]')).forEach((card,i)=>{const heading=card.querySelector('.quiz-question-editor-head b');if(heading)heading.textContent='Question '+(i+1);});});$('postImage')?.addEventListener('change',e=>{const host=$('postImagePreview');if(!host)return;const files=Array.from(e.target.files||[]);host.innerHTML=files.slice(0,5).map(f=>'<span>'+escapeHTML(f.name)+'</span>').join(' · ');});updatePostComposer();
 v.querySelectorAll('[data-vote-post]').forEach(b=>b.addEventListener('click',()=>voteOnPost(b.dataset.votePost,Number(b.dataset.voteOption))));v.querySelectorAll('[data-quiz-submit]').forEach(form=>form.addEventListener('submit',e=>submitQuiz(e,form.dataset.quizSubmit)));v.querySelectorAll('[data-quiz-retake]').forEach(b=>b.addEventListener('click',()=>{delete state.quizResults[b.dataset.quizRetake];renderCommunity();}));
 loadCommunityLocalProfile();
 v.querySelectorAll('[data-react-post]').forEach(b=>b.addEventListener('click',()=>togglePostReaction(b.dataset.reactPost,b.dataset.reaction)));
 v.querySelectorAll('[data-comment-form]').forEach(form=>form.addEventListener('submit',e=>submitPostComment(e,form.dataset.commentForm)));
 v.querySelector('#openMyCommunityProfile')?.addEventListener('click',()=>openCommunityMemberProfile(state.user.id));
 v.querySelectorAll('[data-profile-id]').forEach(b=>b.addEventListener('click',()=>openCommunityMemberProfile(b.dataset.profileId)));
 v.querySelectorAll('[data-member-role]').forEach(b=>b.addEventListener('click',()=>setMemberRole(b.dataset.memberRole,b.dataset.nextRole)));
 v.querySelectorAll('[data-member-ban]').forEach(b=>b.addEventListener('click',()=>setMemberBanned(b.dataset.memberBan,b.dataset.banned!=='true')));v.querySelectorAll('[data-member-warning]').forEach(b=>b.addEventListener('click',async()=>{const reason=await wiredDialog('Enter the reason for this member warning:',{input:true,danger:false});if(reason?.trim())try{await issueMemberWarning(b.dataset.memberWarning,reason.trim())}catch(e){toast(errorText(e))}}));
 v.querySelectorAll('[data-report-resolve]').forEach(b=>b.addEventListener('click',()=>resolveCommunityReport(b.dataset.reportResolve)));
 v.querySelectorAll('[data-report-remove]').forEach(b=>b.addEventListener('click',()=>removeReportedPost(b.dataset.reportRemove,b.dataset.reportPost)));
 v.querySelectorAll('[data-moderate-remove-post]').forEach(b=>b.addEventListener('click',()=>moderateRemovePost(b.dataset.moderateRemovePost)));
 v.querySelectorAll('[data-approve-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.approveRequest,'approved')));
 v.querySelectorAll('[data-decline-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.declineRequest,'declined')));
}
async function loadModerationData(communityId,isCurrent=()=>state.activeCommunity?.id===communityId){
 const {data:members,error:memberError}=await sb.from('community_members').select('user_id,role,banned,banned_until,profiles(username,avatar_url)').eq('community_id',communityId).order('joined_at',{ascending:true});
 if(memberError)throw memberError;
 if(!isCurrent())return;
 state.moderationMembers=(members||[]).map(m=>({user_id:m.user_id,role:m.role,banned:!!m.banned&&(!m.banned_until||new Date(m.banned_until)>new Date()),banned_until:m.banned_until,username:m.profiles?.username||'WIRED member',avatar_url:m.profiles?.avatar_url||null}));const [warnings,actions]=await Promise.all([sb.from('moderation_warnings').select('id,user_id,reason,created_at').eq('community_id',communityId).order('created_at',{ascending:false}).limit(30),sb.from('moderation_actions').select('id,actor_id,target_user_id,action,details,created_at').eq('community_id',communityId).order('created_at',{ascending:false}).limit(40)]);if(warnings.error)throw warnings.error;if(actions.error)throw actions.error;if(!isCurrent())return;state.moderationWarnings=warnings.data||[];state.moderationActions=actions.data||[];
 const postIds=(state.posts||[]).map(p=>p.id);
 if(!postIds.length){state.moderationReports=[];return;}
 const {data:reports,error:reportError}=await sb.from('reports').select('id,target_id,reason,status,created_at').eq('target_type','post').eq('status','open').in('target_id',postIds.map(String));
 if(reportError)throw reportError;
 if(isCurrent())state.moderationReports=reports||[];
}
async function logModerationAction(action,targetUserId=null,details=''){const {error}=await sb.from('moderation_actions').insert({community_id:state.activeCommunity.id,actor_id:state.user.id,target_user_id:targetUserId,action,details});if(error)throw error;}async function issueMemberWarning(userId,reason){const {error}=await sb.from('moderation_warnings').insert({community_id:state.activeCommunity.id,user_id:userId,moderator_id:state.user.id,reason});if(error)throw error;await logModerationAction('issue_warning',userId,reason);toast('Warning issued.');await openCommunity(state.activeCommunity.id);}async function setMemberRole(userId,role){
 const cid=state.activeCommunity?.id;
 const button=Array.from(document.querySelectorAll('[data-member-role]')).find(b=>b.dataset.memberRole===userId);
 if(button)button.disabled=true;
 try{
  const {data,error}=await sb.from('community_members').update({role}).eq('community_id',cid).eq('user_id',userId).select('user_id,role').maybeSingle();
  if(error)throw error;
  if(!data||data.role!==role)throw new Error('Moderator change was not saved. Check your community permissions.');
  const member=state.moderationMembers.find(m=>m.user_id===userId);
  if(member)member.role=data.role;
  document.querySelectorAll('[data-member-role]').forEach(b=>{
   if(b.dataset.memberRole!==userId)return;
   b.dataset.nextRole=role==='mod'?'member':'mod';
   b.textContent=role==='mod'?'Remove moderator':'Make moderator';
  });
  document.querySelectorAll('.member-sidebar-item').forEach(b=>{
   if(b.dataset.profileId!==userId)return;
   const label=b.querySelector('small');if(label)label.textContent=role==='mod'?'Moderator':'Member';
  });
  try{await logModerationAction(role==='mod'?'promote_moderator':'remove_moderator',userId,'Role changed to '+role);}catch(logError){console.warn('Moderator change saved; audit log failed',logError);}
  toast(role==='mod'?'Moderator added.':'Moderator role removed.');
  await openCommunity(cid);
 }catch(e){toast(errorText(e));}
 finally{if(button?.isConnected)button.disabled=false;}
}
async function setMemberBanned(userId,banned){try{let banned_until=null;if(banned){const choice=await wiredDialog('Ban duration in hours. Enter 0 for a permanent ban.',{input:true,defaultValue:'24',danger:false});if(choice===null)return;const hours=Number(choice);if(!Number.isFinite(hours)||hours<0||hours>8760){toast('Enter 0 to 8760 hours.');return;}banned_until=hours===0?null:new Date(Date.now()+hours*3600000).toISOString();}const {error}=await sb.from('community_members').update({banned,banned_until}).eq('community_id',state.activeCommunity.id).eq('user_id',userId);if(error)throw error;await logModerationAction(banned?'ban_member':'unban_member',userId,banned?(banned_until?'Temporary ban until '+banned_until:'Permanent ban'):'Ban lifted');toast(banned?'Member banned.':'Member unbanned.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
async function resolveCommunityReport(reportId){
 try{const {error}=await sb.from('reports').update({status:'resolved'}).eq('id',reportId);if(error)throw error;await logModerationAction('resolve_report',null,'Report '+reportId+' resolved');toast('Report resolved.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}
}
async function removeReportedPost(reportId,postId){
 await moderateRemovePost(postId,reportId);
}
async function moderateRemovePost(postId,reportId=null){
 const community=state.activeCommunity;
 if(!community||!await wiredDialog('Remove this post from the community?'))return;
 if(state.page!=='community'||state.activeCommunity!==community)return;
 try{
  const {error}=await sb.rpc('moderate_remove_community_post',{
   p_community_id:community.id,p_post_id:postId,p_report_id:reportId
  });
  if(error)throw error;
  toast(reportId?'Post removed and report resolved.':'Post removed.');
  const isCurrent=()=>state.page==='community'&&state.activeCommunity===community;
  if(!isCurrent())return;
  state.posts=state.posts.filter(post=>post.id!==postId);
  state.moderationReports=state.moderationReports.filter(report=>report.target_id!==postId);
  const managerIsOpen=()=>isCurrent()&&state.managerOpen;
  if(managerIsOpen()){
   renderCommunity();
   await loadModerationData(community.id,managerIsOpen).catch(error=>console.warn('Moderation log refresh failed',error));
   if(managerIsOpen())renderCommunity();
  }
 }catch(error){toast(errorText(error));}
}
async function saveCommunitySettings(e){
 e.preventDefault();const status=$('managerSettingsStatus');if(status)status.textContent='Saving settings…';
 const payload={icon_url:state.activeCommunity.icon_url||'',cover_url:state.activeCommunity.cover_url||'',description:$('managerDescription').value.trim(),category:$('managerCategory').value.trim()||'Other',rules:$('managerRules').value.trim(),welcome_message:$('managerWelcome').value.trim(),theme_color:$('managerThemeColor').value,visibility:$('managerVisibility').value,discoverable:$('managerDiscoverable').checked};
 const button=e.submitter;if(button)button.disabled=true;
 try{
  for(const [inputId,field] of [['managerIconFile','icon_url'],['managerCoverFile','cover_url']]){
   const file=$(inputId)?.files?.[0];if(!file)continue;
   checkProfileImage(file);
   if(status)status.textContent='Uploading '+(field==='icon_url'?'community icon':'community cover')+'…';
   const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
   const path=state.user.id+'/'+state.activeCommunity.id+'/'+field+'-'+crypto.randomUUID()+'.'+ext;
   const {error:uploadError}=await sb.storage.from('community-covers').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
   if(uploadError)throw uploadError;
   payload[field]=sb.storage.from('community-covers').getPublicUrl(path).data.publicUrl;
  }
  if(status)status.textContent='Saving community settings…';
  const updated=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/settings','PATCH',payload);
  Object.assign(state.activeCommunity,updated);const i=state.communities.findIndex(x=>x.id===updated.id);if(i>=0)Object.assign(state.communities[i],updated);
  toast('Community settings saved.');renderCommunity();
 }catch(err){if(status)status.textContent=errorText(err);else toast(errorText(err));}
 finally{if(button&&button.isConnected)button.disabled=false;}
}
async function reviewJoinRequest(id,status){try{await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/requests/'+encodeURIComponent(id),'PATCH',{status});toast(status==='approved'?'Member approved.':'Request declined.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
let postMediaFile=null;
function postOptions(){return ($('pollOptions')?.value||'').split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).slice(0,8)}
function quizQuestionEditor(index){
 return '<article class="quiz-question-editor" data-quiz-question><div class="quiz-question-editor-head"><b>Question '+(index+1)+'</b><button type="button" class="ghost small" data-remove-quiz-question>Remove</button></div><label class="field">Question prompt<input data-quiz-prompt maxlength="300" required placeholder="Enter the question"></label><label class="field">Answer options (one per line)<textarea data-quiz-options rows="4" placeholder="Answer one&#10;Answer two&#10;Answer three"></textarea></label><label class="field">Correct answer<select data-quiz-correct><option value="">Add answer options first</option></select></label></article>';
}
function updateQuizQuestionOptions(card){
 const select=card?.querySelector('[data-quiz-correct]'),area=card?.querySelector('[data-quiz-options]');if(!select||!area)return;
 const options=area.value.split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).slice(0,6),prior=select.value;
 select.innerHTML=options.length?options.map((x,i)=>'<option value="'+i+'">'+(i+1)+'. '+escapeHTML(x)+'</option>').join(''):'<option value="">Add answer options first</option>';
 if(prior!==''&&Number(prior)<options.length)select.value=prior;
}
function addQuizQuestion(){
 const host=$('quizQuestionBuilder');if(!host)return;
 const count=host.querySelectorAll('[data-quiz-question]').length;if(count>=20){toast('A quiz can contain up to 20 questions.');return;}
 host.insertAdjacentHTML('beforeend',quizQuestionEditor(count));
}
function readQuizQuestions(){
 const cards=Array.from(document.querySelectorAll('#quizQuestionBuilder [data-quiz-question]'));
 if(!cards.length)throw new Error('Add at least one quiz question.');
 return cards.map((card,i)=>{
  const prompt=card.querySelector('[data-quiz-prompt]')?.value.trim()||'';
  const options=(card.querySelector('[data-quiz-options]')?.value||'').split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).slice(0,6);
  const correct=Number(card.querySelector('[data-quiz-correct]')?.value);
  if(!prompt)throw new Error('Add a prompt for question '+(i+1)+'.');
  if(options.length<2)throw new Error('Question '+(i+1)+' needs at least two answer options.');
  if(options.length>6)throw new Error('Each question can have up to six answer options.');
  if(!Number.isInteger(correct)||correct<0||correct>=options.length)throw new Error('Choose the correct answer for question '+(i+1)+'.');
  return {prompt,options,correct_index:correct};
 });
}
function updatePostComposer(){
 const type=$('postType')?.value||'blog';
 if($('pollFields'))$('pollFields').hidden=type!=='poll';
 if($('quizFields'))$('quizFields').hidden=type!=='quiz';
 if($('postImageWrap'))$('postImageWrap').hidden=false;
 if(type==='quiz'&&!$('quizQuestionBuilder')?.querySelector('[data-quiz-question]'))addQuizQuestion();
}
async function refreshCommunityPosts(){const d=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/posts');state.posts=d.items||[];state.communityFeedError=null;renderCommunity();}
async function createPost(e){
 e.preventDefault();
 try{
  const communityId=state.activeCommunity.id;
  const title=$('postTitle').value.trim(),body=$('postBody').value.trim();
  const kind=$('postType').value,metadata={},files=Array.from($('postImage')?.files||[]);
  if(files.length>5)throw new Error('You can attach up to 5 images to one post.');
  if(kind==='image'&&!files.length)throw new Error('Choose at least one image for an image post.');
  if(kind==='poll'){metadata.options=postOptions();if(metadata.options.length<2)throw new Error('Add at least two poll options.');}
  if(kind==='quiz')metadata.questions=readQuizQuestions();
  const urls=[];
  for(const file of files){
   if(file.size>10*1024*1024)throw new Error('Each image must be under 10 MB.');
   const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
   if(!ext)throw new Error('Choose JPG, PNG, WEBP, or GIF images.');
   const path=state.user.id+'/'+crypto.randomUUID()+'.'+ext;
   const {error:uploadError}=await sb.storage.from('post-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
   if(uploadError)throw uploadError;
   urls.push(sb.storage.from('post-media').getPublicUrl(path).data.publicUrl);
  }
  if(urls.length){metadata.media_urls=urls;metadata.media_url=urls[0];}
  await api('/communities/'+encodeURIComponent(communityId)+'/posts','POST',{title,body,kind,metadata});
  toast('Your '+kind+' has been published.');
  if(state.page==='community'&&state.activeCommunity?.id===communityId){
   if(state.communityTab==='compose')state.communityTab='latest';
   await refreshCommunityPosts();
  }
 }catch(err){toast(errorText(err));}
}
async function voteOnPost(id,option_index){try{const post=state.posts.find(p=>p.id===id);const result=await api('/posts/'+encodeURIComponent(id)+'/vote','POST',{option_index});if(post?.kind==='quiz')toast(result.correct?'Correct answer!':'Not quite — try another answer.');await refreshCommunityPosts()}catch(e){toast(errorText(e))}}
async function submitQuiz(e,id){
 e.preventDefault();
 const post=state.posts.find(p=>p.id===id),questions=post?.metadata?.questions||[],answers=[];
 for(let i=0;i<questions.length;i++){const choice=e.currentTarget.querySelector('input[name="quiz-answer-'+i+'"]:checked');if(!choice){toast('Answer every question before submitting.');return;}answers.push(Number(choice.value));}
 const button=e.currentTarget.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='Scoring…';}
 try{const result=await api('/posts/'+encodeURIComponent(id)+'/quiz-submit','POST',{answers});state.quizResults[id]=result;renderCommunity();}
 catch(err){if(button){button.disabled=false;button.textContent='Submit quiz';}toast(errorText(err));}
}

let communityProfileRequest=0;
async function openCommunityMemberProfile(userId,cid=state.activeCommunity?.id,stillSelected=()=>true){
 const community=state.activeCommunity,uid=state.user?.id;
 if(!uid||!cid||community?.id!==cid||state.page!=='community')return;
 const request=++communityProfileRequest;
 const isCurrent=()=>request===communityProfileRequest&&state.page==='community'&&state.activeCommunity?.id===cid&&state.user?.id===uid&&stillSelected();
 if(userId!==uid){try{const block=await wiredBlockState(userId);if(!isCurrent())return;if(block.blockedBy){toast('This profile is unavailable.');return;}if(block.blocked){const v=$('view');v.innerHTML='<section class="card"><h2>Blocked</h2><p>You blocked this member across WIRED.</p><button type="button" class="ghost" id="communityBlockedBtn">Blocked</button></section>';v.querySelector('#communityBlockedBtn')?.addEventListener('click',()=>toggleWiredBlock(userId));return;}}catch(e){toast(errorText(e));return;}}
 try{sessionStorage.setItem('wired:lastPage','community');sessionStorage.setItem('wired:lastCommunity',cid);sessionStorage.setItem('wired:lastCommunityProfile',userId);}catch(e){}
 try{
  const [{data:local,error},{data:global,error:ge},{data:follows,error:fe},{data:relationships,error:re}]=await Promise.all([
   sb.from('community_profiles').select('nickname,bio,avatar_url,cover_url,show_global_companion').eq('community_id',cid).eq('user_id',userId).maybeSingle(),
   sb.from('profiles').select('username,avatar_url').eq('id',userId).maybeSingle(),
   sb.from('community_profile_follows').select('follower_id,following_id').eq('community_id',cid),
   sb.from('community_relationships').select('id,requester_id,recipient_id,status,ended_by').eq('community_id',cid).in('status',['pending','accepted']).or('and(requester_id.eq.'+uid+',recipient_id.eq.'+userId+'),and(requester_id.eq.'+userId+',recipient_id.eq.'+uid+')').limit(1)
  ]);
  if(!isCurrent())return;
  if(error||ge||fe||re)throw error||ge||fe||re;
  const name=local?.nickname||global?.username||'Community member';
  const following=(follows||[]).some(f=>f.follower_id===uid&&f.following_id===userId);
  const followsMe=(follows||[]).some(f=>f.follower_id===userId&&f.following_id===uid);
  const friends=following&&followsMe;
  const relationship=relationships?.[0];
  const {data:activeRows,error:activeError}=await sb.from('community_relationships').select('id,requester_id,recipient_id,status').eq('community_id',cid).eq('status','accepted').or('requester_id.eq.'+uid+',recipient_id.eq.'+uid).limit(1);
  if(activeError)throw activeError;
  const myActive=activeRows?.[0],myPartner=myActive?(myActive.requester_id===uid?myActive.recipient_id:myActive.requester_id):null;
  // Use the same community follow records for button state and social counts.
  // A separate filtered request can disagree with the already loaded follow state.
  const socialRows=follows||[];
  const followerIds=new Set((socialRows||[]).filter(f=>f.following_id===userId).map(f=>f.follower_id));
  const followingIds=new Set((socialRows||[]).filter(f=>f.follower_id===userId).map(f=>f.following_id));
  const socialGroups={followers:[...followerIds],following:[...followingIds],friends:[...followerIds].filter(id=>followingIds.has(id))};
  let companion=null,companionMessage='';
  if(local?.show_global_companion){
   // Always fetch the current equipped pet instead of relying on a potentially stale profile cache.
   const {data:bonded,error:bondedError}=await sb.rpc('community_profile_global_companion',{p_community_id:cid,p_user_id:userId});
   if(!bondedError&&bonded)companion=bonded;
   else if(userId===uid){
    const {data:mine,error:mineError}=await sb.rpc('my_bonded_companion');
    if(!mineError&&mine)companion=mine;
    else companionMessage='Could not load equipped companion: '+errorText(bondedError||mineError||new Error('No companion equipped'));
   }else companionMessage='Could not load community companion: '+errorText(bondedError||new Error('No companion equipped'));
  }
  let profileCommunityPoints=state.moderationMembers.find(m=>m.user_id===userId)?.communityPoints;
  if(profileCommunityPoints===undefined){
   try{const leaderboard=await api('/communities/'+encodeURIComponent(cid)+'/leaderboard');profileCommunityPoints=Number((leaderboard.items||[]).find(m=>(m.user_id||m.id)===userId)?.points)||0;}
   catch(e){console.warn('Community profile level unavailable',e);profileCommunityPoints=0;}
  }
  if(!isCurrent())return;
  const panel=document.createElement('section');panel.className='card community-local-profile-detail';
  const own=userId===uid;
  const relationLabel=relationship?.status==='accepted'?'In a community relationship':relationship?.status==='pending'?'Relationship request pending':myActive?'Already in a community relationship':friends?'Request relationship':'Become mutual community friends to request a relationship';
  panel.innerHTML='<button type="button" class="link" id="closeLocalProfile">← Back to community</button><div class="profile-cover member-profile-cover"'+(local?.cover_url?' style="background-image:url(&quot;'+escapeHTML(local.cover_url)+'&quot;);background-size:cover;background-position:center"':'')+'></div><div class="profile-person"><div><p class="hint">'+escapeHTML(community.name||'Community')+' profile</p><h2>'+escapeHTML(name)+'</h2></div></div>'+'<span class="community-local-avatar-wrap">'+((local?.avatar_url||global?.avatar_url)?'<img class="community-local-avatar" src="'+escapeHTML(local?.avatar_url||global?.avatar_url)+'" alt="Community avatar">':'<span class="community-local-avatar community-local-avatar-fallback">W</span>')+communityAvatarLevelBadge({communityPoints:profileCommunityPoints})+'</span>'+'<div class="profile-social-actions community-social-counts">'+[['followers','Followers'],['following','Following'],['friends','Friends']].map(([key,label])=>'<button type="button" class="ghost" data-community-social="'+key+'"><strong>'+socialGroups[key].length+'</strong> '+label+'</button>').join('')+'</div>'+(local?.show_global_companion?'<section class="community-companion-section">'+(companion?profileYokaiMarkup(companion):'<p class="hint">'+escapeHTML(companionMessage)+'</p>')+'</section>':'')+'<section class="community-profile-biography"><h3>About Me</h3><p id="communityProfileBio">'+escapeHTML(local?.bio||'No community biography yet.')+'</p></section>'+(myPartner===userId?'<p class="hint">In a relationship with '+escapeHTML(name)+'</p>':'')+(own?'<section class="community-local-profile"><h3>Edit Community Profile</h3><div id="communityLocalProfile">Loading…</div></section>':'<div class="card-actions"><button class="ghost small" id="communityFollowBtn">'+(following?'Unfollow community profile':'Follow community profile')+'</button><button class="ghost small" id="communityRelationshipBtn" '+(!friends||relationship||myActive?'disabled':'')+'>'+escapeHTML(relationLabel)+'</button>'+(relationship?.status==='pending'&&relationship.recipient_id===uid?'<button class="primary small" id="acceptCommunityRelationship">Accept relationship</button><button class="ghost small" id="declineCommunityRelationship">Decline</button>':'')+(relationship?.status==='pending'&&relationship.requester_id===uid?'<button class="ghost small" id="cancelCommunityRelationship">Cancel request</button>':'')+(relationship?.status==='accepted'?'<button class="ghost small" id="endCommunityRelationship">End relationship</button>':'')+'</div>');
  if(!own)panel.insertAdjacentHTML('beforeend','<button type="button" class="ghost" id="communitySendGiftBtn">🎁 Send Gift</button><button type="button" class="ghost" id="communityBlockBtn" style="color:#ff525f;border-color:#b42b42;font-size:.75rem;padding:.3rem .55rem">Block</button>');
  const communityQuick=panel.querySelector('.community-social-counts');
  if(communityQuick){communityQuick.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';const gift=panel.querySelector('#communitySendGiftBtn'),block=panel.querySelector('#communityBlockBtn');if(gift)communityQuick.appendChild(gift);if(block)communityQuick.appendChild(block);const relation=panel.querySelector('.community-profile-biography')?.nextElementSibling;const heading=panel.querySelector('.profile-person');const companionSection=panel.querySelector('.community-companion-section');if(companionSection)companionSection.before(communityQuick);else (panel.querySelector('.community-profile-biography')||heading)?.before(communityQuick);}
  panel.insertAdjacentHTML('beforeend','<div id="communityProfileComments"><p class="hint">Loading comments…</p></div>');
  const host=document.getElementById('view');
  if(!host)throw new Error('Community page is not available.');
  host.replaceChildren(panel);
  renderCommunityProfileComments(panel,cid,userId);
  if(own)void loadCommunityLocalProfile();
  panel.querySelector('#communitySendGiftBtn')?.addEventListener('click',()=>openGiftShopForProfile(userId,name,cid));
  panel.querySelector('#communityBlockBtn')?.addEventListener('click',()=>toggleWiredBlock(userId));
  panel.querySelector('#closeLocalProfile')?.addEventListener('click',()=>openCommunitySection(state.communityTab==='members'?'members':'latest'));
  panel.querySelectorAll('[data-community-social]').forEach(button=>button.addEventListener('click',async()=>{
   const group=button.dataset.communitySocial,ids=socialGroups[group]||[];
   let section=panel.querySelector('#communitySocialList');
   if(!section){section=document.createElement('section');section.id='communitySocialList';section.className='profile-social-list';panel.querySelector('.community-social-counts')?.after(section);}
   if(!ids.length){section.innerHTML='<h3>'+escapeHTML(group)+'</h3><p class="hint">No community '+escapeHTML(group)+' yet.</p>';return;}
   const {data:members,error}=await sb.from('community_profiles').select('user_id,nickname,avatar_url').eq('community_id',cid).in('user_id',ids);
   if(error){section.textContent=errorText(error);return;}
   const profiles=new Map((members||[]).map(m=>[m.user_id,m]));
   section.innerHTML='<h3>'+escapeHTML(group)+'</h3>'+ids.map(id=>{const p=profiles.get(id);return '<button type="button" class="profile-social-person" data-community-social-person="'+escapeHTML(id)+'">'+(p?.avatar_url?'<img class="profile-social-avatar" src="'+escapeHTML(p.avatar_url)+'" alt="">':'')+'<b>'+escapeHTML(p?.nickname||'Community member')+'</b><span>View profile →</span></button>';}).join('');
   section.querySelectorAll('[data-community-social-person]').forEach(b=>b.addEventListener('click',()=>openCommunityMemberProfile(b.dataset.communitySocialPerson)));
  }));
  panel.querySelector('#communityFollowBtn')?.addEventListener('click',async()=>{
   try{
    const query=sb.from('community_profile_follows');
    const {error}=following?await query.delete().eq('community_id',cid).eq('follower_id',uid).eq('following_id',userId):await query.upsert({community_id:cid,follower_id:uid,following_id:userId},{onConflict:'community_id,follower_id,following_id',ignoreDuplicates:true});
    if(error)throw error;await openCommunityMemberProfile(userId);
   }catch(e){toast(errorText(e));}
  });
  panel.querySelector('#communityRelationshipBtn')?.addEventListener('click',async()=>{
   try{
    const {error}=await sb.from('community_relationships').insert({community_id:cid,requester_id:uid,recipient_id:userId,status:'pending'});
    if(error)throw error;toast('Community relationship request sent.');await openCommunityMemberProfile(userId);
   }catch(e){toast(errorText(e));}
  });
  for(const [buttonId,status] of [['declineCommunityRelationship','declined'],['cancelCommunityRelationship','declined'],['endCommunityRelationship','ended']]){
   panel.querySelector('#'+buttonId)?.addEventListener('click',async()=>{
    if(status==='ended'&&!await wiredDialog('End this community relationship?'))return;
    try{
     const {error}=await sb.from('community_relationships').update({status,updated_at:new Date().toISOString(),...(status==='ended'?{ended_by:uid}:{})}).eq('id',relationship.id);
     if(error)throw error;toast(status==='ended'?'Community relationship ended.':'Relationship request closed.');await openCommunityMemberProfile(userId);
    }catch(e){toast(errorText(e));}
   });
  }
  panel.querySelector('#acceptCommunityRelationship')?.addEventListener('click',async()=>{
   try{
    const {error}=await sb.from('community_relationships').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',relationship.id);
    if(error)throw error;toast('Community relationship accepted.');await openCommunityMemberProfile(userId);
   }catch(e){toast(errorText(e));}
  });
  return true;
 }catch(e){if(isCurrent()){toast(errorText(e));return false;}}
}
async function loadCommunityLocalProfile(){
 const cid=state.activeCommunity?.id,uid=state.user?.id,el=document.getElementById('communityLocalProfile');
 if(!cid||!uid||!el)return;
 try{
  const {data,error}=await sb.from('community_profiles').select('nickname,bio,avatar_url,cover_url,show_global_companion').eq('community_id',cid).eq('user_id',uid).maybeSingle();
  if(error)throw error;
  const {data:globalProfile,error:globalError}=await sb.from('profiles').select('username,avatar_url').eq('id',uid).maybeSingle();
  if(globalError)throw globalError;
  const globalName=globalProfile?.username||state.profile?.username||'Member';
  const globalAvatar=globalProfile?.avatar_url||state.profile?.avatar_url||'';
  const defaultNickname=(globalName||'Member').slice(0,40);
  if(!data){
   const {error:createError}=await sb.from('community_profiles').upsert({
    community_id:cid,user_id:uid,nickname:defaultNickname,avatar_url:globalAvatar||null,bio:''
   },{onConflict:'community_id,user_id',ignoreDuplicates:true});
   if(createError)throw createError;
  }
  const currentName=data?.nickname||defaultNickname;
  const currentAvatar=data?.avatar_url||globalAvatar;
  el.innerHTML='<div class="community-cover-editor"><label class="field">Community profile banner<input id="communityCoverUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p class="hint">Upload a banner for this community profile only (up to 10 MB).</p></div><form id="communityLocalProfileForm"><label class="field">Community nickname<input name="nickname" maxlength="40" required value="'+escapeHTML(currentName)+'"></label><label class="field">Community biography<textarea name="bio" maxlength="2000" rows="3">'+escapeHTML(data?.bio||'')+'</textarea></label><label class="field">Community avatar URL<input name="avatar_url" type="url" placeholder="https://…" value="'+escapeHTML(currentAvatar||'')+'"></label><label class="field">Yokai companion<select name="show_global_companion" autocomplete="off"><option value="false"'+(!data?.show_global_companion?' selected':'')+'>No companion</option><option value="true"'+(data?.show_global_companion?' selected':'')+'>Show my global companion</option></select></label><p class="hint">Companions can only be changed on your global profile. This community setting only controls visibility.</p><button type="submit" class="primary small">Save Community Profile</button></form>';
  // Keep the visible community profile synchronized with fresh server data.
  async function refreshCommunityProfileDisplay(){
   const {data:fresh,error:freshError}=await sb.from('community_profiles').select('bio,show_global_companion').eq('community_id',cid).eq('user_id',uid).single();
   if(freshError)throw freshError;
   if(!el.isConnected)return;
   const detail=el.closest('.community-local-profile-detail');
   const mainBio=detail?.querySelector('#communityProfileBio');
   if(mainBio)mainBio.textContent=fresh.bio||'No community biography yet.';
   const selector=el.querySelector('select[name="show_global_companion"]');
   if(selector&&!selector.disabled){selector.value=fresh.show_global_companion?'true':'false';selector.dataset.savedValue=selector.value;}
   if(!detail)return;
   if(!fresh.show_global_companion){detail.querySelector('.community-companion-section')?.remove();return;}
   const {data:pet,error:petError}=await sb.rpc('my_bonded_companion');
   if(!detail.isConnected)return;
   let section=detail.querySelector('.community-companion-section');
   if(!section){section=document.createElement('section');section.className='community-companion-section';detail.querySelector('.community-social-counts')?.after(section);}
   section.innerHTML=''+(pet&&!petError?profileYokaiMarkup(pet):'<p class="hint">'+escapeHTML(petError?errorText(petError):'No global companion equipped.')+'</p>');
  }
  refreshCommunityProfileDisplay().catch(err=>console.warn('Community profile refresh failed:',err));
  // Safari can restore stale form values on refresh, overriding the server-selected option.
  const companionSelect=el.querySelector('select[name="show_global_companion"]');
  if(companionSelect){
   companionSelect.value=data?.show_global_companion===true?'true':'false';
   companionSelect.dataset.savedValue=companionSelect.value;
   companionSelect.addEventListener('change',async()=>{
    const next=companionSelect.value==='true',previous=companionSelect.dataset.savedValue;
    companionSelect.disabled=true;
    try{
     const {data:updated,error:updateError}=await sb.from('community_profiles').update({show_global_companion:next,updated_at:new Date().toISOString()}).eq('community_id',cid).eq('user_id',uid).select('show_global_companion').single();
     if(updateError)throw updateError;
     if(updated?.show_global_companion!==next)throw new Error('Companion setting was not saved.');
     companionSelect.dataset.savedValue=next?'true':'false';
     await refreshCommunityProfileDisplay();
     toast(next?'Global companion enabled for this community.':'Community companion hidden.');
     const {data:pet,error:petError}=next?await sb.rpc('my_bonded_companion'):{data:null,error:null};
     if(petError)console.warn('Community companion preview:',petError);
     const detail=document.querySelector('.community-local-profile-detail');
     if(detail){
      let section=detail.querySelector('.community-companion-section');
      if(next){
       if(!section){section=document.createElement('section');section.className='community-companion-section';const counts=detail.querySelector('.community-social-counts');if(counts)counts.after(section);}
       if(section)section.innerHTML=''+(pet?profileYokaiMarkup(pet):'<p class="hint">Companion unavailable. Reopen your profile to retry.</p>');
      }else section?.remove();
     }
    }catch(err){companionSelect.value=previous;toast('Could not update companion: '+errorText(err));}
    finally{if(companionSelect.isConnected)companionSelect.disabled=false;}
   });
  }
  el.querySelector('#communityCoverUpload')?.addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   const input=event.target;input.disabled=true;
   try{
    checkProfileImage(file);
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
    const path=uid+'/communities/'+cid+'/cover-'+crypto.randomUUID()+'.'+ext;
    const {error:uploadError}=await sb.storage.from('profile-media').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(uploadError)throw uploadError;
    const cover_url=sb.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
    const {error:saveError}=await sb.from('community_profiles').update({cover_url,updated_at:new Date().toISOString()}).eq('community_id',cid).eq('user_id',uid);
    if(saveError)throw saveError;
    toast('Community profile banner saved.');
    await openCommunityMemberProfile(uid);
   }catch(err){toast('Could not upload community banner: '+errorText(err));}
   finally{input.disabled=false;input.value='';}
  });
  el.querySelector('form')?.addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget;const nickname=f.elements.nickname.value.trim(),bio=f.elements.bio.value.trim(),avatar_url=f.elements.avatar_url.value.trim()||null;
   if(!nickname)return toast('Enter a community nickname.');
   const saveButton=f.querySelector('[type="submit"]');if(saveButton)saveButton.disabled=true;
   try{
    const {data:saved,error}=await sb.from('community_profiles').update({nickname,bio,avatar_url,updated_at:new Date().toISOString()}).eq('community_id',cid).eq('user_id',uid).select('nickname,bio,avatar_url').single();
    if(error)throw error;
    if(!saved)throw new Error('Community profile update returned no record.');
    const visibleBio=document.getElementById('communityProfileBio');
    if(visibleBio)visibleBio.textContent=saved.bio||'No community biography yet.';
    toast('Community profile saved.');
    try{await refreshCommunityProfileDisplay();}catch(refreshError){console.warn('Community preview refresh failed:',refreshError);}
    try{await openCommunityMemberProfile(uid);}catch(refreshError){console.warn('Community profile refresh failed:',refreshError);}
   }catch(err){toast('Could not save community profile: '+errorText(err));}
   finally{if(saveButton?.isConnected)saveButton.disabled=false;}
  });
 }catch(e){el.textContent='Community profile unavailable: '+errorText(e);}
}
async function togglePostReaction(id,reaction){
 const button=Array.from(document.querySelectorAll('[data-react-post]')).find(el=>el.dataset.reactPost===id&&el.dataset.reaction===reaction);
 if(button?.disabled)return;
 if(button)button.disabled=true;
 try{
  const result=await api('/posts/'+encodeURIComponent(id)+'/reactions','POST',{reaction});
  const post=(state.posts||[]).find(p=>String(p.id)===String(id));
  if(post){
   const active=!!result.active;
   const oldActive=(post.my_reactions||[]).includes(reaction);
   post.my_reactions=active?[...new Set([...(post.my_reactions||[]),reaction])]:(post.my_reactions||[]).filter(r=>r!==reaction);
   post.reaction_counts={...(post.reaction_counts||{})};
   if(active!==oldActive)post.reaction_counts[reaction]=Math.max(0,Number(post.reaction_counts[reaction]||0)+(active?1:-1));
  }
  await refreshCommunityPosts();
 }catch(e){toast('Could not save reaction: '+errorText(e));}
 finally{if(button?.isConnected)button.disabled=false;}
}
async function submitPostComment(e,id){e.preventDefault();const input=e.currentTarget.elements.comment;try{await api('/posts/'+encodeURIComponent(id)+'/comments','POST',{body:input.value.trim()});await refreshCommunityPosts()}catch(err){toast(errorText(err))}}
let inboxRefreshSequence=0;
async function loadThreads(){
 if(!state.user){state.threads=[];return;}
 const sequence=++inboxRefreshSequence;
 try{
  const [d,membership]=await Promise.all([
   api("/threads?fresh="+Date.now()),
   sb.from("thread_members").select("thread_id").eq("user_id",state.user.id).is("hidden_at",null)
  ]);
  if(membership.error)throw membership.error;
  if(sequence!==inboxRefreshSequence)return;
  const visible=new Set((membership.data||[]).map(m=>String(m.thread_id)));
  const locallyDeleted=state.deletedThreadIds||new Set();
  state.threads=(d.items||[]).filter(t=>visible.has(String(t.id))&&!locallyDeleted.has(String(t.id)));
  if(state.page==="chats")render();
 }catch(e){if(sequence!==inboxRefreshSequence)return;console.warn("Chat inbox refresh failed",e);toast(errorText(e));}
}
async function startDM(e){e.preventDefault();try{const d=await api("/threads/dm","POST",{username:$("dmUsername").value.trim()});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function startGroupChat(e){e.preventDefault();try{const usernames=$("groupUsernames").value.split(",").map(x=>x.trim()).filter(Boolean);if(usernames.length<2)throw new Error("Add at least two usernames for a group chat.");if(new Set(usernames.map(x=>x.toLowerCase())).size>998)throw new Error("Group chats support at most 999 occupants, including you.");const d=await api("/threads/group","POST",{usernames});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function openCommunityChat(id){try{const d=await api("/communities/"+encodeURIComponent(id)+"/chat","POST",{});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function deleteThread(id){const thread=state.threads.find(t=>String(t.id)===String(id));const name=thread?.title||"this chat";if(!await wiredDialog("Delete "+name+" from your chat list? This only removes it from your inbox; other participants keep their copies."))return;const btn=[...document.querySelectorAll("[data-delete-thread]")].find(b=>b.dataset.deleteThread===String(id));if(btn){btn.disabled=true;btn.textContent="Deleting…";}try{const result=await api("/threads/"+encodeURIComponent(id)+"/delete","POST",{});if(result.ok!==true)throw new Error("The server did not confirm chat deletion.");
  state.deletedThreadIds??=new Set();state.deletedThreadIds.add(String(id));
  ++inboxRefreshSequence;if(state.activeThread===id){if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}state.activeThread=null;}state.threads=state.threads.filter(t=>String(t.id)!==String(id));if(state.page==="chats")render();const {data:membership,error:membershipError}=await sb.from("thread_members").select("hidden_at").eq("thread_id",id).eq("user_id",state.user.id).maybeSingle();if(membershipError)throw membershipError;if(!membership?.hidden_at)throw new Error("The server did not persist the chat removal. Please try again.");await loadThreads();if(state.page==="chats")render();toast("Chat removed from your inbox.");}catch(e){state.deletedThreadIds?.delete(String(id));toast(errorText(e));if(btn&&btn.isConnected){btn.disabled=false;btn.textContent="Delete";}}}async function openThread(id){try{if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}state.activeThread=id;const d=await api(`/threads/${encodeURIComponent(id)}/messages`);if(state.activeThread!==id)return;state.messages=d.items||[];renderThread();state.realtimeChannel=sb.channel("wired-thread-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"thread_id=eq."+id},async payload=>{if(state.activeThread!==id)return;const last=state.messages[state.messages.length-1]?.id||0;if(Number(payload.new.id)>last){try{const fresh=await api(`/threads/${encodeURIComponent(id)}/messages?after=${last}`);state.messages=[...state.messages,...(fresh.items||[])];renderThread()}catch(e){console.warn("Message refresh failed",e)}}}).subscribe()}catch(e){toast(errorText(e))}}
function renderThread(){updateCommunitySidebar();const v=$("view");const thread=state.threads.find(t=>t.id===state.activeThread);v.innerHTML=`<section class="chat-window"><header class="chat-window-header"><button type="button" class="chat-back" id="backChats" aria-label="Back to messages">‹</button><div class="chat-window-title"><span class="chat-window-avatar">W</span><div><h2>${escapeHTML(thread?.title||"Conversation")}</h2><p>WIRED messages</p></div></div><button type="button" class="chat-invite-button" id="inviteFollowersBtn">Invite ${thread?.community_id?'community ':''}followers</button></header><section class="chat-invite-panel" id="inviteFollowersPanel" hidden></section><div class="chat-log" id="chatLog">${state.messages.map(m=>`<article class="message-bubble ${m.user_id===state.user?.id||m.sender_id===state.user?.id?"message-own":""}"><div class="meta">${escapeHTML(m.username||"Member")} · ${new Date(m.created_at).toLocaleString()}</div><p>${escapeHTML(m.body)}</p></article>`).join("")||`<div class="empty chat-empty">No messages yet. Say hello to start the conversation.</div>`}</div><form id="messageForm" class="chat-composer"><textarea id="messageBody" required maxlength="4000" rows="1" placeholder="Write a message…" aria-label="Write a message"></textarea><button class="primary" type="submit" aria-label="Send message">Send</button></form></section>`;$("backChats").addEventListener("click",()=>state.page==='community'?openCommunitySection('chats'):nav("chats"));$("inviteFollowersBtn").addEventListener("click",toggleFollowerInvitePanel);$("messageForm").addEventListener("submit",sendMessage);const log=$("chatLog");if(log)log.scrollTop=log.scrollHeight;$("messageBody")?.focus()}
async function toggleFollowerInvitePanel(){const panel=$("inviteFollowersPanel");if(!panel)return;if(!panel.hidden){panel.hidden=true;return;}panel.hidden=false;const communityChat=!!state.threads.find(t=>String(t.id)===String(state.activeThread))?.community_id;panel.innerHTML='<p class="hint">Loading your '+(communityChat?'community':'global')+' followers…</p>';try{const d=await api("/threads/"+encodeURIComponent(state.activeThread)+"/followers");const people=d.items||[];panel.innerHTML='<div class="chat-invite-heading"><strong>Invite your '+(communityChat?'community':'global')+' followers</strong><button type="button" class="chat-invite-close" id="closeFollowerInvite" aria-label="Close">×</button></div>'+(people.length?'<div class="chat-invite-list">'+people.map(p=>'<div class="chat-invite-person"><span>'+escapeHTML(p.username||"WIRED member")+'</span><button type="button" class="primary chat-invite-action" data-invite-follower="'+escapeHTML(p.id)+'">Invite</button></div>').join("")+'</div>':'<p class="hint">No followers available to invite. Only members who follow your '+(communityChat?'community':'global')+' profile appear here.</p>');$("closeFollowerInvite")?.addEventListener("click",()=>{panel.hidden=true;});panel.querySelectorAll("[data-invite-follower]").forEach(btn=>btn.addEventListener("click",()=>inviteGlobalFollower(btn.dataset.inviteFollower,btn)));}catch(e){panel.innerHTML='<p class="hint">'+escapeHTML(errorText(e))+'</p>';}}
async function inviteGlobalFollower(userId,button){if(!userId||!button)return;button.disabled=true;button.textContent="Inviting…";try{await api("/threads/"+encodeURIComponent(state.activeThread)+"/invite","POST",{user_id:userId});button.textContent="Invited";button.classList.add("invited");toast("Follower invited to chat.");}catch(e){button.disabled=false;button.textContent="Invite";toast(errorText(e));}}
async function sendMessage(e){e.preventDefault();const body=$("messageBody").value.trim();if(!body)return;try{await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`,"POST",{body});const d=await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`);state.messages=d.items||[];renderThread()}catch(err){toast(errorText(err))}}
function openAuth(mode="login"){const dialog=$("authDialog");if(!dialog)return;const register=mode==="register";$("authStatus").textContent="";$("loginForm").hidden=register;$("registerForm").hidden=!register;$("authTitle").textContent=register?"Create account":"Log in";if(!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}}
$("accountBtn").addEventListener("click",()=>state.user?nav("profile"):openAuth());
$("headerLogoutBtn")?.addEventListener("click",()=>{if(state.user)logout().catch(e=>toast(e.message||"Could not log out."));});
$("showRegister").addEventListener("click",()=>{$("loginForm").hidden=true;$("registerForm").hidden=false;$("authTitle").textContent="Create account"});
$("showLogin").addEventListener("click",()=>{$("registerForm").hidden=true;$("loginForm").hidden=false;$("authTitle").textContent="Log in"});
$("resendConfirm").addEventListener("click",async()=>{const email=$("regEmail").value.trim();if(!email||!email.includes("@")){$("authStatus").textContent="Enter your registration email address first.";return;}const {error}=await sb.auth.resend({type:"signup",email,options:{emailRedirectTo:window.location.origin+window.location.pathname}});$("authStatus").textContent=error?error.message:"If this account is awaiting confirmation, a fresh verification email has been requested. Check your inbox.";});
$("loginSubmit").addEventListener("click",async()=>{if(!$("loginAdult").checked){$("authStatus").textContent="WIRED is for adults aged 18 or older.";return;}const email=$("loginName").value.trim();if(!email.includes("@")){$("authStatus").textContent="Please sign in with the email address on your WIRED account.";return;}const {error}=await sb.auth.signInWithPassword({email,password:$("loginPassword").value});if(error){$("authStatus").textContent=error.message;return;}$("authDialog").close();toast("Welcome back to WIRED.");await refreshUser()});
$("registerSubmit").addEventListener("click",async()=>{const dob=$("regDob").value;if(!$("regConfirm").checked||!dob){$("authStatus").textContent="Enter your date of birth and confirm it.";return;}const birth=new Date(dob+"T00:00:00");const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setFullYear(cutoff.getFullYear()-18);if(birth>cutoff){$("authStatus").textContent="You must be at least 18 to join WIRED.";return;}const username=$("regUser").value.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username)){$("authStatus").textContent="Username must be 3–24 characters (letters, numbers, underscores).";return;}const {data,error}=await sb.auth.signUp({email:$("regEmail").value.trim(),password:$("regPassword").value,options:{data:{username,date_of_birth:dob},emailRedirectTo:window.location.origin+window.location.pathname}});if(error){$("authStatus").textContent=error.message;return;}if(data.session){$("authDialog").close();toast("Your WIRED account is ready.");await refreshUser();}else{$("authStatus").textContent="Check your email for the confirmation link, then log in to WIRED.";}});
async function saveBiography(e){
 e.preventDefault();if(!state.user)return;
 const bio=$("profileBio").value.trim();const button=$("bioForm")?.querySelector('button[type="submit"]');
 if(button){button.disabled=true;button.textContent="Saving…";}
 try{
  const {error}=await sb.from("profiles").update({bio}).eq("id",state.user.id);
  if(error)throw error;
  await loadProfile();toast("Your biography has been updated.");render();
 }catch(err){toast(errorText(err));if(button){button.disabled=false;button.textContent="Save biography";}}
}
async function saveUsername(e){
 e.preventDefault();const username=$("settingsUsername").value.trim().toLowerCase();const status=$("settingsStatus");
 if(!/^[a-z0-9_]{3,24}$/.test(username)){status.textContent="Username must be 3–24 characters using letters, numbers, or underscores.";return;}
 status.textContent="Saving username…";
 const {error}=await sb.from("profiles").update({username}).eq("id",state.user.id);
 if(error){status.textContent=error.code==="23505"?"That username is already taken. Please choose another.":error.message;return;}
 await loadProfile();status.textContent="Username updated.";render();
}
async function saveEmail(e){
 e.preventDefault();const email=$("settingsEmail").value.trim();const status=$("settingsStatus");
 if(!email){status.textContent="Enter a valid email address.";return;}
 if(email.toLowerCase()===String(state.user.email||"").toLowerCase()){status.textContent="That is already your current email address.";return;}
 status.textContent="Requesting email change…";
 const {error}=await sb.auth.updateUser({email},{emailRedirectTo:window.location.origin+window.location.pathname});
 status.textContent=error?error.message:"Confirmation requested. Check your email inbox (and spam folder) and follow Supabase’s confirmation instructions. Your address may not change until confirmed.";
}
async function savePassword(e){
 e.preventDefault();const password=$("settingsPassword").value;const confirm=$("settingsPasswordConfirm").value;const status=$("settingsStatus");
 if(password.length<8){status.textContent="Use at least 8 characters for your password.";return;}
 if(password!==confirm){status.textContent="The passwords do not match.";return;}
 status.textContent="Updating password…";
 const {error}=await sb.auth.updateUser({password});
 status.textContent=error?error.message:"Password updated successfully.";
 if(!error){$("settingsPassword").value="";$("settingsPasswordConfirm").value="";}
}
async function logout(){if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}if(state.notificationChannel){await sb.removeChannel(state.notificationChannel);state.notificationChannel=null;}await sb.auth.signOut();state.user=null;state.profile=null;state.communities=[];state.threads=[];toast("Logged out.");nav("home")}
sb.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setTimeout(()=>refreshUser().catch(e=>console.warn(e)),0)});
// Persist the actual open view, not just the bottom navigation tab.
let wiredRestoringRoute=true;
function saveWiredRoute(){
 if(wiredRestoringRoute)return;
 try{
  const route={page:state.page,communityId:state.activeCommunity?.id||null,communitySection:state.communityTab,communityManagerOpen:!!state.managerOpen,communityThreadId:state.page==='community'&&$('backChats')?state.activeThread:null,communityProfileId:sessionStorage.getItem('wired:lastCommunityProfile')||null,memberId:state.page==='member-profile'?state.viewingProfile?.id:null,threadId:state.page==='chats'?state.activeThread:null,discoveryMode:state.discoveryMode||'',socialTab:state.profileSocialTab||'following',storeSection:wiredStoreSection,sanctuaryView:state.yokaiSanctuaryView||'home'};
  sessionStorage.setItem('wired:route:v2',JSON.stringify(route));
  sessionStorage.setItem('wired:lastPage',route.page||'home');
 }catch(e){console.warn('Could not save WIRED route',e);}
}
window.addEventListener('pagehide',saveWiredRoute);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveWiredRoute();});
document.addEventListener('click',()=>queueMicrotask(saveWiredRoute),true);
setInterval(saveWiredRoute,400);
async function restoreWiredRoute(route){
 if(!route||!state.user&&['member-profile','profile-social','global-members','community','notifications','chats'].includes(route.page))return false;
 if(route.page==='member-profile'&&route.memberId){await openMemberProfile(route.memberId);return true;}
 if(route.page==='community'&&route.communityId){
  await openCommunity(route.communityId,route.communitySection);
  if(!state.activeCommunityRole)return true;
  if(route.communityProfileId&&route.communityProfileId!==state.user.id){
   state.communityTab='profile';
   updateCommunitySidebar();
   await openCommunityMemberProfile(route.communityProfileId,route.communityId,()=>state.communityTab==='profile');
  }else if(route.communityProfileId===state.user.id||route.communitySection==='profile'){
   await openCommunitySection('profile');
  }else if(route.communityManagerOpen&&['owner','mod'].includes(state.activeCommunityRole)){
   await openCommunitySection('manager');
  }else if(['chats','notifications'].includes(route.communitySection)){
   await openCommunitySection(route.communitySection);
   if(route.communitySection==='chats'&&route.communityThreadId&&state.threads.some(thread=>
    thread.id===route.communityThreadId&&String(thread.community_id||thread.communityId||'')===String(route.communityId)
   ))await openThread(route.communityThreadId);
  }
  return true;
 }
 if(route.page==='global-members'){state.page='global-members';renderGlobalMemberDirectory();await loadGlobalMemberDirectory(true);return true;}
 if(route.page==='notifications'){await openNotifications();return true;}
 if(route.page==='profile-social'){state.page='profile-social';state.profileSocialTab=route.socialTab||'following';render();return true;}
 if(route.page==='chats'&&route.threadId){state.page='chats';await loadThreads();await openThread(route.threadId);return true;}
 const pages=new Set(['home','discover','all-communities','chats','pets','store','profile','communities','people','create','bugs','features']);
 if(!pages.has(route.page)||(['bugs','features'].includes(route.page)&&!wiredStaffAccess))return false;
 nav(route.page);
 if(route.page==='discover'){state.discoveryMode=route.discoveryMode||'';render();}
 if(route.page==='store'){wiredStoreSection=['home','profile','yokai','gifts'].includes(route.storeSection)?route.storeSection:'home';sessionStorage.setItem('wired:storeSection',wiredStoreSection);renderGlobalStore();}
 if(route.page==='pets'){state.yokaiSanctuaryView=route.sanctuaryView||'home';sessionStorage.setItem('wired:sanctuaryView',state.yokaiSanctuaryView);await loadPetParadise().catch(()=>{});if(state.page==='pets')renderPetParadise();}
 return true;
}
async function init(){const {data:{session}}=await sb.auth.getSession();state.user=session?.user||null;if(state.user){await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});await loadProfileSocial().catch(()=>{});await loadGlobalNotifications().catch(()=>{});subscribeGlobalNotifications();subscribeRelationshipEnds();subscribeCommunityRelationshipEnds();await loadRelationshipData().catch(()=>{});}
 await refreshWiredStaffAccess();
 let savedPage="home",savedCommunity=null,savedCommunityProfile=null;
 try{savedPage=sessionStorage.getItem("wired:lastPage")||"home";savedCommunity=sessionStorage.getItem("wired:lastCommunity");savedCommunityProfile=sessionStorage.getItem('wired:lastCommunityProfile');}catch(e){}
 let restoredRoute=null;
 try{restoredRoute=JSON.parse(sessionStorage.getItem('wired:route:v2')||'null');}catch(e){}
 if(restoredRoute){try{if(await restoreWiredRoute(restoredRoute)){wiredRestoringRoute=false;saveWiredRoute();return;}}catch(e){console.warn('WIRED route restore failed',e);}}
 wiredRestoringRoute=false;
 const tabs=new Set(["home","all-communities","discover","chats","pets","store","profile","communities","people","bugs","features"]);
 if(savedPage==="member-profile"&&state.user){const member=sessionStorage.getItem("wired:openedMember");if(member){await openMemberProfile(member);return;}}
 if(savedPage==="notifications"&&state.user){await openNotifications();return;}
 if(savedPage==="global-members"&&state.user){state.page="global-members";document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page==="discover"));renderGlobalMemberDirectory();await loadGlobalMemberDirectory(true);return;}
 if(savedPage==="community"&&savedCommunity&&state.user){await openCommunity(savedCommunity);if(savedCommunityProfile)await openCommunityMemberProfile(savedCommunityProfile);return;}
 if(tabs.has(savedPage)&&savedPage!=="home"&&(!["bugs","features"].includes(savedPage)||wiredStaffAccess)){const savedSanctuary=savedPage==="pets"?sessionStorage.getItem("wired:sanctuaryView"):null;nav(savedPage);if(savedPage==="store"){const savedStore=sessionStorage.getItem("wired:storeSection");if(["home","profile","yokai","gifts"].includes(savedStore)){wiredStoreSection=savedStore;renderGlobalStore();}}if(savedSanctuary){state.yokaiSanctuaryView=savedSanctuary;sessionStorage.setItem("wired:sanctuaryView",savedSanctuary);if(savedPage==="pets")loadPetParadise().then(()=>{if(state.page==="pets")renderPetParadise()}).catch(()=>{});}return;}
 render();saveWiredRoute()}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
init().catch(e=>{console.error(e);render()});