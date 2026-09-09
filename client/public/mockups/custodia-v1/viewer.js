import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildAlbumReport} from './report-template.js';

// Campionamento traslato e continuo: stessa direzione dei fili, nessuna griglia
// di copie identiche. Colore e rilievo usano gli stessi spostamenti deterministici.
const fabricSamplingShader=`
vec2 fabricOffset(vec2 cell) {
 return fract(sin(vec2(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3))))*43758.5453);
}
vec4 sampleFabricAt(sampler2D fabric, vec2 uv, vec2 sampleUv) {
 vec2 cell=floor(uv), f=smoothstep(0.0,1.0,fract(uv));
 vec2 dx=dFdx(uv), dy=dFdy(uv);
 vec4 weights=vec4((1.0-f.x)*(1.0-f.y),f.x*(1.0-f.y),(1.0-f.x)*f.y,f.x*f.y);
 weights*=weights;weights/=dot(weights,vec4(1.0));
 vec4 blended=weights.x*textureGrad(fabric,sampleUv+fabricOffset(cell),dx,dy)
      + weights.y*textureGrad(fabric,sampleUv+fabricOffset(cell+vec2(1,0)),dx,dy)
      + weights.z*textureGrad(fabric,sampleUv+fabricOffset(cell+vec2(0,1)),dx,dy)
      + weights.w*textureGrad(fabric,sampleUv+fabricOffset(cell+vec2(1,1)),dx,dy);
 // Conserva il contrasto nelle zone miscelate: altrimenti sembrano chiazze
 // lisce o incavate rispetto ai punti in cui domina un solo campione.
 vec4 average=textureLod(fabric,vec2(0.5),20.0);
 return clamp(average+(blended-average)/sqrt(dot(weights,weights)),0.0,1.0);
}
vec4 sampleFabric(sampler2D fabric, vec2 uv) {
 return sampleFabricAt(fabric,uv,uv);
}
`;

