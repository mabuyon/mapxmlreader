
'use strict';

const NS_ZMN = 'http://www.moj.go.jp/MINJI/tizuzumen';
const NS_MAP = 'http://www.moj.go.jp/MINJI/tizuxml';
const EARTH_RADIUS = 6378137;
const TILE_SIZE = 256;
const MAP_TAGS = {
  boundaryLine: '\u7B46\u754C\u7DDA',
  boundaryPoint: '\u7B46\u754C\u70B9',
  refPoint: '\u57FA\u6E96\u70B9',
  parcel: '\u7B46',
  frame: '\u56F3\u90ED',
  shape: '\u5F62\u72B6',
  name: '\u540D\u79F0',
  landNumber: '\u5730\u756A',
  mapNumber: '\u5730\u56F3\u756A\u53F7',
  scale: '\u7E2E\u5C3A',
  northEast: '\u5317\u6771\u5EA7\u6A19',
  southEast: '\u5357\u6771\u5EA7\u6A19',
  southWest: '\u5357\u897F\u5EA7\u6A19',
  northWest: '\u5317\u897F\u5EA7\u6A19'
};
const DEM_TILE_CONFIG = {
  dem1a_png: { label: 'DEM1A PNG', minZoom: 1, maxZoom: 17 },
  dem5a_png: { label: 'DEM5A PNG', minZoom: 1, maxZoom: 15 },
  dem5b_png: { label: 'DEM5B PNG', minZoom: 1, maxZoom: 15 },
  dem5c_png: { label: 'DEM5C PNG', minZoom: 1, maxZoom: 15 },
  dem_png: { label: 'DEM10B PNG', minZoom: 1, maxZoom: 14 }
};

/* -------------------- tabs -------------------- */
for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.tab-btn')) b.classList.toggle('active', b === btn);
    for (const panel of document.querySelectorAll('.panel')) panel.classList.toggle('active', panel.id === btn.dataset.tab);
  });
}

/* -------------------- helpers -------------------- */
function fmtSize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
}
function fmtNum(n, digits = 3) {
  return Number.isFinite(n) ? Number(n).toFixed(digits) : '-';
}
function uiYield() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}
function els(parent, ns, name) {
  return Array.from(parent.getElementsByTagNameNS(ns, name));
}
function txt(el, ns, name) {
  const found = el.getElementsByTagNameNS(ns, name);
  return found.length ? (found[0].textContent || '').trim() : '';
}
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
function isFiniteCoord(v) {
  return Number.isFinite(v) && !Number.isNaN(v);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function lon2tileX(lon, z) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, z));
}
function lat2tileY(lat, z) {
  const rad = lat * Math.PI / 180;
  const n = Math.pow(2, z);
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
}
function lon2pixelX(lon, z) {
  return ((lon + 180) / 360 * Math.pow(2, z) * TILE_SIZE);
}
function lat2pixelY(lat, z) {
  const rad = lat * Math.PI / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z) * TILE_SIZE);
}
function pixelX2lon(px, z) {
  return px / (Math.pow(2, z) * TILE_SIZE) * 360 - 180;
}
function pixelY2lat(py, z) {
  const n = Math.PI - 2 * Math.PI * py / (Math.pow(2, z) * TILE_SIZE);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function groundResolution(lat, z) {
  return 156543.03392804097 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
}
function decodeElevation(r, g, b) {
  const x = (r << 16) + (g << 8) + b;
  if (x === 8388608) return NaN;
  if (r === 128 && g === 0 && b === 0) return NaN;
  return x < 8388608 ? x * 0.01 : (x - 16777216) * 0.01;
}
async function readXmlTextFromFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip 縺ｮ隱ｭ霎ｼ縺ｫ螟ｱ謨励＠縺ｾ縺励◆');
    const zip = await JSZip.loadAsync(buffer);
    const entry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.xml'));
    if (!entry) throw new Error('ZIP蜀・↓ XML 繝輔ぃ繧､繝ｫ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ');
    return entry.async('string');
  }
  return new TextDecoder('utf-8').decode(bytes);
}
async function readXmlDocFromFile(file) {
  const xmlText = await readXmlTextFromFile(file);
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) throw new Error('XML隗｣譫舌お繝ｩ繝ｼ: ' + parseErr.textContent.slice(0, 200));
  return { xmlText, doc };
}

/* -------------------- coordinate workflow -------------------- */
const coordUi = {
  dropZone: document.getElementById('coordDropZone'),
  fileInput: document.getElementById('coordFileInput'),
  fileBadge: document.getElementById('coordFileBadge'),
  fileName: document.getElementById('coordFileName'),
  fileSize: document.getElementById('coordFileSize'),
  removeBtn: document.getElementById('coordRemoveBtn'),
  convertBtn: document.getElementById('coordConvertBtn'),
  progressSec: document.getElementById('coordProgressSection'),
  progressFill: document.getElementById('coordProgressFill'),
  progressLabel: document.getElementById('coordProgressLabel'),
  warnBox: document.getElementById('coordWarnBox'),
  errorBox: document.getElementById('coordErrorBox'),
  successBox: document.getElementById('coordSuccessBox')
};
let coordSelectedFile = null;

