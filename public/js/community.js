import {currentRoute} from './router.js';
import * as auth from './firebase-service.js';
import {safePhotoURL, googlePhotoURL, resolveProfilePhoto, mergeGoogleSignupDraft} from './profile-photo.js';
const directoryState = { query: '', type: 'all', mentors: false };
let wallFilter = 'all';
let wallDeepLinkHandled = false;
globalThis.addEventListener?.('bss:route-changed', () => { if (!currentRoute().includes('wall=1')) wallDeepLinkHandled = false; });
const postCategories = { introduction: 'Introductions', question: 'Questions', moment: 'Shared moments' };
let profileTab = 'overview';
let profileTabAccount = null;
let profileTabChosen = false;
const profileDrafts = new Map();
let activePhotoPreview = null;
const busyPhotoControls = new WeakMap();
let previousAuthUid = null;
auth.subscribeAuth(({user}) => {
  if(previousAuthUid && previousAuthUid !== user?.uid) { profileDrafts.clear(); if(activePhotoPreview)URL.revokeObjectURL(activePhotoPreview); activePhotoPreview=null; profileTabChosen=false; profileTabAccount=null; }
  previousAuthUid=user?.uid || null;
});
let preferredMemberType = 'student';
const types = { student: 'Current Student', alumni: 'Alumni', community: 'Community' };

function state(ctx) { return ctx.store.getState(); }
function esc(ctx, value) { return ctx.esc(String(value ?? '')); }
function list(value) { return Array.isArray(value) ? value : []; }
function memberType(member) { return String(member.type || 'community').toLowerCase(); }
function typeLabel(member) { return types[memberType(member)] || 'Community'; }
function initials(name) { return String(name || 'Member').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
const safePhoto = safePhotoURL;
function avatar(ctx, member, large = false) {
  const color = [...String(member.id || member.name)].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
  const picture = safePhoto(Object.hasOwn(member,'photoURL') ? member.photoURL : member.avatar);
  return `<div class="avatar member-avatar avatar-tone-${color}${large ? ' avatar-large' : ''}" aria-hidden="true">${picture ? `<img src="${esc(ctx, picture)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span data-avatar-initials hidden>${esc(ctx, initials(member.name))}</span>` : `<span>${esc(ctx, initials(member.name))}</span><i></i><b></b>`}</div>`;
}
function publicMembers(ctx) {
  // Only server-produced public projections belong in this directory.
  return list(state(ctx).publicMembers || state(ctx).members).filter(m => m.directoryVisible === true && m.status === 'approved');
}
function memberCard(ctx, m) {
  const details = [m.university, m.employer, m.jobTitle, m.city].filter(Boolean).join(' · ');
  const index = [m.name, m.nameBn, m.university, m.major, m.employer, m.jobTitle, m.city, ...list(m.skills)].join(' ').toLowerCase();
  return `<article class="member-card community-member-card" data-member-type="${esc(ctx, memberType(m))}" data-member-mentor="${m.mentor ? 'true' : 'false'}" data-member-search="${esc(ctx, index)}">
    <div class="member-card-top">${avatar(ctx, m)}<span class="badge badge-soft">${typeLabel(m)}</span></div>
    <h3><a href="/members/${encodeURIComponent(m.id)}">${esc(ctx, m.name)}</a></h3>
    ${m.nameBn ? `<p class="member-bangla" lang="bn">${esc(ctx, m.nameBn)}</p>` : ''}
    <p class="member-role">${esc(ctx, m.jobTitle || m.major || typeLabel(m))}</p>
    <p class="member-meta">${esc(ctx, details || 'Part of our community')}</p>
    <div class="member-skills">${list(m.skills).slice(0, 3).map(skill => `<span>${esc(ctx, skill)}</span>`).join('')}</div>
    <div class="member-card-footer"><span class="mentor-label">${m.mentor ? '<span aria-hidden="true">↗</span> Open to mentoring' : 'Here to connect'}</span><span class="sample-label">Member</span></div>
  </article>`;
}

function noteDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}); }
function wallPost(ctx, post) {
  const profile = state(ctx).profile, loved = list(post.hearts).includes(profile?.id), own = profile?.id === post.userId;
  return `<article class="cw-note cw-note-${esc(ctx, post.category)}" data-wall-category="${esc(ctx, post.category)}" data-post-id="${esc(ctx, post.id)}">
    <div class="cw-note-header"><span class="cw-pin" aria-hidden="true"></span><span class="cw-category">${postCategories[post.category] || 'Community note'}</span><time datetime="${esc(ctx, post.createdAt)}">${esc(ctx, noteDate(post.createdAt))}</time></div>
    <p class="cw-note-body">${esc(ctx, post.body)}</p>
    <div class="cw-author"><span aria-hidden="true">${esc(ctx, initials(post.name))}</span><div><strong>${esc(ctx, post.name)}</strong><small>Community member${post.status === 'hidden' ? ' · hidden by admin' : ''}</small></div></div>
    <div class="cw-note-actions"><button type="button" data-community-action="post-heart" data-id="${esc(ctx, post.id)}" aria-pressed="${loved}" aria-label="${loved ? 'Remove' : 'Add'} appreciation" ${post.status === 'hidden' ? 'disabled' : ''}><span aria-hidden="true">${loved ? '♥' : '♡'}</span> ${list(post.hearts).length} <span>Appreciate</span></button><button type="button" data-community-action="post-reply" data-id="${esc(ctx, post.id)}" ${post.status === 'hidden' ? 'disabled' : ''}>${list(post.replies).length ? list(post.replies).length + ' replies' : 'Reply'} ↗</button>${own ? `<button type="button" data-community-action="post-delete" data-id="${esc(ctx, post.id)}" class="cw-delete">Delete</button>` : ''}</div>
    ${list(post.replies).length ? `<div class="cw-replies">${list(post.replies).map(reply => `<p><strong>${esc(ctx, reply.name)}</strong><span>${esc(ctx, reply.body)}</span></p>`).join('')}</div>` : ''}
  </article>`;
}

function communityWall(ctx) {
  const s = state(ctx), posts = list(s.posts).filter(post => post.status === 'published' || post.userId === s.profile?.id);
  return `<section class="cw-section" id="community-wall" aria-labelledby="wall-title">
    <header class="cw-heading"><div><p class="eyebrow">OUR LITTLE CORNER OF THE INTERNET</p><h2 id="wall-title">The adda wall.<br><em>Pull up a chair.</em></h2></div><p>A hello, a question, a small happy moment. It’s the little things that make a place feel like ours.</p></header>
    <div class="cw-layout"><aside class="cw-welcome"><figure><img src="assets/reference-peacocks.webp" alt="Your reference artwork of two painted peacocks and pink flowers" loading="lazy"><figcaption>Colour from home. Conversations from everywhere.</figcaption></figure><div class="cw-welcome-body"><span lang="bn">চলো, আড্ডা হোক!</span><h3>What’s your story?</h3><p>New to Japan? Missing your favourite fuchka? Found a great study spot? There’s a conversation waiting.</p><button class="btn btn-primary" data-community-action="post-compose">Leave a little note <span aria-hidden="true">↗</span></button><small>Share with the BSS community. Please keep personal contact details out of public notes.</small></div></aside>
    <div class="cw-board"><div class="cw-filters" role="group" aria-label="Community note categories">${Object.entries({all: 'All notes', ...postCategories}).map(([key, label]) => `<button type="button" data-community-action="post-filter" data-filter="${key}" class="${wallFilter === key ? 'active' : ''}" aria-pressed="${wallFilter === key}">${label}</button>`).join('')}</div><p class="cw-results" id="wall-results" aria-live="polite">${posts.length} ${posts.length === 1 ? 'note' : 'notes'} in our community</p><div class="cw-note-grid" id="wall-notes">${posts.map(post => wallPost(ctx, post)).join('')}</div>
    <div class="cw-first-note" id="wall-empty" ${posts.length ? 'hidden' : ''}><img src="assets/rickshaw-flower.svg" alt="" aria-hidden="true"><p class="eyebrow">EVERY FRIENDSHIP STARTS SOMEWHERE</p><h3 id="wall-empty-title">Yours could be the first hello.</h3><p>Try one of these conversation starters.</p><div class="cw-prompts"><button data-community-action="post-compose" data-category="introduction">“A little about me…” <span>Introduce yourself ↗</span></button><button data-community-action="post-compose" data-category="question">“Does anyone know…” <span>Ask the community ↗</span></button><button data-community-action="post-compose" data-category="moment">“Today felt like home…” <span>Share a moment ↗</span></button></div></div></div></div>
  </section>`;
}

function communityCorner(ctx, p) {
  const count = list(state(ctx).posts).filter(post => post.userId === p.id).length;
  return `<section class="cw-profile-corner"><img src="assets/reference-flowers.webp" alt="Hand-painted red flower from your artwork references" loading="lazy"><div><p class="eyebrow">A COMMUNITY IS MADE OF LITTLE HELLOS</p><h3>Leave your mark.</h3><p>${count ? `You’ve left ${count} ${count === 1 ? 'note' : 'notes'} on the adda wall.` : 'Share an introduction, ask a question, or celebrate a little moment on the adda wall.'}</p><a href="/community" class="btn btn-secondary">Visit the adda wall ↗</a></div></section>`;
}

