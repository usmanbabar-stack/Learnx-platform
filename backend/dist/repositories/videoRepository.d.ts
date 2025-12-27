import { VideoDocument, TranscriptItem, SearchFilters } from '../types/video';
export declare class VideoRepository {
    private pool;
    constructor();
    findByVideoId(videoId: string): Promise<VideoDocument | null>;
    create(video: VideoDocument): Promise<VideoDocument>;
    findBySubject(subject: string, limit?: number): Promise<VideoDocument[]>;
    searchVideos(query: string, filters?: SearchFilters, limit?: number): Promise<VideoDocument[]>;
    getTranscriptByVideoId(videoId: string): Promise<TranscriptItem[]>;
    saveTranscript(videoId: string, segments: TranscriptItem[]): Promise<void>;
    private mapRowToVideoDocument;
}
export declare const videoRepository: VideoRepository;
//# sourceMappingURL=videoRepository.d.ts.map