import loaderTemplate from '../../scripts/sillytavern-loader.js?raw';

export function createStLoaderArtifacts(directory:string):{source:string;script:Record<string,unknown>} {
 const base=new URL(directory);
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw new Error('请使用 HTTP 或 HTTPS 部署目录');
 if(!base.pathname.endsWith('/'))base.pathname+='/';
 const source=loaderTemplate.replace("'https://YOUR_MATCH3_HOST/'",JSON.stringify(base.href));
 return {source,script:{type:'script',enabled:true,name:'三消战斗与魂片',id:'ac62c751-6672-4f80-8b93-cf317ec7bf65',content:source,info:'部署网页由酒馆助手加载。一个存档绑定一个聊天，最多三个存档。请先启用 MVU 并同步三消变量结构。',button:{enabled:true,buttons:[{name:'三消存档',visible:true}]},data:{},export_with:{data:true,button:true}}};
}
