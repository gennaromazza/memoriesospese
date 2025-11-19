/**
 * CONSULTATION BOOKING PAGE
 * Form multi-step per prenotazione consulenza
 * Step 1: Seleziona data + slot
 * Step 2: Dati cliente
 * Step 3: Dati job dinamici (opzionali)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { useTemplate, useAvailableSlots, useCreateConsultation } from '@/lib/consultations';
import { useParams, Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import type { ConsultationJobFieldValue } from '@shared/consultation-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStudio } from '@/context/StudioContext';
import Navigation from '@/components/Navigation';

export default function ConsultationBooking() {
  const params = useParams<{ tipo: string; id: string }>();
  const jobType = params.tipo ? decodeURIComponent(params.tipo) : '';
  const templateId = params.id || '';

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { studioSettings } = useStudio();

  const { data: template, isLoading: isLoadingTemplate } = useTemplate(templateId);
  const availableSlotsMutation = useAvailableSlots();
  const createConsultationMutation = useCreateConsultation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [clienteData, setClienteData] = useState({
    nome: '',
    cognome: '',
    email: '',
    whatsapp: ''
  });
  const [jobData, setJobData] = useState<Record<string, ConsultationJobFieldValue>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  // Debounce timer per evitare chiamate API troppo frequenti
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (date && templateId) {
      // Debounce 300ms: aspetta che l'utente finisca di navigare il calendario
      debounceTimerRef.current = setTimeout(() => {
        const dateStr = format(date, 'yyyy-MM-dd');
        availableSlotsMutation.mutate(
          { templateId, date: dateStr },
          {
            onError: (error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : 'Impossibile caricare slot disponibili';
              toast({
                variant: 'destructive',
                title: 'Errore',
                description: errorMessage
              });
            }
          }
        );
      }, 300);
    }
  }, [templateId, availableSlotsMutation, toast]);

  const handleSubmit = async () => {
    if (!selectedSlot || !template || !selectedDate) return;

    try {
      // 🔄 STEP 1: Refetch degli slot disponibili per verificare che lo slot sia ancora libero
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const refreshedSlots = await availableSlotsMutation.mutateAsync({
        templateId: template.id,
        date: dateStr
      });

      // 🔍 STEP 2: Verifica che lo slot selezionato sia ancora disponibile E libero
      const slotStillAvailable = refreshedSlots.slots?.some((slot: any) => {
        const slotStart = new Date(slot.start);
        return slotStart.getTime() === selectedSlot.start.getTime() && slot.available !== false;
      });

      if (!slotStillAvailable) {
        toast({
          variant: 'destructive',
          title: 'Slot non più disponibile',
          description: 'Lo slot selezionato è stato prenotato da poco o è occupato su Google Calendar. Scegli un altro orario.',
        });
        // Reset slot selezionato e riporta l'utente allo step 1 per sceglierne un altro
        setSelectedSlot(null);
        setStep(1);
        return;
      }

      // ✅ STEP 3: Slot ancora disponibile → procedi con la prenotazione
      const consultationData = {
        templateId: template.id,
        cliente: {
          nome: clienteData.nome,
          cognome: clienteData.cognome,
          email: clienteData.email,
          whatsapp: clienteData.whatsapp
        },
        dataConsulenza: selectedSlot.start.toISOString(),
        orarioInizio: format(selectedSlot.start, 'HH:mm'),
        orarioFine: format(selectedSlot.end, 'HH:mm'),
        jobDataCollected: jobData,
        note: ''
      };

      await createConsultationMutation.mutateAsync(consultationData);
      setShowSuccess(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Impossibile completare la prenotazione';
      toast({
        variant: 'destructive',
        title: 'Errore prenotazione',
        description: errorMessage
      });
    }
  };

  const canProceedStep1 = selectedSlot !== null;
  const canProceedStep2 = clienteData.nome && clienteData.cognome && clienteData.email;

  const canProceedStep3 = () => {
    if (!template?.jobDataFields) return true;

    for (const field of template.jobDataFields) {
      if (field.required && !jobData[field.fieldKey]) {
        return false;
      }
    }
    return true;
  };

  // Nota: L'auto-clear dello slot è gestito dalla validazione submit-time per evitare toast ripetitivi

  if (isLoadingTemplate) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-off-white">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-off-white">
        <Card className="max-w-md border-beige">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">
              Template non trovato
            </p>
            <Link href="/consulenze">
              <Button variant="outline" className="border-sage text-sage hover:bg-sage hover:text-white" data-testid="button-back-empty">
                Torna alle Richieste
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-off-white to-white">
        <Card className="max-w-lg w-full border-beige">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-playfair text-blue-gray">
              Prenotazione Completata!
            </CardTitle>
            <CardDescription>
              Riceverai una conferma via email appena la tua richiesta sarà approvata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-sage/5 rounded-lg p-4 space-y-2 border border-sage/20">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tipo:</span>
                <span className="font-medium text-blue-gray">{template?.nome}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Data:</span>
                <span className="font-medium text-blue-gray">
                  {selectedSlot && format(selectedSlot.start, "d MMMM yyyy 'alle' HH:mm", { locale: it })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Durata:</span>
                <span className="font-medium text-blue-gray">{template?.durataMinuti} min</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/consulenze" className="w-full">
              <Button className="w-full bg-sage hover:bg-dark-sage text-white">
                Torna alle Richieste
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-off-white to-white">
      <Navigation />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl py-6 sm:py-8">
        {/* Breadcrumb */}
        <div className="mb-4 sm:mb-6">
          <Link href={`/consulenze/${encodeURIComponent(jobType)}`}>
            <Button variant="ghost" className="text-sage hover:text-dark-sage hover:bg-sage/10 -ml-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna ai Template
            </Button>
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-semibold text-sm sm:text-base transition-colors ${
                  step === s
                    ? 'bg-sage text-white'
                    : step > s
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`w-8 sm:w-12 h-1 mx-0.5 sm:mx-1 rounded transition-colors ${
                    step > s ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-2 text-xs sm:text-sm text-gray-600">
            {step === 1 && 'Seleziona Data e Orario'}
            {step === 2 && 'Dati di Contatto'}
            {step === 3 && 'Informazioni Aggiuntive'}
          </div>
        </div>

        {/* Template Info */}
        <Card className="mb-4 sm:mb-6 border-beige">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <Badge className="mb-2 bg-sage/10 text-sage border-sage">{jobType}</Badge>
                <CardTitle className="text-xl sm:text-2xl font-playfair text-blue-gray">{template?.nome || 'Template'}</CardTitle>
                {template?.descrizione && (
                  <CardDescription className="mt-1 text-sm">{template.descrizione}</CardDescription>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-600 self-start sm:self-auto">
                <Clock className="h-4 w-4 text-sage" />
                <span>{template?.durataMinuti || 0} min</span>
              </div>
            </div>
          </CardHeader>
          {template?.imageUrls && template.imageUrls.length > 0 && (
            <CardContent className="pt-0 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {template.imageUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="aspect-[4/3] rounded-lg overflow-hidden border border-beige bg-gray-50"
                    data-testid={`img-template-${idx}`}
                  >
                    <img
                      src={url}
                      alt={`${template.nome} - immagine ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Step Content */}
        <Card className="border-beige">
          <CardContent className="pt-4 sm:pt-6">
            {/* Step 1: Date & Slot Selection */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-4 block text-blue-gray">Seleziona una Data</Label>
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => {
                        // Blocca date passate
                        if (date < new Date()) return true;
                        
                        // Blocca giorni esclusi dal template (es. sabato/domenica)
                        const dayOfWeek = date.getDay(); // 0=domenica, 1=lunedì, ..., 6=sabato
                        return template?.excludedDays?.includes(dayOfWeek) || false;
                      }}
                      locale={it}
                      className="rounded-md border border-beige"
                    />
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <Label className="text-base font-semibold mb-3 block text-blue-gray">
                      Slot Disponibili - {format(selectedDate, "d MMMM yyyy", { locale: it })}
                    </Label>
                    {availableSlotsMutation.isPending && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-sage" />
                      </div>
                    )}
                    {availableSlotsMutation.isError && (
                      <div className="col-span-full text-center py-8 text-red-600">
                        <p className="font-medium">Errore nel caricamento degli slot</p>
                        <p className="text-sm mt-2">Impossibile verificare la disponibilità per questa data</p>
                      </div>
                    )}
                    {availableSlotsMutation.data && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {(() => {
                          const availableSlots = availableSlotsMutation.data.slots?.filter((slot: any) => slot.available !== false) || [];
                          
                          if (availableSlots.length === 0) {
                            return (
                              <div className="col-span-full text-center py-8 text-gray-500">
                                Nessuno slot disponibile per questa data
                              </div>
                            );
                          }
                          
                          return availableSlots.map((slot: any, idx: number) => {
                            const slotStart = new Date(slot.start);
                            const slotEnd = new Date(slot.end);
                            const isSelected = selectedSlot?.start.getTime() === slotStart.getTime();

                            return (
                              <Button
                                key={idx}
                                variant={isSelected ? "default" : "outline"}
                                onClick={() => setSelectedSlot({ start: slotStart, end: slotEnd })}
                                className={`text-sm ${isSelected ? "bg-sage hover:bg-dark-sage text-white" : "border-sage text-sage hover:bg-sage hover:text-white"}`}
                                data-testid={`button-slot-${idx}`}
                              >
                                <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                {format(slotStart, "HH:mm")}
                              </Button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Client Data */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nome" className="text-blue-gray">Nome *</Label>
                    <Input
                      id="nome"
                      value={clienteData.nome}
                      onChange={(e) => setClienteData({ ...clienteData, nome: e.target.value })}
                      placeholder="Mario"
                      className="border-beige focus:border-sage"
                      data-testid="input-nome"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cognome" className="text-blue-gray">Cognome *</Label>
                    <Input
                      id="cognome"
                      value={clienteData.cognome}
                      onChange={(e) => setClienteData({ ...clienteData, cognome: e.target.value })}
                      placeholder="Rossi"
                      className="border-beige focus:border-sage"
                      data-testid="input-cognome"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email" className="text-blue-gray">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={clienteData.email}
                    onChange={(e) => setClienteData({ ...clienteData, email: e.target.value })}
                    placeholder="mario.rossi@example.com"
                    className="border-beige focus:border-sage"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label htmlFor="whatsapp" className="text-blue-gray">WhatsApp (opzionale)</Label>
                  <Input
                    id="whatsapp"
                    value={clienteData.whatsapp}
                    onChange={(e) => setClienteData({ ...clienteData, whatsapp: e.target.value })}
                    placeholder="+39 333 1234567"
                    className="border-beige focus:border-sage"
                    data-testid="input-whatsapp"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Job Data Fields */}
            {step === 3 && (
              <div className="space-y-4">
                {!template?.jobDataFields || template.jobDataFields.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Nessuna informazione aggiuntiva richiesta</p>
                    <p className="text-sm mt-2">Puoi procedere con la conferma della prenotazione</p>
                  </div>
                ) : (
                  template.jobDataFields.map((field) => (
                    <div key={field.fieldKey}>
                      <Label htmlFor={field.fieldKey} className="text-blue-gray">
                        {field.label} {field.required && '*'}
                      </Label>
                      {field.type === 'text' && (
                        <Input
                          id={field.fieldKey}
                          value={(jobData[field.fieldKey] as string) || ''}
                          onChange={(e) => setJobData({ ...jobData, [field.fieldKey]: e.target.value })}
                          placeholder={field.placeholder}
                          required={field.required}
                          className="border-beige focus:border-sage"
                          data-testid={`input-${field.fieldKey}`}
                        />
                      )}
                      {field.type === 'textarea' && (
                        <Textarea
                          id={field.fieldKey}
                          value={(jobData[field.fieldKey] as string) || ''}
                          onChange={(e) => setJobData({ ...jobData, [field.fieldKey]: e.target.value })}
                          placeholder={field.placeholder}
                          required={field.required}
                          rows={'rows' in field ? field.rows : 3}
                          className="border-beige focus:border-sage"
                          data-testid={`textarea-${field.fieldKey}`}
                        />
                      )}
                      {field.type === 'number' && (
                        <Input
                          id={field.fieldKey}
                          type="number"
                          value={(jobData[field.fieldKey] as number) || ''}
                          onChange={(e) => setJobData({ ...jobData, [field.fieldKey]: Number(e.target.value) })}
                          placeholder={field.placeholder}
                          required={field.required}
                          min={'min' in field ? field.min : undefined}
                          max={'max' in field ? field.max : undefined}
                          className="border-beige focus:border-sage"
                          data-testid={`input-${field.fieldKey}`}
                        />
                      )}
                      {field.type === 'date' && (
                        <Input
                          id={field.fieldKey}
                          type="date"
                          value={(jobData[field.fieldKey] as string) || ''}
                          onChange={(e) => setJobData({ ...jobData, [field.fieldKey]: e.target.value })}
                          required={field.required}
                          className="border-beige focus:border-sage"
                          data-testid={`input-${field.fieldKey}`}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 pt-4 sm:pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1) as 1 | 2 | 3)}
              disabled={step === 1}
              className="w-full sm:w-auto border-beige text-blue-gray hover:bg-gray-50"
              data-testid="button-prev-step"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Indietro
            </Button>

            {step < 3 ? (
              <Button
                onClick={() => setStep(Math.min(3, step + 1) as 1 | 2 | 3)}
                disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
                className="w-full sm:w-auto bg-sage hover:bg-dark-sage text-white"
                data-testid="button-next-step"
              >
                Avanti
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createConsultationMutation.isPending || !canProceedStep3()}
                className="w-full sm:w-auto bg-sage hover:bg-dark-sage text-white"
                data-testid="button-confirm-booking"
              >
                {createConsultationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Prenotazione...
                  </>
                ) : (
                  <>
                    Conferma Prenotazione
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md border-beige">
          <DialogHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <DialogTitle className="text-2xl font-playfair text-blue-gray">
              Prenotazione Completata!
            </DialogTitle>
            <DialogDescription className="text-center space-y-4">
              <p className="text-lg">
                La tua richiesta è stata inviata con successo per il{' '}
                <span className="font-semibold text-sage">
                  {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: it })}
                </span>
                {' '}alle{' '}
                <span className="font-semibold text-sage">
                  {selectedSlot && `${format(selectedSlot.start, "HH:mm")} - ${format(selectedSlot.end, "HH:mm")}`}
                </span>
              </p>
              <p className="text-gray-600">
                Riceverai a breve una email di conferma con tutti i dettagli.
              </p>

              {/* Instagram CTA */}
              {studioSettings?.socialLinks?.instagram && (
                <div className="mt-6 pt-6 border-t border-beige/30">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-4">
                      Seguici su Instagram per scoprire i nostri lavori e rimanere aggiornato!
                    </p>
                    <a
                      href={(() => {
                        const normalized = studioSettings.socialLinks.instagram
                          .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
                          .replace(/^@/, '')
                          .replace(/\/$/, '')
                          .replace(/[?#].*$/, '');
                        // Fallback to original URL if normalized handle is empty
                        return normalized 
                          ? `https://www.instagram.com/${normalized}`
                          : (studioSettings.socialLinks.instagram.startsWith('http') 
                              ? studioSettings.socialLinks.instagram 
                              : `https://www.instagram.com/${studioSettings.socialLinks.instagram}`);
                      })()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg duration-300"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M7.5 2h9a5.5 5.5 0 0 1 5.5 5.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2z" />
                        <circle cx="12" cy="12" r="3.2" />
                        <circle cx="17" cy="7" r="0.9" />
                      </svg>
                      Seguici su Instagram
                    </a>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-3 mt-4">
            <Link href="/consulenze">
              <Button variant="outline" className="border-sage text-sage hover:bg-sage/10">
                Torna ai Servizi
              </Button>
            </Link>
            <Link href="/">
              <Button className="bg-sage hover:bg-dark-sage text-white">
                Torna alla Home
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}