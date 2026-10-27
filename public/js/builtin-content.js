import {FEATURED_REELS} from './featured-reels-data.js';
import {PANEL_POSTS} from './panel-data.js';
import {CULTURE_STORIES} from './culture-data.js';
const illustrations={language:'assets/landmark-dhaka-v4.svg',parliament:'assets/landmark-parliament-v4.svg',tokyo:'assets/landmark-tokyo-v4.svg',sakura:'assets/sakura-folk-v3.svg'};
const records=[
 ...FEATURED_REELS.map(row=>({...row,collection:'reels'})),
 ...PANEL_POSTS.map(row=>({...row,pictures:row.images.map(image=>image.src).join('\n'),collection:'panels'})),
 ...CULTURE_STORIES.map(row=>({...row,image:illustrations[row.id],collection:'culture'})),
 {id:'reference-peacocks',title:'Colour, culture & connection',category:'Art & Culture',image:'assets/reference-peacocks.webp',caption:'Artwork supplied as a visual reference for this website.',collection:'gallery'},
 {id:'reference-flowers',title:'Rooted in tradition',category:'Art & Culture',image:'assets/reference-flowers.webp',caption:'Artwork supplied as a visual reference for this website.',collection:'gallery'}
];
export const BUILTIN_RECORDS=records.map(row=>({...row,id:'builtin_'+row.collection+'_'+row.id,status:'published',version:0,builtin:true}));
export const builtinRecord=(kind,id)=>BUILTIN_RECORDS.find(row=>row.collection===kind&&row.id===id);
export function mergeBuiltinRecords(saved){
 const overrides=new Map(saved.map(row=>[row.id,row]));
 const custom=saved.filter(row=>!builtinRecord(row.collection,row.id)).map(row=>row.collection==='panels'?{...row,images:String(row.pictures||'').split('\n').map(src=>src.trim()).filter(Boolean).map(src=>({src,alt:row.title}))}:row);
 return [...custom,...BUILTIN_RECORDS.map(row=>{
  const override=overrides.get(row.id),result={...row,...override,builtin:true};
  // Local reel excerpts must never be attached to a newly substituted Instagram URL.
  if(override&&row.collection==='reels'&&override.url!==row.url){delete result.video;delete result.poster;}
  if(row.collection==='panels'&&override){result.images=String(result.pictures||'').split('\n').filter(Boolean).map(src=>row.images.find(image=>image.src===src)||{src,alt:result.title});if(result.pictures!==row.pictures)delete result.advisors;}
  return result;
 })];
}
