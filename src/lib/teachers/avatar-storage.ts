import { createHash } from "crypto";
import { createPrivilegedClient } from "@/lib/supabase/admin";

const AVATAR_BUCKET = "teacher-avatars";
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function ensureAvatarBucket() {
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase.storage.getBucket(AVATAR_BUCKET);
  if (data) return supabase;

  if (error && !/not found/i.test(error.message)) {
    throw new Error(`avatar_bucket_lookup_failed: ${error.message}`);
  }

  const { error: createError } = await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`avatar_bucket_create_failed: ${createError.message}`);
  }
  return supabase;
}

/** Store legacy inline image data outside PostgREST and return its cacheable public URL. */
export async function persistTeacherAvatarUrl(
  teacherId: string,
  avatarUrl: string | undefined
): Promise<string | undefined> {
  if (avatarUrl === undefined || !avatarUrl.startsWith("data:")) return avatarUrl;

  const match = DATA_URL_PATTERN.exec(avatarUrl);
  if (!match) throw new Error("invalid_avatar_data_url");

  const [, mimeType, encoded] = match;
  const bytes = Buffer.from(encoded.replace(/\s/g, ""), "base64");
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    throw new Error("invalid_avatar_file_size");
  }

  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const objectPath = `${teacherId}/${digest}.${extensionForMimeType(mimeType)}`;
  const supabase = await ensureAvatarBucket();
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(objectPath, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`avatar_upload_failed: ${error.message}`);

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}
