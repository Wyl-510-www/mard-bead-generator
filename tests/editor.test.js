const test=require('node:test'),assert=require('node:assert/strict')
const {editGrid,statsFor}=require('../miniprogram/utils/editor')
test('mirror both axes without mutating source',()=>{const g=[['A','B'],['C',null]];assert.deepEqual(editGrid(g,{type:'mirror'}),[['B','A'],[null,'C']]);assert.deepEqual(editGrid(g,{type:'mirror',axis:'vertical'}),[['C',null],['A','B']]);assert.equal(g[0][0],'A')})
test('delete leaves empty cells; replace and count exclude empties',()=>{let g=editGrid([['A','B'],['A','C']],{type:'delete',codes:['A','C']});assert.deepEqual(g,[[null,'B'],[null,null]]);g=editGrid(g,{type:'replace',from:'B',to:'D'});assert.deepEqual(statsFor(g,[{code:'D'}]),[{code:'D',count:1}])})
