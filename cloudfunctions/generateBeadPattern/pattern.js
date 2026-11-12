// D65 sRGB -> CIELAB; squared Delta E 76.
function rgbToLab(rgb) {
 const [r,g,b]=rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)})
 const f=v=>v>216/24389?Math.cbrt(v):v*841/108+4/29
 const x=f((r*.4124564+g*.3575761+b*.1804375)/.95047)
 const y=f(r*.2126729+g*.7151522+b*.072175)
 const z=f((r*.0193339+g*.119192+b*.9503041)/1.08883)
 return [116*y-16,500*(x-y),200*(y-z)]
}
const distance=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0)
function nearest(lab,palette) {
 let best=palette[0],score=Infinity
 for(const c of palette){const d=distance(lab,c.lab);if(d<score){best=c;score=d}}
 return best
}
function generatePattern(buffer,w,h,colors,options={}) {
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<5||h<5||w>100||h>100||buffer.length!==w*h*3) throw Error('图片数据长度或尺寸无效')
 const seen=new Set()
 const palette=colors.map(c=>{
 if(!c.code||seen.has(c.code)||!/^#[0-9a-f]{6}$/i.test(c.hex)||![c.r,c.g,c.b].every(v=>Number.isInteger(v)&&v>=0&&v<=255)||[c.r,c.g,c.b].some((v,i)=>v!==parseInt(c.hex.slice(1+i*2,3+i*2),16))) throw Error('色库存在重复色号或 RGB/HEX 不一致，请核对色卡')
 seen.add(c.code);return {...c,lab:rgbToLab([c.r,c.g,c.b])}
 }).sort((a,b)=>String(a.code).localeCompare(String(b.code)))
 if(!palette.length) throw Error('色号数据库为空')
 const requested=options.maxColors==null?null:Number(options.maxColors)
 if(requested!==null&&(!Number.isInteger(requested)||requested<2||requested>64)) throw Error('颜色数量应为 2–64')
 const pixels=Array.from({length:w*h},(_,i)=>Array.from(buffer.subarray(i*3,i*3+3)))
 const labs=pixels.map(rgbToLab)
 let selected=palette
 if(requested!==null) {
 // Weighted farthest-point seeds followed by weighted Lloyd refinement in Lab.
 const histogram=new Map()
 labs.forEach(lab=>{const key=lab.map(v=>Math.round(v/3)).join(',');const p=histogram.get(key);if(p){p.n++;p.sum=p.sum.map((v,i)=>v+lab[i])}else histogram.set(key,{n:1,sum:lab.slice()})})
 const points=Array.from(histogram.values()).map(p=>({n:p.n,lab:p.sum.map(v=>v/p.n)})).sort((a,b)=>b.n-a.n)
 const centers=[points[0].lab.slice()]
 while(centers.length<Math.min(requested,points.length)){
 let best,score=0
 for(const p of points){const s=Math.min(...centers.map(c=>distance(c,p.lab)))*p.n;if(s>score){score=s;best=p.lab}}
 if(!best)break;centers.push(best.slice())
 }
 for(let pass=0;pass<6;pass++){
 const groups=centers.map(()=>({n:0,sum:[0,0,0]}))
 for(const p of points){let k=0;centers.forEach((c,i)=>{if(distance(c,p.lab)<distance(centers[k],p.lab))k=i});const g=groups[k];g.n+=p.n;g.sum=g.sum.map((v,i)=>v+p.lab[i]*p.n)}
 groups.forEach((g,i)=>{if(g.n)centers[i]=g.sum.map(v=>v/g.n)})
 }
 selected=Array.from(new Map(centers.map(c=>{const p=nearest(c,palette);return [p.code,p]})).values())
 }
 const output=[]
 const work=pixels.map(p=>p.slice())
 for(let i=0;i<pixels.length;i++){
 const color=nearest(options.mode==='photo'&&options.dither?rgbToLab(work[i].map(v=>Math.max(0,Math.min(255,v)))):labs[i],selected)
 output.push(color)
 if(options.mode==='photo'&&options.dither){const x=i%w,y=Math.floor(i/w),error=work[i].map((v,k)=>v-[color.r,color.g,color.b][k]);for(const [dx,dy,weight] of [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny<h)work[ny*w+nx]=work[ny*w+nx].map((v,k)=>v+error[k]*weight)}}
 }
 // Only remove low-contrast singletons surrounded by one color; preserve dark eyes/outlines.
 const cleaned=output.slice()
 if(options.mode!=='photo'&&options.cleanup!==false)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
 const i=y*w+x,ns=[output[i-1],output[i+1],output[i-w],output[i+w]]
 if(ns.every(c=>c.code===ns[0].code)&&output[i].code!==ns[0].code&&distance(output[i].lab,ns[0].lab)<144)cleaned[i]=ns[0]
 }
 const counts=new Map();cleaned.forEach(c=>counts.set(c.code,(counts.get(c.code)||0)+1))
 return {grid:Array.from({length:h},(_,y)=>cleaned.slice(y*w,(y+1)*w).map(c=>c.code)),colorStats:selected.filter(c=>counts.has(c.code)).map(({lab,...c})=>({...c,count:counts.get(c.code)})).sort((a,b)=>b.count-a.count),width:w,height:h}
}
module.exports={generatePattern,rgbToLab}
