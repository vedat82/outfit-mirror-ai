import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { initFrontendMonitoring, SentryErrorBoundary } from './monitoring/sentry.js';
import './styles/index.css';

initFrontendMonitoring();

function AppErrorFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-100 p-6 text-slate-950">
      <section className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">Bir sorun oluştu</p>
        <h1 className="mt-2 text-xl font-bold">Uygulama bu ekranı yükleyemedi.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Lütfen sayfayı yenileyip tekrar dene.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
        >
          Yenile
        </button>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<AppErrorFallback />}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </SentryErrorBoundary>
  </React.StrictMode>
);
