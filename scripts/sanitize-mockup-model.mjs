import sharp from 'sharp';

/** Conserva geometrie e materiali GLB, sostituendo tutte le foto incorporate con un campione neutro. */
export async function sanitizeMockupModel(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const data = JSON.parse(glb.subarray(20,20+jsonLength).toString('utf8'));
  const binStart = 20+jsonLength+8;
  const chunks=[]; let offset=0;
  const imageViews=new Set((data.images||[]).map(i=>i.bufferView));
  const blank=await sharp({create:{width:2,height:2,channels:3,background:'#eeeae2'}}).png().toBuffer();
  data.bufferViews.forEach((view,index)=>{
    const bytes=imageViews.has(index)?blank:glb.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength);
    view.byteOffset=offset; view.byteLength=bytes.length;
    const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);offset+=padded.length;
  });
  for(const image of data.images||[]) image.mimeType='image/png';
  data.buffers[0].byteLength=offset;
  const text=Buffer.from(JSON.stringify(data));const json=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(json);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(offset);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,...chunks]);
}
