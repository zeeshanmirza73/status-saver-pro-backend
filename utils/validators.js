/**
 * Instagram URL Validation Utilities
 */

// Supported Instagram URL patterns
const INSTAGRAM_PATTERNS = {
    // Reel: https://www.instagram.com/reel/ABC123/
    reel: /^https?:\/\/(www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)\/?/,

    // Post: https://www.instagram.com/p/ABC123/
    post: /^https?:\/\/(www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)\/?/,

    // TV/IGTV: https://www.instagram.com/tv/ABC123/
    tv: /^https?:\/\/(www\.)?instagram\.com\/tv\/([A-Za-z0-9_-]+)\/?/,

    // Stories (not supported but detected for messaging)
    story: /^https?:\/\/(www\.)?instagram\.com\/stories\//
};

/**
 * Validates an Instagram URL and extracts information
 * @param {string} url - The URL to validate
 * @returns {Object} Validation result with type and post ID if valid
 */
function validateInstagramUrl(url) {
    if (!url || typeof url !== 'string') {
        return {
            valid: false,
            message: 'URL must be a non-empty string'
        };
    }

    // Trim whitespace
    const cleanUrl = url.trim();

    // Check for stories (not supported)
    if (INSTAGRAM_PATTERNS.story.test(cleanUrl)) {
        return {
            valid: false,
            message: 'Stories are not supported. Only public reels, posts, and videos can be downloaded.'
        };
    }

    // Check for reel
    const reelMatch = cleanUrl.match(INSTAGRAM_PATTERNS.reel);
    if (reelMatch) {
        return {
            valid: true,
            type: 'reel',
            postId: reelMatch[2],
            normalizedUrl: `https://www.instagram.com/reel/${reelMatch[2]}/`
        };
    }

    // Check for post
    const postMatch = cleanUrl.match(INSTAGRAM_PATTERNS.post);
    if (postMatch) {
        return {
            valid: true,
            type: 'post',
            postId: postMatch[2],
            normalizedUrl: `https://www.instagram.com/p/${postMatch[2]}/`
        };
    }

    // Check for TV/IGTV
    const tvMatch = cleanUrl.match(INSTAGRAM_PATTERNS.tv);
    if (tvMatch) {
        return {
            valid: true,
            type: 'tv',
            postId: tvMatch[2],
            normalizedUrl: `https://www.instagram.com/tv/${tvMatch[2]}/`
        };
    }

    // Not a recognized Instagram URL
    return {
        valid: false,
        message: 'Invalid Instagram URL. Please provide a valid reel, post, or video URL.'
    };
}

/**
 * Extracts post ID from an Instagram URL
 * @param {string} url - The Instagram URL
 * @returns {string|null} The post ID or null if not found
 */
function extractPostId(url) {
    const validation = validateInstagramUrl(url);
    return validation.valid ? validation.postId : null;
}

module.exports = {
    validateInstagramUrl,
    extractPostId,
    INSTAGRAM_PATTERNS
};