const $=id=>document.getElementById(id);
const embedded=window.parent!==window;
let applyingHost=false,hostReadOnly=false,hostInitialized=false;
let hostOption=null;
const notifyHost=(type,payload={})=>{if(embedded)window.parent.postMessage({channel:'memorie-mockup-v1',type,...payload},window.location.origin);};
const canvas=$('viewport'),stage=canvas.parentElement;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xe9e8e0);
const camera=new THREE.PerspectiveCamera(36,1,.005,20);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.enablePan=false;
controls.minDistance=.28;controls.maxDistance=2.4;controls.autoRotateSpeed=1.3;
controls.minPolarAngle=.05;controls.maxPolarAngle=Math.PI-.05;
const env=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(env,.04).texture;scene.environmentIntensity=.3;env.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0xc0b7a5,.4));
const key=new THREE.DirectionalLight(0xfff8ee,1.1);key.position.set(-.5,1,1);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-.8;key.shadow.camera.right=.8;key.shadow.camera.top=.7;key.shadow.camera.bottom=-.7;key.shadow.camera.near=.01;key.shadow.camera.far=3;key.shadow.bias=-.00005;scene.add(key);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.13}));ground.rotation.x=-Math.PI/2;ground.position.y=-.001;ground.receiveShadow=true;scene.add(ground);
let album,caseGroup,model;const fabricMaterials=new Set();
let photoSurface,originalPhotoBacking,photoBacking;
let defaultPhotoTexture,localPhotoTexture,photoPending=false,photoRequest=0;
let photoInfo={source:'empty',name:'Scegli una foto'};
const inscriptions=[];
let materialPending=false;
const loader=new THREE.TextureLoader();const cache=new Map();
const response=await fetch('peppe-lab-catalog.json');
if(!response.ok)throw new Error('Catalogo materiali non disponibile');
const catalog=await response.json(),currentModel=catalog.models[0];
$('modelName').value=currentModel.name;
const laboratory=catalog.laboratories.find(l=>l.id===currentModel.laboratoryId);
const allowed=new Set(currentModel.materialPolicy.allowedVariantIds);
const variants=catalog.variants.filter(v=>v.laboratoryId===laboratory.id&&allowed.has(v.id));
const finishes=variants.map(v=>[v.id,v.label]);
let selected=(variants.find(v=>v.legacyId==='mist-03')||variants[0]).id,request=0;
async function texture(name){
 const variant=variants.find(v=>v.id===name);
 if(!variant)throw new Error('Variante non consentita per questo modello');
 if(!cache.has(name))cache.set(name,Promise.all([loader.loadAsync(variant.textureUrl),loader.loadAsync(variant.heightUrl)]).then(([color,height])=>{
  color.colorSpace=THREE.SRGBColorSpace;
  for(const t of [color,height]){t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.repeat.setScalar(.0128/variant.estimatedRepeatMeters);
   t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
  }
  return {color,height,variant};
 }).catch(error=>{cache.delete(name);throw error;}));
 return cache.get(name);
}
async function finish(name){
 const token=++request;
 materialPending=true;setDownloadAvailability();
 try{const {color,height,variant}=await texture(name);if(token!==request)return;selected=name;
 for(const material of fabricMaterials){material.map=color;material.color.set(0xffffff);material.roughness=variant.roughness;material.bumpMap=height;material.bumpScale=variant.bumpScale;material.needsUpdate=true;}
 document.querySelectorAll('[data-finish]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.finish===name)));
 $('materialLabel').textContent=laboratory.name+' · '+variant.internalCode;
 $('status').textContent='';
 }catch(error){$('status').textContent='Impossibile caricare questo rivestimento. Riprova.';console.error(error);}
 finally{if(token===request){materialPending=false;setDownloadAvailability();updateSummary();}}
}
$('materials').className='material-categories';
for(const family of catalog.families.filter(f=>f.laboratoryId===laboratory.id)){
 const samples=variants.filter(v=>v.familyId===family.id);
 if(!samples.length)continue;
 const section=document.createElement('details');section.className='material-category';
 const title=document.createElement('summary');title.textContent=family.name+' · '+samples.length+' rivestimenti';
 const grid=document.createElement('div');grid.className='materials';
 for(const variant of samples){const button=document.createElement('button');button.dataset.finish=variant.id;button.dataset.family=variant.familyId;button.setAttribute('aria-pressed',String(variant.id===selected));button.title=variant.internalCode;const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundImage=`url('${variant.textureUrl}')`;button.append(swatch,document.createTextNode(variant.label));button.onclick=()=>finish(variant.id);grid.append(button);}
 section.append(title,grid);$('materials').append(section);
}
const coverLabel=document.createElement('label');coverLabel.htmlFor='coverLayout';coverLabel.textContent='Foto in copertina';
const coverSelect=document.createElement('select');coverSelect.id='coverLayout';
for(const layout of currentModel.coverLayouts)coverSelect.add(new Option(layout.label,layout.id));
coverSelect.value=currentModel.defaultCoverLayout;
const coverControls=document.createElement('div');coverControls.append(coverLabel,coverSelect);$('coverOptions').append(coverControls);
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{
 for(const tab of document.querySelectorAll('[data-panel]')){
  const active=tab===button;tab.setAttribute('aria-pressed',String(active));$(tab.dataset.panel).hidden=!active;
 }
};
$('openStudio').onclick=()=>$('studioDialog').showModal();
function updateCover(){
 if(!photoSurface||!originalPhotoBacking)return;
 const layout=currentModel.coverLayouts.find(l=>l.id===coverSelect.value);
 if(!layout)return;
 const {left,bottomRight,topRight,bottom,top}=layout;
 const shape=new THREE.Shape();shape.moveTo(left,bottom);shape.lineTo(bottomRight,bottom);shape.lineTo(topRight,top);shape.lineTo(left,top);shape.closePath();
 const geometry=new THREE.ShapeGeometry(shape);
 // Ritaglio su un piano: la foto non viene deformata seguendo il trapezio.
 const pos=geometry.attributes.position,uv=geometry.attributes.uv;
 const width=Math.max(bottomRight,topRight)-left,height=top-bottom;
 const image=photoSurface.material.map.image;
 const imageAspect=image.width/image.height,areaAspect=width/height;
 const zoom=Number($('photoZoom').value);
 const spanU=Math.min(1,areaAspect/imageAspect)/zoom,spanV=Math.min(1,imageAspect/areaAspect)/zoom;
 for(let i=0;i<pos.count;i++){
  const u=(pos.getX(i)-left)/width*spanU+(1-spanU)*Number($('photoX').value)/100;
  const v=(pos.getY(i)-bottom)/height*spanV+(1-spanV)*(1-Number($('photoY').value)/100);
  uv.setXY(i,u,1-v);pos.setZ(i,.0328);
 }
 geometry.computeVertexNormals();photoSurface.geometry.dispose();photoSurface.geometry=geometry;
 originalPhotoBacking.visible=false;
 if(photoBacking){photoBacking.geometry.dispose();album.remove(photoBacking);}
 photoBacking=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.0015,bevelEnabled:false}),originalPhotoBacking.material);
 photoBacking.name='Supporto foto | layout selezionato';photoBacking.position.z=.0312;album.add(photoBacking);
 document.body.dataset.coverLayout=layout.id;
 updateSummary();
}
coverSelect.onchange=updateCover;
for(const id of ['photoZoom','photoX','photoY'])$(id).oninput=updateCover;
function resetPhotoCrop(){ $('photoZoom').value='1';$('photoX').value='50';$('photoY').value='50'; }
$('coverUpload').onchange=async()=>{
 const file=$('coverUpload').files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){$('photoStatus').textContent='Scegli un JPG, PNG o WebP entro 20 MB.';$('coverUpload').value='';return;}
 const token=++photoRequest;photoPending=true;setDownloadAvailability();
 const url=URL.createObjectURL(file);let candidate;
 try{
  candidate=await loader.loadAsync(url);
  const {width,height}=candidate.image;
  if(width>renderer.capabilities.maxTextureSize||height>renderer.capabilities.maxTextureSize||width*height>40000000)throw new Error('Foto troppo grande: usa una copia entro 40 megapixel e '+renderer.capabilities.maxTextureSize+' pixel per lato.');
  if(token!==photoRequest){candidate.dispose();return;}
  candidate.colorSpace=THREE.SRGBColorSpace;candidate.flipY=false;candidate.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const previous=localPhotoTexture;photoSurface.material.map=candidate;photoSurface.material.needsUpdate=true;localPhotoTexture=candidate;
  photoInfo={source:'local',name:file.name,width,height,size:file.size};resetPhotoCrop();updateCover();previous?.dispose();
  $('photoStatus').textContent=file.name+' · '+width+' × '+height+' px. Regola il taglio con i cursori.';
 }catch(error){candidate?.dispose();$('photoStatus').textContent=error.message||'Foto non leggibile. Prova un altro file.';}
 finally{URL.revokeObjectURL(url);if(token===photoRequest){photoPending=false;setDownloadAvailability();}$('coverUpload').value='';}
};
$('restorePhoto').onclick=()=>{
 ++photoRequest;photoPending=false;photoSurface.material.map=defaultPhotoTexture;photoSurface.material.needsUpdate=true;localPhotoTexture?.dispose();localPhotoTexture=null;
 photoInfo={source:'demo',name:'Foto dimostrativa del prototipo'};resetPhotoCrop();updateCover();setDownloadAvailability();$('photoStatus').textContent='Foto di esempio ripristinata.';
};
function view(which='default'){
 const x=album?.position.x||0;const targetX=x*.5;
 controls.target.set(targetX,.15,0);
 const positions={default:[-.52,.39,.84],front:[0,.19,.95],back:[0,.22,-.95],spine:[-.95,.24,.07]};
 camera.position.fromArray(positions[which]);camera.position.x+=targetX;controls.update();fitVisibleModel();
}
function fitVisibleModel(){
 if(!model)return;
 const sphere=new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
 const halfFov=THREE.MathUtils.degToRad(camera.fov/2);
 const limitingAngle=Math.min(halfFov,Math.atan(Math.tan(halfFov)*camera.aspect));
 const distance=sphere.radius/Math.sin(limitingAngle)*1.1;
 const offset=camera.position.clone().sub(controls.target);
 if(offset.length()<distance){offset.setLength(distance);camera.position.copy(controls.target).add(offset);controls.update();}
}
view();
try{
 const gltf=await new GLTFLoader().loadAsync('album-studio.glb');model=gltf.scene;scene.add(model);
 model.traverse(object=>{
   if(object.name.startsWith('ALBUM'))album=object;
   if(object.name.startsWith('CUSTODIA'))caseGroup=object;
   if(object.name.startsWith('FOTO'))photoSurface=object;
   if(object.name.startsWith('Pannello_fotografico'))originalPhotoBacking=object;
   if(object.name==='Marchio'||object.name==='Evento')inscriptions.push(object);
   if(object.isMesh){const materials=Array.isArray(object.material)?object.material:[object.material];
     object.castShadow=true;object.receiveShadow=true;
     for(const material of materials){if(material.name.startsWith('Tessuto')){
       // Il GLB contiene uno sheen bianco pieno e la vecchia height map
       // esportata come normal map: il rilievo corretto viene applicato in finish().
       material.normalMap=null;
       if(material.isMeshPhysicalMaterial){material.sheen=0;material.specularIntensity=.25;}
       // Riduce il rilievo quando i dettagli della mappa diventano più piccoli
       // di un pixel. La misura segue anche le viste oblique e l'export 1600px.
       material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader
         .replace('#include <common>','#include <common>\n'+fabricSamplingShader)
         .replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','sampleFabric( map, vMapUv )'))
         // Nel gradiente del rilievo manteniamo fissi i pesi di fusione:
         // la transizione tra campioni non rappresenta una cavità del tessuto.
         .replace('#include <bumpmap_pars_fragment>',THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll('texture2D( bumpMap,','sampleFabricAt( bumpMap, vBumpMapUv,'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
         THREE.ShaderChunk.normal_fragment_maps.replace('dHdxy_fwd(), faceDirection',
          `dHdxy_fwd() * (1.0 - smoothstep(0.75, 2.5,
           max(length(dFdx(vBumpMapUv) * vec2(textureSize(bumpMap, 0))),
               length(dFdy(vBumpMapUv) * vec2(textureSize(bumpMap, 0)))))), faceDirection`));
       };
       material.customProgramCacheKey=()=> 'fabric-stochastic-footprint-v4';
       material.needsUpdate=true;
       fabricMaterials.add(material);
     }
       if(material.name.startsWith('Plexiglas')){object.castShadow=false;material.roughness=.015;material.transmission=1;material.thickness=.0025;material.ior=1.49;material.envMapIntensity=.45;}
     }
   }
 });
 if(!album||!caseGroup||!fabricMaterials.size)throw new Error('Gruppi o materiali del modello mancanti');
 if(!photoSurface||!originalPhotoBacking)throw new Error('Superfici della copertina mancanti');
 defaultPhotoTexture=photoSurface.material.map;
 $('coverUpload').disabled=false;$('restorePhoto').disabled=false;
 updateCover();
 setupInscriptions();
 await finish(selected);fitVisibleModel();$('status').textContent='';document.body.dataset.ready='true';
 setDownloadAvailability();
}catch(error){$('status').textContent='Il modello non si è caricato. Chiudi questa pagina e riapri “Apri album 3D”.';console.error(error);}
$('extract').oninput=()=>{if(!album)return;const fraction=Number($('extract').value)/100;album.position.x=-.44*fraction;$('extractValue').value=$('extract').value+'%';controls.target.x=album.position.x*.5;fitVisibleModel();};
$('case').onchange=()=>{if(caseGroup)caseGroup.visible=$('case').checked;};
for(const name of ['front','back','spine'])$(name).onclick=()=>view(name);
$('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
$('reset').onclick=()=>{controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');view();};
function zoom(factor){const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();}
$('plus').onclick=()=>zoom(.8);$('minus').onclick=()=>zoom(1.25);
new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fitVisibleModel();}).observe(stage);
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});

