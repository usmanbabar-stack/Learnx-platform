import { VideoMetadata, SearchResult, TranscriptItem } from '../types/video';
export declare class YouTubeScraperService {
    private browser;
    private readonly CACHE_TTL;
    private readonly MAX_RESULTS;
    private readonly BROWSER_POOL_SIZE;
    private browserPool;
    private poolIndex;
    initialize(): Promise<void>;
    close(): Promise<void>;
    private getBrowser;
    /**
     * Search for YouTube videos based on query and educational topics
     */
    searchVideos(query: string, maxResults?: number): Promise<SearchResult[]>;
    private performSearch;
    /**
     * Get detailed video metadata
     */
    getVideoMetadata(videoId: string): Promise<VideoMetadata>;
    private scrapeVideoMetadata;
    /**
     * Extract video transcript
     */
    getVideoTranscript(videoId: string): Promise<TranscriptItem[]>;
    private scrapeTranscriptManually;
    /**
     * Search for educational videos by topic
     */
    private scoreRelevance;
    private parseViews;
    searchEducationalVideos(topic: string, filters?: {
        duration?: 'short' | 'medium' | 'long';
        uploadDate?: 'hour' | 'today' | 'week' | 'month' | 'year';
        sortBy?: 'relevance' | 'date' | 'views' | 'rating';
    }, limit?: number): Promise<SearchResult[]>;
    /**
     * Ultra-fast search using YouTube's internal API (much faster than HTML scraping)
     */
    private fastSearch;
    /**
     * Batch process multiple video IDs
     */
    batchProcessVideos(videoIds: string[]): Promise<{
        metadata: VideoMetadata[];
        transcripts: {
            [videoId: string]: TranscriptItem[];
        };
        errors: {
            [videoId: string]: string;
        };
    }>;
}
export declare const youtubeScraperService: YouTubeScraperService;
//# sourceMappingURL=youtubeScraperService.d.ts.map