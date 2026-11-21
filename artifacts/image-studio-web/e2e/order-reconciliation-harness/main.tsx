import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import BookingsManager from '../../src/components/BookingsManager';
import { queryClient } from './query-client';
import { readOrder, saveOrder } from './firestore';
import { isBookingListenerPending, readBooking, releaseBookingListener, saveBooking } from './boundaries';
import '../../src/index.css';

Object.assign(window, { fixture: {
  readOrder, saveOrder,
  readBooking, saveBooking, releaseBookingListener, isBookingListenerPending,
  reloadOrders: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
} });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Router><main className="p-6"><BookingsManager /></main></Router>
  </QueryClientProvider>,
);
