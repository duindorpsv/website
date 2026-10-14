/** Decorative print only: opacity is never applied to section content. */
export function ClubmuurSectionArt({scene}:{scene:'wijkpanorama'|'houtrust'}){
  const base=`/assets/clubmuur-brush-v25/section-${scene}`;
  return <picture className={`cm-section-art cm-section-art-${scene}`} aria-hidden="true">
    <source type="image/avif" srcSet={`${base}-800.avif 800w, ${base}-1600.avif 1600w`} sizes="(max-width: 700px) 100vw, 80vw"/>
    <img src={`${base}-1600.webp`} srcSet={`${base}-800.webp 800w, ${base}-1600.webp 1600w`} sizes="(max-width: 700px) 100vw, 80vw" alt="" width={1600} height={900} loading="lazy" decoding="async"/>
  </picture>;
}
