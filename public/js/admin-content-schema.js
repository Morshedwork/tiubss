export const contentSchemas = {
  reels: {label:'Instagram reels',singular:'Reel',fields:[['title','Title',true,120],['url','Instagram reel URL',true,500,'url'],['category','Section',true,50],['caption','Caption',false,2000,'textarea']]},
  gallery: {label:'Photos & artworks',singular:'Photo or artwork',fields:[['title','Title',true,120],['image','Image',true,1500,'image'],['category','Category',true,50],['caption','Caption',false,2000,'textarea']]},
  news: {label:'Stories & updates',singular:'Story',fields:[['title','Title',true,160],['slug','Page slug',true,100],['date','Date',true,10,'date'],['category','Category',true,50],['image','Cover image',false,1500,'image'],['excerpt','Short introduction',true,500,'textarea'],['body','Story',true,16000,'textarea']]},
  committee: {label:'Committee',singular:'Committee member',fields:[['name','Name',true,100],['role','Role',true,100],['term','Term',true,60],['photo','Individual picture',false,1500,'image'],['bio','Introduction',false,2000,'textarea']]},
  partners: {label:'Partners',singular:'Partner',fields:[['name','Name',true,100],['website','Website',false,500,'url'],['logo','Logo',false,1500,'image'],['description','Description',false,2000,'textarea']]},
};
export const settingsFields = [['title','Community name',true,160],['announcement','Homepage announcement',false,180,'textarea'],['instagram','Instagram URL',false,500,'url'],['email','Contact email',false,254,'email']];
