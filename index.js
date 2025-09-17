const fs = require('fs');
const sharp = require('sharp');

// Function to convert base64 image to base64 WebP with quality optimization
async function convertImageToWebp(base64image, quality = 80) {
    try {
        // Decode the base64 Image into a Buffer
        const imageBuffer = Buffer.from(base64image, 'base64');
        // Use sharp to convert the Image Buffer to WebP Buffer with quality optimization
        const webpBuffer = await sharp(imageBuffer, { failOn: "none" })
            .webp({ quality: quality, effort: 6 })
            .toBuffer();
        // Encode the WebP Buffer to base64
        const base64Webp = webpBuffer.toString('base64');
        return base64Webp;
    } catch (error) {
        console.warn('Failed to convert image to WebP:', error.message);
        return base64image; // Return original if conversion fails
    }
}

function getImageFormatFromDataURI(dataURI) {
    // Use a regular expression to extract the image format from the data URI
    const regex = /^data:image\/(png|jpeg|gif|tiff|webp);base64,/i;
    const match = dataURI.match(regex);

    // Check if there's a match and extract the image format
    if (match && match[1]) {
        return match[1].toLowerCase();
    } else {
        // If no match is found or the format is not supported, return null or handle the error accordingly
        return null;
    }
}

// Function to optimize numeric precision
function optimizeNumbers(obj) {
    if (typeof obj === 'number') {
        // Round to 3 decimal places for most numbers, 1 for very small numbers
        if (Math.abs(obj) < 0.001) {
            return Math.round(obj * 1000) / 1000;
        }
        return Math.round(obj * 1000) / 1000;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(optimizeNumbers);
    }
    
    if (obj && typeof obj === 'object') {
        const optimized = {};
        for (const key in obj) {
            optimized[key] = optimizeNumbers(obj[key]);
        }
        return optimized;
    }
    
    return obj;
}

// Function to remove unnecessary properties
function removeUnnecessaryProperties(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeUnnecessaryProperties);
    }
    
    if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const key in obj) {
            // Skip empty arrays, null values, and default values
            if (obj[key] === null || obj[key] === undefined) {
                continue;
            }
            if (Array.isArray(obj[key]) && obj[key].length === 0) {
                continue;
            }
            if (typeof obj[key] === 'string' && obj[key] === '') {
                continue;
            }
            // Skip common default values
            if (key === 'ddd' && obj[key] === 0) continue;
            if (key === 'ind' && obj[key] === 0) continue;
            if (key === 'ty' && obj[key] === 0) continue;
            if (key === 'bm' && obj[key] === 0) continue;
            if (key === 'd' && obj[key] === 0) continue;
            if (key === 'r' && obj[key] === 1) continue;
            if (key === 'st' && obj[key] === 0) continue;
            if (key === 's' && obj[key] === 100) continue;
            if (key === 'p' && obj[key] === 0) continue;
            if (key === 'a' && obj[key] === 0) continue;
            if (key === 'sk' && obj[key] === 0) continue;
            if (key === 'sa' && obj[key] === 0) continue;
            if (key === 'nm' && obj[key] === '') continue;
            if (key === 'mn' && obj[key] === '') continue;
            if (key === 'hd' && obj[key] === false) continue;
            if (key === 'cl' && obj[key] === '') continue;
            if (key === 'ln' && obj[key] === '') continue;
            if (key === 'u' && obj[key] === '') continue; // Empty URL
            if (key === 'g' && obj[key] === '') continue; // Empty generator
            if (key === 'a' && obj[key] === '') continue; // Empty author
            if (key === 'k' && obj[key] === '') continue; // Empty keywords
            if (key === 'd' && obj[key] === '') continue; // Empty description
            if (key === 'tc' && obj[key] === '') continue; // Empty title
            
            cleaned[key] = removeUnnecessaryProperties(obj[key]);
        }
        return cleaned;
    }
    
    return obj;
}

// Function to optimize image sequences by reducing quality
async function optimizeImageSequence(asset) {
    if (asset.t !== 'seq' || !asset.p || !asset.p.startsWith('data:image/png;base64,')) {
        return asset;
    }
    
    try {
        const base64Data = asset.p.split(',')[1];
        const originalSize = base64Data.length;
        
        // For image sequences, we can try to optimize the PNG itself
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Try to optimize the PNG with reduced quality
        const optimizedBuffer = await sharp(imageBuffer, { failOn: "none" })
            .png({ 
                quality: 80,
                compressionLevel: 9,
                adaptiveFiltering: true,
                force: true
            })
            .toBuffer();
        
        const optimizedBase64 = optimizedBuffer.toString('base64');
        const newSize = optimizedBase64.length;
        
        if (newSize < originalSize) {
            console.log(`  Optimized image sequence ${asset.id}: PNG optimization (${(originalSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB, ${((1-newSize/originalSize)*100).toFixed(1)}% reduction)`);
            return {
                ...asset,
                p: `data:image/png;base64,${optimizedBase64}`
            };
        }
        
        return asset;
    } catch (error) {
        console.warn(`  Failed to optimize image sequence ${asset.id}:`, error.message);
        return asset;
    }
}

