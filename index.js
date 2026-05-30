(function () {
  'use strict';

  const TARGET_SIZE = 200 * 1024; // 200 KB
  const MAX_ITERATIONS = 20;      // 二分法最大迭代次数
  const PRECISION = 0.005;        // 缩放比精度阈值

  const $ = (id) => document.getElementById(id);

  const uploadSection  = $('uploadSection');
  const uploadZone     = $('uploadZone');
  const fileInput      = $('fileInput');
  const previewSection = $('previewSection');
  const previewImage   = $('previewImage');
  const filenameInput  = $('filenameInput');
  const convertBtn     = $('convertBtn');
  const errorMessage   = $('errorMessage');
  const resultSection  = $('resultSection');
  const resultImage    = $('resultImage');
  const downloadBtn    = $('downloadBtn');
  const resetBtn       = $('resetBtn');

  const infoName      = $('infoName');
  const infoFormat    = $('infoFormat');
  const infoSize      = $('infoSize');
  const infoDimension = $('infoDimension');

  const cmpOrigSize   = $('cmpOrigSize');
  const cmpNewSize    = $('cmpNewSize');
  const cmpOrigDim    = $('cmpOrigDim');
  const cmpNewDim     = $('cmpNewDim');
  const cmpOrigFormat = $('cmpOrigFormat');

  let currentFile = null;
  let loadedImage = null;
  let resultBlob  = null;
  let resultWidth = 0;
  let resultHeight = 0;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getBaseName(filename) {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.substring(0, dot) : filename;
  }

  function getFormatName(mimeOrName) {
    const map = {
      'image/jpeg': 'JPEG',
      'image/jpg': 'JPEG',
      'image/png': 'PNG',
      'image/webp': 'WebP',
      'image/gif': 'GIF',
      'image/bmp': 'BMP',
      'image/svg+xml': 'SVG',
      'image/tiff': 'TIFF',
      'image/avif': 'AVIF',
      'image/heic': 'HEIC',
    };
    if (map[mimeOrName]) return map[mimeOrName];
    const ext = mimeOrName.split('.').pop().toUpperCase();
    return ext || '未知';
  }

  function canvasToBlob(img, scale) {
    return new Promise((resolve, reject) => {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, width: w, height: h });
          else reject(new Error('Canvas 导出失败'));
        },
        'image/png'
      );
    });
  }

  async function compressToPNG(img) {
    let result = await canvasToBlob(img, 1.0);
    if (result.blob.size <= TARGET_SIZE) {
      return result;
    }

    let lo = 0.01;
    let hi = 1.0;
    let best = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      result = await canvasToBlob(img, mid);

      if (result.blob.size <= TARGET_SIZE) {
        best = result;
        lo = mid; 
      } else {
        hi = mid;
      }

      if (hi - lo < PRECISION) break;
    }

    if (!best) {
      best = await canvasToBlob(img, lo);
    }

    return best;
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('无法加载此图片，请检查文件格式'));
      };

      img.src = url;
    });
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
  }

  function hideError() {
    errorMessage.classList.add('hidden');
  }

  function setLoading(loading) {
    const label = convertBtn.querySelector('.btn-label');
    if (loading) {
      convertBtn.classList.add('loading');
      convertBtn.disabled = true;
      label.textContent = '转换中…';
    } else {
      convertBtn.classList.remove('loading');
      convertBtn.disabled = false;
      label.textContent = '开始转换';
    }
  }

  function showPreview() {
    uploadSection.classList.add('hidden');
    previewSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    hideError();

    infoName.textContent = currentFile.name;
    infoFormat.textContent = getFormatName(currentFile.type || currentFile.name);
    infoSize.textContent = formatSize(currentFile.size);
    infoDimension.textContent = loadedImage
      ? `${loadedImage.naturalWidth} × ${loadedImage.naturalHeight}`
      : '—';

    previewImage.src = URL.createObjectURL(currentFile);

    filenameInput.value = getBaseName(currentFile.name);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showResult() {
    previewSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    const resultUrl = URL.createObjectURL(resultBlob);
    resultImage.src = resultUrl;

    cmpOrigSize.textContent = formatSize(currentFile.size);
    cmpNewSize.textContent = formatSize(resultBlob.size);
    cmpOrigDim.textContent = `${loadedImage.naturalWidth}×${loadedImage.naturalHeight}`;
    cmpNewDim.textContent = `${resultWidth}×${resultHeight}`;
    cmpOrigFormat.textContent = getFormatName(currentFile.type || currentFile.name);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetUI() {
    currentFile = null;
    loadedImage = null;
    resultBlob = null;
    resultWidth = 0;
    resultHeight = 0;

    uploadSection.classList.remove('hidden');
    previewSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    hideError();
    setLoading(false);
    filenameInput.value = '';
    fileInput.value = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showError('请选择一个图片文件');
      return;
    }

    currentFile = file;

    try {
      loadedImage = await loadImageFromFile(file);
      showPreview();
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleConvert() {
    if (!loadedImage) return;

    hideError();
    setLoading(true);

    try {
      await new Promise((r) => setTimeout(r, 50));

      const result = await compressToPNG(loadedImage);
      resultBlob = result.blob;
      resultWidth = result.width;
      resultHeight = result.height;

      setLoading(false);
      showResult();
    } catch (err) {
      setLoading(false);
      showError('转换失败：' + err.message);
    }
  }

  /** 检测是否为 iOS 设备 */
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function handleDownload() {
    if (!resultBlob) return;

    let name = filenameInput.value.trim();
    if (!name) name = getBaseName(currentFile.name);
    if (!name.toLowerCase().endsWith('.png')) name += '.png';

    const url = URL.createObjectURL(resultBlob);

    // iOS Safari 不支持 <a download> 编程式触发，改为新窗口打开让用户长按保存
    if (isIOS()) {
      const w = window.open(url, '_blank');
      if (!w) {
        // 弹窗被拦截时，直接在当前页面跳转
        window.location.href = url;
      }
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      // 降级：新窗口打开
      window.open(url, '_blank');
    }

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  uploadZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  convertBtn.addEventListener('click', handleConvert);

  downloadBtn.addEventListener('click', handleDownload);

  resetBtn.addEventListener('click', resetUI);
})();
