const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'assets', 'images', 'logo.jpeg');
const outputTransparentPath = path.join(__dirname, '..', 'assets', 'images', 'image_transparent.png');
const outputSplashPath = path.join(__dirname, '..', 'assets', 'images', 'splash.png');
const outputPaddedPath = path.join(__dirname, '..', 'assets', 'images', 'image_padded_transparent.png');

// Helper to calculate color distance
function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

async function processImage() {
  try {
    const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });

    // Sample background color slightly below the top to avoid white corners
    const sampleX = Math.floor(info.width / 2);
    const sampleY = Math.floor(info.height * 0.05); // 5% down
    const pixelIndex = (sampleY * info.width + sampleX) * info.channels;
    
    const bgR = data[pixelIndex];
    const bgG = data[pixelIndex + 1];
    const bgB = data[pixelIndex + 2];
    
    const hexColor = rgbToHex(bgR, bgG, bgB);
    console.log(`Detected solid background color: rgb(${bgR}, ${bgG}, ${bgB}) -> ${hexColor}`);

    // Flatten background
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // If it's close to the yellow background (jpeg noise)
      if (colorDist(r, g, b, bgR, bgG, bgB) < 65) {
        data[i] = bgR;
        data[i + 1] = bgG;
        data[i + 2] = bgB;
      } 
      // If it's close to white (the white corners)
      else if (colorDist(r, g, b, 255, 255, 255) < 80) {
        data[i] = bgR;
        data[i + 1] = bgG;
        data[i + 2] = bgB;
      }
    }

    // Convert flattened buffer back to image
    const flattenedBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels }
    })
    .png()
    .toBuffer();

    // Now resize the flattened image for Adaptive Icon safe zone (55%)
    const scaleFactor = 0.55; 
    const newWidth = Math.floor(info.width * scaleFactor);
    const newHeight = Math.floor(info.height * scaleFactor);
    
    const resizedBuffer = await sharp(flattenedBuffer)
      .resize(newWidth, newHeight, { fit: 'contain' })
      .toBuffer();

    const padX = Math.floor((info.width - newWidth) / 2);
    const padY = Math.floor((info.height - newHeight) / 2);

    // Pad with the exact flat background color
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

    console.log(`SUCCESS_COLOR:${hexColor}`);
    console.log("Images successfully flattened, padded, and saved!");
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

processImage();
