const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function load(file,wx={},extra={}){let page;vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:p=>{const resolved=path.resolve(path.dirname(file),p);if(resolved.endsWith(path.join('utils','draft'))){const module={exports:{}};vm.runInNewContext(fs.readFileSync(resolved+'.js','utf8'),{module,wx,Set});return module.exports}return require(resolved)},Page:p=>page=p,wx,setTimeout,clearTimeout,getApp:()=>({globalData:{}}),...extra});page.data={...page.data};page.setData=p=>Object.assign(page.data,p);return page}
test('generation uses one snapshot while controls change',async()=>{
 let release,request;const page=load('miniprogram/pages/index/index.js',{cloud:{callFunction:r=>request=r}})
 page.data={...page.data,imageUrl:'old',width:48,height:48,mode:'cartoon'}
 page.extractPixelData=(src,w,h,mode)=>{assert.deepEqual([src,w,h,mode],['old',48,48,'cartoon']);return new Promise(r=>release=r)}
 const pending=page.handleGenerate();Object.assign(page.data,{width:64,mode:'photo',imageUrl:'new'});release('pixels');await pending
 assert.equal(request.data.width,48);assert.equal(request.data.options.mode,'cartoon')
})
test('palette refresh retains existing artwork colors',async()=>{
 const p=load('miniprogram/pages/result/result.js',{cloud:{callFunction:async()=>({result:{success:true,data:[{code:'B',hex:'#ffffff'}]}})}})
 p._palette=[{code:'A',hex:'#000000'}];await p.loadPalette();assert.deepEqual(Array.from(p._palette,c=>c.code),['B','A'])
})
test('missing canvas retries stop and unload cancels timer',()=>{
 let callback,cancelled,scheduled=0;const wx={createSelectorQuery:()=>({select(){return this},fields(){return this},exec(cb){cb([])}}),showToast(){}}
 const p=load('miniprogram/pages/result/result.js',wx,{setTimeout:cb=>{callback=cb;return ++scheduled},clearTimeout:id=>cancelled=id})
 p.drawDisplay();for(let i=0;i<6;i++)callback();assert.equal(scheduled,5);p.onUnload();assert.equal(cancelled,5);p.drawDisplay();assert.equal(scheduled,5)
})
test('actual PDF has valid object offsets and complete pattern page',()=>{
 const {createPatternPdf}=require('../miniprogram/utils/pdf')
 const pdf=createPatternPdf(Array.from({length:48},()=>Array(48).fill('A')),[{code:'A',hex:'#ffffff',count:2304}])
 assert.match(pdf,/\/Count 2\b/)
 const start=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(start,start+4),'xref')
 const entries=pdf.slice(start).split('\n');const size=Number(entries[1].split(' ')[1]);for(let i=1;i<size;i++){const off=Number(entries[i+2].slice(0,10));assert.ok(pdf.slice(off).startsWith(`${i} 0 obj\n`))}
})
test('100 percent fits both wide and tall patterns on mobile',()=>{
 const p=load('miniprogram/pages/result/result.js',{getSystemInfoSync:()=>({windowWidth:375})})
 for(const [w,h] of [[48,48],[100,20],[20,100]]){Object.assign(p.data,{gridWidth:w,gridHeight:h,zoomLevel:1});p.calcDisplayLayout();assert.ok(p.data.canvasWidth<=315);assert.ok(p.data.canvasHeight<=260)}
})
test('preview render resolution and newest callback win independently',()=>{
 const callbacks=[],ctx={scale(){},clearRect(){},fillRect(){}},canvas={getContext:()=>ctx}
 const wx={getSystemInfoSync:()=>({pixelRatio:2}),createSelectorQuery:()=>({select(){return this},fields(){return this},exec(cb){cb([{node:canvas}])}}),canvasToTempFilePath:r=>callbacks.push(r.success)}
 const p=load('miniprogram/pages/result/result.js',wx);p.drawGrid=()=>{}
 Object.assign(p.data,{gridWidth:100,gridHeight:100,cellSize:2.56,showCodes:true})
 p.drawDisplay();assert.ok(canvas.width>=3200);p.drawDisplay();callbacks[1]({tempFilePath:'new'});callbacks[0]({tempFilePath:'old'});assert.equal(p.data.previewPath,'new')
 p.drawExportPreview();p.drawExportPreview();callbacks[3]({tempFilePath:'export-new'});callbacks[2]({tempFilePath:'export-old'});assert.equal(p.data.exportPreviewPath,'export-new')
})

test('default 100 grid sends unlimited colors until limit is enabled',async()=>{
 let request;const p=load('miniprogram/pages/index/index.js',{cloud:{callFunction:r=>request=r}})
 assert.equal(p.data.width,100);assert.equal(p.data.height,100);assert.equal(p.data.mode,'photo')
 p.data.imageUrl='image';p.extractPixelData=async()=> 'pixels';await p.handleGenerate()
 assert.equal(request.data.options.maxColors,null)
 p.data.generating=false;p.onLimitColorsChange({detail:{value:true}});await p.handleGenerate()
 assert.equal(request.data.options.maxColors,48)
})

