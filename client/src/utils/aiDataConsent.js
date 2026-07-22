const consentStorageKey = 'outfitMirrorAiDataConsentV1';

const consentCopy = {
  en: [
    'Allow AI data sharing?',
    '',
    'To provide the AI feature you requested, Outfit Mirror AI will send the photo you selected and related style information (such as clothing details, appearance profile, and preferences) to OpenAI. See On Me generation may also use FAL.ai.',
    '',
    'This data is used only to generate your requested analysis or preview. Do you allow this sharing?'
  ].join('\n'),
  tr: [
    'AI veri paylaşımına izin veriyor musunuz?',
    '',
    'İstediğiniz AI özelliğini sunmak için Outfit Mirror AI, seçtiğiniz fotoğrafı ve ilgili stil bilgilerini (kıyafet ayrıntıları, görünüm profili ve tercihler gibi) OpenAI ile paylaşacaktır. Üzerimde Gör üretimi ayrıca FAL.ai kullanabilir.',
    '',
    'Bu veriler yalnızca istediğiniz analiz veya önizlemeyi üretmek için kullanılır. Bu paylaşıma izin veriyor musunuz?'
  ].join('\n')
};

export function hasAiDataConsent() {
  try {
    return window.localStorage.getItem(consentStorageKey) === 'granted';
  } catch {
    return false;
  }
}

export function ensureAiDataConsent(language = 'en') {
  if (hasAiDataConsent()) return true;

  const granted = window.confirm(consentCopy[language] || consentCopy.en);
  if (!granted) {
    const error = new Error('messages.aiDataConsentRequired');
    error.code = 'AI_DATA_CONSENT_REQUIRED';
    throw error;
  }

  try {
    window.localStorage.setItem(consentStorageKey, 'granted');
  } catch {
    // Consent still applies to the current request if storage is unavailable.
  }
  return true;
}

export function resetAiDataConsent() {
  try {
    window.localStorage.removeItem(consentStorageKey);
  } catch {
    // Keep privacy controls non-blocking when storage is unavailable.
  }
}
