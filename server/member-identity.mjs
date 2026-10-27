import {createRemoteJWKSet,jwtVerify} from 'jose';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),{timeoutDuration:8000});
export async function verifyMemberToken(token,keyResolver=keys){
 const {payload}=await jwtVerify(token,keyResolver,{algorithms:['RS256'],issuer:'https://securetoken.google.com/tiu-bss',audience:'tiu-bss',requiredClaims:['sub','iat','exp','auth_time'],clockTolerance:5});
 const now=Math.floor(Date.now()/1000);
 if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||payload.sub.includes('/')||typeof payload.auth_time!=='number'||payload.auth_time>now+5||typeof payload.iat!=='number'||payload.iat>now+5)throw new Error('Invalid member identity.');
 return {uid:payload.sub,email:typeof payload.email==='string'?payload.email:'',emailVerified:payload.email_verified===true,name:typeof payload.name==='string'?payload.name:'',photoURL:typeof payload.picture==='string'?payload.picture:'',provider:payload.firebase?.sign_in_provider||''};
}
export async function memberIdentity(request){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token||token.length>12000)throw Object.assign(new Error('Sign in to your member account.'),{status:401});
 try{return await verifyMemberToken(token);}catch{throw Object.assign(new Error('Your member session could not be verified. Sign in again.'),{status:401});}
}
