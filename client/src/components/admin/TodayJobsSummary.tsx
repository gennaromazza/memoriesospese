import { useQuery } from '@tanstack/react-query';
import { format, isToday, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Link } from 'wouter';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  User,
  ExternalLink,
  Briefcase,
  ChevronRight,
  Home
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getAllJobs } from '@/lib/jobs';
import type { Job } from '@shared/jobs-types';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { useState, useEffect } from 'react';

function parseEventDate(eventDate: any): Date | null {
  if (!eventDate) return null;
  try {
    if (eventDate instanceof Date) return eventDate;
    if (eventDate instanceof Timestamp) return eventDate.toDate();
    if (typeof eventDate === 'string') return new Date(eventDate);
    if (typeof eventDate?.toDate === 'function') return eventDate.toDate();
    if (typeof eventDate?.seconds === 'number') {
      return new Timestamp(eventDate.seconds, eventDate.nanoseconds || 0).toDate();
    }
    return new Date(eventDate);
  } catch {
    return null;
  }
}

interface ClienteInfo {
  id: string;
  nome?: string;
  cognome?: string;
  email?: string;
  telefono?: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
}

interface CollaboratoreInfo {
  id: string;
  nome: string;
  email?: string;
  telefono?: string;
}

interface JobWithDetails extends Job {
  clientiDetails?: ClienteInfo[];
  collaboratoriDetails?: CollaboratoreInfo[];
}

function generateMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function normalizePhone(phone: string | undefined): string {
  if (!phone) return '';
  return phone.replace(/\s+/g, '').replace(/^(\+39)?/, '+39');
}

