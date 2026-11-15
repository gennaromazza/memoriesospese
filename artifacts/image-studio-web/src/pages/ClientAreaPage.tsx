import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import {
  BookOpen, Calendar, CalendarDays, Camera, Check, CheckCircle2, Circle, Copy, Download, FileSignature,
  Images, Landmark, Loader2, LogOut, Mail, MapPin, MessageSquareText, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useStudio } from '@/context/StudioContext';
import { createUrl } from '@/lib/config';
import {
  ClientAreaSessionError, fetchClientAreaOverview, logoutClientArea, openOwnedGallery,
  requestLoginCode, verifyLoginCode, watchClientAreaUser,
} from '@/lib/client-area-session';
import {
  causaleFor, type ClientAreaBankDetails, type ClientAreaBooking, type ClientAreaGallery, type ClientAreaJob,
  type ClientAreaOverview, type ClientAreaPaymentPlan,
} from '@shared/client-area';

// ─── Formattazione ─────────────────────────────────────────────────────────

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';

const QUOTE_LABEL: Record<string, string> = {
  inviato: 'Da firmare', visionato: 'Da firmare', firmato: 'Firmato', rifiutato: 'Rifiutato', scaduto: 'Scaduto',
};
const PAYMENT_LABEL: Record<string, string> = { atteso: 'Da pagare', pagato: 'Pagato', parziale: 'Pagato in parte', scaduto: 'Scaduto' };
const PAYMENT_TYPE: Record<string, string> = { acconto: 'Acconto', saldo: 'Saldo', rata: 'Rata' };
const BOOKING_LABEL: Record<string, string> = { in_attesa: 'In attesa di conferma', confermata: 'Confermata', completata: 'Completata' };

function Pill({ tone, children }: { tone: 'ok' | 'wait' | 'warn' | 'muted'; children: ReactNode }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    wait: 'bg-amber-50 text-amber-800 ring-amber-200',
    warn: 'bg-red-50 text-red-700 ring-red-200',
    muted: 'bg-stone-100 text-stone-600 ring-stone-200',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">{icon}{title}</h3>
      {children}
    </section>
  );
}

// ─── Accesso ───────────────────────────────────────────────────────────────

