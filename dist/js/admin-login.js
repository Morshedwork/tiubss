import {resolveLoginIdentifier, ADMIN_LOGIN_EMAIL} from './login-identifier.js';

export function administratorAccess(state) {
  if (!state.auth?.user) return 'signed-out';
  const claims = state.roles || state.auth.roles || [];
  if (!claims.some(role => ['admin','super_admin'].includes(role))) return 'unassigned';
  if (state.loading || state.dataErrors?.staff || !state.staffAssignment) return 'unverified';
  return claims.some(role => ['admin','super_admin'].includes(role) && state.staffAssignment.roles?.includes(role)) ? 'granted' : 'unassigned';
}

export function renderAdminLogin(ctx) {
  const state=ctx.store.getState(),user=state.auth?.user,access=administratorAccess(state);
  const panel=user ? `<p class="eyebrow">YOUR SIGNED-IN ACCOUNT</p><h1>${access==='granted'?'Welcome back, organiser.':access==='unverified'?'Checking your access.':'Admin access is not assigned.'}</h1><p class="auth-intro">Signed in as <strong>${ctx.esc(user.email || user.uid)}</strong>.</p>${access==='granted'?'<p>Your account has an active administrator assignment.</p><a href="#/admin" class="btn btn-primary">Open admin workspace ↗</a>':`<p class="auth-notice" role="status">${access==='unverified'?'We could not confirm your current staff assignment yet. Retry when the connection is ready.':'Sign-in succeeded, but this account does not currently have verified administrator access. The Admin username alone does not grant a role.'}</p><button type="button" class="btn btn-primary" data-admin-login-action="refresh">Refresh access</button>`}<div class="admin-login-account-actions"><a href="#/profile" class="text-link">My member dashboard</a><button type="button" class="text-button" data-admin-login-action="switch">Use another account</button></div>` : `<p class="eyebrow">FOR OUR ORGANISING TEAM</p><h1>Admin<br><em>workspace.</em></h1><p class="auth-intro">Sign in to manage TIU BSS events, stalls, members, and shared moments.</p><form id="admin-login-form"><div class="auth-fields"><label class="field"><span>Username</span><input name="identifier" type="text" autocomplete="username" required maxlength="64" placeholder="Admin" aria-describedby="admin-username-help"></label><p id="admin-username-help" class="field-help">Use your administrator username and password.</p><label class="field"><span>Password</span><div class="password-wrap"><input name="password" type="password" required maxlength="128" autocomplete="current-password"><button type="button" data-admin-login-action="show" aria-label="Show password">Show</button></div></label></div><div class="auth-forgot"><button type="button" class="text-button" data-admin-login-action="reset">Forgot admin password?</button></div><button type="submit" class="btn btn-primary auth-submit">Sign in to admin ↗</button><p class="form-error" role="alert" hidden></p></form><p class="privacy-note">For authorised TIU BSS organisers. Your administrator account is separate from your personal member account.</p><p class="auth-bottom"><a href="#/signin">Member sign-in ↗</a></p>`;
  return `<main class="page-container bss-auth-page admin-login-page"><div class="bss-auth-layout"><aside class="bss-auth-story"><p class="eyebrow">TIU BSS · ADMIN WORKSPACE</p><h2>Behind every<br>feeling of home.</h2><p>Your place to bring our community together, from the first hello to the next celebration.</p><img src="assets/reference-peacocks.webp" alt="Colourful Bangladeshi peacock artwork"><span lang="bn">একসাথে, আরও দূর।</span></aside><section class="bss-auth-content">${panel}<p class="form-error" data-admin-login-error role="alert" hidden></p><p class="auth-notice" data-admin-login-message role="status" hidden></p></section></div></main>`;
}

export function mountAdminLogin(ctx) {
  const page=document.querySelector('.admin-login-page'); if(!page)return;
  const form=page.querySelector('#admin-login-form');
  let busy=false;
  const showError=error=>{const box=form?.querySelector('.form-error') || page.querySelector('[data-admin-login-error]');box.textContent=ctx.auth.friendlyError?.(error)||error.message;box.hidden=false;};
  const setBusy=value=>{busy=value;page.dataset.authBusy=String(value);page.setAttribute('aria-busy',String(value));page.querySelectorAll('button').forEach(button=>button.disabled=value);};
  const finish=async expectedUid=>{
    if(ctx.auth.getAuthState().user?.uid!==expectedUid)throw new Error('Your account changed during sign-in. Try again.');
    await ctx.auth.refreshClaims(); await ctx.store.refreshSession();
    if(ctx.auth.getAuthState().user?.uid!==expectedUid || ctx.store.getState().auth?.user?.uid!==expectedUid)throw new Error('Your account changed during sign-in. Try again.');
    if(!page.isConnected)return;
    setBusy(false);
    if(administratorAccess(ctx.store.getState())==='granted')ctx.navigate('/admin');else ctx.render();
  };
  form?.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !form.reportValidity())return;
    const data=new FormData(form);
    try{const email=resolveLoginIdentifier(data.get('identifier'));setBusy(true);const credential=await ctx.auth.signInWithEmail(email,String(data.get('password')));form.elements.password.value='';await finish(credential.user.uid);}
    catch(error){if(page.isConnected)showError(error);}finally{setBusy(false);}
  });
  page.querySelectorAll('[data-admin-login-action]').forEach(button=>button.addEventListener('click',async()=>{
    if(busy)return;
    const action=button.dataset.adminLoginAction;
    if(action==='show'){const input=form.elements.password;input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';button.setAttribute('aria-label',`${button.textContent} password`);return;}
    setBusy(true);
    try{
      if(action==='reset'){await ctx.auth.sendPasswordReset(ADMIN_LOGIN_EMAIL);if(page.isConnected){const message=page.querySelector('[data-admin-login-message]');message.textContent='If the administrator account is active, a password reset link has been sent to its registered email.';message.hidden=false;}}
      else if(action==='refresh'){await finish(ctx.auth.getAuthState().user?.uid);}
      else if(action==='switch'){await ctx.auth.signOut();await ctx.store.refreshSession();if(page.isConnected){setBusy(false);ctx.render();}}
    }catch(error){if(page.isConnected)showError(error);}finally{setBusy(false);}
  }));
}
