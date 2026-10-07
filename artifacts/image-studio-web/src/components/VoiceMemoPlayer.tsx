import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Download,
  Calendar,
  Lock,
  Unlock,
  Trash2
} from 'lucide-react';
import { VoiceMemo } from '@shared/schema';
import UserAvatar from './UserAvatar';
import { Timestamp } from 'firebase/firestore';

interface VoiceMemoPlayerProps {
  memo: VoiceMemo;
  galleryId: string;
  isAdmin?: boolean;
  onUnlock?: (memoId: string) => void;
  onDelete?: (memoId: string) => void;
}

export default function VoiceMemoPlayer({ 
  memo, 
  galleryId,
  isAdmin = false, 
  onUnlock, 
  onDelete 
}: VoiceMemoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(memo.duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };
    const handleError = () => {
      setIsLoading(false);
      setError('Errore nel caricamento dell\'audio');
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError('Errore nella riproduzione'));
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = (value / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const resetAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = value / 100;
    setVolume(newVolume);
    audio.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const downloadAudio = () => {
    const link = document.createElement('a');
    link.href = memo.audioUrl;
    link.download = memo.fileName;
    link.click();
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Data non valida';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Data non valida';
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return 'Data non valida';
    }
  };

  const formatDateTime = (timestamp: Timestamp | Date | string | number | null | undefined) => {
    if (!timestamp) return '';
    
    try {
      let date: Date;
      
      // Gestisci timestamp Firebase
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as any).toDate === 'function') {
        date = (timestamp as any).toDate();
      } 
      // Gestisci timestamp in secondi (Firebase formato alternativo)
      else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as any).seconds === 'number') {
        date = new Date((timestamp as any).seconds * 1000);
      }
      // Gestisci stringhe ISO o timestamp numerici
      else {
        date = new Date(timestamp as string | number | Date);
      }
      
      // Verifica che la data sia valida
      if (isNaN(date.getTime())) {
        return 'Data non disponibile';
      }
      
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Errore nella formattazione della data:', error, timestamp);
      return 'Data non disponibile';
    }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLocked = !memo.isUnlocked;
  const hasUnlockDate = memo.unlockDate && memo.unlockDate !== '';

  if (isLocked && !isAdmin) {
    return (
      <Card className="w-full opacity-60">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <UserAvatar
                userEmail={memo.userEmail}
                userName={memo.guestName}
                userProfileImageUrl={memo.userProfileImageUrl}
                size="md"
              />
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center">
                <Lock className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-700 truncate">{memo.guestName}</p>
              <p className="text-sm text-gray-500">Messaggio bloccato</p>
            </div>
            {hasUnlockDate && (
              <Badge variant="outline" className="text-gray-600 text-[11px] flex-shrink-0">
                <Calendar className="h-3 w-3 mr-1" />
                {formatDate(memo.unlockDate!)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <UserAvatar
                userEmail={memo.userEmail}
                userName={memo.guestName}
                userProfileImageUrl={memo.userProfileImageUrl}
                size="md"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-[14px] truncate">{memo.guestName}</p>
              <p className="text-[12px] text-gray-400">
                {formatDateTime(memo.createdAt)}
              </p>
            </div>
            
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isLocked && isAdmin && (
                <Badge variant="outline" className="text-orange-600 border-orange-300 text-[11px]">
                  <Lock className="h-3 w-3 mr-0.5" />
                  Bloccato
                </Badge>
              )}
              {hasUnlockDate && (
                <Badge variant="outline" className="text-blue-600 border-blue-300 text-[11px]">
                  <Calendar className="h-3 w-3 mr-0.5" />
                  {formatDate(memo.unlockDate!)}
                </Badge>
              )}
            </div>
          </div>

          {memo.message && (
            <div className="bg-gray-50 px-3 py-2.5 rounded-xl">
              <p className="text-[13px] text-gray-700 leading-relaxed">{memo.message}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={isLoading || !!error}
                className="w-12 h-12 rounded-full bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-white flex items-center justify-center flex-shrink-0 transition-colors touch-manipulation shadow-sm"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </button>
              
              <div className="flex-1 space-y-1 min-w-0">
                <Progress 
                  value={progressPercentage} 
                  className="w-full h-2.5 cursor-pointer touch-manipulation"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    handleSeek(percentage);
                  }}
                />
                <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums px-0.5">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={resetAudio}
                  aria-label="Riavvolgi audio"
                  className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 touch-manipulation transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? "Attiva audio" : "Disattiva audio"}
                  className="h-9 w-9 hidden sm:flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 touch-manipulation transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume * 100}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer hidden sm:block"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={downloadAudio}
                  className="h-9 px-3 flex items-center gap-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 text-[12px] touch-manipulation transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Scarica</span>
                </button>

                {isAdmin && (
                  <>
                    {isLocked && onUnlock && (
                      <button
                        onClick={() => onUnlock(memo.id)}
                        className="h-9 px-3 flex items-center gap-1.5 rounded-full text-green-600 hover:bg-green-50 active:bg-green-100 text-[12px] touch-manipulation transition-colors"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Sblocca</span>
                      </button>
                    )}
                    
                    {onDelete && (
                      <button
                        onClick={() => onDelete(memo.id)}
                        className="h-9 px-3 flex items-center gap-1.5 rounded-full text-red-600 hover:bg-red-50 active:bg-red-100 text-[12px] touch-manipulation transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Elimina</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <audio
            ref={audioRef}
            src={memo.audioUrl}
            preload="metadata"
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}