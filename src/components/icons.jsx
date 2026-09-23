// HLauncher'a özel ikon seti. Ortak dil: köşeli çizgiler (kare uç, keskin
// birleşim) + her ikonda tek bir dolu "piksel". Piksel rengi --px değişkeninden
// gelir; ray/düğme aktifken vurgu rengine döner — launcher'ın imza detayı.
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  'aria-hidden': true,
  focusable: false,
};

const px = { fill: 'var(--px, currentColor)', stroke: 'none' };

function Svg({ size, children, ...rest }) {
  return (
    <svg {...base} width={size ?? base.width} height={size ?? base.height} {...rest}>
      {children}
    </svg>
  );
}

export function IconHome(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9v11h13V9" />
      <rect x="10.5" y="14" width="3" height="6" {...px} />
    </Svg>
  );
}

export function IconServers(props) {
  return (
    <Svg {...props}>
      <path d="M4 4h13l3 3v4H4z" />
      <path d="M4 13h16v4l-3 3H4z" />
      <rect x="7" y="6.25" width="2.5" height="2.5" {...px} />
      <rect x="7" y="15.25" width="2.5" height="2.5" {...px} />
    </Svg>
  );
}

export function IconProfiles(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8z" />
      <path d="M3.5 12.5 12 17l8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
      <rect x="10.75" y="6.75" width="2.5" height="2.5" {...px} />
    </Svg>
  );
}

// Keşfet: köşeli büyüteç, merkezde piksel
export function IconBrowse(props) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h7l3 3v7l-3 3h-7l-3-3v-7z" />
      <path d="m16.5 16.5 4 4" />
      <rect x="8.75" y="8.75" width="2.5" height="2.5" {...px} />
    </Svg>
  );
}

// Yeni: artı, ortada piksel
export function IconAdd(props) {
  return (
    <Svg {...props}>
      <path d="M12 4.5v5.5M12 14v5.5M4.5 12H10M14 12h5.5" />
      <rect x="10.75" y="10.75" width="2.5" height="2.5" {...px} />
    </Svg>
  );
}

// Ayarlar: klasik dişli yerine "mikser" — üç ray, üç sürgü
export function IconSettings(props) {
  return (
    <Svg {...props}>
      <path d="M4 6h3.5M12 6h8M4 12h9.5M18 12h2M4 18h1.5M10 18h10" />
      <rect x="7.5" y="4" width="4" height="4" {...px} />
      <rect x="13.5" y="10" width="4" height="4" {...px} />
      <rect x="5.5" y="16" width="4" height="4" {...px} />
    </Svg>
  );
}

// Hesap: blok kafa (Minecraft oyuncusu), iki piksel göz
export function IconAccount(props) {
  return (
    <Svg {...props}>
      <path d="M7 3h10v10H7z" />
      <path d="M4 21v-2.5L7 16h10l3 2.5V21" />
      <rect x="9" y="7" width="2" height="2" {...px} />
      <rect x="13" y="7" width="2" height="2" {...px} />
    </Svg>
  );
}

// Oyna: pahlı üçgen, dolu
export function IconPlay({ size = 22, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable={false} {...rest}>
      <path d="M7 3.5h2L20 11v2L9 20.5H7z" fill="currentColor" />
    </svg>
  );
}

export function IconStop({ size = 22, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable={false} {...rest}>
      <path d="M5 5h11l3 3v11H8l-3-3z" fill="currentColor" />
    </svg>
  );
}

// Discord logosu (simple-icons, CC0)
export function IconDiscord({ size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable={false} {...rest}>
      <path
        fill="currentColor"
        d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
      />
    </svg>
  );
}
