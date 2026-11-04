/* Google Sites browser-only KHOA client; credentials are never persisted. */
const KHOA_ENDPOINT='https://apis.data.go.kr/1192136/waterDepth/GetWaterDepthApiService';
const directCache=new Map();
// Live probes rejected six-decimal bounds (code 10); four-decimal bounds work.
// Round OUTWARD so the search window still contains the requested ±0.005° area.
function khoaBounds(lat,lon) {
  const lower=v=>(Math.floor(v*10000+1e-7)/10000).toFixed(4);
  const upper=v=>(Math.ceil(v*10000-1e-7)/10000).toFixed(4);
  return {ymin:lower(Math.max(-90,lat-.005)),ymax:upper(Math.min(90,lat+.005)),xmin:lower(Math.max(-180,lon-.005)),xmax:upper(Math.min(180,lon+.005))};
}
function hasApiKey() { return Boolean(document.getElementById('api-key').value.trim()); }
async function fetchKhoa(params,signal) {
  for(let attempt=0;attempt<2;attempt++) {
    if(signal?.aborted) throw new DOMException('요청 중단','AbortError');
    const controller=new AbortController(),cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,15000);
    try {
      const response=await fetch(KHOA_ENDPOINT+'?'+params,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      const text=await response.text();
      if(!response.ok) {
        if(attempt===0&&(response.status===429||response.status>=500)) continue;
        throw new Error('[HTTP_'+response.status+'] API 서버의 응답 오류입니다. 잠시 후 다시 조회해 주세요.');
      }
      if(text.length>4000000) throw new Error('[RESPONSE] API 응답 크기가 허용 범위를 초과했습니다.');
      try {return JSON.parse(text);} catch {
        const code=text.match(/<(?:returnReasonCode|resultCode)>\s*(\d{1,3})\s*<\//i);
        if(code) throw new Error('[API_'+code[1]+'] API 게이트웨이가 요청을 거부했습니다. 인증키·활용 승인·호출 한도를 확인해 주세요.');
        throw new Error('[RESPONSE] API가 JSON 대신 오류 문서 또는 빈 응답을 보냈습니다.');
      }
    } catch(e) {
      if(signal?.aborted) throw new DOMException('요청 중단','AbortError');
      if(e.message?.startsWith('[')) throw e;
      if(attempt===0) continue;
      throw new Error(controller.signal.aborted?'[TIMEOUT] API 응답 시간을 초과해 1회 재시도했으나 실패했습니다.':'[NETWORK] 1회 재시도 후에도 API에 연결하지 못했습니다. 인터넷 연결·브라우저 요청 차단·API 서버 상태를 확인해 주세요.');
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
}
function distanceMeters(lat1,lon1,lat2,lon2) {
  const r=Math.PI/180,a1=lat1*r,a2=lat2*r;
  const a=Math.sin((a2-a1)/2)**2+Math.cos(a1)*Math.cos(a2)*Math.sin((lon2-lon1)*r/2)**2;
  return 12742017.6*Math.asin(Math.sqrt(Math.min(1,Math.max(0,a))));
}
async function queryKhoaDirect(latitude,longitude,signal) {
  const raw=document.getElementById('api-key').value.trim();
  if(!raw) {document.getElementById('api-key').focus();throw new Error('수심 API 인증키를 먼저 입력해 주세요. readme.txt의 일반 인증키 값을 사용합니다.');}
  let key;try {key=decodeURIComponent(raw.replace(/\s/g,''));} catch(e) {throw new Error('인증키의 URL 인코딩 형식을 확인해 주세요.');}
  const lat=Number(latitude),lon=Number(longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw new Error('위도·경도 범위를 확인해 주세요.');
  const id=lat+':'+lon,cached=directCache.get(id);
  if(cached && Date.now()-cached.time<300000) return Object.assign({},cached.result,{cached:true});
  const requestBounds=khoaBounds(lat,lon);
  const bounds=Object.fromEntries(Object.entries(requestBounds).map(([k,v])=>[k,Number(v)]));
  const points=new Map();let total=0,complete=false;const started=Date.now();
  for(let page=1;page<=4;page++) {
    const params=new URLSearchParams({serviceKey:key,type:'json',...requestBounds,pageNo:page,numOfRows:300});
    const payload=await fetchKhoa(params,signal);
    if(!payload||typeof payload!=='object') throw new Error('API 응답 형식을 확인할 수 없습니다.');
    const envelope=payload.response||payload,code=String((envelope.header||{}).resultCode);
    if(!['0','00'].includes(code)) {
      const messages={'3':'주변 영역에 수심자료가 없습니다.','03':'주변 영역에 수심자료가 없습니다.','20':'API 접근 권한을 확인해 주세요.','22':'API 호출 한도를 초과했습니다.','30':'등록되지 않은 인증키입니다.','31':'인증키 이용기간이 만료되었습니다.','10':'API가 좌표 형식을 거부했습니다.'};
      throw new Error('[API_'+(/^\d{1,3}$/.test(code)?code:'ERROR')+'] '+(messages[code]||'수심 API가 오류를 반환했습니다.'));
    }
    const body=envelope.body||{};total=Number(body.totalCount);const pageSize=Number(body.numOfRows||300);
    if(!Number.isInteger(total)||total<0||!Number.isInteger(pageSize)||pageSize<=0) throw new Error('API 자료 건수를 읽을 수 없습니다.');
    let items=body.items||{};items=Array.isArray(items)?items:(items.item||[]);if(!Array.isArray(items)) items=[items];
    for(const item of items) {
      if(!item||['lat','lot','dpwt'].some(k=>item[k]===null||item[k]===undefined||item[k]==='')) throw new Error('수심 또는 좌표가 없는 자료가 있습니다.');
      const a=Number(item.lat),b=Number(item.lot),depth=Number(item.dpwt);
      if(![a,b,depth].every(Number.isFinite)||a<bounds.ymin-1e-9||a>bounds.ymax+1e-9||b<bounds.xmin-1e-9||b>bounds.xmax+1e-9) throw new Error('API 자료의 좌표·수심 검사를 통과하지 못했습니다.');
      points.set(a+':'+b,{latitude:a,longitude:b,depth_m:depth,distance_m:Math.round(distanceMeters(lat,lon,a,b)*100)/100});
    }
    if(page*pageSize>=total) {complete=true;break;}
  }
  const ordered=[...points.values()].sort((a,b)=>a.distance_m-b.distance_m);
  if(!complete||ordered.length!==total) throw new Error('전체 자료 수집을 완료하지 못했습니다. 잠시 후 다시 조회해 주세요.');
  if(!ordered.length) throw new Error('주변 영역에 유효한 수심자료가 없습니다. 다른 해상 좌표를 선택해 주세요.');
  const result={input:{latitude:lat,longitude:lon},nearest:ordered[0],points:ordered,count:ordered.length,bounds,
    minimum_depth_m:Math.min(...ordered.map(p=>p.depth_m)),maximum_depth_m:Math.max(...ordered.map(p=>p.depth_m)),
    queried_at:new Date().toISOString(),elapsed_seconds:(Date.now()-started)/1000,cached:false,
    source:'국립해양조사원 자연과학용 수심정보',source_url:'https://www.data.go.kr/data/15142498/openapi.do',
    selection_method:'nearest_point_no_interpolation',api_bounds_decimal_places:4,distribution_spacing_m:150,vertical_datum:'미확인',horizontal_crs:'미확인',survey_date:'미확인',
    note:'최근접 자료점 수심. 입력점의 직접 측량값이 아니며 육해상 판정·현장 정확도 검증은 수행하지 않았습니다.'};
  if(directCache.size>=100) directCache.clear();directCache.set(id,{time:Date.now(),result});return result;
}
