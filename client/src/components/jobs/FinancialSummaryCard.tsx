import { Card, CardContent } from '@/components/ui/card';
import { Euro, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FinancialSummaryCardProps {
  totalePreventivato: number;
  totalePagato: number;
  saldoResiduo: number;
  totaleCosti: number;
  className?: string;
}

export default function FinancialSummaryCard({
  totalePreventivato,
  totalePagato,
  saldoResiduo,
  totaleCosti,
  className
}: FinancialSummaryCardProps) {
  const margine = totalePreventivato - totaleCosti;
  const marginePercentuale = totalePreventivato > 0 
    ? ((margine / totalePreventivato) * 100) 
    : 0;

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className={cn("bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950", className)}>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Preventivato */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Preventivato</p>
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatEuro(totalePreventivato)}
              </p>
            </div>
          </div>

          {/* Incassato */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Incassato</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatEuro(totalePagato)}
              </p>
            </div>
            {totalePreventivato > 0 && (
              <p className="text-xs text-muted-foreground">
                {((totalePagato / totalePreventivato) * 100).toFixed(0)}% pagato
              </p>
            )}
          </div>

          {/* Da Incassare */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Da Incassare</p>
            <div className="flex items-center gap-2">
              {saldoResiduo > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              )}
              <p className={cn(
                "text-2xl font-bold",
                saldoResiduo > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
              )}>
                {formatEuro(saldoResiduo)}
              </p>
            </div>
            {saldoResiduo > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Saldo aperto
              </p>
            )}
          </div>

          {/* Margine */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Margine</p>
            <div className="flex items-center gap-2">
              {margine >= 0 ? (
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              <p className={cn(
                "text-2xl font-bold",
                margine >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {formatEuro(margine)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {marginePercentuale.toFixed(1)}% del preventivo
            </p>
          </div>
        </div>

        {/* Breakdown costi (opzionale, mostrato solo se ci sono costi) */}
        {totaleCosti > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Costi totali:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatEuro(totaleCosti)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
