import {deviceSystems} from './device-system-data.mjs?v=20261103-systems-b73';
import {libraryModels} from './device-library-model.mjs';
import {macAllocationsFor,formatMacPrefix} from './device-mac-model.mjs';
import {robotSignatures} from './robot-signatures.mjs';

const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const aliases=new Map([
 ['unitree','unitree robotics'],['parrot drones','parrot'],['parrot drones sas','parrot'],
 ['skydio, inc.','skydio'],['anduril','anduril industries'],['aurora','aurora innovation'],
 ['nao robot','aldebaran robotics'],['cobalt ai','cobalt robotics'],
 ['percepto airmax','percepto'],
 ['fimi x8 se 2022 drone','fimi'],['fimi x8 tele drone','fimi'],
 ['kratos defense & security solutions','kratos defense'],
 ['kodiak robotics','kodiak ai'],
]);
const makerOf=r=>aliases.get(norm(r.maker||r.manufacturer))||norm(r.maker||r.manufacturer);
const namesOf=r=>new Set([r.name,r.model,...(r.aliases||[]),...(r.models||[])].filter(Boolean).map(norm));
const matches=(a,b)=>makerOf(a)===makerOf(b)&&[...namesOf(a)].some(n=>namesOf(b).has(n));
const fccKey=value=>String(value||'').trim().toUpperCase();
// Module documentation must be explicitly bound to an equipment identifier.
// Matching a vendor or product name alone cannot import an aircraft's BOM.
const profileMatches=(record,profile)=>record.kind==='regulatory-equipment'
 ? makerOf(record)===makerOf(profile)&&Boolean(fccKey(record.fcc_id))&&
   (profile.fcc_ids||[]).some(id=>fccKey(id)===fccKey(record.fcc_id))
 : !profile.fcc_ids?.length&&(matches(record,profile)||
   (profile.record_bindings||[]).some(binding=>matches(record,binding)));
const references=libraryModels();
const urls=r=>[...new Set([...(r.sources||[]),r.source,r.url].filter(u=>typeof u==='string'&&u.startsWith('https://')))];
export const systemSections=[
 ['compute','Processors & controllers'],['memory','Memory & storage'],
 ['radios','Radios & data links'],['sensors','Sensors & navigation'],
 ['power','Power & mobility'],['interfaces','Ports & expansion'],
 ['software','Software & control'],['identification','Identification & scanning'],
 ['other','Other published specifications'],
];
const ruleModels={
 'cyberdog-ble-v1':['Xiaomi',['CyberDog']],
 'unitree-go1-wifi-name':['Unitree Robotics',['Unitree Go1','Go1']],
 'petoi-bittle-ap-name':['Petoi',['Bittle']],
 'petoi-bittle-ble-name':['Petoi',['Bittle','Bittle X','Bittle X V2','Bittle X+Arm']],
 'petoi-nybble-ble-name':['Petoi',['Nybble','Nybble Q']],
 'petoi-cub-ble-name':['Petoi',['OpenCat Cub firmware target']],
 'robomaster-s1-wifi-name':['DJI',['RoboMaster S1']],
 'robomaster-ep-wifi-name':['DJI',['RoboMaster EP']],
};
const meaningful=text=>text&&!/not (?:yet )?verified|not established|not disclosed|unknown|unverified/i.test(text);
function specSection(key){
 if(/processor|cpu|gpu|controller|compute|soc\b/i.test(key))return 'compute';
 if(/memory|storage|ram\b/i.test(key))return 'memory';
 if(/radio|communication|frequency|connectivity|data_link/i.test(key))return 'radios';
 if(/camera|sensor|lidar|radar|gnss|navigation|payload/i.test(key))return 'sensors';
 if(/battery|endurance|power|motor|speed|weight|length|span|dimension|propulsion/i.test(key))return 'power';
 if(/port|interface/i.test(key))return 'interfaces';
 if(/software|operating_system/i.test(key))return 'software';
 return 'other';
}

