import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { sorguSecenekleri } from './lib/sorgu';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });

const kok = document.getElementById('root');
if (kok === null) {
  throw new Error('#root bulunamadı.');
}

createRoot(kok).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
