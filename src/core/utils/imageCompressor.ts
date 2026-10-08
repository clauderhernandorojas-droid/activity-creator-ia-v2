/**
 * Image compression utility to prevent LocalStorage QuotaExceededError.
 * Resizes large image Data URLs to max 1024px on the longest dimension
 * and compresses using Canvas JPEG at 0.75-0.80 quality.
 */
export function compressImageBase64(
  dataUrl: string,
  maxDimension = 1024,
  quality = 0.78
): Promise<string> {
  // If not a data URL or already tiny, return as-is
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return Promise.resolve(dataUrl);
  }

  // If already under 120KB, no need to recompress
  if (dataUrl.length < 120_000) {
    return Promise.resolve(dataUrl);
  }

  // In non-browser environments (SSR/tests), return as-is
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          let { width, height } = img;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          // Fill white background in case source is transparent PNG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG with balanced compression
          const compressed = canvas.toDataURL('image/jpeg', quality);

          // Only keep compressed if it actually reduced the size
          if (compressed && compressed.length < dataUrl.length) {
            resolve(compressed);
          } else {
            resolve(dataUrl);
          }
        } catch (canvasErr) {
          console.warn('[imageCompressor] Canvas compression failed, keeping original:', canvasErr);
          resolve(dataUrl);
        }
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    } catch (err) {
      console.warn('[imageCompressor] Unexpected error during compression:', err);
      resolve(dataUrl);
    }
  });
}
