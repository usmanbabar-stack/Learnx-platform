"use client"

import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"
import { apiService, getYouTubeVideoId } from "@/lib/api"
import { Navigation } from "@/components/navigation"

// Declare YouTube IFrame API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Force client-side only rendering
const isBrowser = typeof window !== 'undefined';
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  MessageCircle,
  Send,
  BookOpen,
  FileText,
  Brain,
  Clock,
  User,
  Bot,
  ArrowLeft,
  BookMarked,
  Trash2,
} from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import Link from "next/link"

interface ChatMessage {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: number
  videoTime?: number
}

interface VideoData {
  id: string
  title: string
  description: string
  duration: number
  transcript: string
  subject: string
  instructor: string
}

export default function VideoLearningPage({ params }: { params: { videoId: string } }) {
  // Extract clean video ID from params (do this first)
  const videoId = params.videoId;

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false)
  const [newMessage, setNewMessage] = useState("")
  const [isTyping, setIsTyping] = useState(false)

  const ytContainerRef = useRef<HTMLDivElement>(null)
  const playerWrapperRef = useRef<HTMLDivElement>(null)
  const ytPlayerRef = useRef<any>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [fallbackEmbed, setFallbackEmbed] = useState(false);
  
  // 🚀 OPTIMIZATION: Track chatbot readiness for user feedback
  const [chatbotReady, setChatbotReady] = useState(false);
  const [chatbotStatus, setChatbotStatus] = useState<string>('Initializing...');
  
  // 📊 USER PROGRESS: Track progress and resume from last position
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [resumeTime, setResumeTime] = useState<number>(0);
  const resumeTimeRef = useRef<number>(0); // Ref for closure in onReady
  const progressUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressUpdateRef = useRef<number>(0);
  
  // 🛡️ CLEANUP: Track if user is still logged in to prevent orphan operations
  const isLoggedInRef = useRef<boolean>(true);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Re-init watchdog and host/attempt tracking
  const initAttemptsRef = useRef(0);
  const readyWatchRef = useRef<NodeJS.Timeout | null>(null);
  const hostRef = useRef<'youtube' | 'nocookie'>('youtube');

  // CRITICAL: Mark component as mounted (fixes hydration)
  useEffect(() => {
    setMounted(true);
    console.log('Component mounted on client');
    isLoggedInRef.current = true;
    
    // 📊 USER PROGRESS: Get current user from localStorage
    try {
      const userStr = localStorage.getItem('learnx_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUserId(user.id);
        console.log('Current user ID:', user.id);
      }
    } catch (e) {
      console.log('No user session found');
    }
    
    // 🛡️ CLEANUP: Listen for logout to cancel all operations
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'learnx_user' && !e.newValue) {
        console.log('🚪 User logged out - cancelling all operations');
        isLoggedInRef.current = false;
        setCurrentUserId(null);
        
        // Cancel any pending API calls
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        
        // Clear status polling
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current);
          statusPollingRef.current = null;
        }
        
        // Clear progress update interval
        if (progressUpdateIntervalRef.current) {
          clearInterval(progressUpdateIntervalRef.current);
          progressUpdateIntervalRef.current = null;
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      isLoggedInRef.current = false;
      
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, []);

  // Reset states when video changes
  useEffect(() => {
    if (!mounted) return;
    
    console.log('Video ID changed to:', videoId);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayerReady(false);
    setError(null);
    setResumeTime(0);
    setChatbotReady(false);
    setChatbotStatus('Initializing...');
    setChatHistoryLoaded(false);
    loadVideoData();
    
    // 📊 USER PROGRESS: Load saved progress for resume
    if (currentUserId) {
      loadVideoProgress();
      loadChatHistory();
    }
  }, [videoId, mounted, currentUserId]);

  // 💬 CHAT HISTORY: Load saved chat messages
  const loadChatHistory = async () => {
    if (!currentUserId) return;
    
    try {
      const response = await apiService.getChatHistory(currentUserId, videoId);
      if (response.success && response.data.messages.length > 0) {
        // Convert API messages to ChatMessage format
        const loadedMessages: ChatMessage[] = response.data.messages.map(msg => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          videoTime: msg.videoTime
        }));
        setChatMessages(loadedMessages);
        console.log(`💬 Loaded ${loadedMessages.length} chat messages for video ${videoId}`);
      } else {
        // No history - show welcome message
        setChatMessages([{
          id: "welcome",
          type: "ai",
          content: "Hi! I'm your AI learning assistant. I can help you understand this video content. Feel free to ask me questions about anything you're watching!",
          timestamp: Date.now(),
        }]);
      }
    } catch (e) {
      console.log('Could not load chat history:', e);
      // Show welcome message on error
      setChatMessages([{
        id: "welcome",
        type: "ai",
        content: "Hi! I'm your AI learning assistant. I can help you understand this video content. Feel free to ask me questions about anything you're watching!",
        timestamp: Date.now(),
      }]);
    } finally {
      setChatHistoryLoaded(true);
    }
  };

  // 💬 CHAT HISTORY: Clear all chat messages
  const clearChatHistory = async () => {
    if (!currentUserId) return;
    
    try {
      await apiService.clearChatHistory(currentUserId, videoId);
      setChatMessages([{
        id: "welcome",
        type: "ai",
        content: "Hi! I'm your AI learning assistant. I can help you understand this video content. Feel free to ask me questions about anything you're watching!",
        timestamp: Date.now(),
      }]);
      console.log(`🗑️ Cleared chat history for video ${videoId}`);
    } catch (e) {
      console.error('Failed to clear chat history:', e);
    }
  };

  // 📊 USER PROGRESS: Load saved progress
  const loadVideoProgress = async () => {
    if (!currentUserId) return;
    
    try {
      const response = await apiService.getVideoProgress(currentUserId, videoId);
      if (response.success && response.data.resumeTime > 0) {
        const savedTime = response.data.resumeTime;
        setResumeTime(savedTime);
        resumeTimeRef.current = savedTime; // Update ref for player onReady
        console.log(`📍 Resume point loaded: ${savedTime}s`);
        
        // If player is already ready, seek now
        if (ytPlayerRef.current && playerReady) {
          try {
            const dur = ytPlayerRef.current.getDuration?.() || 0;
            if (savedTime > 10 && savedTime < dur - 10) {
              console.log(`⏩ Seeking to resume position: ${savedTime}s`);
              ytPlayerRef.current.seekTo(savedTime, true);
              setCurrentTime(savedTime);
            }
          } catch (e) {
            console.log('Could not seek to resume position');
          }
        }
      }
    } catch (e) {
      console.log('Could not load saved progress');
    }
  };
  
  // 📊 USER PROGRESS: Save progress periodically
  useEffect(() => {
    if (!currentUserId || !playerReady) return;
    
    // Update progress every 10 seconds while playing
    progressUpdateIntervalRef.current = setInterval(() => {
      // 🛡️ Check if still logged in before saving
      if (!isLoggedInRef.current) {
        if (progressUpdateIntervalRef.current) {
          clearInterval(progressUpdateIntervalRef.current);
          progressUpdateIntervalRef.current = null;
        }
        return;
      }
      
      if (isPlaying && currentTime > 0) {
        const now = Date.now();
        // Throttle updates to every 10 seconds
        if (now - lastProgressUpdateRef.current > 10000) {
          lastProgressUpdateRef.current = now;
          apiService.updateVideoProgress({
            userId: currentUserId,
            videoId,
            progressTime: Math.floor(currentTime),
            totalDuration: videoData?.duration || 0,
            action: 'play',
            videoTitle: videoData?.title,
            videoThumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            videoChannel: videoData?.instructor
          }).catch(e => console.log('Progress update failed (non-critical)'));
        }
      }
    }, 5000);
    
    return () => {
      if (progressUpdateIntervalRef.current) {
        clearInterval(progressUpdateIntervalRef.current);
      }
    };
  }, [currentUserId, playerReady, isPlaying, currentTime, videoId, videoData]);
  
  // 📊 USER PROGRESS: Save on pause/leave
  useEffect(() => {
    const BACKEND_URL = 'http://localhost:3001';
    
    const saveProgressOnLeave = () => {
      // 🛡️ Only save if user is still logged in
      if (!isLoggedInRef.current || !currentUserId || currentTime <= 0) {
        return;
      }
      
      // Use sendBeacon for reliable save on page leave
      const data = JSON.stringify({
        userId: currentUserId,
        videoId,
        progressTime: Math.floor(currentTime),
        totalDuration: videoData?.duration || 0,
        action: 'pause',
        videoTitle: videoData?.title,
        videoThumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        videoChannel: videoData?.instructor
      });
      navigator.sendBeacon?.(`${BACKEND_URL}/api/progress/update`, new Blob([data], { type: 'application/json' }));
    };
    
    const handleBeforeUnload = () => saveProgressOnLeave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgressOnLeave();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      // Only save on normal cleanup (not logout)
      if (isLoggedInRef.current) {
        saveProgressOnLeave();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId, currentTime, videoId, videoData?.duration]);

  const loadVideoData = async () => {
    try {
      // Set mock data immediately for instant loading
      const mockData: VideoData = {
        id: videoId,
        title: "Loading...",
        description: "Loading video content...",
        duration: 3600,
        transcript: "",
        subject: "Educational",
        instructor: "Loading...",
      };
      setVideoData(mockData);
      setLoading(false); // Show UI immediately
      setError(null);
      
      console.log('Loading video metadata for ID:', videoId);
      
      // Try to fetch video data from backend in background
      try {
        const response = await apiService.getVideo(videoId);
        if (response.success && response.data) {
          setVideoData({
            id: videoId,
            title: response.data.title || "Educational Video",
            description: response.data.description || "",
            duration: parseInt(response.data.duration) || 3600,
            transcript: "",
            subject: response.data.subject || "Educational",
            instructor: response.data.channel || "Instructor",
          });
        }
        
        // 🚀 OPTIMIZATION: Preload transcript immediately when video loads
        // This ensures chatbot is ready by the time user asks first question
        console.log('🔄 Preloading transcript for chatbot readiness...');
        setChatbotStatus('Preparing AI assistant...');
        
        // Fire preload request (don't await) - but check login status
        if (isLoggedInRef.current) {
          apiService.preloadTranscript(videoId).then(() => {
            console.log('Transcript preload request sent');
          }).catch(err => {
            console.log('Transcript preload initiated (background)');
          });
        }
        
        // Improved polling: Check status immediately and at intervals
        let pollCount = 0;
        // 🔧 FIX: Extend polling to 3 minutes for longer videos (90 polls × 2s = 180s)
        const maxPolls = 90;
        let lastStatusMessage = 'Processing video transcript...';
        
        const checkAndUpdateStatus = async () => {
          // 🛡️ Stop if user logged out
          if (!isLoggedInRef.current) {
            return true; // Stop polling
          }
          
          try {
            const status = await apiService.checkTranscriptStatus(videoId);
            console.log('📊 Chatbot status check:', status);
            
            if (status.success && status.data?.ready) {
              setChatbotReady(true);
              const wordCount = status.data.wordCount ? ` (${status.data.wordCount} words indexed)` : '';
              setChatbotStatus(`Ready for questions!${wordCount}`);
              return true; // Stop polling
            } else {
              // 🔧 FIX: Use backend status message if available, otherwise show progress
              const backendMessage = status.data?.message || status.data?.status;
              if (backendMessage && backendMessage !== 'Not started') {
                lastStatusMessage = backendMessage;
              } else {
                const elapsed = pollCount * 2;
                if (elapsed < 30) {
                  lastStatusMessage = 'Processing video transcript...';
                } else if (elapsed < 60) {
                  lastStatusMessage = 'Extracting subtitles... (this may take a minute)';
                } else if (elapsed < 120) {
                  lastStatusMessage = 'Indexing content for AI... (almost ready)';
                } else {
                  lastStatusMessage = 'Still processing... (large video)';
                }
              }
              setChatbotStatus(lastStatusMessage);
              return false; // Continue polling
            }
          } catch (e) {
            console.log('Status check failed, retrying...');
            return false;
          }
        };
        
        // Check immediately
        const isReady = await checkAndUpdateStatus();
        
        // If not ready, start polling
        if (!isReady && isLoggedInRef.current) {
          statusPollingRef.current = setInterval(async () => {
            pollCount++;
            const ready = await checkAndUpdateStatus();
            
            if (ready || pollCount >= maxPolls || !isLoggedInRef.current) {
              if (statusPollingRef.current) {
                clearInterval(statusPollingRef.current);
                statusPollingRef.current = null;
              }
              
              // 🔧 FIX: Don't say "AI available" if not ready - keep showing processing status
              if (!ready && pollCount >= maxPolls) {
                // Still processing - don't mislead user
                setChatbotStatus('Still processing... (ask a question to check)');
              }
            }
          }, 2000);
        }
        
      } catch (apiError) {
        // Keep mock data if backend fails
        console.log('Using YouTube player directly (backend not available)');
        
        // Still try to preload transcript even if video metadata failed
        apiService.preloadTranscript(videoId).catch(() => {});
        setChatbotStatus('AI may take longer to respond...');
      }
    } catch (err) {
      console.error('Failed to load video data:', err);
      setError('Failed to load video data.');
      setLoading(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [chatMessages, isTyping])

  // YouTube IFrame API with PROPER client-side mounting
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === 'undefined') return;

    console.log('Initializing YouTube player...');
    let timeInterval: NodeJS.Timeout;
    let apiCheckInterval: NodeJS.Timeout;

    const clearReadyWatch = () => {
      if (readyWatchRef.current) {
        clearTimeout(readyWatchRef.current);
        readyWatchRef.current = null;
      }
    };

    const scheduleWatchdog = (hostForLog: string) => {
      clearReadyWatch();
      readyWatchRef.current = setTimeout(() => {
        if (!playerReady) {
          console.log(`⏱️ Player not ready after timeout (host=${hostForLog}). Attempt ${initAttemptsRef.current}`);
          if (initAttemptsRef.current < 2) {
            // Try re-create with alternate host
            initAttemptsRef.current += 1;
            hostRef.current = hostRef.current === 'youtube' ? 'nocookie' : 'youtube';
            try {
              if (ytPlayerRef.current) {
                ytPlayerRef.current.destroy?.();
                ytPlayerRef.current = null;
              }
            } catch {}
            console.log('♻️ Re-initializing player with host:', hostRef.current);
            setupPlayer(hostRef.current);
          } else {
            console.log('🧰 Falling back to simple iframe embed');
            setFallbackEmbed(true);
          }
        }
      }, 4000);
    };

    const setupPlayer = (hostOverride?: 'youtube' | 'nocookie') => {
      console.log('setupPlayer called, YT available:', !!window.YT);
      
      if (!window.YT || !window.YT.Player) {
        console.log('YT.Player not available yet');
        return;
      }
      
      if (!ytContainerRef.current) {
        console.log('Container ref not available yet, retrying shortly...');
        setTimeout(() => setupPlayer(hostOverride), 50);
        return;
      }

      // If player exists and just needs to change video, don't recreate
      if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        console.log('Switching to video ID:', videoId);
        try {
          setPlayerReady(false); // Show loading while switching
          ytPlayerRef.current.loadVideoById({
            videoId: videoId,
            startSeconds: 0
          });
          return;
        } catch (err) {
          console.log('Failed to switch video, recreating player:', err);
          // Fallthrough to create new player
        }
      }

      // Destroy old player if exists
      if (ytPlayerRef.current) {
        try { 
          ytPlayerRef.current.destroy();
          console.log('Old player destroyed');
        } catch (e) {
          console.log('Error destroying player:', e);
        }
        ytPlayerRef.current = null;
      }

      const chosenHost = hostOverride ?? hostRef.current;
      console.log('Creating new YouTube player for video ID:', videoId, 'host=', chosenHost);
      setPlayerReady(false);
      setFallbackEmbed(false);
      
      try {
        ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
          videoId: videoId,
          width: '100%',
          height: '100%',
          host: chosenHost === 'nocookie' ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
          playerVars: {
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            disablekb: 1,
            enablejsapi: 1,
            autoplay: 0,
            origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          },
          events: {
            onReady: (e: any) => {
              console.log('YouTube player is ready!');
              setPlayerReady(true);
              clearReadyWatch();
              try {
                const dur = e?.target?.getDuration?.() || 0
                if (dur > 0) {
                  setVideoData((prev) => prev ? { ...prev, duration: Math.floor(dur) } : prev)
                }
                
                // 📊 USER PROGRESS: Seek to resume position if available (use ref for latest value)
                const savedResumeTime = resumeTimeRef.current;
                if (savedResumeTime > 10 && savedResumeTime < dur - 10) {
                  console.log(`⏩ Resuming from ${savedResumeTime}s`);
                  e.target.seekTo(savedResumeTime, true);
                  setCurrentTime(savedResumeTime);
                }
              } catch {}
            },
            onStateChange: (e: any) => {
              // 1 = playing, 2 = paused, 0 = ended
              if (e.data === 1) setIsPlaying(true)
              if (e.data === 2) setIsPlaying(false)
              if (e.data === 0) setIsPlaying(false)
            },
            onError: (e: any) => {
              console.error('❌ YouTube player error:', e);
              const errorMessages: Record<number, string> = {
                2: 'Invalid video ID',
                5: 'HTML5 player error',
                100: 'Video not found',
                101: 'Video not embeddable',
                150: 'Video not embeddable',
              };
              const message = errorMessages[e.data] || 'Unknown error';
              console.log(`Retrying for error: ${message}`);
              setPlayerReady(false);
              setError(
                `Failed to load video: ${message}. Please try refreshing or choosing a different video.`
              );

              // Immediate fallback for non-embeddable
              if (e.data === 101 || e.data === 150) {
                setFallbackEmbed(true);
                clearReadyWatch();
                return;
              }

              // Retry logic for recoverable errors
              const retryErrors = new Set([2, 5, 100]);
              if (retryErrors.has(e.data)) {
                if (initAttemptsRef.current < 2) {
                  initAttemptsRef.current += 1;
                  hostRef.current = hostRef.current === 'youtube' ? 'nocookie' : 'youtube';
                  console.log('Retrying by re-creating player, attempt', initAttemptsRef.current, 'host=', hostRef.current);
                  try { ytPlayerRef.current?.destroy?.(); } catch {}
                  ytPlayerRef.current = null;
                  setupPlayer(hostRef.current);
                } else {
                  setFallbackEmbed(true);
                }
              }
            }
          }
        });
        console.log('YouTube player instance created');
        // Start watchdog after creation
        scheduleWatchdog(chosenHost);
      } catch (error) {
        console.error('Error creating YouTube player:', error);
        setError('Failed to initialize video player.');
      }
    }

    // Wait for or load YouTube API
    const loadYouTubeAPI = () => {
      // Check if API is already loaded
      if (window.YT && window.YT.Player) {
        console.log('✅ YouTube API already loaded');
        setApiReady(true);
        setupPlayer();
        return;
      }

      console.log('⏳ YouTube API not ready, waiting...');
      
      // Set up global callback ONLY ONCE (avoid reassigning on every render)
      if (!window.onYouTubeIframeAPIReady) {
        window.onYouTubeIframeAPIReady = () => {
          console.log('✅ YouTube API ready via global callback');
          if (window.YT && window.YT.Player) {
            setApiReady(true);
            setupPlayer();
          }
        };
      }
      
      // Check if script already exists
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      
      if (!existingScript) {
        // Script not loaded by layout, inject it manually
        console.log('📥 Loading YouTube API script manually');
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        const firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode?.insertBefore(tag, firstScript);
      }
      
      // Poll as backup
      let attempts = 0;
      apiCheckInterval = setInterval(() => {
        attempts++;
        console.log(`Polling attempt ${attempts}...`, { YT: !!window.YT, Player: !!window.YT?.Player });
        
        if (window.YT && window.YT.Player) {
          console.log(`✅ YouTube API ready after ${attempts * 100}ms`);
          clearInterval(apiCheckInterval);
          setApiReady(true);
          setupPlayer();
        } else if (attempts > 150) {
          // 15 seconds timeout
          clearInterval(apiCheckInterval);
          console.error('❌ YouTube API timeout after 15s');
          setError('Failed to load YouTube player. Please refresh the page.');
        }
      }, 100);
    };

    // Start loading
    loadYouTubeAPI();

    // Tick current time while playing
    timeInterval = setInterval(() => {
      try {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          const ct = ytPlayerRef.current.getCurrentTime();
          if (typeof ct === 'number' && !Number.isNaN(ct)) {
            setCurrentTime(ct);
          }
        }
      } catch {}
    }, 500);

    return () => {
      clearInterval(timeInterval);
      if (apiCheckInterval) clearInterval(apiCheckInterval);
      clearReadyWatch();
      
      // Pause but don't destroy on cleanup for faster switching
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
    };
  }, [videoId, mounted])

  // Cleanup on component unmount (destroy player completely)
  useEffect(() => {
    return () => {
      console.log('🗑️ Component unmounting, destroying player');
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
          ytPlayerRef.current = null;
        } catch (e) {
          console.log('Error destroying player on unmount:', e);
        }
      }
    };
  }, []);

  const togglePlay = () => {
    const p = ytPlayerRef.current
    if (!p) return
    try {
      if (isPlaying) p.pauseVideo(); else p.playVideo();
      setIsPlaying(!isPlaying)
    } catch {}
  }

  const handleTimeUpdate = () => {}

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    const p = ytPlayerRef.current
    try {
      if (p && typeof p.setVolume === 'function') p.setVolume(Math.round(newVolume * 100))
    } catch {}
  }

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    const p = ytPlayerRef.current
    try {
      if (!p) return
      if (next) p.mute(); else p.unMute();
    } catch {}
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: newMessage,
      timestamp: Date.now(),
      videoTime: currentTime,
    }

    const question = newMessage
    setChatMessages((prev) => [...prev, userMessage])
    setNewMessage("")
    setIsTyping(true)

    // 💬 Save user message to database
    if (currentUserId) {
      apiService.saveChatMessage(currentUserId, videoId, 'user', newMessage, Math.floor(currentTime))
        .catch(e => console.log('Failed to save user message:', e));
    }

    try {
      const resp = await apiService.askVideoQuestion({ videoId, question, currentTime })
      const data = resp?.data as any
      const answerText = data?.answer || 'I could not find an answer in the current context.'
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: answerText,
        timestamp: Date.now(),
        videoTime: currentTime,
      }
      setChatMessages((prev) => [...prev, aiResponse])
      
      // 💬 Save AI response to database
      if (currentUserId) {
        apiService.saveChatMessage(currentUserId, videoId, 'ai', answerText, Math.floor(currentTime))
          .catch(e => console.log('Failed to save AI message:', e));
      }
    } catch (e) {
      const errorMessage = 'Sorry, I could not process your question right now.';
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: errorMessage,
        timestamp: Date.now(),
        videoTime: currentTime,
      }
      setChatMessages((prev) => [...prev, aiResponse])
      
      // 💬 Save error message to database too
      if (currentUserId) {
        apiService.saveChatMessage(currentUserId, videoId, 'ai', errorMessage, Math.floor(currentTime))
          .catch(e => console.log('Failed to save error message:', e));
      }
    } finally {
      setIsTyping(false)
    }
  }

  const jumpToTime = (time: number) => {
    const p = ytPlayerRef.current
    try {
      if (p && typeof p.seekTo === 'function') p.seekTo(time, true)
      setCurrentTime(time)
    } catch {}
  }

  const handleSeekBar = (value: number[]) => {
    const newTime = value[0]
    jumpToTime(newTime)
  }

  const toggleFullscreen = () => {
    const wrapper = playerWrapperRef.current
    if (!wrapper) return
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // Show loading ONLY on server-side or initial mount
  if (!mounted || loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <Navigation />
          <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-muted-foreground">Loading video...</p>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error || !videoData) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <Navigation />
          <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error || 'Video not found'}</p>
              <Button onClick={loadVideoData} variant="outline">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div key={videoId} className="min-h-screen bg-background" suppressHydrationWarning>
        <Navigation />
        
        <div className="container mx-auto px-4 py-6 max-w-[1800px]">
          {/* Back Button */}
          <div className="mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/learn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Library
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Video Area - 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
              {/* Video Player with 16:9 Aspect Ratio */}
              <Card>
                <CardContent className="p-0">
                  <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }} ref={playerWrapperRef}>
                    {/* YouTube Player Container or Fallback Iframe */}
                    {!fallbackEmbed ? (
                      <div
                        ref={ytContainerRef}
                        id={`youtube-player-${videoId}`}
                        className="absolute top-0 left-0 w-full h-full"
                      />
                    ) : (
                      <iframe
                        key={`fb-${videoId}`}
                        className="absolute top-0 left-0 w-full h-full"
                        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        title={videoData?.title || 'Video'}
                      />
                    )}
                    
                    {/* Loading overlay */}
                    {!playerReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <div className="text-center text-white">
                          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                          <p className="text-lg">
                            {!apiReady ? 'Loading player...' : 'Initializing video...'}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Custom controls */}
                    {playerReady && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <div className="flex items-center space-x-4">
                          <Button variant="ghost" size="sm" onClick={togglePlay} className="text-white hover:bg-white/20">
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                          </Button>

                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" onClick={toggleMute} className="text-white hover:bg-white/20">
                              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </Button>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={volume}
                              onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                              className="w-20"
                            />
                          </div>

                          <div className="flex-1 flex items-center space-x-2">
                            <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
                            <Slider value={[currentTime]} max={videoData?.duration || 0} step={1} onValueChange={handleSeekBar} className="flex-1" />
                            <span className="text-white text-sm font-mono">{formatTime(videoData?.duration || 0)}</span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="text-white hover:bg-white/20">
                              <Maximize className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Video Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat text-xl">{videoData.title}</CardTitle>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <span className="flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {videoData.instructor}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {formatTime(videoData.duration)}
                    </span>
                    <Badge variant="secondary">{videoData.subject}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground font-open-sans">{videoData.description}</p>
                </CardContent>
              </Card>

              {/* Learning Tools */}
              <div>
                <h3 className="text-lg font-bold font-montserrat mb-4">Learning Tools</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Link href={`/tools/summary?videoId=${videoId}`} className="cursor-pointer">
                    <Card className="hover:shadow-md transition-shadow h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <FileText className="w-4 h-4 mr-2 text-accent" />
                          Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground font-open-sans">
                          AI-generated key points from this video
                        </p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/tools/flashcards?videoId=${videoId}`} className="cursor-pointer">
                    <Card className="hover:shadow-md transition-shadow h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <BookOpen className="w-4 h-4 mr-2 text-accent" />
                          Flashcards
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground font-open-sans">
                          Practice with auto-generated flashcards
                        </p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/tools/quiz?videoId=${videoId}`} className="cursor-pointer">
                    <Card className="hover:shadow-md transition-shadow h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <Brain className="w-4 h-4 mr-2 text-accent" />
                          Quiz
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground font-open-sans">
                          Test your understanding with AI questions
                        </p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/tools/glossary?videoId=${videoId}`} className="cursor-pointer">
                    <Card className="hover:shadow-md transition-shadow h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <BookMarked className="w-4 h-4 mr-2 text-accent" />
                          Glossary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground font-open-sans">
                          Key terms and definitions explained
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </div>
            </div>

            {/* AI Chat Sidebar - 1/3 width */}
            <div className="lg:col-span-1">
              <Card className="h-[800px] flex flex-col sticky top-20">
                <CardHeader className="border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-montserrat flex items-center">
                      <Brain className="w-5 h-5 mr-2 text-accent" />
                      AI Assistant
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {/* 💬 Clear History Button */}
                      {chatMessages.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearChatHistory}
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                          title="Clear chat history"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {/* 🚀 OPTIMIZATION: Show readiness status */}
                      <Badge 
                        variant={chatbotReady ? "default" : "secondary"}
                        className={chatbotReady ? "bg-green-500 hover:bg-green-600" : "animate-pulse"}
                      >
                        {chatbotReady ? "Ready" : "Loading..."}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-open-sans">
                    {chatbotStatus}
                  </p>
                </CardHeader>

                {/* Chat Messages - Fixed height with scroll */}
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                      {chatMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg p-3 ${
                              message.type === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div className="flex items-center space-x-2 mb-1">
                              {message.type === "ai" ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              <span className="text-xs font-medium">{message.type === "ai" ? "AI Assistant" : "You"}</span>
                              {message.videoTime !== undefined && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-auto p-0 hover:underline"
                                  onClick={() => jumpToTime(message.videoTime!)}
                                >
                                  {formatTime(message.videoTime)}
                                </Button>
                              )}
                            </div>
                            <p className="text-sm font-open-sans break-words whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ))}

                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="bg-muted text-muted-foreground rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <Bot className="w-3 h-3" />
                              <span className="text-xs font-medium">AI Assistant</span>
                            </div>
                            <div className="flex space-x-1 mt-2">
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                              <div
                                className="w-2 h-2 bg-current rounded-full animate-bounce"
                                style={{ animationDelay: "0.1s" }}
                              ></div>
                              <div
                                className="w-2 h-2 bg-current rounded-full animate-bounce"
                                style={{ animationDelay: "0.2s" }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Invisible div to scroll to */}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </div>

                {/* Chat Input - Fixed at bottom */}
                <div className="p-4 border-t border-border flex-shrink-0">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Ask about the video content..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                      className="flex-1 font-open-sans"
                    />
                    <Button onClick={sendMessage} size="sm" disabled={!newMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-open-sans">
                    The AI can see your current video timestamp and provide context-aware answers.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}