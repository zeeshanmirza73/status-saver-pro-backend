const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Instagram Media Extraction Service
 * 
 * Extracts media URLs from public Instagram posts, reels, and videos
 * using multiple extraction strategies for reliability.
 */

// User agents to mimic browser requests
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

/**
 * Custom error class for extraction errors
 */
class ExtractionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'ExtractionError';
    }
}

/**
 * Get a random user agent
 */
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch page with retries
 */
async function fetchPage(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                    'Pragma': 'no-cache'
                },
                timeout: 20000,
                maxRedirects: 5
            });
            return response.data;
        } catch (error) {
            if (i === retries - 1) {
                if (error.response) {
                    if (error.response.status === 404) {
                        throw new ExtractionError('Post not found', 'NOT_FOUND');
                    }
                    if (error.response.status === 403 || error.response.status === 401) {
                        throw new ExtractionError('Content is private or unavailable', 'PRIVATE_CONTENT');
                    }
                }
                throw new ExtractionError('Failed to fetch page', 'FETCH_ERROR');
            }
            // Wait before retry
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Try to extract video URL from various JSON patterns in HTML
 */
function extractVideoFromHtml(html) {
    const patterns = [
        // High quality video URLs
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g,
        /"playable_url"\s*:\s*"([^"]+)"/g,
        /"baseline_video_url"\s*:\s*"([^"]+)"/g,
        // Video versions array
        /video_versions.*?"url"\s*:\s*"([^"]+)"/g,
        // Direct video URL patterns
        /https:\\\/\\\/[^"]*?\.mp4[^"]*/g,
        // CDN video patterns
        /https:\/\/[^"]*?cdninstagram\.com[^"]*?\.mp4[^"]*/g
    ];

    let bestUrl = null;
    let maxQuality = 0;

    for (const pattern of patterns) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
            let url = match[1] || match[0];
            // Decode unicode escapes
            url = url.replace(/\\u0026/g, '&')
                .replace(/\\\//g, '/')
                .replace(/\\"/g, '"')
                .replace(/\\/g, '');

            // Skip if not a valid video URL
            if (!url.includes('.mp4') && !url.includes('video')) continue;
            if (url.includes('_nc_ht=') === false && url.includes('cdninstagram') === false) continue;

            // Try to determine quality from URL
            let quality = 0;
            if (url.includes('_hd') || url.includes('quality_hd')) quality += 100;
            if (url.includes('1080')) quality += 1080;
            else if (url.includes('720')) quality += 720;
            else if (url.includes('480')) quality += 480;
            else quality += 360;

            if (quality > maxQuality) {
                maxQuality = quality;
                bestUrl = url;
            }
        }
    }

    return bestUrl;
}

/**
 * Extract image URL from HTML
 */
function extractImageFromHtml(html) {
    const patterns = [
        /"display_url"\s*:\s*"([^"]+)"/,
        /"display_src"\s*:\s*"([^"]+)"/,
        /image_versions2.*?"url"\s*:\s*"([^"]+)"/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            let url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
            if (url.includes('cdninstagram') || url.includes('fbcdn')) {
                return url;
            }
        }
    }
    return null;
}

/**
 * Extract from meta tags (fallback)
 */
function extractFromMetaTags($) {
    // For videos, og:video often has low quality - use as fallback only
    const ogVideo = $('meta[property="og:video"]').attr('content') ||
        $('meta[property="og:video:url"]').attr('content') ||
        $('meta[property="og:video:secure_url"]').attr('content');

    const ogImage = $('meta[property="og:image"]').attr('content');

    return {
        video: ogVideo,
        image: ogImage
    };
}

/**
 * Check if content is explicitly marked as private
 * Only check for explicit private account indicators, not login prompts
 */
function isExplicitlyPrivate(html) {
    // Only check for explicit private account messages
    if (html.includes('This Account is Private')) {
        return true;
    }
    if (html.includes('"is_private":true')) {
        return true;
    }
    // Check for "sorry this page isn't available"
    if (html.includes("Sorry, this page isn't available")) {
        return false; // This is NOT_FOUND, not private
    }
    return false;
}

/**
 * Extract caption
 */
function extractCaption($) {
    const description = $('meta[property="og:description"]').attr('content');
    if (description) {
        return description.replace(/^\d+[KkMm]?\s*likes?,\s*\d+[KkMm]?\s*comments?\s*-\s*/i, '').trim() || null;
    }
    return null;
}

/**
 * Main extraction function
 */
async function extractMedia(url) {
    console.log(`[Extraction] Starting for: ${url}`);

    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Only check for EXPLICIT private content (not login prompts)
    if (isExplicitlyPrivate(html)) {
        throw new ExtractionError('Content is private or requires login', 'PRIVATE_CONTENT');
    }

    const isReel = url.includes('/reel/');
    const isTV = url.includes('/tv/');
    const isVideo = isReel || isTV || url.includes('/p/') && html.includes('video_url');

    let result = null;

    if (isVideo || isReel) {
        // Try to extract high-quality video URL from HTML
        const videoUrl = extractVideoFromHtml(html);

        if (videoUrl) {
            console.log(`[Extraction] Found video URL from HTML`);
            result = {
                type: isReel ? 'reel' : 'video',
                media_url: videoUrl,
                thumbnail_url: $('meta[property="og:image"]').attr('content') || null
            };
        } else {
            // Fallback to meta tags
            const metaData = extractFromMetaTags($);
            if (metaData.video) {
                console.log(`[Extraction] Using meta tag video (may be lower quality)`);
                result = {
                    type: isReel ? 'reel' : 'video',
                    media_url: metaData.video,
                    thumbnail_url: metaData.image
                };
            }
        }
    }

    // If no video found, try image
    if (!result) {
        const imageUrl = extractImageFromHtml(html) ||
            $('meta[property="og:image"]').attr('content');

        if (imageUrl) {
            result = {
                type: 'image',
                media_url: imageUrl,
                thumbnail_url: imageUrl
            };
        }
    }

    if (!result || !result.media_url) {
        throw new ExtractionError('Could not extract media URL', 'EXTRACTION_FAILED');
    }

    // Add caption
    const caption = extractCaption($);
    if (caption) {
        result.caption = caption;
    }

    console.log(`[Extraction] Success: ${result.type}, URL length: ${result.media_url.length}`);
    return result;
}

module.exports = {
    extractMedia,
    ExtractionError
};
