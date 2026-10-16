import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDraftValues} from '../dist/usability.js';

test('draft restoration retains newer confirmed values in fields the user never edited',()=>{
 const base={id:'one',received:'10',responses:'8',notes:'Old note'},draft={base,values:{...base,notes:'My edited note'}};
 const current={...base,received:'30',responses:'25'};
 const result=reconcileDraftValues(draft,current);
 assert.equal(result.ok,true);
 assert.deepEqual(result.values,{...current,notes:'My edited note'});
 assert.deepEqual(current,{...base,received:'30',responses:'25'});
});

test('a conflicting edited field blocks all old draft changes',()=>{
 const base={received:'10',responses:'8',notes:''},draft={base,values:{...base,responses:'9',notes:'Keep my draft'}};
 const current={...base,received:'25',responses:'20'};
 const result=reconcileDraftValues(draft,current);
 assert.equal(result.ok,false);
 assert.deepEqual(result.conflicts,['responses']);
 assert.deepEqual(result.values,current);
});

test('matching current and draft values are safe, including checkbox values',()=>{
 const base={responses:'8',saved:false},draft={base,values:{responses:'9',saved:true}};
 const result=reconcileDraftValues(draft,{responses:'9',saved:true});
 assert.equal(result.ok,true);
 assert.deepEqual(result.values,{responses:'9',saved:true});
 assert.equal(reconcileDraftValues(draft,base).ok,true);
});

test('draft identities and fields absent from the current form never replace current values',()=>{
 const base={id:'old',name:'Old',saved:false},draft={base,values:{id:'malicious',name:'Edited',saved:false,extra:'unused'}};
 const result=reconcileDraftValues(draft,{id:'current',name:'Old',saved:true});
 assert.equal(result.ok,true);
 assert.deepEqual(result.values,{id:'current',name:'Edited',saved:true});
});

test('legacy drafts and malformed field baselines cannot be silently restored',()=>{
 const current={name:'New',saved:true};
 for(const draft of [{values:{name:'Old'}},{values:{name:'Old'},base:null},{values:{name:'Old'},base:{}},{values:{name:42},base:{name:'New'}}]){
  const result=reconcileDraftValues(draft,current);
  assert.equal(result.ok,false);
  assert.deepEqual(result.values,current);
 }
});
