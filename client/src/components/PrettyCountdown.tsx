
import React from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { Heart, Calendar, Sparkles } from 'lucide-react';

type Variant = "banner" | "chips" | "rings";
type AfterMode = "celebrate" | "showDate" | "hide";

interface PrettyCountdownProps {
  targetDate: Date;
  title?: string;
  variant?: Variant;
  afterMode?: AfterMode;
  className?: string;
  showLabels?: boolean;
  compactOnMobile?: boolean;
  eventLabel?: string;
  pastMessageTemplate?: (d: Date) => string;
}

export function PrettyCountdown({
  targetDate,
  title = "Mancano al grande giorno",
  variant = "banner",
  afterMode = "celebrate",
  className = "",
  showLabels = true,
  compactOnMobile = true,
  eventLabel = "dell'evento",
  pastMessageTemplate
}: PrettyCountdownProps) {
  const { days, hours, minutes, seconds, isOver } = useCountdown(targetDate);

  // Dopo l'evento
  if (isOver) {
    if (afterMode === "hide") return null;
    
    if (afterMode === "celebrate") {
      return (
        <div className={`bg-gradient-to-r from-[#7fb0b2]/10 via-[#b47d7d]/10 to-[#7fb0b2]/10 
                        border border-[#7fb0b2]/30 rounded-2xl p-6 text-center shadow-sm ${className}`}
             role="status" aria-live="polite">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-6 w-6 text-[#7fb0b2] animate-pulse" />
            <Heart className="h-6 w-6 text-[#b47d7d] animate-pulse" />
            <Sparkles className="h-6 w-6 text-[#7fb0b2] animate-pulse" />
          </div>
          <h3 className="text-2xl font-bold text-[#6f4747] dark:text-neutral-100 mb-1">
            È arrivato il giorno! ✨
          </h3>
          <p className="text-[#6f4747]/70 dark:text-neutral-300">
            Auguri per questo momento speciale
          </p>
        </div>
      );
    }
    
    if (afterMode === "showDate") {
      const dateStr = targetDate.toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      
      const message = pastMessageTemplate 
        ? pastMessageTemplate(targetDate)
        : `Il grande giorno ${eventLabel ? eventLabel + ' ' : ''}è stato il ${dateStr} 💍`;
      
      return (
        <div className={`bg-gradient-to-r from-[#b47d7d]/10 via-[#7fb0b2]/10 to-[#b47d7d]/10 
                        border border-[#b47d7d]/30 rounded-2xl p-6 text-center shadow-sm ${className}`}
             role="status" aria-live="polite">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar className="h-6 w-6 text-[#b47d7d]" />
            <Heart className="h-6 w-6 text-[#7fb0b2]" />
          </div>
          <h3 className="text-xl font-semibold text-[#6f4747] dark:text-neutral-100">
            {message}
          </h3>
        </div>
      );
    }
  }

  // Prima dell'evento - Countdown attivo
  const CountdownNumber = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="bg-white dark:bg-neutral-800 border border-[#7fb0b2]/20 
                      rounded-xl px-3 py-2 min-w-[60px] shadow-sm">
        <span className="text-2xl font-bold text-[#6f4747] dark:text-neutral-100 tabular-nums">
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      {showLabels && (
        <span className="text-xs text-[#6f4747]/70 dark:text-neutral-400 mt-1 font-medium">
          {label}
        </span>
      )}
    </div>
  );

  const CountdownChip = ({ value, label }: { value: number; label: string }) => (
    <div className="bg-[#7fb0b2]/10 border border-[#7fb0b2]/30 rounded-full px-4 py-2 flex items-center gap-2">
      <span className="text-xl font-bold text-[#6f4747] dark:text-neutral-100 tabular-nums">
        {value}
      </span>
      {showLabels && (
        <span className="text-sm text-[#6f4747]/70 dark:text-neutral-400">
          {label}
        </span>
      )}
    </div>
  );

  const CountdownRing = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 bg-gradient-to-br from-[#7fb0b2] to-[#b47d7d] rounded-full p-[2px]">
          <div className="bg-white dark:bg-neutral-800 rounded-full w-full h-full flex items-center justify-center">
            <span className="text-lg font-bold text-[#6f4747] dark:text-neutral-100 tabular-nums">
              {value.toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
      {showLabels && (
        <span className="text-xs text-[#6f4747]/70 dark:text-neutral-400 mt-1 font-medium">
          {label}
        </span>
      )}
    </div>
  );

  const renderCountdown = () => {
    const items = [
      { value: days, label: compactOnMobile ? 'g' : 'giorni' },
      { value: hours, label: compactOnMobile ? 'h' : 'ore' },
      { value: minutes, label: compactOnMobile ? 'm' : 'min' },
      { value: seconds, label: compactOnMobile ? 's' : 'sec' }
    ];

    if (variant === "chips") {
      return (
        <div className="flex flex-wrap justify-center gap-2">
          {items.map(({ value, label }, index) => (
            <CountdownChip key={index} value={value} label={label} />
          ))}
        </div>
      );
    }

    if (variant === "rings") {
      return (
        <div className="flex justify-center gap-4 flex-wrap">
          {items.map(({ value, label }, index) => (
            <CountdownRing key={index} value={value} label={label} />
          ))}
        </div>
      );
    }

    // Default banner
    return (
      <div className="flex justify-center gap-4 flex-wrap">
        {items.map(({ value, label }, index) => (
          <CountdownNumber key={index} value={value} label={label} />
        ))}
      </div>
    );
  };

  return (
    <div className={`bg-gradient-to-r from-[#f7f7f7] to-white dark:from-neutral-900 dark:to-neutral-800 
                    border border-[#7fb0b2]/20 rounded-2xl p-6 text-center shadow-sm ${className}`}
         role="timer" aria-live="polite">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Heart className="h-5 w-5 text-[#b47d7d]" />
        <h3 className="text-lg font-semibold text-[#6f4747] dark:text-neutral-100">
          {title}
        </h3>
        <Heart className="h-5 w-5 text-[#b47d7d]" />
      </div>
      
      {renderCountdown()}
      
      <div className="mt-4 h-1 bg-gradient-to-r from-[#7fb0b2] via-[#b47d7d] to-[#7fb0b2] rounded-full opacity-30" />
    </div>
  );
}
