// apps/web/src/components/SplashScreen.jsx
import React, { useEffect, useState } from 'react';

const A = '#3b82f6';

export default function SplashScreen({ onDone, duration = 2400 }) {
  const [phase, setPhase] = useState('enter');   // 'enter' → 'visible' → 'exit'

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('visible'), 50);
    const holdTimer  = setTimeout(() => setPhase('exit'),    duration);
    const exitTimer  = setTimeout(() => onDone?.(),          duration + 450);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, [duration, onDone]);

  const splashOpacity = phase === 'exit' ? 0 : 1;
  const entered = phase !== 'enter';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#06060f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: splashOpacity,
        transition: phase === 'exit' ? 'opacity 0.45s ease' : 'none',
        pointerEvents: phase === 'exit' ? 'none' : 'auto',
        overflow: 'hidden',
      }}
    >
      {/* ── Stage 1: background glow expands from center ── */}
      <div
        style={{
          position: 'absolute',
          width: '900px',
          height: '900px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${A}25 0%, transparent 65%)`,
          filter: 'blur(60px)',
          opacity: entered ? 1 : 0,
          transform: `scale(${entered ? 1 : 0.3})`,
          transition: 'opacity 1s cubic-bezier(0.22, 1, 0.36, 1), transform 1.2s cubic-bezier(0.34, 1.3, 0.64, 1)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '28px',
        }}
      >
        {/* ── Stage 2: logo drops in from above ── */}
        <div
          style={{
            opacity: entered ? 1 : 0,
            transform: `translateY(${entered ? 0 : -60}px) scale(${entered ? 1 : 0.6})`,
            transition: 'opacity 0.5s ease 0.05s, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s',
          }}
        >
          <img
            src="/logo.png"
            alt="Sentinel"
            style={{
              width: '160px',
              height: '160px',
              objectFit: 'contain',
              display: 'block',
              filter: `drop-shadow(0 0 40px ${A}90) drop-shadow(0 0 80px ${A}50)`,
              animation: entered ? 'splashPulse 2.4s ease-in-out 1.4s infinite' : 'none',
            }}
          />
        </div>

        {/* ── Stage 3: wordmark drops in from above ── */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '4px',
            opacity: entered ? 1 : 0,
            transform: `translateY(${entered ? 0 : -40}px) scale(${entered ? 1 : 0.8})`,
            transition: 'opacity 0.5s ease 0.45s, transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) 0.45s',
          }}
        >
          <div
            style={{
              position: 'relative',
              fontSize: '64px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontFamily: "'Inter', system-ui, sans-serif",
              lineHeight: 1,
              color: '#cbd5e1',
              display: 'inline-block',
            }}
          >
            Sentinel
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage: `linear-gradient(
                  100deg,
                  transparent 20%,
                  rgba(255,255,255,0) 35%,
                  rgba(255,255,255,0.95) 50%,
                  rgba(59,130,246,0.9) 55%,
                  rgba(255,255,255,0) 70%,
                  transparent 80%
                )`,
                backgroundSize: '250% 100%',
                backgroundRepeat: 'no-repeat',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                animation: entered ? 'splashShimmer 2.4s ease-in-out 1.5s infinite' : 'none',
                mixBlendMode: 'screen',
              }}
            >
              Sentinel
            </span>
          </div>

          {/* Underline draws outward */}
          <div
            style={{
              height: '2px',
              width: entered ? '280px' : '0px',
              margin: '18px auto 0',
              background: `linear-gradient(90deg, transparent, ${A}, transparent)`,
              transition: 'width 0.9s cubic-bezier(0.4, 0, 0.2, 1) 0.95s',
              opacity: entered ? 1 : 0,
            }}
          />

          {/* Subtitle drops in */}
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#4b5563',
              letterSpacing: '0.55em',
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: '18px',
              paddingLeft: '0.55em',
              opacity: entered ? 1 : 0,
              transform: `translateY(${entered ? 0 : -20}px)`,
              transition: 'opacity 0.5s ease 1.25s, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 1.25s',
            }}
          >
            CONTROL CENTER
          </div>
        </div>

        {/* ── Stage 4: dots drop in one by one ── */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: A,
                boxShadow: `0 0 12px ${A}`,
                opacity: entered ? 1 : 0,
                transform: `translateY(${entered ? 0 : -14}px) scale(${entered ? 1 : 0.4})`,
                transition: `opacity 0.35s ease ${1.5 + i * 0.14}s, transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) ${1.5 + i * 0.14}s`,
                animation: entered ? `splashDot 1.2s ease-in-out ${i * 0.15}s infinite` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashPulse {
          0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 40px ${A}90) drop-shadow(0 0 80px ${A}50); }
          50%      { transform: scale(1.06); filter: drop-shadow(0 0 55px ${A}b0) drop-shadow(0 0 110px ${A}70); }
        }
        @keyframes splashShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes splashDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
          40%           { opacity: 1;   transform: scale(1.35); }
        }
      `}</style>
    </div>
  );
}