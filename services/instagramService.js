const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Instagram Media Extraction Service
 * 
 * Extracts media URLs from public Instagram posts, reels, and videos
 * by parsing the public HTML page.
 */

// User agent to mimic a mobile browser request
const USER_AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/117.0.5938.117 Mobile/15E148 Safari/604.1'
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
 * Fetch the Instagram page HTML
 * @param {string} url - The Instagram URL
 * @returns {Promise<string>} The HTML content
 */
async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        return response.data;
    } catch (error) {
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
}

/**
 * Extract media URL from meta tags
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {Object|null} Media info or null
 */
function extractFromMetaTags($) {
    // Try og:video (for videos/reels)
    const ogVideo = $('meta[property="og:video"]').attr('content') ||
        $('meta[property="og:video:url"]').attr('content') ||
        $('meta[property="og:video:secure_url"]').attr('content');

    if (ogVideo) {
        return {
            type: 'video',
            media_url: ogVideo,
            thumbnail_url: $('meta[property="og:image"]').attr('content') || null
        };
    }

    // Try og:image (for images)
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
        return {
            type: 'image',
            media_url: ogImage,
            thumbnail_url: ogImage
        };
    }

    return null;
}

/**
 * Extract media URL from embedded JSON data
 * @param {string} html - The HTML content
 * @returns {Object|null} Media info or null
 */
function extractFromJsonData(html) {
    try {
        // Look for video URL patterns in the HTML
        const videoPatterns = [
            /"video_url"\s*:\s*"([^"]+)"/,
            /"playable_url"\s*:\s*"([^"]+)"/,
            /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
            /video_versions.*?"url"\s*:\s*"([^"]+)"/
        ];

        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                // Decode unicode escape sequences
                const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                if (url.includes('.mp4') || url.includes('video')) {
                    return {
                        type: 'video',
                        media_url: url
                    };
                }
            }
        }

        // Look for image URL patterns
        const imagePatterns = [
            /"display_url"\s*:\s*"([^"]+)"/,
            /"thumbnail_src"\s*:\s*"([^"]+)"/,
            /image_versions2.*?"url"\s*:\s*"([^"]+)"/
        ];

        for (const pattern of imagePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                return {
                    type: 'image',
                    media_url: url
                };
            }
        }

        return null;
    } catch (error) {
        console.error('JSON extraction error:', error.message);
        return null;
    }
}

/**
 * Extract caption from the page
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {string|null} Caption or null
 */
function extractCaption($) {
    // Try og:description
    const description = $('meta[property="og:description"]').attr('content');
    if (description) {
        // Clean up the description (remove "likes, X comments" part)
        const cleaned = description.replace(/^\d+[KkMm]?\s*likes?,\s*\d+[KkMm]?\s*comments?\s*-\s*/i, '');
        return cleaned.trim() || null;
    }
    return null;
}

/**
 * Check if content appears to be private
 * @param {CheerioAPI} $ - Cheerio instance
 * @param {string} html - Raw HTML
 * @returns {boolean}
 */
function isPrivateContent($, html) {
    // Check for login prompts
    if (html.includes('Login') && html.includes('Sign Up') && !html.includes('og:video') && !html.includes('og:image')) {
        return true;
    }

    // Check for private account indicators
    if (html.includes('This Account is Private') || html.includes('"is_private":true')) {
        return true;
    }

    return false;
}

/**
 * Main function to extract media from an Instagram URL
 * @param {string} url - The Instagram URL
 * @returns {Promise<Object>} Media information
 */
async function extractMedia(url) {
    // Fetch the page
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Check for private content
    if (isPrivateContent($, html)) {
        throw new ExtractionError('Content is private or requires login', 'PRIVATE_CONTENT');
    }

    // Try meta tags first (most reliable for public content)
    let result = extractFromMetaTags($);

    // If no result from meta tags, try JSON extraction
    if (!result) {
        result = extractFromJsonData(html);
    }

    // If still no result, extraction failed
    if (!result || !result.media_url) {
        throw new ExtractionError('Could not extract media URL', 'EXTRACTION_FAILED');
    }

    // Add caption if available
    const caption = extractCaption($);
    if (caption) {
        result.caption = caption;
    }

    // Determine content type from URL context
    if (url.includes('/reel/')) {
        result.type = 'reel';
    } else if (url.includes('/tv/')) {
        result.type = 'video';
    }

    // Get thumbnail if not already set
    if (!result.thumbnail_url && result.type !== 'image') {
        result.thumbnail_url = $('meta[property="og:image"]').attr('content') || null;
    }

    return result;
}

module.exports = {
    extractMedia,
    ExtractionError
};
