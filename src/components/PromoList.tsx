import React, { useState, useEffect } from 'react';
import { Promotion, Establishment } from '../types';
import { storeService } from '../services/store';
import { Sparkles, Clock, Flame, Ticket, Info, CheckCircle2, AlertCircle, Edit, Trash2, Power } from 'lucide-react';

interface PromoListProps {
  establishment?: Establishment;
  isEstablishmentView?: boolean;
  onOpenCreatePromo?: () => void;
  onEditPromo?: (promo: Promotion) => void;
}

export const PromoList: React.FC<PromoListProps> = ({
  establishment,
  isEstablishmentView = false,
  onOpenCreatePromo,
  onEditPromo
}) => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [filterZone, setFilterZone] = useState<string>('Todas');
  const [showOnlyActive, setShowOnlyActive] = useState<boolean>(!isEstablishmentView);

  const [claimFeedback, setClaimFeedback] = useState<{ success: boolean; message: string; code?: string } | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadPromos = () => {
    const fetched = storeService.getPromotions(
      establishment?.id,
      filterZone,
      showOnlyActive
    );
    setPromotions(fetched);
  };

  useEffect(() => {
    loadPromos();
    const unsubscribe = storeService.subscribe(loadPromos);
    return () => unsubscribe();
  }, [establishment?.id, filterZone, showOnlyActive]);

  const handleClaim = (promoId: string) => {
    const result = storeService.claimPromotion(promoId);
    setClaimFeedback(result);
  };

  const handleDeletePromo = (id: string, title: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar la promoción "${title}"?`)) {
      storeService.deletePromotion(id);
    }
  };

  const handleTogglePromoStatus = (promo: Promotion) => {
    const nextStatus = promo.status === 'Activa' ? 'Pausada' : 'Activa';
    storeService.updatePromotion(promo.id, { status: nextStatus });
  };

  const getRemainingTimeText = (expiresAtIso: string): { text: string; isExpired: boolean } => {
    const diffMs = new Date(expiresAtIso).getTime() - now;
    if (diffMs <= 0) return { text: 'Expirada', isExpired: true };

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      text: `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
      isExpired: false
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Filter Controls (HU-17 / HU-69) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'rgba(17, 24, 39, 0.5)',
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles color="#fbbf24" size={20} />
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#fff' }}>
              {isEstablishmentView ? 'Gestión de Promociones (HU-69)' : 'Promociones Vigentes (HU-17)'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {establishment ? `Promociones de ${establishment.name}` : 'Promociones con stock en tiempo real'}
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {!establishment && (
            <select
              className="form-control"
              value={filterZone}
              onChange={e => setFilterZone(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '0.825rem', width: 'auto' }}
            >
              <option value="Todas">Todas las Zonas</option>
              <option value="Zona G">Zona G</option>
              <option value="Zona T">Zona T</option>
            </select>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={showOnlyActive}
              onChange={e => setShowOnlyActive(e.target.checked)}
              style={{ accentColor: 'var(--emerald-primary)' }}
            />
            Mostrar solo vigentes
          </label>

          {isEstablishmentView && onOpenCreatePromo && (
            <button className="btn btn-primary btn-sm" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={onOpenCreatePromo}>
              + Lanzar Promoción
            </button>
          )}
        </div>
      </div>

      {/* Claim Feedback Banner */}
      {claimFeedback && (
        <div style={{
          padding: '16px 20px',
          background: claimFeedback.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          border: `1px solid ${claimFeedback.success ? 'var(--emerald-primary)' : 'var(--rose-danger)'}`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {claimFeedback.success ? (
              <CheckCircle2 color="var(--emerald-light)" size={24} />
            ) : (
              <AlertCircle color="var(--rose-danger)" size={24} />
            )}
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: '#fff', fontSize: '0.925rem' }}>
                {claimFeedback.message}
              </p>
              {claimFeedback.code && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Muestra este código al llegar:</span>
                  <code style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '4px', color: '#fbbf24', fontWeight: 800 }}>
                    {claimFeedback.code}
                  </code>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setClaimFeedback(null)}>
            Cerrar
          </button>
        </div>
      )}

      {/* Promotion Cards Grid */}
      {promotions.length === 0 ? (
        <div className="empty-state">
          <Info size={40} style={{ margin: '0 auto 12px auto', color: '#fbbf24' }} />
          <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '6px' }}>
            No hay promociones disponibles
          </h4>
          <p style={{ fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            {establishment
              ? `${establishment.name} no cuenta con promociones activas actualmente.`
              : 'No se encontraron promociones.'}
          </p>
          {isEstablishmentView && onOpenCreatePromo && (
            <button className="btn btn-primary btn-sm" onClick={onOpenCreatePromo}>
              + Crear primera promoción
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {promotions.map(promo => {
            const timeInfo = getRemainingTimeText(promo.expiresAt);
            const isOutOfStock = promo.currentStock <= 0;
            const isInactive = isOutOfStock || timeInfo.isExpired || promo.status === 'Pausada';
            const percentageUsed = Math.round(((promo.initialStock - promo.currentStock) / promo.initialStock) * 100);

            return (
              <div
                key={promo.id}
                className="glass-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  position: 'relative',
                  border: promo.status === 'Pausada'
                    ? '1px dashed var(--text-dim)'
                    : promo.discountPercentage && promo.discountPercentage >= 50
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : undefined
                }}
              >
                {/* Header Tagline */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    {promo.discountPercentage && (
                      <span className="badge badge-amber" style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>
                        ⚡ {promo.discountPercentage}% OFF
                      </span>
                    )}
                    <h4 style={{ fontSize: '1.15rem', color: '#fff', margin: 0, lineHeight: 1.2 }}>
                      {promo.title}
                    </h4>
                  </div>
                  <span className={`badge ${promo.status === 'Pausada' ? 'badge-amber' : 'badge-cyan'}`}>
                    {promo.status === 'Pausada' ? 'PAUSADA' : promo.zone}
                  </span>
                </div>

                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                  {promo.description}
                </p>

                {/* Stock & Timer Bar */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isOutOfStock ? 'var(--rose-danger)' : '#fbbf24' }}>
                      <Flame size={14} /> Stock: <strong>{promo.currentStock} de {promo.initialStock} cupos</strong>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: timeInfo.isExpired ? 'var(--rose-danger)' : 'var(--emerald-light)' }}>
                      <Clock size={14} /> {timeInfo.text}
                    </span>
                  </div>

                  {/* Stock Bar */}
                  <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.1)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${100 - percentageUsed}%`,
                      height: '100%',
                      background: isOutOfStock ? 'var(--rose-danger)' : 'linear-gradient(90deg, #f59e0b, #10b981)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* Footer Code & Action / Management (HU-69) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Ticket size={16} color="var(--text-muted)" />
                    <code style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>
                      {promo.discountCode}
                    </code>
                  </div>

                  {!isEstablishmentView ? (
                    <button
                      className={`btn btn-sm ${isInactive ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={isInactive}
                      onClick={() => handleClaim(promo.id)}
                      style={{
                        background: isInactive
                          ? 'rgba(255,255,255,0.05)'
                          : 'linear-gradient(135deg, #f59e0b, #d97706)',
                        opacity: isInactive ? 0.6 : 1
                      }}
                    >
                      {isOutOfStock ? 'Agotada' : promo.status === 'Pausada' ? 'Pausada' : timeInfo.isExpired ? 'Expirada' : 'Reclamar Cupón'}
                    </button>
                  ) : (
                    /* HU-69 Management Bar */
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleTogglePromoStatus(promo)}
                        title={promo.status === 'Activa' ? 'Pausar promoción' : 'Reactivar promoción'}
                      >
                        <Power size={14} color={promo.status === 'Activa' ? 'var(--emerald-light)' : '#fbbf24'} />
                      </button>

                      {onEditPromo && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onEditPromo(promo)}
                          title="Editar promoción (HU-69)"
                        >
                          <Edit size={14} />
                        </button>
                      )}

                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeletePromo(promo.id, promo.title)}
                        title="Eliminar promoción (HU-69)"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
