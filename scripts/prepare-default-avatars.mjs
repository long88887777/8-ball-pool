import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.env.AVATAR_SOURCE_DIR ?? 'C:/Users/86182/Desktop/aa';
const outputDir = path.resolve('public/assets/avatars');

const avatars = [
  {
    file: '台球游戏默认头像合集.png',
    output: 'default-01.webp',
    crop: { left: 0, top: 0, width: 1500, height: 1500 },
  },
  {
    file: '台球游戏默认头像合集 (1).png',
    output: 'default-02.webp',
    crop: { left: 200, top: 0, width: 1600, height: 1600 },
  },
  {
    file: '台球游戏默认头像合集 (2).png',
    output: 'default-03.webp',
    crop: { left: 170, top: 0, width: 1700, height: 1700 },
  },
  {
    file: '台球游戏默认头像合集 (3).png',
    output: 'default-04.webp',
    crop: { left: 0, top: 140, width: 1600, height: 1600 },
  },
  {
    file: '台球游戏默认头像合集 (4).png',
    output: 'default-05.webp',
    crop: { left: 210, top: 0, width: 1650, height: 1650 },
  },
  {
    file: '台球游戏默认头像合集 (5).png',
    output: 'default-06.webp',
    crop: { left: 0, top: 250, width: 1700, height: 1700 },
  },
];

await fs.mkdir(outputDir, { recursive: true });

for (const avatar of avatars) {
  const input = path.join(sourceDir, avatar.file);
  const output = path.join(outputDir, avatar.output);
  await sharp(input)
    .extract(avatar.crop)
    .resize(320, 320, { fit: 'cover' })
    .webp({ quality: 88 })
    .toFile(output);
  console.log(`wrote ${output}`);
}
