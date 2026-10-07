import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertCircle } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  maxDuration?: number;
}

export default function VoiceRecorder({ 
  onRecordingComplete, 
  maxDuration = 180 
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkMicrophonePermission();
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      setHasPermission(false);
      console.error('Microphone permission denied:', error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        ''
      ];
      const supportedMime = mimeTypes.find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
      
      const recorderOptions: MediaRecorderOptions = {};
      if (supportedMime) {
        recorderOptions.mimeType = supportedMime;
      }
      
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      const actualMime = mediaRecorder.mimeType || 'audio/webm';
      
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: actualMime });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setIsConfirmed(false);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= maxDuration) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setHasPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = () => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setPlaybackTime(0);
    setIsPlaying(false);
    setIsConfirmed(false);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleUseRecording = () => {
    if (audioBlob) {
      setIsConfirmed(true);
      onRecordingComplete(audioBlob, recordingTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = (recordingTime / maxDuration) * 100;
  const playbackPercentage = recordingTime > 0 ? (playbackTime / recordingTime) * 100 : 0;

  if (hasPermission === false) {
    return (
      <Card className="w-full border-red-200 bg-red-50">
        <CardContent className="p-5 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            Microfono non disponibile
          </h3>
          <p className="text-[13px] text-gray-600 mb-4 leading-relaxed">
            Consenti l'accesso al microfono nelle impostazioni del browser per registrare.
          </p>
          <button
            onClick={checkMicrophonePermission}
            className="h-11 px-6 bg-white border border-red-200 rounded-xl text-[14px] font-medium text-red-600 hover:bg-red-50 active:bg-red-100 touch-manipulation transition-colors"
          >
            Riprova
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-4">
        <div className="text-center space-y-4">
          {!audioBlob ? (
            <>
              <div className="relative py-6">
                {isRecording && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border-4 border-red-300 animate-ping opacity-30 pointer-events-none" />
                )}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={hasPermission === null}
                  aria-label={isRecording ? "Ferma registrazione" : "Inizia registrazione"}
                  className={`relative z-10 w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-300 touch-manipulation ${
                    isRecording 
                      ? 'bg-red-500 shadow-lg shadow-red-200 scale-110' 
                      : 'bg-[#4a6741] hover:bg-[#3d5636] active:bg-[#334a2e] shadow-lg'
                  }`}
                >
                  {isRecording ? (
                    <Square className="h-8 w-8 text-white" fill="white" />
                  ) : (
                    <Mic className="h-10 w-10 text-white" />
                  )}
                </button>

                {isRecording && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-red-600 font-semibold text-[15px] tabular-nums">
                      {formatTime(recordingTime)}
                    </span>
                  </div>
                )}
              </div>

              {isRecording && (
                <div className="space-y-1.5">
                  <Progress value={progressPercentage} className="w-full h-1.5" />
                  <p className="text-[11px] text-gray-400">
                    Max {formatTime(maxDuration)}
                  </p>
                </div>
              )}

              <p className="text-[13px] text-gray-500">
                {isRecording 
                  ? 'Tocca il quadrato per fermare' 
                  : 'Tocca il microfono per registrare'}
              </p>
            </>
          ) : (
            <>
              {isConfirmed ? (
                <div className="py-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="text-[15px] font-semibold text-green-700">Audio selezionato!</p>
                  <p className="text-[13px] text-gray-500 mt-1">
                    Durata: {formatTime(recordingTime)} — Compila i campi sotto e invia
                  </p>
                  <button
                    onClick={resetRecording}
                    className="mt-3 h-9 px-4 text-[13px] text-gray-500 hover:text-gray-700 active:bg-gray-100 rounded-lg touch-manipulation transition-colors"
                  >
                    Registra di nuovo
                  </button>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  <div className="bg-sage-50 rounded-2xl p-4 border border-sage-100">
                    <p className="text-[12px] text-sage-600 font-medium mb-3 uppercase tracking-wide">
                      Anteprima registrazione
                    </p>

                    <div className="flex items-center gap-3 mb-2">
                      <button
                        onClick={playRecording}
                        className="w-12 h-12 rounded-full bg-[#4a6741] hover:bg-[#3d5636] active:bg-[#334a2e] text-white flex items-center justify-center flex-shrink-0 transition-colors touch-manipulation shadow-sm"
                        aria-label={isPlaying ? "Pausa" : "Riproduci"}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5 ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <Progress value={playbackPercentage} className="w-full h-2 mb-1" />
                        <div className="flex justify-between text-[11px] text-gray-400 tabular-nums">
                          <span>{formatTime(playbackTime)}</span>
                          <span>{formatTime(recordingTime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={resetRecording}
                      className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 text-[14px] font-semibold touch-manipulation transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rifai
                    </button>
                    <button
                      onClick={handleUseRecording}
                      className="flex-[2] h-12 flex items-center justify-center gap-2 rounded-xl bg-[#4a6741] hover:bg-[#3d5636] active:bg-[#334a2e] text-white text-[14px] font-semibold touch-manipulation transition-colors shadow-md"
                    >
                      <Check className="h-5 w-5" />
                      Usa questo vocale
                    </button>
                  </div>
                </div>
              )}

              {audioUrl && (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onEnded={() => {
                    setIsPlaying(false);
                    setPlaybackTime(0);
                  }}
                  onTimeUpdate={() => {
                    if (audioRef.current) {
                      setPlaybackTime(audioRef.current.currentTime);
                    }
                  }}
                  className="hidden"
                />
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
