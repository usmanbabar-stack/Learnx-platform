"use client"

import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Play, Clock, User, Search, Filter, BookOpen, History, X, WifiOff, RefreshCw } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { useState, useEffect, useRef } from "react"
import { apiService, SearchResult, formatDuration, formatViews, getYouTubeVideoId, safeStorage } from "@/lib/api"

const SEARCH_HISTORY_KEY = "learnx:searchHistory";
const SEARCH_RESULTS_KEY = "learnx:searchResults";
const LAST_QUERY_KEY = "learnx:lastQuery";
const MAX_HISTORY_ITEMS = 5;

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

export default function LearnPage() {
  const [videos, setVideos] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isOfflineResults, setIsOfflineResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 🛡️ Monitor online status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🛡️ Load search history AND persisted results on mount using safe storage
  useEffect(() => {
    // Load search history
    const storedHistory = safeStorage.getJSON<string[]>(SEARCH_HISTORY_KEY, []);
    setSearchHistory(storedHistory);
    
    // Load last search query
    const storedQuery = safeStorage.getItem(LAST_QUERY_KEY);
    if (storedQuery) {
      setSearchQuery(storedQuery);
    }
    
    // Load persisted search results
    const storedResults = safeStorage.getJSON<SearchResult[]>(SEARCH_RESULTS_KEY, []);
    if (storedResults.length > 0) {
      setVideos(storedResults);
    }
  }, []);

  // Clear persisted data on logout
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'learnx_user' && !e.newValue) {
        // User logged out - clear search data
        localStorage.removeItem(SEARCH_RESULTS_KEY);
        localStorage.removeItem(LAST_QUERY_KEY);
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        setVideos([]);
        setSearchQuery("");
        setSearchHistory([]);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save search to history
  const addToSearchHistory = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    
    const updated = [trimmed, ...searchHistory.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_HISTORY_ITEMS);
    setSearchHistory(updated);
    safeStorage.setJSON(SEARCH_HISTORY_KEY, updated);
  };

  // Remove from history
  const removeFromHistory = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = searchHistory.filter(h => h !== query);
    setSearchHistory(updated);
    safeStorage.setJSON(SEARCH_HISTORY_KEY, updated);
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Enhance search query to prioritize educational content
  const enhanceForEducation = (query: string): string => {
    const q = query.trim().toLowerCase();
    // If query already has educational keywords, don't add more
    const eduKeywords = ['tutorial', 'explained', 'lecture', 'course', 'lesson', 'learn', 'how to', 'what is', 'guide', 'introduction'];
    const hasEduKeyword = eduKeywords.some(kw => q.includes(kw));
    if (hasEduKeyword) return query.trim();
    // Add "tutorial explained" to make results educational
    return `${query.trim()} tutorial explained`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setShowSuggestions(false);
    addToSearchHistory(searchQuery);
    setIsOfflineResults(false);

    try {
      setLoading(true);
      setError(null);
      
      // Enhance query for educational content
      const educationalQuery = enhanceForEducation(searchQuery);
      
      const response = await apiService.searchVideos(educationalQuery, { limit: 5 });
      
      if (response.success && response.data.videos) {
        setVideos(response.data.videos);
        // Persist search results and query
        safeStorage.setJSON(SEARCH_RESULTS_KEY, response.data.videos);
        safeStorage.setItem(LAST_QUERY_KEY, searchQuery);
        
        // 🛡️ Check if using fallback/offline results
        if (response.data.source === 'offline-fallback' || response.data.source === 'mock') {
          setIsOfflineResults(true);
        }
      } else {
        setError(response.message || "Failed to search videos");
        setVideos([]);
      }
    } catch (err: any) {
      console.error("Search error:", err);
      if (!isOnline) {
        setError("You are offline. Please check your internet connection.");
      } else {
        setError("An error occurred while searching. Please try again.");
      }
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(false);
    // Trigger search
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
    }, 0);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Navigation />
        
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black font-montserrat">Learning Library</h1>
                <p className="text-muted-foreground font-open-sans mt-1">
                  Discover interactive video courses with AI-powered assistance
                </p>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 🛡️ Offline/Warning Banners */}
          {!isOnline && (
            <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
              <WifiOff className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="font-open-sans text-yellow-600">
                You are offline. Search results may be limited.
              </AlertDescription>
            </Alert>
          )}
          
          {isOfflineResults && (
            <Alert className="mb-4 border-blue-500/50 bg-blue-500/10">
              <AlertDescription className="font-open-sans text-blue-600">
                Showing sample results. Connect to the internet for live search.
              </AlertDescription>
            </Alert>
          )}

          {/* Search Bar */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <form onSubmit={handleSearch} className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search for videos (e.g., 'machine learning basics')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    className="pl-10 font-open-sans"
                  />
                  
                  {/* Search History Suggestions */}
                  {showSuggestions && searchHistory.length > 0 && (
                    <div 
                      ref={suggestionsRef}
                      className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50"
                    >
                      <div className="p-2 border-b border-border">
                        <span className="text-xs text-muted-foreground font-medium">Recent Searches</span>
                      </div>
                      {searchHistory.map((query, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSuggestionClick(query)}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{query}</span>
                          </div>
                          <button
                            onClick={(e) => removeFromHistory(query, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded"
                          >
                            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={loading} className="font-open-sans">
                  {loading ? "Searching..." : "Search"}
                </Button>
              </form>
              {error && (
                <p className="text-sm text-red-500 mt-2 font-open-sans">{error}</p>
              )}
            </CardContent>
          </Card>

          {/* Videos Grid */}
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden animate-pulse">
                  <div className="aspect-video bg-muted" />
                  <CardHeader>
                    <div className="h-6 bg-muted rounded mb-2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : videos.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <Link
                  key={video.videoId}
                  href={`/learn/${video.videoId}`}
                  className="group"
                >
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                    <div className="aspect-video relative overflow-hidden bg-muted">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                          <Play className="w-8 h-8 text-primary-foreground ml-1" />
                        </div>
                      </div>
                      {video.duration && (
                        <Badge className="absolute bottom-2 right-2 bg-black/80 text-white">
                          {formatDuration(video.duration)}
                        </Badge>
                      )}
                    </div>
                    <CardHeader>
                      <CardTitle className="font-montserrat line-clamp-2 group-hover:text-primary transition-colors">
                        {video.title}
                      </CardTitle>
                      <CardDescription className="font-open-sans line-clamp-2">
                        {video.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground font-open-sans">
                        <div className="flex items-center space-x-1">
                          <User className="w-4 h-4" />
                          <span className="line-clamp-1">{video.channel}</span>
                        </div>
                        {video.views && (
                          <span>{formatViews(video.views)} views</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold font-montserrat mb-2">
                  Search for Learning Videos
                </h3>
                <p className="text-muted-foreground font-open-sans">
                  Enter a topic above to discover educational content with AI-powered assistance
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}