coordUi.dropZone.addEventListener('click', () => coordUi.fileInput.click());
coordUi.dropZone.addEventListener('dragover', e => { e.preventDefault(); coordUi.dropZone.classList.add('drag-over'); });
coordUi.dropZone.addEventListener('dragleave', () => coordUi.dropZone.classList.remove('drag-over'));
coordUi.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  coordUi.dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setCoordFile(e.dataTransfer.files[0]);
});
coordUi.fileInput.addEventListener('change', () => {
  if (coordUi.fileInput.files[0]) setCoordFile(coordUi.fileInput.files[0]);
});
coordUi.removeBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearCoordFile();
});

function hideCoordMessages() {
  coordUi.warnBox.style.display = 'none';
  coordUi.errorBox.style.display = 'none';
  coordUi.successBox.style.display = 'none';
  coordUi.progressSec.style.display = 'none';
}
function showCoordError(msg) {
  coordUi.errorBox.textContent = '繧ｨ繝ｩ繝ｼ: ' + msg;
  coordUi.errorBox.style.display = 'block';
}
function setCoordProgress(v, msg) {
  coordUi.progressFill.style.width = v + '%';
  coordUi.progressLabel.textContent = msg;
}
function setCoordFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xml' && ext !== 'zip') {
    showCoordError('XML 縺ｾ縺溘・ ZIP 繝輔ぃ繧､繝ｫ繧呈欠螳壹＠縺ｦ縺上□縺輔＞');
    return;
  }
  coordSelectedFile = file;
  coordUi.fileName.textContent = file.name;
  coordUi.fileSize.textContent = fmtSize(file.size);
  coordUi.fileBadge.style.display = 'flex';
  coordUi.convertBtn.disabled = false;
  hideCoordMessages();
}
function clearCoordFile() {
  coordSelectedFile = null;
  coordUi.fileInput.value = '';
  coordUi.fileBadge.style.display = 'none';
  coordUi.convertBtn.disabled = true;
  hideCoordMessages();
}

coordUi.convertBtn.addEventListener('click', async () => {
  if (!coordSelectedFile) return;
  coordUi.convertBtn.disabled = true;
  hideCoordMessages();
  coordUi.progressSec.style.display = 'block';
  setCoordProgress(0, '繝輔ぃ繧､繝ｫ隱ｭ霎ｼ荳ｭ...');
  try {
    const { xmlText, doc } = await readXmlDocFromFile(coordSelectedFile);
    if (xmlText.length > 10_000_000) {
      coordUi.warnBox.textContent = 'Large XML. Processing may take time.';
      coordUi.warnBox.style.display = 'block';
      await uiYield();
    }

    setCoordProgress(16, 'Parsing points...');
    await uiYield();
    const points = parsePoints(doc);

    setCoordProgress(32, `Parsing curves... ${points.size} points`);
    await uiYield();
    const curves = parseCurves(doc, points);

    setCoordProgress(52, `Parsing surfaces... ${curves.size} curves`);
    await uiYield();
    const surfaces = parseSurfaces(doc);

    setCoordProgress(68, 'Parsing boundaries and reference points...');
    await uiYield();
    const boundaryLines = parseBoundaryLines(doc);
    const boundaryPoints = parseBoundaryPoints(doc);
    const refPoints = parseRefPoints(doc);

    setCoordProgress(78, 'Parsing parcel labels...');
    await uiYield();
    const parcels = parseParcels(doc);

    setCoordProgress(86, 'Parsing frames...');
    await uiYield();
    const frames = parseFrames(doc);

    setCoordProgress(92, 'Building DXF...');
    await uiYield();
    const dxf = generateCoordinateDxf({
      points, curves, surfaces, boundaryLines, boundaryPoints, refPoints, parcels, frames
    });

    const filename = coordSelectedFile.name.replace(/\.[^.]+$/, '') + '.dxf';
    downloadTextFile(filename, dxf);

    const validBoundary = boundaryLines.filter(line => line.curveId && curves.has(line.curveId)).length;
    coordUi.successBox.innerHTML =
      `DXF created: <b>${escapeHtml(filename)}</b><br>` +
      `Points ${points.size} / Curves ${curves.size} / Surfaces ${surfaces.size}<br>` +
      `Boundaries ${boundaryLines.length} (valid ${validBoundary}) / Parcels ${parcels.length} / Boundary points ${boundaryPoints.length}`;
    coordUi.successBox.style.display = 'block';
    setCoordProgress(100, 'Done');
  } catch (err) {
    showCoordError(err.message);
    console.error(err);
  } finally {
    coordUi.convertBtn.disabled = false;
  }
});