export default function TodayJobsSummary({ selectedDate }: { selectedDate?: Date }) {
  const targetDate = selectedDate || new Date();
  const [jobsWithDetails, setJobsWithDetails] = useState<JobWithDetails[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const { data: allJobs, isLoading: isLoadingJobs } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: () => getAllJobs(),
  });

  const todayJobs = (allJobs || []).filter((job: Job) => {
    if (!job.eventDate) return false;
    const eventDate = parseEventDate(job.eventDate);
    if (!eventDate) return false;
    return isSameDay(eventDate, targetDate);
  });

  useEffect(() => {
    async function fetchDetails() {
      if (todayJobs.length === 0) {
        setJobsWithDetails([]);
        return;
      }

      setIsLoadingDetails(true);
      
      const enrichedJobs = await Promise.all(
        todayJobs.map(async (job) => {
          const clientiDetails: ClienteInfo[] = [];
          const collaboratoriDetails: CollaboratoreInfo[] = [];

          if (job.clientiIds && job.clientiIds.length > 0) {
            for (const clienteId of job.clientiIds) {
              try {
                const clienteDoc = await getDoc(doc(db, 'clienti', clienteId));
                if (clienteDoc.exists()) {
                  const data = clienteDoc.data();
                  clientiDetails.push({
                    id: clienteId,
                    nome: data.nome,
                    cognome: data.cognome,
                    email: data.email,
                    telefono: data.cellulare1 || data.cellulare2,
                    indirizzo: data.via,
                    citta: data.citta,
                    cap: data.cap,
                  });
                }
              } catch (err) {
                console.warn('Errore fetch cliente:', clienteId, err);
              }
            }
          }

          const jobAny = job as any;
          if (jobAny.collaboratoriAssegnati && jobAny.collaboratoriAssegnati.length > 0) {
            for (const collab of jobAny.collaboratoriAssegnati) {
              if (collab.status === 'accettato') {
                try {
                  const collabDoc = await getDoc(doc(db, 'collaboratori', collab.collaboratoreId));
                  if (collabDoc.exists()) {
                    const data = collabDoc.data();
                    collaboratoriDetails.push({
                      id: collab.collaboratoreId,
                      nome: data.nome || data.email,
                      email: data.email,
                      telefono: data.telefono,
                    });
                  }
                } catch (err) {
                  console.warn('Errore fetch collaboratore:', collab.collaboratoreId, err);
                }
              }
            }
          }

          return {
            ...job,
            clientiDetails,
            collaboratoriDetails,
          };
        })
      );

      setJobsWithDetails(enrichedJobs);
      setIsLoadingDetails(false);
    }

    fetchDetails();
  }, [JSON.stringify(todayJobs.map(j => j.id))]);

  if (isLoadingJobs) {
    return (
      <Card className="border-sage/30 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (todayJobs.length === 0) {
    return (
      <Card className="border-sage/30 bg-gradient-to-br from-gray-50 to-slate-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-600">
            <Calendar className="h-5 w-5" />
            {isToday(targetDate) ? 'Nessun lavoro oggi' : `Nessun lavoro il ${format(targetDate, 'd MMMM', { locale: it })}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isToday(targetDate) 
              ? 'Non ci sono lavori programmati per oggi.' 
              : 'Non ci sono lavori programmati per questa data.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-sage/30 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <Briefcase className="h-5 w-5" />
          {isToday(targetDate) ? (
            <>Lavori di Oggi - {format(targetDate, 'd MMMM yyyy', { locale: it })}</>
          ) : (
            <>Lavori del {format(targetDate, 'd MMMM yyyy', { locale: it })}</>
          )}
          <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800">
            {todayJobs.length} {todayJobs.length === 1 ? 'lavoro' : 'lavori'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(isLoadingDetails ? todayJobs : jobsWithDetails).map((job) => {
          const eventDate = parseEventDate(job.eventDate) || new Date();

          return (
            <div 
              key={job.id} 
              className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`today-job-card-${job.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-gray text-lg">{job.nomeEvento}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    {job.jobType && (
                      <Badge variant="outline" className="text-xs">
                        {job.jobType}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(eventDate, 'd MMM yyyy', { locale: it })}
                    </span>
                  </div>
                </div>
                <Link href={`/admin/jobs/${job.id}`}>
                  <Button size="sm" variant="outline" className="gap-1" data-testid={`btn-view-job-${job.id}`}>
                    Dettagli
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Location Evento */}
                {job.eventLocation && (
                  <a
                    href={generateMapsUrl(job.eventLocation)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2 rounded-lg bg-sage/10 hover:bg-sage/20 transition-colors group"
                    data-testid={`link-event-location-${job.id}`}
                  >
                    <MapPin className="h-4 w-4 text-sage mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-sage font-medium flex items-center gap-1">
                        Location Evento
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </p>
                      <p className="text-sm text-blue-gray truncate">{job.eventLocation}</p>
                    </div>
                  </a>
                )}

                {/* Location Rito */}
                {job.rituLocation && (
                  <a
                    href={generateMapsUrl(job.rituLocation)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2 rounded-lg bg-terracotta/10 hover:bg-terracotta/20 transition-colors group"
                    data-testid={`link-rito-location-${job.id}`}
                  >
                    <MapPin className="h-4 w-4 text-terracotta mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-terracotta font-medium flex items-center gap-1">
                        Luogo Cerimonia
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </p>
                      <p className="text-sm text-blue-gray truncate">{job.rituLocation}</p>
                    </div>
                  </a>
                )}

                {/* Orario Rito */}
                {job.rituTime && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50">
                    <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-blue-600 font-medium">Orario Cerimonia</p>
                      <p className="text-sm text-blue-gray font-semibold">{job.rituTime}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Clienti */}
              {(job as JobWithDetails).clientiDetails && (job as JobWithDetails).clientiDetails!.length > 0 && (
                <div className="mt-4 pt-3 border-t border-amber-100">
                  <p className="text-xs text-sage font-semibold uppercase mb-2 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Clienti
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(job as JobWithDetails).clientiDetails!.map((cliente) => (
                      <div 
                        key={cliente.id} 
                        className="bg-mint/10 rounded-lg p-3 space-y-2"
                        data-testid={`cliente-card-${cliente.id}`}
                      >
                        <p className="font-medium text-blue-gray">
                          {cliente.nome} {cliente.cognome}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {cliente.telefono && (
                            <a
                              href={`tel:${normalizePhone(cliente.telefono)}`}
                              className="inline-flex items-center gap-1 text-xs bg-white px-2 py-1 rounded-full text-sage hover:bg-sage hover:text-white transition-colors"
                              data-testid={`link-phone-${cliente.id}`}
                            >
                              <Phone className="h-3 w-3" />
                              {cliente.telefono}
                            </a>
                          )}
                          {cliente.email && (
                            <a
                              href={`mailto:${cliente.email}`}
                              className="inline-flex items-center gap-1 text-xs bg-white px-2 py-1 rounded-full text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                              data-testid={`link-email-${cliente.id}`}
                            >
                              <Mail className="h-3 w-3" />
                              Email
                            </a>
                          )}
                        </div>
                        {(cliente.indirizzo || cliente.citta) && (
                          <a
                            href={generateMapsUrl([cliente.indirizzo, cliente.cap, cliente.citta].filter(Boolean).join(', '))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1 text-xs text-muted-foreground hover:text-sage transition-colors group"
                            data-testid={`link-address-${cliente.id}`}
                          >
                            <Home className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="group-hover:underline">
                              {[cliente.indirizzo, cliente.cap, cliente.citta].filter(Boolean).join(', ')}
                            </span>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collaboratori Assegnati */}
              {(job as JobWithDetails).collaboratoriDetails && (job as JobWithDetails).collaboratoriDetails!.length > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-100">
                  <p className="text-xs text-sage font-semibold uppercase mb-2 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Collaboratori Assegnati
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(job as JobWithDetails).collaboratoriDetails!.map((collab) => (
                      <div 
                        key={collab.id}
                        className="inline-flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-full text-sm"
                        data-testid={`collaboratore-badge-${collab.id}`}
                      >
                        <span className="font-medium text-purple-800">{collab.nome}</span>
                        {collab.telefono && (
                          <a
                            href={`tel:${normalizePhone(collab.telefono)}`}
                            className="text-purple-600 hover:text-purple-800"
                            data-testid={`link-collab-phone-${collab.id}`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
