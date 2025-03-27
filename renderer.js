const { ipcRenderer } = require('electron');
const { CsvWriter } = require('csv-writer');
const fs = require('fs');

let currentFrameIndex = 0;
let associations = [];
let images = [];
let tempPoints = [];
let zoomLevel = 1;
let panOffset = { x: 0, y: 0 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let allRecordedPoints = {};

function updateRecordedPoints() {
    allRecordedPoints = {};
    associations.forEach(assoc => {
      if (!allRecordedPoints[assoc.frame1]) allRecordedPoints[assoc.frame1] = [];
      if (!allRecordedPoints[assoc.frame2]) allRecordedPoints[assoc.frame2] = [];
      
      allRecordedPoints[assoc.frame1].push({x: assoc.x1, y: assoc.y1});
      allRecordedPoints[assoc.frame2].push({x: assoc.x2, y: assoc.y2});
    });
  }

const csvWriter = CsvWriter({
  path: 'associations.csv',
  header: [
    { id: 'frame1', title: 'FRAME1' },
    { id: 'x1', title: 'X1' },
    { id: 'y1', title: 'Y1' },
    { id: 'frame2', title: 'FRAME2' },
    { id: 'x2', title: 'X2' },
    { id: 'y2', title: 'Y2' }
  ]
});

setInterval(() => {
  if (associations.length > 0) {
    csvWriter.writeRecords(associations)
      .then(() => {console.log('Autosaved at', new Date().toLocaleTimeString()); associations = [];});
  }
}, 30000);

document.getElementById('select-dir').addEventListener('click', async () => {
  const dirPath = await ipcRenderer.invoke('select-directory');
  images = await ipcRenderer.invoke('get-images', dirPath);
  if (images.length > 1) loadFramePair();
});

document.getElementById('next-pair').addEventListener('click', () => {
  if (currentFrameIndex < images.length - 2) {
    currentFrameIndex++;
    resetZoomPan();
    loadFramePair();
  }
});

document.getElementById('save-csv').addEventListener('click', () => {
  csvWriter.writeRecords(associations)
    .then(() => alert('CSV saved!'));
});

document.getElementById('zoom-in').addEventListener('click', () => {
  zoomLevel *= 1.2;
  applyZoomPan();
});

document.getElementById('zoom-out').addEventListener('click', () => {
  zoomLevel /= 1.2;
  applyZoomPan();
});

document.getElementById('reset-view').addEventListener('click', resetZoomPan);

function resetZoomPan() {
  zoomLevel = 1;
  panOffset = { x: 0, y: 0 };
  applyZoomPan();
}

function applyZoomPan() {
  const containers = ['frame1-container', 'frame2-container'];
  containers.forEach(id => {
    const container = document.getElementById(id);
    const img = container.querySelector('img');
    if (img) {
      img.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    }
  });
}

function setupDragEvents(containerId) {
  const container = document.getElementById(containerId);
  container.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      container.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      panOffset.x += e.clientX - lastMousePos.x;
      panOffset.y += e.clientY - lastMousePos.y;
      lastMousePos = { x: e.clientX, y: e.clientY };
      applyZoomPan();
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'crosshair';
  });

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel *= delta;
    applyZoomPan();
  });
}

function loadFramePair() {
    tempPoints = [];
    const frame1 = images[currentFrameIndex];
    const frame2 = images[currentFrameIndex + 1];
    const currentFrameNum1 = currentFrameIndex + 1;
    const currentFrameNum2 = currentFrameIndex + 2;
  
    document.getElementById('frame1').src = frame1;
    document.getElementById('frame2').src = frame2;
    document.getElementById('current-frame1').textContent = currentFrameNum1;
    document.getElementById('current-frame2').textContent = currentFrameNum2;
  
    clearMarkers();
    updateRecordedPoints();
    
    if (allRecordedPoints[currentFrameNum1]) {
      allRecordedPoints[currentFrameNum1].forEach(point => {
        addMarker(document.getElementById('frame1-container-markers'), point.x, point.y, 'yellow', true);
      });
    }
    
    if (allRecordedPoints[currentFrameNum2]) {
      allRecordedPoints[currentFrameNum2].forEach(point => {
        addMarker(document.getElementById('frame2-container-markers'), point.x, point.y, 'yellow', true);
      });
    }
  
    setupCanvasClick('frame1-container', 'frame1', true);
    setupCanvasClick('frame2-container', 'frame2', false);
}

function setupCanvasClick(containerId, imageId, isFirstFrame) {
  const container = document.getElementById(containerId);
  const img = document.getElementById(imageId);
  const markerLayer = document.getElementById(`${containerId}-markers`);

  img.onload = function() {
    const scale = Math.min(1, 500 / Math.max(img.width, img.height));
    img.style.transform = `scale(${scale})`;
    markerLayer.style.width = `${img.width}px`;
    markerLayer.style.height = `${img.height}px`;
  };

  container.onclick = (e) => {
    if (isDragging) return;

    const rect = img.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / (rect.width / img.naturalWidth));
    const y = Math.round((e.clientY - rect.top) / (rect.height / img.naturalHeight));

    const currentFrameNum = isFirstFrame ? currentFrameIndex + 1 : currentFrameIndex + 2;
    if (allRecordedPoints[currentFrameNum] && 
        allRecordedPoints[currentFrameNum].some(p => Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10)) {
      alert('This point has already been recorded!');
      return;
    }

    if (isFirstFrame) {
      tempPoints.push({ frame1: currentFrameNum, x1: x, y1: y });
      addMarker(markerLayer, x, y, 'red');
    } else if (tempPoints.length > 0) {
      const lastPoint = tempPoints[tempPoints.length - 1];
      associations.push({
        ...lastPoint,
        frame2: currentFrameIndex + 2,
        x2: x,
        y2: y
      });
      addMarker(markerLayer, x, y, 'blue');
      
      if (!allRecordedPoints[lastPoint.frame1]) allRecordedPoints[lastPoint.frame1] = [];
      if (!allRecordedPoints[currentFrameIndex + 2]) allRecordedPoints[currentFrameIndex + 2] = [];
      
      allRecordedPoints[lastPoint.frame1].push({x: lastPoint.x1, y: lastPoint.y1});
      allRecordedPoints[currentFrameIndex + 2].push({x: x, y: y});
      
      tempPoints.pop();
    }
  };
}

function addMarker(layer, x, y, color) {
    const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.left = `${x - (isExisting ? 8 : 5)}px`;
  marker.style.top = `${y - (isExisting ? 8 : 5)}px`;
  marker.style.backgroundColor = color;
  marker.style.width = `${isExisting ? 16 : 10}px`;
  marker.style.height = `${isExisting ? 16 : 10}px`;
  marker.style.border = isExisting ? '3px solid white' : '2px solid white';
  marker.style.opacity = isExisting ? '0.8' : '1';
  layer.appendChild(marker);
}

function clearMarkers() {
  document.querySelectorAll('.marker-layer').forEach(layer => {
    layer.innerHTML = '';
  });
}

setupDragEvents('frame1-container');
setupDragEvents('frame2-container');