/* WIRED website — connected to the existing Supabase project and wired-api Edge Function. */
const SUPABASE_URL = "https://kovvnvvkopqkgjmcvvdw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ptGg0nN4LZbi3Au4jVnB_Q_zaWr1N2X";
const API_BASE = `${SUPABASE_URL}/functions/v1/wired-api`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
const state = {page:"home", user:null, profile:null, communities:[], activeCommunity:null, activeThread:null, threads:[], messages:[], editAccountOpen:false,activeCommunityRole:null,joinRequests:[],discoveryQuery:"",discoveryCategory:"all",discoverySort:"newest",realtimeChannel:null,managerOpen:false,moderationMembers:[],moderationReports:[],moderationWarnings:[],moderationActions:[],profileImages:[],profileComments:[],profilePosts:[],viewingProfile:null,profileReturnPage:null,people:[],peopleSearchResults:null,discoverPeopleResults:null,peopleSearchRequest:0,discoverPeopleSearchRequest:0,peopleQuery:"",discoverPeopleQuery:"",incomingRequests:[],outgoingRequests:[],friends:[],profileSocial:{following:[],followers:[],friends:[]},profileSocialTab:"following",relationshipRequests:[],activeRelationship:null,communityCheckinState:{checked_in_today:false,points:0,streak:0},communityLeaderboard:[],leaderboardOpen:false,globalStoreItems:[],globalStorePurchases:[],globalStoreBalance:0,globalStoreEquipped:{}};
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function errorText(e){return e?.message||"Something went wrong. Please try again."}
async function api(path,method="GET",body=null){
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token) throw new Error("Please log in first.");
  const res=await fetch(API_BASE+path,{method,headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+session.access_token},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status}).`);
  return data;
}
async function loadProfile(){
  if(!state.user){state.profile=null;return;}
  const {data,error}=await sb.from("profiles").select("username,id_verified,bio,avatar_url,cover_url,equipped_frame_item_id,equipped_nameplate_item_id,equipped_theme_item_id").eq("id",state.user.id).maybeSingle();
  if(error) throw error; state.profile=data;
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
 const renderOne=x=>'<article class="profile-comment" id="profile-comment-'+escapeHTML(x.id)+'"><div class="profile-comment-top"><strong>'+escapeHTML(x.author?.username||"WIRED member")+'</strong><time>'+escapeHTML(new Date(x.created_at).toLocaleString())+'</time>'+(state.user&&(state.user.id===x.author_id||state.user.id===profileId)?'<button type="button" class="profile-comment-delete" data-delete-profile-comment="'+escapeHTML(x.id)+'" aria-label="Delete comment">Delete</button>':'')+'</div><p>'+escapeHTML(x.body)+'</p>'+(state.user?'<button type="button" class="profile-comment-reply" data-show-reply="'+escapeHTML(x.id)+'">Reply</button><form class="profile-reply-form" data-reply-form="'+escapeHTML(x.id)+'" hidden><textarea name="body" maxlength="1000" rows="2" required placeholder="Write a reply…"></textarea><div class="profile-comment-footer"><span class="hint">Up to 1,000 characters.</span><button class="primary small" type="submit">Send reply</button></div></form>':'')+'<div class="profile-comment-replies">'+rows.filter(r=>r.parent_comment_id===x.id).map(r=>'<article class="profile-comment profile-comment-reply-item"><div class="profile-comment-top"><strong>'+escapeHTML(r.author?.username||"WIRED member")+'</strong><time>'+escapeHTML(new Date(r.created_at).toLocaleString())+'</time>'+(state.user&&(state.user.id===r.author_id||state.user.id===profileId)?'<button type="button" class="profile-comment-delete" data-delete-profile-comment="'+escapeHTML(r.id)+'" aria-label="Delete reply">Delete</button>':'')+'</div><p>'+escapeHTML(r.body)+'</p></article>').join('')+'</div></article>';
 return '<section class="profile-comments" aria-label="Profile comments"><div class="section-head"><h3>Comments</h3><span class="hint">'+roots.length+' '+(roots.length===1?'comment':'comments')+' · '+replyCount+' '+(replyCount===1?'reply':'replies')+'</span></div>'+(state.user?'<form id="profileCommentForm" class="profile-comment-form"><label class="field"><span class="sr-only">Write a comment</span><textarea id="profileCommentBody" maxlength="1000" rows="3" required placeholder="Write a comment on this profile…"></textarea></label><div class="profile-comment-footer"><span class="hint">Be respectful. Up to 1,000 characters.</span><button class="primary" type="submit">Post comment</button></div></form>':'<p class="hint">Log in to leave a comment.</p>')+'<div class="profile-comment-list">'+(roots.length?roots.map(renderOne).join(''):'<p class="empty">No comments yet. Start the conversation.</p>')+'</div></section>';
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
 e.preventDefault();if(!state.user)return;const form=e.currentTarget,body=form.elements.body?.value.trim(),parentId=form.dataset.replyForm;if(!body||!parentId)return;
 const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent="Sending…";}
 try{const {error}=await sb.from("profile_comments").insert({profile_id:profileId,author_id:state.user.id,body,parent_comment_id:parentId});if(error)throw error;
 const comments=await loadProfileComments(profileId);
 if(state.page==="member-profile"&&state.viewingProfile?.id===profileId){state.viewingProfile.comments=comments;renderMemberProfile();}
 else if(state.page==="profile"&&state.user.id===profileId){state.profileComments=comments;render();}
 toast("Reply posted.");
 }catch(err){toast(errorText(err));if(button){button.disabled=false;button.textContent="Send reply";}}
}
async function deleteProfileComment(commentId,profileId){
 if(!commentId||!confirm("Delete this profile comment?"))return;
 try{const {error}=await sb.from("profile_comments").delete().eq("id",commentId);if(error)throw error;const comments=await loadProfileComments(profileId);
 if(state.page==="member-profile"&&state.viewingProfile?.id===profileId){state.viewingProfile.comments=comments;renderMemberProfile();}
 else if(state.page==="profile"&&state.user?.id===profileId){state.profileComments=comments;render();}
 toast("Comment deleted.");
 }catch(err){toast(errorText(err));}
}
async function loadRelationshipData(){
 if(!state.user){state.relationshipRequests=[];state.activeRelationship=null;return;}
 const q=await sb.from("relationship_requests").select("id,requester_id,recipient_id,status,created_at").or("requester_id.eq."+state.user.id+",recipient_id.eq."+state.user.id).order("created_at",{ascending:false});
 if(q.error)throw q.error;const rows=q.data||[],ids=[...new Set(rows.map(r=>r.requester_id===state.user.id?r.recipient_id:r.requester_id))];
 const p=ids.length?await sb.from("profiles").select("id,username").in("id",ids):{data:[],error:null};if(p.error)throw p.error;
 const byId=new Map((p.data||[]).map(x=>[x.id,x]));state.relationshipRequests=rows.map(r=>({...r,person:byId.get(r.requester_id===state.user.id?r.recipient_id:r.requester_id)}));
 state.activeRelationship=state.relationshipRequests.find(r=>r.status==="accepted")||null;
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
 const q=await sb.from("relationship_requests").update({status:status,updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;
 toast(status==="accepted"?"Relationship confirmed on both profiles.":"Relationship status updated.");
 if(state.page==="member-profile"&&state.viewingProfile)await openMemberProfile(state.viewingProfile.id);else{await loadRelationshipData();render();}
}catch(e){toast(errorText(e));}}
function myRelationshipMarkup(){
 const rows=state.relationshipRequests||[],active=state.activeRelationship;
 const incoming=rows.filter(r=>r.status==="pending"&&r.recipient_id===state.user.id);
 const outgoing=rows.filter(r=>r.status==="pending"&&r.requester_id===state.user.id);
 if(!active&&!incoming.length&&!outgoing.length)return "";
 let h='<section class="profile-relationship">';
 if(active){const partner=active.person?.username||"WIRED member";h+='<h2>Relationship status</h2><p>In a relationship with '+escapeHTML(partner)+'</p><button class="ghost" id="relationshipEndOwnBtn">End relationship</button>';}
 else h+='<h2>Relationship requests</h2>';
 if(incoming.length)h+='<h3>Incoming requests</h3>'+incoming.map(r=>'<div class="relationship-request"><span>'+escapeHTML(r.person?.username||"WIRED member")+'</span><button class="primary" data-rel-accept="'+r.id+'">Accept</button><button class="ghost" data-rel-decline="'+r.id+'">Decline</button></div>').join("");
 if(outgoing.length)h+='<h3>Sent requests</h3>'+outgoing.map(r=>'<div class="relationship-request"><span>'+escapeHTML(r.person?.username||"WIRED member")+'</span><button class="ghost" data-rel-cancel="'+r.id+'">Cancel</button></div>').join("");
 return h+'</section>';
}
function relationshipSubtitleMarkup(r, own=false){
 if(!r||r.status!=="accepted")return "";
 const partner=own?(r.person?.username||"WIRED member"):"you";
 return '<p class="profile-relationship-subtitle">In a relationship with '+escapeHTML(partner)+'</p>';
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
 const friendIds=(friendsResult.data||[]).map(x=>x.sender_id===state.user.id?x.recipient_id:x.sender_id);
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
 try{
  state.profileReturnPage=state.page;
  const {data,error}=await sb.from('profiles').select('id,username,bio,avatar_url,cover_url,id_verified,equipped_frame_item_id,equipped_nameplate_item_id,equipped_theme_item_id').eq('id',userId).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('This profile is unavailable.');
  const [{data:comments,error:commentError},{data:follow},{data:friend},{data:relationship},{data:currentRelationship}] = await Promise.all([
   sb.from('profile_comments') .select('id,profile_id,author_id,body,created_at,parent_comment_id').eq('profile_id',userId).order('created_at',{ascending:false}).limit(100),
   sb.from('profile_follows').select('follower_id').eq('follower_id',state.user.id).eq('following_id',userId).maybeSingle(),
   sb.from('friend_requests').select('id,sender_id,recipient_id,status').or('and(sender_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(sender_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').order('created_at',{ascending:false}).limit(1).maybeSingle(),
   sb.from('relationship_requests').select('id,requester_id,recipient_id,status').or('and(requester_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(requester_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').in('status',['pending','accepted']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   sb.from('relationship_requests').select('id,requester_id,recipient_id,status').or('and(requester_id.eq.'+state.user.id+',recipient_id.eq.'+userId+'),and(requester_id.eq.'+userId+',recipient_id.eq.'+state.user.id+')').eq('status','accepted').limit(1).maybeSingle()
  ]);
  if(commentError)throw commentError;
  const commentIds=[...new Set((comments||[]).map(x=>x.author_id))];const {data:commentAuthors,error:authorsError}=commentIds.length?await sb.from('profiles').select('id,username,avatar_url').in('id',commentIds):{data:[],error:null};if(authorsError)throw authorsError;const authorMap=new Map((commentAuthors||[]).map(x=>[x.id,x]));
  state.viewingProfile={...data,comments:(comments||[]).map(x=>({...x,author:authorMap.get(x.author_id)||{username:'WIRED member'}})),isFollowing:!!follow,friendRequest:friend||null,relationshipRequest:relationship||null,currentRelationship:currentRelationship||null};state.page='member-profile';renderMemberProfile();
 }catch(e){toast(errorText(e));}
}
function renderMemberProfile(){
 const p=state.viewingProfile;if(!p)return;
 const v=$('view');const cover=p.cover_url?'url("'+escapeHTML(p.cover_url)+'")':'linear-gradient(120deg,#49246b,#171020 60%,#29133b)';
 const avatar=p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="Profile photo">':'W';
 const fr=p.friendRequest;const friendLabel=fr?.status==='accepted'?'Friends':fr?.status==='pending'?(fr.sender_id===state.user?.id?'Request sent':'Respond to request'):'Add friend';
 v.innerHTML='<button class="link" id="backMemberProfile">← Back</button><div class="profile-cover member-profile-cover" style="background-image:'+cover+'"></div><section class="card profile-custom-card ${p.equipped_theme_item_id?"equipped-profile-theme":""}"><div class="profile-person"><div class="profile-avatar '+(p.equipped_frame_item_id?'equipped-neon-frame':'')+'">'+avatar+'</div><div><h2 class="'+(p.equipped_nameplate_item_id?'equipped-nameplate':'')+' '+(p.equipped_theme_item_id?'equipped-violet-theme':'')+'">'+escapeHTML(p.username||'WIRED member')+(p.id_verified?' <span class="pill">✓ Verified</span>':'')+'</h2>'+relationshipSubtitleMarkup(p.relationshipRequest,false)+'</div></div>'+relationshipMarkup(p)+'<section class="profile-about"><h3>About me</h3><p>'+escapeHTML(p.bio||'This member hasn’t added a biography yet.')+'</p></section><div class="profile-social-actions"><button class="primary" id="profileFollowBtn">'+(p.isFollowing?'Following':'＋ Follow')+'</button><button class="ghost" id="profileFriendBtn">'+friendLabel+'</button>'+(fr?.status==='accepted'?'<button class="ghost" id="profileChatBtn">Message</button>':'')+'</div>'+profileCommentsMarkup(p.id,p.comments)+'</section>';
 attachProfileCommentHandlers(p.id);
 $('backMemberProfile')?.addEventListener('click',()=>{if(state.profileReturnPage==='community'&&state.activeCommunity){state.page='community';renderCommunity()}else nav('people')});
 $('profileFollowBtn')?.addEventListener('click',()=>toggleFollow(p.id));
 $('profileFriendBtn')?.addEventListener('click',()=>handleProfileFriend(p));
 $('profileChatBtn')?.addEventListener('click',()=>startDMByUsername(p.username));
 $('relationshipRequestBtn')?.addEventListener('click',()=>requestRelationship(p.id));
 $('relationshipAcceptBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'accepted'));
 $('relationshipDeclineBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'declined'));
 $('relationshipCancelBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'ended'));
 $('relationshipEndBtn')?.addEventListener('click',()=>relationshipAction(p.relationshipRequest.id,'ended'));
}
async function toggleFollow(userId){
 try{const {data:existing,error}=await sb.from('profile_follows').select('follower_id').eq('follower_id',state.user.id).eq('following_id',userId).maybeSingle();if(error)throw error;
 if(existing){const {error:e}=await sb.from('profile_follows').delete().eq('follower_id',state.user.id).eq('following_id',userId);if(e)throw e;}else{const {error:e}=await sb.from('profile_follows').insert({follower_id:state.user.id,following_id:userId});if(e)throw e;}
 if(state.viewingProfile?.id===userId){state.viewingProfile.isFollowing=!existing;renderMemberProfile();}else{toast(existing?'Unfollowed profile.':'Following profile.');await loadPeople();}
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
async function startDMByUsername(username){try{const d=await api('/threads/dm','POST',{username});await loadThreads();await openThread(d.id);}catch(e){toast(errorText(e));}}
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
 if(!state.user){$('view').innerHTML='<div class="empty">Log in to discover global WIRED profiles and connect with people.</div>';return;}
 const q=state.peopleQuery.trim().toLowerCase();const results=(state.peopleSearchResults||state.people).filter(p=>String(p.username||'').toLowerCase().includes(q));
 const personCard=p=>{const fr=[...state.incomingRequests,...state.outgoingRequests,...state.friends].find(x=>x.sender_id===p.id||x.recipient_id===p.id);const isFollowing=state.peopleFollowing?.has(p.id);const avatar=p.avatar_url?'<img src="'+escapeHTML(p.avatar_url)+'" alt="">':'W';return '<article class="card people-card"><button class="people-person" data-person="'+escapeHTML(p.id)+'"><span class="profile-avatar">'+avatar+'</span><span><b>'+escapeHTML(p.username||'WIRED member')+'</b><small>'+escapeHTML(p.bio||'WIRED member')+'</small></span></button><div class="people-actions"><button class="ghost" data-follow="'+escapeHTML(p.id)+'">'+(isFollowing?'Following':'＋ Follow')+'</button><button class="ghost" data-friend="'+escapeHTML(p.id)+'">'+(fr?.status==='accepted'?'Friends':fr?.status==='pending'?(fr.sender_id===state.user.id?'Requested':'Accept request'):'Add friend')+'</button></div></article>';};
 const list=(rows,empty,allowResponse=false)=>rows.length?rows.map(x=>'<div class="people-request"><span>'+escapeHTML(x.person?.username||'WIRED member')+'</span>'+(allowResponse&&x.status==='pending'?'<button class="ghost" data-accept="'+x.id+'">Accept</button><button class="ghost" data-decline="'+x.id+'">Decline</button>':'')+'</div>').join(''):'<div class="empty">'+empty+'</div>';
 const v=$('view');v.innerHTML='<div class="section-head"><h2>Global people</h2><p>Find and connect with WIRED members everywhere.</p></div><label class="field">Search profiles<input id="peopleSearch" type="search" value="'+escapeHTML(state.peopleQuery)+'" placeholder="Search usernames"></label><div class="people-grid">'+results.map(personCard).join('')+'</div><div class="section-head"><h2>Friend requests</h2></div><div class="card"><h3>Incoming</h3>'+list(state.incomingRequests,'No incoming requests.',true)+'<h3>Sent</h3>'+list(state.outgoingRequests,'No pending requests sent.')+'</div><div class="section-head"><h2>Your friends</h2></div><div class="card">'+(state.friends.length?state.friends.map(x=>'<div class="people-request"><span>'+escapeHTML(x.person?.username||'WIRED member')+'</span><button class="ghost" data-chat="'+escapeHTML(x.person?.username||'')+'">Message</button></div>').join(''):'<div class="empty">Your accepted friends will appear here.</div>')+'</div>';
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
 const item=(state.profileImages||[]).find(x=>x.id===id);if(!item)return;if(!confirm("Remove this photo from your profile?"))return;
 try{const {error}=await sb.from("profile_images").delete().eq("id",id);if(error)throw error;
 const {error:storageError}=await sb.storage.from("profile-media").remove([item.storage_path]);if(storageError)console.warn(storageError);
 state.profileImages=state.profileImages.filter(x=>x.id!==id);toast("Photo removed.");render();}catch(err){toast(errorText(err));}
}
async function loadCommunities(){
  if(!state.user){state.communities=[];return;}
  const data=await api("/communities");state.communities=data.items||[];
}
async function refreshUser(){
  const {data:{session}}=await sb.auth.getSession();
  state.user=session?.user||null;
  if(state.user){await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});await loadProfileSocial().catch(e=>console.warn("Profile social data unavailable",e));}
  else {state.profile=null;state.communities=[];}
  render();
}
function nav(page){state.page=page;state.activeCommunity=null;state.activeThread=null;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));render();if(page==="discover"||page==="communities")loadCommunities().then(render).catch(e=>toast(errorText(e)));if(page==="chats")loadThreads();if(page==="store")loadGlobalStore().then(render).catch(e=>toast(errorText(e)));if(page==="people"||page==="discover")loadPeople().then(()=>{if(state.page==="discover")renderDiscoverPeople();});if(page==="profile"&&state.user)Promise.all([loadProfile(),loadProfileSocial(),loadRelationshipData()]).then(render).catch(e=>toast(errorText(e)));}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
function communityCards(items){
  if(!items.length)return `<div class="empty">No communities to show yet. Create the first one!</div>`;
  return '<div class="amino-community-grid">'+items.map(c=>{
   const cover=c.cover_url||c.icon_url||'';
   const status=c.joined?(c.owner_id===state.user?.id?'Owner':'Joined'):c.join_request_status==='pending'?'Request pending':c.join_request_status==='declined'?'Request declined':'';
   return '<article class="amino-community-card" style="'+(cover?'--community-cover:url(&quot;'+escapeHTML(cover)+'&quot;)':'')+'"><div class="amino-card-shade"></div><div class="amino-community-icon">'+(cover?'<img src="'+escapeHTML(cover)+'" alt="">':'<span>W</span>')+'</div><span class="amino-category">'+escapeHTML(c.category||'Community')+'</span><div class="amino-card-content"><h3>'+escapeHTML(c.name)+'</h3><p>'+escapeHTML(c.description||'')+'</p><div class="amino-card-actions"><button class="amino-enter" data-open-community="'+escapeHTML(c.id)+'">Enter community</button>'+(status?'<span class="amino-status">'+escapeHTML(status)+'</span>':c.visibility==='private'?'<button class="amino-join" data-join-community="'+escapeHTML(c.id)+'">Request</button>':'<button class="amino-join" data-join-community="'+escapeHTML(c.id)+'">Join</button>')+'</div></div></article>';
  }).join('')+'</div>';
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
 const featured=publicItems.filter(c=>!mine.some(m=>m.id===c.id)).slice(0,6);
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
 const data=await api('/store');state.globalStoreItems=data.items||[];state.globalStorePurchases=data.purchases||[];state.globalStoreBalance=Number(data.balance||0);state.globalStoreEquipped=data.equipped||{};
}
async function equipGlobalStoreItem(id){
 try{await api('/store/equip','POST',{item_id:id});await loadProfile();await loadGlobalStore();toast('Cosmetic equipped on your global profile.');render();}
 catch(e){toast(errorText(e));}
}
async function purchaseGlobalStoreItem(id){
 try{
  const result=await api('/store/purchase','POST',{item_id:id});
  await loadGlobalStore();toast('Purchase complete. Your item is now in My purchases.');render();
 }catch(e){toast(errorText(e));}
}
function storeCosmeticType(item){const key=String(item?.sku||item?.name||'').toLowerCase();if(key.includes('frame'))return 'frame';if(key.includes('nameplate'))return 'nameplate';if(key.includes('theme'))return 'theme';return 'generic';}
function storeCosmeticArt(type){
 if(type==='frame')return '<div class="store-preview-avatar equipped-neon-frame"><span>A</span></div>';
 if(type==='nameplate')return '<div class="store-preview-nameplate equipped-nameplate">WIRED <small>@anthrax</small></div>';
 if(type==='theme')return '<div class="store-preview-profile equipped-profile-theme"><div class="store-preview-cover"></div><div class="store-preview-profile-head"><span class="store-preview-mini-avatar">A</span><div><b class="equipped-violet-theme">anthrax</b><small>Global profile</small></div></div><div class="store-preview-bio"><i></i><i></i></div></div>';
 return '<span class="cosmetic-preview-generic">✦</span>';
}
function renderGlobalStore(){
 const v=$('view');if(!state.user){v.innerHTML='<div class="section-head"><h2>Global Store</h2></div><div class="card"><p>Log in to browse the WIRED-wide store and use your points.</p><button class="primary" id="storeLoginBtn">Log in</button></div>';v.querySelector('#storeLoginBtn')?.addEventListener('click',openAuth);return;}
 v.innerHTML='<div class="store-heading"><button class="link" id="storeBack">← Back to Discover</button><div class="section-head"><div><span class="pill">APP-WIDE STORE</span><h2>WIRED Global Store</h2><p>One store for your entire WIRED account. Items and purchases are not tied to individual communities.</p></div><div class="store-wallet"><span>Your points</span><b>◉ '+Number(state.globalStoreBalance||0)+'</b></div></div></div><div class="store-grid">'+(state.globalStoreItems.length?state.globalStoreItems.map(item=>'<article class="card store-item"><div class="store-item-art store-art-'+storeCosmeticType(item)+'">'+storeCosmeticArt(storeCosmeticType(item))+'<span class="store-preview-caption">PROFILE PREVIEW</span></div><span class="pill">'+escapeHTML(item.category||'Digital item')+'</span><h3>'+escapeHTML(item.name)+'</h3><p>'+escapeHTML(item.description||'')+'</p><div class="store-item-buy"><b>◉ '+Number(item.price_points)+' points</b><button class="primary" data-store-buy="'+escapeHTML(item.id)+'" '+(Number(state.globalStoreBalance)<Number(item.price_points)?'disabled':'')+'>Purchase</button></div></article>').join(''):'<div class="empty">The global catalog is being stocked. Check back soon.</div>')+'</div><section class="store-purchases"><div class="section-head"><h2>My purchases</h2><span>Your account inventory</span></div>'+(state.globalStorePurchases.length?state.globalStorePurchases.map(p=>'<article class="store-purchase-row purchase-'+storeCosmeticType(p.global_store_items||p)+'"><span class="store-purchase-icon">'+storeCosmeticArt(storeCosmeticType(p.global_store_items||p))+'</span><div><b>'+escapeHTML(p.global_store_items?.name||'WIRED store item')+'</b><small>'+escapeHTML(p.global_store_items?.description||'')+'</small></div><button class="ghost" data-store-equip="'+escapeHTML(p.item_id)+'">Equip</button></article>').join(''):'<div class="empty">You have not purchased anything yet.</div>')+'</section>';
 v.querySelector('#storeBack')?.addEventListener('click',()=>nav('discover'));
 v.querySelectorAll('[data-store-buy]').forEach(b=>b.addEventListener('click',()=>purchaseGlobalStoreItem(b.dataset.storeBuy)));
 v.querySelectorAll('[data-store-equip]').forEach(b=>b.addEventListener('click',()=>equipGlobalStoreItem(b.dataset.storeEquip)));
}
function isGlobalThread(thread){return !thread.community_id&&!thread.communityId&&thread.type!=="community"&&thread.kind!=="community";}
function render(){
 const accountButton=$("accountBtn");if(accountButton)accountButton.textContent=state.user?"My account":"Log in";
 const v=$("view");
 if(state.page==="home"){
  v.innerHTML=`<div class="section-head"><h2>Your WIRED community</h2><span class="pill">18+ only</span></div><div class="grid"><article class="card"><span class="pill">WELCOME</span><h3>${state.user?`Welcome, ${escapeHTML(state.profile?.username||state.user.email||"member")}`:"Stay connected."}</h3><p>Make new friends, discover interests, and find your people.</p></article><article class="card"><span class="pill">DISCOVER</span><h3>Explore something new</h3><p>Browse communities built around what you love.</p><button class="ghost" data-go="discover">Explore →</button></article><article class="card"><span class="pill">CREATE</span><h3>Start a community</h3><p>Bring people together around a shared interest.</p><button class="ghost" data-go="create">Create community →</button></article></div><div class="section-head"><h2>Communities</h2></div>${state.user?`<div class="grid">${communityCards(state.communities.slice(0,3))}</div>`:`<div class="empty">Log in to discover and join WIRED communities.</div>`}`;
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
 if(state.page==="discover"){
  v.innerHTML=`<div class="discovery-topline"><div><h2>Discover</h2><p>Find your people on WIRED</p></div><button class="discovery-create" data-go="create">＋ Create Community</button></div><section class="global-store-entry card"><div><span class="pill">WIRED-WIDE</span><h2>Global Store</h2><p>Shop app-wide profile cosmetics with your WIRED points. Purchases belong to your account, not a community.</p></div><button class="primary" data-go="store">Open Global Store →</button></section>${state.user?`<section class="discovery-people-search"><div class="section-head"><h2>Find People</h2><span>Search WIRED profiles</span></div><label class="field">Search profiles<input id="discoverPeopleSearch" type="search" value="${escapeHTML(state.discoverPeopleQuery)}" placeholder="Search by username…"></label><div id="discoverPeopleResults" class="people-grid"></div></section><div class="discovery-tools"><label class="field">Search communities<input id="communitySearch" type="search" value="${escapeHTML(state.discoveryQuery)}" placeholder="Search names, topics, descriptions…"></label><label class="field">Category<select id="communityCategory"><option value="all">All categories</option>${[...new Set(state.communities.map(c=>c.category).filter(Boolean))].sort().map(x=>`<option value="${escapeHTML(x)}" ${state.discoveryCategory===x?"selected":""}>${escapeHTML(x)}</option>`).join("")}</select></label></div><section class="discovery-section"><div class="discovery-section-head"><h2>Featured Communities</h2><span>Handpicked spaces to explore</span></div><div class="discovery-shelf" id="featuredCommunities"></div></section><section class="discovery-section"><div class="discovery-section-head"><h2>New Communities</h2><span>Recently created</span></div><div class="discovery-shelf" id="newCommunities"></div></section><section class="discovery-section"><div class="discovery-section-head"><h2>My Communities</h2><span>Your joined spaces</span></div><div class="discovery-shelf" id="myCommunities"></div></section><div class="discovery-all"><div class="section-head"><h2>Explore All Communities</h2><label class="field">Sort<select id="communitySort"><option value="newest" ${state.discoverySort==="newest"?"selected":""}>Recently added</option><option value="name" ${state.discoverySort==="name"?"selected":""}>Name A–Z</option></select></label></div><p class="hint" id="discoveryCount"></p><div class="grid" id="discoveryResults"></div></div>`:`<div class="empty">Log in to discover communities.</div>`}`;
 }
 if(state.page==="create"){
  v.innerHTML=`<div class="section-head"><h2>Create a community</h2></div><div class="card form-card"><form id="communityForm"><label class="field">Community name<input id="cName" required maxlength="50" placeholder="e.g. Anime After Dark"></label><label class="field">Description<textarea id="cDesc" required maxlength="500" placeholder="What is your community about?"></textarea></label><label class="field">Community rules<textarea id="cRules" maxlength="3000" placeholder="Set expectations and guidelines for members"></textarea></label><label class="field">Welcome message<textarea id="cWelcome" maxlength="1000" placeholder="A message new members will see"></textarea></label><label class="field">Cover image<input id="cImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><img id="coverPreview" class="preview" alt="Cover preview"></label><label class="field">Category<select id="cCategory" required><option value="">Choose a category</option>${["Anime","Art","Books","Gaming","Lifestyle","Music","Technology","Other"].map(x=>`<option>${x}</option>`).join("")}</select></label><div class="field">Visibility<div class="radio-row"><label><input type="radio" name="visibility" value="public" checked> Public</label><label><input type="radio" name="visibility" value="private"> Private</label></div><p class="hint">Private communities appear in Discovery, but members must be approved before they can view posts.</p></div><button class="primary full">Create community</button><p class="hint">Community details and cover images are saved to your WIRED Supabase project.</p></form></div>`;
 }
 if(state.page==="chats"){
  v.innerHTML=`<div class="section-head"><h2>Messages</h2></div>${state.user?`<div class="card form-card"><form id="dmForm"><label class="field">Start a direct message<input id="dmUsername" required placeholder="WIRED username"></label><button class="primary">Start chat</button></form><div class="divider"></div><form id="groupForm"><label class="field">Create a group chat<input id="groupUsernames" required placeholder="Enter usernames separated by commas"></label><p class="hint">Add at least two other WIRED members. You can include up to 49 people.</p><button class="primary">Create group chat</button></form></div><div class="section-head"><h2>Global chats</h2></div><div class="grid">${state.threads.filter(isGlobalThread).map(t=>`<article class="card"><h3>${escapeHTML(t.title||"Conversation")}</h3><p>${escapeHTML(t.last_body||"No messages yet")}</p><div class="chat-card-actions"><button class="primary" data-open-thread="${escapeHTML(t.id)}">Open chat</button><button class="chat-delete" type="button" data-delete-thread="${escapeHTML(t.id)}" aria-label="Delete chat">Delete</button></div></article>`).join("")||`<div class="empty">No global chats yet. Start a direct message or group chat above.</div>`}</div>`:`<div class="empty">Log in to use WIRED messages.</div>`}`;
 }
 if(state.page==="member-profile"){renderMemberProfile();return;}
  if(state.page==="profile-social"){renderProfileSocialPage();return;}
 if(state.page==="people"){renderPeople();return;}
 if(state.page==="profile"){
  const cover=state.profile?.cover_url||""; const avatar=state.profile?.avatar_url||"";
  v.innerHTML=`<div class="section-head"><h2>My profile</h2></div><section class="card profile-summary-card profile-unified-card ${state.profile?.equipped_theme_item_id?"equipped-profile-theme":""}">${state.user&&cover?`<div class="profile-cover" style="background-image:url(&quot;${escapeHTML(cover)}&quot;)"></div>`:state.user?`<div class="profile-cover"></div>`:""}<div class="profile-unified-content"><div class="profile-person"><div class="profile-summary-avatar ${state.profile?.equipped_frame_item_id?"equipped-neon-frame":""}">${avatar?`<img src="${escapeHTML(avatar)}" alt="Your profile photo">`:"W"}</div><div><h3 class="${state.profile?.equipped_nameplate_item_id?"equipped-nameplate":""} ${state.profile?.equipped_theme_item_id?"equipped-violet-theme":""}">${state.user?escapeHTML(state.profile?.username||state.user.email):"Welcome to WIRED"} ${state.profile?.id_verified?`<span class="pill">✓ Verified</span>`:""}</h3>${state.user?relationshipSubtitleMarkup(state.activeRelationship,true):""}<p class="muted">${state.user?escapeHTML(state.profile?.bio||"Your WIRED profile"):"Log in or create an account to set up your profile."}</p></div></div>${state.user?profileSocialMarkup():""}${state.user?myRelationshipMarkup():""}${state.user?'<section class="profile-about profile-about-own"><h2>About me</h2><p class="profile-about-text">'+escapeHTML(state.profile?.bio||"Tell the WIRED community a little about yourself.")+'</p><form id="bioForm" class="profile-bio-form"><label class="field">Biography / About me<textarea id="profileBio" maxlength="1000" rows="4" placeholder="Share your interests, hobbies, and a little about yourself…">'+escapeHTML(state.profile?.bio||"")+'</textarea></label><div class="profile-bio-footer"><span class="hint">Up to 1,000 characters. Visible on your public profile.</span><button class="primary" type="submit">Save biography</button></div></form></section>':''}<button class="primary" id="profileAuth">${state.user?"Log out":"Log in / Sign up"}</button><div class="profile-status-pills"><span class="pill">18+ COMMUNITY</span><span class="pill">OPTIONAL ID VERIFICATION</span></div><p class="hint">A verified badge only appears after a trusted identity provider confirms verification. That provider is not connected yet.</p>${state.user?`<div class="profile-upload-row"><label class="profile-upload">Change profile photo<input id="wiredAvatarUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label class="profile-upload">Change cover image<input id="wiredCoverUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label></div>${profileCommentsMarkup(state.user.id,state.profileComments)}<div class="profile-account-settings"><button class="primary" id="editAccountBtn" type="button" aria-expanded="${state.editAccountOpen?"true":"false"}">${state.editAccountOpen?"Close account settings":"Edit account"}</button><div id="accountSettingsPanel" ${state.editAccountOpen?"":"hidden"}><div class="section-head"><h2>Account settings</h2></div><form id="usernameForm" class="settings-form"><label class="field">Username<input id="settingsUsername" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${escapeHTML(state.profile?.username||"")}" autocomplete="username"></label><button class="primary">Save username</button></form><form id="emailForm" class="settings-form"><label class="field">Email address<input id="settingsEmail" type="email" required value="${escapeHTML(state.user.email||"")}" autocomplete="email"></label><button class="primary">Update email</button><p class="hint">Supabase will send a confirmation email before the new address takes effect.</p></form><form id="passwordForm" class="settings-form"><label class="field">New password<input id="settingsPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><label class="field">Confirm new password<input id="settingsPasswordConfirm" type="password" required minlength="8" autocomplete="new-password" placeholder="Re-enter new password"></label><button class="primary">Change password</button></form><p class="status" id="settingsStatus" aria-live="polite"></p></div></div>`:""}</div></section>`;
  $("bioForm")?.addEventListener("submit",saveBiography);
  $("relationshipEndOwnBtn")?.addEventListener("click",()=>{if(state.activeRelationship)relationshipAction(state.activeRelationship.id,"ended")});
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
 $("discoverPeopleSearch")?.addEventListener("input",e=>{state.discoverPeopleQuery=e.target.value;searchGlobalPeople(state.discoverPeopleQuery,"discover");});
 $("communitySearch")?.addEventListener("input",e=>{state.discoveryQuery=e.target.value;renderDiscoveryResults()});
 $("communityCategory")?.addEventListener("change",e=>{state.discoveryCategory=e.target.value;renderDiscoveryResults()});
 $("communitySort")?.addEventListener("change",e=>{state.discoverySort=e.target.value;renderDiscoveryResults()});
 if(state.page==="discover"){renderDiscoveryResults();renderDiscoverPeople();}
 $("communityForm")?.addEventListener("submit",createCommunity);$("cImage")?.addEventListener("change",previewImage);
 $("dmForm")?.addEventListener("submit",startDM);$("groupForm")?.addEventListener("submit",startGroupChat);
 $("profileAuth")?.addEventListener("click",()=>state.user?logout():openAuth());
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
async function openCommunity(id){
 try{
  const c=state.communities.find(x=>x.id===id)||{id,name:'Community'};state.activeCommunity=c;state.page='community';state.activeCommunityRole=null;state.joinRequests=[];state.managerOpen=false;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  const role=await api('/communities/'+encodeURIComponent(id)+'/role');state.activeCommunityRole=role.role||((c.owner_id&&state.user?.id===c.owner_id)?'owner':null);state.communityCheckinState={checked_in_today:false,points:0,streak:0};state.communityLeaderboard=[];state.leaderboardOpen=false;if(state.activeCommunityRole){try{state.communityCheckinState=await api('/communities/'+encodeURIComponent(id)+'/checkin');}catch(checkinError){console.warn('Community check-in status unavailable',checkinError);}}
  if(state.activeCommunityRole){const d=await api('/communities/'+encodeURIComponent(id)+'/posts');state.posts=d.items||[];if(['owner','mod'].includes(state.activeCommunityRole)){const q=await api('/communities/'+encodeURIComponent(id)+'/requests');state.joinRequests=q.items||[];await loadModerationData(id);}else{const {data:members,error:membersError}=await sb.from('community_members').select('user_id,role,banned,banned_until,profiles(username,avatar_url)').eq('community_id',id).order('joined_at',{ascending:true});if(membersError)throw membersError;state.moderationMembers=(members||[]).map(m=>({user_id:m.user_id,role:m.role,banned:!!m.banned&&(!m.banned_until||new Date(m.banned_until)>new Date()),username:m.profiles?.username||'WIRED member',avatar_url:m.profiles?.avatar_url||null}));const {data:warnings,error}=await sb.from('moderation_warnings').select('id,reason,created_at').eq('community_id',id).eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(20);if(error)throw error;state.moderationWarnings=warnings||[];}}else{state.posts=[];state.moderationMembers=[];state.moderationReports=[];state.moderationActions=[];state.moderationWarnings=[];if(state.activeCommunityRole&&state.user){const {data:warnings,error}=await sb.from('moderation_warnings').select('id,reason,created_at').eq('community_id',id).eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(20);if(error)throw error;state.moderationWarnings=warnings||[];}}
  renderCommunity();
 }catch(e){toast(errorText(e));}
}
function renderPostCard(p){
 const options=Array.isArray(p.metadata?.options)?p.metadata.options:[], votes=(p.vote_counts||[]), total=votes.reduce((a,n)=>a+n,0);
 const mediaUrls=Array.isArray(p.metadata?.media_urls)?p.metadata.media_urls:(p.metadata?.media_url?[p.metadata.media_url]:[]);const media=mediaUrls.map((url,i)=>'<img class="post-media" src="'+escapeHTML(url)+'" alt="Post image '+(i+1)+'" loading="lazy">').join('');
 let poll='';if(['poll','quiz'].includes(p.kind)){poll='<div class="poll-options">'+options.map((o,i)=>{const n=votes[i]||0,percent=total?Math.round(n/total*100):0;return '<button class="poll-option '+(p.my_vote===i?'selected':'')+'" data-vote-post="'+escapeHTML(p.id)+'" data-vote-option="'+i+'"><span>'+escapeHTML(o)+'</span><span class="poll-result">'+n+' · '+percent+'%</span><span class="poll-bar" style="width:'+percent+'%"></span></button>';}).join('')+'</div><p class="hint">'+(p.my_vote===null?'Vote to see community results':'Your vote is recorded · '+total+' vote(s)')+'</p>';}
 const icons={like:'👍',love:'❤️',laugh:'😂',wow:'😮',support:'🤝'};const reactions=Object.keys(icons).map(r=>'<button class="reaction '+(p.my_reactions?.includes(r)?'selected':'')+'" data-react-post="'+escapeHTML(p.id)+'" data-reaction="'+r+'">'+icons[r]+' '+(p.reaction_counts?.[r]||0)+'</button>').join('');
 const comments=(p.comments||[]).map(z=>'<div class="comment"><b>'+escapeHTML(z.username||'WIRED member')+'</b><p>'+escapeHTML(z.body)+'</p></div>').join('');
 return '<article class="card post"><div class="meta"><span class="pill">'+escapeHTML(p.kind||'blog')+'</span> '+escapeHTML(p.username||'WIRED member')+' '+(p.id_verified?'✓ Verified':'')+' · '+new Date(p.created_at).toLocaleString()+'</div><h3>'+escapeHTML(p.title||'Post')+'</h3>'+(p.body?'<p>'+escapeHTML(p.body)+'</p>':'')+media+poll+'<div class="post-reactions">'+reactions+'</div><div class="comments"><h4>Comments ('+(p.comments||[]).length+')</h4>'+comments+'<form class="comment-form" data-comment-form="'+escapeHTML(p.id)+'"><input name="comment" required maxlength="4000" placeholder="Write a comment…"><button class="primary small">Send</button></form></div></article>';
}
function renderCommunity(){
 const c=state.activeCommunity,v=$('view'),joined=!!state.activeCommunityRole,manager=['owner','mod'].includes(state.activeCommunityRole);
 const heroImage=c.cover_url||c.icon_url||''; let html='<section class="wired-amino-header"><div class="wired-amino-top"><button class="wired-back" id="backDiscover" aria-label="Back">‹</button><div class="wired-amino-actions"><span class="wired-coin" id="communityPoints">◉ &nbsp;'+Number(state.communityCheckinState.points||0)+' pts</span></div></div><div class="wired-community-identity"><div class="wired-community-avatar">'+(heroImage?'<img src="'+escapeHTML(heroImage)+'" alt="">':'W')+'</div><div class="wired-community-title"><h1>'+escapeHTML(c.name)+'</h1><div><b>'+Number(c.member_count||state.moderationMembers.length||0)+'</b> Members <button type="button" class="wired-leaderboard" id="communityLeaderboardBtn">Leaderboards</button></div></div></div><div class="wired-checkin"><h2>Check in daily to earn points</h2><div class="wired-checkin-track">'+Array.from({length:7},(_,i)=>'<span class="'+(i<Math.min(7,Number(state.communityCheckinState.streak||0))?'earned':'')+'"></span>').join('')+'</div><p class="hint" id="checkinStatus">'+(state.communityCheckinState.checked_in_today?'Checked in today · '+Number(state.communityCheckinState.streak||0)+' day streak':'Earn 10 points for today’s check-in')+'</p><button type="button" class="wired-checkin-button" id="communityCheckinBtn" '+(!joined||state.communityCheckinState.checked_in_today?'disabled':'')+'>'+(state.communityCheckinState.checked_in_today?'Checked In':'Check In')+'</button></div><nav class="wired-community-tabs" aria-label="Community sections"><button class="${(state.communityTab||"featured")==="featured"?"active":""}" data-community-tab="featured">Featured</button><button class="${state.communityTab==="guidelines"?"active":""}" data-community-tab="guidelines">Guidelines</button><button class="${state.communityTab==="latest"?"active":""}" data-community-tab="latest">Latest Feed</button><button class="${state.communityTab==="wiki"?"active":""}" data-community-tab="wiki">Wiki</button><button class="${state.communityTab==="chat"?"active":""}" data-community-tab="chat">Public Chat</button></nav></section><div class="wired-community-description">'+escapeHTML(c.description||'')+'</div>';
 if(state.leaderboardOpen){html+='<section class="card community-leaderboard-panel"><div class="section-head"><h2>Community leaderboard</h2><button type="button" class="ghost small" id="closeCommunityLeaderboard">Close</button></div>'+(state.communityLeaderboard.length?state.communityLeaderboard.map((m,i)=>'<div class="moderation-row"><b>#'+(i+1)+' '+escapeHTML(m.username)+'</b><span>'+Number(m.points)+' points · '+Number(m.checkins)+' check-ins</span></div>').join(''):'<p class="hint">No check-ins yet. Be the first on the leaderboard!</p>')+'</section>';}
 if(c.rules)html+='<article class="card"><h3>Community rules</h3><p>'+escapeHTML(c.rules)+'</p></article>';
 if(joined&&c.welcome_message)html+='<article class="card"><h3>Welcome</h3><p>'+escapeHTML(c.welcome_message)+'</p></article>';
 if(joined){html+='<button class="community-action" id="communityChatBtn">Open community chat <small style="display:block;font-weight:400;color:#bba5d1">Talk with members in real time</small></button><div class="card form-card"><div class="section-head"><h3>Create a post</h3><span class="pill">Share with members</span></div><form id="postForm"><label class="field">Post format<select id="postType"><option value="blog">Blog / text post</option><option value="image">Image post</option><option value="question">Question</option><option value="poll">Poll</option><option value="quiz">Quiz</option><option value="story">Story</option><option value="wiki">Wiki entry</option></select></label><label class="field">Title<input id="postTitle" required maxlength="120" placeholder="Give your post a title"></label><label class="field">Content<textarea id="postBody" maxlength="10000" placeholder="Share with your community"></textarea></label><div id="pollFields" hidden><label class="field">Answer options (one per line)<textarea id="pollOptions" rows="4" placeholder="Option one&#10;Option two&#10;Option three"></textarea></label><div id="quizCorrectWrap" hidden><label class="field">Correct quiz answer<select id="quizCorrectIndex"></select></label></div></div><div id="postImageWrap"><label class="field">Add images (optional)<input id="postImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><p class="hint">Attach up to 5 images · JPG, PNG, WEBP, or GIF · up to 10 MB each</p><div id="postImagePreview" class="post-image-preview"></div></div><button class="primary">Publish to community</button></form></div>';}
 else if(c.join_request_status==='pending')html+='<div class="empty">Your request to join is waiting for approval.</div>';
 else html+='<button class="primary" id="joinFromCommunity">'+(c.visibility==='private'?'Request to join':'Join this community')+'</button>';
 if(manager){
  html+='<button class="community-action manager-launch" id="openCommunityManager">⚙ &nbsp; Community Manager <small style="display:block;font-weight:400;color:#bba5d1">Customize your space and manage your community</small></button>';
  if(state.managerOpen){
   html+='<section class="manager-panel"><div class="manager-heading"><div><span class="eyebrow">WIRED COMMUNITY TOOLS</span><h2>Community Manager</h2><p class="muted">Manage the look, identity, and settings of your community.</p></div><button class="ghost" id="closeCommunityManager">Back to community</button></div><div class="manager-grid"><article class="manager-tile"><span class="manager-icon">✦</span><b>Appearance</b><small>Theme color and community identity</small></article><article class="manager-tile"><span class="manager-icon">☷</span><b>Community details</b><small>Description, category, rules and welcome</small></article><article class="manager-tile"><span class="manager-icon">⌖</span><b>Discovery</b><small>Visibility in WIRED Discovery</small></article><article class="manager-tile"><span class="manager-icon">♙</span><b>Moderation</b><small>Review member requests below</small></article></div><form id="managerSettingsForm" class="manager-settings"><div class="section-head"><h3>Community settings</h3><span class="pill">'+escapeHTML(state.activeCommunityRole)+'</span></div><label class="field">Community name<input value="'+escapeHTML(c.name||'')+'" disabled aria-describedby="managerNameHint"></label><p class="hint" id="managerNameHint">Community renaming will be added in a later manager update.</p><label class="field">Description<textarea id="managerDescription" maxlength="500">'+escapeHTML(c.description||'')+'</textarea></label><label class="field">Category<input id="managerCategory" maxlength="40" value="'+escapeHTML(c.category||'')+'"></label><label class="field">Community rules<textarea id="managerRules" maxlength="3000">'+escapeHTML(c.rules||'')+'</textarea></label><label class="field">Welcome message<textarea id="managerWelcome" maxlength="1000">'+escapeHTML(c.welcome_message||'')+'</textarea></label><label class="field manager-color-field">Community accent color<input id="managerThemeColor" type="color" value="'+(/^#[0-9a-fA-F]{6}$/.test(c.theme_color||'')?c.theme_color:'#8b5cf6')+'"></label><label class="field">Community visibility<select id="managerVisibility"><option value="public" '+(c.visibility==='public'?'selected':'')+'>Public</option><option value="private" '+(c.visibility==='private'?'selected':'')+'>Private</option></select></label><label class="manager-check"><input id="managerDiscoverable" type="checkbox" '+(c.discoverable!==false?'checked':'')+'> Show this community in Discovery</label><button class="primary">Save community settings</button><p class="hint" id="managerSettingsStatus" aria-live="polite"></p></form></section>';
  }
  html+='<div class="section-head"><h2>Join requests ('+state.joinRequests.length+')</h2></div>';if(state.joinRequests.length){html+=state.joinRequests.map(r=>'<article class="card"><b>'+escapeHTML(r.username||'WIRED member')+'</b><p class="muted">Requested '+new Date(r.created_at).toLocaleDateString()+'</p><div class="card-actions"><button class="primary small" data-approve-request="'+escapeHTML(r.id)+'">Approve</button><button class="ghost" data-decline-request="'+escapeHTML(r.id)+'">Decline</button></div></article>').join('');}else html+='<div class="empty">No pending join requests.</div>';}
 if(manager){
  html+='<section class="manager-panel moderation-panel"><div class="manager-heading"><div><span class="eyebrow">COMMUNITY SAFETY</span><h2>Moderation tools</h2><p class="muted">Manage members, review reports, and remove posts that break your rules.</p></div></div>';
  html+='<div class="section-head"><h3>Members ('+state.moderationMembers.length+')</h3></div>';
  html+=state.moderationMembers.map(m=>'<article class="moderation-row"><div class="member-identity">'+(m.avatar_url?'<img class="member-avatar" src="'+escapeHTML(m.avatar_url)+'" alt="">':'<span class="member-avatar member-avatar-fallback">W</span>')+'<button class="profile-member-link" type="button" data-profile-id="'+escapeHTML(m.user_id)+'">'+escapeHTML(m.username||'WIRED member')+'</button><p class="hint">'+escapeHTML(m.role||'member')+(m.banned?' · Banned':'')+'</p></div><div class="card-actions">'+(m.role!=='owner'?'<button class="ghost small" data-member-role="'+escapeHTML(m.user_id)+'" data-next-role="'+(m.role==='mod'?'member':'mod')+'">'+(m.role==='mod'?'Remove moderator':'Make moderator')+'</button><button class="ghost small" data-member-ban="'+escapeHTML(m.user_id)+'" data-banned="'+(m.banned?'true':'false')+'">'+(m.banned?'Unban':'Temporary / permanent ban')+'</button><button class="ghost small" data-member-warning="'+escapeHTML(m.user_id)+'">Issue warning</button>':'<span class="pill">Owner</span>')+'</div></article>').join('')||'<div class="empty">No members found.</div>';
  html+='<div class="section-head"><h3>Open reports ('+state.moderationReports.length+')</h3></div>';
  html+=state.moderationReports.map(r=>'<article class="moderation-row"><div><b>'+escapeHTML(r.reason||'Reported content')+'</b><p class="hint">Post · '+escapeHTML(r.target_id)+'</p></div><div class="card-actions"><button class="ghost small" data-report-resolve="'+escapeHTML(r.id)+'">Resolve</button><button class="primary small" data-report-remove="'+escapeHTML(r.id)+'" data-report-post="'+escapeHTML(r.target_id)+'">Remove post</button></div></article>').join('')||'<div class="empty">No open reports for this community.</div>';
  html+='<div class="section-head"><h3>Community posts · moderation</h3></div>';
  html+=state.posts.map(p=>'<article class="moderation-row"><div><b>'+escapeHTML(p.title||'Post')+'</b><p class="hint">By '+escapeHTML(p.username||'WIRED member')+'</p></div><button class="ghost small" data-moderate-remove-post="'+escapeHTML(p.id)+'">Remove post</button></article>').join('')||'<div class="empty">No posts to moderate.</div>';
  html+='<div class="section-head"><h3>Moderator activity log</h3></div>';html+=state.moderationActions.map(a=>'<article class="moderation-row"><div><b>'+escapeHTML(a.action.replaceAll('_',' '))+'</b><p class="hint">'+new Date(a.created_at).toLocaleString()+'</p><p class="hint">'+escapeHTML(a.details||'')+'</p></div></article>').join('')||'<div class="empty">No moderation activity yet.</div>';html+='<div class="section-head"><h3>Member warnings</h3></div>';html+=state.moderationWarnings.map(w=>'<article class="moderation-row"><div><b>Warning</b><p class="hint">'+escapeHTML(w.reason)+' · '+new Date(w.created_at).toLocaleString()+'</p></div></article>').join('')||'<div class="empty">No warnings issued.</div>';html+='</section>';
 }
 if(joined&&state.moderationWarnings.length&&!manager){html+='<div class="section-head"><h2>Your community warnings</h2></div>';html+=state.moderationWarnings.map(w=>'<article class="moderation-row"><div><b>Moderator warning</b><p class="hint">'+escapeHTML(w.reason)+' · '+new Date(w.created_at).toLocaleString()+'</p></div></article>').join('');}
 const activeTab=state.communityTab||'featured';
 if(joined&&activeTab!=='guidelines'&&activeTab!=='chat'){const feedPosts=activeTab==='wiki'?state.posts.filter(p=>p.post_type==='wiki'||p.type==='wiki'):state.posts;html+='<div class="wired-feed-heading"><h2>'+(activeTab==='wiki'?'Community Wiki':activeTab==='latest'?'Latest Feed':'Featured Posts')+'</h2>'+(joined?'<span>Share something with your community</span>':'')+'</div>';html+=feedPosts.map(renderPostCard).join('')||'<div class="empty">No posts here yet. Be the first to share!</div>';}
 if(activeTab==='guidelines'){html+='<section class="wired-guidelines"><h2>Community Guidelines</h2><p>'+escapeHTML(c.rules||'Be respectful, stay on topic, and help keep this community welcoming for everyone.')+'</p></section>';}
 if(activeTab==='chat'){html+='<section class="wired-guidelines"><h2>Public Chat</h2><p>Join the conversation with community members.</p><button class="primary" id="communityTabChat">Open community chat</button></section>';}
 const memberSidebar=joined?'<aside class="community-sidebar"><section class="member-sidebar-card"><div class="member-sidebar-heading"><h3>Members</h3><span class="pill">'+state.moderationMembers.length+'</span></div><div class="member-sidebar-list">'+state.moderationMembers.map(m=>'<button class="member-sidebar-item" type="button" data-profile-id="'+escapeHTML(m.user_id)+'">'+(m.avatar_url?'<img class="member-avatar" src="'+escapeHTML(m.avatar_url)+'" alt="">':'<span class="member-avatar member-avatar-fallback">W</span>')+'<span class="member-sidebar-name">'+escapeHTML(m.username||'WIRED member')+'<small>'+escapeHTML(m.role==='mod'?'Moderator':m.role==='owner'?'Owner':'Member')+(m.banned?' · Banned':'')+'</small></span></button>').join('')||'<p class="hint">No members yet.</p>'+'</div></section></aside>':'';
 html='<div class="community-layout"><main class="community-main">'+html+'</main>'+memberSidebar+'</div>';
 v.innerHTML=html;
 v.querySelectorAll('[data-community-tab]').forEach(b=>b.addEventListener('click',()=>{state.communityTab=b.dataset.communityTab;if(state.communityTab==='chat'){openCommunityChat(c.id);return;}renderCommunity();}));
 $('communityTabChat')?.addEventListener('click',()=>openCommunityChat(c.id));
 $('communityCheckinBtn')?.addEventListener('click',doCommunityCheckin);
 $('communityLeaderboardBtn')?.addEventListener('click',openCommunityLeaderboard);
 $('closeCommunityLeaderboard')?.addEventListener('click',()=>{state.leaderboardOpen=false;renderCommunity()});
 $('backDiscover').addEventListener('click',()=>nav('discover'));$('openCommunityManager')?.addEventListener('click',()=>{state.managerOpen=true;renderCommunity()});$('closeCommunityManager')?.addEventListener('click',()=>{state.managerOpen=false;renderCommunity()});$('managerSettingsForm')?.addEventListener('submit',saveCommunitySettings);$('joinFromCommunity')?.addEventListener('click',()=>joinCommunity(c.id));$('communityChatBtn')?.addEventListener('click',()=>openCommunityChat(c.id));$('postForm')?.addEventListener('submit',createPost);
 $('postType')?.addEventListener('change',updatePostComposer);$('pollOptions')?.addEventListener('input',updateQuizOptions);$('postImage')?.addEventListener('change',e=>{const host=$('postImagePreview');if(!host)return;const files=Array.from(e.target.files||[]);host.innerHTML=files.slice(0,5).map(f=>'<span>'+escapeHTML(f.name)+'</span>').join(' · ');});updatePostComposer();
 v.querySelectorAll('[data-vote-post]').forEach(b=>b.addEventListener('click',()=>voteOnPost(b.dataset.votePost,Number(b.dataset.voteOption))));
 v.querySelectorAll('[data-react-post]').forEach(b=>b.addEventListener('click',()=>togglePostReaction(b.dataset.reactPost,b.dataset.reaction)));
 v.querySelectorAll('[data-comment-form]').forEach(form=>form.addEventListener('submit',e=>submitPostComment(e,form.dataset.commentForm)));
 v.querySelectorAll('[data-profile-id]').forEach(b=>b.addEventListener('click',()=>openMemberProfile(b.dataset.profileId)));
 v.querySelectorAll('[data-member-role]').forEach(b=>b.addEventListener('click',()=>setMemberRole(b.dataset.memberRole,b.dataset.nextRole)));
 v.querySelectorAll('[data-member-ban]').forEach(b=>b.addEventListener('click',()=>setMemberBanned(b.dataset.memberBan,b.dataset.banned!=='true')));v.querySelectorAll('[data-member-warning]').forEach(b=>b.addEventListener('click',async()=>{const reason=prompt('Enter the reason for this member warning:');if(reason?.trim())try{await issueMemberWarning(b.dataset.memberWarning,reason.trim())}catch(e){toast(errorText(e))}}));
 v.querySelectorAll('[data-report-resolve]').forEach(b=>b.addEventListener('click',()=>resolveCommunityReport(b.dataset.reportResolve)));
 v.querySelectorAll('[data-report-remove]').forEach(b=>b.addEventListener('click',()=>removeReportedPost(b.dataset.reportRemove,b.dataset.reportPost)));
 v.querySelectorAll('[data-moderate-remove-post]').forEach(b=>b.addEventListener('click',()=>moderateRemovePost(b.dataset.moderateRemovePost)));
 v.querySelectorAll('[data-approve-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.approveRequest,'approved')));
 v.querySelectorAll('[data-decline-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.declineRequest,'declined')));
}
async function loadModerationData(communityId){
 const {data:members,error:memberError}=await sb.from('community_members').select('user_id,role,banned,banned_until,profiles(username,avatar_url)').eq('community_id',communityId).order('joined_at',{ascending:true});
 if(memberError)throw memberError;
 state.moderationMembers=(members||[]).map(m=>({user_id:m.user_id,role:m.role,banned:!!m.banned&&(!m.banned_until||new Date(m.banned_until)>new Date()),banned_until:m.banned_until,username:m.profiles?.username||'WIRED member',avatar_url:m.profiles?.avatar_url||null}));const [warnings,actions]=await Promise.all([sb.from('moderation_warnings').select('id,user_id,reason,created_at').eq('community_id',communityId).order('created_at',{ascending:false}).limit(30),sb.from('moderation_actions').select('id,actor_id,target_user_id,action,details,created_at').eq('community_id',communityId).order('created_at',{ascending:false}).limit(40)]);if(warnings.error)throw warnings.error;if(actions.error)throw actions.error;state.moderationWarnings=warnings.data||[];state.moderationActions=actions.data||[];
 const postIds=(state.posts||[]).map(p=>p.id);
 if(!postIds.length){state.moderationReports=[];return;}
 const {data:reports,error:reportError}=await sb.from('reports').select('id,target_id,reason,status,created_at').eq('target_type','post').eq('status','open').in('target_id',postIds.map(String));
 if(reportError)throw reportError;
 state.moderationReports=reports||[];
}
async function logModerationAction(action,targetUserId=null,details=''){const {error}=await sb.from('moderation_actions').insert({community_id:state.activeCommunity.id,actor_id:state.user.id,target_user_id:targetUserId,action,details});if(error)throw error;}async function issueMemberWarning(userId,reason){const {error}=await sb.from('moderation_warnings').insert({community_id:state.activeCommunity.id,user_id:userId,moderator_id:state.user.id,reason});if(error)throw error;await logModerationAction('issue_warning',userId,reason);toast('Warning issued.');await openCommunity(state.activeCommunity.id);}async function setMemberRole(userId,role){try{const {error}=await sb.from('community_members').update({role}).eq('community_id',state.activeCommunity.id).eq('user_id',userId);if(error)throw error;await logModerationAction(role==='mod'?'promote_moderator':'remove_moderator',userId,'Role changed to '+role);toast(role==='mod'?'Moderator added.':'Moderator role removed.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
async function setMemberBanned(userId,banned){try{let banned_until=null;if(banned){const choice=prompt('Ban duration in hours. Enter 0 for a permanent ban.','24');if(choice===null)return;const hours=Number(choice);if(!Number.isFinite(hours)||hours<0||hours>8760){toast('Enter 0 to 8760 hours.');return;}banned_until=hours===0?null:new Date(Date.now()+hours*3600000).toISOString();}const {error}=await sb.from('community_members').update({banned,banned_until}).eq('community_id',state.activeCommunity.id).eq('user_id',userId);if(error)throw error;await logModerationAction(banned?'ban_member':'unban_member',userId,banned?(banned_until?'Temporary ban until '+banned_until:'Permanent ban'):'Ban lifted');toast(banned?'Member banned.':'Member unbanned.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
async function resolveCommunityReport(reportId){
 try{const {error}=await sb.from('reports').update({status:'resolved'}).eq('id',reportId);if(error)throw error;await logModerationAction('resolve_report',null,'Report '+reportId+' resolved');toast('Report resolved.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}
}
async function removeReportedPost(reportId,postId){
 try{const {error:postError}=await sb.from('posts').update({removed:true}).eq('id',postId);if(postError)throw postError;const {error:reportError}=await sb.from('reports').update({status:'resolved'}).eq('id',reportId);if(reportError)throw reportError;await logModerationAction('remove_reported_post',null,'Post '+postId+' removed and report '+reportId+' resolved');toast('Post removed and report resolved.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}
}
async function moderateRemovePost(postId){
 if(!confirm('Remove this post from the community?'))return;
 try{const {error}=await sb.from('posts').update({removed:true}).eq('id',postId);if(error)throw error;await logModerationAction('remove_post',null,'Post '+postId+' removed');toast('Post removed.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}
}
async function saveCommunitySettings(e){
 e.preventDefault();const status=$('managerSettingsStatus');if(status)status.textContent='Saving settings…';
 const payload={description:$('managerDescription').value.trim(),category:$('managerCategory').value.trim()||'Other',rules:$('managerRules').value.trim(),welcome_message:$('managerWelcome').value.trim(),theme_color:$('managerThemeColor').value,visibility:$('managerVisibility').value,discoverable:$('managerDiscoverable').checked};
 try{const updated=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/settings','PATCH',payload);Object.assign(state.activeCommunity,updated);const i=state.communities.findIndex(x=>x.id===updated.id);if(i>=0)Object.assign(state.communities[i],updated);toast('Community settings saved.');renderCommunity();}catch(err){if(status)status.textContent=errorText(err);else toast(errorText(err));}
}
async function reviewJoinRequest(id,status){try{await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/requests/'+encodeURIComponent(id),'PATCH',{status});toast(status==='approved'?'Member approved.':'Request declined.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
let postMediaFile=null;
function postOptions(){return ($('pollOptions')?.value||'').split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).slice(0,8)}
function updateQuizOptions(){const sel=$('quizCorrectIndex');if(!sel)return;const options=postOptions(),prior=sel.value;sel.innerHTML=options.map((x,i)=>'<option value="'+i+'">'+(i+1)+'. '+escapeHTML(x)+'</option>').join('');if(prior&&Number(prior)<options.length)sel.value=prior;}
function updatePostComposer(){const type=$('postType')?.value||'blog';if($('pollFields'))$('pollFields').hidden=!['poll','quiz'].includes(type);if($('quizCorrectWrap'))$('quizCorrectWrap').hidden=type!=='quiz';if($('postImageWrap'))$('postImageWrap').hidden=false;updateQuizOptions();}
async function refreshCommunityPosts(){const d=await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/posts');state.posts=d.items||[];renderCommunity();}
async function createPost(e){e.preventDefault();try{const kind=$('postType').value,metadata={},files=Array.from($('postImage')?.files||[]);if(files.length>5)throw new Error('You can attach up to 5 images to one post.');if(kind==='image'&&!files.length)throw new Error('Choose at least one image for an image post.');if(['poll','quiz'].includes(kind)){metadata.options=postOptions();if(metadata.options.length<2)throw new Error('Add at least two answer options.');if(kind==='quiz')metadata.correct_index=Number($('quizCorrectIndex').value);}
 const urls=[];for(const file of files){if(file.size>10*1024*1024)throw new Error('Each image must be under 10 MB.');const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];if(!ext)throw new Error('Choose JPG, PNG, WEBP, or GIF images.');const path=state.user.id+'/'+crypto.randomUUID()+'.'+ext;const {error:uploadError}=await sb.storage.from('post-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;urls.push(sb.storage.from('post-media').getPublicUrl(path).data.publicUrl);}
 if(urls.length){metadata.media_urls=urls;metadata.media_url=urls[0];}
 await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/posts','POST',{title:$('postTitle').value.trim(),body:$('postBody').value.trim(),kind,metadata});toast('Your '+kind+' has been published.');await refreshCommunityPosts();}catch(err){toast(errorText(err))}}
async function voteOnPost(id,option_index){try{const post=state.posts.find(p=>p.id===id);const result=await api('/posts/'+encodeURIComponent(id)+'/vote','POST',{option_index});if(post?.kind==='quiz')toast(result.correct?'Correct answer!':'Not quite — try another answer.');await refreshCommunityPosts()}catch(e){toast(errorText(e))}}
async function togglePostReaction(id,reaction){try{await api('/posts/'+encodeURIComponent(id)+'/reactions','POST',{reaction});await refreshCommunityPosts()}catch(e){toast(errorText(e))}}
async function submitPostComment(e,id){e.preventDefault();const input=e.currentTarget.elements.comment;try{await api('/posts/'+encodeURIComponent(id)+'/comments','POST',{body:input.value.trim()});await refreshCommunityPosts()}catch(err){toast(errorText(err))}}
async function loadThreads(){if(!state.user)return;try{const d=await api("/threads");state.threads=d.items||[];if(state.page==="chats")render()}catch(e){toast(errorText(e))}}
async function startDM(e){e.preventDefault();try{const d=await api("/threads/dm","POST",{username:$("dmUsername").value.trim()});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function startGroupChat(e){e.preventDefault();try{const usernames=$("groupUsernames").value.split(",").map(x=>x.trim()).filter(Boolean);if(usernames.length<2)throw new Error("Add at least two usernames for a group chat.");const d=await api("/threads/group","POST",{usernames});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function openCommunityChat(id){try{const d=await api("/communities/"+encodeURIComponent(id)+"/chat","POST",{});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function deleteThread(id){const thread=state.threads.find(t=>t.id===id);const name=thread?.title||"this chat";if(!confirm("Delete "+name+" from your chat list? This only removes it from your inbox; other participants keep their copies."))return;try{await api("/threads/"+encodeURIComponent(id)+"/delete","POST",{});if(state.activeThread===id){if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}state.activeThread=null;}await loadThreads();if(state.page==="chats")render();toast("Chat deleted from your inbox.");}catch(e){toast(errorText(e));}}async function openThread(id){try{if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}state.activeThread=id;const d=await api(`/threads/${encodeURIComponent(id)}/messages`);state.messages=d.items||[];renderThread();state.realtimeChannel=sb.channel("wired-thread-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"thread_id=eq."+id},async payload=>{if(state.activeThread!==id)return;const last=state.messages[state.messages.length-1]?.id||0;if(Number(payload.new.id)>last){try{const fresh=await api(`/threads/${encodeURIComponent(id)}/messages?after=${last}`);state.messages=[...state.messages,...(fresh.items||[])];renderThread()}catch(e){console.warn("Message refresh failed",e)}}}).subscribe()}catch(e){toast(errorText(e))}}
function renderThread(){const v=$("view");const thread=state.threads.find(t=>t.id===state.activeThread);v.innerHTML=`<section class="chat-window"><header class="chat-window-header"><button type="button" class="chat-back" id="backChats" aria-label="Back to messages">‹</button><div class="chat-window-title"><span class="chat-window-avatar">W</span><div><h2>${escapeHTML(thread?.title||"Conversation")}</h2><p>WIRED messages</p></div></div><button type="button" class="chat-invite-button" id="inviteFollowersBtn">Invite followers</button></header><section class="chat-invite-panel" id="inviteFollowersPanel" hidden></section><div class="chat-log" id="chatLog">${state.messages.map(m=>`<article class="message-bubble ${m.user_id===state.user?.id||m.sender_id===state.user?.id?"message-own":""}"><div class="meta">${escapeHTML(m.username||"Member")} · ${new Date(m.created_at).toLocaleString()}</div><p>${escapeHTML(m.body)}</p></article>`).join("")||`<div class="empty chat-empty">No messages yet. Say hello to start the conversation.</div>`}</div><form id="messageForm" class="chat-composer"><textarea id="messageBody" required maxlength="4000" rows="1" placeholder="Write a message…" aria-label="Write a message"></textarea><button class="primary" type="submit" aria-label="Send message">Send</button></form></section>`;$("backChats").addEventListener("click",()=>nav("chats"));$("inviteFollowersBtn").addEventListener("click",toggleFollowerInvitePanel);$("messageForm").addEventListener("submit",sendMessage);const log=$("chatLog");if(log)log.scrollTop=log.scrollHeight;$("messageBody")?.focus()}
async function toggleFollowerInvitePanel(){const panel=$("inviteFollowersPanel");if(!panel)return;if(!panel.hidden){panel.hidden=true;return;}panel.hidden=false;panel.innerHTML='<p class="hint">Loading your global followers…</p>';try{const d=await api("/threads/"+encodeURIComponent(state.activeThread)+"/followers");const people=d.items||[];panel.innerHTML='<div class="chat-invite-heading"><strong>Invite your global followers</strong><button type="button" class="chat-invite-close" id="closeFollowerInvite" aria-label="Close">×</button></div>'+(people.length?'<div class="chat-invite-list">'+people.map(p=>'<div class="chat-invite-person"><span>'+escapeHTML(p.username||"WIRED member")+'</span><button type="button" class="primary chat-invite-action" data-invite-follower="'+escapeHTML(p.id)+'">Invite</button></div>').join("")+'</div>':'<p class="hint">No followers available to invite. Only members who follow your global profile appear here.</p>');$("closeFollowerInvite")?.addEventListener("click",()=>{panel.hidden=true;});panel.querySelectorAll("[data-invite-follower]").forEach(btn=>btn.addEventListener("click",()=>inviteGlobalFollower(btn.dataset.inviteFollower,btn)));}catch(e){panel.innerHTML='<p class="hint">'+escapeHTML(errorText(e))+'</p>';}}
async function inviteGlobalFollower(userId,button){if(!userId||!button)return;button.disabled=true;button.textContent="Inviting…";try{await api("/threads/"+encodeURIComponent(state.activeThread)+"/invite","POST",{user_id:userId});button.textContent="Invited";button.classList.add("invited");toast("Follower invited to chat.");}catch(e){button.disabled=false;button.textContent="Invite";toast(errorText(e));}}
async function sendMessage(e){e.preventDefault();const body=$("messageBody").value.trim();if(!body)return;try{await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`,"POST",{body});const d=await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`);state.messages=d.items||[];renderThread()}catch(err){toast(errorText(err))}}
function openAuth(){$("authStatus").textContent="";$("loginForm").hidden=false;$("registerForm").hidden=true;$("authTitle").textContent="Log in";$("authDialog").showModal()}
$("accountBtn").addEventListener("click",()=>state.user?nav("profile"):openAuth());
$("showRegister").addEventListener("click",()=>{$("loginForm").hidden=true;$("registerForm").hidden=false;$("authTitle").textContent="Create account"});
$("showLogin").addEventListener("click",()=>{$("registerForm").hidden=true;$("loginForm").hidden=false;$("authTitle").textContent="Log in"});
$("resendConfirm").addEventListener("click",async()=>{const email=$("loginName").value.trim();if(!email){$("authStatus").textContent="Enter the email address you used to sign up first.";return;}const {error}=await sb.auth.resend({type:"signup",email,options:{emailRedirectTo:window.location.origin+window.location.pathname}});$("authStatus").textContent=error?error.message:"If this account is awaiting confirmation, a fresh verification email has been requested. Check your inbox.";});
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
async function logout(){if(state.realtimeChannel){await sb.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}await sb.auth.signOut();state.user=null;state.profile=null;state.communities=[];state.threads=[];toast("Logged out.");nav("home")}
sb.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setTimeout(()=>refreshUser().catch(e=>console.warn(e)),0)});
async function init(){const {data:{session}}=await sb.auth.getSession();state.user=session?.user||null;if(state.user){await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});await loadProfileSocial().catch(()=>{});}render()}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
init().catch(e=>{console.error(e);render()});