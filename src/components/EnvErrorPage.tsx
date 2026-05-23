interface Props {
  missing: string[];
}

export default function EnvErrorPage({ missing }: Props) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      background: '#0A0A0B',
      color: '#F2F2F7',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: '1rem' }}>⚠️</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Yapılandırma Hatası
        </h1>
        <p style={{ color: '#A1A1A6', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Uygulama başlatılamadı. Aşağıdaki ortam değişkenleri eksik:
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {missing.map(key => (
            <li key={key} style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              background: '#1C1C1F',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '0.5rem 0.875rem',
              color: '#f87171',
            }}>
              {key}
            </li>
          ))}
        </ul>
        <p style={{ color: '#636368', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          Projenizin kök dizininde bir <code style={{ color: '#A1A1A6' }}>.env</code> dosyası
          oluşturun ve gerekli değerleri ekleyin, ardından geliştirme sunucusunu yeniden başlatın.
        </p>
      </div>
    </div>
  );
}
