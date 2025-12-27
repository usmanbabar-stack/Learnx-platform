"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcriptController = exports.TranscriptController = void 0;
const Video_1 = require("../models/Video");
const youtubeScraperService_1 = require("../services/youtubeScraperService");
const logger_1 = require("../utils/logger");
const express_validator_1 = require("express-validator");
const redis_1 = require("../config/redis");
class TranscriptController {
    /**
     * Get video transcript
     */
    async getTranscript(req, res) {
        try {
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
                return;
            }
            const { videoId } = req.params;
            const { format = 'json', timestamps = 'true' } = req.query;
            // Check cache first
            const cacheKey = `transcript:${videoId}:${format}:${timestamps}`;
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                const cachedTranscript = await redisClient?.get(cacheKey);
                if (cachedTranscript) {
                    res.json({
                        success: true,
                        data: JSON.parse(cachedTranscript),
                        cached: true
                    });
                    return;
                }
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache error:', cacheError);
            }
            // Try to find video in database
            let video = await Video_1.Video.findOne({ videoId });
            // If not found, scrape the video
            if (!video) {
                try {
                    const [metadata, transcript] = await Promise.all([
                        youtubeScraperService_1.youtubeScraperService.getVideoMetadata(videoId),
                        youtubeScraperService_1.youtubeScraperService.getVideoTranscript(videoId)
                    ]);
                    // Save video to database
                    const subject = this.determineSubject(metadata.title, metadata.description);
                    const qualityScore = this.calculateQualityScore(metadata, transcript);
                    video = new Video_1.Video({
                        videoId,
                        metadata,
                        transcript,
                        subject,
                        difficulty: this.determineDifficulty(metadata.title, metadata.description),
                        qualityScore,
                        isEducational: qualityScore >= 5
                    });
                    await video.save();
                    logger_1.logger.info(`New video with transcript saved: ${videoId}`);
                }
                catch (error) {
                    logger_1.logger.error(`Error scraping video ${videoId}:`, error);
                    res.status(404).json({
                        success: false,
                        message: 'Video not found or transcript unavailable'
                    });
                    return;
                }
            }
            // Format transcript based on request
            let formattedTranscript;
            if (format === 'text') {
                formattedTranscript = {
                    videoId,
                    text: video.transcript.map(item => item.text).join(' '),
                    wordCount: video.transcript.reduce((count, item) => count + item.text.split(' ').length, 0)
                };
            }
            else if (format === 'srt') {
                formattedTranscript = {
                    videoId,
                    srt: this.convertToSRT(video.transcript)
                };
            }
            else {
                // Default JSON format
                formattedTranscript = {
                    videoId,
                    transcript: timestamps === 'true' ? video.transcript : video.transcript.map(item => ({ text: item.text })),
                    totalDuration: video.transcript.length > 0 ? video.transcript[video.transcript.length - 1].start + video.transcript[video.transcript.length - 1].duration : 0,
                    segmentCount: video.transcript.length
                };
            }
            // Cache the result
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                await redisClient?.setEx(cacheKey, 3600, JSON.stringify(formattedTranscript)); // Cache for 1 hour
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache set error:', cacheError);
            }
            res.json({
                success: true,
                data: formattedTranscript
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getTranscript:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Search within video transcript
     */
    async searchTranscript(req, res) {
        try {
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
                return;
            }
            const { videoId } = req.params;
            const { query } = req.query;
            if (!query || typeof query !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
                return;
            }
            const video = await Video_1.Video.findOne({ videoId });
            if (!video) {
                res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
                return;
            }
            if (video.transcript.length === 0) {
                res.status(404).json({
                    success: false,
                    message: 'No transcript available for this video'
                });
                return;
            }
            // Search transcript segments
            const searchResults = video.transcript
                .map((segment, index) => ({
                ...segment,
                index,
                relevanceScore: this.calculateRelevanceScore(segment.text, query)
            }))
                .filter(segment => segment.relevanceScore > 0)
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 20); // Limit to top 20 results
            // Add context (previous and next segments)
            const resultsWithContext = searchResults.map(result => {
                const contextBefore = result.index > 0 ? video.transcript[result.index - 1] : null;
                const contextAfter = result.index < video.transcript.length - 1 ? video.transcript[result.index + 1] : null;
                return {
                    segment: {
                        text: result.text,
                        start: result.start,
                        duration: result.duration
                    },
                    context: {
                        before: contextBefore,
                        after: contextAfter
                    },
                    relevanceScore: result.relevanceScore,
                    timestamp: this.formatTimestamp(result.start)
                };
            });
            res.json({
                success: true,
                data: {
                    videoId,
                    query,
                    results: resultsWithContext,
                    totalMatches: resultsWithContext.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in searchTranscript:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Generate transcript summary
     */
    async generateSummary(req, res) {
        try {
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
                return;
            }
            const { videoId } = req.params;
            const { length = 'medium' } = req.query; // short, medium, long
            // Check cache first
            const cacheKey = `summary:${videoId}:${length}`;
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                const cachedSummary = await redisClient?.get(cacheKey);
                if (cachedSummary) {
                    res.json({
                        success: true,
                        data: JSON.parse(cachedSummary),
                        cached: true
                    });
                    return;
                }
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache error:', cacheError);
            }
            const video = await Video_1.Video.findOne({ videoId });
            if (!video) {
                res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
                return;
            }
            if (video.transcript.length === 0) {
                res.status(404).json({
                    success: false,
                    message: 'No transcript available for this video'
                });
                return;
            }
            // Generate summary
            const fullText = video.transcript.map(segment => segment.text).join(' ');
            const summary = this.generateTextSummary(fullText, length);
            // Extract key topics
            const keyTopics = this.extractKeyTopics(fullText);
            // Get important timestamps
            const keyMoments = this.findKeyMoments(video.transcript);
            const summaryData = {
                videoId,
                summary,
                keyTopics,
                keyMoments,
                originalLength: video.transcript.length,
                summaryLength: summary.split(' ').length,
                generatedAt: new Date()
            };
            // Cache the summary
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                await redisClient?.setEx(cacheKey, 7200, JSON.stringify(summaryData)); // Cache for 2 hours
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache set error:', cacheError);
            }
            res.json({
                success: true,
                data: summaryData
            });
        }
        catch (error) {
            logger_1.logger.error('Error in generateSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Convert transcript to SRT format
     */
    convertToSRT(transcript) {
        return transcript
            .map((segment, index) => {
            const startTime = this.formatSRTTimestamp(segment.start);
            const endTime = this.formatSRTTimestamp(segment.start + segment.duration);
            return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
        })
            .join('\n');
    }
    /**
     * Format timestamp for SRT
     */
    formatSRTTimestamp(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
    }
    /**
     * Format timestamp for display
     */
    formatTimestamp(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    /**
     * Calculate relevance score for search
     */
    calculateRelevanceScore(text, query) {
        const textLower = text.toLowerCase();
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(' ').filter(word => word.length > 2);
        let score = 0;
        // Exact phrase match
        if (textLower.includes(queryLower)) {
            score += 10;
        }
        // Individual word matches
        queryWords.forEach(word => {
            if (textLower.includes(word)) {
                score += 3;
            }
        });
        // Word proximity bonus
        if (queryWords.length > 1) {
            const words = textLower.split(' ');
            let minDistance = Infinity;
            for (let i = 0; i < words.length; i++) {
                for (let j = i + 1; j < words.length; j++) {
                    if (queryWords.includes(words[i]) && queryWords.includes(words[j])) {
                        minDistance = Math.min(minDistance, j - i);
                    }
                }
            }
            if (minDistance < 5) {
                score += 5 - minDistance;
            }
        }
        return score;
    }
    /**
     * Generate text summary (simple extractive summarization)
     */
    generateTextSummary(text, length) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        let targetLength;
        switch (length) {
            case 'short':
                targetLength = Math.min(3, Math.floor(sentences.length * 0.1));
                break;
            case 'long':
                targetLength = Math.min(10, Math.floor(sentences.length * 0.3));
                break;
            default: // medium
                targetLength = Math.min(6, Math.floor(sentences.length * 0.2));
        }
        // Score sentences based on word frequency and position
        const wordFreq = this.calculateWordFrequency(text);
        const scoredSentences = sentences.map((sentence, index) => ({
            sentence: sentence.trim(),
            score: this.scoreSentence(sentence, wordFreq, index, sentences.length),
            index
        }));
        // Select top sentences
        const selectedSentences = scoredSentences
            .sort((a, b) => b.score - a.score)
            .slice(0, targetLength)
            .sort((a, b) => a.index - b.index)
            .map(item => item.sentence);
        return selectedSentences.join('. ') + '.';
    }
    /**
     * Calculate word frequency
     */
    calculateWordFrequency(text) {
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
        const freq = {};
        words.forEach(word => {
            freq[word] = (freq[word] || 0) + 1;
        });
        return freq;
    }
    /**
     * Score sentence for summary
     */
    scoreSentence(sentence, wordFreq, position, totalSentences) {
        const words = sentence.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
        let score = 0;
        // Word frequency score
        words.forEach(word => {
            score += wordFreq[word] || 0;
        });
        // Position bonus (beginning and end are often important)
        if (position < totalSentences * 0.1 || position > totalSentences * 0.9) {
            score *= 1.2;
        }
        // Length penalty for very short or very long sentences
        if (sentence.length < 20 || sentence.length > 200) {
            score *= 0.8;
        }
        return score / words.length; // Normalize by sentence length
    }
    /**
     * Extract key topics from text
     */
    extractKeyTopics(text) {
        const wordFreq = this.calculateWordFrequency(text);
        // Get most frequent meaningful words
        return Object.entries(wordFreq)
            .filter(([word, freq]) => freq > 2 && word.length > 4)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([word]) => word);
    }
    /**
     * Find key moments in transcript
     */
    findKeyMoments(transcript) {
        const keyMoments = [];
        // Look for introduction patterns
        const introPatterns = ['welcome', 'hello', 'today we', 'in this video', 'let\'s start'];
        const conclusionPatterns = ['in conclusion', 'to summarize', 'that\'s all', 'thank you', 'see you'];
        const transitionPatterns = ['now let\'s', 'next we', 'moving on', 'another important'];
        transcript.forEach((segment, index) => {
            const text = segment.text.toLowerCase();
            // Introduction
            if (index < transcript.length * 0.1 && introPatterns.some(pattern => text.includes(pattern))) {
                keyMoments.push({
                    timestamp: this.formatTimestamp(segment.start),
                    text: segment.text,
                    reason: 'Introduction'
                });
            }
            // Conclusion
            if (index > transcript.length * 0.8 && conclusionPatterns.some(pattern => text.includes(pattern))) {
                keyMoments.push({
                    timestamp: this.formatTimestamp(segment.start),
                    text: segment.text,
                    reason: 'Conclusion'
                });
            }
            // Transitions
            if (transitionPatterns.some(pattern => text.includes(pattern))) {
                keyMoments.push({
                    timestamp: this.formatTimestamp(segment.start),
                    text: segment.text,
                    reason: 'Topic Transition'
                });
            }
        });
        return keyMoments.slice(0, 5); // Limit to 5 key moments
    }
    /**
     * Helper methods (similar to other controllers)
     */
    determineSubject(title, description) {
        // Implementation similar to other controllers
        return 'Other';
    }
    determineDifficulty(title, description) {
        // Implementation similar to other controllers
        return 'intermediate';
    }
    calculateQualityScore(metadata, transcript) {
        // Implementation similar to other controllers
        return 5;
    }
}
exports.TranscriptController = TranscriptController;
exports.transcriptController = new TranscriptController();
//# sourceMappingURL=transcriptController.js.map