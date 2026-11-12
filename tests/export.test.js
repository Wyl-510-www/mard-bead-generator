const test=require('node:test'),assert=require('node:assert/strict')
const {rowLabels}=require('../miniprogram/utils/export-options')
test('run labels honor threshold and empty gaps',()=>{
 assert.equal(rowLabels(['A','A','A'],'merged').length,3)
 assert.deepEqual(rowLabels(['A','A','A','A',null,'A'],'merged'),[{x:0,text:'A x4',span:4},{x:5,text:'A',span:1}])
 assert.deepEqual(rowLabels(['A','A','A','A'],'ends').map(v=>v.text),['A','.','.','x4'])
})
