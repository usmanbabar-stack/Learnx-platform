"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  BookMarked,
  Search,
  ArrowLeft,
  Loader2,
  BookOpen,
  Download,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { apiService } from "@/lib/api"

interface GlossaryTerm {
  id: string
  term: string
  definition: string
  category: string
  relatedTerms: string[]
  videoTimestamp?: number
  timestampFormatted?: string
}

type TranscriptStatus = 'checking' | 'waiting' | 'ready' | 'generating' | 'error'

export default function GlossaryPage() {
  const searchParams = useSearchParams()
  const videoId = searchParams.get("videoId") || ""
  
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [filteredTerms, setFilteredTerms] = useState<GlossaryTerm[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>('checking')
  const [statusMessage, setStatusMessage] = useState("Checking transcript status...")
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  // Prevent duplicate API calls from React StrictMode
  const isLoadingRef = useRef(false)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (videoId && !isLoadingRef.current) {
      checkAndLoadGlossary()
    } else if (!videoId) {
      setLoading(false)
      setTranscriptStatus('error')
      setError("No video selected. Please go back and select a video.")
    }
  }, [videoId])

  const checkAndLoadGlossary = async () => {
    // Prevent duplicate calls
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    
    setLoading(true)
    setError(null)
    setTranscriptStatus('checking')
    setStatusMessage("Checking transcript status...")

    // First, check if transcript is ready
    try {
      const status = await apiService.checkTranscriptStatus(videoId)
      
      if (status.success && status.data?.ready) {
        // Transcript is ready, load glossary
        setTranscriptStatus('generating')
        setStatusMessage("Generating AI glossary...")
        await loadGlossary()
      } else {
        // Transcript not ready, start polling
        setTranscriptStatus('waiting')
        setStatusMessage(status.data?.message || "Waiting for transcript to be ready...")
        startPolling()
      }
    } catch (err) {
      console.error("Status check error:", err)
      // Try to load glossary anyway - it might be cached
      setTranscriptStatus('generating')
      await loadGlossary()
    }
  }

  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    let pollCount = 0
    const maxPolls = 90 // 3 minutes (90 * 2s)

    pollingRef.current = setInterval(async () => {
      pollCount++
      
      try {
        const status = await apiService.checkTranscriptStatus(videoId)
        
        if (status.success && status.data?.ready) {
          // Transcript ready! Stop polling and load glossary
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setTranscriptStatus('generating')
          setStatusMessage("Transcript ready! Generating AI glossary...")
          await loadGlossary()
        } else {
          // Update status message
          const elapsed = pollCount * 2
          if (elapsed < 30) {
            setStatusMessage("Processing video transcript...")
          } else if (elapsed < 60) {
            setStatusMessage("Extracting subtitles... (this may take a minute)")
          } else if (elapsed < 120) {
            setStatusMessage("Indexing content... (almost ready)")
          } else {
            setStatusMessage("Still processing... (large video)")
          }
        }
      } catch (e) {
        console.log("Polling error, continuing...")
      }

      if (pollCount >= maxPolls) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        setTranscriptStatus('error')
        setError("Transcript processing timed out. Please try again later.")
        setLoading(false)
      }
    }, 2000)
  }

  const loadGlossary = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await apiService.getVideoGlossary(videoId)
      if (response.success && response.data) {
        setTerms(response.data.terms)
        setFilteredTerms(response.data.terms)
        setCategories(response.data.categories)
        setTranscriptStatus('ready')
        setStatusMessage("Glossary ready!")
      } else {
        // Check if transcript is still processing
        if (response.message?.includes('pending') || response.message?.includes('not ready')) {
          setTranscriptStatus('waiting')
          setStatusMessage("Transcript is still processing...")
          startPolling()
          return
        } else {
          setTranscriptStatus('error')
          setError(response.message || "Failed to generate glossary. Please try again.")
        }
      }
    } catch (err: any) {
      console.error("Glossary error:", err)
      // Handle transcript pending status from error response
      if (err.message?.includes('Transcript not ready') || err.message?.includes('pending')) {
        setTranscriptStatus('waiting')
        setStatusMessage("Transcript is still processing...")
        startPolling()
        return
      } else {
        setTranscriptStatus('error')
        setError(err.message || "Failed to load glossary")
      }
    } finally {
      setLoading(false)
    }
  }

  // Filter terms based on search and category
  useEffect(() => {
    let filtered = terms

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(term => term.category === selectedCategory)
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(term =>
        term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.definition.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by selected letter
    if (selectedLetter) {
      filtered = filtered.filter(term =>
        term.term.charAt(0).toUpperCase() === selectedLetter
      )
    }

    setFilteredTerms(filtered)
  }, [searchQuery, selectedCategory, selectedLetter, terms])

  // Get all categories including "all"
  const allCategories = ["all", ...categories]

  // Get alphabet for quick navigation
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

  // Group terms by first letter
  const groupedTerms = filteredTerms.reduce((acc, term) => {
    const firstLetter = term.term.charAt(0).toUpperCase()
    if (!acc[firstLetter]) {
      acc[firstLetter] = []
    }
    acc[firstLetter].push(term)
    return acc
  }, {} as Record<string, GlossaryTerm[]>)

  const exportGlossary = () => {
    const content = filteredTerms.map(term => 
      `${term.term}\n${term.definition}\nCategory: ${term.category}${term.relatedTerms?.length ? `\nRelated: ${term.relatedTerms.join(", ")}` : ""}\n\n`
    ).join("")
    
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "glossary.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Navigation />

        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {/* Header */}
          <div className="mb-6">
            <Button variant="ghost" size="sm" asChild className="mb-4">
              <Link href={videoId ? `/learn/${videoId}` : "/learn"}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Video
              </Link>
            </Button>

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black font-montserrat flex items-center gap-2">
                  <BookMarked className="w-8 h-8 text-accent" />
                  Glossary
                </h1>
                <p className="text-muted-foreground font-open-sans mt-2">
                  Key terms and definitions from your learning content
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                  {transcriptStatus === 'ready' && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  )}
                  {transcriptStatus === 'waiting' && (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Waiting for transcript
                    </Badge>
                  )}
                  {transcriptStatus === 'generating' && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Generating
                    </Badge>
                  )}
                  {transcriptStatus === 'checking' && (
                    <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Checking
                    </Badge>
                  )}
                </div>
                {terms.length > 0 && (
                  <div className="flex gap-2">
                  <Button onClick={() => checkAndLoadGlossary()} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={exportGlossary} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Waiting for Transcript State */}
          {transcriptStatus === 'waiting' && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-yellow-500 mb-4" />
                  <h3 className="text-lg font-bold font-montserrat mb-2">Waiting for Transcript</h3>
                  <p className="text-muted-foreground font-open-sans text-center max-w-md">
                    {statusMessage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    This will automatically refresh when ready
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && !loading && transcriptStatus === 'error' && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <h3 className="text-lg font-bold font-montserrat mb-2">Unable to Generate Glossary</h3>
                  <p className="text-muted-foreground font-open-sans mb-4">{error}</p>
                  {videoId && (
                    <Button onClick={() => checkAndLoadGlossary()} variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {loading && transcriptStatus !== 'waiting' && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
                  <p className="text-muted-foreground font-open-sans">
                    Generating AI glossary... This may take a moment.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content - only show when loaded and no error */}
          {!loading && !error && terms.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold font-montserrat text-accent">
                        {terms.length}
                      </div>
                      <p className="text-sm text-muted-foreground font-open-sans mt-1">
                        Total Terms
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold font-montserrat text-accent">
                        {categories.length}
                      </div>
                      <p className="text-sm text-muted-foreground font-open-sans mt-1">
                        Categories
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold font-montserrat text-accent">
                        {filteredTerms.length}
                      </div>
                      <p className="text-sm text-muted-foreground font-open-sans mt-1">
                        Filtered Results
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Search and Filters */}
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        placeholder="Search terms or definitions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 font-open-sans"
                      />
                    </div>

                    {/* Category Filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium font-open-sans">Category:</span>
                      {allCategories.map((category) => (
                        <Badge
                          key={category}
                          variant={selectedCategory === category ? "default" : "outline"}
                          className="cursor-pointer font-open-sans"
                          onClick={() => setSelectedCategory(category)}
                        >
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </Badge>
                      ))}
                    </div>

                    {/* Alphabet Navigation */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-medium font-open-sans mr-2">Quick Jump:</span>
                      <Button
                        variant={selectedLetter === null ? "default" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setSelectedLetter(null)}
                      >
                        All
                      </Button>
                      {alphabet.map((letter) => (
                        <Button
                          key={letter}
                          variant={selectedLetter === letter ? "default" : "ghost"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSelectedLetter(letter)}
                          disabled={!terms.some(t => t.term.charAt(0).toUpperCase() === letter)}
                        >
                          {letter}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Glossary Content */}
              {filteredTerms.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center">
                      <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-bold font-montserrat mb-2">No Terms Found</h3>
                      <p className="text-muted-foreground font-open-sans">
                        Try adjusting your search or filters
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {Object.keys(groupedTerms)
                    .sort()
                    .map((letter) => (
                      <Card key={letter} id={`letter-${letter}`}>
                        <CardHeader>
                          <CardTitle className="text-2xl font-black font-montserrat text-accent">
                            {letter}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {groupedTerms[letter]
                              .sort((a, b) => a.term.localeCompare(b.term))
                              .map((term, index) => (
                                <div key={term.id}>
                                  {index > 0 && <Separator className="my-4" />}
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1">
                                        <h3 className="text-lg font-bold font-montserrat">
                                          {term.term}
                                        </h3>
                                        <Badge variant="secondary" className="mt-1">
                                          {term.category}
                                        </Badge>
                                      </div>
                                      {term.videoTimestamp && (
                                        <Button variant="outline" size="sm">
                                          Jump to {Math.floor(term.videoTimestamp / 60)}:
                                          {(term.videoTimestamp % 60).toString().padStart(2, "0")}
                                        </Button>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground font-open-sans leading-relaxed">
                                      {term.definition}
                                    </p>
                                    {term.relatedTerms && term.relatedTerms.length > 0 && (
                                      <div className="flex items-center gap-2 flex-wrap mt-2">
                                        <span className="text-sm text-muted-foreground font-open-sans">
                                          Related:
                                        </span>
                                        {term.relatedTerms.map((relatedTerm) => (
                                          <Badge
                                            key={relatedTerm}
                                            variant="outline"
                                            className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                                            onClick={() => setSearchQuery(relatedTerm)}
                                          >
                                            {relatedTerm}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}

              {/* Footer Info */}
              <Card className="mt-6">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <BookMarked className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold font-montserrat mb-1">About This Glossary</h3>
                      <p className="text-sm text-muted-foreground font-open-sans">
                        This glossary is automatically generated from your learning content using AI.
                        Terms are extracted and defined to help you better understand the material.
                        Click on related terms to explore connections between concepts.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}