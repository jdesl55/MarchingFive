import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

ctx.fillStyle = '#0C0C0E';
ctx.fillRect(0, 0, WIDTH, HEIGHT);

const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2.2, 0, WIDTH / 2, HEIGHT / 2.2, 400);
gradient.addColorStop(0, 'rgba(232, 93, 38, 0.07)');
gradient.addColorStop(1, 'rgba(232, 93, 38, 0)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

ctx.fillStyle = 'rgba(240, 240, 240, 0.03)';
for (let y = 42; y < HEIGHT; y += 60) {
  for (let x = 42; x < WIDTH; x += 60) {
    ctx.fillRect(x, y, 6, 6);
  }
}

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

ctx.shadowColor = 'rgba(232, 93, 38, 0.4)';
ctx.shadowBlur = 40;
ctx.fillStyle = '#E85D26';
ctx.font = 'bold 88px Impact, Arial Black, sans-serif';
ctx.fillText('MarchingFive', WIDTH / 2, 230);

ctx.shadowBlur = 0;
ctx.fillStyle = '#E85D26';
ctx.fillText('MarchingFive', WIDTH / 2, 230);

ctx.font = '24px Arial, Helvetica, sans-serif';
ctx.fillStyle = '#F0F0F0';
ctx.fillText('Spin the year. Pick your player. Chase the high score.', WIDTH / 2, 300);

const positions = ['PG', 'SG', 'F', 'F', 'C'];
const slotWidth = 80;
const slotHeight = 40;
const slotGap = 16;
const totalWidth = positions.length * slotWidth + (positions.length - 1) * slotGap;
const startX = (WIDTH - totalWidth) / 2;
const slotY = 370;

positions.forEach((position, index) => {
  const x = startX + index * (slotWidth + slotGap);

  drawRoundedRect(x, slotY, slotWidth, slotHeight, 8);
  ctx.fillStyle = 'rgba(26, 26, 31, 0.8)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(232, 93, 38, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#E85D26';
  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.fillText(position, x + slotWidth / 2, slotY + slotHeight / 2 + 1);
});

ctx.font = '16px Arial, Helvetica, sans-serif';
ctx.fillStyle = '#7A7A85';
ctx.fillText('marchingfive.com', WIDTH / 2, 570);

const outputPath = path.join(__dirname, '..', 'public', 'og-image.png');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(outputPath, buffer);

console.log(`OG image generated at ${outputPath} (${buffer.length} bytes)`);
