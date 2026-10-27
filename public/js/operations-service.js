import {createCommunityAPI} from './community-api.js';
let state={configured:false,user:null,roles:[],error:null},pending;
const listeners=new Set();
export const getAuthState=()=>({...state,roles:[...state.roles]});
export const subscribeAuth=listener=>{listeners.add(listener);listener(getAuthState());return()=>listeners.delete(listener);};
export const friendlyError=error=>error?.message||'The website service could not complete this request.';
export async function initFirebase(){
 if(pending)return pending;
 pending=(async()=>{try{const response=await fetch('/api/admin/session',{credentials:'same-origin',cache:'no-store'}),result=await response.json();if(!response.ok)throw new Error(result.error||'Sign in to your admin workspace.');const roles=result.user.role==='owner'?['super_admin']:['admin'];state={configured:true,user:{...result.user,uid:'admin:'+result.user.id,displayName:result.user.name,roles,emailVerified:true},roles,error:null};}catch(error){state={configured:false,user:null,roles:[],error:friendlyError(error)};}listeners.forEach(fn=>fn(getAuthState()));return getAuthState();})();
 try{return await pending;}finally{pending=null;}
}
export const refreshClaims=initFirebase;
const native=createCommunityAPI({admin:true,user:()=>state.user});
export const {getBackendStatus,getMyProfile,saveMyProfile,approveMembership,getPublicProfiles,getEvents,createEvent,registerForEvent,cancelRegistration,checkInRegistration,getMenu,saveMenuItem,placeFoodOrder,cancelFoodOrder,lookupFoodOrder,advanceFoodOrder,getMyRegistrations,getMyOrders,getStaffOrders,getAdminFoodOrders,getEventRegistrations,getAdminOverview,saveContent,getContent,deleteContent,getStaffAssignment,getCommunityPosts,createCommunityPost,deleteCommunityPost,togglePostHeart,replyToPost,moderatePost,submitCommunityRequest,updateCommunityRequest,getIncomingRequests,getMyRequests,assignStaff,uploadImage}=native;
