'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Consent = 'granted' | 'denied' | null;
const KEY = 'dp_consent_v1';

const ID_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * GA4, GTM e Meta Pixel só carregam depois do consentimento (LGPD).
 * Se nenhum ID estiver configurado no painel, nada é renderizado.
 */
export function ThirdPartyScripts(props: { ga4Id: string; gtmId: string; metaPixelId: string }) {
  const ga4Id = ID_PATTERN.test(props.ga4Id) ? props.ga4Id : '';
  const gtmId = ID_PATTERN.test(props.gtmId) ? props.gtmId : '';
  const metaPixelId = ID_PATTERN.test(props.metaPixelId) ? props.metaPixelId : '';
  const any = Boolean(ga4Id || gtmId || metaPixelId);

  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: Consent = null;
    try {
      stored = (localStorage.getItem(KEY) as Consent) ?? null;
    } catch {
      /* sem storage: pergunta de novo */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage após montar
    setConsent(stored);
    setReady(true);
  }, []);

  function decide(value: 'granted' | 'denied') {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignora */
    }
    setConsent(value);
  }

  if (!any || !ready) return null;

  return (
    <>
      {consent === 'granted' && (
        <>
          {gtmId && (
            <Script id="gtm" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}</Script>
          )}
          {ga4Id && (
            <>
              <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
              <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga4Id}');`}</Script>
            </>
          )}
          {metaPixelId && (
            <Script id="meta-pixel" strategy="lazyOnload">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}</Script>
          )}
        </>
      )}
      {consent === null && (
        <div
          role="dialog"
          aria-label="Preferências de cookies"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-2xl bg-cocoa p-5 text-cream shadow-2xl md:inset-x-auto md:bottom-6 md:left-6"
        >
          <p className="text-sm leading-relaxed text-cream/85">
            Usamos cookies de medição para entender como o site é usado e melhorar a sua experiência.{' '}
            <Link href="/politica-de-privacidade" className="underline underline-offset-2">
              Saiba mais
            </Link>
            .
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => decide('granted')} className="btn btn-light !min-h-10 !px-5 !text-[0.7rem]">
              Aceitar
            </button>
            <button type="button" onClick={() => decide('denied')} className="btn btn-outline-light !min-h-10 !px-5 !text-[0.7rem]">
              Recusar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
