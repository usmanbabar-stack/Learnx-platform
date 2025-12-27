"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "@/components/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Loader2, ChevronLeft, ChevronRight, RotateCcw, Shuffle, ArrowLeft, BookOpen, Search, Sparkles, RotateCw } from "lucide-react";
import { apiService } from "@/lib/api";

interface Flashcard {
  id: number;
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
}

export default function FlashcardsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoId = searchParams.get("videoId");
  const videoTitle = searchParams.get("title") || "Video Flashcards";
  
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studiedCards, setStudiedCards] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  const isLoadingRef = useRef(false);

  // Fetch flashcards from API
  const fetchFlashcards = useCallback(async () => {
    if (!videoId || isLoadingRef.current) return;
    
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getVideoFlashcards(videoId);
      if (response.success && response.data?.cards) {
        const cards = response.data.cards.map((card: any, index: number) => ({
          id: index + 1,
          question: card.question,
          answer: card.answer,
          difficulty: card.difficulty || "medium",
        }));
        setFlashcards(cards);
      } else {
        setError(response.error || "Failed to generate flashcards");
      }
    } catch (err) {
      console.error("Error fetching flashcards:", err);
      setError("Failed to load flashcards. Please try again.");
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [videoId]);

  useEffect(() => {
    if (videoId) {
      fetchFlashcards();
    }
  }, [videoId, fetchFlashcards]);

  // Filter flashcards based on search
  const filteredFlashcards = flashcards.filter(card =>
    card.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Navigation functions
  const nextCard = () => {
    if (currentCardIndex < filteredFlashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

  const markAsStudied = () => {
    const currentCard = filteredFlashcards[currentCardIndex];
    if (currentCard) {
      setStudiedCards(prev => new Set(prev).add(currentCard.id));
      nextCard();
    }
  };

  const shuffleCards = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudiedCards(new Set());
  };

  const resetProgress = () => {
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudiedCards(new Set());
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "medium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "hard": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const currentCard = filteredFlashcards[currentCardIndex];

  // No video selected state
  if (!videoId) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-[#0a0a0f]">
          <Navigation />
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-2xl mx-auto text-center">
              <Card className="bg-[#12121a] border-gray-800">
                <CardHeader>
                  <div className="mx-auto w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mb-4">
                    <BookOpen className="w-8 h-8 text-purple-400" />
                  </div>
                  <CardTitle className="text-2xl text-white">AI Flashcards</CardTitle>
                  <CardDescription className="text-gray-400">
                    Generate intelligent flashcards from any educational video
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-300">
                    To generate flashcards, please select a video from the Learn page first.
                  </p>
                  <Button 
                    onClick={() => router.push("/learn")}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Browse Videos
                  </Button>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#0a0a0f]">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-purple-400" />
                AI Flashcards
              </h1>
              <p className="text-gray-400 text-sm mt-1 line-clamp-1">
                {decodeURIComponent(videoTitle)}
              </p>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
              <p className="text-gray-400">Generating flashcards with AI...</p>
              <p className="text-gray-500 text-sm mt-2">This may take a moment</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <Card className="bg-red-500/10 border-red-500/30 max-w-lg mx-auto">
              <CardContent className="py-8 text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <Button 
                  onClick={fetchFlashcards}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Flashcards Content */}
          {!loading && !error && flashcards.length > 0 && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-purple-400 border-purple-500/30">
                    {filteredFlashcards.length} cards
                  </Badge>
                  <Badge variant="outline" className="text-green-400 border-green-500/30">
                    {studiedCards.size} studied
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search cards..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentCardIndex(0);
                      setIsFlipped(false);
                    }}
                    className="w-48 bg-[#1a1a2e] border-gray-700 text-white"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={shuffleCards}
                    className="border-gray-700 text-gray-400 hover:text-white"
                    title="Shuffle cards"
                  >
                    <Shuffle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={resetProgress}
                    className="border-gray-700 text-gray-400 hover:text-white"
                    title="Reset progress"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Flip Card */}
              {currentCard && (
                <div className="perspective-1000">
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className={`relative w-full max-w-2xl mx-auto h-80 cursor-pointer transition-transform duration-500 transform-style-preserve-3d ${
                      isFlipped ? "rotate-y-180" : ""
                    }`}
                    style={{
                      transformStyle: "preserve-3d",
                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    }}
                  >
                    {/* Front of card */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl border border-purple-500/30 p-8 flex flex-col items-center justify-center backface-hidden shadow-xl"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <Badge className={`mb-4 ${getDifficultyColor(currentCard.difficulty)}`}>
                        {currentCard.difficulty}
                      </Badge>
                      <p className="text-xl font-medium text-white text-center mb-4">
                        {currentCard.question}
                      </p>
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <RotateCw className="w-4 h-4" />
                        Click to flip
                      </div>
                    </div>

                    {/* Back of card */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-[#16213e] to-[#1a1a2e] rounded-2xl border border-blue-500/30 p-8 flex flex-col items-center justify-center backface-hidden shadow-xl"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <p className="text-lg text-gray-200 text-center">
                        {currentCard.answer}
                      </p>
                    </div>
                  </div>

                  {/* Card counter */}
                  <p className="text-center text-gray-400 mt-4">
                    {currentCardIndex + 1} / {filteredFlashcards.length}
                  </p>
                </div>
              )}

              {/* Navigation Controls */}
              <div className="flex justify-center items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={prevCard}
                  disabled={currentCardIndex === 0}
                  className="border-gray-700 text-gray-400 hover:text-white h-12 w-12 disabled:opacity-50"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                
                <Button
                  onClick={markAsStudied}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 px-8"
                >
                  Mark as Studied
                </Button>
                
                <Button
                  variant="outline"
                  size="icon"
                  onClick={nextCard}
                  disabled={currentCardIndex === filteredFlashcards.length - 1}
                  className="border-gray-700 text-gray-400 hover:text-white h-12 w-12 disabled:opacity-50"
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="bg-[#1a1a2e] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-600 to-blue-600 h-full transition-all duration-300"
                  style={{ width: `${(studiedCards.size / flashcards.length) * 100}%` }}
                />
              </div>

              {/* Card List */}
              <Card className="bg-[#12121a] border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">All Flashcards</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredFlashcards.map((card, index) => (
                      <div
                        key={card.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          index === currentCardIndex
                            ? "bg-purple-500/20 border-purple-500/50"
                            : studiedCards.has(card.id)
                            ? "bg-green-500/10 border-green-500/30"
                            : "bg-[#1a1a2e] border-gray-700 hover:border-purple-500/50"
                        }`}
                        onClick={() => {
                          setCurrentCardIndex(index);
                          setIsFlipped(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-white font-medium mb-1">{card.question}</p>
                            <p className="text-gray-400 text-sm line-clamp-2">{card.answer}</p>
                          </div>
                          <Badge className={getDifficultyColor(card.difficulty)}>
                            {card.difficulty}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && flashcards.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400">No flashcards available for this video.</p>
              <Button 
                onClick={fetchFlashcards}
                className="mt-4 bg-purple-600 hover:bg-purple-700"
              >
                Generate Flashcards
              </Button>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
