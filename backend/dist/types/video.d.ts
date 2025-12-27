export interface VideoMetadata {
    videoId: string;
    title: string;
    channel: string;
    description: string;
    duration: string;
    views: string;
    likes?: string;
    uploadDate: string;
    category?: string;
    thumbnail: string;
    url: string;
    scrapedAt: Date;
}
export interface SearchResult {
    videoId: string;
    title: string;
    thumbnail: string;
    channel: string;
    duration: string;
    views: string;
    uploadTime: string;
    description: string;
    url: string;
}
export interface TranscriptItem {
    text: string;
    start: number;
    duration: number;
}
export interface VideoDocument {
    videoId: string;
    metadata: VideoMetadata;
    transcript: TranscriptItem[];
    searchKeywords: string[];
    subject: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    language: string;
    isEducational: boolean;
    qualityScore: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface VideoModel {
    findBySubject(subject: string, limit?: number): Promise<VideoDocument[]>;
    searchVideos(query: string, filters?: SearchFilters, limit?: number): Promise<VideoDocument[]>;
}
export interface SearchFilters {
    subject?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    duration?: 'short' | 'medium' | 'long';
    language?: string;
    minQualityScore?: number;
    uploadDate?: 'hour' | 'today' | 'week' | 'month' | 'year';
    sortBy?: 'relevance' | 'date' | 'views' | 'rating' | 'duration';
}
export interface VideoAnalytics {
    videoId: string;
    totalViews: number;
    uniqueUsers: number;
    averageWatchTime: number;
    completionRate: number;
    engagementScore: number;
    lastWatched: Date;
}
export interface UserProgress {
    userId: string;
    videoId: string;
    currentTime: number;
    totalDuration: number;
    completed: boolean;
    watchHistory: {
        timestamp: Date;
        duration: number;
        action: 'play' | 'pause' | 'seek' | 'complete';
    }[];
    notes: string[];
    bookmarks: {
        time: number;
        note: string;
        createdAt: Date;
    }[];
}
//# sourceMappingURL=video.d.ts.map