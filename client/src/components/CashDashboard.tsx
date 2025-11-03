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
import { TrendingUp, TrendingDown, Wallet, DollarSign, Calendar, Download, BarChart3, FileText, Clock } from "lucide-react";
import { getFinancialSummary, getMonthlyData, getAllCashMovements, getForecastedIncome } from "@/lib/cash";
import { getAllOrders } from "@/lib/orders";
import CashRegister from "./CashRegister";
import type { FinancialSummary, MonthlyData, ForecastedIncome } from "@shared/cash-types";

export default function CashDashboard() {
  // Helper per convertire Date | Timestamp in Date
  const toDate = (d: Date | Timestamp): Date => {
    return d instanceof Timestamp ? d.toDate() : d;
  };
  const [dateRange, setDateRange] = useState<"all" | "month" | "quarter" | "year">("month");

  // Query per riepilogo finanziario
  const { data: summary, isLoading: summaryLoading } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary", dateRange],
    queryFn: async () => {
      const now = new Date();
      let startDate: Date | undefined;

      if (dateRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === "quarter") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else if (dateRange === "year") {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      return getFinancialSummary(startDate);
    },
  });

  // Query per dati mensili
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<MonthlyData[]>({
    queryKey: ["monthly-data"],
    queryFn: getMonthlyData,
  });

  // Query per ultimi movimenti
  const { data: movements } = useQuery({
    queryKey: ["cash-movements"],
    queryFn: getAllCashMovements,
  });

  // Query per previsioni incasso
  const { data: forecasts } = useQuery<ForecastedIncome[]>({
    queryKey: ["forecasted-income"],
    queryFn: getForecastedIncome,
  });

  // Query per ultimi pagamenti ordini
  const { data: orders } = useQuery({
    queryKey: ["orders-payments"],
    queryFn: getAllOrders,
  });

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
    <Tabs defaultValue="dashboard" className="w-full">
      {/* Sub-Tabs Navigation */}
      <TabsList className="mb-6 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
        <TabsTrigger value="dashboard" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
          <BarChart3 className="h-4 w-4 flex-shrink-0" />
          Dashboard
        </TabsTrigger>
        <TabsTrigger value="register" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
          <FileText className="h-4 w-4 flex-shrink-0" />
          Registro Cassa
        </TabsTrigger>
        <TabsTrigger value="forecasts" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
          <Clock className="h-4 w-4 flex-shrink-0" />
          Previsioni
        </TabsTrigger>
      </TabsList>

      {/* Dashboard Tab */}
      <TabsContent value="dashboard">
        <div className="space-y-6">
          {/* Header con filtri data */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-blue-gray">💰 Dashboard Finanziaria</h2>
              <p className="text-sm text-muted-foreground">
                Panoramica completa entrate, uscite e previsioni
              </p>
            </div>

        <div className="flex gap-2">
          <Button
            variant={dateRange === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("month")}
          >
            Questo Mese
          </Button>
          <Button
            variant={dateRange === "quarter" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("quarter")}
          >
            Trimestre
          </Button>
          <Button
            variant={dateRange === "year" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("year")}
          >
            Anno
          </Button>
          <Button
            variant={dateRange === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("all")}
          >
            Tutto
          </Button>
        </div>
      </div>

      {/* Card Riepilogo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entrate Totali */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Entrate Totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.totaleEntrate || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ordini: {formatCurrency(summary?.entrateOrdini || 0)}
              <br />
              Altre: {formatCurrency(summary?.entrateAltre || 0)}
            </p>
          </CardContent>
        </Card>

        {/* Uscite Totali */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Uscite Totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.totaleUscite || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Spese cassa registrate
            </p>
          </CardContent>
        </Card>

        {/* Saldo Corrente */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-600" />
              Saldo Netto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.saldo || 0) >= 0 ? "text-blue-600" : "text-red-600"}`}>
              {formatCurrency(summary?.saldo || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Entrate - Uscite
            </p>
          </CardContent>
        </Card>

        {/* Incassi Previsti */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              Incassi Previsti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(
                forecasts?.reduce((sum, f) => sum + f.importo, 0) || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
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

      {/* Tabelle Movimenti e Pagamenti */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Dettaglio Movimenti</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="payments">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="payments">Pagamenti Ordini</TabsTrigger>
              <TabsTrigger value="cash">Movimenti Cassa</TabsTrigger>
            </TabsList>

            <TabsContent value="payments" className="mt-4">
              <div className="rounded-md border">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Cliente</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Tipo</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Importo</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Data</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Metodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders?.slice(0, 10).map((order) =>
                      (order.transactions || []).map((t, idx) => (
                        <tr key={`${order.id}-${idx}`} className="border-t">
                          <td className="px-4 py-2 text-sm">{order.nomeCliente}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${t.tipo === 'acconto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                              {t.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm font-semibold">{formatCurrency(t.importo)}</td>
                          <td className="px-4 py-2 text-sm">
                            {toDate(t.data).toLocaleDateString("it-IT")}
                          </td>
                          <td className="px-4 py-2 text-sm">{t.metodo}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="cash" className="mt-4">
              <div className="rounded-md border">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Descrizione</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Categoria</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Tipo</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Importo</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements?.slice(0, 10).map((mov) => (
                      <tr key={mov.id} className="border-t">
                        <td className="px-4 py-2 text-sm">{mov.descrizione}</td>
                        <td className="px-4 py-2 text-sm text-muted-foreground">{mov.categoria}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${mov.tipo === 'entrata' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-sm font-semibold ${mov.tipo === 'entrata' ? 'text-green-600' : 'text-red-600'}`}>
                          {mov.tipo === 'entrata' ? '+' : '-'}{formatCurrency(mov.importo)}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {toDate(mov.data).toLocaleDateString("it-IT")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!movements || movements.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nessun movimento cassa registrato. Aggiungi il primo movimento dalla sezione "Registro Cassa".
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
        </div>
      </TabsContent>

      {/* Registro Cassa Tab */}
      <TabsContent value="register">
        <CashRegister />
      </TabsContent>

      {/* Previsioni Tab */}
      <TabsContent value="forecasts">
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-blue-gray">📅 Calendario Incassi Previsti</h3>
            <p className="text-sm text-muted-foreground">
              Saldi residui da ordini raggruppati per data servizio
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
                              {forecast.ordini.length} ordini
                            </div>
                          </div>
                        </div>

                        {/* Lista ordini */}
                        <div className="space-y-2 pt-3 border-t border-gray-200">
                          {forecast.ordini.map((ordine) => (
                            <div
                              key={ordine.id}
                              className="flex justify-between items-center text-sm bg-white/50 p-2 rounded"
                            >
                              <span className="font-medium">{ordine.nomeSposi}</span>
                              <span className="text-orange-600 font-semibold">
                                {formatCurrency(ordine.importoResiduo)}
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