function parsePoints(doc) {
  const map = new Map();
  for (const el of els(doc, NS_ZMN, 'GM_Point')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const xEl = el.getElementsByTagNameNS(NS_ZMN, 'X')[0];
    const yEl = el.getElementsByTagNameNS(NS_ZMN, 'Y')[0];
    if (xEl && yEl) map.set(id, [parseFloat(xEl.textContent), parseFloat(yEl.textContent)]);
  }
  return map;
}
function parseCurves(doc, points) {
  const map = new Map();
  for (const el of els(doc, NS_ZMN, 'GM_Curve')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const coords = [];
    const xEls = el.getElementsByTagNameNS(NS_ZMN, 'X');
    const yEls = el.getElementsByTagNameNS(NS_ZMN, 'Y');
    if (xEls.length > 0 && xEls.length === yEls.length) {
      for (let i = 0; i < xEls.length; i++) {
        coords.push([parseFloat(xEls[i].textContent), parseFloat(yEls[i].textContent)]);
      }
    }
    if (coords.length === 0) {
      const walkRef = node => {
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          if (child.nodeType !== 1) continue;
          if (child.namespaceURI === NS_ZMN && child.localName === 'GM_PointRef.point') {
            const idref = child.getAttribute('idref');
            if (idref && points.has(idref)) coords.push(points.get(idref));
          } else {
            walkRef(child);
          }
        }
      };
      walkRef(el);
    }
    if (coords.length >= 2) map.set(id, coords);
  }
  return map;
}
function parseSurfaces(doc) {
  const map = new Map();
  for (const el of els(doc, NS_ZMN, 'GM_Surface')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const curveIds = [];
    const walkGen = node => {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType !== 1) continue;
        if (child.namespaceURI === NS_ZMN && child.localName === 'GM_CompositeCurve.generator') {
          const idref = child.getAttribute('idref');
          if (idref) curveIds.push(idref);
        } else {
          walkGen(child);
        }
      }
    };
    walkGen(el);
    map.set(id, curveIds);
  }
  return map;
}
function parseBoundaryLines(doc) {
  return els(doc, NS_MAP, MAP_TAGS.boundaryLine).map(el => {
    const shape = el.getElementsByTagNameNS(NS_MAP, MAP_TAGS.shape)[0];
    return { curveId: shape ? shape.getAttribute('idref') : null };
  });
}
function parseBoundaryPoints(doc) {
  return els(doc, NS_MAP, MAP_TAGS.boundaryPoint).map(el => {
    const shape = el.getElementsByTagNameNS(NS_MAP, MAP_TAGS.shape)[0];
    return { pointId: shape ? shape.getAttribute('idref') : null };
  });
}
function parseRefPoints(doc) {
  return els(doc, NS_MAP, MAP_TAGS.refPoint).map(el => {
    const shape = el.getElementsByTagNameNS(NS_MAP, MAP_TAGS.shape)[0];
    return { name: txt(el, NS_MAP, MAP_TAGS.name), pointId: shape ? shape.getAttribute('idref') : null };
  });
}
function parseParcels(doc) {
  return els(doc, NS_MAP, MAP_TAGS.parcel).map(el => {
    const shape = el.getElementsByTagNameNS(NS_MAP, MAP_TAGS.shape)[0];
    return {
      landNumber: txt(el, NS_MAP, MAP_TAGS.landNumber),
      surfaceId: shape ? shape.getAttribute('idref') : null
    };
  });
}
function parseFrames(doc) {
  const names = [MAP_TAGS.northEast, MAP_TAGS.southEast, MAP_TAGS.southWest, MAP_TAGS.northWest];
  return els(doc, NS_MAP, MAP_TAGS.frame).map(el => {
    const frame = {
      mapNumber: txt(el, NS_MAP, MAP_TAGS.mapNumber),
      scale: txt(el, NS_MAP, MAP_TAGS.scale)
    };
    for (const name of names) {
      const coordEl = el.getElementsByTagNameNS(NS_MAP, name)[0];
      if (!coordEl) continue;
      const xEl = coordEl.getElementsByTagNameNS(NS_ZMN, 'X')[0];
      const yEl = coordEl.getElementsByTagNameNS(NS_ZMN, 'Y')[0];
      if (xEl && yEl) frame[name] = [parseFloat(xEl.textContent), parseFloat(yEl.textContent)];
    }
    return frame;
  });
}

