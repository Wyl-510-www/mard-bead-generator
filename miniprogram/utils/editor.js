function statsFor(grid,palette) {
 const counts=new Map()
 grid.flat().forEach(code=>{if(code)counts.set(code,(counts.get(code)||0)+1)})
 return palette.filter(c=>counts.has(c.code)).map(c=>({...c,count:counts.get(c.code)})).sort((a,b)=>b.count-a.count)
}
function editGrid(grid,action) {
 const copy=grid.map(row=>row.slice())
 if(action.type==='mirror') return action.axis==='vertical'?copy.reverse():copy.map(row=>row.reverse())
 if(action.type==='paint') {if(copy[action.y]&&action.x>=0&&action.x<copy[0].length)copy[action.y][action.x]=action.code;return copy}
 return copy.map(row=>row.map(code=>action.type==='delete'&&action.codes.includes(code)?null:action.type==='replace'&&code===action.from?action.to:code))
}
module.exports={statsFor,editGrid}
