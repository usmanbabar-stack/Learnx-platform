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
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-2xl mx-auto text-center">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-scale-in">
                <CardHeader>
                  <div className="mx-auto w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mb-4">
                    <BookOpen className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-montserrat">AI Flashcards</CardTitle>
                  <CardDescription className="font-open-sans">
                    Generate intelligent flashcards from any educational video
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground font-open-sans">
                    To generate flashcards, please select a video from the Learn page first.
                  </p>
                  <Button 
                    onClick={() => router.push("/learn")}
                    className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Browse Videos
                  </Button>
                </CardContent>
              </Card>
            </div>
          </main>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6 animate-slide-up">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="hover:bg-muted/50"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-black font-montserrat flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                <span className="gradient-text">AI Flashcards</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-1 line-clamp-1 font-open-sans">
                {decodeURIComponent(videoTitle)}
              </p>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground font-open-sans">Generating flashcards with AI...</p>
              <p className="text-muted-foreground/70 text-sm mt-2 font-open-sans">This may take a moment</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <Card className="bg-destructive/10 border-destructive/30 max-w-lg mx-auto backdrop-blur-sm">
              <CardContent className="py-8 text-center">
                <p className="text-destructive mb-4 font-open-sans">{error}</p>
                <Button 
                  onClick={fetchFlashcards}
                  variant="destructive"
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
                  <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                    {filteredFlashcards.length} cards
                  </Badge>
                  <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
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
                    className="w-48 bg-muted/50 border-border/50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={shuffleCards}
                    className="border-border/50 hover:bg-muted/50"
                    title="Shuffle cards"
                  >
                    <Shuffle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={resetProgress}
                    className="border-border/50 hover:bg-muted/50"
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
                      className="absolute inset-0 bg-gradient-to-br from-card to-muted rounded-2xl border border-primary/30 p-8 flex flex-col items-center justify-center backface-hidden shadow-xl backdrop-blur-sm"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <Badge className={`mb-4 ${getDifficultyColor(currentCard.difficulty)}`}>
                        {currentCard.difficulty}
                      </Badge>
                      <p className="text-xl font-medium text-foreground text-center mb-4 font-montserrat">
                        {currentCard.question}
                      </p>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm font-open-sans">
                        <RotateCw className="w-4 h-4" />
                        Click to flip
                      </div>
                    </div>

                    {/* Back of card */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-muted to-card rounded-2xl border border-chart-5/30 p-8 flex flex-col items-center justify-center backface-hidden shadow-xl backdrop-blur-sm"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <p className="text-lg text-muted-foreground text-center font-open-sans">
                        {currentCard.answer}
                      </p>
                    </div>
                  </div>

                  {/* Card counter */}
                  <p className="text-center text-muted-foreground mt-4 font-open-sans">
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
                  className="border-border/50 hover:bg-muted/50 h-12 w-12 disabled:opacity-50"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                
                <Button
                  onClick={markAsStudied}
                  className="bg-gradient-to-r from-emerald-600 to-green-600 hover:opacity-90 shadow-md shadow-emerald-500/20 px-8 font-semibold"
                >
                  Mark as Studied
                </Button>
                
                <Button
                  variant="outline"
                  size="icon"
                  onClick={nextCard}
                  disabled={currentCardIndex === filteredFlashcards.length - 1}
                  className="border-border/50 hover:bg-muted/50 h-12 w-12 disabled:opacity-50"
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-chart-5 h-full transition-all duration-300"
                  style={{ width: `${(studiedCards.size / flashcards.length) * 100}%` }}
                />
              </div>

              {/* Card List */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-montserrat">All Flashcards</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredFlashcards.map((card, index) => (
                      <div
                        key={card.id}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          index === currentCardIndex
                            ? "bg-primary/10 border-primary/50"
                            : studiedCards.has(card.id)
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : "bg-muted/30 border-border/50 hover:border-primary/50"
                        }`}
                        onClick={() => {
                          setCurrentCardIndex(index);
                          setIsFlipped(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium mb-1 font-montserrat">{card.question}</p>
                            <p className="text-muted-foreground text-sm line-clamp-2 font-open-sans">{card.answer}</p>
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
              <p className="text-muted-foreground font-open-sans">No flashcards available for this video.</p>
              <Button 
                onClick={fetchFlashcards}
                className="mt-4 font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
              >
                Generate Flashcards
              </Button>
            </div>
          )}
        </main>
        </div>
      </div>
    </AuthGuard>
  );
}
