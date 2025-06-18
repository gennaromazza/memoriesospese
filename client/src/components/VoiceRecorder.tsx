import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Play, Pause, RotateCcw, Download } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  maxDuration?: number; // in seconds, default 180 (3 minutes)
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check for microphone permission on mount
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
      stream.getTracks().forEach(track => track.stop()); // Stop immediately after checking
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
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Clean up
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
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
    setIsPlaying(false);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleUseRecording = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob, recordingTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = (recordingTime / maxDuration) * 100;

  if (hasPermission === false) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center">
          <div className="mb-4">
            <Mic className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Accesso al microfono richiesto
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Per registrare un messaggio audio, è necessario consentire l'accesso al microfono.
            </p>
            <Button onClick={checkMicrophonePermission} variant="outline">
              Riprova
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4 sm:p-6">
        <div className="text-center space-y-4">
          {/* Timer e progress */}
          <div className="space-y-2">
            <div className="text-2xl sm:text-3xl font-mono font-bold text-sage-900">
              {formatTime(recordingTime)}
            </div>
            <Progress 
              value={progressPercentage} 
              className="w-full h-2"
            />
            <div className="text-xs text-gray-500">
              Massimo {formatTime(maxDuration)}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-gradient-to-r from-sage-50 to-blue-gray-50 p-4 rounded-lg border border-sage-200">
            <div className="flex justify-center items-center gap-3 sm:gap-4">
              {!audioBlob ? (
                <>
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={hasPermission === null}
                    size="lg"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 px-8 bg-sage-600 hover:bg-sage-700 w-16 h-16 rounded-full shadow-lg text-[#667f8f]"
                  >
                    {isRecording ? (
                      <Square className="h-6 w-6" />
                    ) : (
                      <Mic className="h-6 w-6" />
                    )}
                  </Button>
                  <div className="text-sm text-sage-700 font-medium">
                    {isRecording ? 'Registrazione...' : 'Inizia registrazione'}
                  </div>
                </>
              ) : (
                <>
                  <Button
                    onClick={playRecording}
                    variant="outline"
                    size="lg"
                    className="w-12 h-12 rounded-full border-sage-300 hover:bg-sage-50"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5 text-sage-600" />
                    ) : (
                      <Play className="h-5 w-5 text-sage-600" />
                    )}
                  </Button>
                  <Button
                    onClick={resetRecording}
                    variant="outline"
                    size="lg"
                    className="w-12 h-12 rounded-full border-sage-300 hover:bg-sage-50"
                  >
                    <RotateCcw className="h-5 w-5 text-sage-600" />
                  </Button>
                  <Button
                    onClick={handleUseRecording}
                    className="bg-sage-600 hover:bg-sage-700 text-white px-6 shadow-lg"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Usa questa registrazione
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Audio element for playback */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}

          {/* Recording status */}
          {isRecording && (
            <div className="flex items-center justify-center gap-2 text-red-600">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Registrazione in corso...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}