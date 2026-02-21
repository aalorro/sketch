// Sketchify - client-side image to sketch transformations
(function(){
  // Elements
  const fileEl = document.getElementById('file');
  const original = document.getElementById('original');
  const preview = document.getElementById('preview');
  const generateBtn = document.getElementById('generate');
  const downloadPng = document.getElementById('downloadPng');
  const downloadJpg = document.getElementById('downloadJpg');
  const downloadZip = document.getElementById('downloadZip');
  const progressWrap = document.querySelector('.progress-wrap');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const presets = document.querySelectorAll('.preset');

  // Generate default filename with date and time
  function getDefaultFilename(){
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `sketchify_${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  // Update placeholder to show current default format
  function updateOutputNamePlaceholder(){
    document.getElementById('outputName').placeholder = getDefaultFilename();
  }

  // Preset management with localStorage
  const PRESET_PREFIX = 'sketchify_preset_';

  function savePresetLocally(name){
    if(!name || name.trim() === ''){ alert('Please enter a preset name.'); return; }
    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const key = PRESET_PREFIX + sanitizedName;
    const state = captureState();
    try{
      localStorage.setItem(key, JSON.stringify(state));
      alert(`Preset "${sanitizedName}" saved!`);
      document.getElementById('presetName').value = '';
      refreshPresetList();
    }catch(err){
      alert('Failed to save preset: ' + err.message);
    }
  }

  function loadPresetLocally(name){
    if(!name){ alert('Please select a preset.'); return; }
    const key = PRESET_PREFIX + name;
    try{
      const json = localStorage.getItem(key);
      if(!json){ alert('Preset not found.'); return; }
      const state = JSON.parse(json);
      restoreState(state);
      pushUndo();
    }catch(err){
      alert('Failed to load preset: ' + err.message);
    }
  }

  function deletePresetLocally(name){
    if(!name){ alert('Please select a preset to delete.'); return; }
    if(!confirm('Delete preset "' + name + '"?')) return;
    const key = PRESET_PREFIX + name;
    try{
      localStorage.removeItem(key);
      alert('Preset deleted!');
      document.getElementById('presetSelect').value = '';
      document.getElementById('presetName').value = '';
      refreshPresetList();
    }catch(err){
      alert('Failed to delete preset: ' + err.message);
    }
  }

  function refreshPresetList(){
    const select = document.getElementById('presetSelect');
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PRESET_PREFIX));
    const names = keys.map(k => k.substring(PRESET_PREFIX.length));
    select.innerHTML = names.length === 0 
      ? '<option value="">-- No presets --</option>' 
      : '<option value="">-- Select a preset --</option>' + names.map(n => '<option value="' + n + '">' + n + '</option>').join('');
  }

  let currentFiles = [];
  let currentImageIndex = 0;
  let lastResults = [];
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  // Image navigation
  function updateImageNavDisplay(){
    const nav = document.getElementById('imageNav');
    const info = document.getElementById('currentImageInfo');
    if(currentFiles.length > 1){
      nav.style.display = 'block';
      const filename = currentFiles[currentImageIndex].name;
      info.textContent = `Image ${currentImageIndex + 1} of ${currentFiles.length}: ${filename}`;
      document.getElementById('prevImage').disabled = currentImageIndex === 0;
      document.getElementById('nextImage').disabled = currentImageIndex === currentFiles.length - 1;
    } else {
      nav.style.display = 'none';
    }
  }

  function navigateImage(delta){
    const newIndex = currentImageIndex + delta;
    if(newIndex >= 0 && newIndex < currentFiles.length){
      currentImageIndex = newIndex;
      loadImageFromFile(currentFiles[currentImageIndex]).then(img=>{ singleImage = img; drawPreview(); updateImageNavDisplay(); }).catch(err=>console.error('Failed to load image', err));
    }
  }

  document.getElementById('prevImage').addEventListener('click', ()=>navigateImage(-1));
  document.getElementById('nextImage').addEventListener('click', ()=>navigateImage(1));

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
      skipHatching: document.getElementById('skipHatching').checked,
      contrast: document.getElementById('contrast').value,
      saturation: document.getElementById('saturation').value,
      hueShift: document.getElementById('hueShift').value,
      colorize: document.getElementById('colorize').checked
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

  // initialize output name placeholder with current timestamp
  updateOutputNamePlaceholder();

  // initialize preset list from localStorage
  refreshPresetList();

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
  ['artStyle','style','intensity','stroke','brush','outputName','skipHatching','useWebGL','colorize'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', ()=>{ pushUndo(); if(currentFiles.length) drawPreview(); });
  });

  // Real-time slider updates without undo/redo on every drag
  ['intensity','stroke','contrast','saturation','hueShift'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', ()=>{ if(currentFiles.length) drawPreview(); });
  });

  downloadPng.addEventListener('click', ()=>{ 
    if(!lastResults.length && !hasCanvasContent()) {
      showErrorMessage('No image loaded. Please load an image and click Generate first.');
      return;
    }
    if(preview.toDataURL){
      const name = document.getElementById('outputName').value.trim() || getDefaultFilename();
      downloadDataURL(preview.toDataURL('image/png'), name + '.png');
    }
  });
  downloadJpg.addEventListener('click', ()=>{ 
    if(!lastResults.length && !hasCanvasContent()) {
      showErrorMessage('No image loaded. Please load an image and click Generate first.');
      return;
    }
    if(preview.toDataURL){
      const name = document.getElementById('outputName').value.trim() || getDefaultFilename();
      downloadDataURL(preview.toDataURL('image/jpeg',0.92), name + '.jpg');
    }
  });
  downloadZip.addEventListener('click', downloadAllZip);

  // Reset button
  document.getElementById('resetAll').addEventListener('click', () => {
    console.log('Reset button clicked');
    // Set all controls to their default values
    document.getElementById('artStyle').value = 'pencil';
    document.getElementById('style').value = 'contour';
    document.getElementById('brush').value = 'line';
    document.getElementById('intensity').value = 6;
    document.getElementById('stroke').value = 3;
    document.getElementById('skipHatching').checked = true;
    document.getElementById('colorize').checked = false;
    document.getElementById('contrast').value = 1;
    document.getElementById('saturation').value = 1;
    document.getElementById('hueShift').value = 0;
    document.getElementById('prompt').value = '';
    document.getElementById('seed').value = '';
    document.getElementById('resolution').value = '1024';
    document.getElementById('aspect').value = '1:1';
    document.getElementById('outputName').value = '';
    updateOutputNamePlaceholder();
    document.getElementById('useWebGL').checked = false;
    document.getElementById('useML').checked = false;
    document.getElementById('mlUrl').value = 'https://api.example.com/ml-sketch';
    document.getElementById('useServer').checked = false;
    document.getElementById('serverUrl').value = 'http://localhost:5001/api/style-transfer-advanced';
    
    // Clear images and canvases
    currentFiles = [];
    currentImageIndex = 0;
    singleImage = null;
    lastResults = [];
    undoStack.length = 0;
    redoStack.length = 0;
    console.log('Cleared files and canvas');
    
    // Update nav display
    if(typeof updateImageNavDisplay === 'function'){
      updateImageNavDisplay();
    }
    
    // Clear file input
    if(fileEl){
      fileEl.value = '';
    }
    
    // Clear canvases
    if(preview && original){
      const ctx = preview.getContext('2d');
      ctx.clearRect(0, 0, preview.width, preview.height);
      const octx = original.getContext('2d');
      octx.clearRect(0, 0, original.width, original.height);
      console.log('Cleared canvases');
    }
    
    // Show notification
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #7c3aed; color: white; padding: 30px 40px; border-radius: 12px; font-size: 18px; z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,0.3); text-align: center; max-width: 500px;';
    notification.textContent = 'Reset complete. Please re-upload images to start fresh.';
    document.body.appendChild(notification);
    console.log('Reset complete');
    setTimeout(() => notification.remove(), 6000);
  });

  // Error message display function
  function showErrorMessage(message) {
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #ef4444; color: white; padding: 24px 32px; border-radius: 12px; font-size: 16px; z-index: 9999; box-shadow: 0 8px 32px rgba(239, 68, 68, 0.4); text-align: center; max-width: 500px; line-height: 1.5;';
    notification.textContent = message;
    notification.style.cursor = 'pointer';
    notification.addEventListener('click', () => notification.remove());
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  }

  // Check if preview canvas has content
  function hasCanvasContent() {
    try {
      const ctx = preview.getContext('2d');
      const imageData = ctx.getImageData(0, 0, preview.width, preview.height).data;
      // Check if any pixel has alpha > 0 (not fully transparent)
      for (let i = 3; i < imageData.length; i += 4) {
        if (imageData[i] > 0) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Preset management event listeners
  document.getElementById('savePreset').addEventListener('click', ()=>{
    const name = document.getElementById('presetName').value.trim();
    savePresetLocally(name);
  });
  document.getElementById('loadPreset').addEventListener('click', ()=>{
    const name = document.getElementById('presetSelect').value;
    loadPresetLocally(name);
  });
  document.getElementById('deletePreset').addEventListener('click', ()=>{
    const name = document.getElementById('presetSelect').value;
    deletePresetLocally(name);
  });

  // Keep a single image loaded for preview when batch processing
  let singleImage = null;
  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file); const im = new Image(); im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im); }; im.onerror = reject; im.src = url; });
  }
  
  // Override the file event handler to capture first image for real-time preview
  // Update file count display and warning
  function updateFileInfo(){
    const fileInfoDiv = document.getElementById('fileInfo');
    const fileCountDiv = document.getElementById('fileCount');
    const fileWarningDiv = document.getElementById('fileWarning');
    
    if(currentFiles.length === 0){
      fileInfoDiv.style.display = 'none';
    } else {
      fileInfoDiv.style.display = 'block';
      fileCountDiv.textContent = currentFiles.length + ' image' + (currentFiles.length === 1 ? '' : 's') + ' selected';
      if(currentFiles.length > 20){
        fileWarningDiv.style.display = 'block';
      } else {
        fileWarningDiv.style.display = 'none';
      }
    }
  }

  fileEl.addEventListener('change', e=>{
    currentFiles = Array.from(e.target.files || []);
    currentImageIndex = 0;
    updateFileInfo();
    if(currentFiles.length){
      enableControls();
      updateImageNavDisplay();
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

  function showNotification(){ 
    const notif = document.getElementById('notification');
    notif.style.display = 'block';
    setTimeout(()=>{ notif.style.display = 'none'; }, 5000);
  }

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
    showNotification();
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
      fd.append('colorize', document.getElementById('colorize').checked);
      fd.append('contrast', document.getElementById('contrast').value);
      fd.append('saturation', document.getElementById('saturation').value);
      fd.append('hueShift', document.getElementById('hueShift').value);
      fd.append('prompt', document.getElementById('prompt').value);
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
      fd.append('colorize', document.getElementById('colorize').checked);
      fd.append('contrast', document.getElementById('contrast').value);
      fd.append('saturation', document.getElementById('saturation').value);
      fd.append('hueShift', document.getElementById('hueShift').value);
      fd.append('prompt', document.getElementById('prompt').value);
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
    if(!lastResults.length){ showErrorMessage('No images generated yet. Please load images and click Generate first.'); return; }
    if(typeof JSZip === 'undefined'){ alert('JSZip not loaded.'); return; }
    const zip = new JSZip();
    const prefix = document.getElementById('outputName').value.trim() || getDefaultFilename();
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
    
    // Set both canvases to same dimensions
    original.width = canvasW; original.height = canvasH;
    preview.width = canvasW; preview.height = canvasH;
    
    // fit image into canvas preserving cover behavior
    const iw = singleImage.width, ih = singleImage.height;
    const ir = iw/ih, cr = canvasW/canvasH;
    let sx=0, sy=0, sw=iw, sh=ih;
    if(ir>cr){ // image wider -> crop sides
      sw = ih * cr; sx = Math.round((iw-sw)/2);
    } else { // image taller -> crop top/bottom
      sh = iw / cr; sy = Math.round((ih-sh)/2);
    }
    
    // Draw original image to original canvas
    const octx = original.getContext('2d');
    octx.clearRect(0, 0, canvasW, canvasH);
    octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    
    // Draw and process to preview canvas
    const ctx = preview.getContext('2d');
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
    
    // Store original color data for colorization
    const originalColors = new Uint8ClampedArray(w*h*3);
    for(let i=0;i<w*h;i++){
      originalColors[i*3] = imgData.data[i*4];     // R
      originalColors[i*3+1] = imgData.data[i*4+1]; // G
      originalColors[i*3+2] = imgData.data[i*4+2]; // B
    }
    
    const gray = new Uint8ClampedArray(w*h);
    for(let i=0;i<w*h;i++){ const r=imgData.data[i*4], g=imgData.data[i*4+1], b=imgData.data[i*4+2]; gray[i] = (0.299*r + 0.587*g + 0.114*b)|0; }
    const edges = sobel(gray, w, h);

    // Route to style-specific rendering
    switch(style) {
      case 'contour': renderContour(ctx, w, h, edges, gray, intensity); break;
      case 'gesture': renderGesture(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'lineart': renderLineArt(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'crosscontour': renderCrossContour(ctx, w, h, edges, gray, intensity); break;
      case 'hatching': renderHatching(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'crosshatching': renderCrossHatching(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'scribble': renderScribble(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'stippling': renderStippling(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'tonalpencil': renderTonalPencil(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'charcoal': renderCharcoal(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'drybrush': renderDryBrush(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'inkwash': renderInkWash(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'comic': renderComic(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'fashion': renderFashion(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'urban': renderUrban(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'architectural': renderArchitectural(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'academic': renderAcademic(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'etching': renderEtching(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'minimalist': renderMinimalist(ctx, w, h, edges, gray, intensity); break;
      case 'glitch': renderGlitch(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'mixedmedia': renderMixedMedia(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'photorealism': renderPhotorealism(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'graphiteportrait': renderGraphitePortrait(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'oilpainting': renderOilPainting(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'watercolor': renderWatercolor(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      default: renderDefault(ctx, w, h, edges, gray, intensity, stroke, rand); break;
    }

    // Apply Medium (artStyle) effects
    applyMediumEffect(ctx, w, h, art);
    
    // Apply Brush effects
    applyBrushEffect(ctx, w, h, brush, stroke, intensity, edges, rand);

    // Apply colorization if enabled (BEFORE color adjustments so sliders work on colored image)
    const colorize = document.getElementById('colorize').checked;
    if(colorize){
      applyColorization(ctx, w, h, originalColors);
    }

    // Apply Color adjustments (after colorization so hue/saturation/contrast work on colored image)
    const contrast = parseFloat(document.getElementById('contrast').value);
    const saturation = parseFloat(document.getElementById('saturation').value);
    const hueShift = parseInt(document.getElementById('hueShift').value, 10);
    applyColorAdjustments(ctx, w, h, contrast, saturation, hueShift);
  }

  function applyMediumEffect(ctx, w, h, medium){
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    
    if(medium === 'pencil'){
      // Pencil: lighter, slightly grainy, more delicate
      for(let i=0; i<d.length; i+=4){
        d[i] = Math.min(255, d[i] + 30);     // lighter R
        d[i+1] = Math.min(255, d[i+1] + 30); // lighter G
        d[i+2] = Math.min(255, d[i+2] + 30); // lighter B
      }
      // Add slight grain texture
      for(let i=0; i<d.length; i+=4){
        const noise = Math.random() * 20 - 10;
        d[i] = Math.max(0, Math.min(255, d[i] + noise));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + noise));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + noise));
      }
    } else if(medium === 'ink'){
      // Ink: darker, more saturated, crisp
      for(let i=0; i<d.length; i+=4){
        const avg = (d[i] + d[i+1] + d[i+2]) / 3;
        d[i] = Math.max(0, d[i] - 40);     // darker R
        d[i+1] = Math.max(0, d[i+1] - 40); // darker G
        d[i+2] = Math.max(0, d[i+2] - 40); // darker B
      }
    } else if(medium === 'marker'){
      // Marker: bold, slightly softer edges, more opaque
      for(let i=0; i<d.length; i+=4){
        if(d[i+3] > 100){  // only if not transparent
          d[i] = Math.max(0, d[i] - 15);     // slightly darker
          d[i+1] = Math.max(0, d[i+1] - 15);
          d[i+2] = Math.max(0, d[i+2] - 15);
        }
      }
      // Add slight blur/softness by averaging with neighbors (simple box)
      const newData = new Uint8ClampedArray(d);
      for(let y=1; y<h-1; y++){
        for(let x=1; x<w-1; x++){
          const idx = (y*w + x) * 4;
          const up = ((y-1)*w + x) * 4;
          const down = ((y+1)*w + x) * 4;
          const left = (y*w + (x-1)) * 4;
          const right = (y*w + (x+1)) * 4;
          newData[idx] = (d[idx] + d[up] + d[down] + d[left] + d[right]) / 5;
          newData[idx+1] = (d[idx+1] + d[up+1] + d[down+1] + d[left+1] + d[right+1]) / 5;
          newData[idx+2] = (d[idx+2] + d[up+2] + d[down+2] + d[left+2] + d[right+2]) / 5;
        }
      }
      for(let i=0; i<d.length; i++) d[i] = newData[i];
    } else if(medium === 'pen'){
      // Pen: crisp, slight pressure variation, very dark
      for(let i=0; i<d.length; i+=4){
        d[i] = Math.max(0, d[i] - 50);     // very dark
        d[i+1] = Math.max(0, d[i+1] - 50);
        d[i+2] = Math.max(0, d[i+2] - 50);
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }

  function applyBrushEffect(ctx, w, h, brush, stroke, intensity, edges, rand){
    if(brush === 'line') return;  // line is default, no additional effect
    
    const imgData = ctx.getImageData(0, 0, w, h);
    const overlay = ctx.createImageData(w, h);
    
    // Copy current canvas to overlay
    for(let i=0; i<imgData.data.length; i++) overlay.data[i] = imgData.data[i];
    
    if(brush === 'hatch'){
      // Add diagonal hatching pattern
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = 'rgba(80, 80, 80, 0.3)';
      ctx.lineWidth = 0.5 + stroke*0.3;
      const spacing = Math.max(6, 16 - stroke);
      for(let y=-h; y<h*2; y+=spacing){
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.lineTo(w*2, y + w); 
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if(brush === 'crosshatch'){
      // Add perpendicular hatching
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = 'rgba(80, 80, 80, 0.25)';
      ctx.lineWidth = 0.5 + stroke*0.25;
      const spacing = Math.max(8, 18 - stroke);
      // Diagonal 1
      for(let y=-h; y<h*2; y+=spacing){
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.lineTo(w*2, y + w);
        ctx.stroke();
      }
      // Diagonal 2 (perpendicular)
      for(let y=-h; y<h*2; y+=spacing){
        ctx.beginPath();
        ctx.moveTo(w*2, y);
        ctx.lineTo(-w, y + w);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if(brush === 'charcoal'){
      // Add soft charcoal smudging/blending
      const d = overlay.data;
      // Increase darkness and reduce contrast for softer look
      for(let i=0; i<d.length; i+=4){
        const avg = (d[i] + d[i+1] + d[i+2]) / 3;
        d[i] = Math.round(avg * 0.8 + d[i] * 0.2);
        d[i+1] = Math.round(avg * 0.8 + d[i+1] * 0.2);
        d[i+2] = Math.round(avg * 0.8 + d[i+2] * 0.2);
      }
      ctx.putImageData(overlay, 0, 0);
      // Apply slight blur for softer edges
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      const step = Math.max(4, 12 - stroke);
      for(let y=0; y<h; y+=step){
        for(let x=0; x<w; x+=step){
          const idx = (y*w + x) * 4;
          if(overlay.data[idx+3] > 50){
            const radius = 2 + stroke*0.5;
            ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if(brush === 'inkWash'){
      // Add diluted ink wash effect with transparency
      const d = overlay.data;
      for(let i=0; i<d.length; i+=4){
        // Reduce opacity for wash effect
        d[i+3] = Math.round(d[i+3] * 0.7);
      }
      ctx.putImageData(overlay, 0, 0);
      // Add soft wash overlays
      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = 'rgba(200, 200, 200, 0.15)';
      const step = Math.max(8, 20 - stroke);
      for(let y=0; y<h; y+=step){
        for(let x=0; x<w; x+=step){
          const idx = (y*w + x) * 4;
          if(overlay.data[idx+3] > 0){
            const size = 15 + stroke*2;
            ctx.fillRect(x-size/2, y-size/2, size, size);
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function renderContour(ctx, w, h, edges, gray, intensity) {
    const thr = 40 + (11-intensity)*18;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = (edges[i] > thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderGesture(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const overlay = ctx.createImageData(w,h);
    const d = overlay.data;
    
    // Light base with edge emphasis
    for(let i=0; i<w*h; i++) {
      const edgeVal = edges[i];
      const grayVal = gray[i];
      
      // Emphasize edges strongly, keep light areas light
      let v = 250;
      if(edgeVal > 50) {
        v = 230 - (edgeVal / 255) * 150; // Strong edge darkening
      } else if(grayVal > 150) {
        v = 245; // Keep highlights very light
      } else {
        v = Math.max(60, 250 - (grayVal / 255) * 120);
      }
      
      d[i*4] = Math.round(v);
      d[i*4+1] = Math.round(v);
      d[i*4+2] = Math.round(v);
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Add flowing gesture lines only at edges
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const lineStep = Math.max(8, 18 - stroke * 0.6);
    const lineLength = Math.max(10, 25 - stroke);
    
    for(let y=0; y<h; y+=lineStep) {
      for(let x=0; x<w; x+=lineStep) {
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > 60) {
          ctx.globalAlpha = Math.min(1, edges[idx] / 200);
          ctx.lineWidth = 0.8 + (edges[idx] / 255) * 2;
          
          // Flowing direction based on position
          const angle = (Math.sin(x * 0.03) + Math.cos(y * 0.03)) * Math.PI;
          
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + Math.cos(angle) * lineLength,
            y + Math.sin(angle) * lineLength
          );
          ctx.stroke();
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderLineArt(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 15 + (11-intensity)*10;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = (edges[i] > thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderCrossContour(ctx, w, h, edges, gray, intensity) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add contour lines at different angles
    ctx.globalCompositeOperation = 'overlay';
    ctx.strokeStyle = 'rgba(100,100,200,0.3)';
    ctx.lineCap = 'round';
    const step = Math.max(8, 16 - intensity);
    for(let angle of [0, Math.PI/6]) {
      for(let t = -h; t<h; t+=step) {
        ctx.lineWidth = 0.5 + intensity/5;
        ctx.beginPath();
        ctx.moveTo(0 + t*Math.cos(angle), 0 + t*Math.sin(angle));
        ctx.lineTo(w + t*Math.cos(angle), h + t*Math.sin(angle));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderHatching(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Vertical hatching lines
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#111';
    ctx.lineCap = 'round';
    const step = Math.max(3, 12-stroke);
    ctx.lineWidth = 0.5 + stroke*0.3;
    for(let x=0; x<w; x+=step) {
      for(let y=0; y<h; y+=step*2) {
        const i = y*w+x;
        if(edges[i]/255 < 0.1) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y+step);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderCrossHatching(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Cross-hatching (perpendicular passes)
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#111';
    ctx.lineCap = 'round';
    const step = Math.max(4, 14-stroke);
    ctx.lineWidth = 0.5 + stroke*0.25;
    for(let angle of [0, Math.PI/4]) {
      for(let i=0; i<w+h; i+=step) {
        ctx.beginPath();
        ctx.moveTo(i*Math.cos(angle), i*Math.sin(angle));
        ctx.lineTo((i-w)*Math.cos(angle) + h*Math.sin(angle), (i-w)*Math.sin(angle) + h*Math.cos(angle));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderScribble(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v; overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Chaotic scribble strokes
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const step = Math.max(3, 10-stroke);
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        const i = y*w+x;
        if(edges[i]/255 < 0.1) continue;
        const loopCount = 2 + Math.floor(intensity/3);
        for(let loop=0; loop<loopCount; loop++) {
          ctx.lineWidth = 0.5 + rand()*stroke*0.4;
          ctx.beginPath();
          let cx = x + (rand()-0.5)*step;
          let cy = y + (rand()-0.5)*step;
          ctx.moveTo(cx, cy);
          for(let j=0; j<3; j++) {
            cx += (rand()-0.5)*step;
            cy += (rand()-0.5)*step;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderStippling(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=255;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Dots for stippling
    ctx.fillStyle = '#000';
    const step = Math.max(2, 8-stroke);
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        const i = y*w+x;
        const val = edges[i]/255;
        if(val > 0.1) {
          const r = Math.max(0.5, val*(0.5+stroke*0.3));
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }

  function renderTonalPencil(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Smooth, blended tonal rendering
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const e = edges[i];
      const g = gray[Math.floor(Math.random()*i)];
      const blended = Math.max(e, g*0.5);
      const v = 255 - Math.min(255, blended);
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderCharcoal(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const overlay = ctx.createImageData(w,h);
    const d = overlay.data;
    
    // Build tonal charcoal drawing from grayscale values
    // Light paper (248) to dark charcoal (40)
    for(let i=0; i<w*h; i++) {
      const grayVal = gray[i];
      // Map grayscale to charcoal tones
      const tonalValue = 248 - (grayVal / 255) * 208;
      
      d[i*4] = Math.round(tonalValue);
      d[i*4+1] = Math.round(tonalValue);
      d[i*4+2] = Math.round(tonalValue);
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Add edge definition only where there are strong edges
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#1a1a1a';
    
    const edgeStep = Math.max(4, 10 - stroke * 0.4);
    for(let y=0; y<h; y+=edgeStep) {
      for(let x=0; x<w; x+=edgeStep) {
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > 70) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderDryBrush(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Broken, textured strokes
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    const step = Math.max(3, 10-stroke);
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        const i = y*w+x;
        if(edges[i]/255 < 0.15) continue;
        ctx.lineWidth = 1 + stroke*0.5 + rand()*0.5;
        ctx.beginPath();
        ctx.moveTo(x + rand()*2, y + rand()*2);
        ctx.lineTo(x + step + rand()*2, y + step + rand()*2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderInkWash(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 20 + (11-intensity)*15;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr/2));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add diluted ink washes
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    const step = Math.max(6, 14-stroke);
    for(let y=0; y<h; y+=step*1.5) {
      for(let x=0; x<w; x+=step*1.5) {
        const i = y*w+x;
        if(edges[i]/255 > 0.2) {
          ctx.fillRect(x - step/2, y - step/2, step*1.2, step*1.2);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderComic(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 5 + (11-intensity)*8;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = (edges[i]>thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add spot blacks and varied line weights (smaller, more natural spots)
    ctx.globalCompositeOperation = 'darken';
    ctx.fillStyle = '#000';
    const step = Math.max(6, 14-stroke);
    for(let y=step/2; y<h; y+=step) {
      for(let x=step/2; x<w; x+=step) {
        const idx = (y*w + x) * 4;
        // Only add spot blacks where there's shadow/dark areas
        if(gray[Math.floor(y)*w + Math.floor(x)] < 120 && rand()>0.6) {
          const radius = 0.8 + rand()*1.2;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderFashion(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 20 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = (edges[i]>thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add flowing, elongated strokes
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#333';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const step = Math.max(4, 12-stroke);
    for(let y=0; y<h; y+=step*2) {
      for(let x=0; x<w; x+=step*2) {
        ctx.lineWidth = 0.5 + stroke*0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + step, y + step/2, x + step*1.5, y - step);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderUrban(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 15 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add quick wash overlays
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(100,150,200,0.2)';
    const step = Math.max(10, 20-stroke);
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        ctx.fillRect(x, y, step, step);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderArchitectural(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*10;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = (edges[i]>thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderAcademic(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 8 + (11-intensity)*10;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      let e = edges[i];
      if(intensity<5) e *= (0.8 + rand()*0.3);
      const v = 255 - Math.min(255, Math.max(0, e - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Subtle shading
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    const step = Math.max(6, 14-stroke);
    for(let y=0; y<h; y+=step*2) {
      for(let x=0; x<w; x+=step*2) {
        const i = y*w+x;
        if(edges[i]/255 > 0.15) {
          ctx.fillRect(x, y, step, step);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderEtching(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 5 + (11-intensity)*5;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = (edges[i]>thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    
    // Fine crosshatching only where there are edges
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#111';
    ctx.lineCap = 'round';
    const step = Math.max(3, 9 - stroke);
    ctx.lineWidth = 0.4 + stroke*0.15;
    
    // Horizontal hatching
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > thr) {
          ctx.beginPath();
          ctx.moveTo(x - step, y);
          ctx.lineTo(x + step, y);
          ctx.stroke();
        }
      }
    }
    
    // Vertical hatching for cross pattern
    for(let y=0; y<h; y+=step) {
      for(let x=0; x<w; x+=step) {
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > thr - 5) {
          ctx.beginPath();
          ctx.moveTo(x, y - step);
          ctx.lineTo(x, y + step);
          ctx.stroke();
        }
      }
    }
    
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderMinimalist(ctx, w, h, edges, gray, intensity) {
    const thr = 60 + (11-intensity)*20;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = (edges[i]>thr) ? 0 : 255;
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderGlitch(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      let e = edges[i];
      if(rand()<0.1) e = rand()*255;
      const v = 255 - Math.min(255, Math.max(0, e - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Add scanlines and jitter
    ctx.globalCompositeOperation = 'overlay';
    ctx.strokeStyle = 'rgba(200,50,50,0.2)';
    for(let y=0; y<h; y+=2) {
      ctx.beginPath();
      ctx.moveTo(0 + rand()*3, y);
      ctx.lineTo(w + rand()*3, y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderMixedMedia(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
    // Mix of techniques
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeStyle = 'rgba(100,0,0,0.3)';
    const step = Math.max(5, 12-stroke);
    for(let y=0; y<h; y+=step*1.5) {
      for(let x=0; x<w; x+=step*1.5) {
        if(rand()>0.5) {
          ctx.fillRect(x, y, step/2, step/2);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, step/3, 0, Math.PI*2);
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyColorAdjustments(ctx, w, h, contrast, saturation, hueShift){
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for(let i=0; i<d.length; i+=4){
      let r = d[i], g = d[i+1], b = d[i+2];

      // Apply contrast
      if(contrast !== 1){
        r = ((r - 128) * contrast) + 128;
        g = ((g - 128) * contrast) + 128;
        b = ((b - 128) * contrast) + 128;
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
      }

      // Convert RGB to HSL for saturation and hue adjustments
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      let h, s, l = (max + min) / 2;
      if(max === min){
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
          case r/255: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g/255: h = (b - r) / d + 2; break;
          case b/255: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      // Apply hue shift
      h = (h * 360 + hueShift) % 360 / 360;
      if(h < 0) h += 1;

      // Apply saturation
      s = Math.min(1, s * saturation);

      // Convert HSL back to RGB
      function hsl2rgb(h, s, l){
        let r, g, b;
        if(s === 0){
          r = g = b = l;
        } else {
          const hue2rgb = (p, q, t) => {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
      }

      const [nr, ng, nb] = hsl2rgb(h, s, l);
      d[i] = nr;
      d[i+1] = ng;
      d[i+2] = nb;
    }

    ctx.putImageData(imgData, 0, 0);
  }

  function renderPhotorealism(ctx, w, h, edges, gray, intensity, stroke, rand){
    // Retro pen & ink: clean line drawing with tonal shading
    const overlay = ctx.createImageData(w, h);
    
    // Start with white background
    for(let i=0; i<w*h*4; i+=4){
      overlay.data[i] = 255;
      overlay.data[i+1] = 255;
      overlay.data[i+2] = 255;
      overlay.data[i+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Draw all edge pixels as dark lines
    ctx.fillStyle = '#000000';
    for(let y=0; y<h; y++){
      for(let x=0; x<w; x++){
        const idx = y*w + x;
        if(edges[idx] > 50){
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    // Add soft tone shading underneath edges
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#333333';
    
    for(let y=0; y<h; y+=2){
      for(let x=0; x<w; x+=2){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > 40){
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderOilPainting(ctx, w, h, edges, gray, intensity, stroke, rand){
    // Oil painting: bold expressive lines and tonal areas
    const thr = 20 + (11-intensity)*10;
    const overlay = ctx.createImageData(w, h);
    
    // Create simplified edge-based image
    for(let i=0; i<w*h; i++){
      const v = (edges[i] > thr) ? 40 : 240;
      overlay.data[i*4] = v;
      overlay.data[i*4+1] = v;
      overlay.data[i*4+2] = v;
      overlay.data[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Add soft tone blending for painterly effect
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#1a1a1a';
    
    for(let y=0; y<h; y+=3){
      for(let x=0; x<w; x+=3){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > thr){
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderWatercolor(ctx, w, h, edges, gray, intensity, stroke, rand){
    // Pen & wash: clean ink lines with soft tonal washes
    const overlay = ctx.createImageData(w, h);
    
    // White background
    for(let i=0; i<w*h*4; i+=4){
      overlay.data[i] = 255;
      overlay.data[i+1] = 255;
      overlay.data[i+2] = 255;
      overlay.data[i+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Add soft wash background tones
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#444444';
    
    for(let y=0; y<h; y+=2){
      for(let x=0; x<w; x+=2){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > 30){
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    
    // Draw crisp pen & ink lines on top
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000000';
    
    for(let y=0; y<h; y++){
      for(let x=0; x<w; x++){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > 50){
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  function renderGraphitePortrait(ctx, w, h, edges, gray, intensity, stroke, rand){
    // Graphite portrait: simple smooth tonal portrait
    // Just use edge detection to create clean portrait lines
    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;
    
    // Base: light paper background
    for(let i=0; i<w*h*4; i+=4){
      d[i] = 248;    // R
      d[i+1] = 248;  // G
      d[i+2] = 248;  // B
      d[i+3] = 255;  // A
    }
    
    // Draw detected edges as pencil lines
    for(let y=0; y<h; y++){
      for(let x=0; x<w; x++){
        const idx = y*w + x;
        if(edges[idx] > 45){
          const lineVal = Math.max(0, 248 - edges[idx] * 0.8);
          d[idx*4] = lineVal;
          d[idx*4+1] = lineVal;
          d[idx*4+2] = lineVal;
        }
      }
    }
    
    ctx.putImageData(overlay, 0, 0);
    
    // Soft shadow wash in background areas
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#333333';
    
    for(let y=0; y<h; y+=3){
      for(let x=0; x<w; x+=3){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] < 40){
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyColorization(ctx, w, h, originalColors){
    // Blend original image colors with the grayscale sketch
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    
    for(let i=0; i<w*h; i++){
      // Get current grayscale sketch value
      const sketchGray = d[i*4]; // R, G, B should all be same (grayscale)
      
      // Get original colors
      const origR = originalColors[i*3];
      const origG = originalColors[i*3+1];
      const origB = originalColors[i*3+2];
      
      // Convert original colors to HSL
      const max = Math.max(origR, origG, origB) / 255;
      const min = Math.min(origR, origG, origB) / 255;
      let h, s, l = (max + min) / 2;
      
      if(max === min){
        h = s = 0;
      } else {
        const diff = max - min;
        s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
        switch(max){
          case origR/255: h = (origG - origB) / diff + (origG < origB ? 6 : 0); break;
          case origG/255: h = (origB - origR) / diff + 2; break;
          case origB/255: h = (origR - origG) / diff + 4; break;
        }
        h /= 6;
      }
      
      // Use sketch's brightness with original hue/saturation
      const newL = sketchGray / 255;
      
      // Convert back to RGB
      const hue2rgb = (p, q, t) => {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      let r, g, b;
      if(s === 0){
        r = g = b = newL;
      } else {
        const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
        const p = 2 * newL - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      d[i*4] = Math.round(r * 255);
      d[i*4+1] = Math.round(g * 255);
      d[i*4+2] = Math.round(b * 255);
    }
    
    ctx.putImageData(imgData, 0, 0);
  }

  function renderDefault(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const thr = 10 + (11-intensity)*12;
    const overlay = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
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
