const test = require('node:test')
const assert = require('node:assert/strict')
const { generatePattern, rgbToLab } = require('../cloudfunctions/generateBeadPattern/pattern')
const colors = [{code:'W',hex:'#ffffff',r:255,g:255,b:255},{code:'K',hex:'#000000',r:0,g:0,b:0},{code:'R',hex:'#ff0000',r:255,g:0,b:0}]
test('Lab white reference',()=>assert.ok(Math.abs(rgbToLab([255,255,255])[0]-100)<0.01))
test('exact colors, dimensions and counts',()=>{
 const result=generatePattern(Buffer.from(Array.from({length:25},()=>[255,0,0]).flat()),5,5,colors,{maxColors:2})
 assert.equal(result.colorStats[0].code,'R'); assert.equal(result.colorStats[0].count,25)
 assert.equal(result.grid.length,5)
})
test('reject truncated pixels and inconsistent palette',()=>{
 assert.throws(()=>generatePattern(Buffer.alloc(3),5,5,colors))
 assert.throws(()=>generatePattern(Buffer.alloc(75),5,5,[{code:'X',hex:'#ffffff',r:0,g:0,b:0}]))
})
test('limited palette, deterministic output, photo dithering count',()=>{
 const pixels=Buffer.from(Array.from({length:300},(_,i)=>(i*71)%256))
 for(const options of [{maxColors:2},{maxColors:2,mode:'photo',dither:true}]) {
 const a=generatePattern(pixels,10,10,colors,options)
 assert.ok(a.colorStats.length<=2)
 assert.equal(a.colorStats.reduce((s,c)=>s+c.count,0),100)
 assert.deepEqual(a,generatePattern(pixels,10,10,colors,options))
 }
})
const {sampleRgb}=require('../miniprogram/utils/image')
test('transparent source becomes white and area sampling preserves solid color',()=>{
 assert.deepEqual(Array.from(new Uint8Array(sampleRgb(new Uint8Array(16),1,1,true))),[255,255,255])
 assert.deepEqual(Array.from(new Uint8Array(sampleRgb(Uint8Array.from([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]),1,1,false))),[255,0,0])
})

 test('unlimited palette preserves more than 48 exact colors, limited mode respects cap',()=>{
 const palette=Array.from({length:80},(_,i)=>{const r=i*3,g=(i*71)%256,b=(i*113)%256;return {code:'C'+i,r,g,b,hex:'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}})
 const pixels=Buffer.from(palette.flatMap(c=>[c.r,c.g,c.b]))
 for(const maxColors of [null,undefined]) {
 const result=generatePattern(pixels,10,8,palette,{mode:'photo',maxColors})
 assert.equal(result.colorStats.length,80)
 assert.equal(new Set(result.grid.flat()).size,80)
 }
 const limited=generatePattern(pixels,10,8,palette,{mode:'photo',maxColors:48})
 assert.ok(limited.colorStats.length<=48)
 assert.throws(()=>generatePattern(pixels,10,8,palette,{maxColors:0}))
 })
