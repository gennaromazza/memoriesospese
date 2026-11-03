import { useState } from 'react';

const recipients = [
  { email: 'anna.rossi@example.it', nome: 'Anna', cognome: 'Rossi', clientId: 'demo-1' },
  { email: 'marco.bianchi@example.it', nome: 'Marco', cognome: 'Bianchi', clientId: 'demo-2' },
  { email: 'giulia.esposito@example.it', nome: 'Giulia', cognome: 'Esposito', clientId: 'demo-3' },
  { email: 'luca.ferrara@example.it', nome: 'Luca', cognome: 'Ferrara', clientId: 'demo-4' },
  { email: 'elena.romano@example.it', nome: 'Elena', cognome: 'Romano', clientId: 'demo-5' },
  { email: 'paolo.conti@example.it', nome: 'Paolo', cognome: 'Conti', clientId: 'demo-6' },
];

const filters = {
  filters: [
    { value: 'anno_2025', label: 'Anno 2025' },
    { value: 'anno_2024', label: 'Anno 2024' },
  ],
  jobTypeFilters: [
    { value: 'tipo_matrimonio', label: 'Matrimoni' },
    { value: 'tipo_battesimo', label: 'Battesimi' },
    { value: 'tipo_comunione', label: 'Comunioni' },
  ],
};

function fixtureForQueryKey(queryKey: readonly unknown[]) {
  const route = String(queryKey[0] ?? '');

  if (route.includes('/recipients')) return { recipients, total: recipients.length };
  if (route.includes('/resend-status')) {
    return {
      success: true,
      connected: true,
      verifiedSendingDomains: [
        { id: 'demo-domain', name: 'imagestudiofotografico.com', status: 'verified' },
      ],
    };
  }
  if (route.endsWith('/filters')) return filters;
  if (route.endsWith('/templates')) {
    return {
      templates: [{
        id: 'demo-template',
        name: 'Novità dello studio',
        subject: 'Le ultime novità di Image Studio',
        body: '<p>Ciao {nome},</p><p>abbiamo una novità da condividere con te.</p>',
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
    };
  }
  if (route.endsWith('/jobs')) return { jobs: [] };
  if (route.includes('/jobs/')) return { job: null };
  return undefined;
}

export function useQuery<TData = any>(options: {
  queryKey: readonly unknown[];
  refetchInterval?: number | false | ((query: any) => number | false | undefined);
  [key: string]: unknown;
}): { data: TData | undefined; isLoading: boolean; error: Error | null } {
  return {
    data: fixtureForQueryKey(options.queryKey) as TData | undefined,
    isLoading: false,
    error: null,
  };
}

export function useMutation<TData = unknown, TError = Error, TVariables = void>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: TError) => void;
}) {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = async (variables?: TVariables): Promise<TData> => {
    setIsPending(true);
    try {
      const result = await options.mutationFn(variables as TVariables);
      options.onSuccess?.(result, variables as TVariables);
      return result;
    } catch (error) {
      options.onError?.(error as TError);
      throw error;
    } finally {
      setIsPending(false);
    }
  };

  return {
    isPending,
    mutate: (variables?: TVariables) => { void mutateAsync(variables); },
    mutateAsync,
  };
}

export const queryClient = {
  invalidateQueries: async (_options?: unknown) => undefined,
};

export async function apiRequest(_method: string, path: string, _body?: unknown) {
  const payload = path.includes('/send-resend')
    ? { success: true, jobId: 'demo-job', jobs: [{ id: 'demo-job' }] }
    : path.includes('/templates')
      ? { success: true, template: { id: 'demo-template' } }
      : { success: true };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
