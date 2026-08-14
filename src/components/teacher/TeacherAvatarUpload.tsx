"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, RotateCcw, Trash2, ZoomIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AVATAR_ACCEPT,
  AVATAR_VIEWPORT_SIZE,
  avatarFilename,
  baseCoverScale,
  blobToDataUrl,
  cropImageToBlob,
  downloadImageUrl,
  initialCropTransform,
  loadImageFromFile,
  validateAvatarFile,
  type AvatarCropTransform,
} from "@/lib/teacher-avatar";
import { cn } from "@/lib/utils";

/** Ready for future S3 / Supabase upload — pass `file` to your storage API. */
export interface TeacherAvatarUploadResult {
  previewUrl: string;
  file: Blob;
  /** MVP in-memory store; omit when uploading to storage and use public URL instead */
  dataUrl?: string;
}

export interface TeacherAvatarUploadLabels {
  profilePhoto?: string;
  upload?: string;
  change?: string;
  download?: string;
  remove?: string;
  adjustCrop?: string;
  zoom?: string;
  applyCrop?: string;
  reset?: string;
  cancel?: string;
  hint?: string;
  cropHint?: string;
}

const DEFAULT_LABELS: Required<TeacherAvatarUploadLabels> = {
  profilePhoto: "Profile photo",
  upload: "Upload photo",
  change: "Change photo",
  download: "Download",
  remove: "Remove",
  adjustCrop: "Adjust crop",
  zoom: "Zoom",
  applyCrop: "Apply crop",
  reset: "Reset",
  cancel: "Cancel",
  hint: "JPEG, PNG, or WebP · max 5 MB. Cropped file is ready for storage upload when connected.",
  cropHint: "Drag to reposition. Output: square 512×512 JPEG.",
};

export interface TeacherAvatarUploadProps {
  value?: string;
  displayName?: string;
  onChange: (result: TeacherAvatarUploadResult | null) => void;
  /** Admin: show download of current image */
  allowDownload?: boolean;
  disabled?: boolean;
  className?: string;
  labels?: TeacherAvatarUploadLabels;
}

type Step = "preview" | "crop";

export function TeacherAvatarUpload({
  value,
  displayName = "Teacher",
  onChange,
  allowDownload = false,
  disabled = false,
  className,
  labels: labelsProp,
}: TeacherAvatarUploadProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const cropSourceUrlRef = useRef<string | null>(null);

  const [step, setStep] = useState<Step>("preview");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropTransform, setCropTransform] = useState<AvatarCropTransform | null>(null);
  const [localPreview, setLocalPreview] = useState<string | undefined>(value);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  const previewUrl = localPreview ?? value;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    setLocalPreview(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (cropSourceUrlRef.current) {
        URL.revokeObjectURL(cropSourceUrlRef.current);
        cropSourceUrlRef.current = null;
      }
    };
  }, []);

  const resetCropState = useCallback(() => {
    setStep("preview");
    setSourceImage(null);
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    setCropSourceUrl(null);
    setCropTransform(null);
  }, []);

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setError("");
    const validation = validateAvatarFile(file);
    if (validation) {
      setError(validation);
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = await loadImageFromFile(file, objectUrl);
      cropSourceUrlRef.current = objectUrl;
      setSourceImage(img);
      setCropSourceUrl(objectUrl);
      setCropTransform(initialCropTransform(img));
      setStep("crop");
    } catch {
      setError("Could not load this image. Try another file.");
    }
  };

  const applyCrop = async () => {
    if (!sourceImage || !cropTransform) return;
    setProcessing(true);
    setError("");
    try {
      const blob = await cropImageToBlob(sourceImage, cropTransform);
      const dataUrl = await blobToDataUrl(blob);
      const file = new File([blob], avatarFilename(displayName), { type: "image/jpeg" });

      setLocalPreview(dataUrl);
      onChange({ previewUrl: dataUrl, file, dataUrl });
      resetCropState();
    } catch {
      setError("Failed to crop image. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    setLocalPreview(undefined);
    onChange(null);
    resetCropState();
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    downloadImageUrl(previewUrl, avatarFilename(displayName));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropTransform) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: cropTransform.offsetX,
      oy: cropTransform.offsetY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !cropTransform) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setCropTransform({
      ...cropTransform,
      offsetX: dragRef.current.ox + dx,
      offsetY: dragRef.current.oy + dy,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const drawStyle =
    sourceImage && cropTransform
      ? (() => {
          const cover = baseCoverScale(sourceImage);
          const scale = cover * cropTransform.scale;
          const w = sourceImage.naturalWidth * scale;
          const h = sourceImage.naturalHeight * scale;
          return {
            width: w,
            height: h,
            transform: `translate(${cropTransform.offsetX}px, ${cropTransform.offsetY}px)`,
          };
        })()
      : undefined;

  return (
    <div className={cn("space-y-3", className)}>
      <Label>{labels.profilePhoto}</Label>

      {step === "preview" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-24 w-24 rounded-2xl border-2 border-gray-100 shadow-sm">
            {previewUrl && !previewUrl.startsWith("blob:") ? (
              <AvatarImage
                key={previewUrl}
                src={previewUrl}
                alt={displayName}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="rounded-2xl text-lg">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex flex-1 flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className="gap-1.5"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {previewUrl ? labels.change : labels.upload}
            </Button>
            {allowDownload && previewUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
                {labels.download}
              </Button>
            )}
            {previewUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-red-600 hover:text-red-700"
                disabled={disabled}
                onClick={handleRemove}
              >
                <Trash2 className="h-4 w-4" />
                {labels.remove}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "crop" && sourceImage && cropTransform && (
        <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
          <p className="text-sm font-medium text-gray-800">{labels.adjustCrop}</p>
          <div
            className="relative mx-auto overflow-hidden rounded-2xl border-2 border-white bg-gray-900 shadow-inner touch-none"
            style={{ width: AVATAR_VIEWPORT_SIZE, height: AVATAR_VIEWPORT_SIZE }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropSourceUrl ?? undefined}
              alt="Crop preview"
              draggable={false}
              className="absolute left-0 top-0 max-w-none select-none"
              style={drawStyle}
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/30" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <ZoomIn className="h-3.5 w-3.5" />
              {labels.zoom}
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={cropTransform.scale}
              onChange={(e) =>
                setCropTransform({ ...cropTransform, scale: Number(e.target.value) })
              }
              className="w-full accent-emerald-600"
              aria-label="Zoom"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={processing}
              onClick={applyCrop}
            >
              {processing ? "Processing…" : labels.applyCrop}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={processing}
              onClick={() => {
                if (sourceImage) setCropTransform(initialCropTransform(sourceImage));
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {labels.reset}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={processing}
              onClick={() => {
                resetCropState();
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              {labels.cancel}
            </Button>
          </div>
          <p className="text-xs text-gray-500">{labels.cropHint}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">{labels.hint}</p>
    </div>
  );
}
