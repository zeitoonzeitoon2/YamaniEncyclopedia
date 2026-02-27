'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

interface VotingSliderProps {
  currentVote?: number
  onVote: (score: number) => void
  disabled?: boolean
}

export default function VotingSlider({ currentVote, onVote, disabled = false }: VotingSliderProps) {
  const t = useTranslations('votingSlider')
  const [value, setValue] = useState(currentVote || 0)

  useEffect(() => {
    setValue(currentVote || 0)
  }, [currentVote])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(parseInt(e.target.value))
  }

  const handleCommit = () => {
    if (value !== currentVote) {
      onVote(value)
    }
  }

  const getScoreColor = (score: number) => {
    if (score === 0) return 'text-site-muted'
    if (score > 0) return 'text-green-500'
    return 'text-red-500'
  }

  const getScoreText = (score: number) => {
    switch (score) {
      case -2: return t('stronglyOpposed')
      case -1: return t('opposed')
      case 0: return t('neutral')
      case 1: return t('supportive')
      case 2: return t('stronglySupportive')
      default: return t('neutral')
    }
  }

  const getTrackGradient = () => {
    const pos = ((value + 2) / 4) * 100
    if (value < 0) return `linear-gradient(to right, #ef4444 0%, #ef4444 ${pos}%, rgba(255,255,255,0.08) ${pos}%, rgba(255,255,255,0.08) 100%)`
    if (value > 0) return `linear-gradient(to right, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.08) ${pos}%, #22c55e ${pos}%, #22c55e 100%)`
    return 'rgba(255,255,255,0.08)'
  }

  return (
    <div className="flex items-center gap-3 w-full" dir="ltr">
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min="-2"
          max="2"
          step="1"
          value={value}
          onChange={handleSliderChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          disabled={disabled}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer voting-slider"
          style={{ background: getTrackGradient() }}
        />
        <div className="flex justify-between mt-0.5 select-none" style={{ padding: '0 2px' }}>
          {[-2, -1, 0, 1, 2].map(n => (
            <span
              key={n}
              className={`text-[9px] leading-none font-medium ${
                n < 0 ? 'text-red-500/60' : n > 0 ? 'text-green-500/60' : 'text-site-muted/60'
              } ${value === n ? '!opacity-100 scale-110' : ''}`}
            >
              {n > 0 ? `+${n}` : n}
            </span>
          ))}
        </div>
      </div>
      <span className={`text-[11px] font-medium shrink-0 min-w-[70px] text-right ${getScoreColor(value)}`} dir="rtl">
        {getScoreText(value)}
      </span>

      <style jsx>{`
        .voting-slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #d97706;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        .voting-slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #d97706;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        .voting-slider:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
