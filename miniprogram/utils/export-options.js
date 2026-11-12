function rowLabels(row, mode='all') {
 const labels=[]
 for(let start=0;start<row.length;){
 const code=row[start];let end=start+1
 while(end<row.length&&row[end]===code)end++
 const n=end-start
 if(code) {
 if(n<4||mode==='all')for(let x=start;x<end;x++)labels.push({x,text:code,span:1})
 else if(mode==='merged')labels.push({x:start,text:code+' x'+n,span:n})
 else for(let x=start;x<end;x++)labels.push({x,text:x===start?code:x===end-1?'x'+n:'.',span:1})
 }
 start=end
 }
 return labels
}
module.exports={rowLabels}
