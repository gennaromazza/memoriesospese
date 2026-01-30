/**
 * Cash Dashboard - Dashboard Finanziaria Principale
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Wallet, DollarSign, Calendar, Download, BarChart3, FileText, Clock, ExternalLink, ShoppingBag, Mail, User, Phone } from "lucide-react";
import { getFinancialSummary, getMonthlyData, getAllCashMovements, getForecastedIncome, exportFinancialData } from "@/lib/cash";
import { getAllOrders } from "@/lib/orders";
import CashRegister from "./CashRegister";
import WalkInOrdersManager from "./WalkInOrdersManager";
import type { FinancialSummary, MonthlyData, ForecastedIncome, CashMovementOrigine, CashMovementFE } from "@shared/cash-types";
import { CASH_ORIGINE_LABELS } from "@shared/cash-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";

export default function CashDashboard() {
  // Helper per convertire Date | Timestamp in Date
  const toDate = (d: Date | Timestamp): Date => {
    return d instanceof Timestamp ? d.toDate() : d;
  };
  const [dateRange, setDateRange] = useState<"all" | "month" | "quarter" | "year">("month");
  const [origineFilter, setOrigineFilter] = useState<CashMovementOrigine | "all">("all");
  const [temaFilter, setTemaFilter] = useState<string>("all");

  // Query per riepilogo finanziario
  const { data: summary, isLoading: summaryLoading } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary", dateRange],
    queryFn: async () => {
      const now = new Date();
      let startDate: Date | undefined;

      if (dateRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === "quarter") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
      } else if (dateRange === "year") {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      return getFinancialSummary(startDate);
    },
  });

  // Query per dati mensili (sempre ultimi 12 mesi)
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<MonthlyData[]>({
    queryKey: ["monthly-data"],
    queryFn: getMonthlyData,
  });

  // Query per ultimi movimenti (filtra per dateRange)
  const { data: movements } = useQuery({
    queryKey: ["cash-movements", dateRange],
    queryFn: async () => {
      const allMovements = await getAllCashMovements();
      const now = new Date();
      let startDate: Date | undefined;

      if (dateRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === "quarter") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
      } else if (dateRange === "year") {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      if (!startDate) return allMovements;

      return allMovements.filter((m) => {
        const movDate = m.data instanceof Timestamp ? m.data.toDate() : new Date(m.data);
        return movDate >= startDate!;
      });
    },
  });

  // Query per previsioni incasso (filtra per dateRange)
  const { data: forecasts } = useQuery<ForecastedIncome[]>({
    queryKey: ["forecasted-income", dateRange],
    queryFn: async () => {
      const allForecasts = await getForecastedIncome();
      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (dateRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (dateRange === "quarter") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
        endDate = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
      } else if (dateRange === "year") {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
      }

      if (!startDate) return allForecasts;

      // Filtra forecasts con data servizio nel range
      return allForecasts.filter((f) => {
        const fDate = f.data instanceof Date ? f.data : new Date(f.data);
        return fDate >= startDate! && fDate <= endDate!;
      });
    },
  });

  // Query per ultimi pagamenti ordini (filtra transazioni per dateRange)
  const { data: orders } = useQuery({
    queryKey: ["orders-payments", dateRange],
    queryFn: async () => {
      const allOrders = await getAllOrders();
      const now = new Date();
      let startDate: Date | undefined;

      if (dateRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === "quarter") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
      } else if (dateRange === "year") {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      if (!startDate) return allOrders;

      // Filtra ordini che hanno almeno una transazione nel range
      return allOrders
        .map((order) => ({
          ...order,
          transactions: (order.transactions || []).filter((t) => {
            const tDate = t.data instanceof Timestamp ? t.data.toDate() : new Date(t.data);
            return tDate >= startDate!;
          }),
        }))
        .filter((order) => order.transactions && order.transactions.length > 0);
    },
  });

  
  // Movimenti filtrati per origine e tema
  const filteredMovements = (movements || []).filter((m: CashMovementFE) => {
    if (origineFilter !== "all" && m.origine !== origineFilter) return false;
    if (temaFilter !== "all" && m.origineTema !== temaFilter) return false;
    return true;
  });
  
  // Estrai temi unici dai movimenti
  const uniqueTemi = [...new Set((movements || []).map((m: CashMovementFE) => m.origineTema).filter(Boolean))] as string[];
  
  // Statistiche aggregate per origine (usa tutti i movimenti per panoramica globale)
  const statsByOrigine = (movements || []).reduce((acc, m: CashMovementFE) => {
    const origine = m.origine || "manuale";
    if (!acc[origine]) {
      acc[origine] = { entrate: 0, uscite: 0, count: 0 };
    }
    if (m.tipo === "entrata") {
      acc[origine].entrate += m.importo;
    } else {
      acc[origine].uscite += m.importo;
    }
    acc[origine].count++;
    return acc;
  }, {} as Record<string, { entrate: number; uscite: number; count: number }>);
  
  // Statistiche aggregate filtrate (rispetta i filtri attivi)
  const filteredStatsByOrigine = filteredMovements.reduce((acc, m: CashMovementFE) => {
    const origine = m.origine || "manuale";
    if (!acc[origine]) {
      acc[origine] = { entrate: 0, uscite: 0, count: 0 };
    }
    if (m.tipo === "entrata") {
      acc[origine].entrate += m.importo;
    } else {
      acc[origine].uscite += m.importo;
    }
    acc[origine].count++;
    return acc;
  }, {} as Record<string, { entrate: number; uscite: number; count: number }>);
  
  // Statistiche aggregate per tema
  const statsByTema = (movements || []).reduce((acc, m: CashMovementFE) => {
    const tema = m.origineTema || "altro";
    if (!acc[tema]) {
      acc[tema] = { entrate: 0, uscite: 0, count: 0 };
    }
    if (m.tipo === "entrata") {
      acc[tema].entrate += m.importo;
    } else {
      acc[tema].uscite += m.importo;
    }
    acc[tema].count++;
    return acc;
  }, {} as Record<string, { entrate: number; uscite: number; count: number }>);
  
  // Totali filtrati
  const filteredTotals = filteredMovements.reduce(
    (acc, m: CashMovementFE) => {
      if (m.tipo === "entrata") {
        acc.entrate += m.importo;
      } else {
        acc.uscite += m.importo;
      }
      return acc;
    },
    { entrate: 0, uscite: 0 }
  );
  
  // Formatta valuta
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="register" className="w-full">
      {/* Sub-Tabs Navigation - Mobile Responsive */}
      <TabsList className="mb-4 sm:mb-6 grid grid-cols-4 gap-1 h-auto p-1 bg-muted/50 rounded-lg">
        <TabsTrigger value="register" className="flex-shrink-0 px-2 py-2 text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1 sm:gap-2">
          <FileText className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden sm:inline">Registro</span>
          <span className="sm:hidden">📝</span>
        </TabsTrigger>
        <TabsTrigger value="walkin" className="flex-shrink-0 px-2 py-2 text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1 sm:gap-2">
          <ShoppingBag className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden sm:inline">Walk-in</span>
          <span className="sm:hidden">🛍️</span>
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="flex-shrink-0 px-2 py-2 text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1 sm:gap-2">
          <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden sm:inline">Dashboard</span>
          <span className="sm:hidden">💰</span>
        </TabsTrigger>
        <TabsTrigger value="forecasts" className="flex-shrink-0 px-2 py-2 text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1 sm:gap-2">
          <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden sm:inline">Previsioni</span>
          <span className="sm:hidden">📅</span>
        </TabsTrigger>
      </TabsList>

      {/* Registro Cassa Tab */}
      <TabsContent value="register">
        <CashRegister />
      </TabsContent>

      {/* Ordini Walk-in Tab */}
      <TabsContent value="walkin">
        <WalkInOrdersManager />
      </TabsContent>

      {/* Dashboard Tab */}
      <TabsContent value="dashboard">
        <div className="space-y-4 sm:space-y-6">
          {/* Header con filtri data - Mobile Responsive */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-blue-gray">💰 Dashboard Finanziaria</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Panoramica completa entrate, uscite e previsioni
              </p>
            </div>

            {/* Controlli azioni - Mobile First */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {/* Filtri periodo - Mobile Grid */}
              <div className="grid grid-cols-2 sm:flex gap-2 flex-1">
                <Button
                  variant={dateRange === "month" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange("month")}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Questo Mese</span>
                  <span className="sm:hidden">Mese</span>
                </Button>
                <Button
                  variant={dateRange === "quarter" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange("quarter")}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Trimestre</span>
                  <span className="sm:hidden">Trim.</span>
                </Button>
                <Button
                  variant={dateRange === "year" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange("year")}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  Anno
                </Button>
                <Button
                  variant={dateRange === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange("all")}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  Tutto
                </Button>
              </div>

              {/* Filtri Origine e Tema */}
              <div className="flex gap-2">
                <Select value={origineFilter} onValueChange={(v) => setOrigineFilter(v as CashMovementOrigine | "all")}>
                  <SelectTrigger className="w-[140px] text-xs sm:text-sm">
                    <SelectValue placeholder="Origine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le origini</SelectItem>
                    <SelectItem value="walk-in">Ordini Walk-in</SelectItem>
                    <SelectItem value="booking">Prenotazioni</SelectItem>
                    <SelectItem value="job">Lavori</SelectItem>
                    <SelectItem value="manuale">Manuali</SelectItem>
                  </SelectContent>
                </Select>
                
                {uniqueTemi.length > 0 && (
                  <Select value={temaFilter} onValueChange={setTemaFilter}>
                    <SelectTrigger className="w-[140px] text-xs sm:text-sm">
                      <SelectValue placeholder="Tema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i temi</SelectItem>
                      {uniqueTemi.map((tema) => (
                        <SelectItem key={tema} value={tema}>
                          {tema.charAt(0).toUpperCase() + tema.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Bottoni export - Mobile Stack */}
              <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const now = new Date();
                    let startDate: Date | undefined;

                    if (dateRange === "month") {
                      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    } else if (dateRange === "quarter") {
                      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
                      startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
                    } else if (dateRange === "year") {
                      startDate = new Date(now.getFullYear(), 0, 1);
                    }

                    await exportFinancialData(startDate, now);
                  }}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Esporta Excel</span>
                  <span className="sm:hidden">Excel</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Stampa Estratto</span>
                  <span className="sm:hidden">Stampa</span>
                </Button>
              </div>
            </div>
          </div>

      {/* Statistiche per Origine - Mostra breakdown entrate/uscite per fonte */}
      {Object.keys(statsByOrigine).length > 0 && (origineFilter !== "all" || temaFilter !== "all") && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Filtro Attivo: {origineFilter !== "all" ? CASH_ORIGINE_LABELS[origineFilter] : "Tutte"} 
              {temaFilter !== "all" && ` - ${temaFilter.charAt(0).toUpperCase() + temaFilter.slice(1)}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(filteredTotals.entrate)}</div>
                <div className="text-xs text-muted-foreground">Entrate</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(filteredTotals.uscite)}</div>
                <div className="text-xs text-muted-foreground">Uscite</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${filteredTotals.entrate - filteredTotals.uscite >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  {formatCurrency(filteredTotals.entrate - filteredTotals.uscite)}
                </div>
                <div className="text-xs text-muted-foreground">Saldo</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Riepilogo per Origine - Sempre visibile */}
      {Object.keys(statsByOrigine).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Riepilogo per Origine</CardTitle>
            <CardDescription className="text-xs">Distribuzione entrate per fonte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["walk-in", "booking", "job", "manuale"] as const).map((origine) => {
                const stats = statsByOrigine[origine] || { entrate: 0, uscite: 0, count: 0 };
                return (
                  <div 
                    key={origine}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      origineFilter === origine ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => setOrigineFilter(origineFilter === origine ? "all" : origine)}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{CASH_ORIGINE_LABELS[origine]}</div>
                    <div className="text-sm font-bold text-green-600">{formatCurrency(stats.entrate)}</div>
                    {stats.uscite > 0 && (
                      <div className="text-xs text-red-500">-{formatCurrency(stats.uscite)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card Riepilogo - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Entrate Totali */}
        <Card className="touch-manipulation">
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
              Entrate Totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-green-600">
              {formatCurrency(summary?.totaleEntrate || 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-relaxed">
              Ordini: {formatCurrency(summary?.entrateOrdini || 0)}
              <br />
              Altre: {formatCurrency(summary?.entrateAltre || 0)}
            </p>
          </CardContent>
        </Card>

        {/* Uscite Totali */}
        <Card className="touch-manipulation">
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-600 flex-shrink-0" />
              Uscite Totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-red-600">
              {formatCurrency(summary?.totaleUscite || 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Spese cassa registrate
            </p>
          </CardContent>
        </Card>

        {/* Saldo Corrente */}
        <Card className="touch-manipulation">
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
              <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
              Saldo Netto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-lg sm:text-2xl font-bold ${(summary?.saldo || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>
              {formatCurrency(summary?.saldo || 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Entrate - Uscite
            </p>
          </CardContent>
        </Card>

        {/* Incassi Previsti */}
        <Card className="touch-manipulation">
          <CardHeader className="pb-2 sm:pb-3">
            <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600 flex-shrink-0" />
              Incassi Previsti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-orange-600">
              {formatCurrency(
                forecasts?.reduce((sum, f) => sum + f.importo, 0) || 0
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-relaxed">
              {forecasts && forecasts.length > 0 ? (
                <>
                  {forecasts.reduce((sum, f) => sum + f.ordini.length, 0)} ordini in sospeso
                  <br />
                  Prossimo: {new Date(forecasts[0].data).toLocaleDateString("it-IT")}
                </>
              ) : (
                "Nessun incasso previsto"
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grafico Andamento Mensile */}
      <Card>
        <CardHeader>
          <CardTitle>📈 Andamento Ultimi 12 Mesi</CardTitle>
          <CardDescription>Confronto entrate e uscite mensili</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mese" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="entrate" fill="#16a34a" name="Entrate" />
                <Bar dataKey="uscite" fill="#dc2626" name="Uscite" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabelle Movimenti e Pagamenti - Mobile Responsive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">📋 Dettaglio Movimenti</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="payments">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="payments" className="text-xs sm:text-sm">Pagamenti Ordini</TabsTrigger>
              <TabsTrigger value="cash" className="text-xs sm:text-sm">Movimenti Cassa</TabsTrigger>
            </TabsList>

            <TabsContent value="payments" className="mt-4">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Cliente</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Tipo</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Importo</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Data</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Metodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders?.slice(0, 10).map((order) =>
                      (order.transactions || []).map((t, idx) => (
                        <tr key={`${order.id}-${idx}`} className="border-t hover:bg-gray-50">
                          <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">{order.nomeCliente}</td>
                          <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                            <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs ${t.tipo === 'acconto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                              {t.tipo}
                            </span>
                          </td>
                          <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold">{formatCurrency(t.importo)}</td>
                          <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                            {toDate(t.data).toLocaleDateString("it-IT")}
                          </td>
                          <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">{t.metodo}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="cash" className="mt-4">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Descrizione</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Categoria</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Tipo</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Importo</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements?.slice(0, 10).map((mov) => (
                      <tr key={mov.id} className="border-t hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">{mov.descrizione}</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-muted-foreground">{mov.categoria}</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs ${mov.tipo === 'entrata' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold ${mov.tipo === 'entrata' ? 'text-green-600' : 'text-red-600'}`}>
                          {mov.tipo === 'entrata' ? '+' : '-'}{formatCurrency(mov.importo)}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                          {toDate(mov.data).toLocaleDateString("it-IT")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!movements || movements.length === 0 && (
                <div className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
                  Nessun movimento cassa registrato. Aggiungi il primo movimento dalla sezione "Registro Cassa".
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
        </div>
      </TabsContent>

      {/* Previsioni Tab */}
      <TabsContent value="forecasts">
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-blue-gray">📅 Calendario Incassi Previsti</h3>
            <p className="text-sm text-muted-foreground">
              Saldi residui da ordini e lavori raggruppati per data servizio/evento
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Incassi Futuri</CardTitle>
              <CardDescription>
                {forecasts && forecasts.length > 0
                  ? `${forecasts.length} date con incassi previsti`
                  : "Nessun incasso previsto"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!forecasts || forecasts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ✅ Tutti gli ordini sono stati completamente saldati!
                </div>
              ) : (
                <div className="space-y-4">
                  {forecasts.map((forecast, idx) => {
                    const now = new Date();
                    const daysUntil = Math.ceil(
                      (forecast.data.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                    );

                    // Codice colore basato su vicinanza
                    let colorClass = "bg-blue-50 border-blue-200";
                    let badgeClass = "bg-blue-100 text-blue-800";
                    if (daysUntil < 0) {
                      colorClass = "bg-red-50 border-red-200";
                      badgeClass = "bg-red-100 text-red-800";
                    } else if (daysUntil <= 7) {
                      colorClass = "bg-orange-50 border-orange-200";
                      badgeClass = "bg-orange-100 text-orange-800";
                    } else if (daysUntil <= 30) {
                      colorClass = "bg-yellow-50 border-yellow-200";
                      badgeClass = "bg-yellow-100 text-yellow-800";
                    }

                    return (
                      <div
                        key={idx}
                        className={`p-4 border rounded-lg ${colorClass}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-5 w-5 text-gray-600" />
                              <h4 className="font-semibold text-lg">
                                {forecast.data.toLocaleDateString("it-IT", {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                })}
                              </h4>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded mt-1 inline-block ${badgeClass}`}>
                              {daysUntil < 0
                                ? `Scaduto da ${Math.abs(daysUntil)} giorni`
                                : daysUntil === 0
                                ? "Oggi"
                                : daysUntil === 1
                                ? "Domani"
                                : `Tra ${daysUntil} giorni`}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-orange-600">
                              {formatCurrency(forecast.importo)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {forecast.ordini.length > 0 && `${forecast.ordini.length} ordini`}
                              {forecast.ordini.length > 0 && (forecast.jobs?.length || 0) > 0 && ' • '}
                              {(forecast.jobs?.length || 0) > 0 && `${forecast.jobs!.length} lavori`}
                              {((forecast.ordini.length > 0 || (forecast.jobs?.length || 0) > 0) && (forecast.bookings?.length || 0) > 0) && ' • '}
                              {(forecast.bookings?.length || 0) > 0 && `${forecast.bookings!.length} prenotazioni`}
                            </div>
                          </div>
                        </div>

                        {/* Lista ordini + jobs */}
                        <div className="space-y-2 pt-3 border-t border-gray-200">
                          {/* Ordini */}
                          {forecast.ordini.map((ordine) => (
                            <div
                              key={`order-${ordine.id}`}
                              className="flex justify-between items-center text-sm bg-white/50 p-2 rounded"
                            >
                              <span className="font-medium">{ordine.nomeSposi}</span>
                              <span className="text-orange-600 font-semibold">
                                {formatCurrency(ordine.importoResiduo)}
                              </span>
                            </div>
                          ))}

                          {/* Jobs con link a JobDetailPage */}
                          {(forecast.jobs || []).map((job) => (
                            <Link
                              key={`job-${job.id}`}
                              href={`/admin/jobs/${job.id}`}
                            >
                              <div className="flex justify-between items-center text-sm bg-white/50 p-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer group">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{job.clienteNome}</span>
                                  <span className="text-xs text-muted-foreground">• {job.jobType}</span>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-orange-600 font-semibold">
                                  {formatCurrency(job.importoResiduo)}
                                </span>
                              </div>
                            </Link>
                          ))}

                          {/* Prenotazioni (Bookings) */}
                          {(forecast.bookings || []).map((booking) => (
                            <div
                              key={`booking-${booking.id}`}
                              className="flex justify-between items-center text-sm bg-purple-50 p-2 rounded"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{booking.clienteNome}</span>
                                <span className="text-xs text-purple-600">• {booking.campaignNome}</span>
                              </div>
                              <span className="text-orange-600 font-semibold">
                                {formatCurrency(booking.importoResiduo)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
