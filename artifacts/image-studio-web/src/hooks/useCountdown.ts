
import { useState, useEffect } from 'react';

interface CountdownData {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isOver: boolean;
}

const ZEROED: CountdownData = { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false };

export function useCountdown(targetDate: Date | null): CountdownData {
  const [countdown, setCountdown] = useState<CountdownData>(ZEROED);

  useEffect(() => {
    if (!targetDate) {
      setCountdown(ZEROED);
      return;
    }

    const calculateCountdown = () => {
      const now = new Date().getTime();
      const target = targetDate.getTime();
      const difference = target - now;

      if (difference <= 0) {
        setCountdown({
          total: 0,
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isOver: true
        });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setCountdown({
        total: difference,
        days,
        hours,
        minutes,
        seconds,
        isOver: false
      });
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}