export function renderCommunity(ctx, alumniOnly = false) {
  const s=state(ctx),directoryError=s.dataErrors?.members||s.dataErrors?.connection;
  const members = directoryError?[]:publicMembers(ctx).filter(m => !alumniOnly || memberType(m) === 'alumni');
  return `<main class="page-container community-page">
    <header class="page-heading community-heading"><div><p class="eyebrow">${alumniOnly ? 'ONCE A PART. ALWAYS A PART.' : 'ROOTS IN BANGLADESH. CONNECTIONS EVERYWHERE.'}</p><h1>${alumniOnly ? 'Our alumni.<br><em>Our next chapter.</em>' : 'Find your people.<br><em>Grow together.</em>'}</h1><p>${alumniOnly ? 'Meet the graduates carrying our community into new cities, careers, and possibilities.' : 'Students, alumni, and friends—bringing their stories, skills, and a little piece of home.'}</p></div><div class="community-heading-note"><span class="community-rosette" aria-hidden="true">✳</span><p>Different paths.<br><strong>One community.</strong></p></div></header>
    <div class="community-intro-strip"><p><strong>A directory built on choice.</strong> Members decide whether their profile appears here. Contact details stay private.</p><a class="btn btn-secondary" href="/join">Join the community <span aria-hidden="true">↗</span></a></div>
    ${!alumniOnly ? communityWall(ctx) : ''}
    <div class="cw-directory-title"><p class="eyebrow">FAMILIAR FACES. NEW POSSIBILITIES.</p><h2>${alumniOnly ? 'Meet the alumni.' : 'Find your people.'}</h2></div>
    <div class="directory-sample-notice"><span class="sample-label">Our community</span> Members choose which details to share here. Connection requests stay in the community inbox.</div>
    ${s.profile?.status==='pending'?`<div class="directory-sample-notice" role="status"><strong>Your membership is awaiting approval.</strong> ${s.profilePending?'Finish and save your profile to submit it for review.':'The team will review your submitted profile. It will appear here once approved, complete, and opted in.'} <a href="/profile">My profile ↗</a></div>`:''}
    <section aria-label="Find community members">
      ${directoryError?'<div class="empty-state" role="alert"><h3>The community directory could not load.</h3><p>Your profile may still be saved. Retry to check the latest public listings.</p><button class="btn btn-primary" data-community-action="refresh-directory">Retry directory</button></div>':''}
      <div ${directoryError?'hidden':''}>
      <div class="toolbar directory-toolbar"><label class="directory-search"><span class="sr-only">Search members by name, university, skill, employer, or city</span><input class="search-input" type="search" id="community-search" placeholder="Search a name, skill, university, or city…" value="${esc(ctx, directoryState.query)}"><span aria-hidden="true">⌕</span></label><div class="directory-filters" role="group" aria-label="Member filters">${!alumniOnly ? ['all', 'student', 'alumni', 'community'].map(type => `<button class="filter-chip ${directoryState.type === type ? 'active' : ''}" data-community-action="filter" data-filter="${type}" aria-pressed="${directoryState.type === type}">${type === 'all' ? 'Everyone' : types[type]}</button>`).join('') : ''}<button class="filter-chip ${directoryState.mentors ? 'active' : ''}" data-community-action="mentors" aria-pressed="${directoryState.mentors}">Open to mentoring</button></div></div>
      <div class="directory-results-line"><p id="community-results" aria-live="polite">${members.length} ${members.length === 1 ? 'person' : 'people'} to discover</p><span>Community, beyond campus</span></div>
      <div class="member-grid community-grid" id="community-grid" data-alumni-only="${alumniOnly}">${members.map(m => memberCard(ctx, m)).join('')}</div>
      <div class="empty-state directory-empty" id="community-empty" hidden><span aria-hidden="true">⌕</span><h3>No people found</h3><p>Try a different name, skill, or city, or clear the filters.</p><button class="btn btn-secondary" data-community-action="clear-filters">Clear filters</button></div>
    </div></section>
    <section class="community-callout"><div><p class="eyebrow">A LITTLE GUIDANCE GOES A LONG WAY</p><h2>Your experience could be<br>someone’s beginning.</h2><p>Share what you’ve learned. Make your profile available for mentorship.</p></div><a class="btn btn-primary" href="${state(ctx).profile ? '/profile' : '/join'}">Become a mentor <span aria-hidden="true">↗</span></a></section>
  </main>`;
}

export function renderMember(ctx, id) {
  const m = publicMembers(ctx).find(item => item.id === id);
  if (!m) return `<main class="page-container"><div class="empty-state"><h1>This profile isn’t available</h1><p>It may be private or awaiting approval.</p><a class="btn btn-primary" href="/community">Explore the community</a></div></main>`;
  const own = state(ctx).profile?.id === m.id;
  return `<main class="page-container member-detail-page"><a class="back-link" href="/community">← Back to community</a><div class="profile-cover"><span class="cover-circle"></span><span class="cover-art" aria-hidden="true">✳</span><p lang="bn">শেকড়ে বাংলাদেশ, স্বপ্নে পৃথিবী</p></div><section class="member-detail-header">${avatar(ctx, m, true)}<div><div class="member-title-line"><span class="badge badge-soft">${typeLabel(m)}</span><span class="sample-label">Member</span></div><h1>${esc(ctx, m.name)}</h1>${m.nameBn ? `<p class="member-bangla" lang="bn">${esc(ctx, m.nameBn)}</p>` : ''}<p>${esc(ctx, [m.jobTitle || m.major, m.employer || m.university, m.city].filter(Boolean).join(' · '))}</p></div><div class="member-detail-actions">${own ? '<a class="btn btn-primary" href="/profile">Edit my profile</a>' : `<button class="btn btn-primary" data-community-action="connect" data-member-id="${esc(ctx, m.id)}">Say hello <span aria-hidden="true">↗</span></button>${m.mentor ? `<button class="btn btn-secondary" data-community-action="mentor" data-member-id="${esc(ctx, m.id)}">Request mentorship</button>` : ''}`}</div></section>
    <div class="member-detail-layout"><section class="panel member-about"><p class="eyebrow">A LITTLE ABOUT ME</p><h2>My story</h2><p class="bio-text">${esc(ctx, m.bio || 'This member is still writing their story.')}</p><h3>What I bring</h3><div class="member-skills member-skills-large">${list(m.skills).length ? list(m.skills).map(skill => `<span>${esc(ctx, skill)}</span>`).join('') : '<p>Skills coming soon.</p>'}</div>${m.mentor ? '<div class="mentor-callout"><span aria-hidden="true">↗</span><div><strong>Open to mentoring</strong><p>Happy to share experiences, exchange ideas, and help someone take their next step.</p></div></div>' : ''}</section><aside class="panel member-facts"><p class="eyebrow">THE DETAILS</p>${fact(ctx, 'Education', m.university)}${fact(ctx, 'Field of study', m.major)}${fact(ctx, 'Current semester',semesterLabel(m.semester))}${fact(ctx, 'Graduation', m.graduation)}${fact(ctx, 'Work', m.employer)}${fact(ctx, 'Role', m.jobTitle)}${fact(ctx, 'Based in', m.city)}<div class="dashboard-social-links">${profileLinks(ctx,m)}</div><p class="privacy-note">Contact information stays private. These are the details this member chose to share.</p></aside></div>
  </main>`;
}

