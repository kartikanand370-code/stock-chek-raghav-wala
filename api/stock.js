const INVENTORY_API = 'https://api.croma.com/inventory/oms/v2/tms/details-pwa/';
const PRODUCT_API = 'https://api.croma.com/catalog/v1/product/detail';
const { isAllowed } = require('../lib/access');

const list = value => Array.isArray(value) ? value : (value ? [value] : []);
const reply = (res, status, body) => res.status(status).json(body);

function line(type, itemID, pincode, categoryType) {
  return { fulfillmentType:type, mch:'', itemID, lineId:type === 'HDEL' ? '1' : '3', categoryType,
    reqEndDate:type === 'HDEL' ? '2500-01-01' : '', reqStartDate:'', requiredQty:'1',
    shipToAddress:{company:'',country:'',city:'',mobilePhone:'',state:'',zipCode:pincode,extn:{irlAddressLine1:'',irlAddressLine2:''}},
    extn:{widerStoreFlag:'N'} };
}

function body(productId, pincode, categoryType) {
  return { promise:{ allocationRuleID:'SYSTEM', checkInventory:'Y', organizationCode:'CROMA', sourcingClassification:'EC', promiseLines:{ promiseLine:[line('HDEL',productId,pincode,categoryType),line('SDEL',productId,pincode,categoryType)] } } };
}

function inventorySummary(data) {
  const available = list(data?.promise?.suggestedOption?.option?.promiseLines?.promiseLine);
  return { available:available.length > 0, homeDelivery:available.some(item => item.fulfillmentType === 'HDEL' || item.lineId === '1'), storePickup:available.some(item => item.fulfillmentType === 'SDEL' || item.lineId === '3') };
}

function compactName(value, productId) {
  const raw = String(value || '').replace(/\s+/g,' ').trim();
  if (!raw) return `Product ${productId}`;
  const details = raw.match(/\(([^)]*)\)/)?.[1] || '';
  const ram = details.match(/(\d+)\s*GB\s*RAM/i)?.[1];
  const storage = details.replace(/\d+\s*GB\s*RAM/i,'').match(/(\d+)\s*GB/i)?.[1];
  const base = raw.split('(')[0].replace(/\b\d+G\b/ig,'').replace(/[,-]\s*$/,'').replace(/\s+/g,' ').trim();
  return ram && storage ? `${base} ${ram}/${storage}` : base || `Product ${productId}`;
}

function activeOffer(data) {
  const now = Date.now();
  return list(data?.storeoffer).some(offer => {
    const from = Date.parse(offer?.fromDate || ''), to = Date.parse(offer?.toDate || '');
    return (!from || from <= now) && (!to || to >= now);
  });
}

async function productInfo(productId) {
  try {
    const response = await fetch(`${PRODUCT_API}?productCode=${encodeURIComponent(productId)}`, { headers:{Accept:'application/json, text/plain, */*','User-Agent':'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',Origin:'https://www.croma.com',Referer:'https://www.croma.com/'} });
    if (!response.ok) throw new Error(`Product lookup failed (${response.status}).`);
    const data = await response.json();
    return { name:compactName(data.name || data.productName || data.metatitle, productId), offerDetected:activeOffer(data) };
  } catch (error) {
    return { name:`Product ${productId}`, offerDetected:false, lookupError:error.message };
  }
}

async function inventory(job, category) {
  try {
    const response = await fetch(INVENTORY_API, { method:'POST', headers:{Accept:'application/json, text/plain, */*','Content-Type':'application/json','User-Agent':'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',Origin:'https://www.croma.com',Referer:'https://www.croma.com/'}, body:JSON.stringify(body(job.productId,job.pincode,category)) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Croma inventory request failed (${response.status}).`);
    return { ...job, ...inventorySummary(data) };
  } catch (error) {
    return { ...job, available:false, error:error.message || 'Inventory request failed.' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return reply(res,405,{error:'Use POST.'});
  const deviceId = String(req.body?.deviceId || '').trim();
  if (!isAllowed(deviceId)) return reply(res,403,{error:'This device is not licensed.'});
  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
  const category = String(req.body?.category || 'mobile').trim() || 'mobile';
  if (!jobs.length || jobs.length > 50) return reply(res,400,{error:'Send 1 to 50 stock checks per request.'});
  if (!jobs.every(job => /^\d+$/.test(String(job.productId || '')) && /^\d{6}$/.test(String(job.pincode || '')))) return reply(res,400,{error:'Every product ID must contain digits and every pincode must contain six digits.'});
  const ids = [...new Set(jobs.map(job => String(job.productId)))];
  const info = new Map(await Promise.all(ids.map(async id => [id, await productInfo(id)])));
  const results = await Promise.all(jobs.map(job => inventory({ ...job, productId:String(job.productId), pincode:String(job.pincode), name:info.get(String(job.productId))?.name || `Product ${job.productId}`, offerDetected:info.get(String(job.productId))?.offerDetected === true }, category)));
  return reply(res,200,{results});
};
