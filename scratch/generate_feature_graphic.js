const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'assets', 'images', 'logo.jpeg');
const outputPath = path.join(__dirname, '..', 'assets', 'images', 'feature_graphic.png');

async function processImage() {
  try {
    const { data, info } = await sharp(inputPath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const sampleX = Math.floor(info.width / 2);
    const sampleY = 10;
    const pixelIndex = (sampleY * info.width + sampleX) * info.channels;
    
    const bgR = data[pixelIndex];
    const bgG = data[pixelIndex + 1];
    const bgB = data[pixelIndex + 2];
    
    console.log(`Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

    // Target dimensions for Play Store Feature Graphic
    const targetWidth = 1024;
    const targetHeight = 500;

    // Resize logo to fit nicely in the center (e.g. 350px tall)
    const logoHeight = 350;
    const resizedLogo = await sharp(inputPath)
      .resize({ height: logoHeight, fit: 'contain' })
      .toBuffer();

    // Create a 1024x500 background and composite the logo in the center
    await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 }
      }
    })
    .composite([
      {
        input: resizedLogo,
        gravity: 'center'
      }
    ])
    .png()
    .toFile(outputPath);

    console.log(`Successfully generated Feature Graphic at: ${outputPath}`);
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

processImage();
