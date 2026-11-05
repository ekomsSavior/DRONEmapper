export const DATASETS = Object.freeze({
 'devices-global.json': {title:'Global device JSON',description:'The combined device corpus, including equipment records, radio references, robot patterns, Remote ID rules and documented vendor connections.',format:'json'},
 'oui-global.csv': {title:'Device + OUI CSV',description:'A simple device-and-OUI list for drone, autonomous-vehicle, robot and related equipment manufacturers. Allocations identify a manufacturer, not a specific model.',format:'csv'},
 'drone-oui.csv': {title:'Drone + OUI CSV',description:'The drone-related subset of our full Device + OUI list, including drone radio equipment. Manufacturer allocations may also occur on controllers or other products; they do not establish a drone model.',format:'csv'},
 'rid-prefixes.csv': {title:'Remote ID rules CSV',description:'Reviewed manufacturer and model allocations with exact serial ranges and source evidence.',format:'csv'},
 'rf-channels.csv': {title:'Radio channels CSV',description:'Frequency centers, bands, receiver requirements and supported decoder coverage, with sources.',format:'csv'},
});
export const datasetFor = name => Object.hasOwn(DATASETS,name) ? DATASETS[name] : null;

// RFC 4180 records: preserve strings, leading zeros, quoted commas and newlines.
export function parseCsv(text) {
 const records=[];let row=[],field='',quoted=false,closed=false;
 const endField=()=>{row.push(field);field='';closed=false;};
 const endRow=()=>{endField();if(row.some(value=>value!==''))records.push(row);row=[];};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){endField();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
  if(closed)throw Error('Unexpected text after a quoted CSV field.');
  if(c==='"'){if(field)throw Error('Unexpected quote in CSV field.');quoted=true;}else field+=c;
 }
 if(quoted)throw Error('Unclosed quoted CSV field.');
 if(field||row.length||closed)endRow();
 const headers=records.shift();if(!headers?.length)throw Error('The CSV has no header.');
 if(records.some(row=>row.length!==headers.length))throw Error('The CSV has inconsistent columns.');
 return {headers,rows:records};
}

export function jsonCollections(data) {
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Expected a JSON object.');
 const sections=[];const metadata={};
 function add(path,value,depth=0){
  if(Array.isArray(value)){sections.push({id:path,rows:value});return;}
  if(!value||typeof value!=='object')return;
  sections.push({id:path,rows:Object.entries(value).map(([key,value])=>({key,value}))});
  if(depth<2&&Object.keys(value).length<=20){for(const [key,child] of Object.entries(value))if(child&&typeof child==='object')add(path+'.'+key,child,depth+1);}
 }
 for(const [key,value] of Object.entries(data)){
  if(value&&typeof value==='object')add(key,value);
  else metadata[key]=value;
 }
 sections.push({id:'release_metadata',rows:[metadata]});return sections;
}

export function recordLabel(row,index){
 if(Array.isArray(row))return `Record ${index+1}`;
 if(!row||typeof row!=='object')return String(row);
 return [row.maker||row.manufacturer||row.vendor,row.name||row.model||row.product||row.title||row.fcc_id||row.prefix||row.rule_id||row.id||row.key].filter(Boolean).join(' · ')||`Record ${index+1}`;
}

export function pageRecords(rows,query,page,size){
 const needle=query.trim().toLocaleLowerCase();
 const filtered=needle?rows.filter(row=>JSON.stringify(row).toLocaleLowerCase().includes(needle)):rows;
 const pages=Math.max(1,Math.ceil(filtered.length/size));const current=Math.max(0,Math.min(page,pages-1));
 return {rows:filtered.slice(current*size,(current+1)*size),total:filtered.length,pages,page:current,start:current*size};
}
