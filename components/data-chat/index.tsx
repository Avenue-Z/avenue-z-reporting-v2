'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Sparkles, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const DEMO_RESPONSES: Record<string, string> = {
  default:
    'Based on the current data, I can see several interesting trends. Would you like me to dig deeper into a specific metric or time period?',
  spend:
    'Total ad spend across all channels is $12,450 this period, down 2.1% from last period. Google Ads is your most efficient channel at $6.33 CPA, while Meta Ads drives the highest volume at 612 conversions. I\'d recommend shifting 10-15% of Meta budget to Google Search campaigns where CPA is trending lower.',
  traffic:
    'Website sessions are at 89,234, up 15.4% versus the prior period. The growth is primarily driven by organic search (+22%) and paid social (+18%). New user rate is 64%, which is healthy for top-of-funnel discovery. Mobile traffic accounts for 61% of sessions but has a 6% higher bounce rate than desktop — worth investigating page load times.',
  conversions:
    'You\'re at 1,847 conversions this period, a 22.6% increase. Meta Ads and Google Search are your top performers, together driving 68% of all conversions. The new landing page variant is converting at 4.7% vs 3.1% for the control. I\'d recommend scaling traffic to the winning variant and pausing the control.',
  roas:
    'Blended ROAS is 3.2x, up 7.8% from last period. For every dollar spent, you\'re generating $3.20 in tracked revenue — well above the 2.5x industry benchmark. Google Ads leads at 3.8x ROAS, followed by Meta at 2.9x. Email and organic channels are essentially free conversions, pushing the blended number higher.',
  email:
    'Email open rates are holding steady at 24.1% with a slight improvement in click-through to 3.8%. The March promo campaign was your top performer with a 5.2% CTR. Subscription reorder reminders are converting at 12%, which is a strong retention signal. Consider A/B testing subject lines on the underperforming campaigns.',
  recommendations:
    'Based on the full picture, here are my top 3 recommendations:\n\n1. **Scale Google Ads** — CPA dropped 24% after pausing Display. Reallocate that budget to PMax and branded search.\n\n2. **Refresh Meta creative** — Frequency is at 2.4x and climbing. New creative will combat audience fatigue and likely improve CPM.\n\n3. **Double down on the new landing page** — 4.7% conversion rate is significantly above control. Route all paid traffic there.',
}

function getResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('spend') || lower.includes('budget') || lower.includes('cost'))
    return DEMO_RESPONSES.spend
  if (lower.includes('traffic') || lower.includes('session') || lower.includes('visit'))
    return DEMO_RESPONSES.traffic
  if (lower.includes('conversion') || lower.includes('convert') || lower.includes('lead'))
    return DEMO_RESPONSES.conversions
  if (lower.includes('roas') || lower.includes('return') || lower.includes('revenue'))
    return DEMO_RESPONSES.roas
  if (lower.includes('email') || lower.includes('open rate') || lower.includes('newsletter'))
    return DEMO_RESPONSES.email
  if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('what should'))
    return DEMO_RESPONSES.recommendations
  return DEMO_RESPONSES.default
}

const SUGGESTED_QUESTIONS = [
  'How is our ad spend performing?',
  'What\'s driving traffic growth?',
  'Break down our conversions',
  'What do you recommend?',
]

export function DataChat({ clientName }: { clientName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  function handleSend(text?: string) {
    const message = text ?? input.trim()
    if (!message) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setIsTyping(true)

    // Simulate AI response delay
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: getResponse(message) },
      ])
    }, 1200 + Math.random() * 800)
  }

  if (!isOpen) {
    return (
      <div className="no-print fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 rounded-full border border-white/[0.1] bg-bg-surface px-5 py-3 shadow-2xl transition-all hover:border-white/[0.2] hover:shadow-brand-cyan/10"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)',
            }}
          >
            <Sparkles className="h-4 w-4 text-black" />
          </span>
          <span className="text-sm font-bold text-white">
            Ask about this data
          </span>
          <MessageSquare className="h-4 w-4 text-text-muted transition-colors group-hover:text-white" />
        </button>
      </div>
    )
  }

  return (
    <div className="no-print fixed bottom-6 right-6 z-50 flex w-[440px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-black shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-black" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Data Assistant</p>
            <p className="text-[11px] text-text-muted">
              Ask anything about {clientName}&apos;s performance
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: '360px', minHeight: '200px' }}>
        {messages.length === 0 && !isTyping && (
          <div className="space-y-4">
            <p className="text-center text-sm text-text-muted">
              Ask a question about the report data
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="rounded-full border border-white/[0.08] bg-bg-surface px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-white/[0.1] text-white'
                    : 'border border-white/[0.06] bg-bg-surface text-white/80'
                )}
              >
                {msg.content.split('\n').map((line, j) => (
                  <p key={j} className={j > 0 ? 'mt-2' : ''}>
                    {line.split(/(\*\*.*?\*\*)/).map((part, k) =>
                      part.startsWith('**') && part.endsWith('**') ? (
                        <strong key={k} className="font-bold text-white">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.06] bg-bg-surface px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-cyan" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-green" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-yellow" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested questions (when conversation is active) */}
      {messages.length > 0 && messages.length < 6 && (
        <div className="border-t border-white/[0.04] px-4 py-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {SUGGESTED_QUESTIONS.filter(
              (q) => !messages.some((m) => m.content === q)
            )
              .slice(0, 2)
              .map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="shrink-0 rounded-full border border-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/50 transition-colors hover:border-white/[0.12] hover:text-white/80"
                >
                  {q}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-bg-surface px-4 py-2.5 focus-within:border-brand-cyan/30"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this data..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-text-muted outline-none"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-30"
            style={{
              backgroundImage: input.trim() && !isTyping
                ? 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)'
                : 'none',
              backgroundColor: !input.trim() || isTyping ? '#3a3a3a' : undefined,
            }}
          >
            <Send className="h-3.5 w-3.5 text-black" />
          </button>
        </form>
      </div>
    </div>
  )
}
