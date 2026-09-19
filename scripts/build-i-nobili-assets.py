"""Rebuild i Nobili assets from the supplied PDF. No photographed sample is retouched.
Usage: python scripts/build-i-nobili-assets.py PATH_TO_PDF
Requires Pillow, numpy, pypdfium2. Run from repository root.
"""
import sys,json,hashlib
from pathlib import Path
import numpy as np
import pypdfium2 as pdf
from PIL import Image
root=Path('client/public/mockups/i-nobili');catalog=json.loads((root/'catalog.json').read_text(encoding='utf-8'))
source=Path(sys.argv[1]);assert hashlib.sha256(source.read_bytes()).hexdigest()==catalog['sourceSha256'], 'PDF differs from verified source'
doc=pdf.PdfDocument(source);assert len(doc)==86
catalog['laboratories']=[dict(id='i-nobili',name='i Nobili',applicationLabId=None)]
for family in catalog['families']:family['laboratoryId']='i-nobili'
for v in catalog['variants']:
 im=doc[v['sourcePage']-1].render(scale=1).to_pil().convert('RGB');im.save(root/v['sampleUrl'],quality=92)
 w,h=im.size;im=im.crop((int(w*.06),int(h*.06),int(w*.94),int(h*.70)));im.thumbnail((768,768))
 a=np.array(im).astype(float)
 # Blend opposing edge strips only in the render texture, never in the catalogue sample.
 band=24
 for axis in [1,0]:
  a=np.swapaxes(a,axis,0);edge=(a[0]+a[-1])/2
  left=edge-a[0];right=edge-a[-1]
  for k in range(band):
   weight=(1-k/band)**2;a[k]+=left*weight;a[-1-k]+=right*weight
  a=np.swapaxes(a,0,axis)
 Image.fromarray(np.clip(a,0,255).astype('uint8')).save(root/v['textureUrl'],lossless=True)
 v['heightUrl']=v['supplierCode']+'-height.png';Image.new('L',im.size,128).save(root/v['heightUrl'])
 v.update(laboratoryId='i-nobili',nativeTextureSizePx=list(im.size),physicalScaleVerified=False,texturePreparation='catalog_crop_edge_blended',heightPreparation='neutral_no_measured_relief',sampleSha256=hashlib.sha256((root/v['sampleUrl']).read_bytes()).hexdigest())
 for kind in ['texture','height']:v[kind+'Sha256']=hashlib.sha256((root/v[kind+'Url']).read_bytes()).hexdigest()
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
print('86 samples preserved, 86 render textures prepared')
