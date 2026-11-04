'use strict';
const $ = id => document.getElementById(id);
const presets = {gangneung:[37.8,128.98],uljin:[36.95,129.5],ulsan:[35.5,129.55]};
const koreaBounds = [[32,123],[40.5,133]];
const map = L.map('map', {zoomControl:true}).fitBounds(koreaBounds);
const tile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:18, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
}).addTo(map);
let tileErrors = 0;
tile.on('tileerror', () => { if (++tileErrors >= 3) $('tile-warning').hidden=false; });
tile.on('tileload', () => {tileErrors=0; $('tile-warning').hidden=true;});
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const resultLayer = L.layerGroup().addTo(map);
const inputIcon = L.divIcon({className:'map-pin',html:'<span></span>',iconSize:[20,20],iconAnchor:[10,10]});
const nearestIcon = L.divIcon({className:'map-pin nearest',html:'<span></span>',iconSize:[16,16],iconAnchor:[8,8]});
let marker = L.marker(presets.gangneung,{icon:inputIcon,zIndexOffset:1000,title:'입력 위치'}).addTo(map).bindPopup('입력 위치<br>37.800000, 128.980000');
let currentResult = null, controller=null, serial=0;
function feedback(text, state='') { $('feedback').textContent=text; $('feedback').className='feedback '+state; }
function status(text,state='') { $('result-status').textContent=text; $('result-status').className='badge '+state; }
function busy(flag) { $('query-button').disabled=flag; $('query-button').firstElementChild.textContent=flag?'수심자료 조회 중…':'수심 조회하기'; document.body.classList.toggle('busy',flag); $('coordinate-form').setAttribute('aria-busy',String(flag)); }
function resetResult() {
  currentResult=null; resultLayer.clearLayers();
  for(const id of ['depth-value','nearest-coordinates','nearest-distance','depth-range','query-time','point-count']) $(id).textContent='—';
  $('download-csv').disabled=$('download-json').disabled=true;
  status('조회 대기'); feedback('좌표를 입력한 뒤 수심을 조회해 주세요.');
}
function inputLocation(center=false) {
  const lat=$('latitude').valueAsNumber, lon=$('longitude').valueAsNumber;
  if (!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return null;
  marker.setLatLng([lat,lon]).bindPopup('입력 위치<br>'+lat.toFixed(6)+', '+lon.toFixed(6));
  $('map-coordinates').textContent=lat.toFixed(6)+'° / '+lon.toFixed(6)+'°';
  if(center) map.setView([lat,lon],9);
  return [lat,lon];
}
function changed() { serial++; if(controller) controller.abort(); busy(false); resetResult(); inputLocation(); }
for(const id of ['latitude','longitude']) $(id).addEventListener('input',changed);
map.on('click',e=>{ $('latitude').value=e.latlng.lat.toFixed(6); $('longitude').value=e.latlng.lng.toFixed(6); changed(); marker.openPopup(); });
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  const [lat,lon]=presets[button.dataset.preset]; $('latitude').value=lat; $('longitude').value=lon; changed(); inputLocation(true); $('coordinate-form').requestSubmit();
}));
$('reset-map').addEventListener('click',()=>map.fitBounds(koreaBounds));
$('coordinate-form').addEventListener('submit',async event=>{
  event.preventDefault(); const location=inputLocation(); if(!location) return;
  if(controller) controller.abort(); const mySerial=++serial; controller=new AbortController(); const thisController=controller;
  resetResult(); busy(true); status('조회 중'); feedback('국립해양조사원의 주변 수심자료를 불러오고 있습니다.');
  const timer=setTimeout(()=>thisController.abort(),65000);
  try {
    const response=await fetch('/api/depth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:location[0],longitude:location[1]}),signal:thisController.signal});
    const result=await response.json(); if(mySerial!==serial) return;
    if(!response.ok) throw new Error(result.error || '조회에 실패했습니다.');
    currentResult=result; const near=result.nearest;
    $('depth-value').textContent=near.depth_m.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    $('nearest-coordinates').textContent=near.latitude.toFixed(6)+' / '+near.longitude.toFixed(6);
    $('nearest-distance').textContent=near.distance_m.toFixed(2)+' m';
    $('depth-range').textContent=result.minimum_depth_m.toFixed(2)+' ~ '+result.maximum_depth_m.toFixed(2)+' m';
    $('query-time').textContent=new Date(result.queried_at).toLocaleString('ko-KR',{hour12:false});
    $('point-count').textContent=result.count.toLocaleString();
    status('조회 완료','success');
    feedback(result.count+'개 자료점 수집 · '+(result.cached?'5분 이내 캐시 사용':'실시간 API 조회')+(result.saved_locally?' · 결과 자동 저장':''));
    if(!result.saved_locally) feedback('조회 완료. 자동 저장에 실패했습니다. 아래 버튼으로 결과를 저장해 주세요.','error');
    for(const p of result.points) L.circleMarker([p.latitude,p.longitude],{radius:3,weight:1,color:'#458e9f',fillColor:'#7cb5c0',fillOpacity:.65}).addTo(resultLayer).bindPopup('주변 수심자료<br>'+p.depth_m.toFixed(2)+' m<br>'+p.latitude.toFixed(6)+', '+p.longitude.toFixed(6));
    const b=result.bounds; L.rectangle([[b.ymin,b.xmin],[b.ymax,b.xmax]],{color:'#4e9eaa',weight:1,dashArray:'4 4',fillOpacity:.04}).addTo(resultLayer);
    L.marker([near.latitude,near.longitude],{icon:nearestIcon,zIndexOffset:2000,title:'최근접 수심자료 위치'}).addTo(resultLayer).bindTooltip('최근접 '+near.depth_m.toFixed(2)+' m',{direction:'top',offset:[0,-9]});
    map.setView(location,9);
    $('download-csv').disabled=$('download-json').disabled=false;
  } catch(error) {
    if(mySerial!==serial) return;
    status('조회 실패','error'); feedback(error.name==='AbortError'?'응답 시간이 초과되었습니다. 다시 조회해 주세요.':error.message,'error');
  } finally {clearTimeout(timer); if(mySerial===serial) busy(false);}
});
function download(text, extension, mime) {
  const url=URL.createObjectURL(new Blob([text],{type:mime}));const anchor=document.createElement('a');anchor.href=url;anchor.download='depth_'+currentResult.input.latitude+'_'+currentResult.input.longitude+'.'+extension;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('download-json').addEventListener('click',()=>{if(currentResult) download(JSON.stringify(currentResult,null,2),'json','application/json;charset=utf-8');});
$('download-csv').addEventListener('click',()=>{
  if(!currentResult) return;
  const columns=['input_latitude','input_longitude','latitude','longitude','depth_m','distance_m','queried_at','vertical_datum'];
  const lines=currentResult.points.map(p=>[currentResult.input.latitude,currentResult.input.longitude,p.latitude,p.longitude,p.depth_m,p.distance_m,currentResult.queried_at,'unconfirmed'].join(','));
  download('\uFEFF'+[columns.join(','),...lines].join('\r\n'),'csv','text/csv;charset=utf-8');
});
fetch('/api/health').then(r=>r.json()).then(h=>{$('connection-status').textContent=h.ready?'● 서버 준비 완료 · 인증정보 설정됨':'● 서버 인증키 설정 필요';}).catch(()=>{$('connection-status').textContent='서버 연결을 확인해 주세요.';});
