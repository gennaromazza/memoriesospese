/**
 * Cash Dashboard - shell: carica i dati finanziari e ospita la vista di sola lettura.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingBag, FileText, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadFinanceDashboard, exportFinanceDashboard } from "@/lib/financial-dashboard-data";
import type { FinanceDashboard } from "@/lib/finance-types";
import CashRegister from "./CashRegister";
import WalkInOrdersManager from "./WalkInOrdersManager";
import QuickOrderModal from "./QuickOrderModal";
import FinancialDashboardView from "./finance/FinancialDashboardView";

interface Props {
  loadData?: () => Promise<FinanceDashboard>;
  exportData?: (data: FinanceDashboard) => void;
}

export default function CashDashboard({ loadData = loadFinanceDashboard, exportData = exportFinanceDashboard }: Props = {}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [quickOrderModalOpen, setQuickOrderModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: loadData,
    enabled: activeTab === "dashboard",
    staleTime: 15000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const invalidateAll = () => {
    for (const key of ["finance-dashboard", "orders", "walk-in-orders", "cash-movements", "financial-summary", "monthly-data", "forecasted-income", "orders-payments"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 grid h-auto grid-cols-3 gap-1 p-1 sm:mb-6">
          <TabsTrigger value="dashboard" className="gap-1.5 px-2 py-2 text-xs sm:text-sm" data-testid="cash-tab-dashboard"><BarChart3 className="h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="walkin" className="gap-1.5 px-2 py-2 text-xs sm:text-sm" data-testid="cash-tab-walkin"><ShoppingBag className="h-4 w-4" />Walk-in</TabsTrigger>
          <TabsTrigger value="register" className="gap-1.5 px-2 py-2 text-xs sm:text-sm" data-testid="cash-tab-register"><FileText className="h-4 w-4" />Registro</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          {query.isLoading ? (
            <div className="space-y-4" data-testid="finance-loading">
              <Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" />
            </div>
          ) : query.data ? (
            <>
              {query.isError && (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950" data-testid="finance-stale-error">
                  Aggiornamento non riuscito: i dati mostrati potrebbero essere vecchi.
                  <Button type="button" size="sm" variant="outline" onClick={() => query.refetch()}>Riprova</Button>
                </div>
              )}
              <FinancialDashboardView data={query.data} refreshing={query.isFetching} onRefresh={() => query.refetch()} onExport={exportData} />
            </>
          ) : (
            <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-6 text-center" data-testid="finance-error">
              <p className="font-medium text-rose-950">Impossibile caricare i dati finanziari.</p>
              <p className="mt-1 text-sm text-rose-900">Nessun importo viene mostrato finché i dati non sono disponibili.</p>
              <Button type="button" className="mt-3" onClick={() => query.refetch()}>Riprova</Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="register"><CashRegister /></TabsContent>
        <TabsContent value="walkin"><WalkInOrdersManager onOpenQuickOrder={() => setQuickOrderModalOpen(true)} /></TabsContent>
      </Tabs>
      <QuickOrderModal isOpen={quickOrderModalOpen} onClose={() => setQuickOrderModalOpen(false)} onSuccess={() => { setQuickOrderModalOpen(false); invalidateAll(); }} />
    </>
  );
}
