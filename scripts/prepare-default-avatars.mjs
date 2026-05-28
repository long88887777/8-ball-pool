import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.env.AVATAR_SOURCE_DIR ?? 'C:/Users/86182/Desktop/aa';
const outputDir = path.resolve('public/assets/avatars');

const avatars = [
  {
    file: '台球游戏默认头像合集.png',
    output: 'default-01.webp',
    crop: { left: 360, top: 120, width: 980, height: 980 },
  },
  {
    file: '台球游戏默认头像合集 (1).png',
    output: 'default-02.webp',
    crop: { left: 300, top: 160, width: 980, height: 980 },
  },
  {
    file: '台球游戏默认头像合集 (2).png',
    output: 'default-03.webp',
    crop: { left: 280, top: 150, width: 1000, height: 1000 },
  },
  {
    file: '台球游戏默认头像合集 (3).png',
    output: 'default-04.webp',
    crop: { left: 220, top: 150, width: 1000, height: 1000 },
  },
  {
    file: '台球游戏默认头像合集 (4).png',
    output: 'default-05.webp',
    crop: { left: 120, top: 190, width: 1080, height: 1080 },
  },
  {
    file: '台球游戏默认头像合集 (5).png',
    output: 'default-06.webp',
    crop: { left: 360, top: 70, width: 980, height: 980 },
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
