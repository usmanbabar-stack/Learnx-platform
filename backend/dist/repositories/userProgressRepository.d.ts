export interface UserProgress {
    id: number;
    userId: number;
    videoId: string;
    progressTime: number;
    totalDuration: number;
    completed: boolean;
    lastWatched: Date;
    title?: string;
    thumbnail?: string;
    channel?: string;
    videoDuration?: string;
    subject?: string;
}
export interface DashboardStats {
    totalHours: number;
    videosWatched: number;
    currentStreak: number;
    experiencePoints: number;
}
export declare class UserProgressRepository {
    private pool;
    constructor();
    /**
     * Get progress for a specific video (for resume functionality)
     */
    getProgress(userId: number, videoId: string): Promise<UserProgress | null>;
    /**
     * Get all in-progress (not completed) videos for resume functionality
     */
    getInProgressVideos(userId: number, limit?: number): Promise<UserProgress[]>;
    /**
     * Get recently watched videos (for dashboard)
     */
    getRecentlyWatched(userId: number, limit?: number): Promise<UserProgress[]>;
    /**
     * Get completed videos (for achievements)
     */
    getCompletedVideos(userId: number, limit?: number): Promise<UserProgress[]>;
    getDashboardStats(userId: number): Promise<DashboardStats>;
    updateProgress(userId: number, videoId: string, progressTime: number, totalDuration: number, completed?: boolean, videoTitle?: string, videoThumbnail?: string, videoChannel?: string): Promise<UserProgress>;
    recordWatchHistory(userId: number, videoId: string, duration: number, action: 'play' | 'pause' | 'seek' | 'complete'): Promise<void>;
    /**
     * Mark video as completed manually
     */
    markCompleted(userId: number, videoId: string): Promise<void>;
}
export declare const userProgressRepository: UserProgressRepository;
//# sourceMappingURL=userProgressRepository.d.ts.map