// Function to process the Lottie JSON and convert images
async function processLottieJson(filename, inputFilePath, outputFilePath) {
    try {
        const supportedFormats = ['png', 'jpeg', 'gif', 'tiff'];
        const originalSize = fs.statSync(`${inputFilePath}/${filename}`).size;

        // Read the input Lottie JSON file
        const jsonData = JSON.parse(fs.readFileSync(`${inputFilePath}/${filename}`, 'utf8'));

        // Extract assets from the JSON
        const assets = jsonData.assets || [];

        console.log(`Processing ${filename}...`);
        console.log(`  Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);

        // Process each asset
        let imagesProcessed = 0;
        let imagesSkipped = 0;
        let sequencesOptimized = 0;
        
        await Promise.all(
            assets.map(async (asset, index) => {
                if (!asset.p) return;
                
                if (asset.p && asset.p.indexOf('data:image') === 0) {
                    const format = getImageFormatFromDataURI(asset.p);
                    
                    if (format && supportedFormats.includes(format)) {
                        // Handle image sequences differently
                        if (asset.t === 'seq') {
                            const optimizedAsset = await optimizeImageSequence(asset);
                            if (optimizedAsset !== asset) {
                                // Replace the asset with optimized version
                                assets[index] = optimizedAsset;
                                sequencesOptimized++;
                            } else {
                                console.log(`  Skipping image sequence ${asset.id} (no optimization possible)`);
                                imagesSkipped++;
                            }
                            return;
                        }
                        
                        try {
                            const base64Data = asset.p.split(',')[1];
                            const originalImageSize = base64Data.length;
                            
                            // Use different quality settings based on image size
                            let quality = 85;
                            if (originalImageSize > 1000000) { // > 1MB
                                quality = 75;
                            } else if (originalImageSize > 500000) { // > 500KB
                                quality = 80;
                            }
                            
                            const base64Webp = await convertImageToWebp(base64Data, quality);
                            const newImageSize = base64Webp.length;
                            
                            if (newImageSize < originalImageSize) {
                                asset.p = `data:image/webp;base64,${base64Webp}`;
                                console.log(`  Converted ${asset.id}: ${format} -> webp (${(originalImageSize/1024).toFixed(1)}KB -> ${(newImageSize/1024).toFixed(1)}KB, ${((1-newImageSize/originalImageSize)*100).toFixed(1)}% reduction)`);
                                imagesProcessed++;
                            } else {
                                console.log(`  Skipped ${asset.id}: WebP would be larger than original`);
                                imagesSkipped++;
                            }
                        } catch (error) {
                            console.warn(`  Failed to process ${asset.id}:`, error.message);
                            imagesSkipped++;
                        }
                    }
                }
            })
        );

        console.log(`  Images processed: ${imagesProcessed}, sequences optimized: ${sequencesOptimized}, skipped: ${imagesSkipped}`);

        // Apply JSON optimizations
        console.log(`  Applying JSON optimizations...`);
        
        // Remove unnecessary properties
        const cleanedData = removeUnnecessaryProperties(jsonData);
        
        // Optimize numeric precision
        const optimizedData = optimizeNumbers(cleanedData);

        // Write the updated JSON to a new file (minified)
        const minifiedJson = JSON.stringify(optimizedData);
        fs.writeFileSync(`${outputFilePath}/${filename}`, minifiedJson, 'utf8');

        const newSize = fs.statSync(`${outputFilePath}/${filename}`).size;
        const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
        
        console.log(`  Final size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Size reduction: ${reduction}%`);
        console.log(`${filename} optimization complete. Output saved to ${outputFilePath}/${filename}\n`);
    } catch (error) {
        console.error('Error processing', filename, ':', error);
    }
}

const inputFilePath = './inputs/';
const outputFilePath = './outputs/';

async function init(){
    try {
        const files = fs.readdirSync(inputFilePath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
            console.log('No JSON files found in inputs directory.');
            return;
        }
        
        console.log(`Found ${jsonFiles.length} JSON files to process:\n`);
        
        for (const file of jsonFiles) {
            await processLottieJson(file, inputFilePath, outputFilePath);
        }
        
        console.log('All files processed successfully!');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

init();

