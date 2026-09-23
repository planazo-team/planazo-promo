import React, { useState } from 'react';
import { UserRole, Establishment } from '../types';
import { Zap, Store, Users, MapPin, RefreshCw, Flame, CheckCircle2, ShieldCheck } from 'lucide-react';
import { storeService } from '../services/store';

interface NavbarProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
  establishments: Establishment[];
  selectedEstablishmentId: string;
  setSelectedEstablishmentId: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  role,
  setRole,
  establishments,
  selectedEstablishmentId,
  setSelectedEstablishmentId
}) => {
  const selectedVenue = establishments.find(e => e.id === selectedEstablishmentId);
  const [testingCC1, setTestingCC1] = useState(false);
  const [cc1Result, setCc1Result] = useState<any | null>(null);

  const handleRunCC1Test = async () => {
    setTestingCC1(true);
    setCc1Result(null);
    try {
      const res = await storeService.runCC1BurstTest();
      setCc1Result(res);
    } catch (e: any) {
      alert(`Error al ejecutar prueba de concurrencia: ${e.message}`);
    } finally {
      setTestingCC1(false);
    }
  };

  return (
    <header style={{
      background: 'rgba(9, 13, 22, 0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '12px 24px'
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--emerald-primary), var(--cyan-accent))',
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Zap size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
              Planazo <span style={{ color: 'var(--emerald-light)', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--emerald-glow)', padding: '2px 8px', borderRadius: '12px' }}>Puerto 3002</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Servicio de Promociones & Cupones — Reto CC-1
            </p>
          </div>
        </div>

        {/* Mode Selector & Concurrency Test Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Concurrency CC-1 Test Button */}
          <button
            onClick={handleRunCC1Test}
            disabled={testingCC1}
            className="btn btn-primary btn-sm"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #e11d48)' }}
            title="Ejecutar ráfaga de 50 peticiones simultáneas sobre stock 3"
          >
            <Flame size={14} /> {testingCC1 ? 'Ejecutando ráfaga CC-1...' : 'Probar Concurrencia CC-1'}
          </button>

          {/* Role Switcher Pill */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            padding: '4px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <button
              onClick={() => setRole('customer')}
              className={`btn btn-sm ${role === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                border: role === 'customer' ? 'none' : 'transparent',
                background: role === 'customer' ? undefined : 'transparent'
              }}
            >
              <Users size={15} /> Cliente (HU-17)
            </button>
            <button
              onClick={() => setRole('establishment')}
              className={`btn btn-sm ${role === 'establishment' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                border: role === 'establishment' ? 'none' : 'transparent',
                background: role === 'establishment' ? undefined : 'transparent'
              }}
            >
              <Store size={15} /> Negocio (HU-26)
            </button>
          </div>

          {/* If establishment mode, select active venue */}
          {role === 'establishment' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Lugar:
              </span>
              <select
                className="form-control"
                value={selectedEstablishmentId}
                onChange={e => setSelectedEstablishmentId(e.target.value)}
                style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', minWidth: '180px' }}
              >
                {establishments.map(est => (
                  <option key={est.id} value={est.id}>
                    {est.name} ({est.zone})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Demo Data */}
          <button
            onClick={() => {
              if (confirm('¿Deseas reiniciar los datos de demostración a su estado inicial?')) {
                storeService.resetToDefault();
              }
            }}
            className="btn btn-secondary btn-sm"
            title="Reiniciar datos"
            style={{ padding: '6px 10px' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Active Context Banner */}
      {role === 'establishment' && selectedVenue && (
        <div style={{
          maxWidth: '1280px',
          margin: '8px auto 0 auto',
          padding: '6px 12px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.825rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={14} color="var(--emerald-light)" />
            <span>Gestionando como: <strong style={{ color: '#ffffff' }}>{selectedVenue.name}</strong> ({selectedVenue.zone})</span>
          </div>
          <span className="badge badge-emerald">Headers: x-user-role: negocio</span>
        </div>
      )}

      {/* Modal de Resultados de la Prueba CC-1 */}
      {cc1Result && (
        <div className="modal-overlay" onClick={() => setCc1Result(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame color="#f59e0b" size={20} /> Resultado Prueba de Carga CC-1
              </h3>
              <button onClick={() => setCc1Result(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
              <div style={{
                background: cc1Result.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                border: `1px solid ${cc1Result.passed ? 'var(--emerald-primary)' : 'var(--rose-danger)'}`,
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '20px'
              }}>
                <CheckCircle2 color={cc1Result.passed ? 'var(--emerald-light)' : 'var(--rose-danger)'} size={40} style={{ marginBottom: '8px' }} />
                <h4 style={{ fontSize: '1.15rem', color: '#fff', margin: 0 }}>
                  {cc1Result.passed ? '¡RETO CC-1 SUPERADO! (CERO SOBREVENTAS)' : 'RETO CC-1 FALLIDO'}
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Respuesta atómica ante peticiones HTTP concurrentes.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textTransform: 'none', textAlign: 'left', fontSize: '0.875rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Peticiones Lanzadas</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{cc1Result.totalSent}</div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Cupones Asignados (200 OK)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--emerald-light)' }}>{cc1Result.successCount}</div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Rechazos (409 Conflict)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--rose-danger)' }}>{cc1Result.rejected409Count}</div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Stock Final en Memoria</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24' }}>{cc1Result.finalStock}</div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setCc1Result(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
