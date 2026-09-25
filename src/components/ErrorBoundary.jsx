// Çizim hatası sınırı: sunucudan beklenmedik biçimde gelen bir veri (ya da bir hata) bir sayfayı
// çökertirse tüm pencere boşalmasın; yalnızca o alan hata mesajı + "Tekrar dene" gösterir.
// Pencere düğmeleri ve ray sınırın dışında kalır, uygulama kullanılabilir kalır.
import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useI18n } from '../i18n.jsx';

export function ErrorFallback({ onRetry }) {
  const { t } = useI18n();
  return (
    <div className="empty" role="alert">
      <div className="empty-icon"><AlertTriangle size={26} /></div>
      <p className="empty-title">{t('err.page.title')}</p>
      <p className="empty-text">{t('err.page.text')}</p>
      <button className="btn-secondary" onClick={onRetry}><RotateCw size={15} /> {t('hs.retry.load')}</button>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Ayrıntı yalnızca konsola (paketli sürümde geliştirici araçları kapalı); gizli değer içermez
    console.error('[ErrorBoundary]', error?.message || error);
  }

  render() {
    if (this.state.failed) return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
