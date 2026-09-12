const sharp = require('sharp');
const path = require('path');

const inputFile = path.join(__dirname, '../assets/images/logo.jpeg');
const outputFile = path.join(__dirname, '../assets/images/playstore_icon.png'); // Overwrite the existing one

sharp(inputFile)
  .resize(512, 512, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  })
  .toFormat('png')
  .toFile(outputFile)
  .then(() => {
    console.log('Successfully generated Play Store icon (512x512) at:', outputFile);
  })
  .catch(err => {
    console.error('Error generating icon:', err);
  });