function generateCoordinateDxf(data) {
  const { points, curves, surfaces, boundaryLines, boundaryPoints, refPoints, parcels, frames } = data;
  const dxy = pt => [pt[1] * 1000, pt[0] * 1000];
  const f = n => (Number.isFinite(n) ? n : 0).toFixed(3);
  const centerOf = pts => {
    if (!pts.length) return null;
    let sx = 0;
    let sy = 0;
    for (const p of pts) { sx += p[0]; sy += p[1]; }
    return [sx / pts.length, sy / pts.length];
  };

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const coords of curves.values()) {
    for (const pt of coords) {
      const [dx, dy] = dxy(pt);
      if (dx < x0) x0 = dx;
      if (dx > x1) x1 = dx;
      if (dy < y0) y0 = dy;
      if (dy > y1) y1 = dy;
    }
  }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1000; y1 = 1000; }
  const margin = Math.max(x1 - x0, y1 - y0) * 0.02;
  const ox = x0 - margin;
  const oy = y0 - margin;
  const dxyT = pt => {
    const [px, py] = dxy(pt);
    return [px - ox, py - oy];
  };
  const lx1 = (x1 - x0) + 2 * margin;
  const ly1 = (y1 - y0) + 2 * margin;
  let scale = 500;
  if (frames.length && frames[0].scale) scale = parseInt(frames[0].scale, 10) || 500;
  const textHeight = scale * 3;
  return buildDxf({
    layers: [
      ['BOUNDARY', 1],
      ['LANDNUMBER', 3],
      ['BND_POINT', 5],
      ['REF_POINT', 2],
      ['FRAME', 7]
    ],
    extents: { width: lx1, height: ly1 },
    entities: writer => {
      for (const bl of boundaryLines) {
        if (!bl.curveId || !curves.has(bl.curveId)) continue;
        const pts = curves.get(bl.curveId);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = dxyT(pts[i]);
          const [bx, by] = dxyT(pts[i + 1]);
          writer.line('BOUNDARY', ax, ay, bx, by);
        }
      }

      for (const parcel of parcels) {
        if (!parcel.landNumber || !parcel.surfaceId || !surfaces.has(parcel.surfaceId)) continue;
        const allPts = [];
        for (const curveId of surfaces.get(parcel.surfaceId)) {
          if (curves.has(curveId)) allPts.push(...curves.get(curveId));
        }
        const c = centerOf(allPts);
        if (!c) continue;
        const [cx, cy] = dxyT(c);
        writer.text('LANDNUMBER', cx, cy, textHeight, parcel.landNumber, 1, 2);
      }

      for (const bp of boundaryPoints) {
        if (!bp.pointId || !points.has(bp.pointId)) continue;
        const [px, py] = dxyT(points.get(bp.pointId));
        writer.point('BND_POINT', px, py);
      }

      for (const rp of refPoints) {
        if (!rp.pointId || !points.has(rp.pointId)) continue;
        const [px, py] = dxyT(points.get(rp.pointId));
        writer.point('REF_POINT', px, py);
        if (rp.name) writer.text('REF_POINT', px + textHeight, py + textHeight, textHeight * 0.8, rp.name);
      }

      const names = [MAP_TAGS.northEast, MAP_TAGS.southEast, MAP_TAGS.southWest, MAP_TAGS.northWest];
      for (const frame of frames) {
        const corners = names.filter(name => frame[name]).map(name => dxyT(frame[name]));
        if (corners.length !== 4) continue;
        for (let i = 0; i < 4; i++) {
          const [ax, ay] = corners[i];
          const [bx, by] = corners[(i + 1) % 4];
          writer.line('FRAME', ax, ay, bx, by);
        }
        if (frame.mapNumber) {
          const cx = corners.reduce((sum, c) => sum + c[0], 0) / 4;
          const cy = corners.reduce((sum, c) => sum + c[1], 0) / 4;
          writer.text('FRAME', cx, cy, textHeight * 1.2, frame.mapNumber, 1, 2);
        }
      }
    }
  });
}

/* -------------------- elevation workflow -------------------- */
const rangeUi = {
  fileInput: document.getElementById('rangeFileInput'),
  fileBadge: document.getElementById('rangeFileBadge'),
  fileName: document.getElementById('rangeFileName'),
  fileSize: document.getElementById('rangeFileSize'),
  removeBtn: document.getElementById('rangeRemoveBtn'),
  warnBox: document.getElementById('rangeWarnBox')
};
let rangeSourceFile = null;

const bboxWest = document.getElementById('bboxWest');
const bboxEast = document.getElementById('bboxEast');
const bboxSouth = document.getElementById('bboxSouth');
const bboxNorth = document.getElementById('bboxNorth');
const demTypeEl = document.getElementById('demType');
const demZoomEl = document.getElementById('demZoom');
const sampleStepMetersEl = document.getElementById('sampleStepMeters');
const precheckBtn = document.getElementById('precheckBtn');
const precheckSummary = document.getElementById('precheckSummary');
const contourIntervalEl = document.getElementById('contourInterval');
const majorEveryEl = document.getElementById('majorEvery');
const pointSpacingEl = document.getElementById('pointSpacing');
const includePointLabelsEl = document.getElementById('includePointLabels');
const includeContourLabelsEl = document.getElementById('includeContourLabels');
const elevConvertBtn = document.getElementById('elevConvertBtn');
const elevProgressSec = document.getElementById('elevProgressSection');
const elevProgressFill = document.getElementById('elevProgressFill');
const elevProgressLabel = document.getElementById('elevProgressLabel');
const elevErrorBox = document.getElementById('elevErrorBox');
const elevSuccessBox = document.getElementById('elevSuccessBox');

let lastPrecheck = null;

function setRangeFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xml' && ext !== 'zip') {
    rangeUi.warnBox.textContent = 'Select an XML or ZIP file.';
    rangeUi.warnBox.style.display = 'block';
    return;
  }
  rangeSourceFile = file;
  rangeUi.fileName.textContent = file.name;
  rangeUi.fileSize.textContent = fmtSize(file.size);
  rangeUi.fileBadge.style.display = 'flex';
  rangeUi.warnBox.style.display = 'none';
}
function clearRangeFile() {
  rangeSourceFile = null;
  rangeUi.fileInput.value = '';
  rangeUi.fileBadge.style.display = 'none';
}

document.getElementById('loadRangeFromXmlBtn').addEventListener('click', () => rangeUi.fileInput.click());
rangeUi.fileInput.addEventListener('change', async () => {
  if (!rangeUi.fileInput.files[0]) return;
  setRangeFile(rangeUi.fileInput.files[0]);
  try {
    rangeUi.warnBox.style.display = 'none';
    const { doc } = await readXmlDocFromFile(rangeSourceFile);
    const frame = parseFrames(doc)[0];
    if (!frame) throw new Error('Frame not found in XML.');
    const bbox = extractLatLonBboxFromFrame(frame);
    if (!bbox) {
      throw new Error('Frame coordinates could not be interpreted as lon/lat. Enter the range manually.');
    }
    bboxWest.value = bbox.west.toFixed(6);
    bboxEast.value = bbox.east.toFixed(6);
    bboxSouth.value = bbox.south.toFixed(6);
    bboxNorth.value = bbox.north.toFixed(6);
    rangeUi.warnBox.textContent = 'Loaded range from frame.';
    rangeUi.warnBox.style.display = 'block';
  } catch (err) {
    rangeUi.warnBox.textContent = err.message;
    rangeUi.warnBox.style.display = 'block';
  }
});
rangeUi.removeBtn.addEventListener('click', clearRangeFile);

