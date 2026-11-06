/** Document HTML also works outside the page's CSS and after downloading. */
export function documentAssetUrl(path:string,origin=typeof window!=='undefined'?window.location.origin:'https://duindorpsv.nl'){
 return new URL(path,origin).href;
}
export function documentHeadingCss(){return `@font-face{font-family:'Permanent Marker';src:url('${documentAssetUrl('/fonts/club-font-9.ttf')}') format('truetype');font-weight:400;font-style:normal;font-display:swap}h1,h2,h3,h4,h5,h6{font-family:'Permanent Marker',cursive;font-weight:400;font-style:normal;font-synthesis:none;line-height:1.22;letter-spacing:normal;overflow-wrap:anywhere}`;}