function LoginForm({ studioName }: { studioName: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      setInfo(await requestLoginCode(email));
      setStep('code');
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Riprova.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await verifyLoginCode(email, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Riprova.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7f6b]">{studioName}</p>
      <h1 className="mt-2 font-serif text-3xl text-stone-900">La mia area</h1>
      <p className="mt-2 text-sm text-stone-600">
        Gallerie, contratti, pagamenti e prenotazioni in un unico posto. Entra con l'email che hai lasciato allo studio.
      </p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-6 space-y-3">
          <label htmlFor="ca-email" className="text-sm font-medium text-stone-800">Email</label>
          <Input
            id="ca-email" type="email" inputMode="email" autoComplete="email" required
            value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@esempio.it" className="h-12 text-base"
          />
          <Button type="submit" disabled={busy || !email.trim()} className="h-12 w-full bg-[#6b7f6b] text-base hover:bg-[#5a6e5a]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Ricevi il codice
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-stone-600">{info} Il codice arriva a <strong className="text-stone-900">{email}</strong>.</p>
          <div className="flex justify-center">
            <InputOTP
              maxLength={6} value={code} autoFocus inputMode="numeric" autoComplete="one-time-code" disabled={busy}
              onChange={value => { setCode(value); if (value.length === 6) void confirm(value); }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={() => confirm()} disabled={busy || code.length !== 6} className="h-12 w-full bg-[#6b7f6b] text-base hover:bg-[#5a6e5a]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Entra
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-stone-500 underline-offset-2 hover:underline" onClick={() => { setStep('email'); setError(''); }}>
              Cambia email
            </button>
            <button type="button" className="text-[#5a6e5a] underline-offset-2 hover:underline disabled:opacity-50" disabled={busy} onClick={() => sendCode()}>
              Invia di nuovo
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ─── Installazione sul telefono ────────────────────────────────────────────

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('client_area_install_dismissed') === '1'; } catch { return false; }
  });
  const standalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (standalone || dismissed || (!prompt && !isIos)) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('client_area_install_dismissed', '1'); } catch { /* facoltativo */ }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#6b7f6b]/25 bg-[#6b7f6b]/10 p-4 text-sm text-stone-700">
      <Download className="mt-0.5 h-4 w-4 flex-none text-[#5a6e5a]" />
      <div className="flex-1">
        <p className="font-medium text-stone-900">Tienila sul telefono</p>
        {prompt ? (
          <p className="mt-1">Aggiungi "La mia area" alla schermata Home per ritrovarla con un tocco.</p>
        ) : (
          <p className="mt-1">Su iPhone tocca <strong>Condividi</strong> e poi <strong>Aggiungi alla schermata Home</strong>.</p>
        )}
        <div className="mt-3 flex gap-2">
          {prompt && (
            <Button size="sm" className="bg-[#6b7f6b] hover:bg-[#5a6e5a]" onClick={async () => { await prompt.prompt(); setPrompt(null); }}>
              Installa
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={dismiss}>Non ora</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Lavori ────────────────────────────────────────────────────────────────

function Milestones({ job }: { job: ClientAreaJob }) {
  return (
    <ol className="space-y-0">
      {job.milestones.map((m, index) => {
        const last = index === job.milestones.length - 1;
        return (
          <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className={`absolute left-[9px] top-6 h-[calc(100%-1rem)] w-px ${m.done ? 'bg-[#6b7f6b]' : 'bg-stone-200'}`} />}
            {m.done
              ? <CheckCircle2 className="relative h-5 w-5 flex-none text-[#6b7f6b]" />
              : <Circle className="relative h-5 w-5 flex-none text-stone-300" />}
            <div className="min-w-0">
              <p className={`text-sm ${m.done ? 'font-medium text-stone-900' : 'text-stone-500'}`}>{m.label}</p>
              {m.date && <p className="text-xs text-stone-500">{m.done ? fmtDate(m.date) : `Previsto il ${fmtDate(m.date)}`}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, label === 'IBAN' ? '' : ' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* copia non disponibile */ }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-stone-500">{label}</p>
        <p className={`break-words text-sm text-stone-900 ${label === 'IBAN' ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <Button size="icon" variant="ghost" onClick={copy} aria-label={`Copia ${label}`} className="flex-none">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function BankBox({ bank, nomeEvento }: { bank: ClientAreaBankDetails; nomeEvento: string }) {
  const causale = causaleFor(bank.causale, nomeEvento);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-stone-900"><Landmark className="h-4 w-4" /> Pagamento con bonifico</p>
      <div className="divide-y divide-stone-200">
        <CopyRow label="IBAN" value={bank.iban} />
        <CopyRow label="Intestatario" value={bank.intestatario} />
        {bank.banca && <CopyRow label="Banca" value={bank.banca} />}
        {causale && <CopyRow label="Causale" value={causale} />}
      </div>
    </div>
  );
}

function PaymentPlan({ plan }: { plan: ClientAreaPaymentPlan }) {
  const progress = plan.totale > 0 ? Math.min(100, Math.round((plan.totalePagato / plan.totale) * 100)) : 0;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-600">Pagato {euro.format(plan.totalePagato)} su {euro.format(plan.totale)}</span>
          <span className="font-medium text-stone-900">Restano {euro.format(plan.saldoResiduo)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#6b7f6b]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {plan.payments.map(p => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900">{PAYMENT_TYPE[p.tipo]} · {euro.format(p.importo)}</p>
              <p className="text-xs text-stone-500">
                {p.stato === 'pagato' && p.dataPagamento ? `Pagato il ${fmtDate(p.dataPagamento)}` : p.dataScadenza ? `Entro il ${fmtDate(p.dataScadenza)}` : ''}
              </p>
            </div>
            <Pill tone={p.stato === 'pagato' ? 'ok' : p.stato === 'scaduto' ? 'warn' : 'wait'}>{PAYMENT_LABEL[p.stato]}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobCard({ job, galleries, bank, onOpenGallery }: {
  job: ClientAreaJob;
  galleries: ClientAreaGallery[];
  bank: ClientAreaBankDetails | null;
  onOpenGallery: (gallery: ClientAreaGallery) => void;
}) {
  const jobGalleries = galleries.filter(g => job.galleryIds.includes(g.id) || g.jobId === job.id);
  const hasOpenPayments = job.paymentPlans.some(p => p.saldoResiduo > 0);
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <header className="border-b border-stone-100 bg-[#f5f0e8]/60 px-5 py-4">
        <h2 className="font-serif text-2xl text-stone-900">{job.nomeEvento}</h2>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
          {job.eventDate && <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{fmtDate(job.eventDate)}</span>}
          {job.eventLocation && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.eventLocation}</span>}
        </div>
      </header>
      <div className="space-y-6 p-5">
        <Section icon={<CheckCircle2 className="h-4 w-4" />} title="A che punto siamo">
          <Milestones job={job} />
        </Section>

        {job.quotes.length > 0 && (
          <Section icon={<FileSignature className="h-4 w-4" />} title="Preventivo e contratto">
            <ul className="space-y-2">
              {job.quotes.map(q => (
                <li key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={q.status === 'firmato' ? 'ok' : q.status === 'rifiutato' || q.status === 'scaduto' ? 'muted' : 'wait'}>{QUOTE_LABEL[q.status]}</Pill>
                      {q.total !== null && <span className="text-sm font-medium text-stone-900">{euro.format(q.total)}</span>}
                    </div>
                    {q.signedAt && <p className="mt-1 text-xs text-stone-500">Firmato il {fmtDate(q.signedAt)}</p>}
                  </div>
                  <Button asChild size="sm" variant="outline"><a href={createUrl(q.url)}>Apri</a></Button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {job.paymentPlans.length > 0 && (
          <Section icon={<Wallet className="h-4 w-4" />} title="Pagamenti">
            {job.paymentPlans.map(plan => <PaymentPlan key={plan.id} plan={plan} />)}
            {bank && hasOpenPayments && <BankBox bank={bank} nomeEvento={job.nomeEvento} />}
          </Section>
        )}

        {(jobGalleries.length > 0 || job.photobooks.length > 0) && (
          <Section icon={<Images className="h-4 w-4" />} title="Foto e fotolibro">
            <div className="flex flex-wrap gap-2">
              {jobGalleries.map(g => (
                <Button key={g.id} variant="outline" size="sm" onClick={() => onOpenGallery(g)}><Camera className="h-4 w-4" />{g.name}</Button>
              ))}
              {job.photobooks.map(p => (
                <Button key={p.id} asChild variant="outline" size="sm">
                  <a href={createUrl(p.url)}><BookOpen className="h-4 w-4" />{p.name}{p.approved ? ' · approvato' : ''}</a>
                </Button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </article>
  );
}

// ─── Gallerie ──────────────────────────────────────────────────────────────

function GalleryCard({ gallery, onOpen }: { gallery: ClientAreaGallery; onOpen: () => void }) {
  const sel = gallery.selection;
  const deadlinePassed = sel?.deadline ? new Date(sel.deadline) < new Date() : false;
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="aspect-[16/10] bg-stone-100">
          {gallery.coverUrl
            ? <img src={gallery.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center"><Camera className="h-8 w-8 text-stone-300" /></div>}
        </div>
      </button>
      <div className="space-y-3 p-5">
        <div>
          <h3 className="font-serif text-xl text-stone-900">{gallery.name}</h3>
          <p className="text-sm text-stone-500">
            {[gallery.date && fmtDate(gallery.date), `${gallery.photoCount} foto`].filter(Boolean).join(' · ')}
          </p>
        </div>

        {sel && (
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={sel.status === 'completed' ? 'ok' : deadlinePassed ? 'warn' : 'wait'}>
                {sel.status === 'completed' ? 'Selezione completata' : 'Selezione da fare'}
              </Pill>
              <span className="text-stone-600">
                {sel.selectedCount} foto scelte{sel.requiredPhotoCount && !sel.unlimited ? ` su ${sel.requiredPhotoCount}` : ''}
              </span>
            </div>
            {sel.status === 'completed' && sel.completedAt && <p className="mt-2 text-xs text-stone-500">Confermata il {fmtDate(sel.completedAt)}</p>}
            {sel.status === 'pending' && sel.deadline && (
              <p className={`mt-2 text-xs ${deadlinePassed ? 'text-red-700' : 'text-stone-500'}`}>
                {deadlinePassed ? 'Scadenza passata il' : 'Da completare entro il'} {fmtDate(sel.deadline)}
              </p>
            )}
            {(sel.notes || sel.photoNotesCount > 0) && (
              <div className="mt-3 border-t border-stone-200 pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-stone-700"><MessageSquareText className="h-3.5 w-3.5" />Le tue note</p>
                {sel.notes && <p className="mt-1 whitespace-pre-wrap text-stone-700">{sel.notes}</p>}
                {sel.photoNotesCount > 0 && <p className="mt-1 text-xs text-stone-500">{sel.photoNotesCount} {sel.photoNotesCount === 1 ? 'nota su una foto' : 'note su singole foto'}</p>}
              </div>
            )}
          </div>
        )}

        <Button onClick={onOpen} className="w-full bg-[#6b7f6b] hover:bg-[#5a6e5a]">
          {sel?.status === 'pending' ? 'Apri e scegli le foto' : 'Apri la galleria'}
        </Button>
      </div>
    </article>
  );
}

function BookingRow({ booking }: { booking: ClientAreaBooking }) {
  return (
    <li className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-stone-900">{booking.campaignName || 'Prenotazione'}</p>
        <Pill tone={booking.stato === 'confermata' || booking.stato === 'completata' ? 'ok' : 'wait'}>{BOOKING_LABEL[booking.stato] || booking.stato}</Pill>
      </div>
      <p className="mt-1 text-sm text-stone-600">{[fmtDateTime(booking.start), booking.prodottoNome].filter(Boolean).join(' · ')}</p>
      {(booking.totale !== undefined || booking.acconto !== undefined) && (
        <p className="mt-1 text-xs text-stone-500">
          {[
            booking.totale !== undefined && `Totale ${euro.format(booking.totale)}`,
            booking.acconto !== undefined && `acconto ${euro.format(booking.acconto)}`,
            booking.saldo !== undefined && `saldo ${euro.format(booking.saldo)}`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </li>
  );
}

// ─── Pagina ────────────────────────────────────────────────────────────────

type Tab = 'jobs' | 'galleries' | 'bookings';

function Overview({ data, onLogout }: { data: ClientAreaOverview; onLogout: () => void }) {
  const tabs = useMemo(() => ([
    { id: 'jobs' as const, label: 'Lavori', count: data.jobs.length },
    { id: 'galleries' as const, label: 'Gallerie', count: data.galleries.length },
    { id: 'bookings' as const, label: 'Prenotazioni', count: data.bookings.length },
  ]).filter(t => t.count > 0), [data]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.id || 'jobs');
  const openGallery = (gallery: ClientAreaGallery) => { window.location.href = openOwnedGallery(gallery, data.cliente); };
  const greeting = data.cliente.nome ? `Ciao ${data.cliente.nome}` : 'Benvenuto';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7f6b]">La mia area</p>
          <h1 className="mt-1 font-serif text-3xl text-stone-900">{greeting}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="h-4 w-4" />Esci</Button>
      </header>

      <InstallHint />

      {tabs.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-600">
          <CalendarDays className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 font-medium text-stone-900">Non ci sono ancora contenuti</p>
          <p className="mt-1 text-sm">Qui troverai gallerie, contratti e pagamenti non appena lo studio li collegherà alla tua email.</p>
        </div>
      ) : (
        <>
          {tabs.length > 1 && (
            <nav className="grid gap-1 rounded-xl bg-stone-200/70 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map(t => (
                <button
                  key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`rounded-lg px-2 py-2 text-sm font-medium transition ${tab === t.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}
                >
                  {t.label} <span className="text-stone-400">{t.count}</span>
                </button>
              ))}
            </nav>
          )}
          {tab === 'jobs' && data.jobs.map(job => (
            <JobCard key={job.id} job={job} galleries={data.galleries} bank={data.bankDetails} onOpenGallery={openGallery} />
          ))}
          {tab === 'galleries' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.galleries.map(g => <GalleryCard key={g.id} gallery={g} onOpen={() => openGallery(g)} />)}
            </div>
          )}
          {tab === 'bookings' && <ul className="space-y-2">{data.bookings.map(b => <BookingRow key={b.id} booking={b} />)}</ul>}
        </>
      )}
    </div>
  );
}

export default function ClientAreaPage() {
  const { studioSettings } = useStudio();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    document.title = 'La mia area';
    return watchClientAreaUser(setUser);
  }, []);

  const overview = useQuery({
    queryKey: ['client-area-overview', user?.uid],
    queryFn: fetchClientAreaOverview,
    enabled: Boolean(user),
    retry: (count, error) => !(error instanceof ClientAreaSessionError) && count < 2,
    staleTime: 60_000,
  });

  return (
    <main className="min-h-screen bg-[#f5f0e8] px-4 py-8 sm:py-12">
      {user === undefined || (user && overview.isLoading) ? (
        <div className="flex min-h-[60vh] items-center justify-center text-stone-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !user ? (
        <div className="flex min-h-[70vh] items-center"><LoginForm studioName={studioSettings?.name || 'Image Studio'} /></div>
      ) : overview.isError ? (
        <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-stone-700">{(overview.error as Error).message}</p>
          <Button onClick={() => overview.refetch()} className="bg-[#6b7f6b] hover:bg-[#5a6e5a]">Riprova</Button>
        </div>
      ) : overview.data ? (
        <Overview data={overview.data} onLogout={() => void logoutClientArea()} />
      ) : null}
    </main>
  );
}