function fact(ctx, label, value) { return value ? `<div class="member-fact"><span>${label}</span><strong>${esc(ctx, value)}</strong></div>` : ''; }
function input(ctx, label, name, value = '', extra = '', type = 'text') { return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(ctx, value)}" ${extra}></label>`; }
const socialFields = [['linkedin','LinkedIn','https://www.linkedin.com/in/…'],['instagram','Instagram','https://www.instagram.com/…'],['facebook','Facebook','https://www.facebook.com/…'],['website','Website or portfolio','https://…']];
const publicChoices = [['photoURL','Profile picture'],['bio','Short bio'],['city','City'],['university','University'],['major','Field of study'],['semester','Current semester'],['graduationYear','Graduation year'],['company','Company'],['jobTitle','Job title'],['skills','Skills'],['mentor','Mentoring preference'], ...socialFields.map(([key,label])=>[key,label])];
const validPhone = value => /^\+?[0-9 ().-]+$/.test(String(value||'').trim()) && String(value||'').replace(/\D/g,'').length >= 7 && String(value||'').replace(/\D/g,'').length <= 15;
export function profileRequirements(profile = {}) {
  const type=profile.type || profile.membershipType || 'student';
  const items=[['name','Full name',Boolean(String(profile.name||'').trim()) && String(profile.name||'').trim().length<=80],['email','Email address',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email||'')],['phone','Contact number',validPhone(profile.phone)],['bio','Short bio',String(profile.bio||'').trim().length>=10 && String(profile.bio||'').trim().length<=500]];
  if(type==='student'||type==='alumni')items.push(['university','University',Boolean(String(profile.university||'').trim())]);
  if(type==='student')items.push(['major','Field of study',Boolean(String(profile.major||'').trim())],['semester','Current semester',Number.isInteger(Number(profile.semester))&&Number(profile.semester)>=1&&Number(profile.semester)<=13]);
  if(type==='alumni')items.push(['graduation','Graduation year',Number.isInteger(Number(profile.graduation||profile.graduationYear))&&Number(profile.graduation||profile.graduationYear)>=1950&&Number(profile.graduation||profile.graduationYear)<=2100]);
  const missing=items.filter(([, , complete])=>!complete);
  return {items,missing,complete:missing.length===0,percent:Math.round((items.length-missing.length)/items.length*100)};
}
export function validateProfileDetails(profile) {
  const missing=profileRequirements(profile).missing;
  if(missing.length)return missing[0][0]==='phone'?'Enter a contact number with 7–15 digits, including your country code if applicable.':missing[0][0]==='bio'?'Write a short bio between 10 and 500 characters.':`Please complete ${missing[0][1].toLowerCase()}.`;
  for(const [key,label] of socialFields)if(profile[key]&&!safePhoto(profile[key]))return `Use a complete HTTPS URL without a username or password for ${label}.`;
  return '';
}
function semesterLabel(value) { return Number(value)===13?'Semester 13+':Number(value)>=1&&Number(value)<=12?`Semester ${Number(value)}`:''; }
function profileLinks(ctx,p) { return socialFields.filter(([key])=>safePhoto(p[key])).map(([key,label])=>`<a href="${esc(ctx,safePhoto(p[key]))}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`).join(''); }
function completionCard(ctx,p) {
  const completion=profileRequirements(p);
  return `<section class="panel profile-completion"><div><p class="eyebrow">YOUR MEMBER DETAILS</p><h3>${completion.complete?'Your onboarding details are complete.':`Your profile is ${completion.percent}% complete.`}</h3><p>${completion.complete?'Keep your semester, contact details, and introduction up to date.':'Complete the required details below. Social links and your picture are optional.'}</p></div><div class="completion-bar" role="progressbar" aria-label="Required profile details complete" aria-valuenow="${completion.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${completion.percent}%"></span></div><ul class="onboarding-checklist">${completion.items.map(([key,label,complete])=>`<li class="${complete?'is-complete':''}"><span aria-hidden="true">${complete?'✓':'○'}</span>${label}<small>${complete?'Added':'Needed'}</small></li>`).join('')}</ul><button class="btn btn-secondary" data-community-action="profile-tab" data-tab="edit">${completion.complete?'Manage my details':'Complete my profile'} ↗</button></section>`;
}
function profileSummary(ctx,p) {
  const edit=(label)=>`<button class="text-button" data-community-action="profile-tab" data-tab="edit">${label} ↗</button>`;
  return `<section class="dashboard-details" aria-label="Manage member details"><article class="panel"><p class="eyebrow">STUDY & MEMBERSHIP</p><h3>${esc(ctx,typeLabel(p))}</h3>${fact(ctx,'Current semester',memberType(p)==='student'?semesterLabel(p.semester):'')}${fact(ctx,'University',p.university)}${fact(ctx,'Field of study',p.major)}${fact(ctx,'Graduation',p.graduation)}${edit('Edit study details')}</article><article class="panel"><p class="eyebrow">PRIVATE CONTACT</p><h3>Stay in touch.</h3>${fact(ctx,'Account email',p.email)}${fact(ctx,'Contact number',p.phone||'Add your number')}<p class="privacy-note">Email and phone are visible to you and authorized administrators. They never appear in the public directory.</p>${edit('Manage contact details')}</article><article class="panel"><p class="eyebrow">YOUR INTRODUCTION</p><h3>Short bio</h3><p class="bio-text">${esc(ctx,p.bio||'Introduce yourself in 10–500 characters.')}</p>${edit('Edit short bio')}</article><article class="panel"><p class="eyebrow">YOUR LINKS</p><h3>Find me online.</h3><div class="dashboard-social-links">${profileLinks(ctx,p)||'<p>Add your social or portfolio links when you’re ready.</p>'}</div><p class="privacy-note">Social links are optional. Choose each link’s directory visibility in Edit profile.</p>${edit('Manage social links')}</article></section>`;
}
function photoEditor(ctx, p = {}) {
  const user=auth.getAuthState().user, resolved=resolveProfilePhoto(p,user), picture=safePhoto(resolved.photoURL), googlePicture=googlePhotoURL(user);
  const source=p.photoSource || (picture ? resolved.photoSource || 'custom' : user ? resolved.photoSource || 'none' : '');
  const status=source==='google'?'Using your Google picture. You can change it below.':source==='none'?'No profile picture. Your initials appear instead.':picture?'Your saved picture.':'Optional — Google sign-in uses your Google picture automatically.';
  return `<div class="profile-photo-editor"><div class="profile-photo-preview" data-photo-preview>${picture ? `<img src="${esc(ctx,picture)}" alt="Current profile picture" referrerpolicy="no-referrer">` : `<span aria-hidden="true">${esc(ctx,initials(p.name || 'BSS'))}</span>`}</div><div><strong>Your profile picture</strong><p>Choose a JPG, PNG, or WebP smaller than 5 MB. Save your profile to apply changes.</p><div class="photo-actions"><label class="btn btn-secondary btn-small">${picture?'Change picture':'Choose picture'}<input class="sr-only" type="file" name="profilePhoto" accept="image/jpeg,image/png,image/webp"></label>${googlePicture?'<button type="button" class="text-button" data-photo-google>Use Google picture</button>':''}<button type="button" class="text-button" data-photo-remove>Remove picture</button></div><small data-photo-status aria-live="polite">${status}</small></div><input type="hidden" name="photoURL" value="${esc(ctx,picture)}"><input type="hidden" name="photoSource" value="${esc(ctx,source)}"></div>`;
}
function profileFields(ctx, profile = {}, signup = false) {
  const selected = profile.type || 'student', student=selected==='student', alumni=selected==='alumni';
  const visible = new Set(list(profile.publicFields));
  return `${photoEditor(ctx,profile)}<div class="onboarding-guide"><strong>A few details, then you’re home.</strong><p>Fields marked * are required. Contact details stay private. Pictures and social links are optional.</p></div><div class="form-section-heading"><span>01</span><div><h3>Your place in BSS</h3><p>Keep your roots close, wherever your next chapter takes you.</p></div></div><fieldset class="member-kind"><legend class="sr-only">Membership type</legend>${Object.entries(types).map(([value,label])=>`<label class="member-kind-card"><input type="radio" name="type" value="${value}" ${selected===value?'checked':''} required><span><b>${label}</b><small>${value==='student'?'Studying at TIU today':value==='alumni'?'A graduate, always connected':'A friend of our community'}</small></span></label>`).join('')}</fieldset><div class="form-grid">${input(ctx, 'Full name *', 'name', profile.name, 'required maxlength="80" autocomplete="name"')}${input(ctx, 'Name in Bangla', 'nameBn', profile.nameBn, 'maxlength="80" lang="bn"')}${input(ctx, 'Email address * · private', 'email', profile.email || auth.getAuthState().user?.email, `required maxlength="160" autocomplete="email" ${signup?'':'readonly'}`, 'email')}${input(ctx,'Contact number * · private','phone',profile.phone,'required maxlength="30" autocomplete="tel" inputmode="tel" placeholder="+81 90 1234 5678" aria-describedby="phone-help"','tel')}<p id="phone-help" class="field-help form-span-2">Use 7–15 digits. Spaces, brackets, dots, hyphens, and a leading + are accepted. TIU BSS uses this number to contact you; it stays out of the directory.</p>${input(ctx, 'Based in', 'city', profile.city, 'maxlength="80" placeholder="Tokyo, Japan"')}<label class="field form-span-2"><span>Short bio *</span><textarea name="bio" rows="3" required minlength="10" maxlength="500" aria-describedby="bio-help" placeholder="What are you studying or working on? Share your interests and what brings you to BSS.">${esc(ctx, profile.bio)}</textarea><small id="bio-help" class="field-help"><span data-bio-count>${String(profile.bio||'').length}</span>/500 characters · at least 10</small></label></div>
    <div class="form-section-heading"><span>02</span><div><h3 data-study-heading>${alumni?'Your TIU chapter':'Your studies'}</h3><p data-study-help>${student?'Tell us what you study and your current semester.':alumni?'Share your university and graduation year.':'Share any education details you’d like to add.'}</p></div></div><div class="form-grid">${input(ctx, 'University or school'+(student||alumni?' *':''), 'university', profile.university || 'Tokyo International University', `maxlength="140" ${student||alumni?'required':''}`)}${input(ctx,'Degree','degree',profile.degree,'maxlength="100" placeholder="e.g. BSc"')}${input(ctx, 'Field of study'+(student?' *':''), 'major', profile.major, `maxlength="100" ${student?'required':''}`)}<label class="field" data-semester-field ${student?'':'hidden'}><span>Current semester *</span><select name="semester" ${student?'required':'disabled'}><option value="">Choose your semester</option>${Array.from({length:13},(_,i)=>i+1).map(n=>`<option value="${n}" ${student&&Number(profile.semester)===n?'selected':''}>${semesterLabel(n)}</option>`).join('')}</select></label>${input(ctx, 'Graduation year'+(alumni?' *':''), 'graduation', profile.graduation, `min="1950" max="2100" inputmode="numeric" ${alumni?'required':''}`, 'number')}${input(ctx, 'Skills · separated by commas', 'skills', list(profile.skills).join(', '), 'maxlength="300" placeholder="Design, marketing, research"')}</div>
    <section class="profile-work-fields" data-work-fields><div class="form-section-heading"><span>03</span><div><h3 data-work-heading>${alumni?'Life after TIU':'Work & experience'}</h3><p>Internships, part-time work, and ambitions all count.</p></div></div><div class="form-grid">${input(ctx, 'Company or organisation', 'employer', profile.employer, 'maxlength="140"')}${input(ctx, 'Job title', 'jobTitle', profile.jobTitle, 'maxlength="100"')}${input(ctx,'Industry','industry',profile.industry,'maxlength="100"')}</div></section>
    <div class="form-section-heading"><span>04</span><div><h3>Social links</h3><p>Optional. Add complete links beginning with https:// and choose their visibility below.</p></div></div><div class="form-grid">${socialFields.map(([key,label,placeholder])=>input(ctx,label,key,profile[key],`maxlength="500" placeholder="${placeholder}"`,'url')).join('')}</div>
    <div class="form-section-heading"><span>05</span><div><h3>Your choice. Your privacy.</h3><p>Your contact details are always private.</p></div></div><div class="profile-preferences"><label class="checkbox-field"><input type="checkbox" name="directoryVisible" ${profile.directoryVisible ? 'checked' : ''}><span><strong>Include me in the community directory after approval</strong><small>Your name and membership type are shown. Choose any additional details below.</small></span></label><fieldset class="public-field-choices"><legend>Details I want to share publicly</legend>${publicChoices.map(([key,label])=>`<label><input type="checkbox" name="publicFields" value="${key}" ${visible.has(key)?'checked':''}>${label}</label>`).join('')}</fieldset><label class="checkbox-field"><input type="checkbox" name="mentor" ${profile.mentor ? 'checked' : ''}><span><strong>I’m open to mentoring</strong><small>Share your experiences with students and fellow alumni. Select “Mentoring preference” above to show this publicly.</small></span></label></div>`;
}
function authAside(mode) { return `<aside class="bss-auth-story"><p class="eyebrow">TIU BANGLADESH STUDENT SOCIETY</p><h2>${mode==='signin'?'Back to your<br>people.':'A new chapter.<br>The same roots.'}</h2><p>From your first day on campus to everything that comes after — you belong here.</p><img src="assets/reference-peacocks.webp" alt="Colourful Bangladeshi peacock folk artwork"><span lang="bn">একসাথে, আরও দূর।</span><div class="auth-story-links"><span>Students ↗</span><span>Alumni ↗</span><span>Community ↗</span></div></aside>`; }
function passwordField(ctx,label,name,autocomplete='new-password') { return `<label class="field"><span>${label}</span><div class="password-wrap"><input type="password" name="${name}" required ${autocomplete==='new-password'?'minlength="8"':''} maxlength="128" autocomplete="${autocomplete}"><button type="button" data-toggle-password="${name}" aria-label="Show ${label.toLowerCase()}">Show</button></div></label>`; }
function activationNotice(){return !globalThis.BSS_FIREBASE_APP_CHECK_KEY&&!globalThis.BSS_FIREBASE_EMULATOR_HOST?'<p class="auth-notice" role="status">Account sign-in is available. Profile saving and photo uploads are awaiting activation. <a href="/setup">View setup status ↗</a></p>':'';}
function authNotice(ctx) { const message=auth.getAuthState().error; return message ? `<p class="auth-notice" role="status">${esc(ctx, auth.friendlyError?.({message}) || message)}</p>` : ''; }
export function renderJoin(ctx) {
  const user=auth.getAuthState().user;
  if(user) return `<main class="page-container"><div class="empty-state"><p class="eyebrow">YOU’RE ALREADY HERE</p><h1>Make yourself at home.</h1><p>You’re signed in as ${esc(ctx,user.email || user.displayName)}. Complete or update your member profile in your dashboard.</p><a class="btn btn-primary" href="/profile">Open my dashboard</a><button class="btn btn-secondary" data-community-action="signout">Sign out</button></div></main>`;
  return `<main class="page-container bss-auth-page signup-page"><div class="bss-auth-layout">${authAside('signup')}<section class="bss-auth-content"><div class="auth-route-switch"><a href="/signin">Sign in</a><a href="/signup" aria-current="page">Sign up</a></div><p class="eyebrow">THERE’S A PLACE FOR YOU HERE</p><h1>Find your people.<br><em>Start your story.</em></h1><p class="auth-intro">Create your TIU BSS account, then manage your semester, contact details, short bio, and social links in your dashboard.</p>${authNotice(ctx)}${activationNotice()}<button class="btn google-auth" type="button" data-google-signin><span aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>or sign up with email</span></div><form id="community-join-form" class="profile-form auth-signup-form">${profileFields(ctx,{type:preferredMemberType,directoryVisible:false,...profileDrafts.get('signup')?.profile},true)}<div class="form-section-heading"><span>06</span><div><h3>Secure your account</h3><p>Use at least 8 characters.</p></div></div><div class="form-grid" data-signup-passwords>${passwordField(ctx,'Password *','password')}${passwordField(ctx,'Confirm password *','confirmPassword')}</div><label class="checkbox-field auth-terms"><input type="checkbox" name="terms" required><span>I agree to the <a href="/terms" target="_blank">community guidelines</a> and <a href="/privacy" target="_blank">privacy policy</a>.</span></label><div class="form-submit-row"><button class="btn btn-primary" type="submit">Create my account ↗</button><span>Already a member? <a href="/signin">Sign in</a></span></div><p class="form-error" role="alert" hidden></p><p class="auth-form-status" role="status" hidden></p></form></section></div></main>`;
}
export function renderSignIn(ctx) {
  if(auth.getAuthState().user) return renderJoin(ctx);
  return `<main class="page-container bss-auth-page"><div class="bss-auth-layout">${authAside('signin')}<section class="bss-auth-content"><div class="auth-route-switch"><a href="/signin" aria-current="page">Sign in</a><a href="/signup">Sign up</a></div><p class="eyebrow">YOUR COMMUNITY IS RIGHT HERE</p><h1>Welcome<br><em>back home.</em></h1><p class="auth-intro">Your profile, people, tickets, and shared moments — together in one place.</p>${authNotice(ctx)}<button class="btn google-auth" type="button" data-google-signin><span aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>or sign in with email</span></div><form id="community-signin-form"><div class="auth-fields">${input(ctx,'Email','email','','required autocomplete="username" placeholder="Your email"','email')}${passwordField(ctx,'Password','password','current-password')}</div><div class="auth-forgot"><a href="/forgot-password">Forgot your password?</a></div><button type="submit" class="btn btn-primary auth-submit">Sign in ↗</button><p class="form-error" role="alert" hidden></p></form><p class="auth-bottom"><a href="/admin/login">Administrator sign-in ↗</a></p><p class="auth-bottom">New to BSS? <a href="/signup">Create your account</a></p><p class="privacy-note">Sign in securely with your personal account. Your email is never listed in the public directory.</p></section></div></main>`;
}
export function renderResetPassword(ctx) {
  return `<main class="page-container bss-auth-page"><div class="bss-auth-layout">${authAside('signin')}<section class="bss-auth-content"><a href="/signin" class="text-link">← Back to sign in</a><p class="eyebrow" style="margin-top:2rem">LET’S GET YOU BACK IN</p><h1>A fresh<br><em>start.</em></h1><p class="auth-intro">Enter your account email and we’ll request a password reset link.</p><form id="community-reset-form">${input(ctx,'Email address','email','','required autocomplete="email"','email')}<button type="submit" class="btn btn-primary auth-submit">Send reset link ↗</button><p class="form-error" role="alert" hidden></p><p class="auth-form-status" role="status" hidden></p></form></section></div></main>`;
}

