import { mkdir, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseCapabilities } from '../src/capabilities.js';

const CAPABILITIES_URL = 'https://wfas.firenet.gov/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities';
const response = await fetch(CAPABILITIES_URL);
if (!response.ok) throw new Error(`WFAS capabilities request failed with HTTP ${response.status}.`);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false, trimValues: true });
const catalog = parseCapabilities(parser.parse(await response.text()));
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/catalog.json', import.meta.url), `${JSON.stringify({ ...catalog, capabilitiesUrl: CAPABILITIES_URL, generatedAt: new Date().toISOString() })}\n`);
const available = catalog.models.filter((model) => model.available);
console.log(`Synced ${catalog.layers.length} layers across ${available.length} models: ${available.map((model) => model.label).join(', ')}`);