'use client'

import React, { useMemo } from 'react'
import { Sankey, Tooltip, Rectangle, Layer, ResponsiveContainer } from 'recharts'
import { useTheme } from 'next-themes'

type PortfolioSankeyProps = {
  data: {
    nodes: { name: string; type: string }[]
    links: { source: number; target: number; value: number; type: string }[]
  }
  height?: number
}

const PortfolioSankey = ({ data, height = 600 }: PortfolioSankeyProps) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Custom Node
  const DemoSankeyNode = ({ x, y, width, height, index, payload, containerWidth }: any) => {
    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) return null;

    const isOut = x + width + 6 > containerWidth
    const isIn = x < 6

    return (
      <Layer key={`CustomNode${index}`}>
        <Rectangle
          x={x}
          y={y}
          width={width}
          height={height}
          fill={isDark ? '#8884d8' : '#5550bd'}
          fillOpacity="1"
        />
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize="12"
          fill={isDark ? '#fff' : '#000'}
          dy={0}
          style={{ pointerEvents: 'none' }}
        >
          {payload.name}
        </text>
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize="10"
          fill={isDark ? '#ccc' : '#666'}
          dy={14}
          style={{ pointerEvents: 'none' }}
        >
          {payload.value}
        </text>
      </Layer>
    )
  }

  // Custom Link
  const DemoSankeyLink = ({ sourceX, sourceY, targetX, targetY, linkWidth, index, payload }: any) => {
    if (isNaN(sourceX) || isNaN(sourceY) || isNaN(targetX) || isNaN(targetY) || isNaN(linkWidth)) return null;
    
    // Determine color based on type
    let fill = '#8884d8'
    if (payload.type === 'permanent') fill = '#82ca9d' // Green
    if (payload.type === 'active_given') fill = '#ffc658' // Yellow
    if (payload.type === 'active_received') fill = '#ff8042' // Orange
    if (payload.type === 'obligation') fill = '#ff6b6b' // Red
    if (payload.type === 'claim') fill = '#8dd1e1' // Blue

    return (
      <Layer key={`CustomLink${index}`}>
        <path
          d={`
            M${sourceX},${sourceY + linkWidth / 2}
            C${sourceX + 100},${sourceY + linkWidth / 2}
             ${targetX - 100},${targetY + linkWidth / 2}
             ${targetX},${targetY + linkWidth / 2}
            L${targetX},${targetY - linkWidth / 2}
            C${targetX - 100},${targetY - linkWidth / 2}
             ${sourceX + 100},${sourceY - linkWidth / 2}
             ${sourceX},${sourceY - linkWidth / 2}
            Z
          `}
          fill={fill}
          fillOpacity="0.5"
        />
      </Layer>
    )
  }

  if (!data || !data.nodes || data.nodes.length === 0 || !data.links || data.links.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-500">No data for visualization</div>
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={data}
          node={<DemoSankeyNode />}
          link={<DemoSankeyLink />}
          nodePadding={50}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          sort={false}
        >
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload
                const isLink = !!data.source
                return (
                  <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
                    {isLink ? (
                      <>
                        <p className="font-semibold">{`${data.source.name} → ${data.target.name}`}</p>
                        <p className="text-sm">Value: {data.value}%</p>
                        <p className="text-xs text-gray-500 capitalize">{data.type?.replace('_', ' ')}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">{data.name}</p>
                        <p className="text-sm">Total: {data.value}</p>
                      </>
                    )}
                  </div>
                )
              }
              return null
            }}
          />
        </Sankey>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-4 text-xs">
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#82ca9d] inline-block rounded-sm"></span> Permanent Ownership</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#ffc658] inline-block rounded-sm"></span> Given (Invested)</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#ff8042] inline-block rounded-sm"></span> Received (Invested)</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#ff6b6b] inline-block rounded-sm"></span> Obligations (Future)</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[#8dd1e1] inline-block rounded-sm"></span> Claims (Future)</div>
      </div>
    </div>
  )
}

export default PortfolioSankey