function extractLatLonBboxFromFrame(frame) {
  const names = [MAP_TAGS.northEast, MAP_TAGS.southEast, MAP_TAGS.southWest, MAP_TAGS.northWest];
  const pts = names.map(name => frame[name]).filter(Boolean);
  if (pts.length !== 4) return null;
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const byXY = { west: minX, east: maxX, south: minY, north: maxY };
  const byYX = { west: minY, east: maxY, south: minX, north: maxX };
  const isLatLon = b =>
    b.west >= -180 && b.east <= 180 && b.south >= -90 && b.north <= 90 && b.west < b.east && b.south < b.north;
  if (isLatLon(byXY)) return byXY;
  if (isLatLon(byYX)) return byYX;
  return null;
}

function rebuildZoomOptions() {
  const cfg = DEM_TILE_CONFIG[demTypeEl.value];
  const current = parseInt(demZoomEl.value || cfg.maxZoom, 10);
  demZoomEl.innerHTML = '';
  for (let z = cfg.maxZoom; z >= cfg.minZoom; z--) {
    const opt = document.createElement('option');
    opt.value = String(z);
    opt.textContent = `Z${z}`;
    if (z === clamp(current, cfg.minZoom, cfg.maxZoom)) opt.selected = true;
    demZoomEl.appendChild(opt);
  }
}
demTypeEl.addEventListener('change', rebuildZoomOptions);
rebuildZoomOptions();

function readBboxInputs() {
  const west = parseFloat(bboxWest.value);
  const east = parseFloat(bboxEast.value);
  const south = parseFloat(bboxSouth.value);
  const north = parseFloat(bboxNorth.value);
  if (![west, east, south, north].every(isFiniteCoord)) throw new Error('Enter west/east/south/north in lon/lat.');
  if (!(west < east && south < north)) throw new Error('Range min/max ordering is invalid.');
  if (west < -180 || east > 180 || south < -85 || north > 85) throw new Error('Range is outside Web Mercator limits.');
  return { west, east, south, north };
}
function renderPrecheckSummary(items) {
  precheckSummary.innerHTML = items.map(item =>
    `<div class="summary-item"><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.value)}</div>`
  ).join('');
}

precheckBtn.addEventListener('click', () => {
  try {
    hideElevationMessages();
    const bbox = readBboxInputs();
    const demType = demTypeEl.value;
    const zoom = parseInt(demZoomEl.value, 10);
    const sampleStepMeters = Math.max(1, parseFloat(sampleStepMetersEl.value) || 1);
    lastPrecheck = buildPrecheckInfo(bbox, demType, zoom, sampleStepMeters);
    renderPrecheckSummary([
      { label: 'Tile count', value: `${lastPrecheck.tileCount} tiles (${lastPrecheck.tileCols} x ${lastPrecheck.tileRows})` },
      { label: 'Estimated resolution', value: `${fmtNum(lastPrecheck.resolutionMeters, 2)} m / pixel` },
      { label: 'Range size', value: `${fmtNum(lastPrecheck.widthMeters, 1)} m x ${fmtNum(lastPrecheck.heightMeters, 1)} m` },
      { label: 'Sampling grid', value: `${lastPrecheck.sampleWidth} x ${lastPrecheck.sampleHeight}` },
      { label: 'Estimated download', value: `${fmtNum(lastPrecheck.tileCount * 0.10, 1)} MB` }
    ]);
  } catch (err) {
    showElevationError(err.message);
  }
});

function buildPrecheckInfo(bbox, demType, zoom, sampleStepMeters) {
  const tileX0 = lon2tileX(bbox.west, zoom);
  const tileX1 = lon2tileX(bbox.east, zoom);
  const tileY0 = lat2tileY(bbox.north, zoom);
  const tileY1 = lat2tileY(bbox.south, zoom);
  const tileCols = tileX1 - tileX0 + 1;
  const tileRows = tileY1 - tileY0 + 1;
  const tileCount = tileCols * tileRows;
  if (tileCount > 64) throw new Error('Too many tiles. Reduce the range so it stays within 64 tiles.');
  const centerLat = (bbox.south + bbox.north) / 2;
  const resolutionMeters = groundResolution(centerLat, zoom);
  const widthMeters = lonDistanceMeters(bbox.west, bbox.east, centerLat);
  const heightMeters = latDistanceMeters(bbox.south, bbox.north);
  return {
    bbox,
    demType,
    zoom,
    tileX0,
    tileX1,
    tileY0,
    tileY1,
    tileCols,
    tileRows,
    tileCount,
    resolutionMeters,
    widthMeters,
    heightMeters,
    sampleWidth: Math.max(2, Math.round(widthMeters / sampleStepMeters)),
    sampleHeight: Math.max(2, Math.round(heightMeters / sampleStepMeters))
  };
}

