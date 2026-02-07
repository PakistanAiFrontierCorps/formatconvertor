import heic2any from 'heic2any';
import { jsPDF } from 'jspdf';
import UTIF from 'utif';

/**
 * Converts a file to a target format.
 * @param {File} sourceFile 
 * @param {string} targetMimeType 
 * @returns {Promise<Blob>}
 */
export async function convertFile(sourceFile, targetMimeType) {
    console.log(`Converting ${sourceFile.name} (${sourceFile.type}) to ${targetMimeType}`);

    // Handle HEIC/HEIF specially
    if (sourceFile.name.toLowerCase().endsWith('.heic') || sourceFile.name.toLowerCase().endsWith('.heif')) {
        return convertHeic(sourceFile, targetMimeType);
    }

    // Handle PDF target
    if (targetMimeType === 'application/pdf') {
        return convertToPdf(sourceFile);
    }

    // Handle TIFF source
    if (sourceFile.type === 'image/tiff' || sourceFile.name.toLowerCase().endsWith('.tiff') || sourceFile.name.toLowerCase().endsWith('.tif')) {
        return convertTiff(sourceFile, targetMimeType);
    }

    // Default image conversion handling (Canvas based)
    return convertImageToImage(sourceFile, targetMimeType);
}

async function convertTiff(file, targetType) {
    const arrayBuffer = await file.arrayBuffer();
    const ifds = UTIF.decode(arrayBuffer);
    if (!ifds || ifds.length === 0) {
        throw new Error("Invalid TIFF file");
    }
    UTIF.decodeImage(arrayBuffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const width = ifds[0].width;
    const height = ifds[0].height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    if (targetType === 'image/jpeg' || targetType === 'image/bmp') {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = width;
        newCanvas.height = height;
        const newCtx = newCanvas.getContext('2d');
        newCtx.fillStyle = '#FFFFFF';
        newCtx.fillRect(0, 0, width, height);
        newCtx.drawImage(canvas, 0, 0);
        return new Promise(resolve => newCanvas.toBlob(resolve, targetType, 0.9));
    }

    return new Promise(resolve => canvas.toBlob(resolve, targetType, 0.9));
}

async function convertHeic(file, targetType) {
    // heic2any returns a blob (JPEG or PNG usually, default is PNG)
    // If target is JPEG or PNG, we can use it directly or re-convert
    try {
        const resultArgs = { blob: file, toType: targetType };
        // heic2any supports image/jpeg, image/png, image/gif
        // If target is unsupported by heic2any (e.g. webp directly?), we might get png first then convert
        const outputBlob = await heic2any(resultArgs);

        // Output can be an array if multiple images in HEIC, we take the first
        const finalBlob = Array.isArray(outputBlob) ? outputBlob[0] : outputBlob;
        return finalBlob;
    } catch (e) {
        console.error("HEIC conversion failed", e);
        throw e;
    }
}

async function convertToPdf(file) {
    // Load image to get dimensions
    const imgData = await readFileAsDataURL(file);
    const img = await loadImage(imgData);

    // Create PDF with image dimensions (or A4? Let's fit image to page or page to image)
    // Page to image is better for "converting"
    // Orientation: p (portrait) or l (landscape)
    const orientation = img.width > img.height ? 'l' : 'p';

    // Units: px, Format: [width, height]
    const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [img.width, img.height]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, img.width, img.height);
    return pdf.output('blob');
}

async function convertImageToImage(file, targetType) {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');

    // Handle transparency for non-transparent targets (JPEG, BMP)
    if (targetType === 'image/jpeg' || targetType === 'image/bmp') {
        ctx.fillStyle = '#FFFFFF'; // White background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Canvas toBlob failed'));
            }
        }, targetType, 0.9); // 0.9 quality
    });
}

// Helpers
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}
