const { rowLabels } = require('./export-options')
// Minimal vector PDF writer: ASCII labels use built-in Helvetica; no cloud service required.
function createPatternPdf(grid, stats, options = {}) {
 const pages=[], colors=Object.fromEntries(stats.map(c=>[c.code,c.hex]))
 const text=(x,y,size,s)=>`BT /F1 ${size} Tf ${x} ${y} Td (${String(s).replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&')}) Tj ET\n`
 const rgb=hex=>[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(3)).join(' ')
 const h=grid.length,w=grid[0].length
 const total=grid.flat().filter(Boolean).length
 {
 const ox=0,oy=0
 const gw=w,gh=h,cell=Math.min(515/gw,650/gh)
 const left=(595-gw*cell)/2
 let s='0 g\n'+text(40,800,18,'MARD | BEAD PATTERN')+text(40,776,10,`${w} x ${h} | Columns ${ox+1}-${ox+gw} | Rows ${oy+1}-${oy+gh}`)
 const labelsByRow=grid.slice(oy,oy+gh).map(row=>new Map(rowLabels(row.slice(ox,ox+gw),options.labels).map(label=>[label.x,label])))
 let labelOps=''
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
 if(!grid[y+oy][x+ox])continue
 const code=grid[y+oy][x+ox],hex=colors[code]||'#cccccc',px=left+x*cell,py=745-(y+1)*cell
 if (!options.shape || options.shape==='square') s+=`${rgb(hex)} rg ${px} ${py} ${cell} ${cell} re f\n`
 else {
 const circle=(cx,cy,r)=>{const k=r*.55228475;return `${cx+r} ${cy} m ${cx+r} ${cy+k} ${cx+k} ${cy+r} ${cx} ${cy+r} c ${cx-k} ${cy+r} ${cx-r} ${cy+k} ${cx-r} ${cy} c ${cx-r} ${cy-k} ${cx-k} ${cy-r} ${cx} ${cy-r} c ${cx+k} ${cy-r} ${cx+r} ${cy-k} ${cx+r} ${cy} c f\n`}
 s+=`${rgb(hex)} rg `+circle(px+cell/2,py+cell/2,cell*.44)
 if(options.shape==='hollow')s+='1 1 1 rg '+circle(px+cell/2,py+cell/2,cell*.16)
 }
 const light=[1,3,5].reduce((sum,i,k)=>sum+parseInt(hex.slice(i,i+2),16)*[.299,.587,.114][k],0)>115
 const font=Math.min(6,cell/(String(code).length*.65+1))
 const label=labelsByRow[y].get(x)
 if(label) {
 const tx=px+label.span*cell/2-label.text.length*font*.25
 if(label.span>1 || options.shape==='hollow')labelOps+=`1 1 1 rg ${tx-2} ${py+cell*.2} ${label.text.length*font*.55+4} ${font+3} re f\n`
 labelOps+=(label.span>1 || options.shape==='hollow'?'0':light?'0':'1')+' g\n'+text(tx,py+cell*.35,font,label.text)
 }
 }
 for(let x=0;x<=gw;x++)if(options.grid!=='none' && (options.grid!=='guides'||(x+ox)%5===0||x===gw))s+=`${(x+ox)%10===0?'0.85 0.25 0.25':'0.7 0.7 0.7'} RG 0.3 w ${left+x*cell} 745 m ${left+x*cell} ${745-gh*cell} l S\n`
 for(let y=0;y<=gh;y++)if(options.grid!=='none' && (options.grid!=='guides'||(y+oy)%5===0||y===gh))s+=`${(y+oy)%10===0?'0.85 0.25 0.25':'0.7 0.7 0.7'} RG 0.3 w ${left} ${745-y*cell} m ${left+gw*cell} ${745-y*cell} l S\n`
 s+=labelOps
 pages.push(s)
 }
 for(let start=0;start<stats.length;start+=90){
 let s='0 g\n'+text(40,800,18,'MARD | COLOR CHECKLIST')+text(40,776,10,`${stats.length} colors | ${total} beads total`)
 stats.slice(start,start+90).forEach((c,i)=>{const x=40+(i%3)*175,y=738-Math.floor(i/3)*23;s+=`${rgb(c.hex)} rg ${x} ${y-3} 12 12 re f\n0 g\n`+text(x+20,y,9,`${c.code}   ${c.count} beads`)})
 pages.push(s)
 }
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'], kids=[]
 pages.forEach((s,i)=>{
 s+='0 g\n'+text(40,28,9,`Mard | ${i+1} / ${pages.length}`)
 const page=objects.length+1,content=page+1;kids.push(`${page} 0 R`)
 objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`)
 objects.push(`<< /Length ${s.length} >>\nstream\n${s}endstream`)
 })
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
 let out='%PDF-1.4\n',offsets=[0]
 objects.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`})
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`
 offsets.slice(1).forEach(n=>{out+=`${String(n).padStart(10,'0')} 00000 n \n`})
 out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return out
}
module.exports={createPatternPdf}
