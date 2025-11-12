/**
 * CONSULTATION BOOKING PAGE
 * Form multi-step per prenotazione consulenza
 * Step 1: Seleziona data + slot
 * Step 2: Dati cliente
 * Step 3: Dati job dinamici (opzionali)
 */

import { useState } from 'react';
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

export default function ConsultationBooking() {
  const params = useParams<{ tipo: string; id: string }>();
  const jobType = params.tipo ? decodeURIComponent(params.tipo) : '';
  const templateId = params.id || '';
  
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
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

  const handleDateSelect = async (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    
    if (date && templateId) {
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
    }
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !template) return;

    try {
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

  if (isLoadingTemplate) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Template non trovato
            </p>
            <Link href="/consulenze">
              <Button variant="outline" data-testid="button-back-empty">
                Torna alle Consulenze
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-sage-50 to-white dark:from-gray-900 dark:to-gray-800">
        <Card className="max-w-lg">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl text-gray-900 dark:text-white">
              Prenotazione Completata!
            </CardTitle>
            <CardDescription>
              Riceverai una conferma via email appena la tua richiesta sarà approvata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-sage-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Tipo:</span>
                <span className="font-medium text-gray-900 dark:text-white">{template?.nome}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Data:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {selectedSlot && format(selectedSlot.start, "d MMMM yyyy 'alle' HH:mm", { locale: it })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Durata:</span>
                <span className="font-medium text-gray-900 dark:text-white">{template?.durataMinuti} min</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/consulenze" className="w-full">
              <Button className="w-full bg-sage-600 hover:bg-sage-700">
                Torna alle Consulenze
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white dark:from-gray-900 dark:to-gray-800 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href={`/consulenze/${encodeURIComponent(jobType)}`}>
            <Button variant="ghost" className="text-sage-600 dark:text-sage-400" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna ai Template
            </Button>
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-colors ${
                  step === s
                    ? 'bg-sage-600 text-white'
                    : step > s
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`w-12 h-1 mx-1 rounded transition-colors ${
                    step > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-2 text-sm text-gray-600 dark:text-gray-400">
            {step === 1 && 'Seleziona Data e Orario'}
            {step === 2 && 'Dati di Contatto'}
            {step === 3 && 'Informazioni Aggiuntive'}
          </div>
        </div>

        {/* Template Info */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Badge className="mb-2">{jobType}</Badge>
                <CardTitle>{template?.nome || 'Template'}</CardTitle>
                {template?.descrizione && (
                  <CardDescription>{template.descrizione}</CardDescription>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  <span>{template?.durataMinuti || 0} min</span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {/* Step 1: Date & Slot Selection */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-4 block">Seleziona una Data</Label>
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date()}
                      locale={it}
                      className="rounded-md border"
                    />
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <Label className="text-base font-semibold mb-3 block">
                      Slot Disponibili - {format(selectedDate, "d MMMM yyyy", { locale: it })}
                    </Label>
                    {availableSlotsMutation.isPending && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
                      </div>
                    )}
                    {availableSlotsMutation.data && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {availableSlotsMutation.data.slots.length === 0 ? (
                          <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                            Nessuno slot disponibile per questa data
                          </div>
                        ) : (
                          availableSlotsMutation.data.slots.map((slot: any, idx: number) => {
                            const slotStart = new Date(slot.start);
                            const slotEnd = new Date(slot.end);
                            const isSelected = selectedSlot?.start.getTime() === slotStart.getTime();
                            
                            return (
                              <Button
                                key={idx}
                                variant={isSelected ? "default" : "outline"}
                                onClick={() => setSelectedSlot({ start: slotStart, end: slotEnd })}
                                className={isSelected ? "bg-sage-600 hover:bg-sage-700" : ""}
                                data-testid={`button-slot-${idx}`}
                              >
                                <Clock className="h-4 w-4 mr-2" />
                                {format(slotStart, "HH:mm")}
                              </Button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Client Data */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      value={clienteData.nome}
                      onChange={(e) => setClienteData({ ...clienteData, nome: e.target.value })}
                      placeholder="Mario"
                      data-testid="input-nome"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cognome">Cognome *</Label>
                    <Input
                      id="cognome"
                      value={clienteData.cognome}
                      onChange={(e) => setClienteData({ ...clienteData, cognome: e.target.value })}
                      placeholder="Rossi"
                      data-testid="input-cognome"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={clienteData.email}
                    onChange={(e) => setClienteData({ ...clienteData, email: e.target.value })}
                    placeholder="mario.rossi@example.com"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label htmlFor="whatsapp">WhatsApp (opzionale)</Label>
                  <Input
                    id="whatsapp"
                    value={clienteData.whatsapp}
                    onChange={(e) => setClienteData({ ...clienteData, whatsapp: e.target.value })}
                    placeholder="+39 333 1234567"
                    data-testid="input-whatsapp"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Job Data Fields */}
            {step === 3 && (
              <div className="space-y-4">
                {!template?.jobDataFields || template.jobDataFields.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p>Nessuna informazione aggiuntiva richiesta</p>
                    <p className="text-sm mt-2">Puoi procedere con la conferma della prenotazione</p>
                  </div>
                ) : (
                  template.jobDataFields.map((field) => (
                    <div key={field.fieldKey}>
                      <Label htmlFor={field.fieldKey}>
                        {field.label} {field.required && '*'}
                      </Label>
                      {field.type === 'text' && (
                        <Input
                          id={field.fieldKey}
                          value={(jobData[field.fieldKey] as string) || ''}
                          onChange={(e) => setJobData({ ...jobData, [field.fieldKey]: e.target.value })}
                          placeholder={field.placeholder}
                          required={field.required}
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
                          data-testid={`input-${field.fieldKey}`}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1) as 1 | 2 | 3)}
              disabled={step === 1}
              data-testid="button-prev-step"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Indietro
            </Button>
            
            {step < 3 ? (
              <Button
                onClick={() => setStep(Math.min(3, step + 1) as 1 | 2 | 3)}
                disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
                className="bg-sage-600 hover:bg-sage-700"
                data-testid="button-next-step"
              >
                Avanti
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createConsultationMutation.isPending || !canProceedStep3()}
                className="bg-sage-600 hover:bg-sage-700"
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
    </div>
  );
}
