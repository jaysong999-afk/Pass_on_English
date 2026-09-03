import sharp from "sharp";
import { fileURLToPath } from "node:url";

// Keep the source artwork; produce correctly sized, compact installation assets.
const source = new URL("../public/icons/icon-512.png", import.meta.url);
for (const size of [192, 512]) {
  const destination = new URL(`../public/icons/pwa-${size}.png`, import.meta.url);
  await sharp(fileURLToPath(source))
    .resize(size, size).png({ compressionLevel: 9 })
    .toFile(fileURLToPath(destination));
}
