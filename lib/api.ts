// API service for connecting frontend to backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export interface VideoData {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
  channel: string;
  views: string;
  uploadDate: string;
  subject: string;
  url: string;
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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  cached?: boolean;
  error?: string;
}

// 🛡️ Safe localStorage wrapper (handles private browsing, SSR, corruption)
const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window === 'undefined') return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): boolean {
    try {
      if (typeof window === 'undefined') return false;
      localStorage.setItem(key, value);
      return true;
    } catch {
      console.warn('localStorage not available');
      return false;
    }
  },
  removeItem(key: string): boolean {
    try {
      if (typeof window === 'undefined') return false;
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  getJSON<T>(key: string, defaultValue: T): T {
    try {
      const value = this.getItem(key);
      if (!value) return defaultValue;
      return JSON.parse(value) as T;
    } catch {
      // Corrupted data - remove it
      this.removeItem(key);
      return defaultValue;
    }
  },
  setJSON(key: string, value: unknown): boolean {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch {
      return false;
    }
  }
};

// 🛡️ Utility to create fetch with timeout
const fetchWithTimeout = (url: string, options: RequestInit, timeout: number): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timeout'));
    }, timeout);
    
    fetch(url, { ...options, signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

// 🛡️ Delay utility for retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class ApiService {
  private getAuthToken(): string | null {
    return safeStorage.getItem('auth-token');
  }

  // 🛡️ Check if user is still logged in
  private isLoggedIn(): boolean {
    return !!safeStorage.getItem('learnx_user');
  }

  // 🛡️ Robust API fetch with timeout, retries, and error handling
  private async fetchApi<T>(
    endpoint: string, 
    options?: RequestInit,
    config?: { retries?: number; timeout?: number; skipAuth?: boolean }
  ): Promise<T> {
    const { retries = MAX_RETRIES, timeout = REQUEST_TIMEOUT, skipAuth = false } = config || {};
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Check if user logged out mid-request
        if (!skipAuth && !this.isLoggedIn() && !endpoint.includes('/auth/')) {
          throw new Error('User not authenticated');
        }
        
        const token = this.getAuthToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          ...options?.headers,
        };
        
        if (token && !skipAuth) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetchWithTimeout(
          `${API_BASE_URL}${endpoint}`,
          { ...options, headers },
          timeout
        );

        // Handle different HTTP errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Token expired - clear auth and redirect
          if (response.status === 401) {
            this.handleAuthError();
            throw new Error('Session expired. Please login again.');
          }
          
          // Rate limited
          if (response.status === 429) {
            if (attempt < retries) {
              await delay(RETRY_DELAY * (attempt + 1));
              continue;
            }
            throw new Error('Too many requests. Please wait a moment.');
          }
          
          // Server error - retry
          if (response.status >= 500 && attempt < retries) {
            await delay(RETRY_DELAY * (attempt + 1));
            continue;
          }
          
          throw new Error(errorData.message || `Request failed: ${response.status}`);
        }

        const data = await response.json();
        return data;
        
      } catch (error: any) {
        lastError = error;
        
        // Don't retry for auth errors
        if (error.message?.includes('authenticated') || error.message?.includes('expired')) {
          throw error;
        }
        
        // Retry for network errors
        if (attempt < retries && (error.name === 'TypeError' || error.message === 'Request timeout')) {
          console.log(`API retry attempt ${attempt + 1}/${retries} for ${endpoint}`);
          await delay(RETRY_DELAY * (attempt + 1));
          continue;
        }
      }
    }
    
    console.error(`API Error (${endpoint}):`, lastError);
    throw lastError || new Error('Request failed');
  }

  // 🛡️ Handle auth errors globally
  private handleAuthError(): void {
    safeStorage.removeItem('auth-token');
    safeStorage.removeItem('learnx_user');
    
    // Redirect to login if in browser
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login?expired=true';
    }
  }

  // Authentication methods
  async login(email: string, password: string) {
    return this.fetchApi<ApiResponse<{
      token: string;
      user: {
        id: number;
        email: string;
        firstName?: string;
        lastName?: string;
        role: string;
        institution?: string;
      };
    }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, { skipAuth: true }); // Login doesn't need existing auth
  }

  async signup(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    institution?: string;
  }) {
    return this.fetchApi<ApiResponse<{
      token: string;
      user: {
        id: number;
        email: string;
        firstName?: string;
        lastName?: string;
        role: string;
        institution?: string;
      };
    }>>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }, { skipAuth: true }); // Signup doesn't need existing auth
  }

  async getMe() {
    return this.fetchApi<ApiResponse<{
      user: {
        id: number;
        email: string;
        firstName?: string;
        lastName?: string;
        role: string;
        institution?: string;
      };
    }>>('/auth/me');
  }

  logout() {
    safeStorage.removeItem('auth-token');
    safeStorage.removeItem('learnx_user');
    safeStorage.removeItem('learnx:searchResults');
    safeStorage.removeItem('learnx:lastQuery');
    safeStorage.removeItem('learnx:searchHistory');
  }

  // Health check
  async healthCheck() {
    return this.fetchApi<{ status: string; timestamp: string; uptime: number; environment: string }>('/health');
  }

  // 🛡️ Search videos with fallback
  async searchVideos(query: string, options: {
    limit?: number;
    type?: string;
    duration?: string;
    sort_by?: string;
  } = {}): Promise<ApiResponse<{ videos: SearchResult[]; total: number; source: string; query: string }>> {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: (options.limit || 20).toString(),
        ...(options.type && { type: options.type }),
        ...(options.duration && { duration: options.duration }),
        ...(options.sort_by && { sort_by: options.sort_by }),
      });

      return await this.fetchApi<ApiResponse<{
        videos: SearchResult[];
        total: number;
        source: string;
        query: string;
      }>>(`/search?${params}`, undefined, { retries: 1 });
    } catch (error) {
      // 🛡️ Fallback: return mock data if backend is not working
      console.warn('Backend search failed, using mock data:', error);
      return {
        success: true,
        data: {
          videos: this.getMockVideos(query),
          total: 3,
          source: 'offline-fallback',
          query: query
        }
      };
    }
  }

  // Mock data fallback
  private getMockVideos(query: string): SearchResult[] {
    return [
      {
        videoId: "dQw4w9WgXcQ",
        title: `${query} - Complete Tutorial`,
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        channel: "Educational Channel",
        duration: "15:30",
        views: "1.2M",
        uploadTime: "2 months ago",
        description: `Learn ${query} from basics to advanced level. This comprehensive tutorial covers all aspects.`,
        url: "https://youtube.com/watch?v=dQw4w9WgXcQ"
      },
      {
        videoId: "jNQXAC9IVRw",
        title: `Advanced ${query} Concepts`,
        thumbnail: "https://img.youtube.com/vi/jNQXAC9IVRw/mqdefault.jpg",
        channel: "Tech Academy",
        duration: "22:45",
        views: "850K",
        uploadTime: "3 weeks ago",
        description: `Deep dive into advanced ${query} concepts and practical applications.`,
        url: "https://youtube.com/watch?v=jNQXAC9IVRw"
      },
      {
        videoId: "L_LUpnjgPso",
        title: `${query} Best Practices`,
        thumbnail: "https://img.youtube.com/vi/L_LUpnjgPso/mqdefault.jpg",
        channel: "Code Masters",
        duration: "18:20",
        views: "650K",
        uploadTime: "1 month ago",
        description: `Learn the best practices and common patterns for ${query} development.`,
        url: "https://youtube.com/watch?v=L_LUpnjgPso"
      }
    ];
  }

  // Get video details
  async getVideo(videoId: string) {
    return this.fetchApi<ApiResponse<VideoData>>(`/videos/${videoId}`);
  }

  // Get video transcript
  async getVideoTranscript(videoId: string) {
    return this.fetchApi<ApiResponse<{
      transcript: { text: string; start: number; duration: number; }[];
      videoId: string;
    }>>(`/transcripts/${videoId}`);
  }

  // Ask a question about a video at a specific timestamp
  async askVideoQuestion(params: { videoId: string; question: string; currentTime?: number }) {
    return this.fetchApi<ApiResponse<{
      answer: string;
      reasoning?: string;
      outOfContext: boolean;
      citations?: Array<{ snippet: string; timestamp?: string }>;
    }>>(`/ask`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 🚀 OPTIMIZATION: Preload transcript for instant chatbot readiness
  async preloadTranscript(videoId: string) {
    try {
      return await this.fetchApi<ApiResponse<{ status: string }>>(`/videos/${videoId}/preload`, {
        method: 'POST',
      });
    } catch (error) {
      // Non-critical - don't throw, just log
      console.log('Preload request sent (fire-and-forget)');
      return { success: true, data: { status: 'initiated' } };
    }
  }

  // 🚀 OPTIMIZATION: Check if transcript is ready
  async checkTranscriptStatus(videoId: string) {
    try {
      return await this.fetchApi<ApiResponse<{ 
        ready: boolean; 
        source?: string; 
        wordCount?: number;
        chunkCount?: number;
        message?: string;
        status?: string;
      }>>(`/videos/${videoId}/transcript-status`, undefined, { retries: 0, timeout: 5000 });
    } catch (error) {
      return { success: false, data: { ready: false } };
    }
  }

  // 📝 Get video summary
  async getVideoSummary(videoId: string) {
    return this.fetchApi<ApiResponse<{
      overview: string;
      keyPoints: string[];
      mainTopics: string[];
      keyTimestamps: Array<{ time: string; description: string }>;
      targetAudience: string;
      difficulty: 'beginner' | 'intermediate' | 'advanced';
      estimatedWatchTime: string;
      videoId: string;
      generatedAt: string;
    }>>(`/transcripts/${videoId}/summary`, undefined, { timeout: 60000 }); // 60s timeout for AI generation
  }

  // 📚 Get video glossary
  async getVideoGlossary(videoId: string) {
    return this.fetchApi<ApiResponse<{
      terms: Array<{
        id: string;
        term: string;
        definition: string;
        category: string;
        relatedTerms: string[];
        videoTimestamp?: number;
        timestampFormatted?: string;
      }>;
      categories: string[];
      totalTerms: number;
      videoId: string;
      generatedAt: string;
    }>>(`/transcripts/${videoId}/glossary`, undefined, { timeout: 60000 }); // 60s timeout for AI generation
  }

  // 🎴 Get video flashcards
  async getVideoFlashcards(videoId: string, count: number = 10) {
    const params = new URLSearchParams({ count: count.toString() });
    return this.fetchApi<ApiResponse<{
      videoId: string;
      videoTitle: string;
      cards: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        difficulty: 'easy' | 'medium' | 'hard';
        timestamp?: string;
      }>;
      totalCards: number;
      categories: string[];
      generatedAt: string;
    }>>(`/transcripts/${videoId}/flashcards?${params}`, undefined, { timeout: 60000 }); // 60s timeout for AI generation
  }

  // 📝 Get video quiz
  async getVideoQuiz(videoId: string, count: number = 10) {
    const params = new URLSearchParams({ count: count.toString() });
    return this.fetchApi<ApiResponse<{
      videoId: string;
      videoTitle: string;
      questions: Array<{
        id: string;
        question: string;
        options: string[];
        correctAnswer: number;
        explanation: string;
        difficulty: 'easy' | 'medium' | 'hard';
        category: string;
        timestamp?: string;
      }>;
      totalQuestions: number;
      categories: string[];
      generatedAt: string;
    }>>(`/transcripts/${videoId}/quiz?${params}`, undefined, { timeout: 60000 }); // 60s timeout for AI generation
  }

  // Get trending topics
  async getTrendingTopics() {
    return this.fetchApi<ApiResponse<{
      trending: any[];
      subjects: any[];
      generatedAt: string;
    }>>('/search/trending-topics');
  }

  // Get search suggestions
  async getSearchSuggestions(query: string) {
    const params = new URLSearchParams({ q: query });
    return this.fetchApi<ApiResponse<string[]>>(`/search/suggestions?${params}`);
  }

  // 🛡️ Dashboard statistics with graceful fallback
  async getDashboardStats(userId: number) {
    try {
      return await this.fetchApi<ApiResponse<{
        totalHours: number;
        videosWatched: number;
        currentStreak: number;
        experiencePoints: number;
      }>>(`/progress/stats?userId=${userId}`, undefined, { retries: 1 });
    } catch {
      // Return default stats if backend fails
      return {
        success: true,
        data: { totalHours: 0, videosWatched: 0, currentStreak: 0, experiencePoints: 0 }
      };
    }
  }

  // 🛡️ Progress tracking methods with graceful fallbacks
  async getVideoProgress(userId: number, videoId: string) {
    try {
      return await this.fetchApi<ApiResponse<{
        progress: {
          progressTime: number;
          totalDuration: number;
          completed: boolean;
          lastWatched: string;
        } | null;
        resumeTime: number;
        completed: boolean;
      }>>(`/progress/${videoId}?userId=${userId}`, undefined, { retries: 1 });
    } catch {
      // Return no progress if fetch fails
      return {
        success: true,
        data: { progress: null, resumeTime: 0, completed: false }
      };
    }
  }

  async updateVideoProgress(params: {
    userId: number;
    videoId: string;
    progressTime: number;
    totalDuration: number;
    action?: 'play' | 'pause' | 'seek' | 'complete';
    videoTitle?: string;
    videoThumbnail?: string;
    videoChannel?: string;
  }) {
    try {
      return await this.fetchApi<ApiResponse<{
        progress: {
          progressTime: number;
          totalDuration: number;
          completed: boolean;
        };
        message: string;
      }>>('/progress/update', {
        method: 'POST',
        body: JSON.stringify(params),
      }, { retries: 0, timeout: 5000 }); // Fast timeout, no retries for progress updates
    } catch {
      // Non-critical - silently fail
      return { success: false, data: null as any, message: 'Progress update failed' };
    }
  }

  async markVideoCompleted(userId: number, videoId: string) {
    try {
      return await this.fetchApi<ApiResponse<{ message: string }>>(`/progress/${videoId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
    } catch {
      return { success: false, data: { message: 'Failed to mark complete' } };
    }
  }

  async getContinueWatching(userId: number, limit: number = 10) {
    try {
      return await this.fetchApi<ApiResponse<{
        videos: Array<{
          videoId: string;
          title: string;
          thumbnail: string;
          channel: string;
          progressTime: number;
          totalDuration: number;
          lastWatched: string;
        }>;
        count: number;
      }>>(`/progress/in-progress?userId=${userId}&limit=${limit}`, undefined, { retries: 1 });
    } catch {
      return { success: true, data: { videos: [], count: 0 } };
    }
  }

  async getRecentlyWatched(userId: number, limit: number = 10) {
    try {
      return await this.fetchApi<ApiResponse<{
        videos: Array<{
          videoId: string;
          title: string;
          thumbnail: string;
          channel: string;
          progressTime: number;
          totalDuration: number;
          completed: boolean;
          lastWatched: string;
          subject?: string;
        }>;
        count: number;
      }>>(`/progress/recently-watched?userId=${userId}&limit=${limit}`, undefined, { retries: 1 });
    } catch {
      return { success: true, data: { videos: [], count: 0 } };
    }
  }

  // Get weekly learning stats (hours per day for past 7 days)
  async getWeeklyStats(userId: number) {
    try {
      return await this.fetchApi<ApiResponse<Array<{
        day: string;
        hours: number;
        date: string;
      }>>>(`/progress/weekly?userId=${userId}`, undefined, { retries: 1 });
    } catch {
      // Return default week with zeros
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return { 
        success: true, 
        data: days.map(day => ({ day, hours: 0, date: '' }))
      };
    }
  }

  // Get learning patterns (time-of-day distribution)
  async getLearningPatterns(userId: number) {
    try {
      return await this.fetchApi<ApiResponse<Array<{
        hour: string;
        avgMinutes: number;
      }>>>(`/progress/patterns?userId=${userId}`, undefined, { retries: 1 });
    } catch {
      return { 
        success: true, 
        data: [
          { hour: '6 AM', avgMinutes: 0 },
          { hour: '9 AM', avgMinutes: 0 },
          { hour: '12 PM', avgMinutes: 0 },
          { hour: '3 PM', avgMinutes: 0 },
          { hour: '6 PM', avgMinutes: 0 },
          { hour: '9 PM', avgMinutes: 0 },
        ]
      };
    }
  }

  // ============================================
  // CHAT HISTORY API
  // ============================================

  // Get chat history for a video
  async getChatHistory(userId: number, videoId: string): Promise<ApiResponse<{
    videoId: string;
    userId: number;
    messages: Array<{
      id: string;
      type: 'user' | 'ai';
      content: string;
      timestamp: number;
      videoTime: number;
    }>;
    count: number;
  }>> {
    try {
      return await this.fetchApi(`/chat/${videoId}?userId=${userId}`, undefined, { retries: 1 });
    } catch {
      return { success: true, data: { videoId, userId, messages: [], count: 0 } };
    }
  }

  // Save a chat message
  async saveChatMessage(
    userId: number,
    videoId: string,
    messageType: 'user' | 'ai',
    content: string,
    videoTime: number = 0
  ): Promise<ApiResponse<{
    id: string;
    type: 'user' | 'ai';
    content: string;
    timestamp: number;
    videoTime: number;
  }>> {
    return this.fetchApi(`/chat/${videoId}`, {
      method: 'POST',
      body: JSON.stringify({ userId, messageType, content, videoTime })
    }, { retries: 1 });
  }

  // Clear chat history for a video
  async clearChatHistory(userId: number, videoId: string): Promise<ApiResponse<{
    videoId: string;
    userId: number;
    deletedCount: number;
  }>> {
    return this.fetchApi(`/chat/${videoId}?userId=${userId}`, {
      method: 'DELETE'
    }, { retries: 1 });
  }

  // ============================================
  // MOCK INTERVIEW API METHODS
  // ============================================

  /**
   * Generate a new mock interview with custom questions
   */
  async generateMockInterview(params: {
    field: string;
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    questionCount?: number;
    userId: number;
  }): Promise<ApiResponse<{
    sessionId: string;
    field: string;
    difficulty: string;
    questions: Array<{
      id: string;
      question: string;
      category: string;
      difficulty: string;
      tips: string[];
      followUpQuestions: string[];
      expectedKeyPoints: string[];
    }>;
    totalQuestions: number;
    generatedAt: string;
  }>> {
    return this.fetchApi('/mock-interview/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }, { timeout: 60000 }); // 60s timeout for AI generation
  }

  /**
   * Evaluate user's answer to an interview question
   */
  async evaluateInterviewAnswer(params: {
    sessionId: string;
    questionId: string;
    question: string;
    userAnswer: string;
    expectedKeyPoints: string[];
    field: string;
  }): Promise<ApiResponse<{
    score: number;
    strengths: string[];
    improvements: string[];
    detailedFeedback: string;
    keyPointsCovered: string[];
    keyPointsMissed: string[];
    suggestedAnswer?: string;
  }>> {
    return this.fetchApi('/mock-interview/evaluate', {
      method: 'POST',
      body: JSON.stringify(params),
    }, { timeout: 45000 }); // 45s timeout for evaluation
  }

  /**
   * Get user's mock interview history
   */
  async getMockInterviewSessions(userId: number, limit: number = 10): Promise<ApiResponse<Array<{
    sessionId: string;
    userId: number;
    field: string;
    difficulty: string;
    questions: any;
    totalQuestions: number;
    createdAt: string;
    completedAt?: string;
    overallScore?: number;
  }>>> {
    return this.fetchApi(`/mock-interview/sessions/${userId}?limit=${limit}`, undefined, { retries: 1 });
  }

  /**
   * Get details of a specific interview session
   */
  async getMockInterviewSessionDetails(sessionId: string): Promise<ApiResponse<{
    session: {
      sessionId: string;
      userId: number;
      field: string;
      difficulty: string;
      questions: any;
      totalQuestions: number;
      createdAt: string;
      completedAt?: string;
      overallScore?: number;
    };
    responses: Array<{
      id: number;
      sessionId: string;
      questionId: string;
      questionText: string;
      userAnswer: string;
      feedback: any;
      score: number;
      answeredAt: string;
    }>;
  }>> {
    return this.fetchApi(`/mock-interview/session/${sessionId}`, undefined, { retries: 1 });
  }

  /**
   * Mark an interview session as complete
   */
  async completeMockInterviewSession(sessionId: string): Promise<ApiResponse<{
    overallScore: number;
  }>> {
    return this.fetchApi('/mock-interview/complete', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }, { retries: 1 });
  }

  /**
   * Get user's mock interview statistics
   */
  async getMockInterviewStats(userId: number): Promise<ApiResponse<{
    totalSessions: number;
    averageScore: number;
    totalQuestionsAnswered: number;
    fieldDistribution: Array<{ field: string; count: number }>;
  }>> {
    return this.fetchApi(`/mock-interview/stats/${userId}`, undefined, { retries: 1 });
  }

  // ============================================
  // TEACHER API
  // ============================================

  /**
   * Get teacher's statistics
   */
  async getTeacherStats(): Promise<ApiResponse<{
    stats: {
      total_lectures: string;
      completed_lectures: string;
      processing_lectures: string;
      failed_lectures: string;
      total_views: string;
      total_notes: string;
      total_question_banks: string;
    };
  }>> {
    return this.fetchApi('/teacher/stats', undefined, { retries: 1 });
  }

  /**
   * Get all lectures for the authenticated teacher
   */
  async getTeacherLectures(): Promise<ApiResponse<{
    lectures: Array<{
      id: number;
      teacher_id: number;
      title: string;
      description: string;
      file_path: string;
      file_size: number;
      duration: string;
      transcript_text: string;
      status: 'processing' | 'completed' | 'failed' | 'draft';
      subject: string;
      difficulty: string;
      visibility: string;
      view_count: number;
      created_at: string;
      updated_at: string;
      notes_count: string;
      question_banks_count: string;
    }>;
    total: number;
  }>> {
    return this.fetchApi('/teacher/lectures', undefined, { retries: 1 });
  }

  /**
   * Get a single lecture with notes and question banks
   */
  async getTeacherLecture(lectureId: number): Promise<ApiResponse<{
    lecture: any;
    notes: Array<{
      id: number;
      lecture_id: number;
      content: string;
      summary_type: 'detailed' | 'quick' | 'outline';
      word_count: number;
      created_at: string;
    }>;
    questionBanks: Array<{
      id: number;
      lecture_id: number;
      questions: any;
      difficulty: string;
      total_questions: number;
      question_type: string;
      created_at: string;
    }>;
  }>> {
    return this.fetchApi(`/teacher/lectures/${lectureId}`, undefined, { retries: 1 });
  }

  /**
   * Upload a new lecture
   */
  async uploadLecture(formData: FormData, onProgress?: (percentage: number) => void): Promise<ApiResponse<{
    lectureId: number;
    transcriptWordCount: number;
    duration: string;
    notesGenerated: boolean;
    questionsGenerated: boolean;
  }>> {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    try {
      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percentage = (e.loaded / e.total) * 100;
            onProgress(percentage);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.message || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was cancelled'));
        });

        xhr.open('POST', `${API_BASE_URL}/teacher/lectures/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload lecture');
    }
  }

  /**
   * Update lecture metadata
   */
  async updateLecture(lectureId: number, data: {
    title?: string;
    description?: string;
    subject?: string;
    difficulty?: string;
    visibility?: string;
  }): Promise<ApiResponse<{ lecture: any }>> {
    return this.fetchApi(`/teacher/lectures/${lectureId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, { retries: 1 });
  }

  /**
   * Delete a lecture
   */
  async deleteLecture(lectureId: number): Promise<ApiResponse<{ message: string }>> {
    return this.fetchApi(`/teacher/lectures/${lectureId}`, {
      method: 'DELETE',
    }, { retries: 1 });
  }

  /**
   * Download notes for a lecture
   */
  async downloadLectureNotes(lectureId: number, type: 'detailed' | 'quick' = 'detailed'): Promise<Blob> {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}/teacher/lectures/${lectureId}/notes/download?type=${type}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download notes');
    }

    return response.blob();
  }

  /**
   * Download question bank for a lecture
   */
  async downloadLectureQuestions(lectureId: number): Promise<Blob> {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}/teacher/lectures/${lectureId}/questions/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download questions');
    }

    return response.blob();
  }
}

export const apiService = new ApiService();

// Utility functions
export const formatDuration = (duration: string): string => {
  // Convert YouTube duration format (e.g., "10:30") to readable format
  if (!duration || duration === '0:00') return 'Unknown';
  return duration;
};

export const formatViews = (views: string): string => {
  if (!views || views === '0') return '0 views';
  
  // Parse number from string and format
  const num = parseInt(views.replace(/[^\d]/g, ''));
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M views`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K views`;
  }
  return `${num} views`;
};

export const getYouTubeVideoId = (url: string): string => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : '';
};

// Export safe storage for use in components
export { safeStorage };
