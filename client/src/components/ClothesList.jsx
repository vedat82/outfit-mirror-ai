import { useI18n } from '../i18n/I18nProvider.jsx';

export default function ClothesList({ clothes, isLoading, className = '' }) {
  const { t, optionLabel } = useI18n();

  return (
    <section className={`flex flex-col rounded-md border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">{t('closet.title')}</h2>
        <span className="text-sm text-slate-500">{t('closet.count', { count: clothes.length })}</span>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : clothes.length === 0 ? (
        <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <div>
          <p className="text-sm font-semibold text-slate-800">{t('closet.emptyTitle')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('closet.emptyDescription')}</p>
          </div>
        </div>
      ) : (
        <div className="max-h-80 min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-none">
        <div className="grid gap-3">
          {clothes.map((item) => (
            <article key={item.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={t('closet.itemPhotoAlt')} className="h-14 w-14 rounded-md border border-slate-100 object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-md border border-slate-100 bg-slate-100" />
                )}
                <div className="min-w-0">
                  <p className="font-medium capitalize text-slate-950">{optionLabel('colors', item.color)}</p>
                  <p className="text-sm capitalize text-slate-500">{optionLabel('types', item.type)}</p>
                  {item.style ? <p className="text-xs capitalize text-slate-400">{optionLabel('styles', item.style)}</p> : null}
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
                {optionLabel('seasons', item.season)}
              </span>
            </article>
          ))}
        </div>
        </div>
      )}
    </section>
  );
}
