import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeTotals} from '../dist/server/server/services/pricing.js';
const curtain = {productId:'SKU-CORT-400-RGB',qty:1,unitPrice:49.8,isBump:false};
test('25% curtain offer starts at two units, combines variants and never discounts other products',()=>{
 assert.equal(computeTotals([curtain],[],0,0).discount,0);
 assert.deepEqual(computeTotals([{...curtain,qty:2}],[],0,0),{subtotal:99.6,discount:24.9,shipping:0,total:74.7,pixDiscount:0,payable:74.7});
 assert.equal(computeTotals([curtain,curtain,{productId:'OTHER',qty:2,unitPrice:100}],[],0,0).discount,24.9);
 assert.equal(computeTotals([{...curtain,qty:2,isBump:true}],[],0,0).discount,0);
 assert.equal(computeTotals([{...curtain,qty:3}],[],0,0).discount,37.35);
 assert.equal(computeTotals([{...curtain,qty:2}],[],10,10).payable,76.23);
 assert.equal(computeTotals([{...curtain,qty:2}],[{type:'fixed',value:500}],0,0).payable,0);
});

test('cart discount updates when quantity changes from one to two and back',async()=>{
 const {build}=await import('esbuild'); const vm=await import('node:vm');
 const result=await build({entryPoints:['src/client/cart/store.ts'],bundle:true,write:false,format:'cjs',platform:'browser',plugins:[{name:'test-tracking',setup(build){build.onResolve({filter:/lib\/(pixel|funnel)$/},args=>({path:args.path,namespace:'tracking'}));build.onLoad({filter:/.*/,namespace:'tracking'},()=>({contents:'export const pixel={addToCart(){}}; export function trackFunnel(){};'}));}}]});
 const storage=new Map();const context=vm.createContext({module:{exports:{}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});vm.runInContext(result.outputFiles[0].text,context);const cart=context.module.exports.cart;
 cart.add({productId:'SKU-CORT-400-RGB',name:'Cortina',image:'',price:49.8,qty:1});
 const lineId=cart.lines()[0].lineId;
 assert.equal(cart.volumeDiscount(),0);
 cart.setQty(lineId,2);assert.equal(cart.volumeDiscount(),24.9);assert.equal(Math.round((cart.total()-cart.volumeDiscount())*100)/100,74.7);
 cart.add({productId:'OTHER',name:'Outro',image:'',price:100,qty:1});assert.equal(cart.volumeDiscount(),24.9);
 cart.setQty(lineId,1);assert.equal(cart.volumeDiscount(),0);
});
