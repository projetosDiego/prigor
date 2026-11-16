import Image from 'next/image';
import Link from 'next/link';

/** Logo oficial — arquivo original, sem recoloração nem distorção (440×387). */
export function Logo({ height = 52, link = true, className = '' }: { height?: number; link?: boolean; className?: string }) {
  const img = (
    <Image
      src="/brand/logo-doces-prigor.png"
      alt="Doces Prigor"
      width={Math.round((height * 440) / 387)}
      height={height}
      preload
      className={className}
    />
  );
  if (!link) return img;
  return (
    <Link href="/" aria-label="Doces Prigor — página inicial" className="inline-flex shrink-0">
      {img}
    </Link>
  );
}
