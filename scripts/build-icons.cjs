/* Build the 192px/512px DeckCycle icons from the canonical, checked-in
 * 180px Apple PNG. No external packages or image services are required.
 * The source artwork is supplied by the owner and remains unchanged. */
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = new Uint32Array(256);
for (let n=0;n<256;n++) {
  let c=n;
  for(let k=0;k<8;k++) c = c&1 ? (0xEDB88320^(c>>>1)) : c>>>1;
  crcTable[n]=c>>>0;
}
function crc32(buffer){
  let c=0xffffffff;
  for(const x of buffer) c=crcTable[(c^x)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function pngChunk(name,data){
  const type=Buffer.from(name,'ascii');
  const size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([size,type,data,checksum]);
}
function paeth(a,b,c){
  const p=a+b-c;
  const da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
  return da<=db&&da<=dc?a:db<=dc?b:c;
}
function decodePalettePng(buffer){
  if(!buffer.subarray(0,8).equals(signature)) throw Error('Invalid PNG source');
  let pos=8,width=0,height=0,bitDepth=0,colorType=0,palette=null;
  const idat=[];
  while(pos<buffer.length){
    const n=buffer.readUInt32BE(pos);
    const type=buffer.toString('ascii',pos+4,pos+8);
    const body=buffer.subarray(pos+8,pos+8+n);
    const crc=buffer.readUInt32BE(pos+8+n);
    if(crc32(Buffer.concat([Buffer.from(type),body]))!==crc)throw Error('PNG CRC mismatch');
    pos+=12+n;
    if(type==='IHDR'){
      width=body.readUInt32BE(0);height=body.readUInt32BE(4);
      bitDepth=body[8];colorType=body[9];
      if(body[12]!==0)throw Error('Interlaced PNG is unsupported');
    }
    if(type==='PLTE')palette=Buffer.from(body);
    if(type==='IDAT')idat.push(body);
    if(type==='IEND')break;
  }
  if(width!==180||height!==180||![4,8].includes(bitDepth)||colorType!==3||!palette)
    throw Error('The master DeckCycle icon must be 180x180 indexed PNG');
  const packed=zlib.inflateSync(Buffer.concat(idat));
  const stride=Math.ceil(width*bitDepth/8);
  if(packed.length!==(stride+1)*height)throw Error('Unexpected PNG scanline size');
  const pixels=Buffer.alloc(width*height*3);
  let offset=0,prev=Buffer.alloc(stride);
  for(let y=0;y<height;y++){
    const filter=packed[offset++];
    const row=Buffer.from(packed.subarray(offset,offset+stride));
    offset+=stride;
    for(let x=0;x<stride;x++){
      const left=x?row[x-1]:0,up=prev[x],upperLeft=x?prev[x-1]:0;
      const predictor=[0,left,up,(left+up)>>>1,paeth(left,up,upperLeft)][filter];
      if(predictor===undefined)throw Error('Unsupported PNG filter '+filter);
      row[x]=(row[x]+predictor)&255;
    }
    for(let x=0;x<width;x++){
      const paletteIndex=bitDepth===8 ? row[x] :
        ((x&1) ? (row[x>>1]&15) : (row[x>>1]>>4));
      const paletteOffset=paletteIndex*3;
      if(paletteOffset+2>=palette.length)throw Error('Palette index out of range');
      const pixel=(y*width+x)*3;
      pixels[pixel]=palette[paletteOffset];
      pixels[pixel+1]=palette[paletteOffset+1];
      pixels[pixel+2]=palette[paletteOffset+2];
    }
    prev=row;
  }
  return {width,height,pixels};
}
function scaledPng(source,dimension){
  const {width,height,pixels}=source;
  const bytesPerRow=dimension*3;
  const raw=Buffer.alloc((bytesPerRow+1)*dimension);
  for(let y=0;y<dimension;y++){
    const sy=Math.min(height-1,Math.floor(y*height/dimension));
    let dest=y*(bytesPerRow+1)+1;
    for(let x=0;x<dimension;x++){
      const sx=Math.min(width-1,Math.floor(x*width/dimension));
      const from=(sy*width+sx)*3;
      raw[dest++]=pixels[from];
      raw[dest++]=pixels[from+1];
      raw[dest++]=pixels[from+2];
    }
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(dimension,0);header.writeUInt32BE(dimension,4);
  header[8]=8;header[9]=2; // RGB, 8 bits
  return Buffer.concat([
    signature,pngChunk('IHDR',header),
    pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),
    pngChunk('IEND',Buffer.alloc(0))
  ]);
}
const canonical=fs.readFileSync(path.join(ROOT,'icon-180.png'));
const source=decodePalettePng(canonical);
fs.writeFileSync(path.join(ROOT,'apple-touch-icon.png'),canonical);
for(const size of [192,512]){
  const generated=scaledPng(source,size);
  fs.writeFileSync(path.join(ROOT,'icon-'+size+'.png'),generated);
  console.log('Icon created:',size+'×'+size,generated.length,'bytes');
}
