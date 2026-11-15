import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import "../../src/index.css";
import BookingPage from "../../src/pages/BookingPage";

const key = "booking-deposit-browser-harness";
const queryScenario = new URLSearchParams(window.location.search).get("scenario") || "success";
const saved = window.localStorage.getItem(key);
if (!window.__bookingPaymentHarness) {
  window.__bookingPaymentHarness = saved ? JSON.parse(saved) : {
    scenario: queryScenario,
    calls: [],
    hold: null,
    payment: null,
    released: false,
    resolveCapture: false,
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Switch>
          <Route path="/prenota/:code" component={BookingPage} />
          <Route>Harness pronto</Route>
        </Switch>
      </Router>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
