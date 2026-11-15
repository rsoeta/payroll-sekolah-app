import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * ============================================================================
 * FROSTED GLASS FLOATING TAB BAR WITH DUAL-SPRING STRETCHING PILL INDICATOR
 * ============================================================================
 * Visible on mobile viewports (<= 760px) where the fixed glass rail is hidden.
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
  const [direction, setDirection] = useState('right');

  const currentIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );

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

  useLayoutEffect(() => {
    if (currentIndex > prevIndexRef.current) {
      setDirection('right');
    } else if (currentIndex < prevIndexRef.current) {
      setDirection('left');
    }
    prevIndexRef.current = currentIndex;
    updatePillCoordinates();
  }, [currentIndex, activeTab, updatePillCoordinates]);

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

  const pillTransition =
    direction === 'right'
      ? {
          right: LEADING_SPRING,
          left: TRAILING_SPRING,
        }
      : {
          left: LEADING_SPRING,
          right: TRAILING_SPRING,
        };

  return (
    <nav
      aria-label="Navigasi Utama Mobile"
      className="fixed left-1/2 z-40 w-[calc(100vw-20px)] max-w-md -translate-x-1/2 hidden max-[760px]:block"
      style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
    >
      <div
        ref={containerRef}
        className="nim-panel relative flex items-center justify-between rounded-[24px] p-1.5"
      >
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
              top: 6,
              bottom: 6,
              background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))',
              boxShadow:
                '0 6px 18px -4px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)',
            }}
            className="pointer-events-none z-0 rounded-[18px]"
          />
        )}

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
              style={{
                color: isActive ? 'var(--accent-ink)' : 'var(--muted)',
              }}
              className="relative z-10 flex flex-1 flex-col items-center justify-center rounded-[18px] px-2 py-1.5 min-h-[48px] text-center transition-colors duration-200 select-none"
            >
              <motion.span
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                {IconComponent && (
                  <IconComponent
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isActive ? 'scale-105 stroke-[2.3]' : 'scale-100 stroke-[1.8]'
                    }`}
                  />
                )}
                <span
                  className={`text-[10px] leading-tight tracking-tight transition-all duration-200 ${
                    isActive ? 'font-bold' : 'font-semibold'
                  }`}
                >
                  {tab.label}
                </span>
              </motion.span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="absolute right-2.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold shadow-xs"
                  style={{
                    background: 'var(--warn)',
                    color: '#050a18',
                  }}
                >
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
