// Shared composition for website cards and every exported catalog record.
import fs from 'node:fs';
import {systemBreakdown} from '../public/device-system-model.mjs';
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(rows.map(row=>({...row,system_breakdown:systemBreakdown(row)}))));
