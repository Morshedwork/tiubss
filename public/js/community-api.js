/** Same-origin website data. Member identity and the independent admin session stay separate. */
export function createCommunityAPI({admin=false,token=async()=>'',user=()=>null}={}){
 const pending=new Map();
 async function request(path,options={}){
  const privateRequest=path!=='/api/community/public'&&path!=='/api/community/health'&&path!=='/api/site-content',identity=privateRequest?user()?.uid:null;
  if(privateRequest&&!identity)throw new Error(admin?'Sign in to your admin workspace.':'Please sign in to continue.');
  const headers={...options.headers};
  if(!admin&&privateRequest){
   const accessToken=await token();
   // A token refresh can outlive the account that started this request. Check
   // before sending private drafts, not only after the server has changed data.
   if(identity!==user()?.uid)throw new Error('Your account changed. Please retry from your dashboard.');
   headers.Authorization='Bearer '+accessToken;
  }
  if(options.method&&options.method!=='GET')headers[admin?'X-BSS-Admin':'X-BSS-Member']='1';
  const response=await fetch(path,{...options,headers,credentials:admin?'same-origin':'omit',cache:'no-store'});
  let body;try{body=await response.json();}catch{throw new Error('The website service could not respond. Please retry.');}
  if(privateRequest&&identity!==user()?.uid)throw new Error('Your account changed. Please retry from your dashboard.');
  if(!response.ok)throw Object.assign(new Error(body.error||'The request failed.'),{status:response.status});return body;
 }
 const shared=path=>{const key=path+((path==='/api/community/me'||path==='/api/admin/operations')?'|'+(user()?.uid||''): '');if(!pending.has(key)){const p=request(path).finally(()=>{if(pending.get(key)===p)pending.delete(key);});pending.set(key,p);}return pending.get(key);};
 const publicData=()=>shared('/api/community/public'),privateData=()=>shared(admin?'/api/admin/operations':'/api/community/me');
 const call=(action,data)=>request(admin?'/api/admin/operations/action':'/api/community/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
 const owned=(rows)=>(rows||[]).filter(r=>r.uid===user()?.uid);
 const freshRecord=data=>{const result={...data};if(!result.version)delete result.id;return result;};
 return {
  getBackendStatus:()=>shared('/api/community/health'),
  getPublicProfiles:async()=>(await publicData()).members,
  getEvents:async()=>(await publicData()).events,
  getMenu:async eventId=>(await (admin?privateData():publicData())).menu.filter(r=>r.eventId===eventId),
  getCommunityPosts:async()=>(await publicData()).posts,
  getMyProfile:async()=>admin?null:(await privateData()).profile,
  getMyOrders:async()=>owned((await privateData()).orders),
  getMyRegistrations:async()=>owned((await privateData()).registrations),
  getMyRequests:async()=>owned((await privateData()).requests),
  getIncomingRequests:async()=>(await privateData()).requests.filter(r=>r.toUserId===user()?.uid),
  getStaffAssignment:async()=>admin?{roles:user()?.roles||[],eventIds:[],vendorIds:[]}:(await privateData()).assignment,
  getAdminOverview:async()=>{if(!admin)throw new Error('Use the separate admin workspace.');return {...await privateData(),errors:{},limitedTo:0};},
  getAdminFoodOrders:async()=>{if(!admin)throw new Error('Use the separate admin workspace.');return (await privateData()).orders;},
  getStaffOrders:async(eventId,vendorId)=>(await privateData()).orders.filter(r=>r.eventId===eventId&&r.vendorId===vendorId),
  getEventRegistrations:async eventId=>(await privateData()).registrations.filter(r=>r.eventId===eventId),
  getContent:async collection=>{
   if(collection==='vendors')return (await (admin?privateData():publicData())).vendors;
   const cms=await shared('/api/site-content');if(collection==='websiteContent')return [{id:'settings',...cms.settings}];
   const names={photos:'gallery',newsPosts:'news',committeeTerms:'committee',partnerOrganizations:'partners'};
   return (cms[names[collection]||collection]||[]).map(r=>({...r,photoURL:r.image||r.photo||r.logo||r.photoURL||''}));
  },
  saveMyProfile:patch=>call('saveProfile',patch),
  approveMembership:(uid,status)=>call('approveMembership',{uid,status}),
  createEvent:data=>call('saveEvent',freshRecord(data)),
  saveMenuItem:data=>call('saveMenuItem',freshRecord(data)),
  saveContent:(collection,id,data)=>{if(collection!=='vendors')throw new Error('Use the website content section to edit this content.');return call('saveVendor',freshRecord({...data,id}));},
  deleteContent:()=>{throw new Error('Pause the stall to preserve its order history.');},
  registerForEvent:(eventId,requestId)=>call('registerForEvent',{eventId,requestId}),
  cancelRegistration:registrationId=>call('cancelRegistration',{registrationId}),
  checkInRegistration:(registrationId,token)=>call('checkInRegistration',{registrationId,...(token?{token}:{manual:true})}),
  placeFoodOrder:(eventId,items,requestId)=>call('placeFoodOrder',{eventId,items,requestId}),
  cancelFoodOrder:orderId=>call('cancelFoodOrder',{orderId}),
  lookupFoodOrder:data=>call('lookupFoodOrder',data),
  advanceFoodOrder:(orderId,action,token,amountJPY,options={})=>call('advanceFoodOrder',{orderId,action,...(token?{token}:options.manual?{manual:true}:{}),...(amountJPY!==undefined?{amountJPY}:{})}),
  createCommunityPost:data=>call('createCommunityPost',data),
  deleteCommunityPost:id=>call('deleteCommunityPost',{id}),
  togglePostHeart:id=>call('togglePostHeart',{id}),
  replyToPost:(id,body)=>call('replyToPost',{id,body}),
  moderatePost:(id,status)=>call('moderatePost',{id,status}),
  submitCommunityRequest:data=>call('submitCommunityRequest',data),
  updateCommunityRequest:(id,status)=>call('updateCommunityRequest',{id,status}),
  assignStaff:(uid,roles,eventIds=[],vendorIds=[])=>call('assignStaff',{uid,roles,eventIds,vendorIds}),
  uploadImage:async file=>{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG or WebP image up to 5 MB.');const uid=user()?.uid;const result=await request(admin?'/api/admin/operations/upload':'/api/community/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});if(uid!==user()?.uid)throw new Error('Your account changed. Reopen your profile before saving.');return result;}
 };
}
