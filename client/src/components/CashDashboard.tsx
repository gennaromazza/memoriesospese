/**
 * Cash Dashboard - Dashboard Finanziaria Principale
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Wallet, DollarSign, Calendar as CalendarIcon, Download, BarChart3, FileText, Clock, ExternalLink, ShoppingBag, Mail, User, Phone } from "lucide-react";
import { getFinancialSummary, getMonthlyData, getAllCashMovements, getForecastedIncome, exportFinancialData } from "@/lib/cash";
import { getAllOrders } from "@/lib/orders";
import { getAllCampaigns } from "@/lib/booking-campaigns";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { it } from "date-fns/locale/it";
import { format } from "date-fns";

export default function CashDashboard() {
  // Helper per convertire Date | Timestamp in Date
  const toDate = (d: Date | Timestamp): Date => {
    return d instanceof Timestamp ? d.toDate() : d;
  };
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dateRange, setDateRange] = useState<"all" | "day" | "custom" | "month" | "quarter" | "year">("month");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [origineFilter, setOrigineFilter] = useState<CashMovementOrigine | "all">("all");
  const [temaFilter, setTemaFilter] = useState<string>("all");
  const [customDateFrom, setCustomDateFrom] = useState<Date>(new Date());
  const [customDateTo, setCustomDateTo] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Anni disponibili per selezione (ultimi 3 anni + anno corrente)
  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear, currentYear - 1, currentYear - 2];

  // Query per campagne
  const { data: campaigns } = useQuery({
    queryKey: ["booking-campaigns"],
    queryFn: getAllCampaigns,
  });

  const getDateRangeBounds = () => {
    const now = new Date();
    const cm = selectedYear === currentYear ? now.getMonth() : 0;
    const cq = Math.floor(cm / 3) * 3;
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (dateRange === "day") {
      startDate = new Date(customDateFrom.getFullYear(), customDateFrom.getMonth(), customDateFrom.getDate(), 0, 0, 0);
      endDate = new Date(customDateFrom.getFullYear(), customDateFrom.getMonth(), customDateFrom.getDate(), 23, 59, 59);
    } else if (dateRange === "custom") {
      startDate = new Date(customDateFrom.getFullYear(), customDateFrom.getMonth(), customDateFrom.getDate(), 0, 0, 0);
      endDate = new Date(customDateTo.getFullYear(), customDateTo.getMonth(), customDateTo.getDate(), 23, 59, 59);
    } else if (dateRange === "month") {
      startDate = new Date(selectedYear, cm, 1);
      endDate = new Date(selectedYear, cm + 1, 0);
    } else if (dateRange === "quarter") {
      startDate = new Date(selectedYear, cq, 1);
      endDate = new Date(selectedYear, cq + 3, 0);
    } else if (dateRange === "year") {
      startDate = new Date(selectedYear, 0, 1);
      endDate = new Date(selectedYear, 11, 31);
    }
    return { startDate, endDate };
  };

  // Query per riepilogo finanziario
  const { data: summary, isLoading: summaryLoading } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary", dateRange, selectedYear, customDateFrom.toISOString(), customDateTo.toISOString()],
    queryFn: async () => {
      const { startDate, endDate } = getDateRangeBounds();
      return getFinancialSummary(startDate, endDate);
    },
  });

  // Query per dati mensili (anno selezionato)
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<MonthlyData[]>({
    queryKey: ["monthly-data", selectedYear],
    queryFn: () => getMonthlyData(selectedYear),
  });

  // Query per ultimi movimenti (filtra per dateRange e anno)
  const { data: movements } = useQuery({
    queryKey: ["cash-movements", dateRange, selectedYear, customDateFrom.toISOString(), customDateTo.toISOString()],
    queryFn: async () => {
      const allMovements = await getAllCashMovements();
      const { startDate, endDate } = getDateRangeBounds();

      if (!startDate) return allMovements;

      return allMovements.filter((m) => {
        const movDate = m.data instanceof Timestamp ? m.data.toDate() : new Date(m.data);
        if (endDate) {
          return movDate >= startDate! && movDate <= endDate;
        }
        return movDate >= startDate!;
      });
    },
  });

  // Query per previsioni incasso (filtra per dateRange e anno)
  const { data: forecasts } = useQuery<ForecastedIncome[]>({
    queryKey: ["forecasted-income", dateRange, selectedYear, customDateFrom.toISOString(), customDateTo.toISOString()],
    queryFn: async () => {
      const allForecasts = await getForecastedIncome();
      const { startDate, endDate } = getDateRangeBounds();

      if (!startDate) return allForecasts;

      return allForecasts.filter((f) => {
        const fDate = f.data instanceof Date ? f.data : new Date(f.data);
        return fDate >= startDate! && fDate <= endDate!;
      });
    },
  });

  // Query per ultimi pagamenti ordini (filtra transazioni per dateRange e anno)
  const { data: orders } = useQuery({
    queryKey: ["orders-payments", dateRange, selectedYear, customDateFrom.toISOString(), customDateTo.toISOString()],
    queryFn: async () => {
      const allOrders = await getAllOrders();
      const { startDate, endDate } = getDateRangeBounds();

      if (!startDate) return allOrders;

      return allOrders
        .map((order) => ({
          ...order,
          transactions: (order.transactions || []).filter((t) => {
            const tDate = t.data instanceof Timestamp ? t.data.toDate() : new Date(t.data);
            return tDate >= startDate! && (!endDate || tDate <= endDate);
          }),
        }))
        .filter((order) => order.transactions && order.transactions.length > 0);
    },
  });

  
  // Helper per determinare origine se mancante (fallback in-memory)
  const inferOrigine = (m: CashMovementFE): CashMovementOrigine => {
    if (m.origine) return m.origine;
    // Fallback: determina origine dalla descrizione o riferimenti
    if (m.jobId) return 'job';
    if (m.bookingId) return 'booking';
    if (m.orderId) {
      const desc = (m.descrizione || '').toLowerCase();
      if (desc.includes('walk-in')) return 'walk-in';
      if (desc.includes('prenotazione') || desc.includes('booking')) return 'booking';
      return 'walk-in'; // Default per ordini senza booking
    }
    return 'manuale';
  };
  
  // Movimenti filtrati per origine e tema
  const filteredMovements = (movements || []).filter((m: CashMovementFE) => {
    const effectiveOrigine = inferOrigine(m);
    if (origineFilter !== "all" && effectiveOrigine !== origineFilter) return false;
    if (temaFilter !== "all" && m.origineTema !== temaFilter) return false;
    return true;
  });
  
  // Estrai temi unici dai movimenti e combina con campagne
  const temiDaiMovimenti = (movements || []).map((m: CashMovementFE) => m.origineTema).filter(Boolean) as string[];
  const temiDalleCampagne = (campaigns || []).map(c => c.nome);
  const uniqueTemi = [...new Set([...temiDaiMovimenti, ...temiDalleCampagne])];
  
  // Statistiche aggregate per origine (usa tutti i movimenti per panoramica globale)
  const statsByOrigine = (movements || []).reduce((acc, m: CashMovementFE) => {
    const origine = inferOrigine(m);
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
    const origine = inferOrigine(m);
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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

            {/* Controlli azioni - Semplificati */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Selezione Anno */}
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-[100px] text-xs sm:text-sm">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtri periodo - Compatti */}
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg flex-wrap">
                {[
                  { value: "day", label: "Giorno" },
                  { value: "custom", label: "Periodo" },
                  { value: "month", label: "Mese" },
                  { value: "quarter", label: "Trim." },
                  { value: "year", label: "Anno" },
                  { value: "all", label: "Tutto" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={dateRange === option.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setDateRange(option.value as any);
                      if (option.value === "day" || option.value === "custom") {
                        setCalendarOpen(true);
                      }
                    }}
                    className="text-xs px-2 py-1 h-7"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {/* Selezione data con calendario */}
              {(dateRange === "day" || dateRange === "custom") && (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {dateRange === "day" ? (
                        format(customDateFrom, "d MMM yyyy", { locale: it })
                      ) : (
                        <>
                          {format(customDateFrom, "d MMM", { locale: it })} - {format(customDateTo, "d MMM yyyy", { locale: it })}
                        </>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    {dateRange === "day" ? (
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={(date) => {
                          if (date) {
                            setCustomDateFrom(date);
                            setCustomDateTo(date);
                            setCalendarOpen(false);
                          }
                        }}
                        locale={it}
                        initialFocus
                      />
                    ) : (
                      <div className="p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Seleziona intervallo date</p>
                        <Calendar
                          mode="range"
                          selected={{ from: customDateFrom, to: customDateTo }}
                          onSelect={(range) => {
                            if (range?.from) setCustomDateFrom(range.from);
                            if (range?.to) {
                              setCustomDateTo(range.to);
                              setCalendarOpen(false);
                            }
                          }}
                          locale={it}
                          numberOfMonths={1}
                          initialFocus
                        />
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {/* Filtro attivo - mostra solo se c'è un filtro attivo */}
              {(origineFilter !== "all" || temaFilter !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setOrigineFilter("all"); setTemaFilter("all"); }}
                  className="text-xs h-8 text-muted-foreground"
                >
                  Rimuovi filtri
                </Button>
              )}

              {/* Export - Icona sola su mobile */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const startDate = new Date(selectedYear, 0, 1);
                  const endDate = new Date(selectedYear, 11, 31);
                  await exportFinancialData(startDate, endDate);
                }}
                className="text-xs h-8 px-2"
                title="Esporta Excel"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

      {/* Statistiche per Origine - Mostra breakdown entrate/uscite per fonte */}
      {(origineFilter !== "all" || temaFilter !== "all") && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Filtro Attivo: {origineFilter !== "all" ? CASH_ORIGINE_LABELS[origineFilter] : "Tutte le origini"} 
              {temaFilter !== "all" && ` → ${temaFilter}`}
              <span className="text-xs font-normal text-muted-foreground ml-2">
                ({filteredMovements.length} movimenti)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredMovements.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">Nessun movimento trovato con questi filtri.</p>
                <p className="text-xs mt-1">I movimenti potrebbero non avere origine/tema assegnato. Esegui la migrazione dalla console: <code className="bg-gray-100 px-1 rounded">migrateMovementsComplete()</code></p>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Riepilogo per Origine - Con sottomenu campagne per Prenotazioni */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(["walk-in", "booking", "job", "manuale"] as const).map((origine) => {
          const stats = statsByOrigine[origine] || { entrate: 0, uscite: 0, count: 0 };
          const isActive = origineFilter === origine || (origine === "booking" && temaFilter !== "all");
          
          // Per "booking" mostriamo un popover con le campagne
          if (origine === "booking") {
            return (
              <Popover key={origine}>
                <PopoverTrigger asChild>
                  <div 
                    className={`p-2 sm:p-3 rounded-lg border transition-all cursor-pointer ${
                      isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {CASH_ORIGINE_LABELS[origine]}
                        {temaFilter !== "all" && <span className="ml-1 text-blue-600">({temaFilter})</span>}
                      </div>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-sm sm:text-base font-bold text-green-600">
                      {formatCurrency(stats.entrate)}
                    </div>
                    {stats.uscite > 0 && (
                      <div className="text-[10px] sm:text-xs text-red-500">-{formatCurrency(stats.uscite)}</div>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-1">
                    <button
                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 ${
                        origineFilter === "booking" && temaFilter === "all" ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                      onClick={() => { setOrigineFilter("booking"); setTemaFilter("all"); }}
                    >
                      Tutte le prenotazioni
                    </button>
                    {uniqueTemi.map((tema) => (
                      <button
                        key={tema}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 ${
                          temaFilter === tema ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                        onClick={() => { setOrigineFilter("booking"); setTemaFilter(tema); }}
                      >
                        {tema}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            );
          }
          
          return (
            <div 
              key={origine}
              className={`p-2 sm:p-3 rounded-lg border transition-all cursor-pointer ${
                isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => { setOrigineFilter(isActive ? "all" : origine); setTemaFilter("all"); }}
            >
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">
                {CASH_ORIGINE_LABELS[origine]}
              </div>
              <div className="text-sm sm:text-base font-bold text-green-600">
                {formatCurrency(stats.entrate)}
              </div>
              {stats.uscite > 0 && (
                <div className="text-[10px] sm:text-xs text-red-500">-{formatCurrency(stats.uscite)}</div>
              )}
            </div>
          );
        })}
      </div>

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

      {/* Riepilogo Giornaliero - visibile in modalità Giorno/Periodo */}
      {(dateRange === "day" || dateRange === "custom") && filteredMovements.length > 0 && (() => {
        const dailyMap: Record<string, { entrate: number; uscite: number; movimenti: CashMovementFE[] }> = {};
        filteredMovements.forEach((m: CashMovementFE) => {
          const d = toDate(m.data);
          const key = format(d, "yyyy-MM-dd");
          if (!dailyMap[key]) dailyMap[key] = { entrate: 0, uscite: 0, movimenti: [] };
          if (m.tipo === "entrata") dailyMap[key].entrate += m.importo;
          else dailyMap[key].uscite += m.importo;
          dailyMap[key].movimenti.push(m);
        });
        const days = Object.keys(dailyMap).sort().reverse();

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-600" />
                {dateRange === "day" ? "Dettaglio Giornata" : `Dettaglio per Giorno (${days.length} giorni)`}
              </CardTitle>
              <CardDescription className="text-xs">
                {dateRange === "day"
                  ? format(customDateFrom, "EEEE d MMMM yyyy", { locale: it })
                  : `${format(customDateFrom, "d MMM yyyy", { locale: it })} → ${format(customDateTo, "d MMM yyyy", { locale: it })}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {days.map((dayKey) => {
                  const day = dailyMap[dayKey];
                  const dayDate = new Date(dayKey + "T00:00:00");
                  const saldo = day.entrate - day.uscite;
                  return (
                    <div key={dayKey} className="border rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {format(dayDate, "EEEE d MMM", { locale: it })}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({day.movimenti.length} mov.)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-600 font-semibold">+{formatCurrency(day.entrate)}</span>
                          {day.uscite > 0 && <span className="text-red-600 font-semibold">-{formatCurrency(day.uscite)}</span>}
                          <span className={`font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            = {formatCurrency(saldo)}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y">
                        {day.movimenti.map((mov) => (
                          <div key={mov.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/20">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-muted-foreground whitespace-nowrap">
                                {format(toDate(mov.data), "HH:mm")}
                              </span>
                              <span className="truncate max-w-[200px] sm:max-w-[300px]" title={mov.descrizione}>
                                {mov.descrizione}
                              </span>
                              <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] whitespace-nowrap">
                                {CASH_ORIGINE_LABELS[inferOrigine(mov)] || 'Altro'}
                              </span>
                            </div>
                            <span className={`font-semibold whitespace-nowrap ml-2 ${mov.tipo === 'entrata' ? 'text-green-600' : 'text-red-600'}`}>
                              {mov.tipo === 'entrata' ? '+' : '-'}{formatCurrency(mov.importo)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

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

      {/* Ultimi Movimenti - Unificato */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Ultimi Movimenti</CardTitle>
          <CardDescription className="text-xs">
            {filteredMovements.length} movimenti nel periodo selezionato
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold">Data</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold">Descrizione</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold">Origine</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold">Importo</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.slice(0, 15).map((mov) => (
                  <tr key={mov.id} className="border-t hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs whitespace-nowrap">
                      {toDate(mov.data).toLocaleDateString("it-IT")}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs">
                      <div className="max-w-[200px] truncate" title={mov.descrizione}>
                        {mov.descrizione}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {CASH_ORIGINE_LABELS[inferOrigine(mov)] || 'Altro'}
                      </span>
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold text-right whitespace-nowrap ${mov.tipo === 'entrata' ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.tipo === 'entrata' ? '+' : '-'}{formatCurrency(mov.importo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredMovements.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              Nessun movimento nel periodo selezionato
            </div>
          )}
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
                              <CalendarIcon className="h-5 w-5 text-gray-600" />
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
