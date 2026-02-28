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
  let zoomLevel = 1.0; // Zoom level for rendered preview (1.0 = 100%)
  let panOffsetX = 0; // Pan offset X for image positioning
  let panOffsetY = 0; // Pan offset Y for image positioning
  let isPanning = false; // Track if currently dragging
  let panStartX = 0; // Start X position of pan
  let panStartY = 0; // Start Y position of pan
  let currentRenderedImage = null; // Store the rendered image (server or canvas) to preserve during zoom/pan
  let renderingEngine = 'canvas'; // 'canvas' or 'opencv' - controls which renderer is used
  let compareMode = false; // Before/after comparison slider active
  let comparePos = 0.5;   // 0–1 position of comparison divider
  let isDraggingCompare = false; // Dragging comparison handle
  const textureCache = {}; // Cache generated texture canvases by type+size
  let gridGeneration = 0;  // Incremented each time Style Grid opens; old async loops self-abort

  const ALL_STYLES = [
    {value:'contour',label:'Contour'},
    {value:'blindcontour',label:'Blind Contour'},
    {value:'gesture',label:'Gesture'},
    {value:'lineart',label:'Line Art'},
    {value:'crosscontour',label:'Cross-Contour'},
    {value:'hatching',label:'Hatching'},
    {value:'crosshatching',label:'Cross-Hatching'},
    {value:'scribble',label:'Scribble'},
    {value:'stippling',label:'Stippling'},
    {value:'tonalpencil',label:'Tonal Pencil'},
    {value:'charcoal',label:'Charcoal'},
    {value:'drybrush',label:'Dry Brush'},
    {value:'inkwash',label:'Ink Wash'},
    {value:'comic',label:'Comic'},
    {value:'cartoon',label:'Cartoon'},
    {value:'fashion',label:'Fashion'},
    {value:'urban',label:'Urban'},
    {value:'architectural',label:'Architectural'},
    {value:'academic',label:'Academic'},
    {value:'etching',label:'Etching'},
    {value:'minimalist',label:'Minimalist'},
    {value:'glitch',label:'Glitch'},
    {value:'mixedmedia',label:'Mixed Media'},
    {value:'photorealism',label:'Retro Pen'},
    {value:'graphiteportrait',label:'Graphite'},
    {value:'oilpainting',label:'Oil Painting'},
    {value:'watercolor',label:'Watercolor'},
  ];

  // Mobile detection and optimization - detect mobile devices, tablets, and small screens
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1280;
  let forceServerOverride = false; // User can manually override the auto-disable
  
  const disableMobileServer = () => {
    const useServerCheckbox = document.getElementById('useServer');
    const serverUrlInput = document.getElementById('serverUrl');
    const forceServerLabel = document.getElementById('forceServerLabel');
    
    if(useServerCheckbox){
      useServerCheckbox.checked = false;
      useServerCheckbox.disabled = true;
      useServerCheckbox.style.cursor = 'not-allowed';
      useServerCheckbox.style.opacity = '0.6';
      useServerCheckbox.parentElement.style.opacity = '0.6';
      useServerCheckbox.parentElement.style.cursor = 'not-allowed';
      useServerCheckbox.parentElement.style.pointerEvents = 'none';
    }
    if(serverUrlInput){
      serverUrlInput.disabled = true;
      serverUrlInput.style.opacity = '0.5';
      serverUrlInput.style.cursor = 'not-allowed';
      serverUrlInput.style.backgroundColor = 'var(--border)';
    }
    // Show the override toggle
    if(forceServerLabel){
      forceServerLabel.style.display = 'block';
    }
  };
  
  const enableServerForce = () => {
    forceServerOverride = true;
    const useServerCheckbox = document.getElementById('useServer');
    const serverUrlInput = document.getElementById('serverUrl');
    
    if(useServerCheckbox){
      useServerCheckbox.disabled = false;
      useServerCheckbox.style.cursor = 'pointer';
      useServerCheckbox.style.opacity = '1';
      useServerCheckbox.parentElement.style.opacity = '1';
      useServerCheckbox.parentElement.style.cursor = 'pointer';
      useServerCheckbox.parentElement.style.pointerEvents = 'auto';
    }
    if(serverUrlInput){
      serverUrlInput.disabled = false;
      serverUrlInput.style.opacity = '1';
      serverUrlInput.style.cursor = 'text';
      serverUrlInput.style.backgroundColor = 'var(--card)';
    }
  };
  
  const disableServerForce = () => {
    forceServerOverride = false;
    const useServerCheckbox = document.getElementById('useServer');
    const serverUrlInput = document.getElementById('serverUrl');
    
    if(useServerCheckbox){
      useServerCheckbox.checked = false;
      useServerCheckbox.disabled = true;
      useServerCheckbox.style.cursor = 'not-allowed';
      useServerCheckbox.style.opacity = '0.6';
      useServerCheckbox.parentElement.style.opacity = '0.6';
      useServerCheckbox.parentElement.style.cursor = 'not-allowed';
      useServerCheckbox.parentElement.style.pointerEvents = 'none';
    }
    if(serverUrlInput){
      serverUrlInput.disabled = true;
      serverUrlInput.style.opacity = '0.5';
      serverUrlInput.style.cursor = 'not-allowed';
      serverUrlInput.style.backgroundColor = 'var(--border)';
    }
  };
  
  if(isMobile){
    // Disable server mode on mobile devices and tablets for better performance
    disableMobileServer();
    console.log('📱 Mobile/tablet device detected - Server mode disabled for performance. Use "Force Enable Server Mode" if needed.');
  }
  
  
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  // Image navigation with thumbnails
  function updateImageNavDisplay(){
    const nav = document.getElementById('imageNav');
    const info = document.getElementById('currentImageInfo');
    console.log('updateImageNavDisplay called, currentFiles.length:', currentFiles.length);
    if(currentFiles.length >= 1){
      nav.style.display = 'block';
      info.textContent = `${currentImageIndex + 1} of ${currentFiles.length} image${currentFiles.length === 1 ? '' : 's'}`;
      console.log('Showing nav panel with text:', info.textContent);
      generateThumbnails();
    } else {
      nav.style.display = 'none';
      console.log('Hiding nav panel');
    }
  }

  function generateThumbnails(){
    console.log('generateThumbnails called, currentFiles.length:', currentFiles.length);
    const container = document.getElementById('imageThumbnailContainer');
    console.log('Container found:', !!container);
    if(!container){
      console.error('imageThumbnailContainer not found!');
      return;
    }
    container.innerHTML = '';
    
    currentFiles.forEach((file, index) => {
      console.log('Creating thumbnail for:', file.name);
      const url = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      if(index === currentImageIndex) item.classList.add('active');
      
      const img = document.createElement('img');
      img.className = 'thumbnail-img';
      img.src = url;
      img.alt = file.name;
      
      const name = document.createElement('div');
      name.className = 'thumbnail-name';
      name.textContent = file.name;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'thumbnail-delete';
      deleteBtn.type = 'button';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete image';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteImage(index);
      });
      
      item.appendChild(img);
      item.appendChild(name);
      item.appendChild(deleteBtn);
      
      item.addEventListener('click', () => selectImage(index));
      container.appendChild(item);
    });
    console.log('Thumbnails generated, container has', container.children.length, 'children');
  }

  function deleteImage(index){
    currentFiles.splice(index, 1);
    
    // Check if this was the last image
    if(currentFiles.length === 0) {
      if(fileEl) fileEl.value = '';
      
      // Show notification about using Reset
      const notification = document.createElement('div');
      const isMobileScreen = window.innerWidth <= 768;
      const padding = isMobileScreen ? '20px 30px' : '30px 40px';
      const fontSize = isMobileScreen ? '16px' : '18px';
      const maxWidth = isMobileScreen ? '90vw' : '500px';
      notification.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #3b82f6; color: white; padding: ${padding}; border-radius: 12px; font-size: ${fontSize}; z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,0.3); text-align: center; max-width: ${maxWidth};`;
      notification.textContent = 'Last image deleted. Click "Reset" button to start fresh.';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 5000);
      return; // Exit early, don't process cleanup
    }
    
    // Normal deletion flow (not the last image)
    if(currentImageIndex >= currentFiles.length) currentImageIndex = Math.max(0, currentFiles.length - 1);
    panOffsetX = 0;
    panOffsetY = 0;
    zoomLevel = 1.0;
    currentRenderedImage = null;
    updateFileInfo();
    updateImageNavDisplay();
    loadImageFromFile(currentFiles[currentImageIndex]).then(img=>{ singleImage = img; drawPreview(); }).catch(err=>console.error('Failed to load image', err));
  }

  function selectImage(index){
    currentImageIndex = index;
    panOffsetX = 0; // Reset pan on image selection
    panOffsetY = 0;
    zoomLevel = 1.0; // Reset zoom on image selection
    currentRenderedImage = null; // Clear stored rendered image
    loadImageFromFile(currentFiles[currentImageIndex]).then(img=>{ 
      singleImage = img; 
      drawPreview(); 
      updateImageNavDisplay();
      
      // If OpenCV rendering is enabled, immediately render with server
      if(renderingEngine === 'opencv'){
        renderCurrentImageWithOpenCV();
      }
    }).catch(err=>console.error('Failed to load image', err));
  }

  // helper RNG
  function getSeed(){ return 0; }
  function mulberry32(a){return function(){ var t = a += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t | 1); t ^= t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14) >>> 0) / 4294967296; }}

  // undo/redo system
  function captureState(){
    return {
      artStyle: document.getElementById('artStyle').value,
      style: document.getElementById('style').value,
      resolution: document.getElementById('resolution').value,
      aspect: document.getElementById('aspect').value,
      intensity: document.getElementById('intensity').value,
      stroke: document.getElementById('stroke').value,
      smoothing: document.getElementById('smoothing').value,
      brush: document.getElementById('brush').value,
      useWebGL: document.getElementById('useWebGL').checked,
      useServer: document.getElementById('useServer').checked,
      serverUrl: document.getElementById('serverUrl').value,
      outputName: document.getElementById('outputName').value,
      skipHatching: document.getElementById('skipHatching').checked,
      contrast: document.getElementById('contrast').value,
      saturation: document.getElementById('saturation').value,
      hueShift: document.getElementById('hueShift').value,
      colorize: document.getElementById('colorize').checked,
      textureType: document.getElementById('textureType').value,
      textureOpacity: document.getElementById('textureOpacity').value
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

  // Clipboard paste: Ctrl+V to load an image directly from clipboard
  document.addEventListener('paste', e=>{
    const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if(!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if(!file) return;
    currentFiles = [file];
    currentImageIndex = 0;
    panOffsetX = 0; panOffsetY = 0;
    zoomLevel = 1.0;
    currentRenderedImage = null;
    updateZoomDisplay();
    enableControls();
    loadImageFromFile(file).then(img=>{
      singleImage = img;
      drawPreview();
      updateImageNavDisplay();
    }).catch(err=>console.error('Paste failed:', err));
    updateFileInfo();
  });

  // initialize output name placeholder with current timestamp
  updateOutputNamePlaceholder();

  // initialize preset list from localStorage
  refreshPresetList();

  // Rendering Engine Toggle Logic
  function updateRenderingEngineToggle(){
    const useServer = document.getElementById('useServer').checked;
    const serverUrl = document.getElementById('serverUrl').value.trim();
    const renderingSwitch = document.getElementById('renderingEngineSwitch');
    const opencvLabel = document.getElementById('opencvLabel');
    
    // Enable OpenCV only if: server is checked AND URL is provided AND (not on mobile OR force override enabled)
    const canUseOpenCV = useServer && serverUrl.length > 0 && (!isMobile || forceServerOverride);
    renderingSwitch.style.opacity = canUseOpenCV ? '1' : '0.5';
    renderingSwitch.style.pointerEvents = canUseOpenCV ? 'auto' : 'none';
    opencvLabel.style.opacity = canUseOpenCV ? '1' : '0.6';
    
    // If OpenCV becomes disabled and currently selected, switch back to Canvas
    if(!canUseOpenCV && renderingEngine === 'opencv'){
      renderingEngine = 'canvas';
      updateSwitchUI();
      currentRenderedImage = null;
      if(currentFiles.length) drawPreview();
    }
  }
  
  // Styles available in both canvas and server
  const serverStyles = ['stippling', 'charcoal', 'drybrush', 'inkwash', 'comic', 'fashion', 'urban', 'architectural', 'academic', 'etching', 'minimalist', 'glitch', 'mixedmedia', 'contour', 'blindcontour', 'gesture', 'cartoon', 'hatching', 'crosshatching', 'tonalpencil'];
  
  // Canvas-only styles (not available in server)
  const canvasOnlyStyles = ['lineart', 'crosscontour', 'scribble', 'photorealism', 'graphiteportrait', 'oilpainting', 'watercolor'];
  
  // Update style menu based on rendering engine
  function updateStyleMenu(){
    const styleSelect = document.getElementById('style');
    const options = styleSelect.querySelectorAll('option');
    const currentStyle = styleSelect.value;
    
    options.forEach(option => {
      const styleValue = option.value;
      const isCanvasOnly = canvasOnlyStyles.includes(styleValue);
      
      if(renderingEngine === 'opencv'){
        // Hide canvas-only styles in OpenCV mode
        option.style.display = isCanvasOnly ? 'none' : 'block';
        option.disabled = isCanvasOnly;
      } else {
        // Show all styles in Canvas mode
        option.style.display = 'block';
        option.disabled = false;
      }
    });
    
    // If current style is canvas-only and we switched to OpenCV, switch to a server style
    if(renderingEngine === 'opencv' && canvasOnlyStyles.includes(currentStyle)){
      styleSelect.value = 'stippling';
      if(currentFiles.length) drawPreview();
    }
  }
  
  function switchRenderingEngine(engine){
    if(engine === 'opencv'){
      // Block OpenCV on mobile devices unless force override is enabled
      if(isMobile && !forceServerOverride){
        alert('Server rendering is not available on mobile devices. Using browser rendering for better performance.');
        renderingEngine = 'canvas';
        updateSwitchUI();
        return;
      }
      const useServer = document.getElementById('useServer').checked;
      const serverUrl = document.getElementById('serverUrl').value.trim();
      if(!useServer || !serverUrl){
        alert('Server must be enabled with a valid URL to use OpenCV rendering.');
        return;
      }
      renderingEngine = 'opencv';
      updateStyleMenu();
      
      // If we have an image loaded, immediately render it with OpenCV
      if(currentFiles.length && singleImage){
        renderCurrentImageWithOpenCV();
      }
    } else {
      renderingEngine = 'canvas';
      updateStyleMenu();
      currentRenderedImage = null;
      if(currentFiles.length) drawPreview();
    }
  }
  
  async function renderCurrentImageWithOpenCV(){
    if(!singleImage || renderingEngine !== 'opencv') return;
    try{
      // Show progress percentage overlay
      const progressPercent = document.getElementById('progressPercent');
      if(progressPercent){
        progressPercent.style.display = 'block';
        progressPercent.style.opacity = '1';
      }
      
      const startTime = Date.now();
      
      // Simulate progress animation with percentage updates
      let progress = 5;
      let processingComplete = false;
      
      const progressInterval = setInterval(() => {
        if(!processingComplete){
          progress = Math.min(progress + Math.random() * 25, 85);
          if(progressPercent){
            progressPercent.textContent = Math.round(progress) + '%';
          }
        }
      }, 100);
      
      const blob = await processFile(currentFiles[currentImageIndex], currentImageIndex, currentFiles.length);
      processingComplete = true;
      clearInterval(progressInterval);
      
      if(progressPercent) progressPercent.textContent = '100%';
      
      const renderedImg = await loadImageFromFile(new File([blob], 'render.png'));
      
      currentRenderedImage = renderedImg;
      if(currentFiles.length) drawPreview();
      
      // Keep progress visible for at least 800ms before hiding
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 800 - elapsedTime);
      
      setTimeout(() => {
        if(progressPercent){
          progressPercent.style.opacity = '0';
          setTimeout(() => {
            progressPercent.style.display = 'none';
            progressPercent.textContent = '0%';
          }, 200);
        }
      }, remainingTime);
    }catch(err){
      console.error('OpenCV render failed:', err);
      const progressPercent = document.getElementById('progressPercent');
      if(progressPercent){
        progressPercent.style.opacity = '0';
        setTimeout(() => {
          progressPercent.style.display = 'none';
        }, 200);
      }
    }
  }
  
  // Attach listeners to rendering engine switch
  const renderingSwitch = document.getElementById('renderingEngineSwitch');
  const canvasLabel = document.getElementById('canvasLabel');
  const opencvLabel = document.getElementById('opencvLabel');
  const renderingEngineInput = document.getElementById('renderingEngineInput');
  
  function updateSwitchUI(){
    if(renderingEngine === 'canvas'){
      renderingEngineInput.checked = false;
      canvasLabel.style.background = '#10b981';
      canvasLabel.style.color = 'white';
      opencvLabel.style.background = 'transparent';
      opencvLabel.style.color = 'var(--muted)';
    } else {
      renderingEngineInput.checked = true;
      canvasLabel.style.background = 'transparent';
      canvasLabel.style.color = 'var(--muted)';
      opencvLabel.style.background = '#10b981';
      opencvLabel.style.color = 'white';
    }
  }
  
  renderingSwitch.addEventListener('click', ()=>{
    if(renderingEngine === 'canvas'){
      switchRenderingEngine('opencv');
    } else {
      switchRenderingEngine('canvas');
    }
    updateSwitchUI();
    updateStyleMenu();
  });
  
  // Listen to server checkbox and URL changes to update toggle availability
  document.getElementById('useServer').addEventListener('change', updateRenderingEngineToggle);
  document.getElementById('serverUrl').addEventListener('change', updateRenderingEngineToggle);
  document.getElementById('serverUrl').addEventListener('input', updateRenderingEngineToggle);
  
  // Prevent server checkbox from being checked on mobile (unless force enabled)
  if(isMobile){
    document.getElementById('useServer').addEventListener('change', (e) => {
      if(e.target.checked && !forceServerOverride){
        e.target.checked = false;
        alert('Server rendering is not available on mobile devices. Using browser rendering for better performance.');
      }
    });
  }
  
  // Force enable server mode toggle
  const forceServerToggle = document.getElementById('forceServer');
  if(forceServerToggle){
    forceServerToggle.addEventListener('change', (e) => {
      if(e.target.checked){
        console.log('⚡ Force enabling server mode - user override active');
        enableServerForce();
      } else {
        console.log('📱 Re-disabling server mode - returning to safe defaults');
        disableServerForce();
        updateRenderingEngineToggle();
      }
    });
  }
  
  // Initialize the switch state
  updateRenderingEngineToggle();
  updateSwitchUI();
  updateStyleMenu();
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
  document.getElementById('aspect').addEventListener('change', ()=>{ 
    pushUndo(); 
    currentRenderedImage = null;
    if(renderingEngine === 'opencv' && currentFiles.length){
      renderCurrentImageWithOpenCV();
    } else if(currentFiles.length){
      drawPreview();
    }
  });
  document.getElementById('resolution').addEventListener('change', ()=>{ 
    pushUndo(); 
    currentRenderedImage = null;
    if(renderingEngine === 'opencv' && currentFiles.length){
      renderCurrentImageWithOpenCV();
    } else if(currentFiles.length){
      drawPreview();
    }
    // Show 4K warning if 4096 selected
    const resolution = document.getElementById('resolution').value;
    const warning = document.getElementById('4k-warning');
    if(resolution === '4096') {
      warning.style.display = 'block';
    } else {
      warning.style.display = 'none';
    }
  });
  // Generic state capture for control changes
  ['artStyle','style','intensity','stroke','smoothing','brush','outputName','skipHatching','useWebGL','colorize','invert','textureType'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', ()=>{ pushUndo(); if(currentFiles.length) drawPreview(); });
  });

  // Real-time slider updates without undo/redo on every drag
  ['intensity','stroke','smoothing','contrast','saturation','hueShift','textureOpacity'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', ()=>{ if(currentFiles.length) drawPreview(); });
  });

  // Zoom controls for rendered preview
  document.getElementById('zoomIn').addEventListener('click', ()=>{
    zoomLevel = Math.min(zoomLevel + 0.2, 3.0);
    updateZoomDisplay();
    if(currentFiles.length) drawPreview();
  });
  document.getElementById('zoomOut').addEventListener('click', ()=>{
    zoomLevel = Math.max(zoomLevel - 0.2, 0.2);
    updateZoomDisplay();
    if(currentFiles.length) drawPreview();
  });
  document.getElementById('zoomReset').addEventListener('click', ()=>{
    zoomLevel = 1.0;
    panOffsetX = 0; // Also reset pan when resetting zoom
    panOffsetY = 0;
    updateZoomDisplay();
    if(currentFiles.length) drawPreview();
  });

  function updateZoomDisplay(){
    document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
  }

  // Before/After comparison slider
  const compareToggleBtn = document.getElementById('compareToggle');
  const compareCanvasEl = document.getElementById('compareCanvas');
  const compareHandleEl = document.getElementById('compareHandle');

  if(compareToggleBtn){
    compareToggleBtn.addEventListener('click', ()=>{
      compareMode = !compareMode;
      compareToggleBtn.style.background = compareMode ? '#7c3aed' : '#6b7280';
      compareToggleBtn.textContent = compareMode ? 'Exit Compare' : 'Compare';
      if(compareCanvasEl) compareCanvasEl.style.display = compareMode ? 'block' : 'none';
      if(compareHandleEl) compareHandleEl.style.display = compareMode ? 'block' : 'none';
      if(compareMode) drawCompareOverlay();
    });
  }

  if(compareHandleEl){
    compareHandleEl.addEventListener('mousedown', e=>{ isDraggingCompare = true; e.preventDefault(); });
    compareHandleEl.addEventListener('touchstart', e=>{ isDraggingCompare = true; e.preventDefault(); }, {passive: false});
  }

  document.addEventListener('mousemove', e=>{
    if(!isDraggingCompare) return;
    const container = document.getElementById('previewContainer');
    if(!container) return;
    const rect = container.getBoundingClientRect();
    comparePos = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    drawCompareOverlay();
  });
  document.addEventListener('mouseup', ()=>{ isDraggingCompare = false; });

  document.addEventListener('touchmove', e=>{
    if(!isDraggingCompare) return;
    const container = document.getElementById('previewContainer');
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const touch = e.touches[0];
    comparePos = Math.max(0.05, Math.min(0.95, (touch.clientX - rect.left) / rect.width));
    drawCompareOverlay();
  }, {passive: true});
  document.addEventListener('touchend', ()=>{ isDraggingCompare = false; });

  // Helper: Clear stored rendered image and re-preview when parameters change
  function clearAndRedraw(){
    // If in OpenCV mode, re-render immediately
    if(renderingEngine === 'opencv'){
      renderCurrentImageWithOpenCV();
    } else {
      // Canvas mode: clear stored image and redraw preview
      currentRenderedImage = null;
      if(currentFiles.length && singleImage) drawPreview();
    }
  }

  // Add change listeners to all parameter controls to enable live preview
  const parameterControls = [
    'artStyle', 'style', 'brush', 'intensity', 'stroke', 'smoothing',
    'skipHatching', 'colorize', 'invert', 'contrast', 'saturation', 'hueShift',
    'resolution', 'aspect', 'useWebGL'
  ];

  parameterControls.forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('change', clearAndRedraw);
      el.addEventListener('input', clearAndRedraw); // Also on input for range sliders
    }
  });

  // Pan/drag functionality for image positioning
  preview.addEventListener('mousedown', (e) => {
    if(!singleImage) return;
    isPanning = true;
    panStartX = e.clientX - panOffsetX;
    panStartY = e.clientY - panOffsetY;
    preview.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if(!isPanning) return;
    panOffsetX = e.clientX - panStartX;
    panOffsetY = e.clientY - panStartY;
    if(currentFiles.length) drawPreview();
  });

  document.addEventListener('mouseup', () => {
    isPanning = false;
    preview.style.cursor = singleImage ? 'grab' : 'default';
  });

  preview.addEventListener('mouseenter', () => {
    if(!isPanning && singleImage) preview.style.cursor = 'grab';
  });

  preview.addEventListener('mouseleave', () => {
    preview.style.cursor = 'default';
  });

  // Touch support for mobile/tablet panning
  preview.addEventListener('touchstart', (e) => {
    if(!singleImage) return;
    e.preventDefault();
    isPanning = true;
    const touch = e.touches[0];
    panStartX = touch.clientX - panOffsetX;
    panStartY = touch.clientY - panOffsetY;
  });

  document.addEventListener('touchmove', (e) => {
    if(!isPanning) return;
    e.preventDefault();
    const touch = e.touches[0];
    panOffsetX = touch.clientX - panStartX;
    panOffsetY = touch.clientY - panStartY;
    if(currentFiles.length) drawPreview();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    isPanning = false;
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

  // Download SVG (via imagetracerjs CDN, lazy-loaded)
  document.getElementById('downloadSvg').addEventListener('click', async () => {
    if (!hasCanvasContent()) {
      showErrorMessage('No image loaded. Please load an image and click Generate first.');
      return;
    }
    const btn = document.getElementById('downloadSvg');
    btn.disabled = true;
    btn.textContent = 'Vectorizing…';
    try {
      await loadImageTracer();
      const ctx = preview.getContext('2d');
      const imgData = ctx.getImageData(0, 0, preview.width, preview.height);
      const svgStr = ImageTracer.imagedataToSVG(imgData, {
        ltres: 1, qtres: 1, pathomit: 4,
        colorsampling: 2, numberofcolors: 4,
        scale: 1, linefilter: false,
      });
      const blob = new Blob([svgStr], {type: 'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = document.getElementById('outputName').value.trim() || getDefaultFilename();
      a.href = url; a.download = name + '.svg';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(err) {
      showErrorMessage('SVG export failed. Check your internet connection for the first use.');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download SVG';
    }
  });

  // Animate (WebM pixel-dissolve reveal via MediaRecorder)
  document.getElementById('animateBtn').addEventListener('click', async () => {
    if (!hasCanvasContent()) {
      showErrorMessage('No image loaded. Please load an image and click Generate first.');
      return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      showErrorMessage('Animation export requires Chrome, Firefox, or Edge.');
      return;
    }
    const btn = document.getElementById('animateBtn');
    btn.disabled = true;
    btn.textContent = 'Recording…';
    let recorder;
    let recordingSuccessful = false;
    try {
      const w = preview.width, h = preview.height;
      const duration = parseInt(document.getElementById('animDuration').value, 10);
      const sketchImg = new Image();
      await new Promise(r => { sketchImg.onload = r; sketchImg.src = preview.toDataURL('image/png'); });
      const pCtx = preview.getContext('2d');
      const px = pCtx.getImageData(0, 0, 1, 1).data;
      const bgColor = `rgb(${px[0]},${px[1]},${px[2]})`;
      const animCanvas = document.createElement('canvas');
      animCanvas.width = w; animCanvas.height = h;
      const animCtx = animCanvas.getContext('2d');
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      const stream = animCanvas.captureStream(30);
      recorder = new MediaRecorder(stream, {mimeType});
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        if (recordingSuccessful) {
          const blob = new Blob(chunks, {type: 'video/webm'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const name = document.getElementById('outputName').value.trim() || getDefaultFilename();
          a.href = url; a.download = name + '-animation.webm';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }
        btn.disabled = false;
        btn.textContent = 'Animate (WebM)';
      };
      // Draw background before starting recorder so first captured frame is not blank
      animCtx.fillStyle = bgColor;
      animCtx.fillRect(0, 0, w, h);
      recorder.start();
      const fps = 30;
      const frameCount = Math.round(duration / 1000 * fps);
      const frameDelay = Math.round(1000 / fps);
      // Pixel-dissolve reveal: shuffle 8px blocks and reveal in random order
      const blockSize = 8;
      const cols = Math.ceil(w / blockSize);
      const rows = Math.ceil(h / blockSize);
      const totalBlocks = cols * rows;
      const order = Array.from({length: totalBlocks}, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const blocksPerFrame = Math.ceil(totalBlocks / frameCount);
      let revealed = 0;
      for (let frame = 0; frame < frameCount; frame++) {
        const end = Math.min(revealed + blocksPerFrame, totalBlocks);
        for (let k = revealed; k < end; k++) {
          const bx = (order[k] % cols) * blockSize;
          const by = Math.floor(order[k] / cols) * blockSize;
          const bw = Math.min(blockSize, w - bx);
          const bh = Math.min(blockSize, h - by);
          animCtx.drawImage(sketchImg, bx, by, bw, bh, bx, by, bw, bh);
        }
        revealed = end;
        await new Promise(r => setTimeout(r, frameDelay));
      }
      recordingSuccessful = true;
      await new Promise(r => setTimeout(r, 400));
      recorder.stop();
    } catch(err) {
      showErrorMessage('Animation export failed.');
      console.error(err);
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch(_) {}
      btn.disabled = false;
      btn.textContent = 'Animate (WebM)';
    }
  });

  // Style Grid button
  document.getElementById('styleGridBtn').addEventListener('click', openStyleGrid);

  // Close modal-grid on outside click (close button handled by existing querySelectorAll('.modal-close'))
  document.getElementById('modal-grid').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // ── Webcam Capture ──────────────────────────────────────────────────────────
  let webcamStream = null;

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
    }
    const video = document.getElementById('webcamVideo');
    video.srcObject = null;
  }

  async function openWebcam() {
    const modal   = document.getElementById('modal-webcam');
    const video   = document.getElementById('webcamVideo');
    const canvas  = document.getElementById('webcamCanvas');
    const btnCap  = document.getElementById('webcamCapture');
    const btnRet  = document.getElementById('webcamRetake');
    const btnUse  = document.getElementById('webcamUse');

    // Reset to live-video state
    video.style.display  = 'block';
    canvas.style.display = 'none';
    btnCap.style.display = 'inline-block';
    btnRet.style.display = 'none';
    btnUse.style.display = 'none';

    modal.style.display = 'flex';

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = webcamStream;
    } catch (err) {
      modal.style.display = 'none';
      showErrorMessage('Webcam access denied or not available. Please allow camera access in your browser.');
      console.error('Webcam error:', err);
    }
  }

  document.getElementById('webcamBtn').addEventListener('click', openWebcam);

  // Close webcam modal — stop stream, reset UI
  document.getElementById('modal-webcam').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      stopWebcam();
      e.currentTarget.style.display = 'none';
    }
  });

  // The existing querySelectorAll('.modal-close') handler fires for the ✕ button,
  // but we also need to stop the stream when that button is clicked.
  document.querySelector('#modal-webcam .modal-close').addEventListener('click', () => {
    stopWebcam();
  });

  // Capture: freeze frame onto canvas
  document.getElementById('webcamCapture').addEventListener('click', () => {
    const video  = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    video.style.display  = 'none';
    canvas.style.display = 'block';
    document.getElementById('webcamCapture').style.display = 'none';
    document.getElementById('webcamRetake').style.display  = 'inline-block';
    document.getElementById('webcamUse').style.display     = 'inline-block';
  });

  // Retake: go back to live feed
  document.getElementById('webcamRetake').addEventListener('click', () => {
    const video  = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    video.style.display  = 'block';
    canvas.style.display = 'none';
    document.getElementById('webcamCapture').style.display = 'inline-block';
    document.getElementById('webcamRetake').style.display  = 'none';
    document.getElementById('webcamUse').style.display     = 'none';
  });

  // Use Photo: convert canvas snapshot → File → load exactly like clipboard paste
  document.getElementById('webcamUse').addEventListener('click', () => {
    const canvas = document.getElementById('webcamCanvas');
    canvas.toBlob(blob => {
      if (!blob) { showErrorMessage('Failed to capture image from webcam.'); return; }
      const file = new File([blob], 'webcam.png', { type: 'image/png' });
      stopWebcam();
      document.getElementById('modal-webcam').style.display = 'none';
      currentFiles = [file];
      currentImageIndex = 0;
      panOffsetX = 0; panOffsetY = 0;
      zoomLevel = 1.0;
      currentRenderedImage = null;
      updateZoomDisplay();
      enableControls();
      loadImageFromFile(file).then(img => {
        singleImage = img;
        drawPreview();
        updateImageNavDisplay();
      }).catch(err => console.error('Webcam load failed:', err));
      updateFileInfo();
    }, 'image/png');
  });

  // Stop stream if user closes modal via Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-webcam').style.display !== 'none') {
      stopWebcam();
    }
  }, { capture: false });

  // Reset button
  document.getElementById('resetAll').addEventListener('click', () => {
    console.log('Reset button clicked');
    
    // Clear images and canvases FIRST
    currentFiles = [];
    currentImageIndex = 0;
    singleImage = null;
    lastResults = [];
    undoStack.length = 0;
    redoStack.length = 0;
    currentRenderedImage = null; // Clear stored rendered image
    panOffsetX = 0; // Reset pan
    panOffsetY = 0;
    zoomLevel = 1.0; // Reset zoom
    
    // Clear file input
    if(fileEl){
      fileEl.value = '';
    }
    
    // Show placeholders and hide canvases
    const originalPlaceholder = document.getElementById('originalPlaceholder');
    const renderedPlaceholder = document.getElementById('renderedPlaceholder');
    if(originalPlaceholder) originalPlaceholder.style.display = 'block';
    if(renderedPlaceholder) renderedPlaceholder.style.display = 'block';
    if(original) original.style.display = 'none';
    if(preview) preview.style.display = 'none';
    
    // Explicitly clear and reset canvases
    if(preview){
      const ctx = preview.getContext('2d');
      // Set canvas to default size
      const res = parseInt(document.getElementById('resolution').value || '1024', 10);
      const aspect = document.getElementById('aspect').value || '1:1';
      const [cw, ch] = aspectToWH(aspect, res);
      preview.width = cw;
      preview.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      console.log('Cleared preview canvas');
    }
    
    if(original){
      const octx = original.getContext('2d');
      const res = parseInt(document.getElementById('resolution').value || '1024', 10);
      const aspect = document.getElementById('aspect').value || '1:1';
      const [cw, ch] = aspectToWH(aspect, res);
      original.width = cw;
      original.height = ch;
      octx.clearRect(0, 0, cw, ch);
      console.log('Cleared original canvas');
    }
    
    // Update nav display
    if(typeof updateImageNavDisplay === 'function'){
      updateImageNavDisplay();
    }
    
    // Set all controls to their default values
    document.getElementById('artStyle').value = 'pencil';
    document.getElementById('style').value = 'contour';
    document.getElementById('brush').value = 'line';
    document.getElementById('intensity').value = 6;
    document.getElementById('stroke').value = 3;
    document.getElementById('smoothing').value = 0;
    document.getElementById('skipHatching').checked = true;
    document.getElementById('colorize').checked = false;
    document.getElementById('invert').checked = false;
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
    updateZoomDisplay();
    
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
    console.log('File input changed');
    const newFiles = Array.from(e.target.files || []);
    console.log('New files selected:', newFiles.length);
    
    // If a file was already selected, append to the queue. Otherwise, start fresh.
    if(currentFiles.length === 0 && newFiles.length > 0) {
      console.log('Starting fresh with', newFiles.length, 'files');
      currentFiles = newFiles;
      currentImageIndex = 0;
      panOffsetX = 0;
      panOffsetY = 0;
      zoomLevel = 1.0;
      currentRenderedImage = null;
      updateZoomDisplay();
      // Load the first image
      enableControls();
      loadImageFromFile(currentFiles[0]).then(img=>{
        singleImage = img;
        drawPreview();
        console.log('First image loaded, calling updateImageNavDisplay');
        updateImageNavDisplay();
      }).catch(err=>console.error('Failed to load first image', err));
    } else if(newFiles.length > 0) {
      // Append new files to existing queue
      console.log('Appending', newFiles.length, 'files to existing queue');
      currentFiles = currentFiles.concat(newFiles);
      // Refresh the thumbnail panel immediately
      updateImageNavDisplay();
      // Don't change currentImageIndex - stay on current image
      // Don't reset zoom/pan - let user continue working
    }
    
    updateFileInfo();
  });

  // Test Server button (posts demo image served by static server)
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
    const useMLEl = document.getElementById('useML');
    const mlUrlEl = document.getElementById('mlUrl');
    const useML = useMLEl ? useMLEl.checked : false;
    const mlUrl = mlUrlEl ? mlUrlEl.value.trim() : '';
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
      fd.append('smoothing', document.getElementById('smoothing').value);
      fd.append('skipHatching', document.getElementById('skipHatching').checked);
      fd.append('colorize', document.getElementById('colorize').checked);
      fd.append('invert', document.getElementById('invert').checked);
      fd.append('contrast', document.getElementById('contrast').value);
      fd.append('saturation', document.getElementById('saturation').value);
      fd.append('hueShift', document.getElementById('hueShift').value);
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
      const resolution = document.getElementById('resolution').value;
      const aspect = document.getElementById('aspect').value;
      console.log('Using server:', serverUrl);
      const fd = new FormData(); fd.append('file', file);
      fd.append('artStyle', document.getElementById('artStyle').value);
      fd.append('style', document.getElementById('style').value);
      fd.append('brush', document.getElementById('brush').value);
      fd.append('seed', getSeed());
      fd.append('intensity', document.getElementById('intensity').value);
      fd.append('stroke', document.getElementById('stroke').value);
      fd.append('smoothing', document.getElementById('smoothing').value);
      fd.append('skipHatching', document.getElementById('skipHatching').checked);
      fd.append('colorize', document.getElementById('colorize').checked);
      fd.append('invert', document.getElementById('invert').checked);
      fd.append('contrast', document.getElementById('contrast').value);
      fd.append('saturation', document.getElementById('saturation').value);
      fd.append('hueShift', document.getElementById('hueShift').value);
      fd.append('resolution', resolution);
      fd.append('aspect', aspect);
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
    if(!lastResults.length){ showErrorMessage('Please generate sketches first to download the ZIP file.'); return; }
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

  // Draw original image clipped to the left portion of the compare overlay canvas
  function drawCompareOverlay(){
    const cc = document.getElementById('compareCanvas');
    const ch = document.getElementById('compareHandle');
    if(!compareMode || !singleImage || !cc) return;
    const cw = preview.width, cheight = preview.height;
    cc.width = cw; cc.height = cheight;
    const ctx2 = cc.getContext('2d');
    ctx2.clearRect(0, 0, cw, cheight);
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, 0, comparePos * cw, cheight);
    ctx2.clip();
    const fit = fitCropRect(singleImage.width, singleImage.height, cw, cheight);
    ctx2.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, cw, cheight);
    ctx2.restore();
    // Draw divider line
    ctx2.fillStyle = 'rgba(255,255,255,0.9)';
    ctx2.fillRect(Math.floor(comparePos * cw) - 1, 0, 3, cheight);
    // Position handle
    if(ch) ch.style.left = (comparePos * 100) + '%';
  }

  // Generate and cache a procedural texture canvas for a given type and size
  function generateTexture(type, w, h){
    const key = type + '_' + w + '_' + h;
    if(textureCache[key]) return textureCache[key];
    const tc = document.createElement('canvas');
    tc.width = w; tc.height = h;
    const tctx = tc.getContext('2d');
    const imgData = tctx.createImageData(w, h);
    const d = imgData.data;
    for(let i = 0; i < d.length; i += 4){
      const px = (i / 4) % w;
      const py = Math.floor(i / 4 / w);
      let v;
      if(type === 'paper'){
        v = 200 + Math.floor(Math.random() * 55);
      } else if(type === 'rough'){
        v = 160 + Math.floor(Math.random() * 95);
      } else if(type === 'film'){
        v = 100 + Math.floor(Math.random() * 155);
      } else { // canvas weave
        v = ((px % 4 < 2) === (py % 4 < 2)) ? 220 : 180;
        v += Math.floor(Math.random() * 20) - 10;
        v = Math.max(0, Math.min(255, v));
      }
      d[i] = d[i+1] = d[i+2] = v;
      d[i+3] = 255;
    }
    tctx.putImageData(imgData, 0, 0);
    textureCache[key] = tc;
    return tc;
  }

  // Overlay a paper/canvas/grain texture on ctx using multiply blending
  function applyTextureOverlay(ctx, w, h){
    const typeEl = document.getElementById('textureType');
    const opacityEl = document.getElementById('textureOpacity');
    if(!typeEl || !opacityEl) return;
    const type = typeEl.value;
    const opacity = parseFloat(opacityEl.value) / 10;
    if(type === 'none' || opacity === 0) return;
    const tc = generateTexture(type, w, h);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(tc, 0, 0, w, h);
    ctx.restore();
  }

  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file); const im = new Image(); im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im); }; im.onerror = reject; im.src = url; });
  }

  // utilities
  function fitCropRect(iw, ih, cw, ch){ const ir = iw/ih, cr = cw/ch; if(ir>cr){ const sw = ih*cr; return {sx: Math.round((iw-sw)/2), sy:0, sw, sh: ih}; } else { const sh = iw/cr; return {sx:0, sy: Math.round((ih-sh)/2), sw: iw, sh}; } }
  function aspectToWH(aspect, base){ const [w,h] = aspect.split(':').map(Number); const ratio = w/h; let width = base; let height = Math.round(base/ratio); if(ratio<1){ height = base; width = Math.round(base*ratio); } return [width,height]; }

  // real-time preview: applies sketch transforms to loaded image
  function drawPreview(){
    if(!singleImage) return;
    
    // Hide placeholders and show canvases when drawing
    const originalPlaceholder = document.getElementById('originalPlaceholder');
    const renderedPlaceholder = document.getElementById('renderedPlaceholder');
    if(originalPlaceholder) originalPlaceholder.style.display = 'none';
    if(renderedPlaceholder) renderedPlaceholder.style.display = 'none';
    original.style.display = 'block';
    preview.style.display = 'block';
    
    const res = parseInt(document.getElementById('resolution').value,10);
    const aspect = document.getElementById('aspect').value;
    const [reqW, reqH] = aspectToWH(aspect, res);
    
    // Limit canvas internal size to 1024px max per dimension to avoid rendering artifacts
    // CSS will scale it to fill the container; the resolution param only affects download size
    const maxCanvasSize = 1024;
    const scale = Math.max(reqW, reqH) > maxCanvasSize ? maxCanvasSize / Math.max(reqW, reqH) : 1;
    const canvasW = Math.round(reqW * scale);
    const canvasH = Math.round(reqH * scale);
    
    // Set both canvases to bounded dimensions
    original.width = canvasW; original.height = canvasH;
    preview.width = canvasW; preview.height = canvasH;
    
    // Draw original image to original canvas
    const octx = original.getContext('2d');
    octx.clearRect(0, 0, canvasW, canvasH);
    
    // If we have a stored rendered image (from server or canvas), use that with zoom/pan
    if(currentRenderedImage){
      const ctx = preview.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);
      
      // Draw original for original canvas
      const iw = singleImage.width, ih = singleImage.height;
      const ir = iw/ih, cr = canvasW/canvasH;
      let sx=0, sy=0, sw=iw, sh=ih;
      if(ir>cr){ sw = ih * cr; sx = Math.round((iw-sw)/2); }
      else { sh = iw / cr; sy = Math.round((ih-sh)/2); }
      octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
      
      // Draw stored rendered image with zoom/pan applied using canvas transforms
      ctx.save();
      ctx.translate(panOffsetX, panOffsetY);
      ctx.scale(zoomLevel, zoomLevel);
      ctx.drawImage(currentRenderedImage, 0, 0);
      ctx.restore();
      applyTextureOverlay(ctx, canvasW, canvasH);
      drawCompareOverlay();
      return;
    }
    
    // Original flow for drawing from scratch (no stored rendered image)
    const iw = singleImage.width, ih = singleImage.height;
    const ir = iw/ih, cr = canvasW/canvasH;
    let sx=0, sy=0, sw=iw, sh=ih;
    if(ir>cr){ 
      sw = ih * cr; sx = Math.round((iw-sw)/2);
    } else { 
      sh = iw / cr; sy = Math.round((ih-sh)/2);
    }
    
    // Draw original image
    octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    
    // Draw and process to preview canvas
    const ctx = preview.getContext('2d');
    ctx.clearRect(0,0,canvasW,canvasH);
    ctx.drawImage(singleImage, sx, sy, sw, sh, panOffsetX, panOffsetY, canvasW, canvasH);
    
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
      case 'contour': renderContour(ctx, w, h, edges, gray, intensity, stroke); break;
      case 'blindcontour': renderBlindContour(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'gesture': renderGesture(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'lineart': renderLineArt(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'crosscontour': renderCrossContour(ctx, w, h, edges, gray, intensity, stroke); break;
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
      case 'minimalist': renderMinimalist(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'cartoon': renderCartoon(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'glitch': renderGlitch(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'mixedmedia': renderMixedMedia(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'photorealism': renderPhotorealism(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'graphiteportrait': renderGraphitePortrait(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'oilpainting': renderOilPainting(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      case 'watercolor': renderWatercolor(ctx, w, h, edges, gray, intensity, stroke, rand); break;
      default: renderDefault(ctx, w, h, edges, gray, intensity, stroke, rand); break;
    }

    // Apply Medium (artStyle) effects - includes line thickening and shading
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

    // Apply invert shading if enabled (LAST - after all other effects)
    const invert = document.getElementById('invert').checked;
    if(invert){
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for(let i=0; i<d.length; i+=4){
        d[i] = 255 - d[i];       // invert R
        d[i+1] = 255 - d[i+1];   // invert G
        d[i+2] = 255 - d[i+2];   // invert B
        // Don't invert alpha (transparency)
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Apply smoothing to soften edges and hatching
    const smoothing = parseFloat(document.getElementById('smoothing').value);
    if(smoothing > 0){
      applySmoothing(ctx, w, h, smoothing);
    }

    // Apply zoom scaling to preview canvas
    applyZoomTransform(ctx, w, h);
    applyTextureOverlay(ctx, w, h);
    drawCompareOverlay();
  }

  function applySmoothing(ctx, w, h, smoothing){
    const radius = Math.round(smoothing); // Convert 0-10 to radius 0-10
    if(radius === 0) return;
    
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const output = new Uint8ClampedArray(d);
    
    // Apply box blur multiple times for smooth effect
    const iterations = Math.ceil(radius / 2);
    for(let iter = 0; iter < iterations; iter++){
      const temp = new Uint8ClampedArray(d);
      for(let y = 1; y < h - 1; y++){
        for(let x = 1; x < w - 1; x++){
          const idx = (y * w + x) * 4;
          
          // Get surrounding pixels
          const pixels = [];
          for(let dy = -1; dy <= 1; dy++){
            for(let dx = -1; dx <= 1; dx++){
              const nIdx = ((y + dy) * w + (x + dx)) * 4;
              pixels.push(temp[nIdx], temp[nIdx+1], temp[nIdx+2], temp[nIdx+3]);
            }
          }
          
          // Average the 9 pixels (3x3 kernel)
          for(let c = 0; c < 4; c++){
            let sum = 0;
            for(let i = c; i < pixels.length; i += 4){
              sum += pixels[i];
            }
            output[idx + c] = Math.round(sum / 9);
          }
        }
      }
      // Copy output back to temp for next iteration
      for(let i = 0; i < output.length; i++){
        d[i] = output[i];
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }

  function applyZoomTransform(ctx, w, h){
    if(zoomLevel === 1.0) return;
    
    // Get current image data
    const imgData = ctx.getImageData(0, 0, w, h);
    
    // Create temporary canvas for zoomed content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imgData, 0, 0);
    
    // Clear and redraw at zoom level
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-w/2, -h/2);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }

  function applyMediumEffect(ctx, w, h, medium){
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    
    // Define medium characteristics: { iterations: line thickening, toneDelta: shading adjustment }
    const mediumProps = {
      'pencil': { dilations: 0, toneDelta: 15, graininess: 20 },      // Finest lines, light
      'ink': { dilations: 1, toneDelta: -10, graininess: 0 },         // Slight thickening, subtle darkening
      'marker': { dilations: 1, toneDelta: -20, graininess: 0 },      // Same thickness, more tone
      'pen': { dilations: 2, toneDelta: -30, graininess: 0 },         // Moderate thickening, darker
      'pastel': { dilations: 3, toneDelta: -35, graininess: 15 }      // Thickest, soft grain, darkest
    };
    
    const props = mediumProps[medium] || mediumProps['pencil'];
    
    // Apply line thickening via dilation (morphological operation)
    if(props.dilations > 0){
      dilateMask(d, w, h, props.dilations);
    }
    
    // Apply tonal adjustments (shading)
    for(let i=0; i<d.length; i+=4){
      d[i] = Math.max(0, Math.min(255, d[i] + props.toneDelta));     // R
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + props.toneDelta)); // G
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + props.toneDelta)); // B
    }
    
    // Apply grain texture if needed
    if(props.graininess > 0){
      for(let i=0; i<d.length; i+=4){
        const noise = Math.random() * props.graininess - props.graininess/2;
        d[i] = Math.max(0, Math.min(255, d[i] + noise));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + noise));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + noise));
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }

  function dilateMask(data, w, h, iterations){
    // Morphological dilation: expands dark pixels to thicken lines
    for(let iter=0; iter<iterations; iter++){
      const newData = new Uint8ClampedArray(data);
      for(let y=0; y<h; y++){
        for(let x=0; x<w; x++){
          const idx = (y*w + x) * 4;
          const r = data[idx], g = data[idx+1], b = data[idx+2];
          const brightness = (r + g + b) / 3;
          
          // If this pixel is dark (part of sketch), check neighbors and darken them too
          if(brightness < 200){
            // Expand to 4-connected neighbors
            const neighbors = [
              (y > 0) ? (y-1)*w + x : null,
              (y < h-1) ? (y+1)*w + x : null,
              (x > 0) ? y*w + (x-1) : null,
              (x < w-1) ? y*w + (x+1) : null
            ];
            
            for(let n of neighbors){
              if(n !== null){
                newData[n*4] = Math.min(newData[n*4], r);
                newData[n*4+1] = Math.min(newData[n*4+1], g);
                newData[n*4+2] = Math.min(newData[n*4+2], b);
              }
            }
          }
        }
      }
      // Copy back to original data
      for(let i=0; i<data.length; i++) data[i] = newData[i];
    }
  }

  function applyBrushEffect(ctx, w, h, brush, stroke, intensity, edges, rand) {
    if (brush === 'line') return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    // Grayscale brightness map of current sketch output
    const brt = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) brt[i] = (d[i*4] + d[i*4+1] + d[i*4+2]) / 3;

    if (brush === 'hatch' || brush === 'crosshatch') {
      // Tone-aware hatching: lines only drawn where the sketch is already dark.
      // Uses the same d-grid technique as renderHatching so lines are consistent.
      const spacing = Math.max(4, Math.round(18 - stroke * 1.4));
      const toneThr = 85 + intensity * 12;  // 97 (i=1) to 205 (i=10)
      const hyst    = 8;
      const maxT    = Math.ceil(Math.sqrt(w * w + h * h));
      // hatch: one pass at 30 deg; crosshatch: add second pass at 120 deg (deeper darks only)
      const PASSES = brush === 'hatch'
        ? [[Math.PI / 6,     toneThr,      0.60]]
        : [[Math.PI / 6,     toneThr,      0.60],
           [Math.PI * 2 / 3, toneThr - 24, 0.44]];
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap   = 'round';
      ctx.lineWidth = Math.max(0.3, 0.38 + stroke * 0.09);
      for (const [angle, thr, alpha] of PASSES) {
        const cos_a = Math.cos(angle), sin_a = Math.sin(angle);
        ctx.strokeStyle = `rgba(18, 12, 6, ${alpha})`;
        let dMin = Infinity, dMax = -Infinity;
        for (const [cx, cy] of [[0,0],[w,0],[0,h],[w,h]]) {
          const dv = -cx * sin_a + cy * cos_a;
          if (dv < dMin) dMin = dv; if (dv > dMax) dMax = dv;
        }
        dMin -= spacing; dMax += spacing;
        for (let dv = dMin; dv <= dMax; dv += spacing) {
          let lx = -dv * sin_a - maxT * cos_a;
          let ly =  dv * cos_a - maxT * sin_a;
          ctx.beginPath();
          let drawing = false;
          for (let t = 0; t <= 2 * maxT; t++, lx += cos_a, ly += sin_a) {
            const xi = lx | 0, yi = ly | 0;
            if (xi < 0 || xi >= w || yi < 0 || yi >= h) { drawing = false; continue; }
            const g = brt[yi * w + xi];
            if (g < thr - hyst) {
              if (!drawing) { ctx.moveTo(lx, ly); drawing = true; } else ctx.lineTo(lx, ly);
            } else if (g < thr + hyst) {
              if (drawing) ctx.lineTo(lx, ly);
            } else {
              drawing = false;
            }
          }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

    } else if (brush === 'charcoal') {
      // Directional grain marks at ~15 deg slope (same angle as renderCharcoal),
      // applied in shadow/midtone areas only, plus fine grain noise in mid-tones.
      const markStep  = Math.max(4, Math.round(16 - stroke * 1.1));
      const markLen   = Math.round(markStep * (1.3 + stroke * 0.2));
      const markAlpha = (0.07 + intensity * 0.016).toFixed(3);
      const slope     = 0.27;   // tan(15 deg)
      const lineW     = Math.max(0.35, stroke * 0.5);
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = `rgba(22, 14, 8, ${markAlpha})`;
      ctx.lineWidth   = lineW;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      for (let y = 0; y < h; y += markStep) {
        for (let x = 0; x < w; x += markStep) {
          if (brt[y * w + x] > 215) continue;  // skip near-white areas
          const jx  = x + (rand() - 0.5) * markStep * 0.7;
          const jy  = y + (rand() - 0.5) * markStep * 0.7;
          const len = markLen * (0.4 + rand() * 0.8);
          const hdx = slope * len * 0.5;
          ctx.moveTo(jx - hdx, jy - len * 0.5);
          ctx.lineTo(jx + hdx, jy + len * 0.5);
        }
      }
      ctx.stroke();
      // Fine grain noise — tiny arcs scattered in mid-tones
      const grainAlpha  = (0.17 + stroke * 0.03).toFixed(3);
      const grainChance = 0.009 + intensity * 0.007;
      ctx.fillStyle = `rgba(24, 16, 10, ${grainAlpha})`;
      ctx.beginPath();
      for (let i = 0; i < w * h; i++) {
        const g = brt[i];
        if (g < 18 || g > 235 || rand() > grainChance) continue;
        ctx.arc(i % w, (i / w) | 0, rand() * 0.7 + 0.15, 0, Math.PI * 2);
        ctx.closePath();
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

    } else if (brush === 'inkWash') {
      // Separable 3x3 box-blur softening + wet-edge bloom around dark sketch marks.
      const blurPasses = 1 + Math.round(stroke * 0.2);  // 1-3 passes
      const washStr    = 0.28 + stroke * 0.055;
      // In-place 3x3 box blur on grayscale brightness array (border pixels clamped)
      let blur = new Float32Array(brt);
      const next = new Float32Array(w * h);
      for (let p = 0; p < blurPasses; p++) {
        const inv9 = 1 / 9;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            next[i] = (blur[i-w-1] + blur[i-w] + blur[i-w+1] +
                       blur[i  -1] + blur[i  ] + blur[i  +1] +
                       blur[i+w-1] + blur[i+w] + blur[i+w+1]) * inv9;
          }
        }
        // Copy border rows/cols unchanged
        for (let x = 0; x < w; x++) { next[x] = blur[x]; next[(h-1)*w+x] = blur[(h-1)*w+x]; }
        for (let y = 0; y < h; y++) { next[y*w] = blur[y*w]; next[y*w+w-1] = blur[y*w+w-1]; }
        blur.set(next);
      }
      // Blend original with blurred
      const washed = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = Math.round(brt[i] * (1 - washStr) + blur[i] * washStr);
        washed.data[i*4] = washed.data[i*4+1] = washed.data[i*4+2] = v;
        washed.data[i*4+3] = 255;
      }
      ctx.putImageData(washed, 0, 0);
      // Wet-edge bloom: soft pale halo where sketch lines are dark (ink-bleed illusion)
      const bloomR     = 2 + Math.round(stroke * 0.45);
      const bloomAlpha = (0.07 + intensity * 0.009).toFixed(3);
      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = `rgba(240, 237, 232, ${bloomAlpha})`;
      ctx.beginPath();
      for (let y = bloomR; y < h - bloomR; y += 2) {
        for (let x = bloomR; x < w - bloomR; x += 2) {
          if (brt[y * w + x] > 75) continue;
          ctx.arc(x, y, bloomR + (rand() * bloomR | 0), 0, Math.PI * 2);
          ctx.closePath();
        }
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function renderContour(ctx, w, h, edges, gray, intensity, stroke) {
    // Anti-aliased contour: smoothstep transition at the edge boundary so lines
    // have soft, natural edges rather than harsh aliased pixels.
    // stroke slider widens/narrows lines by shifting the threshold.
    const thr      = Math.max(12, 40 + (11 - intensity) * 13 - stroke * 2.5);
    const softness = 6 + stroke * 2;   // width of the anti-alias transition band

    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;
    for (let i = 0; i < w * h; i++) {
      const e = edges[i];
      let v;
      if (e <= thr) {
        v = 255;                        // background
      } else if (e >= thr + softness) {
        v = 10;                         // line interior — near-black (warm graphite)
      } else {
        const t = (e - thr) / softness;
        v = Math.round(255 - 245 * t * t * (3 - 2 * t)); // smoothstep ease
      }
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
  }

  function renderBlindContour(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Blind contour: 2-4 long continuous strokes that loosely follow image edges
    // with random drift — simulating drawing while watching the subject, not the paper.

    // White background
    const bg = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255;
    }
    ctx.putImageData(bg, 0, 0);

    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Scale step size with image resolution so behaviour is consistent at all sizes
    const stepLen = Math.max(1.5, (w + h) / 600);

    // Number of separate pen lifts: 2 at low intensity (looser), 4 at high (more passes)
    const numStrokes = 2 + Math.round(intensity * 0.2);  // 2–4

    // Total walk length grows with intensity (more coverage = more detail)
    const totalSteps = Math.floor((w + h) * (4 + intensity * 0.5));
    const stepsPerStroke = Math.floor(totalSteps / numStrokes);

    // Line weight from stroke slider; slight per-stroke variation for organic feel
    const baseWidth = 0.55 + stroke * 0.18;

    // Drift = random angular wobble. Higher drift at low intensity (hand "wanders" more).
    // Ranges from ±20° at intensity 10 to ±60° at intensity 1.
    const driftRange = (0.18 + (10 - intensity) * 0.035) * Math.PI;

    // Edge sensitivity: how strongly the walker steers toward edges.
    const edgeSensitivity = 8 + intensity * 2.5;

    function edgeAt(x, y) {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || xi >= w || yi < 0 || yi >= h) return 0;
      return edges[yi * w + xi];
    }

    // Find a starting point near a strong edge (sample 50 random candidates)
    function findStart() {
      let bx = rand() * w, by = rand() * h, be = 0;
      for (let a = 0; a < 50; a++) {
        const x = rand() * w, y = rand() * h;
        const e = edgeAt(x, y);
        if (e > be) { be = e; bx = x; by = y; }
      }
      return [bx, by];
    }

    for (let s = 0; s < numStrokes; s++) {
      const [sx, sy] = findStart();
      let x = sx, y = sy;
      let angle = rand() * Math.PI * 2;   // random initial direction

      const pts = [[x, y]];

      for (let step = 0; step < stepsPerStroke; step++) {
        // Fan lookahead: evaluate 12 directions within ±40° of current heading.
        // Score = edge strength at lookahead point + bonus for staying on course.
        const fanCount = 12;
        const fanSpread = Math.PI * 0.44;  // ±40°
        const lookahead = stepLen * 4;
        let bestScore = -1, bestAngle = angle;

        for (let f = 0; f < fanCount; f++) {
          const testAngle = angle - fanSpread / 2 + (f / (fanCount - 1)) * fanSpread;
          const lx = x + Math.cos(testAngle) * lookahead;
          const ly = y + Math.sin(testAngle) * lookahead;
          // Momentum bonus: prefer directions close to current heading
          const deviation = Math.abs(testAngle - angle);
          const score = edgeAt(lx, ly) + (1 - deviation / Math.PI) * edgeSensitivity;
          if (score > bestScore) { bestScore = score; bestAngle = testAngle; }
        }

        // Add random drift on top of the best edge-following direction
        angle = bestAngle + (rand() - 0.5) * driftRange;

        x += Math.cos(angle) * stepLen;
        y += Math.sin(angle) * stepLen;

        // Soft boundary: reflect off canvas edges so the stroke stays visible
        if (x < 0)   { x = -x;           angle = Math.PI - angle; }
        if (x > w-1) { x = 2*(w-1) - x;  angle = Math.PI - angle; }
        if (y < 0)   { y = -y;            angle = -angle; }
        if (y > h-1) { y = 2*(h-1) - y;  angle = -angle; }

        pts.push([x, y]);
      }

      // Render as a smooth quadratic-bezier path (midpoint method)
      ctx.beginPath();
      ctx.lineWidth = baseWidth + rand() * 0.25;
      ctx.strokeStyle = 'rgba(18, 12, 8, 0.88)';
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i+1][0]) / 2;
        const my = (pts[i][1] + pts[i+1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function renderGesture(ctx, w, h, edges, gray, intensity, stroke, rand) {
    const edgeThreshold = 30 + (11 - intensity) * 6;  // Use intensity to control edge sensitivity
    const overlay = ctx.createImageData(w,h);
    const d = overlay.data;
    
    // Light base with edge emphasis
    for(let i=0; i<w*h; i++) {
      const edgeVal = edges[i];
      const grayVal = gray[i];
      
      // Emphasize edges strongly, keep light areas light
      let v = 250;
      if(edgeVal > edgeThreshold) {
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
        if(idx < w*h && edges[idx] > edgeThreshold) {
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
    // Crisp line art: binary edges dilated to a controlled thickness.
    // Distinct from Contour — hard edges (no anti-alias) give a flat,
    // technical-pen / manga feel. stroke slider controls true line width.
    const thr       = Math.max(10, 35 + (11 - intensity) * 12 - stroke * 1.5);
    const dilRadius = Math.max(0, Math.round(stroke * 0.3 - 0.2)); // 0–3 px

    // Binary threshold
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = edges[i] > thr ? 1 : 0;

    // 2-pass separable morphological dilation for uniform line thickness
    if (dilRadius > 0) {
      const src = mask.slice();
      // Horizontal pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!src[y * w + x]) continue;
          for (let dx = -dilRadius; dx <= dilRadius; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w) mask[y * w + nx] = 1;
          }
        }
      }
      const hd = mask.slice();
      // Vertical pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!hd[y * w + x]) continue;
          for (let dy = -dilRadius; dy <= dilRadius; dy++) {
            const ny = y + dy;
            if (ny >= 0 && ny < h) mask[ny * w + x] = 1;
          }
        }
      }
    }

    // Render: pure black on white for maximum crispness
    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;
    for (let i = 0; i < w * h; i++) {
      const v = mask[i] ? 0 : 255;
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
  }

  function renderCrossContour(ctx, w, h, edges, gray, intensity, stroke) {
    // Cross-contour: evenly-spaced horizontal + vertical scan lines WARPED
    // by image brightness — like latitude/longitude lines on a curved surface.
    // Bright areas bow lines outward; dark areas pull them inward.
    // This is fundamentally different from Contour, which traces edge boundaries.
    // Here the lines CROSS boundaries and reveal 3D topography by how they bend.

    // White background
    const bg = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255;
    }
    ctx.putImageData(bg, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Thin outline for form definition
    const edgeThr = 35 + (11 - intensity) * 13;
    const ol = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = edges[i] > edgeThr ? 12 : 255;
      ol.data[i*4] = ol.data[i*4+1] = ol.data[i*4+2] = v; ol.data[i*4+3] = 255;
    }
    ctx.putImageData(ol, 0, 0);

    ctx.globalCompositeOperation = 'multiply';

    // Line spacing scales with image size so density is consistent across resolutions
    const lineSpacing = Math.max(4, Math.round((w + h) / 80 + 2 - stroke * 1.5));
    // Warp amplitude: how far a line deflects at max brightness difference
    const warpAmp = lineSpacing * (0.3 + intensity * 0.065);
    const lw = 0.4 + stroke * 0.1;

    // 3×3 smoothed gray to reduce noise jitter in the warp curves
    function sg(x, y) {
      const xi = Math.max(1, Math.min(w - 2, x | 0));
      const yi = Math.max(1, Math.min(h - 2, y | 0));
      return (gray[(yi-1)*w + xi-1] + gray[(yi-1)*w + xi] + gray[(yi-1)*w + xi+1] +
              gray[ yi   *w + xi-1] + gray[ yi   *w + xi] + gray[ yi   *w + xi+1] +
              gray[(yi+1)*w + xi-1] + gray[(yi+1)*w + xi] + gray[(yi+1)*w + xi+1]) / 9;
    }

    function drawPath(pts) {
      if (pts.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i+1][0]) / 2;
        const my = (pts[i][1] + pts[i+1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
      ctx.stroke();
    }

    // --- Horizontal lines warped vertically ---
    // bright pixel → line bows upward; dark pixel → line dips downward
    ctx.strokeStyle = 'rgba(12, 12, 18, 0.65)';
    ctx.lineWidth = lw;
    for (let y0 = lineSpacing / 2; y0 < h; y0 += lineSpacing) {
      const pts = [];
      for (let x = 0; x < w; x++) {
        const g = sg(x, y0);
        pts.push([x, y0 - warpAmp * (g - 128) / 128]);
      }
      drawPath(pts);
    }

    // --- Vertical lines warped horizontally ---
    // bright pixel → line bows rightward; dark pixel → bows leftward
    // Slightly lighter so the two sets read as a unified mesh
    ctx.strokeStyle = 'rgba(12, 12, 18, 0.45)';
    ctx.lineWidth = lw * 0.85;
    for (let x0 = lineSpacing / 2; x0 < w; x0 += lineSpacing) {
      const pts = [];
      for (let y = 0; y < h; y++) {
        const g = sg(x0, y);
        pts.push([x0 + warpAmp * (g - 128) / 128, y]);
      }
      drawPath(pts);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function renderHatching(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Tone-driven parallel hatching at 30°. Lines run continuously through
    // dark areas and break where pixels are too light — encoding tone through
    // line continuity rather than disconnected edge-only tick marks.

    const bg = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255; }
    ctx.putImageData(bg, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Thin outline for form definition
    const edgeThr = 35 + (11 - intensity) * 13;
    const ol = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = edges[i] > edgeThr ? 12 : 255; ol.data[i*4] = ol.data[i*4+1] = ol.data[i*4+2] = v; ol.data[i*4+3] = 255; }
    ctx.putImageData(ol, 0, 0);

    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(14, 11, 7, 0.82)';
    const spacing = Math.max(3, Math.round(16 - stroke * 1.3));
    ctx.lineWidth = 0.45 + stroke * 0.1;

    const angle = Math.PI / 6; // 30° — classic pencil hatching angle
    const cos = Math.cos(angle), sin = Math.sin(angle);

    // Higher intensity → higher threshold → more of the image gets hatched
    const toneThr = 60 + intensity * 14; // 74 (intensity=1) to 200 (intensity=10)
    const hyst = 6; // hysteresis band prevents choppy breaks in transition zones

    // Compute d-range so parallel lines cover the entire canvas
    let dMin = Infinity, dMax = -Infinity;
    for (const [cx, cy] of [[0,0],[w,0],[0,h],[w,h]]) {
      const d = -cx * sin + cy * cos;
      dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
    }
    dMin -= spacing; dMax += spacing;
    const maxT = Math.ceil(Math.sqrt(w * w + h * h));

    for (let d = dMin; d <= dMax; d += spacing) {
      // Walk along this parallel line using incremental addition (no per-step multiply)
      let lx = -d * sin - maxT * cos;
      let ly =  d * cos - maxT * sin;
      ctx.beginPath();
      let drawing = false;
      for (let t = 0; t <= 2 * maxT; t++, lx += cos, ly += sin) {
        const xi = lx | 0, yi = ly | 0;
        if (xi < 0 || xi >= w || yi < 0 || yi >= h) { drawing = false; continue; }
        const g = gray[yi * w + xi];
        if (g < toneThr - hyst) {
          if (!drawing) { ctx.moveTo(lx, ly); drawing = true; } else ctx.lineTo(lx, ly);
        } else if (g < toneThr + hyst) {
          if (drawing) ctx.lineTo(lx, ly); // extend through transition, don't start fresh
        } else {
          drawing = false;
        }
      }
      ctx.stroke(); // one draw call per line
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
    // White background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const step = Math.max(3, Math.round(14 - stroke * 1.1)); // grid spacing
    const dotThr = 90 + intensity * 11;  // gray threshold (101–200); below → draw dot
    const baseR  = 0.4 + stroke * 0.18; // base dot radius

    ctx.fillStyle = '#111';
    ctx.beginPath();

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const g = gray[y * w + x];
        if (g >= dotThr) continue; // light area → skip

        const darkness = 1 - g / dotThr; // 0..1; darker pixel → larger dot
        const r = baseR * (0.5 + darkness);

        const jx = x + (rand() - 0.5) * step * 0.8;
        const jy = y + (rand() - 0.5) * step * 0.8;

        ctx.moveTo(jx + r, jy);
        ctx.arc(jx, jy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  function renderTonalPencil(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Smooth, blended tonal rendering with intensity control
    const edgeWeight = (intensity / 11) * 0.7;  // Higher intensity = more edge emphasis
    const grayWeight = (1 - (intensity / 11) * 0.5);  // Higher intensity = less gray smoothing
    const overlay = ctx.createImageData(w,h);
    for(let i=0; i<w*h; i++) {
      const e = edges[i];
      const g = gray[i];
      const blended = edgeWeight * e + grayWeight * g * 0.5;
      const v = 255 - Math.min(255, blended);
      overlay.data[i*4]=overlay.data[i*4+1]=overlay.data[i*4+2]=v;
      overlay.data[i*4+3]=255;
    }
    ctx.putImageData(overlay,0,0);
  }

  function renderCharcoal(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // ── 1. S-curve tonal map + edge deepening in one ImageData pass ──────────
    const edgeThr = Math.max(10, 80 - intensity * 6); // 74 (i=1) → 14 (i=10)
    const edgeBite = 0.8 + intensity * 0.07;          // how hard edges cut in
    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;

    for (let i = 0; i < w * h; i++) {
      const t = gray[i] / 255;
      // S-curve: pushes shadows darker, highlights brighter
      const s = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      let v = Math.round(22 + s * 220); // 22 (black) … 242 (near-white)

      // Deepen strong edges (simulate charcoal pressing harder at contours)
      const e = edges[i];
      if (e > edgeThr) {
        v = Math.max(0, v - Math.round((e - edgeThr) * edgeBite));
      }

      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);

    // ── 2. Directional stroke marks at ~15° (side-loaded charcoal stick) ─────
    // tan(15°) ≈ 0.268; use linear slope for performance
    const slope    = 0.27;
    const markStep = Math.max(4, Math.round(18 - stroke * 1.4));
    const markLen  = Math.round(markStep * (1.5 + stroke * 0.2));
    const mAlpha   = (0.07 + intensity * 0.018).toFixed(3);

    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(30,20,10,${mAlpha})`;
    ctx.lineWidth   = Math.max(2, stroke * 0.7);
    ctx.lineCap     = 'round';
    ctx.beginPath();

    for (let y0 = 0; y0 < h; y0 += markStep) {
      for (let x0 = 0; x0 < w; x0 += markStep) {
        if (gray[Math.min(w * h - 1, y0 * w + x0)] > 200) continue; // skip near-white

        const jx  = x0 + (rand() - 0.5) * markStep * 0.6;
        const jy  = y0 + (rand() - 0.5) * markStep * 0.6;
        const len = markLen * (0.5 + rand() * 0.8);
        const dx  = slope * len;

        ctx.moveTo(jx - dx / 2, jy - len / 2);
        ctx.lineTo(jx + dx / 2, jy + len / 2);
      }
    }
    ctx.stroke();
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
    // Comic/Manga: varied line weight, spot blacks, speed lines
    const baseThreshold = 10 + (11 - intensity) * 8;
    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;
    
    // Create line art with varied line weight based on edge strength
    for(let i=0; i<w*h; i++) {
      const edgeVal = edges[i];
      // Vary line thickness: weak edges are light gray, strong edges are black
      const lineWeight = Math.max(0, Math.min(255, (edgeVal - baseThreshold * 0.5) * 2));
      const v = edgeVal > baseThreshold ? Math.max(0, 50 - lineWeight * 0.3) : 255;
      
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Add stylized spot blacks in dark areas
    ctx.globalCompositeOperation = 'darken';
    ctx.fillStyle = '#000';
    const spotStep = Math.max(4, 8 - stroke * 0.5);
    for(let y=spotStep; y<h; y+=spotStep) {
      for(let x=spotStep; x<w; x+=spotStep) {
        const idx = y*w + x;
        if(idx < w*h && gray[idx] < 120 && rand() > 0.35) {
          // Vary spot black sizes for expressiveness
          const size = 1 + Math.floor(rand() * 2);
          ctx.beginPath();
          ctx.arc(x + rand() * 2, y + rand() * 2, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    // Add speed lines in high-contrast areas for motion feel
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    const speedStep = Math.max(8, 16 - stroke);
    for(let y=0; y<h; y+=speedStep*2) {
      for(let x=0; x<w; x+=speedStep) {
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > baseThreshold * 1.5 && rand() > 0.5) {
          ctx.beginPath();
          ctx.moveTo(x - speedStep, y);
          ctx.lineTo(x + speedStep, y);
          ctx.stroke();
        }
      }
    }
    
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderFashion(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // ── 1. Warm paper + light tonal shadow wash + thin contour lines ──────────
    const overlay  = ctx.createImageData(w, h);
    const d        = overlay.data;
    const lineThr  = Math.max(12, 60 - intensity * 4 - stroke * 1.2);
    const softness = 8 + stroke * 1.5;
    const shadowThr = 100 + intensity * 8; // gray below → shadow

    for (let i = 0; i < w * h; i++) {
      const e = edges[i];
      const g = gray[i];

      // Ivory paper base
      let r = 252, gv = 250, b = 245;

      // Very light tonal shadow wash (tonally mapped, not edge-driven)
      if (g < shadowThr) {
        const depth = Math.pow((shadowThr - g) / shadowThr, 1.5);
        const wash  = depth * (20 + intensity * 2);
        r  = Math.max(0, r  - Math.round(wash));
        gv = Math.max(0, gv - Math.round(wash));
        b  = Math.max(0, b  - Math.round(wash * 1.15)); // very slightly cooler shadows
      }

      // Thin elegant contour lines (smoothstep anti-aliased)
      if (e > lineThr) {
        const t     = e >= lineThr + softness ? 1 : (e - lineThr) / softness;
        const blend = t * t * (3 - 2 * t);
        r  = Math.round(r  - r  * blend * 0.97);
        gv = Math.round(gv - gv * blend * 0.97);
        b  = Math.round(b  - b  * blend * 0.97);
      }
      d[i*4] = r; d[i*4+1] = gv; d[i*4+2] = b; d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);

    // ── 2. Long vertical marks (drape / elongation) in shadow areas only ─────
    const markStep = Math.max(6, Math.round(24 - stroke * 1.5));
    const markLen  = Math.round((h / 8) * (0.8 + stroke * 0.1));
    const mAlpha   = (0.03 + intensity * 0.008).toFixed(3);

    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(40,30,20,${mAlpha})`;
    ctx.lineWidth   = Math.max(0.4, stroke * 0.3);
    ctx.lineCap     = 'round';
    ctx.beginPath();

    for (let x = 0; x < w; x += markStep) {
      for (let y = 0; y < h; y += markStep) {
        if (gray[Math.min(w * h - 1, y * w + x)] > 160) continue; // shadows only
        const jx  = x + (rand() - 0.5) * markStep * 0.5;
        const jy  = y + (rand() - 0.5) * markStep * 0.5;
        const len = markLen * (0.3 + rand() * 0.9);
        ctx.moveTo(jx, jy);
        ctx.lineTo(jx + (rand() - 0.5) * markStep * 0.2, jy + len);
      }
    }
    ctx.stroke();
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
    
    // Fine, dense crosshatching pattern
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#222';
    ctx.lineCap = 'round';
    const step = Math.max(2, 6 - stroke);  // Finer lines
    ctx.lineWidth = 0.3 + stroke*0.1;
    
    // Horizontal hatching
    for(let y=0; y<h; y+=step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    
    // Vertical hatching for cross pattern
    for(let x=0; x<w; x+=step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderMinimalist(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Very high threshold — only dominant contours survive, lots of white space
    // Hard threshold (no softness band) keeps the background pure white like blind contour
    const thr   = Math.max(30, 160 - intensity * 14); // 146 (i=1) → 30 (i=10)
    const lineV = Math.max(0, 18 - stroke * 1);       // near-black lines

    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;
    for (let i = 0; i < w * h; i++) {
      const v = edges[i] > thr ? lineV : 255;
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
      d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
  }

  function renderGlitch(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // ── 1. Edge base with noise corruption ────────────────────────────────────
    const thr = Math.max(10, 60 - intensity * 5);
    const noiseChance = 0.04 + intensity * 0.025; // corrupt pixel probability
    const overlay = ctx.createImageData(w, h);
    const d = overlay.data;

    for (let i = 0; i < w * h; i++) {
      let e = edges[i];
      if (rand() < noiseChance) e = rand() * 255; // data corruption
      const v = e > thr ? Math.max(0, 230 - e) : 255;
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
      d[i*4+3] = 255;
    }

    // ── 2. Row-shift corruption (horizontal slice displacement) ───────────────
    const corruptChance = 0.04 + intensity * 0.035; // 0.075–0.39 per row
    const maxShift = Math.round(w * (0.03 + intensity * 0.04)); // up to ~43% of width
    const rowBuf = new Uint8ClampedArray(w * 4);

    for (let y = 0; y < h; y++) {
      if (rand() > corruptChance) continue;
      const shift = Math.round((rand() - 0.5) * 2 * maxShift);
      const rowOff = y * w * 4;
      // Copy row to buffer
      for (let x = 0; x < w; x++) {
        rowBuf[x*4]   = d[rowOff + x*4];
        rowBuf[x*4+1] = d[rowOff + x*4+1];
        rowBuf[x*4+2] = d[rowOff + x*4+2];
        rowBuf[x*4+3] = 255;
      }
      // Write back with circular shift
      for (let x = 0; x < w; x++) {
        const srcX = ((x - shift) % w + w) % w;
        d[rowOff + x*4]   = rowBuf[srcX*4];
        d[rowOff + x*4+1] = rowBuf[srcX*4+1];
        d[rowOff + x*4+2] = rowBuf[srcX*4+2];
      }
    }
    ctx.putImageData(overlay, 0, 0);

    // ── 3. Chromatic aberration bands (RGB channel misalignment) ─────────────
    const numBars = Math.round(3 + intensity * 1.5);
    ctx.globalCompositeOperation = 'screen';
    for (let b = 0; b < numBars; b++) {
      const barY  = Math.floor(rand() * h);
      const barH  = Math.round(1 + rand() * (3 + intensity * 0.5));
      const shift = Math.round((rand() - 0.5) * maxShift * 2);
      const alpha = (0.12 + rand() * 0.18).toFixed(2);
      // Red displaced one way
      ctx.fillStyle = `rgba(255,0,0,${alpha})`;
      ctx.fillRect(shift, barY, w, barH);
      // Cyan displaced opposite (cyan = green+blue)
      ctx.fillStyle = `rgba(0,255,255,${(parseFloat(alpha) * 0.7).toFixed(2)})`;
      ctx.fillRect(-shift, barY + 1, w, barH);
    }

    // ── 4. Flat-colour dropout bands ─────────────────────────────────────────
    const numDropouts = Math.round(2 + intensity * 0.8);
    ctx.globalCompositeOperation = 'overlay';
    for (let b = 0; b < numDropouts; b++) {
      const barY      = Math.floor(rand() * h);
      const barH      = Math.round(1 + rand() * 3);
      const brightness = rand() > 0.5 ? 230 : 20;
      ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},0.45)`;
      ctx.fillRect(0, barY, w, barH);
    }

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderMixedMedia(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // ── 1. Warm tonal base (acrylic wash / paper ground) ─────────────────────
    const overlay  = ctx.createImageData(w, h);
    const d        = overlay.data;
    const lineThr  = Math.max(12, 65 - intensity * 5);
    const softness = 10;

    for (let i = 0; i < w * h; i++) {
      const g = gray[i];
      const e = edges[i];
      // Quadratic darkening from grey: cream highlights → warm shadow
      const base = Math.round(242 - (1 - g / 255) * (1 - g / 255) * 115);
      let r  = Math.min(255, base + 5);
      let gv = base;
      let b  = Math.max(0, base - 14); // warm (slight yellow-brown) bias

      // Pen lines at strong edges
      if (e > lineThr) {
        const t  = Math.min(1, (e - lineThr) / softness);
        const lf = t * t * (3 - 2 * t);
        r  = Math.round(r  - r  * lf * 0.93);
        gv = Math.round(gv - gv * lf * 0.93);
        b  = Math.round(b  - b  * lf * 0.93);
      }
      d[i*4] = r; d[i*4+1] = gv; d[i*4+2] = b; d[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);

    // ── 2. Stipple dots in mid-tone areas (pencil/stipple layer) ─────────────
    const dotStep  = Math.max(4, Math.round(15 - stroke * 1.0));
    const baseR    = 0.5 + stroke * 0.14;
    ctx.fillStyle  = 'rgba(55,38,18,0.55)';
    ctx.beginPath();
    for (let y = 0; y < h; y += dotStep) {
      for (let x = 0; x < w; x += dotStep) {
        const g = gray[Math.min(w*h-1, y*w+x)];
        if (g < 80 || g > 178) continue; // mid-tones only
        const jx = x + (rand()-0.5)*dotStep*0.7;
        const jy = y + (rand()-0.5)*dotStep*0.7;
        const r  = baseR * (1 + (178 - g) / 178 * 0.6);
        ctx.moveTo(jx + r, jy);
        ctx.arc(jx, jy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // ── 3. Diagonal cross-hatching in dark shadows (pen/ink layer) ────────────
    const hStep  = Math.max(3, Math.round(13 - stroke * 0.9));
    const hLen   = Math.round(hStep * 2.5);
    const hAlpha = (0.18 + intensity * 0.025).toFixed(3);
    const a1 = Math.PI / 5,       c1 = Math.cos(a1), s1 = Math.sin(a1); // 36°
    const a2 = Math.PI * 2 / 5,   c2 = Math.cos(a2), s2 = Math.sin(a2); // 72° cross

    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(48,32,12,${hAlpha})`;
    ctx.lineWidth   = Math.max(0.5, stroke * 0.35);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    for (let y = 0; y < h; y += hStep) {
      for (let x = 0; x < w; x += hStep) {
        const g = gray[Math.min(w*h-1, y*w+x)];
        if (g > 108) continue; // darkest shadows only
        const jx = x + (rand()-0.5)*hStep*0.4;
        const jy = y + (rand()-0.5)*hStep*0.4;
        const hl = hLen * (0.5 + rand() * 0.6);
        ctx.moveTo(jx - c1*hl/2, jy - s1*hl/2);
        ctx.lineTo(jx + c1*hl/2, jy + s1*hl/2);
        if (g < 68) { // cross-hatch only in deepest shadow
          ctx.moveTo(jx - c2*hl/2, jy - s2*hl/2);
          ctx.lineTo(jx + c2*hl/2, jy + s2*hl/2);
        }
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderCartoon(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Cartoon style: bold outlines with simplified color areas
    const threshold = 25 + (11 - intensity) * 10 - stroke * 0.3;
    const overlay = ctx.createImageData(w,h);
    
    // Create mid-tone base for cartoon look
    for(let i=0; i<w*h; i++){
      const e = edges[i];
      const g = gray[i];
      // Simplify to distinct tonal areas
      let v;
      if(e > threshold) {
        v = 20;  // Black outlines
      } else if(g < 85) {
        v = 50;  // Dark areas
      } else if(g < 170) {
        v = 150;  // Mid tones
      } else {
        v = 240;  // Light areas
      }
      overlay.data[i*4] = v;
      overlay.data[i*4+1] = v;
      overlay.data[i*4+2] = v;
      overlay.data[i*4+3] = 255;
    }
    ctx.putImageData(overlay,0,0);
    
    // Add bold outlines on top
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 + stroke * 0.15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const outlineStep = Math.max(2, 6 - stroke * 0.3);
    for(let y=0; y<h; y+=outlineStep){
      for(let x=0; x<w; x+=outlineStep){
        const idx = y*w + x;
        if(idx < w*h && edges[idx] > threshold){
          ctx.beginPath();
          ctx.arc(x, y, 0.5 + stroke * 0.1, 0, Math.PI * 2);
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
    // Retro pen & ink: crisp clean professional line drawing with precise hatching
    const thr = 20 + (11 - intensity) * 8 - stroke * 0.3;
    const overlay = ctx.createImageData(w, h);
    
    // Pure white background for crisp look
    for(let i=0; i<w*h*4; i+=4){
      overlay.data[i] = 255;
      overlay.data[i+1] = 255;
      overlay.data[i+2] = 255;
      overlay.data[i*4+3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
    
    // Draw crisp black edge lines
    ctx.fillStyle = '#000000';
    for(let y=0; y<h; y++){
      for(let x=0; x<w; x++){
        const idx = y*w + x;
        if(edges[idx] > thr){
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    // Add professional cross-hatch shading (perpendicular lines)
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 0.5;
    const hatchStep = Math.max(3, 8 - stroke * 0.3);
    
    for(let angle of [0, Math.PI/4]) {
      for(let i=0; i<w+h; i+=hatchStep) {
        ctx.beginPath();
        ctx.moveTo(i*Math.cos(angle), i*Math.sin(angle));
        ctx.lineTo((i-w)*Math.cos(angle) + h*Math.sin(angle), (i-w)*Math.sin(angle) + h*Math.cos(angle));
        ctx.stroke();
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderOilPainting(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // Toned canvas ground — buff/sienna, not white
    // Light areas show the raw ground; paint only blocks in the darks
    ctx.fillStyle = 'rgb(208,192,166)';
    ctx.fillRect(0, 0, w, h);

    // Broad blocking strokes in shadow + midtone areas
    // Oil sketch character: bold, decisive, LARGE marks — not fine rendering
    const markThick = Math.max(5, Math.round(4 + stroke * 2.4));     // 5-28px wide
    const markLen   = Math.max(14, Math.round(w / 14 + stroke * 3)); // length
    const gridStep  = Math.max(5, Math.round(markThick * 1.05));     // overlapping
    const shadowThr = 148 + intensity * 7; // gray below gets paint (155-218)

    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Deep shadow pass: darkest, most opaque marks
    ctx.strokeStyle = `rgba(44,28,12,${(0.55 + intensity * 0.035).toFixed(2)})`;
    ctx.lineWidth   = markThick;
    ctx.beginPath();
    for (let y = 0; y < h; y += gridStep) {
      for (let x = 0; x < w; x += gridStep) {
        const g = gray[Math.min(w * h - 1, y * w + x)];
        if (g > shadowThr * 0.72) continue;
        const jx  = x + (rand() - 0.5) * gridStep * 0.6;
        const jy  = y + (rand() - 0.5) * gridStep * 0.6;
        const len = markLen * (0.5 + rand() * 0.8);
        const ang = (rand() - 0.5) * 0.55; // mostly horizontal, slight lean
        ctx.moveTo(jx - Math.cos(ang) * len / 2, jy - Math.sin(ang) * len / 2);
        ctx.lineTo(jx + Math.cos(ang) * len / 2, jy + Math.sin(ang) * len / 2);
      }
    }
    ctx.stroke();

    // Mid-shadow pass: slightly lighter, thinner marks
    ctx.strokeStyle = `rgba(60,44,22,${(0.28 + intensity * 0.02).toFixed(2)})`;
    ctx.lineWidth   = Math.max(3, markThick * 0.52);
    ctx.beginPath();
    const midStep = Math.round(gridStep * 1.35);
    const midLo   = shadowThr * 0.72, midHi = shadowThr;
    for (let y = 0; y < h; y += midStep) {
      for (let x = 0; x < w; x += midStep) {
        const g = gray[Math.min(w * h - 1, y * w + x)];
        if (g < midLo || g > midHi) continue;
        const jx  = x + (rand() - 0.5) * gridStep * 0.5;
        const jy  = y + (rand() - 0.5) * gridStep * 0.5;
        const len = markLen * (0.4 + rand() * 0.6);
        const ang = (rand() - 0.5) * 0.45;
        ctx.moveTo(jx - Math.cos(ang) * len / 2, jy - Math.sin(ang) * len / 2);
        ctx.lineTo(jx + Math.cos(ang) * len / 2, jy + Math.sin(ang) * len / 2);
      }
    }
    ctx.stroke();

    // Edge contours via offscreen canvas (brush-tip dark lines)
    // Using offscreen canvas so putImageData composes in multiply mode correctly
    const edgeThr  = Math.max(15, 62 - intensity * 5);
    const edgeSoft = 22;
    const maxA     = Math.round(190 + intensity * 6);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc  = tmp.getContext('2d');
    const ed  = tc.createImageData(w, h);
    const ep  = ed.data;
    for (let i = 0; i < w * h; i++) {
      const e = edges[i];
      let a = 0;
      if (e > edgeThr + edgeSoft) {
        a = maxA;
      } else if (e > edgeThr) {
        const t = (e - edgeThr) / edgeSoft;
        a = Math.round(maxA * t * t * (3 - 2 * t));
      }
      ep[i*4] = 22; ep[i*4+1] = 13; ep[i*4+2] = 5; ep[i*4+3] = a;
    }
    tc.putImageData(ed, 0, 0);
    ctx.drawImage(tmp, 0, 0); // multiply blend still active from above

    ctx.globalCompositeOperation = 'source-over';
  }

  function renderWatercolor(ctx, w, h, edges, gray, intensity, stroke, rand) {
    // ── 1. Full-image tonal wash + ink lines in one ImageData pass ────────────
    const overlay   = ctx.createImageData(w, h);
    const d         = overlay.data;
    const inkThr    = Math.max(15, 85 - intensity * 6); // ink line threshold (79→25)
    const inkSoft   = 30;
    const washDepth = 0.18 + intensity * 0.025; // max shadow darkness (0.21→0.43)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;

        // 3×3 average gray — simulates pigment diffusion / soft washes
        let gSum = 0, cnt = 0;
        const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
        const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
        for (let ny = y0; ny <= y1; ny++) {
          for (let nx = x0; nx <= x1; nx++) { gSum += gray[ny * w + nx]; cnt++; }
        }
        const sg = gSum / cnt;

        // Quadratic gamma wash: very light in highlights, soft-grey in shadows
        const darkness = 1 - sg / 255;
        const wash     = darkness * darkness * washDepth;

        // Warm cream paper + tonal wash
        let r  = Math.round(252 - wash * 195);
        let gv = Math.round(248 - wash * 210);
        let b  = Math.round(240 - wash * 225);

        // Ink lines at strong edges only (sparse, warm dark)
        const e = edges[i];
        if (e > inkThr) {
          const t   = Math.min(1, (e - inkThr) / inkSoft);
          const ink = t * t * (3 - 2 * t);
          r  = Math.round(r  + (30 - r)  * ink);
          gv = Math.round(gv + (25 - gv) * ink);
          b  = Math.round(b  + (20 - b)  * ink);
        }
        d[i*4]   = Math.max(0, Math.min(255, r));
        d[i*4+1] = Math.max(0, Math.min(255, gv));
        d[i*4+2] = Math.max(0, Math.min(255, b));
        d[i*4+3] = 255;
      }
    }
    ctx.putImageData(overlay, 0, 0);

    // ── 2. Wet-edge bloom: darker ring where washes transition (medium edges) ──
    // Simulates paint drying darker at wash boundaries
    const wetLo = inkThr * 0.35, wetHi = inkThr * 0.80;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(105,80,50,${(0.05 + intensity * 0.007).toFixed(3)})`;
    ctx.lineWidth   = Math.max(0.5, stroke * 0.25);
    ctx.lineCap     = 'round';
    ctx.beginPath();

    for (let y = 2; y < h - 2; y += 2) {
      for (let x = 2; x < w - 2; x += 2) {
        const e = edges[y * w + x];
        if (e > wetLo && e < wetHi) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rand() - 0.5), y + (rand() - 0.5));
        }
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderGraphitePortrait(ctx, w, h, edges, gray, intensity, stroke, rand){
    // Graphite portrait: simple smooth tonal portrait
    // Just use edge detection to create clean portrait lines
    const thr = 25 + (11 - intensity) * 6;  // Use intensity to control edge sensitivity
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
        if(edges[idx] > thr){
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
        if(idx < w*h && edges[idx] < thr * 0.7){
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

    // Store the rendered image for zoom/pan operations to use (server or canvas rendered)
    currentRenderedImage = img;

    // Also update the original canvas if available
    if(typeof original !== 'undefined' && original && typeof singleImage !== 'undefined' && singleImage) {
      const octx = original.getContext('2d');
      octx.clearRect(0,0,original.width,original.height);
      const ofit = fitCropRect(singleImage.width, singleImage.height, original.width, original.height);
      octx.drawImage(singleImage, ofit.sx, ofit.sy, ofit.sw, ofit.sh, 0,0,original.width,original.height);
    }

    applyTextureOverlay(ctx, cw, ch);
    drawCompareOverlay();
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

  // Lazy-load imagetracerjs from CDN for SVG export
  function loadImageTracer() {
    return new Promise((resolve, reject) => {
      if (window.ImageTracer) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ImageTracer'));
      document.head.appendChild(s);
    });
  }

  // Styles not supported by the server — canvas-only
  const CANVAS_ONLY_STYLES = new Set(['lineart','crosscontour','scribble','photorealism','graphiteportrait','oilpainting','watercolor']);

  // Open Style Grid modal — renders thumbnails via server or canvas depending on active engine
  async function openStyleGrid() {
    const gen = ++gridGeneration; // any older loop will see gen !== gridGeneration and abort
    const modal = document.getElementById('modal-grid');
    const container = document.getElementById('gridContainer');
    const status = document.getElementById('gridStatus');
    modal.style.display = 'flex';

    if (!singleImage) {
      status.textContent = 'Load an image first.';
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '';
    const THUMB = 150;
    const isServer = renderingEngine === 'opencv';
    const styles = isServer ? ALL_STYLES.filter(s => !CANVAS_ONLY_STYLES.has(s.value)) : ALL_STYLES;

    const origStyle = document.getElementById('style').value;
    const origZoom = zoomLevel;
    zoomLevel = 1.0;

    // For server mode: prepare a 512px square crop of singleImage as a File (sent once per request)
    let thumbFile = null;
    if (isServer) {
      const offC = document.createElement('canvas');
      offC.width = 512; offC.height = 512;
      const offCtx = offC.getContext('2d');
      const fit = fitCropRect(singleImage.width, singleImage.height, 512, 512);
      offCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, 512, 512);
      const blob = await new Promise(r => offC.toBlob(r, 'image/png'));
      thumbFile = new File([blob], 'thumb.png', {type: 'image/png'});
    }

    for (let i = 0; i < styles.length; i++) {
      if (gridGeneration !== gen) break; // aborted by a newer openStyleGrid call
      const s = styles[i];
      status.textContent = `Rendering ${i + 1} / ${styles.length}…`;

      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;border:2px solid transparent;border-radius:8px;padding:6px;transition:border-color 0.2s;';
      card.title = `Apply: ${s.label}`;
      card.addEventListener('mouseover', () => card.style.borderColor = 'var(--primary)');
      card.addEventListener('mouseout',  () => card.style.borderColor = 'transparent');

      const thumb = document.createElement('canvas');
      thumb.width = THUMB; thumb.height = THUMB;
      thumb.style.cssText = 'border-radius:4px;width:100%;display:block;';
      card.appendChild(thumb);

      const lbl = document.createElement('div');
      lbl.textContent = s.label;
      lbl.style.cssText = 'font-size:11px;margin-top:5px;color:var(--text);font-weight:500;text-align:center;';
      card.appendChild(lbl);

      container.appendChild(card);

      const thumbCtx = thumb.getContext('2d');

      if (isServer) {
        // Show loading placeholder while server fetch is in-flight
        thumbCtx.fillStyle = '#e5e7eb';
        thumbCtx.fillRect(0, 0, THUMB, THUMB);
        thumbCtx.fillStyle = '#9ca3af';
        thumbCtx.font = '11px sans-serif';
        thumbCtx.textAlign = 'center';
        thumbCtx.textBaseline = 'middle';
        thumbCtx.fillText('rendering…', THUMB / 2, THUMB / 2);

        // Server rendering: POST thumbnail image with this style to the server
        try {
          const serverUrl = document.getElementById('serverUrl').value.trim();
          const fd = new FormData();
          fd.append('file', thumbFile);
          fd.append('artStyle', document.getElementById('artStyle').value);
          fd.append('style', s.value);
          fd.append('brush', document.getElementById('brush').value);
          fd.append('seed', getSeed());
          fd.append('intensity', document.getElementById('intensity').value);
          fd.append('stroke', document.getElementById('stroke').value);
          fd.append('smoothing', document.getElementById('smoothing').value);
          fd.append('skipHatching', document.getElementById('skipHatching').checked);
          fd.append('colorize', document.getElementById('colorize').checked);
          fd.append('invert', document.getElementById('invert').checked);
          fd.append('contrast', document.getElementById('contrast').value);
          fd.append('saturation', document.getElementById('saturation').value);
          fd.append('hueShift', document.getElementById('hueShift').value);
          fd.append('resolution', '512');
          fd.append('aspect', '1:1');
          const resp = await fetch(serverUrl, {method: 'POST', body: fd});
          if (!resp.ok) throw new Error('Server error ' + resp.status);
          const resultBlob = await resp.blob();
          const img = await loadImageFromFile(new File([resultBlob], 'r.png'));
          thumbCtx.drawImage(img, 0, 0, THUMB, THUMB);
        } catch(err) {
          // Fallback: draw raw image on failure
          thumbCtx.clearRect(0, 0, THUMB, THUMB);
          const fit = fitCropRect(singleImage.width, singleImage.height, THUMB, THUMB);
          thumbCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, THUMB, THUMB);
          console.warn('Grid server render failed for', s.value, err);
        }
      } else {
        // Canvas rendering
        const fit = fitCropRect(singleImage.width, singleImage.height, THUMB, THUMB);
        thumbCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, THUMB, THUMB);
        document.getElementById('style').value = s.value;
        applySketchTransform(thumbCtx, THUMB, THUMB);
      }

      // Click: apply style and close
      card.addEventListener('click', () => {
        document.getElementById('style').value = s.value;
        pushUndo();
        if (renderingEngine === 'opencv') {
          renderCurrentImageWithOpenCV();
        } else {
          drawPreview();
        }
        modal.style.display = 'none';
      });

      await new Promise(r => setTimeout(r, 0)); // yield to browser between renders
    }

    // Only restore state if this is still the active generation (not aborted)
    if (gridGeneration === gen) {
      document.getElementById('style').value = origStyle;
      zoomLevel = origZoom;
      status.textContent = 'Click a style to apply it and close.';
    }
  }

  // initial blank canvas
  preview.width = 800; preview.height = 600; const pctx = preview.getContext('2d'); pctx.fillStyle = '#fff'; pctx.fillRect(0,0,preview.width,preview.height);
})();
