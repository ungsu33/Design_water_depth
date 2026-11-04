const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let payload='',calls=[],failures=0,httpStatus=200;const input={value:'fake%2B%2F%3Dkey',focus(){}};
const sandbox={Map,Math,Date,JSON,Number,Object,String,Error,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout,decodeURIComponent,
  document:{getElementById:()=>input},fetch:async url=>{calls.push(url);if(failures-->0) throw new TypeError('network');return{ok:httpStatus===200,status:httpStatus,text:async()=>payload};}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_api.js'),'utf8'),sandbox);
(async()=>{
 let checks=0;
 for(const [i,lat,lon,depth] of [[1,37.8,128.98,82.72],[2,36.95,129.5,137.1],[3,35.5,129.55,106.81]]) {
  payload=fs.readFileSync(path.join(__dirname,`fixtures/site_${i}.json`),'utf8');
  const r=await sandbox.queryKhoaDirect(lat,lon);assert.equal(r.nearest.depth_m,depth);assert.ok(!JSON.stringify(r).includes('fake'));checks++;
 }
 assert.equal(new URL(calls[0]).searchParams.get('serviceKey'),'fake+/=key');checks++;
 assert.equal(new URL(calls[0]).searchParams.get('ymin'),'37.7950');checks++;
 assert.equal((await sandbox.queryKhoaDirect(37.8,128.98)).cached,true);assert.equal(calls.length,3);checks++;
 input.value='';await assert.rejects(sandbox.queryKhoaDirect(0,0),/인증키/);checks++;
 input.value='fake';payload=JSON.stringify({header:{resultCode:'03'}});await assert.rejects(sandbox.queryKhoaDirect(0,0),/수심자료가 없습니다/);checks++;
 payload='<error>user-key-sensitive</error>';await assert.rejects(sandbox.queryKhoaDirect(1,1),e=>!e.message.includes('user-key-sensitive'));checks++;
 for(const [lat,lon] of [[37.812345,128.987654],[37.800001,128.980001],[-37.812345,-128.987654],[90,180],[-90,-180]]) {
  const b=sandbox.khoaBounds(lat,lon);
  for(const v of Object.values(b)) assert.match(v,/^-?\d+\.\d{4}$/);
  assert.ok(Number(b.ymin)<=Math.max(-90,lat-.005)+1e-10);
  assert.ok(Number(b.ymax)>=Math.min(90,lat+.005)-1e-10);
  assert.ok(Number(b.xmin)<=Math.max(-180,lon-.005)+1e-10);
  assert.ok(Number(b.xmax)>=Math.min(180,lon+.005)-1e-10);checks++;
 }
 input.value='fake%2B%2F%3Dkey';
 payload=fs.readFileSync(path.join(__dirname,'fixtures/site_1.json'),'utf8');
 const precise=await sandbox.queryKhoaDirect(37.800001,128.980001);
 assert.equal(precise.input.latitude,37.800001);assert.equal(precise.input.longitude,128.980001);assert.equal(precise.nearest.depth_m,82.72);checks++;
 const request=new URL(calls.at(-1));assert.equal(request.searchParams.get('ymin'),'37.7950');assert.equal(request.searchParams.get('ymax'),'37.8051');checks++;
 failures=1;let before=calls.length;await sandbox.queryKhoaDirect(37.800002,128.980002);assert.equal(calls.length-before,2);checks++;
 failures=2;before=calls.length;await assert.rejects(sandbox.queryKhoaDirect(37.800003,128.980003),/\[NETWORK\]/);assert.equal(calls.length-before,2);checks++;
 payload='<OpenAPI_ServiceResponse><returnReasonCode>30</returnReasonCode><secret>must-not-leak</secret></OpenAPI_ServiceResponse>';
 await assert.rejects(sandbox.queryKhoaDirect(2,2),e=>e.message.includes('[API_30]')&&!e.message.includes('must-not-leak'));checks++;
 httpStatus=503;before=calls.length;await assert.rejects(sandbox.queryKhoaDirect(2,2),/\[HTTP_503\]/);assert.equal(calls.length-before,2);checks++;
 const cancel=new AbortController();cancel.abort();before=calls.length;await assert.rejects(sandbox.queryKhoaDirect(4,4,cancel.signal),e=>e.name==='AbortError');assert.equal(calls.length,before);checks++;
 console.log(JSON.stringify({checks,passed:true,mode:'browser-only, mocked network, original live fixtures'}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
