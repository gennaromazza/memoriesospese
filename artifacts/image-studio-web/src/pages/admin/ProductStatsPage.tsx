/**
 * Product Stats Dashboard - Statistiche vendite prodotti
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Package, ShoppingCart, TrendingUp, Euro, BarChart3, ListOrdered, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface ProductStat {
  prodottoId: string;
  prodottoNome: string;
  isCustom: boolean;
  quantitaVenduta: number;
  quantitaPrenotata: number;
  totaleQuantita: number;
  fatturatoVenduto: number;
  fatturatoPrevisto: number;
  totaleFatturato: number;
}

interface ProductStatsResponse {
  riepilogo: {
    totaleVenduto: number;
    totalePrevisto: number;
    totaleFatturato: number;
    totaleQtaVenduta: number;
    totaleQtaPrenotata: number;
    totaleQtaTotale: number;
    numeroProdottiDistinti: number;
    numeroProdottiCatalogo: number;
    numeroProdottiCustom: number;
    ordiniAnalizzati: number;
    prenotazioniAnalizzate: number;
  };
  prodotti: ProductStat[];
  prodottiCatalogo: ProductStat[];
  prodottiCustom: ProductStat[];
  top10: ProductStat[];
}

const COLORS = ['#8b9a7d', '#c17f59', '#6b7d8a', '#a8c5b5', '#d4a574', '#7d8b6b', '#8a7d6b', '#5a7d8a', '#9ab58c', '#b58c7d'];

export default function ProductStatsPage() {
  const [filter, setFilter] = useState<"tutti" | "catalogo" | "custom">("tutti");

  const { data, isLoading, error } = useQuery<ProductStatsResponse>({
    queryKey: ["product-stats"],
    queryFn: async () => {
      const res = await fetch("/api/products/stats");
      if (!res.ok) throw new Error("Errore caricamento statistiche");
      return res.json();
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("it-IT").format(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">Errore nel caricamento delle statistiche prodotti</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { riepilogo, top10 } = data;
  
  const filteredProducts = filter === "tutti" 
    ? data.prodotti 
    : filter === "catalogo" 
      ? data.prodottiCatalogo 
      : data.prodottiCustom;

  const chartData = top10.map(p => ({
    name: p.prodottoNome.length > 20 ? p.prodottoNome.substring(0, 20) + '...' : p.prodottoNome,
    fullName: p.prodottoNome,
    venduto: p.fatturatoVenduto,
    previsto: p.fatturatoPrevisto,
    quantita: p.totaleQuantita,
    isCustom: p.isCustom
  }));

  const pieData = [
    { name: 'Catalogo', value: riepilogo.numeroProdottiCatalogo, color: '#8b9a7d' },
    { name: 'Custom', value: riepilogo.numeroProdottiCustom, color: '#c17f59' }
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Navigazione */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="btn-back-dashboard">
            <ArrowLeft className="h-4 w-4" />
            Torna alla Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#8b9a7d]" data-testid="title-product-stats">
            Statistiche Prodotti
          </h1>
          <p className="text-muted-foreground mt-1">
            Analisi vendite e prenotazioni per prodotto
          </p>
        </div>
        <Badge variant="outline" className="text-xs sm:text-sm w-fit">
          {riepilogo.ordiniAnalizzati} ordini • {riepilogo.prenotazioniAnalizzate} prenotazioni
        </Badge>
      </div>

      {/* Cards Riepilogo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-fatturato-venduto">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fatturato Venduto</CardTitle>
            <Euro className="h-4 w-4 text-[#8b9a7d]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#8b9a7d]">
              {formatCurrency(riepilogo.totaleVenduto)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(riepilogo.totaleQtaVenduta)} prodotti venduti
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-fatturato-previsto">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fatturato Previsto</CardTitle>
            <TrendingUp className="h-4 w-4 text-[#c17f59]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#c17f59]">
              {formatCurrency(riepilogo.totalePrevisto)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(riepilogo.totaleQtaPrenotata)} prodotti prenotati
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-totale-fatturato">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Fatturato</CardTitle>
            <ShoppingCart className="h-4 w-4 text-[#6b7d8a]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(riepilogo.totaleFatturato)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(riepilogo.totaleQtaTotale)} prodotti totali
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-prodotti-distinti">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prodotti Distinti</CardTitle>
            <Package className="h-4 w-4 text-[#a8c5b5]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(riepilogo.numeroProdottiDistinti)}
            </div>
            <p className="text-xs text-muted-foreground">
              {riepilogo.numeroProdottiCatalogo} catalogo • {riepilogo.numeroProdottiCustom} custom
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs per Grafici e Tabella */}
      <Tabs defaultValue="chart" className="w-full">
        <TabsList className="mb-4 grid grid-cols-2 w-full sm:w-auto sm:inline-grid gap-1">
          <TabsTrigger value="chart" className="flex items-center gap-2" data-testid="tab-chart">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Grafico Top 10</span>
            <span className="sm:hidden">Grafico</span>
          </TabsTrigger>
          <TabsTrigger value="table" className="flex items-center gap-2" data-testid="tab-table">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Classifica Completa</span>
            <span className="sm:hidden">Classifica</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Grafico a Barre - Top 10 */}
            <Card className="lg:col-span-2" data-testid="chart-top10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#8b9a7d]" />
                  Top 10 Prodotti per Fatturato
                </CardTitle>
                <CardDescription>
                  Venduto vs Previsto per i migliori prodotti
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tickFormatter={(v) => `€${v.toLocaleString('it-IT')}`} />
                      <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                      />
                      <Legend />
                      <Bar dataKey="venduto" name="Venduto" fill="#8b9a7d" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="previsto" name="Previsto" fill="#c17f59" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Grafico a Torta - Catalogo vs Custom */}
            <Card data-testid="chart-pie">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#c17f59]" />
                  Catalogo vs Custom
                </CardTitle>
                <CardDescription>
                  Distribuzione tipologia prodotti
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#8b9a7d]" />
                    <span className="text-sm">Catalogo ({riepilogo.numeroProdottiCatalogo})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#c17f59]" />
                    <span className="text-sm">Custom ({riepilogo.numeroProdottiCustom})</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="table">
          <Card data-testid="table-products">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Classifica Prodotti</CardTitle>
                  <CardDescription>
                    Tutti i prodotti ordinati per fatturato totale
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge 
                    variant={filter === "tutti" ? "default" : "outline"}
                    className="cursor-pointer hover:bg-[#8b9a7d]/20"
                    onClick={() => setFilter("tutti")}
                    data-testid="filter-tutti"
                  >
                    Tutti ({data.prodotti.length})
                  </Badge>
                  <Badge 
                    variant={filter === "catalogo" ? "default" : "outline"}
                    className="cursor-pointer hover:bg-[#8b9a7d]/20"
                    onClick={() => setFilter("catalogo")}
                    data-testid="filter-catalogo"
                  >
                    Catalogo ({data.prodottiCatalogo.length})
                  </Badge>
                  <Badge 
                    variant={filter === "custom" ? "default" : "outline"}
                    className="cursor-pointer hover:bg-[#c17f59]/20"
                    onClick={() => setFilter("custom")}
                    data-testid="filter-custom"
                  >
                    Custom ({data.prodottiCustom.length})
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Prodotto</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-right">Qta Venduta</TableHead>
                      <TableHead className="text-right">Qta Prenotata</TableHead>
                      <TableHead className="text-right">Fatturato Venduto</TableHead>
                      <TableHead className="text-right">Fatturato Previsto</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Nessun prodotto trovato
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product, index) => (
                        <TableRow key={product.prodottoId || product.prodottoNome} data-testid={`row-product-${index}`}>
                          <TableCell className="font-medium text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate" title={product.prodottoNome}>
                            {product.prodottoNome}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant="outline" 
                              className={product.isCustom ? "bg-[#c17f59]/10 text-[#c17f59] border-[#c17f59]/30" : "bg-[#8b9a7d]/10 text-[#8b9a7d] border-[#8b9a7d]/30"}
                            >
                              {product.isCustom ? "Custom" : "Catalogo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(product.quantitaVenduta)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(product.quantitaPrenotata)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[#8b9a7d]">
                            {formatCurrency(product.fatturatoVenduto)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[#c17f59]">
                            {formatCurrency(product.fatturatoPrevisto)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatCurrency(product.totaleFatturato)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