const requestOwnerId = request => request.uid ?? request.fromUserId ?? request.userId;
function personalRecords(ctx, collection) { const s = state(ctx); return list(s[collection]).filter(item => item.userId === s.profile?.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); }
function statusBadge(ctx, status) { return `<span class="badge status-${esc(ctx, status || 'pending')}">${esc(ctx, String(status || 'pending').replaceAll('_', ' '))}</span>`; }
function eventFor(ctx, id) { return list(state(ctx).events).find(event => event.id === id); }
function shortDate(ctx, value) { try { return value ? ctx.formatDate(value) : 'Date to be announced'; } catch { return 'Date to be announced'; } }
function ticketCard(ctx, ticket) {
  const event = eventFor(ctx, ticket.eventId);
  const active = !['cancelled', 'refunded'].includes(ticket.status);
  return `<article class="ticket-card personal-ticket"><div class="ticket-card-top"><span class="eyebrow">EVENT PASS</span>${statusBadge(ctx, ticket.status)}</div><h3>${esc(ctx, event?.title || 'Community event')}</h3><p>${esc(ctx, shortDate(ctx, event?.startAt || event?.startsAt || event?.date))}</p><p class="ticket-reference">${esc(ctx, ticket.name || state(ctx).profile?.name)} · ${esc(ctx, ticket.id)}</p><div class="ticket-card-actions">${active ? `<button class="btn btn-primary btn-small" data-community-action="ticket-qr" data-id="${esc(ctx, ticket.id)}">View ticket & QR</button>` : ''}${active && !ticket.checkedInAt ? `<button class="text-button" data-community-action="cancel-ticket" data-id="${esc(ctx, ticket.id)}">Cancel registration</button>` : ''}${ticket.checkedInAt ? '<span class="checked-in-label">✓ Checked in</span>' : ''}</div><span class="sample-label">Event ticket</span></article>`;
}
function orderCard(ctx, order) {
  const event = eventFor(ctx, order.eventId);
  return `<article class="panel personal-order"><div class="ticket-card-top"><div><p class="eyebrow">FOOD ORDER</p><h3>${esc(ctx, event?.title || 'Community event')}</h3></div>${statusBadge(ctx, order.status)}</div><ul class="personal-order-items">${list(order.items).map(item => `<li><span>${esc(ctx, item.qty)} × ${esc(ctx, item.name)}</span><strong>${ctx.money((Number(item.price) || 0) * (Number(item.qty) || 0))}</strong></li>`).join('')}</ul><div class="order-summary-line"><span>Order total</span><strong>${ctx.money(order.total || 0)}</strong></div><p class="order-pickup">Pickup: ${esc(ctx, order.pickup || 'See event details')} · Payment: ${esc(ctx, String(order.paymentStatus || 'unpaid').replaceAll('_', ' '))}</p><div class="ticket-card-actions">${!['cancelled', 'collected'].includes(order.status) ? `<button class="btn btn-primary btn-small" data-community-action="order-qr" data-id="${esc(ctx, order.id)}">View pickup QR</button>` : ''}${['pending', 'confirmed', 'placed', 'new'].includes(order.status) && order.paymentStatus !== 'paid' ? `<button class="text-button" data-community-action="cancel-order" data-id="${esc(ctx, order.id)}">Cancel order</button>` : ''}</div><span class="sample-label">Order · ${esc(ctx, order.id)}</span></article>`;
}
function empty(ctx, title, copy, label, href) { return `<div class="empty-state"><span class="empty-flower" aria-hidden="true">✳</span><h3>${title}</h3><p>${copy}</p>${label ? `<a class="btn btn-secondary" href="${href}">${label}</a>` : ''}</div>`; }
function profileOverview(ctx, p) {
  const tickets = personalRecords(ctx, 'tickets');
  const orders = personalRecords(ctx, 'orders');
  const incoming = list(state(ctx).incomingRequests);
  const messages = list(state(ctx).messages).filter(m => (requestOwnerId(m) === p.id) && ['connection', 'mentorship'].includes(m.type)).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return `<div class="dashboard-welcome"><p class="eyebrow">YOUR COMMUNITY, IN ONE PLACE</p><h2>Hello, ${esc(ctx, String(p.name||'Member').split(' ')[0])}.</h2><p>Good to have you here. Your next gathering is just around the corner.</p></div><div class="profile-stat-grid"><button class="panel profile-stat" data-community-action="profile-tab" data-tab="tickets"><strong>${tickets.filter(t => t.status !== 'cancelled').length}</strong><span>Event tickets <span aria-hidden="true">↗</span></span></button><button class="panel profile-stat" data-community-action="profile-tab" data-tab="orders"><strong>${orders.filter(o => o.status !== 'cancelled').length}</strong><span>Food orders <span aria-hidden="true">↗</span></span></button><div class="panel profile-stat"><strong>${messages.length}</strong><span>Connection requests</span></div></div>${completionCard(ctx,p)}${profileSummary(ctx,p)}<div class="section-title-row"><h3>My latest tickets</h3><button class="text-button" data-community-action="profile-tab" data-tab="tickets">See all →</button></div>${tickets.length ? `<div class="personal-tickets-grid">${tickets.slice(0, 2).map(ticket => ticketCard(ctx, ticket)).join('')}</div>` : empty(ctx, 'A good gathering is waiting.', 'Register for a community event to find your ticket here.', 'Explore events', '/events')}${incoming.length ? `<section class="panel connection-history"><div class="section-title-row"><h3>People reaching out</h3></div><ul>${incoming.map(m=>`<li><div><strong>${esc(ctx,m.name || 'A community member')} · ${esc(ctx,m.type==='mentorship'?'Mentorship':'Connection')}</strong><p>${esc(ctx,m.message || m.body || '')}</p></div><span class="badge badge-soft">${esc(ctx,m.status || 'submitted')}</span></li>`).join('')}</ul></section>` : ''}<section class="panel connection-history"><div class="section-title-row"><h3>Sent requests</h3><span class="sample-label">Your requests</span></div>${messages.length ? `<ul>${messages.slice(0, 5).map(m => `<li><div><strong>${esc(ctx, m.type === 'mentorship' ? 'Mentorship request' : 'Connection request')}</strong><p>To ${esc(ctx, m.toName || publicMembers(ctx).find(person => person.id === m.toUserId)?.name || 'a community member')}</p></div><span class="badge badge-soft">Submitted</span></li>`).join('')}</ul>` : '<p>Your saved connection and mentorship requests will appear here.</p>'}</section>`;
}
function profilePrivacy(ctx, p) {
  return `<section class="panel privacy-panel"><p class="eyebrow">YOU’RE IN CONTROL</p><h2>Privacy & your account</h2><p>Your profile and activity are stored in your TIU BSS account. Only the details you choose to share can appear in the directory after membership approval.</p><div class="privacy-setting"><div><h3>Community directory</h3><p>${p.directoryVisible ? (p.status === 'approved' ? 'Your approved public profile is listed in the directory.' : 'Your directory listing is awaiting membership approval.') : 'Your profile is hidden from the member directory.'} Your email and phone remain private.</p></div><button class="btn btn-secondary" data-community-action="toggle-visibility">${p.directoryVisible ? 'Hide my profile' : 'Opt in to directory'}</button></div><div class="privacy-setting"><div><h3>Download available account data</h3><p>Export the profile, tickets, orders, requests, and notes currently loaded in your dashboard.</p></div><button class="btn btn-secondary" data-community-action="export-data">Download data</button></div><div class="privacy-setting"><div><h3>Password & session</h3><p>Request a password reset for your email account, or sign out in our community.</p></div><div class="photo-actions"><button class="btn btn-secondary" data-community-action="account-reset">Reset password</button><button class="btn btn-secondary" data-community-action="signout">Sign out</button></div></div></section>`;
}
function verificationBanner(ctx) {
  const user=auth.getAuthState().user;
  if(!user || user.emailVerified) return '';
  return `<div class="auth-notice verification-banner"><div><strong>Verify your email</strong><p>Check ${esc(ctx,user.email)} for the verification link. Once verified, refresh your status here.</p></div><div class="photo-actions"><button class="btn btn-secondary btn-small" data-community-action="send-verification">Resend email</button><button class="text-button" data-community-action="reload-user">I’ve verified my email</button></div></div>`;
}
export function renderProfile(ctx) {
  const user=auth.getAuthState().user, s=state(ctx);
  if (!user) return `<main class="page-container"><div class="empty-state"><p class="eyebrow">YOUR OWN CORNER OF THE COMMUNITY</p><h1>Make yourself at home.</h1><p>Sign in to manage your member profile, event tickets, and food orders.</p><a class="btn btn-primary" href="/signin">Sign in</a><a class="btn btn-secondary" href="/signup">Create an account</a></div></main>`;
  const rawProfile = s.profile || {id:user.uid,name:user.displayName||'Member',email:user.email||'',type:'student',status:'pending',profilePending:true};
  const p = {...rawProfile,...resolveProfilePhoto(rawProfile,user)};
  const needsProfile=p.profilePending || s.profilePending || !profileRequirements(p).complete;
  if(profileTabAccount!==user.uid){profileTabAccount=user.uid;profileTabChosen=false;profileTab=needsProfile?'edit':'overview';}
  const activeTab=needsProfile&&!profileTabChosen?'edit':profileTab;
  const draft=profileDrafts.get(user.uid);
  const formProfile={...p,...draft?.profile,email:user.email||p.email};
  const tabs = [['overview', 'Overview'], ['tickets', 'My tickets'], ['orders', 'Food orders'], ['edit', 'Edit profile'], ['privacy', 'Privacy & account']];
  let content = '';
  if (activeTab === 'overview') content = profileOverview(ctx, p) + communityCorner(ctx, p);
  if (activeTab === 'tickets') { const records = personalRecords(ctx, 'tickets'); content = `<div class="section-title-row"><div><p class="eyebrow">MEMORIES START HERE</p><h2>My tickets</h2></div><a class="btn btn-secondary" href="/events">Explore events</a></div>${records.length ? `<div class="personal-tickets-grid">${records.map(t => ticketCard(ctx, t)).join('')}</div>` : empty(ctx, 'Your next memory awaits.', 'Tickets will appear here after you register for an event.', 'Find an event', '/events')}`; }
  if (activeTab === 'orders') { const records = personalRecords(ctx, 'orders'); content = `<div class="section-title-row"><div><p class="eyebrow">A TASTE OF HOME</p><h2>My food orders</h2></div><a class="btn btn-primary" href="/tickets">Open ticket wallet ↗</a><a class="btn btn-secondary" href="/food">Browse food stalls</a></div>${records.length ? `<div class="personal-orders-grid">${records.map(o => orderCard(ctx, o)).join('')}</div>` : empty(ctx, 'Come hungry. Leave happy.', 'Order from an event’s food menu and manage pickup here.', 'Explore food stalls', '/food')}`; }
  if (activeTab === 'edit') content = `<form class="panel profile-form" id="community-edit-form"><p class="eyebrow">TELL YOUR STORY</p><h2>${needsProfile?'Complete your profile':'Edit my profile'}</h2>${needsProfile?'<p class="auth-notice">Your sign-in account is ready. Add your contact number, short bio, and required study details below to complete onboarding. Social links are optional.</p>':''}${draft?'<p class="auth-notice">You have unsaved details in this tab. Save them to update your account.</p>':''}${activationNotice()}${profileFields(ctx,formProfile)}<div class="form-submit-row"><button class="btn btn-primary" type="submit">Save profile</button><span>Saved only after confirmation from your account</span></div><p class="form-error" role="alert" hidden></p><p class="auth-form-status" role="status" hidden></p></form>`;
  if (activeTab === 'privacy') content = profilePrivacy(ctx, p);
  return `<main class="page-container account-page"><div class="account-heading"><div><p class="eyebrow">MY BSS</p><h1>Your community dashboard.</h1></div><div class="member-title-line">${statusBadge(ctx, p.status || 'pending')}<button class="btn btn-secondary btn-small" data-community-action="signout">Sign out</button></div></div>${verificationBanner(ctx)}${needsProfile&&activeTab!=='edit'?'<div class="auth-notice"><strong>Finish your onboarding.</strong> Some required details are missing. <button class="text-button" data-community-action="profile-tab" data-tab="edit">Complete my profile ↗</button></div>':''}<div class="profile-layout"><aside class="profile-sidebar"><div class="profile-sidebar-identity">${avatar(ctx, p, true)}<button type="button" class="text-button profile-photo-shortcut" data-community-action="profile-tab" data-tab="edit">Edit picture ↗</button><h2>${esc(ctx, p.name)}</h2><p>${typeLabel(p)}${p.city ? ` · ${esc(ctx, p.city)}` : ''}</p><span class="badge badge-soft">${p.directoryVisible ? (p.status === 'approved' ? 'Visible in directory' : 'Awaiting approval') : 'Private profile'}</span></div><nav class="profile-tabs" aria-label="Profile sections">${tabs.map(([id, label]) => `<button data-community-action="profile-tab" data-tab="${id}" class="${activeTab === id ? 'active' : ''}" ${activeTab === id ? 'aria-current="page"' : ''}>${label}<span aria-hidden="true">↗</span></button>`).join('')}</nav><a class="btn btn-secondary" href="/tickets">Tickets & pickup wallet ↗</a><p class="privacy-note">Your private space.<br>Choose what you share.</p></aside><div class="profile-main">${content}</div></div></main>`;
}

