const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function run() {
  const userInput = path.join(__dirname, '../assets/images/image.png');
  const userPlaystoreIcon = path.join(__dirname, '../assets/images/playstore_icon.png');
  const userPlaystoreFeature = path.join(__dirname, '../assets/images/playstore_feature_graphic.png');

  console.log('Generating playstore_icon.png (512x512)...');
  // Resize image.png to 512x512 for playstore_icon.png
  await sharp(userInput)
    .resize(512, 512)
    .toFile(userPlaystoreIcon);
  console.log('Saved playstore_icon.png!');

  console.log('Generating playstore_feature_graphic.png (1024x500)...');
  // Crop logo from image.png and place on 1024x500 #2b9760 background
  const logoResized = await sharp(userInput)
    .resize({ height: 350 }) // fit nicely inside 500px height
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 500,
      channels: 4,
      background: { r: 43, g: 151, b: 96, alpha: 1 } // #2b9760
    }
  })
    .composite([
      {
        input: logoResized,
        gravity: 'center'
      }
    ])
    .toFile(userPlaystoreFeature);
  console.log('Saved playstore_feature_graphic.png!');
}

run().catch(err => {
  console.error(err);
});