function hideElevationMessages() {
  elevErrorBox.style.display = 'none';
  elevSuccessBox.style.display = 'none';
}
function showElevationError(msg) {
  elevErrorBox.textContent = 'Error: ' + msg;
  elevErrorBox.style.display = 'block';
}
function setElevationProgress(v, msg) {
  elevProgressSec.style.display = 'block';
  elevProgressFill.style.width = v + '%';
  elevProgressLabel.textContent = msg;
}
function lonDistanceMeters(west, east, lat) {
  return (east - west) * Math.PI / 180 * EARTH_RADIUS * Math.cos(lat * Math.PI / 180);
}
function latDistanceMeters(south, north) {
  return (north - south) * Math.PI / 180 * EARTH_RADIUS;
}
function lonLatToLocalMm(lon, lat, centerLon, centerLat) {
  const xMeters = (lon - centerLon) * Math.PI / 180 * EARTH_RADIUS * Math.cos(centerLat * Math.PI / 180);
  const yMeters = (lat - centerLat) * Math.PI / 180 * EARTH_RADIUS;
  return [xMeters * 1000, yMeters * 1000];
}

elevConvertBtn.addEventListener('click', async () => {
  hideElevationMessages();
  try {
    const bbox = readBboxInputs();
    const demType = demTypeEl.value;
    const zoom = parseInt(demZoomEl.value, 10);
    const contourInterval = parseFloat(contourIntervalEl.value);
    const majorEvery = parseFloat(majorEveryEl.value);
    const pointSpacing = parseFloat(pointSpacingEl.value);
    const sampleStepMeters = Math.max(1, parseFloat(sampleStepMetersEl.value) || 1);
    lastPrecheck = buildPrecheckInfo(bbox, demType, zoom, sampleStepMeters);

    elevConvertBtn.disabled = true;
    setElevationProgress(5, 'Calculating tile range...');
    await uiYield();

    const raster = await fetchDemRaster(lastPrecheck, setElevationProgress);
    const levels = buildContourLevels(raster.minElevation, raster.maxElevation, contourInterval);

    setElevationProgress(70, 'Generating contours...');
    await uiYield();
    const contourSegments = generateContours(raster, levels);

    let elevPoints = [];
    if (pointSpacing > 0) {
      setElevationProgress(82, 'Sampling elevation points...');
      await uiYield();
      elevPoints = sampleElevationPoints(raster, pointSpacing);
    }

    setElevationProgress(92, 'Building DXF...');
    await uiYield();
    const dxf = generateElevationDxf({
      raster,
      contourSegments,
      contourInterval,
      majorEvery,
      elevPoints,
      includePointLabels: includePointLabelsEl.checked,
      includeContourLabels: includeContourLabelsEl.checked
    });

    const filename = `elevation_${demType}_z${zoom}.dxf`;
    downloadTextFile(filename, dxf);
    elevSuccessBox.innerHTML =
      `Elevation DXF created: <b>${escapeHtml(filename)}</b><br>` +
      `Range ${fmtNum(lastPrecheck.widthMeters, 1)}m x ${fmtNum(lastPrecheck.heightMeters, 1)}m / Tiles ${lastPrecheck.tileCount}<br>` +
      `Contour levels ${levels.length} / Elevation points ${elevPoints.length}`;
    elevSuccessBox.style.display = 'block';
    setElevationProgress(100, 'Done');
  } catch (err) {
    showElevationError(err.message);
    console.error(err);
  } finally {
    elevConvertBtn.disabled = false;
  }
});

async function fetchDemRaster(precheck, progressCallback) {
  const { bbox, demType, zoom, tileX0, tileX1, tileY0, tileY1, tileCount } = precheck;
  const pixelLeft = lon2pixelX(bbox.west, zoom);
  const pixelRight = lon2pixelX(bbox.east, zoom);
  const pixelTop = lat2pixelY(bbox.north, zoom);
  const pixelBottom = lat2pixelY(bbox.south, zoom);

  const cropLeft = Math.floor(pixelLeft - tileX0 * TILE_SIZE);
  const cropRight = Math.ceil(pixelRight - tileX0 * TILE_SIZE);
  const cropTop = Math.floor(pixelTop - tileY0 * TILE_SIZE);
  const cropBottom = Math.ceil(pixelBottom - tileY0 * TILE_SIZE);
  const width = Math.max(2, cropRight - cropLeft);
  const height = Math.max(2, cropBottom - cropTop);
  const tileCols = tileX1 - tileX0 + 1;
  const tileRows = tileY1 - tileY0 + 1;

  const stitchedCanvas = document.createElement('canvas');
  stitchedCanvas.width = tileCols * TILE_SIZE;
  stitchedCanvas.height = tileRows * TILE_SIZE;
  const stitchedCtx = stitchedCanvas.getContext('2d', { willReadFrequently: true });

  let loaded = 0;
  const tasks = [];
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) {
      tasks.push({ tx, ty });
    }
  }
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      const url = `https://cyberjapandata.gsi.go.jp/xyz/${demType}/${zoom}/${task.tx}/${task.ty}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`DEM tile fetch failed: ${response.status} ${url}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      stitchedCtx.drawImage(bitmap, (task.tx - tileX0) * TILE_SIZE, (task.ty - tileY0) * TILE_SIZE);
      bitmap.close();
      loaded++;
      progressCallback(10 + Math.round(45 * (loaded / tileCount)), `Downloading DEM tiles... ${loaded}/${tileCount}`);
      await uiYield();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

  progressCallback(58, 'Decoding elevations...');
  await uiYield();

  const image = stitchedCtx.getImageData(cropLeft, cropTop, width, height);
  const data = new Float32Array(width * height);
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const h = decodeElevation(image.data[p], image.data[p + 1], image.data[p + 2]);
    data[i] = Number.isFinite(h) ? h : NaN;
    if (Number.isFinite(h)) {
      if (h < minElevation) minElevation = h;
      if (h > maxElevation) maxElevation = h;
    }
  }
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    throw new Error('No valid elevation values were found.');
  }
  return {
    bbox,
    zoom,
    demType,
    width,
    height,
    data,
    minElevation,
    maxElevation,
    centerLon: (bbox.west + bbox.east) / 2,
    centerLat: (bbox.south + bbox.north) / 2,
    lonAtPixel: x => pixelX2lon(pixelLeft + x, zoom),
    latAtPixel: y => pixelY2lat(pixelTop + y, zoom)
  };
}