function applyDirectoryFilters() {
  const grid = document.getElementById('community-grid');
  if (!grid) return;
  const alumniOnly = grid.dataset.alumniOnly === 'true';
  let count = 0;
  grid.querySelectorAll('[data-member-search]').forEach(card => {
    const visible = card.dataset.memberSearch.includes(directoryState.query.trim().toLowerCase()) && (alumniOnly || directoryState.type === 'all' || card.dataset.memberType === directoryState.type) && (!directoryState.mentors || card.dataset.memberMentor === 'true');
    card.hidden = !visible;
    if (visible) count++;
  });
  const results = document.getElementById('community-results');
  if (results) results.textContent = `${count} ${count === 1 ? 'person' : 'people'} to discover`;
  const empty = document.getElementById('community-empty');
  if (empty) empty.hidden = count > 0;
  document.querySelectorAll('[data-community-action="filter"]').forEach(btn => { const on = btn.dataset.filter === directoryState.type; btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); });
  const mentor = document.querySelector('[data-community-action="mentors"]');
  if (mentor) { mentor.classList.toggle('active', directoryState.mentors); mentor.setAttribute('aria-pressed', String(directoryState.mentors)); }
}
function applyWallFilters() {
  let count = 0;
  const notes = document.querySelectorAll('[data-wall-category]');
  notes.forEach(note => { const visible = wallFilter === 'all' || note.dataset.wallCategory === wallFilter; note.hidden = !visible; if (visible) count++; });
  document.querySelectorAll('[data-community-action="post-filter"]').forEach(button => { const active = button.dataset.filter === wallFilter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const countEl = document.getElementById('wall-results');
  if (countEl) countEl.textContent = `${count} ${count === 1 ? 'note' : 'notes'}${wallFilter !== 'all' ? ' in this category' : ' in our community'}`;
  const empty = document.getElementById('wall-empty');
  if (empty) empty.hidden = count > 0;
  const emptyTitle = document.getElementById('wall-empty-title');
  if (emptyTitle) emptyTitle.textContent = notes.length ? 'Start a new conversation here.' : 'Yours could be the first hello.';
}
function requireWallProfile(ctx) {
  if (state(ctx).profile) return true;
  ctx.modal('Your hello starts with a name', '<p>Sign in to leave notes, appreciate a post, or reply to your community.</p><div class="modal-actions"><a id="wall-join" href="/join" class="btn btn-primary">Join the community ↗</a></div>', () => document.getElementById('wall-join')?.addEventListener('click', () => ctx.closeModal()));
  return false;
}
function composePost(ctx, category = 'introduction') {
  if (!requireWallProfile(ctx)) return;
  ctx.modal('Leave a little note', `<form id="community-post-form"><p>A good adda starts with a little sharing.</p><label class="field"><span>What would you like to share?</span><select name="category">${Object.entries(postCategories).map(([key, label]) => `<option value="${key}" ${key === category ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>Your note *</span><textarea name="body" required maxlength="600" rows="5" placeholder="A little about me…"></textarea></label><p class="cw-compose-help">Share kindly. Your name appears beside your note. This note will be visible to the community.</p><div class="modal-actions"><button type="submit" class="btn btn-primary">Pin my note ↗</button></div><p class="form-error" role="alert" hidden></p></form>`, () => {
    document.getElementById('community-post-form')?.addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); try { await ctx.store.createCommunityPost({category: data.get('category'), body: data.get('body')}); wallFilter = 'all'; ctx.closeModal(); ctx.render(); document.getElementById('community-wall')?.scrollIntoView({block: 'start'}); ctx.toast('Your note is pinned to the adda wall.'); } catch (error) { showFormError(form, error); } });
  });
}
function replyToPost(ctx, id) {
  if (!requireWallProfile(ctx)) return;
  const post = list(state(ctx).posts).find(item => item.id === id);
  if (!post) return;
  ctx.modal('Keep the conversation going', `<form id="community-reply-form"><blockquote class="cw-reply-context">${esc(ctx, post.body)}</blockquote><label class="field"><span>Your reply *</span><textarea name="body" rows="4" maxlength="300" required placeholder="I’d love to add…"></textarea></label><p class="cw-compose-help">Your reply appears below this community note.</p><div class="modal-actions"><button class="btn btn-primary" type="submit">Post reply ↗</button></div><p class="form-error" role="alert" hidden></p></form>`, () => { document.getElementById('community-reply-form')?.addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; try { await ctx.store.replyToCommunityPost(id, new FormData(form).get('body')); ctx.closeModal(); ctx.render(); ctx.toast('Your reply was posted.'); } catch (error) { showFormError(form, error); } }); });
}
function readProfile(form, old = {}) {
  const data = new FormData(form);
  const fields = ['name', 'nameBn', 'type', 'city', 'email', 'bio', 'university', 'degree', 'major', 'graduation', 'employer', 'jobTitle', 'industry', 'linkedin', 'instagram', 'facebook', 'website', 'semester', 'phone', 'photoURL', 'photoSource'];
  const p = { ...old, id: old.id || 'me', status: old.status || 'pending', isDemo: false };
  fields.forEach(key => { p[key] = String(data.get(key) || '').trim(); });
  if(!['google','custom','none'].includes(p.photoSource))delete p.photoSource;
  p.semester = p.type==='student'?p.semester:'';
  p.skills = [...new Set(String(data.get('skills') || '').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 15);
  p.directoryVisible = data.get('directoryVisible') === 'on';
  p.avatar = p.photoURL;
  p.publicFields = ['name','membershipType', ...data.getAll('publicFields')];
  p.mentor = data.get('mentor') === 'on';
  p.updatedAt = new Date().toISOString();
  p.createdAt = old.createdAt || p.updatedAt;
  return p;
}
function requestConnection(ctx, memberId, mentorship) {
  const s = state(ctx), m = publicMembers(ctx).find(item => item.id === memberId);
  if (!m) return;
  if (!s.profile) { ctx.modal('Start with your profile', `<p>Sign in to send a connection or mentorship request.</p><div class="modal-actions"><a href="/join" class="btn btn-primary" id="connection-join">Create an account</a></div>`, () => { document.getElementById('connection-join')?.addEventListener('click', () => ctx.closeModal()); }); return; }
  ctx.modal(mentorship ? 'A new perspective starts here' : `Say hello to ${m.name.split(' ')[0]}`, `<form id="community-message-form"><p>${mentorship ? 'Introduce yourself and share what you’d like guidance with.' : 'Tell them a little about yourself and why you’d like to connect.'}</p><div class="demo-form-note"><span class="sample-label">Community request</span><p>Your request appears in the member’s dashboard. Email notifications are not enabled.</p></div><label class="field"><span>Your message *</span><textarea name="message" required maxlength="1500" rows="5" placeholder="Hi ${esc(ctx, m.name.split(' ')[0])}, I’m…"></textarea></label><div class="modal-actions"><button class="btn btn-primary" type="submit">Submit request</button></div><p class="form-error" role="alert" hidden></p></form>`, () => {
    let submission;
    document.getElementById('community-message-form')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget;
      if (form.dataset.busy === 'true') return;
      const message = String(new FormData(form).get('message') || '').trim(); if (!message) return;
      const button = form.querySelector('[type="submit"]');
      form.dataset.busy = 'true'; button.disabled = true; clearFormError(form);
      try {
        if (auth.getAuthState().user?.uid !== s.profile.id || state(ctx).profile?.id !== s.profile.id) throw new Error('Your signed-in account changed. Reopen this request from your dashboard.');
        // Keep the same accepted request on an uncertain network retry. Editing
        // its message deliberately starts a different request reference.
        if (!submission || submission.message !== message) submission = {id: 'msg_' + crypto.randomUUID(), message};
        await ctx.store.saveRecord('messages', { id: submission.id, requestId: submission.id, submitRequest: true, type: mentorship ? 'mentorship' : 'connection', fromUserId: s.profile.id, userId: s.profile.id, toUserId: m.id, toName: m.name, name: s.profile.name, subject: (mentorship ? 'Mentorship' : 'Connection') + ' request to ' + m.name, message, status: 'submitted', isDemo: false, createdAt: new Date().toISOString() });
        ctx.closeModal(); ctx.toast('Your request has been submitted.');
      } catch (error) { showFormError(form, error); }
      finally { form.dataset.busy = 'false'; button.disabled = false; }
    });
  });
}
function showFormError(form, error) { const el = form.querySelector('.form-error'); if (el) { el.textContent = auth.friendlyError?.(error) || error.message || 'Something went wrong. Please try again.'; el.hidden = false; } }
function confirmAction(ctx, title, copy, label, action) { ctx.modal(title, `<p>${copy}</p><div class="modal-actions"><button class="btn btn-secondary" id="community-confirm-back">Keep it</button><button class="btn btn-danger" id="community-confirm-action">${label}</button></div>`, () => { document.getElementById('community-confirm-back')?.addEventListener('click', () => ctx.closeModal()); document.getElementById('community-confirm-action')?.addEventListener('click', async () => { try { await action(); ctx.closeModal(); ctx.render(); } catch (error) { ctx.toast(error.message || 'Unable to complete this action.'); } }); }); }

function setFormBusy(form,busy,label) {
  form.dataset.authBusy=String(busy);
  const submit=form.querySelector('[type="submit"]');
  if(submit){submit.disabled=busy;if(label)submit.textContent=label;}
  const photoControls=[...form.querySelectorAll('[name="profilePhoto"],[data-photo-remove],[data-photo-google]')];
  if(busy){if(!busyPhotoControls.has(form))busyPhotoControls.set(form,new Map(photoControls.map(control=>[control,control.disabled])));photoControls.forEach(control=>{control.disabled=true;});}
  else{for(const [control,disabled] of busyPhotoControls.get(form)||[])control.disabled=disabled;busyPhotoControls.delete(form);}
  form.setAttribute('aria-busy',String(busy));
}
function setFormStatus(form,message) { const el=form.querySelector('.auth-form-status');if(el){el.textContent=message;el.hidden=!message;} }
function clearFormError(form) { const el=form.querySelector('.form-error');if(el){el.hidden=true;el.textContent='';} }
function mountAccountForms(ctx) {
  if(activePhotoPreview){URL.revokeObjectURL(activePhotoPreview);activePhotoPreview=null;}
  document.querySelectorAll('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{
    const field=button.closest('form').elements.namedItem(button.dataset.togglePassword);
    field.type=field.type==='password'?'text':'password';button.textContent=field.type==='password'?'Show':'Hide';button.setAttribute('aria-label',`${field.type==='password'?'Show':'Hide'} password`);
  }));
  document.querySelectorAll('[data-google-signin]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;button.dataset.authBusy='true';
    try{const credential=await auth.signInWithGoogle();const signedIn=credential.user,signupDraft=profileDrafts.get('signup');await ctx.store.refreshSession();if(!signedIn||auth.getAuthState().user?.uid!==signedIn.uid)throw new Error('Your signed-in account changed. Please open your dashboard again.');const current=state(ctx);if(signupDraft&&current.profilePending&&!current.dataErrors?.profile)profileDrafts.set(signedIn.uid,mergeGoogleSignupDraft(signupDraft,signedIn));profileDrafts.delete('signup');profileTab=current.profilePending||!profileRequirements(current.profile||{}).complete?'edit':'overview';profileTabChosen=false;button.dataset.authBusy='false';ctx.navigate('/profile');ctx.render();}
    catch(error){ctx.toast(auth.friendlyError?.(error)||error.message);}
    finally{button.disabled=false;button.dataset.authBusy='false';}
  }));
  document.getElementById('community-signin-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);clearFormError(form);setFormBusy(form,true,'Signing in…');
    try{await auth.signInWithEmail(String(data.get('email')).trim(),String(data.get('password')));form.elements.password.value='';await ctx.store.refreshSession();profileTabChosen=false;setFormBusy(form,false);ctx.navigate('/profile');ctx.render();}
    catch(error){showFormError(form,error);setFormBusy(form,false,'Sign in ↗');}
  });
  document.getElementById('community-reset-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;clearFormError(form);setFormBusy(form,true,'Sending…');
    try{await auth.sendPasswordReset(String(new FormData(form).get('email')).trim());setFormStatus(form,'If an email/password account exists for this address, a password reset link will arrive shortly. Check your spam folder too.');}
    catch(error){showFormError(form,error);}
    finally{setFormBusy(form,false,'Send reset link ↗');}
  });
  for(const id of ['community-join-form','community-edit-form']){
    const form=document.getElementById(id);if(!form)continue;
    let formUserId=auth.getAuthState().user?.uid||null;
    const accountMatches=()=>formUserId===(auth.getAuthState().user?.uid||null);
    const assertAccount=()=>{if(!accountMatches())throw new Error('Your signed-in account changed. Open your dashboard again before saving.');};
    const draftKey=()=>formUserId||'signup';
    let selectedPhoto=profileDrafts.get(draftKey())?.photo||null,previewURL=null;
    const rememberDraft=()=>{if(!accountMatches())return;profileDrafts.set(draftKey(),{profile:readProfile(form,state(ctx).profile||{}),photo:selectedPhoto});form.dataset.authDirty='true';};
    const fileInput=form.querySelector('[name="profilePhoto"]');
    const preview=form.querySelector('[data-photo-preview]');
    const photoStatus=form.querySelector('[data-photo-status]');
    const photoField=form.querySelector('[name="photoURL"]');
    const photoSource=form.querySelector('[name="photoSource"]');
    const releasePreview=()=>{if(previewURL){URL.revokeObjectURL(previewURL);if(activePhotoPreview===previewURL)activePhotoPreview=null;previewURL=null;}};
    const storedImageFallback=img=>{img.onerror=()=>{if(!accountMatches()||preview.querySelector?.('img')!==img)return;preview.textContent=initials(form.elements.name.value||'BSS');photoStatus.textContent='Picture could not load. Your saved choice is unchanged; you can try another picture.';};if(img.complete&&img.naturalWidth===0)img.onerror();};
    const showStoredPreview=()=>{releasePreview();if(photoField.value){const img=document.createElement('img');img.src=photoField.value;img.alt='Selected profile picture preview';img.referrerPolicy='no-referrer';preview.replaceChildren(img);storedImageFallback(img);}else preview.textContent=initials(form.elements.name.value||'BSS');};
    const initialImage=form.querySelector('[data-photo-preview] img');if(initialImage)storedImageFallback(initialImage);
    const showPhotoPreview=()=>{releasePreview();const selected=selectedPhoto;previewURL=URL.createObjectURL(selected);activePhotoPreview=previewURL;const img=document.createElement('img');img.src=previewURL;img.alt='Selected profile picture preview';img.onerror=()=>{if(selectedPhoto!==selected||!accountMatches()||form.dataset.authBusy==='true')return;selectedPhoto=null;fileInput.value='';showStoredPreview();rememberDraft();showFormError(form,new Error('This image could not be read. Please choose another picture.'));};preview.replaceChildren(img);photoStatus.textContent=`${selected.name} · uploads when you save`;};
    if(selectedPhoto)showPhotoPreview();
    form.addEventListener('input',event=>{if(form.dataset.authBusy==='true'||!accountMatches())return;event.target.setCustomValidity?.('');if(event.target.name==='bio')form.querySelector('[data-bio-count]').textContent=String(event.target.value.length);if(event.target.name!=='password'&&event.target.name!=='confirmPassword')rememberDraft();});
    form.addEventListener('change',event=>{if(form.dataset.authBusy==='true'||!accountMatches())return;if(event.target.name!=='profilePhoto')rememberDraft();});
    fileInput?.addEventListener('change',()=>{
      if(form.dataset.authBusy==='true'||!accountMatches())return;
      clearFormError(form);const file=fileInput.files?.[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>=5*1024*1024){fileInput.value='';showFormError(form,new Error('Choose a JPG, PNG, or WebP image smaller than 5 MB.'));return;}
      selectedPhoto=file;showPhotoPreview();rememberDraft();
    });
    form.querySelector('[data-photo-remove]')?.addEventListener('click',()=>{
      if(form.dataset.authBusy==='true'||!accountMatches())return;
      selectedPhoto=null;fileInput.value='';photoField.value='';photoSource.value='none';showStoredPreview();photoStatus.textContent='Picture removed from this form. Save to keep initials, including after Google sign-in.';rememberDraft();
    });
    form.querySelector('[data-photo-google]')?.addEventListener('click',()=>{
      if(form.dataset.authBusy==='true'||!accountMatches())return;
      const picture=googlePhotoURL(auth.getAuthState().user);if(!picture){showFormError(form,new Error('Your Google picture is unavailable. Sign in with Google again or choose a picture.'));return;}
      selectedPhoto=null;fileInput.value='';photoField.value=picture;photoSource.value='google';showStoredPreview();photoStatus.textContent='Google picture selected. Save to update your profile.';rememberDraft();
    });
    form.querySelectorAll('[name="type"]').forEach(radio=>radio.addEventListener('change',()=>{
      if(form.dataset.authBusy==='true'||!accountMatches())return;
      preferredMemberType=radio.value;const alumni=radio.value==='alumni',student=radio.value==='student';
      form.querySelector('[data-study-heading]').textContent=alumni?'Your TIU chapter':'Your studies';form.querySelector('[data-work-heading]').textContent=alumni?'Life after TIU':'Work & experience';
      form.querySelector('[data-study-help]').textContent=student?'Tell us what you study and your current semester.':alumni?'Share your university and graduation year.':'Share any education details you’d like to add.';
      const semester=form.elements.namedItem('semester');semester.disabled=!student;semester.required=student;form.querySelector('[data-semester-field]').hidden=!student;if(!student)semester.value='';
      for(const [key,label,required] of [['university','University or school',student||alumni],['major','Field of study',student],['graduation','Graduation year',alumni]]){const el=form.elements.namedItem(key);el.required=required;el.setCustomValidity('');el.closest('label').querySelector('span').textContent=label+(required?' *':'');}
      rememberDraft();
    }));
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(form.dataset.authBusy==='true')return;clearFormError(form);
      try{assertAccount();}catch(error){showFormError(form,error);return;}
      const isSignup=id==='community-join-form',data=new FormData(form);
      if(isSignup&&!auth.getAuthState().user&&data.get('password')!==data.get('confirmPassword')){showFormError(form,new Error('Your passwords do not match. Please check both fields.'));return;}
      const profile=readProfile(form,isSignup?{}:state(ctx).profile||{});
      const validationMessage=validateProfileDetails(profile);if(validationMessage){showFormError(form,new Error(validationMessage));return;}
      if(!form.reportValidity())return;rememberDraft();
      setFormBusy(form,true,isSignup&&!auth.getAuthState().user?'Creating your account…':'Saving your profile…');
      let activeUser=auth.getAuthState().user;
      try{
        if(isSignup&&!auth.getAuthState().user){
          const credential=await auth.signUpWithEmail(profile.email,String(data.get('password')),profile.name);activeUser=credential.user;formUserId=activeUser.uid;assertAccount();
          setFormStatus(form,credential.warnings?.length?`Account created. ${credential.warnings.join(' ')}`:'Account created. Check your inbox for your email verification link.');
        }
        assertAccount();const user=activeUser||auth.getAuthState().user;
        if(!user)throw new Error('Please sign in again before saving your profile.');
        profile.id=user?.uid||profile.id;profile.email=user?.email||profile.email;
        profileDrafts.set(profile.id,{profile,photo:selectedPhoto});profileDrafts.delete('signup');
        if(selectedPhoto){setFormBusy(form,true,'Uploading your picture…');const uploaded=await auth.uploadImage(selectedPhoto,{kind:'avatar'});assertAccount();profile.photoURL=uploaded.url;profile.avatar=uploaded.url;profile.photoSource='custom';photoField.value=uploaded.url;photoSource.value='custom';selectedPhoto=null;profileDrafts.set(profile.id,{profile,photo:null});photoStatus.textContent='Picture uploaded. Saving profile…';}
        assertAccount();setFormBusy(form,true,'Saving your profile…');await ctx.store.saveProfile(profile);assertAccount();profileDrafts.delete(profile.id);profileDrafts.delete('signup');releasePreview();profileTab='overview';profileTabChosen=true;form.dataset.authDirty='false';
        setFormBusy(form,false);ctx.toast(isSignup?'Welcome to BSS. Your profile is saved.':'Your profile has been saved.');ctx.navigate('/profile');ctx.render();
      }catch(error){
        if(isSignup&&accountMatches()&&auth.getAuthState().user){
          form.querySelectorAll('[data-signup-passwords] input').forEach(input=>{input.disabled=true;input.required=false;});
          form.querySelector('[data-signup-passwords]').hidden=true;form.elements.email.readOnly=true;
          setFormStatus(form,'Your sign-in account exists, but these member details have not been saved yet. Keep this page open and choose “Finish my profile” to retry.');
        }
        showFormError(form,error);setFormBusy(form,false,isSignup?(auth.getAuthState().user?'Finish my profile ↗':'Create my account ↗'):'Save profile');
      }
    });
  }
}

export function mountCommunity(ctx) {
  document.querySelectorAll('.member-avatar img').forEach(img=>{const fallback=()=>{img.hidden=true;const initials=img.closest('.member-avatar')?.querySelector('[data-avatar-initials]');if(initials)initials.hidden=false;};img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback();});
  applyDirectoryFilters();
  applyWallFilters();
  const wallRequested = Boolean(currentRoute().includes('wall=1'));
  if (wallRequested && !wallDeepLinkHandled) { const wall = document.getElementById('community-wall'), heading = document.getElementById('wall-title'); wall?.scrollIntoView?.({block: 'start'}); heading?.setAttribute('tabindex', '-1'); heading?.focus?.({preventScroll: true}); }
  wallDeepLinkHandled = wallRequested;
  document.getElementById('community-search')?.addEventListener('input', event => { directoryState.query = event.target.value; applyDirectoryFilters(); });
  mountAccountForms(ctx);
  document.querySelectorAll('#app [data-community-action]').forEach(button => button.addEventListener('click', async () => {
    const action = button.dataset.communityAction, s = state(ctx);
    if (['signout','send-verification','reload-user','account-reset'].includes(action)) {
      button.disabled=true;
      try {
        if(action==='signout'){profileDrafts.clear();profileTabChosen=false;await auth.signOut();await ctx.store.refreshSession();profileTab='overview';ctx.navigate('/signin');ctx.render();ctx.toast('You have signed out.');}
        if(action==='send-verification'){await auth.sendVerificationEmail();ctx.toast('Verification email sent. Please check your inbox.');}
        if(action==='reload-user'){await auth.reloadUser();await ctx.store.refreshSession();ctx.render();ctx.toast(auth.getAuthState().user?.emailVerified?'Email verified. Thank you!':'Your email is not verified yet. Open the link in your inbox, then try again.');}
        if(action==='account-reset'){await auth.sendPasswordReset(auth.getAuthState().user.email);ctx.toast('If your account supports email sign-in, a reset link will arrive shortly.');}
      }catch(error){ctx.toast(auth.friendlyError?.(error)||error.message);}finally{button.disabled=false;}
      return;
    }

    if(action==='refresh-directory'){button.disabled=true;try{await ctx.store.refresh();ctx.render();}catch(error){ctx.toast(error.message);}finally{button.disabled=false;}return;}
    if (action === 'post-filter') { wallFilter = button.dataset.filter; applyWallFilters(); }
    if (action === 'post-compose') composePost(ctx, button.dataset.category);
    if (action === 'post-reply') replyToPost(ctx, button.dataset.id);
    if (action === 'post-heart' && requireWallProfile(ctx)) { try { await ctx.store.togglePostHeart(button.dataset.id); ctx.render(); } catch (error) { ctx.toast(error.message); } }
    if (action === 'post-delete') confirmAction(ctx, 'Remove your note?', 'This also removes its replies from the adda wall. This cannot be undone.', 'Delete my note', async () => { await ctx.store.deleteCommunityPost(button.dataset.id); ctx.toast('Your note was removed.'); });
    if (action === 'filter') { directoryState.type = button.dataset.filter; applyDirectoryFilters(); }
    if (action === 'mentors') { directoryState.mentors = !directoryState.mentors; applyDirectoryFilters(); }
    if (action === 'clear-filters') { directoryState.query = ''; directoryState.type = 'all'; directoryState.mentors = false; const search = document.getElementById('community-search'); if (search) search.value = ''; applyDirectoryFilters(); }
    if (action === 'profile-tab') { profileTab = button.dataset.tab; profileTabChosen=true; ctx.render(); }
    if (action === 'connect' || action === 'mentor') requestConnection(ctx, button.dataset.memberId, action === 'mentor');
    if (action === 'ticket-qr') { const ticket = personalRecords(ctx, 'tickets').find(item => item.id === button.dataset.id); if (ticket) ctx.showTicket(ticket, 'event'); }
    if (action === 'order-qr') { const order = personalRecords(ctx, 'orders').find(item => item.id === button.dataset.id); if (order) ctx.showTicket(order, 'food'); }
    if (action === 'cancel-ticket') confirmAction(ctx, 'Cancel this registration?', 'Your ticket will become invalid and its place will be released.', 'Cancel registration', async () => { await ctx.store.cancelTicket(button.dataset.id); ctx.toast('Registration cancelled.'); });
    if (action === 'cancel-order') confirmAction(ctx, 'Cancel this food order?', 'Your unpaid order will be cancelled and its reserved stock released.', 'Cancel order', async () => { await ctx.store.cancelOrder(button.dataset.id); ctx.toast('Food order cancelled.'); });
    if (action === 'toggle-visibility' && s.profile) { try { if(!s.profile.directoryVisible&&!profileRequirements(s.profile).complete){profileTab='edit';profileTabChosen=true;ctx.render();ctx.toast('Complete your required member details before joining the directory.');return;}await ctx.store.saveProfile(s.profile.directoryVisible?{directoryVisible:false}:{ ...s.profile, directoryVisible:true }); ctx.toast(s.profile.directoryVisible ? 'Your profile is now hidden.' : (s.profile.status === 'approved' ? 'Your approved public profile is now visible in the directory.' : 'Directory opt-in saved. Your listing is awaiting membership approval.')); ctx.render(); } catch (error) { ctx.toast(error.message); } }
    if (action === 'export-data' && s.profile) {
      const payload = { exportedAt: new Date().toISOString(), profile: s.profile, tickets: personalRecords(ctx, 'tickets'), orders: personalRecords(ctx, 'orders'), messages: list(s.messages).filter(m => requestOwnerId(m) === s.profile.id), volunteerApplications: list(s.volunteers).filter(m => requestOwnerId(m) === s.profile.id), communityNotes: list(s.posts).filter(m => m.userId === s.profile.id) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'my-bss-account-data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); ctx.toast('Your available account data download is ready.');
    }
  }));
}

export {communityStyles} from './ui-styles.js';
