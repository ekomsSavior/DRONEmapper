// Read-only bridge to the same catalog composition used by the website.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {researchInventory,deviceLinks,servicesForVendor} from '../public/map-device-coverage.mjs';
import {vendorFlow} from '../public/vendor-flow-model.mjs';
import {includeReviewedSystemModels} from '../public/device-system-model.mjs';
const root=new URL('../',import.meta.url);
const inventory=JSON.parse(fs.readFileSync(new URL('public/device-inventory.json',root)));
// System research can add documented configurations before a map observation
// exists. Include those cards in the export, as the Device Library does.
// FCC equipment is merged separately from its richer regulatory records.
const models=includeReviewedSystemModels(researchInventory(inventory.models))
 .filter(row=>row.kind!=='regulatory-equipment').map(row=>({
 ...row, links:deviceLinks(row),
 catalog_evidence:row.reference?'curated-reference':row.records!==undefined?'map-inventory-aggregate':'reviewed-system-configuration',
 cloud_service_ids:servicesForVendor(row.maker).map(s=>s.id),
 cloud_association_scope:'Vendor-level documentation; not proof this model uses every vendor service.'
}));
const flows=[...new Set(models.map(m=>m.maker))].sort().map(vendor=>{
 const f=vendorFlow(vendor);
 return {vendor,service_ids:f.services.map(s=>s.id),
  nodes:f.nodes.map(({service,...n})=>({...n,service_id:service?.id})),
  edges:f.edges.map(({service,...e})=>({...e,service_id:service?.id})),complete:f.complete};
}).filter(f=>f.nodes.length);
process.stdout.write(JSON.stringify({models,flows,map_inventory_generated_at:inventory.generated_at}));
