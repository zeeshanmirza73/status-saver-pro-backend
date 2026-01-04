const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Instagram Media Extraction Service
 * 
 * Uses multiple strategies to extract media from public Instagram content:
 * 1. Instagram Embed endpoint
 * 2. Direct page scraping with mobile user agent
 * 3. OEmbed API
 */

class ExtractionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'ExtractionError';
    }
}

// Headers for requests
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
});

/**
 * Extract shortcode from Instagram URL
 */
function extractShortcode(url) {
    const patterns = [
        /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/reels\/([A-Za-z0-9_-]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Strategy 1: Use Instagram Embed page
 */
async function extractFromEmbed(shortcode) {
    try {
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
        console.log(`[Embed] Trying: ${embedUrl}`);

        const response = await axios.get(embedUrl, {
            headers: getHeaders(),
            timeout: 15000
        });

        const html = response.data;

        // Look for video URL in embed page
        let videoUrl = null;
        let imageUrl = null;

        // Pattern 1: video_url in JSON
        const videoMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
        if (videoMatch) {
            videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        }

        // Pattern 2: Look for video source
        const videoSrcMatch = html.match(/video[^>]*src=["']([^"']+\.mp4[^"']*)/i);
        if (!videoUrl && videoSrcMatch) {
            videoUrl = videoSrcMatch[1].replace(/&amp;/g, '&');
        }

        // Pattern 3: Look in EmbeddedMediaImage for images
        const imgMatch = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/);
        if (imgMatch) {
            imageUrl = imgMatch[1].replace(/&amp;/g, '&');
        }

        // Pattern 4: og:image
        const $ = cheerio.load(html);
        if (!imageUrl) {
            imageUrl = $('meta[property="og:image"]').attr('content');
        }

        if (videoUrl) {
            return {
                type: 'video',
                media_url: videoUrl,
                thumbnail_url: imageUrl
            };
        }

        if (imageUrl && imageUrl.includes('cdninstagram')) {
            return {
                type: 'image',
                media_url: imageUrl,
                thumbnail_url: imageUrl
            };
        }

        return null;
    } catch (error) {
        console.log(`[Embed] Failed: ${error.message}`);
        return null;
    }
}

/**
 * Strategy 2: Direct page scraping
 */
async function extractFromPage(url) {
    try {
        console.log(`[Page] Trying: ${url}`);

        const response = await axios.get(url, {
            headers: {
                ...getHeaders(),
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Check for explicit private content
        if (html.includes('This Account is Private')) {
            throw new ExtractionError('This account is private', 'PRIVATE_CONTENT');
        }

        let videoUrl = null;
        let imageUrl = null;

        // Try to find video URL in various patterns
        const videoPatterns = [
            /"video_url"\s*:\s*"([^"]+)"/g,
            /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g,
            /"playable_url"\s*:\s*"([^"]+)"/g,
            /video_versions.*?"url"\s*:\s*"([^"]+)"/g,
            /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/g
        ];

        for (const pattern of videoPatterns) {
            const matches = [...html.matchAll(pattern)];
            for (const match of matches) {
                let url = match[1];
                url = url.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                if (url.includes('.mp4') || url.includes('video')) {
                    if (!videoUrl || url.includes('_hd')) {
                        videoUrl = url;
                    }
                }
            }
        }

        // Get og:video as fallback
        if (!videoUrl) {
            videoUrl = $('meta[property="og:video"]').attr('content') ||
                $('meta[property="og:video:secure_url"]').attr('content');
        }

        // Get image
        imageUrl = $('meta[property="og:image"]').attr('content');

        // Try to find high-res image in JSON
        const imagePatterns = [
            /"display_url"\s*:\s*"([^"]+)"/,
            /"src"\s*:\s*"([^"]+scontent[^"]+)"/
        ];

        for (const pattern of imagePatterns) {
            const match = html.match(pattern);
            if (match) {
                const imgUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                if (imgUrl.includes('cdninstagram') || imgUrl.includes('fbcdn')) {
                    imageUrl = imgUrl;
                    break;
                }
            }
        }

        if (videoUrl) {
            return {
                type: 'video',
                media_url: videoUrl,
                thumbnail_url: imageUrl
            };
        }

        if (imageUrl) {
            return {
                type: 'image',
                media_url: imageUrl,
                thumbnail_url: imageUrl
            };
        }

        return null;
    } catch (error) {
        if (error instanceof ExtractionError) throw error;
        console.log(`[Page] Failed: ${error.message}`);
        return null;
    }
}

/**
 * Strategy 3: Use a third-party API approach (oembed)
 */
async function extractFromOEmbed(url) {
    try {
        const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
        console.log(`[OEmbed] Trying: ${oembedUrl}`);

        const response = await axios.get(oembedUrl, {
            headers: getHeaders(),
            timeout: 10000
        });

        const data = response.data;

        if (data.thumbnail_url) {
            // OEmbed only gives thumbnail, but we can use it as fallback
            return {
                type: 'image',
                media_url: data.thumbnail_url,
                thumbnail_url: data.thumbnail_url,
                caption: data.title || null
            };
        }

        return null;
    } catch (error) {
        console.log(`[OEmbed] Failed: ${error.message}`);
        return null;
    }
}

/**
 * Main extraction function - tries all strategies
 */
async function extractMedia(url) {
    console.log(`\n[Extraction] Starting for: ${url}`);

    const shortcode = extractShortcode(url);
    if (!shortcode) {
        throw new ExtractionError('Invalid Instagram URL', 'INVALID_URL');
    }

    console.log(`[Extraction] Shortcode: ${shortcode}`);

    let result = null;
    let lastError = null;

    // Strategy 1: Embed page (most reliable for public content)
    try {
        result = await extractFromEmbed(shortcode);
        if (result && result.media_url) {
            console.log(`[Extraction] Success via Embed`);
            result.type = url.includes('/reel/') ? 'reel' : result.type;
            return result;
        }
    } catch (e) {
        lastError = e;
    }

    // Strategy 2: Direct page scraping
    try {
        result = await extractFromPage(url);
        if (result && result.media_url) {
            console.log(`[Extraction] Success via Page scraping`);
            result.type = url.includes('/reel/') ? 'reel' : result.type;
            return result;
        }
    } catch (e) {
        if (e instanceof ExtractionError) throw e;
        lastError = e;
    }

    // Strategy 3: OEmbed (fallback, only gets thumbnail)
    try {
        result = await extractFromOEmbed(url);
        if (result && result.media_url) {
            console.log(`[Extraction] Success via OEmbed (thumbnail only)`);
            return result;
        }
    } catch (e) {
        lastError = e;
    }

    // All strategies failed
    console.log(`[Extraction] All strategies failed`);
    throw new ExtractionError(
        'Could not extract media. Instagram may have changed their page structure.',
        'EXTRACTION_FAILED'
    );
}

module.exports = {
    extractMedia,
    ExtractionError
};
