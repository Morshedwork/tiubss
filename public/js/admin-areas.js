/** Every footer destination has an explicit, protected workspace destination. */
export const ADMIN_AREAS = [
 ['Come together','Events & gatherings','/events','/admin/services/events','Create, edit and publish events; manage guest registrations.'],
 ['Come together','Our community','/community','/admin/services/members','Review memberships and member details.','/admin/services/wall','Moderate the adda wall'],
 ['Come together','Alumni network','/alumni','/admin/services/members?type=alumni','Review alumni profiles and membership approvals.'],
 ['Come together','Find a mentor','/mentorship','/admin/services/inbox?type=mentorship','Review and update mentorship requests.'],
 ['Get involved','Volunteer with us','/volunteer','/admin/services/volunteers','Review, approve or close volunteer applications.'],
 ['Get involved','Our committee','/committee','/admin/committee','Publish committee names, roles, pictures and introductions.','/admin/panels','Manage committee panels'],
 ['Get involved','Partner with us','/partners','/admin/partners','Manage published partners.','/admin/services/inbox?type=partners','Partnership requests'],
 ['Get involved','Say hello','/contact','/admin/services/inbox?type=contact','Read and follow up on contact requests.'],
 ['Your space','My dashboard','/profile','/admin/services/members','Review member records; personal profiles remain controlled by each member.'],
 ['Your space','My tickets & food orders','/tickets','/admin/services/registrations','Look up registrations and check in guests.','/admin/services/orders','Manage food orders'],
 ['Your space','Order from food stalls','/food','/admin/services/menu','Manage dishes, prices, stock and allergens.','/admin/services/vendors','Manage food stalls'],
 ['Your space','Community journal','/news','/admin/news','Write stories and publish or unpublish updates.'],
 ['Your space','Instagram reels','/reels','/admin/reels','Manage reel links, sections, captions and visibility.'],
 ['Your space','Photos & artworks','/gallery','/admin/gallery','Upload, edit, publish and remove gallery items.'],
 ['Your space','Bangladesh ↔ Japan','/culture','/admin/culture','Edit and publish cultural postcard stories.'],
 ['Your space','Make your own art','/art-studio','/admin/art-studio','Create a postcard, download it or publish it to the gallery.'],
 ['Your space','Admin sign-in','/admin/login','/admin/settings','Manage website settings. Owners can manage invitations in Admin team.'],
 ['Your space','Food counter','/staff/food','/admin/services/counter','Prepare orders, record received cash and verify pickups.']
];
export function renderAdminAreas(c){
 return `<section class="sa-areas"><p class="panel-note">Every area of the website, together in one workspace. Manage events, food orders, memberships and content with your Admin workspace account.</p>${['Come together','Get involved','Your space'].map(group=>`<section class="panel"><div class="panel-heading"><h2>${group}</h2></div><div class="sa-area-grid">${ADMIN_AREAS.filter(row=>row[0]===group).map(([,name,page,manage,note,extra,extraLabel])=>`<article class="sa-area-card"><h3>${c.esc(name)}</h3><p>${c.esc(note)}</p><div class="table-actions"><a class="btn btn-primary" href="${manage}">Manage</a><a class="btn btn-ghost" href="${page}" target="_blank" rel="noopener">View page ↗</a>${extra?`<a class="text-link" href="${extra}">${c.esc(extraLabel)} →</a>`:''}</div></article>`).join('')}</div></section>`).join('')}</section>`;
}