function buildContourLevels(minElevation, maxElevation, interval) {
  const start = Math.ceil(minElevation / interval) * interval;
  const levels = [];
  for (let h = start; h <= maxElevation; h += interval) {
    levels.push(Number(h.toFixed(6)));
  }
  return levels;
}

function sampleRaster(data, width, x, y) {
  return data[y * width + x];
}

function contourIntersections(v0, v1, v2, v3, level) {
  const pts = [];
  const addEdge = (a, b, edge) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if ((a < level && b < level) || (a > level && b > level) || a === b) return;
    const t = (level - a) / (b - a);
    if (t < 0 || t > 1) return;
    if (edge === 'top') pts.push([t, 0]);
    else if (edge === 'right') pts.push([1, t]);
    else if (edge === 'bottom') pts.push([1 - t, 1]);
    else if (edge === 'left') pts.push([0, 1 - t]);
  };
  addEdge(v0, v1, 'top');
  addEdge(v1, v2, 'right');
  addEdge(v2, v3, 'bottom');
  addEdge(v3, v0, 'left');
  return pts;
}

function generateContours(raster, levels) {
  const segments = [];
  const { width, height, data, lonAtPixel, latAtPixel, centerLon, centerLat } = raster;
  for (const level of levels) {
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const v0 = sampleRaster(data, width, x, y);
        const v1 = sampleRaster(data, width, x + 1, y);
        const v2 = sampleRaster(data, width, x + 1, y + 1);
        const v3 = sampleRaster(data, width, x, y + 1);
        const intersections = contourIntersections(v0, v1, v2, v3, level);
        if (intersections.length < 2) continue;
        if (intersections.length === 2) {
          segments.push({
            level,
            a: gridPointToLocalMm(x + intersections[0][0], y + intersections[0][1], lonAtPixel, latAtPixel, centerLon, centerLat),
            b: gridPointToLocalMm(x + intersections[1][0], y + intersections[1][1], lonAtPixel, latAtPixel, centerLon, centerLat)
          });
        } else if (intersections.length === 4) {
          segments.push({
            level,
            a: gridPointToLocalMm(x + intersections[0][0], y + intersections[0][1], lonAtPixel, latAtPixel, centerLon, centerLat),
            b: gridPointToLocalMm(x + intersections[1][0], y + intersections[1][1], lonAtPixel, latAtPixel, centerLon, centerLat)
          });
          segments.push({
            level,
            a: gridPointToLocalMm(x + intersections[2][0], y + intersections[2][1], lonAtPixel, latAtPixel, centerLon, centerLat),
            b: gridPointToLocalMm(x + intersections[3][0], y + intersections[3][1], lonAtPixel, latAtPixel, centerLon, centerLat)
          });
        }
      }
    }
  }
  return segments;
}

function gridPointToLocalMm(gridX, gridY, lonAtPixel, latAtPixel, centerLon, centerLat) {
  const lon = lonAtPixel(gridX);
  const lat = latAtPixel(gridY);
  return lonLatToLocalMm(lon, lat, centerLon, centerLat);
}

function sampleElevationPoints(raster, spacingMeters) {
  const { width, height, data, centerLon, centerLat, lonAtPixel, latAtPixel } = raster;
  const points = [];
  const lonStep = width > 1 ? Math.abs(lonDistanceMeters(lonAtPixel(0), lonAtPixel(1), centerLat)) : spacingMeters;
  const latStep = height > 1 ? Math.abs(latDistanceMeters(latAtPixel(1), latAtPixel(0))) : spacingMeters;
  const stepX = Math.max(1, Math.round(spacingMeters / Math.max(lonStep, 0.01)));
  const stepY = Math.max(1, Math.round(spacingMeters / Math.max(latStep, 0.01)));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const h = sampleRaster(data, width, x, y);
      if (!Number.isFinite(h)) continue;
      const [px, py] = lonLatToLocalMm(lonAtPixel(x), latAtPixel(y), centerLon, centerLat);
      points.push({ x: px, y: py, elevation: h });
    }
  }
  return points;
}

