import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * ============================================================================
 * TELEGRAM-STYLE FLOATING TAB BAR WITH DUAL-SPRING STRETCHING PILL INDICATOR
 * ============================================================================
 * Mechanics Implemented:
 * 1. Zero fixed width & zero `transform: translateX` on the active indicator.
 *    Uses `position: absolute` driven strictly by `left` and `right` coordinates.
 * 2. Dynamically computes `left` and `right` bounds of the target tab container.
 * 3. Applies two independent spring physics configurations:
 *    - Leading Edge (Tepi Depan)   : Stiffness = 361, Damping = 21 (fast, snappy)
 *    - Trailing Edge (Tepi Belakang): Stiffness = 121, Damping = 16 (lagging, bouncy)
 *    When moving right, `right` leads and `left` trails (stretching the pill mid-flight).
 *    When moving left, `left` leads and `right` trails.
 */

const LEADING_SPRING = {
  type: 'spring',
  stiffness: 361,
  damping: 21,
};

const TRAILING_SPRING = {
  type: 'spring',
  stiffness: 121,
  damping: 16,
};

export function FloatingTabBar({ tabs = [], activeTab, onChange }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const prevIndexRef = useRef(0);

  const [coords, setCoords] = useState({ left: 6, right: 6, ready: false });
  const [direction, setDirection] = useState('right'); // 'right' | 'left'

  const currentIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );

  // Measure target tab `left` and `right` relative to the tab bar container
  const updatePillCoordinates = useCallback(() => {
    const containerEl = containerRef.current;
    const targetEl = tabRefs.current[activeTab];
    if (!containerEl || !targetEl) return;

    const containerWidth = containerEl.clientWidth;
    const targetLeft = targetEl.offsetLeft;
    const targetWidth = targetEl.offsetWidth;
    const targetRight = Math.max(0, containerWidth - (targetLeft + targetWidth));

    setCoords({
      left: targetLeft,
      right: targetRight,
      ready: true,
    });
  }, [activeTab]);

  // Track movement direction ('right' vs 'left') before updating coordinates
  useLayoutEffect(() => {
    if (currentIndex > prevIndexRef.current) {
      setDirection('right');
    } else if (currentIndex < prevIndexRef.current) {
      setDirection('left');
    }
    prevIndexRef.current = currentIndex;
    updatePillCoordinates();
  }, [currentIndex, activeTab, updatePillCoordinates]);

  // Re-calculate coordinates on viewport resize or orientation change
  useEffect(() => {
    window.addEventListener('resize', updatePillCoordinates);
    let observer;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => updatePillCoordinates());
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updatePillCoordinates);
      if (observer) observer.disconnect();
    };
  }, [updatePillCoordinates]);

  // Assign Leading vs Trailing spring based on travel direction
  const pillTransition =
    direction === 'right'
      ? {
          // Moving Right: right edge leads (fast), left edge trails (stretches & bounces)
          right: LEADING_SPRING,
          left: TRAILING_SPRING,
        }
      : {
          // Moving Left: left edge leads (fast), right edge trails (stretches & bounces)
          left: LEADING_SPRING,
          right: TRAILING_SPRING,
        };

  return (
    <nav
      aria-label="Navigasi Utama Mobile"
      className="fixed bottom-3.5 left-1/2 z-40 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 sm:hidden"
    >
      <div
        ref={containerRef}
        className="relative flex items-center justify-between rounded-full border border-slate-700/70 bg-slate-900/92 p-1 shadow-[0_14px_34px_-6px_rgba(15,23,42,0.55)] backdrop-blur-xl"
      >
        {/* Stretching Dual-Spring Pill Indicator (Position Absolute using left & right) */}
        {coords.ready && (
          <motion.div
            aria-hidden="true"
            initial={false}
            animate={{
              left: coords.left,
              right: coords.right,
            }}
            transition={pillTransition}
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
            }}
            className="pointer-events-none z-0 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 shadow-[0_4px_16px_rgba(79,70,229,0.45)]"
          />
        )}

        {/* Tab Items (Compact mobile height harmonious with font) */}
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`touch-target relative z-10 flex flex-1 flex-col items-center justify-center rounded-full px-2 py-1 text-center transition-colors duration-200 select-none ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <motion.span
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                {IconComponent && (
                  <IconComponent
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isActive ? 'scale-110 stroke-[2.4]' : 'scale-100 stroke-[1.8]'
                    }`}
                  />
                )}
                <span
                  className={`text-[9.5px] leading-tight tracking-tight transition-all duration-200 ${
                    isActive ? 'font-bold text-white' : 'font-medium text-slate-300/90'
                  }`}
                >
                  {tab.label}
                </span>
              </motion.span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="absolute right-2.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-extrabold text-slate-950 shadow-xs">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default FloatingTabBar;
