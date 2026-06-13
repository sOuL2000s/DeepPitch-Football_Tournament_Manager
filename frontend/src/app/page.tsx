// frontend/src/app/page.tsx
import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-5xl font-bold tracking-tighter sm:text-7xl bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        DeepPitch
      </h1>
      <p className="mt-4 text-xl text-zinc-400 max-w-[600px]">
        Minimal yet mighty football tournament management. 
        Organize, track, and master your leagues with ease.
      </p>
      <div className="flex gap-4 mt-8">
        <Link 
          href="/register" 
          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-full font-medium transition-colors"
        >
          Get Started
        </Link>
        <Link 
          href="/login" 
          className="px-8 py-3 border border-zinc-700 hover:bg-zinc-900 rounded-full font-medium transition-colors"
        >
          Sign In
        </Link>
      </div>
    </div>
  )
}