export function systemBreakdown(record){
 const sections=Object.fromEntries(systemSections.map(([key,title])=>[key,{title,status:'not-established',facts:[]}]));
 const profiles=deviceSystems.profiles.filter(p=>profileMatches(record,p));
 const reference=record.kind==='regulatory-equipment'?null:references.find(r=>matches(record,r));
 const add=(section,fact)=>{
  if(!sections[section]||!fact.sources?.length)return;
  sections[section].facts.push(fact);
  if(fact.evidence==='reviewed-primary-source')sections[section].status='documented';
  else if(sections[section].status!=='documented')sections[section].status='reference-only';
 };
 for(const profile of profiles)for(const fact of profile.facts)add(fact.section,{
  ...fact,evidence:'reviewed-primary-source',profile_id:profile.id,
  configuration:profile.configuration,reviewed_on:profile.reviewed_on,
 });
 if(reference){
  const sources=urls(reference);
  if(meaningful(reference.connection))add('radios',{component:'Published model communications',details:reference.connection,sources,evidence:'existing-catalog-reference'});
  if(reference.specs)for(const [key,value] of Object.entries(reference.specs)){
   const details=typeof value==='object'?JSON.stringify(value):String(value);
   if(meaningful(details))add(specSection(key),{component:key.replaceAll('_',' '),details,sources,evidence:'existing-catalog-reference'});
  }
 }
 const allocations=record.kind==='regulatory-equipment'?[]:macAllocationsFor(record.maker||record.manufacturer);
 if(allocations.length)add('identification',{
  component:'Manufacturer MAC allocations',details:allocations.map(formatMacPrefix).join(' · '),
  configuration:'Manufacturer registrant only; use on this model is not established.',
  sources:[...new Set(allocations.map(a=>a.source))],evidence:'manufacturer-only',
 });
 const rules=record.kind==='regulatory-equipment'?[]:robotSignatures.rules.filter(rule=>{
  const binding=ruleModels[rule.id];return binding&&matches(record,{manufacturer:binding[0],models:binding[1]});
 });
 for(const rule of rules)add('identification',{
  component:rule.label,details:rule.scope,sources:rule.sources,evidence:rule.validation,
  pattern:rule,configuration:'Published firmware pattern; not an authenticated identity. All required fields must match.',
 });
 const rid=record.kind==='regulatory-equipment'?[]:deviceSystems.rid_models.filter(r=>matches(record,{manufacturer:r.manufacturer,name:r.model}));
 if(rid.length)add('identification',{
  component:'Remote ID declaration reference',details:'A valid received serial must pass the catalog’s full serial-range and length checks. A declaration alone is not a received observation or authenticated identity.',
  sources:[...new Set(rid.map(r=>r.evidence_url))],evidence:'reviewed-declaration',
 });
 if(record.kind==='regulatory-equipment'&&(record.frequencies_mhz?.length||!profiles.length))add('radios',{
  component:'FCC equipment reference '+record.fcc_id,
  details:record.frequencies_mhz?.length?JSON.stringify(record.frequencies_mhz)+' MHz':'Frequency ranges are not established in this record.',
  sources:[record.source||record.lookup_url].filter(u=>u?.startsWith('https://')),
  evidence:record.evidence_status||'contributed-reference',
  configuration:'This equipment record only; not a component assignment to every vehicle from the associated vendor.',
 });
 // References with no hardware revision cannot support a model-specific BOM.
 const type=record.kind==='regulatory-equipment'?'regulatory-equipment':norm(record.category)==='software'?'software-platform':/program|family|concept/i.test(record.category||'')?'program-or-family':/unknown model/i.test(record.name||'')?'unidentified-model':'device-or-configuration';
 return {
  schema_version:1,record_scope:type,complete_bill_of_materials:false,
  status:profiles.length?'reviewed-components':Object.values(sections).some(s=>s.facts.length)?'reference-only':'research-needed',
  configurations:profiles.map(({id,configuration,reviewed_on})=>({id,configuration,reviewed_on})),
  sections,
  missing_sections:Object.entries(sections).filter(([k,s])=>k!=='other'&&!s.facts.length).map(([k])=>k),
  identification_note:'Processors, sensors and shared radio bands are component references, not unique passive detection signatures. Model-specific firmware patterns and supported decoders are separate evidence.',
 };
}

export function systemSearchText(record){
 const system=systemBreakdown(record);
 return Object.values(system.sections).flatMap(s=>s.facts.map(f=>[f.component,f.details].join(' '))).join(' ');
}

// Reviewed models can originate in declaration catalogs before appearing on the
// map. Expose those references in the library without creating observations.
export function includeReviewedSystemModels(records){
 const models=[...records];
 for(const profile of deviceSystems.profiles){
  if(profile.fcc_ids?.length){
   for(const fcc_id of profile.fcc_ids){
    if(models.some(record=>record.kind==='regulatory-equipment'&&makerOf(record)===makerOf(profile)&&fccKey(record.fcc_id)===fccKey(fcc_id)))continue;
    const source=profile.facts.flatMap(f=>f.sources)[0];
    models.push({maker:profile.manufacturer,name:profile.models[0]+' · '+fcc_id,aliases:[],
     kind:'regulatory-equipment',fcc_id,category:'Radio equipment',
     description:profile.configuration,source,url:source,
     connection:profile.facts.filter(f=>f.section==='radios').map(f=>f.component).join(' · ')||'Module communications reference.',
     reception:'Equipment configuration reference; not a received observation or a unique scanner signature.'});
   }
   continue;
  }
  const primary=profile.models[0];
  if(models.some(record=>matches(record,{...profile,models:[primary]})))continue;
  const source=profile.facts.flatMap(f=>f.sources)[0];
  // A family alias can intentionally match several configurations. Do not put
  // that alias on a specific model card and thereby import its siblings' parts.
  models.push({maker:profile.manufacturer,name:primary,aliases:[],
   category:'Device configuration',description:profile.configuration,source,url:source,
   connection:profile.facts.filter(f=>f.section==='radios').map(f=>f.component).join(' · ')||'Radio details not established in this configuration.',
   reception:'Published hardware reference; this does not establish a map observation or scanner signature.'});
 }
 return models.sort((a,b)=>a.maker.localeCompare(b.maker)||a.name.localeCompare(b.name));
}
