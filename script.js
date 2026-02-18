// Sketchify - client-side image to sketch transformations
(function(){
  // Elements
  const fileEl = document.getElementById('file');
  const preview = document.getElementById('preview');
  const generateBtn = document.getElementById('generate');
  const downloadPng = document.getElementById('downloadPng');
  const downloadJpg = document.getElementById('downloadJpg');
  const downloadZip = document.getElementById('downloadZip');
  const progressWrap = document.querySelector('.progress-wrap');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const presets = document.querySelectorAll('.preset');

  let currentFiles = [];
  let lastResults = [];
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  // helper RNG
  function getSeed(){ return parseInt(document.getElementById('seed').value) || 0; }
  function mulberry32(a){return function(){ var t = a += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t | 1); t ^= t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14) >>> 0) / 4294967296; }}

  // undo/redo system
  function captureState(){
    return {
      artStyle: document.getElementById('artStyle').value,
      style: document.getElementById('style').value,
      prompt: document.getElementById('prompt').value,
      seed: document.getElementById('seed').value,
      resolution: document.getElementById('resolution').value,
      aspect: document.getElementById('aspect').value,
      intensity: document.getElementById('intensity').value,
      stroke: document.getElementById('stroke').value,
      brush: document.getElementById('brush').value,
      useWebGL: document.getElementById('useWebGL').checked,
      useServer: document.getElementById('useServer').checked,
      serverUrl: document.getElementById('serverUrl').value,
      outputName: document.getElementById('outputName').value,
      skipHatching: document.getElementById('skipHatching').checked
    };
  }
  function restoreState(state){
    Object.keys(state).forEach(k=>{
      const el = document.getElementById(k);
      if(!el) return;
      if(el.type==='checkbox') el.checked = state[k];
      else el.value = state[k];
    });
    if(currentFiles.length) drawPreview();
  }
  function pushUndo(){
    redoStack.length = 0; redoBtn.disabled = true;
    undoStack.push(captureState());
    if(undoStack.length > MAX_HISTORY) undoStack.shift();
    undoBtn.disabled = undoStack.length === 0;
  }
  undoBtn.disabled = true; redoBtn.disabled = true;
  undoBtn.addEventListener('click', ()=>{
    if(undoStack.length === 0) return;
    redoStack.push(captureState());
    const prev = undoStack.pop();
    restoreState(prev);
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  });
  redoBtn.addEventListener('click', ()=>{
    if(redoStack.length === 0) return;
    undoStack.push(captureState());
    const next = redoStack.pop();
    restoreState(next);
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  });
  // keyboard shortcuts
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey){ e.preventDefault(); undoBtn.click(); }
    if((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))){ e.preventDefault(); redoBtn.click(); }
  });

  // presets
  const PRESET_MAP = {
    sketchy: {artStyle:'pencil', style:'line', intensity:6, stroke:3, brush:'hatch'},
    inked: {artStyle:'ink', style:'line', intensity:8, stroke:2, brush:'inkWash'},
    marker: {artStyle:'marker', style:'modern', intensity:7, stroke:4, brush:'crosshatch'},
    charcoal: {artStyle:'pencil', style:'naive', intensity:5, stroke:6, brush:'charcoal'}
  };
  presets.forEach(btn=>btn.addEventListener('click', ()=>{
    const p = PRESET_MAP[btn.dataset.preset]; if(!p) return;
    pushUndo();
    Object.keys(p).forEach(k=>{ const el = document.getElementById(k); if(el) el.value = p[k]; });
    if(currentFiles.length) drawPreview();
  }));

  // Processing queue for batch
  generateBtn.addEventListener('click', ()=>{
    console.log('Generate clicked. currentFiles:', currentFiles.length, 'singleImage:', !!singleImage);
    if(!currentFiles.length){ alert('Please select one or more images.'); return; }
    pushUndo();
    lastResults = [];
    const useZip = true;
    console.log('Starting processQueue with', currentFiles.length, 'file(s)');
    processQueue(currentFiles);
  });

  // Real-time updates for aspect and resolution
  document.getElementById('aspect').addEventListener('change', ()=>{ pushUndo(); if(currentFiles.length) drawPreview(); });
  document.getElementById('resolution').addEventListener('change', ()=>{ pushUndo(); if(currentFiles.length) drawPreview(); });
  // Generic state capture for control changes
  ['artStyle','style','intensity','stroke','brush','outputName','skipHatching','useWebGL'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', ()=>{ pushUndo(); if(currentFiles.length) drawPreview(); });
  });

  downloadPng.addEventListener('click', ()=>{ 
    if(preview.toDataURL){
      const name = document.getElementById('outputName').value.trim() || 'sketch';
      downloadDataURL(preview.toDataURL('image/png'), name + '.png');
    }
  });
  downloadJpg.addEventListener('click', ()=>{ 
    if(preview.toDataURL){
      const name = document.getElementById('outputName').value.trim() || 'sketch';
      downloadDataURL(preview.toDataURL('image/jpeg',0.92), name + '.jpg');
    }
  });
  downloadZip.addEventListener('click', downloadAllZip);

  // Keep a single image loaded for preview when batch processing
  let singleImage = null;
  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file); const im = new Image(); im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im); }; im.onerror = reject; im.src = url; });
  }
  
  // Override the file event handler to capture first image for real-time preview
  fileEl.addEventListener('change', e=>{
    currentFiles = Array.from(e.target.files || []);
    if(currentFiles.length){
      enableControls();
      loadImageFromFile(currentFiles[0]).then(img=>{ singleImage = img; drawPreview(); }).catch(err=>console.error('Failed to load first image', err));
    }
  });

  // Test Server button (posts demo image served by static server)
  const testServerBtn = document.getElementById('testServer');
  if(testServerBtn){
    testServerBtn.addEventListener('click', async ()=>{
      try{
        setProgress(0, 'Fetching demo image...');
        const demoResp = await fetch('test_image.png');
        if(!demoResp.ok) throw new Error('Failed to fetch demo image');
        const blob = await demoResp.blob();
        setProgress(0.2, 'Posting to server...');
        const fd = new FormData(); fd.append('file', blob, 'test_image.png');
        fd.append('artStyle', document.getElementById('artStyle').value);
        fd.append('style', document.getElementById('style').value);
        fd.append('seed', getSeed());
        fd.append('intensity', document.getElementById('intensity').value);
        const serverUrl = document.getElementById('serverUrl').value.trim();
        const resp = await fetch(serverUrl, {method:'POST', body:fd});
        if(!resp.ok) throw new Error('Server error '+resp.status);
        const outBlob = await resp.blob();
        setProgress(0.9, 'Rendering result...');
        const url = URL.createObjectURL(outBlob);
        const im = new Image();
        await new Promise((r, rej)=>{ im.onload = r; im.onerror = rej; im.src = url; });
        renderToCanvas(im);
        lastResults.push({name:'demo.png', blob: outBlob});
        URL.revokeObjectURL(url);
        setProgress(1, 'Done');
        setTimeout(resetProgress, 800);
      }catch(err){ resetProgress(); alert('Test failed: '+err.message); }
    });
  }

  function setProgress(p, text){ progressWrap.hidden = false; progressFill.style.width = (p*100|0) + '%'; progressText.textContent = text || '' }
  function resetProgress(){ progressWrap.hidden = true; progressFill.style.width = '0%'; progressText.textContent = 'Idle' }

  function disableControls(){ document.querySelector('.controls').classList.add('disabled'); }
  function enableControls(){ document.querySelector('.controls').classList.remove('disabled'); }

  async function processQueue(files){
    console.log('processQueue: processing', files.length, 'files');
    disableControls();
    for(let i=0;i<files.length;i++){
      const file = files[i];
      setProgress(i/files.length, `Processing ${i+1}/${files.length}: ${file.name}`);
      try{
        console.log('Processing file', i, ':', file.name);
        const resultBlob = await processFile(file, i, files.length);
        console.log('Got result blob, size:', resultBlob.size);
        lastResults.push({name:file.name, blob: resultBlob});
        // show last result in preview
        const url = URL.createObjectURL(resultBlob);
        const im = new Image();
        await new Promise(r=>{ im.onload = r; im.src = url; });
        renderToCanvas(im);
        URL.revokeObjectURL(url);
      }catch(err){ console.error('process error', err); }
    }
    setProgress(1, 'Completed');
    enableControls();
    setTimeout(resetProgress, 800);
  }

  async function processFile(file, idx, total){
    console.log('processFile:', file.name);
    const useML = document.getElementById('useML').checked;
    const mlUrl = document.getElementById('mlUrl').value.trim();
    const useServer = document.getElementById('useServer').checked;
    const serverUrl = document.getElementById('serverUrl').value.trim();
    if(useML && mlUrl){
      // POST to external ML service and expect image blob back
      console.log('Using external ML service:', mlUrl);
      const fd = new FormData(); fd.append('file', file);
      fd.append('artStyle', document.getElementById('artStyle').value);
      fd.append('style', document.getElementById('style').value);
      fd.append('brush', document.getElementById('brush').value);
      fd.append('seed', getSeed());
      fd.append('intensity', document.getElementById('intensity').value);
      fd.append('stroke', document.getElementById('stroke').value);
      fd.append('skipHatching', document.getElementById('skipHatching').checked);
      try{
        const resp = await fetch(mlUrl, {method:'POST', body:fd});
        console.log('ML response:', resp.status);
        if(!resp.ok) throw new Error('ML error '+resp.status);
        return await resp.blob();
      }catch(err){
        console.error('ML error:', err);
        throw err;
      }
    }
    if(useServer && serverUrl){
      // POST to server and expect image blob back
      console.log('Using server:', serverUrl);
      const fd = new FormData(); fd.append('file', file);
      fd.append('artStyle', document.getElementById('artStyle').value);
      fd.append('style', document.getElementById('style').value);
      fd.append('brush', document.getElementById('brush').value);
      fd.append('seed', getSeed());
      fd.append('intensity', document.getElementById('intensity').value);
      fd.append('stroke', document.getElementById('stroke').value);
      fd.append('skipHatching', document.getElementById('skipHatching').checked);
      try{
        const resp = await fetch(serverUrl, {method:'POST', body:fd});
        console.log('Server response:', resp.status);
        if(!resp.ok) throw new Error('Server error '+resp.status);
        return await resp.blob();
      }catch(err){
        console.error('Server error:', err);
        throw err;
      }
    }

    // client-side path
    console.log('Using client-side processing');
    const img = await loadImageFromFile(file);
    const [w,h] = aspectToWH(document.getElementById('aspect').value, parseInt(document.getElementById('resolution').value,10));
    // draw source into offscreen canvas
    const off = document.createElement('canvas'); off.width = w; off.height = h; const octx = off.getContext('2d');
    // fit/crop
    const fit = fitCropRect(img.width, img.height, w, h);
    octx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, 0,0,w,h);

    // choose GPU or CPU
    const useWebGL = document.getElementById('useWebGL').checked;
    let edgesImgData;
    if(useWebGL && typeof createWebGLSobel === 'function'){
      try{ edgesImgData = await createWebGLSobel(off, w, h); }catch(e){ console.warn('WebGL failed, falling back', e); edgesImgData = octx.getImageData(0,0,w,h); }
    } else {
      edgesImgData = octx.getImageData(0,0,w,h);
    }

    // now apply sketch painter
    applySketchTransform(octx, w, h, edgesImgData);

    return await new Promise(resolve=> off.toBlob(resolve, 'image/png'));
  }

  function downloadAllZip(){
    if(!lastResults.length){ alert('No processed images yet. Generate first.'); return; }
    if(typeof JSZip === 'undefined'){ alert('JSZip not loaded.'); return; }
    const zip = new JSZip();
    const prefix = document.getElementById('outputName').value.trim() || 'sketch';
    lastResults.forEach((r, idx) => zip.file(prefix + '-' + idx + '-' + r.name.replace(/\s+/g,'_'), r.blob));
    zip.generateAsync({type:'blob'}).then(content=>{ 
      const url = URL.createObjectURL(content); 
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = prefix + '-batch.zip'; 
      a.click(); 
      URL.revokeObjectURL(url); 
    });
  }

  function downloadDataURL(dataURL, filename){ const a = document.createElement('a'); a.href = dataURL; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }

  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file); const im = new Image(); im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im); }; im.onerror = reject; im.src = url; });
  }

  fileEl.addEventListener('change', e=>{
    currentFiles = Array.from(e.target.files || []);
    if(currentFiles.length){
      enableControls();
      loadImageFromFile(currentFiles[0]).then(img=>{
        singleImage = img;
        drawPreview();
      }).catch(err=>console.error('Failed to load first image', err));
    }
  });

  // utilities
  function fitCropRect(iw, ih, cw, ch){ const ir = iw/ih, cr = cw/ch; if(ir>cr){ const sw = ih*cr; return {sx: Math.round((iw-sw)/2), sy:0, sw, sh: ih}; } else { const sh = iw/cr; return {sx:0, sy: Math.round((ih-sh)/2), sw: iw, sh}; } }
  function aspectToWH(aspect, base){ const [w,h] = aspect.split(':').map(Number); const ratio = w/h; let width = base; let height = Math.round(base/ratio); if(ratio<1){ height = base; width = Math.round(base*ratio); } return [width,height]; }

  // real-time preview: applies sketch transforms to loaded image
  function drawPreview(){
    if(!singleImage) return;
    const res = parseInt(document.getElementById('resolution').value,10);
    const aspect = document.getElementById('aspect').value;
    const [canvasW, canvasH] = aspectToWH(aspect, res);
    preview.width = canvasW; preview.height = canvasH;
    const ctx = preview.getContext('2d');
    // fit image into canvas preserving cover behavior
    const iw = singleImage.width, ih = singleImage.height;
    const ir = iw/ih, cr = canvasW/canvasH;
    let sx=0, sy=0, sw=iw, sh=ih;
    if(ir>cr){ // image wider -> crop sides
      sw = ih * cr; sx = Math.round((iw-sw)/2);
    } else { // image taller -> crop top/bottom
      sh = iw / cr; sy = Math.round((ih-sh)/2);
    }
    ctx.clearRect(0,0,canvasW,canvasH);
    ctx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    
    // check if WebGL is enabled
    const useWebGL = document.getElementById('useWebGL').checked;
    const webglStatus = document.getElementById('webglStatus');
    if(useWebGL && typeof createWebGLSobel === 'function'){
      try{
        createWebGLSobel(preview, canvasW, canvasH).then(edgesImgData=>{
          webglStatus.style.display = 'inline';
          applySketchTransform(ctx, canvasW, canvasH, edgesImgData);
        }).catch(err=>{
          console.warn('WebGL failed in preview:', err);
          webglStatus.style.display = 'none';
          applySketchTransform(ctx, canvasW, canvasH);
        });
      }catch(err){
        console.warn('WebGL error:', err);
        webglStatus.style.display = 'none';
        applySketchTransform(ctx, canvasW, canvasH);
      }
    } else {
      webglStatus.style.display = 'none';
      applySketchTransform(ctx, canvasW, canvasH);
    }
  }

  // apply sketch - accepts either original imageData (for sobel fallback) or uses internal sobel
  function applySketchTransform(ctx, w, h, srcImageData){
    const art = document.getElementById('artStyle').value;
    const style = document.getElementById('style').value;
    const intensity = parseInt(document.getElementById('intensity').value,10);
    const stroke = parseInt(document.getElementById('stroke').value,10);
    const brush = document.getElementById('brush').value;
    const seed = getSeed(); const rand = mulberry32(seed||Date.now());

    let imgData = srcImageData || ctx.getImageData(0,0,w,h);
    // if srcImageData is full color, convert to gray array
    const gray = new Uint8ClampedArray(w*h);
    for(let i=0;i<w*h;i++){ const r=imgData.data[i*4], g=imgData.data[i*4+1], b=imgData.data[i*4+2]; gray[i] = (0.299*r + 0.587*g + 0.114*b)|0; }

    const edges = sobel(gray, w, h);

    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){ let e = edges[i]; if(art==='pencil') e *= (0.8 + rand()*0.6); if(art==='ink') e *= (1.4 + rand()*0.8); if(art==='marker') e = Math.min(255, e*1.2); if(art==='pen') e *= 1.6; const v = 255 - Math.min(255, Math.max(0, e - thr)); overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255; }
    ctx.putImageData(overlay,0,0);

    // Always apply brush strokes, using the selected brush type
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#111';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseLineWidth = Math.max(1, stroke);
    let passes = 1;
    let step = Math.max(8, 16 - stroke); // default for 'line'
    if (brush === 'hatch' || brush === 'crosshatch' || brush === 'charcoal' || brush === 'inkWash') {
      passes = Math.max(1, Math.floor(intensity / 3));
      step = Math.max(4, 12 - stroke);
    }
    for (let pass = 0; pass < passes; pass++) {
      ctx.lineWidth = baseLineWidth * (1 - pass * 0.12);
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = y * w + x;
          const s = edges[i] / 255;
          if (s < 0.2) continue;
          // Determine angle based on brush type
          let angle;
          if (brush === 'crosshatch') angle = (pass % 2 === 0) ? 0 : Math.PI / 2;
          else if (brush === 'hatch') angle = -Math.PI / 6;
          else if (brush === 'charcoal') angle = (rand() - 0.5) * Math.PI / 8;
          else if (brush === 'inkWash') angle = (rand() - 0.5) * Math.PI / 12;
          else angle = (rand() - 0.5) * Math.PI / 4; // 'line' - more randomness
          const len = Math.round(step * (0.6 + s));
          const dx = Math.cos(angle) * len;
          const dy = Math.sin(angle) * len;
          const jitterX = Math.round((rand() - 0.5) * baseLineWidth * 2);
          const jitterY = Math.round((rand() - 0.5) * baseLineWidth * 2);
          ctx.beginPath();
          ctx.moveTo(x + jitterX, y + jitterY);
          ctx.lineTo(x + dx + jitterX, y + dy + jitterY);
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    if(style !== 'line'){
      const imgD = ctx.getImageData(0,0,w,h);
      if(style === 'cubist') posterize(imgD, 6);
      if(style === 'modern') posterize(imgD, 10);
      if(style === 'naive') posterize(imgD, 4);
      ctx.putImageData(imgD,0,0);
    }
  }

  function posterize(imageData, levels){ const d = imageData.data; const step = 255/(levels-1); for(let i=0;i<d.length;i+=4){ d[i] = Math.round(d[i]/step)*step; d[i+1] = Math.round(d[i+1]/step)*step; d[i+2] = Math.round(d[i+2]/step)*step; } }

  function sobel(gray,w,h){ const out = new Uint8ClampedArray(w*h); const gx = [-1,0,1,-2,0,2,-1,0,1]; const gy = [-1,-2,-1,0,0,0,1,2,1]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ let sx=0, sy=0; let idx=0; for(let ky=-1; ky<=1; ky++){ for(let kx=-1; kx<=1; kx++){ const val = gray[(y+ky)*w + (x+kx)]; sx += val * gx[idx]; sy += val * gy[idx]; idx++; } } const mag = Math.hypot(sx, sy); out[y*w+x] = Math.min(255, mag); } } return out; }

  function renderToCanvas(img){
    const [cw,ch] = [preview.width, preview.height];
    const ctx = preview.getContext('2d');
    ctx.clearRect(0,0,cw,ch);
    // fit img
    const fit = fitCropRect(img.width, img.height, cw, ch);
    ctx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, 0,0,cw,ch);
    // Also update the original canvas if available
    if(typeof original !== 'undefined' && original && typeof singleImage !== 'undefined' && singleImage) {
      const octx = original.getContext('2d');
      octx.clearRect(0,0,original.width,original.height);
      const ofit = fitCropRect(singleImage.width, singleImage.height, original.width, original.height);
      octx.drawImage(singleImage, ofit.sx, ofit.sy, ofit.sw, ofit.sh, 0,0,original.width,original.height);
    }
  }

  // Experimental WebGL Sobel: renders to RGBA where R=G=B=edge
  async function createWebGLSobel(canvasInput, w, h){
    const glCanvas = document.createElement('canvas'); glCanvas.width = w; glCanvas.height = h; const gl = glCanvas.getContext('webgl'); if(!gl) throw new Error('WebGL not available');
    // shader sources
    const vs = 'attribute vec2 a; varying vec2 v; void main(){ v = a; gl_Position = vec4(2.0*a-1.0, 0.0, 1.0);}';
    const fs = 'precision mediump float; uniform sampler2D u; varying vec2 v; void main(){ float w = 1.0/float(' + w + '.0); float h = 1.0/float(' + h + '.0); mat3 gx = mat3(-1.0,0.0,1.0,-2.0,0.0,2.0,-1.0,0.0,1.0); mat3 gy = mat3(-1.0,-2.0,-1.0,0.0,0.0,0.0,1.0,2.0,1.0); float sumx=0.0; float sumy=0.0; int idx=0; for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){ vec4 c = texture2D(u, v + vec2(float(i)*w, float(j)*h)); float gray = dot(c.rgb, vec3(0.299,0.587,0.114)); sumx += gray * gx[idx]; sumy += gray * gy[idx]; idx++; } } float mag = length(vec2(sumx,sumy)); gl_FragColor = vec4(vec3(mag),1.0);}';
    function compile(src, type){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    const prog = gl.createProgram(); gl.attachShader(prog, compile(vs, gl.VERTEX_SHADER)); gl.attachShader(prog, compile(fs, gl.FRAGMENT_SHADER)); gl.linkProgram(prog); if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('GL link error');
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,1,1]), gl.STATIC_DRAW);
    gl.useProgram(prog); const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc,2,gl.FLOAT,false,0,0);
    // upload texture
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvasInput);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const pixels = new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    // convert to ImageData
    const id = new ImageData(new Uint8ClampedArray(pixels), w, h);
    return id;
  }

  // initial blank canvas
  preview.width = 800; preview.height = 600; const pctx = preview.getContext('2d'); pctx.fillStyle = '#fff'; pctx.fillRect(0,0,preview.width,preview.height);
})();
