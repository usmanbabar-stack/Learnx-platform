import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, MessageCircle, BookOpen, Users, Brain, BarChart3 } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-black font-montserrat text-foreground">LEARNX</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Features
              </Link>
              <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            AI-Powered Learning Revolution
          </Badge>
          <h1 className="text-4xl md:text-6xl font-black font-montserrat text-balance mb-6">
            Transform Video Learning with <span className="text-accent">Interactive AI</span>
          </h1>
          <p className="text-xl text-muted-foreground text-pretty max-w-3xl mx-auto mb-8 font-open-sans">
            Stop watching passively. Start learning actively. LEARNX turns any educational video into an interactive
            experience with real-time AI assistance, personalized learning paths, and instant Q&A support.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" className="text-lg px-8" asChild>
              <Link href="/dashboard">
                <Play className="w-5 h-5 mr-2" />
                Start Learning Now
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black font-montserrat mb-4">Revolutionary Learning Features</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-open-sans">
              Experience the future of education with AI-powered tools designed to maximize learning outcomes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <MessageCircle className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Interactive Video Chat</CardTitle>
                <CardDescription className="font-open-sans">
                  Ask questions directly to AI while watching videos. Get instant, context-aware answers without
                  breaking your learning flow.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <BookOpen className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Auto-Generated Resources</CardTitle>
                <CardDescription className="font-open-sans">
                  Automatically create summaries, flashcards, quizzes, and glossaries from any video content using
                  advanced AI.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <Users className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Collaborative Learning</CardTitle>
                <CardDescription className="font-open-sans">
                  Study together with peers, share insights, and participate in group discussions with AI moderation.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <Brain className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Adaptive Learning Paths</CardTitle>
                <CardDescription className="font-open-sans">
                  Personalized recommendations and difficulty adjustments based on your learning progress and
                  performance.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <BarChart3 className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Progress Analytics</CardTitle>
                <CardDescription className="font-open-sans">
                  Track your learning journey with detailed analytics, performance insights, and achievement milestones.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <Play className="w-12 h-12 text-accent mb-4" />
                <CardTitle className="font-montserrat">Mock Interviews</CardTitle>
                <CardDescription className="font-open-sans">
                  Practice with AI-powered mock interviews and get instant feedback to prepare for real-world scenarios.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black font-montserrat mb-4">How LEARNX Works</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-open-sans">
              Two simple steps to transform your learning experience
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-black text-accent-foreground">1</span>
              </div>
              <h3 className="text-xl font-black font-montserrat mb-4">Learn Interactively</h3>
              <p className="text-muted-foreground font-open-sans">
                Watch videos while chatting with AI, asking questions, and getting instant explanations tailored to your
                learning needs.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-black text-accent-foreground">2</span>
              </div>
              <h3 className="text-xl font-black font-montserrat mb-4">Track & Improve</h3>
              <p className="text-muted-foreground font-open-sans">
                Monitor your progress, complete AI-generated quizzes, and follow personalized learning paths to master
                any subject.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black font-montserrat mb-6">Ready to Transform Your Learning?</h2>
          <p className="text-xl mb-8 opacity-90 font-open-sans">
            Join thousands of students and educators who are already experiencing the future of interactive education.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg px-8" asChild>
              <Link href="/signup">Get Started Now</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground font-open-sans">
          <p>&copy; 2024 LEARNX. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
