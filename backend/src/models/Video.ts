import mongoose, { Schema, Document, Model } from 'mongoose';
import { VideoDocument, TranscriptItem, VideoMetadata, VideoModel } from '../types/video';

const TranscriptItemSchema = new Schema<TranscriptItem>({
  text: { type: String, required: true },
  start: { type: Number, required: true },
  duration: { type: Number, required: true }
}, { _id: false });

const VideoMetadataSchema = new Schema<VideoMetadata>({
  videoId: { type: String, required: true },
  title: { type: String, required: true },
  channel: { type: String, required: true },
  description: { type: String, default: '' },
  duration: { type: String, required: true },
  views: { type: String, default: '0' },
  likes: { type: String, default: '0' },
  uploadDate: { type: String, required: true },
  category: { type: String, default: 'Education' },
  thumbnail: { type: String, required: true },
  url: { type: String, required: true },
  scrapedAt: { type: Date, default: Date.now }
}, { _id: false });

const VideoSchema = new Schema<VideoDocument & Document>({
  videoId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  metadata: { 
    type: VideoMetadataSchema, 
    required: true 
  },
  transcript: [TranscriptItemSchema],
  searchKeywords: [{ 
    type: String, 
    index: true 
  }],
  subject: { 
    type: String, 
    required: true,
    index: true,
    enum: [
      'Computer Science',
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'Engineering',
      'Business',
      'Economics',
      'Psychology',
      'History',
      'Literature',
      'Art',
      'Music',
      'Language Learning',
      'Medicine',
      'Law',
      'Philosophy',
      'Other'
    ]
  },
  difficulty: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'], 
    default: 'intermediate',
    index: true
  },
  language: { 
    type: String, 
    default: 'en',
    index: true
  },
  isEducational: { 
    type: Boolean, 
    default: true,
    index: true
  },
  qualityScore: { 
    type: Number, 
    min: 0, 
    max: 10, 
    default: 5,
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for better query performance
VideoSchema.index({ 'metadata.title': 'text', 'metadata.description': 'text', searchKeywords: 'text' });
VideoSchema.index({ subject: 1, difficulty: 1, qualityScore: -1 });
VideoSchema.index({ createdAt: -1 });
VideoSchema.index({ 'metadata.views': -1 });

// Pre-save middleware to update timestamps and generate keywords
VideoSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate search keywords from title and description
  if (this.isModified('metadata')) {
    const keywords = new Set<string>();
    
    // Extract keywords from title
    const titleWords = this.metadata.title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    titleWords.forEach(word => keywords.add(word));
    
    // Extract keywords from description (first 200 chars)
    const descWords = this.metadata.description.toLowerCase()
      .slice(0, 200)
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    descWords.forEach(word => keywords.add(word));
    
    this.searchKeywords = Array.from(keywords);
  }
  
  next();
});

// Static methods for common queries
VideoSchema.statics.findBySubject = function(subject: string, limit: number = 20) {
  return this.find({ subject, isEducational: true })
    .sort({ qualityScore: -1, createdAt: -1 })
    .limit(limit);
};

VideoSchema.statics.searchVideos = function(query: string, filters: any = {}, limit: number = 20) {
  const searchQuery: any = {
    $and: [
      { isEducational: true },
      {
        $or: [
          { $text: { $search: query } },
          { 'metadata.title': { $regex: query, $options: 'i' } },
          { 'metadata.description': { $regex: query, $options: 'i' } },
          { searchKeywords: { $in: query.split(' ').map(word => new RegExp(word, 'i')) } }
        ]
      }
    ]
  };

  // Apply filters
  if (filters.subject) searchQuery.$and.push({ subject: filters.subject });
  if (filters.difficulty) searchQuery.$and.push({ difficulty: filters.difficulty });
  if (filters.language) searchQuery.$and.push({ language: filters.language });
  if (filters.minQualityScore) searchQuery.$and.push({ qualityScore: { $gte: filters.minQualityScore } });

  let sortQuery: any = { score: { $meta: 'textScore' }, qualityScore: -1 };
  
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case 'date':
        sortQuery = { createdAt: -1 };
        break;
      case 'views':
        sortQuery = { 'metadata.views': -1 };
        break;
      case 'rating':
        sortQuery = { qualityScore: -1 };
        break;
      default:
        break;
    }
  }

  return this.find(searchQuery)
    .sort(sortQuery)
    .limit(limit);
};

export const Video = mongoose.model<VideoDocument & Document, VideoModel & Model<VideoDocument & Document>>('Video', VideoSchema);
