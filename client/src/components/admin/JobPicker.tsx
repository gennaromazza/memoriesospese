import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Job } from '@shared/jobs-types';

function getJobDate(job: Job): Date | null {
  const ed: any = (job as any).eventDate;
  if (!ed) return null;
  if (typeof ed.toDate === 'function') {
    try {
      return ed.toDate();
    } catch {
      return null;
    }
  }
  if (typeof ed._seconds === 'number') return new Date(ed._seconds * 1000);
  if (typeof ed.seconds === 'number') return new Date(ed.seconds * 1000);
  if (ed instanceof Date) return ed;
  if (typeof ed === 'string') {
    const d = new Date(ed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function jobDateLabel(job: Job): string {
  const d = getJobDate(job);
  return d ? format(d, 'dd/MM/yyyy') : 'Data N/D';
}

interface JobPickerProps {
  jobs: Job[];
  value: string;
  onChange: (jobId: string) => void;
  loading?: boolean;
  referenceDate?: Date | null;
  allowNone?: boolean;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}

function startOfDayTime(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function JobPicker({
  jobs,
  value,
  onChange,
  loading = false,
  referenceDate = null,
  allowNone = true,
  disabled = false,
  placeholder = 'Nessun lavoro',
  testId = 'job-picker',
}: JobPickerProps) {
  const [open, setOpen] = useState(false);

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    jobs.forEach((j) => m.set(j.id, j));
    return m;
  }, [jobs]);

  const suggestedJobs = useMemo(() => {
    const withDate = jobs
      .map((j) => ({ job: j, date: getJobDate(j) }))
      .filter((x): x is { job: Job; date: Date } => x.date !== null);
    if (withDate.length === 0) return [];
    const refDay = startOfDayTime(
      referenceDate ? referenceDate.getTime() : Date.now(),
    );
    // Prima i lavori "prossimi" (stessa data o successiva) in ordine crescente,
    // poi come fallback i più recenti tra i passati (se meno di 4 futuri).
    const upcoming = withDate
      .filter((x) => startOfDayTime(x.date.getTime()) >= refDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const past = withDate
      .filter((x) => startOfDayTime(x.date.getTime()) < refDay)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    return [...upcoming, ...past].slice(0, 4).map((x) => x.job);
  }, [jobs, referenceDate]);

  const suggestedIds = useMemo(
    () => new Set(suggestedJobs.map((j) => j.id)),
    [suggestedJobs],
  );

  const restJobs = useMemo(
    () => jobs.filter((j) => !suggestedIds.has(j.id)),
    [jobs, suggestedIds],
  );

  const selectedJob = value ? jobById.get(value) : undefined;
  const triggerLabel = loading
    ? 'Caricamento...'
    : selectedJob
      ? `${selectedJob.nomeEvento} - ${jobDateLabel(selectedJob)}`
      : placeholder;

  const handleSelect = (jobId: string) => {
    onChange(jobId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
          data-testid={`${testId}-trigger`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-[11000]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput
            placeholder="Cerca un lavoro..."
            data-testid={`${testId}-search`}
          />
          <CommandList>
            <CommandEmpty>Nessun lavoro trovato.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem
                  value="nessun lavoro __none__"
                  onSelect={() => handleSelect('')}
                  data-testid={`${testId}-option-none`}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      !value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  Nessun lavoro
                </CommandItem>
              </CommandGroup>
            )}
            {suggestedJobs.length > 0 && (
              <CommandGroup heading="Suggeriti (date più vicine)">
                {suggestedJobs.map((job) => (
                  <CommandItem
                    key={job.id}
                    value={`${job.nomeEvento} ${jobDateLabel(job)} ${job.id}`}
                    onSelect={() => handleSelect(job.id)}
                    data-testid={`${testId}-suggested-${job.id}`}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === job.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="truncate">
                      {job.nomeEvento} - {jobDateLabel(job)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {restJobs.length > 0 && (
              <CommandGroup heading="Tutti i lavori">
                {restJobs.map((job) => (
                  <CommandItem
                    key={job.id}
                    value={`${job.nomeEvento} ${jobDateLabel(job)} ${job.id}`}
                    onSelect={() => handleSelect(job.id)}
                    data-testid={`${testId}-option-${job.id}`}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === job.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">
                      {job.nomeEvento} - {jobDateLabel(job)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
