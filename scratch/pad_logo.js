const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'assets', 'images', 'logo.jpeg');
const outputTransparentPath = path.join(__dirname, '..', 'assets', 'images', 'image_transparent.png');
const outputSplashPath = path.join(__dirname, '..', 'assets', 'images', 'splash.png');
const outputPaddedPath = path.join(__dirname, '..', 'assets', 'images', 'image_padded_transparent.png');

async function processImage() {
  try {
    const { data, info } = await sharp(inputPath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Let's sample a pixel near the top center to get the EXACT yellow background color
    // Avoid corners in case they are white
    const sampleX = Math.floor(info.width / 2);
    const sampleY = 10;
    const pixelIndex = (sampleY * info.width + sampleX) * info.channels;
    
    const bgR = data[pixelIndex];
    const bgG = data[pixelIndex + 1];
    const bgB = data[pixelIndex + 2];
    
    console.log(`Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

    // For Android Adaptive Icons, the safe zone is 72/108 = 66% of the image.
    // So we resize the original image to 60% of the canvas to be safe.
    
    const scaleFactor = 0.55; 
    const newWidth = Math.floor(info.width * scaleFactor);
    const newHeight = Math.floor(info.height * scaleFactor);
    
    // We will resize the logo and then extend (pad) it back to the original size
    // using the exact background color we detected.
    
    const resizedBuffer = await sharp(inputPath)
      .resize(newWidth, newHeight, { fit: 'contain' })
      .toBuffer();

    const padX = Math.floor((info.width - newWidth) / 2);
    const padY = Math.floor((info.height - newHeight) / 2);

    const paddedBuffer = await sharp(resizedBuffer)
      .extend({
        top: padY,
        bottom: info.height - newHeight - padY,
        left: padX,
        right: info.width - newWidth - padX,
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 }
      })
      .png() // save as PNG
      .toBuffer();

    // Save as padded icon for adaptive icon
    await sharp(paddedBuffer).toFile(outputPaddedPath);
    
    // Also save it as transparent and splash so everything is uniform
    await sharp(paddedBuffer).toFile(outputTransparentPath);
    await sharp(paddedBuffer).toFile(outputSplashPath);

    console.log("Images have been padded successfully!");
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

processImage();
