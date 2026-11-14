import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'atelie-admin-reset-'));
Object.assign(process.env,{DATA_DIR:dir,DATABASE_URL:'',POSTGRES_URL:'',NETLIFY:'',VERCEL:''});
const start=Date.now()-60000;process.env.ADMIN_ANALYTICS_START_AT=new Date(start).toISOString();
const {report}=await import('../dist/server/server/admin/analytics.js');
after(async()=>{await rm(dir,{recursive:true,force:true});});
test('campaign reset filters old activity and orders without deleting their history',async()=>{
 const old=new Date(start-1000).toISOString(),fresh=new Date(start+1000).toISOString();
 const sessions=[old,fresh].map((at,i)=>({id:'session-'+i,visitor:'visitor-'+i,device:'mobile',source:'Meta',campaign:'teste',started:at,last:at,events:[{id:'event-'+i,name:'visit',at,path:'/'}]}));
 const orders=[old,fresh].map((at,i)=>({id:'order-'+i,createdAt:at,status:'paid',analyticsSessionId:'session-'+i,paidAt:at,items:[],totals:{payable:50},payment:{providerRef:'test-'+i,charge:{copyPaste:'fake'}}}));
 await writeFile(path.join(dir,'analytics-local.json'),JSON.stringify(sessions));await writeFile(path.join(dir,'orders.json'),JSON.stringify(orders));
 const data=await report(30,'all','all');assert.equal(data.totals.sessions,1);assert.equal(data.totals.paid,1);assert.equal(data.totals.revenue,50);assert.equal(data.from,new Date(start).toISOString());assert.equal(data.collectionStarted,data.from);
 assert.equal(JSON.parse(await readFile(path.join(dir,'analytics-local.json'))).length,2);assert.equal(JSON.parse(await readFile(path.join(dir,'orders.json'))).length,2);
});
