/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';

interface ChartDataPoint {
  date: string;
  price: number; // Total Portfolio Value or Stock Price
  cumulativeDeposits?: number; // Optional Net Invested Capital (Deposits baseline)
}

interface PerformanceChartProps {
  data: ChartDataPoint[];
  color?: string; // 'emerald' | 'indigo' | 'amber'
  height?: number;
  currencySymbol?: string;
}

export default function PerformanceChart({
  data,
  color = 'indigo',
  height = 200,
  currencySymbol = '₪',
}: PerformanceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data;
  }, [data]);

  const {
    path,
    areaPath,
    depositsPath,
    coords,
    coordsDeposits,
    yMin,
    yMax,
    hasDeposits,
  } = useMemo(() => {
    if (points.length === 0) {
      return {
        path: '',
        areaPath: '',
        depositsPath: '',
        coords: [],
        coordsDeposits: [],
        yMin: 0,
        yMax: 100,
        hasDeposits: false,
      };
    }

    const margin = { top: 25, right: 15, bottom: 25, left: 50 };
    const width = 500;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const hasDeps = points.some((p) => p.cumulativeDeposits !== undefined);

    // Get prices and deposits to establish scale bounds
    const prices = points.map((p) => p.price);
    const deposits = hasDeps ? points.map((p) => p.cumulativeDeposits ?? p.price) : [];
    const allVals = hasDeps ? [...prices, ...deposits] : prices;

    let minVal = Math.min(...allVals);
    let maxVal = Math.max(...allVals);

    // Add padding to prevent flatlines from clipping
    if (minVal === maxVal) {
      minVal = Math.max(0, minVal - 50);
      maxVal += 50;
    } else {
      const diff = maxVal - minVal;
      minVal = Math.max(0, minVal - diff * 0.15);
      maxVal = maxVal + diff * 0.15;
    }

    // Coordinates for Wealth / Portfolio line
    const calculatedCoords = points.map((p, idx) => {
      const x = margin.left + (idx / (points.length - 1)) * chartWidth;
      const percentY = (p.price - minVal) / (maxVal - minVal);
      const y = margin.top + (1 - percentY) * chartHeight;
      return { x, y, price: p.price, cumulativeDeposits: p.cumulativeDeposits, date: p.date };
    });

    // Coordinates for Deposits line
    const calculatedCoordsDeposits = hasDeps
      ? points.map((p, idx) => {
          const x = margin.left + (idx / (points.length - 1)) * chartWidth;
          const depVal = p.cumulativeDeposits ?? p.price;
          const percentY = (depVal - minVal) / (maxVal - minVal);
          const y = margin.top + (1 - percentY) * chartHeight;
          return { x, y, cumulativeDeposits: depVal };
        })
      : [];

    // Build SVG path for Wealth
    let d = '';
    calculatedCoords.forEach((coord, idx) => {
      if (idx === 0) {
        d += `M ${coord.x} ${coord.y}`;
      } else {
        d += ` L ${coord.x} ${coord.y}`;
      }
    });

    // Build SVG path for Deposits
    let dDep = '';
    if (hasDeps) {
      calculatedCoordsDeposits.forEach((coord, idx) => {
        if (idx === 0) {
          dDep += `M ${coord.x} ${coord.y}`;
        } else {
          dDep += ` L ${coord.x} ${coord.y}`;
        }
      });
    }

    // Build filled area path for Wealth
    let areaD = d;
    if (calculatedCoords.length > 0) {
      const last = calculatedCoords[calculatedCoords.length - 1];
      const first = calculatedCoords[0];
      areaD += ` L ${last.x} ${height - margin.bottom}`;
      areaD += ` L ${first.x} ${height - margin.bottom} Z`;
    }

    return {
      path: d,
      areaPath: areaD,
      depositsPath: dDep,
      coords: calculatedCoords,
      coordsDeposits: calculatedCoordsDeposits,
      yMin: minVal,
      yMax: maxVal,
      hasDeposits: hasDeps,
    };
  }, [points, height]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl h-44 text-slate-400 text-xs font-semibold uppercase tracking-wider">
        No Snapshot Curve Available Yet
      </div>
    );
  }

  const gradientId = `chart-gradient-${color}`;
  const strokeColor = color === 'emerald' ? '#10b981' : color === 'amber' ? '#f59e0b' : '#6366f1';
  const stopColor = color === 'emerald' ? 'rgba(16, 185, 129, 0.25)' : color === 'amber' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(99, 102, 241, 0.25)';

  // Calculate overall change summary for header card info (only if hasDeposits is true)
  const latestPoint = points[points.length - 1];
  const initialPoint = points[0];
  const totalReturn = hasDeposits ? latestPoint.price - (latestPoint.cumulativeDeposits ?? 0) : 0;
  const totalReturnPercent = hasDeposits && (latestPoint.cumulativeDeposits ?? 0) > 0 ? (totalReturn / (latestPoint.cumulativeDeposits ?? 1)) * 100 : 0;
  const isReturnPositive = totalReturn >= 0;

  return (
    <div className="relative w-full bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm space-y-4">
      {/* Educational Metric Header (only rendered for portfolio snapshots) */}
      {hasDeposits && (
        <div className="flex flex-wrap justify-between items-end gap-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Value</span>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                {currencySymbol}{latestPoint.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Savings Put In</span>
              <p className="text-xl font-extrabold text-slate-700 mt-0.5">
                {currencySymbol}{(latestPoint.cumulativeDeposits ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Market Gains / Returns</span>
            <div className="flex items-center gap-1.5 mt-0.5 justify-end">
              <span className={`text-base font-extrabold ${isReturnPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isReturnPositive ? '+' : ''}{currencySymbol}{totalReturn.toFixed(2)}
              </span>
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isReturnPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/40' : 'bg-rose-50 text-rose-700 border border-rose-200/40'}`}>
                {isReturnPositive ? '▲' : '▼'} {totalReturnPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <svg viewBox={`0 0 500 ${height}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stopColor} />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.0)" />
            </linearGradient>
          </defs>

          {/* Horizontal reference dashed grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
            const y = 25 + p * (height - 50);
            const priceVal = yMax - p * (yMax - yMin);
            return (
              <g key={idx} className="opacity-15">
                <line
                  x1="50"
                  y1={y}
                  x2="485"
                  y2={y}
                  stroke="#64748b"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x="44" y={y + 3} fill="#475569" fontSize="9" fontWeight="bold" textAnchor="end">
                  {hasDeposits ? currencySymbol : '$'}{priceVal.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* SVG Area Filled Path (Total Value) */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* SVG Deposits Baseline (subtle dashed line underneath) */}
          {hasDeposits && (
            <path d={depositsPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" opacity="0.65" />
          )}

          {/* SVG Curve Path (Total Value) */}
          <path d={path} fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Interactive Hover Circles */}
          {coords.map((coord, idx) => (
            <g key={idx}>
              <circle
                cx={coord.x}
                cy={coord.y}
                r={hoveredIndex === idx ? 6 : 0}
                fill={strokeColor}
                stroke="white"
                strokeWidth="2"
                className="transition-all duration-100"
              />
              {hasDeposits && coordsDeposits[idx] && (
                <circle
                  cx={coordsDeposits[idx].x}
                  cy={coordsDeposits[idx].y}
                  r={hoveredIndex === idx ? 5 : 0}
                  fill="#64748b"
                  stroke="white"
                  strokeWidth="1.5"
                  className="transition-all duration-100"
                />
              )}
            </g>
          ))}

          {/* X Axis Date labels (First and Last) */}
          {coords.length > 1 && (
            <g className="text-[9px] fill-slate-400 font-bold opacity-75">
              <text x="50" y={height - 4} textAnchor="start">
                {new Date(coords[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
              <text x="485" y={height - 4} textAnchor="end">
                {new Date(coords[coords.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
            </g>
          )}

          {/* Interactive Mouse Areas */}
          {coords.map((coord, idx) => {
            const areaWidth = 435 / coords.length;
            const startX = coord.x - areaWidth / 2;
            return (
              <rect
                key={idx}
                x={startX}
                y="0"
                width={areaWidth}
                height={height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>

        {/* Floating Educational Return Tooltip */}
        {hoveredIndex !== null && coords[hoveredIndex] && (() => {
          const c = coords[hoveredIndex];

          if (hasDeposits) {
            const depVal = c.cumulativeDeposits ?? c.price;
            const gain = c.price - depVal;
            const pct = depVal > 0 ? (gain / depVal) * 100 : 0;
            const pos = gain >= 0;

            return (
              <div className="absolute top-2 right-2 bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl text-[10px] font-bold border border-slate-800 shadow-xl space-y-1.5 min-w-[160px] pointer-events-none z-10">
                <p className="text-slate-400 uppercase font-extrabold tracking-wider border-b border-slate-800 pb-1 text-[9px]">
                  {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400 font-semibold">Total Wealth:</span>
                  <span className="font-extrabold text-white">{currencySymbol}{c.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400 font-semibold">My Savings:</span>
                  <span className="font-extrabold text-slate-300">{currencySymbol}{depVal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-800 pt-1.5">
                  <span className="text-slate-400 font-semibold">Market Return:</span>
                  <span className={`font-black ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pos ? '+' : ''}{currencySymbol}{gain.toFixed(2)} ({pos ? '▲' : '▼'}{pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            );
          } else {
            return (
              <div className="absolute top-2 right-2 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl text-[10px] font-bold border border-slate-800 shadow-xl pointer-events-none z-10">
                <p className="text-slate-400 uppercase font-extrabold tracking-wider border-b border-slate-800 pb-1 text-[9px]">
                  {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <div className="flex justify-between gap-4 mt-1.5">
                  <span className="text-slate-400 font-semibold">Stock Price:</span>
                  <span className="font-extrabold text-emerald-400">${c.price.toFixed(2)} USD</span>
                </div>
              </div>
            );
          }
        })()}
      </div>

      {/* Chart Legend / Guide */}
      {hasDeposits && (
        <div className="flex gap-4 justify-center text-[10px] text-slate-500 font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-indigo-500 rounded-full" />
            <span>Total Wealth Growth Curve</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400" />
            <span>Net Savings Deposited (Allowance baseline)</span>
          </div>
        </div>
      )}
    </div>
  );
}
