// Edge-aware 3x3 filtering on a 2x sampling surface, then area averaging.
function sampleRgb(rgba, width, height, smooth) {
 const sw=width*2, sh=height*2, rgb=new Uint8Array(sw*sh*3)
 for(let i=0;i<sw*sh;i++)for(let k=0;k<3;k++)rgb[i*3+k]=Math.round(rgba[i*4+k]*(rgba[i*4+3]/255)+255*(1-rgba[i*4+3]/255))
 const filtered=new Uint8Array(rgb)
 if(smooth)for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){
 const i=(y*sw+x)*3,sum=[0,0,0];let weight=0
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
 const j=((y+dy)*sw+x+dx)*3
 const difference=(rgb[i]-rgb[j])**2+(rgb[i+1]-rgb[j+1])**2+(rgb[i+2]-rgb[j+2])**2
 const w=Math.exp(-difference/800)/(1+dx*dx+dy*dy)
 weight+=w;for(let k=0;k<3;k++)sum[k]+=rgb[j+k]*w
 }
 for(let k=0;k<3;k++)filtered[i+k]=Math.round(sum[k]/weight)
 }
 const result=new Uint8Array(width*height*3)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<3;k++){
 const i=(y*2*sw+x*2)*3+k
 result[(y*width+x)*3+k]=Math.round((filtered[i]+filtered[i+3]+filtered[i+sw*3]+filtered[i+sw*3+3])/4)
 }
 return result.buffer
}
module.exports={sampleRgb}
