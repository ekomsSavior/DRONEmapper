// Serialize collection arrays one record at a time. A byte stream can cross
// Workers RPC without its 32 MiB serialized-object limit or a second full copy.
export function jsonByteStream(object){
 const encoder=new TextEncoder();
 function* parts(){
  yield '{';let first=true;
  for(const [key,value] of Object.entries(object)){
   if(value===undefined)continue;
   yield (first?'':',')+JSON.stringify(key)+':';first=false;
   if(Array.isArray(value)){
    yield '[';
    for(let i=0;i<value.length;i++)yield (i?',':'')+(JSON.stringify(value[i])??'null');
    yield ']';
   }else yield JSON.stringify(value);
  }
  yield '}';
 }
 const iterator=parts();let pending='',done=false;
 return new ReadableStream({type:'bytes',pull(controller){
  while(pending.length<16384&&!done){const next=iterator.next();done=next.done;if(!done)pending+=next.value;}
  if(pending){
   // Do not split a UTF-16 surrogate pair between separately encoded chunks.
   let length=Math.min(pending.length,16384);
   if(length<pending.length&&/[\uD800-\uDBFF]/.test(pending[length-1]))length--;
   const chunk=pending.slice(0,length);pending=pending.slice(length);controller.enqueue(encoder.encode(chunk));
  }
  if(done&&!pending)controller.close();
 },cancel(){iterator.return();pending='';done=true;}});
}
