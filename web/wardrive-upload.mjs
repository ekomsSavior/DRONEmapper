/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
import {csvRows,parseWardrive,cameraSignature} from '../worker/wardrive-parser.mjs';

export const BROWSER_MAX_BYTES=256*1024*1024;
const READ_BYTES=64*1024,BATCH_BYTES=1024*1024,BATCH_ROWS=100;
const encoder=new TextEncoder();
const csvLine=row=>row.map(value=>/[",\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value).join(',')+'\n';
const checkAbort=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
const emptySummary=()=>({rows:0,candidates:0,unrelated:0,invalid:0,outside_time_window:0,duplicates:0});
export function checkWardriveFile(file){
 if(!file||typeof file.slice!=='function')throw Error('Choose a CSV file.');
 if(file.size>BROWSER_MAX_BYTES)throw Error('Choose a completed CSV up to 256 MiB.');
}
// Keep only one CSV record in memory. Quote state survives byte/chunk boundaries;
// the shared strict CSV parser validates each completed record, including fields.
async function* records(file,signal,onProgress){
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let record='',quoted=false;
 for(let offset=0;offset<file.size;offset+=READ_BYTES){
  checkAbort(signal);let text;
  const end=Math.min(offset+READ_BYTES,file.size);
  try{text=decoder.decode(await file.slice(offset,end).arrayBuffer(),{stream:end<file.size});}
  catch(e){if(e instanceof TypeError)throw Error('CSV must use UTF-8.');throw e;}
  checkAbort(signal);
  for(const char of text){
   if((char==='\r'||char==='\n')&&!quoted){
    if(record){for(const row of csvRows(record))yield row;record='';}
   }else{
    record+=char;if(char==='"')quoted=!quoted;
    // 40 fields of 4096 characters, including escaped quotes and separators.
    if(record.length>330000)throw Error('CSV record too long.');
   }
  }
  onProgress?.(end);
  // Let rendering, progress announcements and Cancel run even for cached files.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(record)for(const row of csvRows(record))yield row;
}

export async function scanWardriveFile(file,timezone,{signal,onProgress,onBatch,now=Date.now()/1000}={}){
 checkWardriveFile(file);
 const summary=emptySummary();let header=null,headerText='',typeIndex,ssidIndex,first=true;
 let lines=[],size=0,bytesRead=0;
 const report=()=>onProgress?.({bytesRead,totalBytes:file.size,summary:{...summary}});
 const flush=async()=>{
  if(!lines.length)return;
  const text=headerText+lines.join(''),parsed=parseWardrive(text,timezone,now);
  for(const key of ['candidates','invalid','outside_time_window','duplicates'])summary[key]+=parsed.summary[key];
  lines=[];size=0;checkAbort(signal);
  // Unrelated rows never leave the browser. Invalid/expired candidate rows are
  // checked by the server again; no request is sent for an all-invalid batch.
  if(parsed.summary.candidates&&onBatch)await onBatch(text,parsed.summary);
  report();
 };
 for await(const row of records(file,signal,n=>{bytesRead=n;report();})){
  checkAbort(signal);
  if(first){first=false;if(row[0]?.startsWith('WigleWifi-'))continue;}
  if(!header){
   headerText=csvLine(row);parseWardrive(headerText,timezone,now);
   header=row.map(value=>value.trim().toLowerCase());
   typeIndex=header.indexOf('type');ssidIndex=header.indexOf('ssid');continue;
  }
  summary.rows++;
  if(row.length!==header.length){summary.invalid++;continue;}
  if(row[typeIndex].trim().toUpperCase()!=='WIFI'||!cameraSignature(row[ssidIndex])){summary.unrelated++;continue;}
  const line=csvLine(row),length=encoder.encode(line).length;
  if(lines.length&&(lines.length>=BATCH_ROWS||size+length+encoder.encode(headerText).length>BATCH_BYTES))await flush();
  lines.push(line);size+=length;
 }
 if(!header)throw Error('Expected a WiGLE CSV header.');
 await flush();checkAbort(signal);bytesRead=file.size;report();return summary;
}
export function waitForUpload(ms,signal){
 checkAbort(signal);
 return new Promise((resolve,reject)=>{
  const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(finish,ms);
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
 });
}
async function postBatch(text,token,timezone,signal,fetcher,accountUpload){
 const request=new AbortController(),abort=()=>request.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,30000);
 try{
  checkAbort(signal);
  const response=await fetcher(accountUpload?'/account-api/wardrive/import':'/v1/wardrives',{method:'POST',credentials:accountUpload?'same-origin':'omit',redirect:'error',signal:request.signal,
   headers:{'Content-Type':'text/csv','X-Wardrive-Timezone':timezone,...(accountUpload?{'X-Wardrive-Consent':'yes'}:{Authorization:'Bearer '+token.trim().toLowerCase()})},body:text});
  let result;try{result=await response.json();}catch{result=null;}
  return {response,result};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function uploadWardriveFile(file,token,timezone,{signal,onProgress,fetcher=fetch,wait=waitForUpload,now=Date.now()/1000,accountUpload=false}={}){
 let accepted=0,duplicates=0,batches=0;
 const progress=extra=>onProgress?.({accepted,duplicates,batches,...extra});
 const send=async(text,batch)=>{
  if(batches){progress({waiting:true});await wait(11000,signal);}
  for(let attempt=0;attempt<4;attempt++){
   checkAbort(signal);let response,result;
   try{({response,result}=await postBatch(text,token,timezone,signal,fetcher,accountUpload));}
   catch(e){checkAbort(signal);if(attempt===3)throw Error('Connection interrupted. Retry this file; completed batches will not be counted twice.');}
   if(response?.ok){
    if(!result||!Number.isInteger(result.accepted)||result.accepted<0||!Number.isInteger(result.duplicates)||result.duplicates<0||result.accepted+result.duplicates>batch.rows)throw Error('Unexpected upload response. Retry this file safely.');
    accepted+=result.accepted;duplicates+=result.duplicates;batches++;progress({waiting:false});return;
   }
   if(response&&response.status!==429&&response.status<500)throw Error(response.status===401&&accountUpload?'Your sign-in expired. Sign in again, then retry the same file. Completed batches will not count twice.':result?.error||'Upload failed. Check your token and file.');
   if(attempt===3)throw Error('Upload service unavailable. Retry this file; completed batches will not be counted twice.');
   const retry=response?.headers.get('Retry-After'),seconds=Number(retry);
   const delay=response?.status===429?(retry&&Number.isFinite(seconds)?Math.max(1,Math.min(300,seconds))*1000:60000):10000*2**attempt;
   progress({waiting:true,retrying:true});await wait(delay,signal);
  }
 };
 try{
  const summary=await scanWardriveFile(file,timezone,{signal,now,onBatch:send,onProgress:p=>progress({...p,waiting:false})});
  return {accepted,duplicates,batches,summary};
 }catch(e){e.accepted=accepted;e.duplicates=duplicates;e.batches=batches;throw e;}
}