test('hollow dark bead labels have a white plate and dark text in Canvas and PDF',()=>{
 const p=load('miniprogram/pages/result/result.js');const texts=[],plates=[]
 const ctx={beginPath(){},arc(){},fill(){},fillRect(...args){plates.push({color:this.fillStyle,args})},measureText(){return {width:15}},fillText(text){texts.push({text,color:this.fillStyle})}}
 p.drawGrid(ctx,0,0,24,1,1,[['H16']],{H16:'#111111'},true,{shape:'hollow',grid:'none'})
 assert.equal(texts[0].color,'#243247');assert.equal(plates[0].color,'#FFFFFF')
 const {createPatternPdf}=require('../miniprogram/utils/pdf');const pdf=createPatternPdf([['H16']],[{code:'H16',hex:'#111111',count:1}],{shape:'hollow',grid:'none'})
 assert.match(pdf,/1 1 1 rg [^\n]+ re f\n0 g\nBT[^\n]+\(H16\)/)
})

test('square preset explicitly unlocks original aspect ratio',()=>{
 const p=load('miniprogram/pages/index/index.js');Object.assign(p.data,{lockRatio:true,imageRatio:2});p.onPreset({currentTarget:{dataset:{w:'30',h:'30'}}});assert.equal(p.data.lockRatio,false);assert.equal(p.data.width,30);assert.equal(p.data.height,30)
})

test('PNG export bounds canvas memory for large color lists',async()=>{
 let size;const p=load('miniprogram/pages/result/result.js',{showLoading(){},hideLoading(){},showToast(){},createOffscreenCanvas:s=>{size=s;throw Error('probe')}});Object.assign(p.data,{gridWidth:100,gridHeight:100,colorStats:Array(200).fill({})});await p.handleSaveImage();assert.ok(Math.max(size.width,size.height)<=4096);assert.ok(size.width*size.height<=4000000)
})
test('palette failure is visible and retry recovers',async()=>{
 let fail=true;const p=load('miniprogram/pages/result/result.js',{cloud:{callFunction:async()=>{if(fail)throw Error('offline');return {result:{success:true,data:[{code:'B',hex:'#ffffff'}]}}}}});p._palette=[{code:'A',hex:'#000000'}];await p.loadPalette();assert.equal(p.data.paletteError,true);assert.equal(p.data.paletteLoading,false);fail=false;await p.loadPalette();assert.equal(p.data.paletteError,false);assert.equal(p.data.paletteView.length,2)
})
test('editing persists latest artwork and homepage restores it after restart',()=>{
 let saved;const app={globalData:{}};const wx={setStorageSync:(k,v)=>saved=JSON.parse(JSON.stringify(v)),getStorageSync:()=>saved,navigateTo:r=>assert.equal(r.url,'/pages/result/result')};const p=load('miniprogram/pages/result/result.js',wx,{getApp:()=>app});p._palette=[{code:'A',hex:'#ffffff'}];p._undo=[];p._redo=[];p.drawDisplay=()=>{};Object.assign(p.data,{gridWidth:5,gridHeight:5});p.applyGrid(Array.from({length:5},()=>Array(5).fill('A')));assert.equal(saved.colorStats[0].count,25);app.globalData={};const home=load('miniprogram/pages/index/index.js',wx,{getApp:()=>app});home.onShow();assert.equal(home.data.hasDraft,true);home.restoreDraft();assert.equal(app.globalData.resultData.colorStats[0].count,25)
})
test('both pages share homepage rather than volatile artwork',()=>{for(const file of ['index','result']){const p=load(`miniprogram/pages/${file}/${file}.js`);assert.equal(p.onShareAppMessage().path,'/pages/index/index')}})

test('pixel read exception rejects generation and enables retry',async()=>{
 let img,toast;const p=load('miniprogram/pages/index/index.js',{createOffscreenCanvas:()=>({getContext:()=>({fillRect(){},drawImage(){},getImageData(){throw Error('read failed')}}),createImage:()=>img={width:10,height:10}}),showToast:r=>toast=r.title});p.data.imageUrl='image';const pending=p.handleGenerate();assert.equal(p.data.generating,true);assert.doesNotThrow(()=>img.onload());await pending;assert.equal(p.data.generating,false);assert.equal(toast,'图片处理失败，请重试')
})
test('invalid draft colors are rejected without changing storage',()=>{
 for(const colorStats of [[{code:'A',hex:null}],[{code:'A',hex:'#12345g'}],[{code:'',hex:'#ffffff'}],[{code:'A',hex:'#ffffff'},{code:'A',hex:'#000000'}]]){const stored={width:5,height:5,grid:Array.from({length:5},()=>Array(5).fill('A')),colorStats};let writes=0;const p=load('miniprogram/pages/index/index.js',{getStorageSync:()=>stored,setStorageSync:()=>writes++});p.onShow();assert.equal(p.data.hasDraft,false);assert.equal(writes,0)}
})
test('restored counts are rebuilt from grid including empty cells',()=>{
 const stored={width:5,height:5,grid:Array.from({length:5},()=>Array(5).fill('A')),colorStats:[{code:'A',hex:'#ffffff',count:'wrong'},{code:'B',hex:'#000000',count:999}]};stored.grid[0][0]=null;const app={globalData:{}};const p=load('miniprogram/pages/index/index.js',{getStorageSync:()=>stored,navigateTo(){}},{getApp:()=>app});p.restoreDraft();assert.equal(app.globalData.resultData.colorStats.length,1);assert.equal(app.globalData.resultData.colorStats[0].count,24);assert.equal(stored.colorStats[0].count,'wrong')
})
