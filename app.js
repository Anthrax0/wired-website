/* WIRED website — connected to the existing Supabase project and wired-api Edge Function. */
const SUPABASE_URL = "https://kovvnvvkopqkgjmcvvdw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ptGg0nN4LZbi3Au4jVnB_Q_zaWr1N2X";
const API_BASE = `${SUPABASE_URL}/functions/v1/wired-api`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
const state = {page:"home", user:null, profile:null, communities:[], activeCommunity:null, activeThread:null, threads:[], messages:[], editAccountOpen:false,activeCommunityRole:null,joinRequests:[],discoveryQuery:"",discoveryCategory:"all",discoverySort:"newest"};
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
  const {data,error}=await sb.from("profiles").select("username,id_verified,bio,avatar_url").eq("id",state.user.id).maybeSingle();
  if(error) throw error; state.profile=data;
}
async function loadCommunities(){
  if(!state.user){state.communities=[];return;}
  const data=await api("/communities");state.communities=data.items||[];
}
async function refreshUser(){
  const {data:{session}}=await sb.auth.getSession();
  state.user=session?.user||null;
  if(state.user){await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});}
  else {state.profile=null;state.communities=[];}
  render();
}
function nav(page){state.page=page;state.activeCommunity=null;state.activeThread=null;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));render();if(page==="discover")loadCommunities().then(render).catch(e=>toast(errorText(e)));if(page==="chats")loadThreads();}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
function communityCards(items){
  if(!items.length)return `<div class="empty">No communities to show yet. Create the first one!</div>`;
  return items.map(c=>`<article class="card community-card"><div class="community-cover" ${c.cover_url?`style="background-image:url('${escapeHTML(c.cover_url)}')"`:""}></div><span class="pill">${escapeHTML(c.category||"Community")}</span><h3>${escapeHTML(c.name)}</h3><p>${escapeHTML(c.description||"")}</p><div class="card-actions"><button class="ghost" data-open-community="${escapeHTML(c.id)}">View community</button>${c.joined?`<span class="pill">${c.owner_id===state.user?.id?"Owner":"Joined"}</span>`:c.join_request_status==="pending"?`<span class="pill">Request pending</span>`:c.join_request_status==="declined"?`<span class="pill">Request declined</span>`:`<button class="primary small" data-join-community="${escapeHTML(c.id)}">${c.visibility==="private"?"Request to join":"Join"}</button>`}</div></article>`).join("");
}
function renderDiscoveryResults(){
 const host=$("discoveryResults");if(!host)return;
 const q=state.discoveryQuery.trim().toLowerCase();
 let items=state.communities.filter(c=>(state.discoveryCategory==="all"||c.category===state.discoveryCategory)&&(!q||[c.name,c.description,c.category].some(v=>String(v||"").toLowerCase().includes(q))));
 if(state.discoverySort==="name")items.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));else items.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const count=$("discoveryCount");if(count)count.textContent=`${items.length} ${items.length===1?"community":"communities"} found`;
 host.innerHTML=communityCards(items);
 host.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));
 host.querySelectorAll("[data-join-community]").forEach(b=>b.addEventListener("click",()=>joinCommunity(b.dataset.joinCommunity)));
}
function render(){
 const accountButton=$("accountBtn");if(accountButton)accountButton.textContent=state.user?"My account":"Log in";
 const v=$("view");
 if(state.page==="home"){
  v.innerHTML=`<div class="section-head"><h2>Your WIRED community</h2><span class="pill">18+ only</span></div><div class="grid"><article class="card"><span class="pill">WELCOME</span><h3>${state.user?`Welcome, ${escapeHTML(state.profile?.username||state.user.email||"member")}`:"Stay connected."}</h3><p>Make new friends, discover interests, and find your people.</p></article><article class="card"><span class="pill">DISCOVER</span><h3>Explore something new</h3><p>Browse communities built around what you love.</p><button class="ghost" data-go="discover">Explore →</button></article><article class="card"><span class="pill">CREATE</span><h3>Start a community</h3><p>Bring people together around a shared interest.</p><button class="ghost" data-go="create">Create community →</button></article></div><div class="section-head"><h2>Communities</h2></div>${state.user?`<div class="grid">${communityCards(state.communities.slice(0,3))}</div>`:`<div class="empty">Log in to discover and join WIRED communities.</div>`}`;
 }
 if(state.page==="discover"){
  v.innerHTML=`<div class="section-head"><h2>Discovery</h2><span class="muted">Find your people</span></div><button class="community-action" data-go="create">＋ &nbsp; Create Community <small style="display:block;font-weight:400;color:#bba5d1">Build a space around something you love</small></button>${state.user?`<div class="discovery-tools"><label class="field">Search communities<input id="communitySearch" type="search" value="${escapeHTML(state.discoveryQuery)}" placeholder="Search names, topics, descriptions…"></label><label class="field">Category<select id="communityCategory"><option value="all">All categories</option>${[...new Set(state.communities.map(c=>c.category).filter(Boolean))].sort().map(x=>`<option value="${escapeHTML(x)}" ${state.discoveryCategory===x?"selected":""}>${escapeHTML(x)}</option>`).join("")}</select></label><label class="field">Sort<select id="communitySort"><option value="newest" ${state.discoverySort==="newest"?"selected":""}>Recently added</option><option value="name" ${state.discoverySort==="name"?"selected":""}>Name A–Z</option></select></label></div><p class="hint" id="discoveryCount"></p><div class="grid" id="discoveryResults"></div>`:`<div class="empty">Log in to explore communities.</div>`}`;
 }
 if(state.page==="create"){
  v.innerHTML=`<div class="section-head"><h2>Create a community</h2></div><div class="card form-card"><form id="communityForm"><label class="field">Community name<input id="cName" required maxlength="50" placeholder="e.g. Anime After Dark"></label><label class="field">Description<textarea id="cDesc" required maxlength="500" placeholder="What is your community about?"></textarea></label><label class="field">Community rules<textarea id="cRules" maxlength="3000" placeholder="Set expectations and guidelines for members"></textarea></label><label class="field">Welcome message<textarea id="cWelcome" maxlength="1000" placeholder="A message new members will see"></textarea></label><label class="field">Cover image<input id="cImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><img id="coverPreview" class="preview" alt="Cover preview"></label><label class="field">Category<select id="cCategory" required><option value="">Choose a category</option>${["Anime","Art","Books","Gaming","Lifestyle","Music","Technology","Other"].map(x=>`<option>${x}</option>`).join("")}</select></label><div class="field">Visibility<div class="radio-row"><label><input type="radio" name="visibility" value="public" checked> Public</label><label><input type="radio" name="visibility" value="private"> Private</label></div><p class="hint">Private communities appear in Discovery, but members must be approved before they can view posts.</p></div><button class="primary full">Create community</button><p class="hint">Community details and cover images are saved to your WIRED Supabase project.</p></form></div>`;
 }
 if(state.page==="chats"){
  v.innerHTML=`<div class="section-head"><h2>Messages</h2></div>${state.user?`<div class="card form-card"><form id="dmForm"><label class="field">Start a direct message<input id="dmUsername" required placeholder="WIRED username"></label><button class="primary">Start chat</button></form></div><div class="section-head"><h2>Your conversations</h2></div><div class="grid">${state.threads.map(t=>`<article class="card"><h3>${escapeHTML(t.title||"Conversation")}</h3><p>${escapeHTML(t.last_body||"No messages yet")}</p><button class="ghost" data-open-thread="${escapeHTML(t.id)}">Open chat</button></article>`).join("")||`<div class="empty">No conversations yet.</div>`}</div>`:`<div class="empty">Log in to use WIRED messages.</div>`}`;
 }
 if(state.page==="profile"){
  v.innerHTML=`<div class="section-head"><h2>My profile</h2></div><div class="card"><div class="brand-mark">W</div><h3>${state.user?escapeHTML(state.profile?.username||state.user.email):"Welcome to WIRED"} ${state.profile?.id_verified?`<span class="pill">✓ Verified</span>`:""}</h3><p class="muted">${state.user?escapeHTML(state.profile?.bio||"Your WIRED profile") :"Log in or create an account to set up your profile."}</p><button class="primary" id="profileAuth">${state.user?"Log out":"Log in / Sign up"}</button><div style="margin-top:20px"><span class="pill">18+ COMMUNITY</span> <span class="pill">OPTIONAL ID VERIFICATION</span></div><p class="hint">A verified badge only appears after a trusted identity provider confirms verification. That provider is not connected yet.</p>${state.user?`<div style="margin-top:20px"><button class="primary" id="editAccountBtn" type="button" aria-expanded="${state.editAccountOpen? "true":"false"}">${state.editAccountOpen?"Close account settings":"Edit account"}</button></div><div id="accountSettingsPanel" ${state.editAccountOpen?"":"hidden"}><div class="section-head"><h2>Account settings</h2></div><form id="usernameForm" class="settings-form"><label class="field">Username<input id="settingsUsername" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${escapeHTML(state.profile?.username||"")}" autocomplete="username"></label><button class="primary">Save username</button></form><form id="emailForm" class="settings-form"><label class="field">Email address<input id="settingsEmail" type="email" required value="${escapeHTML(state.user.email||"")}" autocomplete="email"></label><button class="primary">Update email</button><p class="hint">Supabase will send a confirmation email before the new address takes effect.</p></form><form id="passwordForm" class="settings-form"><label class="field">New password<input id="settingsPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><label class="field">Confirm new password<input id="settingsPasswordConfirm" type="password" required minlength="8" autocomplete="new-password" placeholder="Re-enter new password"></label><button class="primary">Change password</button></form><p class="status" id="settingsStatus" aria-live="polite"></p></div>`:""}`;
 }
 v.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
 v.querySelectorAll("[data-open-community]").forEach(b=>b.addEventListener("click",()=>openCommunity(b.dataset.openCommunity)));
 v.querySelectorAll("[data-join-community]").forEach(b=>b.addEventListener("click",()=>joinCommunity(b.dataset.joinCommunity)));
 v.querySelectorAll("[data-open-thread]").forEach(b=>b.addEventListener("click",()=>openThread(b.dataset.openThread)));
 $("communitySearch")?.addEventListener("input",e=>{state.discoveryQuery=e.target.value;renderDiscoveryResults()});
 $("communityCategory")?.addEventListener("change",e=>{state.discoveryCategory=e.target.value;renderDiscoveryResults()});
 $("communitySort")?.addEventListener("change",e=>{state.discoverySort=e.target.value;renderDiscoveryResults()});
 if(state.page==="discover")renderDiscoveryResults();
 $("communityForm")?.addEventListener("submit",createCommunity);$("cImage")?.addEventListener("change",previewImage);
 $("dmForm")?.addEventListener("submit",startDM);
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
async function openCommunity(id){
 try{
  const c=state.communities.find(x=>x.id===id)||{id,name:'Community'};state.activeCommunity=c;state.page='community';state.activeCommunityRole=null;state.joinRequests=[];
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  const role=await api('/communities/'+encodeURIComponent(id)+'/role');state.activeCommunityRole=role.role||null;
  if(state.activeCommunityRole){const d=await api('/communities/'+encodeURIComponent(id)+'/posts');state.posts=d.items||[];if(['owner','mod'].includes(state.activeCommunityRole)){const q=await api('/communities/'+encodeURIComponent(id)+'/requests');state.joinRequests=q.items||[];}}else{state.posts=[];}
  renderCommunity();
 }catch(e){toast(errorText(e));}
}
function renderCommunity(){
 const c=state.activeCommunity,v=$('view'),joined=!!state.activeCommunityRole,manager=['owner','mod'].includes(state.activeCommunityRole);
 let html='<button class="link" id="backDiscover">← Back to Discovery</button><div class="section-head"><div><span class="pill">'+escapeHTML(c.category||'Community')+'</span><h2>'+escapeHTML(c.name)+'</h2><p class="muted">'+escapeHTML(c.description||'')+'</p><span class="pill">'+escapeHTML(c.visibility||'public')+'</span></div></div>';
 if(c.rules)html+='<article class="card"><h3>Community rules</h3><p>'+escapeHTML(c.rules)+'</p></article>';
 if(joined&&c.welcome_message)html+='<article class="card"><h3>Welcome</h3><p>'+escapeHTML(c.welcome_message)+'</p></article>';
 if(joined){html+='<div class="card form-card"><form id="postForm"><label class="field">Post title<input id="postTitle" required maxlength="120" placeholder="Give your post a title"></label><label class="field">What is on your mind?<textarea id="postBody" maxlength="10000" placeholder="Share with your community"></textarea></label><button class="primary">Publish post</button></form></div>';}
 else if(c.join_request_status==='pending')html+='<div class="empty">Your request to join is waiting for approval.</div>';
 else html+='<button class="primary" id="joinFromCommunity">'+(c.visibility==='private'?'Request to join':'Join this community')+'</button>';
 if(manager){html+='<div class="section-head"><h2>Join requests ('+state.joinRequests.length+')</h2></div>';if(state.joinRequests.length){html+=state.joinRequests.map(r=>'<article class="card"><b>'+escapeHTML(r.username||'WIRED member')+'</b><p class="muted">Requested '+new Date(r.created_at).toLocaleDateString()+'</p><div class="card-actions"><button class="primary small" data-approve-request="'+escapeHTML(r.id)+'">Approve</button><button class="ghost" data-decline-request="'+escapeHTML(r.id)+'">Decline</button></div></article>').join('');}else html+='<div class="empty">No pending join requests.</div>';}
 if(joined){html+='<div class="section-head"><h2>Community posts</h2></div>';html+=state.posts.map(p=>'<article class="card post"><div class="meta">'+escapeHTML(p.username||'WIRED member')+' '+(p.id_verified?'✓ Verified':'')+' · '+new Date(p.created_at).toLocaleString()+'</div><h3>'+escapeHTML(p.title||'Post')+'</h3><p>'+escapeHTML(p.body||'')+'</p></article>').join('')||'<div class="empty">No posts yet. Start the conversation!</div>';}
 v.innerHTML=html;
 $('backDiscover').addEventListener('click',()=>nav('discover'));$('joinFromCommunity')?.addEventListener('click',()=>joinCommunity(c.id));$('postForm')?.addEventListener('submit',createPost);
 v.querySelectorAll('[data-approve-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.approveRequest,'approved')));
 v.querySelectorAll('[data-decline-request]').forEach(b=>b.addEventListener('click',()=>reviewJoinRequest(b.dataset.declineRequest,'declined')));
}
async function reviewJoinRequest(id,status){try{await api('/communities/'+encodeURIComponent(state.activeCommunity.id)+'/requests/'+encodeURIComponent(id),'PATCH',{status});toast(status==='approved'?'Member approved.':'Request declined.');await openCommunity(state.activeCommunity.id);}catch(e){toast(errorText(e));}}
async function createPost(e){e.preventDefault();try{await api(`/communities/${encodeURIComponent(state.activeCommunity.id)}/posts`,"POST",{title:$("postTitle").value.trim(),body:$("postBody").value.trim(),kind:"blog"});toast("Post published.");const d=await api(`/communities/${encodeURIComponent(state.activeCommunity.id)}/posts`);state.posts=d.items||[];renderCommunity()}catch(err){toast(errorText(err))}}
async function loadThreads(){if(!state.user)return;try{const d=await api("/threads");state.threads=d.items||[];if(state.page==="chats")render()}catch(e){toast(errorText(e))}}
async function startDM(e){e.preventDefault();try{const d=await api("/threads/dm","POST",{username:$("dmUsername").value.trim()});await loadThreads();await openThread(d.id)}catch(err){toast(errorText(err))}}
async function openThread(id){try{state.activeThread=id;const d=await api(`/threads/${encodeURIComponent(id)}/messages`);state.messages=d.items||[];renderThread()}catch(e){toast(errorText(e))}}
function renderThread(){const v=$("view");const thread=state.threads.find(t=>t.id===state.activeThread);v.innerHTML=`<button class="link" id="backChats">← Back to messages</button><div class="section-head"><h2>${escapeHTML(thread?.title||"Conversation")}</h2></div><div class="chat-log">${state.messages.map(m=>`<article class="card message"><div class="meta">${escapeHTML(m.username||"Member")} · ${new Date(m.created_at).toLocaleString()}</div><p>${escapeHTML(m.body)}</p></article>`).join("")||`<div class="empty">No messages yet.</div>`}</div><form id="messageForm" class="card"><label class="field">Message<textarea id="messageBody" required maxlength="4000" placeholder="Write a message"></textarea></label><button class="primary">Send</button></form>`;$("backChats").addEventListener("click",()=>nav("chats"));$("messageForm").addEventListener("submit",sendMessage)}
async function sendMessage(e){e.preventDefault();try{await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`,"POST",{body:$("messageBody").value.trim()});const d=await api(`/threads/${encodeURIComponent(state.activeThread)}/messages`);state.messages=d.items||[];renderThread()}catch(err){toast(errorText(err))}}
function openAuth(){$("authStatus").textContent="";$("loginForm").hidden=false;$("registerForm").hidden=true;$("authTitle").textContent="Log in";$("authDialog").showModal()}
$("accountBtn").addEventListener("click",()=>state.user?nav("profile"):openAuth());
$("showRegister").addEventListener("click",()=>{$("loginForm").hidden=true;$("registerForm").hidden=false;$("authTitle").textContent="Create account"});
$("showLogin").addEventListener("click",()=>{$("registerForm").hidden=true;$("loginForm").hidden=false;$("authTitle").textContent="Log in"});
$("resendConfirm").addEventListener("click",async()=>{const email=$("loginName").value.trim();if(!email){$("authStatus").textContent="Enter the email address you used to sign up first.";return;}const {error}=await sb.auth.resend({type:"signup",email,options:{emailRedirectTo:window.location.origin+window.location.pathname}});$("authStatus").textContent=error?error.message:"If this account is awaiting confirmation, a fresh verification email has been requested. Check your inbox.";});
$("loginSubmit").addEventListener("click",async()=>{if(!$("loginAdult").checked){$("authStatus").textContent="WIRED is for adults aged 18 or older.";return;}const email=$("loginName").value.trim();if(!email.includes("@")){$("authStatus").textContent="Please sign in with the email address on your WIRED account.";return;}const {error}=await sb.auth.signInWithPassword({email,password:$("loginPassword").value});if(error){$("authStatus").textContent=error.message;return;}$("authDialog").close();toast("Welcome back to WIRED.");await refreshUser()});
$("registerSubmit").addEventListener("click",async()=>{const dob=$("regDob").value;if(!$("regConfirm").checked||!dob){$("authStatus").textContent="Enter your date of birth and confirm it.";return;}const birth=new Date(dob+"T00:00:00");const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setFullYear(cutoff.getFullYear()-18);if(birth>cutoff){$("authStatus").textContent="You must be at least 18 to join WIRED.";return;}const username=$("regUser").value.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username)){$("authStatus").textContent="Username must be 3–24 characters (letters, numbers, underscores).";return;}const {data,error}=await sb.auth.signUp({email:$("regEmail").value.trim(),password:$("regPassword").value,options:{data:{username,date_of_birth:dob},emailRedirectTo:window.location.origin+window.location.pathname}});if(error){$("authStatus").textContent=error.message;return;}if(data.session){$("authDialog").close();toast("Your WIRED account is ready.");await refreshUser();}else{$("authStatus").textContent="Check your email for the confirmation link, then log in to WIRED.";}});
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
async function logout(){await sb.auth.signOut();state.user=null;state.profile=null;state.communities=[];state.threads=[];toast("Logged out.");nav("home")}
sb.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setTimeout(()=>refreshUser().catch(e=>console.warn(e)),0)});
async function init(){const {data:{session}}=await sb.auth.getSession();state.user=session?.user||null;if(state.user){await loadProfile().catch(()=>{});await loadCommunities().catch(()=>{});}render()}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
init().catch(e=>{console.error(e);render()});
