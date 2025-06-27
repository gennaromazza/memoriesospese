import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
  Clock,
  Calendar,
  User,
  MessageSquare,
  Lock,
  Unlock,
  Trash2
} from 'lucide-react';
import { VoiceMemo } from '@shared/schema';
import InteractionWrapper from './InteractionWrapper';

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

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      let date: Date;
      
      // Gestisci timestamp Firebase
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } 
      // Gestisci timestamp in secondi (Firebase formato alternativo)
      else if (timestamp.seconds && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      }
      // Gestisci stringhe ISO o timestamp numerici
      else {
        date = new Date(timestamp);
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-700">{memo.guestName}</p>
                <p className="text-sm text-gray-500">Messaggio bloccato</p>
              </div>
            </div>
            {hasUnlockDate && (
              <Badge variant="outline" className="text-gray-600">
                <Calendar className="h-3 w-3 mr-1" />
                Sblocco: {formatDate(memo.unlockDate!)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Header with guest info */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-sage-500 to-blue-gray-500 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-[#707d6e]" />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm sm:text-base">{memo.guestName}</p>
                <p className="text-xs sm:text-sm text-gray-500">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {formatDateTime(memo.createdAt)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isLocked && isAdmin && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  <Lock className="h-3 w-3 mr-1" />
                  Bloccato
                </Badge>
              )}
              {hasUnlockDate && (
                <Badge variant="outline" className="text-blue-600 border-blue-300">
                  <Calendar className="h-3 w-3 mr-1" />
                  {formatDate(memo.unlockDate!)}
                </Badge>
              )}
            </div>
          </div>

          {/* Message if present */}
          {memo.message && (
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600 mt-0.5" />
                <p className="text-sm text-gray-700">{memo.message}</p>
              </div>
            </div>
          )}

          {/* Audio controls */}
          <div className="space-y-3">
            {/* Play controls and progress */}
            <div className="flex items-center gap-3">
              <Button
                onClick={togglePlay}
                disabled={isLoading || !!error}
                size="sm"
                className="w-10 h-10 rounded-full bg-[#d0dfd4] hover:bg-sage-700 text-white"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <Progress 
                  value={progressPercentage} 
                  className="w-full h-2 cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    handleSeek(percentage);
                  }}
                />
              </div>
            </div>

            {/* Additional controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  onClick={resetAudio}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                
                <div className="flex items-center gap-1">
                  <Button
                    onClick={toggleMute}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    {isMuted ? (
                      <VolumeX className="h-3 w-3" />
                    ) : (
                      <Volume2 className="h-3 w-3" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume * 100}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={downloadAudio}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                >
                  <Download className="h-3 w-3 mr-1" />
                  <span className="text-xs">Scarica</span>
                </Button>

                {isAdmin && (
                  <>
                    {isLocked && onUnlock && (
                      <Button
                        onClick={() => onUnlock(memo.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <Unlock className="h-3 w-3 mr-1" />
                        <span className="text-xs">Sblocca</span>
                      </Button>
                    )}
                    
                    {onDelete && (
                      <Button
                        onClick={() => onDelete(memo.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        <span className="text-xs">Elimina</span>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={memo.audioUrl}
            preload="metadata"
            className="hidden"
          />

          {/* Interaction Panel - Like e Commenti */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <InteractionWrapper
              itemId={memo.id}
              itemType="voice_memo"
              galleryId={galleryId}
              isAdmin={isAdmin}
              variant="inline"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}