const express = require('express');
const router = express.Router();
const instagramService = require('../services/instagramService');
const { validateInstagramUrl } = require('../utils/validators');

/**
 * POST /instagram/download
 * 
 * Request body:
 * {
 *   "url": "https://www.instagram.com/reel/ABC123/"
 * }
 * 
 * Response:
 * {
 *   "status": "success",
 *   "type": "reel" | "video" | "image",
 *   "media_url": "https://...",
 *   "thumbnail_url": "https://..." (optional),
 *   "caption": "..." (optional)
 * }
 */
router.post('/download', async (req, res) => {
    try {
        const { url } = req.body;

        // Validate request body
        if (!url || typeof url !== 'string') {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required',
                code: 'MISSING_URL'
            });
        }

        // Validate Instagram URL format
        const validation = validateInstagramUrl(url);
        if (!validation.valid) {
            return res.status(400).json({
                status: 'error',
                message: validation.message,
                code: 'INVALID_URL'
            });
        }

        console.log(`[${new Date().toISOString()}] Processing: ${url}`);

        // Extract media from Instagram
        const result = await instagramService.extractMedia(url);

        console.log(`[${new Date().toISOString()}] Success: ${result.type} extracted`);

        return res.json({
            status: 'success',
            ...result
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error.message);

        // Handle specific error types
        if (error.code === 'PRIVATE_CONTENT') {
            return res.status(403).json({
                status: 'error',
                message: 'This content is private or unavailable',
                code: 'PRIVATE_CONTENT'
            });
        }

        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({
                status: 'error',
                message: 'Post not found or has been deleted',
                code: 'NOT_FOUND'
            });
        }

        if (error.code === 'EXTRACTION_FAILED') {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to extract media. The post format may not be supported.',
                code: 'EXTRACTION_FAILED'
            });
        }

        // Generic error
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /instagram/info
 * Returns API information
 */
router.get('/info', (req, res) => {
    res.json({
        status: 'success',
        name: 'Instagram Media Downloader API',
        version: '1.0.0',
        supported_types: ['reels', 'posts', 'videos'],
        disclaimer: 'This service only supports public content. Users are responsible for respecting copyright.'
    });
});

module.exports = router;
