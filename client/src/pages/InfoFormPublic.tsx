/**
 * Pagina pubblica per la compilazione di un Modulo Informativo
 * Vista a card sfogliabile: una domanda per volta con animazioni.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, CheckCircle2, ClipboardList, AlertCircle,
  ArrowRight, ArrowLeft, Send,
} from 'lucide-react';
import { getSubmissionByToken, submitInfoForm } from '@/lib/infoForms';
import type { InfoFormSubmission, InfoFormField } from '@shared/info-form-types';
import { apiRequest } from '@/lib/queryClient';

export default function InfoFormPublic() {
  const params = useParams<{ token: string }>();
  const token = params.token || '';

  const [submission, setSubmission] = useState<InfoFormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editorialConsent, setEditorialConsent] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [animating, setAnimating] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow,noarchive';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (animating || submitting) return;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      isLast ? handleSubmit() : handleNext();
    } else {
      handleBack();
    }
  };

  useEffect(() => {
    if (!token) return;
    getSubmissionByToken(token)
      .then(sub => {
        if (!sub) { setNotFound(true); return; }
        setSubmission(sub);
        if (sub.status === 'completed') setSubmitted(true);
        const initial: Record<string, any> = {};
        sub.templateFields?.forEach(f => {
          if (f.type === 'checkbox') initial[f.id] = [];
          else if (f.type === 'vendor') initial[f.id] = { name: '', role: '', url: '' };
          else initial[f.id] = '';
        });
        setAnswers(initial);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const fields = submission?.templateFields || [];
  const hasEditorialFields = fields.some(field => field.editorialUse);
  const total = fields.length;
  const current = fields[currentIndex];
  const isLast = currentIndex === total - 1;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  const validateCurrent = (): boolean => {
    if (!current?.required) return true;
    const val = answers[current.id];
    if (current.type === 'checkbox') {
      if (!Array.isArray(val) || val.length === 0) {
        setFieldError('Seleziona almeno un\'opzione per continuare');
        return false;
      }
    } else if (current.type === 'vendor') {
      const vendor = val && typeof val === 'object' ? val : {};
      if (!String(vendor.name || '').trim() || !String(vendor.role || '').trim()) {
        setFieldError('Inserisci almeno nome e ruolo del fornitore');
        return false;
      }
    } else {
      if (!val || String(val).trim() === '') {
        setFieldError('Compila questo campo per continuare');
        return false;
      }
    }
    return true;
  };

  const animateTransition = (newIndex: number, dir: 'forward' | 'backward') => {
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setFieldError(null);
      setAnimating(false);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 220);
  };

  const handleNext = () => {
    if (!validateCurrent()) return;
    if (isLast) return;
    animateTransition(currentIndex + 1, 'forward');
  };

  const handleBack = () => {
    if (currentIndex === 0) return;
    animateTransition(currentIndex - 1, 'backward');
  };

  const handleChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    setFieldError(null);
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    setAnswers(prev => {
      const current: string[] = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
      if (checked) return { ...prev, [fieldId]: [...current, option] };
      return { ...prev, [fieldId]: current.filter(v => v !== option) };
    });
    setFieldError(null);
  };

  const handleSubmit = async () => {
    if (!validateCurrent()) return;
    if (!submission) return;
    setSubmitting(true);
    try {
      await submitInfoForm(submission.id, token, answers, editorialConsent);
      try {
        await apiRequest('POST', '/api/email/send-info-form-submitted', { token });
      } catch (_) { }
      setSubmitted(true);
    } catch (err: any) {
      setFieldError(err.message || 'Errore durante l\'invio. Riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && current?.type !== 'textarea') {
      e.preventDefault();
      isLast ? handleSubmit() : handleNext();
    }
  };

  const renderFieldInput = (field: InfoFormField) => {
    const hasError = !!fieldError;
    const baseInput = hasError
      ? 'border-red-400 bg-red-50 focus:border-red-500'
      : 'border-gray-200 focus:border-[#6b7f6b]';

    switch (field.type) {
      case 'text':
        return (
          <Input
            autoFocus
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || 'Scrivi qui la tua risposta...'}
            className={`text-lg h-12 ${baseInput}`}
          />
        );
      case 'instagram':
        return (
          <div>
            <Input
              autoFocus
              value={answers[field.id] || ''}
              onChange={e => handleChange(field.id, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={field.placeholder || '@nomeutente'}
              maxLength={100}
              className={`text-lg h-12 ${baseInput}`}
            />
            <p className="mt-2 text-sm text-gray-400">
              Inserisci il nome utente Instagram (es. @nomeutente)
            </p>
          </div>
        );
      case 'vendor': {
        const vendor = answers[field.id] || { name: '', role: '', url: '' };
        return (
          <div className="grid gap-3">
            <Input
              autoFocus
              value={vendor.name || ''}
              onChange={e => handleChange(field.id, { ...vendor, name: e.target.value })}
              placeholder="Nome del fornitore"
              className={`text-lg h-12 ${baseInput}`}
            />
            <Input
              value={vendor.role || ''}
              onChange={e => handleChange(field.id, { ...vendor, role: e.target.value })}
              placeholder="Ruolo, es. floral designer"
              className={`text-lg h-12 ${baseInput}`}
            />
            <Input
              type="url"
              value={vendor.url || ''}
              onChange={e => handleChange(field.id, { ...vendor, url: e.target.value })}
              placeholder="Sito o profilo pubblico (opzionale)"
              className={`text-lg h-12 ${baseInput}`}
            />
          </div>
        );
      }
      case 'textarea':
        return (
          <Textarea
            autoFocus
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder || 'Scrivi qui la tua risposta...'}
            rows={5}
            className={`text-base resize-none ${baseInput}`}
          />
        );
      case 'number':
        return (
          <Input
            autoFocus
            type="number"
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || 'Inserisci un numero...'}
            className={`text-lg h-12 ${baseInput}`}
          />
        );
      case 'select':
        return (
          <Select value={answers[field.id] || ''} onValueChange={v => handleChange(field.id, v)}>
            <SelectTrigger className={`h-12 text-base ${baseInput}`}>
              <SelectValue placeholder="Seleziona un'opzione..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt} className="text-base py-3">{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'radio':
        return (
          <div className="space-y-2.5 mt-1">
            {(field.options || []).map(opt => {
              const selected = answers[field.id] === opt;
              return (
                <label
                  key={opt}
                  onClick={() => handleChange(field.id, opt)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    selected
                      ? 'border-[#6b7f6b] bg-[#6b7f6b]/8 text-[#4a5f4a]'
                      : hasError
                        ? 'border-red-200 bg-red-50 hover:border-red-300'
                        : 'border-gray-200 hover:border-[#6b7f6b]/50 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    selected ? 'border-[#6b7f6b] bg-[#6b7f6b]' : 'border-gray-300'
                  }`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <span className={`text-base font-medium ${selected ? 'text-[#4a5f4a]' : 'text-gray-700'}`}>{opt}</span>
                </label>
              );
            })}
          </div>
        );
      case 'checkbox':
        return (
          <div className="space-y-2.5 mt-1">
            {(field.options || []).map(opt => {
              const checked = Array.isArray(answers[field.id]) && answers[field.id].includes(opt);
              return (
                <label
                  key={opt}
                  onClick={() => handleCheckboxChange(field.id, opt, !checked)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    checked
                      ? 'border-[#6b7f6b] bg-[#6b7f6b]/8 text-[#4a5f4a]'
                      : hasError
                        ? 'border-red-200 bg-red-50 hover:border-red-300'
                        : 'border-gray-200 hover:border-[#6b7f6b]/50 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    checked ? 'border-[#6b7f6b] bg-[#6b7f6b]' : 'border-gray-300'
                  }`}>
                    {checked && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-base font-medium ${checked ? 'text-[#4a5f4a]' : 'text-gray-700'}`}>{opt}</span>
                </label>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#6b7f6b]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-16 w-16 mx-auto text-red-400" />
          <h1 className="text-2xl font-playfair text-gray-800">Modulo non trovato</h1>
          <p className="text-gray-600">Il link non è valido o il modulo è stato rimosso.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-[#6b7f6b]/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-14 w-14 text-[#6b7f6b]" />
            </div>
          </div>
          <h1 className="text-3xl font-playfair text-gray-800">Grazie!</h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Il tuo modulo è stato ricevuto correttamente.<br />
            Il fotografo lo consulterà prima del vostro evento.
          </p>
          <p className="text-sm text-gray-400 italic">Puoi chiudere questa pagina.</p>
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
        <p className="text-gray-500">Questo modulo non ha campi configurati.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex flex-col">
      {/* Top bar con logo e progresso */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#6b7f6b] rounded-full flex items-center justify-center">
                <ClipboardList className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
                {submission?.templateName}
              </span>
            </div>
            <span className="text-sm font-semibold text-[#6b7f6b]">
              {currentIndex + 1} / {total}
            </span>
          </div>
          {/* Barra di progresso */}
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6b7f6b] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl">
          {/* Saluto iniziale — solo sulla prima card */}
          {currentIndex === 0 && (
            <p className="text-center text-gray-500 text-sm mb-5">
              Ciao <strong className="text-gray-700">{submission?.clientName}</strong> 👋 — rispondi alle domande per aiutarci a prepararci al meglio
            </p>
          )}

          {/* Card domanda — touch: swipe sx=avanti, swipe dx=indietro */}
          <div
            ref={cardRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-8 transition-all duration-200 select-none ${
              animating
                ? direction === 'forward'
                  ? 'opacity-0 translate-x-4'
                  : 'opacity-0 -translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
            style={{ transform: animating ? undefined : 'translateX(0)' }}
          >
            {/* Numero domanda */}
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#6b7f6b]/10 text-[#6b7f6b] text-xs font-bold">
                {currentIndex + 1}
              </span>
              {current?.required && (
                <span className="text-xs text-gray-400 font-medium">Obbligatoria</span>
              )}
            </div>

            {/* Testo domanda */}
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-5 leading-snug">
              {current?.label}
              {current?.required && <span className="text-red-500 ml-1">*</span>}
            </h2>

            {/* Input */}
            {current && renderFieldInput(current)}

            {/* Errore campo */}
            {fieldError && (
              <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">{fieldError}</span>
              </div>
            )}
          </div>

          {isLast && hasEditorialFields && (
            <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editorialConsent}
                onChange={event => setEditorialConsent(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                <strong className="block text-gray-900">Consenso editoriale facoltativo</strong>
                Autorizzo lo studio a valutare le risposte indicate come editoriali per una possibile storia del matrimonio. La pubblicazione non è automatica e le altre risposte restano private.
              </span>
            </label>
          )}

          {/* Navigazione */}
          <div className="flex items-center justify-between mt-5 gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentIndex === 0 || animating}
              className="flex items-center gap-2 border-gray-300 text-gray-600 hover:border-gray-400 disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </Button>

            {isLast ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting || animating}
                className="flex-1 bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white h-11 text-base font-medium"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Invio...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Invia Modulo
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={animating}
                className="flex-1 bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white h-11 text-base font-medium"
              >
                Avanti
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Hint tasto Enter */}
          {current?.type !== 'textarea' && current?.type !== 'radio' && current?.type !== 'checkbox' && (
            <p className="text-center text-xs text-gray-400 mt-3">
              Premi <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-500 font-mono">Enter</kbd> per continuare
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center">
        <p className="text-xs text-gray-400">
          I tuoi dati sono utilizzati esclusivamente per organizzare il tuo evento fotografico.
        </p>
      </div>
    </div>
  );
}
