/** Keep the browser provider matched to the provider registered in Firebase. */
export function appCheckOptions(sdk,configuration=globalThis){
 const key=String(configuration.BSS_FIREBASE_APP_CHECK_KEY||'').trim();
 if(!key)return null;
 const type=configuration.BSS_FIREBASE_APP_CHECK_PROVIDER||'recaptcha-v3';
 const Provider=type==='recaptcha-enterprise'?sdk.ReCaptchaEnterpriseProvider:type==='recaptcha-v3'?sdk.ReCaptchaV3Provider:null;
 if(!Provider)throw new Error('The configured App Check provider is not supported.');
 return {provider:new Provider(key),isTokenAutoRefreshEnabled:true};
}
