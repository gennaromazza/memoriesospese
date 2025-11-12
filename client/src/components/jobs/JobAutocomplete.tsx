
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Briefcase } from 'lucide-react';
import { getAllJobs } from '@/lib/jobs';
import { getJobTypeBySlug } from '@/lib/job-types';
import type { Job } from '@shared/jobs-types';
import { cn } from '@/lib/utils';
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
  PopoverTrigger
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface JobAutocompleteProps {
  value?: string;
  onSelect: (job: Job | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function JobAutocomplete({
  value,
  onSelect,
  placeholder = 'Cerca job...',
  disabled = false,
  className
}: JobAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ['jobs-autocomplete'],
    queryFn: getAllJobs
  });

  // Filtra job in base alla ricerca
  const filteredJobs = allJobs.filter(job => {
    if (!debouncedSearch || debouncedSearch.length < 2) return false;
    
    const query = debouncedSearch.toLowerCase();
    const eventDate = job.eventDate?.toDate ? job.eventDate.toDate() : new Date(job.eventDate);
    const dateStr = format(eventDate, 'dd/MM/yyyy');
    
    return (
      job.nomeEvento.toLowerCase().includes(query) ||
      job.jobType.toLowerCase().includes(query) ||
      job.eventLocation?.toLowerCase().includes(query) ||
      dateStr.includes(query)
    );
  }).filter(job => job.status !== 'archiviato');

  useEffect(() => {
    if (value) {
      const job = allJobs.find(j => j.id === value);
      if (job) {
        setSelectedJob(job);
      }
    } else if (selectedJob && !value) {
      setSelectedJob(null);
    }
  }, [value, allJobs, selectedJob]);

  const handleSelect = (job: Job) => {
    setSelectedJob(job);
    onSelect(job);
    setOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    setSelectedJob(null);
    onSelect(null);
    setSearchQuery('');
  };

  const displayValue = selectedJob
    ? `${selectedJob.nomeEvento} - ${format(
        selectedJob.eventDate?.toDate ? selectedJob.eventDate.toDate() : new Date(selectedJob.eventDate),
        'dd/MM/yyyy'
      )}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', className)}
          data-testid="button-job-autocomplete"
        >
          <span className={cn('truncate', !selectedJob && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca per nome evento, data o tipo..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            data-testid="input-search-job"
          />
          <CommandList>
            {isLoading && (
              <div className="p-2 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!isLoading && debouncedSearch.length < 2 && (
              <CommandEmpty>
                Digita almeno 2 caratteri per cercare
              </CommandEmpty>
            )}

            {!isLoading && debouncedSearch.length >= 2 && filteredJobs.length === 0 && (
              <CommandEmpty>
                Nessun job trovato
              </CommandEmpty>
            )}

            {!isLoading && filteredJobs.length > 0 && (
              <CommandGroup>
                {selectedJob && (
                  <CommandItem
                    key="clear"
                    onSelect={handleClear}
                    className="text-muted-foreground italic"
                    data-testid="option-clear-selection"
                  >
                    Deseleziona job
                  </CommandItem>
                )}
                {filteredJobs
                  .sort((a, b) => {
                    const dateA = a.eventDate?.toDate ? a.eventDate.toDate() : new Date(a.eventDate);
                    const dateB = b.eventDate?.toDate ? b.eventDate.toDate() : new Date(b.eventDate);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map(job => {
                    const eventDate = job.eventDate?.toDate ? job.eventDate.toDate() : new Date(job.eventDate);
                    
                    return (
                      <CommandItem
                        key={job.id}
                        value={job.id}
                        onSelect={() => handleSelect(job)}
                        data-testid={`option-job-${job.id}`}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedJob?.id === job.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {job.nomeEvento}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {job.jobType} • {format(eventDate, 'dd MMMM yyyy', { locale: it })}
                          </span>
                          {job.eventLocation && (
                            <span className="text-xs text-muted-foreground">
                              📍 {job.eventLocation}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