function generateElevationDxf(opts) {
  const {
    raster,
    contourSegments,
    majorEvery,
    elevPoints,
    includePointLabels,
    includeContourLabels
  } = opts;
  const corners = [
    lonLatToLocalMm(raster.bbox.west, raster.bbox.north, raster.centerLon, raster.centerLat),
    lonLatToLocalMm(raster.bbox.east, raster.bbox.north, raster.centerLon, raster.centerLat),
    lonLatToLocalMm(raster.bbox.east, raster.bbox.south, raster.centerLon, raster.centerLat),
    lonLatToLocalMm(raster.bbox.west, raster.bbox.south, raster.centerLon, raster.centerLat)
  ];
  const extents = boundsFromPoints(corners.concat(elevPoints.map(p => [p.x, p.y])));
  const textHeight = 1500;

  return buildDxf({
    layers: [
      ['CONTOUR_MAJOR', 3],
      ['CONTOUR_MINOR', 5],
      ['ELEV_POINT', 2],
      ['FRAME', 7]
    ],
    extents,
    entities: writer => {
      for (const seg of contourSegments) {
        const layer = Math.abs(seg.level / majorEvery - Math.round(seg.level / majorEvery)) < 1e-9
          ? 'CONTOUR_MAJOR'
          : 'CONTOUR_MINOR';
        writer.line(layer, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
        if (includeContourLabels && layer === 'CONTOUR_MAJOR') {
          const cx = (seg.a[0] + seg.b[0]) / 2;
          const cy = (seg.a[1] + seg.b[1]) / 2;
          writer.text(layer, cx, cy, textHeight * 0.8, String(seg.level), 1, 2);
        }
      }

      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        writer.line('FRAME', a[0], a[1], b[0], b[1]);
      }

      for (const p of elevPoints) {
        writer.point('ELEV_POINT', p.x, p.y);
        if (includePointLabels) writer.text('ELEV_POINT', p.x + textHeight, p.y + textHeight, textHeight * 0.7, p.elevation.toFixed(2));
      }
    }
  });
}

function boundsFromPoints(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  if (!Number.isFinite(minX)) return { width: 1000, height: 1000 };
  return {
    width: Math.max(1000, maxX - minX + 2000),
    height: Math.max(1000, maxY - minY + 2000)
  };
}

/* -------------------- shared DXF writer -------------------- */
function buildDxf({ layers, extents, entities }) {
  const width = Math.max(1000, extents.width);
  const height = Math.max(1000, extents.height);
  const out = [];
  const push = (...args) => { for (const arg of args) out.push(String(arg)); };
  const f = n => (Number.isFinite(n) ? n : 0).toFixed(3);
  const vhh = height * 1.15;
  const varAspect = Math.max(width / vhh, 0.1);
  const writer = {
    line(layer, x1, y1, x2, y2) {
      push('  0', 'LINE', '  8', layer,
        ' 10', f(x1), ' 20', f(y1), ' 30', '0.000',
        ' 11', f(x2), ' 21', f(y2), ' 31', '0.000');
    },
    point(layer, x, y) {
      push('  0', 'POINT', '  8', layer, ' 10', f(x), ' 20', f(y), ' 30', '0.000');
    },
    text(layer, x, y, heightMm, text, hAlign = 0, vAlign = 0) {
      push('  0', 'TEXT', '  8', layer,
        ' 10', f(x), ' 20', f(y), ' 30', '0.000',
        ' 40', f(heightMm), '  1', String(text),
        ' 72', String(hAlign), ' 73', String(vAlign),
        ' 11', f(x), ' 21', f(y), ' 31', '0.000');
    }
  };

  push('  0','SECTION','  2','HEADER',
    '  9','$ACADVER','  1','AC1009',
    '  9','$EXTMIN',' 10','0.000',' 20','0.000',' 30','0.000',
    '  9','$EXTMAX',' 10',f(width),' 20',f(height),' 30','0.000',
    '  9','$LIMMIN',' 10','0.000',' 20','0.000',
    '  9','$LIMMAX',' 10',f(width),' 20',f(height),
    '  0','ENDSEC');

  push('  0','SECTION','  2','TABLES');
  push('  0','TABLE','  2','VPORT',' 70','1',
    '  0','VPORT','  2','*ACTIVE',' 70','0',
    ' 10','0.0',' 20','0.0',' 11','1.0',' 21','1.0',
    ' 12',f(width / 2),' 22',f(height / 2),
    ' 13','0.0',' 23','0.0',
    ' 14','0.5',' 24','0.5',' 15','0.5',' 25','0.5',
    ' 16','0.0',' 26','0.0',' 36','1.0',
    ' 17','0.0',' 27','0.0',' 37','0.0',
    ' 40',f(vhh),' 41',f(varAspect),
    ' 42','50.0',' 43','0.0',' 44','0.0',
    ' 50','0.0',' 51','0.0',
    ' 71','0',' 72','1000',' 73','1',' 74','3',
    ' 75','0',' 76','0',' 77','0',' 78','0',
    '  0','ENDTAB');
  push('  0','TABLE','  2','LTYPE',' 70','1',
    '  0','LTYPE','  2','CONTINUOUS',' 70','0','  3','Solid line',' 72','65',' 73','0',' 40','0.0',
    '  0','ENDTAB');
  push('  0','TABLE','  2','LAYER',' 70', String(layers.length));
  for (const [name, color] of layers) {
    push('  0','LAYER','  2',name,' 70','0',' 62',String(color),'  6','CONTINUOUS');
  }
  push('  0','ENDTAB','  0','ENDSEC');
  push('  0','SECTION','  2','BLOCKS','  0','ENDSEC');
  push('  0','SECTION','  2','ENTITIES');
  entities(writer);
  push('  0','ENDSEC','  0','EOF');
  return out.join('\n');
}

