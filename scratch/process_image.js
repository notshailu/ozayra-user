const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'assets', 'images', 'logo.jpeg');
const outputTransparentPath = path.join(__dirname, '..', 'assets', 'images', 'image_transparent.png');
const outputSplashPath = path.join(__dirname, '..', 'assets', 'images', 'splash.png');

async function processImage() {
  try {
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Loop through pixels and make white corners transparent
    // Assuming white is near 255,255,255
    const threshold = 235; // somewhat aggressive to catch anti-aliased edges
    
    // We'll only check pixels near the corners to avoid making internal whites transparent
    const w = info.width;
    const h = info.height;
    const cornerSize = Math.floor(Math.min(w, h) * 0.25); // Top/bottom left/right 25%

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const pixelIndex = i / info.channels;
      const x = pixelIndex % w;
      const y = Math.floor(pixelIndex / w);

      // Check if it's in a corner area
      const isTopLeft = x < cornerSize && y < cornerSize;
      const isTopRight = x > w - cornerSize && y < cornerSize;
      const isBottomLeft = x < cornerSize && y > h - cornerSize;
      const isBottomRight = x > w - cornerSize && y > h - cornerSize;

      if (isTopLeft || isTopRight || isBottomLeft || isBottomRight) {
        if (r > threshold && g > threshold && b > threshold) {
          // make transparent
          data[i + 3] = 0; 
        }
      }
    }

    const processedBuffer = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels
      }
    })
    .png()
    .toBuffer();

    await sharp(processedBuffer).toFile(outputTransparentPath);
    await sharp(processedBuffer).toFile(outputSplashPath);
    
    console.log("Images processed and saved!");
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

processImage();
