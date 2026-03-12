import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, MessageCircle, BookOpen, Users, Brain, BarChart3, Sparkles, ArrowRight, Mic } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 bg-gradient-to-br from-primary to-chart-5 rounded-xl flex items-center justify-center shadow-md">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black font-montserrat gradient-text">LEARNX</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
                Features
              </Link>
              <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
                How It Works
              </Link>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" className="font-medium" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" className="bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md font-medium" asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-chart-5/10 rounded-full blur-3xl animate-pulse-soft" style={{animationDelay: '1s'}} />
        
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="animate-slide-up">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium shadow-sm">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              AI-Powered Learning Revolution
            </Badge>
          </div>
          <h1 className="animate-slide-up stagger-1 text-5xl md:text-7xl font-black font-montserrat text-balance mb-6 tracking-tight">
            Transform Video Learning
            <br />
            with <span className="gradient-text">Interactive AI</span>
          </h1>
          <p className="animate-slide-up stagger-2 text-lg md:text-xl text-muted-foreground text-pretty max-w-2xl mx-auto mb-10 font-open-sans leading-relaxed">
            Stop watching passively. Start learning actively. LEARNX turns any educational video into an interactive
            experience with real-time AI assistance and personalized learning.
          </p>
          <div className="animate-slide-up stagger-3 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base px-8 h-12 bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-lg shadow-primary/25 font-semibold" asChild>
              <Link href="/dashboard">
                <Play className="w-5 h-5 mr-2" />
                Start Learning Now
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 font-semibold" asChild>
              <Link href="#features">
                Explore Features
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 mesh-gradient opacity-50" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 px-3 py-1">Features</Badge>
            <h2 className="text-3xl md:text-5xl font-black font-montserrat mb-4 tracking-tight">Revolutionary Learning Tools</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-open-sans">
              Experience the future of education with AI-powered tools designed to maximize your learning outcomes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: MessageCircle, title: "Interactive Video Chat", desc: "Ask questions directly to AI while watching videos. Get instant, context-aware answers without breaking your learning flow.", color: "stat-icon-purple" },
              { icon: BookOpen, title: "Auto-Generated Resources", desc: "Automatically create summaries, flashcards, quizzes, and glossaries from any video content using advanced AI.", color: "stat-icon-blue" },
              { icon: Users, title: "Collaborative Learning", desc: "Study together with peers, share insights, and participate in group discussions with AI moderation.", color: "stat-icon-emerald" },
              { icon: Brain, title: "Adaptive Learning Paths", desc: "Personalized recommendations and difficulty adjustments based on your learning progress and performance.", color: "stat-icon-amber" },
              { icon: BarChart3, title: "Progress Analytics", desc: "Track your learning journey with detailed analytics, performance insights, and achievement milestones.", color: "stat-icon-rose" },
              { icon: Mic, title: "AI Mock Interviews", desc: "Practice with AI-powered mock interviews and get instant feedback to prepare for real-world scenarios.", color: "stat-icon-purple" },
            ].map((feature, i) => (
              <Card key={i} className="group hover-lift border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                <CardHeader className="space-y-4">
                  <div className={`stat-icon ${feature.color} w-12 h-12 rounded-xl`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="font-montserrat text-lg">{feature.title}</CardTitle>
                  <CardDescription className="font-open-sans text-sm leading-relaxed">
                    {feature.desc}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 px-3 py-1">How It Works</Badge>
            <h2 className="text-3xl md:text-5xl font-black font-montserrat mb-4 tracking-tight">Simple Yet Powerful</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-open-sans">
              Two steps to transform your entire learning experience
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="relative overflow-hidden border-border/50 bg-gradient-to-br from-primary/5 to-chart-5/5">
              <CardHeader className="space-y-4 p-8">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-chart-5 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-black text-white">1</span>
                </div>
                <CardTitle className="text-xl font-black font-montserrat">Learn Interactively</CardTitle>
                <CardDescription className="text-base font-open-sans leading-relaxed">
                  Watch videos while chatting with AI, asking questions, and getting instant explanations tailored to your learning needs.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="relative overflow-hidden border-border/50 bg-gradient-to-br from-chart-5/5 to-secondary/5">
              <CardHeader className="space-y-4 p-8">
                <div className="w-14 h-14 bg-gradient-to-br from-chart-5 to-secondary rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-black text-white">2</span>
                </div>
                <CardTitle className="text-xl font-black font-montserrat">Track & Improve</CardTitle>
                <CardDescription className="text-base font-open-sans leading-relaxed">
                  Monitor your progress, complete AI-generated quizzes, and follow personalized learning paths to master any subject.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-chart-5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1)_0%,_transparent_60%)]" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-5xl font-black font-montserrat mb-6 text-white tracking-tight">
            Ready to Transform Your Learning?
          </h2>
          <p className="text-lg mb-10 text-white/80 font-open-sans max-w-2xl mx-auto">
            Join thousands of students and educators already experiencing the future of interactive education.
          </p>
          <Button size="lg" variant="secondary" className="text-base px-10 h-12 font-semibold shadow-xl" asChild>
            <Link href="/signup">
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card/50 border-t border-border py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-gradient-to-br from-primary to-chart-5 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold font-montserrat text-muted-foreground">LEARNX</span>
          </div>
          <p className="text-sm text-muted-foreground font-open-sans">&copy; 2025 LEARNX. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
