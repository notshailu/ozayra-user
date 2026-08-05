const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'assets', 'images', 'logo.jpeg');
const outputTransparentPath = path.join(__dirname, '..', 'assets', 'images', 'image_transparent.png');
const outputSplashPath = path.join(__dirname, '..', 'assets', 'images', 'splash.png');
const outputPaddedPath = path.join(__dirname, '..', 'assets', 'images', 'image_padded_transparent.png');

async function processImage() {
  try {
    const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });

    const sampleX = Math.floor(info.width / 2);
    const sampleY = 10;
    const pixelIndex = (sampleY * info.width + sampleX) * info.channels;
    
    const bgR = data[pixelIndex];
    const bgG = data[pixelIndex + 1];
    const bgB = data[pixelIndex + 2];
    
    console.log(`Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

    // Create a rounded rectangle SVG mask to cut off the white corners
    // We use rx and ry proportional to the image size (e.g. 15% of width)
    const radius = Math.floor(info.width * 0.20); 
    const svgMask = Buffer.from(
      `<svg width="${info.width}" height="${info.height}">
        <rect x="0" y="0" width="${info.width}" height="${info.height}" rx="${radius}" ry="${radius}" fill="white" />
      </svg>`
    );

    // Apply the mask to make corners transparent
    const maskedBuffer = await sharp(inputPath)
      .composite([{ input: svgMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Now resize the masked image for Adaptive Icon safe zone (55%)
    const scaleFactor = 0.55; 
    const newWidth = Math.floor(info.width * scaleFactor);
    const newHeight = Math.floor(info.height * scaleFactor);
    
    const resizedBuffer = await sharp(maskedBuffer)
      .resize(newWidth, newHeight, { fit: 'contain' })
      .toBuffer();

    const padX = Math.floor((info.width - newWidth) / 2);
    const padY = Math.floor((info.height - newHeight) / 2);

    // Pad with the exact background color
    const paddedBuffer = await sharp(resizedBuffer)
      .extend({
        top: padY,
        bottom: info.height - newHeight - padY,
        left: padX,
        right: info.width - newWidth - padX,
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 }
      })
      .png()
      .toBuffer();

    // Overwrite all outputs
    await sharp(paddedBuffer).toFile(outputPaddedPath);
    await sharp(paddedBuffer).toFile(outputTransparentPath);
    await sharp(paddedBuffer).toFile(outputSplashPath);

    console.log("Images successfully masked, padded, and saved!");
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

processImage();
