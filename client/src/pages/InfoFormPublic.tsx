/**
 * Pagina pubblica per la compilazione di un Modulo Informativo
 * Accessibile tramite link con token univoco: /modulo/:token
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, ClipboardList, AlertCircle, AlertTriangle } from 'lucide-react';
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const errorBannerRef = useRef<HTMLDivElement>(null);

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
          else initial[f.id] = '';
        });
        setAnswers(initial);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) setErrors(prev => { const e = { ...prev }; delete e[fieldId]; return e; });
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    setAnswers(prev => {
      const current: string[] = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
      if (checked) return { ...prev, [fieldId]: [...current, option] };
      return { ...prev, [fieldId]: current.filter(v => v !== option) };
    });
    if (errors[fieldId]) setErrors(prev => { const e = { ...prev }; delete e[fieldId]; return e; });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    submission?.templateFields?.forEach(field => {
      if (!field.required) return;
      const val = answers[field.id];
      if (field.type === 'checkbox') {
        if (!Array.isArray(val) || val.length === 0) newErrors[field.id] = 'Seleziona almeno un\'opzione';
      } else {
        if (!val || String(val).trim() === '') newErrors[field.id] = 'Campo obbligatorio';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!submission || !validate()) {
      setTimeout(() => {
        errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const firstErrorField = submission?.templateFields?.find(f => {
          const val = answers[f.id];
          if (!f.required) return false;
          if (f.type === 'checkbox') return !Array.isArray(val) || val.length === 0;
          return !val || String(val).trim() === '';
        });
        if (firstErrorField) {
          fieldRefs.current[firstErrorField.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }
    setSubmitting(true);
    try {
      await submitInfoForm(submission.id, token, answers);
      try {
        await apiRequest('POST', '/api/email/send-info-form-submitted', { token });
      } catch (_) { }
      setSubmitted(true);
    } catch (err: any) {
      alert(err.message || 'Errore durante l\'invio. Riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  const errorCount = Object.keys(errors).length;

  const renderField = (field: InfoFormField) => {
    const hasError = !!errors[field.id];

    const inputClass = hasError
      ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-300'
      : '';

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className={inputClass}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            rows={4}
            className={inputClass}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={answers[field.id] || ''}
            onChange={e => handleChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className={inputClass}
          />
        );
      case 'select':
        return (
          <Select value={answers[field.id] || ''} onValueChange={v => handleChange(field.id, v)}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder="Seleziona un'opzione..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'radio':
        return (
          <div className={`space-y-2 rounded-lg p-3 transition-colors ${hasError ? 'bg-red-50 border border-red-200' : 'border border-transparent'}`}>
            {(field.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={answers[field.id] === opt}
                  onChange={() => handleChange(field.id, opt)}
                  className="h-4 w-4 text-[#6b7f6b] border-gray-300 focus:ring-[#6b7f6b]"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div className={`space-y-2 rounded-lg p-3 transition-colors ${hasError ? 'bg-red-50 border border-red-200' : 'border border-transparent'}`}>
            {(field.options || []).map(opt => {
              const checked = Array.isArray(answers[field.id]) && answers[field.id].includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => handleCheckboxChange(field.id, opt, e.target.checked)}
                    className="h-4 w-4 text-[#6b7f6b] border-gray-300 rounded focus:ring-[#6b7f6b]"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
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
          <CheckCircle2 className="h-20 w-20 mx-auto text-[#6b7f6b]" />
          <h1 className="text-3xl font-playfair text-gray-800">Grazie!</h1>
          <p className="text-gray-600 text-lg">
            Il tuo modulo è stato ricevuto correttamente. Il fotografo lo consulterà prima del vostro evento.
          </p>
          <p className="text-sm text-gray-500 italic">Puoi chiudere questa pagina.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-[#6b7f6b] rounded-full flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-playfair text-gray-800 mb-2">
            {submission?.templateName}
          </h1>
          <p className="text-gray-600">
            Ciao <strong>{submission?.clientName}</strong>, compila questo modulo per aiutarci a prepararci al meglio per il tuo evento.
          </p>
        </div>

        {/* Banner errori — appare solo dopo aver premuto Invia con campi mancanti */}
        {submitAttempted && errorCount > 0 && (
          <div
            ref={errorBannerRef}
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {errorCount === 1
                  ? 'C\'è 1 campo obbligatorio da compilare'
                  : `Ci sono ${errorCount} campi obbligatori da compilare`}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Scorri la pagina, i campi mancanti sono evidenziati in rosso.
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          {submission?.templateFields?.map((field, index) => {
            const hasError = !!errors[field.id];
            return (
              <div
                key={field.id}
                ref={el => { fieldRefs.current[field.id] = el; }}
                className={`space-y-2 rounded-xl px-4 py-3 transition-colors ${
                  hasError
                    ? 'bg-red-50 border border-red-200 -mx-2'
                    : 'border border-transparent'
                }`}
              >
                <Label className={`text-sm font-semibold flex items-center gap-1 ${hasError ? 'text-red-700' : 'text-gray-700'}`}>
                  <span className={`font-bold text-xs mr-1 ${hasError ? 'text-red-500' : 'text-[#6b7f6b]'}`}>{index + 1}.</span>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderField(field)}
                {hasError && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-600">{errors[field.id]}</p>
                  </div>
                )}
              </div>
            );
          })}

          {(!submission?.templateFields || submission.templateFields.length === 0) && (
            <p className="text-center text-gray-500 py-8">Questo modulo non ha campi configurati.</p>
          )}

          <div className="pt-4 border-t">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white h-12 text-base"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Invio in corso...
                </>
              ) : (
                'Invia Modulo'
              )}
            </Button>
            <p className="text-xs text-gray-400 text-center mt-3">
              I tuoi dati verranno utilizzati esclusivamente per organizzare il tuo evento fotografico.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
