export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_VIEWPORT_SIZE = 280;

export interface AvatarCropTransform {
  /** Multiplier on top of base cover scale */
  scale: number;
  /** Image top-left X in viewport (px) */
  offsetX: number;
  /** Image top-left Y in viewport (px) */
  offsetY: number;
}

export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export function loadImageFromFile(
  file: File,
  objectUrl?: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = objectUrl ?? URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!objectUrl) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (!objectUrl) URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export function baseCoverScale(
  image: HTMLImageElement,
  viewportSize = AVATAR_VIEWPORT_SIZE
): number {
  return Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight);
}

export function initialCropTransform(image: HTMLImageElement): AvatarCropTransform {
  const cover = baseCoverScale(image);
  const w = image.naturalWidth * cover;
  const h = image.naturalHeight * cover;
  return {
    scale: 1,
    offsetX: (AVATAR_VIEWPORT_SIZE - w) / 2,
    offsetY: (AVATAR_VIEWPORT_SIZE - h) / 2,
  };
}

export function cropImageToBlob(
  image: HTMLImageElement,
  transform: AvatarCropTransform,
  outputSize = AVATAR_OUTPUT_SIZE,
  viewportSize = AVATAR_VIEWPORT_SIZE
): Promise<Blob> {
  const cover = baseCoverScale(image, viewportSize);
  const drawScale = cover * transform.scale;
  const drawW = image.naturalWidth * drawScale;
  const drawH = image.naturalHeight * drawScale;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas unavailable"));
  }

  const scaleToOutput = outputSize / viewportSize;
  ctx.drawImage(
    image,
    transform.offsetX * scaleToOutput,
    transform.offsetY * scaleToOutput,
    drawW * scaleToOutput,
    drawH * scaleToOutput
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export image"));
      },
      "image/jpeg",
      0.92
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export function downloadImageUrl(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export function avatarFilename(displayName: string): string {
  const slug = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "teacher";
  return `${slug}-avatar.jpg`;
}