function setupInscriptions(){
 if(inscriptions.length!==2)throw new Error('Targhette del modello mancanti');
 for(const original of inscriptions){
  original.visible=false;
  const field=$(original.name==='Marchio'?'topText':'bottomText');
  const surface=document.createElement('canvas');surface.width=2048;surface.height=400;
  const map=new THREE.CanvasTexture(surface);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.096,.01875),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));
  mesh.position.set(-.2132,original.name==='Marchio'?.294:.012,0);mesh.rotation.y=-Math.PI/2;
  caseGroup.add(mesh);
  const redraw=()=>{
   const ctx=surface.getContext('2d');ctx.clearRect(0,0,2048,400);
   let size=original.name==='Marchio'?190:155;
   ctx.font=`${size}px Georgia`;
   while(ctx.measureText(field.value).width>1920&&size>16){size--;ctx.font=`${size}px Georgia`;}
   ctx.fillStyle='#f0f2f4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(field.value,1024,200);
   map.needsUpdate=true;updateSummary();
  };
  field.addEventListener('input',redraw);redraw();
 }
}
function configuration(){
 const variant=variants.find(v=>v.id===selected);
 const hostMaterial=hostOption?.materials.find(m=>m.id===selected);
 return {schemaVersion:1,createdAt:new Date().toISOString(),
  branding:{name:$('brandName').value.trim()||'Il tuo studio fotografico'},
  model:{id:currentModel.id,name:$('modelName').value.trim()||'Modello senza nome',assetRevision:currentModel.assetRevision},
  laboratory:{id:hostOption?.labId||laboratory.id,name:hostOption?.labName||laboratory.name,applicationLabId:hostOption?.labId||laboratory.applicationLabId},
  material:{id:variant.id,label:hostMaterial?.label||variant.label,family:catalog.families.find(f=>f.id===variant.familyId).name,internalCode:variant.internalCode,supplierCode:hostMaterial?.supplierCode||variant.supplierCode,appearanceRevision:variant.appearanceRevision},
  coverLayout:{id:coverSelect.value,label:coverSelect.selectedOptions[0].textContent},
  inscriptions:{top:$('topText').value,bottom:$('bottomText').value},
  view:{camera:camera.position.toArray(),target:controls.target.toArray(),extractionPercent:Number($('extract').value),showCase:$('case').checked},
  photo:{...photoInfo,crop:{zoom:Number($('photoZoom').value),x:Number($('photoX').value)/100,y:Number($('photoY').value)/100}},dimensions:'35 × 25 cm circa'};
}
function hostConfiguration(){
 const c=configuration();
 return {modelId:c.model.id,assetRevision:c.model.assetRevision,materialId:c.material.id,appearanceRevision:c.material.appearanceRevision,coverLayout:c.coverLayout.id,topText:c.inscriptions.top,bottomText:c.inscriptions.bottom,photoAssetId:photoInfo.id||null,crop:c.photo.crop};
}
function updateSummary(){
 const c=configuration();
 if(hostOption){
  $('materialLabel').textContent=c.laboratory.name+' · '+(c.material.supplierCode||c.material.label);
  document.querySelector('#fabricPanel h2').textContent=hostOption.labName+' · '+hostOption.materials.length+' rivestimenti';
  for(const section of document.querySelectorAll('.material-category')){
   const visible=[...section.querySelectorAll('[data-finish]')].filter(b=>!b.hidden);
   section.hidden=visible.length===0;
   if(visible.length){const family=catalog.families.find(f=>f.id===visible[0].dataset.family);section.querySelector('summary').textContent=family.name+' · '+visible.length+' rivestimenti';}
  }
 }
 $('configurationSummary').textContent=`${c.model.name}\n${c.material.family} · ${c.material.label}\n${c.coverLayout.label}\nFoto: ${c.photo.name}\nSuperiore: ${c.inscriptions.top||'Nessuna scritta'}\nInferiore: ${c.inscriptions.bottom||'Nessuna scritta'}`;
 let title=$('albumModelTitle');
 if(!title){title=document.createElement('p');title.id='albumModelTitle';document.querySelector('h1').after(title);}
 title.textContent=c.model.name;
 if(embedded&&hostInitialized&&!applyingHost&&document.body.dataset.ready==='true')notifyHost('change',{configuration:hostConfiguration()});
}
$('modelName').addEventListener('input',updateSummary);
function setDownloadAvailability(){
 for(const id of ['downloadClient','downloadStudio'])$(id).disabled=materialPending||photoPending||document.body.dataset.ready!=='true';
 notifyHost('busy',{busy:materialPending||photoPending||applyingHost});
}
function renderConfigurationViews(jpeg=false){
 // Canvas indipendente da dimensioni, scroll e zoom dell'interfaccia.
 const exporter=new THREE.WebGLRenderer({antialias:true});
 exporter.setPixelRatio(1);exporter.setSize(1600,1200,false);
 exporter.toneMapping=renderer.toneMapping;exporter.toneMappingExposure=renderer.toneMappingExposure;
 exporter.shadowMap.enabled=true;exporter.shadowMap.type=renderer.shadowMap.type;
 const exportCamera=new THREE.PerspectiveCamera(36,4/3,.005,20);
 const previousX=album.position.x,previousCase=caseGroup.visible;
 const views=[
  {label:'Album e custodia · prospettiva',direction:[-1,.5,1.6],caseVisible:true,x:0},
  {label:'Copertina · album senza custodia',direction:[0,0,1],caseVisible:false,x:0},
  {label:'Retro · album senza custodia',direction:[0,0,-1],caseVisible:false,x:0},
  {label:'Dorso e scritte personalizzate',direction:[-1,0,0],caseVisible:true,x:0},
  {label:'Lato destro',direction:[1,0,0],caseVisible:true,x:0},
  {label:'Vista superiore',direction:[0,1,0],caseVisible:true,x:0},
  {label:'Vista inferiore',direction:[0,-1,0],caseVisible:true,x:0},
  {label:'Album estratto dalla custodia',direction:[-.5,.4,1.6],caseVisible:true,x:-.44}
 ];
 const previousGround=ground.visible;
 const previousEnvironment=scene.environment,previousShadowMap=key.shadow.map;
 let exportEnvironment;
 try{
  // Le texture generate sulla GPU del visualizzatore non sono condivisibili
  // con il contesto WebGL separato dell'export: ricreiamo gli stessi riflessi.
  const exportRoom=new RoomEnvironment();
  const exportPmrem=new THREE.PMREMGenerator(exporter);
  try{exportEnvironment=exportPmrem.fromScene(exportRoom,.04);}
  finally{exportRoom.dispose();exportPmrem.dispose();}
  scene.environment=exportEnvironment.texture;
  key.shadow.map=null;
  // Il piano ombra coprirebbe il prodotto nella vista dal basso.
  ground.visible=false;
  return views.map(view=>{
   album.position.x=view.x;caseGroup.visible=view.caseVisible;model.updateMatrixWorld(true);
   const bounds=new THREE.Box3();
   model.traverseVisible(object=>{if(object.isMesh)bounds.expandByObject(object,true);});
   const sphere=bounds.getBoundingSphere(new THREE.Sphere());
   const halfAngle=THREE.MathUtils.degToRad(exportCamera.fov/2);
   const distance=sphere.radius/Math.sin(halfAngle)*1.12;
   exportCamera.up.set(0,1,0);
   if(Math.abs(view.direction[1])===1)exportCamera.up.set(0,0,view.direction[1]>0?-1:1);
   exportCamera.position.copy(sphere.center).add(new THREE.Vector3(...view.direction).normalize().multiplyScalar(distance));
   exportCamera.lookAt(sphere.center);exporter.render(scene,exportCamera);
   return {label:view.label,image:jpeg?exporter.domElement.toDataURL('image/jpeg',.82):exporter.domElement.toDataURL('image/png')};
  });
 }finally{
  album.position.x=previousX;caseGroup.visible=previousCase;ground.visible=previousGround;
  scene.environment=previousEnvironment;
  if(key.shadow.map!==previousShadowMap)key.shadow.map?.dispose();
  key.shadow.map=previousShadowMap;exportEnvironment?.dispose();
  model.updateMatrixWorld(true);exporter.dispose();exporter.forceContextLoss();
 }
}
function downloadConfiguration(internal){
 if(materialPending||photoPending||document.body.dataset.ready!=='true')return;
 try{
  const c=configuration();
  const previews=renderConfigurationViews();
  const rows=[['Modello',c.model.name],['Foto di copertina',c.photo.name],['Formato indicativo',c.dimensions],['Rivestimento',c.material.label],['Famiglia',c.material.family],['Foto in copertina',c.coverLayout.label],['Scritta superiore',c.inscriptions.top||'Nessuna'],['Scritta inferiore',c.inscriptions.bottom||'Nessuna']];
  if(internal){
   rows.push(['Laboratorio',c.laboratory.name],['Codice interno',c.material.internalCode],['Codice fornitore',c.material.supplierCode||'Da confermare con il laboratorio'],['Applicazione tessuto','Copertina, dorso e custodia'],['Revisione texture',c.material.appearanceRevision],['Note operative',$('studioNotes').value||'Nessuna']);
   c.studioNotes=$('studioNotes').value;
  }
  const html=buildAlbumReport({configuration:c,previews,rows,internal});
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`album-${internal?'scheda-studio':'configurazione'}-${Date.now()}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  $('downloadStatus').textContent='File preparato: controlla i download del browser.';
 }catch(error){console.error(error);$('downloadStatus').textContent='Download non riuscito. Riprova.';}
}
$('downloadClient').onclick=()=>downloadConfiguration(false);
$('downloadStudio').onclick=()=>downloadConfiguration(true);

// Il contenitore autenticato gestisce caricamento, selezione e persistenza.
// Il viewer riceve solo configurazione e Blob; nessun token o URL privato.
if(embedded){
 const style=document.createElement('style');style.textContent='#openStudio,#studioDialog,#coverUpload,label[for="coverUpload"],#restorePhoto,[data-finish][hidden],.material-category[hidden]{display:none!important}';document.head.append(style);
 $('photoStatus').textContent='Scegli la foto dai comandi sopra il visualizzatore.';
 $('topText').value='';$('bottomText').value='';
 for(const id of ['topText','bottomText'])$(id).dispatchEvent(new Event('input'));
 window.addEventListener('message',async event=>{
  if(event.source!==window.parent||event.origin!==window.location.origin||event.data?.channel!=='memorie-mockup-v1')return;
  if(event.data.type==='lock'){
   hostReadOnly=!!event.data.readOnly;
   for(const control of document.querySelectorAll('#materials button,#detailPanel input,#detailPanel select'))control.disabled=hostReadOnly;
   return;
  }
  if(event.data.type==='export'){
   try{if(applyingHost||materialPending||photoPending)throw new Error('Attendi il caricamento');notifyHost('exported',{requestId:event.data.requestId,previews:renderConfigurationViews(true),configuration:hostConfiguration()});}
   catch{notifyHost('export-error',{requestId:event.data.requestId});}
   return;
  }
  if(event.data.type!=='apply')return;
  if(applyingHost)return;
  applyingHost=true;notifyHost('busy',{busy:true});
  try{
   const {configuration:c,photo,readOnly}=event.data;
   hostReadOnly=!!readOnly;
   if(event.data.option){
    hostOption=event.data.option;
    $('modelName').value=hostOption.name;
    for(const button of document.querySelectorAll('[data-finish]')){
     const material=hostOption.materials.find(m=>m.id===button.dataset.finish);
     button.hidden=!material;
     if(material){button.title=material.supplierCode||material.label;button.lastChild.textContent=material.label;}
    }
    if(!c&&!hostOption.materials.some(m=>m.id===selected))await finish(hostOption.materials[0].id);
   }
   if(photo){
    if(!(photo.blob instanceof Blob))throw new Error('Immagine non disponibile');
    const url=URL.createObjectURL(photo.blob);
    try{
     const candidate=await loader.loadAsync(url);
     candidate.colorSpace=THREE.SRGBColorSpace;candidate.flipY=false;candidate.anisotropy=renderer.capabilities.getMaxAnisotropy();
     const previous=localPhotoTexture;localPhotoTexture=candidate;photoSurface.material.map=candidate;photoSurface.material.needsUpdate=true;
     photoInfo={id:photo.id,name:photo.name,source:photo.source,width:candidate.image.width,height:candidate.image.height};previous?.dispose();
     resetPhotoCrop();$('photoStatus').textContent=photo.name;
    }finally{URL.revokeObjectURL(url);}
   }
   if(c){
    if(c.modelId!==currentModel.id||c.assetRevision!==currentModel.assetRevision)throw new Error('Versione del modello non supportata');
    coverSelect.value=c.coverLayout;
    $('topText').value=c.topText;$('bottomText').value=c.bottomText;
    $('photoZoom').value=c.crop.zoom;$('photoX').value=c.crop.x*100;$('photoY').value=c.crop.y*100;
    await finish(c.materialId);
   }
   for(const id of ['topText','bottomText'])$(id).dispatchEvent(new Event('input'));
   updateCover();
   for(const control of document.querySelectorAll('#materials button,#detailPanel input,#detailPanel select'))control.disabled=hostReadOnly;
   notifyHost('applied');
  }catch(error){notifyHost('error',{message:error.message||'Impossibile applicare la configurazione'});}
  finally{applyingHost=false;hostInitialized=true;setDownloadAvailability();updateSummary();}
 });
 notifyHost(document.body.dataset.ready==='true'?'ready':'error',{message:'Modello 3D non disponibile'});
}
