import test from 'node:test';
import assert from 'node:assert/strict';
import {scanWardriveFile,uploadWardriveFile,checkWardriveFile,waitForUpload} from '../web/wardrive-upload.mjs';
import {parseWardrive,WARD_MAX_BYTES} from '../worker/wardrive-parser.mjs';
const now=Date.now()/1000,header='MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type\n';
const date=n=>new Date((now-3600-n)*1000).toISOString();
const row=(n=0,name='WIFI_8K_test')=>`C0:18:82:17:38:A0,${name},[OPEN],${date(n)},6,-52,37.12345,-122.12345,10,5,WIFI\n`;
const file=(...parts)=>new Blob(parts,{type:'text/csv'});

test('large browser exports stream past 2 MiB/10,000 rows/500 matches and only send bounded candidate batches',async()=>{
 const blob=file('WigleWifi-1.6,appRelease=test\n',header,row(0,'Home router').repeat(25000),Array.from({length:601},(_,i)=>row(i)).join(''),row(0));
 assert.ok(blob.size>WARD_MAX_BYTES);
 // Never materialize the full file. The implementation must read slices.
 blob.text=blob.arrayBuffer=()=>{throw Error('Whole-file read is forbidden');};
 const preview=await scanWardriveFile(blob,'UTC',{now});
 assert.equal(preview.rows,25602);assert.equal(preview.unrelated,25000);assert.equal(preview.candidates,602);
 const seen=new Set(),delays=[],sizes=[],progress=[];
 const fetcher=async(url,request)=>{
  assert.equal(url,'/v1/wardrives');assert.equal(request.redirect,'error');assert.equal(request.credentials,'omit');
  assert.ok(!request.body.includes('Home router'));sizes.push(Buffer.byteLength(request.body));assert.ok(sizes.at(-1)<WARD_MAX_BYTES);
  const parsed=parseWardrive(request.body,'UTC',now);let accepted=0,duplicates=parsed.summary.duplicates;
  assert.ok(parsed.summary.rows<=100);
  for(const r of parsed.observations){if(seen.has(r.identity))duplicates++;else{seen.add(r.identity);accepted++;}}
  return Response.json({accepted,duplicates});
 };
 const options={now,fetcher,wait:async ms=>{delays.push(ms);},onProgress:p=>progress.push(p)};
 const first=await uploadWardriveFile(blob,'a'.repeat(64),'UTC',options);
 assert.equal(first.accepted,601);assert.equal(first.duplicates,1);assert.equal(first.batches,7);
 assert.equal(progress.at(-1).bytesRead,blob.size);assert.equal(delays.length,6);assert.ok(delays.every(n=>n===11000));
 const replay=await uploadWardriveFile(blob,'a'.repeat(64),'UTC',options);
 assert.equal(replay.accepted,0);assert.equal(replay.duplicates,602);assert.ok(Math.max(...sizes)<20000);
});

test('streaming preserves quoted multiline CSV, escaped quotes and UTF-8 across 64 KiB boundaries',async()=>{
 const ordinary=row(0,'"Home, ""guest""\nnetwork"');
 const prefix=header+ordinary.repeat(230);
 // Position an emoji and then an escaped quote directly across a read boundary.
 for(const tail of ['😀','""quote""']){
  const padding=(65536-Buffer.byteLength(prefix+'C0:18:82:17:38:A0,"')%65536-1+65536)%65536;
  // Pad using complete blank lines, keeping individual fields bounded.
  const blob=file('\n'.repeat(padding),prefix,row(0,`"${tail}"`),row(1));
  const summary=await scanWardriveFile(blob,'UTC',{now});
  assert.equal(summary.rows,232);assert.equal(summary.unrelated,231);assert.equal(summary.candidates,1);
 }
});

test('preview rejects malformed tail, oversized records, invalid UTF-8 and oversized files',async()=>{
 await assert.rejects(scanWardriveFile(file(header,row(),'"unfinished'),'UTC'),/Unclosed/);
 await assert.rejects(scanWardriveFile(file(header,'x'.repeat(330001)),'UTC'),/record too long/);
 await assert.rejects(scanWardriveFile(file(header,new Uint8Array([0xff])),'UTC'),/UTF-8/);
 assert.throws(()=>checkWardriveFile({size:256*1024*1024+1,slice(){}}),/256 MiB/);
 await assert.rejects(scanWardriveFile(file(''),'UTC'),/header/);
 await assert.rejects(scanWardriveFile(file(header,row()),'nonsense'),/Choose UTC/);
});

test('batch retries respect Retry-After and stop immediately for rejected credentials',async()=>{
 const waits=[];let attempts=0;
 const result=await uploadWardriveFile(file(header,row()),'a'.repeat(64),'UTC',{now,wait:async ms=>waits.push(ms),fetcher:async()=>{
  attempts++;
  if(attempts===1)return Response.json({error:'Please retry shortly'},{status:429,headers:{'Retry-After':'3'}});
  if(attempts===2)return new Response('Temporarily unavailable',{status:503});
  return Response.json({accepted:1,duplicates:0});
 }});
 assert.equal(result.accepted,1);assert.deepEqual(waits,[3000,20000]);
 let calls=0;
 await assert.rejects(uploadWardriveFile(file(header,row()),'a'.repeat(64),'UTC',{fetcher:async()=>{
  calls++;return Response.json({error:'Invalid or revoked node key'},{status:401});
 }}),/Invalid or revoked/);
 assert.equal(calls,1);
});

test('cancel stops subsequent batches and retains completed count for a safe retry',async()=>{
 const signal=new AbortController();let calls=0;
 const blob=file(header,Array.from({length:101},(_,i)=>row(i)).join(''));
 await assert.rejects(uploadWardriveFile(blob,'a'.repeat(64),'UTC',{signal:signal.signal,wait:async()=>signal.abort(),fetcher:async()=>{
  calls++;return Response.json({accepted:100,duplicates:0});
 }}),e=>e.name==='AbortError'&&e.accepted===100&&e.batches===1);
 assert.equal(calls,1);
 const waiting=new AbortController(),pause=waitForUpload(60000,waiting.signal);waiting.abort();
 await assert.rejects(pause,e=>e.name==='AbortError');
 const cancelled=new AbortController();cancelled.abort();
 await assert.rejects(scanWardriveFile(blob,'UTC',{signal:cancelled.signal}),e=>e.name==='AbortError');
});

test('large candidate rows split by encoded byte size as well as row count',async()=>{
 const wideHeader=header.trimEnd().replace(',Type',','+Array.from({length:28},(_,i)=>'Extra'+i).join(',')+',Type')+'\n';
 const wideRow=row().replace(',WIFI\n',','+Array(28).fill('é'.repeat(4096)).join(',')+',WIFI\n');
 const sizes=[];
 const summary=await scanWardriveFile(file(wideHeader,wideRow.repeat(20)),'UTC',{now,onBatch:async(text)=>{
  sizes.push(Buffer.byteLength(text));assert.ok(sizes.at(-1)<WARD_MAX_BYTES);parseWardrive(text,'UTC',now);
 }});
 assert.equal(summary.rows,20);assert.ok(sizes.length>1);assert.ok(summary.candidates>0);
});
