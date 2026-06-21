import { useI18n } from '../i18n/I18nProvider.jsx';

export default function PaymentResultPage({ status, isLoading, onContinue }) {
  const { t } = useI18n();
  const isSuccess = status === 'success';

  return (
    <main className="flex min-h-dvh overflow-x-hidden bg-slate-100 px-4 py-8 text-slate-950">
      <section className="m-auto w-full max-w-md min-w-0 rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl ${isSuccess ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}>
          {isSuccess ? '✓' : '!'}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-normal text-slate-950">
          {isSuccess ? t('paymentResult.successTitle') : t('paymentResult.failedTitle')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isLoading
            ? t('paymentResult.checking')
            : isSuccess
              ? t('paymentResult.successDescription')
              : t('paymentResult.failedDescription')}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {t('paymentResult.continue')}
        </button>
      </section>
    </main>
  );
}
