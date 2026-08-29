import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const bucket = "teacher-avatars";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase environment variables are required");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: bucketInfo, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (!bucketInfo) {
  if (bucketLookupError && !/not found/i.test(bucketLookupError.message)) throw bucketLookupError;
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

const { data: profiles, error: profilesError } = await supabase
  .from("profiles")
  .select("id, avatar_url")
  .like("avatar_url", "data:image/%");
if (profilesError) throw profilesError;

let migrated = 0;
for (const profile of profiles ?? []) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(profile.avatar_url);
  if (!match) continue;

  const mimeType = match[1];
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const objectPath = `${profile.id}/${digest}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", profile.id)
    .eq("avatar_url", profile.avatar_url);
  if (updateError) throw updateError;
  migrated += 1;
}

console.log(`Migrated ${migrated} inline teacher avatar(s)`);
