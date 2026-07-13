// Klient tomonda rasmni siqish — skrinshotni Server Action orqali yuborishdan
// oldin o'lchamini kichraytiradi (matn o'qilarli qoladi, hajm ~100-400KB bo'ladi).

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Rasmni yuklab bo'lmadi"));
    img.src = src;
  });
}

export async function compressDataUrl(dataUrl: string, maxDim = 1280, quality = 0.7): Promise<string> {
  const img = await loadImage(dataUrl);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Shaffof PNG lar uchun oq fon (JPEG ga o'girilganda qora bo'lib qolmasin)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

export async function compressImageFile(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    fr.readAsDataURL(file);
  });
  return compressDataUrl(dataUrl, maxDim, quality);
}
