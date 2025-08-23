'use client'

import { useState, useEffect } from 'react'

interface VotingSliderProps {
  currentVote?: number
  onVote: (score: number) => void
  disabled?: boolean
}

export default function VotingSlider({ currentVote, onVote, disabled = false }: VotingSliderProps) {
  const [value, setValue] = useState(currentVote || 0)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    setValue(currentVote || 0)
  }, [currentVote])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value)
    setValue(newValue)
  }

  const handleSliderMouseUp = () => {
    setIsDragging(false)
    if (value !== currentVote) {
      onVote(value)
    }
  }

  const handleSliderMouseDown = () => {
    setIsDragging(true)
  }

  const getScoreColor = (score: number) => {
    if (score === 0) return 'text-gray-500'
    if (score > 0) return 'text-green-600'
    return 'text-red-600'
  }

  const getScoreText = (score: number) => {
    switch (score) {
      case -2: return 'کاملاً مخالف'
      case -1: return 'مخالف'
      case 0: return 'بی‌نظر'
      case 1: return 'موافق'
      case 2: return 'کاملاً موافق'
      default: return 'بی‌نظر'
    }
  }

  const getSliderBackground = () => {
    const percentage = ((value + 2) / 4) * 100
    if (value < 0) {
      return `linear-gradient(to right, #dc2626 0%, #dc2626 ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`
    } else if (value > 0) {
      return `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${percentage}%, #16a34a ${percentage}%, #16a34a 100%)`
    } else {
      return `linear-gradient(to right, #e5e7eb 0%, #e5e7eb 50%, #6b7280 50%, #6b7280 52%, #e5e7eb 52%, #e5e7eb 100%)`
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* اسلایدر با توضیح کناری */}
      <div className="flex items-center gap-3">
        {/* توضیح سمت چپ */}
        <div className="min-w-[120px] text-sm">
          <span className={`font-medium ${getScoreColor(value)}`}>
            {getScoreText(value)}
          </span>
        </div>
        
        {/* اسلایدر */}
        <div className="flex-1">
          <input
            type="range"
            min="-2"
            max="2"
            step="1"
            value={value}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            onTouchStart={handleSliderMouseDown}
            onTouchEnd={handleSliderMouseUp}
            disabled={disabled}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-custom"
            style={{
              background: getSliderBackground()
            }}
          />
          {/* نشانگرهای امتیاز */}
          <div className="flex justify-between text-xs text-dark-muted mt-1 px-1">
            <span className="text-red-600 font-medium">-2</span>
            <span className="text-red-400">-1</span>
            <span className="text-gray-500">0</span>
            <span className="text-green-400">+1</span>
            <span className="text-green-600 font-medium">+2</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider-custom::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #d97706;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider-custom::-webkit-slider-thumb:hover {
          transform: scale(1.06);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
        }

        .slider-custom::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #d97706;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider-custom::-moz-range-thumb:hover {
          transform: scale(1.06);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
        }

        .slider-custom:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}