import React, { useState, useEffect } from 'react';
import { UserRole, Establishment } from './types';
import { storeService } from './services/store';
import { Navbar } from './components/Navbar';
import { EstablishmentPanel } from './components/EstablishmentPanel';
import { CustomerView } from './components/CustomerView';

export const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('customer');
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>('est-1');

  const loadData = () => {
    const list = storeService.getEstablishments();
    setEstablishments(list);
    if (list.length > 0 && !list.find(e => e.id === selectedEstablishmentId)) {
      setSelectedEstablishmentId(list[0].id);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storeService.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const activeVenue = establishments.find(e => e.id === selectedEstablishmentId) || establishments[0];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar with Mode Selector & Venue Switcher */}
      <Navbar
        role={role}
        setRole={setRole}
        establishments={establishments}
        selectedEstablishmentId={selectedEstablishmentId}
        setSelectedEstablishmentId={setSelectedEstablishmentId}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {role === 'establishment' && activeVenue ? (
          <EstablishmentPanel establishment={activeVenue} />
        ) : (
          <CustomerView establishments={establishments} />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '24px 20px',
        textAlign: 'center',
        background: 'rgba(9, 13, 22, 0.95)',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        marginTop: '40px'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <strong style={{ color: '#fff' }}>Planazo</strong> — Plataforma de descubrimiento en tiempo real (Zona G y Zona T)
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>HU-23 (Publicar Eventos)</span>
            <span>HU-26 (Publicar Promos)</span>
            <span>HU-16 (Consultar Eventos)</span>
            <span>HU-17 (Consultar Promos)</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
