// Explicit live integration check. Credential stays in memory and is not logged.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname;
let key=process.env.KHOA_SERVICE_KEY?.trim();
const keyFile=path.join(root,'../readme.txt');
if(!key&&fs.existsSync(keyFile)) key=fs.readFileSync(keyFile,'utf8').split(/일반 인증키\s*[:：]\s*/)[1]?.trim();
if(!key) {console.error('Set KHOA_SERVICE_KEY or provide a local ignored readme.txt credential file.');process.exit(1);}
const input={value:key,focus(){}};
const context={Map,Math,Date,JSON,Number,Object,String,Error,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout,decodeURIComponent,fetch,document:{getElementById:()=>input}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'direct_api.js'),'utf8'),context);
(async()=>{
 const results=[];
 for(const [lat,lon] of [[37.812345,128.987654],[37.800001,128.980001],[37.8,128.98],[36.95,129.5],[35.5,129.55]]) {
  const r=await context.queryKhoaDirect(lat,lon);assert.equal(r.input.latitude,lat);assert.equal(r.input.longitude,lon);
  assert.ok(r.count>0);assert.ok(!JSON.stringify(r).includes(input.value));
  results.push(r);
 }
 const output={checked_at:new Date().toISOString(),passed:true,results};
 fs.writeFileSync(path.join(root,'live_coordinate_regression.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify(results.map(r=>({input:r.input,depth_m:r.nearest.depth_m,count:r.count,bounds:r.bounds})),null,2));
})().catch(()=>{console.error('Live integration check failed; credential and raw exception suppressed.');process.exitCode=1;});
