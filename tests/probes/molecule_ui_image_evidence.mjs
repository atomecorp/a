import fs from 'node:fs';
import { PNG } from 'pngjs';

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));

export const analyzePngSignal = (filePath) => {
    const png = readPng(filePath);
    let opaquePixels = 0;
    let nonBlackPixels = 0;
    let minimumLuma = 255;
    let maximumLuma = 0;
    const colors = new Set();
    for (let index = 0; index < png.data.length; index += 4) {
        const red = png.data[index];
        const green = png.data[index + 1];
        const blue = png.data[index + 2];
        const alpha = png.data[index + 3];
        if (alpha > 0) opaquePixels += 1;
        if (Math.max(red, green, blue) > 5 && alpha > 0) nonBlackPixels += 1;
        const luma = Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
        minimumLuma = Math.min(minimumLuma, luma);
        maximumLuma = Math.max(maximumLuma, luma);
        if (colors.size < 4096) colors.add(`${red}:${green}:${blue}:${alpha}`);
    }
    const pixelCount = Math.max(1, png.width * png.height);
    return {
        width: png.width,
        height: png.height,
        opaque_pixel_ratio: opaquePixels / pixelCount,
        non_black_pixel_ratio: nonBlackPixels / pixelCount,
        luma_range: maximumLuma - minimumLuma,
        sampled_color_count: colors.size
    };
};

export const diffPng = (leftPath, rightPath) => {
    const left = readPng(leftPath);
    const right = readPng(rightPath);
    if (left.width !== right.width || left.height !== right.height) {
        return { same_size: false, differing_pixel_ratio: 1, max_channel_delta: 255, mean_absolute_channel_delta: 255 };
    }
    let differingPixels = 0;
    let maxChannelDelta = 0;
    let absoluteDelta = 0;
    for (let index = 0; index < left.data.length; index += 4) {
        let differs = false;
        for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(left.data[index + channel] - right.data[index + channel]);
            absoluteDelta += delta;
            maxChannelDelta = Math.max(maxChannelDelta, delta);
            if (delta > 0) differs = true;
        }
        if (differs) differingPixels += 1;
    }
    const pixelCount = left.width * left.height;
    return {
        same_size: true,
        differing_pixel_ratio: differingPixels / Math.max(1, pixelCount),
        max_channel_delta: maxChannelDelta,
        mean_absolute_channel_delta: absoluteDelta / Math.max(1, left.data.length)
    };
};

export const diffPngRegion = (leftPath, rightPath, region = {}) => {
    const left = readPng(leftPath);
    const right = readPng(rightPath);
    if (left.width !== right.width || left.height !== right.height) {
        return { same_size: false, differing_pixel_ratio: 1, max_channel_delta: 255, mean_absolute_channel_delta: 255 };
    }
    const startX = Math.max(0, Math.floor(Number(region.x) || 0));
    const startY = Math.max(0, Math.floor(Number(region.y) || 0));
    const endX = Math.min(left.width, Math.ceil(startX + Math.max(1, Number(region.width) || 1)));
    const endY = Math.min(left.height, Math.ceil(startY + Math.max(1, Number(region.height) || 1)));
    let differingPixels = 0;
    let maxChannelDelta = 0;
    let absoluteDelta = 0;
    for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
            const index = ((y * left.width) + x) * 4;
            let differs = false;
            for (let channel = 0; channel < 4; channel += 1) {
                const delta = Math.abs(left.data[index + channel] - right.data[index + channel]);
                absoluteDelta += delta;
                maxChannelDelta = Math.max(maxChannelDelta, delta);
                if (delta > 0) differs = true;
            }
            if (differs) differingPixels += 1;
        }
    }
    const pixelCount = Math.max(1, (endX - startX) * (endY - startY));
    return {
        same_size: true,
        region: { x: startX, y: startY, width: endX - startX, height: endY - startY },
        differing_pixel_ratio: differingPixels / pixelCount,
        max_channel_delta: maxChannelDelta,
        mean_absolute_channel_delta: absoluteDelta / (pixelCount * 4)
    };
};

