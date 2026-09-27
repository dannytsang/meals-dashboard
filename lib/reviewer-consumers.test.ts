// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VercelBlobStorageClient } from './blob-storage';
const sdk = vi.hoisted(() => ({put:vi.fn(), get:vi.fn(), del:vi.fn(), head:vi.fn(), list:vi.fn()}));
vi.mock('@vercel/blob',()=>sdk);
const objects=new Map<string,string>();
import { syncDashboardLayout } from './dashboard-sync';
import { getDashboardData } from './dashboard-data';
vi.mock('next/headers', () => ({ cookies: async () => ({get: () => ({value:'synthetic-debug'})}) }));
vi.mock('./debug-cookie', () => ({DEBUG_COOKIE_NAME:'debug',verifyDebugCookie:()=>({value:'1'})}));
vi.mock('./runtime-mode',()=>({runtimeModeStatus:()=>({blobConfigured:true})}));
let root='';
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();if(root)await rm(root,{recursive:true,force:true});});
async function fixture(){
 root=await mkdtemp(join(tmpdir(),'reviewer-consumers-'));vi.stubEnv('DASHBOARD_STORE_DIR',root);
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('External network forbidden');}));
 vi.spyOn(console,'log').mockImplementation(()=>{});
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
 vi.stubEnv('DASHBOARD_STORE_DIR','');vi.stubEnv('MEALS_PUBLICATION_PROTOCOL','1');objects.clear();
 sdk.put.mockImplementation(async(p:string,text:string)=>{objects.set(p,text);return {url:p,etag:'synthetic'};});
 sdk.get.mockImplementation(async(p:string)=>objects.has(p)?{statusCode:200,stream:new Response(objects.get(p)!).body}:null);
 sdk.del.mockImplementation(async(p:string)=>{objects.delete(p);});
 const store=new VercelBlobStorageClient(),day='2030-01-01';
 const p={orders:[{orderBlobPath:`orders/${day}/one.json`,orderNumber:'one',deliveryDate:day,deliverySlot:'',orderTotal:1,items:[{name:'Synthetic item',quantity:1,price:1,tpnc:'1'}],substitutions:[],unavailable:[],shortLifeItems:[]}],coverage:[{coverageBlobPath:`coverage/${day}.json`,date:day,sourceOrderBlobPath:`orders/${day}/one.json`,meals:[{meal:{id:'one',content:'Synthetic meal',date:day,labels:[],section:'Planned'},status:'covered',coverageScore:100,matchedItems:[],missingItems:[]}]}],summary:{coverage_percentage:100,covered:1,missing:0,meals_total:1,meals_covered:1,order_total:1,delivery_date:day,windows:{last_delivery:day,next_delivery:null,next_window_end:null}},coverageWindow:[day],deliveryWindows:[],dataGeneratedAt:'2030-01-01T12:00:00Z',uiUpdatedAt:'',products:[{productBlobPath:'products/1.json',tpnc:'1',gtin:null,tpnb:null,title:'Committed product',description:'',storage:'',preparation:'',ingredients:'',allergens:'',nutrition:'',brand:'',category:'',imageUrl:'',productUrl:'',source:'synthetic',lastFetched:'2030-01-01T12:00:00Z'}]};
 await syncDashboardLayout(p as any,store);
 const ptr=(await store.readPointer())!, manifest=await store.readManifest(ptr.manifestPath), pm=await store.readManifest(ptr.productsManifestPath!);
 const view=await getDashboardData({reader:store,coverageWindow:[day]});expect(view.coverage).toHaveLength(1);expect(view.products['1']!.title).toBe('Committed product');
 return {store,coveragePath:Object.keys(manifest).find(k=>k.startsWith('coverage/'))!,productPath:pm['1'],day};
}
it('freshness debug reads the committed product physical reference',async()=>{
 const f=await fixture();const {GET}=await import('../app/api/debug/blob-read-freshness/route');const r=await GET();expect(r.status).toBe(200);const body=await r.json();
 expect(body.productReads).toEqual([{path:f.productPath,status:'ok',lastFetched:'2030-01-01T12:00:00Z'}]);vi.useRealTimers();
});
it('freshness debug reports logical coverage dates, not digest suffixed dates',async()=>{
 const f=await fixture();const {GET}=await import('../app/api/debug/blob-read-freshness/route');const body=await (await GET()).json();expect(body.manifestDateCoverage).toEqual([f.day]);vi.useRealTimers();
});
it('items debug still reports coverage reads for committed immutable graph',async()=>{
 const f=await fixture();const {GET}=await import('../app/api/debug/items-by-category/route');const body=await (await GET()).json();expect(body.coverageReads).toEqual([{path:f.coveragePath,status:'ok'}]);vi.useRealTimers();
});
