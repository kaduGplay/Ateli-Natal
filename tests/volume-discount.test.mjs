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
